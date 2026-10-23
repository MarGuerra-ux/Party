"""Comprueba tu Supabase:  python -m party_agent.db_check   (solo lectura)
                          python -m party_agent.db_check --escribir   (además prueba escribir y borrar 1 fila)

Usa la URL y la clave pública (anon) que ya están en js/supabaseClient.js, o SUPABASE_URL / SUPABASE_ANON_KEY.
Dice qué tablas existen, si el navegador puede leerlas y si falta ejecutar sql/party_migracion_1.sql."""
from __future__ import annotations
import asyncio
import os
import re
import sys

import httpx

from .config import BASE
from .providers import verificacion_ssl

TABLAS = [
    # (tabla, columna extra a comprobar, grupo)
    ("students", None, "base"), ("groups", None, "base"), ("student_groups", None, "base"), ("events", None, "base"),
    ("notes", "bg_pattern", "base"), ("scrum_tasks", None, "base"), ("scrum_columns", None, "base"), ("lists", None, "base"),
    ("student_schedules", None, "migración 1"), ("campus_rooms", None, "migración 1"), ("subjects", None, "migración 1"),
    ("agent_usage", None, "migración 1"), ("agent_memory", None, "migración 1"), ("note_chunks", None, "migración 1"),
]


def credenciales() -> tuple[str | None, str | None]:
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_ANON_KEY")
    if url and key:
        return url, key
    js = BASE.parent / "js" / "supabaseClient.js"
    try:
        t = js.read_text(encoding="utf-8")
        u = re.search(r'SUPABASE_URL\s*=\s*"([^"]+)"', t)
        k = re.search(r'SUPABASE_ANON_KEY\s*=\s*"([^"]+)"', t)
        return (u.group(1) if u else None, k.group(1) if k else None)
    except Exception:
        return None, None


def _motivo(r: httpx.Response) -> str:
    try:
        d = r.json()
        return f"{d.get('code', r.status_code)}: {d.get('message', '')}"[:140]
    except Exception:
        return f"HTTP {r.status_code}"


async def revisar(url: str, key: str, escribir: bool = False, transport=None) -> list[dict]:
    h = {"apikey": key, "Authorization": f"Bearer {key}"}
    out = []
    async with httpx.AsyncClient(base_url=url.rstrip("/") + "/rest/v1", headers=h, timeout=15, verify=verificacion_ssl(), transport=transport) as c:
        for tabla, col, grupo in TABLAS:
            try:
                r = await c.get(f"/{tabla}", params={"select": col or "*", "limit": "1"})
            except httpx.HTTPError as e:
                out.append({"item": tabla, "grupo": grupo, "ok": False, "detalle": f"sin conexión: {e}"[:140]})
                continue
            if r.status_code == 200:
                out.append({"item": tabla + (f".{col}" if col else ""), "grupo": grupo, "ok": True, "detalle": "existe y se puede leer"})
            elif r.status_code in (401, 403):
                out.append({"item": tabla, "grupo": grupo, "ok": False, "detalle": "existe pero el permiso (RLS) bloquea la lectura · " + _motivo(r)})
            else:
                falta = "no existe" if "PGRST205" in r.text or r.status_code == 404 else ("falta la columna" if col and "42703" in r.text else "error")
                out.append({"item": tabla + (f".{col}" if col else ""), "grupo": grupo, "ok": False, "detalle": f"{falta} · {_motivo(r)}"})
        try:
            r = await c.post("/rpc/match_note_chunks", json={"query_embedding": [0.0] * 768, "match_count": 1})
            out.append({"item": "match_note_chunks()", "grupo": "migración 1", "ok": r.status_code == 200,
                        "detalle": "búsqueda semántica disponible (pgvector)" if r.status_code == 200 else _motivo(r)})
        except httpx.HTTPError as e:
            out.append({"item": "match_note_chunks()", "grupo": "migración 1", "ok": False, "detalle": str(e)[:140]})
        if escribir:
            try:
                r = await c.post("/agent_usage", json={"session_id": "db_check", "provider": "test", "model": "test", "tokens_total": 0},
                                 headers={"Prefer": "return=representation"})
                if r.status_code in (200, 201):
                    fila = r.json()[0]["id"]
                    d = await c.delete("/agent_usage", params={"id": f"eq.{fila}"})
                    out.append({"item": "escritura (agent_usage)", "grupo": "permisos", "ok": d.status_code in (200, 204), "detalle": "insertó y borró 1 fila de prueba"})
                else:
                    out.append({"item": "escritura (agent_usage)", "grupo": "permisos", "ok": False, "detalle": _motivo(r)})
            except httpx.HTTPError as e:
                out.append({"item": "escritura (agent_usage)", "grupo": "permisos", "ok": False, "detalle": str(e)[:140]})
    return out


async def main():
    url, key = credenciales()
    if not (url and key):
        print("No encontré la URL/clave de Supabase (js/supabaseClient.js o variables SUPABASE_URL y SUPABASE_ANON_KEY).")
        return
    print(f"\nParty · revisión de Supabase ({url})\n")
    res = await revisar(url, key, "--escribir" in sys.argv)
    for r in res:
        print(f"  {'✅' if r['ok'] else '❌'} {r['item']:<26} [{r['grupo']}] {r['detalle']}")
    faltan = [r for r in res if not r["ok"] and r["grupo"] == "migración 1"]
    if faltan:
        print("\n  → Faltan elementos de la migración 1: abre Supabase → SQL Editor, pega sql/party_migracion_1.sql y ejecútalo; luego repite esto.")
    print("  Nota: esto solo ve lo que ve el navegador con la clave pública; no muestra si una tabla tiene RLS activada.\n")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nInterrumpido.")
