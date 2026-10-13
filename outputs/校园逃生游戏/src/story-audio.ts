import {staticAssetUrl} from './static-assets.ts';
import type {StorySnapshot} from './story/types';
import {withDeadline} from './network.ts';

type StoryTrack='childhood'|'aphelion'|'golden-hour';
type PlayRequest={element:HTMLAudioElement;serial:number;generation:number;sourceSerial:number;activation:number;primePosition?:number;controller:AbortController};
type CueSource={source:OscillatorNode;gain:GainNode};
const TRANSITION_SECONDS=.6;
const PLAY_DEADLINE=12000;
const volume=(value:number)=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
export const storyTrackForChapter=(chapter:number):StoryTrack=>chapter>=6?'golden-hour':chapter>=4?'aphelion':'childhood';

/** One licensed music slot; original, non-verbal cues have a separate lifecycle. */
export class StoryAudio {
 private element:HTMLAudioElement|null=null;
 private active:StoryTrack|''='';
 private target:StoryTrack|''='';
 private music=.38;
 private sfx=.75;
 private paused=true;
 private disposed=false;
 private context:AudioContext|null=null;
 private sourceNodes=new Set<CueSource>();
 private clock=0;
 private motif=0;
 private previousChapter=-1;
 private generation=0;
 private sourceSerial=0;
 private playbackActivation=0;
 private gesturePrimed=false;
 private requestSerial=0;
 private pending:PlayRequest|null=null;
 private failed=false;
 private failure='';
 private fadeElapsed=0;
 private fadeFrom=0;
 private fadingOut=false;
 private duck=.9;
 error=false;

