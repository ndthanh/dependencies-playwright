@echo off
setlocal
node "%~dp0scripts\cookbook.mjs" scenario %*
exit /b %errorlevel%
