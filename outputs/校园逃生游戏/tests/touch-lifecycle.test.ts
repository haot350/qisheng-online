import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {INPUT_RESET_EVENT,listenPointerSession,PointerSession} from '../src/pointer-owner.ts';
import {createInput} from '../src/input.ts';

const event=(type:string,pointerId:number,extra={})=>Object.assign(new Event(type),{pointerId,clientX:0,clientY:0,pointerType:'touch',...extra});
const press=(pointerId:number,target={setPointerCapture(_id:number){}})=>({pointerId,clientX:0,clientY:0,currentTarget:target});
function surfaces(){return {win:Object.assign(new EventTarget(),{innerWidth:844,innerHeight:390}),doc:Object.assign(new EventTarget(),{hidden:false})};}

test('uncaptured move/up and document cancel release only the finger that owns an operation',()=>{
  const {win,doc}=surfaces(),pointers=new PointerSession(),detach=listenPointerSession(pointers,win,doc);
  const state={steer:1,throttle:1,look:true};
  pointers.begin('steer',press(1),()=>{state.steer=0;},e=>{state.steer=e.clientX;});
  pointers.begin('throttle',press(2),()=>{state.throttle=0;});
  pointers.begin('look',press(3),()=>{state.look=false;});
  win.dispatchEvent(event('pointermove',1,{clientX:.4}));assert.equal(state.steer,.4);
  doc.dispatchEvent(event('pointercancel',3));assert.deepEqual(state,{steer:.4,throttle:1,look:false});
  win.dispatchEvent(event('pointerup',2));assert.deepEqual(state,{steer:.4,throttle:0,look:false});
  win.dispatchEvent(event('pointerup',1));assert.equal(pointers.size,0);assert.equal(state.steer,0);
  detach();
});

test('capture rejection falls back to global move/release and permits a fresh press',()=>{
  const {win,doc}=surfaces(),pointers=new PointerSession(),detach=listenPointerSession(pointers,win,doc);
  let held=false,moved=0,cancelled:boolean|undefined;
  const target={setPointerCapture(){throw new Error('capture rejected');},releasePointerCapture(){throw new Error('no capture');}};
  assert.equal(pointers.begin('steer',press(7,target),c=>{held=false;cancelled=c;},()=>{moved++;}),true);held=true;
  win.dispatchEvent(event('pointermove',7));assert.equal(moved,1);
  doc.dispatchEvent(event('pointerup',7));assert.equal(held,false);assert.equal(cancelled,false);assert.equal(pointers.size,0);
  assert.equal(pointers.begin('steer',press(8,target),()=>{}),true);detach();assert.equal(pointers.size,0);
});

test('duplicate releases and synchronous lost capture are idempotent',()=>{
  const {win,doc}=surfaces(),pointers=new PointerSession(),detach=listenPointerSession(pointers,win,doc);let releases=0;
  const target={setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(id:number){win.dispatchEvent(event('lostpointercapture',id));}};
  pointers.begin('fire',press(4,target),()=>{releases++;});
  assert.equal(pointers.begin('fire',press(5),()=>{releases++;}),false,'another finger cannot steal the same control');
  assert.equal(pointers.begin('move',press(4),()=>{releases++;}),false,'one finger cannot own two controls');
  win.dispatchEvent(event('pointerup',4));doc.dispatchEvent(event('pointerup',4));win.dispatchEvent(event('lostpointercapture',4));
  assert.equal(releases,1);assert.equal(pointers.size,0);detach();
});

test('loading disable, background, blur, page hide, portrait and orientation cancel all owners',()=>{
  for(const reason of ['loading','hidden','blur','pagehide','portrait','orientation','reset'] as const){
    const {win,doc}=surfaces(),pointers=new PointerSession(),detach=listenPointerSession(pointers,win,doc);let releases=0;
    for(const [key,id] of [['steer',1],['throttle',2],['look',3]] as const)pointers.begin(key,press(id),cancelled=>{assert.equal(cancelled,true);releases++;});
    if(reason==='loading'){pointers.setEnabled(false);assert.equal(pointers.begin('fire',press(9),()=>{}),false);}
    else if(reason==='hidden'){doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));}
    else if(reason==='portrait'){win.innerWidth=390;win.innerHeight=844;win.dispatchEvent(new Event('resize'));}
    else if(reason==='orientation')win.dispatchEvent(new Event('orientationchange'));
    else if(reason==='reset')doc.dispatchEvent(new Event(INPUT_RESET_EVENT));
    else win.dispatchEvent(new Event(reason));
    assert.equal(pointers.size,0,reason);assert.equal(releases,3,reason);
    pointers.setEnabled(true);assert.equal(pointers.begin('steer',press(10),()=>{}),true,reason);detach();
  }
});

