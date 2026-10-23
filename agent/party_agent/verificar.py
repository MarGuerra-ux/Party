"""Comprueba tus claves y modelos:  python -m party_agent.verificar   (no gasta tokens)"""
from __future__ import annotations
import asyncio
import difflib
import sys

from .config import Config
from .providers import Providers


async def main():
    cfg = Config()
    pv = Providers(cfg)
    print(f"\nParty · verificación de proveedores (modelos.yaml verificado: {cfg.verificado})\n")
    res = {}
    ssl_error = False
    for p in cfg.proveedores:
        print(f"  {cfg.nombre(p):<14} ...", end="\r", flush=True)
        res[p] = await pv.listar_modelos(p)
        r = res[p]
        estado = "✅ clave válida" if r["ok"] else ("⚪ sin clave" if not r.get("clave") else f"❌ {r.get('detalle')}")
        ssl_error = ssl_error or "CERTIFICATE" in str(r.get("detalle", ""))
        print(f"  {cfg.nombre(p):<14} {estado}")
    if ssl_error:
        print("\n  ⚠️  Error de certificado: tu antivirus o red intercepta HTTPS. Ejecuta  pip install -r requirements.txt  (instala truststore)\n"
              "      y vuelve a probar. Si persiste, desactiva un momento la 'protección web/HTTPS' del antivirus o define PARTY_CA_BUNDLE.")
    print("\nModelos configurados:")
    for nivel, cands in cfg.niveles.items():
        for c in cands:
            r = res.get(c.proveedor, {})
            if not r.get("ok"):
                marca = "—"
            elif c.modelo in r["modelos"]:
                marca = "✅"
            else:
                tokens = [t for t in c.modelo.replace(":free", "").replace("/", "-").split("-") if len(t) > 2]
                cerca = difflib.get_close_matches(c.modelo, r["modelos"], n=3, cutoff=0.5)
                cerca += [m for m in r["modelos"] if m not in cerca and sum(t in m for t in tokens) >= max(2, len(tokens) - 1)][:3]
                marca = "⚠️  no aparece en tu cuenta" + (f". Parecidos: {', '.join(cerca[:4])}" if cerca else "")
            print(f"  {nivel:<15} {c.proveedor:<11} {c.modelo:<42} {marca}")
    if "--listar" in sys.argv:
        print("Modelos disponibles en tu cuenta:")
        for p, r in res.items():
            if r.get("ok"):
                ms = [m for m in r["modelos"] if p != "openrouter" or m.endswith(":free")]
                print(f"\n  {cfg.nombre(p)} ({len(ms)}){' · solo gratis' if p == 'openrouter' else ''}:")
                for m in ms:
                    print(f"    {m}")
    else:
        print("Para ver todos los modelos de tu cuenta:  python -m party_agent.verificar --listar")
    print()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nInterrumpido.")
