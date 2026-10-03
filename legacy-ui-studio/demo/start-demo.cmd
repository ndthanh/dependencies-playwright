@echo off
cd /d "%~dp0"
python "%~dp0build.py"
if errorlevel 1 (pause & exit /b 1)
start "" "%~dp0PaneDemo.exe"
