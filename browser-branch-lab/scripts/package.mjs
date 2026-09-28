import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {deflateRawSync} from 'node:zlib';
const root=path.resolve(import.meta.dirname,'..');
const fixed=['README.vi.md','dependencies.json','.gitignore','init.cmd','start-web.cmd','run-bot.cmd','restore-dependencies.cmd','rebuild-bot.cmd','make-zip.cmd','verify-package.cmd','scripts/lab.mjs','scripts/package.mjs','scripts/verify-package.mjs','AkaBotBranchLab/project.json','AkaBotBranchLab/project.template.json','AkaBotBranchLab/Main.xaml','AkaBotBranchLab/lib/BranchLab.Runtime.dll','AkaBotBranchLab/tools/build-workflow.mjs','AkaBotBranchLab/tools/build-dashboard.mjs','AkaBotBranchLab/outputs/branch-lab/Branch-Scenarios.xlsx','BrowserPrimitiveLab/package.json','BrowserPrimitiveLab/server.mjs','BrowserPrimitiveLab/branch-api.mjs','BrowserPrimitiveLab/branch-store-local.mjs'];
for(const folder of ['AkaBotBranchLab/src','AkaBotBranchLab/fixtures','BrowserPrimitiveLab/public'])for(const file of await fs.readdir(path.join(root,folder),{withFileTypes:true}))if(file.isFile())fixed.push(folder+'/'+file.name);
const files=[];
for(const name of fixed.sort()){
 let bytes=await fs.readFile(path.join(root,name));
 if(name==='AkaBotBranchLab/project.json'){const p=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));Object.assign(p,{ProjectDirectory:'.',ProjectFilePath:'project.json',ScreenshotsFolder:'.screenshots'});bytes=Buffer.from(JSON.stringify(p,null,2)+'\n');}
 if(name==='AkaBotBranchLab/Main.xaml')bytes=Buffer.from(bytes.toString('utf8').replace(/<Variable\b[^>]*\bName="projectRoot"[^>]*>/g,tag=>tag.replace(/\bDefault="[^"]*"/,'Default="."')));
 files.push({name,bytes});
}
const manifest={version:'0.2.1',files:files.map(f=>({path:f.name,bytes:f.bytes.length,sha256:createHash('sha256').update(f.bytes).digest('hex')}))};
files.push({name:'manifest.sha256.json',bytes:Buffer.from(JSON.stringify(manifest,null,2)+'\n')});
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=buffer=>{let c=0xffffffff;for(const b of buffer)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
const local=[],central=[];let offset=0;
for(const file of files){
 const name=Buffer.from('akabot-branch-lab/'+file.name),compressed=deflateRawSync(file.bytes),crc=crc32(file.bytes);
 const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(8,8);h.writeUInt16LE(0x21,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(compressed.length,18);h.writeUInt32LE(file.bytes.length,22);h.writeUInt16LE(name.length,26);
 const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(8,10);c.writeUInt16LE(0x21,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(compressed.length,20);c.writeUInt32LE(file.bytes.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);
 local.push(h,name,compressed);central.push(c,name);offset+=h.length+name.length+compressed.length;
}
const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
const archive=Buffer.concat([...local,directory,end]);const output=path.resolve(process.argv[2]||path.join(root,'../releases/akabot-branch-lab-v0.2.1.zip'));
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,archive);const hash=createHash('sha256').update(archive).digest('hex');await fs.writeFile(output+'.sha256',hash+'  '+path.basename(output)+'\n');console.log(JSON.stringify({archive:output,bytes:archive.length,files:files.length,sha256:hash}));
