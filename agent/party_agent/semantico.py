"""Recuperación semántica (IE4): embeddings + búsqueda por similitud.

  texto → trozos (~700 caracteres) → embedding de 768 números → similitud coseno con la pregunta.

Dos proveedores de vectores, siempre del MISMO modelo al comparar:
  · gemini-embedding-001 (768 dim, API compatible con OpenAI)  → semántico real ("jerarquía" ≈ "organización por niveles")
  · local-hash-768 (respaldo sin red ni claves)                  → léxico con raíces de palabras; NO entiende sinónimos

Dónde se guardan los vectores:
  · Material de la Biblioteca (vive en el navegador): índice SQLite del agente (data/vectores.db), por huella del texto,
    así un archivo sin cambios nunca se vuelve a embeber (ahorra cupo).
  · Apuntes (viven en Supabase): tabla note_chunks con pgvector + función match_note_chunks (si Supabase responde);
    si no, el mismo índice SQLite.
"""
from __future__ import annotations
import hashlib
import json
import logging
import math
import re
import sqlite3
import time
from pathlib import Path

import httpx

from .config import BASE, Config
from .providers import verificacion_ssl
from .util import sin_acentos

log = logging.getLogger("party.semantico")
DIM = 768
LOCAL = "local-hash-768"
LARGO_TROZO = 700
MAX_NUEVOS_POR_CONSULTA = 150      # protege el cupo gratuito: lo demás se indexa en las consultas siguientes
LOTE = 64
_STOP = set("de la el los las un una unos unas y o que en a por para con del al se mi tu es son fue ser como mas muy ya no si lo le les me te sobre cual cuales".split())


