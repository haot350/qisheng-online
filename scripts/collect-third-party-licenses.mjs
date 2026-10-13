import {readdir,readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),output=path.join(root,'THIRD_PARTY_LICENSES');await mkdir(output,{recursive:true});const entries=[];
const projects=['校园逃生游戏','校园排行榜服务','校园联机服务','校园交互网站/site'];const names=new Set();
for(const project of projects){const packageRoot=path.join(root,'outputs',project),manifest=JSON.parse(await readFile(path.join(packageRoot,'package.json'),'utf8'));
 for(const name of Object.keys({...manifest.dependencies,...manifest.devDependencies})){if(name==='@qisheng/shared'||names.has(name))continue;const directory=path.join(packageRoot,'node_modules',name);let info,files;try{info=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));files=(await readdir(directory)).filter(file=>/^(?:licen[cs]e|notice|thirdpartynoticetext)(?:[._-].*)?$/i.test(file));}catch(error){if(error.code==='ENOENT')continue;throw error;}names.add(name);const prefix=name.replaceAll('/','__');const copied=[];for(const file of files){const target=prefix+'-'+file;await copyFile(path.join(directory,file),path.join(output,target));copied.push(target);}entries.push({name,version:info.version,license:info.license??'See package metadata',files:copied});}
}
await writeFile(path.join(output,'dependencies.json'),JSON.stringify(entries.sort((a,b)=>a.name.localeCompare(b.name)),null,2)+'\n');console.log('Collected direct-dependency licenses from installed locked packages: '+entries.length);
