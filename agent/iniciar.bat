@echo off
REM Party · inicia el agente en Windows (doble clic)
cd /d "%~dp0"
if not exist .venv ( python -m venv .venv )
call .venv\Scripts\activate
pip install -q -r requirements.txt
if not exist .env ( copy .env.example .env && echo Se creo .env: pega tus claves y vuelve a abrir este archivo. && notepad .env && exit /b )
python -m party_agent.verificar
echo.
echo Agente en http://localhost:8787  (Ctrl+C para detener)
python -m uvicorn party_agent.main:app --port 8787
