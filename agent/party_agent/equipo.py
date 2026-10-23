"""Equipo multi-agente con CrewAI (IL2.3): mismo patrón que los ejemplos del curso.

    Investigador  →  Planificador  →  Comunicador          (Process.sequential, context explícito)
    Manager (LLM) decide quién hace qué y puede pedir rehacer   (Process.hierarchical)

Se parece a 3-multiagent_crewai_full.py y 4-multiagent_crewai_hierarchical.py del curso:
  · LLM(model="openai/<modelo>", base_url=..., api_key=...)  → protocolo OpenAI para cualquier proveedor
  · herramientas = BaseTool con args_schema (pydantic) y Field(description=...)
  · la fecha se inyecta con inputs={...} (una herramienta sin parámetros rompe el JSON schema en CrewAI)
  · max_iter=3 y max_tokens acotado para respetar los límites del plan gratuito

Las reglas internas (0 tokens) y la memoria siguen funcionando ANTES de llamar al equipo.
"""
from __future__ import annotations
import asyncio
import logging
from typing import Any, Type

from pydantic import BaseModel, Field, create_model

from . import tools
from .router import ESFUERZO  # noqa: F401  (reservado: nivel de razonamiento por proveedor)
from .util import estimar_tokens, fecha_larga, hoy

log = logging.getLogger("party.equipo")

MODOS = {"serial": "Serial (secuencial)", "jerarquico": "Jerárquico (Manager)"}
MAX_TOKENS = {"worker": 600, "comm": 900, "manager": 700}   # igual criterio que el curso (límite de salida por minuto)
SOLO_INVESTIGADOR = {"fecha_actual", "consultar_horario", "consultar_calendario", "buscar_apuntes", "detectar_conflictos", "recordar", "buscar_material", "leer_material"}
SOLO_COMUNICADOR = {"proponer_evento", "guardar_memoria"}


def _importar():
    from crewai import LLM, Agent, Crew, Process, Task  # import diferido: el grafo normal no exige crewai
    from crewai.tools import BaseTool
    return LLM, Agent, Crew, Process, Task, BaseTool


def construir_herramientas(BaseTool, ctx: dict, estado: dict, memoria, usuario: str) -> dict[str, Any]:
    """Convierte cada esquema de tools.ESQUEMAS en una BaseTool de CrewAI (una sola fuente de verdad)."""
    out = {}
    for esq in tools.ESQUEMAS:
        f = esq["function"]
        nombre = f["name"]
        props = f["parameters"].get("properties") or {}
        if not props:     # sin parámetros → CrewAI genera un schema inválido; la fecha va por inputs
            continue
        req = set(f["parameters"].get("required") or [])
        campos = {}
        for k, p in props.items():
            desc = p.get("description") or k
            if p.get("enum"):
                desc += " Valores: " + ", ".join(p["enum"]) + "."
            campos[k] = (str, Field(..., description=desc)) if k in req else (str, Field("", description=desc))
        Args: Type[BaseModel] = create_model(f"Args_{nombre}", **campos)

        def _run(self, _n=nombre, **kw):
            import json
            return json.dumps(tools.ejecutar(_n, {k: v for k, v in kw.items() if v != ""}, ctx, estado, memoria, usuario), ensure_ascii=False)

        cls = type(f"Tool_{nombre}", (BaseTool,), {
            "__module__": __name__,
            "__annotations__": {"name": str, "description": str, "args_schema": Type[BaseModel]},
            "name": nombre, "description": f["description"], "args_schema": Args, "_run": _run,
        })
        out[nombre] = cls()
    return out


