import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {deflateRawSync} from 'node:zlib';
const root=path.resolve(import.meta.dirname,'..');
const files=[];
async function walk(dir){for(const entry of await fs.readdir(path.join(root,dir),{withFileTypes:true})){
 const name=path.posix.join(dir,entry.name);
 if(entry.isDirectory())await walk(name);else if(entry.isFile())files.push({name,bytes:await fs.readFile(path.join(root,name))});
}}
for(const dir of ['code','workflows','examples','scripts','fixtures','dependencies','web/public','contracts'])await walk(dir);
for(const name of ['project.json','Main.xaml','README.vi.md','REVIEW.vi.md','verification.json','.gitignore','scenarios.xlsx','web/server.mjs','web/branch-api.mjs','web/branch-store-local.mjs',...(await fs.readdir(root)).filter(x=>x.endsWith('.cmd'))])files.push({name,bytes:await fs.readFile(path.join(root,name))});
for(const file of files){
 if(file.name==='project.json'){const p=JSON.parse(file.bytes.toString('utf8'));Object.assign(p,{MainWorkflow:'Main.xaml',ProjectDirectory:'.',ProjectFilePath:'project.json',ScreenshotsFolder:'.screenshots'});file.bytes=Buffer.from(JSON.stringify(p,null,2)+'\n');}
 if(file.name.endsWith('.xaml'))file.bytes=Buffer.from(file.bytes.toString('utf8').replace(/(<this:[^>]+\.projectRoot>)[\s\S]*?(<\/this:[^>]+\.projectRoot>)/g,'$1.$2'));
}
files.sort((a,b)=>a.name.localeCompare(b.name));
const manifest={version:'0.4.0',files:files.map(f=>({path:f.name,bytes:f.bytes.length,sha256:createHash('sha256').update(f.bytes).digest('hex')}))};
files.push({name:'manifest.sha256.json',bytes:Buffer.from(JSON.stringify(manifest,null,2)+'\n')});
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=buffer=>{let c=0xffffffff;for(const b of buffer)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
const local=[],central=[];let offset=0;
for(const file of files){
 const name=Buffer.from('playwright-cookbook/'+file.name),compressed=deflateRawSync(file.bytes),crc=crc32(file.bytes);
 const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(8,8);h.writeUInt16LE(0x21,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(compressed.length,18);h.writeUInt32LE(file.bytes.length,22);h.writeUInt16LE(name.length,26);
 const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(8,10);c.writeUInt16LE(0x21,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(compressed.length,20);c.writeUInt32LE(file.bytes.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);
 local.push(h,name,compressed);central.push(c,name);offset+=h.length+name.length+compressed.length;
}
const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
const archive=Buffer.concat([...local,directory,end]),output=path.resolve(process.argv[2]||path.join(root,'../releases/playwright-cookbook-v0.4.0.zip'));
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,archive);
const hash=createHash('sha256').update(archive).digest('hex');await fs.writeFile(output+'.sha256',hash+'  '+path.basename(output)+'\n');
console.log(JSON.stringify({archive:output,bytes:archive.length,files:files.length,sha256:hash},null,2));
