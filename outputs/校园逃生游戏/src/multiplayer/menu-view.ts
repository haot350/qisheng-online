import type {LobbyView,RoomSnapshot} from './shared/protocol';
import {roomRoster} from './shared/wire';

/** Menu subscriptions deliberately omit transforms, combat timers and private
 * receipts. The renderer still receives every authoritative snapshot. */
export function sameMenuView(previous:LobbyView,next:LobbyView):boolean {
 if(previous.status!==next.status||previous.error!==next.error||previous.errorCode!==next.errorCode||previous.queuePosition!==next.queuePosition||previous.reconnectLeft!==next.reconnectLeft||previous.rooms!==next.rooms)return false;
 const a=previous.currentRoom,b=next.currentRoom;if(a===b)return true;if(!a||!b)return false;
 if(a.phase!=='playing'&&a.phase!=='paused'||b.phase!=='playing'&&b.phase!=='paused')return false;
 const fields=['roomId','hostId','mode','variant','difficulty','phase','maxPlayers','occupancy','startedPlayers','maintenance','pauseUses','result'] as const;
 for(const field of fields)if(a[field]!==b[field])return false;
 if(Math.ceil(a.pauseLeft)!==Math.ceil(b.pauseLeft)||Math.ceil(a.countdown)!==Math.ceil(b.countdown)||!sameVote(a.pauseVote,b.pauseVote))return false;
 const membersA=roomRoster(a),membersB=roomRoster(b);if(membersA.length!==membersB.length)return false;
 const fieldsMember=['id','nickname','shortId','avatar','team','ready','rankConsent','connected','departed','weapon','primaryWeapon'] as const;
 for(let i=0;i<membersA.length;i++)for(const field of fieldsMember)if(membersA[i][field]!==membersB[i][field])return false;
 return true;
}
function sameVote(a:RoomSnapshot['pauseVote'],b:RoomSnapshot['pauseVote']) {
 if(a===b)return true;if(!a||!b||a.requestedBy!==b.requestedBy||a.uses!==b.uses||Math.ceil(a.left)!==Math.ceil(b.left))return false;
 return sameIds(a.yes,b.yes)&&sameIds(a.eligible,b.eligible);
}
function sameIds(a:string[],b:string[]){return a.length===b.length&&a.every((id,index)=>id===b[index]);}
