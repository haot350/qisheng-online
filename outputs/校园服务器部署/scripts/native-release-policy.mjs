// A native download is independent of web publication and never changes gameplay data.
import {readFile,readdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const NATIVE_IDENTITY_FIELDS=['sourceVersion','manifestHash','collisionHash','navigationHash','visionHash'];
export const NATIVE_ACCEPTANCE_IDS=['physics-parity','crossplay-tdm','crossplay-ffa','prediction-network','combat-capabilities','credentials-isolation','package-boundary','licenses','startup-install','performance'];
export const NATIVE_COMBAT_CAPABILITIES=['m4a1','ak47','mp5','r870','awm','m249','glock','ads','reload','hit-feedback','smoke','grenade','helmet','weapon-drop','weapon-pickup','respawn','spectate','score','result','pause','reconnect','loading-gate'];
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const assert=(value,message)=>{if(!value)throw Error(message);};
export function hasImmutableNativeCache(value){
 const directives=String(value??'').toLowerCase().split(',').map(item=>item.trim());
 return directives.includes('public')&&directives.includes('immutable')&&directives.some(item=>/^max-age=\d+$/.test(item)&&Number(item.slice(8))>=31536000)&&!directives.some(item=>item==='no-store'||item==='private');
}
export function nativeReleaseEntry(qa,{protocolVersion,mapIdentity,artifact,sourceHash,now=Date.now(),allowAndroid=false}={}){
 assert(qa?.schema===1&&qa.kind==='native-release-acceptance'&&qa.profile==='production'&&qa.passed===true,'A successful production native acceptance receipt is required');
 assert(['windows','android'].includes(qa.platform),'Invalid native platform');
 assert(qa.platform!=='android'||allowAndroid,'Android publication requires explicit --allow-android and real-device acceptance');
 assert(/^\d+\.\d+\.\d+$/.test(qa.version),'Invalid native version');
 const checkedAt=Date.parse(qa.checkedAt);assert(Number.isFinite(checkedAt)&&checkedAt<=now+60000,'Native acceptance time is invalid');
 assert(sha(sourceHash)&&qa.sourceHash===sourceHash,'Native source changed after acceptance');
 assert(qa.protocolVersion===protocolVersion,'Native protocol does not match canonical shared protocol');
 for(const key of NATIVE_IDENTITY_FIELDS)assert(qa.mapIdentity?.[key]===mapIdentity?.[key]&&(key==='sourceVersion'?typeof mapIdentity[key]==='string'&&mapIdentity[key].length>0&&mapIdentity[key].length<=80:sha(mapIdentity[key])),'Native map identity mismatch: '+key);
 assert(artifact&&Number.isSafeInteger(artifact.bytes)&&artifact.bytes>0&&sha(artifact.sha256)&&qa.artifact?.bytes===artifact.bytes&&qa.artifact.sha256===artifact.sha256,'Native package size or SHA does not match acceptance');
 const extension=qa.platform==='windows'?'zip':'apk';
 assert(typeof artifact.name==='string'&&new RegExp('^[a-zA-Z0-9][a-zA-Z0-9._-]*[.]'+extension+'$').test(artifact.name),'Native package extension or filename is invalid');
 assert(typeof qa.minimumOS==='string'&&qa.minimumOS.trim().length>0&&qa.minimumOS.length<=80&&!/[\r\n\u0000-\u001f]/.test(qa.minimumOS),'Invalid minimumOS');
 assert(Array.isArray(qa.notes)&&qa.notes.length<=8&&qa.notes.every(note=>typeof note==='string'&&note.length<=240&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(note)),'Invalid public native release notes');
 assert(Array.isArray(qa.tests)&&qa.tests.length===NATIVE_ACCEPTANCE_IDS.length,'Native acceptance must contain exactly the required checks');
 const checks=new Map(qa.tests.map(test=>[test.id,test]));assert(checks.size===NATIVE_ACCEPTANCE_IDS.length,'Duplicate native acceptance checks');
 for(const id of NATIVE_ACCEPTANCE_IDS){const test=checks.get(id);assert(test?.passed===true&&typeof test.evidence==='string'&&test.evidence.length>0&&sha(test.evidenceSha256),'Missing passed native check or evidence hash: '+id);}
 const physics=checks.get('physics-parity');assert(finite(physics.maxPositionErrorM)&&physics.maxPositionErrorM<=.005,'Native physical parity exceeds the 5mm gate');
 for(const id of ['crossplay-tdm','crossplay-ffa']){const test=checks.get(id);assert(test.realNativeClient===true&&test.realWebClient===true&&test.completed===true&&finite(test.durationSeconds)&&test.durationSeconds>=600,'A complete real native/web 10-minute match is required: '+id);}
 const network=checks.get('prediction-network');assert(Array.isArray(network.applicationDelayMs)&&[0,100,200].every(value=>network.applicationDelayMs.includes(value))&&finite(network.unobstructedCorrectionP95M)&&network.unobstructedCorrectionP95M<.25&&network.unexplainedHardJumps===0,'Native prediction/network acceptance is incomplete');
 const combat=checks.get('combat-capabilities');assert(Array.isArray(combat.capabilities)&&NATIVE_COMBAT_CAPABILITIES.every(value=>combat.capabilities.includes(value)),'Native combat coverage is incomplete');
 const credentials=checks.get('credentials-isolation');assert(credentials.originBound===true&&(qa.platform==='windows'?credentials.dpapi===true:credentials.keystore===true),'Native credentials must use origin-bound platform secure storage');
 const boundary=checks.get('package-boundary');assert(boundary.formalAssets===true&&boundary.fullOpenCampus===true&&boundary.secretsExcluded===true&&boundary.closedAreasPreserved===true,'Native production package boundary checks are incomplete');
 assert(checks.get('licenses').runtimeNoticesIncluded===true,'Native package is missing runtime license acceptance');
 const startup=checks.get('startup-install');assert(startup.nativeRuntime===true&&(qa.platform==='windows'?startup.portable===true:startup.signed===true),'Native startup/install acceptance is incomplete');
 const performance=checks.get('performance');assert(finite(performance.frameP95Ms)&&finite(performance.longestFrameMs)&&finite(performance.residentBytes)&&finite(performance.drawCalls)&&performance.unexplainedSevereFreeze===false,'Native performance evidence is incomplete');
 if(qa.platform==='android')assert(qa.realDevice?.verified===true&&typeof qa.realDevice.model==='string'&&qa.realDevice.model.trim()&&typeof qa.realDevice.os==='string'&&qa.realDevice.os.trim(),'Android requires identified real-device acceptance');
 return{available:true,version:qa.version,protocolVersion:qa.protocolVersion,mapIdentity:Object.fromEntries(NATIVE_IDENTITY_FIELDS.map(key=>[key,qa.mapIdentity[key]])),downloadUrl:'/native/releases/'+artifact.sha256+'/'+artifact.name,bytes:artifact.bytes,sha256:artifact.sha256,minimumOS:qa.minimumOS,notes:[...qa.notes]};
}

// Hash runtime source, locked physics inputs and formal identity, never build/cache output.
export async function nativeSourceSnapshot(projectRoot,mapIdentity,{demo=false}={}){
 const files=[];
 async function walk(relative){
  for(const entry of await readdir(path.join(projectRoot,relative),{withFileTypes:true})){
   const name=relative+'/'+entry.name;
   if(entry.isSymbolicLink())throw Error('Native source cannot contain symbolic links: '+name);
   if(entry.isDirectory())await walk(name);
   else if(entry.isFile()&&!entry.name.endsWith('.import'))files.push(name);
  }
 }
 for(const directory of ['src','scenes','themes','physics-rs/src'])await walk(directory);
 files.push('project.godot','main.tscn','export_presets.cfg','physics-rs/Cargo.toml','physics-rs/Cargo.lock','physics-rs/rust-toolchain.toml','physics-rs/movement-source.json',...(demo?['content/demo/map.json','content/demo/weapons.json']:['content/combat/weapons.json','content/combat/manifest.json','content/production/map.json']));
 const rows=[];
 for(const file of files.sort()){
  const absolute=path.join(projectRoot,file),info=await lstat(absolute);
  if(!info.isFile()||info.isSymbolicLink())throw Error('Native source must be a regular file: '+file);
  const bytes=await readFile(absolute);rows.push({path:file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 const identity=Object.fromEntries(NATIVE_IDENTITY_FIELDS.map(key=>[key,mapIdentity?.[key]]));
 const sourceHash=createHash('sha256').update(JSON.stringify({schema:1,profile:demo?'demo':'production',files:rows,mapIdentity:identity})).digest('hex');
 return{schema:1,sourceHash,files:rows,mapIdentity:identity};
}
export async function nativeSourceHash(projectRoot,mapIdentity,options){return(await nativeSourceSnapshot(projectRoot,mapIdentity,options)).sourceHash;}
