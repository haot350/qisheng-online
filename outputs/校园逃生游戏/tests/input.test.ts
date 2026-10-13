import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {createInput} from '../src/input.ts';
import {listenPointerSession,PointerSession} from '../src/pointer-owner.ts';
import {ESCAPE_AIM_PREFERENCE_VERSION,parseStoredSettings} from '../src/types.ts';

class Canvas extends EventTarget {
  requests=0;
  requestPointerLock():void{this.requests++;}
  focus(){(globalThis.document as unknown as Document).activeElement=this;}
}
class Document extends EventTarget {
  pointerLockElement:Canvas|object|null=null;
  hidden=false;
  activeElement:Canvas|null=null;
  documentElement={dataset:{} as Record<string,string>};
  exitPointerLock(){this.pointerLockElement=null;this.dispatchEvent(new Event('pointerlockchange'));}
}
async function fixture(run:(input:ReturnType<typeof createInput>,doc:Document,canvas:Canvas,win:EventTarget)=>Promise<void>,onPause=()=>{}){
  const doc=new Document(),canvas=new Canvas(),win=new EventTarget();
  const globals={document:doc,window:win,navigator:{maxTouchPoints:0},matchMedia:()=>({matches:false})};
  const descriptors=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value]of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,value});
  const input=createInput(canvas as unknown as HTMLCanvasElement,onPause);
  try{await run(input,doc,canvas,win);}
  finally{input.dispose();for(const [key,descriptor]of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
}

async function grantLock(input:ReturnType<typeof createInput>){
 const pending=input.lock(),doc=globalThis.document as unknown as Document;
 doc.pointerLockElement=doc.activeElement;doc.dispatchEvent(new Event('pointerlockchange'));await pending;
}

test('legacy void requestPointerLock stays pending until this canvas actually owns the lock',async()=>fixture(async(input,doc,canvas)=>{
  let completed=false;const pending=input.lock().then(()=>{completed=true;});
  await setImmediate();assert.equal(canvas.requests,1);assert.equal(completed,false,'void return must not count as successful locking');
  doc.pointerLockElement={};doc.dispatchEvent(new Event('pointerlockchange'));
  await setImmediate();assert.equal(completed,false,'an unrelated locked element must not complete this request');
  doc.pointerLockElement=canvas;doc.dispatchEvent(new Event('pointerlockchange'));
  await pending;assert.equal(completed,true);
}));

test('pointerlockerror rejects the pending legacy request and permits a fresh retry',async()=>fixture(async(input,doc,canvas)=>{
  const pending=input.lock();const rejected=assert.rejects(pending,/未允许鼠标锁定/);
  doc.dispatchEvent(new Event('pointerlockerror'));await rejected;
  const retry=input.lock();assert.equal(canvas.requests,2);
  doc.pointerLockElement=canvas;doc.dispatchEvent(new Event('pointerlockchange'));await retry;
}));

test('dispose cancels waiting for pointer lock and clears buttons, movement, look and queued actions',async()=>fixture(async(input,doc,canvas,win)=>{
  input.move(.6,.4);input.look(12,-7);input.action('fire');input.action('aim');input.action('crouch');input.action('jump');
  const pending=input.lock();const cancelled=assert.rejects(pending,/游戏已关闭/);
  input.dispose();await cancelled;
  const expected={moveX:0,moveY:0,lookX:0,lookY:0,fire:false,aim:false,crouch:false,sprintHeld:false,actions:new Set()};
  assert.deepEqual(input.sample(),expected);
  // Late browser input and lock events must not re-populate disposed controls.
  doc.pointerLockElement=canvas;doc.dispatchEvent(new Event('pointerlockchange'));
  win.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyW',repeat:false}));
  win.dispatchEvent(Object.assign(new Event('mousemove'),{movementX:8,movementY:3}));
  win.dispatchEvent(Object.assign(new Event('mousedown'),{button:0}));
  assert.deepEqual(input.sample(),expected);await assert.rejects(input.lock(),/游戏已关闭/);
}));

test('a touch tap between samples retains one fire edge without leaving fire held',async()=>fixture(async(input)=>{
  input.action('fire',true);input.action('fire',false);
  const tap=input.sample();
  assert.equal(tap.fire,false);assert.equal(tap.actions.has('fire'),true);
  const next=input.sample();
  assert.equal(next.fire,false);assert.equal(next.actions.has('fire'),false,'an edge is consumed by its first sample');
}));

test('holding fire preserves continuous input but does not repeat its press edge',async()=>fixture(async(input)=>{
  input.action('fire',true);input.action('fire',true);
  const first=input.sample();
  assert.equal(first.fire,true);assert.deepEqual([...first.actions],['fire']);
  input.action('fire',true);
  const held=input.sample();
  assert.equal(held.fire,true);assert.equal(held.actions.has('fire'),false);
  input.action('fire',false);
  const released=input.sample();
  assert.equal(released.fire,false);assert.equal(released.actions.has('fire'),false);
}));

test('two quick taps on consecutive samples each retain a press edge',async()=>fixture(async(input)=>{
  for(let tap=0;tap<2;tap++){
    input.action('fire',true);input.action('fire',false);
    const frame=input.sample();
    assert.equal(frame.fire,false);assert.equal(frame.actions.has('fire'),true,`tap ${tap+1} must survive`);
  }
  assert.equal(input.sample().actions.has('fire'),false);
}));

test('locked mouse taps use the same edge queue and reset discards unconsumed shots',async()=>fixture(async(input,doc,canvas,win)=>{
  const mouse=(type:string)=>win.dispatchEvent(Object.assign(new Event(type),{button:0}));
  mouse('mousedown');mouse('mouseup');
  assert.equal(input.sample().actions.has('fire'),false,'an unlocked mouse must not fire');
  doc.pointerLockElement=canvas;
  mouse('mousedown');mouse('mouseup');
  const frame=input.sample();
  assert.equal(frame.fire,false);assert.equal(frame.actions.has('fire'),true);
  mouse('mousedown');mouse('mouseup');input.reset();
  const reset=input.sample();
  assert.equal(reset.fire,false);assert.equal(reset.actions.has('fire'),false,'pausing must not leave a queued shot');
}));

test('driving accepts focused keyboard without pointer lock and keeps steering independent of the accelerator',async()=>fixture(async(input,doc,canvas,win)=>{
 input.setMode('dafei');await input.lock();assert.equal(canvas.requests,0);assert.equal(doc.activeElement,canvas);
 const key=(type:string,code:string,repeat=false)=>win.dispatchEvent(Object.assign(new Event(type),{code,repeat}));
 key('keydown','KeyW');key('keydown','KeyD');key('keydown','ShiftLeft');key('keydown','KeyR');
 const first=input.sample();assert.deepEqual(first.drive,{steer:1,throttle:1,brake:0,handbrake:false,reverse:false,boost:true,reset:true});assert.equal(first.fire,false);
 key('keydown','ShiftLeft',true);assert.equal(input.sample().drive?.boost,false,'held Shift must not retrigger boost');
 key('keyup','KeyW');key('keydown','KeyS');key('keydown','Space');
 const reverse=input.sample().drive!;assert.equal(reverse.reverse,true);assert.equal(reverse.throttle,1);assert.equal(reverse.brake,0);assert.equal(reverse.handbrake,true);assert.equal(reverse.reset,true);
 key('keyup','ShiftLeft');key('keydown','ShiftLeft');assert.equal(input.sample().drive?.boost,true);
}));

test('driving boost touch edges, disable and mode switching clear controls without a queued walking shot',async()=>fixture(async(input,_doc,_canvas,win)=>{
 input.setMode('dafei');input.drive({steer:.8,throttle:1,boost:true});input.action('fire');
 assert.equal(input.sample().drive?.boost,true);input.drive({boost:true});assert.equal(input.sample().drive?.boost,false);
 input.drive({boost:false});input.drive({boost:true});assert.equal(input.sample().drive?.boost,true);
 input.setEnabled(false);input.drive({throttle:1});input.look(22,9);assert.deepEqual(input.sample().drive,{steer:0,throttle:0,brake:0,handbrake:false,reverse:false,boost:false,reset:false});
 input.setEnabled(true);input.setMode('roam');assert.equal(input.sample().drive,undefined);assert.equal(input.sample().actions.size,0);
 win.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyW',repeat:false}));assert.equal(input.sample().moveY,0,'walking still requires pointer lock');
}));

test('right drag observes the driving scene, while leaving pointer lock never pauses driving',async()=>{
 let pauses=0;
 await fixture(async(input,doc,canvas,win)=>{
  input.setMode('dafei');await input.lock();
  const down=Object.assign(new Event('mousedown'),{button:2});Object.defineProperty(down,'target',{value:canvas});win.dispatchEvent(down);
  win.dispatchEvent(Object.assign(new Event('mousemove'),{movementX:8,movementY:-3}));assert.equal(input.sample().lookX,8);
  const stationary=input.sample();assert.equal(stationary.lookX,0);assert.equal(stationary.lookHeld,true,'a stationary held right button must preserve the camera view');
  win.dispatchEvent(Object.assign(new Event('mouseup'),{button:2}));win.dispatchEvent(Object.assign(new Event('mousemove'),{movementX:9,movementY:9}));assert.equal(input.sample().lookX,0);
  assert.equal(input.sample().lookHeld,false,'release allows the driving camera to recenter');
  doc.pointerLockElement=canvas;doc.dispatchEvent(new Event('pointerlockchange'));doc.exitPointerLock();assert.equal(pauses,0);
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(pauses,1);
 },()=>{pauses++;});
});

test('touch look hold persists through zero movement and is cleared by release, pause and mode change',async()=>fixture(async(input)=>{
 input.setMode('dafei');input.holdLook(true);input.look(12,-4);assert.equal(input.sample().lookHeld,true);
 const stationary=input.sample();assert.equal(stationary.lookHeld,true);assert.equal(stationary.lookX,0);
 input.holdLook(false);assert.equal(input.sample().lookHeld,false);
 input.holdLook(true);input.setEnabled(false);assert.equal(input.sample().lookHeld,false);
 input.holdLook(true);assert.equal(input.sample().lookHeld,false,'disabled touches cannot re-enable the hold');
 input.setEnabled(true);input.holdLook(true);input.reset();assert.equal(input.sample().lookHeld,false);
 input.holdLook(true);input.setMode('roam');input.setMode('dafei');assert.equal(input.sample().lookHeld,false);
}));

test('handbrake is independent from steering, pedals and look; release and background discard every hold',async()=>{
 let pauses=0;
 await fixture(async(input,doc,_canvas,win)=>{
  input.setMode('dafei');input.drive({steer:.7});input.drive({throttle:1});input.drive({handbrake:true});input.drive({brake:.4});input.holdLook(true);input.look(4,3);
  const held=input.sample();assert.deepEqual(held.drive,{steer:.7,throttle:1,brake:.4,handbrake:true,reverse:false,boost:false,reset:false});assert.equal(held.lookHeld,true);
  input.drive({handbrake:false});assert.equal(input.sample().drive?.throttle,1);assert.equal(input.sample().drive?.brake,.4);
  input.drive({handbrake:true});doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));
  assert.deepEqual(input.sample().drive,{steer:0,throttle:0,brake:0,handbrake:false,reverse:false,boost:false,reset:false});assert.equal(input.sample().lookHeld,false);assert.equal(pauses,1);
  doc.hidden=false;input.drive({handbrake:true,throttle:1});win.dispatchEvent(new Event('blur'));assert.equal(input.sample().drive?.handbrake,false);assert.equal(pauses,2);
 },()=>{pauses++;});
});

