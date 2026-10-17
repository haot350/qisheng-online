import type {Mode,WeaponId} from './types.ts';

export const NPC_IDS=['jiang','meng','xu','luan','xutao','chengguotao','wangwenrui','wangdi','wangyuhan'] as const;
export const ESCAPE_INITIAL_NPCS=6;
export const ESCAPE_TOTAL_NPCS=9;
export type NpcIdentityId=typeof NPC_IDS[number];
export type NpcSkill='sprint'|'callout';
export const NPC_COMBAT_POSES=['combat-walk-a','combat-walk-b','combat-run-a','combat-run-b','reload'] as const;
export type NpcCombatPose=typeof NPC_COMBAT_POSES[number];
export type NpcPose='idle'|'attack'|'skill'|'walk-a'|'walk-b'|'run-a'|'run-b'|NpcCombatPose;
/** New art is versioned; originals remain available for earlier releases. */
export function npcPoseFilename(id:NpcIdentityId,pose:NpcPose,mobile=false){
 if(['wangwenrui','wangdi','wangyuhan'].includes(id)||(id==='meng'&&pose==='skill'))return '/characters/billboards/v090/'+(mobile?'mobile/':'')+id+(pose==='idle'?'':'-'+pose)+'.webp';
 const revision=pose==='attack'||NPC_COMBAT_POSES.includes(pose as NpcCombatPose)?'v032/':'';
 return '/characters/billboards/'+revision+(mobile?'mobile/':'')+id+(pose==='idle'?'':'-'+pose)+'.webp';
}
export interface NpcIdentity {name:string;weapon:WeaponId;skill?:NpcSkill;poses:readonly NpcPose[];legacyLayout?:number;}
/** Identities never inherit a runtime slot's firearm, art or ability. */
export const NPC_IDENTITY:Readonly<Record<NpcIdentityId,NpcIdentity>>={
 jiang:{name:'姜晓峰',weapon:'mp5',poses:['idle','attack',...NPC_COMBAT_POSES],legacyLayout:0},
 meng:{name:'孟庆升',weapon:'m4a1',poses:['idle','attack','skill',...NPC_COMBAT_POSES],legacyLayout:1},
 xu:{name:'徐泗龙',weapon:'ak47',poses:['idle','attack',...NPC_COMBAT_POSES],legacyLayout:2},
 luan:{name:'栾晓光',weapon:'r870',poses:['idle','attack',...NPC_COMBAT_POSES],legacyLayout:3},
 xutao:{name:'徐涛',weapon:'mp5',skill:'sprint',poses:['idle','attack','skill','run-a','run-b',...NPC_COMBAT_POSES]},
 chengguotao:{name:'程国涛',weapon:'glock',skill:'callout',poses:['idle','attack','skill',...NPC_COMBAT_POSES]},
 wangwenrui:{name:'王文瑞',weapon:'ak47',poses:['idle','attack',...NPC_COMBAT_POSES]},
 wangdi:{name:'王迪',weapon:'mp5',poses:['idle','attack',...NPC_COMBAT_POSES]},
 wangyuhan:{name:'王雨涵',weapon:'m4a1',poses:['idle','attack',...NPC_COMBAT_POSES]},
};
function randomIndex(random:()=>number,length:number){return Math.min(length-1,Math.max(0,Math.floor(random()*length)));}
/** Select once per round; retries retain this result and respawns retain slot identity. */
export function selectRoundRoster(random:()=>number,mode:Mode):NpcIdentityId[]{
 if(mode==='roam')return[];
 if(mode==='escape')return selectEscapeRoster(random);
 const shuffled:NpcIdentityId[]=[...NPC_IDS];
 for(let i=shuffled.length-1;i>0;i--){const j=randomIndex(random,i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
 const roster=shuffled.slice(0,4),principal=roster.indexOf('chengguotao');
 if(mode==='dafei'&&principal>=0){const sportsSlot=randomIndex(random,2)===0?0:3;[roster[principal],roster[sportsSlot]]=[roster[sportsSlot],roster[principal]];}
 return roster;
}

/** Meng starts every escape; remaining places are seeded once, never by runtime slot. */
export function selectEscapeRoster(random:()=>number):NpcIdentityId[]{
 const ids=NPC_IDS.filter((id):id is Exclude<NpcIdentityId,'meng'>=>id!=='meng');
 for(let i=ids.length-1;i>0;i--){const j=randomIndex(random,i+1);[ids[i],ids[j]]=[ids[j],ids[i]];}
 return ['meng',...ids];
}

