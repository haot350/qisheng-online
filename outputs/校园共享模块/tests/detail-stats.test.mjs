import test from 'node:test';
import assert from 'node:assert/strict';
import {combatDetailStats} from '../dist/community/detail-stats.js';

test('cooperative/legacy summaries do not invent missing statistics',()=>{
 assert.deepEqual(combatDetailStats({}),[]);
 assert.deepEqual(combatDetailStats({downs:3}),[{label:'击倒',value:'3'}]);
});
test('recorded zero is displayed and invalid values are not',()=>{
 assert.deepEqual(combatDetailStats({downs:0,headshots:0,damage:0}),[
  {label:'击倒',value:'0'},{label:'爆头',value:'0'},{label:'累计承伤',value:'0'},
 ]);
 assert.deepEqual(combatDetailStats({downs:NaN,headshots:-1,damage:Infinity}),[]);
});
