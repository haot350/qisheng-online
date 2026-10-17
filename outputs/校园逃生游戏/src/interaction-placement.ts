import * as THREE from 'three';
import type {NearbyInteraction} from './nearby-interaction';
import type {RoomSnapshot,Vec3} from './multiplayer/shared/protocol';
export function projectNearbyInteraction(position:readonly number[],camera:THREE.Camera):{x:number;y:number}|null {
 const p=new THREE.Vector3(position[0],position[1]+.55,position[2]),direction=p.clone().sub(camera.position);
 if(direction.dot(camera.getWorldDirection(new THREE.Vector3()))<=0)return null;
 const q=p.project(camera);if(!Number.isFinite(q.x)||!Number.isFinite(q.y))return null;
 return {x:THREE.MathUtils.clamp((q.x+1)/2,.23,.77),y:THREE.MathUtils.clamp((1-q.y)/2,.26,.63)};
}
/** Resolves only the owner's already authorized scene objects; no enemy positions. */
export function onlineInteractionPosition(room:RoomSnapshot,interaction:NearbyInteraction|null|undefined):Vec3|null {
 if(!interaction)return null;
 if(interaction.kind==='revive')return room.players.find(p=>p.id===interaction.id)?.position??null;
 if(interaction.kind==='weapon')return room.drops.find(d=>d.id===interaction.id)?.position??null;
 if(interaction.kind==='gadget')return room.gadgets?.find(g=>g.id===interaction.id)?.position??null;
 if(interaction.kind==='supply')return room.supplies.find(s=>s.id===interaction.id)?.position??null;
 if(interaction.action==='extract')return room.extraction.available?room.extraction.position:null;
 const task=room.tasks.find(t=>t.id===interaction.taskId);if(!task)return null;
 if(interaction.action==='carry'&&task.drop)return task.drop;
 const index=Number(interaction.siteId);return Number.isInteger(index)?task.positions[index]??null:null;
}
