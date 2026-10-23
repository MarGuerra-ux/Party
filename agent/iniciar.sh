#!/usr/bin/env bash
# Party · inicia el agente en Linux/Mac
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt
[ -f .env ] || { cp .env.example .env; echo "Se creó .env: pega tus claves y vuelve a ejecutar."; exit 0; }
python -m party_agent.verificar
python -m uvicorn party_agent.main:app --port "${PARTY_AGENT_PORT:-8787}"
