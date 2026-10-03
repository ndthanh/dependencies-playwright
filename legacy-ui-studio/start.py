"""Python launcher; no PowerShell, generated executable or compiler required."""
import argparse
import os
from pathlib import Path
import subprocess
import sys

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--no-browser',action='store_true')
    parser.add_argument('--vision',action='store_true',help='Install optional image-anchor dependencies')
    args=parser.parse_args()
    root=Path(__file__).resolve().parent; os.chdir(root)
    python=root/'.venv'/'Scripts'/'python.exe'
    if not python.exists(): subprocess.run([sys.executable,'-m','venv',str(root/'.venv')],check=True)
    requirement='requirements-vision.txt' if args.vision else 'requirements.txt'
    subprocess.run([str(python),'-m','pip','install','-r',requirement,'--disable-pip-version-check'],check=True)
    command=[str(python),'-m','legacy_ui','studio','--port',str(args.port)]
    if args.no_browser: command.append('--no-browser')
    return subprocess.call(command)

if __name__=='__main__': raise SystemExit(main())
