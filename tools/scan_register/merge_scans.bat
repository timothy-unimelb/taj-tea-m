@echo off
REM Usage: merge_scans.bat  merged.las  scan1.las scan2.las ...
setlocal
set PY=python
if exist "%~dp0..\..\.venv\Scripts\python.exe" set PY="%~dp0..\..\.venv\Scripts\python.exe"
%PY% "%~dp0scan_register.py" merge %*
pause
