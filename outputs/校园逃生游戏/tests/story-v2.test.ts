import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StorySession,validateStoryCheckpoint} from '../src/story/session.ts';
import {STORY_STEPS,STORY_START,STORY_STAGE,INTRO_SHOTS,introCameraAt} from '../src/story/content.ts';
import type {StoryCheckpoint,StoryVec3} from '../src/story/types.ts';

/** Feedback acts like a deterministic navigation fixture; geometry is covered by map integration. */
function atTarget(s:StorySession){
  const initial=s.snapshot.step;
  for(let i=0;i<120;i++){
    const shot=s.snapshot;for(const a of shot.actors)s.setActorPosition(a.id,a.destination);
    s.update(.1,{position:shot.target?.position??STORY_START,photoOpen:false});
    if(s.snapshot.step!==initial||s.snapshot.canInteract)break;
  }
}
function tickToReady(s:StorySession){for(let i=0;i<100&&!s.snapshot.cooperation?.ready;i++)s.update(.1,{position:s.snapshot.target?.position??STORY_START,photoOpen:false});}
function play(s:StorySession,choice=0,stop='finished',skip=true){
  const seen=new Set<string>();let photos=0;
  for(let i=0;i<2000;i++){
    const snap=s.snapshot;seen.add(snap.step);if(snap.step===stop)return seen;
    if(snap.introActive){if(skip)s.skipIntro();else s.update(.5,{position:STORY_START,photoOpen:false});continue;}
    if(s.snapshot.guidance.active)s.guidance('skip');
    atTarget(s);
    seen.add(s.snapshot.step);if(s.snapshot.step===stop)return seen;
    if(s.snapshot.cinematicActive){if(skip)s.skipCinematic();else for(let t=0;t<40;t++)s.update(.5,{position:STORY_START,photoOpen:false});}
    if(s.snapshot.dialogue){s.advance();continue;}
    if(s.snapshot.step==='film-selection'){
      for(const p of [...s.snapshot.selected]){const index=s.snapshot.photos.findIndex(f=>f.id===p);s.choose(index);}
      const source=s.snapshot.photos;const indices=choice?source.map((_,i)=>i).slice(-3):[0,1,2];for(const index of indices)s.choose(index);s.interact();continue;
    }
    if(s.snapshot.options.length){s.choose(Math.min(choice,s.snapshot.options.length-1));continue;}
    if(s.snapshot.kind==='photo'){
      const t=s.snapshot.target!;const position:StoryVec3=[t.position[0],t.position[1]+1.63,t.position[2]];
      assert.equal(s.photographed({id:`photo-${choice}-${++photos}`,url:`/qa/photo-${photos}.jpg`,position,lookAt:t.lookAt,focalLength:24}),true,`photo failed at ${s.snapshot.step}`);continue;
    }
    if(s.snapshot.cooperation)tickToReady(s);
    if(s.snapshot.kind==='screening'){if(skip){s.skipToCredits();for(let f=0;f<12;f++)s.update(.5,{position:STORY_START,photoOpen:false});}else for(let f=0;f<110;f++)s.update(.5,{position:STORY_START,photoOpen:false});continue;}
    s.interact();
  }
  assert.fail(`Story stalled at ${s.snapshot.step}`);
}

