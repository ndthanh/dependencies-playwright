// Real BotExecutor tests; no mock Playwright or custom runtime DLL.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const harness='results/qa/ObservabilityHarness.xaml';
if(!fs.existsSync(path.join(root,harness)))throw Error('Run node scripts/build-xaml.mjs --qa first');
const evidence=[];
async function run(name,scenario,extra=[],fault=''){
 const args=[path.join(root,'scripts/cookbook.mjs'),'scenario',scenario,'--video','0','--screenshots','0','--last-screenshot','0','--slowmo','0',...extra];
 let output='';const code=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,args,{cwd:root,env:{...process.env,COOKBOOK_QA_CASE:fault},windowsHide:true});p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);p.on('error',reject);p.on('exit',resolve);});
 const directory=output.match(/RUN=(.+)/)?.[1].trim();assert.ok(directory,output);
 const r=JSON.parse(fs.readFileSync(path.join(directory,'results.json'),'utf8'));
 const events=fs.readFileSync(path.join(directory,'events.jsonl'),'utf8').trim().split(/\r?\n/).map(x=>JSON.parse(x));
 const event=(type)=>events.filter(e=>e.eventType===type);
 const item={name,code,runId:r.runId,status:r.executionStatus,test:r.testStatus,artifacts:r.artifactStatus,summary:r.summary};evidence.push(item);console.log(JSON.stringify(item));
 return {r,events,event,code,directory};
}
let t=await run('retry_exhausted','tai_trang_thu_lai',['--workflow',harness,'--error-screenshot','0'],'retry_exhausted');
assert.equal(t.code,1);assert.equal(t.r.outcomes[0].actual,'RETRYABLE');assert.equal(t.r.summary.attempts,3);assert.equal(t.r.summary.retries,2);assert.equal(t.r.summary.skippedSteps,3);assert.deepEqual(t.event('retry_scheduled').map(e=>e.retryDelayMs),[300,600]);assert.match(t.r.outcomes[0].detail,/budget exhausted/);
t=await run('capture_failure','dang_nhap',['--workflow',harness,'--screenshots','1','--last-screenshot','1'],'capture_failure');
assert.equal(t.code,0);assert.equal(t.r.passed,true);assert.equal(t.r.artifactStatus,'Incomplete');assert.ok(t.event('artifact_warning').length>=5);assert.ok(t.events.every(e=>!e.screenshot));assert.equal(t.r.summary.retries,0);
t=await run('sensitive_failure','dang_nhap',['--workflow',harness,'--error-screenshot','0'],'sensitive_failure');
assert.equal(t.code,1);assert.equal(t.r.summary.retries,0);assert.equal(t.r.summary.skippedSteps,2);assert.match(t.r.outcomes[0].detail,/REDACTED/);
for(const file of ['events.jsonl','run.log','results.json','report.html','executor.log'])assert.ok(!fs.readFileSync(path.join(t.directory,file),'utf8').includes('DemoOnly!2026'),file+' leaked fixture password');
t=await run('snapshot_locked','dang_nhap',['--workflow',harness],'snapshot_locked');
assert.equal(t.code,0);assert.equal(t.r.passed,true);assert.equal(t.r.summary.retries,0);assert.ok(t.event('telemetry_warning').length>0);
t=await run('unexpected_business_error','dang_nhap',['--data','sai_mat_khau']);
assert.equal(t.code,1);assert.equal(t.r.outcomes[0].actual,'BUSINESS_ERROR');assert.equal(t.r.summary.retries,0);assert.equal(t.r.artifacts.filter(a=>a.kind==='screenshots').length,1);
t=await run('unknown_scenario','unknown_scenario');assert.equal(t.code,1);assert.equal(t.r.executionStatus,'Failed');assert.equal(t.r.outcomes.length,0);assert.equal(t.r.branches.length,0);
fs.writeFileSync(path.join(root,'results/qa/Malformed.xaml'),'<Activity>intentionally malformed QA fixture');
t=await run('workflow_load_failure','dang_nhap',['--workflow','results/qa/Malformed.xaml']);assert.equal(t.code,1);assert.equal(t.r.testStatus,'Incomplete');assert.equal(t.r.executionStatus,'Failed');assert.ok(t.event('run_interrupted').length===1);
t=await run('watchdog_timeout','dang_nhap',['--run-timeout','10','--slowmo','4000','--video','1']);assert.equal(t.code,1);assert.equal(t.r.executionStatus,'Aborted');assert.equal(t.r.artifactStatus,'Incomplete');assert.ok(t.event('run_interrupted').length===1);
fs.writeFileSync(path.join(root,'results/qa/observability-evidence.json'),JSON.stringify(evidence,null,2));console.log('All real BotExecutor observability checks passed.');
