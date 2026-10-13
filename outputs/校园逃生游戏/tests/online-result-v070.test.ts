import test from 'node:test';
import assert from 'node:assert/strict';
import {onlineResultStats} from '../src/multiplayer/hud-state.ts';

test('cooperative result shows actual NPC downs rather than PvP kills',()=>{
 const stats=onlineResultStats('coop',{kills:0,downs:6,deaths:0,assists:1,headshots:1});
 assert.deepEqual(stats,[{label:'击倒',value:6},{label:'次倒下',value:0},{label:'助攻',value:1}]);
});
test('PvP result continues to show actual player kills rather than unrelated downs',()=>{
 assert.equal(onlineResultStats('pvp',{kills:8,downs:2,deaths:3,assists:0})[0].value,8);
 assert.equal(onlineResultStats('pvp',{kills:0,downs:6})[0].value,0);
});
test('old or invalid result counts stay unrecorded and never become synthetic zero',()=>{
 for(const mode of ['coop','pvp'] as const){
  assert.deepEqual(onlineResultStats(mode,{}),[{label:'击倒',value:null},{label:'次倒下',value:null},{label:'助攻',value:null}]);
  assert.equal(onlineResultStats(mode,{kills:NaN,downs:-1,deaths:Infinity,assists:1.5})[0].value,null);
 }
 assert.equal(onlineResultStats('coop',{kills:5})[0].value,null);
 assert.deepEqual(onlineResultStats('coop',{headshots:2})[2],{label:'爆头',value:2});
});
