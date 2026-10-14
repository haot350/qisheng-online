import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&context.parentURL?.includes('/src/')){const url=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts'))return next(specifier+'.ts',context);}return next(specifier,context);}});
const {InputTimeline}=await import('../src/multiplayer/shared/input-timeline.ts');
const {OnlineClock,PresentationCorrection,ConnectionTrace}=await import('../src/multiplayer/netcode.ts');
const {LocalPrediction}=await import('../src/multiplayer/shared/movement.ts');
const {emptyInput}=await import('../src/multiplayer/shared/protocol.ts');
const input=(seq:number,targetTick:number)=>({...emptyInput(seq,targetTick),inputEpoch:0,targetTick,clientTick:seq,moveY:1});
const receipt=(tick:number,applied=0,cancelled=0)=>({epoch:0,appliedSeq:applied,acceptedSeq:applied,cancelledThrough:cancelled,serverTick:tick,appliedTargetTick:tick,queueDepth:0,inputAgeTicks:0,reason:'none' as const});
const world=()=>{const actors=new Map();return{manifest:{lowestOpenElevation:-4},actors,addActor:(id:string)=>actors.set(id,{}),removeActor:(id:string)=>actors.delete(id),restore:()=>{},step:()=>{},safeRoute:()=>true,supportAt:()=>({height:0,clear:true}),move:(_id:string,p:number[],d:number[],crouch=false)=>({position:[p[0]+d[0],Math.max(0,p[1]+d[1]),p[2]+d[2]],grounded:true,crouched:crouch})};};
const state=(tick:number,applied=0,cancelled=0)=>({position:[0,0,0],velocity:[0,0,0],grounded:true,crouched:false,stamina:100,sprinting:false,sliding:false,loading:false,ack:applied,actionAck:0,appliedInputTick:tick,inputReceipt:receipt(tick,applied,cancelled)} as any);

test('authority time does not silently acknowledge commands still in transit',()=>{
 const p=new LocalPrediction(world() as any,'me',[0,0,0]);p.predict(input(1,101));p.predict(input(2,102));
 p.reconcile(state(105),105);assert.equal(p.pendingCount,2);assert.equal(p.lastReplaySteps,1);assert.ok(p.motion.position[2]<0);
 p.reconcile(state(106,2),106);assert.equal(p.pendingCount,0);assert.equal(p.lastReplaySteps,0);p.dispose();
});
test('explicit cancellation removes even a predicted future command',()=>{
 const p=new LocalPrediction(world() as any,'me',[0,0,0]);p.predict(input(1,108));p.reconcile(state(102,0,1),102);assert.equal(p.pendingCount,0);assert.equal(p.motion.position[2],0);p.dispose();
});
test('late batches coalesce continuous movement, preserve once-only actions and never fast-forward',()=>{
 const q=new InputTimeline();q.reset(0,0,100);q.enqueue({...input(1,70),actions:['jump'],actionIds:[{id:1,type:'jump'}]},100);q.enqueue({...input(2,71),moveX:1,actions:['reload'],actionIds:[{id:2,type:'reload'}]},100);
 assert.equal(q.consume(100).command.moveY,0);const next=q.consume(101);assert.equal(next.command.seq,2);assert.equal(next.command.moveX,1);assert.deepEqual(next.command.actions,['jump','reload']);assert.equal(next.receipt.reason,'late-input');assert.deepEqual(q.consume(102).command.actions,[]);
});
test('timeout stops movement and explicitly identifies cancelled input',()=>{
 const q=new InputTimeline();q.reset(0,0,10);q.enqueue(input(1,11),10);assert.equal(q.consume(11).command.moveY,1);const timed=q.consume(29);assert.equal(timed.command.moveY,0);assert.equal(timed.receipt.reason,'input-timeout');assert.equal(timed.receipt.cancelledThrough,1);
});
test('rebase acknowledges cancellation atomically and rejects old-epoch traffic',()=>{
 const q=new InputTimeline();q.reset(0,0,10);q.enqueue({...input(1,11),actionIds:[{id:1,type:'jump'}]},10);
 assert.equal(q.rebase(0,2,1,10,0,0),true);assert.equal(q.epoch,1);assert.equal(q.rebase(0,2,1,10,0,0),false);assert.equal(q.enqueue(input(3,12),11),false);
 assert.equal(q.enqueue({...input(3,12),inputEpoch:1},11),true);const next=q.consume(12);assert.equal(next.command.moveY,1);assert.deepEqual(next.command.actions,[]);assert.equal(next.actionAck,1);assert.equal(next.receipt.epoch,1);
});
test('an invalid cancellation cannot erase a valid pending action',()=>{
 const q=new InputTimeline();q.reset(0,0,10);q.enqueue({...input(1,12),actionIds:[{id:1,type:'jump'}]},10);
 assert.equal(q.enqueue({...input(2,11),resetInput:true,cancelActionThrough:9999},10),false);assert.deepEqual(q.consume(12).command.actions,['jump']);assert.equal(q.consume(13).actionAck,1);
});
test('waiting for a rebase receipt preserves history until explicit cancellation',()=>{
 const p=new LocalPrediction(world() as any,'me',[0,0,0]);p.predict(input(1,11));p.reconcile(state(10),10,false);assert.equal(p.pendingCount,1);assert.equal(p.lastReplaySteps,0);p.reconcile(state(10,0,1),10,false);assert.equal(p.pendingCount,0);p.dispose();
});
test('prediction replays only currently authorized collision history then restores current poses',()=>{
 const p=new LocalPrediction(world() as any,'me',[0,0,0]),ticks:(number|undefined)[]=[];p.predict(input(1,11));p.predict(input(2,12));p.reconcile(state(10),10,true,tick=>ticks.push(tick));assert.deepEqual(ticks,[11,12,undefined]);p.dispose();
});
test('collision-clamped presentation retains the safe segment and counts abrupt cuts',()=>{
 const p=new PresentationCorrection();p.add([2,0,0],[0,0,0]);p.update(0,offset=>offset[0]<=.5);assert.ok(p.offset[0]>.45&&p.offset[0]<=.5);assert.equal(p.collisionCuts,1);assert.equal(p.hardResets,1);assert.equal(p.lastReason,'collision-clamp');
});
test('delayed snapshot bursts do not reverse server or render time',()=>{
 const clock=new OnlineClock();clock.observe(100,1000,100);let server=clock.serverTick(1100),render=clock.renderTick(1100);for(let n=1;n<=8;n++){clock.observe(100+n,1100+n,100);const current=clock.serverTick(1100+n),shown=clock.renderTick(1100+n);assert.ok(current>=server);assert.ok(shown>=render);server=current;render=shown;}
});
test('connection evidence remains bounded and private to the local connection',()=>{
 const trace=new ConnectionTrace();for(let i=0;i<200;i++)trace.record('correction',{distance:.1},i);assert.equal(trace.read().length,120);trace.record('rebase',{reason:'clock-gap'},130000);assert.equal(trace.read().length,1);
});
test('large corrections retain two seconds before and after in a bounded incident',()=>{
 const trace=new ConnectionTrace();trace.record('input',{seq:1},0);trace.record('input',{seq:2},1500);trace.record('authority-correction',{distance:.4},2000);trace.record('input',{seq:3},3500);trace.record('input',{seq:4},4100);
 const evidence=trace.evidence();assert.equal(evidence.incidents.length,1);assert.equal(evidence.incidents[0].until,4000);assert.deepEqual(evidence.incidents[0].entries.map(e=>e.at),[0,1500,2000,3500]);
});
