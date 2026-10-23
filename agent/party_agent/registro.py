"""Registro de consultas: cuántas se resolvieron SIN tokens (reglas) y cuántas necesitaron un modelo (IE7).

Cada pregunta del estudiante queda como una fila: vía (reglas | reglas_cliente | llm | sin_cupo | cancelado), tokens y modelo.
  · reglas          → respondió el motor de reglas del agente (0 tokens)
  · reglas_cliente  → respondió el navegador con reglas + Supabase, sin llamar siquiera al agente (0 tokens)
Se guarda en SQLite local y, si hay Supabase, se refleja en la tabla agent_usage (para no perderlo).
"""
from __future__ import annotations
import sqlite3
import time
from pathlib import Path

from .config import BASE

SIN_TOKENS = ("reglas", "reglas_cliente")


def espejo_supabase():
    """Devuelve una función que copia cada fila a la tabla agent_queries de Supabase (en segundo plano), o None si no hay credenciales.
    Las consultas resueltas por el navegador (reglas_cliente) las anota el propio navegador, así que aquí se omiten para no contarlas dos veces."""
    import os
    if os.getenv("PARTY_ESPEJO", "1") == "0" or "pytest" in __import__("sys").modules:
        return None
    try:
        import threading
        import httpx
        from .db_check import credenciales
        url, key = credenciales()
        if not (url and key):
            return None
        from .providers import verificacion_ssl
        cli = httpx.Client(base_url=url.rstrip("/") + "/rest/v1", headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                           timeout=10, verify=verificacion_ssl())

        def enviar(f: dict) -> None:
            if f["via"] == "reglas_cliente":
                return
            fila = {"student_id": f["usuario"] or None, "session_id": f["sesion"] or None, "via": f["via"], "tokens": f["tokens"],
                    "provider": f["proveedor"] or None, "model": f["modelo"] or None, "tier": f["nivel"] or None, "orchestration": f["orquestacion"] or None}

            def _post():
                try:
                    cli.post("/agent_queries", json=fila).raise_for_status()
                except Exception:       # noqa: BLE001  (p. ej. la migración 2 aún no se ejecutó)
                    pass
            threading.Thread(target=_post, daemon=True).start()
        return enviar
    except Exception:       # noqa: BLE001
        return None


class Registro:
    def __init__(self, path: Path | None = None, espejo=None):
        self.path = Path(path or BASE / "data" / "registro.db")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.con = sqlite3.connect(self.path, check_same_thread=False)
        self.con.execute("""CREATE TABLE IF NOT EXISTS consultas(
            id INTEGER PRIMARY KEY, t REAL, sesion TEXT, usuario TEXT, via TEXT, tokens INTEGER, proveedor TEXT, modelo TEXT, nivel TEXT, orquestacion TEXT)""")
        self.espejo = espejo      # función opcional (dict) → None que copia la fila a Supabase

    def anotar(self, via: str, sesion: str = "", usuario: str = "", tokens: int = 0, proveedor: str = "", modelo: str = "", nivel: str = "", orquestacion: str = "") -> None:
        fila = dict(t=time.time(), sesion=sesion, usuario=usuario, via=via, tokens=int(tokens or 0), proveedor=proveedor, modelo=modelo, nivel=nivel, orquestacion=orquestacion)
        self.con.execute("INSERT INTO consultas(t,sesion,usuario,via,tokens,proveedor,modelo,nivel,orquestacion) VALUES(:t,:sesion,:usuario,:via,:tokens,:proveedor,:modelo,:nivel,:orquestacion)", fila)
        self.con.commit()
        if self.espejo:
            try:
                self.espejo(fila)
            except Exception:       # noqa: BLE001  el espejo nunca debe romper una respuesta
                pass

    def estadisticas(self, usuario: str | None = None) -> dict:
        w, a = ("WHERE usuario=?", (usuario,)) if usuario else ("", ())
        filas = dict(self.con.execute(f"SELECT via, COUNT(*) FROM consultas {w} GROUP BY via", a).fetchall())
        tokens = self.con.execute(f"SELECT COALESCE(SUM(tokens),0) FROM consultas {w}", a).fetchone()[0]
        total = sum(v for k, v in filas.items() if k != "cancelado")
        sin = sum(v for k, v in filas.items() if k in SIN_TOKENS)
        return {"total": total, "sin_tokens": sin, "con_modelo": filas.get("llm", 0), "sin_cupo": filas.get("sin_cupo", 0), "cancelado": filas.get("cancelado", 0),
                "pct_sin_tokens": round(100 * sin / total, 1) if total else 0.0, "tokens": int(tokens), "por_via": filas,
                "tokens_por_pregunta_llm": round(tokens / filas["llm"]) if filas.get("llm") else 0}
