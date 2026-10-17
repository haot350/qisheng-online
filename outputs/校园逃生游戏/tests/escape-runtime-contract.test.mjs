import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';
import {EscapeRound,EscapeMovement,EscapeAttack,EscapeFireCoordinator,ESCAPE_DIFFICULTIES,ESCAPE_RULES} from '../src/escape/index.ts';
import {Magazine,WEAPONS,RULES} from '../src/rules.ts';
import {NPC_IDENTITY} from '../src/npc-roster.ts';
import {pathMotion} from '../src/path-following.ts';
import {EscapeTactics,physicalCoverAt} from '../src/escape/tactics.ts';
import {EscapeContacts} from '../src/escape/contacts.ts';
import {NpcMovingAccuracy,NPC_COMBAT_PROFILES,NPC_SENSE_RULES,npcSightEligible,npcReaction,playerWeaponSpread} from '../src/npc-combat-motion.ts';
import {adsFieldOfView} from '../src/rules.ts';
import {DRIVE_RULES} from '../src/driving-rules.ts';
import {taskInteractionSites} from '../src/escape/interaction.ts';

// Exercise the real closure functions with small world/input doubles. No GPU,
// renderer or altered engine source is needed for these lifecycle contracts.
function engineFunction(name,scope){
 scope.NPC_COMBAT_PROFILES??=NPC_COMBAT_PROFILES;scope.NPC_SENSE_RULES??=NPC_SENSE_RULES;scope.npcSightEligible??=npcSightEligible;scope.npcReaction??=npcReaction;scope.playerWeaponSpread??=playerWeaponSpread;scope.escapeSelectedDifficulty??='standard';scope.npcVisible??=(...args)=>scope.visible(...args);
 const source=readFileSync(new URL('../src/engine.ts',import.meta.url),'utf8');
 const ast=ts.createSourceFile('engine.ts',source,ts.ScriptTarget.Latest,true);let found;
 function walk(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node;else ts.forEachChild(node,walk);}
 walk(ast);assert.ok(found,`engine function ${name} exists`);
 const js=ts.transpileModule(found.getText(ast).replaceAll('import.meta.env.DEV','false'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText.trim();
 return Function('scope',`with(scope){${js};return ${name};}`)(scope);
}
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function mapScope(lock=async()=>{}){
 let scheduled=0,enabled=false,cursorFree=true;
 const scope={touchControls:()=>false,innerHeight:720,innerWidth:1280,mode:'escape',escapeRound:{},phase:'playing',escapeMapOpen:true,escapeMapClosing:false,story:null,photo:null,storyOverlayOpen:false,cursorBlocked:true,enterToken:1,dead:false,npcs:[],escapeFire:{reset(){}},accumulator:0,last:0,
 input:{setCursorFree(value){cursorFree=value;},setEnabled(value){enabled=value;},reset(){},lock,freePointerLock(){}},audio:{update(){}},
 phaseActive:()=>scope.phase==='playing',syncObservationCursor(){},info(){},emit(){},render(){},schedule(){scheduled++;},pause(){scope.phase='paused';enabled=false;},performance:{now:()=>100},get enabled(){return enabled;},get cursorFree(){return cursorFree;},get scheduled(){return scheduled;}};
 scope.syncObservationCursor=engineFunction('syncObservationCursor',scope);return scope;
}
test('the task map keeps simulation and input frozen until desktop pointer lock succeeds',async()=>{
 const pending=defer(),scope=mapScope(()=>pending.promise),close=engineFunction('taskMap',scope)(false);
 assert.equal(scope.escapeMapOpen,true,'map is still the simulation gate while pointer lock is pending');
 assert.equal(scope.enabled,false);assert.equal(scope.cursorFree,false);pending.resolve();await close;
 assert.equal(scope.escapeMapOpen,false);assert.equal(scope.enabled,true);
});
test('pointer-lock rejection cannot silently resume the task-map round',async()=>{
 const scope=mapScope(()=>Promise.reject(Error('denied')));await engineFunction('taskMap',scope)(false);
 assert.ok(scope.escapeMapOpen||scope.phase==='paused','a rejected lock retains a frozen map or pauses the round');
 assert.equal(scope.enabled,false);assert.equal(scope.cursorFree,true);
});
test('a late map-close result cannot schedule a replacement escape session',async()=>{
 const pending=defer(),scope=mapScope(()=>pending.promise),close=engineFunction('taskMap',scope)(false);
 scope.enterToken++;scope.escapeRound={newSession:true};scope.escapeMapOpen=false;const count=scope.scheduled;pending.resolve();await close;
 assert.equal(scope.scheduled,count,'cancelled map request must not revive the new round');
});
function movementScope(blockMotion=false){
 const position=new THREE.Vector3(),camera=new THREE.PerspectiveCamera(68,1,.1,500),steps=[],motionSamples=[];
 const scope={gadgetInventory:{cardsUntil:0},updateGadgets(){},ranked:null,THREE,UP:new THREE.Vector3(0,1,0),phaseActive:()=>true,buffering:false,escapeMapOpen:false,safetyChecks:0,refreshStreaming(full){assert.equal(full,false,'substeps only run the lightweight safety query');scope.safetyChecks++;},directions:{update(){}},kick:{update(){},yaw:0,pitch:0},effects:{update(){}},
 WEAPONS,RULES,adsFieldOfView,equipLeft:0,adsBlend:0,updateNearWall(){},syncScopedView(){},updateDrops(){},weapon:'glock',mode:'escape',elapsed:0,emitClock:0,input:{sample:()=>({moveX:0,moveY:1,lookX:0,lookY:0,fire:false,aim:false,crouch:false,actions:new Set()})},
 photo:null,story:null,storyWorld:null,storyOverlayOpen:false,storyFastWalk:false,noticeLeft:0,notice:'',hurt:0,hit:0,recoil:0,smokeReady:0,
 settings:{sensitivity:1,aimAssist:false,headBob:false,recoilShake:false,fov:68},touchControls:()=>false,yaw:0,pitch:0,crouched:false,aiming:false,
 stamina:{running:false,value:100,stop(){this.running=false;}},frameMoving:0,escapeMovement:new EscapeMovement(),escapeMotion:null,actualSpeed:0,actualVelocity:new THREE.Vector3(),grounded:true,velocityY:0,position,lastSafe:position.clone(),
 world:{manifest:{lowestOpenElevation:-4},setCrouch:(_p,c)=>c,npcRouteSafe:()=>true,supportAt:p=>({height:p.y,normalY:1,clear:true}),move(p,m,dt,c){motionSamples.push(m.clone());return{position:blockMotion?p.clone():p.clone().add(new THREE.Vector3(m.x,0,m.z)),grounded:true,crouching:c};},restorePlayer(){},step(){return 0;}},
 camera,bobTime:0,inventory:{pistol:{update(){},reloadLeft:0},primary:null},magazine:()=>({update(){},reloadLeft:0}),reloadSounds(){},playerReloadStage:0,playerReloadSerial:0,
 audio:{setListener(){},step(...args){steps.push(args);},update(){}},stepClock:0,footstepSerial:0,footstepPoint:new THREE.Vector3(),npcs:[],senseNPCs(){},updateNpcSkills(){},deliverCallouts(){},updateEscapeCombat(){},updateEscapeTasks(){},clouds:[],sparks:[],physicsMs:0,low:false,emit(){},info(){},pause(){},updateGoal(){},
 steps,motionSamples};
 scope.syncObservationCursor=engineFunction('syncObservationCursor',scope);return scope;
}
test('held movement uses normalized axes and the same yaw direction as observation',()=>{
 const scope=movementScope();scope.input.sample=()=>({moveX:1,moveY:1,lookX:0,lookY:0,fire:false,aim:false,crouch:false,actions:new Set()});
 const update=engineFunction('update',scope);update(1/60);
 assert.ok(Math.abs(Math.hypot(scope.motionSamples[0].x,scope.motionSamples[0].z)-ESCAPE_RULES.walk/60)<1e-9);
 scope.yaw=Math.PI/2;scope.input.sample=()=>({moveX:0,moveY:1,lookX:0,lookY:0,fire:false,aim:false,crouch:false,actions:new Set()});update(1/60);
 assert.ok(scope.motionSamples[1].x<0&&Math.abs(scope.motionSamples[1].z)<1e-9);
 scope.input.sample=()=>({moveX:0,moveY:0,lookX:20,lookY:0,fire:false,aim:false,crouch:false,actions:new Set()});const yaw=scope.yaw;update(1/60);assert.ok(scope.yaw<yaw);
});
test('wall pushing produces no footstep, while actual horizontal travel does',()=>{
 const stopped=movementScope(true),updateStopped=engineFunction('update',stopped);
 for(let i=0;i<120;i++)updateStopped(1/60);assert.equal(stopped.steps.length,0);assert.equal(stopped.footstepSerial,0);
 const moving=movementScope(),updateMoving=engineFunction('update',moving);for(let i=0;i<120;i++)updateMoving(1/60);
 assert.ok(moving.steps.length>=6);assert.ok(moving.footstepSerial>=6);
 moving.buffering=true;const elapsed=moving.elapsed,position=moving.position.clone(),serial=moving.footstepSerial;
 for(let i=0;i<60;i++)updateMoving(1/60);assert.equal(moving.elapsed,elapsed);assert.ok(moving.position.equals(position));assert.equal(moving.footstepSerial,serial);
 moving.buffering=false;moving.escapeMapOpen=true;for(let i=0;i<60;i++)updateMoving(1/60);assert.equal(moving.elapsed,elapsed);assert.ok(moving.position.equals(position));
});
const site=(id,x)=>({id,label:id,region:'teaching',position:[x,0,0],floor:0});
test('the real round enables all nine stable slots after task two without changing identities',()=>{
 const sites=[site('one',0),site('two',20),site('three',40)],plan={seed:17,difficulty:'standard',spawn:[0,0,0],extraction:site('gate',-20),tasks:sites.map((s,i)=>({id:'take-'+i,kind:'take',label:s.label,sites:[s],duration:0,radius:2.4}))};
 const round=new EscapeRound({difficulty:'standard',plan});
 assert.equal(round.snapshot().activeNPCs,6);
 round.update(1/60,{position:sites[0].position,interactPressed:true});
 const events=round.update(1/60,{position:sites[1].position,interactPressed:true});
 assert.equal(events.filter(e=>e.type==='reinforcements').length,1);assert.equal(round.snapshot().activeNPCs,9);
 const before=round.elapsed;round.update(99,{position:sites[2].position,blocked:true});assert.equal(round.elapsed,before);
 const slots=Object.keys(NPC_IDENTITY).map((identity,id)=>({id,identity,reenterAt:Infinity,respawnProbe:1})),identities=slots.map(n=>n.identity);
 const scope={WEAPONS,taskInteractionSites,escapeRound:{snapshot:()=>round.snapshot(),update:()=>events,elapsed:round.elapsed,extractionProgress:0,extractionAvailable:false},escapePlan:plan,position:new THREE.Vector3(20,0,0),camera:{position:new THREE.Vector3(20,1.7,0)},npcs:slots,world:{manifest:{supplies:[],extraction:[-20,0,0]},rayDistance:()=>Infinity},ESCAPE_RULES,pickupReachable:()=>true,escapeThreat:()=>false,v:p=>new THREE.Vector3(...p),clues:[],inventory:{pistol:new Magazine('glock'),primary:null},audio:{cue(){},setEscapeMusic(){}},info(){},investigateEscape(){},elapsed:0,extraction:0,updateGoal(){},escapeCombatMusicLeft:0,settings:{escapeMusic:'battle'},health:100,escapeRecovery:{update:(_dt,h)=>h},finish(){},interact(){}};
 scope.escapeInteraction=()=>null;
 engineFunction('updateEscapeTasks',scope)(1/60,false);
 assert.deepEqual(slots.map(n=>n.identity),identities);for(const slot of slots.slice(0,6))assert.equal(slot.reenterAt,Infinity);for(const slot of slots.slice(6))assert.equal(slot.reenterAt,round.elapsed);
});
test('re-entry retains identity and clears every old combat and motion transient',()=>{
 const oldGun=new Magazine('mp5'),attack=new EscapeAttack();attack.phase='fire';
 const npc={id:5,identity:'xutao',position:new THREE.Vector3(80,0,0),previous:new THREE.Vector3(80,0,0),lastEntry:'old',escapeActive:false,reenterAt:20,disabled:0,suppression:0,memory:7,lastKnown:new THREE.Vector3(),sees:true,alert:true,path:[new THREE.Vector3()],reaction:0,repath:4,skill:{recover(){}},team:{clear(){}},escapeAttack:attack,actualSpeed:3.2,movingAccuracy:new NpcMovingAccuracy(),gun:oldGun,reloadSerial:4,reloadStage:2,fire:.05,hit:.12,step:.91,stuck:1.19,sense:.4,heardStep:23,rig:{root:new THREE.Group()}};
 const scope={rankSpawn(){},NPC_IDENTITY,Magazine,footstepSerial:24,escapeTactics:new EscapeTactics(),escapeContacts:new EscapeContacts()};scope.escapeContacts.seen(5,[80,0,0],0);engineFunction('entryEscape',scope)(npc,site('new',90));
 assert.equal(npc.identity,'xutao');assert.equal(npc.id,5);assert.equal(npc.gun.id,NPC_IDENTITY.xutao.weapon);assert.ok(npc.gun.ammo>0);assert.equal(attack.phase,'search');
 for(const key of ['fire','hit','step','stuck','sense'])assert.equal(npc[key],0,`${key} belongs to the old appearance`);
 assert.equal(npc.memory,0);assert.equal(npc.lastKnown,null);assert.equal(npc.sees,false);assert.equal(npc.tacticalSeen,false);assert.equal(npc.tacticalDecision,undefined);assert.equal(scope.escapeContacts.read(0).length,0);
});

test('inactive reinforcement slots never slow mobile aim',()=>{
 const scope=movementScope();scope.touchControls=()=>true;scope.settings.aimAssist=true;scope.aiming=true;scope.camera.position.y=1.1;scope.VEHICLE={camera:{targetHeight:1.1}};scope.visible=()=>true;
 scope.npcs=[{disabled:0,escapeActive:false,position:new THREE.Vector3(0,0,-10)}];
 scope.input.sample=()=>({moveX:0,moveY:0,lookX:20,lookY:0,fire:false,aim:true,crouch:false,actions:new Set()});
 const stop=Error('movement checkpoint');scope.world.move=()=>{throw stop;};
 assert.throws(()=>engineFunction('update',scope)(1/60),error=>error===stop);
 assert.ok(Math.abs(scope.yaw-(-20*.0021))<1e-9,'hidden actors cannot capture the aim-assist cone');
});

test('escape sprint hearing uses actual escape movement instead of the legacy running flag',()=>{
 const n={id:0,position:new THREE.Vector3(20,0,0),disabled:0,escapeActive:true,sense:0,repath:1,memory:0,sees:false,alert:false,heardStep:0,rig:{root:new THREE.Group()},team:{target:null,left:0,tick(){}},gun:new Magazine('mp5'),escapeAttack:new EscapeAttack(),patrol:0,role:0};
 const scope={THREE,mode:'escape',npcs:[n],position:new THREE.Vector3(),camera:new THREE.PerspectiveCamera(),elapsed:20,RULES,ESCAPE_RULES,driving:null,driveChallenge:null,crouched:false,actualSpeed:6,footstepSerial:1,footstepPoint:new THREE.Vector3(),stamina:{running:false},escapeMotion:{sprinting:true},wrapAngle:value=>value,visible:()=>true,npcTarget:()=>new THREE.Vector3(0,1.2,0),random:()=>.5,escapeRound:null,escapePlan:null,escapeTacticalAgents:[],escapeTactics:new EscapeTactics(),escapeSelectedDifficulty:'standard',contactProbe:1,updateEscapeContacts(){},v:p=>new THREE.Vector3(...p)};
 engineFunction('senseNPCs',scope)(1/60);assert.ok(n.lastKnown);assert.ok(n.alert);assert.equal(n.sees,false,'hearing must not grant sight or shooting');assert.equal(n.memory,3);
});
test('empty magazines cannot leave the real NPC rig in the firing aim pose',()=>{
 const gun=new Magazine('mp5');gun.ammo=0;gun.reserve=0;const n={skill:undefined,escapeAttack:{phase:'fire'},gun,fire:0,hit:0,sees:true,shotSerial:1};
 const state=engineFunction('escapeRigState',{npcTarget:()=>new THREE.Vector3()})(n,0);assert.equal(state.aim,false);assert.equal(state.firing,false);assert.equal(state.attackPhase,'search');
});

test('legal stair yielding does not become an eight-second tactical wall failure',()=>{
 const make=(yielding)=>{let failures=0;const n={id:0,position:new THREE.Vector3(),previous:new THREE.Vector3(),gun:new Magazine('mp5'),fire:0,hit:0,reaction:0,escapeActive:true,skill:undefined,path:[new THREE.Vector3(0,0,10)],escapeAttack:{phase:'search'},tacticalDecision:{state:'chase',goal:[0,0,10],moving:true},alert:true,sees:false,stuck:0,rig:{root:new THREE.Group(),update(){}},step:0,actualSpeed:0,movingAccuracy:new NpcMovingAccuracy()};const scope={THREE,ESCAPE_RULES,escapeTacticalAgents:[],profileNavigationOff:false,elapsed:20,position:new THREE.Vector3(20,0,0),npcs:[n],world:{moveActor:(_id,p)=>p.clone(),actorNavigationStatus:()=>({yielding})},pathMotion,escapeTactics:{blocked(){failures++;}},escapeRigState:()=>({}),wrapAngle:v=>v,low:false,profileNpcsHidden:false,npcDrawRange:()=>75,camera:new THREE.PerspectiveCamera(),audio:{step(){}},get failures(){return failures;}};return {n,scope};};
 const waiting=make(true),update=engineFunction('updateEscapeNPC',waiting.scope);for(let i=0;i<150;i++)update(waiting.n,1/60);assert.equal(waiting.scope.failures,0);assert.equal(waiting.n.stuck,0);assert.equal(waiting.n.path.length,1);assert.deepEqual(waiting.n.tacticalDecision.goal,[0,0,10]);
 const wall=make(false),blocked=engineFunction('updateEscapeNPC',wall.scope);for(let i=0;i<150;i++)blocked(wall.n,1/60);assert.equal(wall.scope.failures,1);assert.equal(wall.n.path.length,0,'real static stalls still trigger rerouting');
});

test('principal candidate probes cannot change unselected NPC navigation goals',()=>{
 const commits=[],receives=[],cancels=[];
 const makeNpc=(id,x)=>({id,position:new THREE.Vector3(x,0,0),escapeActive:true,disabled:0,sees:false,gun:{reloadLeft:0},team:{target:null,receive(p){receives.push({id,p});}},attack:{cancel(){cancels.push(id);}},path:[],destination:new THREE.Vector3()});
 const source=makeNpc(0,0),near=makeNpc(1,20),far=makeNpc(2,30);source.skill={busy:true,complete(){this.busy=false;}};
 const scope={THREE,mode:'escape',npcs:[source,near,far],driving:null,NPC_SKILLS:{callout:{allyDistance:45,memory:5}},position:new THREE.Vector3(10,0,0),callouts:[source],trueSight:()=>true,escapeFire:{release(){}},driveFire:{release(){}},calloutPathInRegion:()=>true,world:{npcRouteSafe:()=>true,actorPath(id,from,to,commit=true){commits.push({id,commit});return[from.clone(),to.clone()];}}};
 scope.cancelNpcFire=engineFunction('cancelNpcFire',scope);scope.calloutRecipient=engineFunction('calloutRecipient',scope);
 assert.equal(scope.calloutRecipient(source,scope.position).npc,near);assert.ok(commits.every(c=>c.commit===false));commits.length=0;
 engineFunction('deliverCallouts',scope)();
 assert.deepEqual(commits.filter(c=>c.commit),[{id:near.id,commit:true}]);
 assert.deepEqual(receives.map(r=>r.id),[near.id]);assert.deepEqual(cancels,[near.id]);assert.equal(scope.callouts.length,0);
});

test('slide selects one capsule posture per substep and stays low until standing headroom clears',()=>{
 const scope=movementScope(),requests=[];let headroom=false,physicalSteps=0;
 scope.world.setCrouch=(_p,wanted)=>{requests.push(wanted);return wanted||!headroom;};scope.world.step=()=>{physicalSteps++;return 0;};
 let frame={moveX:0,moveY:1,lookX:0,lookY:0,fire:false,aim:false,crouch:false,sprintHeld:true,actions:new Set()};scope.input.sample=()=>frame;scope.actualSpeed=6;
 const update=engineFunction('update',scope);frame={...frame,actions:new Set(['slide'])};update(1/60);
 assert.equal(scope.escapeMotion.slideStarted,true);assert.deepEqual(requests,[true]);assert.equal(scope.crouched,true);
 frame={...frame,sprintHeld:false,actions:new Set()};for(let i=0;i<70;i++)update(1/60);
 assert.equal(requests.length,71,'each physical substep makes exactly one final posture request');assert.equal(physicalSteps,71);assert.equal(scope.escapeMotion.sliding,false);assert.equal(scope.crouched,true,'low headroom retains crouched capsule after slide');
 headroom=true;update(1/60);assert.equal(requests.length,72);assert.equal(requests.at(-1),false);assert.equal(scope.crouched,false);
});

test('reload rechecks physical eye and body cover after capsule motion, before spending a magazine',()=>{const n={id:0,position:new THREE.Vector3(1.4,0,0),lastKnown:new THREE.Vector3(0,0,20),team:{target:null},sees:false,escapeActive:true,reaction:0,skill:null,gun:new Magazine('mp5'),rig:{getMuzzleWorld:()=>n.position.clone().add(new THREE.Vector3(0,1.2,0))},tacticalDecision:{state:'cover',goal:[2,0,0],moving:false,canReload:true},escapeAttack:new EscapeAttack(),reloadStage:0,reloadSerial:0};n.gun.ammo=0;const scope={THREE,WEAPONS,ESCAPE_RULES,ESCAPE_DIFFICULTIES,physicalCoverAt,elapsed:12,escapeSelectedDifficulty:'standard',position:new THREE.Vector3(0,0,20),npcs:[n],escapeTactics:{read:()=>({coverGoal:true})},escapeFire:new EscapeFireCoordinator('standard'),npcTarget:()=>new THREE.Vector3(0,1.2,20),visible:()=>false,v:p=>new THREE.Vector3().fromArray(p),audio:{mechanical(){}},reloadSounds(){},phaseActive:()=>false,tacticalGeometryVisible:(from,to)=>{assert.equal(to[1],1.2);return from[0]<1.9;}};scope.escapeAtPhysicalCover=engineFunction('escapeAtPhysicalCover',scope);const combat=engineFunction('updateEscapeCombat',scope);combat(1/60);assert.equal(n.gun.reloadLeft,0,'a stale pre-move cover decision cannot start exposed reload');n.position.x=1.91;scope.tacticalGeometryVisible=from=>from[1]<1;combat(1/60);assert.equal(n.gun.reloadLeft,0,'eye-only cover leaves the body exposed');scope.tacticalGeometryVisible=()=>false;combat(1/60);assert.ok(n.gun.reloadLeft>0,'both physical cover rays must succeed before reload');});


test('fatal vehicle damage seals immediately and later NPCs in the same frame cannot fire or score',()=>{
 let active=true,fires=0,finished=0,smoke=0;const records=[];
 const make=(id)=>({id,identity:'jiang',position:new THREE.Vector3(0,0,-8-id),driveAI:{state:'chase'},disabled:0,sees:true,reaction:0,driveAttack:{},gun:{id:'glock',ammo:4,reloadLeft:0,fire(){fires++;return true;}},rig:{getMuzzleWorld:()=>new THREE.Vector3(0,1,-8),getMuzzleDirectionWorld:()=>new THREE.Vector3(0,0,1),isAimReady:()=>true,getEjectionWorld:()=>new THREE.Vector3(),update(){}},shotSerial:0});
 const challenge={durability:1,damage(n){this.durability=Math.max(0,this.durability-n);},hint(){}};
 const scope={THREE,DRIVE_RULES,WEAPONS,NPC_IDENTITY,position:new THREE.Vector3(),elapsed:20,npcs:[make(0),make(1)],phaseActive:()=>active,visible:()=>true,driveFire:{update(){},canFire:()=>true,shot(){}},random:()=>.5,rankGeneration:new Map([[0,0],[1,0]]),rankEvent(type,data){records.push({type,data});},reloadSounds(){},driving:{hitDistance:()=>5,npc:()=>false},world:{rayImpact:()=>null},driveChallenge:challenge,shotPresentation(){},health:100,hurt:0,directions:{add(){}},audio:{cue(){}},camera:new THREE.PerspectiveCamera(),showCarSmoke(){smoke++;},finish(){active=false;finished++;},driveRigState:()=>({})};
 engineFunction('updateDrivingCombat',scope)(1/60);
 assert.equal(fires,1);assert.equal(finished,1);assert.equal(smoke,1);assert.equal(challenge.durability,0);
 assert.deepEqual(records.filter(e=>e.type==='damage').map(e=>e.data.amount),[1]);
 assert.equal(records.filter(e=>e.type==='shot').length,1);assert.equal(records.some(e=>e.type==='hit'),false);
});
