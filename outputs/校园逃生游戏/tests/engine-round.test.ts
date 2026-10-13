import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {Vector3,Quaternion} from 'three';
import {RULES,WEAPONS} from '../src/rules.ts';
import {DRIVE_RULES} from '../src/driving-rules.ts';
import {ESCAPE_DIFFICULTIES,ESCAPE_RULES} from '../src/escape/config.ts';
import {VALIDATED_ESCAPE_EXTRACTION,VALIDATED_ESCAPE_SITES} from '../src/escape/validated.ts';
import type {NpcIdentityId} from '../src/npc-roster.ts';
import type {Action,InputFrame,Snapshot,GameAPI,DriveInput,Vec3,WeaponId,Mode} from '../src/types.ts';
import {StorySession} from '../src/story/session.ts';
import type {StoryCheckpoint} from '../src/story/types.ts';

// Exercise the production round loop without a GPU or browser. Only its platform
// dependencies are replaced; pickup, time, pause, finish and reset stay in engine.ts.
const threeUrl=import.meta.resolve('three');
const registryUrl=new URL('../src/npc-roster.ts',import.meta.url).href;
const storySessionUrl=new URL('../src/story/session.ts',import.meta.url).href;
const storyContentUrl=new URL('../src/story/content.ts',import.meta.url).href;
const asModule=(source:string)=>`data:text/javascript,${encodeURIComponent(source)}`;
const mocks:Record<string,string>={
 './story':asModule(`export {StorySession,validateStoryCheckpoint} from ${JSON.stringify(storySessionUrl)};export {STORY_START,introCameraAt} from ${JSON.stringify(storyContentUrl)};export class StorySaveStore {async save(value){const f=globalThis.roundFixture;f.saveStarted?.push(value);const failure=f.saveFailureOnce>0;if(failure)f.saveFailureOnce--;if(f.saveGate)await f.saveGate;if(failure)throw Error('fixture save failed');f.storySaves.push(value);}async close(){}}`),
 './story-world':asModule(`export async function createStoryWorld(){const f=globalThis.roundFixture;f.storyCreates++;if(f.storyGate)await f.storyGate;return {root:{visible:true},update(snapshot,dt){f.storyUpdates.push({step:snapshot.step,dt});},actorPositions(){return [];},blockedCompanions(){return [];},orient(){},dispose(){f.storyDisposals++;}};}`),
 './story-audio':asModule(`export class StoryAudio {
  error=false;chapter=null;paused=true;generation=0;
  async unlock(chapter=0){globalThis.roundFixture.audioEvents.push({owner:'story',action:'unlock',chapter});this.prepare(chapter);}
  primeGesture(chapter=0){globalThis.roundFixture.audioEvents.push({owner:'story',action:'prime',chapter});return this.unlock(chapter);}
  prepare(chapter=0){this.chapter=chapter;globalThis.roundFixture.audioEvents.push({owner:'story',action:'prepare',chapter});}
  setVolumes(){}cue(){}dispose(){}
  reset(preserveGesture=false){this.generation++;this.chapter=null;this.paused=true;globalThis.roundFixture.audioEvents.push({owner:'story',action:'reset',preserveGesture});}
  retry(){globalThis.roundFixture.audioEvents.push({owner:'story',action:'retry'});void this.unlock(this.chapter??0);}
  pause(){this.paused=true;globalThis.roundFixture.storyAudioPauses++;}
  update(dt,snapshot,paused=false,musicOnly=false){this.chapter=snapshot.chapter;this.paused=paused;globalThis.roundFixture.storyAudioUpdates.push({dt,step:snapshot.step,chapter:snapshot.chapter,paused,musicOnly});}
  diagnostics(){const key=this.chapter===null?'':this.chapter>=6?'golden-hour':this.chapter>=4?'aphelion':'childhood';return {owner:'story',activeTrack:key,targetTrack:key,src:key?'/story/audio/'+key+'.mp3':'',playing:!!key&&!this.paused,playingCount:key&&!this.paused?1:0,pending:false,paused:this.paused,generation:this.generation};}
 }`),
 './photography/album':asModule('export async function listPhotos(){const f=globalThis.roundFixture;if(f.albumGate)await f.albumGate;if(f.albumFailure)throw Error("fixture album failed");return f.albumRows??[];}'),
 './ui-modules':asModule('export async function loadPhotoUI(){} export async function preloadModeUI(){}'),
 './camera-model':asModule(`import {Group} from ${JSON.stringify(import.meta.resolve('three'))};export function createCameraModel(){return {group:new Group(),update(){},dispose(){}};}`),
  three:asModule(`export * from ${JSON.stringify(threeUrl)};
    export class WebGLRenderer {
      constructor(){this.domElement=globalThis.roundFixture.canvas;this.shadowMap={};this.info={render:{calls:0,triangles:0},memory:{geometries:0,textures:0}};}
      setClearColor(){} setPixelRatio(){} setSize(){} clear(){} clearDepth(){} render(){} dispose(){}
    }`),
  './world':asModule('export async function loadWorld(_scene,progress){progress(1,"ready");return globalThis.roundFixture.world;}'),
  './game-map':asModule('export const gameMapSession={async read(){return new TextEncoder().encode(JSON.stringify(globalThis.roundFixture.driveMap())).buffer;}};'),
  './input':asModule('export function createInput(){return globalThis.roundFixture.input;}'),
  './audio':asModule(`export class GameAudio {
    constructor(){this.error=false;this.ends=globalThis.roundFixture.ends;this.loaded=false;this.paused=true;this.musicMode='run';}
    setVolumes(){} setListener(){} setMusicMode(mode){this.musicMode=mode;} setEscapeMusic(){} impact(){} engine(){} vehicleCue(){} guide(){} mechanical(){} tires(){} cameraCue(kind){globalThis.roundFixture.audioEvents.push({owner:'game',action:'camera-'+kind});} npcCue(kind){globalThis.roundFixture.npcCues.push(kind);}
    async unlock(){const f=globalThis.roundFixture;f.audioEvents.push({owner:'game',action:'unlock'});f.runMusicRequests.push('/audio/run.mp3');this.loaded=true;}
    async unlockEffects(){globalThis.roundFixture.audioEvents.push({owner:'game',action:'effects'});}
    reset(){this.loaded=false;this.paused=true;globalThis.roundFixture.audioEvents.push({owner:'game',action:'reset'});}
    update(_dt,paused){this.paused=paused;} cue(){} shot(){} step(){}
    run(){globalThis.roundFixture.audioEvents.push({owner:'game',action:'run'});globalThis.roundFixture.runMusicRequests.push('/audio/run.mp3');}
    retry(){globalThis.roundFixture.audioEvents.push({owner:'game',action:'retry'});void this.unlock();}dispose(){}
    get isMusicPlaying(){return this.loaded&&!this.paused&&this.musicMode==='driving';}
    diagnostics(){return {owner:'game',src:this.loaded?'/audio/run.mp3':'',playing:this.isMusicPlaying,playingCount:this.isMusicPlaying?1:0,pending:false,paused:this.paused};}
    finish(won){this.ends.push(won);}
  }`),
  './characters':asModule(`import {Group} from ${JSON.stringify(threeUrl)};
    export function createCharacter(){return {root:new Group(),update(){},setWeapon(){},dispose(){}};}
    export function createViewWeapon(){return {root:new Group(),update(){},getMuzzle(camera){return camera.position.clone();},getAimDirection(camera){return camera.getWorldDirection(new (camera.position.constructor)());},getBarrelDirection(camera){return camera.getWorldDirection(new (camera.position.constructor)());},getEjection(camera){return camera.position.clone();},addWeapon(){},removeWeapon(){},dispose(){}};}`),
  './weapons':asModule(`import {Group,Vector3} from ${JSON.stringify(threeUrl)};export async function prepareWeapons(progress){progress?.(1);return ()=>{};} export function weaponResourceDiagnostics(){return {models:0,pending:0,references:0,keys:[]};} export function createWorldWeapon(){const root=new Group();return {root,dispose(){root.removeFromParent();}};}`),
  './vehicle-visual.ts':asModule(`import {Group} from ${JSON.stringify(threeUrl)};export async function createVehicleVisual(){const f=globalThis.roundFixture;f.visualCreates++;if(f.visualGate)await f.visualGate;return {root:new Group(),update(){},dispose(){f.visualDisposals++;}};}`),
  './billboards':asModule(`import {Group} from ${JSON.stringify(threeUrl)};
    export async function prepareBillboards(ids,progress){const f=globalThis.roundFixture;f.preparedIds=[...ids];f.billboardLoads.push([...ids]);if(f.billboardFailures>0){f.billboardFailures--;throw Error('fixture portraits failed');}if(f.billboardGate)await f.billboardGate;progress?.(1);return ()=>{f.billboardReleases++;};}
    export function billboardResourceDiagnostics(){return {entries:0,ready:0,references:0,decodedPixels:0,approxRgbaBytes:0,keys:[]};}
    export function createBillboardCharacter(identityId){const root=new Group(),f=globalThis.roundFixture,id=f.preparedIds.indexOf(identityId);if(id<0)throw Error('Unprepared identity '+identityId);root.userData.identityId=identityId;f.characterRoots.set(id,root);f.createdIds.push(identityId);return {root,update(_dt,state){f.characterStates.set(id,{...state});},setWeapon(){},getMuzzleWorld(){return root.position.clone().add({x:0,y:1.3,z:0});},getMuzzleDirectionWorld(){return new (root.position.constructor)(0,0,1).applyQuaternion(root.quaternion);},getEjectionWorld(){return root.position.clone().add({x:0,y:1.3,z:0});},isAimReady(){return true;},hitTest(){return f.shotTarget===id?{distance:1,region:'head'}:null;},dispose(){}};}`),
  './npc-roster.ts':asModule(`export * from ${JSON.stringify(registryUrl)};export function selectRoundRoster(_random,mode){const f=globalThis.roundFixture;f.rosterSelections++;return mode==='roam'?[]:[...f.roster];}`),
};
registerHooks({
  resolve(specifier,context,nextResolve){
    if(context.parentURL?.includes('/src/engine.ts')&&mocks[specifier])return {url:mocks[specifier],shortCircuit:true};
    if(context.parentURL?.includes('/src/')&&/^\.\.?\//.test(specifier)&&!/\.(ts|tsx|json)$/.test(specifier))return nextResolve(`${specifier}.ts`,context);
    return nextResolve(specifier,context);
  },
  load(url,context,nextLoad){
    if(new URL(url).pathname.endsWith('/src/engine.ts'))return {format:'module-typescript',source:readFileSync(new URL(url),'utf8').replaceAll('import.meta.env.DEV','true'),shortCircuit:true};
    return nextLoad(url,context);
  },
});

class Canvas extends EventTarget {
  tabIndex=0;dataset:Record<string,string>={};
  setAttribute(){} remove(){} focus(){}
}
class Document extends EventTarget {
  hidden=false;pointerLockElement:unknown=null;
  createElement(){return {width:0,height:0,getContext:()=>null};}
  exitPointerLock(){this.pointerLockElement=null;}
}
const empty=():InputFrame=>({moveX:0,moveY:0,lookX:0,lookY:0,fire:false,aim:false,crouch:false,actions:new Set()});

type DiagnosticNPC={identity?:NpcIdentityId;slot?:number;skill?:string;teamTarget?:Vec3|null;teamLeft?:number;skillPhase?:string;skillLeft?:number;attackPhase:string;shotSerial:number;ammo:number;weapon:WeaponId;disabled:number;position:Vec3;flight?:'stunned'|'respawning';driveState?:string};
type AudioEvent={owner:'story'|'game';action:string;chapter?:number;preserveGesture?:boolean};
type StoryRoundControls={storyCreates:()=>number;storyDisposals:()=>number;deferStoryWorld:()=>()=>void;storyUpdates:{step:string;dt:number}[];storyAudioUpdates:{step:string;dt:number;chapter:number;paused:boolean;musicOnly:boolean}[];storyAudioPauses:()=>number;storySaves:StoryCheckpoint[];audioEvents:AudioEvent[];runMusicRequests:string[]};
type RoundControls=StoryRoundControls&{step:(frames?:number)=>void;moveTo:(x:number,z:number)=>void;moveToHeight:(x:number,y:number,z:number)=>void;support:(enabled:boolean)=>void;restored:number[][];placeNPC:(index:number,x:number,y:number,z:number)=>void;diagnostics:()=>{npcs:DiagnosticNPC[]};snapshot:()=>Snapshot;ends:boolean[];snapshots:Snapshot[];pauseAction:()=>void;wallAt:(z:number|null)=>void;stream:(blocked:boolean,failed?:boolean)=>void;waitForLock:()=>()=>void;denyLock:()=>void;background:()=>void;loseGraphics:()=>void;impact:(id:number)=>void;physicalSteps:()=>number;vehicleDisposals:()=>number;visualCreates:()=>number;visualDisposals:()=>number;deferVisual:()=>()=>void;respawnPoints:(id:number,points:Vec3[])=>void;allowReentry:(allowed:boolean)=>void;reentries:{id:number;position:Vec3;success:boolean}[];npcVisible:(id:number)=>boolean;shotTarget:(id:number|null)=>void;performance:()=>Record<string,number|null|string|boolean>;route:(enabled:boolean,safe?:boolean)=>void;billboardLoads:NpcIdentityId[][];createdIds:NpcIdentityId[];npcCues:string[];characterStates:Map<number,{skill?:string;speed:number;attackPhase:string}>;failBillboardsOnce:()=>void;deferBillboards:()=>()=>void;billboardReleases:()=>number;rosterSelections:()=>number};
type InputRoundControls={inputState:()=>{enabled:boolean;suspended:boolean;resets:number;heldMove:[number,number];fastWalk:boolean}};
async function fixture(run:(api:GameAPI,f:RoundControls&InputRoundControls&{roundSeed:(seed:number)=>void})=>Promise<void>,options:{roster?:NpcIdentityId[];seed?:number;randomRoster?:boolean}={}){
  let dateNow=options.seed??1000,now=1000,scheduled:FrameRequestCallback|null=null,frame=empty(),wallZ:number|null=null,blocked=false,failed=false,lockReady:Promise<void>|null=null;
  const canvas=new Canvas(),doc=new Document(),win=new EventTarget(),snapshots:Snapshot[]=[],ends:boolean[]=[];
  const teleport=new Vector3(),spawn:[number,number,number]=[0,0,0],restored:number[][]=[],initialActorPositions=new Map<number,Vector3>(Array.from({length:6},(_,i)=>[i,new Vector3(1000+i*100,0,0)]));let supported=true,physicalSteps=0,vehicleDisposals=0,routeEnabled=false,routeSafe=true;const impacts:{id:number;speed:number}[]=[];
  const thrown=new Map<number,{position:Vector3;rotation:Quaternion;phase:'stunned'|'respawning';remaining:number}>(),actorPositions=new Map<number,Vector3>(),pools=new Map<number,Vec3[]>(),reentries:RoundControls['reentries']=[];let allowReentry=true,activeDriveMap:any=null;
  const vehicle={setTransmission(){},shift(){},beforeStep(){},afterStep(dt:number){const result={impacts:impacts.splice(0).filter(h=>!thrown.has(h.id))};for(const t of thrown.values()){if(t.phase==='stunned'){t.remaining=Math.max(0,t.remaining-dt);if(t.remaining<=0)t.phase='respawning';}}for(const h of result.impacts)if(!thrown.has(h.id))thrown.set(h.id,{position:new Vector3(0,0,-7),rotation:new Quaternion(),phase:'stunned',remaining:DRIVE_RULES.stun});return result;},read:()=>({position:teleport.clone(),rotation:new Quaternion(),yaw:0,speed:0,horizontalSpeed:0,gear:1,rpm:900,transmission:'auto',shiftLeft:0,shiftSerial:0,rejectedShiftSerial:0,velocity:new Vector3(),lateralSpeed:0,slipAngle:0,handbrake:false,handbrakeAssist:0,wheelContacts:4,wheels:[],resetRequired:false}),npc:(id:number)=>thrown.get(id)??null,reenter(id:number,p:Vector3){const success=allowReentry&&thrown.get(id)?.phase==='respawning';reentries.push({id,position:p.toArray() as Vec3,success});if(success){actorPositions.set(id,p.clone());thrown.delete(id);}return success;},reset:()=>{teleport.set(0,0,0);return true;},hitDistance:()=>.5,cameraDistance:(_o:Vector3,_d:Vector3,max:number)=>max,stop(){},dispose(){vehicleDisposals++;thrown.clear();actorPositions.clear();impacts.length=0;}};
  // A deterministic safe world adapter uses the production calibrated task coordinates.
  // Physics mesh traversal/rendering are verified by separate map integration checks.
  const world={
    async prepareCombat(){return ()=>{};},
    checkSafety(){return this.update();},
    diagnostics(){return {};},
    manifest:{spawn,spawnYaw:0,extraction:VALIDATED_ESCAPE_EXTRACTION.position,clues:[10,20,30].map((z,i)=>({id:String(i),label:`clue ${i+1}`,position:[0,0,z]})),supplies:[],npcSpawns:[1000,1100,1200,1300].map(x=>[x,0,0])},
    setCrouch:(_p:Vector3,c:boolean)=>c,
    supportAt:(p:Vector3,_clearanceHeight?:number)=>supported?{height:p.y,normalY:1,clear:true}:null,
    npcRouteSafe:(points:Vector3[])=>supported&&routeSafe&&points.length>=2,
    restorePlayer:(p:Vector3)=>{teleport.copy(p);restored.push(p.toArray());},
    move:()=>({position:teleport.clone(),grounded:true,crouching:false}),
    actorNavigationStatus:()=>({yielding:false}),removeActor(){},actorPath:(id:number,from:Vector3,to:Vector3)=>routeEnabled?[from.clone(),to.clone()]:[],rayImpact:(origin:Vector3,direction:Vector3,max:number)=>{if(wallZ===null||Math.abs(direction.z)<1e-9)return null;const intersection=(wallZ-origin.z)/direction.z;return intersection>=0&&intersection<max?{distance:intersection,normal:{x:0,y:0,z:-1}}:null;},rayDistance:(origin:Vector3,direction:Vector3,max:number)=>{
      if(wallZ===null||Math.abs(direction.z)<1e-9)return max;
      const intersection=(wallZ-origin.z)/direction.z;
      return intersection>=0?Math.min(max,intersection):max;
    },
    step:()=>{physicalSteps++;return 0;},startDriving:(map:any)=>{activeDriveMap=map;return vehicle;},actorPosition:(id:number)=>actorPositions.get(id)?.clone()??null,pathOutdoor:(from:Vector3,to:Vector3)=>[from.clone(),to.clone()],path:(from:Vector3,to:Vector3)=>[from.clone(),to.clone()],storyPath:(from:Vector3,to:Vector3)=>[from.clone(),to.clone()],nearest:(p:Vector3)=>p.clone(),setPhotoView(){},setCombatView(){},visionVisible(a:Vector3,b:Vector3){const delta=b.clone().sub(a),length=delta.length();return length<.01||this.rayDistance(a,delta.divideScalar(length),length)>=length-.005;},async prepareViews(){return ()=>{};},retryView(){},moveActor:(id:number,p:Vector3,desired:Vector3)=>{const initial=initialActorPositions.get(id);if(initial){initialActorPositions.delete(id);return initial.clone();}return p.clone().add(desired);},validateDrivingSpawn:()=>[...spawn],resetActors(){},retry(){},update(){return {blocked,failed,viewReady:true,viewFailed:false,viewProgress:1,progress:blocked?.5:1,message:failed?'failed':'loading'};},dispose(){},
  };
  let inputMode:Mode='escape',inputEnabled=true,inputSuspended=false,inputResets=0,touchFastWalk=false,heldMove:[number,number]=[0,0];
  const resetInput=()=>{frame=empty();heldMove=[0,0];touchFastWalk=false;inputResets++;};
  const flushInput=()=>{frame.lookX=frame.lookY=0;frame.actions.clear();};
  const input={sample:()=>{if(!inputEnabled||inputSuspended)return {...empty(),fastWalk:false};const sampled={...frame,moveX:heldMove[0],moveY:heldMove[1],...(inputMode==='story'?{fastWalk:touchFastWalk}:{})};frame=empty();return sampled;},reset:resetInput,async lock(){if(lockReady)await lockReady;},dispose(){resetInput();},
    setPhotography(){},setEscapeAimMode(){},getSprintIntent(){return false;},setCursorFree(){},isCursorFree(){return false;},isLocked(){return true;},freePointerLock(){},flushTransient:flushInput,action:(action:Action,pressed=true)=>{if(!inputEnabled||inputSuspended)return;if(inputMode==='story'&&action==='run'){if(pressed)touchFastWalk=!touchFastWalk;return;}if(pressed)frame.actions.add(action);if(action==='fire')frame.fire=pressed;},setMode(next:Mode){if(next!==inputMode){resetInput();inputMode=next;}},setEnabled(next:boolean){if(next===inputEnabled)return;inputEnabled=next;if(!next)resetInput();},setSuspended(next:boolean){if(next===inputSuspended)return;inputSuspended=next;flushInput();},holdLook(){},drive(value:Partial<DriveInput>){frame.drive={steer:0,throttle:0,brake:0,handbrake:false,reverse:false,boost:false,reset:false,...frame.drive,...value};},move(x:number,y:number){if(!inputEnabled||inputSuspended&&(x!==0||y!==0))return;heldMove=[x,y];},look(x:number,y:number){if(inputEnabled&&!inputSuspended){frame.lookX+=x;frame.lookY+=y;}}};
  const storage=new Map<string,string>();
  const storyFixture={storyCreates:0,storyDisposals:0,storyGate:null as Promise<void>|null,storyUpdates:[] as {step:string;dt:number}[],storyAudioUpdates:[] as {step:string;dt:number;chapter:number;paused:boolean;musicOnly:boolean}[],storyAudioPauses:0,storySaves:[] as StoryCheckpoint[],audioEvents:[] as AudioEvent[],runMusicRequests:[] as string[]};
  const roundFixture={canvas,world,input,ends,roster:options.roster??['jiang','meng','xu','luan'] as NpcIdentityId[],rosterSelections:0,preparedIds:[] as NpcIdentityId[],billboardLoads:[] as NpcIdentityId[][],billboardReleases:0,billboardFailures:0,billboardGate:null as Promise<void>|null,createdIds:[] as NpcIdentityId[],npcCues:[] as string[],characterStates:new Map<number,{skill?:string;speed:number;attackPhase:string}>(),characterRoots:new Map<number,{visible:boolean}>(),shotTarget:null as number|null,visualCreates:0,visualDisposals:0,visualGate:null as Promise<void>|null};
  Object.assign(roundFixture,storyFixture);
  const escapeRoster=[...(options.roster??['jiang','meng','xu','luan'])];for(const id of ['jiang','meng','xu','luan','xutao','chengguotao'] as NpcIdentityId[])if(!escapeRoster.includes(id))escapeRoster.push(id);
   const driveMap=()=>({version:12,releaseVersion:'1.2.2',spawn,spawnYaw:0,npcSpawns:world.manifest.npcSpawns,npcRegions:world.manifest.npcSpawns.map((home,npcId)=>({npcId,id:'region-'+npcId,label:'region',home,spawnPoints:[home],patrolPoints:[home],respawnPoints:pools.get(npcId)??[[home[0]+25,home[1],home[2]+10]]})),repairs:[],barriers:[],bounds:{min:[-200,-5,-200],max:[200,5,200]},excluded:[],outdoorWaypoints:[]});Object.assign(roundFixture,{driveMap});
   const globals={roundFixture,document:doc,window:win,navigator:{maxTouchPoints:0},matchMedia:()=>({matches:false}),location:{search:options.randomRoster?'':'?qaRoster='+escapeRoster.join(',')+'&qaSeed='+(options.seed??1000)},devicePixelRatio:1,
    fetch:async()=>({ok:true,json:async()=>({version:12,releaseVersion:'1.2.2',spawn,spawnYaw:0,npcSpawns:world.manifest.npcSpawns,npcRegions:world.manifest.npcSpawns.map((home,npcId)=>({npcId,id:'region-'+npcId,label:'region',home,spawnPoints:[home],patrolPoints:[home],respawnPoints:pools.get(npcId)??[[home[0]+25,home[1],home[2]+10]]})),repairs:[],barriers:[],bounds:{min:[-200,-5,-200],max:[200,5,200]},excluded:[],outdoorWaypoints:[]})}),
    performance:{now:()=>now,memory:{usedJSHeapSize:1024}},Date:class extends Date{static now(){return dateNow;}},ResizeObserver:class{observe(){}disconnect(){}},
    requestAnimationFrame:(callback:FrameRequestCallback)=>{scheduled=callback;return 1;},cancelAnimationFrame:()=>{scheduled=null;},
    localStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)},
  };
  const descriptors=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value]of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,value});
  const {createGame}=await import('../src/engine.ts?fixture='+crypto.randomUUID());
  const api=await createGame({clientWidth:800,clientHeight:600,appendChild(){}} as unknown as HTMLElement,s=>snapshots.push(s));
  const step=(frames=1)=>{for(let i=0;i<frames;i++){const callback=scheduled;if(!callback)break;scheduled=null;now+=1000/60+.000001;callback(now);}};
  const latest=()=>snapshots.at(-1)!;
  const sf=roundFixture as typeof roundFixture&typeof storyFixture;
 try{await run(api,{roundSeed:seed=>{dateNow=seed;},inputState:()=>({enabled:inputEnabled,suspended:inputSuspended,resets:inputResets,heldMove:[...heldMove] as [number,number],fastWalk:touchFastWalk}),step,moveTo:(x,z)=>teleport.set(x,0,z),moveToHeight:(x,y,z)=>teleport.set(x,y,z),support:value=>{supported=value;},restored,placeNPC:(index,x,y,z)=>{world.manifest.npcSpawns[index]=[x,y,z];initialActorPositions.set(index,new Vector3(x,y,z));},diagnostics:()=>((win as unknown as {__gameDiagnostics:{npcs:DiagnosticNPC[]}}).__gameDiagnostics),snapshot:latest,ends,snapshots,pauseAction:()=>{frame.actions.add('pause');},wallAt:z=>{wallZ=z;},stream:(b,f=false)=>{blocked=b;failed=f;},waitForLock:()=>{let release!:()=>void;lockReady=new Promise<void>(resolve=>{release=resolve;});return release;},denyLock:()=>{lockReady=Promise.reject(new Error('denied'));},background:()=>{doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));},loseGraphics:()=>{canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));},impact:id=>impacts.push({id,speed:10}),physicalSteps:()=>physicalSteps,vehicleDisposals:()=>vehicleDisposals,visualCreates:()=>roundFixture.visualCreates,visualDisposals:()=>roundFixture.visualDisposals,deferVisual:()=>{let release!:()=>void;roundFixture.visualGate=new Promise<void>(resolve=>{release=resolve;});return release;},respawnPoints:(id,points)=>{const existing=pools.get(id);if(existing)existing.splice(0,existing.length,...points);else pools.set(id,points);const region=activeDriveMap?.npcRegions.find((r:any)=>r.npcId===id);if(region)region.respawnPoints=points;},allowReentry:allowed=>{allowReentry=allowed;},reentries,npcVisible:id=>roundFixture.characterRoots.get(id)?.visible??false,shotTarget:id=>{roundFixture.shotTarget=id;},performance:()=>JSON.parse(canvas.dataset.performance),route:(enabled,safe=true)=>{routeEnabled=enabled;routeSafe=safe;},billboardLoads:roundFixture.billboardLoads,createdIds:roundFixture.createdIds,npcCues:roundFixture.npcCues,characterStates:roundFixture.characterStates,failBillboardsOnce:()=>{roundFixture.billboardFailures++;},deferBillboards:()=>{let release!:()=>void;roundFixture.billboardGate=new Promise<void>(resolve=>{release=resolve;});return release;},billboardReleases:()=>roundFixture.billboardReleases,rosterSelections:()=>roundFixture.rosterSelections,storyCreates:()=>sf.storyCreates,storyDisposals:()=>sf.storyDisposals,deferStoryWorld:()=>{let release!:()=>void;sf.storyGate=new Promise<void>(resolve=>{release=resolve;});return release;},storyUpdates:sf.storyUpdates,storyAudioUpdates:sf.storyAudioUpdates,storyAudioPauses:()=>sf.storyAudioPauses,storySaves:sf.storySaves,audioEvents:sf.audioEvents,runMusicRequests:sf.runMusicRequests});}
  finally{api.dispose();for(const [key,descriptor]of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
}

async function completeEscapeTasks(api:GameAPI,f:Parameters<Parameters<typeof fixture>[0]>[1]){
  await api.start('escape');f.step();
  const tasks=f.snapshot().escape!.tasks;assert.equal(tasks.length,3);assert.equal(new Set(tasks.map(t=>t.kind)).size,3);
  for(const task of tasks){api.selectEscapeTask?.(task.id);for(const point of task.positions){f.moveToHeight(...point);f.step(7);api.action('interact');f.step(7);}if(task.kind==='hold')f.step(Math.ceil(ESCAPE_DIFFICULTIES.standard.hold*60)+7);assert.equal(f.snapshot().escape!.tasks.find(t=>t.id===task.id)!.state,'complete',task.id);}
  assert.equal(f.snapshot().clues,3);assert.equal(f.snapshot().escape!.reinforcement,true);
  f.moveToHeight(...VALIDATED_ESCAPE_EXTRACTION.position);f.step(7);api.action('interact');f.step(7);assert.equal(f.snapshot().escape!.phase,'extraction');
}

test('escape requires three distinct action tasks and twenty continuous extraction seconds',async()=>fixture(async(api,f)=>{
  await completeEscapeTasks(api,f);f.step(10*60);assert.equal(f.snapshot().phase,'playing');assert.ok(f.snapshot().extraction>=10);
  f.moveTo(10,-15);f.step(7);assert.equal(f.snapshot().extraction,0,'leaving the gate resets continuous extraction');
  f.moveToHeight(...VALIDATED_ESCAPE_EXTRACTION.position);f.step(19*60);assert.equal(f.snapshot().phase,'playing');f.step(61);assert.equal(f.snapshot().phase,'won');assert.equal(f.snapshot().escape!.result!.stats.completed,3);assert.deepEqual(f.ends,[true]);assert.ok(f.snapshot().escape!.best!>0);
  f.step(600);assert.deepEqual(f.ends,[true],'terminal result is emitted once');
}));

test('the selected difficulty deadline loses once and restarting resets tasks and ammunition',async()=>fixture(async(api,f)=>{
  await api.start('escape');f.step(ESCAPE_DIFFICULTIES.standard.round*60+7);assert.equal(f.snapshot().phase,'lost');assert.deepEqual(f.ends,[false]);assert.match(f.snapshot().resultReason,/行动时间/);
  f.step(600);assert.deepEqual(f.ends,[false]);await api.start('escape');assert.equal(f.snapshot().phase,'playing');assert.equal(f.snapshot().elapsed,0);assert.equal(f.snapshot().remaining,ESCAPE_DIFFICULTIES.standard.round);assert.equal(f.snapshot().clues,0);assert.equal(f.snapshot().ammo,WEAPONS.m4a1.capacity);assert.equal(f.snapshot().resultReason,'');assert.ok(f.snapshot().escape!.tasks.every(t=>t.state==='pending'));
}));

test('a pause input freezes the round before consuming simulation time',async()=>fixture(async(api,f)=>{
  await completeEscapeTasks(api,f);f.step(120);api.pause();const before=f.snapshot();await api.resume();f.pauseAction();f.step();
  assert.equal(f.snapshot().phase,'paused');assert.equal(f.snapshot().elapsed,before.elapsed);assert.equal(f.snapshot().extraction,before.extraction);
}));

test('restart publishes the first current task direction and distance immediately',async()=>fixture(async(api,f)=>{
  await completeEscapeTasks(api,f);f.step(20*60);const best=f.snapshot().escape!.best;await api.start('escape');
  const state=f.snapshot(),task=state.escape!.tasks.find(t=>t.selected)!,point=task.positions[0];assert.equal(state.escape!.completed,0);assert.equal(state.goalName,task.task.sites[0].label);assert.equal(state.elapsed,0);assert.equal(state.extraction,0);assert.ok(Math.abs(state.goalDistance-Math.hypot(...point))<.01);assert.ok(Math.abs(state.goalAngle-Math.atan2(point[0],-point[2]))<.01);assert.equal(state.escape!.best,best);
}));

test('changing to free roam clears the completed escape objective and removes the deadline',async()=>fixture(async(api,f)=>{
  await completeEscapeTasks(api,f);f.step(20*60);assert.equal(f.snapshot().phase,'won');
  await api.start('roam');const free=f.snapshot();assert.equal(free.phase,'playing');assert.equal(free.goalName,'自由探索');assert.equal(free.clues,0);assert.equal(free.extraction,0);assert.equal(free.resultReason,'');
  f.step((RULES.round+1)*60);assert.equal(f.snapshot().phase,'playing');assert.deepEqual(f.ends,[true]);
}));

test('a released fire tap consumes one pistol round once in the real engine',async()=>fixture(async(api,f)=>{
  await api.start('escape');api.action('switch');f.step(30);assert.equal(f.snapshot().weapon,'glock');
  api.action('fire',true);api.action('fire',false);f.step(7);assert.equal(f.snapshot().ammo,WEAPONS.glock.capacity-1);f.step(60);assert.equal(f.snapshot().ammo,WEAPONS.glock.capacity-1);
  api.action('fire',true);api.action('fire',false);f.step(7);assert.equal(f.snapshot().ammo,WEAPONS.glock.capacity-2);
}));

test('current task interaction is blocked by a wall and succeeds only after sight clears',async()=>fixture(async(api,f)=>{
  await api.start('escape');const task=f.snapshot().escape!.tasks.find(t=>t.kind==='take')??f.snapshot().escape!.tasks.find(t=>t.kind==='activate')!;api.selectEscapeTask?.(task.id);const point=task.positions[0];f.moveToHeight(point[0],point[1],point[2]+1);f.step(7);
  f.wallAt(point[2]+.5);api.action('interact');f.step(7);let state=f.snapshot().escape!.tasks.find(t=>t.id===task.id)!;assert.equal(state.state,'pending');assert.equal(state.visited.length,0);
  f.wallAt(null);api.action('interact');f.step(7);state=f.snapshot().escape!.tasks.find(t=>t.id===task.id)!;assert.ok(state.state==='complete'||state.visited.length===1,'a reachable interaction makes actual task progress');
}));

test('critical map failures freeze the entire round before the first simulation step and resume without catching up',async()=>fixture(async(api,f)=>{
  f.stream(true,true);await api.start('escape');assert.equal(f.snapshot().buffering,true);assert.equal(f.snapshot().mapError,true);
  api.action('fire',true);api.action('fire',false);f.step(120);assert.equal(f.snapshot().elapsed,0);assert.equal(f.snapshot().ammo,WEAPONS.m4a1.capacity);assert.equal(f.snapshot().grace,RULES.grace);
  f.stream(false);f.step(7);assert.equal(f.snapshot().buffering,false);assert.ok(f.snapshot().elapsed>0&&f.snapshot().elapsed<.2);assert.equal(f.snapshot().ammo,WEAPONS.m4a1.capacity);
  const before=f.snapshot().elapsed;f.stream(true);f.step(120);assert.equal(f.snapshot().elapsed,before,'an active round also stops before consuming the frame');
}));

test('pending or denied pointer lock never starts simulation, including a restart of an active round',async()=>fixture(async(api,f)=>{
  await api.start('escape');f.step(60);const release=f.waitForLock(),pending=api.start('escape'),loadingElapsed=f.snapshot().elapsed;f.step(120);
  assert.equal(f.snapshot().phase,'loading','selected character assets prepare before pointer-lock handoff');assert.equal(f.snapshot().elapsed,loadingElapsed,'the old round is frozen while preparing its replacement');
  for(let i=0;i<80&&f.snapshot().elapsed!==0;i++)await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(f.snapshot().phase,'loading');assert.equal(f.snapshot().elapsed,loadingElapsed);release();await pending;assert.equal(f.snapshot().phase,'playing');assert.equal(f.snapshot().elapsed,0);
  f.denyLock();await assert.rejects(api.start('escape'),/本局暂时无法开始/);f.step(120);assert.equal(f.snapshot().elapsed,0);assert.equal(f.snapshot().phase,'menu');
}));

test('backgrounding pauses play and context loss moves to recoverable error without simulation',async()=>fixture(async(api,f)=>{
  await api.start('escape');f.step(7);f.background();const before=f.snapshot().elapsed;f.step(600);assert.equal(f.snapshot().phase,'paused');assert.equal(f.snapshot().elapsed,before);
  f.loseGraphics();assert.equal(f.snapshot().phase,'error');assert.match(f.snapshot().message,/重新载入/);f.step(600);assert.equal(f.snapshot().elapsed,before);
}));

test('the chosen main firearm is immediately equipped and survives restart; roam has no main firearm',async()=>fixture(async(api,f)=>{
  await api.start('escape',{primary:'ak47'});assert.equal(f.snapshot().weapon,'ak47');assert.equal(f.snapshot().hasPrimary,true);assert.equal(f.snapshot().ammo,WEAPONS.ak47.capacity);
  api.action('switch');f.step(30);assert.equal(f.snapshot().weapon,'glock');api.action('switch');f.step(30);assert.equal(f.snapshot().weapon,'ak47');
  await api.start('escape');assert.equal(f.snapshot().weapon,'ak47');assert.equal(f.snapshot().ammo,WEAPONS.ak47.capacity);await api.start('roam');assert.equal(f.snapshot().hasPrimary,false);
}));

test('only supported landings become rescue positions, and courtyard elevations do not cause a false rescue',async()=>fixture(async(api,f)=>{
  await api.start('roam');f.moveToHeight(4,-4,7);f.step(7);assert.equal(f.restored.length,1,'an open lower courtyard remains playable');
  f.support(false);f.moveToHeight(8,-4.5,9);f.step(7);assert.equal(f.restored.length,1);
  f.moveToHeight(8,-5.1,9);f.step(7);assert.deepEqual(f.restored.at(-1),[4,-4,7],'unsupported space must not overwrite the landing history');
  f.moveToHeight(NaN,0,9);f.step(7);assert.deepEqual(f.restored.at(-1),[4,-4,7],'invalid horizontal coordinates also restore a finite location');
  await api.start('roam');f.moveToHeight(0,-6,0);f.step(7);assert.deepEqual(f.restored.at(-1),[0,0,0],'a new round resets the previous safe courtyard position');
}));

test('the production NPC announces a raised-gun preparation before damage, and a wall cancels it',async()=>fixture(async(api,f)=>{
  f.placeNPC(0,0,0,-5);await api.start('escape');f.step(RULES.grace*60);
  for(let i=0;i<180&&f.diagnostics().npcs[0].attackPhase!=='aim';i++)f.step();
  assert.equal(f.diagnostics().npcs[0].attackPhase,'aim');assert.equal(f.snapshot().health,100);
  f.step(38);assert.equal(f.diagnostics().npcs[0].shotSerial,0);assert.equal(f.snapshot().health,100,'no damage during the first 0.63 seconds of visible preparation');
  f.wallAt(-2);f.step(10);assert.equal(f.diagnostics().npcs[0].shotSerial,0);assert.equal(f.snapshot().health,100);assert.equal(f.diagnostics().npcs[0].attackPhase,'search');
  f.wallAt(null);for(let i=0;i<180&&f.diagnostics().npcs[0].attackPhase!=='aim';i++)f.step();
  assert.equal(f.diagnostics().npcs[0].attackPhase,'aim');f.step(38);assert.equal(f.diagnostics().npcs[0].shotSerial,0);
  for(let i=0;i<40&&f.diagnostics().npcs[0].shotSerial===0;i++)f.step();assert.ok(f.diagnostics().npcs[0].shotSerial>0);for(let i=0;i<180&&f.snapshot().health===100;i++)f.step();assert.ok(f.snapshot().health<100);assert.ok(f.snapshot().incoming.length>0);
  await api.start('escape');assert.equal(f.snapshot().health,100);assert.deepEqual(f.snapshot().incoming,[]);assert.equal(f.snapshot().hitType,null);
}));

test('driving freezes during countdown/pause/stream failure, completes five minutes and steps physics only once per tick',async()=>fixture(async(api,f)=>{
 await api.start('dafei');assert.equal(f.snapshot().driving?.countdown,3);assert.equal(f.snapshot().remaining,300);f.step(120);assert.equal(f.snapshot().elapsed,0);assert.equal(f.physicalSteps(),120);
 api.pause();const count=f.snapshot().driving!.countdown,steps=f.physicalSteps();f.step(100);assert.equal(f.snapshot().driving!.countdown,count);assert.equal(f.physicalSteps(),steps);await api.resume();
 f.stream(true,true);f.step(600);assert.equal(f.snapshot().elapsed,0);assert.equal(f.physicalSteps(),steps);f.stream(false);f.step(61);assert.ok(f.snapshot().elapsed<.1);assert.equal(f.physicalSteps(),steps+61);
 f.step(300*60);assert.equal(f.snapshot().phase,'won');assert.equal(f.snapshot().elapsed,300);assert.deepEqual(f.ends,[true]);
}));

test('physical impacts score once and cannot shoot before offscreen recovery; switching mode disposes driving',async()=>fixture(async(api,f)=>{
  f.placeNPC(0,0,0,-5);f.respawnPoints(0,[[0,0,30]]);await api.start('dafei');f.step(181);f.impact(0);f.step(7);assert.equal(f.snapshot().driving!.score,100);assert.equal(f.snapshot().driving!.hits,1);
  f.impact(0);f.step(7);assert.equal(f.snapshot().driving!.hits,1);f.step(9*60);assert.equal(f.snapshot().driving!.durability,DRIVE_RULES.durability);assert.equal(f.diagnostics().npcs[0].shotSerial,0);
  for(let i=0;i<180&&f.reentries.length===0;i++)f.step();assert.equal(f.reentries[0]?.success,true);f.moveTo(0,26);for(let i=0;i<300&&f.diagnostics().npcs[0].shotSerial===0;i++)f.step();assert.ok(f.diagnostics().npcs[0].shotSerial>0);f.step(7);assert.ok(f.snapshot().driving!.durability<DRIVE_RULES.durability);
  f.impact(1);f.step(7);assert.equal(f.snapshot().driving!.hits,2);api.menu();assert.equal(f.vehicleDisposals(),1);await api.start('roam');assert.equal(f.snapshot().driving,undefined);assert.equal(f.snapshot().mode,'roam');assert.equal(f.snapshot().health,100);
}));

test('driving record is independent from escape record and restart resets the whole challenge',async()=>fixture(async(api,f)=>{
 await completeEscapeTasks(api,f);f.step(20*60);const best=f.snapshot().best;await api.start('dafei');f.step(181);f.impact(0);f.step(7);f.step(300*60);assert.equal(f.snapshot().driving!.bestScore,100);assert.equal(f.snapshot().best,best);
 await api.start('dafei');assert.equal(f.snapshot().driving!.score,0);assert.equal(f.snapshot().driving!.hits,0);assert.equal(f.snapshot().driving!.durability,DRIVE_RULES.durability);assert.equal(f.snapshot().driving!.countdown,3);assert.equal(f.snapshot().driving!.bestScore,100);assert.equal(f.snapshot().best,best);
}));

test('shooting can exhaust car durability and finish only once without overwriting escape best',async()=>fixture(async(api,f)=>{
 for(let id=0;id<4;id++)f.placeNPC(id,(id-1.5)*1.1,0,-5);await api.start('dafei');f.step(120*60);assert.equal(f.snapshot().phase,'lost');assert.equal(f.snapshot().driving!.durability,0);assert.equal(f.snapshot().best,null);assert.deepEqual(f.ends,[false]);f.step(300);assert.deepEqual(f.ends,[false]);
}));


test("intro loads a static car but no NPCs, physics, timer or challenge and starting reuses it",async()=>fixture(async(api,f)=>{
 await api.prepareDafeiIntro();assert.equal(f.snapshot().phase,"intro");assert.equal(f.snapshot().elapsed,0);assert.equal(f.snapshot().driving,undefined);assert.equal(f.diagnostics().npcs.length,0);assert.equal(f.physicalSteps(),0);assert.equal(f.visualCreates(),1);f.step(300);assert.equal(f.physicalSteps(),0);assert.equal(f.snapshot().elapsed,0);
 await api.start("dafei");assert.equal(f.visualCreates(),1);assert.equal(f.snapshot().phase,"playing");assert.equal(f.snapshot().driving!.countdown,3);f.step(60);assert.equal(f.physicalSteps(),60);api.menu();assert.equal(f.visualDisposals(),1);assert.equal(f.vehicleDisposals(),1);
}));

test("cancelled intro never overwrites the menu and releases a late automotive resource",async()=>fixture(async(api,f)=>{
 const release=f.deferVisual();const pending=api.prepareDafeiIntro().catch(error=>{assert.match(error.message,/中止|Cancel|Abort/i);});for(let n=0;n<20&&f.visualCreates()===0;n++)await Promise.resolve();assert.equal(f.visualCreates(),1);api.menu();release();await pending;for(let n=0;n<5;n++)await Promise.resolve();assert.equal(f.snapshot().phase,"menu");assert.equal(f.snapshot().driving,undefined);assert.equal(f.visualDisposals(),1);assert.equal(f.physicalSteps(),0);
}));

test('ten seconds of landed stun precede a hidden wait; visible and car-adjacent respawn points are rejected',async()=>fixture(async(api,f)=>{
 f.placeNPC(0,0,0,-5);f.respawnPoints(0,[[0,0,-30],[0,0,10]]);await api.start('dafei');f.step(181);f.impact(0);f.step();
 f.step(599);assert.equal(f.diagnostics().npcs[0].flight,'stunned');assert.equal(f.reentries.length,0,'stun has not yet reached ten seconds');
 f.step(2);assert.equal(f.diagnostics().npcs[0].flight,'respawning');assert.equal(f.npcVisible(0),false);assert.equal(f.reentries.length,0,'real camera frustum rejects the forward point; distance rejects the point beside the car');
 f.step(180);assert.equal(f.reentries.length,0);assert.equal(f.diagnostics().npcs[0].shotSerial,0);assert.equal(f.snapshot().driving!.durability,DRIVE_RULES.durability);
 f.respawnPoints(0,[[0,0,-30],[0,0,10],[0,0,30]]);for(let i=0;i<35&&f.reentries.length===0;i++)f.step();
 assert.deepEqual(f.reentries,[{id:0,position:[0,0,30],success:true}]);assert.equal(f.diagnostics().npcs[0].flight,undefined);assert.equal(f.npcVisible(0),true);assert.deepEqual(f.diagnostics().npcs[0].position,[0,0,30]);assert.equal(f.snapshot().driving!.hits,1);
}));

test('blocked standing clearance retries only every half second and menu/restart clear waiting reentries',async()=>fixture(async(api,f)=>{
 f.placeNPC(0,0,0,-5);f.respawnPoints(0,[[0,0,30]]);f.allowReentry(false);await api.start('dafei');f.step(181);f.impact(0);f.step();f.step(602);
 assert.equal(f.reentries.length,1);assert.equal(f.reentries[0].success,false);assert.equal(f.diagnostics().npcs[0].flight,'respawning');
 f.step(25);assert.equal(f.reentries.length,1,'clearance checks are throttled during hidden waiting');f.step(8);assert.equal(f.reentries.length,2);
 api.pause();const tries=f.reentries.length;f.step(120);assert.equal(f.reentries.length,tries);await api.resume();f.step(35);assert.ok(f.reentries.length>tries);
 api.menu();const cancelled=f.reentries.length;assert.equal(f.diagnostics().npcs.length,0);f.step(120);assert.equal(f.reentries.length,cancelled);
 f.allowReentry(true);await api.start('dafei');f.step(181);assert.equal(f.diagnostics().npcs[0].flight,undefined);assert.equal(f.reentries.length,cancelled,'old respawn retry cannot act on a fresh round');assert.equal(f.snapshot().driving!.hits,0);assert.equal(f.snapshot().driving!.durability,DRIVE_RULES.durability);
}));

test('successful driving reentry refills the original firearm and clears attack state before reacquiring',async()=>fixture(async(api,f)=>{
 f.placeNPC(0,0,0,-5);f.respawnPoints(0,[[0,0,30]]);await api.start('dafei');f.step(181);
 for(let i=0;i<15*60&&f.diagnostics().npcs[0].ammo===WEAPONS.mp5.capacity;i++)f.step();
 assert.equal(f.diagnostics().npcs[0].weapon,'mp5');assert.ok(f.diagnostics().npcs[0].ammo<WEAPONS.mp5.capacity);const shots=f.diagnostics().npcs[0].shotSerial;f.impact(0);f.step();
 for(let i=0;i<640&&f.reentries.length===0;i++)f.step();
 const recovered=f.diagnostics().npcs[0];assert.equal(f.reentries[0]?.success,true);assert.equal(recovered.ammo,WEAPONS.mp5.capacity);assert.equal(recovered.shotSerial,shots,'stun/wait/reentry do not produce a phantom shot');assert.equal(recovered.disabled,0);assert.equal(recovered.attackPhase,'search');assert.equal(recovered.driveState,'patrol');assert.equal(recovered.flight,undefined);
}));

test('escape headshot downs a shooter, waits the difficulty delay and refills on distant safe reentry',async()=>fixture(async(api,f)=>{
  f.placeNPC(0,0,0,-5);await api.start('escape');f.step(ESCAPE_RULES.grace*60);for(let i=0;i<180&&f.diagnostics().npcs[0].shotSerial===0;i++)f.step();assert.ok(f.diagnostics().npcs[0].ammo<WEAPONS.mp5.capacity);
  f.shotTarget(0);api.action('fire',true);api.action('fire',false);f.step(7);assert.equal((f.diagnostics().npcs[0] as any).active,false);assert.equal(f.snapshot().hitType,'head');const shots=f.diagnostics().npcs[0].shotSerial,downAt=f.snapshot().elapsed;
  f.shotTarget(null);f.wallAt(-2);f.step(19*60);assert.equal((f.diagnostics().npcs[0] as any).active,false);assert.equal(f.diagnostics().npcs[0].shotSerial,shots);assert.equal(f.reentries.length,0,'escape never calls vehicle reentry');
  for(let i=0;i<120&&!(f.diagnostics().npcs[0] as any).active;i++)f.step();const npc=f.diagnostics().npcs[0];assert.equal((npc as any).active,true);assert.ok(f.snapshot().elapsed-downAt>=19.8);assert.ok(new Vector3(...npc.position).length()>=35);assert.equal(npc.ammo,WEAPONS.mp5.capacity);assert.equal(f.reentries.length,0);
}));

test('production performance diagnostics expose finite render p95 and optional memory measurements',async()=>fixture(async(api,f)=>{
 await api.start('roam');f.step(70);const p=f.performance();assert.equal(p.jsHeapBytes,1024);for(const key of ['renderMs','renderP95Ms','geometries','textures','drawCalls','triangles'])assert.ok(Number.isFinite(p[key]),key);
}));

const specialRoster:NpcIdentityId[]=['xutao','meng','xu','chengguotao'];
test('six escape identities and four driving identities keep weapon/slot pairs; roam loads none',async()=>fixture(async(api,f)=>{
  const six=[...specialRoster,'jiang','luan'];assert.deepEqual(f.billboardLoads,[]);await api.start('escape');assert.deepEqual(f.billboardLoads,[six]);assert.deepEqual(f.createdIds,six);f.step(7);
  assert.deepEqual(f.diagnostics().npcs.map(n=>n.identity),six);assert.deepEqual(f.diagnostics().npcs.map(n=>n.weapon),['mp5','m4a1','ak47','glock','mp5','r870']);assert.deepEqual(f.diagnostics().npcs.map(n=>n.slot),[0,1,2,3,4,5]);assert.equal(f.diagnostics().npcs.filter((n:any)=>n.active).length,4);
  await api.start('dafei');f.step(7);assert.deepEqual(f.diagnostics().npcs.map(n=>n.identity),specialRoster);assert.deepEqual(f.billboardLoads,[six,specialRoster]);
  await api.start('roam');f.step(7);assert.deepEqual(f.billboardLoads,[six,specialRoster]);assert.equal(f.diagnostics().npcs.length,0);
},{roster:specialRoster}));

test('Xu Tao winds up without shooting, advances at sprint speed and loses the skill on broken sight',async()=>fixture(async(api,f)=>{
 f.placeNPC(0,0,0,-16);f.route(true);await api.start('escape');f.step(10*60);
 assert.equal(f.diagnostics().npcs[0].skillPhase,'ready','skills remain inactive during opening grace');
 for(let i=0;i<180&&f.diagnostics().npcs[0].skillPhase!=='windup';i++)f.step();
 let npc=f.diagnostics().npcs[0];assert.equal(npc.skillPhase,'windup');const atStart=npc.position,shots=npc.shotSerial;
 f.step(24);npc=f.diagnostics().npcs[0];assert.equal(npc.skillPhase,'windup');assert.deepEqual(npc.position,atStart);assert.equal(npc.shotSerial,shots);assert.equal(f.characterStates.get(0)?.skill,'sprint');
 for(let i=0;i<30&&f.diagnostics().npcs[0].skillPhase!=='active';i++)f.step();assert.equal(f.diagnostics().npcs[0].skillPhase,'active');const activeStart=f.diagnostics().npcs[0].position;
 f.step(7);npc=f.diagnostics().npcs[0];assert.ok(new Vector3(...npc.position).distanceTo(new Vector3(...activeStart))>.5,'continuous path motion visibly moves the actor');assert.equal(npc.shotSerial,shots);
 f.wallAt(-2);f.step(7);npc=f.diagnostics().npcs[0];assert.equal(npc.skillPhase,'cooldown');assert.ok(npc.skillLeft!>9.8);assert.equal(npc.shotSerial,shots);assert.equal(f.characterStates.get(0)?.skill,undefined);
 assert.ok(f.npcCues.includes('sprint'));
},{roster:specialRoster}));

test('a sprint windup can be headshot-downed and distant escape reentry resets the full skill cooldown',async()=>fixture(async(api,f)=>{
  f.placeNPC(0,0,0,-16);f.route(true);await api.start('escape');f.step(10*60);for(let i=0;i<180&&f.diagnostics().npcs[0].skillPhase!=='windup';i++)f.step();assert.equal(f.diagnostics().npcs[0].skillPhase,'windup');
  f.shotTarget(0);api.action('fire',true);api.action('fire',false);f.step(7);assert.equal((f.diagnostics().npcs[0] as any).active,false);assert.equal(f.diagnostics().npcs[0].skillPhase,'cooldown');assert.equal(f.snapshot().hitType,'head');
  f.shotTarget(null);f.wallAt(-2);for(let i=0;i<1300&&!(f.diagnostics().npcs[0] as any).active;i++)f.step();const npc=f.diagnostics().npcs[0];assert.equal((npc as any).active,true);assert.equal(npc.disabled,0);assert.equal(npc.skillPhase,'cooldown');assert.ok(npc.skillLeft!>=9.99&&npc.skillLeft!<=10,'the first reentry frame grants full cooldown');assert.equal(npc.ammo,WEAPONS.mp5.capacity);
},{roster:specialRoster}));

test('principal callout reaches one unseen ally, retains a fixed target and is not direct firing authorization',async()=>fixture(async(api,f)=>{
 f.placeNPC(0,1000,0,0);f.placeNPC(1,0,0,20);f.placeNPC(2,1000,0,0);f.placeNPC(3,0,0,-16);f.wallAt(10);await api.start('escape');f.step(11*60);f.route(true);
 for(let i=0;i<180&&f.diagnostics().npcs[3].skillPhase!=='windup';i++)f.step();assert.equal(f.diagnostics().npcs[3].skillPhase,'windup',JSON.stringify(f.diagnostics().npcs));const shots=f.diagnostics().npcs[3].shotSerial;
 f.step(60);assert.equal(f.diagnostics().npcs[3].skillPhase,'windup');assert.equal(f.diagnostics().npcs[3].shotSerial,shots);
 for(let i=0;i<30&&!f.diagnostics().npcs.some(n=>n.teamTarget);i++)f.step();const commanded=f.diagnostics().npcs.filter(n=>n.teamTarget);assert.equal(commanded.length,1);assert.equal(commanded[0].slot,1);assert.deepEqual(commanded[0].teamTarget,[0,0,0]);assert.equal(commanded[0].shotSerial,0);
 assert.equal(f.diagnostics().npcs[3].skillPhase,'cooldown');assert.ok(f.npcCues.includes('callout'));
 f.wallAt(2);f.moveTo(4,0);f.step(7);assert.deepEqual(f.diagnostics().npcs[1].teamTarget,[0,0,0],'the order does not track unseen player movement');assert.equal(f.diagnostics().npcs[1].shotSerial,0);
},{roster:specialRoster}));

test('principal windup is cancelled by occlusion without dispatching a team order',async()=>fixture(async(api,f)=>{
 f.placeNPC(0,1000,0,0);f.placeNPC(1,0,0,20);f.placeNPC(2,1000,0,0);f.placeNPC(3,0,0,-16);f.wallAt(10);await api.start('escape');f.step(11*60);f.route(true);
 for(let i=0;i<180&&f.diagnostics().npcs[3].skillPhase!=='windup';i++)f.step();assert.equal(f.diagnostics().npcs[3].skillPhase,'windup',JSON.stringify(f.diagnostics().npcs));
 const shots=f.diagnostics().npcs[3].shotSerial;
 f.wallAt(-2);f.step(90);assert.equal(f.diagnostics().npcs[3].skillPhase,'cooldown');assert.equal(f.diagnostics().npcs.filter(n=>n.teamTarget).length,0);assert.equal(f.diagnostics().npcs[3].shotSerial,shots,'occlusion and interrupted skill cannot produce additional shots');
},{roster:specialRoster}));

test('driving sprint uses the same windup and actual actor motion, then physical impact cancels it without changing identity',async()=>fixture(async(api,f)=>{
 f.placeNPC(0,0,0,-16);f.respawnPoints(0,[[0,0,30]]);await api.start('dafei');f.step(13*60);
 for(let i=0;i<180&&f.diagnostics().npcs[0].skillPhase!=='windup';i++)f.step();assert.equal(f.diagnostics().npcs[0].skillPhase,'windup');const starting=f.diagnostics().npcs[0].position;
 f.step(24);assert.equal(f.diagnostics().npcs[0].skillPhase,'windup');assert.deepEqual(f.diagnostics().npcs[0].position,starting);assert.equal(f.diagnostics().npcs[0].shotSerial,0);
 for(let i=0;i<30&&f.diagnostics().npcs[0].skillPhase!=='active';i++)f.step();const activeStart=f.diagnostics().npcs[0].position;f.step(7);assert.ok(new Vector3(...f.diagnostics().npcs[0].position).distanceTo(new Vector3(...activeStart))>.5);
 f.impact(0);f.step(7);assert.equal(f.diagnostics().npcs[0].skillPhase,'cooldown');assert.equal(f.diagnostics().npcs[0].flight,'stunned');assert.equal(f.snapshot().driving!.hits,1);assert.equal(f.diagnostics().npcs[0].shotSerial,0);
 for(let i=0;i<640&&f.reentries.length===0;i++)f.step();const npc=f.diagnostics().npcs[0];assert.equal(f.reentries.at(-1)?.success,true);assert.equal(npc.identity,'xutao');assert.equal(npc.weapon,'mp5');assert.equal(npc.ammo,WEAPONS.mp5.capacity);assert.equal(npc.skillPhase,'cooldown');assert.ok(npc.skillLeft!>=9.99);assert.equal(npc.flight,undefined);
},{roster:specialRoster}));

test('driving principal commands only an unseen eligible patrol and cannot grant a firing seat',async()=>fixture(async(api,f)=>{
 f.placeNPC(0,1000,0,0);f.placeNPC(1,0,0,20);f.placeNPC(2,1000,0,0);f.placeNPC(3,0,0,-16);await api.start('dafei');f.step(13*60);
 for(let i=0;i<180&&f.diagnostics().npcs[3].skillPhase!=='windup';i++)f.step();assert.equal(f.diagnostics().npcs[3].skillPhase,'windup');f.step(60);assert.equal(f.diagnostics().npcs[3].skillPhase,'windup');assert.equal(f.diagnostics().npcs[3].shotSerial,0);
 for(let i=0;i<30&&!f.diagnostics().npcs.some(n=>n.teamTarget);i++)f.step();const commanded=f.diagnostics().npcs.filter(n=>n.teamTarget);assert.equal(commanded.length,1);assert.equal(commanded[0].slot,1);assert.equal(commanded[0].driveState,'investigate');assert.equal(commanded[0].shotSerial,0);assert.deepEqual(commanded[0].teamTarget,[0,0,0]);
 assert.equal(f.diagnostics().npcs[3].skillPhase,'cooldown');f.wallAt(2);f.step(7);assert.equal(f.diagnostics().npcs[1].shotSerial,0);assert.equal(f.snapshot().driving!.durability,DRIVE_RULES.durability);
},{roster:specialRoster}));

test('character preparation failure retries the same complete escape roster and releases the previous lease on restart',async()=>fixture(async(api,f)=>{
  const six=[...specialRoster,'jiang','luan'];f.failBillboardsOnce();await assert.rejects(api.start('escape'),/本局暂时无法开始/);assert.equal(f.snapshot().phase,'menu');assert.equal(f.createdIds.length,0);assert.deepEqual(f.billboardLoads,[six]);
  await api.start('escape');assert.deepEqual(f.billboardLoads,[six,six]);assert.deepEqual(f.createdIds,six);const first=f.snapshot().escape!.tasks.map(t=>t.id);
  await api.start('escape');assert.deepEqual(f.billboardLoads,[six,six,six]);assert.deepEqual(f.snapshot().escape!.tasks.map(t=>t.id),first,'fixed seed keeps the fixture reproducible');assert.equal(f.billboardReleases(),1);
},{roster:specialRoster}));

test('cancelled character preparation cannot create late pursuers or overwrite a new free-roam round',async()=>fixture(async(api,f)=>{
 const release=f.deferBillboards(),pending=api.start('escape');assert.equal(f.snapshot().phase,'loading');for(let i=0;i<40&&!f.billboardLoads.length;i++)await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(f.billboardLoads.length,1,'cancel only after the character request has really started');f.step(120);assert.equal(f.createdIds.length,0);assert.equal(f.snapshot().elapsed,0);api.menu();await api.start('roam');assert.equal(f.snapshot().phase,'playing');assert.equal(f.snapshot().mode,'roam');
 release();await pending;for(let i=0;i<20&&f.billboardReleases()===0;i++)await new Promise<void>(resolve=>setImmediate(resolve));f.step(7);assert.equal(f.snapshot().mode,'roam');assert.equal(f.snapshot().phase,'playing');assert.equal(f.createdIds.length,0);assert.equal(f.diagnostics().npcs.length,0);assert.equal(f.billboardReleases(),1,'a late prepared lease is released exactly once');
},{roster:specialRoster}));

test('pausing and map blocking freeze a live sprint windup without consuming its cooldown',async()=>fixture(async(api,f)=>{
 f.placeNPC(0,0,0,-16);f.route(true);await api.start('escape');f.step(10*60);for(let i=0;i<180&&f.diagnostics().npcs[0].skillPhase!=='windup';i++)f.step();assert.equal(f.diagnostics().npcs[0].skillPhase,'windup');const left=f.diagnostics().npcs[0].skillLeft;
 api.pause();f.step(120);assert.equal(f.diagnostics().npcs[0].skillLeft,left);assert.equal(f.diagnostics().npcs[0].skillPhase,'windup');await api.resume();f.stream(true);f.step(120);assert.equal(f.diagnostics().npcs[0].skillLeft,left);f.stream(false);f.step(7);assert.ok(f.diagnostics().npcs[0].skillLeft!<left!);assert.equal(f.diagnostics().npcs[0].shotSerial,0);
},{roster:specialRoster}));

test('story removes old enemies and its real session shares one physical advance per fixed step',async()=>fixture(async(api,f)=>{
 await api.start('escape');f.step(7);assert.equal(f.diagnostics().npcs.length,6);assert.equal(f.diagnostics().npcs.filter((n:any)=>n.active).length,4);const created=f.createdIds.length,loaded=f.billboardLoads.length;
 await api.start('story');assert.equal(f.snapshot().phase,'playing');assert.equal(f.snapshot().mode,'story');assert.equal(f.snapshot().story?.introActive,true);assert.equal(f.createdIds.length,created);assert.equal(f.billboardLoads.length,loaded);assert.equal(f.billboardReleases(),1);assert.equal(f.storyCreates(),1);
 const physical=f.physicalSteps(),updates=f.storyUpdates.length;f.step();assert.equal(f.physicalSteps(),physical+1);assert.equal(f.storyUpdates.length,updates+1);assert.equal(f.storyUpdates.at(-1)?.dt,1/60);assert.equal(api.storyCheckpoint()?.introTime,1/60);assert.equal(f.diagnostics().npcs.length,0);
 f.step(119);assert.equal(f.physicalSteps(),physical+120);assert.equal(f.snapshot().health,100);assert.equal(f.storyAudioUpdates.length,120);assert.ok(f.storySaves.length>0);
 api.menu();assert.equal(f.storyDisposals(),1);assert.equal(api.storyCheckpoint(),null);
}));

test('story start primes once before asynchronous preparation and never unlocks running music',async()=>fixture(async(api,f)=>{
 const release=f.deferStoryWorld(),starting=api.start('story');
 const count=(owner:AudioEvent['owner'],action:string)=>f.audioEvents.filter(e=>e.owner===owner&&e.action===action).length;
 assert.equal(count('story','prime'),1,'the start click primes synchronously');assert.equal(count('story','reset'),1);assert.equal(count('game','reset'),1);
 assert.equal(count('game','unlock'),0);assert.deepEqual(f.runMusicRequests,[]);
 for(let i=0;i<40&&f.storyCreates()===0;i++)await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(f.storyCreates(),1);
 assert.equal(f.snapshot().phase,'loading');assert.equal(count('story','prime'),1,'setupRound must retain the primed music slot');assert.equal(count('story','reset'),1);assert.equal(count('game','reset'),1);
 release();await starting;f.step(7);
 assert.equal(f.snapshot().phase,'playing');assert.equal(count('story','prime'),1,'enter(false) does not repeat gesture priming');assert.deepEqual(f.runMusicRequests,[]);
}));

test('story resume, music retry and fast walking stay within story audio ownership',async()=>fixture(async(api,f)=>{
 await api.start('story');api.storyAction('skip');f.step(7);const firstPrimes=f.audioEvents.filter(e=>e.owner==='story'&&e.action==='prime').length;
 api.pause();await api.resume();f.step(7);assert.equal(f.audioEvents.filter(e=>e.owner==='story'&&e.action==='prime').length,firstPrimes+1);
 api.retryMusic();await Promise.resolve();assert.equal(f.audioEvents.filter(e=>e.owner==='story'&&e.action==='retry').length,1);
 api.action('run');f.step(7);assert.equal(f.audioEvents.filter(e=>e.owner==='game'&&['unlock','retry','run'].includes(e.action)).length,0);assert.deepEqual(f.runMusicRequests,[]);
}));

test('restoring a late chapter preserves the pre-lookup gesture slot and selects the restored chapter',async()=>fixture(async(api,f)=>{
 api.unlockAudio('story');await Promise.resolve();const cp={...new StorySession().checkpoint(),step:'pack-equipment',introTime:90,line:0,revealed:0};
 await api.restoreStory(cp);f.step(7);
 assert.equal(f.snapshot().story?.chapter,6);assert.equal(f.storyAudioUpdates.at(-1)?.chapter,6);
 assert.deepEqual(f.audioEvents.filter(e=>e.owner==='story'&&e.action==='reset').map(e=>e.preserveGesture),[true]);
 assert.equal(f.audioEvents.filter(e=>e.owner==='game'&&e.action==='unlock').length,0);assert.deepEqual(f.runMusicRequests,[]);
}));

test('story overlays advance only the BGM tick and a manual pause still stops it',async()=>fixture(async(api,f)=>{
 await api.start('story');f.step(7);api.storyOverlay('archive',true);const storyTime=api.storyCheckpoint()!.introTime,updates=f.storyAudioUpdates.length,physics=f.physicalSteps();
 f.step(60);assert.equal(api.storyCheckpoint()!.introTime,storyTime);assert.equal(f.physicalSteps(),physics);assert.ok(f.storyAudioUpdates.length>updates);
 assert.ok(f.storyAudioUpdates.slice(updates).every(row=>row.musicOnly&&!row.paused));assert.deepEqual(f.runMusicRequests,[]);
 api.pause();const pausedUpdates=f.storyAudioUpdates.length;f.step(60);assert.equal(f.storyAudioUpdates.length,pausedUpdates);assert.ok(f.storyAudioPauses()>0);
}));

test('story pause, resource blocking and history freeze opening, dialogue and cinematic clocks',async()=>fixture(async(api,f)=>{
 await api.start('story');f.step(7);api.pause();const opening=api.storyCheckpoint()!,physics=f.physicalSteps(),audio=f.storyAudioUpdates.length;
 f.step(120);assert.equal(api.storyCheckpoint()?.introTime,opening.introTime);assert.equal(f.physicalSteps(),physics);assert.equal(f.storyAudioUpdates.length,audio);assert.ok(f.storyAudioPauses()>0);
 await api.resume();f.stream(true,true);f.step(120);assert.equal(api.storyCheckpoint()?.introTime,opening.introTime);assert.equal(f.physicalSteps(),physics);
 f.stream(false);f.step(7);assert.ok(api.storyCheckpoint()!.introTime>opening.introTime);api.storyAction('skip');assert.equal(f.snapshot().story?.step,'borrow-camera');f.step(7);
 api.pause();const revealed=api.storyCheckpoint()!.revealed;f.step(120);assert.equal(api.storyCheckpoint()?.revealed,revealed);await api.resume();f.stream(true);f.step(120);assert.equal(api.storyCheckpoint()?.revealed,revealed);f.stream(false);
 const longshot={...api.storyCheckpoint()!,step:'longshot-end',line:0,revealed:0,cinematicTime:0};await api.restoreStory(longshot);f.step(7);api.pause();const cinematic=api.storyCheckpoint()!.cinematicTime;f.step(120);assert.equal(api.storyCheckpoint()?.cinematicTime,cinematic);
 await api.resume();f.stream(true);f.step(120);assert.equal(api.storyCheckpoint()?.cinematicTime,cinematic);f.stream(false);f.step(7);assert.ok(api.storyCheckpoint()!.cinematicTime!>cinematic!);
 api.storyOverlay('history',true);const historyTime=api.storyCheckpoint()!.cinematicTime,priorPhysical=f.physicalSteps();f.step(60);assert.equal(api.storyCheckpoint()?.cinematicTime,historyTime);assert.equal(f.physicalSteps(),priorPhysical,'history freezes physics together with narrative clocks');api.storyOverlay('history',false);f.step(7);assert.ok(api.storyCheckpoint()!.cinematicTime!>historyTime!);
}));

test('story late visual preparation is disposed after menu cancellation and cannot overwrite roaming',async()=>fixture(async(api,f)=>{
 const release=f.deferStoryWorld(),pending=api.start('story');for(let i=0;i<40&&f.storyCreates()===0;i++)await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(f.storyCreates(),1);
 api.menu();assert.equal(f.snapshot().phase,'menu');release();await pending;assert.equal(f.storyDisposals(),1);assert.equal(api.storyCheckpoint(),null);assert.equal(f.snapshot().phase,'menu');
 const releaseSecond=f.deferStoryWorld(),pendingSecond=api.start('story');for(let i=0;i<40&&f.storyCreates()<2;i++)await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(f.storyCreates(),2);
 await api.start('roam');assert.equal(f.snapshot().mode,'roam');assert.equal(f.snapshot().phase,'playing');releaseSecond();await pendingSecond;f.step(7);
 assert.equal(f.storyDisposals(),2);assert.equal(api.storyCheckpoint(),null);assert.equal(f.snapshot().story,undefined);assert.equal(f.snapshot().mode,'roam');assert.equal(f.snapshot().phase,'playing');assert.equal(f.diagnostics().npcs.length,0);
}));

test('story invalid import leaves the active real session, chapter, dialogue and actors intact',async()=>fixture(async(api,f)=>{
 await api.start('story');api.storyAction('skip');f.step(7);const current=api.storyCheckpoint()!;
 await assert.rejects(api.restoreStory({...current,step:'missing-chapter'}),/章节无效/);assert.deepEqual(api.storyCheckpoint(),current);assert.equal(f.snapshot().phase,'playing');assert.equal(f.snapshot().mode,'story');assert.equal(f.storyCreates(),1);assert.equal(f.storyDisposals(),0);
 await assert.rejects(api.restoreStory({...current,actors:[]}),/角色位置无效/);assert.deepEqual(api.storyCheckpoint(),current);
 const resumed={...new StorySession().checkpoint(),step:'longshot-end',introTime:90,line:0,revealed:0};await api.restoreStory(resumed);assert.equal(f.snapshot().story?.step,'longshot-end');assert.equal(f.snapshot().story?.cinematicTime,0);assert.equal(f.storyCreates(),1,'valid import reuses the prepared world');
}));

test('story restore waits for the album and resumes the real film, not an empty screening',async()=>fixture(async(api,f)=>{
 await api.start('story');api.storyAction('skip');const cp=api.storyCheckpoint()!;cp.step='screening';cp.screeningTime=20;cp.photos=[0,1,2].map(i=>({id:`screen-${i}`,position:[0,0,0] as Vec3}));cp.selected=cp.photos.map(p=>p.id);
 const platform=(globalThis as unknown as {roundFixture:{albumGate?:Promise<void>;albumRows?:{id:string;blob:Blob}[]}}).roundFixture;let release!:()=>void;platform.albumGate=new Promise(resolve=>{release=resolve;});platform.albumRows=cp.photos.map(p=>({id:p.id,blob:new Blob(['photo'],{type:'image/jpeg'})}));
 const restoring=api.restoreStory(cp);for(let i=0;i<40&&f.inputState().enabled;i++)await new Promise<void>(resolve=>setImmediate(resolve));const before=api.storyCheckpoint()!;
 f.step(1200);assert.equal(api.storyCheckpoint()?.step,before.step);assert.equal(api.storyCheckpoint()?.revealed,before.revealed);release();await restoring;
 assert.equal(f.snapshot().story?.step,'screening');assert.equal(f.snapshot().story?.film.length,3);assert.equal(f.snapshot().story?.screeningTime,20);f.step(7);assert.equal(f.snapshot().story?.step,'screening');assert.ok(f.snapshot().story!.screeningTime>20);
}));

test('a cancelled late album read cannot restore story over a newly started mode',async()=>fixture(async(api,f)=>{
 await api.start('story');api.storyAction('skip');const cp=api.storyCheckpoint()!;cp.step='longshot-end';
 const platform=(globalThis as unknown as {roundFixture:{albumGate?:Promise<void>}}).roundFixture;let release!:()=>void;platform.albumGate=new Promise(resolve=>{release=resolve;});
 const restoring=api.restoreStory(cp);for(let i=0;i<40&&f.inputState().enabled;i++)await new Promise<void>(resolve=>setImmediate(resolve));api.menu();await api.start('roam');release();await restoring;
 assert.equal(f.snapshot().mode,'roam');assert.equal(f.snapshot().phase,'playing');assert.equal(f.snapshot().story,undefined);assert.equal(f.inputState().enabled,true);
}));

test('an album read failure leaves the current story intact and releases the restoration gate',async()=>fixture(async(api,f)=>{
 await api.start('story');api.storyAction('skip');const before=api.storyCheckpoint()!;
 const platform=(globalThis as unknown as {roundFixture:{albumFailure?:boolean}}).roundFixture;platform.albumFailure=true;
 await assert.rejects(api.restoreStory({...before,step:'longshot-end'}),/album failed/);assert.deepEqual(api.storyCheckpoint(),before);assert.equal(f.inputState().enabled,true);assert.equal(f.snapshot().phase,'playing');
}));

test('an already-started old save finishes before the new session save and cannot overwrite it',async()=>fixture(async(api,f)=>{
 await api.start('story');await new Promise<void>(resolve=>setImmediate(resolve));api.storyAction('skip');
 const platform=(globalThis as unknown as {roundFixture:{saveGate?:Promise<void>;saveStarted?:StoryCheckpoint[]}}).roundFixture;let release!:()=>void;platform.saveStarted=[];platform.saveGate=new Promise(resolve=>{release=resolve;});api.pause();
 for(let i=0;i<40&&!platform.saveStarted.length;i++)await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(platform.saveStarted[0].step,'borrow-camera');
 api.menu();await api.start('story');assert.equal(api.storyCheckpoint()?.step,'opening');release();await new Promise<void>(resolve=>setImmediate(resolve));
 assert.equal(f.storySaves.at(-1)?.step,'opening');assert.equal(platform.saveStarted.at(-1)?.step,'opening');assert.equal(f.snapshot().notice,'');
}));

test('a failed old write does not show an error in the new session or prevent its save',async()=>fixture(async(api,f)=>{
 await api.start('story');await new Promise<void>(resolve=>setImmediate(resolve));api.storyAction('skip');
 const platform=(globalThis as unknown as {roundFixture:{saveGate?:Promise<void>;saveStarted?:StoryCheckpoint[];saveFailureOnce?:number}}).roundFixture;let release!:()=>void;platform.saveStarted=[];platform.saveFailureOnce=1;platform.saveGate=new Promise(resolve=>{release=resolve;});api.pause();
 for(let i=0;i<40&&!platform.saveStarted.length;i++)await new Promise<void>(resolve=>setImmediate(resolve));api.menu();await api.start('story');release();await new Promise<void>(resolve=>setImmediate(resolve));
 assert.equal(f.storySaves.at(-1)?.step,'opening');assert.equal(f.snapshot().notice,'');assert.equal(f.snapshot().phase,'playing');
}));

test('story skip dispatch ends the twenty-second shot without skipping the current dialogue',async()=>fixture(async(api,f)=>{
 await api.start('story');api.storyAction('skip');assert.equal(f.snapshot().story?.step,'borrow-camera');
 await api.restoreStory({...api.storyCheckpoint()!,step:'longshot-end',line:0,revealed:0,cinematicTime:0});assert.equal(f.snapshot().story?.cinematicActive,true);
 api.storyAction('advance');assert.equal(f.snapshot().story?.dialogue?.fullText,'好了。');assert.equal(f.snapshot().story?.dialogue?.complete,true);for(let i=0;i<20;i++)api.storyAction('advance');assert.equal(api.storyCheckpoint()?.line,0);assert.equal(f.snapshot().story?.step,'longshot-end');
 api.storyAction('skip');assert.equal(f.snapshot().story?.cinematicActive,false);assert.equal(f.snapshot().story?.cinematicTime,20);assert.equal(api.storyCheckpoint()?.line,0);assert.equal(f.snapshot().story?.dialogue?.fullText,'好了。');
 api.storyAction('advance');assert.equal(api.storyCheckpoint()?.line,1);assert.equal(f.snapshot().story?.dialogue?.fullText,'这次是她喊的。最后一张拍好了。');assert.equal(f.snapshot().story?.step,'longshot-end');
}));

test('nearby loading freezes immediately, reveals its panel only after 500ms and never resumes a manual pause',async()=>fixture(async(api,f)=>{
 await api.start('roam');f.step(7);const elapsed=f.snapshot().elapsed;
 f.stream(true);f.step(1);assert.equal(f.snapshot().buffering,true);assert.equal(f.snapshot().bufferingVisible,false);
 f.step(28);assert.equal(f.snapshot().bufferingVisible,false);assert.equal(f.snapshot().elapsed,elapsed);
 f.step(3);assert.equal(f.snapshot().bufferingVisible,true);
 api.pause();f.stream(false);f.step(7);assert.equal(f.snapshot().phase,'paused');assert.equal(f.snapshot().elapsed,elapsed);
 await api.resume();f.step(7);assert.equal(f.snapshot().phase,'playing');assert.equal(f.snapshot().bufferingVisible,false);assert.ok(f.snapshot().elapsed>elapsed);
}));

test('archive and history own independent overlay sources; repeated close notifications leave the other source open',async()=>fixture(async(api,f)=>{
 await api.start('story');api.storyAction('skip');f.step(7);
 api.storyOverlay('history',true);api.storyOverlay('archive',true);const revealed=api.storyCheckpoint()!.revealed;
 api.storyOverlay('history',false);for(let i=0;i<60;i++){api.storyOverlay('history',false);f.step();}
 assert.equal(api.storyCheckpoint()!.revealed,revealed);
 api.storyOverlay('archive',false);f.step(7);assert.ok(api.storyCheckpoint()!.revealed>revealed);
}));

test('reality freezes story and roaming without resetting held movement, and release during the reveal still works',async()=>{
 for(const mode of ['story','roam'] as const)await fixture(async(api,f)=>{
  await api.start(mode);if(mode==='story')api.storyAction('skip');f.step(7);
  api.move(0,1);if(mode==='story')api.action('run');f.step(7);
  const before=f.inputState(),elapsed=f.snapshot().elapsed,physics=f.physicalSteps(),revealed=api.storyCheckpoint()?.revealed;
  assert.deepEqual(before.heldMove,[0,1]);assert.equal(before.enabled,true);if(mode==='story')assert.equal(f.snapshot().fastWalking,true);
  api.storyOverlay('reality',true);const opened=f.inputState();assert.equal(opened.enabled,true);assert.equal(opened.suspended,true);assert.equal(opened.resets,before.resets);assert.deepEqual(opened.heldMove,[0,1]);
  f.step(120);assert.equal(f.snapshot().elapsed,elapsed);assert.equal(f.physicalSteps(),physics);assert.equal(api.storyCheckpoint()?.revealed,revealed);
  api.closeReality();f.step(7);assert.equal(f.inputState().suspended,false);assert.equal(f.inputState().resets,before.resets);assert.deepEqual(f.inputState().heldMove,[0,1]);assert.ok(f.snapshot().elapsed>elapsed);
  api.storyOverlay('reality',true);api.move(0,0);api.closeReality();f.step(7);assert.deepEqual(f.inputState().heldMove,[0,0],'a release during the reveal cannot turn into stuck movement');
 });
});

test('manual pause during reality clears held controls and the closing reveal cannot resume paused gameplay',async()=>fixture(async(api,f)=>{
 await api.start('story');api.storyAction('skip');f.step(7);api.move(0,1);api.action('run');f.step(7);
 api.storyOverlay('reality',true);const resets=f.inputState().resets;api.pause();const elapsed=f.snapshot().elapsed,physics=f.physicalSteps();
 assert.equal(f.snapshot().phase,'paused');assert.equal(f.inputState().enabled,false);assert.ok(f.inputState().resets>resets);assert.deepEqual(f.inputState().heldMove,[0,0]);assert.equal(f.inputState().fastWalk,false);
 api.closeReality();f.step(120);assert.equal(f.snapshot().phase,'paused');assert.equal(f.snapshot().elapsed,elapsed);assert.equal(f.physicalSteps(),physics);assert.equal(f.inputState().enabled,false);assert.equal(f.inputState().suspended,false);
 await api.resume();f.step(7);assert.equal(f.snapshot().phase,'playing');assert.deepEqual(f.inputState().heldMove,[0,0]);assert.equal(f.snapshot().fastWalking,false);
}));

test('reality, archive and history coexist without closing another overlay source or resurrecting cleared input',async()=>fixture(async(api,f)=>{
 await api.start('story');api.storyAction('skip');f.step(7);api.move(0,1);api.storyOverlay('reality',true);api.storyOverlay('history',true);api.storyOverlay('archive',true);
 assert.equal(f.inputState().enabled,false);assert.equal(f.inputState().suspended,false);assert.deepEqual(f.inputState().heldMove,[0,0],'history and archive are hard input blockers');
 const physics=f.physicalSteps(),revealed=api.storyCheckpoint()!.revealed;
 api.storyOverlay('history',false);for(let i=0;i<60;i++){api.storyOverlay('history',false);f.step();}
 assert.equal(f.physicalSteps(),physics);assert.equal(api.storyCheckpoint()?.revealed,revealed);assert.equal(f.inputState().enabled,false);
 api.closeReality();f.step(30);assert.equal(f.inputState().enabled,false,'closing reality leaves the open archive in control');assert.equal(f.physicalSteps(),physics);
 api.storyOverlay('archive',false);f.step(7);assert.equal(f.inputState().enabled,true);assert.equal(f.inputState().suspended,false);assert.deepEqual(f.inputState().heldMove,[0,0]);assert.ok(f.physicalSteps()>physics);
 api.storyOverlay('history',true);api.storyOverlay('reality',true);const secondPhysics=f.physicalSteps();api.storyOverlay('history',false);f.step(30);
 assert.equal(f.inputState().enabled,true);assert.equal(f.inputState().suspended,true,'reality retains a soft suspension after the hard history blocker closes');assert.equal(f.physicalSteps(),secondPhysics);
 api.closeReality();f.step(7);assert.equal(f.inputState().suspended,false);assert.ok(f.physicalSteps()>secondPhysics);
}));


test('v063 preparation builds a quiet story scene and activation reuses it',async()=>fixture(async(api,f)=>{
 const progress:number[]=[];await api.prepareMode!('story',undefined,{onProgress:p=>progress.push(p)});
 assert.equal(api.modePrepared!('story'),true);assert.equal(f.storyCreates(),1);assert.equal(f.createdIds.length,0);assert.equal(f.physicalSteps(),0);assert.equal(api.storyCheckpoint(),null);
 assert.equal(f.audioEvents.filter(e=>e.action==='prime'||e.action==='unlock'||e.action==='run').length,0);assert.equal(f.storyUpdates.length,0);assert.equal(progress.at(-1),1);
 await api.start('story');assert.equal(api.modePrepared!('story'),false);assert.equal(f.storyCreates(),1,'activation must reuse the prepared visual');assert.equal(f.storyDisposals(),0);assert.ok(api.storyCheckpoint());assert.equal(f.snapshot().phase,'playing');assert.deepEqual(f.runMusicRequests,[]);
}));

test('v063 cancelled preparation disposes a late story scene without creating a session',async()=>fixture(async(api,f)=>{
 const release=f.deferStoryWorld(),controller=new AbortController(),pending=api.prepareMode!('story',undefined,{signal:controller.signal});
 for(let i=0;i<40&&f.storyCreates()===0;i++)await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(f.storyCreates(),1);
 controller.abort();api.cancelModePreparation!();release();await assert.rejects(pending,{name:'AbortError'});
 assert.equal(api.modePrepared!('story'),false);assert.equal(f.storyDisposals(),1);assert.equal(api.storyCheckpoint(),null);assert.equal(f.createdIds.length,0);assert.equal(f.physicalSteps(),0);
 await api.prepareMode!('roam');assert.equal(api.modePrepared!('roam'),true);await api.start('roam');assert.equal(f.snapshot().mode,'roam');assert.equal(f.snapshot().phase,'playing');
}));

test('v063 cancelling a completed preparation releases its scene and requires a fresh preparation',async()=>fixture(async(api,f)=>{
 await api.prepareMode!('story');assert.equal(f.storyCreates(),1);api.cancelModePreparation!();assert.equal(f.storyDisposals(),1);assert.equal(api.modePrepared!('story'),false);
 await api.prepareMode!('story');assert.equal(f.storyCreates(),2);assert.equal(api.modePrepared!('story'),true);api.menu();assert.equal(f.storyDisposals(),2);assert.equal(api.storyCheckpoint(),null);
}));

test('escape rejects unsupported task terrain before creating NPCs and can retry without weakening validation',async()=>fixture(async(api,f)=>{
  f.support(false);await assert.rejects(api.start('escape'),/本局暂时无法开始/);assert.equal(f.snapshot().phase,'menu');assert.equal(f.createdIds.length,0);assert.equal(f.physicalSteps(),0);
  f.support(true);await api.start('escape');f.step(7);assert.equal(f.snapshot().escape!.tasks.length,3);assert.equal(f.diagnostics().npcs.length,6);assert.equal(f.snapshot().phase,'playing');
}));

test('failed preparation keeps the real randomized six-person roster; a new round draws from a new seed',async()=>fixture(async(api,f)=>{
  f.failBillboardsOnce();await assert.rejects(api.start('escape'));const chosen=[...f.billboardLoads[0]];assert.equal(new Set(chosen).size,6);
  f.roundSeed(2000);await api.start('escape');f.step(7);assert.deepEqual(f.billboardLoads[1],chosen,'retry retains the already sampled roster');assert.deepEqual(f.diagnostics().npcs.map(n=>n.identity),chosen);
  f.roundSeed(3000);await api.start('escape');f.step(7);assert.notDeepEqual(f.billboardLoads[2],chosen,'a fresh round actually reshuffles');assert.equal(new Set(f.billboardLoads[2]).size,6);assert.equal(f.diagnostics().npcs.filter((n:any)=>n.active).length,4);
},{randomRoster:true}));

test('all four current task types complete through real engine interaction and grant each reward once',async()=>{
  const covered=new Set<string>();for(const seed of [1000,1001,1002,1003])await fixture(async(api,f)=>{
    await api.start('escape');const tasks=f.snapshot().escape!.tasks,initialReserve=f.snapshot().reserve;
    for(const task of tasks){covered.add(task.kind);api.selectEscapeTask?.(task.id);for(const point of task.positions){f.moveToHeight(...point);f.step(7);api.action('interact');f.step(7);}if(task.kind==='hold')f.step(ESCAPE_DIFFICULTIES.standard.hold*60+7);assert.equal(f.snapshot().escape!.tasks.find(t=>t.id===task.id)!.state,'complete');const awarded=f.snapshot().reserve;api.action('interact');f.step(7);assert.equal(f.snapshot().reserve,awarded,'completed endpoint cannot issue another reward');}
    assert.equal(f.snapshot().reserve,initialReserve+3*WEAPONS.m4a1.capacity);assert.equal(f.snapshot().escape!.reinforcement,true);assert.equal(f.snapshot().escape!.extractionAvailable,true);
  },{seed});assert.deepEqual([...covered].sort(),['activate','deliver','hold','take']);
});
