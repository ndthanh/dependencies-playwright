import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
export const readJson=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{return fallback;}};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const page=(title,body)=>`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title><style>body{font:15px Segoe UI,sans-serif;margin:32px;color:#18324c}table{border-collapse:collapse;width:100%}td,th{padding:10px;border-bottom:1px solid #ccc;text-align:left}th{background:#19334c;color:white}pre{white-space:pre-wrap}.error{background:#ffe5e5;padding:16px}a{color:#2458ac}</style><h1>${escape(title)}</h1>${body}</html>`;
export function writeFailureReport(runDir,error,{status='Failed',startedAtUtc=new Date().toISOString()}={}){
 fs.mkdirSync(runDir,{recursive:true});
 const metadata=readJson(path.join(runDir,'run.json'),{});
 const outcomes=readJson(path.join(runDir,'outcomes-progress.json'),[]);
 const events=[];let damagedRecords=0;
 if(fs.existsSync(path.join(runDir,'events.jsonl')))for(const line of fs.readFileSync(path.join(runDir,'events.jsonl'),'utf8').split(/\r?\n/).filter(Boolean)){
  try{events.push(JSON.parse(line));}catch{damagedRecords++;}
 }
 const artifacts=[];
 for(const kind of ['screenshots','videos','downloads']){
  const directory=path.join(runDir,kind);if(!fs.existsSync(directory))continue;
  for(const file of fs.readdirSync(directory,{withFileTypes:true}).filter(f=>f.isFile())){
   const bytes=fs.readFileSync(path.join(directory,file.name));
   artifacts.push({path:`${kind}/${file.name}`,kind,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),finalization:'Unverified'});
  }
 }
 const started=metadata.startedAtUtc||startedAtUtc,finished=new Date().toISOString();
 const lastEvent=events.at(-1)||null;
 const result={schemaVersion:'1.0',runId:path.basename(runDir),startedAtUtc:started,finishedAtUtc:finished,durationMs:Math.max(0,Date.parse(finished)-Date.parse(started)),executionStatus:status,testStatus:'Incomplete',businessStatus:'Unknown',artifactStatus:'Incomplete',passed:false,failures:1,fatalError:String(error.message||error),cleanupError:'',summary:{scenarios:outcomes.length,unexpectedFailures:1,expectedFailures:outcomes.filter(o=>o.passed==='True'&&o.actual!=='PASS').length,attempts:events.filter(e=>e.eventType==='step_attempt_finished').length,retries:events.filter(e=>e.eventType==='retry_scheduled').length,skippedSteps:events.filter(e=>e.eventType==='step_skipped').length,warnings:1+damagedRecords},warnings:['Run did not finalize normally. Business outcomes and media may be incomplete.'],configuration:metadata,outcomes,branches:readJson(path.join(runDir,'branches-progress.json'),[]),artifacts,lastEvent};
 const finalEvent={schemaVersion:'1.0',runId:result.runId,bot:'PlaywrightCookbook',host:'launcher',eventId:randomUUID().replaceAll('-',''),time:finished,eventType:'run_interrupted',severity:'Error',state:status,code:status==='Aborted'?'RUN_TIMEOUT':'EXECUTOR_INCOMPLETE',error:result.fatalError,scenario:'',invocation:'',data:'',caseId:'',round:'',step:'',name:'',action:'',attempt:0,maxAttempts:0,durationMs:result.durationMs,runElapsedMs:result.durationMs,screenshot:'',video:'',artifacts:[]};
 for(const file of ['events.jsonl','run.log']){
  const target=path.join(runDir,file),existing=fs.existsSync(target)?fs.readFileSync(target):Buffer.alloc(0);
  fs.appendFileSync(target,(existing.length&&existing.at(-1)!==10?'\n':'')+JSON.stringify(finalEvent)+'\n');
 }
 for(const [file,value] of [['results.json',result],['artifacts.json',artifacts],['current.json',finalEvent]])fs.writeFileSync(path.join(runDir,file),JSON.stringify(value,null,2));
 const links=['executor.log','events.jsonl','results.json','artifacts.json','fatal.log'].filter(f=>fs.existsSync(path.join(runDir,f))).map(f=>`<a href="${f}">${f}</a>`).join(' · ');
 fs.writeFileSync(path.join(runDir,'report.html'),page('Bot run did not complete',`<p>Run: ${escape(result.runId)}</p><p class="error">${escape(status)} · Test: Incomplete · Business: Unknown · Artifacts: Incomplete</p><pre>${escape(result.fatalError)}</pre><p>${escape(result.warnings[0])}</p><h2>Last event before interruption</h2><pre>${escape(JSON.stringify(lastEvent,null,2))}</pre><h2>Completed scenario checkpoints (${outcomes.length})</h2><pre>${escape(JSON.stringify(outcomes,null,2))}</pre><h2>Artifacts (finalization unverified)</h2><ul>${artifacts.map(a=>`<li><a href="${escape(a.path)}">${escape(a.path)}</a> (${a.bytes} bytes)</li>`).join('')}</ul><p>${links}</p>`));
 return result;
}
export function buildHistory(resultsRoot,days=1,now=new Date()){
 if(!Number.isInteger(days)||days<1||days>3650)throw Error('--days must be 1..3650');
 const cutoff=now.getTime()-days*86400000,runs=[],unreadable=[];
 fs.mkdirSync(resultsRoot,{recursive:true});
 for(const dir of fs.readdirSync(resultsRoot,{withFileTypes:true}).filter(d=>d.isDirectory())){
  const file=path.join(resultsRoot,dir.name,'results.json');if(!fs.existsSync(file))continue;
  const r=readJson(file,null);if(!r){unreadable.push(dir.name);continue;}
  if(Date.parse(r.startedAtUtc||r.finishedAtUtc)<cutoff||Date.parse(r.startedAtUtc||r.finishedAtUtc)>now.getTime())continue;
  runs.push({...r,folder:dir.name});
 }
 runs.sort((a,b)=>String(b.startedAtUtc||b.finishedAtUtc).localeCompare(String(a.startedAtUtc||a.finishedAtUtc)));
 const summary={generatedAtUtc:now.toISOString(),days,runs:runs.length,passed:runs.filter(r=>r.passed===true).length,failed:runs.filter(r=>r.passed!==true).length,businessIncomplete:runs.filter(r=>r.businessStatus==='Incomplete'||r.businessStatus==='Unknown').length,retries:runs.reduce((n,r)=>n+(r.summary?.retries||0),0),artifactIncomplete:runs.filter(r=>r.artifactStatus==='Incomplete').length,unreadable};
 fs.writeFileSync(path.join(resultsRoot,`history-${days}d.json`),JSON.stringify({summary,runs:runs.map(({artifacts,outcomes,...r})=>r)},null,2));
 const output=path.join(resultsRoot,`history-${days}d.html`);
 fs.writeFileSync(output,page(`Bot history · ${days} day(s)`,`<p>Window: ${escape(new Date(cutoff).toISOString())} → ${escape(now.toISOString())}. Lọc theo thời điểm bắt đầu run; đếm mỗi run, không cộng gộp hồ sơ trùng qua nhiều lần chạy.</p><pre>${escape(JSON.stringify(summary,null,2))}</pre><table><tr><th>Run</th><th>Execution</th><th>Test</th><th>Business</th><th>Retries</th><th>Artifacts</th></tr>${runs.map(r=>`<tr><td><a href="${encodeURIComponent(r.folder)}/report.html">${escape(r.runId)}</a></td><td>${escape(r.executionStatus||'Legacy')}</td><td>${escape(r.testStatus||r.passed)}</td><td>${escape(r.businessStatus||'Unknown')}</td><td>${r.summary?.retries??'?'}</td><td>${escape(r.artifactStatus||'Unknown')}</td></tr>`).join('')}</table>`));
 return {output,summary};
}
