import {lstat,mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Failure,type Files} from './contracts.ts';
export async function writeArtifacts(root:string, files:Files) {
 await mkdir(root,{recursive:true});
 if((await lstat(root)).isSymbolicLink())throw new Failure('schema_violation','Symlink artifact directory');
 for(const [name,content] of Object.entries(files)) {
  if(!['app.py','db.py','schema.sql'].includes(name)||resolve(root,name)!==join(resolve(root),name))throw new Failure('schema_violation','Unsafe path');
  const dest=join(root,name);
  try {if((await lstat(dest)).isSymbolicLink())throw new Failure('schema_violation','Symlink file');} catch(e:any) {if(e.code!=='ENOENT')throw e;}
  await writeFile(dest,content,{mode:0o600});
 }
}
export async function loadArtifacts(root:string):Promise<Files> {
 const out:Files={};for(const name of ['app.py','db.py','schema.sql'])try {out[name]=await readFile(join(root,name),'utf8');} catch(e:any){if(e.code!=='ENOENT')throw e;}return out;
}
