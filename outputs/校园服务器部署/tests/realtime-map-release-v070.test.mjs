import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {REALTIME_MAP_FILES,mapIdentityFromIndex,validatePackagedRealtimeMap,assertSameMapIdentity,verifyRealtimeWorkersMap,selectCompatibleRollbackRealtime} from '../scripts/map-cache-policy.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(){
 const manifest=Buffer.from(JSON.stringify({sourceVersion:'v16',collisionUrl:'/map/collision.bin',navmeshUrl:'/map/navigation.bin',visionUrl:'/map/vision.bin'})),payload=[manifest,Buffer.from('collision'),Buffer.from('navigation'),Buffer.from('vision')],resources={};
 for(let i=1;i<4;i++){const bytes=payload[i],hash=sha(bytes);resources['/map/'+REALTIME_MAP_FILES[i]]={sha256:hash,bytes:bytes.length,url:'/assets/map/'+hash+'.bin',mime:'application/octet-stream'};}
 const index={schema:1,manifest:{url:'/map/manifest.json',sha256:sha(manifest)},resources},data=new Map([['/release/game/map/manifest.json',manifest],['/release/game/map/resource-index.json',Buffer.from(JSON.stringify(index))],...REALTIME_MAP_FILES.map((name,i)=>['/release/server-realtime/assets/map/'+name,payload[i]])]);
 return {data,index,manifest:JSON.parse(manifest),read:async p=>{if(!data.has(p))throw Object.assign(Error('missing '+p),{code:'ENOENT'});return data.get(p);}};
}
test('four version-bound realtime byte files produce the same identity as game index',async()=>{const f=fixture(),identity=await validatePackagedRealtimeMap('/release',f.read);assert.deepEqual(identity,mapIdentityFromIndex(f.manifest,f.index));assert.equal(identity.visionHash,sha(Buffer.from('vision')));});
test('missing vision, stale collision and unbound game manifest fail before publication',async()=>{for(const change of [f=>f.data.delete('/release/server-realtime/assets/map/vision.bin'),f=>f.data.set('/release/server-realtime/assets/map/collision.bin',Buffer.from('old')),f=>f.data.set('/release/game/map/manifest.json',Buffer.from('{}'))]){const f=fixture();change(f);await assert.rejects(()=>validatePackagedRealtimeMap('/release',f.read));}});
test('public expected multiplayer identity cannot omit indexed vision',()=>{const f=fixture();delete f.index.resources['/map/vision.bin'];assert.throws(()=>mapIdentityFromIndex(f.manifest,f.index),/visionHash/);});
test('all three actual worker map responses must match including vision',async()=>{const identity=mapIdentityFromIndex(fixture().manifest,fixture().index),calls=[];const fetcher=async url=>{calls.push(url);return {ok:true,json:async()=>identity};};await verifyRealtimeWorkersMap(identity,fetcher);assert.deepEqual(calls.map(u=>new URL(u).port),['2567','2568','2569']);for(const wrong of [{...identity,collisionHash:'f'.repeat(64)},{...identity,visionHash:undefined}])await assert.rejects(()=>verifyRealtimeWorkersMap(identity,async url=>({ok:true,json:async()=>url.includes('2568')?wrong:identity})),/identity mismatch/);});
test('rollback restores same-version realtime and rejects cross-protocol or pre-operations fallback',()=>{assert.equal(selectCompatibleRollbackRealtime('/old/rt','0.6.9','0.6.9',{operationalFallback:true}),'/old/rt');assert.throws(()=>selectCompatibleRollbackRealtime('/new/rt','0.6.9','0.7.0'),/static version/);assert.throws(()=>selectCompatibleRollbackRealtime('/old/rt','0.6.8','0.6.8',{operationalFallback:true}),/operational/);});
test('current game and realtime map bytes share the derived visual identity and unchanged accepted physics',async()=>{
 const root=new URL('../../',import.meta.url),read=async p=>readFile(new URL(p.replace('/fixture/',''),root));
 const identity=await validatePackagedRealtimeMap('/fixture',async p=>read(p.replace('/game/','/校园逃生游戏/public/').replace('/server-realtime/','/校园联机服务/')));
 const derivative=JSON.parse(await readFile(new URL('../../校园逃生游戏/docs/v0.7.1/map-derivation.json',import.meta.url)));
 assertSameMapIdentity(identity,{sourceVersion:'v16',manifestHash:derivative.manifestSha256,
  collisionHash:'5772de798dfac4d8e440ac44fce6891e4729b4ac5eedf21abeb4e7372fe6063e',
  navigationHash:'5bcaf0904e92e79f1e15509155ce90d323918fc6eae5d6621eeff402d907d4ca',
  visionHash:'1fbb6d4422da57592b54e5fc48bcbcd0b09003b7953958c096217829db63382a'});
});
