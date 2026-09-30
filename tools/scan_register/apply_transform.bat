@echo off
REM Usage: apply_transform.bat  scan.las  scan_transform.json  [output.las]
REM Writes the registered cloud (default: <scan>_registered.las next to the input).
setlocal
set PY=python
if exist "%~dp0..\..\.venv\Scripts\python.exe" set PY="%~dp0..\..\.venv\Scripts\python.exe"
if "%~2"=="" (echo Usage: apply_transform.bat scan.las scan_transform.json [output.las] & pause & exit /b 1)
set OUT=%~3
if "%OUT%"=="" set OUT=%~dpn1_registered.las
%PY% "%~dp0scan_register.py" apply "%~1" "%~2" "%OUT%"
pause
