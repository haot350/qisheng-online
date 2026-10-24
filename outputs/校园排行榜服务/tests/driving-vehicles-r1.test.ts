import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createApp} from '../dist/app.js';
import {validateConfig,replay} from '../dist/validation.js';
import {DRIVING_VEHICLES,DAFEI_RULE_VERSION,DAFEI_VEHICLE_RULE_VERSION,drivingRuleVersion,drivingRankingRules,RankingDriveScore,type DrivingVehicleId,type RankingRunConfig,type RankingEvent,type RankingSummary} from '../dist/shared.js';
import {eligibleAchievementIds} from '@qisheng/shared/achievements';

const config=(vehicleId?:DrivingVehicleId):RankingRunConfig=>({mode:'dafei',ruleVersion:drivingRuleVersion(vehicleId),...(vehicleId?{vehicleId}:{}),seed:1,weapon:'vehicle',roster:['jiang','meng','xu','luan'],tasks:[],controls:'keyboard',transmission:'auto'});
const summary=(extra:Partial<RankingSummary>={}):RankingSummary=>({won:true,elapsed:300,score:0,hits:0,bestCombo:0,damage:0,controls:'keyboard',transmission:'auto',...extra});
const event=(seq:number,t:number,type:RankingEvent['type'],data:Record<string,unknown>={}):RankingEvent=>({seq,t,order:seq,type,data});
const mixedEvents:RankingEvent[]=[
 event(1,0,'npc-spawn',{npcId:0,generation:0,identity:'jiang'}),
 event(2,0,'npc-spawn',{npcId:1,generation:0,identity:'meng'}),
 event(3,1,'cannon',{action:'fire',shotId:1,position:[0,1,0],direction:[0,0,-1]}),
 event(4,1.2,'cannon',{action:'explode',shotId:1,position:[0,1,-10]}),
 event(5,1.2,'cannon',{action:'hit',shotId:1,npcId:0,generation:0,distance:3}),
 event(6,1.3,'hit',{npcId:1,generation:0,speed:5}),
];
const mixedSummary=summary({vehicleId:'tank',score:300,hits:1,cannonShots:1,cannonHits:1,totalHits:2,bestCombo:2});

test('vehicle identities preserve car rules and bind new vehicle tuning',()=>{
 assert.equal(drivingRuleVersion('bao5'),DAFEI_RULE_VERSION);
 assert.equal(drivingRuleVersion('tank'),DAFEI_VEHICLE_RULE_VERSION);
 assert.equal(drivingRankingRules(DAFEI_RULE_VERSION)?.durability,400);
 assert.equal(drivingRankingRules(DAFEI_VEHICLE_RULE_VERSION,'tank')?.durability,800);
 assert.equal(drivingRankingRules(DAFEI_VEHICLE_RULE_VERSION,'scooter')?.durability,160);
 assert.equal(DRIVING_VEHICLES.tank.cannonAmmo,8);
 assert.equal(DRIVING_VEHICLES.tank.cannonCooldown,4);
 assert.equal(DRIVING_VEHICLES.tank.cannonRadius,4);
 assert.equal(drivingRankingRules(DAFEI_RULE_VERSION,'tank'),undefined);
 assert.equal(validateConfig(config()).vehicleId,undefined);
 assert.throws(()=>validateConfig({...config('tank'),vehicleId:'unknown'}));
 assert.throws(()=>validateConfig({...config('tank'),transmission:'manual'}));
});

test('cannon and collisions share scoring while preserving physical hit counts',()=>{
 const result=replay(config('tank'),mixedEvents,mixedSummary);
 assert.deepEqual(result.flags,[]);
 assert.equal(result.summary.score,300);
 assert.equal(result.summary.hits,1);
 assert.equal(result.summary.cannonHits,1);
 assert.equal(result.summary.cannonShots,1);
 assert.equal(result.summary.totalHits,2);
 const score=new RankingDriveScore();score.hit(0,1,'cannon');score.hit(1,2);
 assert.deepEqual([score.score,score.hits,score.cannonHits,score.totalHits,score.bestCombo],[300,1,1,2,2]);
});