test('ordinary landscape address-bar resizing does not cancel a valid held touch',()=>{
  const {win,doc}=surfaces(),pointers=new PointerSession(),detach=listenPointerSession(pointers,win,doc);
  pointers.begin('throttle',press(2),()=>{});win.innerHeight=340;win.dispatchEvent(new Event('resize'));assert.equal(pointers.size,1);detach();
});

test('unmount cancels owned inputs and removes every installed fallback listener',()=>{
  const {win,doc}=surfaces(),pointers=new PointerSession(),detach=listenPointerSession(pointers,win,doc);let released=0;
  pointers.begin('throttle',press(2),()=>{released++;});detach();detach();assert.equal(released,1);
  for(const target of [win,doc])for(const name of ['pointermove','pointerup','pointercancel','lostpointercapture','blur','pagehide','orientationchange','resize','visibilitychange',INPUT_RESET_EVENT])assert.equal(getEventListeners(target,name).length,0,name);
  pointers.begin('throttle',press(3),()=>{released++;});win.dispatchEvent(event('pointerup',3));assert.equal(released,1,'detached listeners cannot affect a later control session');
});

test('missing mouse-up is recovered by a zero-button mouse move without releasing a touch pedal',()=>{
  const {win,doc}=surfaces(),pointers=new PointerSession(),detach=listenPointerSession(pointers,win,doc);let mouseHeld=true,touchHeld=true;
  pointers.begin('handbrake',press(1),()=>{mouseHeld=false;});pointers.begin('throttle',press(2),()=>{touchHeld=false;});
  win.dispatchEvent(event('pointermove',1,{pointerType:'mouse',buttons:0}));assert.equal(mouseHeld,false);assert.equal(touchHeld,true);detach();
});

test('engine reset, suspension and disposal synchronize live UI owners and clear stale driving input',()=>{
  const {win,doc}=surfaces(),canvas=new EventTarget() as EventTarget&{focus:()=>void},pointers=new PointerSession();
  Object.assign(doc,{activeElement:canvas,pointerLockElement:null,documentElement:{dataset:{}},exitPointerLock(){}});canvas.focus=()=>{};
  const globals={document:doc,window:win,navigator:{maxTouchPoints:0},matchMedia:()=>({matches:false})};
  const descriptors=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,value});
  const input=createInput(canvas as unknown as HTMLCanvasElement,()=>{}),detach=listenPointerSession(pointers,win,doc);
  try{
    input.setMode('dafei');
    const down=()=>{pointers.begin('steer',press(1),()=>input.drive({steer:0}));pointers.begin('throttle',press(2),()=>input.drive({throttle:0}));input.drive({steer:.8,throttle:1,handbrake:true});input.holdLook(true);};
    down();input.reset();assert.equal(pointers.size,0);assert.deepEqual(input.sample().drive,{steer:0,throttle:0,brake:0,handbrake:false,reverse:false,boost:false,reset:false});
    down();input.setSuspended(true);assert.equal(pointers.size,0);input.drive({steer:1,throttle:1});input.holdLook(true);input.setSuspended(false);
    const frame=input.sample();assert.equal(frame.drive?.throttle,0);assert.equal(frame.drive?.steer,0);assert.equal(frame.lookHeld,false);
    down();win.dispatchEvent(new Event('blur'));assert.equal(pointers.size,0);assert.equal(input.sample().drive?.throttle,0);
    assert.equal(getEventListeners(win,'pointerdown').length,1);input.dispose();assert.equal(getEventListeners(win,'pointerdown').length,0);
  }finally{detach();input.dispose();for(const [key,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
});