test('continuous keyboard and direct mouse look survive repeated photography refresh and loading edges',async()=>fixture(async(input,_doc,_canvas,win)=>{
 input.setMode('story');await grantLock(input);
 win.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyW',repeat:false}));
 win.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyD',repeat:false}));
 input.setPhotography(true);
 for(let frame=0;frame<600;frame++){
  input.setPhotography(true);input.setEnabled(true);
  if(frame%6===0){input.action('jump');input.look(12,4);input.flushTransient();}
  win.dispatchEvent(Object.assign(new Event('mousemove'),{movementX:2,movementY:-1}));
  const sample=input.sample();assert.ok(sample.moveX>.7&&sample.moveY>.7);assert.equal(sample.lookX,2);assert.equal(sample.actions.size,0);
 }
 win.dispatchEvent(Object.assign(new Event('keyup'),{code:'KeyW'}));win.dispatchEvent(Object.assign(new Event('keyup'),{code:'KeyD'}));
 assert.equal(input.sample().moveY,0);input.setEnabled(false);input.setEnabled(true);assert.equal(input.sample().lookX,0);
}));

test('story and photography use direct locked mouse motion without a right-button hold',async()=>fixture(async(input,doc,_canvas,win)=>{
 input.setMode('story');await grantLock(input);
 for(const photographing of [false,true,false]){
  input.setPhotography(photographing);
  win.dispatchEvent(Object.assign(new Event('mousemove'),{movementX:14,movementY:-6}));
  const frame=input.sample();assert.equal(frame.lookX,14);assert.equal(frame.lookY,-6);assert.equal(frame.aim,false);assert.equal(frame.fire,false);
 }
 input.setCursorFree(true);win.dispatchEvent(Object.assign(new Event('mousemove'),{movementX:20,movementY:9}));
 assert.equal(input.sample().lookX,0,'moving over photographic controls cannot turn the scene');assert.equal(doc.pointerLockElement,null);
}));

