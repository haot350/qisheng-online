import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {nativeReleaseEntry,nativeSourceHash,NATIVE_ACCEPTANCE_IDS,NATIVE_COMBAT_CAPABILITIES} from './native-release-policy.mjs';
const h=character=>character.repeat(64),mapIdentity={sourceVersion:'fixture-v1',manifestHash:h('a'),collisionHash:h('b'),navigationHash:h('c'),visionHash:h('d')};
const artifact={name:'native-test-0.1.0.zip',bytes:1234,sha256:h('e')},sourceHash=h('f');
const qa={schema:1,kind:'native-release-acceptance',profile:'production',passed:true,platform:'windows',version:'0.1.0',checkedAt:'2026-01-01T00:00:00Z',sourceHash,protocolVersion:'campus-mp-0.9.0',mapIdentity,artifact,minimumOS:'Windows 10 x64',notes:['Synthetic policy fixture; never a production acceptance.'],tests:NATIVE_ACCEPTANCE_IDS.map(id=>({id,passed:true,evidence:'evidence.json',evidenceSha256:h('1')}))};
const test=id=>qa.tests.find(row=>row.id===id);
Object.assign(test('physics-parity'),{maxPositionErrorM:.00001});
for(const id of ['crossplay-tdm','crossplay-ffa'])Object.assign(test(id),{realNativeClient:true,realWebClient:true,completed:true,durationSeconds:600});
Object.assign(test('prediction-network'),{applicationDelayMs:[0,100,200],unobstructedCorrectionP95M:.05,unexplainedHardJumps:0});
Object.assign(test('combat-capabilities'),{capabilities:NATIVE_COMBAT_CAPABILITIES});
Object.assign(test('credentials-isolation'),{originBound:true,dpapi:true});
Object.assign(test('package-boundary'),{formalAssets:true,fullOpenCampus:true,secretsExcluded:true,closedAreasPreserved:true});
Object.assign(test('licenses'),{runtimeNoticesIncluded:true});Object.assign(test('startup-install'),{nativeRuntime:true,portable:true});
Object.assign(test('performance'),{frameP95Ms:16,longestFrameMs:40,residentBytes:1000000,drawCalls:300,unexplainedSevereFreeze:false});
const context={protocolVersion:qa.protocolVersion,mapIdentity,artifact,sourceHash};let checks=0;
assert.equal(nativeReleaseEntry(qa,context).downloadUrl,'/native/releases/'+artifact.sha256+'/'+artifact.name);checks++;
assert.equal(nativeReleaseEntry(qa,{...context,now:Date.parse('2027-01-01T00:00:00Z')}).available,true);checks++;
for(const mutate of [q=>q.passed=false,q=>q.sourceHash=h('0'),q=>q.protocolVersion='campus-mp-0.8.2',q=>q.mapIdentity.visionHash=h('0'),q=>q.artifact.bytes++,q=>q.tests.pop(),q=>q.tests[0].evidenceSha256='',q=>q.tests.find(t=>t.id==='crossplay-tdm').completed=false,q=>q.tests.find(t=>t.id==='prediction-network').unexplainedHardJumps=1,q=>q.tests.find(t=>t.id==='credentials-isolation').dpapi=false,q=>q.tests.find(t=>t.id==='licenses').runtimeNoticesIncluded=false,q=>q.minimumOS='\nprivate',q=>q.checkedAt='2999-01-01T00:00:00Z']){
 const changed=structuredClone(qa);mutate(changed);assert.throws(()=>nativeReleaseEntry(changed,context));checks++;
}
const android=structuredClone(qa);android.platform='android';assert.throws(()=>nativeReleaseEntry(android,context));checks++;
const androidContext={...context,allowAndroid:true,artifact:{...artifact,name:'native-test.apk'}};
Object.assign(android.tests.find(t=>t.id==='credentials-isolation'),{keystore:true});Object.assign(android.tests.find(t=>t.id==='startup-install'),{signed:true});
assert.throws(()=>nativeReleaseEntry(android,androidContext));checks++;
android.realDevice={verified:true,model:'Synthetic fixture',os:'Android fixture'};assert.equal(nativeReleaseEntry(android,androidContext).available,true);checks++;
const temporary=await mkdtemp(path.join(os.tmpdir(),'openqs-native-source-'));
try{
 for(const directory of ['src','scenes','themes','physics-rs/src','content/combat','content/production','docs','work'])await mkdir(path.join(temporary,directory),{recursive:true});
 for(const file of ['src/main.gd','scenes/lobby.tscn','themes/tactical.tres','physics-rs/src/lib.rs','project.godot','main.tscn','export_presets.cfg','physics-rs/Cargo.toml','physics-rs/Cargo.lock','physics-rs/rust-toolchain.toml','physics-rs/movement-source.json','content/combat/weapons.json','content/combat/manifest.json','content/production/map.json'])await writeFile(path.join(temporary,file),'fixture');
 const initial=await nativeSourceHash(temporary,mapIdentity);await writeFile(path.join(temporary,'docs/notes.md'),'does not change runtime');await writeFile(path.join(temporary,'work/output.bin'),'does not change runtime');await writeFile(path.join(temporary,'src/cache.import'),'import cache');
 assert.equal(await nativeSourceHash(temporary,mapIdentity),initial);checks++;
 await writeFile(path.join(temporary,'src/main.gd'),'runtime changed');assert.notEqual(await nativeSourceHash(temporary,mapIdentity),initial);checks++;
 assert.notEqual(await nativeSourceHash(temporary,{...mapIdentity,visionHash:h('0')}),await nativeSourceHash(temporary,mapIdentity));checks++;
}finally{await rm(temporary,{recursive:true,force:true});}
console.log(JSON.stringify({passed:true,checks,syntheticPolicyOnly:true,productionTouched:false}));
