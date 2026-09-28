@echo off
setlocal
if not defined LAB_NODE set "LAB_NODE=node"
"%LAB_NODE%" "%~dp0scripts\lab.mjs" run %*
exit /b %errorlevel%
