import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {PointerSession} from '../src/pointer-owner.ts';
import {createCompositionPointerHandlers as createHandlers} from '../src/photography/pointer-controls.ts';

// Run the actual component handlers and effects without a browser, pointer-lock
// provider or GPU. Native lock acquisition remains part of root's browser QA.
const source=readFileSync(new URL('../src/PhotoUI.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('PhotoUI.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const component=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='PhotoUI');
assert.ok(component);
const compile=(text:string)=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
type Pointer={pointerId:number;pointerType:string;button:number;clientX:number;clientY:number;preventDefault:()=>void;currentTarget:ReturnType<typeof fixture>['surface']};

function fixture(){
 let locked=false,blocked=false;const calls:{type:string;point?:number[]}[]=[],captured=new Set<number>(),released:number[]=[];
 const surface={setPointerCapture:(id:number)=>captured.add(id),hasPointerCapture:(id:number)=>captured.has(id),releasePointerCapture:(id:number)=>{captured.delete(id);released.push(id);},getBoundingClientRect:()=>({left:10,top:20,width:200,height:100})};
 const session=new PointerSession(),production=createHandlers(session,{locked:()=>locked,blocked:()=>blocked,focus:(x,y)=>calls.push({type:'focus',point:[x,y]}),look:(x,y)=>calls.push({type:'look',point:[x,y]}),observe:()=>{assert.equal(captured.size,0,'pointer capture ends before native pointer lock is requested');calls.push({type:'observe'});}});
 const handlers={...production,onPointerMove:(event:Pointer)=>session.move(event)};
 const pointer=(id=1,type='mouse',x=110,y=70,button=0):Pointer=>({pointerId:id,pointerType:type,button,clientX:x,clientY:y,preventDefault:()=>{},currentTarget:surface});
 return{handlers,pointer,surface,calls,captured,released,setLocked:(value:boolean)=>locked=value,setBlocked:(value:boolean)=>blocked=value};
}
function effectContaining(text:string){
 const found:string[]=[];
 const visit=(n:ts.Node)=>{if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast).includes(text))found.push(n.arguments[0].getText(ast));ts.forEachChild(n,visit);};
 visit(component!);assert.equal(found.length,1);return found[0];
}
const lockEffect=effectContaining("document.addEventListener('pointerlockchange'");
const keyboardEffect=effectContaining("window.addEventListener('keydown'");
class DOMTarget extends EventTarget{
 override addEventListener(type:string,listener:EventListenerOrEventListenerObject|null,options?:boolean|AddEventListenerOptions){super.addEventListener(type,listener,typeof options==='boolean'?{capture:options}:options);}
 override removeEventListener(type:string,listener:EventListenerOrEventListenerObject|null,options?:boolean|EventListenerOptions){super.removeEventListener(type,listener,typeof options==='boolean'?{capture:options}:options);}
}
function install(effect:string,scope:Record<string,unknown>){return new Function(...Object.keys(scope),compile(`const effect=${effect};return effect();`))(...Object.values(scope)) as ()=>void;}

test('the composition spreads the real tested handlers and keeps desktop cursor callbacks',()=>{
 let composition:ts.JsxOpeningElement|undefined;
 const visit=(n:ts.Node)=>{if(ts.isJsxOpeningElement(n)&&n.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(ast)==='ref'&&p.initializer?.getText(ast)==='{compositionRef}'))composition=n;ts.forEachChild(n,visit);};visit(component!);
 assert.ok(composition);assert.ok(composition.attributes.properties.some(p=>ts.isJsxSpreadAttribute(p)&&p.expression.getText(ast)==='compositionHandlers.current'));
 assert.match(source,/onObserve\?:\(\)=>void/);assert.match(source,/onCursorRelease\?:\(\)=>void/);
 assert.match(source,/!touch&&onCursorRelease&&<button onClick=\{onCursorRelease\} title="Tab 操作界面">操作界面/);
 assert.match(source,/移动鼠标观察 · F 对焦 · 空格拍照/);assert.match(source,/点击画面继续观察/);assert.match(source,/setTimeout\(\(\)=>setShowHint\(false\),7000\)/,'the initial keyboard reminder is short-lived; Tab remains on its button and parameter help');
});

test('free mouse click selects its exact focus point then requests observation once',()=>{
 const f=fixture(),e=f.pointer(1,'mouse',160,45);f.handlers.onPointerDown(e);f.handlers.onPointerUp(e);f.handlers.onPointerUp(e);
 assert.deepEqual(f.calls,[{type:'focus',point:[.5,.5]},{type:'observe'}]);assert.deepEqual(f.released,[1]);
});

test('locked mouse gestures never double the input-system observation or change focus',()=>{
 const f=fixture();f.setLocked(true);f.handlers.onPointerDown(f.pointer());f.handlers.onPointerMove(f.pointer(1,'mouse',140,90));f.handlers.onPointerUp(f.pointer());
 assert.deepEqual(f.calls,[]);assert.equal(f.captured.size,0);
});

