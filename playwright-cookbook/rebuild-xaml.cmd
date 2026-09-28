@echo off
setlocal
node "%~dp0scripts\build-xaml.mjs"
exit /b %errorlevel%
