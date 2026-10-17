import type {Vec3} from './types.ts';

/** Pure inventory/damage rules; neither renderer nor transport is a dependency. */
export const GADGET_RULES=Object.freeze({helmetDurability:50,helmetAbsorption:.4,grenadeCapacity:2,grenadeFuse:3,grenadeRadius:5,grenadeDamage:80,cardsCapacity:1,cardsDuration:30,confiscateRange:2,confiscateWindup:1,pvpRespawn:60});
export type GadgetId='smoke'|'grenade'|'cards';
export type LootGadgetId='helmet'|'grenade'|'cards';
export interface GadgetInventory {helmetDurability:number;grenades:number;cards:number;cardsUntil:number;selectedGadget:GadgetId;cardsUse:number;}
export interface GadgetLoot {id:string;kind:LootGadgetId;position:Vec3;usedBy:string[];availableAt:number;}
export interface GrenadeState {id:string;ownerId:string;position:Vec3;velocity:Vec3;left:number;}
export interface GadgetView extends GadgetInventory {cardsLeft:number;confiscating:boolean;canUseCards?:boolean;loot:GadgetLoot[];projectiles:GrenadeState[];}
export const GADGET_LABELS:Readonly<Record<GadgetId|string,string>>={smoke:'烟雾',grenade:'手榴弹',cards:'扑克牌',helmet:'头盔'};
export function newGadgetInventory():GadgetInventory{return {helmetDurability:0,grenades:0,cards:0,cardsUntil:0,selectedGadget:'smoke',cardsUse:0};}
export function gadgetCount(inventory:GadgetInventory,id:GadgetId,smokes:number){return id==='smoke'?smokes:id==='grenade'?inventory.grenades:inventory.cards;}
export function cycleGadget(current:GadgetId,cooperative:boolean):GadgetId {const ids:GadgetId[]=cooperative?['smoke','grenade','cards']:['smoke','grenade'];return ids[(ids.indexOf(current)+1)%ids.length];}
export function canCollectGadget(inventory:GadgetInventory,kind:LootGadgetId){return kind==='helmet'?inventory.helmetDurability<GADGET_RULES.helmetDurability:kind==='grenade'?inventory.grenades<GADGET_RULES.grenadeCapacity:inventory.cards<GADGET_RULES.cardsCapacity;}
export function collectGadget(inventory:GadgetInventory,kind:LootGadgetId){if(!canCollectGadget(inventory,kind))return false;if(kind==='helmet')inventory.helmetDurability=GADGET_RULES.helmetDurability;else if(kind==='grenade')inventory.grenades++;else inventory.cards++;return true;}
export function helmetDamage(amount:number,headshot:boolean,durability:number){const incoming=Math.max(0,Number.isFinite(amount)?amount:0),absorbed=headshot?Math.min(Math.max(0,durability),incoming*GADGET_RULES.helmetAbsorption):0;return {damage:incoming-absorbed,durability:Math.max(0,durability-absorbed),absorbed};}
export function grenadeDamage(distance:number,visible:boolean){return visible&&Number.isFinite(distance)&&distance>=0&&distance<GADGET_RULES.grenadeRadius?GADGET_RULES.grenadeDamage*(1-distance/GADGET_RULES.grenadeRadius):0;}
export function useCards(inventory:GadgetInventory,now:number){if(inventory.cards<1||inventory.cardsUntil>now)return false;inventory.cards--;inventory.cardsUntil=now+GADGET_RULES.cardsDuration;inventory.cardsUse++;return true;}
export function confiscatedHealth(current:number){return Math.max(1,current*.5);}

/** A clue is captured once; losing the player never turns it into wall tracking. */
export class CardsPursuit {
 targetId:string|null=null;use=0;generation=0;clue:Vec3|null=null;until=0;windup=0;interrupted=false;
 begin(targetId:string,use:number,generation:number,position:Vec3,until:number){this.targetId=targetId;this.use=use;this.generation=generation;this.clue=[...position];this.until=until;this.windup=0;this.interrupted=false;}
 clear(){this.targetId=null;this.clue=null;this.windup=0;this.until=0;}
 interrupt(){this.windup=0;this.interrupted=true;}
 update(dt:number,frame:{now:number;targetId:string;use:number;generation:number;alive:boolean;npcActive:boolean;distance:number;reachable:boolean}){
  if(!this.targetId)return false;
  if(frame.targetId!==this.targetId||frame.use!==this.use||frame.generation!==this.generation||!frame.alive||frame.now>=this.until){this.clear();return false;}
  if(!frame.npcActive){this.windup=0;return false;}
  if(this.interrupted){this.interrupted=false;this.windup=0;return false;}
  if(frame.distance>GADGET_RULES.confiscateRange||!frame.reachable){this.windup=0;return false;}
  this.windup+=Math.max(0,dt);if(this.windup+1e-8<GADGET_RULES.confiscateWindup)return false;this.clear();return true;
 }
}
