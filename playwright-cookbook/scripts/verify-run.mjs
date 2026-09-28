import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const directory=path.resolve(process.argv[2]||'');
const read=f=>JSON.parse(fs.readFileSync(path.join(directory,f),'utf8'));
const r=read('results.json'),events=fs.readFileSync(path.join(directory,'events.jsonl'),'utf8').trim().split(/\r?\n/).map(s=>JSON.parse(s));
const schema=JSON.parse(fs.readFileSync(new URL('../contracts/event.schema.json',import.meta.url),'utf8'));
const ids=new Set();
for(const e of events){
 for(const key of schema.required)assert.ok(Object.hasOwn(e,key),'Missing event field '+key);
 assert.equal(e.schemaVersion,'1.0');assert.equal(e.runId,r.runId);assert.ok(!ids.has(e.eventId),'Duplicate event id');ids.add(e.eventId);
 assert.ok(schema.properties.eventType.enum.includes(e.eventType),'Unknown event type');assert.ok(schema.properties.severity.enum.includes(e.severity));assert.ok(Number.isFinite(Date.parse(e.time)));
 assert.ok(Number.isInteger(e.durationMs)&&e.durationMs>=0);
 if(e.eventType==='retry_scheduled'){assert.equal(e.code,'RETRYABLE');assert.ok(e.attempt<e.maxAttempts);assert.ok(e.retryDelayMs>0);}
}
assert.ok(events.some(e=>['run_finished','run_interrupted'].includes(e.eventType)),'Missing terminal event');
for(const outcome of r.outcomes){
 const matching=events.filter(e=>e.invocation===outcome.invocation);
 if(r.testStatus==='Incomplete')continue;
 assert.equal(matching.filter(e=>e.eventType==='scenario_started').length,1);
 assert.equal(matching.filter(e=>e.eventType==='scenario_finished').length,1);
 assert.equal(matching.filter(e=>e.eventType==='step_attempt_finished').length,Number(outcome.attempts));
 assert.equal(matching.filter(e=>e.eventType==='retry_scheduled').length,Number(outcome.retries));
 assert.equal(matching.filter(e=>e.eventType==='step_skipped').length,Number(outcome.skipped_steps));
}
for(const artifact of r.artifacts){
 const file=path.resolve(directory,artifact.path);assert.ok(file.startsWith(directory+path.sep));
 const bytes=fs.readFileSync(file);assert.equal(bytes.length,artifact.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.sha256);
 for(const eventId of artifact.eventIds||[])assert.ok(ids.has(eventId));
}
const html=fs.readFileSync(path.join(directory,'report.html'),'utf8');
for(const match of html.matchAll(/(?:href|src)='([^']+)'/g)){
 const target=match[1];if(target.startsWith('#')||target.includes('://'))continue;
 assert.ok(fs.existsSync(path.join(directory,target.replaceAll('&#39;',"'").replaceAll('&amp;','&'))),'Broken report link: '+target);
}
for(const file of ['events.jsonl','run.log','results.json','report.html']){
 const text=fs.readFileSync(path.join(directory,file),'utf8');
 for(const secret of ['DemoOnly!2026','wrong-password',...Array.from({length:6},(_,i)=>'BranchDemo!'+String(i+1).padStart(2,'0'))])assert.ok(!text.includes(secret),file+' leaked fixture credential');
}
console.log(JSON.stringify({runId:r.runId,events:events.length,summary:r.summary,business:r.businessSummary,artifactCount:r.artifacts.length,verified:true},null,2));
