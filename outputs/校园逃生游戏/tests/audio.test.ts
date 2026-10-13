import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GameAudio} from '../src/audio.ts';
import {staticAssetUrl} from '../src/static-assets.ts';

class Param {
  value=0;
  values:number[]=[];
  setValueAtTime(v:number){this.value=v;this.values.push(v);}
  exponentialRampToValueAtTime(v:number){this.value=v;this.values.push(v);}
  setTargetAtTime(v:number){this.value=v;this.values.push(v);}
}
class Node {
  disconnected=0;
  connections:Node[]=[];
  connect(node:Node){this.connections.push(node);return node;}
  disconnect(){this.disconnected++;}
}
class Source extends Node {
  starts:number[]=[];stops:number[]=[];onended:(()=>void)|null=null;
  frequency=new Param();type='';buffer:unknown;
  start(t:number){this.starts.push(t);}
  stop(t:number){this.stops.push(t);}
}
class Context {
  static latest:Context;
  state='running';currentTime=10;sampleRate=1000;destination=new Node();
  sources:Source[]=[];nodes:Node[]=[];closed=false;
  constructor(){Context.latest=this;}
  createGain(){const n=Object.assign(new Node(),{gain:new Param()});this.nodes.push(n);return n;}
  createBiquadFilter(){const n=Object.assign(new Node(),{frequency:new Param(),type:''});this.nodes.push(n);return n;}
  createStereoPanner(){const n=Object.assign(new Node(),{pan:new Param()});this.nodes.push(n);return n;}
  createOscillator(){const n=new Source();this.sources.push(n);return n;}
  createBufferSource(){const n=new Source();this.sources.push(n);return n;}
  createBuffer(_channels:number,size:number){return{getChannelData:()=>new Float32Array(size)};}
  async resume(){this.state='running';}
  async close(){this.closed=true;this.state='closed';}
}
class Media {
  static latest:Media;
  static created:Media[]=[];
  paused=true;currentTime=0;volume=0;preload='';loop=false;playCalls=0;
  loadCalls=0;
  constructor(public src=''){Media.latest=this;Media.created.push(this);}
  addEventListener(){} removeEventListener(){} removeAttribute(){this.src='';} load(){this.loadCalls++;}
  async play(){this.playCalls++;this.paused=false;}
  pause(){this.paused=true;}
}
async function fixture(run:(audio:GameAudio,context:Context,media:Media)=>Promise<void>|void,effectsOnly=false){
  const windowDescriptor=Object.getOwnPropertyDescriptor(globalThis,'window'),audioDescriptor=Object.getOwnPropertyDescriptor(globalThis,'Audio');
  Object.defineProperty(globalThis,'window',{configurable:true,value:{AudioContext:Context}});
  Object.defineProperty(globalThis,'Audio',{configurable:true,value:Media});
  Media.created=[];
  const audio=new GameAudio();
  try{if(effectsOnly)await audio.unlockEffects();else{await audio.unlock();audio.update(0,false);}await run(audio,Context.latest,Media.latest);}
  finally{audio.dispose();if(windowDescriptor)Object.defineProperty(globalThis,'window',windowDescriptor);else Reflect.deleteProperty(globalThis,'window');if(audioDescriptor)Object.defineProperty(globalThis,'Audio',audioDescriptor);else Reflect.deleteProperty(globalThis,'Audio');}
}
const immediateStop=(source:Source,time:number)=>{
  assert.equal(source.stops.at(-1),time);
  assert.equal(source.disconnected,1);
  assert.equal(source.onended,null);
};

test('pause cancels playing and future reload sounds while retaining music position',async()=>fixture((audio,c,media)=>{
  audio.cue('reload');assert.equal(c.sources.length,2);assert.equal(c.sources[1].starts[0],10.27);
  media.currentTime=19.25;audio.update(0,true);
  c.sources.forEach(s=>immediateStop(s,c.currentTime));assert.equal(media.paused,true);assert.equal(media.currentTime,19.25);
  audio.cue('reload');assert.equal(c.sources.length,2,'paused effects must not schedule more sources');
}));

test('reset cancels delayed sounds and restarts music from zero without old-round nodes',async()=>fixture((audio,c,media)=>{
  audio.cue('pickup');const old=[...c.sources];media.currentTime=31;audio.reset();
  old.forEach(s=>immediateStop(s,c.currentTime));assert.equal(media.currentTime,0);assert.equal(media.paused,true);
  audio.update(0,false);audio.cue('hit');assert.equal(c.sources.length,3);assert.equal(c.sources[2].disconnected,0);
  audio.reset();immediateStop(c.sources[2],c.currentTime);old.forEach(s=>assert.equal(s.disconnected,1));
}));

