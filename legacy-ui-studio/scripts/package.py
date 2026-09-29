"""Build a small source ZIP, with an explicit allowlist and SHA-256 manifest."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

root=Path(__file__).resolve().parents[1]
destination=Path(sys.argv[1]) if len(sys.argv)>1 else root.parent/'releases'/'legacy-ui-studio-v0.1.0.zip'
destination.parent.mkdir(parents=True,exist_ok=True)
top={'README.vi.md','AI-WORKFLOW.md','requirements.txt','Start.ps1','start.cmd','.gitignore'}
dirs={'legacy_ui','tests','demo','examples','scripts','docs'}
files=[]
for path in root.rglob('*'):
    if not path.is_file(): continue
    relative=path.relative_to(root)
    if relative.parts[0] not in dirs and str(relative) not in top: continue
    if any(part in ('__pycache__','session','.venv','node_modules') for part in relative.parts): continue
    if path.suffix in ('.pyc','.exe'): continue
    files.append(path)
manifest={str(p.relative_to(root)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}
with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for path in sorted(files): archive.write(path,'legacy-ui-studio/'+path.relative_to(root).as_posix())
    archive.writestr('legacy-ui-studio/manifest.sha256.json',json.dumps(manifest,indent=2))
digest=hashlib.sha256(destination.read_bytes()).hexdigest()
Path(str(destination)+'.sha256').write_bytes((digest+'  '+destination.name+'\n').encode('ascii'))
print(json.dumps({'zip':str(destination),'files':len(files),'bytes':destination.stat().st_size,'sha256':digest},indent=2))
