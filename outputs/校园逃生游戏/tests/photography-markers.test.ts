import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {PhotographyMarkers,hidePhotoGuides,markerRange,markerSceneVisible,realityPhotoMarkers,taskPhotoMarker} from '../src/photography-markers.ts';
import {StorySession} from '../src/story/session.ts';
import {STORY_STEPS} from '../src/story/content.ts';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,nextResolve){if(context.parentURL?.includes('/src/')&&specifier.startsWith('./')&&!/\.(ts|tsx|json)$/.test(specifier))return nextResolve(specifier+'.ts',context);return nextResolve(specifier,context);}});
const {DEFAULT_SETTINGS,parseStoredSettings}=await import('../src/types.ts');

import type {RealityManifest} from '../src/reality/types.ts';
const manifest=JSON.parse(readFileSync(new URL('../public/story/reality/manifest.json',import.meta.url),'utf8')) as RealityManifest;
function snapshot(id:string){const c=new StorySession().checkpoint();c.step=id;c.flags.guideStage='skipped';const s=new StorySession();s.restore(c);const v=s.snapshot;return {...v,introActive:false,cinematicActive:false,dialogue:null,options:[]};}
const support=(p:THREE.Vector3)=>({height:p.y,normalY:1,clear:true});
const camera=new THREE.PerspectiveCamera(),player=new THREE.Vector3(-29,.067,-86);
test('all eight active photo tasks have their true legal radius, including preceding travel/cooperation',()=>{
 const photos=STORY_STEPS.filter(s=>s.kind==='photo');assert.equal(photos.length,8);
 for(const p of photos){const m=taskPhotoMarker(snapshot(p.id));assert.equal(m?.id,p.id);assert.deepEqual(m?.position,p.target?.position);assert.equal(m?.radius,p.target?.radius);}
 const arrival=taskPhotoMarker(snapshot('courtyard-arrive'));assert.equal(arrival?.id,'yard-first-shot');assert.equal(arrival?.radius,4);
 for(const s of STORY_STEPS.filter(s=>['travel','cooperate'].includes(s.kind)&&photos.some(p=>p.id===s.next)))assert.equal(taskPhotoMarker(snapshot(s.id))?.id,s.next);
});
test('task guides yield to intro, dialogue, film, choices, pause and unsupported modes',()=>{
 const s=snapshot('yard-first-shot');assert.equal(markerSceneVisible('story',true,s),true);assert.equal(markerSceneVisible('roam',true),true);
 for(const mode of ['escape','dafei'] as const)assert.equal(markerSceneVisible(mode,true,s),false);
 assert.equal(markerSceneVisible('story',false,s),false);assert.equal(markerSceneVisible('story',true,s,true),false);
 for(const flag of ['introActive','cinematicActive','screeningActive','finished'] as const){assert.equal(taskPhotoMarker({...s,[flag]:true}),null);assert.equal(markerSceneVisible('story',true,{...s,[flag]:true}),false);}
 assert.equal(taskPhotoMarker({...s,dialogue:{speaker:'narrator',speakerName:'旁白',text:'等一下',fullText:'等一下',complete:true}}),null);
 assert.equal(taskPhotoMarker({...s,options:[{index:0,label:'继续'}]}),null);
});
test('only five accepted calibration references become feet-level optional markers; rejected 4113 stays excluded',()=>{
 assert.equal(DEFAULT_SETTINGS.realityHints,false);assert.equal(Boolean(({controls:'auto'} as any).realityHints),false);
 const points=realityPhotoMarkers(manifest);assert.equal(points.length,5);assert.equal(points.some(p=>p.id.includes('4113')),false);
 for(const p of points){const a=manifest.anchors.find(a=>a.id===p.id)!;assert.equal(p.optional,true);assert.equal(p.position[1],a.reference.position[1]-1.63);}
 const invalid={...manifest,anchors:manifest.anchors.map(a=>({...a,validation:{...a.validation,walkable:false}}))};assert.equal(realityPhotoMarkers(invalid).length,0);
});
test('legal range never bridges missing support, unsafe clearance or a different floor and uses standing height',()=>{
 const target=taskPhotoMarker(snapshot('yard-first-shot'))!,heights:number[]=[];
 const whole=markerRange(target,(p,h)=>{heights.push(h!);return support(p);});assert.equal(whole.validSegments,64);assert.ok(heights.every(h=>h===1.75));
 assert.equal(markerRange(target,p=>({...support(p),height:p.y+4})).validSegments,0);
 assert.equal(markerRange(target,p=>({...support(p),clear:false})).validSegments,0);
 const partial=markerRange(target,p=>p.x>target.position[0]?support(p):null);assert.ok(partial.validSegments>0&&partial.validSegments<64);
});
test('markers keep depth testing, clean exposure exclusion, same-floor visibility and disposable lifetimes',()=>{
 const scene=new THREE.Scene(),guides=new PhotographyMarkers(scene,support);guides.update('story',true,snapshot('yard-first-shot'),false,camera,player);
 assert.equal(guides.read().entries[0].optional,false);assert.equal(guides.read().task?.validSegments,64);assert.equal(guides.read().visible,true);
 guides.root.traverse(o=>{const m=o as THREE.Mesh;if(m.material)for(const a of Array.isArray(m.material)?m.material:[m.material])assert.equal(a.depthTest,true);});
 const restore=hidePhotoGuides(scene);assert.equal(guides.root.visible,false);restore();assert.equal(guides.root.visible,true);
 guides.update('story',true,{...snapshot('yard-first-shot'),cinematicActive:true},false,camera,player);assert.equal(guides.read().visible,false);
 guides.reset();assert.equal(guides.root.children.length,0);assert.equal(guides.read().task,undefined);guides.dispose();assert.equal(scene.children.length,0);
});
test('reference manifest is lazy, off by default, cancels late results and can retry after failure',async()=>{
 let requests=0,resolve!:(m:RealityManifest)=>void;const guides=new PhotographyMarkers(new THREE.Scene(),support,()=>{},()=>{requests++;return new Promise(r=>resolve=r);});
 guides.update('roam',true,undefined,false,camera,player);guides.update('escape',true,undefined,true,camera,player);assert.equal(requests,0);
 guides.update('roam',true,undefined,true,camera,player);assert.equal(requests,1);assert.equal(guides.read().referenceState,'loading');
 guides.update('roam',true,undefined,false,camera,player);resolve(manifest);await new Promise(r=>setImmediate(r));assert.equal(guides.read().referenceCount,0);assert.equal(guides.read().referenceState,'off');
 guides.update('roam',true,undefined,true,camera,player);resolve(manifest);await new Promise(r=>setImmediate(r));guides.update('roam',true,undefined,true,camera,player);assert.equal(guides.read().referenceCount,5);assert.equal(guides.read().referenceState,'ready');
 guides.update('roam',true,undefined,true,camera,player.clone().setY(12));assert.ok(guides.read().entries.every(e=>!e.visible));guides.dispose();
 let failing=true;const retry=new PhotographyMarkers(new THREE.Scene(),support,()=>{},async()=>{if(failing)throw Error('network');return manifest;});retry.update('roam',true,undefined,true,camera,player);await new Promise(r=>setImmediate(r));assert.equal(retry.read().referenceState,'error');failing=false;retry.update('roam',true,undefined,false,camera,player);retry.update('roam',true,undefined,true,camera,player);await new Promise(r=>setImmediate(r));retry.update('roam',true,undefined,true,camera,player);assert.equal(retry.read().referenceCount,5);retry.dispose();
});

test('direct reference retry recovers without changing the hint preference or accepting cancelled results',async()=>{let fails=true,calls=0;const guides=new PhotographyMarkers(new THREE.Scene(),support,()=>{},async()=>{calls++;if(fails)throw Error('offline');return manifest;});guides.update('roam',true,undefined,true,camera,player);await new Promise(r=>setImmediate(r));assert.equal(guides.read().referenceState,'error');fails=false;guides.retry();await new Promise(r=>setImmediate(r));guides.update('roam',true,undefined,true,camera,player);assert.equal(calls,2);assert.equal(guides.read().references,true);assert.equal(guides.read().referenceCount,5);guides.dispose();guides.retry();assert.equal(calls,2);});
