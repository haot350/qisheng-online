import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {StoryAudio,storyTrackForChapter} from '../src/story-audio.ts';
import {staticAssetUrl} from '../src/static-assets.ts';
import type {StorySnapshot} from '../src/story/types.ts';
const story=(chapter=1)=>({chapter,echo:'none',presentOnly:false,dialogue:null}) as StorySnapshot;
class TestAudio{
 static created:TestAudio[]=[];paused=true;loop=false;preload='';volume=0;currentTime=0;error:MediaError|null=null;onerror:(()=>void)|null=null;requests:{resolve:()=>void;reject:(e:Error)=>void}[]=[];plays=0;abortOnPause=true;loadCalls=0;
 constructor(public src=''){TestAudio.created.push(this);}
 play(){this.plays++;return new Promise<void>((resolve,reject)=>this.requests.push({resolve:()=>{this.paused=false;resolve();},reject}));}
 pause(){this.paused=true;if(this.abortOnPause)for(const p of this.requests.splice(0))p.reject(new DOMException('Playback interrupted','AbortError'));}
 load(){this.error=null;this.loadCalls++;}removeAttribute(){this.src='';}
}
async function fixture(run:(audio:StoryAudio)=>Promise<void>){const old=globalThis.Audio;TestAudio.created=[];globalThis.Audio=TestAudio as unknown as typeof Audio;const audio=new StoryAudio();try{await run(audio);}finally{audio.dispose();globalThis.Audio=old;}}
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
const playing=()=>TestAudio.created.filter(a=>!a.paused&&a.volume>0);
const latest=()=>TestAudio.created.at(-1)!;
const settle=async()=>{latest().requests.at(-1)?.resolve();await flush();};
class StoryParam {setValueAtTime(){}linearRampToValueAtTime(){}exponentialRampToValueAtTime(){}}
class StoryNode {disconnected=0;connect(){}disconnect(){this.disconnected++;}}
class StorySource extends StoryNode {frequency=new StoryParam();type='';onended:(()=>void)|null=null;stops:number[]=[];start(){}stop(time:number){this.stops.push(time);}}
class StoryContext {
 static latest:StoryContext;state='suspended';currentTime=4;destination=new StoryNode();resumeCalls=0;closed=false;sources:StorySource[]=[];
 constructor(){StoryContext.latest=this;}
 resume(){this.resumeCalls++;this.state='running';return Promise.resolve();}
 close(){this.closed=true;this.state='closed';return Promise.resolve();}
 createOscillator(){const source=new StorySource();this.sources.push(source);return source;}
 createGain(){return Object.assign(new StoryNode(),{gain:new StoryParam()});}
}
async function contextFixture(run:(audio:StoryAudio)=>Promise<void>){
 const old=Object.getOwnPropertyDescriptor(globalThis,'window');Object.defineProperty(globalThis,'window',{configurable:true,value:{AudioContext:StoryContext}});
 try{await fixture(run);}finally{if(old)Object.defineProperty(globalThis,'window',old);else Reflect.deleteProperty(globalThis,'window');}
}
test('pending music play is deduplicated, and normal pause/reset aborts cannot become load errors',async()=>fixture(async audio=>{
 audio.update(.1,story(),false);const first=TestAudio.created[0];for(let i=0;i<20;i++)audio.update(.01,story(),false);assert.equal(first.plays,1);audio.pause();await flush();assert.equal(audio.error,false);
 audio.update(.1,story(),false);assert.equal(first.plays,2);const late=first.requests[0];audio.reset();late.reject(new DOMException('Old request failed','NotSupportedError'));await flush();assert.equal(audio.error,false);assert.equal(first.onerror,null);
 audio.update(.1,story(4),false);assert.equal(TestAudio.created[1].src,staticAssetUrl('/story/audio/aphelion.mp3'));TestAudio.created[1].requests[0].resolve();await flush();assert.equal(audio.error,false);
}));
test('muted music never requests playback; genuine media/policy failures retry instead of looping every frame',async()=>fixture(async audio=>{
 audio.setVolumes(0,0);audio.update(.1,story(),false);const track=TestAudio.created[0];assert.equal(track.plays,0);audio.setVolumes(.5,0);audio.update(.1,story(),false);track.requests[0].reject(new DOMException('User gesture required','NotAllowedError'));await flush();assert.equal(audio.error,true);for(let i=0;i<20;i++)audio.update(.01,story(),false);assert.equal(track.plays,1);audio.retry();assert.equal(track.plays,2);track.requests.at(-1)!.resolve();await flush();assert.equal(audio.error,false);
}));

