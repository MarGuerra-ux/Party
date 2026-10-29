"""Lanzador local de Party (solo biblioteca estándar: no necesita instalar nada).

Un navegador no puede abrir programas en tu PC. Este proceso pequeño queda corriendo (puerto 8786) y la sección
"Agentes IA" de Party le pide encender/apagar el agente (puerto 8787) y leer su consola en vivo.

Seguridad: escucha SOLO en 127.0.0.1 y solo acepta una lista cerrada de comandos (no hay terminal libre):
  ayuda · estado · iniciar · detener · reiniciar · verificar · probar · db_check · tests · limpiar

Uso:   python launcher.py            (o doble clic en iniciar_launcher.bat)
       python launcher.py --auto     (además enciende el agente al arrancar)
"""
from __future__ import annotations
import collections
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

AQUI = Path(__file__).resolve().parent
PUERTO = int(os.getenv("PARTY_LAUNCHER_PORT", "8786"))
PUERTO_AGENTE = int(os.getenv("PARTY_AGENT_PORT", "8787"))
LOG: collections.deque = collections.deque(maxlen=3000)
_seq = 0
_lock = threading.Lock()
PROC: subprocess.Popen | None = None
DESDE: float | None = None
FLAGS = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0

COMANDOS = {
    "ayuda": "Muestra esta lista.",
    "estado": "Estado del agente y de sus proveedores.",
    "iniciar": "Enciende el agente (puerto %d)." % PUERTO_AGENTE,
    "detener": "Apaga el agente.",
    "reiniciar": "Apaga y vuelve a encender el agente.",
    "verificar": "Comprueba las claves y los modelos (no gasta tokens).",
    "probar": "Prueba de punta a punta con los proveedores reales (gasta unos pocos tokens).",
    "db_check": "Revisa las tablas de Supabase.",
    "tests": "Ejecuta las pruebas automáticas del agente (sin claves).",
    "limpiar": "Limpia la consola.",
}
ALIAS = {"start": "iniciar", "stop": "detener", "restart": "reiniciar", "status": "estado", "help": "ayuda", "clear": "limpiar", "?": "ayuda"}


RUIDO = ("GET /health", "GET /uso", "GET /agentes", "GET /semantico", "GET /estadisticas", "OPTIONS /")   # sondeos de la propia pantalla


def log(txt: str, origen: str = "launcher"):
    global _seq
    if origen == "agente" and any(r in str(txt) for r in RUIDO):
        return
    with _lock:
        for linea in str(txt).replace("\r", "").split("\n"):
            if linea.strip() == "" and not txt.strip():
                continue
            _seq += 1
            LOG.append({"n": _seq, "t": time.strftime("%H:%M:%S"), "o": origen, "txt": linea.rstrip()})


def _lector(proc: subprocess.Popen, origen: str):
    try:
        for linea in proc.stdout:           # type: ignore[union-attr]
            log(linea, origen)
    finally:
        rc = proc.wait()
        log(f"[{origen}] terminó (código {rc}).")


def corriendo() -> bool:
    return PROC is not None and PROC.poll() is None


_SIN_PROXY = urllib.request.build_opener(urllib.request.ProxyHandler({}))      # el agente es local: nunca pasar por el proxy de Windows/antivirus


def salud() -> dict | None:
    try:
        with _SIN_PROXY.open(f"http://127.0.0.1:{PUERTO_AGENTE}/health", timeout=1.0) as r:
            return json.loads(r.read())
    except Exception:
        return None


def _env():
    e = dict(os.environ)
    e["PYTHONUNBUFFERED"] = "1"
    e["PYTHONIOENCODING"] = "utf-8"
    return e


