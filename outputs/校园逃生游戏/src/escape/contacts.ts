import type {EscapeVec3} from './types.ts';
export interface EscapeContact {id:number;kind:'seen'|'heard';position:EscapeVec3;remaining:number;}
export const CONTACT_RULES=Object.freeze({duration:3,hearingDistance:38,hearingSectors:12,distanceBands:8});
/** Player evidence only: no hidden NPC positions are read while a cue is displayed. */
export class EscapeContacts {
 private contacts=new Map<number,EscapeContact&{until:number}>();
 reset(){this.contacts.clear();}
 remove(id:number){this.contacts.delete(id);}
 seen(id:number,position:EscapeVec3,time:number){this.contacts.set(id,{id,kind:'seen',position:[...position],remaining:CONTACT_RULES.duration,until:time+CONTACT_RULES.duration});}
 heard(id:number,source:EscapeVec3,listener:EscapeVec3,time:number,clear:boolean){const distance=Math.hypot(source[0]-listener[0],source[1]-listener[1],source[2]-listener[2]);if(!clear||distance>CONTACT_RULES.hearingDistance)return false;const previous=this.contacts.get(id);if(previous?.kind==='seen'&&previous.until>time)return true;const step=Math.PI*2/CONTACT_RULES.hearingSectors,angle=Math.round(Math.atan2(source[0]-listener[0],source[2]-listener[2])/step)*step,band=Math.max(CONTACT_RULES.distanceBands,Math.round(distance/CONTACT_RULES.distanceBands)*CONTACT_RULES.distanceBands);this.contacts.set(id,{id,kind:'heard',position:[listener[0]+Math.sin(angle)*band,listener[1],listener[2]+Math.cos(angle)*band],remaining:CONTACT_RULES.duration,until:time+CONTACT_RULES.duration});return true;}
 read(time:number){for(const [id,c]of this.contacts)if(c.until<=time)this.contacts.delete(id);return [...this.contacts.values()].map(c=>({id:c.id,kind:c.kind,position:[...c.position] as EscapeVec3,remaining:Math.max(0,c.until-time)}));}
}
