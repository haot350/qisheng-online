import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {PhotoCaptureEvidence} from '../src/photography/types.ts';
import {focusWall,photoFixture,withPhotoCanvas} from './photo-fixture.ts';

test('single AF moves the real shader focal plane over 200 ms, locks once, and retains it after release',()=>{
 const{scene,wall}=focusWall(),events:unknown[]=[];const f=photoFixture({onFocusAcquired:event=>events.push(event)},scene);
 try{
  f.photo.setFocusHeld('keyboard:F',true);f.photo.setFocusHeld('keyboard:F',true);
  assert.equal(f.photo.snapshot().focusState,'acquiring');assert.equal(f.photo.snapshot().focusDistance,20);
  f.advance(.1);const middle=f.photo.snapshot().focusDistance;assert.ok(middle<20&&middle>5);assert.equal(f.focusUniforms.at(-1),middle);assert.equal(events.length,0);
  f.advance(.1);assert.equal(f.photo.snapshot().focusDistance,5);assert.equal(f.photo.snapshot().focusState,'locked');assert.equal(events.length,1);
  wall.position.z=-10;f.advance(.3);assert.equal(f.photo.snapshot().focusDistance,5,'held single AF does not turn into tracking');assert.equal(events.length,1);
  f.photo.setFocusHeld('keyboard:F',false);f.advance(.3);assert.equal(f.photo.snapshot().focusDistance,5);assert.equal(f.photo.snapshot().focusConfirmed,true);
  f.photo.setFocusHeld('keyboard:F',true);f.advance(.2);assert.equal(f.photo.snapshot().focusDistance,10);assert.equal(events.length,2);
 }finally{f.dispose();}
});

test('keyboard and pointer focus owners release independently; an early final release stops acquisition',()=>{
 const{scene}=focusWall(),events:unknown[]=[];const f=photoFixture({onFocusAcquired:event=>events.push(event)},scene);
 try{
  f.photo.setFocusHeld('keyboard:F',true);f.photo.setFocusHeld('pointer:12',true);f.advance(.05);f.photo.setFocusHeld('keyboard:F',false);f.advance(.15);
  assert.equal(f.photo.snapshot().focusDistance,5);assert.equal(events.length,1);
  f.photo.setFocusHeld('pointer:12',false);f.photo.configure({focusDistance:20});f.photo.setFocusHeld('pointer:13',true);f.advance(.05);const partial=f.photo.snapshot().focusDistance;
  f.photo.setFocusHeld('pointer:13',false);f.advance(.5);assert.equal(f.photo.snapshot().focusState,'idle');assert.equal(f.photo.snapshot().focusDistance,partial);assert.equal(events.length,1);
 }finally{f.dispose();}
});

test('single acquisition measures the exposure-time scene until locking, so a moved or vanished subject cannot leave a stale hit',()=>{
 const{scene,wall}=focusWall();let acquired=0;const f=photoFixture({onFocusAcquired:()=>acquired++},scene);
 try{
  f.photo.setFocusHeld('keyboard:F',true);f.advance(.1);wall.position.z=-10;f.advance(.1);assert.equal(f.photo.snapshot().focusDistance,10);assert.equal(acquired,1);
  f.photo.setFocusHeld('keyboard:F',false);f.photo.setFocusHeld('keyboard:F',true);f.advance(.1);wall.visible=false;f.advance(.1);assert.equal(f.photo.snapshot().focusState,'not-found');assert.equal(acquired,1);
 }finally{f.dispose();}
});

