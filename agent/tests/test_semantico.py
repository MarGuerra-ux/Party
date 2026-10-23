"""IE4: recuperación semántica (embeddings + similitud), pgvector simulado y respaldo local."""
import json
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_agente import CTX, nuevo, servidor  # noqa: F401,E402
import fake_provider as fp  # noqa: E402
from party_agent import tools  # noqa: E402
from party_agent.config import Config  # noqa: E402
from party_agent.meter import Meter  # noqa: E402
from party_agent.semantico import LOCAL, Servicio, SupabaseVec, trozos, vector_local, coseno  # noqa: E402

MAT = [
    {"id": "f1", "nombre": "dlx.pdf", "asignatura": "Cloud Native", "ruta": "Cloud", "texto": "El mensaje rechazado va a la cola de mensajes fallidos para reintentar después. " * 3},
    {"id": "f2", "nombre": "sql.pdf", "asignatura": "Base de Datos", "ruta": "BDD", "texto": "La normalización de la tabla elimina dependencias en SQL. " * 3},
]


def servicio(tmp_path, supa=None):
    cfg = Config(Path(__file__).parent / "modelos_test.yaml")
    return Servicio(cfg, Meter(cfg, tmp_path / "u.json"), tmp_path / "v.db", supa=supa)


def test_trozos_cortan_en_palabras():
    t = trozos("palabra " * 300, 700)
    assert len(t) >= 3 and all(len(x) <= 700 for x in t) and all(not x.endswith("palab") for x in t)


def test_busqueda_por_significado_encuentra_sinonimos(tmp_path):
    sv = servicio(tmp_path)
    r = sv.buscar("material", [{"id": d["id"], "texto": d["texto"]} for d in MAT], "errores al reintentar")   # no comparte palabras exactas con el texto
    assert r["metodo"].startswith("semántica") and r["resultados"][0]["id"] == "f1"


def test_no_vuelve_a_embeber_lo_que_no_cambio(tmp_path):
    sv = servicio(tmp_path)
    docs = [{"id": d["id"], "texto": d["texto"]} for d in MAT]
    sv.buscar("material", docs, "cola")
    n = len(fp.LLAMADAS_EMB)
    sv.buscar("material", docs, "tabla")             # solo embebe la pregunta (1 llamada)
    assert len(fp.LLAMADAS_EMB) == n + 1 and fp.LLAMADAS_EMB[-1] == 1
    docs[0]["texto"] += " texto nuevo sobre exchange"
    sv.buscar("material", docs, "cola")
    assert fp.LLAMADAS_EMB[-2] >= 1                  # solo el trozo cambiado


def test_respaldo_local_cuando_falla_el_proveedor(tmp_path):
    fp.EMBEDDINGS_FALLAN["si"] = True
    try:
        sv = servicio(tmp_path)
        r = sv.buscar("material", [{"id": d["id"], "texto": d["texto"]} for d in MAT], "normalización de tablas SQL")
        assert r["metodo"] == LOCAL and r["resultados"][0]["id"] == "f2" and "no entiende sinónimos" in r["aviso"]
        assert sv.emb.ultimo_error and not sv.emb.remoto_disponible          # se enfría 2 minutos
    finally:
        fp.EMBEDDINGS_FALLAN["si"] = False


def test_vector_local_es_determinista_y_unitario():
    a, b = vector_local("Dead Letter Exchange"), vector_local("dead letter exchange")
    assert coseno(a, b) > 0.999 and len(a) == 768 and abs(coseno(a, a) - 1) < 1e-6


def test_dimension_incorrecta_se_rechaza(tmp_path):
    cfg = Config(Path(__file__).parent / "modelos_test.yaml")
    sv = Servicio(cfg, None, tmp_path / "v.db", emb_transport=httpx.MockTransport(lambda r: httpx.Response(200, json={"data": [{"index": 0, "embedding": [0.1] * 10}]})))
    vs, modelo = sv.emb.embed(["hola"])
    assert modelo == LOCAL and len(vs[0]) == 768


class FakePostgrest:
    """Simula note_chunks y match_note_chunks de Supabase en memoria."""
    def __init__(self):
        self.filas, self.rpc = [], 0

    def __call__(self, req: httpx.Request) -> httpx.Response:
        ruta = req.url.path
        if req.method == "DELETE":
            nid = req.url.params["note_id"].removeprefix("eq.")
            self.filas = [f for f in self.filas if f["note_id"] != nid]
            return httpx.Response(204)
        if req.method == "POST" and ruta.endswith("/note_chunks"):
            self.filas += json.loads(req.content)
            return httpx.Response(201)
        if req.method == "GET":
            ids = req.url.params["note_id"].removeprefix("in.(").removesuffix(")").split(",")
            return httpx.Response(200, json=[{"note_id": f["note_id"], "chunk_index": f["chunk_index"]} for f in self.filas if f["note_id"] in ids])
        if ruta.endswith("/rpc/match_note_chunks"):
            self.rpc += 1
            b = json.loads(req.content)
            q = json.loads(b["query_embedding"])
            pts = sorted(((coseno(q, json.loads(f["embedding"])), f) for f in self.filas), key=lambda x: -x[0])[: b["match_count"]]
            return httpx.Response(200, json=[{"id": i, "note_id": f["note_id"], "content": f["content"], "similarity": s} for i, (s, f) in enumerate(pts)])
        return httpx.Response(404)


def test_apuntes_usan_pgvector_y_sincronizan(tmp_path):
    pg = FakePostgrest()
    sv = servicio(tmp_path, SupabaseVec("http://supa", "k", transport=httpx.MockTransport(pg)))
    apuntes = [{"id": "n1", "texto": "Normalización: la tabla se separa en SQL para evitar duplicados."}, {"id": "n2", "texto": "Cola de mensajes fallidos con reintentos."}]
    r = sv.buscar("apuntes", apuntes, "mensajes con errores para reintentar", grupo="g1")
    assert r["metodo"].startswith("pgvector") and r["resultados"][0]["id"] == "n2"
    assert {f["note_id"] for f in pg.filas} == {"n1", "n2"} and pg.rpc == 1


def test_pgvector_caido_cae_al_indice_local(tmp_path):
    sv = servicio(tmp_path, SupabaseVec("http://supa", "k", transport=httpx.MockTransport(lambda r: httpx.Response(500))))
    r = sv.buscar("apuntes", [{"id": "n2", "texto": "Cola de mensajes fallidos con reintentos."}], "errores")
    assert r["resultados"][0]["id"] == "n2" and "pgvector no respondió" in r["aviso"]


def test_herramientas_usan_la_busqueda_semantica(tmp_path):
    ag = nuevo(tmp_path)
    est = {"acciones": [], "memoria_guardada": []}
    r = tools.ejecutar("buscar_material", {"consulta": "errores al reintentar"}, {**CTX, "material": MAT}, est, ag.memoria, "u")
    assert r["metodo"].startswith("semántica") and r["resultados"][0]["archivo"] == "dlx.pdf" and r["resultados"][0]["similitud"] > 0.2
    r = tools.ejecutar("buscar_apuntes", {"consulta": "forma normal"}, CTX, est, ag.memoria, "u")
    assert r["resultados"]            # con o sin semántica, devuelve algo útil
