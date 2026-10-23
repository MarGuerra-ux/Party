import asyncio
import os
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fake_provider import LLAMADAS, Servidor  # noqa: E402

PORT = 8791
for p in ("GROQ", "GEMINI", "MISTRAL"):
    os.environ[f"T_{p}"] = "clave-falsa"
    os.environ[f"PARTY_{p}_BASE_URL"] = f"http://127.0.0.1:{PORT}/v1"

from party_agent.config import Config  # noqa: E402
from party_agent.graph import Agente  # noqa: E402
from party_agent.memoria import Memoria  # noqa: E402
from party_agent.meter import Meter  # noqa: E402
from party_agent.semantico import Servicio  # noqa: E402

CTX = {"hoy": "2026-10-22",
       "horario": [{"dia": 0, "desde": "19:00", "hasta": "21:50", "asignatura": "Taller de Base de Datos", "sala": "PA-LC9"},
                   {"dia": 3, "desde": "19:00", "hasta": "21:50", "asignatura": "Desarrollo Cloud Native I", "sala": "PA-LC9"}],
       "eventos": [{"id": "e1", "titulo": "Prueba BDD", "fecha": "2026-10-24", "tipo": "prueba"}],
       "apuntes": [{"id": "n1", "titulo": "Normalización", "asignatura": "BDD", "texto": "La tercera forma normal elimina dependencias transitivas."}]}


@pytest.fixture(scope="session", autouse=True)
def servidor():
    s = Servidor(PORT); s.iniciar(); yield s; s.detener()


def nuevo(tmp_path, yaml="modelos_test.yaml") -> Agente:
    cfg = Config(Path(__file__).parent / yaml)
    meter = Meter(cfg, tmp_path / "uso.json")
    return Agente(cfg, meter, Memoria(tmp_path / "m.db"), semantico=Servicio(cfg, meter, tmp_path / "v.db"))


def run(c):
    return asyncio.run(c)


def test_reglas_no_gastan_tokens(tmp_path):
    a = nuevo(tmp_path); n0 = len(LLAMADAS)
    e = run(a.ejecutar("s1", "u1", "qué tengo mañana", CTX, solo_plan=True))
    assert e["modo"] == "reglas" and "mañana" in e["respuesta"].lower() or "hoy" in e["respuesta"].lower()
    assert len(LLAMADAS) == n0 and a.meter.eventos == []
    e = run(a.ejecutar("s1", "u1", "dónde queda la sala LC9", CTX, solo_plan=True))
    assert "2º piso" in e["respuesta"]


def test_plan_no_llama_al_modelo(tmp_path):
    a = nuevo(tmp_path); n0 = len(LLAMADAS)
    e = run(a.ejecutar("s1", "u1", "dime un dato curioso", CTX, solo_plan=True))
    assert e["modo"] == "llm" and e["nivel"] == "1_rapido" and e["candidatos"][0].modelo == "llama-3.1-8b-instant"
    assert e["estimacion"][0] < e["estimacion"][1]
    assert len(LLAMADAS) == n0  # planear NO gasta tokens


def test_ejecucion_simple_registra_tokens(tmp_path):
    a = nuevo(tmp_path)
    e = run(a.ejecutar("s1", "u1", "dime un dato curioso", CTX))
    assert e["respuesta"].startswith("Respuesta de llama")
    assert sum(l["total"] for l in e["llamadas"]) == 160
    assert a.meter.usado("groq", 60) == (160, 1)
    assert a.meter.real["groq"]["tokens_restantes"] == 5000   # cabeceras reales del proveedor


def test_tarea_pesada_planifica_usa_herramientas_y_ajusta(tmp_path):
    a = nuevo(tmp_path)
    q = "Organiza mi semana: tengo prueba el 24 de octubre y una entrega de informe"
    e = run(a.ejecutar("s2", "u1", q, CTX))
    assert e["nivel"] == "3_razonamiento" and e["llamadas"][0]["etapa"] == "planificar"
    assert e["plan_pasos"] and len(e["plan_pasos"]["pasos"]) == 3
    usadas = [t for t in e["traza"] if t.startswith("Herramienta")]
    assert any("detectar_conflictos" in t and '"hay_conflicto": true' in t for t in usadas)
    assert e["acciones"] and e["acciones"][0]["tipo"] == "crear_evento" and e["acciones"][0]["fecha"] == "2026-10-23"
    assert "adelanté" in e["respuesta"]


def test_respaldo_cuando_un_proveedor_se_limita(tmp_path):
    a = nuevo(tmp_path)
    e = run(a.ejecutar("s3", "u1", "resume mis apuntes de normalización", CTX))
    assert e["respuesta"].startswith("Respuesta de mistral-medium")
    assert a.meter.enfriando("groq", "limitado") or a.meter.enfriando("groq")
    # la próxima vez ya ni siquiera lo intenta
    e2 = run(a.ejecutar("s3", "u1", "resume mis apuntes", CTX, solo_plan=True))
    assert e2["candidatos"][0].modelo == "mistral-medium"


def test_escalamiento_si_la_respuesta_viene_vacia(tmp_path):
    a = nuevo(tmp_path, "modelos_test.yaml")
    a.cfg.niveles["1_rapido"] = [type(a.cfg.niveles["1_rapido"][0])("groq", "vacio", "1_rapido")]
    e = run(a.ejecutar("s4", "u1", "dime un dato curioso", CTX))
    assert e["escalado"] and e["nivel"] == "2_equilibrado" and e["respuesta"]


