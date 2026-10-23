"""API del agente. Se usa desde el navegador:
   POST /plan  → decide qué modelo usaría y cuántos tokens estima (NO gasta tokens). La interfaz pregunta Usar / No usar.
   POST /run   → ejecuta con el plan aprobado y devuelve la respuesta y el consumo real.
"""
from __future__ import annotations
import time
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import tools
from .graph import Agente
from .semantico import Servicio
from .registro import Registro, espejo_supabase
from .equipo import Equipo, MODOS

app = FastAPI(title="Party · agente", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])  # uso local/demostración

agente = Agente()
agente.semantico = Servicio.desde_entorno(agente.cfg, agente.meter)   # embeddings + pgvector (Supabase)
tools.configurar(agente.semantico)
registro = Registro(espejo=espejo_supabase())
equipo = Equipo(agente)
PENDIENTES: dict[str, dict] = {}
TTL = 600


class Peticion(BaseModel):
    sesion: str = "default"
    usuario: str = "anon"
    pregunta: str
    contexto: dict = Field(default_factory=dict)
    imagen: str | None = None
    memoria: str | None = None     # buffer | window | summary (si no, el de modelos.yaml)
    orquestacion: str = "grafo"   # grafo | serial | jerarquico (CrewAI)


class Ejecucion(BaseModel):
    plan_id: str
    aprobado: bool = True


def _limpiar():
    ahora = time.time()
    for k in [k for k, v in PENDIENTES.items() if ahora - v["t"] > TTL]:
        PENDIENTES.pop(k, None)


def _vista_proveedor(prov: str) -> dict:
    return next((p for p in agente.meter.resumen() if p["proveedor"] == prov), {})


@app.get("/health")
def health():
    return {"ok": True, "claves": {p: agente.cfg.tiene_clave(p) for p in agente.cfg.proveedores}, "modelos_verificados": agente.cfg.verificado}


@app.get("/semantico")
def semantico():
    """Estado de la búsqueda por significado (no gasta tokens)."""
    sv = agente.semantico
    return {"modelo": sv.emb.modelo, "proveedor": sv.emb.proveedor, "remoto_disponible": sv.emb.remoto_disponible,
            "ultimo_error": sv.emb.ultimo_error or None, "pgvector": sv.supa is not None,
            "vectores_locales": sv.indice.con.execute("SELECT count(*) FROM vectores").fetchone()[0]}


@app.get("/agentes")
def agentes():
    """Qué hay conectado: orquestaciones (con sus agentes y herramientas), proveedores y niveles. No gasta tokens."""
    try:
        import crewai  # noqa: F401
        crew_ok, crew_v = True, getattr(crewai, "__version__", "?")
    except Exception:       # noqa: BLE001
        crew_ok, crew_v = False, None
    nombres = [e["function"]["name"] for e in tools.ESQUEMAS]
    from .equipo import SOLO_INVESTIGADOR, SOLO_COMUNICADOR
    inv = [n for n in nombres if n in SOLO_INVESTIGADOR]
    com = [n for n in nombres if n in SOLO_COMUNICADOR]
    provs = [{"id": p, "nombre": agente.cfg.nombre(p), "clave": agente.cfg.tiene_clave(p), "en_enfriamiento": agente.meter.enfriando(p)} for p in agente.cfg.proveedores]
    return {
        "orquestaciones": [
            {"id": "grafo", "nombre": "Grafo (1 agente + herramientas)", "framework": "LangGraph", "disponible": True,
             "agentes": [{"rol": "Asistente Party", "herramientas": nombres}]},
            {"id": "serial", "nombre": "Equipo serial", "framework": "CrewAI " + (crew_v or ""), "disponible": crew_ok,
             "agentes": [{"rol": "Investigador Académico", "herramientas": inv}, {"rol": "Planificador de Estudio", "herramientas": []}, {"rol": "Asistente Party", "herramientas": com}]},
            {"id": "jerarquico", "nombre": "Equipo jerárquico", "framework": "CrewAI " + (crew_v or ""), "disponible": crew_ok,
             "agentes": [{"rol": "Manager (LLM)", "herramientas": []}, {"rol": "Investigador Académico", "herramientas": inv}, {"rol": "Planificador de Estudio", "herramientas": []}, {"rol": "Asistente Party", "herramientas": com}]},
        ],
        "proveedores": provs,
        "niveles": {n: [{"proveedor": c.proveedor, "modelo": c.modelo, "conectado": agente.cfg.tiene_clave(c.proveedor)} for c in cs] for n, cs in agente.cfg.niveles.items()},
        "memoria": agente.cfg.ajustes.get("memoria_estrategia", "window"),
    }


