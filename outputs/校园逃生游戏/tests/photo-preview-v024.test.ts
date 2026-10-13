import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewSize,previewTier} from '../src/photography/preview.ts';
import {photoFixture,withPhotoCanvas} from './photo-fixture.ts';

test('preview tiers preserve original portrait sizes and scale each platform consistently',()=>{
 const tiers=['high','medium','low'] as const;
 assert.deepEqual(tiers.map(tier=>previewSize(false,tier)),[[1440,960],[1080,720],[900,600]]);
 assert.deepEqual(tiers.map(tier=>previewSize(true,tier)),[[960,640],[720,480],[600,400]]);
 assert.deepEqual(tiers.map(tier=>previewSize(false,tier,true)),[[720,1080],[540,810],[450,675]]);
 assert.deepEqual(tiers.map(tier=>previewSize(true,tier,true)),[[480,720],[360,540],[300,450]]);
 assert.equal(previewTier('high',.7),'high');assert.equal(previewTier('smooth',1.5),'medium');
 assert.equal(previewTier('auto',1),'high');assert.equal(previewTier('auto',.8499999999999999),'medium');assert.equal(previewTier('auto',.7),'low');assert.equal(previewTier('auto',NaN),'high');
});

test('the production photo renderer allocates tier-sized preview buffers and releases old preview history',()=>{
 for(const mobile of[false,true]){const f=photoFixture({mobile});try{
  f.photo.setPreviewQuality('high');f.frame();assert.deepEqual([f.photo.snapshot().width,f.photo.snapshot().height],previewSize(mobile,'high'));
  const old=(f.photo as any).previous;let disposed=0;old.addEventListener('dispose',()=>disposed++);
  f.photo.setPreviewQuality('smooth');f.frame();assert.deepEqual([f.photo.snapshot().width,f.photo.snapshot().height],previewSize(mobile,'medium'));assert.equal(disposed,1,'a smaller preview does not retain the larger previous texture');
  f.photo.setPreviewQuality('auto',.7);f.frame();assert.equal(f.photo.snapshot().previewTier,'low');assert.deepEqual([f.photo.snapshot().width,f.photo.snapshot().height],previewSize(mobile,'low'));
  f.photo.configure({orientation:'portrait'});f.frame();assert.deepEqual([f.photo.snapshot().width,f.photo.snapshot().height],previewSize(mobile,'low',true));
  f.photo.close();assert.equal(f.photo.snapshot().width,0);assert.equal((f.photo as any).previous,null);
 }finally{f.dispose();}}
});

test('quality changes during real exposure and saving never resize the captured target or its depth uniforms',()=>withPhotoCanvas(async()=>{
 const f=photoFixture();let release:(()=>void)|undefined;
 try{
  f.photo.setPreviewQuality('smooth');f.frame();f.photo.configure({interface:'professional',mode:'M',focusMode:'manual',shutter:1,depthPreview:false});
  f.setExportRead(pixels=>new Promise(resolve=>{release=()=>resolve(pixels);}));const pending=f.photo.capture();f.frame();
  const target=(f.photo as any).output,sceneTarget=(f.photo as any).sceneTarget,accumulation=(f.photo as any).accumulation;
  assert.deepEqual([target.width,target.height],[1536,1024]);
  f.photo.setQuality(true);f.photo.setPreviewQuality('auto',.7);f.advance(.5);
  assert.equal((f.photo as any).output,target);assert.equal((f.photo as any).sceneTarget,sceneTarget);assert.equal((f.photo as any).accumulation,accumulation);
  assert.equal((f.photo as any).material.uniforms.useFocus.value,1);assert.equal((f.photo as any).material.uniforms.maxBlur.value,64);assert.equal((f.photo as any).material.uniforms.samples.value,24);
  f.advance(.6);assert.equal(f.photo.snapshot().state,'saving');f.photo.setPreviewQuality('high');f.frame();assert.equal((f.photo as any).output,target);
  release!();const record=await pending;assert.ok(record);assert.deepEqual([record.width,record.height],[1536,1024]);assert.equal(record.exposure.shutter,1);
  f.photo.setPreviewQuality('auto',.7);f.frame();assert.deepEqual([f.photo.snapshot().width,f.photo.snapshot().height],[600,400]);
 }finally{f.dispose();}
}));

test('low previews keep the existing desktop and mobile capture dimensions, including portrait',()=>withPhotoCanvas(async()=>{
 for(const [mobile,low,portrait,expected]of[[false,false,false,[2400,1600]],[true,false,true,[1024,1536]],[true,true,false,[1200,800]]] as const){
  const f=photoFixture({mobile});try{f.photo.setQuality(low);f.photo.setPreviewQuality('auto',.7);f.photo.configure({interface:'professional',mode:'M',focusMode:'manual',shutter:1/1000,orientation:portrait?'portrait':'landscape'});const pending=f.photo.capture();f.frame();const record=await pending;assert.ok(record);assert.deepEqual([record.width,record.height],expected);}finally{f.dispose();}
 }
}));

test('resuming a temporary capture never claims that its photo is saved',()=>withPhotoCanvas(async()=>{
 const f=photoFixture();try{f.photo.configure({interface:'professional',mode:'M',focusMode:'manual',shutter:1/1000});const pending=f.photo.capture();f.frame();assert.equal((await pending)?.storageStatus,'temporary');f.photo.pause();f.photo.resume();assert.match(f.photo.snapshot().message,/尚未保存/);assert.doesNotMatch(f.photo.snapshot().message,/保存在本机/);}finally{f.dispose();}
}));
