"""API: /plan y /run con orquestación CrewAI (servidor falso)."""
import os, sys
from pathlib import Path
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parent))
pytest.importorskip("crewai")
from test_agente import CTX, servidor  # noqa: F401,E402

os.environ["PARTY_MODELOS"] = str(Path(__file__).parent / "modelos_test.yaml")
from fastapi.testclient import TestClient  # noqa: E402


@pytest.mark.parametrize("modo", ["serial", "jerarquico"])
def test_plan_y_run_con_equipo(modo, tmp_path, monkeypatch):
    monkeypatch.setenv("PARTY_DATA", str(tmp_path))
    from party_agent import main
    c = TestClient(main.app)
    p = c.post("/plan", json={"pregunta": "¿cómo me conviene organizar el informe de BDD?", "contexto": CTX, "orquestacion": modo}).json()
    assert p["modo"] == "llm" and p["orquestacion"] == modo and p["estimacion"]["maximo"] > p["estimacion"]["minimo"]
    r = c.post("/run", json={"plan_id": p["plan_id"]}).json()
    assert r["modo"] == "llm" and r["orquestacion"] == modo and r["tokens"]["total"] > 0
