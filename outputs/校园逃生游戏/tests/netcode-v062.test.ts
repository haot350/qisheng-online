import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&context.parentURL?.includes('/src/')){const url=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts'))return next(specifier+'.ts',context);}return next(specifier,context);}});
const {InputTimeline}=await import('../src/multiplayer/shared/input-timeline.ts');
const {OnlineClock,SnapshotBuffer,PresentationCorrection,predictedAim}=await import('../src/multiplayer/netcode.ts');
const {emptyInput}=await import('../src/multiplayer/shared/protocol.ts');
const {OnlineWeaponPresentation}=await import('../src/multiplayer/runtime-state.ts');
const {LocalPrediction}=await import('../src/multiplayer/shared/movement.ts');
const input=(seq:number,targetTick:number,actions:any[]=[])=>({...emptyInput(seq,targetTick),targetTick,clientTick:seq,moveY:1,actions:actions.map(a=>a.type),actionIds:actions});
test('future controls are never acknowledged early; old axes coalesce without losing one-shot actions',()=>{
 const q=new InputTimeline();q.reset(0,0,100);q.enqueue(input(1,101,[{id:1,type:'jump'}]),100);q.enqueue({...input(2,101,[{id:2,type:'reload'}]),moveX:1},100);q.enqueue(input(3,103),100);
 const first=q.consume(100);assert.equal(first.command.seq,0);assert.deepEqual(first.command.actions,[]);const next=q.consume(101);assert.equal(next.command.seq,2);assert.equal(next.command.moveX,1);assert.deepEqual(next.command.actions,['jump','reload']);assert.equal(next.actionAck,2);assert.equal(next.queueDepth,1);assert.equal(q.consume(102).command.seq,2);assert.equal(q.consume(103).command.seq,3);
});
test('repeated action IDs execute once while two same-kind actions retain distinct ticks',()=>{
 const q=new InputTimeline();q.reset(0,0,10);q.enqueue(input(1,11,[{id:1,type:'switch'},{id:2,type:'switch'}]),10);const a=q.consume(11);assert.deepEqual(a.command.actions,['switch']);assert.equal(a.actionAck,1);q.enqueue(input(2,12,[{id:1,type:'switch'},{id:2,type:'switch'}]),11);const b=q.consume(12);assert.deepEqual(b.command.actions,['switch']);assert.equal(b.actionAck,2);assert.deepEqual(q.consume(13).command.actions,[]);
});
test('neutral reset cancels a future held movement and stale input times out',()=>{
 const q=new InputTimeline();q.reset(0,0,20);q.enqueue(input(1,24,[{id:1,type:'jump'}]),20);q.enqueue({...emptyInput(2,21),targetTick:21,resetInput:true},20);const stop=q.consume(21);assert.equal(stop.command.moveY,0);assert.equal(stop.actionAck,1);assert.deepEqual(q.consume(24).command.actions,[]);assert.equal(q.consume(24).command.moveY,0);q.enqueue(input(3,26),25);assert.equal(q.consume(26).command.moveY,1);assert.equal(q.consume(44).command.moveY,0);
});
test('invalid future and sequence leaps request resync instead of granting faster simulation',()=>{
 const q=new InputTimeline();q.reset(10,0,100);assert.equal(q.enqueue(input(11,200),100),false);assert.equal(q.consume(101).resync,true);assert.equal(q.ack,10);assert.equal(q.enqueue(input(10000,102),101),false);assert.equal(q.depth,0);
});
test('server clock keeps adaptive rendering delay between 75 and 150 milliseconds',()=>{
 const clock=new OnlineClock();clock.observe(100,1000,80);const before=clock.serverTick(1050);clock.observe(103,1050,80);assert.ok(Math.abs(clock.serverTick(1050)-before)<1);for(let n=1;n<=30;n++)clock.observe(103+n*3,1050+n*50+(n%3===0?100:0),80);assert.ok(clock.interpolationMs>=75&&clock.interpolationMs<=150);assert.ok(clock.renderTick(3000)<clock.serverTick(3000));assert.ok(clock.predictionTick(3000)>clock.serverTick(3000));
});
test('high latency interpolation stays behind received snapshots and never reverses time',()=>{const clock=new OnlineClock();clock.observe(600,10000,350);assert.ok(clock.renderTick(10000)<600);const before=clock.renderTick(10010);clock.setRtt(500);assert.ok(clock.renderTick(10011)>=before);clock.reset(120,11000);assert.ok(clock.renderTick(11000)<120);});
test('remote interpolation samples server time and extrapolation stops after 100ms',()=>{
 const buffer=new SnapshotBuffer<any>();buffer.push(60,{position:[0,0,0],yaw:Math.PI-.1,generation:1,velocity:[6,0,0]});buffer.push(63,{position:[.3,0,0],yaw:-Math.PI+.1,generation:1,velocity:[6,0,0]});const between=buffer.sample(61.5)!;assert.ok(Math.abs(between.position[0]-.15)<1e-9);assert.ok(Math.abs(between.yaw-Math.PI)<.001);assert.ok(Math.abs(buffer.sample(120)!.position[0]-.9)<1e-9);buffer.push(66,{position:[20,0,0],yaw:0,generation:2,velocity:[0,0,0]});assert.equal(buffer.size,1);assert.equal(buffer.sample(61)!.position[0],20);buffer.clear();assert.equal(buffer.sample(100),null);
});
test('ordinary two-meter corrections smooth; generation resets and collision cuts remain explicit',()=>{
 const c=new PresentationCorrection();c.add([2,0,0],[0,0,0]);assert.equal(c.hardResets,0);assert.equal(c.offset[0],2);c.update(.1,()=>true);assert.ok(c.offset[0]>0&&c.offset[0]<2);c.update(.1,()=>false);assert.deepEqual(c.offset,[0,0,0]);c.add([1,0,0],[0,0,0],true);assert.equal(c.hardResets,1);assert.equal(predictedAim({life:'alive',sliding:false},true,true),true);assert.equal(predictedAim({life:'alive',sliding:true},true,true),false);
});
function gunState(weapon='m4a1',ammo=10){return{weapon,ammo,reserve:90,ack:0,generation:1,weaponAction:{phase:'ready',stage:'ready',progress:0,ready:true}} as any;}
test('reload animates immediately with shared Magazine timing and cannot grant ammunition',()=>{
 const state=gunState(),view=new OnlineWeaponPresentation(state);view.requestReload(1);assert.equal(view.action.phase,'reload');view.update(.2);assert.ok(view.action.progress>0);assert.equal(state.ammo,10);assert.equal(view.fire(2),false);view.reconcile({...state,ack:1,weaponAction:{phase:'reload',stage:'mag-out',progress:.05,ready:false}});assert.equal(view.action.phase,'reload');view.reconcile({...state,ack:2,ammo:30,weaponAction:{phase:'ready',stage:'ready',progress:0,ready:true}});assert.equal(view.action.phase,'ready');assert.equal(view.fire(3),true);assert.equal(view.displayAmmo,29);assert.equal(view.fire(4),false);assert.equal(view.displayAmmo,29);view.reconcile({...state,ack:3,ammo:29,weaponAction:{phase:'ready',stage:'ready',progress:0,ready:true}});assert.equal(view.displayAmmo,29);
});
test('server rejected reload and generation changes stop predicted reload without old sounds',()=>{
 const state=gunState(),view=new OnlineWeaponPresentation(state);view.requestReload(1);view.update(.3);view.reconcile({...state,ack:1});assert.equal(view.action.phase,'ready');view.requestReload(2);view.reconcile({...state,generation:2,ack:2});assert.equal(view.action.phase,'ready');assert.deepEqual(view.update(.5),[]);
});
test('self replay uses authoritative tick even when ack is unchanged and has a bounded work window',()=>{
 const actors=new Map(),fake={manifest:{lowestOpenElevation:-4},actors,addActor:(id:any)=>actors.set(id,{}),removeActor:(id:any)=>actors.delete(id),restore:()=>{},step:()=>{},safeRoute:()=>true,supportAt:()=>({height:0,clear:true}),move:(_id:any,p:any,d:any,crouch=false)=>({position:[p[0]+d[0],Math.max(0,p[1]+d[1]),p[2]+d[2]],grounded:true,crouched:crouch})};
 const prediction=new LocalPrediction(fake as any,'me',[0,0,0]);for(let n=1;n<=60;n++)prediction.predict(input(n,n));const state={...gunState(),position:[0,0,-1],velocity:[0,0,-3.4],grounded:true,crouched:false,stamina:100,sprinting:false,sliding:false,ack:0,appliedInputTick:55};prediction.reconcile(state as any,55);assert.equal(prediction.lastReplaySteps,5);const z=prediction.motion.position[2];prediction.reconcile({...state,position:[0,0,-1.1],appliedInputTick:56} as any,56);assert.equal(prediction.lastReplaySteps,4);assert.notEqual(prediction.motion.position[2],z);prediction.dispose();
});

test('pause cancellation acknowledges even the unsent half of a batch without executing it',()=>{const q=new InputTimeline();q.reset(0,0,10);q.enqueue({...emptyInput(2,10),resetInput:true,cancelActionThrough:1},10);assert.deepEqual(q.consume(11).command.actions,[]);assert.equal(q.consume(12).actionAck,1);q.enqueue(input(3,13,[{id:2,type:'reload'}]),12);const next=q.consume(13);assert.deepEqual(next.command.actions,['reload']);assert.equal(next.actionAck,2);q.enqueue({...emptyInput(4,13),resetInput:true,cancelActionThrough:9999},13);const invalid=q.consume(14);assert.equal(invalid.actionAck,2);assert.equal(invalid.resync,true);});
