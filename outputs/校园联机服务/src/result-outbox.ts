import {mkdir,readFile,open,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

const writes=new Map<string,{body:string;work:Promise<void>}>();
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(key=>(value as Record<string,unknown>)[key]!==undefined).map(key=>[key,canonical((value as Record<string,unknown>)[key])])):value;

/** A round may reset only after this private, durable, idempotent record exists. */
export async function persistResult(directory:string,result:{resultId:string}){
 if(typeof result.resultId!=='string'||!result.resultId||result.resultId.length>300)throw Error('RESULT_ID_INVALID');
 const file=path.join(directory,Buffer.from(result.resultId).toString('base64url')+'.json'),body=JSON.stringify(canonical(result));
 const pending=writes.get(file);if(pending){if(pending.body!==body)throw Error('RESULT_OUTBOX_CONFLICT');return pending.work;}
 const work=(async()=>{
  await mkdir(directory,{recursive:true,mode:0o700});
  try{const current=JSON.stringify(canonical(JSON.parse(await readFile(file,'utf8'))));if(current!==body)throw Error('RESULT_OUTBOX_CONFLICT');return;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const temporary=file+'.'+randomUUID()+'.tmp';
  try{const handle=await open(temporary,'wx',0o600);try{await handle.writeFile(body);await handle.sync();}finally{await handle.close();}await rename(temporary,file);if(process.platform!=='win32'){const folder=await open(directory,'r');try{await folder.sync();}finally{await folder.close();}}}
  finally{await unlink(temporary).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;});}
 })();
 writes.set(file,{body,work});try{await work;}finally{if(writes.get(file)?.work===work)writes.delete(file);}
}
