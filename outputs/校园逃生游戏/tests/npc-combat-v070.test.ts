import test from 'node:test';
import assert from 'node:assert/strict';
import {NPC_COMBAT_PROFILES,NPC_SENSE_RULES,npcReaction,npcSightEligible,playerWeaponSpread} from '../../校园共享模块/src/npc-combat.ts';
import {WEAPONS} from '../../校园共享模块/src/rules.ts';
import {EscapeAttack,EscapeFireCoordinator} from '../src/escape/fire.ts';
import {EscapeTactics,type TacticalAgent,type TacticalProbe} from '../src/escape/tactics.ts';

test('light profile preserves prior cadence; standard and challenge have bounded readable reactions',()=>{
 assert.deepEqual([NPC_COMBAT_PROFILES.easy.initialAim,NPC_COMBAT_PROFILES.easy.nextAim,NPC_COMBAT_PROFILES.easy.burst,NPC_COMBAT_PROFILES.easy.cooldownMin,NPC_COMBAT_PROFILES.easy.cooldownMax],[.9,.55,2,1.8,2.6]);
 for(const difficulty of ['easy','standard','hard'] as const){const p=NPC_COMBAT_PROFILES[difficulty];assert.equal(npcReaction(difficulty,()=>0),p.reactionMin);assert.equal(npcReaction(difficulty,()=>1),p.reactionMax);assert.ok(p.reactionMin>0);assert.ok(p.memory<=9);}
 assert.ok(NPC_COMBAT_PROFILES.hard.reactionMin<NPC_COMBAT_PROFILES.standard.reactionMin);
});
test('sight requires orientation and clear cover; close hearing never substitutes for sight',()=>{
 assert.equal(npcSightEligible([0,1.5,0],[0,1.5,-10],0,false,true),true);
 assert.equal(npcSightEligible([0,1.5,0],[0,1.5,10],0,false,true),false);
 assert.equal(npcSightEligible([0,1.5,0],[0,1.5,-2],0,false,false),false);
 assert.equal(npcSightEligible([0,1.5,0],[0,1.5,2],0,false,true),true);
 assert.equal(npcSightEligible([0,1.5,0],[0,1.5,-30],0,true,true),false);
 assert.equal(npcSightEligible([0,1.5,0],[0,1.5,-30],0,false,true),true);
 assert.equal(NPC_SENSE_RULES.footstepMemory,3);
});
test('seven-gun actual spread is shared by HUD and authoritative movement penalties',()=>{
 for(const id of Object.keys(WEAPONS) as (keyof typeof WEAPONS)[]){const base=WEAPONS[id].spread;assert.equal(playerWeaponSpread(id,{aim:false,actualSpeed:0}),base);assert.equal(playerWeaponSpread(id,{aim:true,actualSpeed:0}),base*.55);assert.equal(playerWeaponSpread(id,{aim:false,actualSpeed:3,sliding:true}),base*1.7*1.65);}
});
test('profile cadence does not bypass fair seats or staggered first shots',()=>{
 for(const difficulty of ['easy','standard','hard'] as const){const scheduler=new EscapeFireCoordinator(difficulty),agents=Array.from({length:6},(_,id)=>({id,attack:new EscapeAttack(),eligible:true,reloading:false,automatic:true}));
  scheduler.update(0,agents);assert.equal(scheduler.active,{easy:2,standard:3,hard:4}[difficulty]);
  for(const a of agents.filter(a=>scheduler.owns(a.id))){assert.equal(a.attack.remaining,NPC_COMBAT_PROFILES[difficulty].burst);assert.equal(a.attack.left,NPC_COMBAT_PROFILES[difficulty].initialAim);}
  scheduler.update(1,agents);const first=agents.find(a=>scheduler.canFire(a.id))!;assert.ok(first);scheduler.fired(first.id,()=>0);
  assert.equal(agents.filter(a=>a.id!==first.id&&scheduler.canFire(a.id)).length,0);
  scheduler.update(.35,agents);assert.ok(agents.some(a=>a.id!==first.id&&scheduler.canFire(a.id)));
 }
});
test('obstacle-side cover is validated physically and route probes remain bounded',()=>{
 const tactics=new EscapeTactics(),a:TacticalAgent={id:0,position:[0,0,0],known:[0,0,-20],sees:true,hasSeen:true,memory:8,active:true,busy:false,reloading:false,needsReload:true,attackPhase:'search',patrolTarget:[0,0,10]};let obstacles=0,routes=0;
 const probe:TacticalProbe={project:p=>p,route:(from,to)=>{routes++;return[from,to];},safe:()=>true,visible:()=>false,geometryVisible:()=>false,obstacle:(_from,to)=>{obstacles++;return[to[0]*2/3,.85,to[2]*2/3];}};
 tactics.update(.2,[a],'standard');const decision=tactics.decide(a,probe,[a]);assert.equal(obstacles,8);assert.equal(decision.state,'cover');assert.ok(routes<=3);assert.equal(decision.canReload,false);
 const light=new EscapeTactics();obstacles=0;light.update(.2,[a],'easy');light.decide(a,probe,[a]);assert.equal(obstacles,0);
});