def iniciar() -> str:
    global PROC, DESDE
    if corriendo():
        return "El agente ya está encendido."
    if salud():
        return "Ya hay un agente respondiendo en el puerto %d (lo encendió otra ventana). Ciérralo para controlarlo desde aquí." % PUERTO_AGENTE
    log("Encendiendo el agente…")
    PROC = subprocess.Popen([sys.executable, "-m", "uvicorn", "party_agent.main:app", "--port", str(PUERTO_AGENTE)], cwd=AQUI, env=_env(),
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", bufsize=1, creationflags=FLAGS)
    DESDE = time.time()
    threading.Thread(target=_lector, args=(PROC, "agente"), daemon=True).start()
    return "Agente encendido (pid %d). Espera unos segundos a que cargue." % PROC.pid


def detener() -> str:
    global PROC
    if not corriendo():
        return "El agente ya estaba apagado."
    PROC.terminate()
    try:
        PROC.wait(timeout=8)
    except subprocess.TimeoutExpired:
        PROC.kill()
    PROC = None
    return "Agente apagado."


def _tarea(nombre: str, args: list[str]) -> str:
    def corre():
        log(f"$ {' '.join(['python', *args])}")
        p = subprocess.Popen([sys.executable, *args], cwd=AQUI, env=_env(), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                             encoding="utf-8", errors="replace", bufsize=1, creationflags=FLAGS)
        for linea in p.stdout:              # type: ignore[union-attr]
            log(linea, nombre)
        log(f"[{nombre}] terminó (código {p.wait()}).")
    threading.Thread(target=corre, daemon=True).start()
    return f"Ejecutando «{nombre}»… el resultado aparece abajo."


def estado() -> dict:
    h = salud()
    return {"launcher": True, "puerto_launcher": PUERTO, "puerto_agente": PUERTO_AGENTE, "python": sys.version.split()[0],
            "proceso": corriendo(), "pid": PROC.pid if corriendo() else None, "desde": DESDE if corriendo() else None,
            "agente_responde": h is not None, "health": h}


def comando(texto: str) -> str:
    cmd = ALIAS.get((texto or "").strip().lower(), (texto or "").strip().lower())
    if cmd not in COMANDOS:
        return f"No conozco «{texto}». Escribe «ayuda» para ver los comandos disponibles."
    log(f"> {cmd}", "tú")
    if cmd == "ayuda":
        return "\n".join(f"  {k:<10} {v}" for k, v in COMANDOS.items())
    if cmd == "estado":
        e = estado()
        return (f"Lanzador: activo (puerto {e['puerto_launcher']}) · Python {e['python']}\n"
                f"Agente: {'ENCENDIDO' if e['agente_responde'] else ('arrancando…' if e['proceso'] else 'apagado')}"
                + (f"\nClaves: {', '.join(k for k, v in (e['health'] or {}).get('claves', {}).items() if v) or 'ninguna'}" if e["health"] else ""))
    if cmd == "iniciar":
        return iniciar()
    if cmd == "detener":
        return detener()
    if cmd == "reiniciar":
        detener()
        time.sleep(0.8)
        return iniciar()
    if cmd == "verificar":
        return _tarea("verificar", ["-m", "party_agent.verificar"])
    if cmd == "probar":
        return _tarea("probar", ["-m", "party_agent.probar"])
    if cmd == "db_check":
        return _tarea("db_check", ["-m", "party_agent.db_check"])
    if cmd == "tests":
        return _tarea("tests", ["-m", "pytest", "tests", "-q", "-W", "ignore"])
    if cmd == "limpiar":
        with _lock:
            LOG.clear()
        return "Consola limpia."
    return ""


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):  # silencio
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/status":
            return self._json(estado())
        if u.path == "/logs":
            desde = int((parse_qs(u.query).get("since") or ["0"])[0] or 0)
            with _lock:
                ls = [x for x in LOG if x["n"] > desde]
                ultimo = _seq
            return self._json({"lineas": ls, "ultimo": ultimo})
        if u.path == "/comandos":
            return self._json(COMANDOS)
        self._json({"error": "no existe"}, 404)

    def do_POST(self):
        u = urlparse(self.path)
        n = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            body = {}
        if u.path in ("/start", "/stop", "/restart"):
            return self._json({"mensaje": comando({"/start": "iniciar", "/stop": "detener", "/restart": "reiniciar"}[u.path])})
        if u.path == "/cmd":
            return self._json({"mensaje": comando(str(body.get("cmd", "")))})
        self._json({"error": "no existe"}, 404)


def main():
    log(f"Lanzador de Party activo en http://127.0.0.1:{PUERTO}. Abre la sección «Agentes IA» y pulsa «Conectar».")
    if "--auto" in sys.argv:
        log(iniciar())
    srv = ThreadingHTTPServer(("127.0.0.1", PUERTO), H)
    print(f"Lanzador de Party en http://127.0.0.1:{PUERTO}  (Ctrl+C para cerrar; también apaga el agente)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        detener()


if __name__ == "__main__":
    main()
