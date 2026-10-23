"""Equipo CrewAI (serial y jerárquico) contra el servidor falso: no usa claves ni internet."""
import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
pytest.importorskip("crewai")
from test_agente import CTX, nuevo, servidor  # noqa: E402,F401  (servidor: arranca el proveedor falso)
from fake_provider import LLAMADAS  # noqa: E402
from party_agent.equipo import Equipo, construir_herramientas  # noqa: E402


def correr(tmp_path, modo, pregunta="¿cómo me conviene organizar el informe de BDD?"):
    ag = nuevo(tmp_path)
    return asyncio.run(Equipo(ag).ejecutar(modo, "s1", "u1", pregunta, CTX))


@pytest.mark.parametrize("modo", ["serial", "jerarquico"])
def test_equipo_responde_y_cuenta_tokens(tmp_path, modo):
    n0 = len(LLAMADAS)
    r = correr(tmp_path, modo)
    assert r["modo"] == "llm", (r["errores"], r["traza"])
    assert r["respuesta"]
    assert r["llamadas"][0]["etapa"] == f"crew-{modo}"
    assert r["llamadas"][0]["total"] > 0
    assert len(LLAMADAS) - n0 >= 3          # al menos un llamado por agente


def test_jerarquico_usa_mas_llamadas_que_serial(tmp_path):
    a = len(LLAMADAS); correr(tmp_path, "serial"); serial = len(LLAMADAS) - a
    b = len(LLAMADAS); correr(tmp_path, "jerarquico"); jer = len(LLAMADAS) - b
    assert jer > serial


def test_reglas_siguen_primero_con_cero_tokens(tmp_path):
    n0 = len(LLAMADAS)
    r = correr(tmp_path, "serial", "¿qué clases tengo hoy?")
    assert r["modo"] == "reglas" and not r["llamadas"] and len(LLAMADAS) == n0


def test_herramientas_crewai_tienen_esquema_descrito():
    from crewai.tools import BaseTool
    t = construir_herramientas(BaseTool, CTX, {"acciones": [], "memoria_guardada": []}, None, "u")
    assert "fecha_actual" not in t                       # sin parámetros: la fecha va por inputs
    for nombre, h in t.items():
        for campo in h.args_schema.model_fields.values():
            assert campo.description, f"{nombre}: argumento sin descripción"
    assert "Valores: prueba" in t["proponer_evento"].args_schema.model_fields["tipo"].description
    out = t["detectar_conflictos"]._run(fecha="2026-10-24")
    assert "hay_conflicto" in out
    assert "error" in t["detectar_conflictos"]._run(fecha="basura")   # nunca lanza excepción