test('continuous AF runs only while held, follows depth smoothly, and never repeats its acquired event per frame',()=>{
 const{scene,wall}=focusWall(),events:unknown[]=[];const f=photoFixture({onFocusAcquired:event=>events.push(event)},scene);
 try{
  f.photo.configure({focusMode:'continuous'});f.advance(.25);assert.equal(f.photo.snapshot().focusDistance,20);assert.equal(events.length,0);
  f.photo.setFocusHeld('pointer:1',true);f.advance(.25);assert.ok(Math.abs(f.photo.snapshot().focusDistance-5)<.05);assert.equal(events.length,1);
  wall.position.z=-10;f.frame();assert.ok(f.photo.snapshot().focusDistance>5&&f.photo.snapshot().focusDistance<10);f.advance(.3);assert.ok(Math.abs(f.photo.snapshot().focusDistance-10)<.05);assert.equal(events.length,1);
  f.photo.setFocusHeld('pointer:1',false);const locked=f.photo.snapshot().focusDistance;wall.position.z=-20;f.advance(.3);assert.equal(f.photo.snapshot().focusDistance,locked);
  f.photo.setFocusHeld('pointer:2',true);f.advance(.3);assert.equal(events.length,2);wall.visible=false;f.advance(.6);assert.equal(f.photo.snapshot().focusState,'not-found');assert.equal(events.length,2);
 }finally{f.dispose();}
});

test('selecting a focus point alone does not pull focus or complete teaching; held AF still acquires the selected subject',()=>{
 const{scene}=focusWall(),events:{source:string}[]=[],f=photoFixture({onFocusAcquired:event=>events.push(event)},scene);
 try{f.photo.focus(.2,.1);f.advance(.3);assert.deepEqual(f.photo.snapshot().focusPoint,[.2,.1]);assert.equal(f.photo.snapshot().focusState,'idle');assert.equal(f.photo.snapshot().focusDistance,20);assert.equal(events.length,0);f.photo.setFocusHeld('keyboard:F',true);f.advance(.2);assert.equal(f.photo.snapshot().focusState,'locked');assert.equal(events.length,1);assert.equal(events[0].source,'keyboard:F');}finally{f.dispose();}
});

test('simple shutter still performs quick AF after point selection without an earlier tap-acquired event',()=>withPhotoCanvas(async()=>{
 const{scene}=focusWall(),sources:string[]=[],f=photoFixture({onFocusAcquired:event=>sources.push(event.source)},scene);
 try{f.photo.focus(.1,0);f.advance(.25);assert.deepEqual(sources,[]);const pending=f.photo.capture();assert.equal(f.photo.snapshot().shutterPending,true);f.advance(.15);assert.ok(await pending);assert.deepEqual(sources,['shutter-auto']);}finally{f.dispose();}
}));

test('manual focus ignores F, button holds and taps, including simple-interface shutter fallback',()=>withPhotoCanvas(async()=>{
 const{scene}=focusWall();let focuses=0,exposures=0;const f=photoFixture({onFocusAcquired:()=>focuses++,onExposureStarted:()=>exposures++},scene);
 try{
  f.photo.configure({focusMode:'manual',focusDistance:7});f.photo.setFocusHeld('keyboard:F',true);f.photo.setFocusHeld('pointer:1',true);f.photo.focus(.2,0);f.advance(.25);
  assert.equal(f.photo.snapshot().focusDistance,7);assert.equal(f.photo.snapshot().focusState,'idle');assert.equal(focuses,0);
  const pending=f.photo.capture();assert.equal(f.photo.snapshot().shutterPending,false);assert.equal(f.photo.snapshot().state,'exposing');f.frame();const record=await pending;
  assert.ok(record);assert.equal(record.settings.focusDistance,7);assert.equal(exposures,1);assert.equal(focuses,0);assert.equal(record.storageStatus,'temporary');assert.equal(f.photo.lastCapture()?.id,record.id);
 }finally{f.dispose();}
}));

