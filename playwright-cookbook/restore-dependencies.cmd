@echo off
setlocal
node "%~dp0scripts\restore.mjs" %*
exit /b %errorlevel%