test('chapter music is independent of echo, present-only visuals and photography',async()=>fixture(async audio=>{
 assert.deepEqual(Array.from({length:7},(_,chapter)=>storyTrackForChapter(chapter)),['childhood','childhood','childhood','childhood','aphelion','aphelion','golden-hour']);
 for(const chapter of [0,1,2,3])for(const echo of ['none','morning','noon','night','all'])for(const presentOnly of [false,true])audio.update(.01,{...story(chapter),echo,presentOnly} as StorySnapshot,false);
 assert.equal(TestAudio.created.length,1);assert.equal(latest().src,staticAssetUrl('/story/audio/childhood.mp3'));assert.equal(latest().plays,1);
}));

test('a chapter change fades the sole slot for .6 seconds before changing its source',async()=>fixture(async audio=>{
 audio.update(.1,story(3),false);await settle();audio.update(.5,story(3),false);const old=latest(),before=old.volume;
 audio.update(.2,story(4),false);assert.equal(TestAudio.created.length,1);assert.ok(Math.abs(old.volume-before*2/3)<1e-8);assert.equal(audio.diagnostics().transition,'fade-out');
 audio.update(.2,story(4),false);assert.equal(TestAudio.created.length,1);audio.update(.2,story(5),false);
 const next=latest();assert.equal(TestAudio.created.length,1);assert.equal(next,old);assert.equal(old.paused,true);assert.equal(old.volume,0);assert.equal(next.src,staticAssetUrl('/story/audio/aphelion.mp3'));assert.equal(next.loadCalls,1);
 await settle();audio.update(.1,story(5),false);assert.ok(next.volume>0);assert.equal(playing().length,1);
}));

test('rapid chapter changes use the newest target and never overlap retired music',async()=>fixture(async audio=>{
 audio.update(.1,story(1),false);await settle();audio.update(.5,story(1),false);
 for(const chapter of [4,6]){audio.update(.2,story(chapter),false);assert.equal(playing().length,1);}
 audio.update(.2,story(6),false);await settle();audio.update(.1,story(6),false);
 assert.equal(TestAudio.created.length,1);assert.equal(latest().src,staticAssetUrl('/story/audio/golden-hour.mp3'));assert.equal(playing().length,1);
 for(const chapter of [4,1,4,6,1]){audio.update(.1,story(chapter),false);assert.ok(playing().length<=1);}
 audio.update(.1,story(1),false);await settle();audio.update(.1,story(1),false);assert.ok(playing().length<=1);
}));

test('pause preserves only the current song; mute is immediate and cannot resurrect an earlier chapter',async()=>fixture(async audio=>{
 audio.update(.1,story(),false);await settle();audio.update(.5,story(),false);const old=latest();
 for(let i=0;i<3;i++)audio.update(.2,story(4),false);await settle();audio.update(.2,story(4),false);
 const current=latest();assert.equal(current,old);current.currentTime=31.5;audio.pause();await flush();assert.equal(current.currentTime,31.5);assert.equal(playing().length,0);
 audio.update(.1,story(4),false);await settle();assert.equal(current.currentTime,31.5);assert.equal(current.src,staticAssetUrl('/story/audio/aphelion.mp3'));assert.equal(TestAudio.created.length,1);assert.equal(playing().length,1);
 audio.setVolumes(0,.75);assert.equal(current.paused,true);assert.equal(current.volume,0);const plays=current.plays;
 audio.pause();audio.update(.1,story(4),false);assert.equal(current.plays,plays);assert.equal(playing().length,0);
 audio.setVolumes(.5,.75);audio.update(.1,story(4),false);await settle();assert.equal(current.currentTime,31.5);assert.equal(playing().length,1);
}));

test('old media failures and late successful playback cannot affect a new story generation',async()=>fixture(async audio=>{
 audio.update(.1,story(),false);const old=latest(),errorHandler=old.onerror!,late=old.requests[0];old.abortOnPause=false;
 audio.reset();audio.update(.1,story(6),false);await settle();const current=latest();
 errorHandler();late.resolve();await flush();assert.equal(old.paused,true);assert.equal(old.src,'');assert.equal(old.volume,0);assert.equal(current.paused,false);assert.equal(audio.error,false);assert.equal(audio.diagnostics().playingCount,1);
}));

