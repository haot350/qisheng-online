import test from 'node:test';
import assert from 'node:assert/strict';
import {startupPrimeKind,silentStartupPrimeEvidence} from '../scripts/qa-native-audio-prime.mjs';

const runUrl='http://127.0.0.1:5181/audio/run.mp3';
const storyUrls=['childhood','aphelion','golden-hour'].map(name=>`http://127.0.0.1:5181/story/audio/${name}.mp3`);
const sources={runUrl,storyUrls};
const time=milliseconds=>new Date(Date.parse('2026-10-05T11:30:17.000Z')+milliseconds).toISOString();
function fixture(mode='dafei'){
 const url=mode==='story'?storyUrls[0]:runUrl;
 const event=(type,milliseconds,extra={})=>({at:time(milliseconds),type,id:4,src:url,
  paused:true,playing:false,audible:false,currentTime:0,volume:0,readyState:4,error:null,...extra});
 // Observed driving restart order: pause() precedes its queued playing event.
 const events=[event('play-call',487,{readyState:0}),event('pause-call',640,{currentTime:.088463}),
  event('playing',642,{currentTime:.088463}),event('pause',657,{readyState:1}),
  event('play-call',658),event('playing',662,{paused:false,playing:true,audible:true,volume:.027386})];
 const requestStarted={cycle:2,mode,stage:'restart',url,resourceType:'media',at:time(560)};
 const cancelled={cycle:2,mode,stage:'restart',url,resourceType:'media',message:'net::ERR_ABORTED',at:time(662),requestStarted};
 return {events,cancelled};
}
function verify(value){return silentStartupPrimeEvidence(value.cancelled,value.events,sources);}

test('verified driving silent prime accepts queued playing after pause-call and same-ms recovery',()=>{
 const evidence=verify(fixture());
 assert.ok(evidence);assert.equal(evidence.id,4);assert.equal(evidence.restoredPosition,0);
 assert.equal(evidence.silentPlayingQueuedAfterPause,true);
 assert.equal(evidence.actualPlayingAt,time(662));
});
test('story prime accepts the ordinary playing before pause-call order',()=>{
 const value=fixture('story');
 value.events[2]={...value.events[2],at:time(620),paused:false,playing:true};
 [value.events[1],value.events[2]]=[value.events[2],value.events[1]];
 const evidence=verify(value);assert.ok(evidence);assert.equal(evidence.silentPlayingQueuedAfterPause,false);
});
test('only exact media aborts with matching startup ownership become candidates',()=>{
 const {cancelled}=fixture();
 assert.equal(startupPrimeKind(cancelled,sources),'cancelled-driving-silent-startup-prime');
 const changes=[{message:'net::ERR_FAILED'},{resourceType:'fetch'},{url:runUrl+'?different'},
  {mode:'roam'},{stage:'story-resume'},{cycle:3},
  {requestStarted:{...cancelled.requestStarted,stage:'first-start'}},
  {requestStarted:{...cancelled.requestStarted,url:storyUrls[0]}}];
 for(const change of changes)assert.equal(startupPrimeKind({...cancelled,...change},sources),null);
});
test('audible state or nonzero volume before verified cleanup cannot be waived',()=>{
 for(const change of [{audible:true},{volume:.15}]){
  const value=fixture();Object.assign(value.events[2],change);assert.equal(verify(value),null);
 }
});
test('prime play, native pause, position reset and distinct replay must all be present',()=>{
 for(const index of [0,2,3,4]){
  const value=fixture();value.events.splice(index,1);assert.equal(verify(value),null);
 }
 const value=fixture();value.events[3].currentTime=.3;assert.equal(verify(value),null);
});
test('audible replay must use the exact original native element and source',()=>{
 for(const change of [{id:5},{src:storyUrls[0]},{error:3}]){
  const value=fixture();Object.assign(value.events[5],change);assert.equal(verify(value),null);
 }
});
test('a request initiated by the real replay stays a failure',()=>{
 const value=fixture();value.cancelled.requestStarted.at=time(658);assert.equal(verify(value),null);
});
test('a native media error remains fatal even after successful audible recovery',()=>{
 const value=fixture();value.events.push({...value.events[5],type:'error',at:time(700),error:3});
 assert.equal(verify(value),null);
});
test('a source release between prime and replay cannot substitute for a retained slot',()=>{
 const value=fixture();value.events.splice(4,0,{...value.events[3],type:'emptied',src:'',at:time(657)});
 assert.equal(verify(value),null);
});
test('audible playback before the cancellation timestamp cannot be waived',()=>{
 const value=fixture();value.cancelled.at=time(663);assert.equal(verify(value),null);
});
test('stale cleanup, invalid timestamps and absent audible recovery stay failures',()=>{
 const stale=fixture();stale.cancelled.at=time(2000);assert.equal(verify(stale),null);
 const invalid=fixture();invalid.events[0].at='invalid';assert.equal(verify(invalid),null);
 const missing=fixture();missing.events.pop();assert.equal(verify(missing),null);
});

