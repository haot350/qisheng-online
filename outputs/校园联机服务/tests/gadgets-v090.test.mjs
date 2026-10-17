import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,mapIdentity,manifest} from '../dist/modules/校园联机服务/src/assets.js';
import {RoomSimulation} from '../dist/modules/校园逃生游戏/src/multiplayer/shared/simulation.js';
import {RecipientReplicator} from '../dist/modules/校园逃生游戏/src/multiplayer/shared/wire.js';
import {emptyInput} from '@qisheng/shared/protocol';
const cp=p=>[...p];
async function setup(mode='coop'){
 const sim=new RoomSimulation('items-090',await createWorld(),mapIdentity,{mode,variant:'tdm',difficulty:'standard',seed:90005});
 for(let i=0;i<2;i++){const id='p'+i;sim.addPlayer({id,nickname:id,shortId:id});sim.loading(id,0,true,true);sim.ready(id,true);}
 assert.equal(sim.start('p0'),true);for(const p of sim.players.values())sim.loading(p.state.id,p.state.loadingEpoch,true,true);
 for(let i=0;i<181;i++)sim.step();return sim;
}
function place(sim,id,point){const p=sim.players.get(id);p.state.position=cp(point);p.motion.position=cp(point);p.motion.lastSafe=cp(point);p.state.protectionLeft=0;sim.world.restore(id,point);return p;}
test('cooperative identity pool has nine distinct teachers, Meng and five others start; second task adds three',async()=>{
 const sim=await setup();try{
  assert.equal(sim.npcs.length,9);assert.equal(new Set(sim.npcs.map(n=>n.state.identity)).size,9);assert.equal(sim.npcs.filter(n=>n.state.active).length,6);assert.equal(sim.npcs[0].state.identity,'meng');
  assert.ok(sim.gadgets.length>=3);for(const kind of ['helmet','grenade','cards'])assert.ok(sim.gadgets.some(g=>g.kind===kind));
  for(const [i,n]of sim.npcs.entries())for(const other of sim.npcs.slice(i+1))assert.ok(Math.hypot(...n.state.position.map((v,k)=>v-other.state.position[k]))>=2);
  sim.tasks.tasks[0].status='complete';sim.tasks.tasks[1].status='complete';sim.taskCompleted(sim.tasks.tasks[1].id);
  assert.equal(sim.npcs.filter(n=>n.state.active).length,9);assert.equal(sim.world.actors.size,11);sim.taskCompleted(sim.tasks.tasks[1].id);assert.equal(sim.npcs.filter(n=>n.state.active).length,9);
 }finally{sim.dispose();}
});
test('cooperative loot is per player and an inventory cap never consumes another pickup',async()=>{
 const sim=await setup();try{const p0=place(sim,'p0',manifest.spawn),p1=place(sim,'p1',manifest.spawn);sim.gadgets.splice(0,sim.gadgets.length,{id:'isolated-grenade',kind:'grenade',position:cp(manifest.spawn),usedBy:[],availableAt:0});sim.supplies.splice(0);sim.tasks.candidates=()=>[];
  sim.interact(p0);sim.interact(p0);sim.interact(p1);assert.equal(p0.gadgets.grenades,1);assert.equal(p1.gadgets.grenades,1);assert.deepEqual(sim.gadgets[0].usedBy,['p0','p1']);
  sim.gadgets.push({id:'cap-grenade',kind:'grenade',position:cp(manifest.spawn),usedBy:[],availableAt:0});p0.gadgets.grenades=2;sim.interact(p0);assert.deepEqual(sim.gadgets[1].usedBy,[]);
 }finally{sim.dispose();}
});
test('PvP loot is globally reserved for sixty seconds and excludes playing cards',async()=>{
 const sim=await setup('pvp');try{assert.ok(sim.gadgets.every(g=>g.kind!=='cards'));const p=place(sim,'p0',manifest.spawn);sim.gadgets.splice(0,sim.gadgets.length,{id:'helmet-pvp',kind:'helmet',position:cp(manifest.spawn),usedBy:[],availableAt:0});sim.supplies.splice(0);
  sim.interact(p);assert.equal(p.gadgets.helmetDurability,50);assert.equal(sim.gadgets[0].availableAt,sim.elapsed+60);p.gadgets.helmetDurability=0;sim.interact(p);assert.equal(p.gadgets.helmetDurability,0);
  sim.elapsed+=60;sim.interact(p);assert.equal(p.gadgets.helmetDurability,50);
 }finally{sim.dispose();}
});
test('authoritative helmet protects heads only, explosions bypass it and friendly fire still stays disabled',async()=>{
 const sim=await setup('pvp');try{const a=sim.players.get('p0'),b=sim.players.get('p1');a.state.protectionLeft=b.state.protectionLeft=0;b.gadgets.helmetDurability=50;
  sim.damage('p1',100,'p0',true);assert.equal(b.state.health,40);assert.equal(b.gadgets.helmetDurability,10);
  b.state.health=100;sim.damage('p1',20,'p0',false);assert.equal(b.state.health,80);assert.equal(b.gadgets.helmetDurability,10);
  b.state.health=100;sim.damage('p1',80,'p0',false,'explosion');assert.equal(b.state.health,20);assert.equal(b.gadgets.helmetDurability,10);
  b.state.team=a.state.team;b.state.health=100;sim.damage('p1',80,'p0',false,'explosion');assert.equal(b.state.health,100);sim.damage('p0',40,'p0',false,'explosion');assert.equal(a.state.health,60);assert.equal(a.state.kills,0);
 }finally{sim.dispose();}
});
test('grenade use is acknowledged once, three second fuse and solid cover prevent damage',async()=>{
 const sim=await setup();try{const p=sim.players.get('p0');p.gadgets.grenades=2;p.gadgets.selectedGadget='grenade';const command={...emptyInput(1,sim.tick),targetTick:sim.tick+1,actionIds:[{id:1,type:'use-gadget'}],actions:['use-gadget']};sim.input('p0',[command]);sim.step();sim.input('p0',[{...command,seq:2,targetTick:sim.tick+1}]);sim.step();assert.equal(p.gadgets.grenades,1);assert.equal(sim.projectiles.length,1);
  const grenade=sim.projectiles[0];grenade.position=[...p.state.position];grenade.position[1]+=.5;grenade.velocity=[0,0,0];const original=sim.world.visible;sim.world.visible=()=>false;for(let i=0;i<175;i++)sim.step();assert.equal(sim.events.some(e=>e.type==='explosion'),false);for(let i=0;i<8;i++)sim.step();assert.equal(sim.projectiles.length,0);assert.equal(p.state.health,100);assert.equal(sim.events.filter(e=>e.type==='explosion').length,1);sim.world.visible=original;
 }finally{sim.dispose();}
});
test('cards use does not refill stamina; confiscation interrupts and cannot affect a new generation',async()=>{
 const sim=await setup();try{const p=sim.players.get('p0'),meng=sim.npcs[0];p.gadgets.cards=1;p.gadgets.selectedGadget='cards';p.motion.movement.stamina=36;p.motion.stamina=36;sim.useGadget(p);assert.equal(p.motion.movement.stamina,36);assert.equal(p.gadgets.cards,0);assert.equal(p.gadgets.cardsUntil,sim.elapsed+30);const clue=cp(sim.cardPursuits.get('p0').clue);p.state.position[0]+=20;assert.deepEqual(sim.cardPursuits.get('p0').clue,clue);
  const target=cp(manifest.spawn);place(sim,'p0',target);meng.state.position=[target[0]+1,target[1],target[2]];sim.world.restore(meng.state.id,meng.state.position);const visible=sim.world.visible,path=sim.world.actorPath;sim.world.visible=()=>true;sim.world.actorPath=(_id,a,b)=>[cp(a),cp(b)];sim.updateCards(.8);assert.ok(sim.cardPursuits.get('p0').windup>.7);sim.damage(meng.state.id,1,'p1');sim.updateCards(.5);assert.equal(p.state.health,100);sim.updateCards(.6);sim.updateCards(.4);assert.equal(p.state.health,50);assert.equal(p.gadgets.cardsUntil,0);sim.updateCards(1);assert.equal(p.state.health,50);
  p.gadgets.cards=1;sim.useGadget(p);p.state.generation++;sim.updateCards(2);assert.equal(p.state.health,50);assert.equal(sim.cardPursuits.has('p0'),false);sim.world.visible=visible;sim.world.actorPath=path;
 }finally{sim.dispose();}
});
test('hidden grenade events, trajectories and other inventories cannot reveal an enemy position',async()=>{
 const sim=await setup('pvp');try{const a=place(sim,'p0',[0,0,0]),b=place(sim,'p1',[1,0,-8]);b.gadgets.cards=1;b.gadgets.grenades=2;sim.projectiles.push({id:'secret',ownerId:'p1',position:[1,1,-8],velocity:[0,0,0],left:2});sim.emit('gadget','p1',undefined,[1,1,-8],{gadget:'grenade',action:'throw'});sim.emit('explosion','p1',undefined,[1,1,-8],{radius:5});const world={visible:()=>false,visionVisible:()=>false,rayDistance:()=>0},replica=new RecipientReplicator(a.state.id),projected=replica.project(sim.snapshot(),world);assert.equal(projected.room.projectiles.length,0);assert.equal(projected.players.some(p=>p.id==='p1'),false);assert.equal(JSON.stringify(projected.roster).includes('grenades'),false);assert.ok(projected.events.every(e=>!e.position));assert.ok(projected.events.every(e=>e.type!=='gadget'));
 }finally{sim.dispose();}
});