test('Tab frees the story cursor once without pausing or automatically requesting another lock',async()=>{
 let pauses=0;await fixture(async(input,doc,canvas,win)=>{
  input.setMode('story');await grantLock(input);
  win.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyW',repeat:false}));input.look(8,3);
  const tab=new Event('keydown',{cancelable:true});Object.assign(tab,{code:'Tab',repeat:false});win.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented,true);assert.equal(input.isCursorFree(),true);assert.equal(input.isLocked(),false);assert.equal(doc.pointerLockElement,null);assert.equal(pauses,0);
  const stopped=input.sample();assert.equal(stopped.moveY,0);assert.equal(stopped.lookX,0);
  await input.lock();assert.equal(canvas.requests,1,'free cursor requests merely focus the canvas');
  input.setCursorFree(false);assert.equal(canvas.requests,1,'closing UI must wait for an explicit user gesture');
  await grantLock(input);assert.equal(canvas.requests,2);assert.equal(input.isLocked(),true);
  win.dispatchEvent(Object.assign(new Event('mousemove'),{movementX:5,movementY:2}));assert.equal(input.sample().lookX,5);
  doc.exitPointerLock();assert.equal(pauses,1,'a real Escape ownership loss is still a pause');
 },()=>{pauses++;});
});

test('photography Tab frees the cursor in roam; driving Tab and right-drag controls keep their existing behavior',async()=>fixture(async(input,_doc,canvas,win)=>{
 input.setMode('roam');input.setPhotography(true);await grantLock(input);
 win.dispatchEvent(Object.assign(new Event('keydown'),{code:'Tab',repeat:false}));assert.equal(input.isCursorFree(),true);
 input.setPhotography(false);input.setMode('dafei');await input.lock();assert.equal(input.isCursorFree(),false);
 win.dispatchEvent(Object.assign(new Event('keydown'),{code:'Tab',repeat:false}));assert.equal(input.isCursorFree(),false);
 win.dispatchEvent(Object.assign(new Event('mousemove'),{movementX:6,movementY:2}));assert.equal(input.sample().lookX,0);
 const right=new Event('mousedown');Object.assign(right,{button:2});Object.defineProperty(right,'target',{value:canvas});win.dispatchEvent(right);
 win.dispatchEvent(Object.assign(new Event('mousemove'),{movementX:6,movementY:2}));assert.equal(input.sample().lookX,6);
}));

test('Tab traverses free-cursor modal buttons and editable controls without being consumed by story or photography',async()=>{
 for(const mode of ['story','roam'] as const)await fixture(async(input,doc,_canvas,win)=>{
  input.setMode(mode);input.setPhotography(true);await grantLock(input);
  win.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyW',repeat:false}));input.setCursorFree(true);
  for(const tagName of ['BUTTON','INPUT','SELECT','TEXTAREA']){
   const control={tagName},tab=new Event('keydown',{cancelable:true});Object.assign(tab,{code:'Tab',repeat:false});Object.defineProperty(tab,'target',{value:control});Object.defineProperty(doc,'activeElement',{value:control,writable:true});
   win.dispatchEvent(tab);assert.equal(tab.defaultPrevented,false,`${mode} ${tagName} Tab should reach browser/modal focus handling`);assert.equal(input.sample().moveY,0);assert.equal(input.isCursorFree(),true);
  }
  input.setSuspended(true);const pendingTab=new Event('keydown',{cancelable:true});Object.assign(pendingTab,{code:'Tab',repeat:false});win.dispatchEvent(pendingTab);assert.equal(pendingTab.defaultPrevented,false,'pending reality still permits its close/retry control to receive focus');
  input.setSuspended(false);input.setCursorFree(false);const unlockedTab=new Event('keydown',{cancelable:true});Object.assign(unlockedTab,{code:'Tab',repeat:false});win.dispatchEvent(unlockedTab);assert.equal(unlockedTab.defaultPrevented,false,'automatic dialogue ending without lock does not capture keyboard traversal');assert.equal(input.isCursorFree(),false);
 });
});

test('programmatic cursor release preserves held walking but clears mouse buttons and never pauses',async()=>{
 let pauses=0;await fixture(async(input,doc,_canvas,win)=>{
  input.setMode('story');await grantLock(input);win.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyW',repeat:false}));
  input.action('fire');input.action('aim');input.look(4,2);input.freePointerLock();
  const released=input.sample();assert.equal(released.moveY,1);assert.equal(released.fire,false);assert.equal(released.aim,false);assert.equal(released.lookX,0);assert.equal(released.actions.size,0);assert.equal(doc.pointerLockElement,null);assert.equal(pauses,0);
  win.dispatchEvent(Object.assign(new Event('keyup'),{code:'KeyW'}));input.setCursorFree(false);await grantLock(input);assert.equal(input.sample().moveY,0,'released UI-time keys cannot return after locking');
 },()=>{pauses++;});
});

test('disabling or switching modes intentionally releases ownership and clears held input without another pause',async()=>{
 for(const transition of ['disable','mode'] as const){let pauses=0;await fixture(async(input,doc,_canvas,win)=>{
  input.setMode('story');await grantLock(input);win.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyW',repeat:false}));input.look(4,3);
  if(transition==='disable')input.setEnabled(false);else input.setMode('dafei');
  assert.equal(doc.pointerLockElement,null);assert.equal(input.sample().moveY,0);assert.equal(input.sample().lookX,0);assert.equal(pauses,0);
 },()=>{pauses++;});}
});

