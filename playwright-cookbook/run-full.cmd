@echo off
setlocal
node "%~dp0scripts\cookbook.mjs" full %*
exit /b %errorlevel%
