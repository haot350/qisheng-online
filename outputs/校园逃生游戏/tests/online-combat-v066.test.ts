import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&context.parentURL?.includes('/src/')){const url=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts'))return next(specifier+'.ts',context);}return next(specifier,context);}});
const {RoomSimulation}=await import('../src/multiplayer/shared/simulation.ts');
const {EscapeAttack}=await import('../src/multiplayer/shared/fire.ts');
const {NpcMovingAccuracy,npcAimDirection,npcPelletDirection}=await import('../src/npc-combat-motion.ts');
const {Magazine,WEAPONS,seeded}=await import('../src/rules.ts');
const {collectSameWeapon,canCollectSameWeapon}=await import('../src/weapon-pickups.ts');
const {nearbyEscapeInteraction}=await import('../src/escape/nearby.ts');
const {COOP_RULE_VERSION,RULE_VERSION,emptyInput}=await import('../src/multiplayer/shared/protocol.ts');
const {OnlineWeaponPresentation}=await import('../src/multiplayer/runtime-state.ts');
function fixture(mode:'coop'|'pvp'='pvp',count=2){
 const world:any={manifest:{spawn:[0,0,0],spawnYaw:0,supplies:[]},actors:new Map(),visible:()=>true,visionVisible:()=>true,rayDistance:(_a:any,_b:any,max:number)=>max,supportAt:()=>({height:0,normalY:1,clear:true}),safeRoute:()=>true,nearest:(p:number[])=>[...p],path:(a:number[],b:number[])=>[[...a],[...b]],actorPath:(_id:string,a:number[],b:number[])=>[[...a],[...b]],restore(){},setTeam(){},step(){},dispose(){},addActor(id:string){this.actors.set(id,{});},removeActor(id:string){this.actors.delete(id);},move(_id:string,p:number[],d:number[],crouched=false){return{position:[p[0]+d[0],0,p[2]+d[2]],grounded:true,crouched};}};
 const sim=new RoomSimulation('combat-fixture',world,{sourceVersion:'fixture',manifestHash:'m',collisionHash:'c',navigationHash:'n'},{mode,variant:'ffa',difficulty:'standard',maxPlayers:8,seed:42});
 (sim as any).findSpawn=()=>[0,0,0];for(let i=0;i<count;i++){const s=sim.addPlayer({id:'p'+i,nickname:'Player '+i,shortId:'T'+i});s.loading=false;world.addActor(s.id);}
 sim.phase='playing';sim.elapsed=20;
 if(mode==='coop')sim.tasks={tasks:[],update:()=>[],candidates:()=>[],plan:{tasks:[]}} as any;
 return sim;
}
function tick(sim:InstanceType<typeof RoomSimulation>,seconds:number){for(let i=0;i<Math.round(seconds*60);i++)sim.step(1/60);}
function npc(slot:number,ammo=30,reserve=0){const gun=new Magazine('m4a1',reserve);gun.ammo=ammo;return{state:{id:'npc-'+slot,identity:'xutao',generation:1,position:[0,0,0],yaw:0,pose:'attack',aim:true,firing:false,reloading:false,weapon:'m4a1',active:true,health:100,targetId:'p0'},slot,gun,attack:new EscapeAttack(),lastKnown:[0,0,-20],memory:7,sense:1,path:[],repath:1,goal:[slot,0,0],sees:true,reaction:0,pitch:0,actualSpeed:0,vertical:0,grounded:true,gait:0,bob:0,respawnAt:Infinity,stuck:0,shotSerial:0,movingAccuracy:new NpcMovingAccuracy()};}
for(const variant of ['tdm','ffa'] as const)test(variant+' recovers after six damage-free seconds and stops at sixty health',()=>{
 const sim=fixture();sim.options.variant=variant;const p=sim.players.get('p0')!;(sim as any).damage('p0',80,'npc-source');tick(sim,6);assert.ok(Math.abs(p.state.health-20)<1e-6);tick(sim,2);assert.ok(Math.abs(p.state.health-36)<1e-6);tick(sim,6);assert.equal(p.state.health,60);
 (sim as any).damage('p0',10,'npc-source');tick(sim,5);assert.equal(p.state.health,50);tick(sim,2);assert.ok(Math.abs(p.state.health-58)<1e-6);
});
test('paused and dead players do not recover, and pause time does not consume recovery delay',()=>{
 const sim=fixture(),p=sim.players.get('p0')!;(sim as any).damage('p0',80,'npc-source');sim.phase='paused';sim.pauseLeft=60;sim.step(10);assert.equal(p.state.health,20);sim.phase='playing';tick(sim,6);assert.ok(Math.abs(p.state.health-20)<1e-6);(sim as any).damage('p0',100,'npc-source');assert.equal(p.state.life,'respawning');tick(sim,1);assert.equal(p.state.health,0);
});
test('stationary cooperative rescue completes once at forty health',()=>{
 const sim=fixture('coop'),p=sim.players.get('p0')!,down=sim.players.get('p1')!;down.state.life='downed';down.state.health=0;down.state.position=[.5,0,0];p.input.interact=true;for(let i=0;i<10;i++)(sim as any).revive(.5);assert.equal(down.state.life,'alive');assert.equal(down.state.health,40);(sim as any).revive(1);assert.equal(sim.events.filter(e=>e.type==='revive').length,1);
});
for(const interrupt of ['movement','fire','visibility','damage'] as const)test('rescue '+interrupt+' resets accumulated progress instead of continuing',()=>{
 const sim=fixture('coop'),p=sim.players.get('p0')!,down=sim.players.get('p1')!;down.state.life='downed';down.state.position=[.5,0,0];p.input.interact=true;(sim as any).revive(2);assert.equal(down.revive,2);
 if(interrupt==='movement')p.motion.actualSpeed=.2;if(interrupt==='fire')p.input.fire=true;if(interrupt==='visibility')(sim.world as any).visible=()=>false;if(interrupt==='damage')p.lastDamage=sim.elapsed;
 (sim as any).revive(.5);assert.equal(down.revive,0);assert.equal(down.state.life,'downed');p.motion.actualSpeed=0;p.input.fire=false;(sim.world as any).visible=()=>true;p.lastDamage=-Infinity;(sim as any).revive(.5);assert.equal(down.revive,.5);
});
test('a blocked movement intent is not a movement interruption, but holding fire is',()=>{
 const sim=fixture('coop'),p=sim.players.get('p0')!,down=sim.players.get('p1')!;down.state.life='downed';down.state.position=[.5,0,0];p.input={...emptyInput(),moveY:1,interact:true};p.motion.actualSpeed=0;(sim as any).revive(.5);assert.equal(down.revive,.5);p.input.fire=true;(sim as any).revive(.5);assert.equal(down.revive,0);
});
test('an exhausted NPC releases its attack seat and lets armed agents proceed',()=>{
 const sim=fixture('coop',1),p=sim.players.get('p0')!;p.state.position=[0,0,-20];p.state.health=100000;const empty=npc(0),armed=[npc(1),npc(2),npc(3)];sim.npcs.push(empty as any,...armed as any);(sim as any).npcCombat(.5);assert.equal((sim as any).fire.owns(0),true);empty.gun.ammo=0;empty.gun.reserve=0;(sim as any).npcCombat(1/60);assert.equal((sim as any).fire.owns(0),false);assert.equal(empty.attack.phase,'search');assert.equal((sim as any).fire.owns(3),true);assert.equal(empty.shotSerial,0);assert.ok(sim.diagnostics().fire<=3);
});
test('same-weapon authoritative pickup fills magazine first and retains excess ammunition',()=>{
 const sim=fixture(),p=sim.players.get('p0')!,gun=p.guns.get('m4a1')!;gun.ammo=20;gun.reserve=175;sim.drops.push({id:'ammo',weapon:'m4a1',ammo:30,reserve:60,position:[.5,0,0],left:45});(sim as any).interact(p);assert.equal(gun.ammo,30);assert.equal(gun.reserve,180);assert.equal(sim.drops.length,1);assert.equal(sim.drops[0].ammo+sim.drops[0].reserve,75);(sim as any).interact(p);assert.equal(sim.events.filter(e=>e.type==='pickup').length,1);assert.equal(sim.drops[0].ammo+sim.drops[0].reserve,75);
});
test('a full reserve does not block a ready partial magazine in either nearby adapter',()=>{
 const sim=fixture(),p=sim.players.get('p0')!,gun=p.guns.get('m4a1')!;gun.ammo=20;gun.reserve=180;const drop={id:'ammo',weapon:'m4a1' as const,ammo:5,reserve:0,position:[.5,0,0] as [number,number,number],left:45};sim.drops.push({...drop});assert.equal((sim as any).nearbyInteraction(p).available,true);
 const candidate=nearbyEscapeInteraction({position:[0,0,0],tasks:[],drops:[drop],supplies:[],guns:[{id:gun.id,ammo:gun.ammo,ready:gun.action.ready,reserve:gun.reserve,maxReserve:180}],health:100,smokes:2,canReach:()=>true,taskRange:2.4,extractionRange:6});assert.equal(candidate!.available,true);(sim as any).interact(p);assert.equal(gun.ammo,25);assert.equal(gun.reserve,180);assert.equal(sim.drops.length,0);
});
test('cancelled or active reload cannot receive direct magazine ammunition twice',()=>{
 const sim=fixture(),p=sim.players.get('p0')!,gun=p.guns.get('m4a1')!;gun.ammo=5;gun.reload();gun.cancelReload();gun.reserve=180;const drop={id:'ammo',weapon:'m4a1' as const,ammo:10,reserve:0,position:[.5,0,0] as [number,number,number],left:45};sim.drops.push(drop);assert.equal(canCollectSameWeapon(gun,drop),false);(sim as any).interact(p);assert.equal(gun.ammo,5);assert.equal(drop.ammo,10);assert.equal(sim.events.length,0);
});
test('single-player and authoritative transfers conserve the same rounds including partial leftovers',()=>{
 for(const id of ['glock','m4a1','r870'] as const){const local=new Magazine(id),sim=fixture(),p=sim.players.get('p0')!,gun=new Magazine(id);local.ammo=gun.ammo=1;local.reserve=gun.reserve=WEAPONS[id].reserve*2-2;if(id==='glock')p.guns.set(id,gun);else{p.primary=id;p.guns.set(id,gun);p.state.weapon=id;}const source=new Magazine(id);source.ammo=7;source.reserve=20;const drop={id:'ammo',weapon:id,ammo:7,reserve:20,position:[.5,0,0] as [number,number,number],left:45};sim.drops.push(drop);const total=gun.ammo+gun.reserve+27;collectSameWeapon(local,source);(sim as any).interact(p);assert.equal(gun.ammo,local.ammo);assert.equal(gun.reserve,local.reserve);assert.equal((sim.drops[0]?.ammo??0)+(sim.drops[0]?.reserve??0),source.ammo+source.reserve);assert.equal(gun.ammo+gun.reserve+source.ammo+source.reserve,total);}
});
test('shared NPC aim and pellet directions match the previous single-player formula and draw order',()=>{
 const norm=(p:number[])=>{const n=Math.hypot(...p);return p.map(v=>v/n);};for(const crouched of [false,true])for(const sprinting of [false,true])for(const speed of [0,2.1,3.2]){const smooth=new NpcMovingAccuracy();for(let i=0;i<60;i++)smooth.update(1/60,speed);const mult=smooth.read(),random=seeded(123),reference=seeded(123),direction:[number,number,number]=[0,0,-1],error=((crouched?.055:.043)+(sprinting?.025:0))*mult;const expectedBase=norm(direction.map(v=>v+(reference()-.5)*error*2)),actualBase=npcAimDirection(direction,mult,{crouched,sprinting},random);for(let i=0;i<3;i++)assert.ok(Math.abs(actualBase[i]-expectedBase[i])<1e-12);for(let pellet=0;pellet<8;pellet++){const expected=norm(expectedBase.map(v=>v+(reference()-.5)*.052*2*mult)),actual=npcPelletDirection(actualBase,.052,mult,random);for(let i=0;i<3;i++)assert.ok(Math.abs(actual[i]-expected[i])<1e-12);}assert.equal(random(),reference());}
});
test('cooperative behavior has a separate rule identity and the current protocol explicitly advances',()=>{assert.equal(COOP_RULE_VERSION,'coop-2026-0.7.0');assert.equal(RULE_VERSION,'campus-mp-0.7.0');});

test('authoritative NPC shot uses the shared standing aim error and smoothed movement multiplier',()=>{
 const sim=fixture('coop',1),p=sim.players.get('p0')!;p.state.position=[0,0,-20];p.state.crouched=true;p.state.sprinting=true;p.state.health=100000;const actor=npc(0);actor.movingAccuracy.update(1/60,3.2);sim.npcs.push(actor as any);(sim as any).npcCombat(2);const shot=sim.events.find(e=>e.type==='shot')!;assert.ok(shot);const random=seeded(42),base=npcAimDirection([0,0,-1],actor.movingAccuracy.read(),{crouched:true,sprinting:true},random),expected=npcPelletDirection(base,WEAPONS.m4a1.spread,actor.movingAccuracy.read(),random);const end=(shot.data!.ends as number[][])[0],muzzle=shot.position!,delta=end.map((v,i)=>v-muzzle[i]),length=Math.hypot(...delta);for(let i=0;i<3;i++)assert.ok(Math.abs(delta[i]/length-expected[i])<1e-12);assert.deepEqual(shot.data!.direction,base);
});

function emptyWeapon(weapon:keyof typeof WEAPONS,reserve=WEAPONS[weapon].reserve){
 const sim=fixture('pvp',1),p=sim.players.get('p0')!,gun=new Magazine(weapon,reserve);
 gun.ammo=0;p.guns.set(weapon,gun);p.state.weapon=weapon;if(weapon!=='glock')p.primary=weapon;
 (sim as any).syncGun(p);
 return{sim,p,gun,view:new OnlineWeaponPresentation(structuredClone(p.state))};
}
for(const weapon of Object.keys(WEAPONS) as (keyof typeof WEAPONS)[])test(weapon+' empty trigger starts one authoritative and predicted reload without a shot or extra reload action',()=>{
 const{sim,p,gun,view}=emptyWeapon(weapon),reserve=gun.reserve,command={...emptyInput(1,sim.tick),fire:true};
 assert.equal(view.fire(command.seq),false);assert.equal(view.action.phase,'reload');assert.equal(view.displayAmmo,0);
 sim.input('p0',[command,command]);sim.step();assert.equal(p.state.ack,1);assert.equal(gun.action.phase,'reload');
 view.reconcile(structuredClone(p.state));assert.equal(view.action.phase,'reload');
 gun.update(.1);view.update(.1);const progress=gun.action.progress,predictedProgress=view.action.progress;
 (sim as any).playerShot(p);assert.equal(view.fire(2),false);
 assert.equal(gun.action.progress,progress);assert.equal(view.action.progress,predictedProgress);
 sim.input('p0',[{...emptyInput(2,sim.tick),fire:false}]);sim.step();tick(sim,6);
 assert.equal(gun.action.phase,'ready');assert.equal(gun.ammo,Math.min(WEAPONS[weapon].capacity,reserve));
 assert.equal(gun.ammo+gun.reserve,reserve);assert.equal(sim.events.filter(e=>e.type==='shot').length,0);
 view.reconcile(structuredClone(p.state));assert.equal(view.action.phase,'ready');assert.equal(view.displayAmmo,gun.ammo);
 // A retransmitted fire input cannot start a new shot after the reload completes.
 sim.input('p0',[command]);sim.step();assert.equal(sim.events.filter(e=>e.type==='shot').length,0);
});
for(const weapon of Object.keys(WEAPONS) as (keyof typeof WEAPONS)[])test(weapon+' empty trigger with no reserve does not start an action',()=>{
 const{sim,p,gun,view}=emptyWeapon(weapon,0);(sim as any).playerShot(p);assert.equal(view.fire(1),false);
 assert.equal(gun.action.phase,'ready');assert.equal(view.action.phase,'ready');assert.equal(gun.ammo+gun.reserve,0);
});
for(const weapon of ['awm','r870'] as const)test(weapon+' empty trigger cannot bypass a real or predicted cycle',()=>{
 const{sim,p,gun}=emptyWeapon(weapon);gun.ammo=1;(sim as any).syncGun(p);
 const view=new OnlineWeaponPresentation(structuredClone(p.state));assert.equal(gun.fire(),true);assert.equal(view.fire(1),true);
 (sim as any).playerShot(p);assert.equal(view.fire(2),false);assert.equal(gun.action.phase,'cycle');assert.equal(view.action.phase,'cycle');
 gun.update(WEAPONS[weapon].interval+.01);view.update(WEAPONS[weapon].interval+.01);
 (sim as any).playerShot(p);assert.equal(view.fire(3),false);assert.equal(gun.action.phase,'reload');assert.equal(view.action.phase,'reload');
});
test('predicted automatic reload uses unacknowledged shots without inventing ammunition',()=>{
 const{p}=emptyWeapon('m4a1');p.state.ammo=30;const view=new OnlineWeaponPresentation(structuredClone(p.state));
 for(let seq=1;seq<=30;seq++){assert.equal(view.fire(seq),true);view.update(.11);}
 assert.equal(view.displayAmmo,0);assert.equal(view.fire(31),false);assert.equal(view.action.phase,'reload');
 assert.equal(p.state.ammo,30);assert.equal(p.state.reserve,90);
 view.update(3);assert.equal(view.displayAmmo,0);assert.equal(view.action.ready,false);
 view.reconcile({...p.state,ack:31,ammo:30,reserve:60});assert.equal(view.action.phase,'ready');assert.equal(view.displayAmmo,30);
});
test('automatic reload freezes in a full-room pause and resumes from the same stage',()=>{
 const{sim,p,gun}=emptyWeapon('m4a1');(sim as any).playerShot(p);tick(sim,.3);const before=gun.action;
 sim.phase='paused';sim.pauseLeft=60;tick(sim,1);assert.deepEqual(gun.action,before);
 sim.phase='playing';tick(sim,3);assert.equal(gun.ammo,30);assert.equal(gun.reserve,60);
});
test('R870 automatic reload preserves a committed shell when interrupted and switched away',()=>{
 const{sim,p,gun,view}=emptyWeapon('r870');(sim as any).playerShot(p);view.fire(1);gun.update(.86);view.update(.86);
 assert.equal(gun.ammo,1);assert.equal(gun.reserve,17);assert.equal(gun.action.stage,'pump');
 (sim as any).syncGun(p);view.reconcile({...structuredClone(p.state),ack:1});
 sim.input('p0',[{...emptyInput(2,sim.tick),actions:['switch']}]);sim.step();assert.equal(p.state.weapon,'glock');
 view.reconcile(structuredClone(p.state));assert.equal(view.action.phase,'ready');assert.deepEqual(view.update(1),[]);
 assert.equal(gun.ammo,1);assert.equal(gun.action.active,false);
 sim.input('p0',[{...emptyInput(3,sim.tick),actions:['switch']}]);sim.step();assert.equal(p.state.weapon,'r870');
 // Switching back resumes remaining work; already committed ammunition is not awarded twice.
 tick(sim,4);assert.equal(gun.ammo,6);assert.equal(gun.reserve,12);
});
test('an empty weapon reloads beside a wall without shooting through it',()=>{
 const{sim,p,gun,view}=emptyWeapon('m4a1');sim.world.rayDistance=()=>.01;
 assert.equal(view.fire(1),false);(sim as any).playerShot(p);
 assert.equal(gun.action.phase,'reload');assert.equal(view.action.phase,'reload');
 assert.equal(sim.events.filter(e=>e.type==='shot').length,0);
});
for(const weapon of ['m4a1','m249'] as const)test(weapon+' committed reload ammunition survives holstering and resumes its chamber work once',()=>{
 const{sim,p,gun}=emptyWeapon(weapon);(sim as any).playerShot(p);
 gun.update(WEAPONS[weapon].reloadEmpty*.72);assert.equal(gun.ammo,WEAPONS[weapon].capacity);
 const reserve=gun.reserve,insertSerial=gun.insertSerial;
 sim.input('p0',[{...emptyInput(1,sim.tick),actions:['switch']}]);sim.step();assert.equal(p.state.weapon,'glock');
 tick(sim,1);assert.equal(gun.action.active,false);assert.equal(gun.reserve,reserve);
 sim.input('p0',[{...emptyInput(2,sim.tick),actions:['switch']}]);sim.step();assert.equal(p.state.weapon,weapon);
 assert.equal(gun.action.active,true);assert.equal(gun.ammo,WEAPONS[weapon].capacity);
 tick(sim,3);assert.equal(gun.action.phase,'ready');assert.equal(gun.reserve,reserve);assert.equal(gun.insertSerial,insertSerial);
});

test('loading blockage clears queued and held server input immediately while the playing actor stays vulnerable',()=>{
 const sim=fixture(),p=sim.players.get('p0')!;p.input={...emptyInput(),seq:7,moveY:1,fire:true,aim:true,interact:true,actions:['reload']};p.queue.push({...p.input,seq:8});p.motion.velocity=[1,0,3];p.state.health=100;
 sim.loading('p0',p.state.loadingEpoch,false,false);assert.equal(p.state.loading,true);assert.equal(p.input.moveY,0);assert.equal(p.input.fire,false);assert.equal(p.input.aim,false);assert.equal(!!p.input.interact,false);assert.deepEqual(p.input.actions,[]);assert.equal(p.queue.length,0);assert.deepEqual(p.motion.velocity,[0,0,0]);assert.ok(sim.world.actors.has('p0'));
 const shooter=sim.players.get('p1')!;shooter.state.position=[0,0,10];shooter.state.yaw=0;shooter.state.pitch=0;(sim as any).captureHistory();(sim as any).playerShot(shooter);assert.ok(p.state.health<100&&p.state.health>0);assert.ok(sim.events.some(e=>e.type==='hit'&&e.targetId==='p0'));assert.equal(p.state.life,'alive');
 sim.loading('p0',p.state.loadingEpoch,true,true);assert.equal(p.state.loading,false);assert.equal(p.input.fire,false);
});
