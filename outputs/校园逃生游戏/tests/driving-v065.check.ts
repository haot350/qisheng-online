import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import {drivetrainFixture,DRIVE_IDLE} from './drivetrain-fixture.ts';
import {DRIVING_TUNING as T} from '../src/driving-tuning.ts';
const dt=1/60,gas={...DRIVE_IDLE,throttle:1},records:Record<string,unknown>={
 before:{version:'0.6.4',coastFrom89_48Kph:[79.81,70.69,62.11],coastSeconds:[1,2,3],singleNpc:{beforeKph:89.49,afterKph:1.73},method:'Read-only current-Rapier flat fixture probes before edits; previous speed limits 90/120 km/h.'}
};
after(()=>{mkdirSync(new URL('../docs/v0.6.5/',import.meta.url),{recursive:true});writeFileSync(new URL('../docs/v0.6.5/driving-physics.json',import.meta.url),JSON.stringify({version:'0.6.5',step:dt,records},null,2));});
test('75/100 limits and a gradual coast are actual Rapier vehicle movement',async()=>{
 const f=await drivetrainFixture();try{
  f.run(14,gas);const normal=f.car.read().horizontalSpeed*3.6;assert.ok(normal>73.5&&normal<=75.2,`normal ${normal}`);
  const start=f.car.read().horizontalSpeed;let to60=0,to50=0,firstLoss=0;
  for(let i=0;i<900;i++){const before=f.car.read().horizontalSpeed;f.tick();if(i===0)firstLoss=before-f.car.read().horizontalSpeed;if(!to60&&f.car.read().horizontalSpeed<=60/3.6)to60=(i+1)*dt;if(f.car.read().horizontalSpeed<=50/3.6){to50=(i+1)*dt;break;}}
  assert.ok(firstLoss<.03,`no abrupt coast brake ${firstLoss}`);assert.ok(to60>5.5&&to60<8.5,`coast to60 ${to60}`);assert.ok(to50>=10&&to50<=14,`coast to50 ${to50}`);
  f.run(5,gas);f.run(3,gas,true);const boost=f.car.read().horizontalSpeed*3.6;assert.ok(boost>97&&boost<=100.2,`boost ${boost}`);
  f.run(3,gas);const afterBoost=f.car.read().horizontalSpeed*3.6;assert.ok(afterBoost>75&&afterBoost<boost,'boost expiry does not clamp velocity');
  records.speedAndCoast={normalKph:normal,coastStartKph:start*3.6,coastTo60Seconds:to60,coastTo50Seconds:to50,firstStepLoss:firstLoss,boostAfter3SecondsKph:boost,threeSecondsAfterBoostKph:afterBoost};
 }finally{f.dispose();}
});
test('real NPC contacts launch once, retain motion, and apply bounded horizontal reaction',async()=>{
 const f=await drivetrainFixture();try{
  f.run(12,gas);const start=f.car.read();f.actor(0,start.position.x,start.position.z-20);const hits:number[]=[];let impact:unknown;
  for(let i=0;i<150;i++){const before=f.car.read(),change=f.tick(gas),s=f.car.read();for(const hit of change.impacts){hits.push(hit.id);impact={beforeKph:before.horizontalSpeed*3.6,afterKph:s.horizontalSpeed*3.6,speedLoss:before.horizontalSpeed-s.horizontalSpeed,closing:hit.speed};assert.ok(s.horizontalSpeed>before.horizontalSpeed*.9);assert.ok(before.horizontalSpeed-s.horizontalSpeed<T.npcMaximumHorizontalImpulse/1500+.08);assert.equal(f.car.npc(hit.id)?.phase,'flying');}}
  assert.deepEqual(hits,[0]);records.npcImpact=impact;
  f.car.reset();f.chassis.setLinvel({x:8,y:3,z:0},true);const sideways=f.car.read();assert.ok(Math.abs(sideways.horizontalSpeed-8)<1e-6);assert.ok(Math.abs(sideways.speed)<.01);records.sideways={horizontal:sideways.horizontalSpeed,forward:sideways.speed};
 }finally{f.dispose();}
});
test('four contacts can score together; misses, low-speed nudges and a real wall retain physical boundaries',async()=>{
 const f=await drivetrainFixture();try{
  f.run(12,gas);const p=f.car.read().position;for(let i=0;i<4;i++)f.actor(i,p.x+(i-1.5)*.35,p.z-20);let together=0,beforeKph=0,afterKph=0,total=0;
  for(let i=0;i<100;i++){const before=f.car.read(),c=f.tick(gas);total+=c.impacts.length;if(c.impacts.length>together){together=c.impacts.length;beforeKph=before.horizontalSpeed*3.6;afterKph=f.car.read().horizontalSpeed*3.6;}}
  assert.equal(total,4);assert.equal(together,4);assert.ok(afterKph>beforeKph*.75);records.fourContacts={together,beforeKph,afterKph};
 }finally{f.dispose();}
 for(const kind of ['miss','low','wall'] as const){const q=await drivetrainFixture();try{
  if(kind==='low')q.chassis.setLinvel({x:0,y:0,z:-2},true);else q.run(12,gas,kind==='wall');
  const p=q.car.read().position;q.actor(0,p.x+(kind==='miss'?1.5:0),p.z-(kind==='low'?5:20));let wallZ=0;
  if(kind==='wall'){wallZ=p.z-24;q.world.createCollider(RAPIER.ColliderDesc.cuboid(10,3,.05).setTranslation(p.x,3,wallZ));}
  let hits=0,minZ=Infinity,minPostContactSpeed=Infinity;for(let i=0;i<180;i++){hits+=q.tick(kind==='low'?DRIVE_IDLE:gas,kind==='wall').impacts.length;const state=q.car.read();minZ=Math.min(minZ,state.position.z);if(hits&&i>80)minPostContactSpeed=Math.min(minPostContactSpeed,state.horizontalSpeed);}
  assert.equal(hits,kind==='wall'?1:0,`${kind} contact count`);if(kind==='wall'){assert.ok(minZ>wallZ+1.5,'car must remain on near side of the wall');assert.ok(minPostContactSpeed<.3,'real wall contact stops forward travel before throttle can push again');}
  records[kind]={hits,minZ,wallZ,minPostContactSpeed,horizontalSpeed:q.car.read().horizontalSpeed};
 }finally{q.dispose();}}
});
test('40/75/100 handbrake turns and counter-steer recover progressively while maintaining suspension',async()=>{
 const results=[];for(const kph of [40,75,100])for(const counterSteer of [false,true]){const f=await drivetrainFixture();try{
  f.run(12,gas,kph>75);while(f.car.read().horizontalSpeed>kph/3.6+.15)f.tick();
  for(let i=0;i<24;i++)f.tick({...gas,throttle:.4,steer:1},kph>75);
  let peak=0,minUp=1,minContacts=4,maxAssistDrop=0,previous=0,releaseSlip=0,slipAfter15=0;
  for(let i=0;i<180;i++){f.tick({...DRIVE_IDLE,throttle:.5,steer:i<42?1:i<78?(counterSteer?-.6:.45):0,handbrake:i<42},kph>75);const s=f.car.read(),up=1-2*(s.rotation.x*s.rotation.x+s.rotation.z*s.rotation.z),slip=Math.abs(s.slipAngle)*180/Math.PI;if(i===41)releaseSlip=slip;if(i===131)slipAfter15=slip;peak=Math.max(peak,slip);minUp=Math.min(minUp,up);minContacts=Math.min(minContacts,s.wheelContacts);maxAssistDrop=Math.max(maxAssistDrop,previous-s.handbrakeAssist);previous=s.handbrakeAssist;assert.ok(!s.resetRequired);}
  assert.ok(minUp>.92);assert.ok(minContacts>=3);assert.equal(f.car.read().handbrakeAssist,0);assert.ok(maxAssistDrop<=.1,'grip recovery has no one-frame snap');
  if(kph===75)assert.ok(peak>=12&&peak<=25,'normal-speed turn produces a visible light slide');assert.ok(slipAfter15<2,'release or counter-steer converges within 1.5 seconds');
  results.push({initialKph:kph,counterSteer,steeringLeadSeconds:.4,handbrakeSeconds:.7,peakSlipDegrees:peak,slipAtReleaseDegrees:releaseSlip,slip15SecondsAfterRelease:slipAfter15,finalSlipDegrees:Math.abs(f.car.read().slipAngle)*180/Math.PI,minUp,minContacts,maxAssistDrop});
 }finally{f.dispose();}}records.handbrake=results;
});
