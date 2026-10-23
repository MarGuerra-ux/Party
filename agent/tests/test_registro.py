"""IE7: métrica de preguntas resueltas sin tokens."""
import os, sys
from pathlib import Path
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_agente import CTX, servidor  # noqa: F401,E402
os.environ["PARTY_MODELOS"] = str(Path(__file__).parent / "modelos_test.yaml")
from fastapi.testclient import TestClient  # noqa: E402
from party_agent.registro import Registro  # noqa: E402


def test_porcentaje_sin_tokens(tmp_path):
    r = Registro(tmp_path / "r.db")
    for _ in range(3): r.anotar("reglas")
    r.anotar("reglas_cliente"); r.anotar("llm", tokens=900, proveedor="groq", modelo="x"); r.anotar("cancelado")
    e = r.estadisticas()
    assert e["total"] == 5 and e["sin_tokens"] == 4 and e["pct_sin_tokens"] == 80.0 and e["tokens"] == 900 and e["tokens_por_pregunta_llm"] == 900
    assert e["cancelado"] == 1                       # una consulta cancelada no cuenta en el total


def test_vacio_no_divide_por_cero(tmp_path):
    assert Registro(tmp_path / "r.db").estadisticas()["pct_sin_tokens"] == 0.0


def test_el_espejo_no_rompe_si_falla(tmp_path):
    def mal(f): raise RuntimeError("supabase caído")
    r = Registro(tmp_path / "r.db", espejo=mal); r.anotar("reglas")
    assert r.estadisticas()["total"] == 1


def test_endpoints_registran_reglas_llm_y_cliente(tmp_path, monkeypatch):
    from party_agent import main
    main.registro = Registro(tmp_path / "r.db")
    c = TestClient(main.app)
    c.post("/plan", json={"pregunta": "¿qué clases tengo hoy?", "contexto": CTX, "usuario": "u9"})
    p = c.post("/plan", json={"pregunta": "¿cómo me conviene organizar el informe de BDD?", "contexto": CTX, "usuario": "u9"}).json()
    c.post("/run", json={"plan_id": p["plan_id"]})
    assert c.post("/registro", json={"via": "reglas_cliente", "usuario": "u9"}).json()["ok"]
    assert c.post("/registro", json={"via": "llm"}).status_code == 400     # el navegador no puede inventar consumo de tokens
    e = c.get("/estadisticas").json()
    assert e["total"] == 3 and e["sin_tokens"] == 2 and e["con_modelo"] == 1 and e["tokens"] > 0
