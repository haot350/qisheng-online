import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {nativeSourceHash} from '../../校园服务器部署/scripts/native-release-policy.mjs';
import {canonicalProtocolVersion} from '../../校园服务器部署/scripts/release-protocol.mjs';
import {mapIdentityFromIndex,assertSameMapIdentity} from '../../校园服务器部署/scripts/map-cache-policy.mjs';
export const project=fileURLToPath(new URL('../',import.meta.url));
export const NATIVE_VERSION='0.1.0';
export function exportOptions(argv=process.argv.slice(2)){
 let mode='internal',chosen=false,output;
 for(let i=0;i<argv.length;i++){
  if(['--internal','--preview','--demo'].includes(argv[i])){if(chosen)throw Error('Choose exactly one of --internal, --preview or --demo');mode=argv[i].slice(2);chosen=true;}
  else if(argv[i]==='--output'){if(output||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('--output requires one directory under dist');output=path.resolve(argv[++i]);}
  else if(argv[i]!=='--check')throw Error('Unknown export option '+argv[i]);
 }
 if(output){const relative=path.relative(path.join(project,'dist'),output);if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Export output must be a new directory inside native dist');}
 return{mode,demo:mode==='demo',preview:mode==='preview',check:argv.includes('--check'),output:output??path.join(project,'dist','windows-'+NATIVE_VERSION+'-'+mode),preset:mode==='demo'?'Windows Demo':mode==='preview'?'Windows Preview':'Windows Internal',executable:mode==='demo'?'QishengOnline-Native-'+NATIVE_VERSION+'-Demo.exe':mode==='preview'?'QishengOnline-'+NATIVE_VERSION+'.exe':'QishengOnline-Native-'+NATIVE_VERSION+'-Internal.exe'};
}
export async function exportIdentity({demo=false,preview=false}={}){
 const map=JSON.parse(await readFile(path.join(project,demo?'content/demo/map.json':'content/production/map.json'),'utf8'));
 let protocolVersion='openqs-native-demo-v1',mapIdentity=map.mapIdentity;
 if(demo){if(map.profile!=='demo')throw Error('Anonymous demo map identity required');}
 else{
  if(map.profile!=='production'||map.chunks?.length!==209)throw Error('Verified complete production campus required');
  for(const [file,key]of [['collision.bin','collisionHash'],['navigation.bin','navigationHash'],['vision.bin','visionHash']])if(createHash('sha256').update(await readFile(path.join(project,'content/production',file))).digest('hex')!==mapIdentity?.[key])throw Error('Formal native raw map bytes changed: '+file);
  const game=path.resolve(project,'../校园逃生游戏'),source=JSON.parse(await readFile(path.join(game,'public/map/manifest.json'),'utf8')),index=JSON.parse(await readFile(path.join(game,'public/map/resource-index.json'),'utf8'));
  const canonical=mapIdentityFromIndex(source,index);assertSameMapIdentity(mapIdentity,canonical);
  if(createHash('sha256').update(await readFile(path.join(game,'public/map/manifest.json'))).digest('hex')!==mapIdentity.manifestHash)throw Error('Current map index is stale');
  protocolVersion=canonicalProtocolVersion(await readFile(path.resolve(project,'../校园共享模块/src/protocol.ts'),'utf8'));
  const combat=JSON.parse(await readFile(path.join(project,'content/combat/manifest.json'),'utf8'));
  if(combat.profile!=='production'||combat.protocolVersion!==protocolVersion)throw Error('Formal combat resources or protocol are stale');
  if(preview){const gate=await readFile(path.join(project,'src/physics/compatibility_gate.gd'),'utf8');if(!/const\s+VERIFIED_PREDICTION\s*(?::=|=)\s*true\b/.test(gate))throw Error('Production native compatibility gate is not approved; use --internal');}
 }
 return{protocolVersion,mapIdentity,sourceHash:await nativeSourceHash(project,mapIdentity,{demo})};
}
export async function collectExportFiles(directory){
 const rows=[];
 async function walk(relative=''){
  for(const item of await readdir(path.join(directory,relative),{withFileTypes:true})){
   const name=relative?relative+'/'+item.name:item.name;
   if(item.isSymbolicLink())throw Error('Native export cannot contain symbolic links');
   if(item.isDirectory())await walk(name);
   else if(item.isFile()){
    if(/(^|\/)(private|work|[.]git|docs|tests|scripts|node_modules)(\/|$)|(^|\/)[.]env($|[.])|[.](pem|key|keystore|jks|sqlite|log)$/i.test(name)||/android-internal-signing|account-.*[.]bin/.test(name))throw Error('Private or development file in native export: '+name);
    const bytes=await readFile(path.join(directory,name));rows.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
   }
  }
 }
 await walk();return rows.sort((a,b)=>a.path.localeCompare(b.path,'en'));
}
