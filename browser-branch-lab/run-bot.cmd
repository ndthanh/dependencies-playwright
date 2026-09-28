@echo off
setlocal
if not defined LAB_NODE set "LAB_NODE=node"
"%LAB_NODE%" "%~dp0scripts\lab.mjs" run %*
set "LAB_EXIT=%errorlevel%"
if not "%LAB_EXIT%"=="0" pause
exit /b %LAB_EXIT%
