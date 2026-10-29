"""Herramientas del agente (consulta, escritura con confirmación y razonamiento).

Los datos del usuario llegan en `contexto` desde el navegador (horario, eventos, apuntes), así que NO se
meten enteros en el prompt: el modelo los consulta con herramientas cuando los necesita (ahorra tokens).
Las herramientas de escritura no escriben: devuelven una *propuesta* que el usuario confirma en la interfaz.
"""
from __future__ import annotations
from datetime import timedelta

from .memoria import Memoria
from .util import DIAS, fecha_larga, hoy, parse_fecha, sin_acentos, MESES
import re

TIPOS = ["prueba", "entrega", "clase", "reunion", "general"]


def _fn(nombre, descripcion, props, requeridos=()):
    return {"type": "function", "function": {"name": nombre, "description": descripcion,
            "parameters": {"type": "object", "properties": props, "required": list(requeridos)}}}


ESQUEMAS = [
    _fn("fecha_actual", "Devuelve la fecha de hoy y el día de la semana. Úsala antes de razonar con fechas relativas.", {}),
    _fn("consultar_horario", "Clases del estudiante en un día (hoy, mañana, un día de la semana o AAAA-MM-DD).",
        {"dia": {"type": "string", "description": "hoy, mañana, lunes…, o AAAA-MM-DD"}}, ["dia"]),
    _fn("consultar_calendario", "Eventos del calendario (pruebas, entregas, reuniones) entre dos fechas. Sin fechas, los próximos 30 días.",
        {"desde": {"type": "string", "description": "Fecha inicial: hoy, mañana o AAAA-MM-DD. Opcional."},
         "hasta": {"type": "string", "description": "Fecha final AAAA-MM-DD. Opcional."}}),
    _fn("buscar_apuntes", "Busca en los apuntes escritos por el estudiante por palabras clave y devuelve fragmentos.",
        {"consulta": {"type": "string", "description": "Palabras clave del tema, por ejemplo 'normalización tercera forma'."}}, ["consulta"]),
    _fn("buscar_material", "Busca en el material de estudio subido a la Biblioteca (PDF, Word, guías) y devuelve fragmentos con el archivo y la página. "
        "Úsala para responder sobre contenido de clases; luego cita el archivo.",
        {"consulta": {"type": "string", "description": "Tema o palabras clave, por ejemplo 'dead letter exchange'."},
         "asignatura": {"type": "string", "description": "Nombre (o parte) de la asignatura para acotar. Opcional."}}, ["consulta"]),
    _fn("leer_material", "Lee un tramo de un archivo de la Biblioteca para resumirlo o explicarlo. Primero obtén el id con buscar_material.",
        {"archivo": {"type": "string", "description": "id del archivo, tal como lo devolvió buscar_material."},
         "parte": {"type": "integer", "description": "Número de tramo (1 es el inicio). Cada tramo tiene unos 2500 caracteres. Por defecto 1."}}, ["archivo"]),
    _fn("detectar_conflictos", "Revisa si una fecha choca con clases u otros eventos, y qué carga hay los días previos.",
        {"fecha": {"type": "string", "description": "Fecha a revisar en formato AAAA-MM-DD."}}, ["fecha"]),
    _fn("proponer_evento", "Propone agregar un evento al calendario. NO lo crea: el usuario debe confirmarlo.",
        {"titulo": {"type": "string", "description": "Título corto del evento, por ejemplo 'Entrega informe BDD'."},
         "fecha": {"type": "string", "description": "Fecha del evento en formato AAAA-MM-DD; no puede ser pasada."},
         "tipo": {"type": "string", "enum": TIPOS, "description": "Tipo de evento."},
         "descripcion": {"type": "string", "description": "Detalle opcional (máx. 300 caracteres)."}}, ["titulo", "fecha", "tipo"]),
    _fn("guardar_memoria", "Guarda un dato duradero del usuario (preferencias, hábitos, acuerdos) para recordarlo después.",
        {"texto": {"type": "string", "description": "El dato a recordar, en una frase, por ejemplo 'estudia mejor en las mañanas'."}}, ["texto"]),
    _fn("recordar", "Busca en lo que el usuario pidió recordar.",
        {"consulta": {"type": "string", "description": "Tema a recordar, por ejemplo 'horario de estudio'."}}, ["consulta"]),
]


