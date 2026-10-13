import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {AlbumThumbnailCache} from '../src/photography/thumbnail.ts';
import {photoSummary} from '../src/photography/album.ts';
import {DEFAULT_PHOTO_SETTINGS,type PhotoRecord,type PhotoMetadata} from '../src/photography/types.ts';

const source=readFileSync(new URL('../src/photography/AlbumMedia.tsx',import.meta.url),'utf8'),file=ts.createSourceFile('AlbumMedia.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),declaration=file.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='useAlbumMedia');assert.ok(declaration);
const code=ts.transpileModule(declaration.getText(file).replace(/^export\s+/, '')+'; return useAlbumMedia;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function row(id='a'):PhotoRecord{return{id,createdAt:'2026-10-06T00:00:00Z',kind:'virtual-photo',blob:new Blob([id]),width:2400,height:1600,settings:{...DEFAULT_PHOTO_SETTINGS},exposure:{aperture:8,shutter:1/125,iso:100,gain:1,meterEV:0,limited:false},position:[0,0,0],quaternion:[0,0,0,1],software:'齐盛数字校园',camera:'虚拟相机',lens:'虚拟镜头'};}
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((done,fail)=>{resolve=done;reject=fail;});return{promise,resolve,reject};}
function fixture(actions:{list:()=>Promise<PhotoMetadata[]>;read:(id:string)=>Promise<PhotoRecord|null>;remove?:(id:string)=>Promise<void>}){
 type Slot={value?:any;dependencies?:unknown[];cleanup?:()=>void};const slots:Slot[]=[];let index=0,changes=0,watch:(()=>void)|undefined;const layouts:(()=>void)[]=[],passives:(()=>void)[]=[];
 const useState=(initial:any)=>{const slot=slots[index++]??(slots[index-1]={value:typeof initial==='function'?initial():initial});return[slot.value,(next:any)=>{changes++;slot.value=typeof next==='function'?next(slot.value):next;}];};
 const useRef=(initial:any)=>{const slot=slots[index++]??(slots[index-1]={value:{current:initial}});return slot.value;};
 const effect=(queue:(()=>void)[])=> (callback:()=>void|(()=>void),dependencies:unknown[])=>{const slot=slots[index++]??(slots[index-1]={});if(slot.dependencies&&dependencies.every((value,i)=>Object.is(value,slot.dependencies![i])))return;slot.dependencies=[...dependencies];queue.push(()=>{slot.cleanup?.();slot.cleanup=callback()??undefined;});};
 const scope={useState,useRef,useEffect:effect(passives),useLayoutEffect:effect(layouts),photoSummary,AlbumThumbnailCache,listPhotoMetadata:actions.list,readPhoto:actions.read,removePhoto:actions.remove??(async()=>{}),watchAlbum:(fn:()=>void)=>{watch=fn;return()=>{watch=undefined;};}};
 const hook=new Function(...Object.keys(scope),code)(...Object.values(scope));
 const render=()=>{index=0;const result=hook();while(layouts.length)layouts.shift()!();while(passives.length)passives.shift()!();return result;};
 const flush=async()=>{await Promise.resolve();await Promise.resolve();};
 return{render,flush,notify:()=>watch?.(),changes:()=>changes,close:()=>{for(const slot of slots)slot.cleanup?.();}};
}

test('a list read error stays local and retry recovers the actual metadata without reopening',async()=>{
 const record=row();let fail=true;const f=fixture({list:async()=>{if(fail)throw Error('DB blocked');return[photoSummary(record)];},read:async()=>record});try{f.render();await f.flush();let state=f.render();assert.match(state.listError,/相册.*重试/);assert.equal(state.listLoading,false);assert.equal(state.photos.length,0);fail=false;state.retryList();f.render();await f.flush();state=f.render();await f.flush();state=f.render();assert.equal(state.listError,'');assert.equal(state.photos[0].id,record.id);assert.equal(state.record?.id,record.id);}finally{f.close();}
});
test('selected original retry distinguishes read errors from a genuinely missing record',async()=>{
 const record=row();let kind='error';const f=fixture({list:async()=>[photoSummary(record)],read:async()=>{if(kind==='error')throw Error('read');return kind==='missing'?null:record;}});try{f.render();await f.flush();f.render();await f.flush();let state=f.render();assert.match(state.recordError,/照片.*重试/);assert.equal(state.missing,false);kind='missing';state.retryRecord();f.render();await f.flush();state=f.render();assert.equal(state.recordError,'');assert.equal(state.missing,true);kind='ready';state.retryRecord();f.render();await f.flush();state=f.render();assert.equal(state.missing,false);assert.equal(state.record?.blob,record.blob);}finally{f.close();}
});
test('a late failing list refresh cannot overwrite a newer successful metadata result',async()=>{
 const record=row(),first=deferred<PhotoMetadata[]>();let requests=0;const f=fixture({list:()=>++requests===1?first.promise:Promise.resolve([photoSummary(record)]),read:async()=>record});try{f.render();f.notify();await f.flush();f.render();await f.flush();first.reject(Error('old'));await f.flush();const state=f.render();assert.equal(state.listError,'');assert.equal(state.photos[0].id,record.id);}finally{f.close();}
});
test('selection and close discard late original read completions',async()=>{
 const a=row('a'),b=row('b'),readA=deferred<PhotoRecord|null>();const f=fixture({list:async()=>[photoSummary(a),photoSummary(b)],read:id=>id==='a'?readA.promise:Promise.resolve(b)});f.render();await f.flush();let state=f.render();state.select(photoSummary(b));f.render();await f.flush();state=f.render();assert.equal(state.record?.id,'b');f.close();const before=f.changes();readA.resolve(a);await f.flush();assert.equal(f.changes(),before,'closed effects cannot update an unmounted album');
});
test('deleting a previously selected photo does not clear a newly selected one',async()=>{
 const a=row('a'),b=row('b'),removed=deferred<void>();const f=fixture({list:async()=>[photoSummary(a),photoSummary(b)],read:async id=>id==='a'?a:b,remove:()=>removed.promise});try{f.render();await f.flush();let state=f.render();await f.flush();state=f.render();const deletion=state.erase(photoSummary(a));state.select(photoSummary(b));f.render();await f.flush();removed.resolve();await deletion;state=f.render();assert.equal(state.selected?.id,'b');assert.equal(state.record?.id,'b');assert.deepEqual(state.photos.map((p:PhotoMetadata)=>p.id),['b']);}finally{f.close();}
});
