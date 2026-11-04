import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const bootstrap=new Set(['android/bundle-info.json','android/release-manifest.json']);
/** Logical URLs keep their MIME and identity; equal bytes share an APK entry. */
export async function packAssetEntities(rows,{dist,overlay}){
 const files=[],entities=new Map();let logicalBytes=0,physicalBytes=0;
 for(const row of rows){
  const original=row.path;
  if(!original||path.isAbsolute(original)||original.includes('\\')||original.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Unsafe resource entity path');
  let bytes;
  for(const directory of [overlay,dist]){
   try{const file=path.join(directory,original),st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink())throw Error('Resource entity requires a regular file');bytes=await fs.readFile(file);break;}
   catch(error){if(error.code!=='ENOENT')throw error;}
  }
  if(!bytes||bytes.length!==row.bytes||digest(bytes)!==row.sha256)throw Error('Resource changed while packing: '+original);
  logicalBytes+=row.bytes;
  let entity=bootstrap.has(original)?original:entities.get(row.sha256);
  if(!entity){
   const extension=path.extname(original).slice(1).toLowerCase()||'bin';
   if(!/^[a-z0-9]{1,12}$/.test(extension))throw Error('Unsupported resource extension: '+original);
   entity='android/content/'+row.sha256+'.'+(extension==='gz'?'qsgz':extension);
   const target=path.join(overlay,entity);await fs.mkdir(path.dirname(target),{recursive:true});
   const previous=await fs.readFile(target).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
   if(!previous||digest(previous)!==row.sha256)await fs.writeFile(target,bytes);
  }
  if(!entities.has(row.sha256)){entities.set(row.sha256,entity);physicalBytes+=row.bytes;}
  files.push({...row,url:row.url??'/'+original,path:entity,mimePath:original});
 }
 return {files,report:{logicalUrls:rows.length,physicalEntities:new Set(files.map(r=>r.path)).size,logicalBytes,physicalBytes,savedUncompressedBytes:logicalBytes-physicalBytes}};
}