def test_sin_claves_responde_sin_cupo(tmp_path, monkeypatch):
    for p in ("T_GROQ", "T_GEMINI", "T_MISTRAL"):
        monkeypatch.delenv(p)
    a = nuevo(tmp_path)
    e = run(a.ejecutar("s5", "u1", "dime un dato curioso", CTX, solo_plan=True))
    assert e["modo"] == "sin_cupo" and "clave" in e["respuesta"]


def test_cupo_configurado_evita_el_proveedor(tmp_path):
    a = nuevo(tmp_path)
    a.meter.registrar("groq", "llama-3.1-8b-instant", 5900)   # casi todo el minuto de Groq
    e = run(a.ejecutar("s6", "u1", "dime un dato curioso", CTX, solo_plan=True))
    assert e["modo"] == "llm" and e["candidatos"][0].proveedor != "groq"


def test_memoria_larga_y_corta(tmp_path):
    a = nuevo(tmp_path)
    run(a.ejecutar("s7", "u7", "recuerda que prefiero estudiar de noche", CTX))
    assert any("estudiar de noche" in t for t in a.memoria.todos("u7"))
    e = run(a.ejecutar("s7", "u7", "dime cuándo debería estudiar de noche recuerdos-eco", CTX))
    assert "estudiar de noche" in e["respuesta"]          # el recuerdo viajó en el prompt
    assert len(a.memoria.historial("s7")) >= 2            # memoria corta


def test_api_plan_run_y_cancelar(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    import party_agent.main as m
    m.agente = nuevo(tmp_path)
    c = TestClient(m.app)
    p = c.post("/plan", json={"pregunta": "dime un dato curioso", "contexto": CTX}).json()
    assert p["modo"] == "llm" and p["renueva"] and p["estimacion"]["maximo"] > 0 and p["requiere_confirmacion"]
    assert c.post("/run", json={"plan_id": p["plan_id"], "aprobado": False}).json()["cancelado"]
    p = c.post("/plan", json={"pregunta": "dime un dato curioso", "contexto": CTX}).json()
    r = c.post("/run", json={"plan_id": p["plan_id"], "aprobado": True}).json()
    assert r["modo"] == "llm" and r["tokens"]["total"] == 160 and r["modelo_final"]["proveedor"] == "groq"
    assert c.post("/plan", json={"pregunta": "qué tengo mañana", "contexto": CTX}).json()["tokens"] == 0
    uso = c.get("/uso").json()["proveedores"]
    assert next(x for x in uso if x["proveedor"] == "groq")["ventanas"][0]["tokens_usados"] == 160


def test_db_check_detecta_tablas_y_columnas():
    import httpx
    from party_agent.db_check import revisar

    def handler(req: httpx.Request) -> httpx.Response:
        ruta = req.url.path
        if ruta.endswith("/subjects"):
            return httpx.Response(404, json={"code": "PGRST205", "message": "Could not find the table 'public.subjects'"})
        if ruta.endswith("/notes") and req.url.params.get("select") == "bg_pattern":
            return httpx.Response(400, json={"code": "42703", "message": "column notes.bg_pattern does not exist"})
        if ruta.endswith("/agent_memory"):
            return httpx.Response(401, json={"code": "42501", "message": "permission denied"})
        if "/rpc/" in ruta:
            return httpx.Response(404, json={"code": "PGRST202", "message": "function not found"})
        if req.method == "POST" and ruta.endswith("/agent_usage"):
            return httpx.Response(201, json=[{"id": 7}])
        if req.method == "DELETE":
            return httpx.Response(204)
        return httpx.Response(200, json=[])

    res = {r["item"]: r for r in asyncio.run(revisar("https://x.supabase.co", "k", True, transport=httpx.MockTransport(handler)))}
    assert res["students"]["ok"] and res["campus_rooms"]["ok"]
    assert not res["subjects"]["ok"] and "no existe" in res["subjects"]["detalle"]
    assert not res["notes.bg_pattern"]["ok"] and "columna" in res["notes.bg_pattern"]["detalle"]
    assert not res["agent_memory"]["ok"] and "RLS" in res["agent_memory"]["detalle"]
    assert not res["match_note_chunks()"]["ok"]
    assert res["escritura (agent_usage)"]["ok"]


def test_reglas_esta_semana_solo_lo_que_resta():
    """'¿Qué tengo esta semana?' en viernes: viernes, sábado y domingo (no lunes a jueves)."""
    from party_agent import reglas
    ctx = {"hoy": "2026-10-23", "horario": [
        {"dia": 0, "desde": "19:00", "hasta": "20:30", "asignatura": "Taller de Base de Datos", "sala": "LC9"},
        {"dia": 4, "desde": "16:00", "hasta": "17:30", "asignatura": "Gestión de Proyectos", "sala": "LC8"},
        {"dia": 5, "desde": "08:30", "hasta": "10:00", "asignatura": "Desarrollo Cloud Native I", "sala": "DST1"}]}
    r = reglas.responder("¿Qué tengo esta semana?", ctx)
    assert "Gestión de Proyectos" in r and "Cloud Native" in r and "Taller de Base" not in r
    r2 = reglas.responder("qué tengo la próxima semana", ctx)
    assert "Taller de Base" in r2


def test_reglas_actividades_semana_que_viene():
    from party_agent import reglas
    ctx = {"hoy": "2026-10-23", "horario": [{"dia": 0, "desde": "19:00", "hasta": "20:30", "asignatura": "Taller de Base de Datos", "sala": "LC9"}]}
    for frase in ("qué actividades tengo la semana que viene", "que actividades tengo la proxima semana"):
        assert "Taller de Base" in reglas.responder(frase, ctx)
