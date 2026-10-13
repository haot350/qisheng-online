import type {EscapeDifficulty,EscapeSite,EscapeTask,EscapeVec3} from './types.ts';
export const ESCAPE_DIFFICULTIES=Object.freeze({
 easy:{round:600,maxFire:2,hold:12,extract:15,respawn:25,damageScale:.30},
 standard:{round:480,maxFire:3,hold:15,extract:20,respawn:20,damageScale:.40},
 hard:{round:420,maxFire:4,hold:18,extract:25,respawn:15,damageScale:.48}
});
export const ESCAPE_RULES=Object.freeze({grace:10,walk:3.4,sprint:6,stamina:100,sprintSeconds:8,recoveryDelay:1,recoverySeconds:5,slideCost:20,slideSeconds:.7,slideCooldown:2,slideMinSpeed:4.5,slideSpread:1.65,regenDelay:6,regenPerSecond:8,regenLimit:60,maxHealth:100,interactionRadius:2.4,holdRadius:6,extractRadius:4.5,activateMin:12,activateMax:30,deliverMin:40,deliverMax:120,budgetFraction:.6,respawnDistance:35,respawnRetry:.5,respawnProtectedRadius:10,npcHeight:1.75,firstShotGap:.35,initialAim:.9,nextAim:.55,burst:2,cooldownMin:1.8,cooldownMax:2.6});
export const escapeDifficulty=(value:unknown):EscapeDifficulty=>value==='easy'||value==='hard'?value:'standard';
export const ESCAPE_SPAWN:EscapeVec3=[0,.07371096313,-15];
export const ESCAPE_EXTRACTION:EscapeSite={id:'gate-extraction',label:'校门撤离点',region:'gate',position:[...ESCAPE_SPAWN],floor:0};
/** Authored points reuse existing v16 interaction/story sites; the runtime validator remains authoritative. */
export const ESCAPE_SITES:EscapeSite[]=[
 {id:'yard',label:'教学庭院',region:'teaching',position:[-46,.17999982834,-103],floor:0},
 {id:'teaching-supply',label:'教学区道路',region:'teaching',position:[-24,.17999982834,-100],floor:0},
 {id:'library-west',label:'图书馆西侧',region:'teaching',position:[-18,.22833496332,-106],floor:0},
 {id:'sports-north',label:'运动场北侧',region:'sports',position:[-118,.25999975204,-95],floor:0},
 {id:'sports-road',label:'运动区道路',region:'sports',position:[-77,.1,-78],floor:0},
 {id:'canteen-north',label:'食堂北侧',region:'canteen',position:[0,.09999990463,-184],floor:0},
 {id:'dorm-road',label:'宿舍东侧道路',region:'dorm',position:[82,.1,-120],floor:0},
 {id:'dorm-yard',label:'宿舍下沉庭院',region:'dorm',position:[45,-2.2775323391,-124],floor:0,roles:['take','deliver']},
 {id:'south-floor-1',label:'南楼一层走廊',region:'teaching',position:[-51,.61,-77.4],floor:1,roles:['take','activate','deliver']},
 {id:'south-floor-2',label:'南楼二层走廊',region:'teaching',position:[-50,4.32,-78],floor:2,roles:['take','activate','deliver']},
 {id:'south-floor-1-west',label:'南楼一层西侧',region:'teaching',position:[-64,.61,-77.4],floor:1,roles:['activate']},
 {id:'south-floor-2-west',label:'南楼二层西侧',region:'teaching',position:[-64,4.32,-78],floor:2,roles:['activate']}
];
const site=(id:string)=>ESCAPE_SITES.find(p=>p.id===id)!;
export function escapeFallbackTasks(difficulty:EscapeDifficulty):EscapeTask[]{return [
 {id:'take-sports-road',kind:'take',label:'夺取运动区道路物资',sites:[site('sports-road')],duration:0,radius:ESCAPE_RULES.interactionRadius},
 {id:'activate-yard-library',kind:'activate',label:'启动庭院设备',sites:[site('yard'),site('library-west')],duration:0,radius:ESCAPE_RULES.interactionRadius},
 {id:'hold-sports-north',kind:'hold',label:'守住运动场信标',sites:[site('sports-north')],duration:ESCAPE_DIFFICULTIES[difficulty].hold,radius:ESCAPE_RULES.holdRadius}
];}