test('both choices at every branch lead through all seven chapters and actual player photos to the same complete ending',()=>{
  const checkpoints:StoryCheckpoint[]=[];const a=new StorySession({onCheckpoint:c=>checkpoints.push(c)}),b=new StorySession();
  const pathA=play(a,0),pathB=play(b,1);
  assert.equal(a.snapshot.finished,true);assert.equal(b.snapshot.finished,true);
  for(const step of STORY_STEPS)assert.ok(pathA.has(step.id)&&pathB.has(step.id),`missing ${step.id}`);
  assert.ok(new Set(checkpoints.map(c=>STORY_STEPS.find(s=>s.id===c.step)!.chapter)).size===7);
  assert.equal(a.snapshot.film.length,3);assert.equal(b.snapshot.film.length,3);
  assert.notDeepEqual(a.snapshot.film.map(f=>f.title),b.snapshot.film.map(f=>f.title));
  assert.ok(a.snapshot.film.every(f=>f.photos.every(p=>a.snapshot.photos.some(actual=>actual.id===p.id))));
  assert.equal(a.snapshot.history.at(-1)?.text,'明天见。');
});
test('unskipped 90-second opening and full film use one visible clock; no advance occurs without update',()=>{
  const s=new StorySession();for(let i=0;i<100;i++)s.update(.5,{position:STORY_START,photoOpen:false});
  assert.equal(s.snapshot.introTime,50);assert.equal(s.snapshot.introActive,true);
  const saved=JSON.parse(s.export()),again=JSON.parse(s.export());
  assert.ok(again.savedAt>=saved.savedAt);delete saved.savedAt;delete again.savedAt;
  assert.deepEqual(again,saved);assert.equal(s.snapshot.introTime,50);
  for(let i=0;i<80;i++)s.update(.5,{position:STORY_START,photoOpen:false});
  assert.equal(s.snapshot.introActive,false);assert.equal(s.snapshot.step,'borrow-camera');
  play(s,0,'screening',false);const before=s.snapshot.screeningTime;s.update(.5,{position:STORY_START,photoOpen:true});assert.equal(s.snapshot.screeningTime,before);
  play(s,0,'finished',false);assert.equal(s.snapshot.finished,true);
  assert.equal(INTRO_SHOTS[0].time,0);assert.equal(INTRO_SHOTS.at(-1)?.time,90);
});
test('opening and skip share a stable new paving exit; the camera is received only after the handover dialogue',()=>{
  const s=new StorySession();assert.equal(s.snapshot.cameraReceived,false);assert.deepEqual(s.snapshot.introCamera,introCameraAt(0));
  const final=introCameraAt(90);assert.deepEqual(final.position,[STORY_START[0],STORY_START[1]+1.63,STORY_START[2]]);
  assert.deepEqual(introCameraAt(-10),introCameraAt(0));assert.deepEqual(introCameraAt(1000),final);
  s.skipIntro();assert.equal(s.snapshot.cameraReceived,false);while(s.snapshot.dialogue)s.advance();
  s.choose(0);assert.equal(s.snapshot.step,'courtyard-arrive');assert.equal(s.snapshot.cameraReceived,true);
  for(const a of new StorySession().snapshot.actors)assert.deepEqual(a.position,STORY_STAGE.actors[a.id]);
});
test('old opening saves migrate actors without changing the opening clock; later chapter physical positions remain intact',()=>{
  const old=new StorySession().checkpoint();old.introTime=41;old.actors[0].position=[-43,.18,-99.25];old.actors[0].destination=[-43,.18,-99.25];old.actors[1].position=[-47,.18,-98];old.actors[1].destination=[-47,.18,-98];
  const restored=new StorySession();restored.restore(old);assert.equal(restored.snapshot.introTime,41);assert.deepEqual(restored.snapshot.introCamera,introCameraAt(41));
  for(const a of restored.snapshot.actors)assert.deepEqual(a.position,STORY_STAGE.actors[a.id]);
  const later=new StorySession();play(later,0,'corridor-position');const checkpoint=later.checkpoint(),second=new StorySession();second.restore(checkpoint);assert.deepEqual(second.snapshot.actors,checkpoint.actors);
});

