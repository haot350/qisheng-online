import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {AlbumThumbnailCache} from '../src/photography/thumbnail.ts';
import {photoSummary} from '../src/photography/album.ts';
import {DEFAULT_PHOTO_SETTINGS,type PhotoRecord} from '../src/photography/types.ts';

/** Executes the production effect callbacks with controlled image/observer lifetimes. */
function effects(path:string,name:string,hook='useEffect'){
 const file=ts.createSourceFile(path,readFileSync(new URL(path,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),callbacks:ts.Expression[]=[];
 const declaration=file.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert.ok(declaration);
 const visit=(node:ts.Node)=>{if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text===hook)callbacks.push(node.arguments[0]);ts.forEachChild(node,visit);};visit(declaration);
 return callbacks.map(callback=>(scope:Record<string,unknown>)=>new Function(...Object.keys(scope),ts.transpileModule(`return (${callback.getText(file)});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(...Object.values(scope)) as ()=>void|(()=>void));
}
const thumbnailEffects=effects('../src/photography/AlbumMedia.tsx','PhotoThumbnail'),realityMount=effects('../src/RealityUI.tsx','RealityUI','useLayoutEffect')[0],realityDecode=effects('../src/RealityUI.tsx','RealityUI')[1];

test('offscreen album rows never request a thumbnail; scroll visibility triggers the actual lazy effect',async()=>{
 const node={},photo={id:'selected-later'},urls:string[]=[];let visible=false,reads=0,observed:unknown,disconnected=0,notify:((entries:{isIntersecting:boolean}[])=>void)|undefined,release:((url:string)=>void)|undefined;
 class Observer{constructor(callback:typeof notify,options:unknown){notify=callback;assert.deepEqual(options,{rootMargin:'64px'});}observe(value:unknown){observed=value;}disconnect(){disconnected++;}}
 const scope={ref:{current:node},photo,cache:{get:()=>{reads++;return new Promise<string>(resolve=>{release=resolve;});}},setVisible:(value:boolean)=>{visible=value;},setURL:(value:string)=>urls.push(value),IntersectionObserver:Observer};
 const stopObserver=thumbnailEffects[0](scope)();assert.equal(observed,node);thumbnailEffects[1]({...scope,visible:false})();assert.equal(reads,0);assert.deepEqual(urls,['']);
 notify!([{isIntersecting:true}]);assert.equal(visible,true);const cancel=thumbnailEffects[1]({...scope,visible})();assert.equal(reads,1);cancel!();release!('already-closed-row');await Promise.resolve();assert.deepEqual(urls,[''],'late completion cannot attach an image after its row closes');
 stopObserver!();assert.equal(disconnected,1);
});

test('reality acquires input on mount while the native image decode is still pending, and ready only starts its dissolve',async()=>{
 let gated=false,ownershipCalls=0,ready=false,discovered=0,resolve:(()=>void)|undefined,closedSource=false;const errors:string[]=[];
 class PendingImage{private value='';set src(value:string){this.value=value;if(!value)closedSource=true;}get src(){return this.value;}decode(){return new Promise<void>(done=>{resolve=done;});}}
 const scope={staticAssetUrl:(url:string)=>url,readyRef:{current:()=>{gated=true;ownershipCalls++;}},setReady:(value:boolean)=>{ready=value;},setError:(value:string)=>errors.push(value),setTime:()=>{},a:{anchorId:'real-campus',image:'/photo.jpg'},photo:{storageStatus:'temporary'},Image:PendingImage,markRealityDiscovered:()=>discovered++};
 realityMount(scope)();assert.equal(gated,true);assert.equal(ownershipCalls,1);const stopDecode=realityDecode(scope)();assert.equal(ready,false);assert.equal(discovered,0);assert.deepEqual(errors,['']);
 resolve!();await Promise.resolve();await Promise.resolve();assert.equal(ready,true);assert.equal(discovered,1);assert.equal(ownershipCalls,1,'decode completion never reopens or transfers input ownership');stopDecode!();assert.equal(closedSource,true);
});

test('a failed reality load preserves the mount gate and gives temporary photographs an honest temporary status',async()=>{
 for(const temporary of[true,false]){let ownershipCalls=0,ready=false,reject:((error:Error)=>void)|undefined,error='';class FailedImage{src='';decode(){return new Promise<void>((_done,fail)=>{reject=fail;});}}
  const scope={staticAssetUrl:(url:string)=>url,readyRef:{current:()=>ownershipCalls++},setReady:(value:boolean)=>{ready=value;},setError:(value:string)=>{error=value;},setTime:()=>{},a:{anchorId:'failed-campus',image:'/failed.jpg'},photo:{storageStatus:temporary?'temporary':'saved'},Image:FailedImage,markRealityDiscovered:()=>assert.fail('failed image cannot be discovered')};
  realityMount(scope)();const stop=realityDecode(scope)();reject!(Error('offline'));await Promise.resolve();await Promise.resolve();assert.equal(ready,false);assert.equal(ownershipCalls,1);
  if(temporary){assert.match(error,/暂存于本次游玩/);assert.doesNotMatch(error,/已经保存/);}else assert.match(error,/已经保存/);stop!();
 }
});

test('the real album hook refreshes a selected record after association without rereading unchanged metadata',async()=>{
 const path='../src/photography/AlbumMedia.tsx',file=ts.createSourceFile(path,readFileSync(new URL(path,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),declaration=file.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='useAlbumMedia');assert.ok(declaration);
 let stored:PhotoRecord={id:'same-photo',createdAt:'2026-10-05T00:00:00Z',kind:'virtual-photo',blob:new Blob(['mother']),width:2400,height:1600,settings:{...DEFAULT_PHOTO_SETTINGS},exposure:{aperture:8,shutter:1/125,iso:100,gain:1,meterEV:0,limited:false},position:[0,0,0],quaternion:[0,0,0,1],software:'齐盛数字校园',camera:'虚拟 EOS 5D Mark II',lens:'虚拟 EF24–105mm f/4L IS USM'};
 type Slot={value?:any;dependencies?:unknown[];cleanup?:()=>void};const slots:Slot[]=[];let index=0,reads=0,notify:(()=>void)|undefined;const layouts:(()=>void)[]=[],passives:(()=>void)[]=[];
 const useState=(initial:any)=>{const slot=slots[index++]??(slots[index-1]={value:typeof initial==='function'?initial():initial});return[slot.value,(next:any)=>{slot.value=typeof next==='function'?next(slot.value):next;}];};
 const useRef=(initial:any)=>{const slot=slots[index++]??(slots[index-1]={value:{current:initial}});return slot.value;};
 const effect=(queue:(()=>void)[])=> (callback:()=>void|(()=>void),dependencies:unknown[])=>{const slot=slots[index++]??(slots[index-1]={});if(slot.dependencies&&dependencies.every((value,i)=>Object.is(value,slot.dependencies![i])))return;slot.dependencies=[...dependencies];queue.push(()=>{slot.cleanup?.();slot.cleanup=callback()??undefined;});};
 const scope={useState,useRef,useEffect:effect(passives),useLayoutEffect:effect(layouts),photoSummary,AlbumThumbnailCache,listPhotoMetadata:async()=>[photoSummary(stored)],readPhoto:async()=>{reads++;return stored;},removePhoto:async()=>{},watchAlbum:(callback:()=>void)=>{notify=callback;return()=>{notify=undefined;};}};
 const create=ts.transpileModule(`${declaration.getText(file).replace(/^export\s+/,'')};return useAlbumMedia;`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const hook=new Function(...Object.keys(scope),create)(...Object.values(scope)) as ()=>{record:PhotoRecord|null};
 const render=()=>{index=0;const result=hook();while(layouts.length)layouts.shift()!();while(passives.length)passives.shift()!();return result;};
 const flush=async()=>{await Promise.resolve();await Promise.resolve();};
 render();await flush();render();await flush();let current=render();assert.equal(current.record?.id,stored.id);assert.equal(reads,1);
 notify!();await flush();render();await flush();assert.equal(reads,1,'a count notification with unchanged selected fields does not decode its mother photo again');
 const original=stored.blob;stored={...stored,taskId:'completed-task',taskLabel:'庭院的光',reality:{anchorId:'campus-real',photoId:'original',image:'/real.jpg',title:'真实校园',sourceSha:'source',cropped:false}};
 notify!();await flush();render();await flush();current=render();assert.equal(reads,2);assert.equal(current.record?.taskLabel,'庭院的光');assert.equal(current.record?.reality?.anchorId,'campus-real');assert.equal(current.record?.blob,original);
 for(const slot of slots)slot.cleanup?.();assert.equal(notify,undefined);
});
