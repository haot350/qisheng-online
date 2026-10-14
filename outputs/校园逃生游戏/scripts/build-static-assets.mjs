import {readFile,writeFile,readdir,mkdir,copyFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';

const here=path.dirname(fileURLToPath(import.meta.url));
export async function buildStaticAssets(project,kind='game') {
 if(kind==='game')await (await import('./sync-fresh-helper.mjs')).syncFreshBrowser(project);
 const publicRoot=path.resolve(project,'public');
 const roots=kind==='game'?['audio','avatars','images','story','vehicles','weapons','weapon-cards','characters/billboards','characters/players']:['images','poster.jpg'];
 const extensions=new Set(['.glb','.mp3','.wav','.ogg','.m4a','.webp','.png','.jpg','.jpeg','.svg','.woff2']);
 const resources={};let bytes=0;
 const walk=async logical=>{
  const file=path.resolve(publicRoot,logical);if(!file.startsWith(publicRoot+path.sep))throw Error('Resource escaped public directory');
  let info;try{info=await stat(file);}catch(e){if(e.code==='ENOENT')return;throw e;}
  if(info.isDirectory()){for(const entry of (await readdir(file,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(entry.isSymbolicLink())throw Error('Symbolic resource is not permitted');await walk(logical+'/'+entry.name);}return;}
  const ext=path.extname(file).toLowerCase();if(!extensions.has(ext))return;
  const data=await readFile(file);
  if(ext==='.glb'){
   if(data.readUInt32LE(0)!==0x46546c67)throw Error('Invalid GLB: '+logical);
   const json=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString('utf8'));
   // Existing models embed all dependencies. Fail rather than silently breaking relative URIs.
   if([...(json.buffers||[]),...(json.images||[])].some(r=>r.uri&&!r.uri.startsWith('data:')))throw Error('External GLB dependency needs packaging: '+logical);
  }
  const sha256=createHash('sha256').update(data).digest('hex'),url='/assets/media/'+sha256+ext,target=path.join(publicRoot,url.slice(1));
  await mkdir(path.dirname(target),{recursive:true});
  let same=false;try{same=(await stat(target)).size===data.length&&createHash('sha256').update(await readFile(target)).digest('hex')===sha256;}catch{}
  if(!same)await copyFile(file,target);
  resources['/'+logical.replaceAll('\\','/')]={url,sha256,bytes:data.length};bytes+=data.length;
 };
 for(const root of roots)await walk(root);
 const generated=path.join(project,kind==='game'?'src/generated':'lib/generated');await mkdir(generated,{recursive:true});
 const urls=Object.fromEntries(Object.entries(resources).map(([key,value])=>[key,value.url]));
 await writeFile(path.join(generated,'static-assets.json'),JSON.stringify(urls,null,2)+'\n');
 const release=JSON.parse(await readFile(path.join(project,'package.json'),'utf8')).version;
 const report=path.join(project,'docs','v'+release);await mkdir(report,{recursive:true});
 await writeFile(path.join(report,'static-assets.json'),JSON.stringify({schema:1,kind,files:Object.keys(resources).length,bytes,resources},null,2)+'\n');
 return {kind,files:Object.keys(resources).length,bytes};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const game=path.resolve(here,'..');
 console.log(await buildStaticAssets(game,'game'));
 console.log(await buildStaticAssets(path.resolve(game,'../校园交互网站/site'),'campus'));
}
