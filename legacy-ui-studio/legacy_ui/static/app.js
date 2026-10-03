'use strict';
const $=id=>document.getElementById(id);
const token=location.hash.slice(1)||sessionStorage.getItem('legacyToken')||'';
if(token)sessionStorage.setItem('legacyToken',token);
history.replaceState(null,'',location.pathname);
let windows=[],snapshot=null,snapshotId=null,nodes=new Map(),selectedNode=null,selectors={},actions=[],selectedStep=-1,busy=false,stepStates={};
const labels={fill:'Fill',send_keys:'Send keys',legacy_set_value:'MSAA value',legacy_default:'MSAA action',set_value:'Set value',invoke:'Invoke',click:'Click',type_text:'Type text',key:'Send keys',wait:'Wait',sleep:'Delay',highlight:'Highlight'};
let imageAnchor=null,anchorImage=null,anchorCrop=null,anchorPoint=null,anchorStart=null;
function element(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function notice(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);}
function log(text){if($('log').textContent==='Ready. No activity has run.')$('log').textContent='';$('log').textContent+=text+'\n';$('log').scrollTop=$('log').scrollHeight;}
async function api(path,data){const response=await fetch('/api/'+path,{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Error(result.error||response.statusText);return result;}
function setBusy(value){busy=value;document.querySelectorAll('button').forEach(b=>{if(!['stop','clear-log'].includes(b.id))b.disabled=value;});$('stop').disabled=!value;$('update').disabled=value||selectedStep<0;}
async function job(path,data,onEvents){if(busy)throw Error('An activity is already running.');setBusy(true);try{const started=await api(path,data);let seen='';while(true){const j=await api('jobs/'+started.job_id);if(onEvents&&JSON.stringify(j.events)!==seen){seen=JSON.stringify(j.events);onEvents(j.events);}if(j.status==='failed')throw Error(j.error);if(j.status==='completed')return j.result;await new Promise(r=>setTimeout(r,250));}}finally{setBusy(false);}}
function guarded(fn){return async()=>{try{await fn();}catch(e){notice(e.message,true);log('ERROR  '+e.message);}};}
let contextTarget=null;
const menu=$('node-menu');
function closeMenu(){menu.classList.add('hidden');}
async function openMenu(event){
  const summary=event.target.closest('.tree summary');if(!summary)return;
  event.preventDefault();if(busy)return;
  const id=summary.parentElement.dataset.node;
  if(selectedNode!==id)await choose(id);
  contextTarget={node:nodes.get(id),selector:JSON.parse($('selector-json').value)};
  $('menu-target').textContent=contextTarget.node.control_type+' · child['+contextTarget.node.child_index+'] · '+(contextTarget.node.class_name||'unnamed');
  menu.classList.remove('hidden');
  const bounds=summary.getBoundingClientRect();
  const x=event.type==='keydown'?bounds.left+24:event.clientX;
  const y=event.type==='keydown'?bounds.bottom:event.clientY;
  menu.style.left=Math.max(8,Math.min(x,innerWidth-menu.offsetWidth-8))+'px';
  menu.style.top=Math.max(8,Math.min(y,innerHeight-menu.offsetHeight-8))+'px';
  $('menu-highlight').focus();
}
$('tree').addEventListener('contextmenu',event=>{openMenu(event).catch(e=>notice(e.message,true));});
$('tree').addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')openMenu(event).catch(e=>notice(e.message,true));});
document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))closeMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();});
window.addEventListener('resize',closeMenu);
menu.addEventListener('keydown',event=>{const items=[...menu.querySelectorAll('button')];const i=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();items[(i+(event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}});
$('menu-highlight').onclick=guarded(async()=>{closeMenu();const r=await job('highlight',{selector:contextTarget.selector});log('HIGHLIGHT\n'+r.trace.join('\n'));notice('Element resolved and highlighted.');});
$('menu-copy').onclick=guarded(async()=>{closeMenu();const text=JSON.stringify(contextTarget.selector,null,2);try{await navigator.clipboard.writeText(text);}catch{const field=$('selector-json');field.value=text;field.focus();field.select();if(!document.execCommand('copy'))throw Error('Clipboard unavailable. Selector selected; press Ctrl+C.');}notice('Selector JSON copied. Paste it into your AI workflow conversation.');log('COPIED selector for '+contextTarget.node.class_name+' child['+contextTarget.node.child_index+']');});
function openTest(kind){
  closeMenu();const node=contextTarget.node;const patterns=node.patterns||[];
  $('test-title').textContent=kind==='fill'?'Test fill':kind==='keys'?'Test send keys':'Test click';
  $('test-target').textContent=node.control_type+' / '+node.class_name+' / child['+node.child_index+']';
  $('test-mode').replaceChildren();
  const options=kind==='keys'?[['send_keys','Send keyboard sequence to target',true]]:kind==='fill'?[['fill','Fill · focus / click + keyboard',true],['set_value','SetValue · UIA / Win32',patterns.includes('Value')||patterns.includes('Win32Text')],['legacy_set_value','SetValue · MSAA',patterns.includes('LegacyIAccessible')]]:[['invoke','Invoke · UIA / Win32',patterns.includes('Invoke')||patterns.includes('Win32Click')],['legacy_default','Default action · MSAA',patterns.includes('LegacyIAccessible')],['click','Click · physical mouse',true]];
  for(const [value,text,enabled] of options){const o=element('option','',text+(enabled?'':' (unavailable)'));o.value=value;o.disabled=!enabled;$('test-mode').append(o);}
  $('test-mode').value=options.find(o=>o[2])[0];
  $('test-value-label').classList.toggle('hidden',kind==='click');
  $('test-activation').value=$('activation').value;
  $('test-clear').checked=$('clear-first').checked;
  $('test-value').placeholder=kind==='keys'?'Ctrl+A; Backspace; Tab':'Enter test text';
  $('test-keyboard').classList.toggle('hidden',kind==='click');
  $('test-clear-label').classList.toggle('hidden',kind!=='fill');
  $('test-value').value='';
  $('test-help').textContent='Runs once. Click activation uses the point/image anchor configured in the activity editor. Keys: Ctrl+A; Backspace; Enter. Focus must stay within the target.';
  $('test-dialog').showModal();
  if(kind==='fill')$('test-value').focus();
}
$('menu-fill').onclick=()=>openTest('fill');$('menu-click').onclick=()=>openTest('click');$('menu-keys').onclick=()=>openTest('keys');
for(const id of ['test-close','test-cancel'])$(id).onclick=()=>$('test-dialog').close();
$('test-form').onsubmit=event=>{event.preventDefault();guarded(async()=>{const mode=$('test-mode').value;const payload={selector:contextTarget.selector,mode,value:$('test-value').value};if(['fill','send_keys','click'].includes(mode))Object.assign(payload,pointerOptions());if(['fill','send_keys'].includes(mode))Object.assign(payload,{activation:$('test-activation').value,clear_first:$('test-clear').checked,allow_descendant_focus:$('descendant-focus').checked,settle_seconds:Number($('settle').value)});$('test-dialog').close();notice('Testing '+payload.mode+' on the selected element…');const result=await job('test',payload);log('TEST PASSED '+payload.mode+'\n'+result.steps.map(s=>s.trace.join('\n')).join('\n'));notice('Test completed: '+payload.mode+'. Check the target application result.');})();};
async function loadState(){const s=await api('state');selectors=s.selectors;actions=s.workflow.actions||[];renderTargets();renderSteps();$('connection').textContent='Connected · local agent';}
async function refresh(){notice('Finding desktop windows…');windows=(await job('windows',{})).filter(w=>w.native_window_handle&&w.name);$('apps').replaceChildren();for(const w of windows){const o=element('option','',w.name+' · '+w.process_name);o.value=w.native_window_handle;$('apps').append(o);}const demo=windows.find(w=>w.name==='Legacy Pane Lab');if(demo)$('apps').value=demo.native_window_handle;notice('Choose your application and click Inspect tree.');}
async function inspect(){if(!$('apps').value)throw Error('Choose an application.');notice('Reading the live UI Automation tree…');const r=await job('dump',{hwnd:Number($('apps').value),view:$('view').value});snapshot=r.snapshot;snapshotId=r.snapshot_id;nodes=new Map(snapshot.nodes.map(n=>[n.node_id,n]));selectedNode=null;renderTree();$('node-count').textContent=nodes.size+' nodes';notice('Tree inspected. Select a control, save its selector, then choose an activity.');}
function renderTree(){if(!snapshot)return;const query=$('search').value.toLowerCase();$('tree').replaceChildren();const relevant=n=>[n.name,n.class_name,n.control_type].some(v=>String(v||'').toLowerCase().includes(query));const hasMatch=n=>relevant(n)||n.children.some(id=>hasMatch(nodes.get(id)));function row(n){if(query&&!hasMatch(n))return null;const d=element('details');d.dataset.node=n.node_id;d.open=query||n.parent_id===null||n.class_name==='LegacyForm';const s=element('summary');if(selectedNode===n.node_id)s.classList.add('active');s.append(element('span','node-index','['+n.child_index+']'),element('span','node-type',n.control_type),element('span','',n.name||n.class_name||'(unnamed)'));s.addEventListener('click',guarded(async()=>{if(busy)return;await choose(n.node_id); }));d.append(s);for(const child of n.children){const c=row(nodes.get(child));if(c)d.append(c);}return d;}const root=row(snapshot.nodes[0]);if(root)$('tree').append(root);}
async function choose(id){selectedNode=id;const n=nodes.get(id);document.querySelectorAll('.tree summary').forEach(e=>e.classList.toggle('active',e.parentElement.dataset.node===id));$('properties').replaceChildren();for(const [key,value] of [['TYPE',n.control_type+' / '+n.class_name],['NAME',n.name||'(empty)'],['AUTOMATION ID',n.automation_id||'(empty)'],['CHILD INDEX',String(n.child_index)],['CONTROL ID',String(n.control_id??'—')],['MSAA ROLE',String(n.legacy?.role??'—')],['MSAA ACTION',n.legacy?.default_action||'—']]){const row=element('div','prop-row');row.append(element('span','',key),element('strong','',value));$('properties').append(row);}const chips=element('div','chips');for(const p of n.patterns||[])chips.append(element('span','chip',p));$('properties').append(chips);const s=await api('generate',{snapshot_id:snapshotId,node_id:id});$('selector-json').value=JSON.stringify(s,null,2);$('selector-name').value=(n.class_name||'control').replace(/[^a-zA-Z0-9_-]/g,'_').toLowerCase()+'_'+n.child_index;const patterns=n.patterns||[];$('action').value=patterns.includes('Value')||patterns.includes('Win32Text')?'fill':patterns.includes('Invoke')||patterns.includes('Win32Click')?'invoke':'click';imageAnchor=null;$('position-mode').value='center';$('anchor-summary').textContent='No image anchor selected.';strategy();notice('Selected '+n.control_type+' at child['+n.child_index+']. Review the selector and save it.');}
function renderTargets(){const before=$('target').value;$('target').replaceChildren();for(const name of Object.keys(selectors).sort()){const o=element('option','',name);o.value=name;$('target').append(o);}if(selectors[before])$('target').value=before;}
async function saveSelector(){const name=$('selector-name').value.trim();const selector=JSON.parse($('selector-json').value);await api('selector',{name,selector});selectors[name]=selector;renderTargets();$('target').value=name;notice('Selector saved: '+name);log('SAVED selector '+name);}
function strategy(){
 const a=$('action').value;const keyboard=['fill','send_keys','key','type_text'].includes(a);
 $('wait-fields').classList.toggle('hidden',a!=='wait');
 $('value-label').classList.toggle('hidden',['invoke','legacy_default','click','highlight'].includes(a));
 $('keyboard-fields').classList.toggle('hidden',!keyboard);
 $('clear-label').classList.toggle('hidden',a!=='fill');$('verify-label').classList.toggle('hidden',a!=='fill');
 $('pointer-fields').classList.toggle('hidden',!['click','highlight'].includes(a)&&!(keyboard&&$('activation').value==='click'));
 $('offset-fields').classList.toggle('hidden',!['relative_pixels','relative_ratio'].includes($('position-mode').value));
 $('anchor-fields').classList.toggle('hidden',$('position-mode').value!=='anchor');
 $('strategy').textContent={fill:'Focus or click, confirm focused input inside target, optionally clear, then type Unicode once. Verification is optional.',send_keys:'Send chords in order: Ctrl+A; Backspace; Enter. Stops if focus leaves the target. Use separate activities for different targets.',set_value:'Writable ValuePattern or standard Win32 Edit message; verifies the resulting value.',invoke:'InvokePattern or standard Win32 Button message.',legacy_set_value:'MSAA LegacyIAccessible.SetValue with value verification.',legacy_default:'MSAA default action, sent once.',click:'Mouse click at center, Pane offset, or a unique image anchor.',type_text:'Type literal Unicode without clearing.',key:'One chord or semicolon-separated chords.',wait:'Poll until the selected state passes.',sleep:'Delay in seconds.',highlight:'Draw the target outline and configured click point.'}[a];
 $('value').placeholder=a==='sleep'?'Seconds':a==='send_keys'||a==='key'?'Ctrl+A; Backspace; Enter':'Text or expected value';
}
function pointerOptions(){
 const mode=$('position-mode').value;if(mode==='center')return {};
 if(mode==='anchor'){if(!imageAnchor)throw Error('Capture an image anchor first.');return {image_anchor:{...imageAnchor,threshold:Number($('anchor-threshold').value)}};}
 return {position:{mode,x:Number($('offset-x').value),y:Number($('offset-y').value)}};
}
function makeAction(){
 const kind=$('action').value;const a={action:kind};
 if(kind==='sleep')a.seconds=Number($('value').value||1);
 else{
  if(!$('target').value)throw Error('Save or choose a selector first.');a.target=$('target').value;
  if(['set_value','legacy_set_value','fill','type_text','key','send_keys','wait'].includes(kind))a.value=$('value').value;
  if(['fill','type_text','key','send_keys'].includes(kind)){
   Object.assign(a,{activation:$('activation').value,allow_descendant_focus:$('descendant-focus').checked,settle_seconds:Number($('settle').value)});
   if(kind==='fill')Object.assign(a,{clear_first:$('clear-first').checked,verify_value:$('verify-value').checked});
  }
  if(['click','highlight'].includes(kind)||a.activation==='click')Object.assign(a,pointerOptions());
  if(kind==='wait')Object.assign(a,{condition:$('condition').value,wait_seconds:Number($('timeout').value),poll_seconds:Number($('poll').value)});
 }
 return a;
}
async function saveFlow(){await api('workflow',{actions});$('saved-label').textContent='Saved '+new Date().toLocaleTimeString();}
function selectStep(i){selectedStep=i;const a=actions[i];$('action').value=a.action;$('target').value=a.target||'';$('value').value=a.value??a.seconds??'';$('condition').value=a.condition||'exists';$('timeout').value=a.wait_seconds??10;$('poll').value=a.poll_seconds??.2;$('activation').value=a.activation||'focus';$('clear-first').checked=a.clear_first??true;$('verify-value').checked=a.verify_value??false;$('descendant-focus').checked=a.allow_descendant_focus??true;$('settle').value=a.settle_seconds??.1;$('position-mode').value=a.image_anchor?'anchor':a.position?.mode||'center';$('offset-x').value=a.position?.x??0;$('offset-y').value=a.position?.y??0;imageAnchor=a.image_anchor||null;$('anchor-threshold').value=imageAnchor?.threshold??.92;$('anchor-summary').textContent=imageAnchor?'Stored image anchor ready.':'No image anchor selected.';strategy();renderSteps();}
function renderSteps(){$('step-count').textContent=actions.length+' steps';$('steps').replaceChildren();$('update').disabled=selectedStep<0||busy;actions.forEach((a,i)=>{const r=element('div','step'+(i===selectedStep?' selected':'')+(stepStates[i]?' '+stepStates[i]:''));r.dataset.step=i;r.addEventListener('click',()=>{if(!busy)selectStep(i);});r.append(element('span','ordinal',stepStates[i]==='passed'?'✓':String(i+1).padStart(2,'0')));const info=element('div','step-info');info.append(element('div','step-title',labels[a.action]+(a.action==='wait'?' · '+a.condition:'')),element('div','step-target',(a.target||'')+(a.value!==undefined?' → '+JSON.stringify(a.value):a.seconds!==undefined?a.seconds+'s':'')));r.append(info);const buttons=element('div','step-controls');for(const [symbol,title,fn] of [['▷','Run step',()=>run([i])],['↑','Move up',async()=>{if(i>0){[actions[i-1],actions[i]]=[actions[i],actions[i-1]];selectedStep=i-1;renderSteps();await saveFlow();}}],['↓','Move down',async()=>{if(i<actions.length-1){[actions[i+1],actions[i]]=[actions[i],actions[i+1]];selectedStep=i+1;renderSteps();await saveFlow();}}],['×','Remove activity',async()=>{actions.splice(i,1);selectedStep=-1;renderSteps();await saveFlow();}]]){const b=element('button','',symbol);b.title=title;b.setAttribute('aria-label',title+' '+(i+1));b.disabled=busy;b.addEventListener('click',e=>{e.stopPropagation();guarded(fn)();});buttons.append(b);}r.append(buttons);$('steps').append(r);});}
async function run(indexes){if(!indexes.length)throw Error('Add or select an activity first.');notice('Running '+indexes.length+' activity(s)…');const announced=new Set();const result=await job('replay',{actions:indexes.map(i=>actions[i])},events=>{for(const event of events){const i=indexes[event.step];stepStates[i]=event.status;const key=i+event.status;if(!announced.has(key)){announced.add(key);log(event.status.toUpperCase()+' '+(i+1)+' '+event.label);if(event.trace)log('  '+event.trace.join('\n  '));}}renderSteps();});renderSteps();notice(result.stopped?'Stopped after the current activity.':'Playback complete · '+indexes.length+' activity(s) passed.');}
$('refresh').onclick=guarded(refresh);$('inspect').onclick=guarded(inspect);$('search').oninput=renderTree;$('action').onchange=strategy;
$('save-selector').onclick=guarded(saveSelector);$('highlight').onclick=guarded(async()=>{const result=await job('highlight',{selector:JSON.parse($('selector-json').value)});notice('Target resolved and highlighted.');log(result.trace.join('\n'));});
$('pick').onclick=guarded(async()=>{if(!snapshot)throw Error('Inspect tree first.');notice('Point at a control in the selected app. Picking in 3 seconds…');const hit=await job('pick',{hwnd:Number($('apps').value),view:snapshot.tree_view});for(const a of [...hit.ancestors].reverse()){const n=snapshot.nodes.find(n=>JSON.stringify(n.runtime_id)===JSON.stringify(a.runtime_id));if(n){await choose(n.node_id);renderTree();const item=document.querySelector('[data-node="'+n.node_id+'"]');let parent=item.parentElement;while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}item.scrollIntoView({block:'nearest'});return;}}throw Error('New element detected. Inspect tree again.');});
$('add').onclick=guarded(async()=>{actions.push(makeAction());selectedStep=actions.length-1;renderSteps();await saveFlow();notice('Activity added. Run it on its own or continue building the workflow.');});
$('update').onclick=guarded(async()=>{if(selectedStep<0)throw Error('Select a workflow activity.');actions[selectedStep]=makeAction();renderSteps();await saveFlow();});
$('try').onclick=guarded(async()=>{const a=makeAction();const r=await job('replay',{actions:[a]});log('TRY PASSED '+a.action+'\n'+r.reports[0].steps[0].trace.join('\n'));notice('Activity completed.');});
$('run-all').onclick=guarded(()=>run(actions.map((_,i)=>i)));$('run-selected').onclick=guarded(()=>run(selectedStep<0?[]:[selectedStep]));$('stop').onclick=guarded(async()=>{await api('stop',{});notice('Will stop after the current atomic activity.');});$('save-flow').onclick=guarded(saveFlow);$('clear-log').onclick=()=>{$('log').textContent='';};
$('target').onchange=()=>{const name=$('target').value;if(selectors[name]){$('selector-name').value=name;$('selector-json').value=JSON.stringify(selectors[name],null,2);}};
$('export').onclick=guarded(async()=>{await saveFlow();const r=await fetch('/api/export',{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error('Export failed');const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download='legacy-ui-project.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);notice('Project exported with workflow and selectors.');});
guarded(async()=>{await loadState();await refresh();strategy();})();

for(const id of ['activation','position-mode'])$(id).onchange=strategy;
const canvas=$('anchor-canvas');const ctx=canvas.getContext('2d');
function drawAnchor(){
 ctx.drawImage(anchorImage,0,0);ctx.lineWidth=3;
 if(anchorCrop){ctx.strokeStyle='#13b88a';ctx.strokeRect(anchorCrop.x,anchorCrop.y,anchorCrop.w,anchorCrop.h);}
 if(anchorPoint){ctx.strokeStyle='#ff6935';ctx.beginPath();ctx.arc(anchorPoint.x,anchorPoint.y,8,0,Math.PI*2);ctx.stroke();}
}
function canvasPoint(event){const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width-1,Math.round((event.clientX-r.left)*canvas.width/r.width))),y:Math.max(0,Math.min(canvas.height-1,Math.round((event.clientY-r.top)*canvas.height/r.height)))};}
canvas.onpointerdown=event=>{anchorStart=canvasPoint(event);canvas.setPointerCapture(event.pointerId);};
canvas.onpointerup=event=>{
 if(!anchorStart)return;const end=canvasPoint(event);const w=Math.abs(end.x-anchorStart.x),h=Math.abs(end.y-anchorStart.y);
 if(w>=3&&h>=3){anchorCrop={x:Math.min(end.x,anchorStart.x),y:Math.min(end.y,anchorStart.y),w,h};anchorPoint={x:anchorCrop.x+Math.floor(w/2),y:anchorCrop.y+Math.floor(h/2)};}
 else if(anchorCrop)anchorPoint=end;
 anchorStart=null;drawAnchor();if(anchorCrop){for(const key of ['x','y','w','h'])$('crop-'+key).value=anchorCrop[key];$('point-x').value=anchorPoint.x;$('point-y').value=anchorPoint.y;}$('anchor-selection').textContent=anchorCrop?'Anchor '+anchorCrop.w+'×'+anchorCrop.h+'; click offset '+(anchorPoint.x-anchorCrop.x)+', '+(anchorPoint.y-anchorCrop.y):'Drag a rectangle of at least 3×3 pixels.';
};
$('capture-anchor').onclick=guarded(async()=>{
 const name=$('target').value;if(!selectors[name])throw Error('Save/select the Pane selector first.');
 notice('Bring the target Pane to the foreground. Capturing in 3 seconds…');
 const result=await job('capture',{selector:selectors[name]});
 anchorImage=new Image();await new Promise((resolve,reject)=>{anchorImage.onload=resolve;anchorImage.onerror=reject;anchorImage.src='data:image/png;base64,'+result.png;});
 canvas.width=anchorImage.width;canvas.height=anchorImage.height;anchorCrop=null;anchorPoint=null;for(const id of ['crop-x','crop-y','crop-w','crop-h','point-x','point-y'])$(id).value='';drawAnchor();$('anchor-dialog').showModal();
});
$('anchor-close').onclick=()=>$('anchor-dialog').close();
function updateAnchorFromFields(){
 const r={};for(const key of ['x','y','w','h'])r[key]=Number($('crop-'+key).value);
 if(!Object.values(r).every(Number.isInteger)||r.x<0||r.y<0||r.w<3||r.h<3||r.x+r.w>canvas.width||r.y+r.h>canvas.height){anchorCrop=null;$('anchor-selection').textContent='Enter a crop inside the captured Pane (minimum 3×3).';return;}
 const p={x:$('point-x').value===''?r.x+Math.floor(r.w/2):Number($('point-x').value),y:$('point-y').value===''?r.y+Math.floor(r.h/2):Number($('point-y').value)};
 if(p.x<0||p.y<0||p.x>=canvas.width||p.y>=canvas.height)throw Error('Click point outside Pane.');
 anchorCrop=r;anchorPoint=p;drawAnchor();$('anchor-selection').textContent='Anchor '+r.w+'×'+r.h+'; offset '+(p.x-r.x)+', '+(p.y-r.y);
}
for(const id of ['crop-x','crop-y','crop-w','crop-h','point-x','point-y'])$(id).onchange=guarded(async()=>updateAnchorFromFields());
$('anchor-use').onclick=guarded(async()=>{
 updateAnchorFromFields();
 if(!anchorCrop)throw Error('Drag to select an image anchor first.');
 const crop=document.createElement('canvas');crop.width=anchorCrop.w;crop.height=anchorCrop.h;
 crop.getContext('2d').drawImage(anchorImage,anchorCrop.x,anchorCrop.y,anchorCrop.w,anchorCrop.h,0,0,crop.width,crop.height);
 imageAnchor={template_png:crop.toDataURL('image/png').split(',')[1],offset:[anchorPoint.x-anchorCrop.x,anchorPoint.y-anchorCrop.y],threshold:Number($('anchor-threshold').value)};
 $('anchor-summary').textContent='Anchor '+crop.width+'×'+crop.height+'; offset '+imageAnchor.offset.join(', ');$('anchor-dialog').close();notice('Image anchor ready. Save/update the activity to persist it.');
});
