@echo off
setlocal
node "%~dp0scripts\history.mjs" %*
exit /b %errorlevel%
