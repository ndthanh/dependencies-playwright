@echo off
setlocal
node "%~dp0scripts\cookbook.mjs" web %*
exit /b %errorlevel%
