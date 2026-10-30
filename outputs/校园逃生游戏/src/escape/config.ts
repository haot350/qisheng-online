import {VALIDATED_ESCAPE_SITES,VALIDATED_ESCAPE_SPAWN,VALIDATED_ESCAPE_EXTRACTION} from './validated';
import type {EscapeDifficulty,EscapeSite,EscapeTask,EscapeVec3} from './types.ts';
export const ESCAPE_DIFFICULTIES=Object.freeze({
 easy:{round:600,maxFire:2,hold:12,extract:15,respawn:25,damageScale:.30},
 standard:{round:480,maxFire:3,hold:15,extract:20,respawn:20,damageScale:.40},
 hard:{round:420,maxFire:4,hold:18,extract:25,respawn:15,damageScale:.48}
});
export const ESCAPE_RULES=Object.freeze({grace:10,walk:3.4,sprint:6,stamina:100,sprintSeconds:8,recoveryDelay:1,recoverySeconds:5,slideCost:20,slideSeconds:.7,slideCooldown:2,slideMinSpeed:4.5,slideSpread:1.65,regenDelay:6,regenPerSecond:8,regenLimit:60,maxHealth:100,interactionRadius:2.4,holdRadius:6,extractRadius:4.5,activateMin:12,activateMax:30,deliverMin:40,deliverMax:120,budgetFraction:.6,respawnDistance:35,respawnRetry:.5,respawnProtectedRadius:10,npcHeight:1.75,firstShotGap:.35,initialAim:.9,nextAim:.55,burst:2,cooldownMin:1.8,cooldownMax:2.6});
export const escapeDifficulty=(value:unknown):EscapeDifficulty=>value==='easy'||value==='hard'?value:'standard';
export const ESCAPE_SPAWN:EscapeVec3=[...VALIDATED_ESCAPE_SPAWN];
export const ESCAPE_EXTRACTION:EscapeSite={...VALIDATED_ESCAPE_EXTRACTION,position:[...VALIDATED_ESCAPE_EXTRACTION.position]};
/** Shared calibrated points drive both generated and fallback tasks. */
export const ESCAPE_SITES:EscapeSite[]=VALIDATED_ESCAPE_SITES;
const site=(id:string)=>ESCAPE_SITES.find(p=>p.id===id)!;
export function escapeFallbackTasks(difficulty:EscapeDifficulty):EscapeTask[]{return [
 {id:'take-sports-road',kind:'take',label:'夺取运动区道路物资',sites:[site('sports-road')],duration:0,radius:ESCAPE_RULES.interactionRadius},
 {id:'activate-yard-library',kind:'activate',label:'启动庭院设备',sites:[site('yard'),site('library-west')],duration:0,radius:ESCAPE_RULES.interactionRadius},
 {id:'hold-sports-north',kind:'hold',label:'守住运动场信标',sites:[site('sports-north')],duration:ESCAPE_DIFFICULTIES[difficulty].hold,radius:ESCAPE_RULES.holdRadius}
];}