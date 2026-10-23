"""Nivel 0: respuestas con reglas internas (0 tokens)."""
from __future__ import annotations
import re
from datetime import timedelta

from .util import DIAS, fecha_larga, hoy, sin_acentos

SALAS = {"LC8": "2º piso, bloque central", "LC9": "2º piso, bloque central", "DST1": "5º piso, segundo bloque"}


def _clases(ctx: dict, d) -> list[dict]:
    return sorted([c for c in (ctx.get("horario") or []) if c.get("dia") == d.weekday()], key=lambda c: c.get("desde", ""))


def _lista(cs: list[dict]) -> str:
    return "\n".join(f"• {c['asignatura']} — {c['desde']} a {c['hasta']}" + (f" · {c['sala']}" if c.get("sala") else "") for c in cs)


def responder(texto: str, ctx: dict) -> str | None:
    t = sin_acentos(texto).strip()
    h = hoy(ctx)
    if re.fullmatch(r"(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey)\W*", t):
        return "¡Hola! Pregúntame por tu horario, tus pruebas o pídeme que te ayude a organizarte."
    if re.search(r"\b(que|cual)\b.*\b(fecha|dia)\b.*\bhoy\b|\bque dia es hoy\b", t):
        return f"Hoy es {fecha_larga(h)}."
    m = re.search(r"donde\b.*\b(?:sala\s*)?((?:pa-?)?(lc|dst)\s?\d)\b", t)
    if m:
        cod = re.sub(r"^pa-?", "", m.group(1)).upper().replace(" ", "")
        return f"La sala {cod} está en el {SALAS[cod]}." if cod in SALAS else f"Aún no tengo registrada la sala {cod}."
    if re.search(r"\b(clases?|horario|me toca|que tengo|actividades?)\b", t) and not re.search(r"\b(organiza|planifica|prioriza|conflicto|resumen)\b", t):
        if not ctx.get("horario"):
            return "Aún no tengo tu horario. Súbelo desde Mis Asignaturas (foto, PDF o Word) y lo leo por ti."
        if "semana" in t or ("horario" in t and "hoy" not in t and "manana" not in t):
            filas = []
            # "esta semana" = lo que RESTA (de hoy al domingo); "proxima semana" = la siguiente completa; "horario" = todo
            prox = bool(re.search(r"proxima|siguiente|que viene", t))
            desde = 0 if (prox or "horario" in t) else h.weekday()
            for i, nombre in enumerate(DIAS):
                if i < desde:
                    continue
                cs = [c for c in ctx["horario"] if c.get("dia") == i]
                if cs:
                    filas.append(f"{nombre.capitalize()}: " + "; ".join(f"{c['asignatura']} ({c['desde']}–{c['hasta']})" for c in sorted(cs, key=lambda c: c['desde'])))
            if not filas:
                return "No te quedan clases esta semana. 🎉 Pregúntame por la próxima semana si quieres."
            titulo = "Tu horario:" if "horario" in t else ("Tu próxima semana:" if prox else ("Tu semana:" if desde == 0 else "Lo que te queda de la semana:"))
            return titulo + "\n" + "\n".join(filas)
        d = h + timedelta(days=1) if "manana" in t else h
        cs = _clases(ctx, d)
        etiqueta = "mañana" if d != h else "hoy"
        return f"Para {etiqueta} tienes:\n{_lista(cs)}" if cs else f"{etiqueta.capitalize()} no tienes clases. 🎉"
    if re.search(r"\b(pruebas?|evaluaciones?|examenes?)\b", t) and re.search(r"\b(que|cuales|proxim|tengo)\b", t) and not re.search(r"\b(organiza|planifica|prioriza|conflicto)\b", t):
        ev = sorted([e for e in (ctx.get("eventos") or []) if e.get("tipo") == "prueba" and e.get("fecha", "") >= h.isoformat()], key=lambda e: e["fecha"])
        if not ev:
            return "No tienes pruebas registradas en el calendario."
        return "Tus próximas pruebas:\n" + "\n".join(f"• {e['titulo']} — {e['fecha']}" for e in ev[:6])
    if t in ("ayuda", "help", "que puedes hacer", "que sabes hacer"):
        return ("Sin gastar IA puedo decirte tu horario, dónde queda una sala y tus próximas pruebas. "
                "Con IA (te pido permiso antes) puedo organizar tu semana, buscar en tus apuntes, resumir y proponer eventos para tu calendario.")
    return None