test('simple quick AF freezes evidence at actual exposure and completes only after encoding',()=>withPhotoCanvas(async()=>{
 const{scene}=focusWall(),sources:string[]=[];let exposures=0,captures=0,evidence:PhotoCaptureEvidence={subjects:['lin-cen'],subjectsVerified:true,frameClear:true,exposureStepId:'yard-first-shot',actorsReady:true,rhythmReady:true};
 const f=photoFixture({onFocusAcquired:event=>sources.push(event.source),onExposureStarted:()=>exposures++,onCapture:()=>captures++,captureEvidence:()=>evidence},scene);
 try{
  const pending=f.photo.capture();assert.equal(f.photo.snapshot().shutterPending,true);await assert.rejects(f.photo.capture(),/尚未完成/);
  f.advance(.1);assert.equal(exposures,0);f.advance(.04);assert.deepEqual(sources,['shutter-auto']);assert.equal(f.photo.snapshot().shutterPending,false);assert.equal(exposures,1);
  evidence.subjects!.push('zhou-xu');evidence.frameClear=false;const record=await pending;assert.ok(record);
  assert.equal(captures,1);assert.equal(record.settings.focusDistance,5);assert.deepEqual(record.captureEvidence?.subjects,['lin-cen']);assert.equal(record.captureEvidence?.frameClear,true);assert.equal(record.storageStatus,'temporary');
 }finally{f.dispose();}
}));

test('simple quick AF with no hit shoots the far plane without a false acquired event',()=>withPhotoCanvas(async()=>{
 let focuses=0,exposures=0;const f=photoFixture({onFocusAcquired:()=>focuses++,onExposureStarted:()=>exposures++});
 try{const pending=f.photo.capture();f.advance(.15);const record=await pending;assert.ok(record);assert.equal(record.settings.focusDistance,2000);assert.equal(focuses,0);assert.equal(exposures,1);assert.equal(f.photo.snapshot().focusState,'not-found');}finally{f.dispose();}
}));

test('professional capture immediately uses the current focus pull and first exposure camera',()=>withPhotoCanvas(async()=>{
 const{scene}=focusWall();let focuses=0,exposures=0;const f=photoFixture({onFocusAcquired:()=>focuses++,onExposureStarted:()=>exposures++},scene);
 try{
  f.photo.configure({interface:'professional',mode:'M',shutter:1/1000});f.photo.setFocusHeld('keyboard:F',true);f.advance(.05);const distance=f.photo.snapshot().focusDistance;
  const pending=f.photo.capture();assert.equal(f.photo.snapshot().shutterPending,false);f.camera.position.x=2;f.frame();const record=await pending;assert.ok(record);
  assert.equal(record.settings.focusDistance,distance);assert.deepEqual(record.position,[2,0,0]);assert.equal(focuses,0);assert.equal(exposures,1);
 }finally{f.dispose();}
}));

test('selfie timer emits no shutter until its first positive exposure sample, with that sample pose',()=>withPhotoCanvas(async()=>{
 let exposures=0;const f=photoFixture({onExposureStarted:()=>exposures++});
 try{
  f.photo.configure({interface:'professional',mode:'M',focusMode:'manual',timer:2,shutter:1/1000});const pending=f.photo.capture();
  f.advance(1.9);assert.equal(exposures,0);f.camera.position.x=3;f.photo.configure({focalLength:105});assert.equal(f.photo.snapshot().settings.focalLength,24);
  f.advance(.1);if(f.photo.snapshot().state==='timer')f.frame();assert.equal(exposures,0,'timer boundary itself has no positive sample');f.frame();const record=await pending;assert.ok(record);assert.deepEqual(record.position,[3,0,0]);assert.equal(exposures,1);assert.equal(record.captureMeta?.samples,1);
  f.advance(.1);assert.equal(exposures,1);
 }finally{f.dispose();}
}));

