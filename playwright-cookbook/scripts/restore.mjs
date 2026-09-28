import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {Readable} from 'node:stream';import {pipeline} from 'node:stream/promises';
const root=path.resolve(import.meta.dirname,'..'),destination=path.join(process.env.LOCALAPPDATA,'akaBot/Packages');
const args=process.argv.slice(2);let feed=path.resolve(root,'../Dependencies-Without-Playwright');
if(args.length){if(args.length!==2||args[0]!=='--offline-feed')throw Error('Use restore-dependencies.cmd [--offline-feed path]');feed=path.resolve(args[1]);}
fs.mkdirSync(destination,{recursive:true});
const hash=async file=>{const h=createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex');};
try{
 for(const item of JSON.parse(fs.readFileSync(path.join(root,'dependencies/packages.json'),'utf8'))){
  const target=path.join(destination,item.file);
  if(fs.existsSync(target)){if(await hash(target)!==item.sha256)throw Error('Existing package checksum mismatch: '+target);console.log('Verified '+item.file);continue;}
  if(item.source==='akabot-installation'&&fs.existsSync(path.join(destination,'Installed',item.id+'.'+item.version))){console.log('Installed '+item.id);continue;}
  const source=path.join(feed,item.file),tmp=target+'.'+randomUUID()+'.partial';
  try{
   if(fs.existsSync(source))fs.copyFileSync(source,tmp);
   else if(item.source==='nuget.org'){
    const id=item.id.toLowerCase(),v=item.version.toLowerCase(),url='https://api.nuget.org/v3-flatcontainer/'+id+'/'+v+'/'+id+'.'+v+'.nupkg';
    console.log('Downloading '+item.file);const response=await fetch(url,{signal:AbortSignal.timeout(600000)});if(!response.ok)throw Error('HTTP '+response.status+' '+url);await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(tmp,{flags:'wx'}));
   }else throw Error('Obtain '+item.file+' from akaBot, or pass --offline-feed');
   if(fs.statSync(tmp).size!==item.bytes||await hash(tmp)!==item.sha256)throw Error('Checksum mismatch: '+item.file);
   fs.renameSync(tmp,target);
  }finally{fs.rmSync(tmp,{force:true});}
 }
 console.log('Ready. Open project.json in akaBot Studio to resolve dependencies.');
}catch(e){console.error('ERROR: '+e.message);process.exitCode=1;}
