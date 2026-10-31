import {readFile,writeFile,mkdir,copyFile,stat,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Sidecar generation never rewrites the accepted map manifest or map bytes. */
export async function buildMapCacheIndex(publicRoot,manifestUrl,indexUrl,extras=[]){
 const original=await readFile(path.join(publicRoot,manifestUrl)),manifest=JSON.parse(original),logical=new Set(extras);
 function visit(value){if(typeof value==='string'&&value.startsWith('/')&&/\.(glb|bin|webp|ktx2|json)$/.test(value))logical.add(value);else if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')Object.values(value).forEach(visit);}
 visit(manifest);const resources={},physics=new Set([manifest.collisionUrl,manifest.navmeshUrl??manifest.navigationUrl,manifest.visionUrl].filter(Boolean));await mkdir(path.join(publicRoot,'assets/map'),{recursive:true});
 for(const source of [...logical].sort()){
  if(source.includes('..')||source.includes('\\')||!source.startsWith('/'))throw Error('Unsafe map path');
  const file=path.join(publicRoot,source),bytes=await readFile(file),hash=sha(bytes),ext=path.extname(source).slice(1),url='/assets/map/'+hash+'.'+ext,target=path.join(publicRoot,url);
  if(await stat(target).catch(()=>null)){if(sha(await readFile(target))!==hash)throw Error('Content address collision');}else await copyFile(file,target);
  resources[source]={url,sha256:hash,bytes:bytes.length,mime:ext==='glb'?'model/gltf-binary':ext==='json'?'application/json':ext==='webp'?'image/webp':ext==='ktx2'?'image/ktx2':'application/octet-stream'};
  if(physics.has(source)){
   const sidecar=file+'.gz';let compressed;try{compressed=await readFile(sidecar);}catch(error){if(error.code!=='ENOENT')throw error;compressed=gzipSync(bytes,{level:9});await writeFile(sidecar,compressed);}
   const decoded=gunzipSync(compressed,{maxOutputLength:bytes.length});if(decoded.length!==bytes.length||sha(decoded)!==hash)throw Error('Physical gzip sidecar does not match accepted bytes: '+source);
   const encodedHash=sha(compressed),encodedUrl='/assets/map/'+encodedHash+'.gz',encodedTarget=path.join(publicRoot,encodedUrl);
   if(await stat(encodedTarget).catch(()=>null)){if(sha(await readFile(encodedTarget))!==encodedHash)throw Error('Compressed content address collision');}else await writeFile(encodedTarget,compressed);
   resources[source]={url:encodedUrl,sha256:encodedHash,bytes:compressed.length,mime:'application/gzip',encoding:{format:'gzip',decodedBytes:bytes.length,decodedSha256:hash,decodedUrl:url}};
  }
 }
 const index={schema:2,manifest:{url:manifestUrl,sha256:sha(original)},resources};await mkdir(path.dirname(path.join(publicRoot,indexUrl)),{recursive:true});await writeFile(path.join(publicRoot,indexUrl),JSON.stringify(index,null,2)+'\n');
 if(sha(await readFile(path.join(publicRoot,manifestUrl)))!==index.manifest.sha256)throw Error('Source manifest changed during indexing');
 return{files:Object.keys(resources).length,bytes:Object.values(resources).reduce((n,r)=>n+r.bytes,0),manifestSha256:index.manifest.sha256};
}
export async function buildGameMapIndex(root=path.resolve(fileURLToPath(new URL('../',import.meta.url)))){
 const publicRoot=path.join(root,'public');const extras=(await readdir(path.join(publicRoot,'map'))).filter(n=>/^drive-.*\.json$/.test(n)).map(n=>'/map/'+n);
 return buildMapCacheIndex(publicRoot,'/map/manifest.json','/map/resource-index.json',extras);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log('Map cache index:',await buildGameMapIndex());
