"""Loopback-only web UI. UIA work runs in disposable CLI subprocesses."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import io
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import threading
import time
from urllib.parse import urlparse
import uuid
import webbrowser
import zipfile
from .core import selector_from_snapshot, validate_selector
from .interaction import validate_options

STATIC=Path(__file__).with_name('static')

def read(path): return json.loads(Path(path).read_text(encoding='utf-8'))
def write(path,value):
    Path(path).parent.mkdir(parents=True,exist_ok=True)
    temp=Path(str(path)+'.tmp')
    temp.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    os.replace(temp,path)

def safe_name(value):
    if not isinstance(value,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',value):
        raise ValueError('Name must contain 1-80 letters, digits, underscores or hyphens')
    return value

def validate_action(action):
    allowed={'set_value','invoke','click','type_text','key','send_keys','fill','legacy_set_value','legacy_default','wait','sleep','highlight'}
    if action.get('action') not in allowed: raise ValueError('Unsupported activity')
    if action['action']!='sleep': safe_name(action.get('target'))
    if action['action']=='wait':
        if action.get('condition') not in ('exists','absent','enabled','visible','value','name','name_contains'):
            raise ValueError('Unsupported wait condition')
        if not 0<=float(action.get('wait_seconds',10))<=3600: raise ValueError('Invalid wait timeout')
        if not .05<=float(action.get('poll_seconds',.2))<=60: raise ValueError('Invalid poll interval')
    if action['action']=='sleep' and not 0<=float(action.get('seconds',1))<=3600:
        raise ValueError('Invalid delay')
    if not isinstance(action.get('value',''),str): raise ValueError('Value must be text')
    validate_options(action)


class State:
    def __init__(self,project):
        self.project=Path(project).resolve(); self.project.mkdir(parents=True,exist_ok=True)
        self.token=secrets.token_urlsafe(32); self.snapshot=None; self.snapshot_id=None
        self.lock=threading.Lock(); self.jobs={}; self.stop=False
        self.flow=read(self.project/'workflow.json') if (self.project/'workflow.json').exists() else {'actions':[]}

    def cli(self,*args,timeout=45):
        env=dict(os.environ,PYTHONIOENCODING='utf-8'); env.pop('LEGACY_UI_WORKER',None)
        result=subprocess.run([sys.executable,'-m','legacy_ui','--timeout',str(timeout),*map(str,args)],
            capture_output=True,encoding='utf-8',env=env,timeout=timeout+5,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        if result.returncode: raise RuntimeError(result.stderr.strip() or result.stdout.strip())
        return json.loads(result.stdout)

    def selectors(self):
        return {p.stem:read(p) for p in (self.project/'selectors').glob('*.json')}

    def job(self,fn):
        if not self.lock.acquire(blocking=False): raise RuntimeError('Another activity is running')
        self.stop=False
        jid=uuid.uuid4().hex
        job={'id':jid,'status':'running','events':[]}; self.jobs[jid]=job
        def work():
            try: job['result']=fn(job); job['status']='completed'
            except Exception as exc: job['error']=str(exc); job['status']='failed'
            finally:
                try: write(self.project/'runs'/(jid+'.json'),job)
                finally: self.lock.release()
        threading.Thread(target=work,daemon=True).start()
        # Bound in-memory history. Persisted logs remain in project/runs.
        for old in list(self.jobs)[:-100]: self.jobs.pop(old,None)
        return {'job_id':jid}

    def dump(self,payload,job):
        self.cli('dump','--hwnd',int(payload['hwnd']),'--view',payload.get('view','raw'),'--out',self.project/'snapshot')
        self.snapshot=read(self.project/'snapshot.json'); self.snapshot_id=uuid.uuid4().hex
        return {'snapshot':self.snapshot,'snapshot_id':self.snapshot_id}

    def generate(self,payload):
        if payload.get('snapshot_id')!=self.snapshot_id or self.snapshot is None:
            raise ValueError('Inspect this window again; snapshot changed')
        node_id=payload['node_id']; s=selector_from_snapshot(self.snapshot,node_id)
        nodes={n['node_id']:n for n in self.snapshot['nodes']}; n=nodes[node_id]; parent=nodes.get(n['parent_id'])
        if self.snapshot['backend']=='uia' and parent and parent['parent_id'] is not None and parent.get('name'):
            criteria={k:parent[k] for k in ('name','class_name','control_type')}
            if sum(all(x.get(k)==v for k,v in criteria.items()) for x in nodes.values())==1:
                s['steps']=[{'axis':'descendant','match':criteria},s['steps'][-1]]
        return s

    def replay(self,payload,job):
        actions=payload['actions']
        if not isinstance(actions,list) or len(actions)>500: raise ValueError('Invalid actions')
        # Validate all actions/selectors before submitting the first action.
        for a in actions:
            validate_action(a)
            if a['action']!='sleep': validate_selector(read(self.project/'selectors'/(a['target']+'.json')))
        reports=[]
        for i,a in enumerate(actions):
            if self.stop: return {'stopped':True,'reports':reports}
            event={'step':i,'label':a.get('label',a['action']),'status':'running'}; job['events'].append(event)
            converted=dict(a)
            if a['action']!='sleep': converted['selector']='selectors/'+a['target']+'.json'
            atomic=self.project/'atomic.json'; write(atomic,{'actions':[converted]})
            timeout=max(45,float(a.get('wait_seconds',0))+10,float(a.get('seconds',0))+10)
            try:
                report=self.cli('replay','--flow',atomic,'--out',self.project/'runs'/(job['id']+f'-step-{i+1}.json'),timeout=timeout)
                reports.append(report); event['status']='passed'; event['trace']=report['steps'][0]['trace']
            except Exception as exc: event['status']='failed'; event['error']=str(exc); raise
        return {'success':True,'reports':reports}

    def export(self):
        buffer=io.BytesIO()
        with zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED) as archive:
            archive.writestr('workflow.json',json.dumps(self.flow,ensure_ascii=False,indent=2))
            actions=[]
            for action in self.flow['actions']:
                a=dict(action)
                if a['action']!='sleep': a['selector']='selectors/'+a['target']+'.json'
                actions.append(a)
            archive.writestr('flow.json',json.dumps({'actions':actions},ensure_ascii=False,indent=2))
            for name,selector in self.selectors().items():
                archive.writestr('selectors/'+name+'.json',json.dumps(selector,ensure_ascii=False,indent=2))
        return buffer.getvalue()

    def test_element(self,payload,job):
        selector=payload['selector']; validate_selector(selector)
        mode=payload['mode']
        if mode not in ('set_value','keyboard_fill','fill','send_keys','invoke','click','legacy_set_value','legacy_default','highlight'):
            raise ValueError('Unsupported test interaction')
        if not isinstance(payload.get('value',''),str): raise ValueError('Text value required')
        write(self.project/'test-selector.json',selector)
        a={k:v for k,v in payload.items() if k not in ('selector','mode')}
        a['action']='fill' if mode=='keyboard_fill' else mode
        validate_options(a)
        actions=[a]
        for a in actions: a['selector']='test-selector.json'
        write(self.project/'test-action.json',{'actions':actions})
        return self.cli('replay','--flow',self.project/'test-action.json','--out',self.project/'runs'/(job['id']+'-test.json'))


def handler(state):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def reply(self,value,status=200,content_type='application/json; charset=utf-8'):
            data=json.dumps(value,ensure_ascii=False).encode('utf-8') if isinstance(value,(dict,list)) else value
            self.send_response(status); self.send_header('Content-Type',content_type)
            self.send_header('Content-Length',str(len(data))); self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'")
            self.end_headers(); self.wfile.write(data)

        def authorized(self):
            host=f'127.0.0.1:{self.server.server_port}'
            if self.headers.get('Host')!=host: return False
            origin=self.headers.get('Origin')
            if origin and origin!='http://'+host: return False
            return secrets.compare_digest(self.headers.get('Authorization',''),'Bearer '+state.token)

        def do_GET(self):
            path=urlparse(self.path).path
            if path in ('/','/app.js','/style.css'):
                filename={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}[path]
                mime={'/':'text/html','/app.js':'text/javascript','/style.css':'text/css'}[path]
                return self.reply((STATIC/filename).read_bytes(),content_type=mime+'; charset=utf-8')
            if not self.authorized(): return self.reply({'error':'Open the local launch URL to connect.'},403)
            if path=='/api/state': return self.reply({'selectors':state.selectors(),'workflow':state.flow,'busy':state.lock.locked()})
            if path.startswith('/api/jobs/'):
                job=state.jobs.get(path.rsplit('/',1)[1]); return self.reply(job or {'error':'Unknown job'},200 if job else 404)
            if path=='/api/export': return self.reply(state.export(),content_type='application/zip')
            return self.reply({'error':'Not found'},404)

        def do_POST(self):
            if not self.authorized(): return self.reply({'error':'Forbidden'},403)
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=2000000: raise ValueError('Invalid request size')
                payload=json.loads(self.rfile.read(size)); path=urlparse(self.path).path
                if path=='/api/stop': state.stop=True; result={'stopping':True}
                elif path=='/api/windows': result=state.job(lambda job:state.cli('windows'))
                elif path=='/api/dump': result=state.job(lambda job:state.dump(payload,job))
                elif path=='/api/pick':
                    result=state.job(lambda job:state.cli('pick','--hwnd',int(payload['hwnd']),'--view',payload.get('view','raw'),'--delay',3))
                elif path=='/api/replay': result=state.job(lambda job:state.replay(payload,job))
                elif path=='/api/test': result=state.job(lambda job:state.test_element(payload,job))
                elif path=='/api/capture':
                    validate_selector(payload['selector'])
                    def capture(job):
                        temp=state.project/'capture-selector.json'; write(temp,payload['selector'])
                        return state.cli('capture','--selector',temp)
                    result=state.job(capture)
                elif path=='/api/highlight':
                    validate_selector(payload['selector'])
                    def highlight(job):
                        temp=state.project/'highlight.json'; write(temp,payload['selector'])
                        return state.cli('resolve','--selector',temp,'--highlight')
                    result=state.job(highlight)
                elif path=='/api/generate': result=state.generate(payload)
                elif path=='/api/selector':
                    if state.lock.locked(): raise RuntimeError('Wait for the current activity')
                    name=safe_name(payload['name']); validate_selector(payload['selector'])
                    write(state.project/'selectors'/(name+'.json'),payload['selector']); result={'saved':name}
                elif path=='/api/workflow':
                    if state.lock.locked(): raise RuntimeError('Wait for the current activity')
                    for a in payload['actions']: validate_action(a)
                    state.flow={'schema_version':1,'actions':payload['actions']}
                    write(state.project/'workflow.json',state.flow); result={'saved':True}
                else: return self.reply({'error':'Not found'},404)
                return self.reply(result)
            except Exception as exc: return self.reply({'error':str(exc)},400)
    return Handler


def launch(project,port=8765,open_browser=True):
    state=State(project)
    server=ThreadingHTTPServer(('127.0.0.1',port),handler(state))
    url=f'http://127.0.0.1:{server.server_port}/#{state.token}'
    write(state.project/'connection.json',{'url':url,'pid':os.getpid()})
    print('Legacy UI Studio: '+url,flush=True)
    if open_browser: webbrowser.open(url)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