test('free cursor, disable and mode change cancel pending legacy locks and reject a late ownership event',async()=>{
 for(const reason of ['cursor','disable','mode'] as const)await fixture(async(input,doc,canvas)=>{
  input.setMode('story');const waiting=input.lock();const rejected=assert.rejects(waiting,/已取消|已暂停|已切换/);
  if(reason==='cursor')input.setCursorFree(true);else if(reason==='disable')input.setEnabled(false);else input.setMode('dafei');
  await rejected;doc.pointerLockElement=canvas;doc.dispatchEvent(new Event('pointerlockchange'));assert.equal(doc.pointerLockElement,null,reason);
  input.setEnabled(true);input.setMode('story');input.setCursorFree(false);await grantLock(input);assert.equal(input.isLocked(),true,'an explicit retry can acquire new ownership');
 });
});

test('a late legacy lock after disposal is exited and cannot invoke the former pause callback',async()=>{
 let pauses=0;await fixture(async(input,doc,canvas)=>{
  const waiting=input.lock(),rejected=assert.rejects(waiting,/游戏已关闭/);input.dispose();await rejected;
  doc.pointerLockElement=canvas;doc.dispatchEvent(new Event('pointerlockchange'));assert.equal(doc.pointerLockElement,null);assert.equal(pauses,0);
 },()=>{pauses++;});
});

test('a lock cancelled by an overlay is still rejected if browser ownership arrives after subsequent disposal',async()=>fixture(async(input,doc,canvas)=>{
 const waiting=input.lock(),rejected=assert.rejects(waiting,/已取消/);input.setCursorFree(true);await rejected;input.dispose();
 doc.pointerLockElement=canvas;doc.dispatchEvent(new Event('pointerlockchange'));assert.equal(doc.pointerLockElement,null);
}));

test('opening a viewfinder keeps pointer lock and held walking; a real Escape unlock pauses',async()=>{
 let pauses=0;await fixture(async(input,doc,canvas,win)=>{
  input.setMode('roam');doc.pointerLockElement=canvas;doc.dispatchEvent(new Event('pointerlockchange'));
  win.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyW',repeat:false}));
  input.setPhotography(true);assert.equal(doc.pointerLockElement,canvas);assert.equal(input.sample().moveY,1);assert.equal(pauses,0);
  doc.exitPointerLock();assert.equal(pauses,1);assert.equal(input.sample().moveY,0);
 },()=>{pauses++;});
});

test('story Shift stays held for fast walking without sending the legacy run action',async()=>fixture(async(input,_doc,_canvas,win)=>{
 input.setMode('story');await grantLock(input);
 const key=(type:string,code:string,repeat=false)=>win.dispatchEvent(Object.assign(new Event(type),{code,repeat}));
 key('keydown','KeyW');key('keydown','ShiftLeft');
 for(let frame=0;frame<120;frame++){
  if(frame%10===0)key('keydown','ShiftLeft',true);
  const held=input.sample();assert.equal(held.moveY,1);assert.equal(held.fastWalk,true);assert.equal(held.actions.has('run'),false,'story fast walking must never trigger stamina or running music');
 }
 key('keydown','ShiftRight');key('keyup','ShiftLeft');assert.equal(input.sample().fastWalk,true,'either physical Shift key can keep fast walking held');
 key('keyup','ShiftRight');const normal=input.sample();assert.equal(normal.fastWalk,false);assert.equal(normal.moveY,1,'releasing Shift does not release walking');
}));

test('story touch fast walking toggles independently from walking and its button release',async()=>fixture(async(input)=>{
 input.setMode('story');input.move(0,1);input.action('run',true);
 assert.equal(input.sample().fastWalk,true);input.action('run',false);
 for(let frame=0;frame<30;frame++){const held=input.sample();assert.equal(held.fastWalk,true);assert.equal(held.moveY,1);assert.equal(held.actions.size,0);}
 input.action('run',true);input.action('run',false);
 const ordinary=input.sample();assert.equal(ordinary.fastWalk,false);assert.equal(ordinary.moveY,1);assert.equal(ordinary.actions.has('run'),false);
 input.action('run',true);input.setMode('roam');input.setMode('story');assert.equal(input.sample().fastWalk,false,'a new mode cannot inherit the previous touch toggle');
}));

test('reality suspension hides active story input while preserving held keys and accepting keyup',async()=>fixture(async(input,_doc,_canvas,win)=>{
 input.setMode('story');await grantLock(input);
 const key=(type:string,code:string)=>win.dispatchEvent(Object.assign(new Event(type),{code,repeat:false}));
 key('keydown','KeyW');key('keydown','ShiftLeft');input.action('jump');input.look(10,5);
 input.setSuspended(true);
 for(let frame=0;frame<30;frame++){
  const suspended=input.sample();assert.equal(suspended.moveY,0);assert.equal(suspended.fastWalk,false);assert.equal(suspended.lookX,0);assert.equal(suspended.actions.size,0);
 }
 input.setSuspended(false);const continued=input.sample();assert.equal(continued.moveY,1);assert.equal(continued.fastWalk,true);assert.equal(continued.actions.size,0,'exposure-time actions must not replay after the reveal');
 input.setSuspended(true);key('keyup','KeyW');key('keyup','ShiftLeft');input.action('run',true);input.look(99,99);
 input.setSuspended(false);const released=input.sample();assert.equal(released.moveY,0);assert.equal(released.fastWalk,false);assert.equal(released.lookX,0);assert.equal(released.actions.size,0);
}));

test('touch release during reality suspension clears walking without changing the fast-walk toggle',async()=>fixture(async(input)=>{
 input.setMode('story');input.move(.5,1);input.action('run');input.setSuspended(true);
 input.move(0,0);input.action('run');input.setSuspended(false);
 const resumed=input.sample();assert.equal(resumed.moveX,0);assert.equal(resumed.moveY,0);assert.equal(resumed.fastWalk,true,'a blocked modal tap cannot toggle the prior fast-walk preference');
}));

