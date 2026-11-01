import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NPC_IDS,NPC_IDENTITY,NPC_COMBAT_POSES,npcPoseFilename,selectRoundRoster,selectEscapeRoster} from '../src/npc-roster.ts';
function seeded(seed:number){seed=Math.imul(seed,2654435761)>>>0;return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
test('nine stable identities keep their own firearms and abilities independently of slots',()=>{
 assert.deepEqual(NPC_IDS,['jiang','meng','xu','luan','xutao','chengguotao','wangwenrui','wangdi','wangyuhan']);
 assert.equal(NPC_IDENTITY.xu.name,'徐泗龙');assert.equal(NPC_IDENTITY.xutao.name,'徐涛');
 assert.equal(NPC_IDENTITY.xutao.weapon,'mp5');assert.equal(NPC_IDENTITY.xutao.skill,'sprint');
 assert.equal(NPC_IDENTITY.chengguotao.weapon,'glock');assert.equal(NPC_IDENTITY.chengguotao.skill,'callout');
 assert.deepEqual(NPC_IDENTITY.jiang.poses,['idle','attack',...NPC_COMBAT_POSES]);
 assert.deepEqual(NPC_IDENTITY.chengguotao.poses,['idle','attack','skill',...NPC_COMBAT_POSES]);
 for(const id of NPC_IDS)for(const pose of NPC_COMBAT_POSES)assert.ok(NPC_IDENTITY[id].poses.includes(pose as any),id+' '+pose);
});
test('driving fixed seeds cover all 126 four-of-nine rosters without duplicates',()=>{
 const combinations=new Set<string>();
 for(let seed=1;seed<=1500;seed++){
  const roster=selectRoundRoster(seeded(seed),'dafei');
  assert.equal(roster.length,4);assert.equal(new Set(roster).size,4);
  assert.ok(roster.every(id=>NPC_IDS.includes(id)));
  combinations.add([...roster].sort().join(','));
  assert.deepEqual(roster,selectRoundRoster(seeded(seed),'dafei'),'a failed load can retry the same saved roster');
 }
 assert.equal(combinations.size,126);
});

test('escape saves all nine identities with Meng fixed among the first six and seeded reserves',()=>{
 for(let seed=1;seed<=100;seed++){const all=selectEscapeRoster(seeded(seed));assert.equal(all.length,9);assert.equal(new Set(all).size,9);assert.equal(all[0],'meng');assert.deepEqual(all,selectRoundRoster(seeded(seed),'escape'));}
});
test('principal is assigned only a sports slot in driving, without changing the chosen set',()=>{
 let north=0,south=0;
 for(let seed=1;seed<=1500;seed++){
  const driving=selectRoundRoster(seeded(seed),'dafei');
  const slot=driving.indexOf('chengguotao');assert.ok(slot===-1||slot===0||slot===3);
  if(slot===0)north++;if(slot===3)south++;
 }
 assert.ok(north>0&&south>0);
});
test('roam has no enemies or random draw and boundary random values remain unique',()=>{
 let calls=0;assert.deepEqual(selectRoundRoster(()=>{calls++;return .5;},'roam'),[]);assert.equal(calls,0);
 for(const value of [0,1,.999999]){assert.equal(new Set(selectRoundRoster(()=>value,'escape')).size,9);assert.equal(new Set(selectRoundRoster(()=>value,'dafei')).size,4);}
});



test('new identities and Meng confiscation use v090 assets while original assets stay versioned',()=>{
 for(const id of NPC_IDS){
  const newIdentity=['wangwenrui','wangdi','wangyuhan'].includes(id);
  assert.equal(npcPoseFilename(id,'idle'),'/characters/billboards/'+(newIdentity?'v090/':'')+id+'.webp');
  assert.equal(npcPoseFilename(id,'attack'),'/characters/billboards/'+(newIdentity?'v090/':'v032/')+id+'-attack.webp');
  for(const pose of NPC_COMBAT_POSES){assert.equal(npcPoseFilename(id,pose,true),'/characters/billboards/'+(newIdentity?'v090/':'v032/')+'mobile/'+id+'-'+pose+'.webp');}
 }
 assert.equal(npcPoseFilename('meng','skill'),'/characters/billboards/v090/meng-skill.webp');
 assert.equal(npcPoseFilename('meng','skill',true),'/characters/billboards/v090/mobile/meng-skill.webp');
 assert.ok(NPC_IDENTITY.meng.poses.includes('skill'));
 assert.equal(npcPoseFilename('xutao','skill'),'/characters/billboards/xutao-skill.webp');
});

test('运行时不重复载入旧的普通步态，仅特技保留必要旧跑动',()=>{
 assert.equal(NPC_IDS.reduce((n,id)=>n+NPC_IDENTITY[id].poses.length,0),68);
 for(const id of NPC_IDS){assert.ok(!NPC_IDENTITY[id].poses.includes('walk-a'));assert.ok(!NPC_IDENTITY[id].poses.includes('walk-b'));}
 assert.ok(NPC_IDENTITY.xutao.poses.includes('run-a'));assert.ok(!NPC_IDENTITY.chengguotao.poses.includes('run-a'));
});
