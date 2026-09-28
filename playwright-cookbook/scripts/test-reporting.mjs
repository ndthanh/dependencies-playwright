import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildHistory,writeFailureReport,readJson} from './reporting.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cookbook-report-test-'));
const now=new Date('2026-09-29T10:00:00Z');
for(const [id,age] of [['today',.5],['week',3],['month',20],['old',45]]){
 const dir=path.join(root,id);fs.mkdirSync(dir);
 fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({runId:id,startedAtUtc:new Date(now-age*86400000).toISOString(),passed:id==='today',executionStatus:'Completed',businessStatus:id==='week'?'Incomplete':'NotApplicable',summary:{retries:1}}));
 fs.writeFileSync(path.join(dir,'report.html'),'fixture');
}
assert.equal(buildHistory(root,1,now).summary.runs,1);
assert.equal(buildHistory(root,7,now).summary.runs,2);
assert.equal(buildHistory(root,30,now).summary.runs,3);
assert.equal(buildHistory(root,7,now).summary.businessIncomplete,1);
const aborted=path.join(root,'aborted');fs.mkdirSync(aborted);
fs.writeFileSync(path.join(aborted,'events.jsonl'),JSON.stringify({eventType:'step_attempt_started',invocation:'abc',step:'5'})+'\n{"partial":');
fs.writeFileSync(path.join(aborted,'outcomes-progress.json'),JSON.stringify([{scenario:'login',passed:'True',actual:'PASS'}]));
const result=writeFailureReport(aborted,new Error('<script>bad</script>'),{status:'Aborted'});
assert.equal(result.passed,false);assert.equal(result.executionStatus,'Aborted');assert.equal(result.outcomes.length,1);assert.equal(result.lastEvent.step,'5');assert.equal(result.artifactStatus,'Incomplete');
assert.ok(!fs.readFileSync(path.join(aborted,'report.html'),'utf8').includes('<script>bad</script>'));
assert.equal(readJson(path.join(aborted,'results.json')).testStatus,'Incomplete');
console.log('Reporting tests passed: 24h/7d/30d windows, partial-event recovery, checkpoint preservation, HTML escaping. Fixtures: '+root);