# ---------------------------------------------------------------- trozos
def trozos(texto: str, largo: int = LARGO_TROZO) -> list[str]:
    out, i = [], 0
    texto = re.sub(r"\s+", " ", texto or "").strip()
    while i < len(texto):
        j = min(len(texto), i + largo)
        if j < len(texto):
            k = texto.rfind(" ", i + largo // 2, j)
            j = k if k > 0 else j
        out.append(texto[i:j].strip())
        i = j
    return [t for t in out if t]


# ---------------------------------------------------------------- embeddings
class EmbError(Exception):
    pass


def _norm(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def vector_local(texto: str) -> list[float]:
    """Feature hashing: palabras (raíz de 5 letras) + pares de palabras → 768 dimensiones. Determinista, sin red."""
    pal = [w for w in re.findall(r"[a-z0-9]+", sin_acentos(texto)) if w not in _STOP and len(w) > 2]
    raices = [w[:5] for w in pal]
    v = [0.0] * DIM
    for t, peso in [(r, 1.0) for r in raices] + [(a + "_" + b, 0.7) for a, b in zip(raices, raices[1:])]:
        h = int.from_bytes(hashlib.md5(t.encode()).digest()[:8], "big")
        v[h % DIM] += peso * (1 if (h >> 40) & 1 else -1)
    return _norm(v)


class Embedder:
    """Gemini (compatible con OpenAI) con enfriamiento tras un fallo, y respaldo local."""

    def __init__(self, cfg: Config, meter=None, transport=None):
        self.cfg, self.meter, self.transport = cfg, meter, transport
        e = getattr(cfg, "embeddings", None) or {}
        self.proveedor = e.get("proveedor", "gemini")
        self.modelo = e.get("modelo", "gemini-embedding-001")
        self.dim = int(e.get("dimensiones", DIM))
        self.umbral = float(e.get("umbral", 0.45))        # similitud mínima con embeddings reales (calibrar con tus datos)
        self.hasta = 0.0
        self.ultimo_error = ""

    @property
    def remoto_disponible(self) -> bool:
        return self.cfg.tiene_clave(self.proveedor) and time.time() >= self.hasta

    def _remoto(self, textos: list[str]) -> list[list[float]]:
        url = self.cfg.base_url(self.proveedor) + "/embeddings"
        h = {"Authorization": f"Bearer {self.cfg.api_key(self.proveedor)}", "Content-Type": "application/json"}
        out: list[list[float]] = []
        usados = 0
        with httpx.Client(timeout=20, verify=verificacion_ssl(), transport=self.transport) as c:
            for i in range(0, len(textos), LOTE):
                r = c.post(url, headers=h, json={"model": self.modelo, "input": textos[i:i + LOTE], "dimensions": self.dim})
                if r.status_code != 200:
                    raise EmbError(f"{self.proveedor} respondió {r.status_code}: {r.text[:160]}")
                d = r.json()
                vs = [x["embedding"] for x in sorted(d["data"], key=lambda x: x.get("index", 0))]
                if len(vs) != len(textos[i:i + LOTE]) or any(len(v) != self.dim for v in vs):
                    raise EmbError(f"El modelo devolvió {len(vs[0]) if vs else 0} dimensiones y la base espera {self.dim}.")
                out += [_norm(v) for v in vs]
                usados += int((d.get("usage") or {}).get("total_tokens") or sum(len(t) for t in textos[i:i + LOTE]) // 4)
        if self.meter:
            self.meter.registrar(self.proveedor, self.modelo, usados, None)
        return out

    def embed(self, textos: list[str]) -> tuple[list[list[float]], str]:
        """→ (vectores, nombre del modelo usado)."""
        if textos and self.remoto_disponible:
            try:
                return self._remoto(textos), self.modelo
            except (httpx.HTTPError, EmbError, KeyError, ValueError) as e:
                self.ultimo_error = f"{type(e).__name__}: {str(e)[:200]}"
                self.hasta = time.time() + 120          # no insistir durante 2 minutos
                log.warning("Embeddings remotos fallaron (%s); uso el respaldo local.", self.ultimo_error)
        return [vector_local(t) for t in textos], LOCAL


def coseno(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


# ---------------------------------------------------------------- índice local (SQLite)
class Indice:
    def __init__(self, emb: Embedder, path: Path | None = None):
        self.emb = emb
        self.path = Path(path or BASE / "data" / "vectores.db")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.con = sqlite3.connect(self.path, check_same_thread=False)
        self.con.executescript("""CREATE TABLE IF NOT EXISTS vectores(
            fuente TEXT, doc TEXT, tramo INTEGER, huella TEXT, modelo TEXT, texto TEXT, vec TEXT,
            PRIMARY KEY(fuente, doc, tramo, modelo));""")

    @staticmethod
    def _huella(t: str) -> str:
        return hashlib.sha1(t.encode("utf-8")).hexdigest()[:16]

    def asegurar(self, fuente: str, docs: list[dict]) -> dict:
        """Embebe los trozos nuevos o cambiados. docs: [{id, texto}]. Devuelve estadísticas."""
        pendientes: list[tuple[str, int, str, str]] = []   # (doc, tramo, huella, texto)
        existentes = {(d, t, m): h for d, t, m, h in self.con.execute("SELECT doc,tramo,modelo,huella FROM vectores WHERE fuente=?", (fuente,))}
        modelo_previsto = self.emb.modelo if self.emb.remoto_disponible else LOCAL
        for d in docs:
            for n, t in enumerate(trozos(d.get("texto", "")), 1):
                h = self._huella(t)
                if existentes.get((str(d["id"]), n, modelo_previsto)) != h:
                    pendientes.append((str(d["id"]), n, h, t))
        cambiados = sorted({p[0] for p in pendientes[:MAX_NUEVOS_POR_CONSULTA]})
        total_pend = len(pendientes)
        pendientes = pendientes[:MAX_NUEVOS_POR_CONSULTA]
        if pendientes:
            vs, modelo = self.emb.embed([p[3] for p in pendientes])
            self.con.executemany("INSERT OR REPLACE INTO vectores VALUES(?,?,?,?,?,?,?)",
                                 [(fuente, d, n, h, modelo, t, json.dumps([round(x, 5) for x in v])) for (d, n, h, t), v in zip(pendientes, vs)])
            self.con.commit()
        return {"nuevos": len(pendientes), "pendientes_restantes": max(0, total_pend - len(pendientes)), "modelo": modelo_previsto, "cambiados": cambiados}

    def vectores_de(self, fuente: str, doc: str, modelo: str) -> list[tuple[int, str, list[float]]]:
        return [(n, t, json.loads(v)) for n, t, v in self.con.execute(
            "SELECT tramo,texto,vec FROM vectores WHERE fuente=? AND doc=? AND modelo=? ORDER BY tramo", (fuente, doc, modelo))]

    def buscar(self, fuente: str, consulta: str, ids: set[str] | None = None, k: int = 4) -> tuple[list[dict], str]:
        (qv,), modelo = self.emb.embed([consulta])
        filas = self.con.execute("SELECT doc,tramo,texto,vec FROM vectores WHERE fuente=? AND modelo=?", (fuente, modelo)).fetchall()
        res = []
        for doc, tramo, texto, vec in filas:
            if ids is not None and doc not in ids:
                continue
            res.append((coseno(qv, json.loads(vec)), doc, tramo, texto))
        res.sort(key=lambda x: -x[0])
        minimo = 0.12 if modelo == LOCAL else self.emb.umbral
        return [{"id": d, "tramo": t, "fragmento": tx[:420], "similitud": round(s, 3)} for s, d, t, tx in res[:k] if s >= minimo], modelo


# ---------------------------------------------------------------- pgvector en Supabase (apuntes)
class SupabaseVec:
    def __init__(self, url: str, key: str, transport=None):
        self.c = httpx.Client(base_url=url.rstrip("/") + "/rest/v1", headers={"apikey": key, "Authorization": f"Bearer {key}"},
                              timeout=15, verify=verificacion_ssl(), transport=transport)

    def sincronizar_nota(self, nota_id: str, vectores: list[tuple[int, str, list[float]]]):
        self.c.delete("/note_chunks", params={"note_id": f"eq.{nota_id}"}).raise_for_status()
        if vectores:
            filas = [{"note_id": nota_id, "chunk_index": i, "content": t, "embedding": json.dumps([round(x, 5) for x in v])} for i, t, v in vectores]
            self.c.post("/note_chunks", json=filas).raise_for_status()

    def existentes(self, ids: list[str]) -> dict[str, int]:
        if not ids:
            return {}
        r = self.c.get("/note_chunks", params={"select": "note_id,chunk_index", "note_id": "in.(" + ",".join(ids) + ")"})
        r.raise_for_status()
        cuenta: dict[str, int] = {}
        for f in r.json():
            cuenta[f["note_id"]] = cuenta.get(f["note_id"], 0) + 1
        return cuenta

    def buscar(self, qv: list[float], k: int = 4, grupo: str | None = None, umbral: float = 0.0) -> list[dict]:
        r = self.c.post("/rpc/match_note_chunks", json={"query_embedding": json.dumps([round(x, 5) for x in qv]), "match_count": k, "p_group_id": grupo})
        r.raise_for_status()
        return [{"id": f["note_id"], "fragmento": f["content"][:420], "similitud": round(float(f["similarity"]), 3)} for f in r.json() if float(f["similarity"]) >= umbral]


# ---------------------------------------------------------------- fachada que usan las herramientas
class Servicio:
    def __init__(self, cfg: Config, meter=None, indice_path: Path | None = None, emb_transport=None, supa=None):
        self.emb = Embedder(cfg, meter, emb_transport)
        self.indice = Indice(self.emb, indice_path)
        self.supa = supa              # SupabaseVec o None
        self.ultimo_aviso = ""

    @classmethod
    def desde_entorno(cls, cfg: Config, meter=None):
        supa = None
        try:
            from .db_check import credenciales
            url, key = credenciales()
            if url and key:
                supa = SupabaseVec(url, key)
        except Exception as e:      # noqa: BLE001
            log.warning("Sin Supabase para pgvector: %s", e)
        return cls(cfg, meter, supa=supa)

    def buscar(self, fuente: str, docs: list[dict], consulta: str, ids: set[str] | None = None, k: int = 4, grupo: str | None = None) -> dict:
        """docs: [{id, texto}]. → {"metodo", "resultados":[{id,tramo,fragmento,similitud}], "aviso"?}"""
        est = self.indice.asegurar(fuente, docs)
        remoto = est["modelo"] == self.emb.modelo and self.emb.remoto_disponible
        aviso = ""
        if est["pendientes_restantes"]:
            aviso = f"Indexé {est['nuevos']} fragmentos; quedan {est['pendientes_restantes']} por indexar (se completan en las próximas consultas)."
        if fuente == "apuntes" and self.supa and remoto:
            try:
                res = self._pgvector(docs, est, consulta, k, grupo)
                return {"metodo": f"pgvector · {self.emb.modelo}", "resultados": res, **({"aviso": aviso} if aviso else {})}
            except Exception as e:      # noqa: BLE001
                aviso = (aviso + " " if aviso else "") + f"pgvector no respondió ({type(e).__name__}); usé el índice local."
        res, modelo = self.indice.buscar(fuente, consulta, ids, k)
        if modelo == LOCAL:
            aviso = (aviso + " " if aviso else "") + "Sin embeddings de IA ahora: busqué por palabras (no entiende sinónimos)."
        return {"metodo": ("semántica · " if modelo != LOCAL else "") + modelo, "resultados": res, **({"aviso": aviso} if aviso else {})}

    def _pgvector(self, docs, est, consulta, k, grupo):
        ya = self.supa.existentes([str(d["id"]) for d in docs])
        a_subir = set(est["cambiados"]) | {str(d["id"]) for d in docs if ya.get(str(d["id"]), 0) == 0 and d.get("texto")}
        for doc in a_subir:
            self.supa.sincronizar_nota(doc, self.indice.vectores_de("apuntes", doc, self.emb.modelo))
        (qv,), _ = self.emb.embed([consulta])
        return self.supa.buscar(qv, k, grupo, self.emb.umbral)
