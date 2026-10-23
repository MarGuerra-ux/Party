@echo off
REM Party · lanzador (doble clic). Déjalo abierto: desde la sección "Agentes IA" de Party enciendes y apagas el agente.
cd /d "%~dp0"
if not exist .venv ( python -m venv .venv )
call .venv\Scripts\activate
echo Instalando dependencias (la primera vez tarda; las siguientes son rapidas)...
pip install -q -r requirements.txt
if not exist .env ( copy .env.example .env && echo Se creo .env: pega tus claves, guarda y vuelve a abrir este archivo. && notepad .env && exit /b )
echo.
python launcher.py %*
