import {readFile} from 'node:fs/promises';
import type {FastifyInstance} from 'fastify';
type Platform='windows'|'android';
const empty=()=>({windows:{available:false},android:{available:false}});
function release(value:any){
 if(!value||value.available!==true)return {available:false};
 if(!/^\d+\.\d+\.\d+$/.test(value.version)||typeof value.protocolVersion!=='string'||!value.mapIdentity||typeof value.mapIdentity.sourceVersion!=='string'||value.mapIdentity.sourceVersion.length>80||!value.mapIdentity.sourceVersion||['manifestHash','collisionHash','navigationHash','visionHash'].some(k=>!/^[a-f0-9]{64}$/.test(value.mapIdentity[k]))||!/^\/native\/releases\/[a-f0-9]{64}\/[a-zA-Z0-9._-]+\.(zip|apk)$/.test(value.downloadUrl)||!Number.isSafeInteger(value.bytes)||value.bytes<=0||!/^[a-f0-9]{64}$/.test(value.sha256)||typeof value.minimumOS!=='string'||value.minimumOS.length>80||!Array.isArray(value.notes)||value.notes.length>8||value.notes.some((s:unknown)=>typeof s!=='string'||s.length>240))throw Error('NATIVE_MANIFEST');
 if(value.downloadUrl.split('/')[3]!==value.sha256)throw Error('NATIVE_MANIFEST');
 return {available:true,version:value.version,protocolVersion:value.protocolVersion,mapIdentity:{sourceVersion:value.mapIdentity.sourceVersion,...Object.fromEntries(['manifestHash','collisionHash','navigationHash','visionHash'].map(k=>[k,value.mapIdentity[k]]))},downloadUrl:value.downloadUrl,bytes:value.bytes,sha256:value.sha256,minimumOS:value.minimumOS,notes:value.notes};
}
export async function readNativeUpdates(file?:string){
 if(!file)return empty();
 try{const bytes=await readFile(file,'utf8');if(bytes.length>16000)throw Error('NATIVE_MANIFEST');const source=JSON.parse(bytes);return Object.fromEntries((['windows','android'] as Platform[]).map(platform=>[platform,release(source[platform])])) as ReturnType<typeof empty>;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return empty();throw Error('NATIVE_MANIFEST');}
}
export function nativeUpdateRoutes(app:FastifyInstance,file?:string){app.get('/v1/native/updates',async(_req,reply)=>{try{return await readNativeUpdates(file);}catch{return reply.code(503).send({error:{code:'NATIVE_UPDATE_UNAVAILABLE',message:'暂时无法检查更新，请稍后重试。',retryable:true}});}});}