def _clases_dia(ctx, d):
    return sorted([c for c in (ctx.get("horario") or []) if c.get("dia") == d.weekday()], key=lambda c: c.get("desde", ""))


def _dia(valor: str, ctx):
    t = sin_acentos(valor or "")
    for i, n in enumerate(DIAS):
        if sin_acentos(n) == t:  # próximo día con ese nombre
            h = hoy(ctx)
            return h + timedelta(days=(i - h.weekday()) % 7)
    return parse_fecha(valor, ctx)


TRAMO = 2500
SERVICIO = None      # party_agent.semantico.Servicio (búsqueda por significado); None → solo palabras clave


def configurar(servicio):
    global SERVICIO
    SERVICIO = servicio


def _semantica(fuente: str, docs: list[dict], consulta: str, ids: set | None = None, grupo: str | None = None):
    """Búsqueda por significado; devuelve None si no hay servicio o falla (la herramienta cae a palabras clave)."""
    if SERVICIO is None or not docs:
        return None
    try:
        return SERVICIO.buscar(fuente, docs, consulta, ids, 4, grupo)
    except Exception:       # noqa: BLE001  una falla del índice nunca debe tumbar la herramienta
        return None



MARCA_PAG = re.compile(r"\[p\.(\d+)\]\s*")


def _pagina(texto: str, fragmento: str):
    """Página donde empieza un fragmento, según las marcas [p.N] que el lector deja al subir el PDF. None si el archivo no las tiene."""
    plano = re.sub(r"\s+", " ", texto or "")
    clave = re.sub(r"\s+", " ", MARCA_PAG.sub("", fragmento or "")).strip()[:50]
    i = plano.find(clave) if clave else -1
    if i < 0:
        return None
    previas = [m for m in MARCA_PAG.finditer(plano) if m.start() <= i]
    return int(previas[-1].group(1)) if previas else None