test('finish replaces game sounds with one result cue and pause or restart can cancel that cue',async()=>fixture((audio,c,media)=>{
  audio.run();audio.update(.1,false);audio.cue('reload');const old=[...c.sources];
  audio.finish(true);old.forEach(s=>immediateStop(s,c.currentTime));
  const win=c.sources.slice(old.length);assert.equal(win.length,4);assert.ok(win[3].starts[0]>c.currentTime);assert.equal(media.paused,true);assert.equal(media.currentTime,0);
  audio.step('road',false);assert.equal(c.sources.length,6,'game sounds stay disabled on the result screen');
  audio.finish(false);win.forEach(s=>immediateStop(s,c.currentTime));const lose=c.sources.slice(-2);assert.equal(lose.length,2);
  audio.update(0,true);lose.forEach(s=>immediateStop(s,c.currentTime));
  audio.finish(true);const final=c.sources.slice(-4);audio.reset();final.forEach(s=>immediateStop(s,c.currentTime));
}));

test('the running song outlasts the 12-second boost, pauses its 60-second budget, and resumes in place',async()=>fixture(async(audio,_c,media)=>{
  const advance=(seconds:number,paused=false)=>{for(let i=0;i<Math.round(seconds*10);i++)audio.update(.1,paused);};
  audio.run();advance(12);await Promise.resolve();assert.equal(media.paused,false);assert.ok(media.volume>.3);
  media.currentTime=12;advance(30,true);assert.equal(media.currentTime,12);assert.equal(media.paused,true);
  await audio.unlock();audio.update(0,false);await Promise.resolve();assert.equal(media.currentTime,12);
  advance(46);assert.equal(media.paused,false,'the paused half-minute must not consume the music budget');
  advance(4);await Promise.resolve();assert.equal(media.paused,true);assert.ok(media.volume<.002);
}));

test('normal endings release their graph once, and dispose stops every remaining source',async()=>fixture((audio,c)=>{
  audio.cue('hit');const completed=c.sources[0];completed.onended?.();assert.equal(completed.disconnected,1);
  audio.cue('reload');const pending=c.sources.slice(1);audio.dispose();pending.forEach(s=>immediateStop(s,c.currentTime));
  assert.equal(completed.disconnected,1);assert.equal(completed.stops.length,1,'naturally ended source should not be stopped again');assert.equal(c.closed,true);
  audio.finish(true);audio.cue('reload');assert.equal(c.sources.length,3);
}));

test('a hung music play promise cannot block audio unlock and surfaces a retryable error after its deadline',async t=>fixture(async(audio,_c,media)=>{
  t.mock.timers.enable({apis:['setTimeout']});media.play=()=>new Promise<void>(()=>{});
  await audio.unlock();assert.equal(audio.error,false);audio.run();audio.update(.1,false);
  t.mock.timers.tick(12000);await Promise.resolve();await Promise.resolve();assert.equal(audio.error,true);
  audio.reset();audio.update(.1,false);assert.equal(media.paused,true);
}));
test('intentionally pausing a pending unlock does not report music failure, but autoplay denial still does',async()=>fixture(async(audio,_c,media)=>{
  let rejectPending!:(error:Error)=>void;
  media.play=()=>new Promise<void>((_resolve,reject)=>{rejectPending=reject;});
  media.pause=()=>{media.paused=true;rejectPending?.(new DOMException('play was interrupted by pause','AbortError'));};
  await audio.unlock();audio.update(.016,false);await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(audio.error,false,'an intentional pause with no running music budget is successful lifecycle handling');
  media.play=()=>Promise.reject(new DOMException('autoplay denied','NotAllowedError'));
  await audio.unlock();audio.update(.016,false);await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(audio.error,true,'a real autoplay failure must remain retryable');
}));

test('five firearms have distinct local sound graphs and NPC sound follows listener orientation',async()=>fixture((audio,c)=>{
 audio.setListener({x:0,y:1,z:0},{x:0,y:0,z:-1});
 const punches:number[]=[];
 for(const id of ['glock','mp5','m4a1','ak47','r870']){const start=c.sources.length;audio.shot(id,10,{x:10,y:1,z:0});assert.equal(c.sources.length-start,4);punches.push(c.sources[start+1].frequency.values[0]);}
 assert.equal(new Set(punches).size,5,'each firearm has its own pressure body pitch');
 const panners=c.nodes.filter(n=>'pan'in n) as (Node&{pan:Param})[];assert.ok(panners.every(n=>n.pan.value>.8));
 audio.setListener({x:0,y:1,z:0},{x:0,y:0,z:1});audio.shot('ak47',10,{x:10,y:1,z:0});assert.ok((c.nodes.filter(n=>'pan'in n).at(-1) as Node&{pan:Param}).pan.value<-.8);
 audio.update(0,true);assert.ok(c.nodes.filter(n=>'pan'in n).every(n=>n.disconnected===1));
}));

