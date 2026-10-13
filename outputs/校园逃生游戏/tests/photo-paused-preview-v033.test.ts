import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {photoFixture,focusWall,withPhotoCanvas} from './photo-fixture.ts';

test('fixed-world parameter preview uses new aperture/focus without advancing AF, exposure or capture quality',async()=>{
 let exposures=0,evidence=0;const f=photoFixture({onExposureStarted:()=>exposures++,captureEvidence:()=>{evidence++;return undefined;}},focusWall().scene);
 try{
  f.frame();const before=f.photo.snapshot(),time=(f.photo as any).elapsed;f.photo.pause();f.photo.configure({interface:'professional',mode:'M',aperture:4,focusMode:'manual',focusDistance:3,shutter:1/30});
  for(let i=0;i<20;i++)assert.equal(f.photo.renderPausedPreview(f.camera),true);
  const state=f.photo.snapshot(),uniforms=(f.photo as any).material.uniforms;assert.equal(state.state,'paused');assert.equal(state.focusState,'idle');assert.equal(state.shutterPending,false);assert.equal(uniforms.aperture.value,4);assert.equal(uniforms.focusDistance.value,3);assert.equal(uniforms.motionAmount.value,0);assert.equal((f.photo as any).elapsed,time);assert.equal(exposures,0);assert.equal(evidence,0);assert.equal(state.previewWidth,before.previewWidth);assert.equal(state.previewHeight,before.previewHeight);assert.deepEqual(f.scenePoses.at(-1),f.camera.position.toArray());assert.equal(await f.photo.capture(),null);
 }finally{f.dispose();}
});
test('paused preview falls back to the last frame while view resources are unavailable',()=>{
 const f=photoFixture();try{f.frame();f.photo.pause();f.photo.setViewStatus({ready:false,failed:true,progress:.6});const count=f.scenePoses.length;f.camera.position.set(8,2,5);assert.equal(f.photo.renderPausedPreview(f.camera),true);assert.equal(f.scenePoses.length,count);assert.equal(f.photo.snapshot().state,'paused');}finally{f.dispose();}
});
test('releasing the parameter panel preserves original final-photo dimensions',async()=>withPhotoCanvas(async()=>{
 const f=photoFixture();try{f.frame();f.photo.pause();f.photo.configure({interface:'professional',mode:'M',focusMode:'manual',focusDistance:10,shutter:1/125});f.photo.renderPausedPreview(f.camera);f.photo.resume();const shot=f.photo.capture();f.advance(.2);const record=await shot;assert.ok(record);assert.equal(record.width,1536);assert.equal(record.height,1024);assert.equal(record.settings.focusDistance,10);assert.equal(record.exposure.shutter,1/125);}finally{f.dispose();}
}));
test('a GPU render failure closes the camera and retains an actionable reopen message',()=>{
 const f=photoFixture();try{const renderer=(f.photo as any).renderer;renderer.render=()=>{throw Error('GPU details');};assert.equal(f.frame(),false);assert.equal(f.photo.snapshot().open,false);assert.match(f.photo.snapshot().message,/重新打开相机/);assert.doesNotMatch(f.photo.snapshot().message,/GPU/);assert.equal((f.photo as any).sceneTarget,null);}finally{f.dispose();}
});
test('render preparation allocation failure follows the same camera recovery path',()=>{
 const f=photoFixture();try{(f.photo as any).allocate=()=>{throw Error('allocation');};assert.equal(f.frame(),false);assert.equal(f.photo.snapshot().open,false);assert.match(f.photo.snapshot().message,/重新打开相机/);}finally{f.dispose();}
});
