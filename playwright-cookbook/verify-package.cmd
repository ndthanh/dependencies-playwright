@echo off
setlocal
node "%~dp0scripts\verify-package.mjs"
exit /b %errorlevel%
