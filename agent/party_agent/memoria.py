"""Memoria del agente.

Corto plazo : turnos de la conversación (por sesión), guardados en SQLite, con las 3 estrategias de los notebooks del curso
              (IL2.2): "buffer" (todo el historial), "window" (solo los últimos k turnos) y "summary" (resumen de lo antiguo
              + los últimos turnos; ahorra tokens en conversaciones largas).
Largo plazo : hechos que el usuario pide recordar ("recuerda que…") o que el agente decide guardar;
              se recuperan por coincidencia de palabras (BM25 simplificado). La recuperación con
              embeddings (pgvector) es una ampliación posterior.
"""
from __future__ import annotations
import math
import re
import sqlite3
import time
from pathlib import Path

from .config import BASE
from .util import sin_acentos

_STOP = set("de la el los las un una unos unas y o que en a por para con del al se mi tu es son fue ser como mas muy ya no si lo le les me te".split())


def _tokens(t: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9]+", sin_acentos(t)) if w not in _STOP and len(w) > 2]


class Memoria:
    def __init__(self, path: Path | None = None):
        self.path = Path(path or BASE / "data" / "memoria.db")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.con = sqlite3.connect(self.path, check_same_thread=False)
        self.con.executescript("""
            CREATE TABLE IF NOT EXISTS turnos(id INTEGER PRIMARY KEY, sesion TEXT, rol TEXT, texto TEXT, t REAL);
            CREATE TABLE IF NOT EXISTS resumenes(sesion TEXT PRIMARY KEY, texto TEXT, hasta_id INTEGER, t REAL);
            CREATE TABLE IF NOT EXISTS hechos(id INTEGER PRIMARY KEY, usuario TEXT, texto TEXT, t REAL);
        """)

    # ----- corto plazo -----
    def guardar_turno(self, sesion: str, rol: str, texto: str):
        self.con.execute("INSERT INTO turnos(sesion,rol,texto,t) VALUES(?,?,?,?)", (sesion, rol, texto[:1500], time.time()))
        self.con.commit()

    def historial(self, sesion: str, turnos: int = 6, estrategia: str = "window") -> list[dict]:
        """buffer: todo (tope de seguridad 40 turnos) · window: últimos `turnos` · summary: últimos 2 turnos (+ resumen aparte)."""
        n = {"buffer": 40, "summary": min(2, turnos)}.get(estrategia, turnos)
        filas = self.con.execute("SELECT rol,texto FROM turnos WHERE sesion=? ORDER BY id DESC LIMIT ?", (sesion, n * 2)).fetchall()
        return [{"role": r, "content": t} for r, t in reversed(filas)]

    # ----- memoria de resumen (ConversationSummaryMemory del curso) -----
    def resumen(self, sesion: str) -> str:
        f = self.con.execute("SELECT texto FROM resumenes WHERE sesion=?", (sesion,)).fetchone()
        return f[0] if f else ""

    def pendientes_de_resumir(self, sesion: str, conservar: int = 2, minimo: int = 2) -> list[tuple[int, str, str]]:
        """Turnos más antiguos que los `conservar` recientes y aún no resumidos. Vacío si hay menos de `minimo` turnos."""
        hasta = (self.con.execute("SELECT hasta_id FROM resumenes WHERE sesion=?", (sesion,)).fetchone() or (0,))[0]
        filas = self.con.execute("SELECT id,rol,texto FROM turnos WHERE sesion=? ORDER BY id", (sesion,)).fetchall()
        viejos = [f for f in filas[: max(0, len(filas) - conservar * 2)] if f[0] > hasta]
        return viejos if len(viejos) >= minimo * 2 else []

    def guardar_resumen(self, sesion: str, texto: str, hasta_id: int):
        self.con.execute("INSERT OR REPLACE INTO resumenes(sesion,texto,hasta_id,t) VALUES(?,?,?,?)", (sesion, texto[:1200], hasta_id, time.time()))
        self.con.commit()

    @staticmethod
    def resumen_extractivo(previo: str, filas: list[tuple[int, str, str]]) -> str:
        """Resumen SIN modelo (0 tokens): conserva el arranque de cada pregunta del usuario. Respaldo si no hay IA disponible."""
        temas = [t.strip().replace("\n", " ")[:90] for _, rol, t in filas if rol == "user"]
        return ((previo + " | ") if previo else "") + "El usuario preguntó: " + "; ".join(temas)

    # ----- largo plazo -----
    def recordar(self, usuario: str, texto: str) -> int:
        existe = self.con.execute("SELECT id FROM hechos WHERE usuario=? AND texto=?", (usuario, texto)).fetchone()
        if existe:
            return existe[0]
        cur = self.con.execute("INSERT INTO hechos(usuario,texto,t) VALUES(?,?,?)", (usuario, texto[:500], time.time()))
        self.con.commit()
        return cur.lastrowid

    def buscar(self, usuario: str, consulta: str, k: int = 3) -> list[str]:
        filas = self.con.execute("SELECT texto FROM hechos WHERE usuario=?", (usuario,)).fetchall()
        q = set(_tokens(consulta))
        if not q or not filas:
            return []
        docs = [(t, _tokens(t)) for (t,) in filas]
        n = len(docs)
        idf = {w: math.log(1 + n / (1 + sum(w in d for _, d in docs))) for w in q}
        puntuados = sorted(((sum(idf[w] for w in q if w in set(d)), t) for t, d in docs), reverse=True)
        return [t for p, t in puntuados[:k] if p > 0]

    def todos(self, usuario: str) -> list[str]:
        return [t for (t,) in self.con.execute("SELECT texto FROM hechos WHERE usuario=? ORDER BY id DESC LIMIT 50", (usuario,))]