test('a 12-second play deadline exposes retry and a late result remains silent',async t=>fixture(async audio=>{
 t.mock.timers.enable({apis:['setTimeout']});audio.update(.1,story(),false);const a=latest();a.abortOnPause=false;const late=a.requests[0];
 t.mock.timers.tick(11999);await flush();assert.equal(audio.error,false);t.mock.timers.tick(1);await flush();assert.equal(audio.error,true);assert.equal(audio.diagnostics().pending,false);
 late.resolve();await flush();assert.equal(a.paused,true);assert.equal(a.volume,0);assert.equal(audio.error,true);
 audio.retry();assert.equal(a.plays,2);await settle();assert.equal(audio.error,false);assert.equal(a.paused,false);
}));

test('mute also cancels an unresolved request and silences its late completion',async()=>fixture(async audio=>{
 audio.update(.1,story(),false);const a=latest();a.abortOnPause=false;const late=a.requests[0];audio.setVolumes(0,0);
 assert.equal(audio.diagnostics().pending,false);assert.equal(a.volume,0);late.resolve();await flush();assert.equal(a.paused,true);assert.equal(audio.error,false);
}));

test('gesture unlock synchronously starts the correct source and resumes the suspended cue context',async()=>contextFixture(async audio=>{
 const unlocking=audio.unlock(6),a=latest(),c=StoryContext.latest;
 assert.equal(a.src,staticAssetUrl('/story/audio/golden-hour.mp3'));assert.equal(a.plays,1);assert.equal(c.resumeCalls,1);assert.equal(a.volume,0);
 await unlocking;a.currentTime=.35;await settle();assert.equal(a.paused,true,'menu/loading prime is silent');assert.equal(a.currentTime,0,'loading cannot consume the beginning of the music');
 audio.update(.1,story(6),false);await settle();audio.cue('shutter');assert.ok(c.sources.length>0);
 audio.pause();assert.equal(audio.diagnostics().cueSources,0);assert.ok(c.sources.every(s=>s.disconnected===1));const count=c.sources.length;audio.cue('shutter');assert.equal(c.sources.length,count);
 a.currentTime=31.5;c.state='suspended';const continuing=audio.unlock(6);assert.equal(c.resumeCalls,2);assert.equal(c.state,'running');await continuing;a.currentTime=31.7;await settle();assert.equal(a.currentTime,31.5,'silent resume priming retains the paused position');
 audio.update(.1,story(6),false);await settle();assert.equal(audio.diagnostics().playingCount,1);
}));

test('late play success or failure from a replaced source cannot pause, seek or fail the current source',async()=>{
 for(const outcome of ['resolve','reject'] as const)await fixture(async audio=>{
  void audio.unlock();const a=latest(),old=a.requests[0],oldError=a.onerror!;a.abortOnPause=false;
  audio.prepare(6);audio.update(.1,story(6),false);await settle();a.currentTime=17;
  oldError();if(outcome==='resolve')old.resolve();else old.reject(new DOMException('Retired source failed','NotSupportedError'));await flush();
  assert.equal(a.currentTime,17);assert.equal(a.paused,false);assert.equal(audio.error,false);assert.equal(a.src,staticAssetUrl('/story/audio/golden-hour.mp3'));assert.equal(TestAudio.created.length,1);
 });
});

test('save lookup prime survives a preserving reset on the same authorized element',async()=>contextFixture(async audio=>{
 const priming=audio.primeGesture(),a=latest();assert.equal(a.plays,1);await priming;await settle();
 audio.reset(true);audio.prepare(6);assert.equal(latest(),a);assert.equal(TestAudio.created.length,1);assert.equal(a.src,staticAssetUrl('/story/audio/golden-hour.mp3'));assert.equal(audio.diagnostics().gesturePrimed,false);
 audio.update(.1,story(6),false);await settle();assert.equal(a.paused,false);
 audio.reset();assert.equal(a.src,'');assert.equal(a.paused,true);audio.prepare(4);assert.notEqual(latest(),a);
}));

