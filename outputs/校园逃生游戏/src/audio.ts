import {staticAssetUrl} from './static-assets.ts';
/** Original synthetic, non-verbal game effects; running track supplied by the project owner. */
import {withDeadline} from './network.ts';
import {engineSoundParameters} from './driving-presentation.ts';
type ActiveSound = { source: AudioScheduledSourceNode; nodes: AudioNode[]; released: boolean };
type Position={x:number;y:number;z:number};
type EngineSound={low:OscillatorNode;harmonic:OscillatorNode;gain:GainNode;road:GainNode;filter:BiquadFilterNode};
export const SHOT_PROFILES={
  glock:{duration:.092,cutoff:5100,punch:118,tail:.15},
  mp5:{duration:.068,cutoff:4200,punch:145,tail:.13},
  m4a1:{duration:.085,cutoff:6500,punch:104,tail:.19},
  ak47:{duration:.105,cutoff:5700,punch:84,tail:.23},
  r870:{duration:.145,cutoff:3600,punch:66,tail:.29},
  awm:{duration:.165,cutoff:6100,punch:51,tail:.42},
  m249:{duration:.095,cutoff:5900,punch:92,tail:.24},
} as const;
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private musicElement: HTMLAudioElement|null=null;
  private musicVolume = .38;
  private sfxVolume = .75;
  private musicLevel = 0;
  private remaining = 0;
  private musicMode:'run'|'driving'|'escape'='run';
  private escapeChoice:'battle'|'run'|'off'='battle';private escapeMood:'search'|'combat'|'extraction'='search';private desiredSource='/audio/run.mp3';private sourceFade=false;
  private engineSound:EngineSound|null=null;
  private engineRpm=0;
  private tireClock=0;
  private tireLevel=0;
  private paused = true;
  private disposed = false;
  private starting = false;
  private pauseGeneration = 0;
  private mediaController=new AbortController();
  private mediaGeneration=0;
  private playbackActivation=0;
  private requestSerial=0;
  private pendingRequest=0;
  private failure='';
  private sounds = new Set<ActiveSound>();
  private schedulingResult = false;
  private listener:Position={x:0,y:0,z:0};
  private forward:Position={x:0,y:0,z:-1};
  error = false;

  private ensureMusic() {
    if(this.musicElement)return this.musicElement;
    const element=new Audio();element.preload='none';element.loop=true;element.volume=0;element.src=staticAssetUrl(this.desiredSource);
    element.addEventListener('error',this.onError);this.musicElement=element;return element;
  }
  private onError = (event:Event) => {if(event.currentTarget!==this.musicElement||this.disposed)return;this.error = true;this.failure='MediaError'; };
  private pauseMusic(){this.pauseGeneration++;this.musicElement?.pause();}
  private cancelMusicRequest(){if(!this.starting)return;this.mediaController.abort();this.mediaController=new AbortController();this.starting=false;this.pendingRequest=0;}
  private releaseMusic(element:HTMLAudioElement){element.volume=0;element.pause();element.removeEventListener('error',this.onError);element.removeAttribute('src');element.load();}
  private musicWanted(){return this.musicMode==='driving'||this.musicMode==='escape'&&this.escapeChoice!=='off'||this.remaining>0;}
  private playbackFailed(error:unknown,controller:AbortController,generation:number){
    if(controller.signal.aborted)return;
    // pause() rejects an outstanding media.play() with AbortError. That is a
    // deliberate lifecycle interruption, while network/autoplay errors stay visible.
    if(error instanceof Error&&error.name==='AbortError'&&this.pauseGeneration!==generation)return;
    this.error=true;
    this.failure=(error as {name?:string}|null)?.name??'PlaybackError';
  }
  get isMusicPlaying(){return !this.disposed&&!!this.musicElement&&!this.musicElement.paused;}
  /** Intro clicks unlock synthetic cues without ever starting the running song. */
  async unlockEffects() {
    if(this.disposed) return;
    if(!this.context) {
      const Constructor = window.AudioContext || (window as typeof window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
      if(Constructor) {
        this.context=new Constructor(); this.master=this.context.createGain(); this.master.gain.value=this.sfxVolume; this.master.connect(this.context.destination);
        this.noise=this.context.createBuffer(1,this.context.sampleRate*.3,this.context.sampleRate);
        const data=this.noise.getChannelData(0); let n=92851;
        for(let i=0;i<data.length;i++){ n=(n*1664525+1013904223)>>>0; data[i]=(n/4294967296*2-1)*Math.exp(-i/data.length*2); }
      }
    }
    if(this.context)await withDeadline(this.context.resume(),12000).catch(()=>{});
  }
  async unlock() {
    if(this.disposed)return;
    // Start both unlocks in the initiating click stack for mobile autoplay.
    const resume=this.unlockEffects();
    this.error=false;this.failure='';
    if(this.musicVolume>0)this.playMusic(true);
    // Music streaming is optional; it must never hold the start/continue action open.
    await resume;
  }
  setVolumes(music:number,sfx:number) { this.musicVolume=Number.isFinite(music)?Math.max(0,Math.min(1,music)):0; this.sfxVolume=Number.isFinite(sfx)?Math.max(0,Math.min(1,sfx)):0; if(this.master&&this.context)this.master.gain.setTargetAtTime(this.sfxVolume,this.context.currentTime,.04);if(!this.musicVolume){this.cancelMusicRequest();this.pauseMusic();this.musicLevel=0;if(this.musicElement)this.musicElement.volume=0;} }
  setMusicMode(mode:'run'|'driving'){this.musicMode=mode;this.remaining=0;this.setSource('/audio/run.mp3');if(mode==='run')this.stopEngine();if(!this.paused&&this.musicWanted())this.playMusic();}
  setEscapeMusic(choice:'battle'|'run'|'off',mood:'search'|'combat'|'extraction'=this.escapeMood){this.musicMode='escape';this.remaining=0;this.stopEngine();this.escapeChoice=choice;this.escapeMood=mood;this.setSource(choice==='run'?'/audio/run.mp3':'/audio/escape-'+mood+'.wav');if(choice==='off'){this.cancelMusicRequest();this.pauseMusic();this.musicLevel=0;}else if(!this.paused&&!this.sourceFade)this.playMusic();}
  private setSource(src:string){if(src===this.desiredSource)return;this.desiredSource=src;this.cancelMusicRequest();this.error=false;this.failure='';this.sourceFade=!!this.musicElement&&!this.musicElement.paused&&this.musicLevel>.002;if(!this.sourceFade)this.swapSource();}
  private swapSource(){const element=this.musicElement;this.sourceFade=false;this.musicLevel=0;if(!element)return;this.pauseMusic();element.volume=0;element.src=staticAssetUrl(this.desiredSource);element.load();this.mediaGeneration++;}

  run() {
    if(this.musicMode==='escape')return;this.remaining=60;
    if(!this.paused) this.playMusic();
  }
  private playMusic(prime=false) {
    if(this.starting||this.sourceFade||this.error||this.disposed||!this.musicVolume||this.musicMode==='escape'&&this.escapeChoice==='off'||(!prime&&this.paused)) return;
    const element=this.ensureMusic();if(!element.paused&&!prime)return;
    if(prime&&this.paused)element.volume=0;
    this.starting=true;
    const controller=this.mediaController,generation=this.pauseGeneration,request=++this.requestSerial,activation=this.playbackActivation,primePosition=prime&&this.paused?element.currentTime:undefined;this.pendingRequest=request;
    const cleanLate=()=>{if(element!==this.musicElement){this.releaseMusic(element);return;}if(this.paused||this.disposed||!this.musicVolume||!this.musicWanted()||this.error){this.pauseMusic();if(primePosition!==undefined&&activation===this.playbackActivation){try{element.currentTime=primePosition;}catch{}}}};
    let work:Promise<void>;try{work=element.play();}catch(error){work=Promise.reject(error);}
    void withDeadline(work,12000,{signal:controller.signal,onLate:cleanLate}).then(()=>{if(controller.signal.aborted){cleanLate();return;}this.error=false;this.failure='';cleanLate();}).catch(error=>{this.playbackFailed(error,controller,generation);if(this.error&&element===this.musicElement){element.volume=0;cleanLate();}}).finally(()=>{if(controller!==this.mediaController||this.pendingRequest!==request)return;this.starting=false;this.pendingRequest=0;if(this.paused||this.disposed||!this.musicVolume||!this.musicWanted())this.pauseMusic();});
  }
  update(dt:number,paused:boolean) {
    if(this.disposed)return;
    if(!paused&&this.paused)this.playbackActivation++;
    this.paused=paused;
    if(paused) {if(this.sourceFade)this.swapSource();this.stopEffects();this.cancelMusicRequest();this.pauseMusic(); this.musicLevel=0; if(this.musicElement)this.musicElement.volume=0;return;}
    if(this.musicMode==='run'&&this.remaining>0)this.remaining=Math.max(0,this.remaining-Math.min(dt,.1));
    if(this.sourceFade){this.musicLevel=Math.max(0,this.musicLevel-dt*this.musicVolume/.6);if(this.musicElement)this.musicElement.volume=this.musicLevel;if(this.musicLevel<=.002)this.swapSource();else return;}
    if(this.musicWanted())this.playMusic();
    const target=this.musicMode==='driving'?this.musicVolume*.78:this.musicMode==='escape'&&this.escapeChoice!=='off'?this.musicVolume*.70:this.remaining>0?this.musicVolume*Math.min(1,this.remaining/2):0;
    this.musicLevel+=(target-this.musicLevel)*(1-Math.exp(-dt*4));
    if(this.musicElement)this.musicElement.volume=Math.min(1,Math.max(0,this.musicLevel));
    if(!this.musicWanted()&&this.musicLevel<.002)this.pauseMusic();
  }
  retry() { if(this.disposed)return;this.error=false;this.failure='';this.mediaController.abort();this.mediaController=new AbortController();this.starting=false;this.pendingRequest=0;this.musicElement?.load();void this.unlock(); }
  reset() {this.mediaGeneration++;this.playbackActivation++;this.mediaController.abort();this.mediaController=new AbortController();this.starting=false;this.pendingRequest=0;this.stopEffects();this.musicMode='run';this.escapeChoice='battle';this.escapeMood='search';this.desiredSource='/audio/run.mp3';this.sourceFade=false;this.remaining=0;this.musicLevel=0;this.paused=true;this.pauseMusic();const previous=this.musicElement;this.musicElement=null;if(previous){try{previous.currentTime=0;}catch{}this.releaseMusic(previous);}this.error=false;this.failure='';}
  diagnostics(){return {owner:'game' as const,musicMode:this.musicMode,escapeChoice:this.escapeChoice,targetSource:this.desiredSource,transitioning:this.sourceFade,src:this.musicElement?.src??'',playing:this.isMusicPlaying,playingCount:this.isMusicPlaying?1:0,pending:this.starting,paused:this.paused,muted:this.musicVolume===0,volume:this.musicElement?.volume??0,currentTime:this.musicElement?.currentTime??0,remaining:this.remaining,generation:this.mediaGeneration,request:this.pendingRequest||null,contextState:this.context?.state??'uninitialized',effectSources:this.sounds.size,engineRpm:this.engineRpm,error:this.error,failure:this.failure};}
  /** Replace game audio with one result cue; a later pause/reset also cancels it. */
  finish(won:boolean) {
    if(this.disposed)return;
    this.reset();
    this.schedulingResult=true;
    try{this.cue(won?'win':'lose');}finally{this.schedulingResult=false;}
  }
  private track(source:AudioScheduledSourceNode,nodes:AudioNode[]) {
    const sound:ActiveSound={source,nodes,released:false};
    this.sounds.add(sound);
    source.onended=()=>this.release(sound,false);
  }
  private release(sound:ActiveSound,stop:boolean) {
    if(sound.released)return;
    sound.released=true;this.sounds.delete(sound);sound.source.onended=null;
    // stop() also cancels sources whose start time is still in the future.
    if(stop){try{sound.source.stop(this.context?.currentTime??0);}catch{/* Already ended or the context was closed. */}}
    for(const node of sound.nodes){try{node.disconnect();}catch{/* A disposed browser context can already be disconnected. */}}
  }
  private stopEffects() {this.engineRpm=0;for(const sound of this.sounds)this.release(sound,true);this.engineSound=null;this.tireClock=0;this.tireLevel=0;}
  private stopEngine(){this.engineRpm=0;if(!this.engineSound)return;const owned=new Set<AudioScheduledSourceNode>([this.engineSound.low,this.engineSound.harmonic]);for(const sound of this.sounds)if(owned.has(sound.source)||sound.nodes.includes(this.engineSound.road))this.release(sound,true);this.engineSound=null;}
  /** A quiet continuous engine graph; pause/reset releases every oscillator and loop. */
  engine(speed:number,throttle:number,dt:number,drivetrain:{rpm:number;shiftLeft:number}={rpm:900,shiftLeft:0}){
    const c=this.context;if(!c||!this.master||!this.noise||this.paused||this.disposed||this.musicMode!=='driving'||c.state!=='running')return;
    if(!this.engineSound){
      const low=c.createOscillator(),harmonic=c.createOscillator(),gain=c.createGain(),filter=c.createBiquadFilter(),road=c.createGain(),roadFilter=c.createBiquadFilter(),noise=c.createBufferSource();
      low.type='triangle';harmonic.type='sawtooth';gain.gain.value=0;road.gain.value=0;filter.type='lowpass';roadFilter.type='lowpass';roadFilter.frequency.value=480;noise.buffer=this.noise;noise.loop=true;
      low.connect(filter);harmonic.connect(filter);filter.connect(gain);gain.connect(this.master);noise.connect(roadFilter);roadFilter.connect(road);road.connect(this.master);
      this.track(low,[low,filter,gain]);this.track(harmonic,[harmonic]);this.track(noise,[noise,roadFilter,road]);low.start(c.currentTime);harmonic.start(c.currentTime);noise.start(c.currentTime);
      this.engineSound={low,harmonic,gain,road,filter};
    }
    this.engineRpm=drivetrain.rpm;const engine=this.engineSound,time=Math.max(.025,Math.min(.15,dt*3)),sound=engineSoundParameters(speed,throttle,drivetrain.rpm,drivetrain.shiftLeft);
    engine.low.frequency.setTargetAtTime(sound.frequency,c.currentTime,time);engine.harmonic.frequency.setTargetAtTime(sound.frequency*2,c.currentTime,time);engine.filter.frequency.setTargetAtTime(sound.cutoff,c.currentTime,time);
    engine.gain.gain.setTargetAtTime(sound.gain,c.currentTime,time);engine.road.gain.setTargetAtTime(sound.road,c.currentTime,time);
  }
  vehicleCue(kind:'impact'|'brake'|'guide'|'shift'|'shiftRejected'){
    if(kind==='shift'){this.burst(.045,.025,2400);this.tone(130,.06,.014,'triangle',90);}
    if(kind==='shiftRejected')this.tone(480,.085,.035,'sine',420);
    if(kind==='impact'){this.burst(.13,.15,850);this.tone(64,.15,.05,'triangle',30);}
    if(kind==='brake')this.burst(.12,.045,1700);
    if(kind==='guide'){this.tone(570,.09,.040,'sine');this.tone(720,.13,.032,'sine',undefined,.08);}
  }
  /** Walking photography uses only the effects graph; it never creates music media. */
  cameraCue(kind:'focus'|'shutter'){
    if(kind==='focus'){this.tone(1046.5,.07,.045,'sine');this.tone(1396.9,.09,.035,'sine',undefined,.07);}
    else{this.burst(.055,.065,3800);this.tone(150,.07,.03,'triangle',65);}
  }
  /** Actual lateral slip controls the quiet tyre feedback, independently of input. */
  tires(lateralSpeed:number,slipAngle:number,dt:number){
    if(this.paused||this.disposed||this.musicMode!=='driving')return;
    const sideways=Number.isFinite(lateralSpeed)?Math.abs(lateralSpeed):0,angle=Number.isFinite(slipAngle)?Math.abs(slipAngle):0;
    const target=sideways>.65&&angle>.05?Math.min(.04,(sideways-.65)*.012):0;
    this.tireLevel+=(target-this.tireLevel)*(1-Math.exp(-Math.max(0,dt)*16));
    this.tireClock=Math.max(0,this.tireClock-dt);
    if(this.tireLevel>.002&&this.tireClock===0){this.burst(.16,this.tireLevel,2500);this.tone(470,.10,this.tireLevel*.20,'triangle',380);this.tireClock=.12;}
  }
  /** Short original non-verbal signals; they carry direction but reveal no hidden NPC. */
  npcCue(kind:'principal'|'sprint'|'callout',source?:Position){
    const pan=this.direction(source),distance=source?Math.hypot(source.x-this.listener.x,source.y-this.listener.y,source.z-this.listener.z):0,v=.08/(1+distance*.045);
    if(kind==='sprint'){this.burst(.055,v,1200,0,pan);this.burst(.055,v*.8,1500,.11,pan);}
    if(kind==='principal'){this.tone(294,.15,v,'triangle',undefined,0,pan);this.tone(392,.20,v*.8,'sine',undefined,.13,pan);}
    if(kind==='callout'){this.tone(660,.09,v,'sine',undefined,0,pan);this.tone(440,.14,v*.85,'triangle',undefined,.10,pan);}
  }
  /** User-triggered intro cue: allowed on paused menus, without music or simulation. */
  guide(){if(this.disposed)return;const previous=this.schedulingResult;this.schedulingResult=true;try{this.vehicleCue('guide');}finally{this.schedulingResult=previous;}}
  setListener(position:Position,forward:Position){this.listener={...position};this.forward={...forward};}
  private direction(source?:Position){if(!source)return 0;const dx=source.x-this.listener.x,dz=source.z-this.listener.z,length=Math.hypot(dx,dz),horizontal=Math.hypot(this.forward.x,this.forward.z);return length>.01&&horizontal>.01?Math.max(-.9,Math.min(.9,(-this.forward.z*dx+this.forward.x*dz)/(horizontal*length))):0;}
  private route(node:AudioNode,nodes:AudioNode[],pan:number){if(!this.context||!this.master)return;const create=this.context.createStereoPanner;if(create){const panner=create.call(this.context);panner.pan.value=pan;node.connect(panner);panner.connect(this.master);nodes.push(panner);}else node.connect(this.master);}
  private tone(frequency:number,duration:number,volume:number,type:OscillatorType='sine',end?:number,delay=0,pan=0) {
    const c=this.context;if(!c||!this.master||c.state!=='running'||(this.paused&&!this.schedulingResult)||this.disposed)return;
    const t=c.currentTime+delay, o=c.createOscillator(),g=c.createGain();
    o.type=type;o.frequency.setValueAtTime(frequency,t);if(end)o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),t+.004);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    const nodes:AudioNode[]=[o,g];o.connect(g);this.route(g,nodes,pan);this.track(o,nodes);o.start(t);o.stop(t+duration+.02);
  }
  private burst(duration:number,volume:number,cutoff:number,delay=0,pan=0) {
    const c=this.context;if(!c||!this.master||!this.noise||c.state!=='running'||(this.paused&&!this.schedulingResult)||this.disposed)return;
    const t=c.currentTime+delay,src=c.createBufferSource(),filter=c.createBiquadFilter(),g=c.createGain();src.buffer=this.noise;filter.type='lowpass';filter.frequency.value=cutoff;
    g.gain.setValueAtTime(Math.max(.0002,volume),t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);src.connect(filter);filter.connect(g);const nodes:AudioNode[]=[src,filter,g];this.route(g,nodes,pan);this.track(src,nodes);src.start(t);src.stop(t+duration+.02);
  }
  /** Four original layers: pressure transient, low body, mechanical click, outdoor tail. */
  shot(weapon:string,distance=0,source?:Position,occlusion=0) {
    const id=({pistol:'glock',auto:'m4a1',scatter:'r870'} as Record<string,string>)[weapon]??weapon,profile=SHOT_PROFILES[id as keyof typeof SHOT_PROFILES]??SHOT_PROFILES.glock;
    const pan=this.direction(source),far=Number.isFinite(distance)?Math.max(0,distance):0,blocked=Number.isFinite(occlusion)?Math.max(0,Math.min(1,occlusion)):0;
    // Obstructions soften the pressure edge while a quiet low body still carries.
    // Synthesis has its own fixed noise buffer and never consumes combat RNG.
    const v=.25/(1+far*.070)*(1-blocked*.65),cutoff=profile.cutoff/(1+far*.015+blocked*4),delay=Math.min(.18,far/343);
    this.burst(profile.duration,v,cutoff,delay,pan);this.tone(profile.punch,id==='awm'?.12:.075,v*.36,'triangle',id==='awm'?28:42,delay,pan);
    this.burst(id==='m249'?.044:.035,v*.14,Math.min(2800,cutoff),delay+.040,pan);this.burst(profile.tail,v*.18,Math.min(1800,cutoff),delay+.020,pan);
  }
  mechanical(weapon:string,stage:'mag-out'|'mag-in'|'bolt'|'shell'|'pump'|'open-cover'|'belt-in'|'close-cover',source?:Position){
    const pan=this.direction(source),distance=source?Math.hypot(source.x-this.listener.x,source.y-this.listener.y,source.z-this.listener.z):0,v=.105/(1+distance*.11);
    if(stage==='mag-out')this.burst(.050,v,3400,0,pan);
    if(stage==='mag-in'){this.burst(.065,v*1.2,2800,0,pan);this.tone(215,.035,v*.25,'triangle',92,0,pan);}
    if(stage==='bolt'||stage==='pump'){this.burst(stage==='pump'?.090:weapon==='awm'?.070:.045,v,4800,0,pan);this.burst(.033,v*.7,2400,stage==='pump'?.11:weapon==='awm'?.12:.06,pan);}
    if(stage==='open-cover'){this.burst(.075,v*.8,2200,0,pan);this.tone(145,.06,v*.2,'triangle',92,0,pan);}
    if(stage==='belt-in'){this.burst(.095,v,3200,0,pan);this.burst(.055,v*.5,1800,.10,pan);}
    if(stage==='close-cover'){this.burst(.060,v*1.3,2700,0,pan);this.tone(170,.04,v*.3,'triangle',70,0,pan);}
    if(stage==='shell'){this.burst(.047,v*.70,2300,0,pan);this.tone(310,.025,v*.13,'triangle',180,0,pan);}
  }
  /** Neutral feedback is used unless the collision surface is explicitly known. */
  impact(surface:'neutral'|'ground'|'wall'|'metal',source?:Position){
    const distance=source?Math.hypot(source.x-this.listener.x,source.y-this.listener.y,source.z-this.listener.z):0,pan=this.direction(source),volume=.085/(1+distance*.10);
    if(surface==='metal'){this.burst(.035,volume,4200,0,pan);this.tone(1640,.12,volume*.3,'sine',930,0,pan);}
    else if(surface==='ground'){this.burst(.065,volume*.75,850,0,pan);this.tone(110,.035,volume*.10,'triangle',60,0,pan);}
    else if(surface==='wall'){this.burst(.055,volume,1700,0,pan);this.tone(240,.035,volume*.13,'triangle',120,0,pan);}
    else this.burst(.045,volume*.8,2300,0,pan);
  }
  step(surface:'road'|'grass'|'stone',running:boolean,distance=0,source?:Position) {const v=(running?.115:.075)/(1+distance*.17),pan=this.direction(source);this.burst(.085,v,surface==='grass'?650:surface==='stone'?2400:1300,0,pan);this.tone(surface==='grass'?68:95,.07,v*.28,'sine',45,0,pan);}
  cue(kind:'reload'|'hit'|'headshot'|'suppressed'|'empty'|'blocked'|'pickup'|'hurt'|'win'|'lose'|'smoke') {
    if(kind==='reload'){this.burst(.04,.09,3600);this.burst(.045,.12,2600,.27);}
    if(kind==='hit'){this.tone(790,.045,.075,'triangle',440);}
    if(kind==='headshot'){this.tone(1100,.045,.09,'triangle',650);this.tone(1380,.05,.055,'sine',830,.035);}
    if(kind==='suppressed'){this.tone(920,.065,.080,'triangle',600);this.tone(620,.08,.06,'sine',430,.06);}
    if(kind==='empty'||kind==='blocked')this.burst(.025,.08,3700);
    if(kind==='hurt'){this.burst(.12,.14,550);this.tone(75,.15,.11,'sine',36);}
    if(kind==='pickup'){this.tone(520,.14,.095,'sine');this.tone(780,.2,.075,'sine',undefined,.1);}
    if(kind==='smoke'){this.burst(.28,.16,1200);this.tone(130,.09,.07,'triangle',50);}
    if(kind==='win'){[392,494,587,784].forEach((n,i)=>this.tone(n,.35,.085,'sine',undefined,i*.12));}
    if(kind==='lose'){this.tone(220,.25,.09,'sine',165);this.tone(146,.4,.08,'sine',98,.2);}
  }
  dispose() {if(this.disposed)return;this.disposed=true;this.reset();this.master?.disconnect();void this.context?.close().catch(()=>{});this.context=null;this.master=null;this.noise=null;}
}
