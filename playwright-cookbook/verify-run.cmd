@echo off
setlocal
node "%~dp0scripts\verify-run.mjs" %*
exit /b %errorlevel%
