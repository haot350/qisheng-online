import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NpcSkill,NPC_SKILLS,TeamInvestigation,calloutPathInRegion} from '../src/npc-skills.ts';
import type {NPCRegion} from '../src/driving-ai.ts';
import type {Vec3} from '../src/types.ts';

test('sprint has a visible .6 second windup, 1.2 second action and ten second cooldown',()=>{
 const skill=new NpcSkill('sprint');assert.equal(skill.begin(),true);assert.equal(skill.busy,true);assert.equal(skill.begin(),false);
 assert.equal(skill.tick(.59),false);assert.equal(skill.phase,'windup');assert.equal(skill.tick(.01),true);assert.equal(skill.phase,'active');
 assert.equal(skill.tick(1.19),false);assert.equal(skill.phase,'active');assert.equal(skill.tick(.01),false);assert.equal(skill.phase,'cooldown');assert.equal(skill.busy,false);
 assert.equal(skill.left,10);assert.equal(skill.begin(),false);skill.tick(9.99);assert.equal(skill.phase,'cooldown');skill.tick(.01);assert.equal(skill.phase,'ready');assert.equal(skill.begin(),true);
 assert.equal(NPC_SKILLS.sprint.speed,5.4);assert.equal(NPC_SKILLS.grace,10);
});

test('callout emits once after 1.2 seconds and waits for command completion before cooldown',()=>{
 const skill=new NpcSkill('callout');skill.begin();assert.equal(skill.tick(1.19),false);assert.equal(skill.phase,'windup');assert.equal(skill.tick(.01),true);assert.equal(skill.phase,'active');
 assert.equal(skill.tick(5),false,'command dispatch cannot repeat while active');assert.equal(skill.phase,'active');skill.complete();assert.equal(skill.left,20);
 skill.tick(19.99);assert.equal(skill.begin(),false);skill.tick(.01);assert.equal(skill.phase,'ready');assert.equal(skill.begin(),true);
 assert.equal(NPC_SKILLS.callout.memory,5);assert.equal(NPC_SKILLS.callout.allyDistance,45);
});

test('interruption costs a full cooldown and recovery discards any partial skill state',()=>{
 for(const kind of ['sprint','callout'] as const){
  const skill=new NpcSkill(kind);skill.begin();skill.tick(.2);skill.interrupt();assert.equal(skill.phase,'cooldown');assert.equal(skill.left,NPC_SKILLS[kind].cooldown);
  skill.tick(2);const remaining=skill.left;skill.interrupt();assert.equal(skill.left,remaining,'unrelated later interruption does not restart an existing cooldown');
  skill.recover();assert.equal(skill.left,NPC_SKILLS[kind].cooldown);assert.equal(skill.busy,false);assert.equal(skill.begin(),false);
 }
 const skill=new NpcSkill('sprint');skill.begin();skill.tick(.6);skill.interrupt();assert.equal(skill.phase,'cooldown');assert.equal(skill.left,10);
});

test('simulation freeze cannot advance a windup, action, command memory or cooldown',()=>{
 const skill=new NpcSkill('sprint');skill.begin();skill.tick(.2);const before=skill.left;assert.equal(skill.tick(0),false);assert.equal(skill.left,before);
 skill.tick(.4);const active=skill.left;skill.tick(0);assert.equal(skill.left,active);skill.complete();skill.tick(0);assert.equal(skill.left,10);
 const investigation=new TeamInvestigation();investigation.receive([10,0,0]);investigation.tick(0,[0,0,0],false);assert.equal(investigation.left,5);assert.deepEqual(investigation.target,[10,0,0]);
});

test('team investigation owns a fixed copy of the last-seen position and expires after five seconds',()=>{
 const point:Vec3=[10,2,20],investigation=new TeamInvestigation();investigation.receive(point);point[0]=99;
 assert.deepEqual(investigation.target,[10,2,20]);investigation.tick(4.99,[0,2,0],false);assert.ok(investigation.target);assert.ok(investigation.left>0);investigation.tick(.01,[0,2,0],false);assert.equal(investigation.target,null);assert.equal(investigation.left,0);
});

test('personal visibility and arrival clear team orders rather than share a live target',()=>{
 const investigation=new TeamInvestigation();investigation.receive([10,0,0]);investigation.tick(.1,[0,0,0],true);assert.equal(investigation.target,null);assert.equal(investigation.left,0);
 investigation.receive([10,0,0]);investigation.tick(.1,[9.1,0,0],false);assert.equal(investigation.target,null);
 investigation.receive([10,0,0]);investigation.clear();assert.equal(investigation.target,null);assert.equal(investigation.left,0);
});

const region:NPCRegion={npcId:0,id:'test',label:'test',home:[0,0,0],spawnPoints:[[0,0,0]],patrolPoints:[[0,0,0],[0,0,10]]};
test('callout region checks the entire path, destination reachability and same-level support',()=>{
 const target:Vec3=[20,0,0];assert.equal(calloutPathInRegion(region,[[0,0,0],[44,0,0],[20,0,0]],target),true);
 assert.equal(calloutPathInRegion(region,[[0,0,0],[44.01,0,0],[20,0,0]],target),false,'a detour outside the leash is rejected even when the destination is legal');
 assert.equal(calloutPathInRegion(region,[[0,0,0],[18.49,0,0]],target),false,'a partial path cannot reach the requested point');
 assert.equal(calloutPathInRegion(region,[[0,0,0],[20,.8,0]],target),false,'a route on a different level is rejected');
 assert.equal(calloutPathInRegion(region,[[20,0,0]],target),false);assert.equal(calloutPathInRegion(region,[[0,0,0],[NaN,0,0],[20,0,0]],target),false);
});
