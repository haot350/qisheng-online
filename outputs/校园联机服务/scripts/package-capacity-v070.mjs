import {cp,mkdir,mkdtemp,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const stage=await mkdtemp(path.join(root,'.qa-v070-'));
for(const item of ['dist','package.json','package-lock.json','vendor'])await cp(path.join(root,item),path.join(stage,item),{recursive:true});
await mkdir(path.join(stage,'scripts'));
for(const name of ['qa-wire-capacity-v070.mjs','qa-wire-worker-v062.mjs','network-controls.mjs','qa-wire-fixture-v070.mjs'])await cp(path.join(root,'scripts',name),path.join(stage,'scripts',name));
await mkdir(path.join(stage,'qa-map'));
for(const name of ['manifest.json','collision.bin','navigation.bin','vision.bin']){
 const source=path.join(root,'../校园逃生游戏/public/map',name);
 try{await cp(source,path.join(stage,'qa-map',name));}catch(error){if(name!=='vision.bin')throw error;}
}
const files=[];async function scan(dir,prefix=''){for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('No QA symlinks');const relative=prefix+entry.name;if(entry.isDirectory())await scan(path.join(dir,entry.name),relative+'/');else{const bytes=await readFile(path.join(dir,entry.name));files.push({path:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}}}await scan(stage);
await writeFile(path.join(stage,'qa-manifest.json'),JSON.stringify({version:'0.7.0',purpose:'isolated local-authority capacity test; no production credentials or database',files},null,2));
const archive=path.join(root,'qisheng-capacity-qa-v0.7.0.tar.gz'),tar=spawnSync('tar',['-czf',archive,'-C',stage,'.'],{encoding:'utf8'});if(tar.status!==0)throw Error(tar.stderr);
const bytes=await readFile(archive);console.log(JSON.stringify({archive,stage,bytes:bytes.length,files:files.length,sha256:createHash('sha256').update(bytes).digest('hex')}));
