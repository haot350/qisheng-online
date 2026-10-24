/** Pure, browser/server shared ranking rules. Canonical @qisheng/shared module. */
export const RANKING_RULE_VERSION='campus-2026-0.9.0';
export const COOP_RULE_VERSION='coop-2026-0.9.0';
export const DAFEI_RULE_VERSION='dafei-2026-0.9.0';
export const DAFEI_VEHICLE_RULE_VERSION='dafei-2026-vehicles-1';
export const DRIVING_VEHICLE_IDS=Object.freeze(['bao5','tank','scooter'] as const);
export type DrivingVehicleId=typeof DRIVING_VEHICLE_IDS[number];
export const DRIVING_VEHICLES=Object.freeze({
 bao5:Object.freeze({label:'豹5',durability:400,repairAmount:200,normalSpeed:75/3.6,boostSpeed:100/3.6,cannonAmmo:0,cannonCooldown:0,cannonRadius:0,manualTransmission:true}),
 tank:Object.freeze({label:'坦克',durability:800,repairAmount:400,normalSpeed:40/3.6,boostSpeed:40/3.6,cannonAmmo:8,cannonCooldown:4,cannonRadius:4,manualTransmission:false}),
 scooter:Object.freeze({label:'电动滑板车',durability:160,repairAmount:80,normalSpeed:30/3.6,boostSpeed:40/3.6,cannonAmmo:0,cannonCooldown:0,cannonRadius:0,manualTransmission:false}),
});
export function isDrivingVehicleId(value:unknown):value is DrivingVehicleId{return typeof value==='string'&&Object.hasOwn(DRIVING_VEHICLES,value);}
/** Missing vehicle identity belongs to the original car, including archived credentials. */
export function drivingVehicleId(value:unknown):DrivingVehicleId{return value===undefined||value===null?'bao5':isDrivingVehicleId(value)?value:'bao5';}
export function drivingRuleVersion(vehicleId:DrivingVehicleId='bao5'){return vehicleId==='bao5'?DAFEI_RULE_VERSION:DAFEI_VEHICLE_RULE_VERSION;}
export const ESCAPE_RULE_VERSIONS=Object.freeze(['campus-2026-0.4.0','campus-2026-0.7.0',RANKING_RULE_VERSION]);
export const DAFEI_OLD_BEST_KEYS=Object.freeze(['qisheng-game-dafei-best:dafei-2026-0.7.0','qisheng-game-dafei-best:dafei-2026-0.6.5','qisheng-game-dafei-best']);
export type RankingMode='escape'|'dafei';
export function rankingRuleVersion(mode:RankingMode){return mode==='dafei'?DAFEI_RULE_VERSION:RANKING_RULE_VERSION;}
export interface DriveRankingRules {round:number;durability:number;repairAmount:number;stun:number;minimumImpactSpeed:number;baseScore:number;comboWindow:number;maxCombo:number;resetPenalty:number;}
const driveRules=():Readonly<DriveRankingRules>=>Object.freeze({round:300,durability:400,repairAmount:200,stun:10,minimumImpactSpeed:3,baseScore:100,comboWindow:20,maxCombo:4,resetPenalty:50});
export const DRIVE_RANKING_RULES:Readonly<Record<string,Readonly<DriveRankingRules>>>=Object.freeze({'campus-2026-0.4.0':driveRules(),'dafei-2026-0.6.5':driveRules(),'dafei-2026-0.7.0':driveRules(),[DAFEI_RULE_VERSION]:driveRules()});
export function drivingRankingRules(version:string,vehicleId:DrivingVehicleId='bao5'):Readonly<DriveRankingRules>|undefined{
 if(!isDrivingVehicleId(vehicleId))return undefined;
 if(vehicleId==='bao5')return DRIVE_RANKING_RULES[version];
 return version===DAFEI_VEHICLE_RULE_VERSION?Object.freeze({...driveRules(),durability:DRIVING_VEHICLES[vehicleId].durability,repairAmount:DRIVING_VEHICLES[vehicleId].repairAmount}):undefined;
}
export function rankingRuleSupported(mode:RankingMode,version:string,vehicleId:DrivingVehicleId='bao5'){return mode==='escape'?ESCAPE_RULE_VERSIONS.includes(version):mode==='dafei'&&!!drivingRankingRules(version,vehicleId);}
export function drivingBestKey(vehicleId:DrivingVehicleId='bao5'){return vehicleId==='bao5'?DAFEI_BEST_KEY:'qisheng-game-dafei-best:'+drivingRuleVersion(vehicleId)+':'+vehicleId;}
export const DAFEI_BEST_KEY='qisheng-game-dafei-best:'+DAFEI_RULE_VERSION;
export const LEGACY_DAFEI_BEST_KEY='qisheng-game-dafei-best';
export type RankingDifficulty='easy'|'standard'|'hard';
export type RankingControls='keyboard'|'touch'|'mixed';
export type RankingTransmission='auto'|'manual'|'mixed';
export type RankingStatus='pending'|'uploading'|'ranked'|'review'|'rejected'|'retry'|'local'|'unranked';
export interface RankingPlayer{id:string;nickname:string;shortId:string;renameAt:number;autoSubmit:boolean;restricted:boolean;needsUpgrade?:boolean;syncStats?:boolean;accountStatus?:'legacy'|'active'|'disabled';accountId?:string;username?:string;}
export interface RankingAuth{player:RankingPlayer;token:string;expiresAt:number;recoveryCode?:string;}
export interface RankingTask{id:string;kind:'take'|'activate'|'hold'|'deliver';label:string;duration:number;radius:number;sites:Array<{id:string;label:string;region:string;position:[number,number,number];floor?:number}>;}
export interface RankingRunConfig{mode:RankingMode;difficulty?:RankingDifficulty;ruleVersion:string;seed:number;weapon:string;roster:string[];tasks:RankingTask[];controls:RankingControls;transmission?:RankingTransmission;vehicleId?:DrivingVehicleId;}
export interface RankingEvent{seq:number;t:number;order:number;type:'task-interact'|'task-start'|'task-progress'|'task-complete'|'extract-start'|'extract-progress'|'shot'|'down'|'damage'|'hit'|'recover'|'repair'|'reset'|'controls'|'transmission'|'npc-spawn'|'gadget'|'cannon';data:Record<string,unknown>;}
export interface RankingSummary{won:boolean;elapsed:number;score:number;hits?:number;cannonShots?:number;cannonHits?:number;totalHits?:number;vehicleId?:DrivingVehicleId;bestCombo?:number;damage?:number;headshots?:number;downs?:number;uniqueDowns?:number;completed?:number;repairCount?:number;resetCount?:number;controls:RankingControls;transmission?:RankingTransmission;reason?:string;}
export interface RankingTicket{runId:string;credential:string;expiresAt:number;recordStats?:boolean;publishBoard?:boolean;}
export interface RankingSubmission{mode?:RankingMode;difficulty?:RankingDifficulty;vehicleId?:DrivingVehicleId;submittedAt?:number;runId:string;status:'ranked'|'review'|'rejected'|'unranked';reason?:string;summary:RankingSummary;newAchievements?:string[];published?:boolean;recordStats?:boolean;recorded?:boolean;}
export interface RankingEntry{rank:number;runId:string;player:{id:string;nickname:string;shortId:string};mode:RankingMode;difficulty?:RankingDifficulty;vehicleId?:DrivingVehicleId;ruleVersion:string;submittedAt:number;summary:RankingSummary;tasks:Array<{id:string;label:string;kind:string}>;}
export interface RankingBoardQuery{mode:RankingMode;difficulty?:RankingDifficulty;vehicleId?:DrivingVehicleId;period:'week'|'all';week?:string;ruleVersion?:string;search?:string;page?:number;}
export interface RankingBoard{entries:RankingEntry[];total:number;page:number;pageSize:50;vehicleId?:DrivingVehicleId;week:string;weeks:string[];ruleVersion:string;versions:string[];myEntry:RankingEntry|null;}
export const RANKING_LIMITS={sessionDays:30,runHours:24,renameDays:7,pageSize:50,eventBatch:500,eventTotal:20000,driveRound:300,driveHealth:400,comboWindow:20} as const;
export const ESCAPE_RANKING_RULES={easy:{round:600,hold:12,extract:15,respawn:25},standard:{round:480,hold:15,extract:20,respawn:20},hard:{round:420,hold:18,extract:25,respawn:15}} as const;
export function escapeScore(input:{won:boolean;difficulty:RankingDifficulty;elapsed:number;completed:number;uniqueDowns:number;headshots:number;damage:number}){const {won,difficulty,elapsed,completed,uniqueDowns,headshots,damage}=input;const round=ESCAPE_RANKING_RULES[difficulty].round,breakdown={tasks:completed*15,extraction:won?15:0,time:won?15*Math.max(0,round-elapsed)/round:0,downs:Math.min(6,uniqueDowns)*2,headshots:Math.min(3,headshots*.5),health:10*(1-Math.min(1,Math.max(0,damage/200)))};const score=Math.round(Object.values(breakdown).reduce((a,b)=>a+b,0)*10)/10;return {score,breakdown,grade:(won?(score>=85?'S':score>=70?'A':score>=55?'B':'C'):null) as 'S'|'A'|'B'|'C'|null};}
export class RankingDriveScore{score=0;hits=0;cannonHits=0;totalHits=0;combo=0;bestCombo=0;private lastId:string|number|null=null;private expires=0;constructor(readonly rules:Readonly<DriveRankingRules>=DRIVE_RANKING_RULES[DAFEI_RULE_VERSION]){}hit(id:string|number,time:number,source:'collision'|'cannon'='collision'){this.combo=this.lastId!==id&&time<=this.expires?Math.min(this.rules.maxCombo,this.combo+1):1;this.lastId=id;this.expires=time+this.rules.comboWindow;const points=this.rules.baseScore*this.combo;this.score+=points;if(source==='cannon')this.cannonHits++;else this.hits++;this.totalHits++;this.bestCombo=Math.max(this.bestCombo,this.combo);return points;}update(time:number){if(time>this.expires)this.combo=0;}resetCar(){this.score=Math.max(0,this.score-this.rules.resetPenalty);this.combo=0;this.lastId=null;this.expires=0;}}
export function rankingCompare(a:RankingSummary,b:RankingSummary,mode:RankingMode){return mode==='escape'?b.score-a.score||a.elapsed-b.elapsed:b.score-a.score||(b.totalHits??b.hits??0)-(a.totalHits??a.hits??0)||(b.bestCombo??0)-(a.bestCombo??0)||b.elapsed-a.elapsed;}
export function rankingWeek(timestamp:number){const shifted=new Date(timestamp+8*3600000);const day=(shifted.getUTCDay()+6)%7;shifted.setUTCDate(shifted.getUTCDate()-day);shifted.setUTCHours(0,0,0,0);return shifted.toISOString().slice(0,10);}
