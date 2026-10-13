import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {INPUT_RESET_EVENT,PointerSession,listenPointerSession} from '../src/pointer-owner.ts';
import {createShutterPointerHandlers,createCompositionPointerHandlers,createFocusPointerHandlers,createMovementPointerHandlers} from '../src/photography/pointer-controls.ts';

function fixture(captureFails=false){
 const session=new PointerSession(),win=Object.assign(new EventTarget(),{innerWidth:844,innerHeight:390}),doc=Object.assign(new EventTarget(),{hidden:false});
 const off=listenPointerSession(session,win,doc),held=new Set<string>(),focusCalls:[string,boolean][]=[],points:number[][]=[],looks:number[][]=[],axes:number[][]=[];
 let shots=0,active:number|null=null,blocked=false,locked=false;
 const target=(left=0,top=0,width=100,height=100)=>{const captured=new Set<number>();return{captured,setPointerCapture:(id:number)=>{if(captureFails)throw new DOMException('No active pointer','NotFoundError');captured.add(id);},hasPointerCapture:(id:number)=>captured.has(id),releasePointerCapture:(id:number)=>captured.delete(id),getBoundingClientRect:()=>({left,top,width,height})};};
 const shutterTarget=target(200,100,60,60),focusTarget=target(130,100,60,60),compositionTarget=target(0,0,200,100),moveTarget=target(0,100,100,80);
 const pointer=(pointerId:number,currentTarget:ReturnType<typeof target>,clientX:number,clientY:number,pointerType='touch')=>({pointerId,currentTarget,clientX,clientY,pointerType,buttons:1,button:0,preventDefault:()=>{}});
 const event=(name:string,data:Record<string,unknown>={},surface:EventTarget=win)=>{const e=Object.assign(new Event(name),data);surface.dispatchEvent(e);};
 const shutter=createShutterPointerHandlers(session,()=>shots++,()=>!blocked),focus=createFocusPointerHandlers(session,(source,value)=>{focusCalls.push([source,value]);if(value)held.add(source);else held.delete(source);},()=>!blocked),composition=createCompositionPointerHandlers(session,{locked:()=>locked,blocked:()=>blocked,focus:(x,y)=>points.push([x,y]),look:(x,y)=>looks.push([x,y]),observe:()=>{assert.equal(compositionTarget.captured.size,0);locked=true;}}),movement=createMovementPointerHandlers(session,{enabled:()=>!blocked,active:id=>{active=id;},move:(x,y)=>axes.push([x,y])});
 const startAll=()=>{shutter.onPointerDown(pointer(1,shutterTarget,230,130));focus.onPointerDown(pointer(2,focusTarget,160,130));composition.onPointerDown(pointer(3,compositionTarget,100,50));movement.onPointerDown(pointer(4,moveTarget,85,140));};
 return{session,win,doc,off,pointer,event,shutter,focus,composition,movement,shutterTarget,focusTarget,compositionTarget,moveTarget,startAll,held,focusCalls,points,looks,axes,shots:()=>shots,active:()=>active,setBlocked:(value:boolean)=>{blocked=value;session.setEnabled(!value);}};
}

test('all four production photo controls use the shared pointer session without direct capture calls in PhotoUI',()=>{
 const source=readFileSync(new URL('../src/PhotoUI.tsx',import.meta.url),'utf8');
 assert.equal(source.includes('.setPointerCapture('),false);assert.ok(source.includes('usePointerSession(!inputBlocked)'));
 for(const factory of ['createShutterPointerHandlers','createCompositionPointerHandlers','createFocusPointerHandlers','createMovementPointerHandlers'])assert.ok(source.includes(factory+'(pointers,'));
});

test('four simultaneous fingers own independent actions; cancelling observation does not release AF or movement',()=>{
 const f=fixture();try{
  f.startAll();assert.equal(f.session.size,4);assert.deepEqual([...f.held],['pointer:2']);assert.ok(f.axes.at(-1)![0]>.5);
  f.event('pointercancel',{pointerId:3});assert.equal(f.session.size,3);assert.deepEqual([...f.held],['pointer:2']);assert.equal(f.active(),4);assert.equal(f.points.length,0);
  f.event('pointerup',{pointerId:1,clientX:280,clientY:130});assert.equal(f.shots(),0);assert.equal(f.active(),4);
  f.event('pointerup',{pointerId:2,clientX:160,clientY:130});assert.equal(f.held.size,0);assert.equal(f.active(),4);
  f.event('pointerup',{pointerId:4,clientX:90,clientY:140});assert.equal(f.active(),null);assert.deepEqual(f.axes.at(-1),[0,0]);assert.equal(f.session.size,0);
 }finally{f.off();}
});

