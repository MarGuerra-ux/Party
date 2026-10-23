"""Cliente único para proveedores con API compatible con OpenAI (Groq, Gemini, Mistral, Cerebras, OpenRouter)."""
from __future__ import annotations
import os
import ssl

import httpx

from .config import Config


def verificacion_ssl():
    """Contexto TLS que usa los certificados del sistema operativo (truststore).

    En Windows, un antivirus o la red de la institución puede interceptar HTTPS con su propio certificado raíz
    ("self-signed certificate in certificate chain"). Ese certificado está instalado en Windows pero no en el
    paquete de certificados de Python; truststore hace que Python confíe en lo que confía el sistema.
    Se puede forzar un archivo propio con PARTY_CA_BUNDLE=ruta\\al\\certificado.pem
    """
    ca = os.getenv("PARTY_CA_BUNDLE")
    if ca:
        return ssl.create_default_context(cafile=ca)
    try:
        import truststore
        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except Exception:
        return True


class ProviderError(Exception):
    def __init__(self, tipo: str, mensaje: str, retry_after: float = 60.0, status: int | None = None):
        super().__init__(mensaje)
        self.tipo = tipo            # rate_limit | auth | modelo | servidor | timeout | respuesta
        self.retry_after = retry_after
        self.status = status


def _retry_after(r: httpx.Response) -> float:
    for k in ("retry-after", "x-ratelimit-reset-requests", "x-ratelimit-reset-tokens"):
        v = r.headers.get(k)
        if v:
            try:
                return float(str(v).rstrip("sm"))
            except ValueError:
                pass
    return 60.0


class Providers:
    def __init__(self, cfg: Config):
        self.cfg = cfg

    def _headers(self, proveedor: str) -> dict:
        h = {"Authorization": f"Bearer {self.cfg.api_key(proveedor)}", "Content-Type": "application/json"}
        if proveedor == "openrouter":
            h.update({"HTTP-Referer": "http://localhost", "X-Title": "Party"})
        return h

    async def chat(self, proveedor: str, modelo: str, mensajes: list, herramientas: list | None = None,
                   max_tokens: int = 1200, temperatura: float = 0.3, esfuerzo: str | None = None) -> dict:
        if not self.cfg.tiene_clave(proveedor):
            raise ProviderError("auth", f"Falta la clave de {proveedor}")
        cuerpo = {"model": modelo, "messages": mensajes, "temperature": temperatura, "max_tokens": max_tokens}
        # gpt-oss de Groq "piensa" antes de responder y esos tokens cuentan: se limita el esfuerzo según la tarea
        if esfuerzo and proveedor == "groq" and modelo.startswith("openai/gpt-oss"):
            cuerpo["reasoning_effort"] = esfuerzo
        if herramientas:
            cuerpo["tools"] = herramientas
            cuerpo["tool_choice"] = "auto"
        try:
            async with httpx.AsyncClient(timeout=self.cfg.ajustes["timeout_segundos"], verify=verificacion_ssl()) as c:
                r = await c.post(f"{self.cfg.base_url(proveedor)}/chat/completions", json=cuerpo, headers=self._headers(proveedor))
        except httpx.TimeoutException:
            raise ProviderError("timeout", f"{proveedor} tardó demasiado")
        except httpx.HTTPError as e:
            raise ProviderError("servidor", f"No se pudo conectar con {proveedor}: {e}")
        if r.status_code == 429:
            raise ProviderError("rate_limit", f"{proveedor} alcanzó su límite", _retry_after(r), 429)
        if r.status_code in (401, 403):
            raise ProviderError("auth", f"{proveedor} rechazó la clave", status=r.status_code)
        if r.status_code in (400, 404, 422):
            raise ProviderError("modelo", f"{proveedor}/{modelo}: {r.text[:200]}", status=r.status_code)
        if r.status_code >= 500:
            raise ProviderError("servidor", f"{proveedor} falló ({r.status_code})", 30.0, r.status_code)
        try:
            d = r.json()
            msg = d["choices"][0]["message"]
        except Exception:
            raise ProviderError("respuesta", f"Respuesta inesperada de {proveedor}")
        u = d.get("usage") or {}
        return {
            "contenido": msg.get("content") or "",
            "herramientas": msg.get("tool_calls") or [],
            "mensaje": msg,
            "uso": {"entrada": u.get("prompt_tokens"), "salida": u.get("completion_tokens"), "total": u.get("total_tokens")},
            "cabeceras": dict(r.headers),
        }

    async def listar_modelos(self, proveedor: str) -> dict:
        """Valida la clave y lista los modelos de la cuenta (no gasta tokens)."""
        if not self.cfg.tiene_clave(proveedor):
            return {"proveedor": proveedor, "clave": False, "ok": False, "detalle": "sin clave"}
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=8.0), verify=verificacion_ssl()) as c:
                r = await c.get(f"{self.cfg.base_url(proveedor)}/models", headers=self._headers(proveedor))
            if r.status_code in (401, 403):
                return {"proveedor": proveedor, "clave": True, "ok": False, "detalle": "la clave fue rechazada"}
            r.raise_for_status()
            data = r.json()
            items = data.get("data") or data.get("models") or []
            ids = sorted({(m.get("id") or m.get("name") or "").replace("models/", "") for m in items if isinstance(m, dict)})
            return {"proveedor": proveedor, "clave": True, "ok": True, "modelos": [i for i in ids if i]}
        except httpx.TimeoutException:
            return {"proveedor": proveedor, "clave": True, "ok": False, "detalle": "no respondió a tiempo (¿red, VPN o antivirus?)"}
        except Exception as e:
            return {"proveedor": proveedor, "clave": True, "ok": False, "detalle": str(e)[:160]}
