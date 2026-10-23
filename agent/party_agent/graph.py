"""Grafo del agente (LangGraph).

recordar → reglas ─┬─ (respondió) ──────────────────────────────┐
                   └→ clasificar ─┬─ (solo plan) → FIN           │
                                  └→ [planificar] → actuar → verificar ─┬─ (escalar) → actuar
                                                                        └→ memorizar → FIN
"""
from __future__ import annotations
import asyncio
import json
import logging
import re
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from . import tools
from .config import ESCALA, Config
from .memoria import Memoria
from .meter import Meter
from .providers import ProviderError, Providers
from .reglas import responder
from .semantico import Servicio
from .router import ESFUERZO, LIMITES_SALIDA, Router
from .util import estimar_tokens, fecha_larga, hoy


log = logging.getLogger("party")
ESTRATEGIAS = ("buffer", "window", "summary")


class Estado(TypedDict, total=False):
    sesion: str
    usuario: str
    pregunta: str
    imagen: str | None
    ctx: dict
    solo_plan: bool
    historial: list
    resumen: str
    estrategia: str
    recuerdos: list
    modo: str                 # reglas | llm | sin_cupo
    respuesta: str
    nivel: str
    razon: str
    vision: bool
    estimacion: tuple
    candidatos: list
    plan_pasos: dict | None
    acciones: list
    memoria_guardada: list
    llamadas: list
    escalado: bool
    traza: list
    fallo_herramientas: bool
    errores: list


