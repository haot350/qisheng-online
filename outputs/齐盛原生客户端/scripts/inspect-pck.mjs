import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PHYSICS_RUNTIME_LICENSES} from './prepare-runtime-licenses.mjs';
// Directory layout: fixed Godot 4.7.2 core/io/file_access_pack.cpp (v2-v4).
// https://github.com/godotengine/godot/blob/4.7.2-stable/core/io/file_access_pack.cpp
export async function inspectPck(file,{demo=false,projectRoot,requireRuntimeNotices=true}={}){
 const bytes=await fs.readFile(file);let cursor=0;
 const bounds=(n)=>{if(!Number.isSafeInteger(n)||n<0||cursor+n>bytes.length)throw Error('Invalid PCK bounds');};
 const u32=()=>{bounds(4);const n=bytes.readUInt32LE(cursor);cursor+=4;return n;};
 const u64=()=>{bounds(8);const n=Number(bytes.readBigUInt64LE(cursor));cursor+=8;if(!Number.isSafeInteger(n))throw Error('Invalid PCK size');return n;};
 if(u32()!==0x43504447)throw Error('Standalone Godot PCK required');
 const format=u32(),engine=[u32(),u32(),u32()],flags=u32(),base=u64();
 if(![2,3,4].includes(format)||engine[0]!==4||engine[1]!==7||flags&~2)throw Error('Unexpected/encrypted/sparse PCK format');
 if(format>=3)cursor=u64();else cursor+=64;
 const count=u32();if(count<1||count>100000)throw Error('Unexpected PCK file count');
 const entries=new Map();
 for(let i=0;i<count;i++){
  const length=u32();if(length<1||length>4096)throw Error('Invalid PCK path length');bounds(length);
  const name=bytes.subarray(cursor,cursor+length).toString('utf8').replace(/\0+$/,'').replace(/^res:\/\//,'');cursor+=length;
  const offset=base+u64(),size=u64();bounds(16);const md5=bytes.subarray(cursor,cursor+16).toString('hex');cursor+=16;const fileFlags=u32();
  if(fileFlags||!name||name.indexOf(String.fromCharCode(92))>=0||name.includes('\0')||name.startsWith('/')||name.split('/').some(part=>part==='..'||part==='.')||entries.has(name)||offset<0||offset+size>bytes.length)throw Error('Unsafe PCK directory entry');
  if(/^(work|private|docs|tests|scripts|dist|physics-rs|[.]git)\//.test(name)||/^([.]godot\/(editor|shader_cache))\//.test(name)||/(^|\/)[.]env($|[.])|[.](pem|key|keystore|jks|sqlite|log)$/i.test(name)||/^account-.*[.]bin$/.test(name))throw Error('Private/development resource entered PCK: '+name);
  const data=bytes.subarray(offset,offset+size);
  if(crypto.createHash('md5').update(data).digest('hex')!==md5)throw Error('PCK entry checksum mismatch: '+name);
  entries.set(name,{offset,size});
 }
 const required=name=>{if(!entries.has(name))throw Error('Required PCK resource missing: '+name);return entries.get(name);};
 const read=name=>{const e=required(name);return bytes.subarray(e.offset,e.offset+e.size);};
 const resource=name=>{
  name=name.replace(/^res:\/\//,'');
  if(entries.has(name))return required(name);
  const reference=entries.has(name+'.remap')?name+'.remap':name+'.import';
  const remap=read(reference).toString('utf8'),target=/^path="res:\/\/([^"\r\n]+)"/m.exec(remap)?.[1];
  if(!target)throw Error('Packed resource remap missing: '+name);
  return required(target);
 };
 const imported=new Set();
 if(demo&&projectRoot){for(const dir of ['content/production','content/combat']){
  const walk=async(relative)=>{for(const item of await fs.readdir(path.join(projectRoot,relative),{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){const next=relative+'/'+item.name;if(item.isDirectory())await walk(next);else if(item.isFile()&&item.name.endsWith('.import'))for(const match of (await fs.readFile(path.join(projectRoot,next),'utf8')).matchAll(/res:\/\/([.]godot\/imported\/[^"\r\n]+)/g))imported.add(match[1]);}};
  await walk(dir);
 }}
 if(demo){
  if([...entries.keys()].some(name=>/^content\/(production|combat)\//.test(name)||imported.has(name)))throw Error('Formal assets entered anonymous PCK');
  required('content/demo/map.json');required('content/demo/weapons.json');
 }else{
  const manifest=JSON.parse(read('content/production/map.json').toString());
  if(manifest.profile!=='production'||manifest.chunks?.length!==209)throw Error('Full open campus missing');
  const combat=JSON.parse(read('content/combat/manifest.json').toString());required('content/combat/weapons.json');
  for(const chunk of manifest.chunks){if(typeof chunk.path!=='string'||!chunk.path.startsWith('res://content/production/'))throw Error('Unsafe formal campus resource path');resource(chunk.path);}
  if(combat.profile!=='production'||!Array.isArray(combat.assets))throw Error('Formal combat resource index missing');
  for(const asset of combat.assets){if(typeof asset.target!=='string'||asset.target.includes('..')||asset.target.indexOf(String.fromCharCode(92))>=0)throw Error('Unsafe combat resource path');resource('content/combat/'+asset.target);}
  for(const [file,key]of [['collision.bin','collisionHash'],['navigation.bin','navigationHash'],['vision.bin','visionHash']])if(crypto.createHash('sha256').update(read('content/production/'+file)).digest('hex')!==manifest.mapIdentity?.[key])throw Error('Packed raw map identity mismatch: '+file);
  if(projectRoot){for(const name of ['content/production/map.json','content/combat/manifest.json','content/combat/weapons.json'])if(!read(name).equals(await fs.readFile(path.join(projectRoot,name))))throw Error('PCK contains stale formal metadata');}
 }
 if(requireRuntimeNotices){for(const name of ['Godot-MIT.txt','Colyseus-MIT.txt']){
  if(![...entries.keys()].some(entry=>entry.endsWith('/'+name)))throw Error('Native dependency license missing: '+name);
 }
 for(const notice of PHYSICS_RUNTIME_LICENSES)required('runtime_licenses/physics/'+notice);
 required('LICENSES.txt');}
 return {passed:true,format,engine:engine.join('.'),files:entries.size,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),demo,formalAssets:!demo,md5EntriesVerified:entries.size,privateOrDevelopmentEntries:0,names:[...entries.keys()]};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await inspectPck(process.argv[2],{demo:process.argv.includes('--demo'),projectRoot:fileURLToPath(new URL('../',import.meta.url))});
 const index=process.argv.indexOf('--report');if(index>=0)await fs.writeFile(process.argv[index+1],JSON.stringify(result,null,2));
 const {names,...summary}=result;console.log(JSON.stringify(summary));
}
