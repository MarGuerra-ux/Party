"""Servidor falso compatible con OpenAI para probar el agente sin claves ni internet."""
from __future__ import annotations
import json
import threading
import time

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()
LLAMADAS: list[dict] = []   # registro de lo que recibió el "proveedor"


def _tool(nombre, args, i=0):
    return {"id": f"call_{nombre}_{i}", "type": "function", "function": {"name": nombre, "arguments": json.dumps(args)}}


@app.get("/v1/models")
async def modelos():
    return {"data": [{"id": "llama-3.1-8b-instant"}, {"id": "gemini-2.5-flash"}]}


VOCES = ["mensaje", "rechaz", "cola", "fallid", "reint", "exchange", "organiz", "nivel", "jerarq", "sql", "tabla", "norma", "prueba"]
SINONIMOS = {"jerarquia": "organiz", "niveles": "nivel", "errores": "fallid", "fallidos": "fallid", "reintentar": "reint"}


def _emb(texto: str) -> list[float]:
    """Embedding falso 'semántico': agrupa sinónimos en la misma dimensión (para probar que se recupera por significado)."""
    import hashlib, math, re
    v = [0.0] * 768
    for w in re.findall(r"[a-záéíóúñ]+", texto.lower()):
        w = SINONIMOS.get(w, w)
        k = next((i for i, x in enumerate(VOCES) if w.startswith(x)), None)
        idx = k if k is not None else 20 + int.from_bytes(hashlib.md5(w.encode()).digest()[:2], "big") % 700
        v[idx] += 1.0
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


EMBEDDINGS_FALLAN = {"si": False}
LLAMADAS_EMB: list[int] = []


@app.post("/v1/embeddings")
async def embeddings(req: Request):
    body = await req.json()
    if EMBEDDINGS_FALLAN["si"]:
        return JSONResponse({"error": "cuota"}, status_code=429)
    entradas = body["input"] if isinstance(body["input"], list) else [body["input"]]
    LLAMADAS_EMB.append(len(entradas))
    dim = body.get("dimensions", 768)
    return {"data": [{"index": i, "embedding": _emb(t)[:dim]} for i, t in enumerate(entradas)], "usage": {"total_tokens": sum(len(t) // 4 for t in entradas)}}


@app.post("/v1/chat/completions")
async def chat(req: Request):
    body = await req.json()
    LLAMADAS.append(body)
    modelo = body["model"]
    msgs = body["messages"]
    if modelo == "limitado":
        return JSONResponse({"error": "rate limit"}, status_code=429, headers={"retry-after": "30"})
    if modelo == "caido":
        return JSONResponse({"error": "boom"}, status_code=500)
    sistema = msgs[0]["content"] if isinstance(msgs[0]["content"], str) else ""
    usuario = next((m["content"] for m in reversed(msgs) if m["role"] == "user"), "")
    usuario = usuario if isinstance(usuario, str) else usuario[0]["text"]
    cabeceras = {"x-ratelimit-remaining-tokens": "5000", "x-ratelimit-limit-tokens": "6000"}

    def ok(contenido="", tool_calls=None, entrada=120, salida=40):
        msg = {"role": "assistant", "content": contenido}
        if tool_calls:
            msg["tool_calls"] = tool_calls
        return JSONResponse({"choices": [{"message": msg}], "usage": {"prompt_tokens": entrada, "completion_tokens": salida, "total_tokens": entrada + salida}}, headers=cabeceras)

    if modelo == "vacio":
        return ok("")
    if "planificador" in sistema:
        plan = {"objetivo": "Organizar la semana", "pasos": [
            {"n": 1, "accion": "Revisar fecha y calendario", "prioridad": "alta", "herramienta": "consultar_calendario"},
            {"n": 2, "accion": "Detectar conflictos de la prueba", "prioridad": "alta", "herramienta": "detectar_conflictos"},
            {"n": 3, "accion": "Proponer eventos", "prioridad": "media", "herramienta": "proponer_evento"}]}
        return ok(json.dumps(plan), entrada=200, salida=120)
    if body.get("tools") and "organiza" in usuario.lower():
        n_tools = sum(1 for m in msgs if m["role"] == "tool")
        if n_tools == 0:
            return ok(tool_calls=[_tool("fecha_actual", {})])
        if n_tools == 1:
            return ok(tool_calls=[_tool("detectar_conflictos", {"fecha": "2026-10-24"}), _tool("consultar_calendario", {}, 1)])
        if n_tools == 3:
            return ok(tool_calls=[_tool("proponer_evento", {"titulo": "Entrega informe", "fecha": "2026-10-23", "tipo": "entrega"})])
        return ok("Plan: el 24 ya tienes una prueba, así que adelanté la entrega al viernes 23. Propuse agregarla al calendario.", entrada=300, salida=90)
    sist_texto = sistema
    if "recuerdos-eco" in usuario:
        return ok("Sistema vio: " + sist_texto[-200:])
    return ok("Respuesta de " + modelo)


class Servidor:
    def __init__(self, port: int):
        self.port = port
        self.server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error"))
        self.hilo = threading.Thread(target=self.server.run, daemon=True)

    def iniciar(self):
        self.hilo.start()
        for _ in range(100):
            if self.server.started:
                return
            time.sleep(0.05)

    def detener(self):
        self.server.should_exit = True
