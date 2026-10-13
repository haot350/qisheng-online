import {modeCapabilities} from '../src/mode-policy.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {createInput} from '../src/input.ts';
import type {PhotoSystem} from '../src/photography/PhotoSystem.ts';
import {focusWall,photoFixture} from './photo-fixture.ts';

// Execute the real engine's scoped keyboard handlers with controlled game
// dependencies. No browser, renderer initialization or copied hotkey logic.
const source=ts.createSourceFile('engine.ts',readFileSync(new URL('../src/engine.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const handlerNames=['photographyKeys','photographyKeyUp','photographyFocusIn','syncObservationCursor'] as const;
const declarations=new Map<string,string>();
function visit(node:ts.Node){if(ts.isFunctionDeclaration(node)&&node.name&&handlerNames.includes(node.name.text as typeof handlerNames[number]))declarations.set(node.name.text,node.getText(source));ts.forEachChild(node,visit);}
visit(source);for(const name of handlerNames)assert.ok(declarations.has(name),`engine handler ${name} is available`);
const compiled=ts.transpileModule([...declarations.values()].join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
type HotkeyEvent=KeyboardEvent&{stopped:boolean};
function key(code:string,flags:Record<string,unknown>={},tagName='CANVAS'):HotkeyEvent{
 const event=Object.assign(new Event('keydown',{cancelable:true}),{code,repeat:false,altKey:false,ctrlKey:false,metaKey:false,stopped:false,...flags});
 Object.defineProperty(event,'target',{value:{tagName}});Object.defineProperty(event,'stopImmediatePropagation',{value:()=>{event.stopped=true;}});return event as unknown as HotkeyEvent;
}
function focus(tagName:string):FocusEvent{const event=new Event('focusin');Object.defineProperty(event,'target',{value:{tagName}});return event as FocusEvent;}
function hotkeys(photo:PhotoSystem,overrides:{active?:boolean;buffering?:boolean;overlay?:boolean}={}){
 let toggles=0,captures=0;const capture=photo.capture.bind(photo);photo.capture=()=>{captures++;return capture();};
 const bind=new Function('phaseActive','buffering','storyOverlayOpen','photo','mode','togglePhoto','info','modeCapabilities',`${compiled}\nreturn {down:photographyKeys,up:photographyKeyUp,focus:photographyFocusIn};`);
 const handlers=bind(()=>overrides.active!==false,!!overrides.buffering,!!overrides.overlay,photo,'story',()=>{toggles++;return Promise.resolve();},()=>{},modeCapabilities) as {down:(event:KeyboardEvent)=>void;up:(event:KeyboardEvent)=>void;focus:(event:FocusEvent)=>void};
 return{...handlers,toggles:()=>toggles,captures:()=>captures};
}

class Canvas extends EventTarget{focus(){(globalThis.document as unknown as {activeElement:unknown}).activeElement=this;}}
class InputDocument extends EventTarget{pointerLockElement:unknown=null;activeElement:unknown=null;hidden=false;documentElement={dataset:{}};exitPointerLock(){this.pointerLockElement=null;this.dispatchEvent(new Event('pointerlockchange'));}}
async function withInput(run:(input:ReturnType<typeof createInput>,doc:InputDocument,win:EventTarget)=>void|Promise<void>){
 const doc=new InputDocument(),win=new EventTarget(),canvas=new Canvas(),globals={document:doc,window:win,navigator:{maxTouchPoints:0},matchMedia:()=>({matches:false})};
 const descriptors=new Map(Object.keys(globals).map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));for(const[name,value]of Object.entries(globals))Object.defineProperty(globalThis,name,{configurable:true,value});
 const input=createInput(canvas as unknown as HTMLCanvasElement,()=>{});input.setMode('story');
 // The desktop viewfinder inherits an already locked walking camera. Opening
 // it no longer changes ownership to the former right-drag scheme.
 doc.pointerLockElement=canvas;doc.dispatchEvent(new Event('pointerlockchange'));input.setPhotography(true);
 try{await run(input,doc,win);}finally{input.dispose();for(const[name,descriptor]of descriptors){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}}
}

test('engine Space captures once from the locked canvas without adding a jump',()=>withInput((input,_doc,win)=>{
 const{scene}=focusWall(),f=photoFixture({},scene),keys=hotkeys(f.photo);
 try{
  win.dispatchEvent(key('KeyW'));keys.down(key('KeyF'));f.advance(.2);
  const space=key('Space');keys.down(space);if(!space.stopped)win.dispatchEvent(space);
  keys.down(key('Space',{repeat:true}));assert.equal(keys.captures(),1);assert.equal(space.defaultPrevented,true);assert.equal(space.stopped,true);assert.equal(keys.toggles(),0);
  const frame=input.sample();assert.equal(frame.moveY,1);assert.equal(frame.actions.has('jump'),false);
 }finally{f.dispose();}
}));

test('camera UI buttons retain native Space activation and do not trigger global photography shortcuts',()=>withInput((input,doc,win)=>{
 const{scene}=focusWall(),f=photoFixture({},scene),keys=hotkeys(f.photo);
 try{
  input.freePointerLock();
  for(const tag of ['BUTTON','SUMMARY','A','INPUT','SELECT','TEXTAREA']){
   doc.activeElement={tagName:tag};
   for(const code of ['Space','KeyF','KeyC']){const event=key(code,{},tag);keys.down(event);if(!event.stopped)win.dispatchEvent(event);assert.equal(event.defaultPrevented,false,tag+' '+code);assert.equal(event.stopped,false);}
  }
  f.advance(.25);assert.equal(keys.captures(),0);assert.equal(keys.toggles(),0);assert.equal(f.photo.snapshot().focusState,'idle');assert.equal(input.sample().actions.has('jump'),false);
 }finally{f.dispose();}
}));

test('C and F ignore auto-repeat; F release is accepted even when it occurs over an editable control',()=>{
 const{scene}=focusWall();let acquired=0;const f=photoFixture({onFocusAcquired:()=>acquired++},scene),keys=hotkeys(f.photo);
 try{
  keys.down(key('KeyC'));keys.down(key('KeyC',{repeat:true}));assert.equal(keys.toggles(),1);
  keys.down(key('KeyF'));keys.down(key('KeyF',{repeat:true}));f.advance(.05);const distance=f.photo.snapshot().focusDistance;keys.up(key('KeyF',{},'INPUT'));f.advance(.3);
  assert.equal(f.photo.snapshot().focusDistance,distance);assert.equal(f.photo.snapshot().focusState,'idle');assert.equal(acquired,0);
 }finally{f.dispose();}
});

test('browser shortcuts release only keyboard AF ownership while an independent focus finger remains held',()=>{
 for(const shortcut of [key('Tab'),key('AltLeft',{altKey:true}),key('KeyF',{altKey:true}),key('KeyL',{ctrlKey:true}),key('MetaLeft',{metaKey:true})]){
  const{scene}=focusWall();let acquired=0;const f=photoFixture({onFocusAcquired:()=>acquired++},scene),keys=hotkeys(f.photo);
  try{
   keys.down(key('KeyF'));f.advance(.05);keys.down(shortcut);const stopped=f.photo.snapshot().focusDistance;f.advance(.3);assert.equal(f.photo.snapshot().focusDistance,stopped);assert.equal(acquired,0);
   keys.down(key('KeyF'));f.photo.setFocusHeld('pointer:7',true);f.advance(.05);keys.down(shortcut);f.advance(.2);assert.equal(acquired,1,'shortcut must not release the independent pointer owner');f.photo.setFocusHeld('pointer:7',false);
  }finally{f.dispose();}
 }
});

test('ordinary button focus preserves held walking and AF; editable focus releases physical keyboard owners',()=>withInput((input,doc,win)=>{
 const{scene}=focusWall();let acquired=0;const f=photoFixture({onFocusAcquired:()=>acquired++},scene),keys=hotkeys(f.photo);
 try{
  win.dispatchEvent(key('KeyW'));keys.down(key('KeyF'));f.advance(.05);doc.activeElement={tagName:'BUTTON'};const button=focus('BUTTON');keys.focus(button);win.dispatchEvent(button);f.advance(.15);assert.equal(input.sample().moveY,1);assert.equal(acquired,1);
  keys.up(key('KeyF'));keys.down(key('KeyF'));f.advance(.05);const distance=f.photo.snapshot().focusDistance;doc.activeElement={tagName:'INPUT'};const editor=focus('INPUT');keys.focus(editor);win.dispatchEvent(editor);f.advance(.3);assert.equal(input.sample().moveY,0);assert.equal(f.photo.snapshot().focusDistance,distance);assert.equal(acquired,1);
 }finally{f.dispose();}
}));

test('real engine cursor synchronization frees dialogue ownership but preserves an explicit Tab until a user resumes observation',()=>withInput((input,doc,win)=>{
 const bind=new Function('input',`${compiled}\nlet active=true,mode='story',cursorBlocked,storyOverlayOpen=false,escapeMapOpen=false,photoOpen=true;const story={snapshot:{introActive:false,cinematicActive:false,screeningActive:false,dialogue:null,options:[],finished:false}},photo={snapshot:()=>({open:photoOpen})};const phaseActive=()=>active;return {sync:syncObservationCursor,change:(value)=>{Object.assign(story.snapshot,value.snapshot??{});if('active'in value)active=value.active;if('overlay'in value)storyOverlayOpen=value.overlay;if('photo'in value)photoOpen=value.photo;}};`);
 const engine=bind(input) as {sync:()=>void;change:(value:Record<string,unknown>)=>void};
 engine.sync();assert.equal(input.isLocked(),true);win.dispatchEvent(key('Tab'));assert.equal(input.isCursorFree(),true);assert.equal(input.isLocked(),false);
 for(let frame=0;frame<30;frame++)engine.sync();assert.equal(input.isCursorFree(),true,'ordinary engine publishes must not recapture a Tab cursor');
 engine.change({photo:false,snapshot:{dialogue:{speaker:'林岑',text:'我们走吧。'}}});engine.sync();assert.equal(input.isCursorFree(),true);assert.equal(doc.pointerLockElement,null);
 engine.change({snapshot:{dialogue:null}});engine.sync();assert.equal(input.isCursorFree(),false);assert.equal(input.isLocked(),false,'the end of automatic dialogue cannot lock outside a user gesture');
 input.setPhotography(false);engine.change({overlay:true});engine.sync();assert.equal(input.isCursorFree(),true);engine.change({overlay:false});engine.sync();assert.equal(input.isCursorFree(),false);
 engine.change({active:false});engine.sync();assert.equal(input.isCursorFree(),true,'a real pause always returns the cursor');
}));

test('overlay, streaming and pause gates prevent photography hotkeys and cannot re-arm cancelled AF from an orphan repeat',()=>{
 for(const gate of [{overlay:true},{buffering:true},{active:false}]){
  const{scene}=focusWall();let acquired=0;const f=photoFixture({onFocusAcquired:()=>acquired++},scene),keys=hotkeys(f.photo,gate);
  try{for(const code of ['KeyF','Space','KeyC'])keys.down(key(code));f.advance(.25);assert.equal(acquired,0);assert.equal(keys.captures(),0);assert.equal(keys.toggles(),0);}finally{f.dispose();}
 }
 const{scene}=focusWall();let acquired=0;const f=photoFixture({onFocusAcquired:()=>acquired++},scene),keys=hotkeys(f.photo);
 try{keys.down(key('KeyF'));f.advance(.05);f.photo.pause();f.photo.resume();keys.down(key('KeyF',{repeat:true}));f.advance(.3);assert.equal(acquired,0);assert.equal(f.photo.snapshot().focusState,'idle');keys.down(key('KeyF'));f.advance(.2);assert.equal(acquired,1);}finally{f.dispose();}
});
