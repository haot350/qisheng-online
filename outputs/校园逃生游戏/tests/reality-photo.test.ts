import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {RealityMatcher} from '../src/reality/RealityMatcher.ts';
import {claimDiscovery,discoveredReality} from '../src/reality/store.ts';
import {attachReality} from '../src/reality/persistence.ts';
import {capturePoseMeta} from '../src/photography/capture-meta.ts';
import {DEFAULT_PHOTO_SETTINGS,type PhotoRecord} from '../src/photography/types.ts';
import {associateTask,associateReality,listPhotos,photoMetadata} from '../src/photography/album.ts';
import type {RealityAnchor,RealityManifest} from '../src/reality/types.ts';
const manifest=JSON.parse(fs.readFileSync('public/story/reality/manifest.json','utf8')) as RealityManifest;
const audit=JSON.parse(fs.readFileSync('docs/v0.2.2/reality-calibration.json','utf8'));
function photo(anchor:RealityAnchor):PhotoRecord{return{id:`test-${anchor.id}`,createdAt:'2026-10-04T00:00:00.000Z',kind:'virtual-photo',blob:new Blob(['saved-frame'],{type:'image/jpeg'}),width:1800,height:1200,settings:{...DEFAULT_PHOTO_SETTINGS},exposure:{aperture:8,shutter:1/125,iso:100,gain:1,meterEV:0,limited:false},position:[...anchor.reference.position],quaternion:[...anchor.reference.quaternion],captureMeta:{eligible:true,resourcesComplete:true,unstable:false,samples:1,translation:0,rotationDegrees:0,locked:false},software:'齐盛数字校园',camera:'虚拟 EOS 5D Mark II',lens:'虚拟 EF24–105mm f/4L IS USM'};}
const enabled=manifest.anchors.filter(a=>a.enabled),context=(anchor:RealityAnchor)=>{const row=audit.reports.find((r:any)=>r.id===anchor.id),seen=new Set(row.details.filter((l:any)=>l.seen).map((l:any)=>l.world.join(',')));return{mode:'story',isLandmarkVisible:(point:[number,number,number])=>seen.has(point.join(','))};};
test('five actual audited poses match completed photographs in story and roam',()=>{
 assert.equal(enabled.length,5);
 for(const anchor of enabled){assert.equal(anchor.landmarks.length,8);assert.equal(anchor.landmarks.filter(l=>l.role==='check').length,2);assert.equal(anchor.validation.walkable,true);assert.equal(anchor.validation.geometry,true);assert.ok(anchor.validation.visible>=4);const match=new RealityMatcher(manifest).evaluate(photo(anchor),context(anchor));assert.equal(match?.anchor.id,anchor.id,anchor.id);assert.equal(new RealityMatcher(manifest).evaluate(photo(anchor),{...context(anchor),mode:'roam'})?.anchor.id,anchor.id);assert.ok(match!.median<=.06);assert.ok(match!.p90<=.12);}
});
test('failed corridor calibration stays disabled; no numerical fit is presented as a match',()=>{const corridor=manifest.anchors.find(a=>a.id==='img_4113')!;assert.equal(corridor.enabled,false);assert.equal(audit.reports.find((r:any)=>r.id===corridor.id).pass,false);assert.equal(new RealityMatcher(manifest).evaluate(photo(corridor),{mode:'story',isLandmarkVisible:()=>true}),null);});
test('no shutter, unstable accumulation, partial resources and hostile modes cannot reveal real images',()=>{
 const a=enabled[0],matcher=new RealityMatcher(manifest),base=photo(a),ctx=context(a);
 assert.equal(matcher.evaluate({...base,captureMeta:undefined},ctx),null);
 for(const metadata of[{...base.captureMeta!,eligible:false},{...base.captureMeta!,unstable:true},{...base.captureMeta!,resourcesComplete:false}])assert.equal(matcher.evaluate({...base,captureMeta:metadata},ctx),null);
 for(const mode of['escape','dafei','intro','menu'])assert.equal(matcher.evaluate(base,{...ctx,mode}),null);
});
test('camera position, floor, orientation and focal length have independent hard gates',()=>{
 for(const a of enabled){const matcher=new RealityMatcher(manifest),p=photo(a),ctx=context(a);assert.equal(matcher.evaluate({...p,position:[p.position[0]+a.reference.radius+1,p.position[1],p.position[2]]},ctx),null);assert.equal(matcher.evaluate({...p,position:[p.position[0],p.position[1]+4,p.position[2]]},ctx),null);assert.equal(matcher.evaluate({...p,settings:{...p.settings,focalLength:50}},ctx),null);assert.equal(matcher.evaluate({...p,settings:{...p.settings,orientation:'portrait'}},ctx),null);}
});
test('opposite heading, excessive pitch and visible-point obstruction are rejected',()=>{
 for(const a of enabled){const matcher=new RealityMatcher(manifest),p=photo(a),ctx=context(a),e=new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...p.quaternion),'YXZ');const turned=new THREE.Quaternion().setFromEuler(new THREE.Euler(e.x,e.y+Math.PI,0,'YXZ')).toArray() as [number,number,number,number],pitched=new THREE.Quaternion().setFromEuler(new THREE.Euler(e.x+.24,e.y,0,'YXZ')).toArray() as [number,number,number,number];assert.equal(matcher.evaluate({...p,quaternion:turned},ctx),null);assert.equal(matcher.evaluate({...p,quaternion:pitched},ctx),null);assert.equal(matcher.evaluate(p,{mode:'story',isLandmarkVisible:()=>false}),null);let count=0;assert.equal(matcher.evaluate(p,{mode:'story',isLandmarkVisible:()=>++count<=3}),null);}
});
test('modest freehand angle changes still match the first courtyard composition',()=>{
 const a=enabled.find(a=>a.id==='img_3904')!,matcher=new RealityMatcher(manifest),p=photo(a),e=new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...p.quaternion),'YXZ');
 for(const yaw of[-2,0,2])for(const pitch of[-1,0,1]){const quaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(e.x+pitch*Math.PI/180,e.y+yaw*Math.PI/180,0,'YXZ')).toArray() as [number,number,number,number];assert.equal(matcher.evaluate({...p,quaternion},context(a))?.anchor.id,a.id,`${yaw}/${pitch}`);}
});
test('wide-angle matches use new honest crops; original archive metadata and masks remain available',()=>{
 const archive=JSON.parse(fs.readFileSync('public/story/archive/manifest.json','utf8'));
 for(const a of enabled){const source=archive.photos.find((p:any)=>p.id===a.photoId);assert.equal(a.sourceSha,source.sourceSha);assert.ok(fs.existsSync('public'+source.image));assert.ok(source.display.masks!==undefined);if(a.image!==source.image){assert.ok(a.image.startsWith('/story/reality/'));assert.equal(a.crop[2],.5);assert.ok(fs.existsSync('public'+a.image));const m=new RealityMatcher(manifest).evaluate(photo(a),context(a));assert.equal(m?.association.cropped,true);assert.equal(m?.association.sourceImage,source.image);}}
});
test('exposure metadata samples actual exposed poses, retaining instability across the accumulation',()=>{
 const first={position:new THREE.Vector3(1,2,3),quaternion:new THREE.Quaternion()},initial={eligible:true,resourcesComplete:true,unstable:false,samples:0,translation:0,rotationDegrees:0,locked:false};
 const stable=capturePoseMeta(first,{position:new THREE.Vector3(1.05,2,3),quaternion:new THREE.Quaternion()},initial);assert.equal(stable.eligible,true);assert.equal(stable.samples,1);
 const moved=capturePoseMeta(first,{position:new THREE.Vector3(1.2,2,3),quaternion:new THREE.Quaternion()},stable);assert.equal(moved.unstable,true);assert.equal(moved.eligible,false);assert.equal(capturePoseMeta(first,first,moved).unstable,true);
 const rotated=capturePoseMeta(first,{position:first.position,quaternion:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),3*Math.PI/180)},initial);assert.equal(rotated.eligible,false);
 const locked=capturePoseMeta(first,first,{...initial,locked:true});assert.equal(locked.eligible,true);assert.equal(locked.locked,true);
 assert.equal(capturePoseMeta(first,first,{...initial,resourcesComplete:false}).eligible,false);
});
test('discovery identity is shared and idempotent; failure to persist a photo does not erase its relationship',async()=>{
 const a=enabled[0],matcher=new RealityMatcher(manifest),p=photo(a),first=matcher.evaluate(p,context(a))!;assert.equal(first.first,true);assert.equal(claimDiscovery(a.id),true);assert.equal(claimDiscovery(a.id),false);assert.ok(discoveredReality().has(a.id));assert.equal(matcher.evaluate(p,{...context(a),mode:'roam'})?.first,false);assert.equal((await attachReality(p,first)).reality?.anchorId,a.id);
});
test('adding story/reality associations preserves the old album identity and complete existing records',async()=>{
 const a=enabled[1],record=photo(a),old={...record,taskId:undefined,taskLabel:undefined,reality:undefined},rows=new Map([[record.id,old]]),opened:[string,number][]=[];
 const original=globalThis.indexedDB;const factory={open:(name:string,version:number)=>{opened.push([name,version]);const request:any={};queueMicrotask(()=>{request.result={close(){},transaction(){const tx:any={};const store={get:(id:string)=>{const r:any={};queueMicrotask(()=>{r.result=rows.get(id);r.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());});return r;},getAll:()=>{const r:any={};queueMicrotask(()=>{r.result=[...rows.values()];r.onsuccess?.();});return r;},put:(value:any)=>rows.set(value.id,value)};tx.objectStore=()=>store;return tx;}};request.onsuccess?.();});return request;}};
 Object.defineProperty(globalThis,'indexedDB',{value:factory,configurable:true});try{await associateTask(record.id,'courtyard-frame','第一张：庭院的光');const match=new RealityMatcher(manifest).evaluate(record,context(a))!;await associateReality(record.id,match.association);const stored=(await listPhotos())[0];assert.equal(stored.taskId,'courtyard-frame');assert.equal(stored.taskLabel,'第一张：庭院的光');assert.equal(stored.reality?.anchorId,a.id);assert.equal(stored.blob,record.blob);assert.deepEqual(stored.position,record.position);assert.ok(opened.every(([name,version])=>name==='qisheng-photography-v2'&&version===1));assert.equal(photoMetadata(stored).source,'三维校园渲染；并非实体相机原始照片');}finally{Object.defineProperty(globalThis,'indexedDB',{value:original,configurable:true});}
});
