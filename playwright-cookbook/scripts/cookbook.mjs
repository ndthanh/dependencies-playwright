import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {randomUUID,createHash} from 'node:crypto';
import {writeFailureReport} from './reporting.mjs';
const root=path.resolve(import.meta.dirname,'..');
const [command,...raw]=process.argv.slice(2);const args=[...raw],options={};
let scenario='';if(command==='scenario'){scenario=args.shift()||'';if(!/^[a-z0-9_]+$/.test(scenario))throw Error('Use: run-scenario.cmd scenario_id [--data dataset_id]');}
const allowed=new Set(['data','url','workbook','video','screenshots','last-screenshot','error-screenshot','slowmo','executor','port','workflow','run-timeout']);
for(let i=0;i<args.length;i++){const key=args[i].replace(/^--/,'');if(key==='headless'){options[key]=true;continue;}if(!args[i].startsWith('--')||!allowed.has(key)||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid argument: '+args[i]);options[key]=args[++i];}
for(const key of ['video','screenshots','last-screenshot','error-screenshot'])if(options[key]&&!['0','1'].includes(options[key]))throw Error('--'+key+' must be 0 or 1');
const port=Number(options.port||8798);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
const runTimeout=Number(options['run-timeout']||900);if(!Number.isInteger(runTimeout)||runTimeout<10||runTimeout>86400)throw Error('--run-timeout must be 10..86400 seconds');
if(options.slowmo!==undefined&&(!Number.isInteger(Number(options.slowmo))||Number(options.slowmo)<0||Number(options.slowmo)>10000))throw Error('--slowmo must be 0..10000 ms');
const url=(options.url||'http://127.0.0.1:'+port).replace(/\/$/,'');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function init(){
 if(Number(process.versions.node.split('.')[0])<22)throw Error('Node.js 22+ required');
 const project=read(path.join(root,'project.json'));
 Object.assign(project,{ProjectDirectory:root,ProjectFilePath:path.join(root,'project.json'),ScreenshotsFolder:path.join(root,'.screenshots')});
 fs.writeFileSync(path.join(root,'project.json'),JSON.stringify(project,null,2)+'\n');
 for(const file of ['Main.xaml',...fs.readdirSync(path.join(root,'examples')).filter(x=>x.endsWith('.xaml')).map(x=>'examples/'+x)]){
  const target=path.join(root,file),content=fs.readFileSync(target,'utf8');
  fs.writeFileSync(target,content.replace(/(<this:[^>]+\.projectRoot>)[\s\S]*?(<\/this:[^>]+\.projectRoot>)/g,(_,a,b)=>a+xml(root)+b));
 }
 fs.mkdirSync(path.join(root,'results'),{recursive:true});
 const ffmpeg=path.join(root,'dependencies/ffmpeg-1011/ffmpeg-win64.exe');
 if(!fs.existsSync(ffmpeg))throw Error('Missing '+ffmpeg);
 const manifest=read(path.join(root,'dependencies/ffmpeg-1011.sha256.json'));
 if(createHash('sha256').update(fs.readFileSync(ffmpeg)).digest('hex')!==manifest.sha256)throw Error('FFmpeg checksum mismatch');
 console.log('Project: '+root+'\nFFmpeg: '+ffmpeg);
}
function executor(){const candidates=[options.executor,process.env.AKABOT_EXECUTOR,...['ProgramFiles','ProgramFiles(x86)'].filter(k=>process.env[k]).map(k=>path.join(process.env[k],'FPT Software/akaBot Platform/BotExecutor.exe'))].filter(Boolean);const exe=candidates.find(x=>fs.existsSync(x));if(!exe)throw Error('BotExecutor not found. Pass --executor "C:\\...\\BotExecutor.exe"');return exe;}
const health=async()=>{try{const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(1500)});return (await r.json()).app==='browser-primitive-lab';}catch{return false;}};
let ownedServer=null;
async function ensureWeb(logDirectory){
 if(await health())return;
 if(options.url)throw Error('Website unavailable at '+url+'. Start init-web.cmd on the server.');
 const log=fs.openSync(path.join(logDirectory,'web.log'),'a');
 ownedServer=spawn(process.execPath,[path.join(root,'web/server.mjs')],{cwd:root,env:{...process.env,PORT:String(port)},stdio:['ignore',log,log],windowsHide:true});fs.closeSync(log);
 let spawnError;ownedServer.on('error',e=>spawnError=e);
 for(let i=0;i<60;i++){if(spawnError)throw spawnError;if(ownedServer.exitCode!==null)throw Error('Web server ended; see web.log');if(await health())return;await new Promise(r=>setTimeout(r,200));}
 throw Error('Web server startup timed out; see web.log');
}
async function run(){
 init();const exe=executor(),runId=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8),runDir=path.join(root,'results',runId);
 const lock=path.join(root,'results/executor.lock');let lockFd;
 try{lockFd=fs.openSync(lock,'wx');}catch{throw Error('Another cookbook run is active. If a prior process was killed, confirm it ended before deleting results\\executor.lock.');}
 fs.writeFileSync(lockFd,String(process.pid));
 let oldMain;const startedAtUtc=new Date().toISOString();let interrupted=false;
 try{
  fs.mkdirSync(runDir,{recursive:true});await ensureWeb(runDir);
  if(options.workflow){const chosen=path.resolve(root,options.workflow);if(!chosen.startsWith(root+path.sep)||!fs.existsSync(chosen)||!chosen.endsWith('.xaml'))throw Error('Workflow must be an existing .xaml inside the cookbook');const p=read(path.join(root,'project.json'));oldMain=p.MainWorkflow;p.MainWorkflow=path.relative(root,chosen);fs.writeFileSync(path.join(root,'project.json'),JSON.stringify(p,null,2));}
  const env={...process.env,COOKBOOK_ROOT:root,COOKBOOK_RUN_DIR:runDir,COOKBOOK_URL:url,COOKBOOK_VIDEO:options.video||'1',COOKBOOK_SCREENSHOTS:options.screenshots||'1',COOKBOOK_LAST:options['last-screenshot']||'1',COOKBOOK_ERROR_SHOT:options['error-screenshot']||'1',COOKBOOK_HEADLESS:options.headless?'1':'0',COOKBOOK_SLOWMO:options.slowmo||'100',PLAYWRIGHT_BROWSERS_PATH:path.join(root,'dependencies')};
  if(!options.workflow||command==='scenario')env.COOKBOOK_SCENARIO=scenario;
  if(options.data)env.COOKBOOK_DATA=options.data;
  if(options.workbook)env.COOKBOOK_WORKBOOK=path.resolve(options.workbook);
  console.log('RUN='+runDir+'\nBrowser: '+(options.headless?'headless':'headful')+'; video='+env.COOKBOOK_VIDEO);
  const fd=fs.openSync(path.join(runDir,'executor.log'),'w');let exit;
  try{exit=await new Promise((resolve,reject)=>{
   const p=spawn(exe,['-f',root,'-l','INFO'],{cwd:root,env,windowsHide:true,stdio:['ignore',fd,fd]});
   let timedOut=false;
   fs.writeFileSync(path.join(runDir,'launcher.json'),JSON.stringify({pid:p.pid,runTimeout,scenario,workflow:options.workflow||'Main.xaml',recordVideo:env.COOKBOOK_VIDEO==='1',screenshotEach:env.COOKBOOK_SCREENSHOTS==='1',screenshotLast:env.COOKBOOK_LAST==='1',headless:!!options.headless},null,2));
   const timer=setTimeout(()=>{timedOut=true;interrupted=true;console.error('Run timeout reached; stopping this executor process tree.');spawn('taskkill.exe',['/PID',String(p.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('error',()=>p.kill());},runTimeout*1000);
   p.once('error',e=>{clearTimeout(timer);reject(e);});p.once('exit',code=>{clearTimeout(timer);if(timedOut)reject(Error('Run exceeded '+runTimeout+' seconds; see '+runDir));else resolve(code);});
  });}finally{fs.closeSync(fd);}
  const resultFile=path.join(runDir,'results.json');
  if(!fs.existsSync(resultFile)){console.error(fs.readFileSync(path.join(runDir,'executor.log'),'utf8').split(/\r?\n/).slice(-50).join('\n'));throw Error('BotExecutor did not complete results.json (exit '+exit+'). Inspect executor.log and fatal.log; if workflow did not start, resolve project dependencies in Studio.');}
  const result=read(resultFile);
  fs.writeFileSync(path.join(runDir,'executor-exit.json'),JSON.stringify({exitCode:exit,finishedAtUtc:new Date().toISOString()}));
  if(exit!==0&&result.passed){
   writeFailureReport(runDir,Error('Workflow reported success but BotExecutor exited with '+exit+'. Inspect executor.log.'),{startedAtUtc});
   throw Error('Executor exit disagrees with workflow result. See '+path.join(runDir,'report.html'));
  }
  console.log('REPORT='+path.join(runDir,'report.html'));console.log('passed='+result.passed+'; scenarios='+result.outcomes.length+'; failures='+result.failures);
  if(exit!==0||!result.passed)throw Error('Run failed. '+(result.fatalError||result.cleanupError||'See report for unexpected outcomes.'));
 }catch(error){
  if(interrupted||!fs.existsSync(path.join(runDir,'results.json'))){
   writeFailureReport(runDir,error,{status:interrupted?'Aborted':'Failed',startedAtUtc});
   console.error('REPORT='+path.join(runDir,'report.html'));
  }
  throw error;
 }finally{
  if(ownedServer){ownedServer.kill();ownedServer=null;}
  if(oldMain!==undefined){const p=read(path.join(root,'project.json'));p.MainWorkflow=oldMain;fs.writeFileSync(path.join(root,'project.json'),JSON.stringify(p,null,2));}
  fs.closeSync(lockFd);fs.unlinkSync(lock);
 }
}
try{
 if(command==='init')init();
 else if(command==='web'){
  init();console.log('Open '+url+' . Keep this CMD window open; Ctrl+C stops the web.');
  const p=spawn(process.execPath,[path.join(root,'web/server.mjs')],{cwd:root,env:{...process.env,PORT:String(port)},stdio:'inherit',windowsHide:true});p.on('error',e=>{console.error(e.message);process.exitCode=1;});p.on('exit',c=>process.exitCode=c||0);
 }else if(command==='full'||command==='scenario')await run();
 else throw Error('Use init, web, full or scenario.');
}catch(e){console.error('ERROR: '+e.message);process.exitCode=1;}