test('a real story Escape pause resets held keyboard and touch fast walking',async()=>{
 let pauses=0;await fixture(async(input,_doc,_canvas,win)=>{
  input.setMode('story');await grantLock(input);
  const key=(code:string)=>win.dispatchEvent(Object.assign(new Event('keydown'),{code,repeat:false}));
  key('KeyW');key('ShiftLeft');input.action('run');input.look(4,3);key('Escape');
  const paused=input.sample();assert.equal(pauses,1);assert.equal(paused.moveY,0);assert.equal(paused.fastWalk,false);assert.equal(paused.lookX,0);assert.equal(paused.actions.size,0);
 },()=>{pauses++;});
});

test('story disable, focus loss and background reset held inputs even during a reality reveal',async()=>{
 for(const reason of ['disable','blur','hidden','reset'] as const){
  let pauses=0;await fixture(async(input,doc,_canvas,win)=>{
   input.setMode('story');await grantLock(input);
   win.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyW',repeat:false}));
   win.dispatchEvent(Object.assign(new Event('keydown'),{code:'ShiftLeft',repeat:false}));
   input.action('run');input.move(.5,1);input.setSuspended(true);
   if(reason==='disable')input.setEnabled(false);
   else if(reason==='blur')win.dispatchEvent(new Event('blur'));
   else if(reason==='hidden'){doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));}
   else input.reset();
   input.setSuspended(false);input.setEnabled(true);
   const resumed=input.sample();assert.equal(resumed.moveX,0,reason);assert.equal(resumed.moveY,0,reason);assert.equal(resumed.fastWalk,false,reason);assert.equal(resumed.actions.size,0,reason);
   assert.equal(pauses,reason==='blur'||reason==='hidden'?1:0);
  },()=>{pauses++;});
 }
});

test('roam retains press-edge Shift running rather than story held fast walking',async()=>{
 for(const mode of ['roam'] as const)await fixture(async(input,doc,canvas,win)=>{
  input.setMode(mode);doc.pointerLockElement=canvas;doc.dispatchEvent(new Event('pointerlockchange'));
  const key=(type:string,code:string,repeat=false)=>win.dispatchEvent(Object.assign(new Event(type),{code,repeat}));
  key('keydown','KeyW');key('keydown','ShiftLeft');
  const first=input.sample();assert.equal(first.actions.has('run'),true,mode);assert.equal(first.fastWalk,undefined,mode);assert.equal(first.moveY,1);
  for(let frame=0;frame<20;frame++){key('keydown','ShiftLeft',true);assert.equal(input.sample().actions.has('run'),false,'held Shift cannot restart the legacy running timer');}
  key('keyup','ShiftLeft');key('keydown','ShiftRight');assert.equal(input.sample().actions.has('run'),true,'a fresh Shift press keeps the existing running toggle');
  key('keyup','ShiftRight');assert.equal(input.sample().actions.has('run'),false);
 });
});

test('opposing and diagonal keyboard pairs stop independently in either release order',async()=>fixture(async(input,_doc,_canvas,win)=>{
 input.setMode('story');await grantLock(input);
 const key=(type:string,code:string)=>win.dispatchEvent(Object.assign(new Event(type),{code,repeat:false}));
 for(const pair of [['KeyW','KeyA'],['KeyW','KeyD'],['KeyW','KeyS'],['KeyA','KeyD'],['ArrowUp','ArrowLeft'],['ArrowDown','ArrowRight'],['KeyW','ArrowUp']]){
  for(const order of [pair,[...pair].reverse()]){
   input.reset();for(const code of pair)key('keydown',code);
   const combined=input.sample();assert.ok(Number.isFinite(combined.moveX)&&Number.isFinite(combined.moveY));
   key('keyup',order[0]);const remaining=input.sample();assert.ok(Math.hypot(remaining.moveX,remaining.moveY)>0,'the still-held key survives its partner release');
   key('keyup',order[1]);const stopped=input.sample();assert.equal(stopped.moveX,0,pair.join('+'));assert.equal(stopped.moveY,0,pair.join('+'));
  }
 }
}));

test('an orphan repeat after pause or focus reset cannot restart walking until a fresh press',async()=>fixture(async(input,_doc,_canvas,win)=>{
 input.setMode('story');await grantLock(input);
 const key=(code:string,repeat=false)=>win.dispatchEvent(Object.assign(new Event('keydown'),{code,repeat}));
 key('KeyW');key('KeyD');assert.ok(input.sample().moveY>0);input.reset();
 for(let frame=0;frame<30;frame++){key('KeyW',true);key('KeyD',true);assert.equal(input.sample().moveY,0);assert.equal(input.sample().moveX,0);}
 key('KeyW');assert.equal(input.sample().moveY,1,'a genuine new press restores movement');
 key('KeyW',true);assert.equal(input.sample().moveY,1,'repeat must not interrupt a genuine hold');
}));

test('editable focus and browser focus shortcuts release physical keys without pausing the scene',async()=>{
 let pauses=0;await fixture(async(input,_doc,_canvas,win)=>{
  input.setMode('story');await grantLock(input);
  const down=(code:string,flags={})=>win.dispatchEvent(Object.assign(new Event('keydown'),{code,repeat:false,...flags}));
  for(const code of ['AltLeft','MetaLeft','Tab']){down('KeyW');down('KeyD');down(code);assert.equal(input.sample().moveY,0);assert.equal(input.sample().moveX,0);}
  down('KeyW');const focusEvent=new Event('focusin');Object.defineProperty(focusEvent,'target',{value:{tagName:'INPUT'}});win.dispatchEvent(focusEvent);
  assert.equal(input.sample().moveY,0);assert.equal(pauses,0,'editing camera settings must not open the pause page');
  down('KeyW');const buttonFocus=new Event('focusin');Object.defineProperty(buttonFocus,'target',{value:{tagName:'BUTTON'}});win.dispatchEvent(buttonFocus);
  assert.equal(input.sample().moveY,1,'ordinary overlay buttons do not erase an actually held key');
 },()=>{pauses++;});
});

test('driving Q and E shift only on fresh key presses and each edge is consumed once',async()=>fixture(async(input,_doc,_canvas,win)=>{
 input.setMode('dafei');await input.lock();
 const key=(type:string,code:string,repeat=false)=>win.dispatchEvent(Object.assign(new Event(type),{code,repeat}));
 key('keydown','KeyW');key('keydown','KeyD');
 for(const [code,action] of [['KeyE','shiftUp'],['KeyQ','shiftDown']] as const){
  key('keydown',code);const first=input.sample();assert.deepEqual([...first.actions],[action]);assert.equal(first.drive?.throttle,1);assert.equal(first.drive?.steer,1);
  key('keydown',code,true);assert.equal(input.sample().actions.size,0,'held key repeat cannot queue another shift');
  key('keydown',code);assert.equal(input.sample().actions.size,0,'duplicate physical keydown cannot queue another shift');
  key('keyup',code);key('keydown',code);assert.deepEqual([...input.sample().actions],[action]);key('keyup',code);
 }
 assert.equal(input.sample().actions.size,0);
}));