class Anotacion(BaseModel):
    via: str = "reglas_cliente"
    sesion: str = ""
    usuario: str = ""


@app.post("/registro")
def anotar(a: Anotacion):
    """El navegador avisa cuando resolvió una pregunta por su cuenta (reglas + Supabase): cuenta como «sin tokens»."""
    if a.via not in ("reglas_cliente",):
        raise HTTPException(400, "vía no permitida")
    registro.anotar(a.via, a.sesion, a.usuario)
    return {"ok": True}


@app.get("/estadisticas")
def estadisticas(usuario: str | None = None):
    return registro.estadisticas(usuario)


@app.get("/uso")
def uso():
    return {"proveedores": agente.meter.resumen(), "verificado": agente.cfg.verificado}


@app.get("/modelos")
def modelos():
    return {"verificado": agente.cfg.verificado,
            "niveles": {n: [{"proveedor": c.proveedor, "modelo": c.modelo, "clave": agente.cfg.tiene_clave(c.proveedor)} for c in cs] for n, cs in agente.cfg.niveles.items()},
            "proveedores": {p: {"nombre": agente.cfg.nombre(p), "renueva": agente.cfg.renueva(p), "clave": agente.cfg.tiene_clave(p)} for p in agente.cfg.proveedores}}


@app.get("/modelos-disponibles")
async def modelos_disponibles():
    """Valida cada clave y lista los modelos reales de la cuenta (no gasta tokens)."""
    return [await agente.providers.listar_modelos(p) for p in agente.cfg.proveedores]


@app.post("/plan")
async def plan(p: Peticion):
    _limpiar()
    e = await agente.ejecutar(p.sesion, p.usuario, p.pregunta, p.contexto, p.imagen, solo_plan=True, estrategia=p.memoria)
    if e.get("modo") == "reglas":
        PENDIENTES.pop(p.sesion, None)
        registro.anotar("reglas", p.sesion, p.usuario)
        return {"modo": "reglas", "respuesta": e["respuesta"], "tokens": 0, "aviso": "0 tokens usados · Respondí con reglas internas", "traza": e["traza"]}
    if e.get("modo") == "sin_cupo":
        registro.anotar("sin_cupo", p.sesion, p.usuario)
        return {"modo": "sin_cupo", "mensaje": e["respuesta"], "nivel": e.get("nivel"), "traza": e["traza"]}
    c = e["candidatos"][0]
    pid = uuid.uuid4().hex[:12]
    PENDIENTES[pid] = {"t": time.time(), "req": p}
    lo, hi = e["estimacion"]
    if p.orquestacion in MODOS:
        lo, hi = equipo.estimar(p.orquestacion, p.pregunta, e.get("historial", []), e.get("recuerdos", []))
    umbral = agente.cfg.ajustes["umbral_confirmacion_tokens"]
    return {
        "modo": "llm", "plan_id": pid, "orquestacion": p.orquestacion, "nivel": e["nivel"], "razon": e["razon"],
        "proveedor": c.proveedor, "proveedor_nombre": agente.cfg.nombre(c.proveedor), "modelo": c.modelo,
        "respaldos": [{"proveedor": x.proveedor, "modelo": x.modelo} for x in e["candidatos"][1:4]],
        "estimacion": {"minimo": lo, "maximo": hi, "nota": "Aproximada; el consumo real lo informa el proveedor."},
        "renueva": agente.cfg.renueva(c.proveedor), "renueva_fuente": f"según la documentación del proveedor, verificada el {agente.cfg.verificado}",
        "medidor": _vista_proveedor(c.proveedor), "requiere_confirmacion": hi > umbral, "traza": e["traza"],
    }