test('shell and magazine mechanical cues are cancelled together when a round pauses',async()=>fixture((audio,c)=>{
 audio.mechanical('r870','shell');audio.mechanical('m4a1','mag-in');audio.mechanical('r870','pump');const sources=[...c.sources];assert.equal(sources.length,6);assert.ok(sources.at(-1)!.starts[0]>c.currentTime);
 audio.update(0,true);sources.forEach(s=>immediateStop(s,c.currentTime));audio.mechanical('r870','shell');assert.equal(c.sources.length,sources.length);
}));

test('driving music loops for the round, pause preserves position and reset disables the loop until selected again',async()=>fixture(async(audio,c,media)=>{
 audio.setMusicMode('driving');for(let i=0;i<900;i++)audio.update(.1,false);await Promise.resolve();assert.equal(media.paused,false);assert.ok(media.volume>.2);
 media.currentTime=67.25;audio.engine(14,.8,.016);const graph=[...c.sources];assert.equal(graph.length,3);
 for(let i=0;i<20;i++)audio.engine(18,1,.016);assert.equal(c.sources.length,3,'continuous motor reuses its graph');
 audio.update(.1,true);assert.equal(media.currentTime,67.25);graph.forEach(s=>immediateStop(s,c.currentTime));
 await audio.unlock();audio.update(.1,false);audio.engine(8,.5,.016);assert.equal(c.sources.length,6);assert.equal(media.currentTime,67.25);
 const resumed=c.sources.slice(3);audio.reset();resumed.forEach(s=>immediateStop(s,c.currentTime));assert.equal(media.currentTime,0);
 audio.update(.1,false);await Promise.resolve();assert.equal(media.paused,true,'reset must not leave driving music enabled on a menu/result');
}));

test('vehicle sound pitch responds to speed and throttle; returning to walking clears its sources',async()=>fixture((audio,c)=>{
 audio.setMusicMode('driving');audio.engine(0,0,.016,{rpm:900,shiftLeft:0});const low=c.sources[0],idle=low.frequency.value;
 audio.engine(22,1,.016,{rpm:4800,shiftLeft:0});assert.ok(low.frequency.value>idle);assert.equal(c.sources.length,3);
 audio.vehicleCue('impact');audio.vehicleCue('brake');audio.vehicleCue('guide');assert.equal(c.sources.length,8);
 const engine=c.sources.slice(0,3);audio.setMusicMode('run');engine.forEach(s=>immediateStop(s,c.currentTime));
 const count=c.sources.length;audio.engine(10,1,.016);assert.equal(c.sources.length,count);
 audio.update(0,true);c.sources.slice(3).forEach(s=>immediateStop(s,c.currentTime));
}));

test('intro guide is audible from a user action on a paused menu without starting music or engine',async()=>fixture((audio,c,media)=>{
 audio.reset();const musicCalls=media.playCalls;audio.guide();assert.equal(c.sources.length,2);assert.equal(media.playCalls,musicCalls);assert.equal(media.currentTime,0);assert.equal(media.paused,true);
 audio.engine(12,1,.016);assert.equal(c.sources.length,2);audio.vehicleCue('impact');assert.equal(c.sources.length,2,'the temporary menu-cue permission does not enable gameplay sounds');
 audio.update(0,true);c.sources.forEach(s=>immediateStop(s,c.currentTime));
}));

test('construction and intro effects unlock create no running media; driving start creates it on demand',async()=>fixture(async(audio,c)=>{
  assert.equal(Media.created.length,0);assert.equal(audio.isMusicPlaying,false);assert.equal(audio.diagnostics().src,'');
  audio.guide();assert.equal(c.sources.length,2);assert.equal(Media.created.length,0);
  await audio.unlockEffects();audio.guide();assert.equal(Media.created.length,0);
  await audio.unlock();audio.setMusicMode('driving');audio.update(.1,false);
  await new Promise<void>(resolve=>setImmediate(resolve));
  const media=Media.latest;assert.equal(Media.created.length,1);assert.equal(media.src,staticAssetUrl('/audio/run.mp3'));
 assert.ok(media.playCalls>0);assert.equal(audio.isMusicPlaying,true);
 audio.reset();assert.equal(audio.isMusicPlaying,false);
},true));

