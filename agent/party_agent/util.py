from __future__ import annotations
import re
import unicodedata
from datetime import date, datetime, timedelta

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def sin_acentos(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", t or "") if unicodedata.category(c) != "Mn").lower()


def hoy(ctx: dict | None = None) -> date:
    """Fecha de hoy: la que manda el navegador (su zona horaria) o, si falta, la de Chile."""
    iso = (ctx or {}).get("hoy")
    if iso:
        try:
            return date.fromisoformat(iso[:10])
        except ValueError:
            pass
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("America/Santiago")).date()
    except Exception:
        return date.today()


def fecha_larga(d: date) -> str:
    return f"{DIAS[d.weekday()]} {d.day} de {MESES[d.month - 1]}"


def estimar_tokens(texto: str) -> int:
    """Aproximación: ~1 token cada 4 caracteres (es una estimación, no un conteo exacto)."""
    return max(1, round(len(texto or "") / 4))


def parse_fecha(s: str, ctx: dict | None = None) -> date | None:
    """Acepta AAAA-MM-DD, 'mañana', 'hoy' y 'el 24 de octubre'."""
    t = sin_acentos(s or "").strip()
    h = hoy(ctx)
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", t):
        try:
            return date.fromisoformat(t)
        except ValueError:
            return None
    if t == "hoy":
        return h
    if t in ("manana", "mañana"):
        return h + timedelta(days=1)
    m = re.search(r"(\d{1,2})\s*(?:de\s+)?(" + "|".join(sin_acentos(x)[:3] for x in MESES) + r")", t)
    if m:
        mes = [sin_acentos(x)[:3] for x in MESES].index(m.group(2)) + 1
        try:
            d = date(h.year, mes, int(m.group(1)))
            return d if d >= h - timedelta(days=30) else date(h.year + 1, mes, int(m.group(1)))
        except ValueError:
            return None
    return None
