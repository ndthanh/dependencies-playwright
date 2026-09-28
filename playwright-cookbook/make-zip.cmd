@echo off
setlocal
node "%~dp0scripts\package.mjs" %*
exit /b %errorlevel%