test('failed native capture keeps global fallback ownership, checks actual release bounds and permits the next gesture',()=>{
 const f=fixture(true);try{
  assert.doesNotThrow(f.startAll);assert.equal(f.session.size,4);
  f.event('pointermove',{pointerId:3,pointerType:'touch',clientX:120,clientY:60});assert.deepEqual(f.looks,[[20,10]]);
  f.event('pointermove',{pointerId:4,pointerType:'touch',clientX:15,clientY:140});assert.ok(f.axes.at(-1)![0]<-.5);
  f.event('pointerup',{pointerId:1,clientX:280,clientY:130});assert.equal(f.shots(),0);f.shutter.onClick({detail:1,preventDefault:()=>{}});assert.equal(f.shots(),0);
  f.shutter.onPointerDown(f.pointer(5,f.shutterTarget,230,130));f.event('pointerup',{pointerId:5,clientX:230,clientY:130});assert.equal(f.shots(),1);f.shutter.onClick({detail:1,preventDefault:()=>{}});assert.equal(f.shots(),1);
  f.event('pointerup',{pointerId:2,clientX:500,clientY:500});f.event('pointerup',{pointerId:3,clientX:500,clientY:500});f.event('pointerup',{pointerId:4,clientX:500,clientY:500});assert.equal(f.session.size,0);assert.equal(f.held.size,0);assert.deepEqual(f.axes.at(-1),[0,0]);assert.equal(f.points.length,0);
 }finally{f.off();}
});

test('global pointer up, cancel and lost capture release each AF owner once even when target handlers also run',()=>{
 for(const terminal of ['pointerup','pointercancel','lostpointercapture']){
  const f=fixture();try{const down=f.pointer(2,f.focusTarget,160,130);f.focus.onPointerDown(down);f.event(terminal,{pointerId:2,clientX:400,clientY:400});f.focus.onPointerUp(down);f.focus.onPointerCancel(down);assert.deepEqual(f.focusCalls,[['pointer:2',true],['pointer:2',false]]);assert.equal(f.session.size,0);}finally{f.off();}
 }
});

test('background, pagehide, orientation, portrait resize, reset and unmount cancel all four gestures without shots or point selection',()=>{
 for(const reset of ['blur','pagehide','orientationchange','portrait','hidden','reset','unmount']){
  const f=fixture();try{f.startAll();if(reset==='portrait'){f.win.innerHeight=900;f.event('resize');}else if(reset==='hidden'){f.doc.hidden=true;f.event('visibilitychange',{},f.doc);}else if(reset==='reset')f.event(INPUT_RESET_EVENT,{},f.doc);else if(reset==='unmount')f.off();else f.event(reset);
   assert.equal(f.session.size,0,reset);assert.equal(f.held.size,0,reset);assert.equal(f.active(),null,reset);assert.deepEqual(f.axes.at(-1),[0,0],reset);assert.equal(f.shots(),0,reset);assert.equal(f.points.length,0,reset);
   f.shutter.onPointerUp(f.pointer(1,f.shutterTarget,230,130));f.shutter.onClick({detail:1,preventDefault:()=>{}});assert.equal(f.shots(),0,'cancelled compatibility click '+reset);
  }finally{f.off();}
 }
});

test('closing a control layer cancels an old shutter and a new touch can shoot once after reopening',()=>{
 const f=fixture();try{f.startAll();f.setBlocked(true);assert.equal(f.session.size,0);f.setBlocked(false);f.shutter.onPointerUp(f.pointer(1,f.shutterTarget,230,130));assert.equal(f.shots(),0);f.shutter.onPointerDown(f.pointer(8,f.shutterTarget,230,130));f.event('pointerup',{pointerId:8,clientX:230,clientY:130});assert.equal(f.shots(),1);}finally{f.off();}
});

test('a free mouse point selects once only inside the frame, while cancelled or outside releases do not request observation',()=>{
 for(const outside of [false,true]){const f=fixture(true);try{f.composition.onPointerDown(f.pointer(3,f.compositionTarget,100,50,'mouse'));f.event('pointerup',{pointerId:3,clientX:outside?250:103,clientY:50});assert.equal(f.points.length,outside?0:1);f.event('pointerup',{pointerId:3,clientX:103,clientY:50});assert.equal(f.points.length,outside?0:1);}finally{f.off();}}
});

test('focus button keyboard holds support Space and Enter without stealing an independent finger or repeating acquisition',()=>{
 const f=fixture();try{f.focus.onPointerDown(f.pointer(2,f.focusTarget,160,130));const key=(code:string,repeat=false)=>({code,repeat,preventDefault:()=>{}});f.focus.onKeyDown(key('Space'));f.focus.onKeyDown(key('Space',true));assert.deepEqual([...f.held],['pointer:2','button:Space']);assert.equal(f.focusCalls.filter(([source,held])=>source==='button:Space'&&held).length,1);f.focus.onKeyUp(key('Space'));assert.deepEqual([...f.held],['pointer:2']);f.focus.onKeyDown(key('Enter'));f.focus.onBlur();assert.deepEqual([...f.held],['pointer:2']);f.focus.cancel();assert.equal(f.held.size,0);assert.equal(f.session.size,0);}finally{f.off();}
});
