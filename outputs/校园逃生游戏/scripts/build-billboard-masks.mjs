import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {encodePortraitMask} from './portrait-mask-codec.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function buildBillboardMasks(project=root){
 const {NPC_IDENTITY,npcPoseFilename}=await import(pathToFileURL(path.join(project,'src/npc-roster.ts')));
 const {decodePortraitMask,portraitPixelOpaque}=await import(pathToFileURL(path.join(project,'src/portrait-mask.ts')));
 const records={},bundles=[],directory=path.join(project,'public/characters/portrait-masks');await mkdir(directory,{recursive:true});
 let pixels=0,packedBytes=0;
 for(const [id,definition]of Object.entries(NPC_IDENTITY))for(const mobile of [false,true]){
  const parts=[];let offset=0;const logical='/characters/portrait-masks/'+id+'-'+(mobile?'mobile':'desktop')+'.bin';
  for(const pose of definition.poses){
   const filename=npcPoseFilename(id,pose,mobile),image=await readFile(path.join(project,'public',filename));
   const {data:alpha,info}=await sharp(image).ensureAlpha().extractChannel('alpha').raw().toBuffer({resolveWithObject:true});
   const encoded=encodePortraitMask(alpha,info.width,info.height),decoded=decodePortraitMask(encoded);
   for(let i=0;i<alpha.length;i++)if(portraitPixelOpaque(decoded,i%info.width,Math.floor(i/info.width))!==(alpha[i]>=128))throw Error('Portrait alpha predicate changed: '+filename);
   records[filename]={bundle:logical,offset,bytes:encoded.length,width:info.width,height:info.height,imageSha256:hash(image)};
   parts.push(encoded);offset+=encoded.length;pixels+=alpha.length;
  }
  const bytes=Buffer.concat(parts);await writeFile(path.join(project,'public',logical),bytes);packedBytes+=bytes.length;
  bundles.push({url:logical,bytes:bytes.length,sha256:hash(bytes)});
 }
 const manifest={schema:1,threshold:128,records,bundles};await mkdir(path.join(project,'src/generated'),{recursive:true});
 await writeFile(path.join(project,'src/generated/billboard-alpha-index.json'),JSON.stringify(manifest,null,2)+'\n');
 return{poses:Object.keys(records).length,bundles:bundles.length,pixels,packedBytes,exactPredicateVerified:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await buildBillboardMasks());
