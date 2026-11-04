import {sameMap,type LobbyView,type RoomSnapshot,type RoomListing} from './shared/protocol';
import {roomRoster} from './shared/wire';

/** Menu subscriptions deliberately omit transforms, combat timers and private
 * receipts. The renderer still receives every authoritative snapshot. */
export function sameMenuView(previous:LobbyView,next:LobbyView):boolean {
 if(previous.status!==next.status||previous.error!==next.error||previous.errorCode!==next.errorCode||previous.queuePosition!==next.queuePosition||previous.reconnectLeft!==next.reconnectLeft||!sameRooms(previous.rooms,next.rooms))return false;
 const a=previous.currentRoom,b=next.currentRoom;if(a===b)return true;if(!a||!b)return false;
 const fields=['roomId','inviteCode','hostId','mode','variant','difficulty','phase','maxPlayers','occupancy','startedPlayers','maintenance','pauseUses','round','rematchAvailable','rematchStatus','protocolVersion'] as const;
 for(const field of fields)if(a[field]!==b[field])return false;
 if(a.map!==b.map&&(!a.map||!b.map||!sameMap(a.map,b.map)))return false;
 if(a.weather?.preset!==b.weather?.preset||a.weather?.seed!==b.weather?.seed||a.weather?.startedAtTick!==b.weather?.startedAtTick||!sameResult(a.result,b.result))return false;
 if(Math.ceil(a.pauseLeft)!==Math.ceil(b.pauseLeft)||Math.ceil(a.countdown)!==Math.ceil(b.countdown)||!sameVote(a.pauseVote,b.pauseVote))return false;
 const membersA=roomRoster(a),membersB=roomRoster(b);if(membersA.length!==membersB.length)return false;
 const fieldsMember=['id','nickname','shortId','avatar','team','ready','rankConsent','connected','departed','loading','life','weapon','primaryWeapon'] as const;
 for(let i=0;i<membersA.length;i++)for(const field of fieldsMember)if(membersA[i][field]!==membersB[i][field])return false;
 return true;
}
function sameRooms(a:RoomListing[],b:RoomListing[]){
 if(a===b)return true;if(a.length!==b.length)return false;
 const fields=['roomId','title','mode','variant','difficulty','players','maxPlayers','phase','private','ping','weather'] as const;
 return a.every((room,i)=>fields.every(key=>room[key]===b[i][key]));
}
function sameResult(a:RoomSnapshot['result'],b:RoomSnapshot['result']){
 if(a===b)return true;if(!a||!b)return false;
 if(a.resultId!==b.resultId||a.mode!==b.mode||a.variant!==b.variant||a.won!==b.won||a.elapsed!==b.elapsed||a.teamScores.blue!==b.teamScores.blue||a.teamScores.red!==b.teamScores.red||a.players.length!==b.players.length)return false;
 const fields=['id','nickname','kills','deaths','assists','downs','headshots','damage','rank','won'] as const;
 if(!a.players.every((player,i)=>fields.every(key=>player[key]===b.players[i][key])))return false;
 if(a.team===b.team)return true;if(!a.team||!b.team)return false;
 return a.team.score===b.team.score&&a.team.rating===b.team.rating&&a.team.tasks===b.team.tasks&&a.team.eligible===b.team.eligible&&a.team.reason===b.team.reason;
}
function sameVote(a:RoomSnapshot['pauseVote'],b:RoomSnapshot['pauseVote']) {
 if(a===b)return true;if(!a||!b||a.requestedBy!==b.requestedBy||a.uses!==b.uses||Math.ceil(a.left)!==Math.ceil(b.left))return false;
 return sameIds(a.yes,b.yes)&&sameIds(a.eligible,b.eligible);
}
function sameIds(a:string[],b:string[]){return a.length===b.length&&a.every((id,index)=>id===b[index]);}
