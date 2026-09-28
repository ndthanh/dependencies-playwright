import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
try{
 const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.sha256.json'),'utf8'));
 for(const file of manifest.files){const location=path.resolve(root,file.path);if(!location.startsWith(root+path.sep))throw Error('Invalid manifest path');const bytes=await fs.readFile(location);if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Changed or missing file: '+file.path);}
 console.log('PASS: '+manifest.files.length+' files match the ZIP manifest. Run init.cmd next.');
}catch(e){console.error('VERIFY FAILED: '+e.message);console.error('Verify a freshly extracted ZIP before init.cmd updates machine-specific paths.');process.exitCode=1;}
