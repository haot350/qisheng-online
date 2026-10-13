import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&context.parentURL?.includes('/src/')){const url=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts'))return next(specifier+'.ts',context);}return next(specifier,context);}});
const {RoomSimulation}=await import('../src/multiplayer/shared/simulation.ts');
const {LocalPrediction}=await import('../src/multiplayer/shared/movement.ts');
const {InputTimeline}=await import('../src/multiplayer/shared/input-timeline.ts');
const {LoadingInputBarrier,InputSendBudget}=await import('../src/multiplayer/loading-input.ts');
const {emptyInput}=await import('../src/multiplayer/shared/protocol.ts');
const {OnlineWeaponPresentation}=await import('../src/multiplayer/runtime-state.ts');

function world(){return{manifest:{spawn:[0,0,0],spawnYaw:1.2,lowestOpenElevation:-4,supplies:[]},actors:new Map(),visible:()=>true,visionVisible:()=>true,rayDistance:(_a:unknown,_b:unknown,max:number)=>max,supportAt:()=>({height:0,normalY:1,clear:true}),safeRoute:()=>true,nearest:(p:number[])=>[...p],path:(a:number[],b:number[])=>[[...a],[...b]],restore(){},setTeam(){},step(){},dispose(){},addActor(id:string){this.actors.set(id,{});},removeActor(id:string){this.actors.delete(id);},move(_id:string,p:number[],d:number[],crouched=false){return{position:[p[0]+d[0],0,p[2]+d[2]],grounded:true,crouched};}};}
const map={sourceVersion:'fixture',manifestHash:'m',collisionHash:'c',navigationHash:'n'};
function fixture(){const sim=new RoomSimulation('barrier',world() as any,map,{mode:'pvp',variant:'ffa',difficulty:'standard',maxPlayers:8,seed:42});const state=sim.addPlayer({id:'p',nickname:'Player',shortId:'T'});sim.loading('p',state.loadingEpoch,true,true);sim.phase='playing';sim.elapsed=20;return{sim,p:sim.players.get('p')!,prediction:new LocalPrediction(world() as any,'p',[0,0,0]),barrier:new LoadingInputBarrier()};}

test('twelve load cycles cancel future and unsent half batches, preserve action acknowledgement and resume fresh movement',()=>{
 const {sim,p,prediction,barrier}=fixture();let seq=0,action=0;
 for(let cycle=0;cycle<12;cycle++){
  const future={...emptyInput(++seq,sim.tick),targetTick:sim.tick+6,moveY:1,yaw:1.2,pitch:.3,actions:['switch' as const],actionIds:[{id:++action,type:'switch' as const}]};
  sim.input('p',[future]);prediction.predict(future);
  const unsent={...future,seq:++seq,targetTick:sim.tick+7,actions:['reload' as const],actionIds:[{id:++action,type:'reload' as const}]};prediction.predict(unsent);
  const stop={epoch:p.state.loadingEpoch,generation:p.state.generation,map,seq:++seq,cancelActionThrough:action,yaw:1.2,pitch:.3,ready:false,scopeReady:false};
  barrier.begin(stop);assert.equal(sim.applyLoading('p',stop),true);assert.equal(p.state.ack,seq);assert.equal(p.state.actionAck,action);assert.equal(p.timeline.depth,0);
  const position=[...p.state.position],weapon=p.state.weapon;for(let i=0;i<9;i++){sim.step();prediction.reconcile(p.state,sim.tick);assert.equal(prediction.lastReplaySteps,0);assert.deepEqual(prediction.motion.position,position);assert.equal(p.state.yaw,1.2);assert.equal(p.state.pitch,.3);assert.equal(p.state.appliedInputTick,sim.tick);}
  assert.equal(p.state.weapon,weapon);assert.equal(p.state.weaponAction.phase,'ready');assert.equal(sim.events.some(e=>e.type==='shot'),false);
  const resume={...stop,seq:++seq,ready:true,scopeReady:true};barrier.begin(resume);assert.equal(barrier.blocked,true);assert.equal(sim.applyLoading('p',resume),true);assert.equal(barrier.confirm(p.state),true);assert.equal(barrier.blocked,false);
  assert.equal(sim.applyLoading('p',stop),false);assert.equal(p.state.loading,false);
  const fresh={...emptyInput(++seq,sim.tick),targetTick:sim.tick+1,yaw:1.2,pitch:.3,moveY:1,actions:['switch' as const],actionIds:[{id:++action,type:'switch' as const}]};sim.input('p',[fresh]);sim.step();assert.equal(p.state.ack,seq);assert.equal(p.state.actionAck,action);assert.notEqual(p.state.weapon,weapon);assert.notDeepEqual(p.state.position,position);
 }
 assert.equal(action,36);assert.equal(p.state.actionAck,36);prediction.dispose();sim.dispose();
});

test('invalid generation, epoch, acknowledgement jump and orientation never partially cancel the timeline',()=>{
 const {sim,p}=fixture();sim.input('p',[{...emptyInput(1,sim.tick),targetTick:sim.tick+5,moveY:1}]);
 const base={epoch:p.state.loadingEpoch,generation:p.state.generation,map,seq:2,cancelActionThrough:0,yaw:.8,pitch:.2,ready:false};
 for(const invalid of [{...base,generation:0},{...base,generation:2},{...base,epoch:-1},{...base,epoch:1},{...base,seq:10000},{...base,cancelActionThrough:4096},{...base,yaw:NaN},{...base,pitch:2}]){
  assert.equal(sim.applyLoading('p',invalid),false);assert.equal(p.timeline.depth,1);assert.equal(p.state.ack,0);assert.equal(p.state.loading,false);
 }
 assert.equal(sim.applyLoading('p',base),true);assert.equal(sim.applyLoading('p',base),true);assert.equal(sim.applyLoading('p',{...base,ready:true}),false);assert.equal(p.state.loading,true);sim.dispose();
});

test('a rate-refused ready message remains blocked until a newer validated ready barrier',()=>{
 const {sim,p,barrier}=fixture(),ready={epoch:0,generation:1,map,seq:1,cancelActionThrough:0,yaw:1.2,pitch:.3,ready:true,scopeReady:true};
 barrier.begin(ready);assert.equal(sim.applyLoading('p',ready,false),true);assert.equal(p.state.ack,1);assert.equal(p.state.loading,true);assert.equal(barrier.confirm(p.state),false);assert.equal(barrier.blocked,true);
 // An identical transport replay cannot bypass the refusal; a new complete frame sends a new sequence.
 assert.equal(sim.applyLoading('p',ready),true);assert.equal(p.state.loading,true);
 const retry={...ready,seq:2};barrier.begin(retry);assert.equal(sim.applyLoading('p',retry),true);assert.equal(barrier.confirm(p.state),true);assert.equal(barrier.blocked,false);sim.dispose();
});

test('authority remains authoritative while ready acknowledgement is in transit',()=>{
 const {p,prediction,barrier}=fixture();prediction.predict({...emptyInput(1,0),targetTick:1,moveY:1});
 const command={epoch:0,generation:1,map,seq:2,cancelActionThrough:1,yaw:0,pitch:0,ready:true};barrier.begin(command);
 const early={...p.state,loading:false,ack:1,actionAck:0,appliedInputTick:0};assert.equal(barrier.confirm(early),false);prediction.reconcile(early,0,!barrier.blocked);assert.equal(prediction.lastReplaySteps,0);assert.deepEqual(prediction.motion.position,early.position);
 assert.equal(barrier.confirm({...early,ack:2,actionAck:1,generation:2}),false);assert.equal(barrier.confirm({...early,ack:2,actionAck:1,loadingEpoch:1}),false);assert.equal(barrier.confirm({...early,ack:2,actionAck:1}),true);assert.equal(barrier.confirm({...early,ack:2,actionAck:1}),false);prediction.dispose();
});

test('send backlog stops growing continuous input until low watermark and still requires authority rebase',()=>{
 const budget=new InputSendBudget(),barrier=new LoadingInputBarrier();assert.equal(budget.update(127*1024),false);assert.equal(budget.update(128*1024),true);
 for(const size of [256*1024,100*1024,33*1024])assert.equal(budget.update(size),true);
 const ready={epoch:0,generation:1,map,seq:90,cancelActionThrough:20,yaw:1,pitch:0,ready:true};barrier.begin(ready);
 assert.equal(budget.update(32*1024),false);assert.equal(barrier.blocked,true);assert.equal(barrier.confirm({generation:1,loadingEpoch:0,loading:false,ack:89,actionAck:20}),false);assert.equal(barrier.confirm({generation:1,loadingEpoch:0,loading:false,ack:90,actionAck:20}),true);
 assert.equal(budget.update(NaN),true);assert.equal(budget.update(0),false);
});

test('a saturated input quota can discard hundreds of obsolete steps without preventing the cancellation barrier',()=>{
 const {sim,p,barrier}=fixture();
 sim.input('p',[{...emptyInput(1,sim.tick),targetTick:sim.tick+6,moveY:1,fire:true,actions:['switch'],actionIds:[{id:1,type:'switch'}]}]);
 const origin=[...p.state.position],weapon=p.state.weapon;
 // Model a blocked WebSocket draining after the server accepted only its first
 // input quota. The later 500 inputs/200 actions were never applied by authority.
 sim.input('p',[{...emptyInput(500,sim.tick),targetTick:sim.tick+1,moveY:1}]);
 assert.equal(p.timeline.depth,1,'ordinary input still rejects the sequence jump');
 const stop={epoch:0,generation:1,map,seq:501,cancelActionThrough:200,yaw:1.1,pitch:.2,ready:false,scopeReady:false};
 barrier.begin(stop);assert.equal(sim.applyLoading('p',stop),true);assert.equal(p.timeline.depth,0);
 for(let i=0;i<8;i++)sim.step();assert.deepEqual(p.state.position,origin);assert.equal(p.state.weapon,weapon);assert.equal(sim.events.some(e=>e.type==='shot'),false);assert.equal(p.state.actionAck,200);
 const ready={...stop,seq:502,ready:true,scopeReady:true};barrier.begin(ready);assert.equal(sim.applyLoading('p',ready),true);assert.equal(barrier.confirm(p.state),true);
 sim.input('p',[{...emptyInput(503,sim.tick),targetTick:sim.tick+1,moveY:1,yaw:1.1,pitch:.2,actions:['switch'],actionIds:[{id:201,type:'switch'}]}]);sim.step();
 assert.equal(p.state.ack,503);assert.equal(p.state.actionAck,201);assert.notEqual(p.state.weapon,weapon);assert.notDeepEqual(p.state.position,origin);
 assert.equal(sim.applyLoading('p',{...ready,seq:503+3601}),false);assert.equal(sim.applyLoading('p',{...ready,seq:504,cancelActionThrough:201+1025}),false);sim.dispose();
});

test('stale controls stop without turning the player toward yaw zero',()=>{
 const q=new InputTimeline();q.enqueue({...emptyInput(1,0),targetTick:1,moveY:1,yaw:2.1,pitch:-.2},0);q.consume(1);const stale=q.consume(25);assert.equal(stale.command.moveY,0);assert.equal(stale.command.yaw,2.1);assert.equal(stale.command.pitch,-.2);
});

test('cancelled predicted reload and shot cannot leave phantom ammunition or mechanical sounds',()=>{
 const {p}=fixture(),state={...p.state,ammo:10},view=new OnlineWeaponPresentation(state);assert.equal(view.fire(1),true);assert.equal(view.displayAmmo,9);view.cancelPrediction();assert.equal(view.displayAmmo,10);
 view.requestReload(2);assert.equal(view.action.phase,'reload');view.update(.2);view.cancelPrediction();view.reconcile({...state,ack:3});assert.equal(view.action.phase,'ready');assert.deepEqual(view.update(2),[]);
});