def _trozos(texto: str, largo: int = 700) -> list[str]:
    """Parte un texto en fragmentos de ~largo caracteres cortando en espacios."""
    out, i = [], 0
    while i < len(texto):
        j = min(len(texto), i + largo)
        if j < len(texto):
            k = texto.rfind(" ", i + largo // 2, j)
            j = k if k > 0 else j
        out.append(texto[i:j].strip())
        i = j
    return [t for t in out if t]


def ejecutar(nombre: str, args: dict, ctx: dict, estado: dict, memoria: Memoria, usuario: str) -> dict:
    h = hoy(ctx)
    try:
        if nombre == "fecha_actual":
            return {"hoy": h.isoformat(), "texto": fecha_larga(h)}

        if nombre == "consultar_horario":
            d = _dia(args.get("dia", "hoy"), ctx)
            if not d:
                return {"error": "No entendí el día; usa hoy, mañana, un día de la semana o AAAA-MM-DD."}
            cs = _clases_dia(ctx, d)
            if not ctx.get("horario"):
                return {"aviso": "El estudiante aún no cargó su horario."}
            return {"fecha": d.isoformat(), "dia": DIAS[d.weekday()], "clases": cs}

        if nombre == "consultar_calendario":
            d1 = parse_fecha(args.get("desde") or "hoy", ctx) or h
            d2 = parse_fecha(args.get("hasta") or "", ctx) or d1 + timedelta(days=30)
            ev = [e for e in (ctx.get("eventos") or []) if d1.isoformat() <= e.get("fecha", "") <= d2.isoformat()]
            return {"desde": d1.isoformat(), "hasta": d2.isoformat(), "eventos": sorted(ev, key=lambda e: e["fecha"])[:25]}

        if nombre == "buscar_apuntes":
            apuntes = ctx.get("apuntes") or []
            sem = _semantica("apuntes", [{"id": a.get("id"), "texto": f"{a.get('titulo','')}. {a.get('texto','')}"} for a in apuntes if a.get("id")],
                             args.get("consulta", ""), grupo=ctx.get("grupo"))
            if sem and sem["resultados"]:
                por_id = {str(a.get("id")): a for a in apuntes}
                return {"metodo": sem["metodo"], **({"aviso": sem["aviso"]} if sem.get("aviso") else {}),
                        "resultados": [{"id": r["id"], "titulo": (por_id.get(str(r["id"])) or {}).get("titulo"), "asignatura": (por_id.get(str(r["id"])) or {}).get("asignatura"),
                                        "fragmento": r["fragmento"], "similitud": r["similitud"]} for r in sem["resultados"]]}
            q = set(re.findall(r"[a-z0-9]{3,}", sin_acentos(args.get("consulta", ""))))
            res = []
            for a in ctx.get("apuntes") or []:
                texto = sin_acentos(f"{a.get('titulo','')} {a.get('asignatura','')} {a.get('texto','')}")
                p = sum(texto.count(w) for w in q)
                if p:
                    i = min((texto.find(w) for w in q if w in texto), default=0)
                    res.append((p, {"id": a.get("id"), "titulo": a.get("titulo"), "asignatura": a.get("asignatura"),
                                    "fragmento": (a.get("texto") or "")[max(0, i - 60): i + 260]}))
            res.sort(key=lambda x: -x[0])
            return {"resultados": [r for _, r in res[:3]]} if res else {"resultados": [], "aviso": "Sin coincidencias en los apuntes."}

        if nombre == "buscar_material":
            q = set(re.findall(r"[a-z0-9]{3,}", sin_acentos(args.get("consulta", ""))))
            filtro = sin_acentos(args.get("asignatura") or "")
            docs = ctx.get("material") or []
            if not docs:
                return {"resultados": [], "aviso": "La Biblioteca no tiene material con texto indexado (sube PDF o Word en la Biblioteca)."}
            if not q:
                return {"error": "Indica palabras clave de lo que buscas."}
            elegidos = [d for d in docs if not filtro or filtro in sin_acentos(f"{d.get('asignatura','')} {d.get('ruta','')}")]
            sem = _semantica("material", [{"id": d.get("id"), "texto": d.get("texto", "")} for d in elegidos], args.get("consulta", ""), {str(d.get("id")) for d in elegidos})
            if sem and sem["resultados"]:
                por_id = {str(d.get("id")): d for d in elegidos}
                filas = []
                for r in sem["resultados"]:
                    d = por_id.get(r["id"])
                    if not d:
                        continue
                    f = {"archivo": d.get("nombre"), "id": r["id"], "asignatura": d.get("asignatura"), "tramo": r["tramo"],
                         "fragmento": MARCA_PAG.sub("", r["fragmento"])[:380], "similitud": r["similitud"]}
                    pg = _pagina(d.get("texto", ""), r["fragmento"])
                    if pg:
                        f["pagina"] = pg
                    filas.append(f)
                return {"metodo": sem["metodo"], **({"aviso": sem["aviso"]} if sem.get("aviso") else {}), "coincidencias": len(filas), "resultados": filas}
            res = []
            for d in docs:
                if filtro and filtro not in sin_acentos(f"{d.get('asignatura','')} {d.get('ruta','')}"):
                    continue
                for n, t in enumerate(_trozos(d.get("texto", "")), 1):
                    tt = sin_acentos(t)
                    p = sum(min(tt.count(w), 3) for w in q) + (2 if all(w in tt for w in q) else 0)
                    if p:
                        f = {"archivo": d.get("nombre"), "id": d.get("id"), "asignatura": d.get("asignatura"), "tramo": n, "fragmento": MARCA_PAG.sub("", t)[:380]}
                        pg = _pagina(d.get("texto", ""), t)
                        if pg:
                            f["pagina"] = pg
                        res.append((p, f))
            res.sort(key=lambda x: -x[0])
            return {"coincidencias": len(res[:4]), "resultados": [r for _, r in res[:4]]} if res else {"coincidencias": 0, "resultados": [], "aviso": "Sin coincidencias en el material."}

        if nombre == "leer_material":
            d = next((x for x in (ctx.get("material") or []) if x.get("id") == args.get("archivo")), None)
            if not d:
                return {"error": "No encuentro ese archivo; obtén el id con buscar_material."}
            try:
                parte = max(1, int(args.get("parte") or 1))
            except (TypeError, ValueError):
                return {"error": "parte debe ser un número entero (1 es el inicio)."}
            texto = d.get("texto", "")
            total = max(1, -(-len(texto) // TRAMO))
            if parte > total:
                return {"error": f"El archivo solo tiene {total} tramos."}
            return {"archivo": d.get("nombre"), "parte": parte, "de": total, "texto": texto[(parte - 1) * TRAMO: parte * TRAMO]}

        if nombre == "detectar_conflictos":
            d = parse_fecha(args.get("fecha", ""), ctx)
            if not d:
                return {"error": "Fecha inválida; usa AAAA-MM-DD."}
            ev = ctx.get("eventos") or []
            mismo = [e for e in ev if e.get("fecha") == d.isoformat()]
            previos = [e for e in ev if (d - timedelta(days=3)).isoformat() <= e.get("fecha", "") < d.isoformat()]
            return {"fecha": d.isoformat(), "dia": DIAS[d.weekday()], "clases_ese_dia": _clases_dia(ctx, d),
                    "eventos_ese_dia": mismo, "eventos_3_dias_previos": previos,
                    "hay_conflicto": bool(mismo), "pasada": d < h}

        if nombre == "proponer_evento":
            d = parse_fecha(args.get("fecha", ""), ctx)
            tipo = args.get("tipo") if args.get("tipo") in TIPOS else "general"
            titulo = (args.get("titulo") or "").strip()[:100]
            if not d or not titulo:
                return {"estado": "invalido", "error": "Falta un título o una fecha válida (AAAA-MM-DD)."}
            if d < h:
                return {"estado": "invalido", "error": f"{d.isoformat()} ya pasó (hoy es {h.isoformat()})."}
            for e in ctx.get("eventos") or []:
                if e.get("fecha") == d.isoformat() and sin_acentos(e.get("titulo", "")) == sin_acentos(titulo):
                    return {"estado": "duplicado", "mensaje": "Ya existe un evento igual en el calendario."}
            if any(a["fecha"] == d.isoformat() and a["titulo"] == titulo for a in estado["acciones"]):
                return {"estado": "duplicado", "mensaje": "Ya está en las propuestas."}
            estado["acciones"].append({"tipo": "crear_evento", "titulo": titulo, "fecha": d.isoformat(), "evento": tipo,
                                       "descripcion": (args.get("descripcion") or "Propuesto por el asistente")[:300]})
            return {"estado": "propuesto", "fecha": fecha_larga(d), "nota": "Queda pendiente de confirmación del usuario."}

        if nombre == "guardar_memoria":
            memoria.recordar(usuario, args.get("texto", ""))
            estado["memoria_guardada"].append(args.get("texto", ""))
            return {"estado": "guardado"}

        if nombre == "recordar":
            return {"recuerdos": memoria.buscar(usuario, args.get("consulta", ""))}

        return {"error": f"Herramienta desconocida: {nombre}"}
    except Exception as e:  # una herramienta nunca debe tumbar al agente
        return {"error": f"{type(e).__name__}: {e}"}
