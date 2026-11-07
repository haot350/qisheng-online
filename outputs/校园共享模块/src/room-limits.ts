export type RoomLimitMode='coop'|'pvp';

/** Frozen with the release after the 12-player capacity gate. Defaults stay at eight. */
export const PVP_ROOM_PLAYER_LIMIT:8|12=8;
export const COOP_ROOM_PLAYER_LIMIT=4;
export const DEFAULT_PVP_ROOM_PLAYERS=8;
export const CLUSTER_PLAYER_LIMIT=24;
export const ROOM_PLAYER_LIMITS=Object.freeze({
 coop:COOP_ROOM_PLAYER_LIMIT,
 pvp:PVP_ROOM_PLAYER_LIMIT,
 defaultPvp:DEFAULT_PVP_ROOM_PLAYERS,
 cluster:CLUSTER_PLAYER_LIMIT,
});

export function defaultRoomPlayers(mode:RoomLimitMode){
 return mode==='coop'?COOP_ROOM_PLAYER_LIMIT:DEFAULT_PVP_ROOM_PLAYERS;
}

export function roomPlayerLimit(mode:RoomLimitMode){
 return mode==='coop'?COOP_ROOM_PLAYER_LIMIT:PVP_ROOM_PLAYER_LIMIT;
}

export function clampRoomPlayers(mode:RoomLimitMode,value:unknown){
 const requested=Number(value),fallback=defaultRoomPlayers(mode);
 const count=Number.isFinite(requested)&&requested!==0?Math.floor(requested):fallback;
 return Math.max(2,Math.min(roomPlayerLimit(mode),count));
}

export function roomPlayerChoices(mode:RoomLimitMode){
 return Array.from({length:roomPlayerLimit(mode)-1},(_,index)=>index+2);
}
