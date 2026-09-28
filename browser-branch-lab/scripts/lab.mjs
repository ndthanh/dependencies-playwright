import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const root=path.resolve(import.meta.dirname,'..'),bot=path.join(root,'AkaBotBranchLab');
const [command,...args]=process.argv.slice(2),options={};
const boolFlags=new Set(['headless','trace','verify-only']);
const flags=new Set([...boolFlags,'executor','url','workbook','port','offline-feed','destination','packages','netstandard']);
for(let i=0;i<args.length;i++){
  if(!args[i].startsWith('--')||!flags.has(args[i].slice(2)))throw Error('Unknown argument: '+args[i]);
  const key=args[i].slice(2);if(boolFlags.has(key))options[key]=true;
  else{if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing value for '+args[i]);options[key]=args[++i];}
}
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const fileExists=file=>{try{return fs.statSync(file).isFile();}catch{return false;}};
const dirExists=file=>{try{return fs.statSync(file).isDirectory();}catch{return false;}};
const packageRoot=path.join(process.env.LOCALAPPDATA||'','akaBot','Packages');
const xmlEscape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const sha=async file=>{const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');};

function executor(){
  const explicit=options.executor||process.env.AKABOT_EXECUTOR;
  const candidates=explicit?[explicit]:[...['ProgramFiles','ProgramFiles(x86)'].filter(k=>process.env[k]).map(k=>path.join(process.env[k],'FPT Software','akaBot Platform','BotExecutor.exe'))];
  if(!explicit){const found=spawnSync('where.exe',['BotExecutor.exe'],{encoding:'utf8',windowsHide:true});if(found.status===0)candidates.push(...found.stdout.trim().split(/\r?\n/));}
  const result=candidates.find(fileExists);if(!result)throw Error('BotExecutor.exe not found. Install/activate akaBot or pass --executor "D:\\...\\BotExecutor.exe".');return path.resolve(result);
}
function prerequisites(){
  if(process.platform!=='win32')throw Error('The akaBot runner requires Windows.');
  if(Number(process.versions.node.split('.')[0])<22)throw Error('Node.js 22+ is required.');
  const exe=executor();
  const reg=spawnSync('reg.exe',['query','HKLM\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full','/v','Release'],{encoding:'utf8',windowsHide:true});
  const release=reg.stdout?.match(/Release\s+REG_DWORD\s+(0x[0-9a-f]+)/i)?.[1];
  if(!release||Number.parseInt(release,16)<528040)throw Error('.NET Framework 4.8+ is required.');
  const chrome=['ProgramFiles','ProgramFiles(x86)','LOCALAPPDATA'].filter(k=>process.env[k]).map(k=>path.join(process.env[k],'Google','Chrome','Application','chrome.exe'));
  if(!chrome.some(fileExists))throw Error('Install Google Chrome in its standard location.');
  const missing=Object.entries(readJson(path.join(bot,'project.json')).Dependencies).filter(([id,v])=>!dirExists(path.join(packageRoot,'Installed',id+'.'+v))&&!fileExists(path.join(packageRoot,id+'.'+v+'.nupkg')));
  if(missing.length)throw Error('Dependencies missing: '+missing.map(x=>x.join(' ')).join(', ')+'. Run restore-dependencies.cmd and resolve packages in akaBot Studio.');
  if(!fileExists(path.join(bot,'lib/BranchLab.Runtime.dll')))throw Error('Runtime DLL missing. Run rebuild-bot.cmd.');
  console.log('Prerequisites OK. Node '+process.version+'; BotExecutor: '+exe);return exe;
}
function initialize(){
  const filename=path.join(bot,'project.json'),project=readJson(filename);
  Object.assign(project,{ProjectDirectory:bot,ProjectFilePath:filename,ScreenshotsFolder:path.join(bot,'.screenshots')});
  fs.writeFileSync(filename,JSON.stringify(project,null,2)+'\n');
  const main=path.join(bot,'Main.xaml');let content=fs.readFileSync(main,'utf8');let changed=0;
  content=content.replace(/<Variable\b[^>]*\bName="projectRoot"[^>]*>/g,tag=>{changed++;if(!/\bDefault="[^"]*"/.test(tag))throw Error('projectRoot default missing');return tag.replace(/\bDefault="[^"]*"/,'Default="'+xmlEscape(bot)+'"');});
  if(changed!==1)throw Error('Expected one projectRoot variable in Main.xaml');fs.writeFileSync(main,content);
  fs.mkdirSync(path.join(bot,'Results'),{recursive:true});fs.mkdirSync(path.join(bot,'.screenshots'),{recursive:true});
  console.log('Configured project: '+filename);
}
async function child(exe,args,{env=process.env,stdio='inherit',cwd=root}={}){
  return await new Promise((resolve,reject)=>{const p=spawn(exe,args,{env,stdio,cwd,windowsHide:true});p.once('error',reject);p.once('exit',(code,signal)=>resolve({code,signal}));});
}
async function run(){
  initialize();const exe=prerequisites(),url=(options.url||'http://127.0.0.1:8789').replace(/\/$/,'');
  let health;try{const response=await fetch(url+'/api/health',{signal:AbortSignal.timeout(5000)});health=await response.json();}catch{throw Error('Lab server unavailable at '+url+'. Run start-web.cmd in another CMD window.');}
  if(health.app!=='browser-primitive-lab')throw Error('This URL is not the expected lab server.');
  const workbook=options.workbook?path.resolve(options.workbook):path.join(bot,'outputs/branch-lab/Branch-Scenarios.xlsx');if(!fileExists(workbook))throw Error('Workbook not found: '+workbook);
  const results=path.join(bot,'Results'),before=new Set(fs.readdirSync(results)),stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const log=path.join(results,'executor-'+stamp+'.log'),fd=fs.openSync(log,'w');
  const env={...process.env,BRANCH_TEST_MODE:'normal',BRANCH_HEADLESS:options.headless?'1':'0',BRANCH_TRACE:options.trace?'1':'0',BRANCH_WORKBOOK:workbook,BRANCH_URL:url};
  let result;try{result=await child(exe,['-f',bot,'-l','INFO'],{env,stdio:['ignore',fd,fd]});}finally{fs.closeSync(fd);}
  const fresh=fs.readdirSync(results,{withFileTypes:true}).filter(d=>d.isDirectory()&&!before.has(d.name));
  if(fresh.length!==1){
    let tail='';try{tail=fs.readFileSync(log,'utf8').split(/\r?\n/).filter(Boolean).slice(-80).join('\n');}catch{}
    const reason=fresh.length===0?'BotExecutor ended before BranchRuntime created a run folder. This usually means akaBot could not resolve/compile the workflow, or Main.xaml/project.json is not the project being executed.':`Found ${fresh.length} new run folders; do not run two executors concurrently in one extracted project.`;
    console.error('ERROR: '+reason);
    console.error('BotExecutor exit code: '+result.code+'; full log: '+log);
    if(tail)console.error('\n----- last 80 log lines -----\n'+tail+'\n----- end log -----');
    throw Error(reason+' See the log above.');
  }
  const folder=path.join(results,fresh[0].name),json=path.join(folder,'results.json');if(!fileExists(json))throw Error('No result file. See '+log);const record=readJson(json);
  console.log('BotExecutor exit='+result.code+'; status='+record.executionStatus+'; technicalErrors='+record.technicalErrors);
  console.log('REPORT='+path.join(folder,'report.html'));
  const dashboard=await child(process.execPath,[path.join(bot,'tools/build-dashboard.mjs')]);if(dashboard.code!==0)throw Error('Dashboard generation failed');
  if(result.code!==0||record.technicalErrors!==0||record.executionStatus!=='Completed')throw Error('Bot failed. See '+json);
}
async function restore(){
  const destination=path.resolve(options.destination||packageRoot),manifest=readJson(path.join(root,'dependencies.json'));
  if(!options['verify-only'])fs.mkdirSync(destination,{recursive:true});
  for(const p of manifest){
    const target=path.join(destination,p.file);
    if(fileExists(target)){if(await sha(target)!==p.sha256)throw Error('Existing package has a different checksum; not overwritten: '+target);console.log('Verified '+p.file);continue;}
    if(p.source==='akabot-installation'&&dirExists(path.join(packageRoot,'Installed',p.id+'.'+p.version))){console.log('Already installed by akaBot: '+p.id+' '+p.version);continue;}
    if(options['verify-only'])throw Error('Missing package: '+target);
    const feed=options['offline-feed']?path.resolve(options['offline-feed']):path.resolve(root,'../Dependencies-Without-Playwright'),source=path.join(feed,p.file),tmp=target+'.'+randomUUID()+'.partial';
    try{
      if(fileExists(source))await fsp.copyFile(source,tmp);
      else if(p.source==='nuget.org'){
        const id=p.id.toLowerCase(),version=p.version.toLowerCase();console.log('Downloading '+p.file+' ('+(p.bytes/1048576).toFixed(1)+' MB)');
        const response=await fetch('https://api.nuget.org/v3-flatcontainer/'+id+'/'+version+'/'+id+'.'+version+'.nupkg',{signal:AbortSignal.timeout(600000)});
        if(!response.ok)throw Error('Download failed: HTTP '+response.status);await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(tmp,{flags:'wx'}));
      }else throw Error('Obtain '+p.file+' from akaBot or the repository Dependencies-Without-Playwright folder and pass --offline-feed.');
      if(fs.statSync(tmp).size!==p.bytes||await sha(tmp)!==p.sha256)throw Error('Package checksum mismatch: '+p.file);
      await fsp.rename(tmp,target);console.log('Ready '+p.file);
    }finally{await fsp.rm(tmp,{force:true});}
  }
  console.log('Packages ready. Open project.json in akaBot Studio to resolve dependencies. Keep existing package sources for transitive packages.');
}
async function rebuild(){
  const installed=path.resolve(options.packages||path.join(packageRoot,'Installed'));
  const facade=options.netstandard||path.join(process.env['ProgramFiles(x86)'],'Reference Assemblies/Microsoft/Framework/.NETFramework/v4.8/Facades/netstandard.dll');
  const compiler=path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const refs=[facade,path.join(installed,'Microsoft.Playwright.1.63.0/lib/netstandard2.0/Microsoft.Playwright.dll'),path.join(installed,'Microsoft.Bcl.AsyncInterfaces.6.0.0/lib/net461/Microsoft.Bcl.AsyncInterfaces.dll')];
  for(const file of [compiler,...refs])if(!fileExists(file))throw Error('Build dependency missing: '+file+'. Resolve project packages and install .NET Framework 4.8 Developer Pack.');
  refs.push('System.Core.dll','System.Xml.dll','System.IO.Compression.dll','System.IO.Compression.FileSystem.dll','System.Web.dll','System.Web.Extensions.dll');
  const sources=fs.readdirSync(path.join(bot,'src')).filter(n=>n.endsWith('.cs')).map(n=>path.join(bot,'src',n));
  const result=await child(compiler,['/nologo','/target:library','/langversion:5','/codepage:65001','/out:'+path.join(bot,'lib/BranchLab.Runtime.dll'),...refs.map(r=>'/reference:'+r),...sources]);
  if(result.code!==0)throw Error('Runtime build failed');console.log('Runtime rebuilt. Main.xaml activities preserved.');
}
try{
  if(Number(process.versions.node.split('.')[0])<22)throw Error('Node.js 22+ is required.');
  if(command==='init'){initialize();prerequisites();}
  else if(command==='run')await run();
  else if(command==='restore')await restore();
  else if(command==='build')await rebuild();
  else if(command==='web'){
    const port=Number(options.port||8789);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Port must be 1024..65535');
    console.log('Open http://127.0.0.1:'+port+'/branch ; keep this CMD window open. Ctrl+C stops the server.');
    const r=await child(process.execPath,[path.join(root,'BrowserPrimitiveLab/server.mjs')],{env:{...process.env,PORT:String(port)}});if(r.code!==0)throw Error('Web server stopped. If port is busy, use --port 8790.');
  }else throw Error('Use init, web, run, restore or build. See README.vi.md.');
}catch(e){console.error('ERROR: '+e.message);process.exitCode=1;}