class Equipo:
    def __init__(self, agente):
        self.agente = agente

    # ------------------------------------------------------------ estimación (0 tokens)
    def estimar(self, modo: str, pregunta: str, historial: list, recuerdos: list) -> tuple[int, int]:
        lo, hi = self.agente.router.estimar("2_equilibrado", pregunta, historial, recuerdos)
        # serial: 3 agentes (las herramientas suman 1-2 vueltas); jerárquico: además el Manager delega y revisa
        return (lo * 2, hi * 3) if modo == "serial" else (lo * 3, hi * 5)

    # ------------------------------------------------------------ construcción del Crew
    def _llm(self, LLM, cand, tope: int):
        cfg = self.agente.cfg
        return LLM(model="openai/" + cand.modelo, base_url=cfg.base_url(cand.proveedor), api_key=cfg.api_key(cand.proveedor),
                   temperature=0.3, max_tokens=tope)

    def construir(self, modo: str, cand, ctx: dict, estado: dict, usuario: str):
        LLM, Agent, Crew, Process, Task, BaseTool = _importar()
        t = construir_herramientas(BaseTool, ctx, estado, self.agente.memoria, usuario)
        llm_w, llm_c, llm_m = (self._llm(LLM, cand, MAX_TOKENS[k]) for k in ("worker", "comm", "manager"))

        investigador = Agent(
            role="Investigador Académico",
            goal="Reunir los datos reales del estudiante (horario, calendario, apuntes, recuerdos) que sirven para la petición.",
            backstory="Eres meticuloso: consultas las herramientas y nunca inventas fechas ni datos. Entregas hechos breves en lista.",
            llm=llm_w, tools=[v for k, v in t.items() if k in SOLO_INVESTIGADOR], max_iter=3, verbose=False)
        planificador = Agent(
            role="Planificador de Estudio",
            goal="Convertir los datos en prioridades y un orden de acción claro, detectando choques de fechas.",
            backstory="Eres un estratega académico: ordenas por urgencia e impacto y explicas el porqué en pocas líneas.",
            llm=llm_w, max_iter=3, verbose=False)
        comunicador = Agent(
            role="Asistente Party",
            goal="Responder al estudiante en español, claro y breve, y proponer eventos al calendario cuando corresponda.",
            backstory="Eres el asistente de Party para estudiantes de Duoc UC. Para agregar algo al calendario usas proponer_evento "
                      "(el usuario lo confirma). Si el estudiante cuenta un hábito duradero, lo guardas con guardar_memoria.",
            llm=llm_c, tools=[v for k, v in t.items() if k in SOLO_COMUNICADOR], max_iter=3, verbose=False)

        investigar = Task(
            description="Fecha de hoy: {fecha_actual}.\nPetición del estudiante: {pregunta}\nLo que ya sabes de él: {recuerdos}\nConversación reciente: {conversacion}\n"
                        "Consulta con tus herramientas SOLO los datos necesarios y entrégalos como lista breve.",
            expected_output="Lista de 3 a 8 hechos concretos con fechas (máx. 2 líneas cada uno).", agent=investigador)
        planificar = Task(
            description="Con los datos reunidos, ordena las acciones para: {pregunta}\nIndica prioridad (alta/media/baja) y avisa de conflictos de fechas.",
            expected_output="Plan de 3 a 6 pasos priorizados, máx. 2 líneas por paso.", agent=planificador,
            **({"context": [investigar]} if modo == "serial" else {}))
        responder = Task(
            description="Responde al estudiante a: {pregunta}\nUsa el plan. Si corresponde, propone eventos con proponer_evento. "
                        "Termina con la respuesta final lista para mostrar, sin mencionar a los demás agentes.",
            expected_output="Respuesta final en español, breve, con las fechas relevantes.", agent=comunicador,
            **({"context": [investigar, planificar]} if modo == "serial" else {}))

        comun = dict(agents=[investigador, planificador, comunicador], tasks=[investigar, planificar, responder], verbose=False)
        if modo == "serial":
            return Crew(process=Process.sequential, **comun)
        return Crew(process=Process.hierarchical, manager_llm=llm_m, **comun)

    # ------------------------------------------------------------ ejecución
    async def ejecutar(self, modo: str, sesion: str, usuario: str, pregunta: str, ctx: dict, memoria: str | None = None) -> dict:
        if modo not in MODOS:
            raise ValueError(f"Modo desconocido: {modo}")
        ag = self.agente
        e = await ag.ejecutar(sesion, usuario, pregunta, ctx, None, solo_plan=True, estrategia=memoria)     # reglas + memoria + clasificación (0 tokens)
        if e.get("modo") == "reglas":
            return {"modo": "reglas", "respuesta": e["respuesta"], "traza": e["traza"], "llamadas": [], "acciones": []}
        cands = e.get("candidatos") or []
        if not cands:
            return {"modo": "sin_cupo", "respuesta": e.get("respuesta", ""), "traza": e["traza"], "llamadas": [], "acciones": []}
        recuerdos = " | ".join(e.get("recuerdos") or []) or "(nada guardado)"
        previo = " ".join(f"{'Usuario' if m['role'] == 'user' else 'Asistente'}: {m['content'][:200]}" for m in e.get("historial", []))
        if e.get("resumen"):
            previo = f"Resumen anterior: {e['resumen']} " + previo
        inputs = {"pregunta": pregunta, "fecha_actual": fecha_larga(hoy(ctx)), "recuerdos": recuerdos, "conversacion": previo or "(inicio de la conversación)"}
        traza = list(e["traza"]) + [f"Orquestación CrewAI: {MODOS[modo]}."]
        errores: list[str] = []
        for cand in cands[:3]:                                 # mismo respaldo entre proveedores que el grafo
            estado = {"acciones": [], "memoria_guardada": []}
            try:
                crew = self.construir(modo, cand, ctx, estado, usuario)
                res = await asyncio.to_thread(crew.kickoff, inputs=inputs)
            except Exception as ex:                            # noqa: BLE001
                errores.append(f"{cand.proveedor}/{cand.modelo}: {type(ex).__name__}: {str(ex)[:200]}")
                ag.meter.enfriar(f"{cand.proveedor}|{cand.modelo}", 600)
                traza.append(f"Falló {cand.proveedor}/{cand.modelo}; pruebo el respaldo.")
                continue
            uso = getattr(res, "token_usage", None)
            total = int(getattr(uso, "total_tokens", 0) or 0) or estimar_tokens(str(res))
            ag.meter.registrar(cand.proveedor, cand.modelo, total, None)
            respuesta = str(getattr(res, "raw", None) or res).strip()
            ag.memoria.guardar_turno(sesion, "user", pregunta)
            ag.memoria.guardar_turno(sesion, "assistant", respuesta)
            extra = await ag._actualizar_resumen({"sesion": sesion, "traza": [], "llamadas": []}) if e.get("estrategia") == "summary" else {}
            llamadas = [{"etapa": f"crew-{modo}", "proveedor": cand.proveedor, "modelo": cand.modelo,
                         "entrada": int(getattr(uso, "prompt_tokens", 0) or 0) or None, "salida": int(getattr(uso, "completion_tokens", 0) or 0) or None,
                         "total": total, "exacto": bool(getattr(uso, "total_tokens", 0)),
                         "peticiones": int(getattr(uso, "successful_requests", 0) or 0)}]
            return {"modo": "llm", "respuesta": respuesta, "acciones": estado["acciones"], "memoria_guardada": estado["memoria_guardada"],
                    "llamadas": llamadas + (extra.get("llamadas") or []), "traza": traza + [f"Equipo terminó con {cand.proveedor}/{cand.modelo}: {total} tokens."], "errores": errores,
                    "nivel": "2_equilibrado", "cand": cand}
        return {"modo": "error", "respuesta": "", "llamadas": [], "acciones": [], "traza": traza, "errores": errores}