test('legacy camera-handover saves migrate actors to the paved stage without resetting dialogue progress',()=>{
 const s=new StorySession();s.skipIntro();s.advance();s.advance();s.update(.2,{position:STORY_START,photoOpen:false});const saved=s.checkpoint();
 for(const a of saved.actors){a.position=[-49,.18,-106];a.destination=[-49,.18,-106];}
 const restored=new StorySession();restored.restore(saved);
 assert.equal(restored.snapshot.step,'borrow-camera');assert.equal(restored.snapshot.cameraReceived,false);assert.equal(restored.checkpoint().line,saved.line);assert.equal(restored.checkpoint().revealed,saved.revealed);
 for(const a of restored.snapshot.actors){assert.deepEqual(a.position,STORY_STAGE.actors[a.id]);assert.deepEqual(a.destination,a.position);}
 assert.deepEqual(restored.checkpoint().actorRoutes,{});
});
test('camera up suspends typewriter, choices and dialogue without suspending actor motion',()=>{
  const s=new StorySession();s.skipIntro();s.update(.5,{position:STORY_START,photoOpen:true});assert.equal(s.snapshot.dialogue,null);
  const before=s.checkpoint();s.advance();s.choose(0);assert.equal(s.checkpoint().line,before.line);assert.equal(s.checkpoint().revealed,before.revealed);
  s.update(.04,{position:STORY_START,photoOpen:false});assert.equal(Array.from(s.snapshot.dialogue!.text).length,1);
  s.advance();assert.equal(s.snapshot.dialogue?.complete,true);s.advance();assert.equal(s.snapshot.dialogue?.speakerName,'许原');
});
test('photography task accepts real eye height but rejects other floors and subjects outside the frame',()=>{
  const s=new StorySession();play(s,0,'yard-first-shot');const t=s.snapshot.target!;
  assert.equal(s.photographed({id:'wrong-floor',position:[t.position[0],t.position[1]+5,t.position[2]],lookAt:t.lookAt}),false);
  assert.equal(s.snapshot.step,'yard-first-shot');
  assert.equal(s.photographed({id:'wrong-direction',position:[t.position[0],t.position[1]+1.63,t.position[2]],lookAt:t.lookAt!.map((v,i)=>2*(i===1?t.position[1]+1.63:t.position[i])-v) as [number,number,number]}),false);
  assert.equal(s.photographed({id:'correct',position:[t.position[0],t.position[1]+1.63,t.position[2]],lookAt:t.lookAt}),true);
  assert.equal(s.snapshot.step,'frame-outside');
});
test('cooperative hints never bypass timing; assistance needs two cycles and explicit consent',()=>{
  const s=new StorySession();play(s,0,'reflector-sync');while(s.snapshot.dialogue)s.advance();atTarget(s);
  const state=s.snapshot;assert.ok(state.cooperation);if(state.cooperation!.ready)s.update(3.5,{position:state.target!.position,photoOpen:false});
  for(let i=0;i<100;i++){s.update(.1,{position:state.target!.position,photoOpen:false});if(!s.snapshot.cooperation?.ready)break;}
  s.interact();assert.equal(s.snapshot.step,'reflector-sync');
  s.hint();s.hint();s.hint();assert.equal(s.snapshot.cooperation?.assisted,false);s.guidance('enable-sync');assert.equal(s.snapshot.cooperation?.assisted,false);for(let i=0;i<40;i++)s.update(.5,{position:state.target!.position,photoOpen:false});assert.equal(s.snapshot.cooperation?.canEnableAssist,true);s.guidance('enable-sync');assert.equal(s.snapshot.cooperation?.assisted,true);assert.equal(s.snapshot.cooperation?.ready,true);s.interact();assert.equal(s.snapshot.step,'reflector-capture');
});
test('external physics feedback owns positions and advances stair routes rather than teleporting actors',()=>{
  const s=new StorySession();play(s,0,'go-east-stair');const actor=s.snapshot.actors[0];
  s.setActorPosition(actor.id,[-77,.1,-61]);s.update(.5,{position:STORY_START,photoOpen:false});
  assert.deepEqual(s.snapshot.actors[0].position,[-77,.1,-61]);assert.notDeepEqual(s.snapshot.actors[0].position,s.snapshot.actors[0].destination);
  const first=s.snapshot.actors[0].destination;s.setActorPosition(actor.id,first);assert.notDeepEqual(s.snapshot.actors[0].destination,first);
  const restored=new StorySession();restored.restore(s.export());assert.deepEqual(restored.snapshot.actors,s.snapshot.actors);
});
test('export and restore preserve branch replies, film choices, clock and previous route progress',()=>{
  const s=new StorySession();play(s,1,'film-order');assert.equal(s.snapshot.options.length,2);s.choose(1);s.advance();
  const restored=new StorySession();restored.restore(s.export());assert.equal(restored.snapshot.dialogue?.fullText,s.snapshot.dialogue?.fullText);
  assert.equal(restored.snapshot.dialogue?.complete,s.snapshot.dialogue?.complete);restored.advance();assert.equal(restored.snapshot.step,'film-selection');
  play(restored,1);assert.equal(restored.snapshot.finished,true);assert.equal(restored.snapshot.film.length,3);
});
test('invalid imports are rejected atomically, valid checkpoints and snapshots are independent copies',()=>{
  const s=new StorySession();s.skipIntro();const {savedAt:beforeTime,...before}=s.checkpoint();assert.throws(()=>s.restore('{"format":"qisheng-story","version":500}'));const {savedAt:afterTime,...after}=s.checkpoint();assert.deepEqual(after,before);
  const saved=s.checkpoint();saved.flags.changed='yes';assert.equal(s.checkpoint().flags.changed,undefined);
  const view=s.snapshot;view.actors[0].position[0]=999;assert.notEqual(s.snapshot.actors[0].position[0],999);
  assert.throws(()=>validateStoryCheckpoint({...s.checkpoint(),actors:[]}));assert.throws(()=>validateStoryCheckpoint({...s.checkpoint(),actorRoutes:{'lin-cen':[[NaN,0,0]]}}));
});
test('no withdrawn private clip exists in the story data or film; selection has no morality score',()=>{
  assert.ok(STORY_STEPS.find(s=>s.id==='consent-dialogue')?.lines?.some(l=>l.text==='那段还是别放了。'));
  assert.ok(STORY_STEPS.every(s=>!JSON.stringify(s).includes('private-clip')));
  const s=new StorySession();play(s);assert.ok(s.snapshot.photos.every(p=>p.label!=='撤回片段'));assert.equal('score' in s.snapshot,false);
});
test('twenty-second camera move gates dialogue, freezes when not updated, can be skipped and replays after restore',()=>{
  const s=new StorySession();play(s,0,'longshot-end');assert.equal(s.snapshot.cinematicActive,true);
  s.advance();assert.equal(s.snapshot.dialogue?.complete,true);const line=s.checkpoint().line;
  for(let i=0;i<30;i++)s.advance();assert.equal(s.checkpoint().line,line);assert.equal(s.snapshot.step,'longshot-end');
  for(let i=0;i<39;i++)s.update(.5,{position:STORY_START,photoOpen:false});assert.equal(s.snapshot.cinematicTime,19.5);s.advance();assert.equal(s.checkpoint().line,line);
  const saved=s.export();s.update(.5,{position:STORY_START,photoOpen:true});assert.equal(s.snapshot.cinematicTime,19.5);
  const restored=new StorySession();restored.restore(saved);assert.equal(restored.snapshot.cinematicTime,0);assert.equal(restored.snapshot.cinematicActive,true);
  restored.skipCinematic();assert.equal(restored.snapshot.cinematicTime,20);assert.equal(restored.snapshot.cinematicActive,false);assert.equal(restored.checkpoint().line,line);restored.advance();assert.equal(restored.checkpoint().line,line+1);
  s.update(.5,{position:STORY_START,photoOpen:false});assert.equal(s.snapshot.cinematicActive,false);s.advance();assert.equal(s.checkpoint().line,line+1);
  assert.throws(()=>validateStoryCheckpoint({...s.checkpoint(),cinematicTime:21}));
});