test('phone shifts are one-shot commands independent of held steering, pedals, handbrake and look',async()=>fixture(async(input)=>{
 input.setMode('dafei');input.drive({steer:.6,throttle:1,brake:.3,handbrake:true});input.holdLook(true);
 input.action('shiftUp');input.action('shiftUp');input.action('shiftUp',false);input.look(8,-2);
 const frame=input.sample();assert.deepEqual([...frame.actions],['shiftUp']);assert.deepEqual(frame.drive,{steer:.6,throttle:1,brake:.3,handbrake:true,reverse:false,boost:false,reset:false});assert.equal(frame.lookHeld,true);assert.equal(frame.lookX,8);
 const held=input.sample();assert.equal(held.actions.size,0);assert.equal(held.drive?.throttle,1);assert.equal(held.drive?.steer,.6);assert.equal(held.lookHeld,true);
 input.action('shiftDown');assert.deepEqual([...input.sample().actions],['shiftDown']);input.action('shiftDown',false);assert.equal(input.sample().actions.size,0);
}));

test('pause, disable, loading freeze, focus loss and mode change discard unconsumed shifts',async()=>{
 for(const reason of ['reset','disable','suspend','blur','hidden','mode','escape','flush'] as const)await fixture(async(input,doc,_canvas,win)=>{
  input.setMode('dafei');await input.lock();input.action('shiftUp');input.action('shiftDown');
  if(reason==='reset')input.reset();
  else if(reason==='disable'){input.setEnabled(false);input.action('shiftUp');input.setEnabled(true);}
  else if(reason==='suspend'){input.setSuspended(true);input.action('shiftUp');input.setSuspended(false);}
  else if(reason==='blur')win.dispatchEvent(new Event('blur'));
  else if(reason==='hidden'){doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));}
  else if(reason==='mode'){input.setMode('roam');input.setMode('dafei');}
  else if(reason==='escape')win.dispatchEvent(Object.assign(new Event('keydown'),{code:'Escape',repeat:false}));
  else input.flushTransient();
  assert.equal(input.sample().actions.size,0,reason);
 });
});

test('driving repeat after reset never rearms a shift and walking Q/E retain their original actions',async()=>{
 await fixture(async(input,_doc,_canvas,win)=>{
  input.setMode('dafei');await input.lock();const key=(code:string,repeat=false)=>win.dispatchEvent(Object.assign(new Event('keydown'),{code,repeat}));
  key('KeyE');input.reset();key('KeyE',true);key('KeyQ',true);assert.equal(input.sample().actions.size,0);key('KeyQ');assert.deepEqual([...input.sample().actions],['shiftDown']);
 });
 for(const mode of ['escape','story','roam'] as const)await fixture(async(input,_doc,_canvas,win)=>{
  input.setMode(mode);await grantLock(input);input.action('shiftUp');input.action('shiftDown');assert.equal(input.sample().actions.size,0);
  win.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyQ',repeat:false}));win.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyE',repeat:false}));
  assert.deepEqual([...input.sample().actions],['switch','interact'],mode);
 });
});
test('escape Shift is held sprint, Ctrl slides once, and release clears without a run edge',async()=>fixture(async(input,_doc,_canvas,win)=>{
 await grantLock(input);const key=(type:string,code:string,repeat=false)=>win.dispatchEvent(Object.assign(new Event(type),{code,repeat}));
 key('keydown','KeyW');key('keydown','ShiftLeft');let frame=input.sample();assert.equal(frame.sprintHeld,true);assert.equal(frame.actions.has('run'),false);assert.equal(frame.moveY,1);
 key('keydown','ControlLeft');frame=input.sample();assert.equal(frame.actions.has('slide'),true);assert.equal(frame.crouch,true);assert.equal(input.sample().actions.has('slide'),false);
 key('keydown','ControlLeft',true);assert.equal(input.sample().actions.has('slide'),false);key('keyup','ShiftLeft');key('keyup','ControlLeft');assert.equal(input.sample().sprintHeld,false);assert.equal(input.sample().crouch,false);
}));
test('escape mobile sprint toggle and slide are independent and reset on pause or mode change',async()=>fixture(async(input)=>{
 input.action('run',true);input.action('run',false);assert.equal(input.sample().sprintHeld,true);input.action('slide');assert.equal(input.sample().actions.has('slide'),true);assert.equal(input.sample().sprintHeld,true);
 input.action('run');assert.equal(input.sample().sprintHeld,false);input.action('run');input.setEnabled(false);input.setEnabled(true);assert.equal(input.sample().sprintHeld,false);input.action('run');input.setMode('roam');input.setMode('escape');assert.equal(input.sample().sprintHeld,false);
}));
test('escape M and Tab are task edges without releasing held movement; other modes ignore them',async()=>fixture(async(input,_doc,_canvas,win)=>{
 await grantLock(input);const key=(type:string,code:string,repeat=false)=>win.dispatchEvent(Object.assign(new Event(type),{code,repeat}));key('keydown','KeyW');key('keydown','Tab');let frame=input.sample();assert.equal(frame.actions.has('nextTask'),true);assert.equal(frame.moveY,1);key('keydown','Tab',true);assert.equal(input.sample().actions.size,0);key('keyup','Tab');key('keydown','KeyM');frame=input.sample();assert.equal(frame.actions.has('taskMap'),true);assert.equal(frame.moveY,1);key('keyup','KeyM');
 input.setMode('roam');await grantLock(input);key('keydown','KeyM');assert.equal(input.sample().actions.size,0);input.action('nextTask');input.action('taskMap');assert.equal(input.sample().actions.size,0);
 input.setMode('dafei');await input.lock();key('keydown','KeyE');key('keydown','KeyQ');assert.deepEqual([...input.sample().actions],['shiftUp','shiftDown']);
}));