test('accumulated exposure intersects subjects and rejects obstruction or readiness lost during its samples',()=>withPhotoCanvas(async()=>{
 let sample=0,exposures=0;const f=photoFixture({onExposureStarted:()=>exposures++,captureEvidence:()=>({subjects:sample++===0?['lin-cen','zhou-xu']:['lin-cen'],subjectsVerified:true,frameClear:sample<3,exposureStepId:'reflector-capture',actorsReady:true,rhythmReady:sample<3})});
 try{
  f.photo.configure({interface:'professional',mode:'M',focusMode:'manual',shutter:1/8});const pending=f.photo.capture();f.frame();f.camera.position.x=.2;f.advance(.15);const record=await pending;assert.ok(record);
  assert.deepEqual(record.position,[0,0,0]);assert.deepEqual(record.captureEvidence?.subjects,['lin-cen']);assert.equal(record.captureEvidence?.frameClear,false);assert.equal(record.captureEvidence?.rhythmReady,false);assert.equal(record.captureMeta?.unstable,true);assert.equal(exposures,1);
 }finally{f.dispose();}
}));

test('short exposures that span frames retain the output sample pose and evidence rather than the first frame',()=>withPhotoCanvas(async()=>{
 let sample=0;const f=photoFixture({captureEvidence:()=>({subjects:[`sample-${++sample}`],subjectsVerified:true,frameClear:true})});
 try{f.photo.configure({interface:'professional',mode:'M',focusMode:'manual',shutter:1/40});const pending=f.photo.capture();f.frame();f.camera.position.x=.05;f.frame();const record=await pending;assert.ok(record);assert.deepEqual(record.position,[.05,0,0]);assert.deepEqual(record.captureEvidence?.subjects,['sample-2']);assert.equal(record.captureMeta?.samples,2);}finally{f.dispose();}
}));

test('cancel and pause clear pending AF and owners; a saved-frame read cannot revive a cancelled shot',()=>withPhotoCanvas(async()=>{
 const{scene}=focusWall();let focuses=0,exposures=0,captures=0;const f=photoFixture({onFocusAcquired:()=>focuses++,onExposureStarted:()=>exposures++,onCapture:()=>captures++},scene);
 try{
  f.photo.setFocusHeld('keyboard:F',true);const quick=f.photo.capture();f.advance(.05);f.photo.cancel();assert.equal(await quick,null);f.advance(.3);assert.equal(focuses,0);assert.equal(exposures,0);assert.equal(f.photo.snapshot().shutterPending,false);
  f.photo.configure({interface:'professional',mode:'M',focusMode:'manual',shutter:1/1000});let release:(()=>void)|undefined;f.setExportRead(pixels=>new Promise(resolve=>{release=()=>resolve(pixels);}));const saving=f.photo.capture();f.frame();assert.equal(exposures,1);assert.equal(f.photo.snapshot().state,'saving');f.photo.pause();assert.equal(await saving,null);release!();await Promise.resolve();await Promise.resolve();f.photo.resume();f.advance(.2);assert.equal(captures,0);assert.equal(f.photo.snapshot().lastPhotoId,null);
 }finally{f.dispose();}
}));

test('reopening and switching focus mode cannot inherit a previous acquired state or held input',()=>{
 const{scene}=focusWall(),events:{sessionId:number;requestId:number;source:string}[]=[];const f=photoFixture({onFocusAcquired:event=>events.push(event)},scene);
 try{
  f.photo.setFocusHeld('keyboard:F',true);f.advance(.2);assert.equal(events.length,1);f.photo.close();f.photo.open(f.camera);f.photo.setViewStatus({ready:true,failed:false,progress:1});f.advance(.3);assert.equal(f.photo.snapshot().focusState,'idle');assert.equal(events.length,1);
  f.photo.setFocusHeld('keyboard:F',true);f.advance(.2);assert.equal(events.length,2);assert.notEqual(events[0].sessionId,events[1].sessionId);
  f.photo.configure({focusMode:'manual',focusDistance:8});f.advance(.3);assert.equal(f.photo.snapshot().focusConfirmed,false);assert.equal(f.photo.snapshot().focusDistance,8);f.photo.configure({focusMode:'continuous'});f.advance(.3);assert.equal(events.length,2);
 }finally{f.dispose();}
});