test('cannon requires fire, explosion, bounded coordinates and actual target generation',()=>{
 assert.throws(()=>replay(config('tank'),mixedEvents.filter(e=>e.seq!==4).map((e,i)=>({...e,seq:i+1})),mixedSummary));
 assert.throws(()=>replay(config('tank'),[...mixedEvents,event(7,1.4,'hit',{npcId:0,generation:0,speed:5})],mixedSummary));
 assert.throws(()=>replay(config('tank'),[...mixedEvents,event(7,1.4,'cannon',{action:'hit',shotId:1,npcId:0,generation:0})],mixedSummary));
 assert.throws(()=>replay(config('tank'),mixedEvents.map(e=>e.type==='cannon'&&e.data.action==='hit'?{...e,data:{...e.data,generation:1}}:e),mixedSummary));
 assert.throws(()=>replay(config('tank'),mixedEvents.map(e=>e.type==='cannon'&&e.data.action==='fire'?{...e,data:{...e.data,position:[Infinity,0,0]}}:e),mixedSummary));
 assert.throws(()=>replay(config('tank'),mixedEvents.map(e=>e.type==='cannon'&&e.data.action==='hit'?{...e,data:{...e.data,distance:5}}:e),mixedSummary));
 assert.throws(()=>replay(config(),mixedEvents,mixedSummary));
});

test('cannon ammunition and cooldown cannot be bypassed or replenished',()=>{
 const fire=(seq:number,t:number,id:number)=>event(seq,t,'cannon',{action:'fire',shotId:id});
 assert.throws(()=>replay(config('tank'),[fire(1,1,1),fire(2,4.5,2)],summary()));
 assert.throws(()=>replay(config('tank'),[fire(1,1,1),fire(2,5,1)],summary()));
 const eight=Array.from({length:8},(_,i)=>fire(i+1,i*4+1,i+1));
 assert.equal(replay(config('tank'),eight,summary({cannonShots:8})).summary.cannonShots,8);
 assert.throws(()=>replay(config('tank'),[...eight,fire(9,33,9)],summary()));
 assert.throws(()=>replay(config('tank'),mixedEvents,{...mixedSummary,cannonHits:2}));
 assert.throws(()=>replay(config('tank'),mixedEvents,{...mixedSummary,vehicleId:'scooter'}));
});

test('new NPC generation can score again after the existing recovery period',()=>{
 const events=[...mixedEvents,event(7,11.3,'npc-spawn',{npcId:0,identity:'jiang',generation:1}),event(8,12,'hit',{npcId:0,generation:1,speed:5})];
 const result=replay(config('tank'),events,{...mixedSummary,score:600,hits:2,totalHits:3,bestCombo:3});
 assert.equal(result.summary.hits,2);
 assert.equal(result.summary.cannonHits,1);
});

test('cannon self damage is tied to one explosion and matches remaining durability',()=>{
 const shell=[event(1,1,'cannon',{action:'fire',shotId:1}),event(2,1.2,'cannon',{action:'explode',shotId:1})];
 const hurt=event(3,1.2,'damage',{amount:100,source:'cannon',shotId:1,health:700});
 assert.equal(replay(config('tank'),[...shell,hurt],summary({damage:100})).summary.damage,100);
 assert.throws(()=>replay(config('tank'),[shell[0],{...hurt,seq:2}],summary({damage:100})));
 assert.throws(()=>replay(config('tank'),[...shell,hurt,{...hurt,seq:4}],summary({damage:200})));
 assert.throws(()=>replay(config('tank'),[...shell,{...hurt,data:{...hurt.data,amount:101,health:699}}],summary({damage:101})));
 assert.throws(()=>replay(config('tank'),[...shell,{...hurt,data:{...hurt.data,health:800}}],summary({damage:100})));
});

