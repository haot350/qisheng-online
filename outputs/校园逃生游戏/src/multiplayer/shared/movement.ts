import {EscapeMovement} from '../../escape/movement';
import {CAPSULE,SimWorld} from './sim-world';
import type {InputCommand,Vec3,PlayerState} from './protocol';
export interface MotionState {position:Vec3;velocity:Vec3;grounded:boolean;crouched:boolean;stamina:number;sprinting:boolean;sliding:boolean;actualSpeed:number;vertical:number;lastSafe:Vec3;movement:EscapeMovement;}
export function newMotion(position:Vec3):MotionState{return {position:[...position],velocity:[0,0,0],grounded:false,crouched:false,stamina:100,sprinting:false,sliding:false,actualSpeed:0,vertical:0,lastSafe:[...position],movement:new EscapeMovement()};}
export function stepMotion(world:SimWorld,id:string,state:MotionState,input:InputCommand,dt=1/60,blocked=false){const length=Math.hypot(input.moveX,input.moveY),x=input.moveX/Math.max(1,length),z=-input.moveY/Math.max(1,length),sin=Math.sin(input.yaw),cos=Math.cos(input.yaw),dir:Vec3=[x*cos+z*sin,0,-x*sin+z*cos],probe:Vec3=[state.position[0]+dir[0]*4.6,state.position[1],state.position[2]+dir[2]*4.6];const checking=input.actions?.includes('slide')||state.sliding,routeSafe=!checking||world.safeRoute([state.position,probe]),onStairs=checking&&Math.abs(state.position[1]-(world.supportAt(probe,1.75)?.height??-100))>.18;
const motion=state.movement.update(dt,{sprintHeld:input.sprint&&!input.aim,slidePressed:input.actions?.includes('slide'),moving:length>.05,speed:state.actualSpeed,grounded:state.grounded,routeSafe,onStairs,aiming:input.aim,direction:[dir[0],dir[2]],blocked});state.stamina=motion.stamina;state.sprinting=motion.sprinting;state.sliding=motion.sliding;if(blocked){state.velocity=[0,0,0];return;}const crouch=input.crouch||motion.forcedLow,speed=motion.sliding?motion.speed:crouch?1.6:motion.speed;if(motion.slideDirection){dir[0]=motion.slideDirection[0];dir[2]=motion.slideDirection[1];}
if(input.actions?.includes('jump')&&state.grounded&&!crouch&&!motion.sliding){state.vertical=CAPSULE.jump;state.grounded=false;}state.vertical=Math.max(-20,state.vertical-CAPSULE.gravity*dt);const previous=[...state.position] as Vec3,moved=world.move(id,state.position,[dir[0]*speed*dt,state.vertical*dt,dir[2]*speed*dt],crouch);state.position=moved.position;state.grounded=moved.grounded;state.crouched=moved.crouched;state.velocity=state.position.map((p,i)=>(p-previous[i])/dt) as Vec3;state.actualSpeed=Math.hypot(state.velocity[0],state.velocity[2]);if(state.grounded&&state.vertical<0)state.vertical=-.25;const support=state.grounded?world.supportAt(state.position,state.crouched?1.15:1.75):null;if(support?.clear)state.lastSafe=[...state.position];if(state.position[1]<(world.manifest.lowestOpenElevation??-4)-1||state.position.some(p=>!Number.isFinite(p))){state.position=[...state.lastSafe];state.vertical=0;world.restore(id,state.position);}}
export class LocalPrediction {
 readonly motion:MotionState;private commands:InputCommand[]=[];private seq=0;private acknowledgedInput:InputCommand|undefined;lastReplaySteps=0;
 constructor(readonly world:SimWorld,readonly id:string,position:Vec3,team='none'){this.motion=newMotion(position);world.addActor(id,position,team);}
 predict(input:InputCommand,dt=1/60){this.seq=Math.max(this.seq,input.seq);this.commands.push({...input,actions:[...(input.actions??[])],actionIds:input.actionIds?.map(a=>({...a}))});if(this.commands.length>90)this.commands.shift();stepMotion(this.world,this.id,this.motion,input,dt);this.world.step(dt);return this.motion;}
 reconcile(authoritative:PlayerState,snapshotTick?:number,allowReplay=true){
  if(authoritative.loading||!allowReplay)this.clear();
  const cutoff=authoritative.appliedInputTick??snapshotTick;
  const previous=this.commands;this.commands=previous.filter(c=>cutoff!==undefined&&c.targetTick!==undefined?c.targetTick>cutoff:c.seq>authoritative.ack);
  this.motion.position=[...authoritative.position];this.motion.velocity=[...authoritative.velocity];this.motion.vertical=authoritative.movementState?.vertical??authoritative.velocity[1];this.motion.lastSafe=[...(authoritative.movementState?.lastSafe??authoritative.position)];this.motion.grounded=authoritative.grounded;this.motion.crouched=authoritative.crouched;this.motion.stamina=authoritative.stamina;
  if(authoritative.movementState)this.motion.movement.restore(authoritative.movementState);else{this.motion.movement.reset();this.motion.movement.stamina=authoritative.stamina;}
  this.motion.sprinting=authoritative.sprinting;this.motion.sliding=authoritative.sliding;this.motion.actualSpeed=authoritative.movementState?.actualSpeed??Math.hypot(authoritative.velocity[0],authoritative.velocity[2]);this.world.restore(this.id,this.motion.position);this.world.move(this.id,this.motion.position,[0,0,0],authoritative.crouched);this.world.restore(this.id,this.motion.position);this.lastReplaySteps=0;
  if(cutoff!==undefined&&this.commands.every(c=>c.targetTick!==undefined)){
   const latest=this.commands.at(-1)?.targetTick??cutoff,limit=Math.min(latest,cutoff+30);
   let held=previous.filter(c=>(c.targetTick??Infinity)<=cutoff).at(-1)??this.acknowledgedInput;if(held)this.acknowledgedInput=held;
   for(let tick=cutoff+1;tick<=limit;tick++){
    const command=this.commands.find(c=>c.targetTick===tick);if(command)held=command;if(!held)continue;
    const input={...held,actions:command?command.actions:[],actionIds:command?command.actionIds:[]};
    // An action already committed by authority is not replayed after a timeline rebase.
    if(input.actionIds?.length){input.actionIds=input.actionIds.filter(a=>a.id>(authoritative.actionAck??0));input.actions=input.actionIds.map(a=>a.type);}
    stepMotion(this.world,this.id,this.motion,input);this.world.step();this.lastReplaySteps++;
   }
  }else for(const input of this.commands.slice(-30)){stepMotion(this.world,this.id,this.motion,input);this.world.step();this.lastReplaySteps++;}
  return this.motion;
 }
 clear(){this.commands=[];this.acknowledgedInput=undefined;this.lastReplaySteps=0;}
 dispose(){this.clear();this.world.removeActor(this.id);}
}
