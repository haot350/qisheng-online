import test from 'node:test';
import assert from 'node:assert/strict';
import {NpcMovingAccuracy,npcMovingSpread,NPC_COMBAT_MOVEMENT} from '../src/npc-combat-motion.ts';
import {EscapeTactics,type TacticalAgent,type TacticalProbe} from '../src/escape/tactics.ts';
const agent=(changes:Partial<TacticalAgent>={}):TacticalAgent=>({id:0,position:[0,0,0],known:[0,0,20],sees:true,hasSeen:true,memory:7,active:true,busy:false,reloading:false,needsReload:false,attackPhase:'search',patrolTarget:[0,0,-10],weapon:'m4a1',...changes});
const open:TacticalProbe={project:p=>[...p],route:(a,b)=>[[...a],[...b]],safe:()=>true,visible:()=>true};

test('枪械站位产生行为差异，不影响伤害与站射精度',()=>{
 assert.equal(npcMovingSpread(0),1);assert.equal(npcMovingSpread(2.1),1.2);assert.equal(npcMovingSpread(3.2),1.6);
 assert.equal(npcMovingSpread(NaN),1);assert.equal(npcMovingSpread(-10),1);assert.equal(npcMovingSpread(7.2),1.6);
 const moving=(weapon:TacticalAgent['weapon'])=>{const d=new EscapeTactics(),a=agent({weapon,known:[0,0,10]});d.update(.2,[a],'easy');return d.decide(a,open,[a]);};
 assert.equal(moving('mp5').moving,true);assert.equal(moving('r870').moving,true);assert.equal(moving('m4a1').moving,false);
 assert.ok(NPC_COMBAT_MOVEMENT.r870.holdDistance<NPC_COMBAT_MOVEMENT.mp5.holdDistance);
});

test('散布按实际胶囊速度平滑，原地抵墙不产生跑射惩罚',()=>{
 const moving=new NpcMovingAccuracy();assert.equal(moving.update(1/60,0),1);
 const start=moving.update(1/60,3.2);assert.ok(start>1&&start<1.6);
 for(let i=0;i<60;i++)moving.update(1/60,3.2);assert.equal(moving.read(),1.6);
 for(let i=0;i<60;i++)moving.update(1/60,0);assert.equal(moving.read(),1);
 moving.update(.1,3.2);const paused=moving.read();assert.equal(moving.update(0,0),paused);
 moving.reset();assert.equal(moving.read(),1);assert.throws(()=>moving.update(-1,0),RangeError);
});

test('瞄准和开火期间可走已验证换位路线，失去視线后只走最后线索',()=>{
 const d=new EscapeTactics(),a=agent({position:[0,0,10],attackPhase:'cooldown'});d.update(.2,[a],'easy');const flank=d.decide(a,open,[a]);
 assert.equal(flank.state,'peek');assert.equal(flank.moving,true);
 for(const phase of ['aim','fire']){const ready={...a,attackPhase:phase};d.update(.1,[ready],'easy');const next=d.decide(ready,open,[ready]);assert.equal(next.moving,true);assert.deepEqual(next.goal,flank.goal);}
 const lost={...a,sees:false,known:[1,0,25] as [number,number,number]};d.update(.1,[lost],'easy');const searching=d.decide(lost,open,[lost]);assert.equal(searching.state,'search');assert.deepEqual(searching.goal,lost.known);
 const expired={...lost,known:null,memory:0};d.update(.1,[expired],'easy');assert.deepEqual(d.decide(expired,open,[expired]).goal,a.patrolTarget);
});

test('没有安全横移点时继续合法接近，技能和换弹仍禁止战斗换位',()=>{
 const d=new EscapeTactics(),a=agent({weapon:'mp5',attackPhase:'fire'});d.update(.2,[a],'easy');const chase=d.decide(a,{...open,safe:()=>false},[a]);assert.equal(chase.state,'chase');assert.equal(chase.moving,true);
 const busy={...a,busy:true};d.update(.2,[busy],'easy');assert.equal(d.decide(busy,open,[busy]).moving,false);
 const reload={...a,reloading:true};d.update(.2,[reload],'easy');const decision=d.decide(reload,{...open,project:()=>null},[reload]);assert.equal(decision.state,'reload');assert.equal(decision.moving,false);
});
