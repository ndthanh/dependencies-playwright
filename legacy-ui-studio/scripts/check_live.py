"""Exercise only bundled fixtures; save evidence, including environment failures."""
import json
from pathlib import Path
import subprocess
import sys
import time
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from legacy_ui.uia import UIAAdapter,set_dpi_awareness
from legacy_ui.native import NativeAdapter
from legacy_ui.core import snapshot,selector_from_snapshot,resolve
from legacy_ui.playback import perform

set_dpi_awareness();root=Path(__file__).resolve().parents[1];records=[]
def check(label,adapter,selector,action):
    try: records.append(dict(label=label,passed=True,trace=perform(adapter,selector,action)))
    except Exception as exc: records.append(dict(label=label,passed=False,error=str(exc)))

a=UIAAdapter();windows=[n for n in a.roots() if a.props(n).get('name')=='Legacy Pane Lab']
if len(windows)!=1: raise RuntimeError('Open exactly one bundled Legacy Pane Lab')
data=snapshot(a,windows[0]);byclass={n.get('class_name'):n for n in data['nodes']}
fields=[n for n in data['nodes'] if n.get('class_name')=='LegacyField']
commands=[n for n in data['nodes'] if n.get('class_name')=='LegacyCommand']
byclass['LegacyField0']=fields[0];byclass['LegacyCommand3']=commands[1]
field=selector_from_snapshot(data,byclass['LegacyField0']['node_id'])
form=selector_from_snapshot(data,byclass['LegacyForm']['node_id'])
reset=selector_from_snapshot(data,byclass['LegacyCommand3']['node_id'])
check('reset',a,reset,dict(action='invoke'))
check('fill focus clear Unicode',a,field,dict(action='fill',value='Mã Việt 123',verify_value=True))
check('fill append',a,field,dict(action='fill',value=' +',clear_first=False))
check('append readback',a,field,dict(action='wait',condition='value',value='Mã Việt 123 +',wait_seconds=.2))
check('send keys clear',a,field,dict(action='send_keys',value='Ctrl+A; Backspace'))
check('send keys readback',a,field,dict(action='wait',condition='value',value='',wait_seconds=.2))
f=byclass['LegacyField0']['rect_screen'];p=byclass['LegacyForm']['rect_screen']
offset=dict(mode='relative_pixels',x=(f[0]+f[2])//2-p[0],y=(f[1]+f[3])//2-p[1])
check('Pane click + fill descendant',a,form,dict(action='fill',value='Pane target',activation='click',position=offset,verify_value=True))
check('MSAA fill',a,field,dict(action='legacy_set_value',value='MSAA 123'))
check('MSAA default action',a,reset,dict(action='legacy_default'))
try:
    from legacy_ui.vision import capture
    node,_=resolve(a,form);result=capture(a,node)
    records.append(dict(label='capture Pane',passed=True,width=result['width'],height=result['height']))
    import base64,io
    from PIL import Image
    button=commands[0]['rect_screen'];rect=result['rect']
    box=(button[0]-rect[0]+4,button[1]-rect[1]+4,button[2]-rect[0]-4,button[3]-rect[1]-4)
    image=Image.open(io.BytesIO(base64.b64decode(result['png']))).crop(box)
    buffer=io.BytesIO();image.save(buffer,format='PNG')
    anchor=dict(template_png=base64.b64encode(buffer.getvalue()).decode('ascii'),threshold=.92,offset=[image.width//2,image.height//2])
    check('image anchor click Save',a,form,dict(action='click',image_anchor=anchor))
    status=next(n for n in data['nodes'] if n.get('automation_id')=='result')
    check('image click postcondition',a,selector_from_snapshot(data,status['node_id']),dict(action='wait',condition='name_contains',value='SAVED',wait_seconds=1))
except Exception as exc: records.append(dict(label='capture Pane',passed=False,error=str(exc)))

process=subprocess.Popen([sys.executable,str(root/'demo/native_fixture.py')],creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
try:
    time.sleep(1);native=NativeAdapter()
    roots=[n for n in native.roots() if native.props(n).get('name')=='Legacy Native Python Lab']
    if len(roots)!=1: raise RuntimeError('Native fixture failed to open')
    data=snapshot(native,roots[0])
    for id,action,label in [(101,dict(action='set_value',value='Win32 Việt'),'native set text'),
        (101,dict(action='wait',condition='value',value='Win32 Việt',wait_seconds=.2),'native readback'),
        (103,dict(action='invoke'),'native button click'),
        (104,dict(action='wait',condition='name',value='CLICKED',wait_seconds=.2),'native click postcondition')]:
        n=next(n for n in data['nodes'] if n.get('control_id')==id)
        selector=selector_from_snapshot(data,n['node_id']);check(label,native,selector,action)
finally: process.terminate();process.wait(timeout=5)
output=root/'artifacts'/'upgrade-live.json';output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(records,ensure_ascii=False,indent=2))
if not all(r['passed'] for r in records): raise SystemExit(1)