test('roaming focus and shutter cues use effects only and respect pause without creating running media',async()=>fixture((audio,c)=>{
 assert.equal(Media.created.length,0);audio.update(0,false);
 audio.cameraCue('focus');assert.equal(c.sources.length,2);assert.equal(c.sources[0].frequency.value,1046.5);assert.equal(c.sources[1].frequency.value,1396.9);
 audio.cameraCue('shutter');assert.equal(c.sources.length,4);assert.equal(Media.created.length,0);assert.equal(audio.diagnostics().src,'');
 audio.update(0,true);c.sources.forEach(s=>immediateStop(s,c.currentTime));audio.cameraCue('focus');audio.cameraCue('shutter');assert.equal(c.sources.length,4);assert.equal(Media.created.length,0);
},true));

test('late playback from an old round is silenced without stopping the current driving slot',async()=>fixture(async(audio,_c,old)=>{
 let resolveOld!:()=>void;old.play=()=>new Promise<void>(resolve=>{resolveOld=()=>{old.paused=false;resolve();};});
 audio.run();audio.update(.1,false);assert.equal(audio.diagnostics().pending,true);
 audio.reset();assert.equal(old.src,'');assert.equal(old.paused,true);assert.equal(audio.diagnostics().src,'');
 await audio.unlock();audio.setMusicMode('driving');audio.update(.1,false);await new Promise<void>(resolve=>setImmediate(resolve));
 const current=Media.latest;assert.notEqual(current,old);assert.equal(current.paused,false);
 resolveOld();await new Promise<void>(resolve=>setImmediate(resolve));
 assert.equal(old.paused,true);assert.equal(old.volume,0);assert.equal(old.src,'');assert.equal(current.paused,false);assert.equal(audio.diagnostics().playingCount,1);
}));

test('music mute cancels a pending play immediately and late completion stays silent',async()=>fixture(async(audio,_c,media)=>{
 let resolve!:()=>void;media.play=()=>new Promise<void>(done=>{resolve=()=>{media.paused=false;done();};});
 audio.run();audio.update(.1,false);media.currentTime=22;audio.setVolumes(0,.75);
 assert.equal(media.paused,true);assert.equal(media.volume,0);assert.equal(audio.diagnostics().pending,false);
 resolve();await new Promise<void>(done=>setImmediate(done));assert.equal(media.paused,true);assert.equal(media.currentTime,22);
 const calls=Media.created.length;audio.update(.1,false);assert.equal(Media.created.length,calls);assert.equal(media.volume,0);
}));

test('pause releases a hung request so resume can start music before the old request settles',async()=>fixture(async(audio,_c,media)=>{
 let resolveOld!:()=>void;media.play=()=>new Promise<void>(done=>{resolveOld=()=>{media.paused=false;done();};});
 audio.run();audio.update(.1,false);audio.update(0,true);assert.equal(audio.diagnostics().pending,false);
 media.play=async()=>{media.playCalls++;media.paused=false;};await audio.unlock();audio.update(.1,false);await new Promise<void>(done=>setImmediate(done));
 assert.equal(media.paused,false);resolveOld();await new Promise<void>(done=>setImmediate(done));assert.equal(media.paused,false);assert.equal(audio.error,false);
}));

test('silent running music priming preserves the beginning and a paused playback position',async()=>fixture(async(audio,_c,media)=>{
 audio.update(0,true);media.currentTime=0;let resolve!:()=>void;
 media.play=()=>new Promise<void>(done=>{resolve=()=>{media.paused=false;done();};});
 await audio.unlock();media.currentTime=.4;resolve();await new Promise<void>(done=>setImmediate(done));assert.equal(media.currentTime,0);assert.equal(media.paused,true);
 media.currentTime=28.5;await audio.unlock();media.currentTime=28.7;resolve();await new Promise<void>(done=>setImmediate(done));assert.equal(media.currentTime,28.5);assert.equal(media.paused,true);
}));

test('skill cues are directional non-verbal effects and pause cancels them',async()=>fixture((audio,c)=>{
 audio.setListener({x:0,y:1,z:0},{x:0,y:0,z:-1});
 for(const kind of ['principal','sprint','callout'] as const)audio.npcCue(kind,{x:12,y:1,z:0});
 assert.equal(c.sources.length,6);assert.ok((c.nodes.filter(n=>'pan'in n) as (Node&{pan:Param})[]).every(n=>n.pan.value>.8));
 audio.update(0,true);c.sources.forEach(s=>immediateStop(s,c.currentTime));audio.npcCue('callout');assert.equal(c.sources.length,6);
}));

