import {readFile,writeFile,mkdir,copyFile,stat,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Sidecar generation never rewrites the accepted map manifest or map bytes. */
export async function buildMapCacheIndex(publicRoot,manifestUrl,indexUrl,extras=[]){
 const original=await readFile(path.join(publicRoot,manifestUrl)),manifest=JSON.parse(original),logical=new Set(extras);
 function visit(value){if(typeof value==='string'&&value.startsWith('/')&&/\.(glb|bin)$/.test(value))logical.add(value);else if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')Object.values(value).forEach(visit);}
 visit(manifest);const resources={};await mkdir(path.join(publicRoot,'assets/map'),{recursive:true});
 for(const source of [...logical].sort()){
  if(source.includes('..')||source.includes('\\')||!source.startsWith('/'))throw Error('Unsafe map path');
  const file=path.join(publicRoot,source),bytes=await readFile(file),hash=sha(bytes),ext=path.extname(source).slice(1),url='/assets/map/'+hash+'.'+ext,target=path.join(publicRoot,url);
  if(await stat(target).catch(()=>null)){if(sha(await readFile(target))!==hash)throw Error('Content address collision');}else await copyFile(file,target);
  resources[source]={url,sha256:hash,bytes:bytes.length,mime:ext==='glb'?'model/gltf-binary':ext==='json'?'application/json':'application/octet-stream'};
 }
 const index={schema:1,manifest:{url:manifestUrl,sha256:sha(original)},resources};await mkdir(path.dirname(path.join(publicRoot,indexUrl)),{recursive:true});await writeFile(path.join(publicRoot,indexUrl),JSON.stringify(index,null,2)+'\n');
 if(sha(await readFile(path.join(publicRoot,manifestUrl)))!==index.manifest.sha256)throw Error('Source manifest changed during indexing');
 return{files:Object.keys(resources).length,bytes:Object.values(resources).reduce((n,r)=>n+r.bytes,0),manifestSha256:index.manifest.sha256};
}
export async function buildGameMapIndex(root=path.resolve(fileURLToPath(new URL('../',import.meta.url)))){
 const publicRoot=path.join(root,'public');const extras=(await readdir(path.join(publicRoot,'map'))).filter(n=>/^drive-.*\.json$/.test(n)).map(n=>'/map/'+n);
 return buildMapCacheIndex(publicRoot,'/map/manifest.json','/map/resource-index.json',extras);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log('Map cache index:',await buildGameMapIndex());