// Preview 0.3.1: touch intent is independent from continuous keyboard/mouse state.
test('touch ADS toggles once per press and hold mode releases independently',async()=>fixture(async(input)=>{
 input.setEscapeAimMode('toggle');input.move(.6,.8);input.action('fire',true);
 input.action('aim',true);input.action('aim',true);assert.equal(input.sample().aim,true);
 input.action('aim',false);assert.equal(input.sample().aim,true);
 input.action('aim',true);input.action('aim',false);assert.equal(input.sample().aim,false);
 input.setEscapeAimMode('hold');input.action('aim',true);assert.equal(input.sample().aim,true);
 input.cancelAction('aim');const frame=input.sample();assert.equal(frame.aim,false);assert.equal(frame.fire,true);assert.equal(frame.moveY,.8);
 input.action('aim',true);input.action('aim',false);assert.equal(input.sample().aim,false);
}));
test('a second ADS press closes both intent and sampled aim before its finger releases',async()=>fixture(async(input)=>{
 input.move(.6,.2);input.action('fire',true);input.action('aim',true);input.action('aim',false);
 assert.equal(input.getAimIntent(),true);assert.equal(input.sample().aim,true);
 input.action('aim',true);assert.equal(input.getAimIntent(),false);assert.equal(input.sample().aim,false);
 input.action('aim',true);assert.equal(input.getAimIntent(),false,'a duplicate pointerdown cannot reopen ADS');
 input.cancelAction('aim');const cancelled=input.sample();assert.equal(input.getAimIntent(),true);assert.equal(cancelled.aim,true,'cancel restores the previous toggle');assert.equal(cancelled.fire,true);assert.equal(cancelled.moveX,.6);
 input.action('aim',true);input.action('aim',false);assert.equal(input.getAimIntent(),false);assert.equal(input.sample().aim,false);
}));
test('cancelled ADS pointer preserves the independently owned move and fire pointers',async()=>fixture(async(input,doc,_canvas,win)=>{
 const session=new PointerSession(),stop=listenPointerSession(session,win,doc),target={};
 try{
  assert.equal(session.begin('move',{pointerId:1,clientX:10,clientY:20,currentTarget:target},()=>input.move(0,0)),true);input.move(-.7,.2);
  assert.equal(session.begin('fire',{pointerId:2,clientX:10,clientY:20,currentTarget:target},cancelled=>cancelled?input.cancelAction('fire'):input.action('fire',false)),true);input.action('fire',true);
  assert.equal(session.begin('aim',{pointerId:3,clientX:10,clientY:20,currentTarget:target},cancelled=>cancelled?input.cancelAction('aim'):input.action('aim',false)),true);input.action('aim',true);
  win.dispatchEvent(Object.assign(new Event('pointercancel'),{pointerId:3}));
  const frame=input.sample();assert.equal(frame.aim,false);assert.equal(input.getAimIntent(),false);assert.equal(frame.fire,true);assert.equal(frame.moveX,-.7);assert.equal(session.size,2);
  win.dispatchEvent(Object.assign(new Event('pointerup'),{pointerId:2}));assert.equal(input.sample().fire,false);assert.equal(input.sample().moveX,-.7);
 }finally{stop();}
}));
test('loading clears a pending ADS toggle without restoring it through pointer cancellation',async()=>fixture(async(input,doc,_canvas,win)=>{
 const session=new PointerSession(),stop=listenPointerSession(session,win,doc);
 try{
  input.action('aim',true);input.action('aim',false);
  session.begin('aim',{pointerId:3,clientX:0,clientY:0,currentTarget:{}},cancelled=>cancelled?input.cancelAction('aim'):input.action('aim',false));input.action('aim',true);
  input.setSuspended(true);assert.equal(session.size,0);input.setSuspended(false);
  assert.equal(input.getAimIntent(),false);assert.equal(input.sample().aim,false);
 }finally{stop();}
}));
test('old hold preferences migrate once while a later manual hold survives saving and reload',()=>{
 const migrated=parseStoredSettings(JSON.stringify({escapeAimMode:'hold',sensitivity:1.4,controls:'touch'}));
 assert.equal(migrated.escapeAimMode,'toggle');assert.equal(migrated.escapeAimPreferenceVersion,ESCAPE_AIM_PREFERENCE_VERSION);assert.equal(migrated.sensitivity,1.4);assert.equal(migrated.controls,'touch');
 const manual={...migrated,escapeAimMode:'hold' as const};assert.equal(parseStoredSettings(JSON.stringify(manual)).escapeAimMode,'hold');
 assert.equal(parseStoredSettings(JSON.stringify({...manual,escapeAimMode:'toggle'})).escapeAimMode,'toggle');
});
test('mobile crouch does not implicitly slide and sprint intent stays armed at rest',async()=>fixture(async(input)=>{
 input.action('run');assert.equal(input.getSprintIntent(),true);
 input.action('crouch');const frame=input.sample();assert.equal(frame.crouch,true);assert.equal(frame.actions.has('slide'),false);assert.equal(frame.sprintHeld,true);
 input.action('slide');assert.equal(input.sample().actions.has('slide'),true);
 input.reset();assert.equal(input.getSprintIntent(),false);
}));
test('desktop right mouse ADS is still held even with touch toggle selected',async()=>fixture(async(input,doc,canvas,win)=>{
 doc.pointerLockElement=canvas;input.setEscapeAimMode('toggle');
 win.dispatchEvent(Object.assign(new Event('mousedown'),{button:2}));assert.equal(input.sample().aim,true);
 win.dispatchEvent(Object.assign(new Event('mouseup'),{button:2}));assert.equal(input.sample().aim,false);
}));
test('cancel fire discards its tap without clearing a second pointer move or ADS',async()=>fixture(async(input)=>{
 input.move(-.7,.2);input.action('aim',true);input.action('aim',false);input.action('fire',true);input.cancelAction('fire');
 const frame=input.sample();assert.equal(frame.fire,false);assert.equal(frame.actions.has('fire'),false);assert.equal(frame.aim,true);assert.equal(frame.moveX,-.7);
}));


