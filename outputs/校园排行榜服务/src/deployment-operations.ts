import path from 'node:path';
import {lstat,open,readFile,realpath} from 'node:fs/promises';

const KiB=1024;
const knownCodes=new Set(['QUEUE_PROCESS_ERROR','LOAD_FAILED','MAP_LOAD','RESOURCE_TIMEOUT','PREPARE_TIMEOUT','NETWORK','HTTP_502','HTTP_503','HTTP_504','ROOM_CREATE','ROOM_JOIN','JOIN_TIMEOUT','RECONNECT','SOCKET_CLOSED','BACKPRESSURE','SQLITE_BUSY','ENOMEM','EACCES','EADDRINUSE','ECONNREFUSED','ECONNRESET','ETIMEDOUT']);
export function summarizeLog(text:string){
 const codes:Record<string,number>={};let errors=0,warnings=0;
 for(const line of text.split('\n').slice(-400)){
  if(!line.trim())continue;
  let item:any;try{item=JSON.parse(line);}catch{}
  const severity=item?.level??item?.severity,code=item?.code??item?.error?.code??item?.err?.code;
  if(severity===undefined&&typeof code==='string'&&knownCodes.has(code)||severity==='error'||typeof severity==='number'&&severity>=50||/(?:\b(?:ERROR|FATAL)\b|\bError:)/.test(line))errors++;
  else if(severity==='warn'||severity==='warning'||typeof severity==='number'&&severity>=40||/\bWARN(?:ING)?\b/.test(line))warnings++;
  // Only fixed diagnostic categories leave the log reader. Names, URLs and messages stay in the file.
  if(typeof code==='string'&&knownCodes.has(code))codes[code]=(codes[code]??0)+1;
 }
 return{errors,warnings,codes};
}
export function normalizeAdmission(value:any){
 const admission=value?.admission;
 if(!admission||typeof admission.canCreate!=='boolean'||!['ready','maintenance','capacity','busy','warming'].includes(admission.reason))return null;
 return{canCreate:admission.canCreate,reason:admission.reason,queued:Number.isSafeInteger(admission.queued)&&admission.queued>=0?Math.min(100000,admission.queued):0};
}
const milliseconds=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value<1e12?value*1000:value:null;
const integer=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;
async function controlledFile(root:string,relative:string,maxBytes:number){
 const file=path.join(root,relative),info=await lstat(file);
 if(!info.isFile()||info.isSymbolicLink()||info.size>maxBytes)throw Error('OPS_FILE');
 const target=await realpath(file),base=await realpath(root);
 if(path.relative(base,target).startsWith('..')||path.isAbsolute(path.relative(base,target)))throw Error('OPS_PATH');
 return{file,info};
}
async function receipt(root:string,relative:string){
 try{const {file}=await controlledFile(root,relative,256*KiB);return JSON.parse(await readFile(file,'utf8'));}catch{return null;}
}
async function readLog(root:string,name:string,now:number){
 try{
  const {file,info}=await controlledFile(root,'logs/'+name,1024*1024*1024),handle=await open(file,'r');
  let text:string;try{const size=Math.min(128*KiB,info.size),buffer=Buffer.alloc(size);await handle.read(buffer,0,size,Math.max(0,info.size-size));text=buffer.toString('utf8');if(info.size>size)text=text.slice(text.indexOf('\n')+1);}finally{await handle.close();}
  return{name,available:true,updatedAt:info.mtimeMs,bytes:info.size,sampledBytes:Math.min(128*KiB,info.size),stale:now-info.mtimeMs>15*60000,...summarizeLog(text)};
 }catch{return{name,available:false};}
}
export async function readDeploymentOperations(root:string|undefined,now=Date.now()){
 if(!root)return null;
 const [rawBackup,rawStorage,certificate,logs]=await Promise.all([
  receipt(root,'receipts/backup-latest.json'),receipt(root,'receipts/storage-gate.json'),receipt(root,'receipts/tls-certificate.json'),
  Promise.all(['api.log','worker-1.log','worker-2.log','worker-3.log','gateway.log'].map(name=>readLog(root,name,now)))
 ]);
 const backup=rawBackup?.backup,backupAt=milliseconds(backup?.created),storageAt=milliseconds(rawStorage?.checkedAt),expiresAt=milliseconds(certificate?.expiresAt);
 return{checkedAt:now,
  backup:backup&&backupAt?{available:true,createdAt:backupAt,stale:now-backupAt>26*3600000,schema:integer(backup.schema),bytes:integer(backup.bytes),restoreVerified:backup.restoreVerified===true,complete:backup.complete===true}: {available:false},
  storage:storageAt?{available:true,checkedAt:storageAt,stale:now-storageAt>2*3600000,physicalBytes:integer(rawStorage.physicalBytes),freeBytes:integer(rawStorage.freeBytes),warning:rawStorage.warning===true,passed:rawStorage.passed===true}:{available:false},
  certificate:expiresAt?{available:true,expiresAt,renewal:certificate.automaticRenewal===true?'automatic':'manual',warning:expiresAt-now<30*86400000,expired:expiresAt<=now}:{available:false},
  logs,logSource:'bounded-file-tail',privateValuesReturned:false};
}
