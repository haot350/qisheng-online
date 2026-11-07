import test from 'node:test';
import assert from 'node:assert/strict';
import {PVP_ROOM_PLAYER_LIMIT,COOP_ROOM_PLAYER_LIMIT,DEFAULT_PVP_ROOM_PLAYERS,CLUSTER_PLAYER_LIMIT,clampRoomPlayers,roomPlayerChoices} from '../dist/room-limits.js';

test('release room sizes keep cooperative and cluster rules while retaining the old PvP default',()=>{
 assert.equal(COOP_ROOM_PLAYER_LIMIT,4);assert.equal(DEFAULT_PVP_ROOM_PLAYERS,8);assert.equal(CLUSTER_PLAYER_LIMIT,24);
 assert.ok([8,12].includes(PVP_ROOM_PLAYER_LIMIT));
 assert.equal(clampRoomPlayers('coop',undefined),4);assert.equal(clampRoomPlayers('pvp',undefined),8);
 assert.equal(clampRoomPlayers('coop',12),4);assert.equal(clampRoomPlayers('pvp',8),8);
 assert.equal(clampRoomPlayers('pvp',12),PVP_ROOM_PLAYER_LIMIT);
 assert.equal(clampRoomPlayers('pvp',100),PVP_ROOM_PLAYER_LIMIT);
 assert.equal(clampRoomPlayers('pvp',-1),2);assert.equal(clampRoomPlayers('pvp',5.8),5);
 for(const value of [0,null,NaN,Infinity,{}])assert.equal(clampRoomPlayers('pvp',value),8);
 assert.deepEqual(roomPlayerChoices('coop'),[2,3,4]);
 assert.equal(roomPlayerChoices('pvp').at(-1),PVP_ROOM_PLAYER_LIMIT);
});
