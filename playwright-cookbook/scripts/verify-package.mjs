import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
try{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.sha256.json'),'utf8'));
 for(const item of manifest.files){const file=path.resolve(root,item.path);if(!file.startsWith(root+path.sep))throw Error('Invalid manifest path');const content=fs.readFileSync(file);if(content.length!==item.bytes||createHash('sha256').update(content).digest('hex')!==item.sha256)throw Error('File changed or damaged: '+item.path);}
 console.log('PASS: '+manifest.files.length+' files match ZIP manifest. Run init.cmd next.');
}catch(e){console.error('ERROR: '+e.message+'\nVerify before init.cmd, since initialization sets project paths.');process.exitCode=1;}
