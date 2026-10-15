import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&context.parentURL?.includes('/src/')){const url=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts'))return next(specifier+'.ts',context);}return next(specifier,context);}});
const {predictionFrame,PREDICTION_STEP}=await import('../src/multiplayer/frame-step.ts');
const {InputTimeline}=await import('../src/multiplayer/shared/input-timeline.ts');
const {RecipientVisibility}=await import('../src/multiplayer/shared/visibility.ts');
const {SimWorld}=await import('../src/multiplayer/shared/sim-world.ts');
const {emptyInput}=await import('../src/multiplayer/shared/protocol.ts');

test('120/200ms frames preserve all elapsed fixed time; 300ms explicitly requests a rebase',()=>{
 for(const elapsed of [.12,.2]){const result=predictionFrame(.003,elapsed);assert.equal(result.rebase,false);assert.ok(result.steps<=12);assert.ok(Math.abs(result.steps*PREDICTION_STEP+result.remainder-(elapsed+.003))<1e-8);}
 const lost=predictionFrame(.003,.3);assert.equal(lost.rebase,true);assert.equal(lost.steps,0);assert.equal(lost.remainder,0);assert.equal(lost.elapsedMs,300);
 assert.equal(predictionFrame(0,Infinity).rebase,true);
});
test('bounded catch-up consumes an instantaneous action once without losing continuous movement steps',()=>{
 const frame=predictionFrame(0,.2),mailbox=new InputTimeline();mailbox.reset(0,0,60);let actions=0,steps=0;
 for(let i=0;i<frame.steps;i++){const tick=61+i;mailbox.enqueue({...emptyInput(i+1,tick),targetTick:tick,moveY:1,actions:i===0?['jump']:[],actionIds:i===0?[{id:1,type:'jump'}]:[]},tick-1);const input=mailbox.consume(tick);actions+=input.command.actions!.length;steps+=input.command.moveY;}
 assert.equal(steps,12);assert.equal(actions,1);assert.equal(mailbox.consume(73).actionAck,1);
});
test('a historical input anomaly expires from current status but retains its timestamp',()=>{
 const mailbox=new InputTimeline();mailbox.reset(0,0,100);mailbox.enqueue({...emptyInput(1,70),targetTick:70,moveY:1},100);
 assert.equal(mailbox.consume(101).receipt.reason,'late-input');
 const recovered=mailbox.consume(102).receipt;assert.equal(recovered.reason,'none');assert.equal(recovered.lastReason,'late-input');assert.equal(recovered.lastReasonTick,100);
 assert.equal(mailbox.consume(119).receipt.reason,'input-timeout');
});
test('exact visibility cache invalidates mutable smoke, pose, observer and world changes',()=>{
 let rays=0;const world={visible:()=>{rays++;return true;}},self:any={id:'self',generation:1,position:[0,0,0],velocity:[0,0,0],crouched:false},target:any={id:'target',generation:1,position:[0,0,-12],velocity:[0,0,0],crouched:false};
 const visibility=new RecipientVisibility(),smokes:any[]=[];assert.equal(visibility.permits(world,self,target,smokes,60),true);const first=rays;visibility.permits(world,self,target,smokes,61);assert.equal(rays,first);
 smokes.push({id:'smoke',position:[0,1,-6],radius:3});assert.equal(visibility.permits(world,self,target,smokes,62),false);
 smokes[0].position[0]=100;assert.equal(visibility.permits(world,self,target,smokes,63),true);assert.ok(rays>first);
 assert.equal(visibility.permits({visible:()=>false},self,target,smokes,64),false);
 target.generation++;assert.equal(visibility.permits(world,self,target,smokes,65),true);
 self.position[0]=.01;const before=rays;visibility.permits(world,self,target,smokes,66);assert.ok(rays>before);
});
test('authorized remote checkpoint restores collider positions in one propagation',()=>{
 let propagated=0;const translated:any[]=[];
 const actor=(id:string)=>({height:1.75,body:{setTranslation:(p:any)=>translated.push({id,...p}),setNextKinematicTranslation:()=>{}}});
 const world=Object.create(SimWorld.prototype) as any;world.physics={propagateModifiedBodyPositionsToColliders:()=>propagated++};world.actors=new Map([['a',actor('a')],['b',actor('b')]]);
 world.restoreActors([{id:'a',position:[1,0,2],crouched:false},{id:'b',position:[3,4,5],crouched:false},{id:'hidden',position:[6,7,8]}]);
 assert.equal(propagated,1);assert.deepEqual(translated,[{id:'a',x:1,y:.875,z:2},{id:'b',x:3,y:4.875,z:5}]);assert.equal(world.actors.has('hidden'),false);
});
