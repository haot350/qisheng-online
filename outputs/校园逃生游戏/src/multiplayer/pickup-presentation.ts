import type {DropState,PlayerState,RoomSnapshot,Vec3,GameEvent,WeaponId} from './shared/protocol';
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export function onlineGunPickup(room:RoomSnapshot,player:PlayerState,position:Vec3,visible:(from:Vec3,to:Vec3)=>boolean):DropState|undefined {
 if(player.life!=='alive'||room.phase!=='playing'||player.loading)return;
 const eye:Vec3=[position[0],position[1]+(player.crouched?1.04:1.62),position[2]],reachable=(point:Vec3,radius:number,standing=false)=>Math.abs(position[1]-point[1])<1.2&&distance(position,point)<=radius&&visible(standing?[position[0],position[1]+1.62,position[2]]:eye,[point[0],point[1]+.7,point[2]]);
 for(const task of room.tasks){if(task.status==='complete')continue;if(task.kind==='deliver'){if(!task.carrierId&&reachable(task.drop??task.positions[0],2.4,true)||task.carrierId===player.id&&reachable(task.positions[1],2.4,true))return;}else if(task.kind==='hold'){if(task.status==='pending'&&reachable(task.positions[0],2.4,true))return;}else if(task.positions.some((point,i)=>!task.visited.includes(String(i))&&reachable(point,2.4,true)))return;}
 if(room.extraction.available&&reachable(room.extraction.position,4.5,true))return;
 if(room.mode==='coop'&&room.players.some(other=>other.id!==player.id&&other.life==='downed'&&reachable(other.position,2.2)))return;
 if(room.supplies.some(supply=>!supply.usedBy.includes(player.id)&&reachable(supply.position,2.7)))return;
 return room.drops.filter(drop=>reachable(drop.position,2)).sort((a,b)=>distance(position,a.position)-distance(position,b.position))[0];
}
export function onlinePickupFeedback(event:GameEvent,playerId:string,weaponName:(weapon:WeaponId)=>string):string|null {
 if(event.type!=='pickup'||event.actorId!==playerId)return null;
 const data=event.data??{};if(typeof data.supply==='string')return '补给已领取';
 const weapon=data.weapon as WeaponId;if(!weapon)return null;const label=weaponName(weapon);return data.action==='ammo'?label+'弹药已补充':data.action==='replace'?'已换上'+label:label+'已拾取';
}