@app.post("/run")
async def run(x: Ejecucion):
    pend = PENDIENTES.pop(x.plan_id, None)
    if not pend:
        raise HTTPException(404, "El plan expiró o no existe. Vuelve a preguntar.")
    if not x.aprobado:
        registro.anotar("cancelado", pend["req"].sesion, pend["req"].usuario)
        return {"cancelado": True, "mensaje": "Ok, no usé ningún modelo.", "tokens": 0}
    p: Peticion = pend["req"]
    if p.orquestacion in MODOS:
        r = await equipo.ejecutar(p.orquestacion, p.sesion, p.usuario, p.pregunta, p.contexto, p.memoria)
        llam = r.get("llamadas", [])
        total = sum(l["total"] or 0 for l in llam)
        if r["modo"] == "reglas":
            registro.anotar("reglas", p.sesion, p.usuario)
            return {"modo": "reglas", "respuesta": r["respuesta"], "tokens": {"total": 0, "llamadas": []}, "traza": r["traza"], "acciones": []}
        if r["modo"] != "llm":
            return {"modo": "error", "mensaje": r.get("respuesta") or "El equipo de agentes no pudo responder ahora. Prueba el modo Grafo o revisa las claves.",
                    "tokens": {"total": total, "llamadas": llam}, "traza": r.get("traza", []), "errores": r.get("errores", [])}
        c = r["cand"]
        registro.anotar("llm", p.sesion, p.usuario, total, c.proveedor, c.modelo, r["nivel"], p.orquestacion)
        return {"modo": "llm", "orquestacion": p.orquestacion, "respuesta": r["respuesta"], "acciones": r["acciones"], "plan": None,
                "recuerdos_guardados": r["memoria_guardada"], "nivel_final": r["nivel"], "escalado": False,
                "modelo_final": {"proveedor": c.proveedor, "modelo": c.modelo},
                "tokens": {"total": total, "llamadas": llam, "exacto": all(l.get("exacto") for l in llam)},
                "medidor": _vista_proveedor(c.proveedor), "traza": r["traza"]}
    e = await agente.ejecutar(p.sesion, p.usuario, p.pregunta, p.contexto, p.imagen, solo_plan=False, estrategia=p.memoria)
    llamadas = e.get("llamadas", [])
    total = sum(l["total"] or 0 for l in llamadas)
    ultimo = llamadas[-1] if llamadas else None
    if e.get("modo") == "sin_cupo" or not e.get("respuesta"):
        return {"modo": "error", "mensaje": e.get("respuesta") or "No pude obtener respuesta de ningún modelo ahora. Revisa las claves o vuelve a intentar en unos minutos.",
                "tokens": {"total": total, "llamadas": llamadas}, "traza": e.get("traza", []), "errores": e.get("errores", [])}
    registro.anotar("llm", p.sesion, p.usuario, total, ultimo["proveedor"] if ultimo else "", ultimo["modelo"] if ultimo else "", e.get("nivel", ""), "grafo")
    return {
        "modo": "llm", "respuesta": e["respuesta"], "acciones": e.get("acciones", []), "plan": e.get("plan_pasos"),
        "recuerdos_guardados": e.get("memoria_guardada", []), "nivel_final": e["nivel"], "escalado": e.get("escalado", False),
        "modelo_final": {"proveedor": ultimo["proveedor"], "modelo": ultimo["modelo"]} if ultimo else None,
        "tokens": {"total": total, "llamadas": llamadas, "exacto": all(l.get("exacto") for l in llamadas)},
        "medidor": _vista_proveedor(ultimo["proveedor"]) if ultimo else None, "traza": e.get("traza", []),
    }