test('skip to credits displays the six-second names segment before the ending conversation',()=>{
 const s=new StorySession();play(s,0,'screening');const count=s.snapshot.film.length;
 s.skipToCredits();assert.equal(s.snapshot.step,'screening');assert.equal(s.snapshot.screeningTime,count*7);
 for(let i=0;i<11;i++)s.update(.5,{position:STORY_START,photoOpen:false});assert.equal(s.snapshot.step,'screening');
 s.update(.5,{position:STORY_START,photoOpen:false});assert.equal(s.snapshot.step,'screening-end');assert.equal(s.snapshot.dialogue?.fullText,'我看见名字了。');
});

test('interaction and advance cannot skip screening or its full six-second names segment',()=>{
 const s=new StorySession(),cp=s.checkpoint();cp.step='screening';cp.flags.guideStage='skipped';cp.photos=Array.from({length:3},(_,i)=>({id:`screen-${i}`,url:`/qa/screen-${i}.jpg`,position:[...STORY_START] as StoryVec3}));cp.selected=cp.photos.map(p=>p.id);s.restore(cp);
 for(let i=0;i<10;i++){s.interact();s.advance();}assert.equal(s.snapshot.step,'screening');assert.equal(s.snapshot.screeningTime,0);
 s.skipToCredits();const credits=s.snapshot.screeningTime;assert.equal(credits,21);
 for(let i=0;i<11;i++){s.interact();s.advance();s.update(.5,{position:STORY_START,photoOpen:false});}
 assert.equal(s.snapshot.step,'screening');assert.equal(s.snapshot.screeningTime,credits+5.5);
 s.skipToCredits();s.interact();s.advance();assert.equal(s.snapshot.screeningTime,credits+5.5);assert.equal(s.snapshot.step,'screening');
 s.update(.5,{position:STORY_START,photoOpen:false});assert.equal(s.snapshot.step,'screening-end');assert.equal(s.snapshot.dialogue?.fullText,'我看见名字了。');
});

test('screening without image sources waits for reconciliation, then returns to selection for replacement photographs',()=>{
 const s=new StorySession(),cp=s.checkpoint();cp.step='screening';cp.flags.guideStage='skipped';s.restore(cp);
 assert.equal(s.snapshot.screeningDuration,6);s.interact();s.advance();assert.equal(s.snapshot.step,'screening');
 for(let i=0;i<24;i++)s.update(.5,{position:STORY_START,photoOpen:false});assert.equal(s.snapshot.step,'screening');assert.equal(s.snapshot.screeningTime,0);
 s.reconcileAvailablePhotos([]);assert.equal(s.snapshot.step,'film-selection');assert.equal(s.snapshot.film.length,0);assert.match(s.snapshot.notice,/重新选至少三张/);
 s.interact();assert.equal(s.snapshot.step,'film-selection');
 for(let i=0;i<3;i++){s.photographed({id:`replacement-${i}`,position:[...STORY_START] as StoryVec3,url:`/qa/replacement-${i}.jpg`});s.choose(i);}
 assert.equal(s.snapshot.film.length,3);s.interact();assert.equal(s.snapshot.step,'screening');for(let i=0;i<53;i++)s.update(.5,{position:STORY_START,photoOpen:false});assert.equal(s.snapshot.step,'screening');s.update(.5,{position:STORY_START,photoOpen:false});assert.equal(s.snapshot.step,'screening-end');
});
