"""IE1: una prueba por herramienta (caso feliz + falla con gracia). Sin modelos ni claves."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_agente import CTX  # noqa: E402
from party_agent import tools  # noqa: E402
from party_agent.memoria import Memoria  # noqa: E402

MAT = [{"id": "f1", "nombre": "2.2.2_Dead_Letter_Exchanges_DLX.pdf", "asignatura": "Desarrollo Cloud Native I", "ruta": "Cloud Native / Experiencia 2",
        "texto": ("Un Dead Letter Exchange recibe los mensajes rechazados, expirados o que superan la cola. " * 12) + "Las DLQ permiten reintentar mensajes fallidos."}]
C = {**CTX, "material": MAT}


def run(nombre, args, tmp_path, ctx=C):
    tools.configurar(None)            # estas pruebas son de palabras clave; la semántica se prueba en test_semantico
    est = {"acciones": [], "memoria_guardada": []}
    return tools.ejecutar(nombre, args, ctx, est, Memoria(tmp_path / "m.db"), "u1"), est


def test_todas_las_herramientas_tienen_descripcion_y_argumentos_descritos():
    nombres = [e["function"]["name"] for e in tools.ESQUEMAS]
    assert len(nombres) == len(set(nombres)) and "buscar_material" in nombres and "leer_material" in nombres
    for e in tools.ESQUEMAS:
        f = e["function"]
        assert len(f["description"]) > 25, f["name"]
        for k, p in f["parameters"]["properties"].items():
            assert p.get("description"), f"{f['name']}.{k} sin descripción"


def test_fecha_y_horario(tmp_path):
    assert run("fecha_actual", {}, tmp_path)[0]["hoy"] == "2026-10-22"
    assert run("consultar_horario", {"dia": "lunes"}, tmp_path)[0]["clases"][0]["asignatura"] == "Taller de Base de Datos"
    assert "error" in run("consultar_horario", {"dia": "xyz"}, tmp_path)[0]


def test_calendario_apuntes_conflictos(tmp_path):
    assert run("consultar_calendario", {}, tmp_path)[0]["eventos"][0]["titulo"] == "Prueba BDD"
    assert run("buscar_apuntes", {"consulta": "tercera forma normal"}, tmp_path)[0]["resultados"]
    assert run("buscar_apuntes", {"consulta": "zzzz"}, tmp_path)[0]["resultados"] == []
    assert run("detectar_conflictos", {"fecha": "2026-10-24"}, tmp_path)[0]["hay_conflicto"] is True
    assert "error" in run("detectar_conflictos", {"fecha": "basura"}, tmp_path)[0]


def test_proponer_evento_valida(tmp_path):
    r, est = run("proponer_evento", {"titulo": "Entrega", "fecha": "2026-10-30", "tipo": "entrega"}, tmp_path)
    assert r["estado"] == "propuesto" and est["acciones"][0]["fecha"] == "2026-10-30"
    assert run("proponer_evento", {"titulo": "X", "fecha": "2026-01-01", "tipo": "entrega"}, tmp_path)[0]["estado"] == "invalido"
    assert run("proponer_evento", {"titulo": "", "fecha": "2026-10-30", "tipo": "entrega"}, tmp_path)[0]["estado"] == "invalido"


def test_memoria(tmp_path):
    r, est = run("guardar_memoria", {"texto": "estudia mejor en las mañanas"}, tmp_path)
    assert r["estado"] == "guardado" and est["memoria_guardada"]
    assert any("mañanas" in x for x in run("recordar", {"consulta": "mañanas"}, tmp_path)[0]["recuerdos"])


def test_buscar_material_cita_archivo(tmp_path):
    r = run("buscar_material", {"consulta": "dead letter exchange"}, tmp_path)[0]
    assert r["resultados"] and r["resultados"][0]["archivo"].endswith(".pdf") and r["resultados"][0]["id"] == "f1"
    assert run("buscar_material", {"consulta": "dlq", "asignatura": "cloud"}, tmp_path)[0]["resultados"]
    assert run("buscar_material", {"consulta": "dlq", "asignatura": "historia"}, tmp_path)[0]["resultados"] == []
    assert "aviso" in run("buscar_material", {"consulta": "dlq"}, tmp_path, CTX)[0]       # sin Biblioteca: avisa, no falla
    assert "error" in run("buscar_material", {"consulta": "a"}, tmp_path)[0]


def test_leer_material_por_tramos_y_falla_con_gracia(tmp_path):
    r = run("leer_material", {"archivo": "f1"}, tmp_path)[0]
    assert r["parte"] == 1 and r["de"] >= 1 and r["texto"]
    assert "error" in run("leer_material", {"archivo": "nope"}, tmp_path)[0]
    assert "error" in run("leer_material", {"archivo": "f1", "parte": "abc"}, tmp_path)[0]
    assert "error" in run("leer_material", {"archivo": "f1", "parte": 99}, tmp_path)[0]


def test_herramienta_desconocida_no_lanza(tmp_path):
    assert "error" in run("no_existe", {}, tmp_path)[0]
    assert "error" in run("consultar_horario", {"dia": "lunes"}, tmp_path, {"hoy": "2026-10-22", "horario": 5})[0]   # datos corruptos: error, no excepción