test('vehicle durability controls repair and termination without changing old car records',async()=>{
 const repaired=replay(config('scooter'),[event(1,1,'damage',{amount:100}),event(2,4,'repair',{id:'first',amount:80,before:60,after:140})],summary({damage:100}));
 assert.equal(repaired.summary.repairCount,1);
 assert.throws(()=>replay(config('scooter'),[event(1,1,'damage',{amount:160}),event(2,5,'repair',{id:'first',amount:160,before:0,after:160})],summary({damage:160})));
 const legacy=JSON.parse(await readFile(new URL('../docs/natural-driving-events.json',import.meta.url),'utf8'));
 const old=replay(validateConfig(legacy.config,{allowLegacy:true}),legacy.events,legacy.summary);
 assert.equal(old.summary.score,8000);assert.equal(old.summary.hits,23);assert.equal(old.summary.vehicleId,'bao5');
});

test('cannon statistics cannot grant real collision or car-only transmission achievements',()=>{
 const evidence={mode:'dafei' as const,won:true,elapsed:300,vehicleId:'tank' as const,hits:0,cannonHits:20,bestCombo:4,transmission:'manual' as const};
 const ids=eligibleAchievementIds(evidence);
 assert(!ids.includes('drive-twenty'));assert(!ids.includes('drive-manual'));
 assert(ids.includes('drive-finish'));assert(ids.includes('drive-combo'));
 assert(eligibleAchievementIds({...evidence,vehicleId:'bao5',hits:20}).includes('drive-twenty'));
});

test('actual API binds tickets, separates vehicle boards and preserves archived credentials',async()=>{
 const {app,db}=await createApp({dbPath:':memory:',credentialSecret:'isolated-driving-vehicle-test'});
 try{
  const register=await app.inject({method:'POST',url:'/v1/accounts/register',payload:{username:'车型验证玩家',password:'test-password'}});
  assert.equal(register.statusCode,200,register.body);const auth=register.json(),headers={authorization:'Bearer '+auth.token};
  for(const vehicleId of ['bao5','tank','scooter'] as const){
   const cfg=config(vehicleId==='bao5'?undefined:vehicleId),payload={config:cfg,clientRunId:'vehicle-test-'+vehicleId,recordStats:true,publishBoard:true};
   const created=await app.inject({method:'POST',url:'/v1/runs',headers,payload});assert.equal(created.statusCode,200,created.body);const ticket=created.json();
   if(vehicleId==='tank'){
    const duplicate=await app.inject({method:'POST',url:'/v1/runs',headers,payload});assert.equal(duplicate.json().runId,ticket.runId);
    const changed=await app.inject({method:'POST',url:'/v1/runs',headers,payload:{...payload,config:config('scooter')}});assert.equal(changed.statusCode,409,changed.body);
   }
   const settled=await app.inject({method:'POST',url:'/v1/runs/'+ticket.runId+'/finalize',headers,payload:{credential:ticket.credential,eventCount:0,summary:summary()}});assert.equal(settled.statusCode,200,settled.body);
  }
  for(const vehicleId of ['bao5','tank','scooter']){
   const board=await app.inject({method:'GET',url:'/v1/boards?mode=dafei&period=all&vehicleId='+vehicleId});assert.equal(board.statusCode,200,board.body);const value=board.json();assert.equal(value.total,1);assert.equal(value.entries[0].vehicleId,vehicleId);
  }
  assert.equal((await app.inject({method:'GET',url:'/v1/boards?mode=dafei&period=all'})).json().entries[0].vehicleId,'bao5');
  assert.equal((await app.inject({method:'GET',url:'/v1/boards?mode=dafei&period=all&vehicleId=other'})).statusCode,400);
  const profile=await app.inject({method:'GET',url:'/v1/accounts/profile',headers});assert.equal(profile.statusCode,200,profile.body);
  assert.deepEqual(profile.json().bestByRule.map((r:any)=>r.vehicleId).sort(),['bao5','scooter','tank']);
  assert.equal(db.pragma('user_version',{simple:true}),6);
 }finally{await app.close();}
});
