type LobbyStateInput={status:string;errorCode?:string;currentRoom:{players:readonly {id:string;departed?:boolean}[]}|null};
export type LobbyUIPhase='browse'|'room'|'connecting'|'queued'|'reconnecting'|'checking'|'leaving'|'awaiting-seat'|'admission-error'|'reconnect-error'|'reconnect-expired'|'map-error'|'identity-error';
const MAP_ERRORS=new Set(['MAP_VERSION','MAP_MISMATCH','MAP_OR_PROTOCOL_MISMATCH']);
const IDENTITY_ERRORS=new Set(['AUTH','AUTH_REQUIRED','ACCOUNT_AUTH','ACCOUNT_REQUIRED','ACCOUNT_UPGRADE','ACCOUNT_DISABLED','IDENTITY_CHANGED','IDENTITY_REQUIRED']);

export function lobbyUIState(view:LobbyStateInput,playerId:string|null){
 const code=view.errorCode??'',ownSeat=!!playerId&&!!view.currentRoom?.players.some(player=>player.id===playerId&&!player.departed);
 let phase:LobbyUIPhase;
 if(code==='LEAVING')phase='leaving';
 else if(code==='ADMISSION_CHECKING'||view.status==='reconnecting'&&code==='ADMISSION_UNCERTAIN')phase='checking';
 else if(view.status==='connecting')phase='connecting';
 else if(view.status==='queued')phase='queued';
 else if(view.status==='reconnecting')phase='reconnecting';
 else if(code==='ADMISSION_UNCERTAIN')phase='admission-error';
 else if(code==='RECONNECT_RETRY')phase='reconnect-error';
 else if(code==='RECONNECT_EXPIRED')phase='reconnect-expired';
 else if(MAP_ERRORS.has(code))phase='map-error';
 else if(IDENTITY_ERRORS.has(code))phase='identity-error';
 else if(view.currentRoom&&!ownSeat||ownSeat&&!['lobby','playing'].includes(view.status))phase='awaiting-seat';
 else phase=ownSeat?'room':'browse';
 const pending=['connecting','queued','reconnecting','checking','leaving','awaiting-seat'].includes(phase);
 return {phase,pending,canCancel:pending&&phase!=='leaving',showRoom:phase==='room',showBrowser:phase==='browse'||phase==='reconnect-expired'};
}
