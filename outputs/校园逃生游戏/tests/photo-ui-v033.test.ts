import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {PointerSession} from '../src/pointer-owner.ts';
import {PHOTO_POINTER_KEYS,createShutterPointerHandlers,createCompositionPointerHandlers,createFocusPointerHandlers,createMovementPointerHandlers} from '../src/photography/pointer-controls.ts';
import {DEFAULT_PHOTO_SETTINGS,type PhotoRecord} from '../src/photography/types.ts';

/** The exact production JSX is evaluated with a small state adapter; no GPU/DOM claim. */
const source=readFileSync(new URL('../src/PhotoUI.tsx',import.meta.url),'utf8').split('\n').filter(line=>!line.startsWith('import ')).join('\n');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
type Element={type:any;props:Record<string,any>};
function fixture(media:any={}){
 const slots:any[]=[];let index=0;const useState=(initial:any)=>{const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],(value:any)=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];};const useRef=(initial:any)=>{const i=index++;return slots[i]??(slots[i]={current:initial});};
 const React={createElement:(type:any,props:any,...children:any[]):Element=>({type,props:{...props,children}}),Fragment:'fragment'};const exports:any={};class AlbumFullError extends Error{constructor(){super('相册已满');}}
 const session=new PointerSession();
 const scope={exports,React,useState,useRef,usePointerSession:()=>session,PHOTO_POINTER_KEYS,createShutterPointerHandlers,createCompositionPointerHandlers,createFocusPointerHandlers,createMovementPointerHandlers,useEffect:()=>{},useModalFocus:()=>{},AlbumFullError,APERTURES:[],ISOS:[],SHUTTERS:[],shutterLabel:()=>'',PhotoImage:()=>{},PhotoThumbnail:()=>{},useAlbumMedia:()=>media,RealityUI:()=>{},downloadPhoto:()=>{},shareOrDownloadPhoto:async()=> 'cancelled'};
 const components=new Function(...Object.keys(scope),compiled+';return {PhotoUI,PhotoAlbum};')(...Object.values(scope));
 return{render:(name:'PhotoUI'|'PhotoAlbum',props:any)=>{index=0;return components[name](props) as Element;}};
}
function elements(node:any):Element[]{if(!node)return[];if(Array.isArray(node))return node.flatMap(elements);if(typeof node!=='object'||!('props'in node))return[];return[node,...elements(node.props.children)];}
function button(tree:Element,label:string){return elements(tree).find(node=>node.type==='button'&&(node.props['aria-label']===label||node.props.children.includes(label)));}
function text(tree:Element):string{return elements(tree).flatMap(node=>node.props.children.filter((value:any)=>typeof value==='string')).join(' ');}
const snapshot={settings:{...DEFAULT_PHOTO_SETTINGS,interface:'simple'},state:'viewfinder',viewReady:true,viewFailed:false,viewProgress:1,focusState:'idle',focusConfirmed:false,shutterPending:false,albumCount:0,exposure:{aperture:8,shutter:1/125,iso:100,meterEV:0},histogram:[],remaining:0,focusDistance:10,roll:0};

test('the direct viewfinder pause button invokes the current parent pause callback',()=>{
 let pauses=0,closed=0;const f=fixture(),tree=f.render('PhotoUI',{snapshot,system:{},touch:true,onPause:()=>pauses++,onClose:()=>closed++});const pause=button(tree,'暂停游戏');assert.ok(pause);assert.equal(pause.props.disabled,false);pause.props.onClick();assert.equal(pauses,1);assert.equal(closed,0);
});
test('parameter preview has no central paused badge and blocks capture/focus/movement until closed',()=>{
 const f=fixture(),props={snapshot,system:{},touch:true,onClose:()=>{},onMove:()=>{}};let tree=f.render('PhotoUI',props);button(tree,'摄影参数')!.props.onClick();tree=f.render('PhotoUI',{...props,snapshot:{...snapshot,state:'paused'}});assert.doesNotMatch(text(tree),/摄影已暂停/);assert.equal(button(tree,'拍摄照片')!.props.disabled,true);assert.equal(button(tree,'按住对焦')!.props.disabled,true);const pad=elements(tree).find(node=>typeof node.type==='function'&&node.type.name==='PhotoMovement');assert.equal(pad?.props.disabled,true);assert.ok(elements(tree).find(node=>node.props['aria-label']==='摄影参数'));
});
test('a photograph needs an explicit second confirmation before its original is deleted',async()=>{
 const record={id:'selected',createdAt:'2026-10-06',settings:{...DEFAULT_PHOTO_SETTINGS},exposure:{},width:1536,height:1024} as PhotoRecord;let erases=0;
 const media={record,selected:record,photos:[],loading:false,error:'',listError:'',recordError:'',listLoading:false,missing:false,setError:()=>{},erase:async()=>{erases++;},cache:{}};
 const f=fixture(media),props={onClose:()=>{}};let tree=f.render('PhotoAlbum',props);button(tree,'删除这张')!.props.onClick();assert.equal(erases,0);tree=f.render('PhotoAlbum',props);assert.match(text(tree),/删除这张照片？/);button(tree,'取消')!.props.onClick();assert.equal(erases,0);tree=f.render('PhotoAlbum',props);assert.doesNotMatch(text(tree),/删除这张照片？/);button(tree,'删除这张')!.props.onClick();tree=f.render('PhotoAlbum',props);await button(tree,'删除')!.props.onClick();assert.equal(erases,1);
});
