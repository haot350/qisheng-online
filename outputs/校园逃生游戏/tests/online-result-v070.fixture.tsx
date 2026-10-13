import React from 'react';
import {createRoot} from 'react-dom/client';
import {OnlineResult} from '../src/multiplayer/MultiplayerUI';
import type {RoomSnapshot} from '../src/multiplayer/shared/protocol';
const query=new URLSearchParams(location.search),mode=query.get('mode')==='pvp'?'pvp':'coop';
const players=[{id:'a',nickname:'合作自然验收1',rank:1,won:true,kills:mode==='coop'?0:8,downs:6,deaths:0,assists:1,headshots:1},{id:'b',nickname:'合作自然验收0',rank:mode==='coop'?1:2,won:true,kills:mode==='coop'?0:4,downs:1,deaths:2,assists:4,headshots:0}];
if(query.has('missing'))players.push({id:'old',nickname:'旧记录',rank:3,won:false} as typeof players[number]);
const room={mode,variant:'tdm',phase:'ended',result:{mode,variant:'tdm',won:true,elapsed:154.28333333334825,players,team:mode==='coop'?{score:90.7,rating:'S',eligible:false,reason:'未选择合作排行'}:undefined}} as RoomSnapshot;
createRoot(document.getElementById('root')!).render(<OnlineResult room={room} playerId="b" onAction={()=>{}} onClose={()=>{}}/>);
