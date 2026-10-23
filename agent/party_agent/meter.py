"""Medidor de tokens por proveedor.

Tres estados de información (nunca se inventa un dato):
  * uso propio  → lo que devolvió cada respuesta (siempre disponible).
  * límite      → el configurado en modelos.yaml (se muestra como "configurado").
  * real        → cabeceras x-ratelimit-* cuando el proveedor las envía (p. ej. Groq).
"""
from __future__ import annotations
import json
import threading
import time
from pathlib import Path

from .config import BASE, Config

DIAS_RETENCION = 32


class Meter:
    def __init__(self, cfg: Config, path: Path | None = None):
        self.cfg = cfg
        self.path = Path(path or BASE / "data" / "uso.json")
        self.lock = threading.Lock()
        self.eventos: list[dict] = []     # {t, proveedor, modelo, tokens}
        self.real: dict[str, dict] = {}   # última lectura de cabeceras por proveedor
        self.enfriamiento: dict[str, float] = {}  # "prov|modelo" o "prov" → hasta cuándo
        self._cargar()

    # ---------- persistencia ----------
    def _cargar(self):
        try:
            d = json.loads(self.path.read_text(encoding="utf-8"))
            self.eventos = d.get("eventos", [])
            self.real = d.get("real", {})
        except Exception:
            pass
        self._podar()

    def _guardar(self):
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps({"eventos": self.eventos, "real": self.real}), encoding="utf-8")
        except Exception:
            pass

    def _podar(self):
        corte = time.time() - DIAS_RETENCION * 86400
        self.eventos = [e for e in self.eventos if e["t"] >= corte]

    # ---------- registro ----------
    def registrar(self, proveedor: str, modelo: str, tokens: int, cabeceras: dict | None = None):
        with self.lock:
            self.eventos.append({"t": time.time(), "proveedor": proveedor, "modelo": modelo, "tokens": int(tokens or 0)})
            real = self._leer_cabeceras(cabeceras or {})
            if real:
                self.real[proveedor] = {**real, "t": time.time()}
            self._podar()
            self._guardar()

    @staticmethod
    def _leer_cabeceras(h: dict) -> dict:
        h = {k.lower(): v for k, v in h.items()}
        out = {}
        for clave, destino in (("x-ratelimit-remaining-tokens", "tokens_restantes"), ("x-ratelimit-limit-tokens", "tokens_limite"),
                               ("x-ratelimit-remaining-requests", "peticiones_restantes"), ("x-ratelimit-limit-requests", "peticiones_limite")):
            if clave in h:
                try:
                    out[destino] = int(float(h[clave]))
                except ValueError:
                    pass
        for clave, destino in (("x-ratelimit-reset-tokens", "renueva_tokens"), ("x-ratelimit-reset-requests", "renueva_peticiones")):
            if clave in h:
                out[destino] = h[clave]
        return out

    def usado(self, proveedor: str, segundos: int) -> tuple[int, int]:
        """(tokens, peticiones) usados en la ventana."""
        corte = time.time() - segundos
        ev = [e for e in self.eventos if e["proveedor"] == proveedor and e["t"] >= corte]
        return sum(e["tokens"] for e in ev), len(ev)

    # ---------- disponibilidad ----------
    def enfriar(self, clave: str, segundos: float):
        self.enfriamiento[clave] = time.time() + max(1.0, min(segundos, 3600))

    def enfriando(self, proveedor: str, modelo: str | None = None) -> bool:
        ahora = time.time()
        for k in (proveedor, f"{proveedor}|{modelo}"):
            if self.enfriamiento.get(k, 0) > ahora:
                return True
        return False

    def alcanza(self, proveedor: str, tokens_estimados: int) -> bool:
        """False si, según los límites configurados, esta llamada los superaría."""
        for v in self.cfg.ventanas(proveedor):
            t, p = self.usado(proveedor, v["segundos"])
            if v.get("tokens") and t + tokens_estimados > v["tokens"]:
                return False
            if v.get("peticiones") and p + 1 > v["peticiones"]:
                return False
        real = self.real.get(proveedor)
        if real and time.time() - real.get("t", 0) < 70 and real.get("tokens_restantes") is not None:
            if tokens_estimados > real["tokens_restantes"]:
                return False
        return True

    # ---------- vista para la interfaz ----------
    def resumen(self) -> list[dict]:
        out = []
        for prov in self.cfg.proveedores:
            ventanas = []
            for v in self.cfg.ventanas(prov):
                t, p = self.usado(prov, v["segundos"])
                ventanas.append({"nombre": v["nombre"], "tokens_usados": t, "peticiones": p,
                                 "tokens_limite": v.get("tokens"), "peticiones_limite": v.get("peticiones"),
                                 "limite_origen": "configurado" if (v.get("tokens") or v.get("peticiones")) else None})
            out.append({"proveedor": prov, "nombre": self.cfg.nombre(prov), "clave": self.cfg.tiene_clave(prov),
                        "renueva": self.cfg.renueva(prov), "ventanas": ventanas, "real": self.real.get(prov)})
        return out