test('a lock or an overlay appearing during a free mouse gesture cancels its pending focus',()=>{
 for(const change of ['setLocked','setBlocked'] as const)for(const event of ['onPointerMove','onPointerUp'] as const){const f=fixture();f.handlers.onPointerDown(f.pointer());f[change](true);f.handlers[event](f.pointer());f.handlers.onPointerUp(f.pointer());assert.deepEqual(f.calls,[],`${change} ${event}`);assert.equal(f.captured.size,0);}
});

test('free mouse dragging and right clicking do not start camera observation',()=>{
 const f=fixture();f.handlers.onPointerDown(f.pointer(1,'mouse',110,70,2));f.handlers.onPointerUp(f.pointer(1,'mouse',110,70,2));assert.equal(f.captured.size,0);
 f.handlers.onPointerDown(f.pointer());f.handlers.onPointerMove(f.pointer(1,'mouse',160,90));f.handlers.onPointerUp(f.pointer(1,'mouse',160,90));assert.deepEqual(f.calls,[]);
});

test('touch and pen keep drag observation and point selection without requesting mouse lock',()=>{
 for(const type of ['touch','pen']){const f=fixture();f.handlers.onPointerDown(f.pointer(1,type));f.handlers.onPointerMove(f.pointer(1,type,122,76));f.handlers.onPointerUp(f.pointer(1,type,122,76));assert.deepEqual(f.calls,[{type:'look',point:[12,6]}]);f.calls.length=0;f.handlers.onPointerDown(f.pointer(2,type,160,45));f.handlers.onPointerUp(f.pointer(2,type,160,45));assert.deepEqual(f.calls,[{type:'focus',point:[.5,.5]}]);}
});

test('cancel, lost capture and unrelated contacts cannot select or resume a cancelled gesture',()=>{
 for(const release of ['onPointerCancel','onLostPointerCapture'] as const){const f=fixture();f.handlers.onPointerDown(f.pointer(1,'touch'));f.handlers.onPointerDown(f.pointer(2,'touch'));f.handlers[release](f.pointer(2,'touch'));f.handlers.onPointerUp(f.pointer(2,'touch'));assert.deepEqual(f.calls,[]);f.handlers[release](f.pointer(1,'touch'));f.handlers.onPointerUp(f.pointer(1,'touch'));assert.deepEqual(f.calls,[]);}
 const f=fixture();f.setBlocked(true);f.handlers.onPointerDown(f.pointer());f.handlers.onPointerUp(f.pointer());assert.deepEqual(f.calls,[]);assert.equal(f.captured.size,0);
});

test('pointer-lock state updates the tiny hint and its listener is removed on unmount',()=>{
 const document=Object.assign(new DOMTarget(),{pointerLockElement:null as object|null}),states:boolean[]=[];
 const cleanup=install(lockEffect,{document,setObserving:(state:boolean)=>states.push(state)});assert.deepEqual(states,[false]);
 document.pointerLockElement={};document.dispatchEvent(new Event('pointerlockchange'));document.pointerLockElement=null;document.dispatchEvent(new Event('pointerlockchange'));assert.deepEqual(states,[false,true,false]);
 cleanup();document.pointerLockElement={};document.dispatchEvent(new Event('pointerlockchange'));assert.deepEqual(states,[false,true,false]);
});

test('locked Escape falls through without cancelling exposure, hiding settings or lowering camera',()=>{
 for(const flags of [{},{busy:true},{panel:true}]){const window=new DOMTarget(),document={pointerLockElement:{}},calls:string[]=[];
  const cleanup=install(keyboardEffect,{window,document,keyboardBlocked:false,album:false,panel:false,busy:false,...flags,setAlbum:()=>calls.push('album'),setPanel:()=>calls.push('panel'),system:{cancel:()=>calls.push('cancel')},onClose:()=>calls.push('close')});
  window.addEventListener('keydown',()=>calls.push('native'));const escape=Object.assign(new Event('keydown',{cancelable:true}),{code:'Escape'});window.dispatchEvent(escape);assert.equal(escape.defaultPrevented,false);assert.deepEqual(calls,['native']);cleanup();
 }
});

test('free Escape still owns one camera layer and removes its capture listener',()=>{
 for(const [flags,expected] of [[{},'close'],[{busy:true},'cancel'],[{panel:true},'panel']] as const){const window=new DOMTarget(),calls:string[]=[];
  const cleanup=install(keyboardEffect,{window,document:{pointerLockElement:null},keyboardBlocked:false,album:false,panel:false,busy:false,...flags,setAlbum:()=>calls.push('album'),setPanel:()=>calls.push('panel'),system:{cancel:()=>calls.push('cancel')},onClose:()=>calls.push('close')});window.addEventListener('keydown',()=>calls.push('native'));
  const escape=Object.assign(new Event('keydown',{cancelable:true}),{code:'Escape'});window.dispatchEvent(escape);assert.equal(escape.defaultPrevented,true);assert.deepEqual(calls,[expected]);cleanup();window.dispatchEvent(Object.assign(new Event('keydown'),{code:'Escape'}));assert.deepEqual(calls,[expected,'native']);
 }
});
