export type EscapeVec3=[number,number,number];
export type EscapeDifficulty='easy'|'standard'|'hard';
export type EscapeTaskKind='take'|'activate'|'hold'|'deliver';
export type EscapeRegion='teaching'|'sports'|'canteen'|'dorm'|'library'|string;
export interface EscapeSite {id:string;label:string;region:EscapeRegion;position:EscapeVec3;floor?:0|1|2;roles?:EscapeTaskKind[];}
export interface EscapeTask {id:string;kind:EscapeTaskKind;label:string;sites:EscapeSite[];duration:number;radius:number;}
export interface EscapeRouteValidation {complete:boolean;length:number;points?:EscapeVec3[];reason?:string;}
export interface EscapePlan {seed:number;difficulty:EscapeDifficulty;tasks:EscapeTask[];spawn:EscapeVec3;extraction:EscapeSite;budgetSeconds:number;worstRouteMeters:number;fallback:boolean;}
export interface EscapePlanOptions {seed:number;difficulty:EscapeDifficulty;sites:EscapeSite[];spawn:EscapeVec3;extraction:EscapeSite;validateSite:(site:EscapeSite)=>boolean;validateRoute:(from:EscapeVec3,to:EscapeVec3)=>EscapeRouteValidation;fallbackTasks?:EscapeTask[];attempts?:number;}
export type EscapeTaskStatus='pending'|'active'|'complete';
export interface EscapeTaskState {task:EscapeTask;status:EscapeTaskStatus;progress:number;visited:string[];carrying:boolean;blocked:'outside'|'contested'|null;}
export type EscapePhase='active'|'extraction'|'won'|'failed';
export type EscapeEvent=
 |{type:'task-completed';taskId:string;kind:EscapeTaskKind}
 |{type:'ammo-reward';taskId:string;magazines:number;shotgunShells:number}
 |{type:'investigation';position:EscapeVec3;taskId:string}
 |{type:'task-started';taskId:string;kind:EscapeTaskKind}
 |{type:'reinforcements';count:2}
 |{type:'extraction-available'}
 |{type:'extraction-started'}
 |{type:'extraction-interrupted';reason:'outside'|'contested'}
 |{type:'won';result:EscapeResult}
 |{type:'failed';reason:'time'|'health';result:EscapeResult};
export interface EscapeRoundFrame {position:EscapeVec3;interactPressed?:boolean;canInteract?:(site:EscapeSite)=>boolean;contested?:boolean|((task:EscapeTask)=>boolean);extractionClear?:boolean;paused?:boolean;blocked?:boolean;}
export interface EscapeStats {damage:number;headshots:number;downs:number;uniqueDowns:number;completed:number;elapsed:number;}
export interface EscapeResult {won:boolean;score:number;rating:'S'|'A'|'B'|'C'|null;grade:'S'|'A'|'B'|'C'|null;remaining:number;stats:EscapeStats;advice:string;breakdown:{tasks:number;extraction:number;time:number;downs:number;headshots:number;health:number};}
export interface EscapeSnapshot {interactionAvailable?:boolean;phase:EscapePhase;difficulty:EscapeDifficulty;elapsed:number;remaining:number;graceLeft:number;completed:number;activeNPCs:4|6;time:number;missionComplete:number;reinforcement:boolean;tasks:EscapeTaskSnapshot[];extractionPosition:EscapeVec3|null;extractionAvailable:boolean;extractionProgress:number;extractionBlockReason:'outside'|'contested'|null;extractionDuration:number;result:EscapeResult|null;}
export interface EscapeMovementInput {sprintHeld:boolean;slidePressed?:boolean;moving:boolean;speed:number;grounded:boolean;routeSafe:boolean;onStairs?:boolean;aiming?:boolean;direction?:[number,number];paused?:boolean;blocked?:boolean;}
export interface EscapeMovementOutput {speed:number;stamina:number;sprinting:boolean;sliding:boolean;slideLeft:number;slideCooldown:number;slideDirection:[number,number]|null;canAim:boolean;hipSpread:number;forcedLow:boolean;slideStarted:boolean;slideEnded:boolean;}
export interface EscapeTaskSnapshot extends EscapeTaskState {id:string;type:EscapeTaskKind;kind:EscapeTaskKind;name:string;state:EscapeTaskStatus;positions:EscapeVec3[];floors:number[];selected:boolean;blockReason:'outside'|'contested'|null;currentAction:string;}