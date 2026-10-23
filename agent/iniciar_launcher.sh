#!/usr/bin/env bash
# Party · lanzador (Linux/macOS). Déjalo abierto: desde "Agentes IA" de Party enciendes y apagas el agente.
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt
[ -f .env ] || { cp .env.example .env; echo "Se creó .env: pega tus claves y vuelve a ejecutar."; exit 1; }
python launcher.py "$@"