test('tyre sound follows real sideways slip, has bounded cadence, and restart clears old graphs',async()=>fixture((audio,c)=>{
 audio.setMusicMode('driving');for(let i=0;i<60;i++)audio.tires(0,.2,1/60);assert.equal(c.sources.length,0);
 for(let i=0;i<60;i++)audio.tires(2,.12,1/60);assert.ok(c.sources.length>=12&&c.sources.length<=18);
 const old=[...c.sources];audio.reset();old.forEach(s=>immediateStop(s,c.currentTime));
 audio.update(0,false);audio.setMusicMode('driving');audio.tires(0,0,1/60);assert.equal(c.sources.length,old.length);
}));

test('authoritative gear RPM changes motor pitch at the same speed and all shift cues stop on pause',async()=>fixture((audio,c)=>{
 audio.setMusicMode('driving');audio.engine(20,1,1/60,{rpm:4800,shiftLeft:0});const graph=[...c.sources];assert.equal(graph[0].frequency.value,160);
 audio.engine(20,1,1/60,{rpm:3000,shiftLeft:.18});assert.equal(graph[0].frequency.value,100);assert.equal(c.sources.length,3);
 audio.vehicleCue('shift');audio.vehicleCue('shiftRejected');assert.equal(c.sources.length,6);
 audio.update(0,true);c.sources.forEach(s=>immediateStop(s,c.currentTime));
 audio.vehicleCue('shift');assert.equal(c.sources.length,6);
}));

test('seven original firearm profiles keep distinct body pitch and no combat randomness',async()=>fixture((audio,c)=>{const random=Math.random;Math.random=()=>{throw new Error('presentation must not consume combat RNG');};try{const pitches:number[]=[];for(const id of ['glock','mp5','m4a1','ak47','r870','awm','m249']){const first=c.sources.length;audio.shot(id);assert.equal(c.sources.length-first,4);pitches.push(c.sources[first+1].frequency.values[0]);}assert.equal(new Set(pitches).size,7);audio.impact('metal');audio.mechanical('m249','belt-in');}finally{Math.random=random;}}));

test('entity obstruction softens and filters firearm sound independently of stereo direction',async()=>fixture((audio,c)=>{audio.setListener({x:0,y:1,z:0},{x:0,y:0,z:-1});const capture=(occlusion:number)=>{const before=c.nodes.length;audio.shot('m4a1',20,{x:20,y:1,z:0},occlusion);const added=c.nodes.slice(before),gains=added.filter(n=>'gain'in n) as (Node&{gain:Param})[],filters=added.filter(n=>'frequency'in n) as (Node&{frequency:Param})[],panners=added.filter(n=>'pan'in n) as (Node&{pan:Param})[];return {gain:gains[0].gain.values[0],cutoff:filters[0].frequency.value,pan:panners[0].pan.value};};const clear=capture(0),blocked=capture(1),clamped=capture(9);assert.ok(blocked.gain<clear.gain*.5);assert.ok(blocked.cutoff<clear.cutoff*.5);assert.equal(clear.pan,blocked.pan);assert.deepEqual(clamped,blocked);assert.ok(c.sources.every(s=>s.starts[0]>=c.currentTime));}));

test('M249 cover and belt stages plus AWM bolt release with pause and reset',async()=>fixture((audio,c)=>{audio.mechanical('m249','open-cover');audio.mechanical('m249','belt-in');audio.mechanical('m249','close-cover');audio.mechanical('awm','bolt');const active=[...c.sources];assert.equal(active.length,8);assert.ok(active.some(s=>s.starts[0]>c.currentTime));audio.update(0,true);active.forEach(s=>immediateStop(s,c.currentTime));audio.update(0,false);audio.mechanical('m249','belt-in');const restarted=c.sources.slice(active.length);audio.reset();restarted.forEach(s=>immediateStop(s,c.currentTime));}));

test('surface impact graphs remain positional and every source is lifecycle tracked',async()=>fixture((audio,c)=>{audio.setListener({x:0,y:1,z:0},{x:0,y:0,z:-1});const counts:number[]=[];for(const kind of ['neutral','ground','wall','metal'] as const){const before=c.sources.length;audio.impact(kind,{x:6,y:1,z:0});counts.push(c.sources.length-before);}assert.deepEqual(counts,[1,2,2,2]);const panners=c.nodes.filter(n=>'pan'in n) as (Node&{pan:Param})[];assert.ok(panners.every(n=>n.pan.value>.8));audio.reset();c.sources.forEach(s=>immediateStop(s,c.currentTime));assert.ok(panners.every(n=>n.disconnected===1));}));
