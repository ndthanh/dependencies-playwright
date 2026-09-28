@echo off
setlocal
node "%~dp0scripts\cookbook.mjs" init %*
exit /b %errorlevel%
