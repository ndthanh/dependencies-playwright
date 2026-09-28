@echo off
setlocal
if not defined LAB_NODE set "LAB_NODE=node"
"%LAB_NODE%" "%~dp0scripts\package.mjs" %*
exit /b %errorlevel%
