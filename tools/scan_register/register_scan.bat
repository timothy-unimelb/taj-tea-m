@echo off
REM Drag a .las file onto this file (or run: register_scan.bat path\to\scan.las)
REM Opens the registration page over satellite imagery in your browser.
setlocal
set PY=python
if exist "%~dp0..\..\.venv\Scripts\python.exe" set PY="%~dp0..\..\.venv\Scripts\python.exe"
if "%~1"=="" (echo Drag a .las file onto this .bat & pause & exit /b 1)
%PY% "%~dp0scan_register.py" prepare "%~1" %2 %3 %4 %5
if errorlevel 1 pause
