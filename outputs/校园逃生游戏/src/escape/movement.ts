import {ESCAPE_RULES} from './config.ts';
import type {EscapeMovementInput,EscapeMovementOutput} from './types.ts';
import type {MovementCheckpoint} from '@qisheng/shared/types';
export type {MovementCheckpoint} from '@qisheng/shared/types';
export class EscapeMovement {
 stamina:number=ESCAPE_RULES.stamina;private recoveryWait=0;private exhausted=false;private slideLeft=0;private cooldown=0;private direction:[number,number]|null=null;
 capture():MovementCheckpoint{return {stamina:this.stamina,recoveryWait:this.recoveryWait,exhausted:this.exhausted,slideLeft:this.slideLeft,cooldown:this.cooldown,direction:this.direction?[...this.direction]:null};}
 restore(state:MovementCheckpoint){this.stamina=state.stamina;this.recoveryWait=state.recoveryWait;this.exhausted=state.exhausted;this.slideLeft=state.slideLeft;this.cooldown=state.cooldown;this.direction=state.direction?[...state.direction]:null;}
 reset(){this.stamina=ESCAPE_RULES.stamina;this.recoveryWait=0;this.exhausted=false;this.slideLeft=0;this.cooldown=0;this.direction=null;}
 update(dt:number,input:EscapeMovementInput):EscapeMovementOutput {
  if(!Number.isFinite(dt)||dt<0)throw new RangeError('移动时间步长必须是有限非负数。');let started=false,ended=false,sprinting=false;
  if(!input.paused&&!input.blocked){this.cooldown=Math.max(0,this.cooldown-dt);if(!input.sprintHeld)this.exhausted=false;
   if(this.slideLeft>0){this.slideLeft=Math.max(0,this.slideLeft-dt);if(!input.grounded||!input.routeSafe||input.onStairs)this.slideLeft=0;if(this.slideLeft===0){ended=true;this.direction=null;}}
   const vector=input.direction??[0,-1],length=Math.hypot(...vector);
   if(input.slidePressed&&this.slideLeft===0&&this.cooldown<=0&&input.speed>=ESCAPE_RULES.slideMinSpeed&&this.stamina>=ESCAPE_RULES.slideCost&&input.grounded&&input.routeSafe&&!input.onStairs&&length>1e-5){this.slideLeft=ESCAPE_RULES.slideSeconds;this.cooldown=ESCAPE_RULES.slideCooldown;if(!input.staminaFree)this.stamina-=ESCAPE_RULES.slideCost;this.recoveryWait=ESCAPE_RULES.recoveryDelay;this.direction=[vector[0]/length,vector[1]/length];started=true;}
   sprinting=this.slideLeft===0&&input.sprintHeld&&input.moving&&!input.aiming&&!this.exhausted&&this.stamina>0;
   if(sprinting&&!input.staminaFree){this.stamina=Math.max(0,this.stamina-dt*ESCAPE_RULES.stamina/ESCAPE_RULES.sprintSeconds);this.recoveryWait=ESCAPE_RULES.recoveryDelay;if(this.stamina===0){this.exhausted=true;sprinting=false;}}
   else if(!sprinting&&this.slideLeft===0){const previous=this.recoveryWait;this.recoveryWait=Math.max(0,previous-dt);const recovery=Math.max(0,dt-previous);if(recovery>0)this.stamina=Math.min(ESCAPE_RULES.stamina,this.stamina+recovery*ESCAPE_RULES.stamina/ESCAPE_RULES.recoverySeconds);}
  }
  const sliding=this.slideLeft>0,speed=sliding?ESCAPE_RULES.walk+(ESCAPE_RULES.sprint-ESCAPE_RULES.walk)*this.slideLeft/ESCAPE_RULES.slideSeconds:sprinting?ESCAPE_RULES.sprint:ESCAPE_RULES.walk;
  return {speed,stamina:this.stamina,sprinting,sliding,slideLeft:this.slideLeft,slideCooldown:this.cooldown,slideDirection:this.direction?[...this.direction]:null,canAim:!sliding,hipSpread:sliding?ESCAPE_RULES.slideSpread:1,forcedLow:sliding,slideStarted:started,slideEnded:ended};
 }
}
/** Health remains owned by the engine; this tracks only the no-damage recovery clock. */
export class EscapeHealthRecovery {
 private quiet=0;
 reset(){this.quiet=0;}
 noteDamage(){this.quiet=0;}
 update(dt:number,health:number,options:{damaged?:boolean;paused?:boolean;blocked?:boolean}={}):number{if(!Number.isFinite(dt)||dt<0||!Number.isFinite(health))throw new RangeError('无效生命恢复参数。');if(options.paused||options.blocked||health<=0)return health;if(options.damaged){this.quiet=0;return health;}const before=this.quiet;this.quiet+=dt;if(health>=ESCAPE_RULES.regenLimit)return health;const recovering=Math.max(0,this.quiet-Math.max(before,ESCAPE_RULES.regenDelay));return Math.min(ESCAPE_RULES.regenLimit,health+recovering*ESCAPE_RULES.regenPerSecond);}
 refill(){this.quiet=0;return ESCAPE_RULES.maxHealth;}
}