import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GameAudio} from '../src/audio.ts';
import {staticAssetUrl} from '../src/static-assets.ts';

class Media extends EventTarget {
 static created:Media[]=[];static gate:Promise<void>|null=null;static fail=false;
 paused=true;currentTime=0;volume=0;preload='';loop=false;src='';playSources:string[]=[];loadedSources:string[]=[];
 constructor(){super();Media.created.push(this);}
 load(){this.loadedSources.push(this.src);this.currentTime=0;}
 removeAttribute(){this.src='';}
 play(){this.playSources.push(this.src);this.paused=false;if(Media.fail){Media.fail=false;this.paused=true;return Promise.reject(new DOMException('denied','NotAllowedError'));}const gate=Media.gate;Media.gate=null;return gate??Promise.resolve();}
 pause(){this.paused=true;}
}
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
async function fixture(run:(audio:GameAudio)=>Promise<void>|void){
 const win=Object.getOwnPropertyDescriptor(globalThis,'window'),media=Object.getOwnPropertyDescriptor(globalThis,'Audio');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{}});Object.defineProperty(globalThis,'Audio',{configurable:true,value:Media});
 Media.created=[];Media.gate=null;Media.fail=false;const audio=new GameAudio();
 try{await run(audio);}finally{audio.dispose();if(win)Object.defineProperty(globalThis,'window',win);else Reflect.deleteProperty(globalThis,'window');if(media)Object.defineProperty(globalThis,'Audio',media);else Reflect.deleteProperty(globalThis,'Audio');}
}
async function advance(audio:GameAudio,seconds:number){for(let i=0;i<Math.ceil(seconds*60);i++){audio.update(1/60,false);await settle();}}
test('escape battle music starts its search score directly, with one media slot and no running track',async()=>fixture(async audio=>{
 audio.setEscapeMusic('battle','search');await audio.unlock();audio.update(0,false);await settle();audio.update(0,false);await settle();const current=Media.created[0];
 assert.equal(Media.created.length,1);assert.deepEqual([...new Set(current.playSources)],[staticAssetUrl('/audio/escape-search.wav')]);assert.equal(audio.diagnostics().playingCount,1);assert.equal(audio.diagnostics().remaining,0);
}));
test('search, combat and extraction fade the same media slot and never request the running song',async()=>fixture(async audio=>{
 audio.setEscapeMusic('battle','search');await audio.unlock();await advance(audio,1);
 const current=Media.created[0],loaded=current.loadedSources.length;audio.setEscapeMusic('battle','combat');
 assert.equal(current.src,staticAssetUrl('/audio/escape-search.wav'),'old source remains until fade-out');assert.equal(current.loadedSources.length,loaded);
 await advance(audio,.8);assert.equal(current.src,staticAssetUrl('/audio/escape-combat.wav'));audio.setEscapeMusic('battle','extraction');await advance(audio,.8);
 assert.equal(current.src,staticAssetUrl('/audio/escape-extraction.wav'));assert.equal(Media.created.length,1);assert.ok(current.playSources.every(s=>['search','combat','extraction'].some(mood=>s===staticAssetUrl(`/audio/escape-${mood}.wav`))));
 assert.equal(audio.diagnostics().playingCount,1);
}));
test('task-map/background pause keeps music position and mute immediately stops escape playback',async()=>fixture(async audio=>{
 audio.setEscapeMusic('battle','combat');await audio.unlock();await advance(audio,.5);const current=Media.created[0];current.currentTime=17.25;
 audio.update(0,true);assert.equal(current.paused,true);assert.equal(current.currentTime,17.25);await audio.unlock();audio.update(0,false);await settle();audio.update(0,false);await settle();assert.equal(current.currentTime,17.25);assert.equal(current.paused,false);
 audio.setVolumes(0,.75);assert.equal(current.paused,true);assert.equal(current.volume,0);await advance(audio,.5);assert.equal(audio.diagnostics().playingCount,0);
}));
test('escape running-song selection loops independently of the old sixty-second boost budget',async()=>fixture(async audio=>{
 audio.setEscapeMusic('run');await audio.unlock();await advance(audio,61);assert.equal(Media.created[0].src,staticAssetUrl('/audio/run.mp3'));assert.equal(audio.diagnostics().playingCount,1);assert.equal(audio.diagnostics().remaining,0);
 audio.run();assert.equal(audio.diagnostics().remaining,0);
}));
test('escape music off neither creates media nor starts new mood playback',async()=>fixture(async audio=>{
 audio.setEscapeMusic('off','search');await audio.unlock();await advance(audio,1);audio.setEscapeMusic('off','extraction');await advance(audio,1);
 assert.equal(Media.created.length,0);assert.equal(audio.diagnostics().playingCount,0);
 audio.setEscapeMusic('battle','combat');await audio.unlock();await advance(audio,.5);audio.setEscapeMusic('off','combat');await advance(audio,1);
 assert.equal(audio.diagnostics().playingCount,0);assert.equal(Media.created.length,1);
}));
test('old pending play completion cannot revive audio after reset or replace the new escape source',async()=>fixture(async audio=>{
 let resolve!:()=>void;Media.gate=new Promise<void>(r=>{resolve=r;});audio.setEscapeMusic('battle','search');await audio.unlock();audio.update(0,false);
 const old=Media.created[0];audio.reset();audio.setEscapeMusic('battle','extraction');await audio.unlock();audio.update(0,false);await settle();audio.update(0,false);await settle();
 resolve();await settle();assert.equal(old.paused,true);assert.equal(old.src,'');assert.equal(Media.created[1].src,staticAssetUrl('/audio/escape-extraction.wav'));assert.equal(Media.created[1].paused,false);
 assert.equal(Media.created.filter(m=>!m.paused).length,1);
}));
test('a failed escape playback retries the intended score and does not switch to running music',async()=>fixture(async audio=>{
 audio.setEscapeMusic('battle','combat');Media.fail=true;await audio.unlock();audio.update(0,false);await settle();audio.update(0,false);await settle();assert.equal(audio.error,true);
 audio.retry();await settle();audio.update(0,false);await settle();audio.update(0,false);await settle();assert.equal(audio.error,false);assert.equal(Media.created[0].src,staticAssetUrl('/audio/escape-combat.wav'));assert.ok(Media.created[0].playSources.every(s=>s===staticAssetUrl('/audio/escape-combat.wav')));
}));
test('all three original score resources have valid nonempty PCM WAV payloads',()=>{
 for(const mood of ['search','combat','extraction']){
  const bytes=readFileSync(new URL('../public/audio/escape-'+mood+'.wav',import.meta.url));
  assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WAVE');assert.ok(bytes.length>10000);assert.equal(bytes.readUInt32LE(4),bytes.length-8);
 }
});