class Agente:
    def __init__(self, cfg: Config | None = None, meter: Meter | None = None, memoria: Memoria | None = None, providers: Providers | None = None, semantico: Servicio | None = None):
        self.cfg = cfg or Config()
        self.meter = meter or Meter(self.cfg)
        self.memoria = memoria or Memoria()
        self.providers = providers or Providers(self.cfg)
        self.semantico = semantico or Servicio(self.cfg, self.meter)
        tools.configurar(self.semantico)
        self.router = Router(self.cfg, self.meter)
        self.grafo = self._construir()

    # ============ nodos ============
    async def n_recordar(self, s: Estado) -> Estado:
        est = s.get("estrategia") if s.get("estrategia") in ESTRATEGIAS else self.cfg.ajustes.get("memoria_estrategia", "window")
        est = est if est in ESTRATEGIAS else "window"
        h = self.memoria.historial(s["sesion"], self.cfg.ajustes["memoria_corta_turnos"], est)
        res = self.memoria.resumen(s["sesion"]) if est == "summary" else ""
        r = self.memoria.buscar(s["usuario"], s["pregunta"])
        return {"historial": h, "resumen": res, "estrategia": est, "recuerdos": r,
                "traza": [f"Memoria ({est}): {len(h)} mensajes recientes{', resumen de lo anterior' if res else ''}, {len(r)} recuerdos relacionados."],
                "acciones": [], "memoria_guardada": [], "llamadas": [], "escalado": False, "fallo_herramientas": False, "plan_pasos": None}

    async def n_reglas(self, s: Estado) -> Estado:
        if s.get("imagen"):
            return {}
        r = responder(s["pregunta"], s.get("ctx") or {})
        if r:
            return {"modo": "reglas", "respuesta": r, "traza": s["traza"] + ["Reglas internas: respondí sin usar un modelo (0 tokens)."]}
        return {}

    async def n_clasificar(self, s: Estado) -> Estado:
        c = self.router.clasificar(s["pregunta"], bool(s.get("imagen")))
        est = self.router.estimar(c.nivel, s["pregunta"], s["historial"], s["recuerdos"])
        cands = self.router.candidatos(c.nivel, est[1])
        traza = s["traza"] + [f"Clasificación: {c.nivel} — {c.razon}"]
        if not cands:
            return {"modo": "sin_cupo", "nivel": c.nivel, "razon": c.razon, "vision": c.vision, "estimacion": est, "candidatos": [],
                    "respuesta": self.router.explicar_sin_cupo(), "traza": traza + ["Sin modelos disponibles."]}
        return {"modo": "llm", "nivel": c.nivel, "razon": c.razon, "vision": c.vision, "estimacion": est, "candidatos": cands,
                "traza": traza + [f"Elegido: {cands[0].proveedor}/{cands[0].modelo} (respaldos: {len(cands) - 1})."]}

    async def n_planificar(self, s: Estado) -> Estado:
        """Solo en tareas pesadas: el modelo propone un plan priorizado antes de actuar (IE5)."""
        nombres = ", ".join(e["function"]["name"] for e in tools.ESQUEMAS)
        msgs = [{"role": "system", "content": "Eres el planificador de un asistente académico. Devuelve SOLO un JSON válido con la forma "
                 '{"objetivo": str, "pasos": [{"n": int, "accion": str, "prioridad": "alta|media|baja", "herramienta": str|null}]} '
                 f"con 3 a 6 pasos ordenados por prioridad. Herramientas disponibles: {nombres}. Hoy es {fecha_larga(hoy(s.get('ctx')))}."},
                {"role": "user", "content": s["pregunta"]}]
        est0 = {"llamadas": list(s.get("llamadas", [])), "candidatos": s.get("candidatos", []), "errores": list(s.get("errores", []))}
        try:
            r, cand, estado = await self._llamar(s, msgs, None, 600, "planificar", est0)
        except ProviderError as e:
            return {"errores": est0["errores"], "candidatos": est0["candidatos"], "traza": s["traza"] + [f"Planificador no disponible ({e}); sigo sin plan explícito."]}
        plan = None
        m = re.search(r"\{.*\}", r["contenido"], re.S)
        if m:
            try:
                plan = json.loads(m.group(0))
            except Exception:
                plan = None
        return {"plan_pasos": plan, "llamadas": estado["llamadas"], "candidatos": estado["candidatos"], "errores": estado["errores"],
                "traza": s["traza"] + [f"Plan ({cand.proveedor}/{cand.modelo}): " + (f"{len(plan.get('pasos', []))} pasos." if plan else "no se pudo leer; continúo.")]}

    async def n_actuar(self, s: Estado) -> Estado:
        ctx = s.get("ctx") or {}
        sistema = ("Eres el asistente de Party, una app de organización académica para estudiantes de Duoc UC. Responde en español, breve y claro. "
                   f"Hoy es {fecha_larga(hoy(ctx))}. Reglas: 1) Para datos del estudiante (horario, calendario, apuntes) usa SIEMPRE las herramientas; "
                   "no inventes fechas ni datos. 2) Para agregar algo al calendario usa proponer_evento (el usuario lo confirma). "
                   "3) Si detectas un conflicto de fechas, avísalo, ajusta tu propuesta y explica el cambio. "
                   "4) Si el usuario cuenta un hábito o preferencia duradera, usa guardar_memoria. 5) No pidas datos que puedas consultar con una herramienta.")
        if s.get("resumen"):
            sistema += " Resumen de la conversación anterior: " + s["resumen"]
        if s.get("recuerdos"):
            sistema += " Lo que sabes del usuario: " + " | ".join(s["recuerdos"])
        if s.get("plan_pasos"):
            sistema += " Plan a seguir: " + json.dumps(s["plan_pasos"], ensure_ascii=False)
        contenido = s["pregunta"] if not s.get("imagen") else [{"type": "text", "text": s["pregunta"] or "Describe la imagen."},
                                                               {"type": "image_url", "image_url": {"url": s["imagen"]}}]
        msgs = [{"role": "system", "content": sistema}, *s["historial"], {"role": "user", "content": contenido}]
        estado = {"acciones": list(s["acciones"]), "memoria_guardada": list(s["memoria_guardada"]), "llamadas": list(s["llamadas"]), "candidatos": s["candidatos"],
                  "errores": list(s.get("errores", []))}
        traza = list(s["traza"])
        final, errores, usos = "", 0, 0
        for _ in range(self.cfg.ajustes["max_pasos_herramientas"]):
            try:
                r, cand, estado2 = await self._llamar({**s, **estado}, msgs, None if s.get("vision") else tools.ESQUEMAS, LIMITES_SALIDA[s["nivel"]], "responder", estado)
            except ProviderError as e:
                traza.append(f"Ningún modelo pudo responder: {e}")
                final = ""
                break
            if not r["herramientas"]:
                final = r["contenido"].strip()
                break
            msgs.append(r["mensaje"])
            for tc in r["herramientas"]:
                nombre = tc["function"]["name"]
                try:
                    args = json.loads(tc["function"].get("arguments") or "{}")
                except Exception:
                    args = {}
                res = await asyncio.to_thread(tools.ejecutar, nombre, args, ctx, estado, self.memoria, s["usuario"])
                usos += 1
                errores += 1 if "error" in res else 0
                traza.append(f"Herramienta {nombre}({json.dumps(args, ensure_ascii=False)[:90]}) → {json.dumps(res, ensure_ascii=False)[:300]}")
                msgs.append({"role": "tool", "tool_call_id": tc.get("id", nombre), "content": json.dumps(res, ensure_ascii=False)})
        else:
            final = "Llegué al límite de pasos sin cerrar la respuesta. Reformula la pregunta con algo más concreto."
        return {"respuesta": final, "acciones": estado["acciones"], "memoria_guardada": estado["memoria_guardada"], "llamadas": estado["llamadas"],
                "candidatos": estado["candidatos"], "errores": estado["errores"], "traza": traza, "fallo_herramientas": bool(usos and errores == usos)}

    async def n_verificar(self, s: Estado) -> Estado:
        return {}

    def _decidir_escalar(self, s: Estado) -> str:
        malo = not s.get("respuesta") or s.get("fallo_herramientas")
        if malo and not s.get("escalado") and s["nivel"] in ESCALA and ESCALA.index(s["nivel"]) < len(ESCALA) - 1:
            return "escalar"
        return "ok"

    async def n_escalar(self, s: Estado) -> Estado:
        nuevo = ESCALA[ESCALA.index(s["nivel"]) + 1]
        est = self.router.estimar(nuevo, s["pregunta"], s["historial"], s["recuerdos"])
        cands = self.router.candidatos(nuevo, est[1])
        return {"nivel": nuevo, "escalado": True, "candidatos": cands, "respuesta": "", "fallo_herramientas": False,
                "acciones": [], "traza": s["traza"] + [f"Escalamiento: la respuesta no fue confiable; reintento en {nuevo}."]}

    async def n_memorizar(self, s: Estado) -> Estado:
        if s.get("respuesta"):
            self.memoria.guardar_turno(s["sesion"], "user", s["pregunta"])
            self.memoria.guardar_turno(s["sesion"], "assistant", s["respuesta"])
            if s.get("estrategia") == "summary" and s.get("modo") != "reglas":
                extra = await self._actualizar_resumen(s)
                if extra:
                    return extra
        m = re.match(r"\s*(?:recuerda|anota|acuerdate)\s+que\s+(.+)", s["pregunta"], re.I)
        if m and s.get("modo") != "sin_cupo":
            self.memoria.recordar(s["usuario"], m.group(1).strip())
            return {"memoria_guardada": s.get("memoria_guardada", []) + [m.group(1).strip()]}
        return {}

    async def _actualizar_resumen(self, s: Estado) -> Estado:
        """ConversationSummaryMemory: condensa los turnos antiguos con un modelo rápido (si no hay cupo, resumen extractivo: 0 tokens)."""
        viejos = self.memoria.pendientes_de_resumir(s["sesion"])
        if not viejos:
            return {}
        previo = self.memoria.resumen(s["sesion"])
        dialogo = "\n".join(f"{'Usuario' if r == 'user' else 'Asistente'}: {t[:300]}" for _, r, t in viejos)
        msgs = [{"role": "system", "content": "Resume en español, en máximo 4 líneas, lo importante de la conversación (temas, fechas, decisiones, preferencias). Solo el resumen."},
                {"role": "user", "content": (f"Resumen previo: {previo}\n\n" if previo else "") + f"Nuevos mensajes:\n{dialogo}"}]
        cands = self.router.candidatos("1_rapido", 700)
        est = {"llamadas": list(s.get("llamadas", [])), "candidatos": cands, "errores": list(s.get("errores", []))}
        texto, via = "", "extractivo (0 tokens)"
        if cands:
            try:
                r, cand, est = await self._llamar({**s, "nivel": "1_rapido"}, msgs, None, 250, "resumir_memoria", est)
                texto, via = r["contenido"].strip(), f"{cand.proveedor}/{cand.modelo}"
            except ProviderError:
                pass
        if not texto:
            texto = self.memoria.resumen_extractivo(previo, viejos)
        self.memoria.guardar_resumen(s["sesion"], texto, viejos[-1][0])
        return {"llamadas": est["llamadas"], "traza": s["traza"] + [f"Memoria: resumí {len(viejos)} mensajes antiguos con {via}."]}

    # ============ llamada con respaldo ============
    async def _llamar(self, s: Estado, msgs, herramientas, max_tokens, etapa, estado=None):
        estado = estado if estado is not None else {"llamadas": list(s.get("llamadas", [])), "candidatos": s.get("candidatos", [])}
        ultimo = None
        for cand in list(estado["candidatos"]):
            try:
                r = await self.providers.chat(cand.proveedor, cand.modelo, msgs, herramientas, max_tokens, esfuerzo=ESFUERZO.get(s.get('nivel'), 'medium'))
            except ProviderError as e:
                ultimo = e
                detalle = f"{cand.proveedor}/{cand.modelo}: {e.tipo}: {str(e)[:220]}"
                estado.setdefault("errores", []).append(detalle)
                log.warning("Falló %s", detalle)
                clave = {"rate_limit": cand.proveedor, "auth": cand.proveedor, "modelo": f"{cand.proveedor}|{cand.modelo}"}.get(e.tipo, f"{cand.proveedor}|{cand.modelo}")
                self.meter.enfriar(clave, 3600 if e.tipo in ("auth", "modelo") else e.retry_after)
                estado["candidatos"] = [c for c in estado["candidatos"] if c is not cand]
                continue
            u = r["uso"]
            total = u.get("total") or ((u.get("entrada") or 0) + (u.get("salida") or 0)) or estimar_tokens(json.dumps(msgs)) + estimar_tokens(r["contenido"])
            self.meter.registrar(cand.proveedor, cand.modelo, total, r["cabeceras"])
            estado["llamadas"].append({"etapa": etapa, "proveedor": cand.proveedor, "modelo": cand.modelo, "entrada": u.get("entrada"), "salida": u.get("salida"),
                                       "total": total, "exacto": bool(u.get("total"))})
            return r, cand, estado
        raise ultimo or ProviderError("servidor", "No quedan modelos disponibles")

    # ============ ensamblado ============
    def _construir(self):
        g = StateGraph(Estado)
        for nombre, fn in [("recordar", self.n_recordar), ("reglas", self.n_reglas), ("clasificar", self.n_clasificar), ("planificar", self.n_planificar),
                           ("actuar", self.n_actuar), ("verificar", self.n_verificar), ("escalar", self.n_escalar), ("memorizar", self.n_memorizar)]:
            g.add_node(nombre, fn)
        g.set_entry_point("recordar")
        g.add_edge("recordar", "reglas")
        g.add_conditional_edges("reglas", lambda s: "fin" if s.get("modo") == "reglas" else "seguir", {"fin": "memorizar", "seguir": "clasificar"})
        def tras_clasificar(s):
            if s.get("modo") == "sin_cupo" or s.get("solo_plan"):
                return "fin"
            return "plan" if s["nivel"] == "3_razonamiento" else "actuar"
        g.add_conditional_edges("clasificar", tras_clasificar, {"fin": END, "plan": "planificar", "actuar": "actuar"})
        g.add_edge("planificar", "actuar")
        g.add_edge("actuar", "verificar")
        g.add_conditional_edges("verificar", self._decidir_escalar, {"escalar": "escalar", "ok": "memorizar"})
        g.add_edge("escalar", "actuar")
        g.add_edge("memorizar", END)
        return g.compile()

    async def ejecutar(self, sesion: str, usuario: str, pregunta: str, ctx: dict | None, imagen: str | None = None, solo_plan: bool = False,
                       estrategia: str | None = None) -> Estado:
        return await self.grafo.ainvoke({"sesion": sesion, "usuario": usuario, "pregunta": pregunta, "ctx": ctx or {}, "imagen": imagen, "solo_plan": solo_plan,
                                         "estrategia": estrategia or ""})