 setVolumes(music:number,sfx:number){
  this.music=volume(music);this.sfx=volume(sfx);
  if(!this.music){this.cancelPlay();if(this.element){this.element.volume=0;this.element.pause();}this.fadingOut=false;}
  if(!this.sfx)this.stopCues();
 }
 /** Call before async game preparation, so unlock can play the right source in the click stack. */
 prepare(chapter=0){
  if(this.disposed)return;
  this.target=storyTrackForChapter(chapter);
  if(!this.element){this.replaceTrack(this.target);return;}
  if(this.active===this.target){this.fadingOut=false;this.fadeElapsed=0;return;}
  if(this.paused||!this.music||this.element.paused||this.element.volume===0){this.replaceTrack(this.target);return;}
  if(!this.fadingOut){this.fadingOut=true;this.fadeElapsed=0;this.fadeFrom=this.element.volume;}
 }
 async unlock(chapter=0){
  if(this.disposed)return;
  this.prepare(chapter);this.failed=false;this.failure='';this.error=false;
  // Both calls begin synchronously in the initiating user action. Neither media loading nor
  // a suspended browser context can hold the game's start/continue operation open.
  let resume:Promise<void>|undefined;
  try{
   const scope=typeof window==='undefined'?globalThis:window;
   const Constructor=(scope as typeof globalThis&{webkitAudioContext?:typeof AudioContext}).AudioContext??(scope as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
   if(Constructor)this.context??=new Constructor();
   resume=this.context?.resume();
  }catch{}
  if(this.music)this.playTrack(true);
  if(resume)await withDeadline(resume,PLAY_DEADLINE).catch(()=>{});
 }
 /** Keep this exact media element through an asynchronous save lookup and reset(true). */
 primeGesture(chapter=0){if(this.disposed)return Promise.resolve();this.gesturePrimed=true;return this.unlock(chapter);}
 cue(kind:'focus'|'shutter'|'projector'|'ball'|'motif'='motif'){
  const c=this.context;if(this.disposed||this.paused||!c||c.state!=='running'||!this.sfx)return;
  const notes=kind==='motif'?[293.665,349.228,440,391.995]:kind==='ball'?[85]:kind==='focus'?[1046.5,1396.9]:kind==='shutter'?[150,65]:[70,98];
  notes.forEach((hz,i)=>{
   const o=c.createOscillator(),g=c.createGain(),start=c.currentTime+i*(kind==='motif'?.42:.07),duration=kind==='motif'?.9:.09;
   o.type=kind==='motif'?'sine':'triangle';o.frequency.setValueAtTime(hz,start);if(kind==='ball')o.frequency.exponentialRampToValueAtTime(30,start+.12);
   g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(this.sfx*(kind==='motif'?.06:.09),start+.015);g.gain.exponentialRampToValueAtTime(.00001,start+duration);
   o.connect(g);g.connect(c.destination);const sound={source:o,gain:g};this.sourceNodes.add(sound);o.onended=()=>this.releaseCue(sound,false);o.start(start);o.stop(start+duration+.02);
  });
 }
 /** musicOnly advances the BGM transition while a narrative overlay freezes story clocks. */
 update(dt:number,s:StorySnapshot,paused:boolean,musicOnly=false){
  if(this.disposed)return;
  const step=Number.isFinite(dt)?Math.max(0,Math.min(.5,dt)):0;
  if(!paused&&this.paused)this.playbackActivation++;
  this.paused=paused;this.duck=s.dialogue?.fullText?.length ? .55 : .9;this.prepare(s.chapter);
  if(paused){this.pause();return;}
  if(!this.music){if(this.element){this.element.volume=0;this.element.pause();}return;}
  if(this.fadingOut){
   this.fadeElapsed+=step;
   if(this.element)this.element.volume=this.fadeFrom*Math.max(0,1-this.fadeElapsed/TRANSITION_SECONDS);
   if(this.fadeElapsed+1e-8>=TRANSITION_SECONDS)this.replaceTrack(this.target as StoryTrack);
  }else if(this.element){
   const goal=this.music*this.duck;
   this.element.volume=volume(this.element.volume+(goal-this.element.volume)*Math.min(1,step/TRANSITION_SECONDS));
  }
  if(this.element?.paused)this.playTrack();
  if(musicOnly)return;
  this.clock+=step;
  if(this.previousChapter!==s.chapter){this.previousChapter=s.chapter;this.cue('motif');}
  if(this.clock-this.motif>14&&s.echo!=='none'&&!s.presentOnly){this.motif=this.clock;this.cue('ball');}
 }
 private replaceTrack(key:StoryTrack){
  this.cancelPlay();const previous=this.element;
  // Safari grants media autoplay per element. Reuse the one unlocked slot on source
  // changes, after the outgoing music has reached silence; reset retires the element.
  if(previous){previous.volume=0;previous.pause();previous.onerror=null;}
  this.active=key;this.fadingOut=false;this.fadeElapsed=0;this.fadeFrom=0;this.failed=false;this.failure='';this.error=false;
  const a=previous??new Audio();a.preload='none';a.loop=true;a.volume=0;a.src=staticAssetUrl(`/story/audio/${key}.mp3`);if(previous)a.load();try{a.currentTime=0;}catch{}
  const generation=this.generation,sourceSerial=++this.sourceSerial;
  a.onerror=()=>{if(!this.disposed&&generation===this.generation&&sourceSerial===this.sourceSerial&&this.element===a){this.failed=true;this.failure='MediaError';this.error=true;this.cancelPlay();a.volume=0;a.pause();}};
  this.element=a;
 }
 private releaseMedia(a:HTMLAudioElement){a.volume=0;a.pause();a.onerror=null;a.removeAttribute('src');a.load();}
 private cancelPlay(){const pending=this.pending;this.pending=null;pending?.controller.abort();}
 private playbackWanted(a:HTMLAudioElement){return !this.disposed&&this.element===a&&!this.paused&&this.music>0;}
 private cleanLate(request:PlayRequest){
  // An old element cannot affect the new slot. On the same slot, a newer request may
  // legitimately be playing, so only stop it if the current desired state is silent.
  if(this.element!==request.element)this.releaseMedia(request.element);
  else if(!this.playbackWanted(request.element)||this.failed){
   request.element.volume=0;request.element.pause();
   // Silent gesture priming must not consume the beginning of a new song or the
   // position held by a pause. An old source/activation may never seek a newer one.
   if(request.primePosition!==undefined&&request.generation===this.generation&&request.sourceSerial===this.sourceSerial&&request.activation===this.playbackActivation){try{request.element.currentTime=request.primePosition;}catch{}}
  }
 }
 private playTrack(prime=false){
  const a=this.element;if(!a||this.pending||this.failed||this.disposed||!this.music||(!prime&&this.paused))return;
  if(!a.paused&&!prime)return;
  if(prime&&this.paused)a.volume=0;
  const request:PlayRequest={element:a,serial:++this.requestSerial,generation:this.generation,sourceSerial:this.sourceSerial,activation:this.playbackActivation,primePosition:prime&&this.paused?a.currentTime:undefined,controller:new AbortController()};this.pending=request;
  let work:Promise<void>;try{work=a.play();}catch(e){work=Promise.reject(e);}
  void withDeadline(work,PLAY_DEADLINE,{signal:request.controller.signal,onLate:()=>this.cleanLate(request)}).then(()=>{
   if(this.pending!==request||request.generation!==this.generation){this.cleanLate(request);return;}
   this.failed=false;this.failure='';this.error=false;this.cleanLate(request);
  }).catch((e:unknown)=>{
   if(this.pending!==request||request.controller.signal.aborted||request.generation!==this.generation)return;
   if((e as {name?:string}|null)?.name==='AbortError')return;
   this.failed=true;this.failure=(e as {name?:string}|null)?.name??'PlaybackError';this.error=true;
   this.cleanLate(request);
  }).finally(()=>{if(this.pending===request)this.pending=null;});
 }
 pause(){this.paused=true;this.cancelPlay();this.element?.pause();this.stopCues();}
 retry(){if(this.disposed)return;this.cancelPlay();if(this.element?.error)this.element.load();void this.unlock(this.target==='golden-hour'?6:this.target==='aphelion'?4:0);}
 private releaseCue(sound:CueSource,stop:boolean){
  if(!this.sourceNodes.delete(sound))return;sound.source.onended=null;
  if(stop){try{sound.source.stop(this.context?.currentTime??0);}catch{}}
  sound.source.disconnect();sound.gain.disconnect();
 }
 private stopCues(){for(const sound of this.sourceNodes)this.releaseCue(sound,true);}
 reset(preserveGesture=false){
  const keep=preserveGesture&&this.gesturePrimed;this.gesturePrimed=false;
  this.generation++;this.playbackActivation++;this.pause();const previous=this.element;
  if(previous&&keep){previous.volume=0;previous.onerror=null;try{previous.currentTime=0;}catch{}}
  else{this.element=null;if(previous)this.releaseMedia(previous);}
  this.active='';this.target='';this.clock=0;this.motif=0;this.previousChapter=-1;this.fadingOut=false;this.fadeElapsed=0;this.failed=false;this.failure='';this.error=false;
 }
 diagnostics(){return {owner:'story' as const,activeTrack:this.active,targetTrack:this.target,src:this.element?.src??'',playing:!!this.element&&!this.element.paused,playingCount:this.element&&!this.element.paused?1:0,pending:!!this.pending,paused:this.paused,muted:this.music===0,volume:this.element?.volume??0,currentTime:this.element?.currentTime??0,transition:this.fadingOut?'fade-out':this.element&&this.element.volume<this.music*this.duck-.002?'fade-in':'steady',fadeElapsed:this.fadeElapsed,generation:this.generation,sourceSerial:this.sourceSerial,gesturePrimed:this.gesturePrimed,request:this.pending?.serial??null,contextState:this.context?.state??'uninitialized',cueSources:this.sourceNodes.size,error:this.error,failure:this.failure};}
 dispose(){if(this.disposed)return;this.reset();this.disposed=true;void this.context?.close().catch(()=>{});this.context=null;}
}
