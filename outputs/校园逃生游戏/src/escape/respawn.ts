import {ESCAPE_RULES} from './config.ts';
import {escapeShuffle} from './random.ts';
import type {EscapeRouteValidation,EscapeSite,EscapeVec3} from './types.ts';
export interface EscapeRespawnOptions {candidates:EscapeSite[];player:EscapeVec3;lastSiteId?:string;protectedPoints?:EscapeVec3[];isVisible:(point:EscapeVec3)=>boolean;validateSite:(site:EscapeSite)=>boolean;validateRoute:(from:EscapeVec3,to:EscapeVec3)=>EscapeRouteValidation;random?:()=>number;}
const flatDistance=(a:EscapeVec3,b:EscapeVec3)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
/** No candidate weakens distance, offscreen, protected-area or reachability conditions. */
export function selectEscapeRespawn(options:EscapeRespawnOptions):EscapeSite|null {
 for(const site of escapeShuffle(options.candidates,options.random??Math.random)){if(site.id===options.lastSiteId||flatDistance(site.position,options.player)<ESCAPE_RULES.respawnDistance||options.isVisible(site.position)||(options.protectedPoints??[]).some(p=>flatDistance(site.position,p)<ESCAPE_RULES.respawnProtectedRadius)||!options.validateSite(site))continue;const outward=options.validateRoute(site.position,options.player),back=options.validateRoute(options.player,site.position);if(outward.complete&&back.complete&&Number.isFinite(outward.length)&&Number.isFinite(back.length))return site;}return null;
}
export class EscapeRespawnWait {
 private left=0;
 reset(){this.left=0;}
 update(dt:number,find:()=>EscapeSite|null,options:{paused?:boolean;blocked?:boolean}={}){if(options.paused||options.blocked)return null;if(!Number.isFinite(dt)||dt<0)throw new RangeError('再入场时间步长必须是有限非负数。');this.left=Math.max(0,this.left-dt);if(this.left>0)return null;const found=find();if(!found)this.left=ESCAPE_RULES.respawnRetry;return found;}
}