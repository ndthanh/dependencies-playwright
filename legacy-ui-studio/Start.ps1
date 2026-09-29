param([switch]$NoBrowser, [int]$Port = 8765)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) {
    if (Get-Command py -ErrorAction SilentlyContinue) { & py -3 -m venv .venv }
    elseif (Get-Command python -ErrorAction SilentlyContinue) { & python -m venv .venv }
    else { throw 'Install Python 3.10 or newer for Windows, including Tcl/Tk, then run again.' }
    if ($LASTEXITCODE -ne 0) { throw 'Could not create Python environment.' }
}
& $python -m pip install -r requirements.txt --disable-pip-version-check
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
$options = @('-m','legacy_ui','studio','--port',"$Port")
if ($NoBrowser) { $options += '--no-browser' }
& $python @options
