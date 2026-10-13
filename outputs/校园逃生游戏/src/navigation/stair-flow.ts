export type StairParticipant={id:number;key:string;direction:1|-1};
type Reservation={direction:1|-1;members:Set<number>;age:number};
/** Opposing stair traffic clears in batches. Waiting actors walk back to their
 * own landing; the world supplies a supported holding point outside the flight. */
export class StairFlow{
 private reservations=new Map<string,Reservation>();private waiting=new Map<number,StairParticipant>();
 update(participants:StairParticipant[]){
  for(const [key,reservation] of this.reservations){
   const player=participants.find(p=>p.key===key&&p.id===-1);
   if(player&&player.direction!==reservation.direction){reservation.direction=player.direction;reservation.members=new Set(participants.filter(p=>p.key===key&&p.direction===player.direction).map(p=>p.id));reservation.age=0;for(const [id,p]of this.waiting)if(p.key===key)this.waiting.delete(id);}

   const active=participants.filter(p=>p.key===key);
   if(!active.some(p=>reservation.members.has(p.id))){this.reservations.delete(key);for(const [id,p] of this.waiting)if(p.key===key)this.waiting.delete(id);continue;}
   for(const p of active){if(p.direction===reservation.direction&&reservation.age<.25)reservation.members.add(p.id);if(!reservation.members.has(p.id))this.waiting.set(p.id,p);}
  }
  for(const key of new Set(participants.map(p=>p.key))){
   if(this.reservations.has(key))continue;const group=participants.filter(p=>p.key===key).sort((a,b)=>a.id-b.id);
   if(!group.some(p=>p.direction!==group[0].direction))continue;
   const direction=group[0].direction,members=new Set(group.filter(p=>p.direction===direction).map(p=>p.id));this.reservations.set(key,{direction,members,age:0});for(const p of group)if(!members.has(p.id))this.waiting.set(p.id,p);
  }
 }
 yieldFor(id:number){return this.waiting.get(id);}
 tick(dt:number){for(const r of this.reservations.values())r.age+=dt;}
 remove(id:number){this.waiting.delete(id);for(const r of this.reservations.values())r.members.delete(id);}
 reset(){this.waiting.clear();this.reservations.clear();}
}
