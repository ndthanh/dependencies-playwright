import fs from 'node:fs/promises';import path from 'node:path';
export function localBranchStore(root){const location=(kind,key)=>{if(!/^[a-z]+$/.test(kind)||!/^[a-z0-9-]+$/.test(key))throw Error('Invalid storage key');return path.join(root,kind,key);};return {
 async get(kind,key){try{return JSON.parse(await fs.readFile(location(kind,key)+'.json','utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}},
 async put(kind,key,value){const file=location(kind,key)+'.json';await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+crypto.randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify(value));await fs.rename(temp,file);},
 async del(kind,key){await fs.rm(location(kind,key)+'.json',{force:true});},
 async putBytes(key,bytes){const file=location('files',key);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);},async getBytes(key){return fs.readFile(location('files',key));}};
}
