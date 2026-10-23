"""Prueba real de cada modelo configurado:  python -m party_agent.probar
Hace una llamada mínima (~20 tokens) por modelo y otra para comprobar si sabe usar herramientas.
Sirve para saber, con tus claves, cuáles responden y cuáles fallan (y por qué)."""
from __future__ import annotations
import asyncio
import json
import sys

from .config import Config
from .providers import ProviderError, Providers
from .tools import ESQUEMAS


async def main():
    cfg = Config()
    pv = Providers(cfg)
    solo = sys.argv[1] if len(sys.argv) > 1 else None
    vistos = set()
    print("\nPrueba real de modelos (gasta unos pocos tokens por modelo)\n")
    print(f"  {'proveedor/modelo':<58} {'texto':<8} herramientas")
    for nivel, cands in cfg.niveles.items():
        for c in cands:
            if (c.proveedor, c.modelo) in vistos or not cfg.tiene_clave(c.proveedor) or (solo and solo not in c.proveedor):
                continue
            vistos.add((c.proveedor, c.modelo))
            nombre = f"{c.proveedor}/{c.modelo}"
            try:
                r = await pv.chat(c.proveedor, c.modelo, [{"role": "user", "content": "Responde solo con la palabra: ok"}], None, 400, esfuerzo="low")
                texto = "✅" if r["contenido"].strip() else "⚠️ vacío"
            except ProviderError as e:
                print(f"  {nombre:<58} ❌ {e.tipo}: {str(e)[:150]}")
                continue
            try:
                r = await pv.chat(c.proveedor, c.modelo, [{"role": "user", "content": "¿Qué fecha es hoy? Usa la herramienta."}], [ESQUEMAS[0]], 600, esfuerzo="low")
                herr = "✅ usa herramientas" if r["herramientas"] else "⚠️ no llamó la herramienta"
            except ProviderError as e:
                herr = f"❌ {e.tipo}: {str(e)[:110]}"
            print(f"  {nombre:<58} {texto:<8} {herr}")
    print("\nSi un modelo sale ❌ o ⚠️ en herramientas, quítalo de los niveles 2 y 3 en modelos.yaml.\n")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nInterrumpido.")