test('music-only overlay ticks finish transitions without scheduling chapter or periodic cues',async()=>contextFixture(async audio=>{
 await audio.unlock();audio.update(.1,story(),false);await settle();audio.update(.5,story(),false);audio.pause();
 const c=StoryContext.latest,initial=c.sources.length;
 for(let i=0;i<100;i++){audio.update(.2,{...story(4),echo:'all'} as StorySnapshot,false,true);if(latest().requests.length)await settle();}
 assert.equal(c.sources.length,initial);assert.equal(latest().src,staticAssetUrl('/story/audio/aphelion.mp3'));assert.equal(audio.diagnostics().playingCount,1);
}));
test('all licensed story beds actually decode, play and survive rapid pause/reset in Chrome',{skip:process.env.STORY_AUDIO_BROWSER_TEST!=='1',timeout:60000},async()=>{
 const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE??path.join(process.env.USERPROFILE??'','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));page.on('response',(r:{status:()=>number;url:()=>string})=>{if(r.status()>=400)errors.push(`HTTP ${r.status()} ${r.url()}`);});
  await page.route('**/story-audio-test',async(r:{fulfill:(v:unknown)=>Promise<void>})=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><button id="start">播放剧情音乐</button>'}));await page.goto((process.env.STORY_AUDIO_DEV_ORIGIN??'http://127.0.0.1:5180')+'/story-audio-test');
  await page.evaluate(async()=>{const NativeAudio=window.Audio,tracks:HTMLAudioElement[]=[],events:{src:string;type:string;code:number|null}[]=[];window.Audio=function(src?:string){const a=new NativeAudio(src);tracks.push(a);for(const type of ['loadedmetadata','canplay','playing','pause','error','abort'])a.addEventListener(type,()=>events.push({src:a.src,type,code:a.error?.code??null}));return a;} as typeof Audio;
   const {StoryAudio}=await import(/* @vite-ignore */'/src/story-audio.ts'),audio=new StoryAudio();audio.setVolumes(.5,0);const snapshot={chapter:1,echo:'none',presentOnly:false,dialogue:null};let last=performance.now();const interval=setInterval(()=>{const now=performance.now();audio.update((now-last)/1000,snapshot,false);last=now;},20);(window as any).__storyAudio={audio,tracks,events,snapshot,interval};document.getElementById('start')!.onclick=()=>void audio.unlock();
  });await page.locator('#start').click();const samples=[];
  for(const chapter of [1,4,6]){const expectedUrl=staticAssetUrl(`/story/audio/${storyTrackForChapter(chapter)}.mp3`);await page.evaluate(ch=>{(window as any).__storyAudio.snapshot.chapter=ch;},chapter);await page.waitForFunction(expected=>{const t=(window as any).__storyAudio,a=t.tracks.at(-1);return a.src===new URL(expected,location.href).href&&!a.paused&&a.currentTime>.25&&!a.error;},expectedUrl,{timeout:20000});samples.push(await page.evaluate(()=>{const t=(window as any).__storyAudio,a=t.tracks.at(-1);return{src:new URL(a.src).pathname,duration:a.duration,time:a.currentTime,volume:a.volume,readyState:a.readyState,error:t.audio.error};}));}
  const reset=await page.evaluate(async()=>{const t=(window as any).__storyAudio;t.audio.pause();t.audio.update(.01,t.snapshot,false);t.audio.reset();t.audio.update(.1,t.snapshot,false);await new Promise(r=>setTimeout(r,700));const a=t.tracks.at(-1);clearInterval(t.interval);const result={error:t.audio.error,playing:!a.paused,time:a.currentTime,events:t.events};t.audio.dispose();return result;});assert.deepEqual(errors,[]);assert.deepEqual(samples.map(s=>s.src),['childhood','aphelion','golden-hour'].map(key=>staticAssetUrl(`/story/audio/${key}.mp3`)));for(const s of samples){assert.ok(s.duration>10&&s.time>.25&&s.volume>0&&s.readyState>=3);assert.equal(s.error,false);}assert.equal(reset.error,false);assert.equal(reset.playing,true);assert.ok(reset.time>.25);assert.ok(reset.events.some((e:{type:string})=>e.type==='playing'));process.stdout.write(JSON.stringify({samples,rapidReset:{error:reset.error,time:reset.time,playing:reset.playing}},null,2)+'\n');
 }finally{await browser.close();}
});
