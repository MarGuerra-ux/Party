"""IE3: las tres memorias del curso (buffer, window, summary) y su efecto en el prompt."""
import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_agente import CTX, nuevo  # noqa: E402
from fake_provider import LLAMADAS  # noqa: E402


def conversar(ag, n, estrategia, sesion="m1"):
    for i in range(n):
        asyncio.run(ag.ejecutar(sesion, "u1", f"Cuéntame sobre el tema número {i} de la materia", CTX, estrategia=estrategia))


def test_buffer_conserva_todo_window_olvida(tmp_path):
    ag = nuevo(tmp_path)
    conversar(ag, 5, "buffer")
    assert len(ag.memoria.historial("m1", 2, "buffer")) == 10        # recuerda las 5 vueltas
    assert len(ag.memoria.historial("m1", 2, "window")) == 4         # k=2: olvidó las 3 primeras (demo del notebook con k=1)
    assert "tema número 0" in ag.memoria.historial("m1", 2, "buffer")[0]["content"]
    assert all("tema número 0" not in m["content"] for m in ag.memoria.historial("m1", 2, "window"))


def test_summary_resume_lo_antiguo_y_lo_inyecta(tmp_path):
    ag = nuevo(tmp_path)
    conversar(ag, 5, "summary")
    res = ag.memoria.resumen("m1")
    assert res, "debería existir un resumen tras varias vueltas"
    assert len(ag.memoria.historial("m1", 6, "summary")) == 4        # solo los 2 últimos turnos + resumen
    n0 = len(LLAMADAS)
    e = asyncio.run(ag.ejecutar("m1", "u1", "recuerdos-eco ¿de qué hablábamos?", CTX, estrategia="summary"))
    sistema = LLAMADAS[n0]["messages"][0]["content"]
    assert "Resumen de la conversación anterior" in sistema
    assert e["estrategia"] == "summary" and e["resumen"] == res


def test_resumen_extractivo_no_gasta_tokens():
    from party_agent.memoria import Memoria
    r = Memoria.resumen_extractivo("", [(1, "user", "¿Qué es un DLX?"), (2, "assistant", "Un exchange…"), (3, "user", "¿Y una DLQ?"), (4, "assistant", "Una cola…")])
    assert "DLX" in r and "DLQ" in r


def test_estrategia_invalida_cae_a_ventana(tmp_path):
    ag = nuevo(tmp_path)
    e = asyncio.run(ag.ejecutar("m2", "u1", "hola de nuevo, cuéntame algo", CTX, estrategia="loquesea"))
    assert e["estrategia"] == "window"


def test_equipo_crewai_tambien_usa_la_memoria_de_resumen(tmp_path):
    import pytest
    pytest.importorskip("crewai")
    from party_agent.equipo import Equipo
    ag = nuevo(tmp_path)
    conversar(ag, 4, "summary", "m3")
    r = asyncio.run(Equipo(ag).ejecutar("serial", "m3", "u1", "¿cómo me conviene organizar el informe de BDD?", CTX, "summary"))
    assert r["modo"] == "llm" and ag.memoria.resumen("m3")
