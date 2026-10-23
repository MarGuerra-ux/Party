"""Enrutador inteligente: decide QUÉ modelo responde según la tarea, el cupo y la disponibilidad.

Orden de decisión:
  0. Reglas internas (0 tokens)  →  1. Clasificar la tarea (con reglas, 0 tokens)
  2. Elegir nivel (rápido / equilibrado / razonamiento / visión)
  3. Filtrar modelos con clave, sin enfriamiento y con cupo
  4. Si uno falla en vivo: respaldo del mismo nivel → nivel superior → respaldo general
"""
from __future__ import annotations
import json
import re
from dataclasses import dataclass

from .config import ESCALA, Candidato, Config
from .meter import Meter
from .tools import ESQUEMAS
from .util import estimar_tokens, sin_acentos

PESADO = r"\b(organiza\w*|planifica\w*|prioriza\w*|estrategia|conflicto\w*|plan de estudio|que me conviene|compara\w*|analiza\w*|reorganiza\w*|como me organizo|distribu\w+)\b"
MEDIO = r"\b(resume\w*|resumen|explica\w*|redacta\w*|busca\w*|apuntes?|escribe|ejemplo|diferencia|define|agrega\w*|propon\w*|calendario|entrega|recuerda|anota)\b"
DATOS = r"\b(material|pdf|archivos?|biblioteca|guias?|apuntes?|calendario|horario|prueba|examen|entrega|evento|clase|agrega\w*|recuerda|anota)\b"
FECHA = r"\b(\d{1,2}\s*(de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\w*|\d{1,2}[/-]\d{1,2}|lunes|martes|miercoles|jueves|viernes|sabado|domingo|manana|hoy)\b"

LIMITES_SALIDA = {"1_rapido": 700, "2_equilibrado": 1300, "3_razonamiento": 2200, "vision": 1000}  # incluyen tokens de razonamiento interno
ESFUERZO = {"1_rapido": "low", "2_equilibrado": "medium", "3_razonamiento": "high", "vision": "medium"}
SALIDA_EST = {"1_rapido": (60, 300), "2_equilibrado": (200, 800), "3_razonamiento": (500, 1800), "vision": (200, 800)}
RONDAS = {"1_rapido": 1, "2_equilibrado": 2, "3_razonamiento": 3, "vision": 1}
SISTEMA_BASE_TOKENS = 380
HERRAMIENTAS_TOKENS = estimar_tokens(json.dumps(ESQUEMAS))


@dataclass
class Clasificacion:
    nivel: str
    razon: str
    vision: bool = False


class Router:
    def __init__(self, cfg: Config, meter: Meter):
        self.cfg = cfg
        self.meter = meter

    def clasificar(self, texto: str, tiene_imagen: bool = False) -> Clasificacion:
        if tiene_imagen:
            return Clasificacion("vision", "Hay una imagen: solo algunos modelos la entienden.", True)
        t = sin_acentos(texto)
        fechas = len(set(m.group(0) for m in re.finditer(FECHA, t)))
        if re.search(PESADO, t) or fechas >= 3 or len(texto) > 700:
            return Clasificacion("3_razonamiento", "Pide organizar, comparar o decidir con varias condiciones: necesita razonar en etapas.")
        if re.search(DATOS, t):
            return Clasificacion("2_equilibrado", "Necesita consultar tus datos con herramientas: un modelo muy chico se equivoca al usarlas.")
        if re.search(MEDIO, t) or len(texto) > 120:
            return Clasificacion("2_equilibrado", "Pide redactar, resumir o explicar con algo de contexto.")
        return Clasificacion("1_rapido", "Pregunta corta y simple: basta un modelo rápido.")

    def estimar(self, nivel: str, texto: str, historial: list[dict], recuerdos: list[str], con_herramientas: bool = True) -> tuple[int, int]:
        """(mínimo, máximo) aproximado de tokens. Es una estimación: el consumo real lo informa el proveedor."""
        entrada = SISTEMA_BASE_TOKENS + estimar_tokens(texto) + sum(estimar_tokens(m["content"]) for m in historial) + \
            sum(estimar_tokens(r) for r in recuerdos) + (HERRAMIENTAS_TOKENS if con_herramientas and nivel != "vision" else 0)
        r = RONDAS[nivel]
        lo, hi = SALIDA_EST[nivel]
        extra_plan = 450 if nivel == "3_razonamiento" else 0
        return round(entrada * (1 if r == 1 else 1.5) + lo + extra_plan), round(entrada * r + hi * r + extra_plan)

    def candidatos(self, nivel: str, tokens_max: int) -> list[Candidato]:
        """Modelos utilizables, en orden de preferencia."""
        if nivel == "vision":
            orden = ["vision", "respaldo"]
        else:
            i = ESCALA.index(nivel)
            orden = ESCALA[i:] + ["respaldo"]
        vistos, salida = set(), []
        for n in orden:
            for c in self.cfg.niveles.get(n, []):
                if (c.proveedor, c.modelo) in vistos:
                    continue
                vistos.add((c.proveedor, c.modelo))
                if not self.cfg.tiene_clave(c.proveedor) or self.meter.enfriando(c.proveedor, c.modelo):
                    continue
                if not self.meter.alcanza(c.proveedor, tokens_max):
                    continue
                salida.append(c)
        return salida

    def explicar_sin_cupo(self) -> str:
        con = [p for p in self.cfg.proveedores if self.cfg.tiene_clave(p)]
        if not con:
            return "No hay ninguna clave configurada. Pega al menos una en el archivo .env."
        return "Los proveedores configurados están sin cupo ahora mismo: " + "; ".join(f"{self.cfg.nombre(p)} {self.cfg.renueva(p)}" for p in con) + "."
