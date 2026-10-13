import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StorySession,validateStoryCheckpoint} from '../src/story/session.ts';
import {deviceGuidance} from '../src/story/guidance.ts';

function screening(){const cp=new StorySession().checkpoint();cp.step='screening';cp.introTime=90;cp.screeningTime=20;cp.photos=[0,1,2].map(i=>({id:`p${i}`,position:[0,0,0] as [number,number,number],url:`blob:old-${i}`}));cp.selected=cp.photos.map(p=>p.id);return cp;}
test('screening waits for restored sources instead of consuming a six-second empty film',()=>{
  const original=new StorySession();original.restore(screening());const cp=original.checkpoint(),restored=new StorySession();restored.restore(cp);
  restored.update(.5,{position:[0,0,0],photoOpen:false});assert.equal(restored.snapshot.step,'screening');assert.equal(restored.snapshot.screeningTime,20);
  restored.reconcileAvailablePhotos(cp.photos.map(p=>({id:p.id,url:`/test/${p.id}.jpg`})));assert.equal(restored.snapshot.film.length,3);
  restored.update(.5,{position:[0,0,0],photoOpen:false});assert.equal(restored.snapshot.screeningTime,20.5);assert.equal(restored.snapshot.step,'screening');
});
test('missing selected photographs return to usable selection and never silently complete screening',()=>{
  const restored=new StorySession();restored.restore(screening());restored.reconcileAvailablePhotos([{id:'p0',url:'/test/p0.jpg'}]);
  assert.equal(restored.snapshot.step,'film-selection');assert.deepEqual(restored.snapshot.selected,['p0']);assert.match(restored.snapshot.notice,/重新选至少三张/);
  restored.update(.5,{position:[0,0,0],photoOpen:false});assert.equal(restored.snapshot.step,'film-selection');
});
test('old version-one saves default missing cooperation time, and invalid time or fractional indexes are rejected',()=>{
  const cp=new StorySession().checkpoint();delete cp.cooperationTime;const old=validateStoryCheckpoint(cp);const restored=new StorySession();restored.restore(old);assert.equal(restored.checkpoint().cooperationTime,0);
  for(const value of ['bad',-1,Infinity,NaN,86401])assert.throws(()=>validateStoryCheckpoint({...cp,cooperationTime:value}),/协作时间/);
  for(const field of ['line','revealed','hintLevel'])assert.throws(()=>validateStoryCheckpoint({...cp,[field]:.5}),/对白位置/);
});
test('focus teaching uses the actual device controls and allows the automatic shutter path',()=>{
  const cp=new StorySession().checkpoint();cp.step='yard-first-shot';cp.flags.guideStage='focus';const story=new StorySession();story.restore(cp);const guide=story.snapshot.guidance;
  const desktop=deviceGuidance(guide,false),mobile=deviceGuidance(guide,true);
  assert.match(desktop.body,/按住 F 对焦/);assert.doesNotMatch(desktop.body,/空格/);assert.match(deviceGuidance({...guide,stage:'shutter'},false).body,/空格/);assert.doesNotMatch(desktop.body,/点一下|“对焦”/);
  assert.match(mobile.body,/按住“对焦”/);assert.doesNotMatch(mobile.body,/F|空格/);assert.doesNotMatch(mobile.body,/自动对焦|快门/);assert.match(deviceGuidance({...guide,stage:'shutter'},true).body,/快门/);story.guidance('focused');assert.equal(story.snapshot.guidance.stage,'shutter','automatic or explicit successful autofocus advances the same teaching stage');
});
