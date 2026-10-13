import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {PointerSession} from '../src/pointer-owner.ts';
import {createShutterPointerHandlers as createHandlers} from '../src/photography/pointer-controls.ts';

// Execute the exact production handler factory, without a browser/GPU or a
// duplicate implementation. The wiring test verifies PhotoUI uses this factory.
const source=readFileSync(new URL('../src/PhotoUI.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('PhotoUI.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
type Pointer={pointerId:number;pointerType:string;isPrimary:boolean;clientX:number;clientY:number;preventDefault:()=>void;currentTarget:ReturnType<typeof fixture>['button']};
type Click={detail:number;preventDefault:()=>void};

function fixture(){
 let captures=0,enabled=true,prevented=0;const captured=new Set<number>(),released:number[]=[];
 const button={setPointerCapture:(id:number)=>captured.add(id),hasPointerCapture:(id:number)=>captured.has(id),releasePointerCapture:(id:number)=>{captured.delete(id);released.push(id);},getBoundingClientRect:()=>({left:10,top:20,width:54,height:54,right:64,bottom:74})};
 const session=new PointerSession(),handlers=createHandlers(session,()=>captures++,()=>enabled);
 const pointer=(id=5,type='touch',primary=false,x=37,y=47):Pointer=>({pointerId:id,pointerType:type,isPrimary:primary,clientX:x,clientY:y,preventDefault:()=>prevented++,currentTarget:button});
 const click=(detail=1):Click=>({detail,preventDefault:()=>prevented++});
 return{handlers,session,pointer,click,button,captured,released,captures:()=>captures,prevented:()=>prevented,setEnabled:(value:boolean)=>enabled=value};
}

test('the real shutter button uses the tested production pointer handlers',()=>{
 let shutter:ts.JsxOpeningElement|ts.JsxSelfClosingElement|undefined;
 const visit=(n:ts.Node)=>{if((ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n))&&n.tagName.getText(ast)==='button'&&n.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(ast)==='className'&&p.initializer?.getText(ast)==='"photo-shutter"'))shutter=n;ts.forEachChild(n,visit);};visit(ast);assert.ok(shutter);
 assert.ok(shutter.attributes.properties.some(p=>ts.isJsxSpreadAttribute(p)&&p.expression.getText(ast)==='shutterHandlers.current'));
 assert.match(source,/useRef\(createShutterPointerHandlers\(pointers,\(\)=>shutterAction\.current\.take\(\),\(\)=>shutterAction\.current\.enabled\)\)/,'handlers use the current action/enabled ref across render snapshots');
});

test('primary and non-primary touch and pen release inside the shutter capture once',()=>{
 for(const type of ['touch','pen'])for(const primary of [false,true]){const f=fixture(),e=f.pointer(5,type,primary);f.handlers.onPointerDown(e);assert.ok(f.captured.has(5));f.handlers.onPointerUp(e);f.handlers.onPointerUp(e);f.handlers.onLostPointerCapture(e);f.handlers.onClick(f.click());assert.equal(f.captures(),1,`${type} primary=${primary}`);assert.deepEqual(f.released,[5]);}
});

test('touch compatibility clicks stay suppressed after release and after other UI work',()=>{
 const f=fixture(),e=f.pointer();f.handlers.onPointerDown(e);f.handlers.onPointerUp(e);f.handlers.onClick(f.click());f.setEnabled(false);f.setEnabled(true);f.handlers.onLostPointerCapture(e);f.handlers.onClick(f.click());assert.equal(f.captures(),1,'a delayed compatibility click cannot capture again');assert.ok(f.prevented()>=4);
 f.handlers.onClick(f.click(0));assert.equal(f.captures(),2,'keyboard activation remains available');f.handlers.onPointerDown(f.pointer(1,'mouse',true));f.handlers.onPointerUp(f.pointer(1,'mouse',true));assert.equal(f.captures(),2,'mouse pointerup uses its normal click');f.handlers.onClick(f.click());assert.equal(f.captures(),3,'real mouse down restores normal mouse clicking');
});

test('cancel and lost capture never produce a release or click ghost shot',()=>{
 for(const release of ['onPointerCancel','onLostPointerCapture'] as const){const f=fixture(),e=f.pointer();f.handlers.onPointerDown(e);f.handlers[release](e);f.handlers.onPointerUp(e);f.handlers.onClick(f.click());assert.equal(f.captures(),0,release);const next=f.pointer(6);f.handlers.onPointerDown(next);f.handlers.onPointerUp(next);assert.equal(f.captures(),1,'the next touch gesture owns the shutter normally');}
});

test('release outside button bounds cancels capture including later compatibility click',()=>{
 for(const [x,y]of [[9,47],[64,47],[37,19],[37,74]]){const f=fixture();f.handlers.onPointerDown(f.pointer());f.handlers.onPointerUp(f.pointer(5,'touch',false,x,y));f.handlers.onClick(f.click());assert.equal(f.captures(),0);assert.deepEqual(f.released,[5]);}
});

test('unrelated contacts cannot release or cancel the shutter owner',()=>{
 const f=fixture(),owner=f.pointer(5),other=f.pointer(9);f.handlers.onPointerDown(owner);f.handlers.onPointerDown(other);f.handlers.onPointerCancel(other);f.handlers.onLostPointerCapture(other);f.handlers.onPointerUp(other);assert.equal(f.captures(),0);assert.ok(f.captured.has(5));assert.equal(f.captured.has(9),false);f.handlers.onPointerUp(owner);assert.equal(f.captures(),1);assert.deepEqual(f.released,[5]);
});

test('disabled or busy state gates both touch release and normal keyboard/mouse click',()=>{
 const f=fixture(),e=f.pointer();f.setEnabled(false);f.handlers.onPointerDown(e);f.handlers.onPointerUp(e);f.handlers.onClick(f.click(0));assert.equal(f.captures(),0);assert.equal(f.captured.size,0);f.setEnabled(true);f.handlers.onPointerDown(e);f.setEnabled(false);f.handlers.onPointerUp(e);assert.equal(f.captures(),0);assert.deepEqual(f.released,[5]);f.setEnabled(true);f.handlers.onClick(f.click());assert.equal(f.captures(),0,'the disabled release leaves no compatibility shot');f.handlers.onClick(f.click(0));assert.equal(f.captures(),1);
});
