"""Carga de modelos.yaml y de las claves (.env)."""
from __future__ import annotations
import os
from dataclasses import dataclass
from pathlib import Path

import yaml
from dotenv import load_dotenv

BASE = Path(__file__).resolve().parent.parent
load_dotenv(BASE / ".env")

ESCALA = ["1_rapido", "2_equilibrado", "3_razonamiento"]  # orden de escalamiento


@dataclass(frozen=True)
class Candidato:
    proveedor: str
    modelo: str
    nivel: str


class Config:
    def __init__(self, path: Path | None = None):
        self.path = Path(path or os.getenv("PARTY_MODELOS", BASE / "modelos.yaml"))
        raw = yaml.safe_load(self.path.read_text(encoding="utf-8"))
        self.verificado = raw.get("verificado", "?")
        self.ajustes = {
            "umbral_confirmacion_tokens": 0, "max_pasos_herramientas": 5, "timeout_segundos": 45,
            "memoria_corta_turnos": 6, "clasificador_llm": False, **(raw.get("ajustes") or {}),
        }
        self.embeddings: dict = raw.get("embeddings") or {}
        self.proveedores: dict = raw.get("proveedores") or {}
        self.niveles: dict = {
            nivel: [Candidato(c["proveedor"], c["modelo"], nivel) for c in lista]
            for nivel, lista in (raw.get("niveles") or {}).items()
        }

    # --- proveedores ---
    def api_key(self, proveedor: str) -> str | None:
        env = self.proveedores.get(proveedor, {}).get("key_env")
        key = os.getenv(env or "", "").strip()
        return key or None

    def base_url(self, proveedor: str) -> str:
        # PARTY_<PROVEEDOR>_BASE_URL permite apuntar a un servidor de pruebas
        override = os.getenv(f"PARTY_{proveedor.upper()}_BASE_URL")
        return (override or self.proveedores[proveedor]["base_url"]).rstrip("/")

    def tiene_clave(self, proveedor: str) -> bool:
        return self.api_key(proveedor) is not None

    def nombre(self, proveedor: str) -> str:
        return self.proveedores.get(proveedor, {}).get("nombre", proveedor)

    def renueva(self, proveedor: str) -> str:
        return self.proveedores.get(proveedor, {}).get("renueva", "")

    def ventanas(self, proveedor: str) -> list[dict]:
        return self.proveedores.get(proveedor, {}).get("ventanas") or []