test('ranking labels real keyboard and touch use without treating touch compatibility mouse as another device',async()=>fixture(async(input,doc,canvas,win)=>{
 await grantLock(input);assert.equal(input.getControlMethod(),null);
 win.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyW',repeat:false}));assert.equal(input.getControlMethod(),'keyboard');
 win.dispatchEvent(Object.assign(new Event('pointerdown'),{pointerType:'touch'}));assert.equal(input.getControlMethod(),'mixed');
 input.resetControlMethod();assert.equal(input.getControlMethod(),null);
 win.dispatchEvent(Object.assign(new Event('pointerdown'),{pointerType:'touch'}));
 const compatibility=Object.assign(new Event('mousedown'),{button:0,sourceCapabilities:{firesTouchEvents:true}});Object.defineProperty(compatibility,'target',{value:canvas});win.dispatchEvent(compatibility);
 assert.equal(input.getControlMethod(),'touch');input.setEnabled(false);win.dispatchEvent(Object.assign(new Event('pointerdown'),{pointerType:'pen'}));assert.equal(input.getControlMethod(),'touch');
 input.setEnabled(true);await grantLock(input);win.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyD',repeat:false}));assert.equal(input.getControlMethod(),'mixed');
}));


test('streaming suspends samples while preserving physically held locked mouse buttons',async()=>fixture(async(input,_doc,_canvas,win)=>{
 await grantLock(input);
 const mouse=(type:string,button:number)=>win.dispatchEvent(Object.assign(new Event(type),{button}));
 mouse('mousedown',0);mouse('mousedown',2);input.action('reload');
 assert.equal(input.sample().fire,true);assert.equal(input.sample().aim,true);
 input.setSuspended(true);
 const blocked=input.sample();assert.equal(blocked.fire,false);assert.equal(blocked.aim,false);assert.equal(blocked.actions.size,0);
 assert.equal(input.getAimIntent(),true,'a physical hold remains an intent, never a simulated action while waiting');
 input.setSuspended(false);
 const resumed=input.sample();assert.equal(resumed.fire,true);assert.equal(resumed.aim,true);assert.equal(resumed.actions.size,0,'resuming does not replay the original press edge');
 mouse('mouseup',0);mouse('mouseup',2);assert.equal(input.sample().fire,false);assert.equal(input.sample().aim,false);
}));

test('mouse presses during structural loading resume only buttons that are still physically held',async()=>fixture(async(input,_doc,_canvas,win)=>{
 await grantLock(input);input.setSuspended(true);
 const mouse=(type:string,button:number)=>win.dispatchEvent(Object.assign(new Event(type),{button}));
 win.dispatchEvent(Object.assign(new Event('mousemove'),{movementX:30,movementY:8}));
 mouse('mousedown',0);mouse('mousedown',2);input.action('reload');input.action('jump');
 const blocked=input.sample();assert.equal(blocked.fire,false);assert.equal(blocked.aim,false);assert.equal(blocked.lookX,0);assert.equal(blocked.actions.size,0);
 mouse('mouseup',0);input.setSuspended(false);
 const resumed=input.sample();assert.equal(resumed.fire,false);assert.equal(resumed.aim,true);assert.equal(resumed.lookX,0);assert.equal(resumed.actions.size,0);
 mouse('mouseup',2);assert.equal(input.getAimIntent(),false);
}));

test('quick mouse taps during loading never become delayed shots or aim toggles',async()=>fixture(async(input,_doc,_canvas,win)=>{
 await grantLock(input);input.setSuspended(true);
 for(const button of [0,2])for(const type of ['mousedown','mouseup'])win.dispatchEvent(Object.assign(new Event(type),{button}));
 input.setSuspended(false);const frame=input.sample();assert.equal(frame.fire,false);assert.equal(frame.aim,false);assert.equal(frame.actions.size,0);
}));

test('touch releases and loading reset remove touch holds without discarding a separate physical ADS hold',async()=>fixture(async(input,_doc,_canvas,win)=>{
 await grantLock(input);input.setEscapeAimMode('hold');input.action('aim',true);input.action('fire',true);
 input.setSuspended(true);input.action('aim',false);input.action('fire',false);
 assert.equal(input.getAimIntent(),false);input.setSuspended(false);assert.equal(input.sample().aim,false);assert.equal(input.sample().fire,false);
 win.dispatchEvent(Object.assign(new Event('mousedown'),{button:2}));input.setSuspended(true);
 input.action('aim',false);input.action('fire',false);assert.equal(input.getAimIntent(),true,'a cancelled touch cannot release the independent mouse button');
 input.setSuspended(false);assert.equal(input.sample().aim,true);win.dispatchEvent(Object.assign(new Event('mouseup'),{button:2}));assert.equal(input.sample().aim,false);
}));

test('a suspended mouse cannot arm combat in photography, story, free cursor, or without its lock',async()=>{
 for(const state of ['photo','story','free','unlocked'] as const)await fixture(async(input,doc,_canvas,win)=>{
  await grantLock(input);
  if(state==='photo')input.setPhotography(true);
  else if(state==='story'){input.setMode('story');await grantLock(input);}
  else if(state==='free')input.setCursorFree(true);
  else doc.exitPointerLock();
  input.setSuspended(true);
  for(const button of [0,2])win.dispatchEvent(Object.assign(new Event('mousedown'),{button}));
  input.setSuspended(false);const frame=input.sample();assert.equal(frame.fire,false,state);assert.equal(frame.aim,false,state);assert.equal(frame.actions.size,0,state);
 });
});

test('pause, lost focus, background, reset, mode switch and photography discard suspended physical holds',async()=>{
 for(const reason of ['disable','blur','hidden','reset','mode','photo','unlock','dispose'] as const)await fixture(async(input,doc,_canvas,win)=>{
  await grantLock(input);input.setSuspended(true);
  for(const button of [0,2])win.dispatchEvent(Object.assign(new Event('mousedown'),{button}));
  assert.equal(input.getAimIntent(),true,reason);
  if(reason==='disable')input.setEnabled(false);
  else if(reason==='blur')win.dispatchEvent(new Event('blur'));
  else if(reason==='hidden'){doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));}
  else if(reason==='reset')input.reset();
  else if(reason==='mode')input.setMode('roam');
  else if(reason==='photo')input.setPhotography(true);
  else if(reason==='unlock')doc.exitPointerLock();
  else input.dispose();
  input.setSuspended(false);const frame=input.sample();assert.equal(frame.fire,false,reason);assert.equal(frame.aim,false,reason);assert.equal(frame.actions.size,0,reason);assert.equal(input.getAimIntent(),false,reason);
 });
});
