import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DAFEI_DIALOGUE,DAFEI_COMMENTS,DialoguePlayback} from '../src/dafei-dialogue.ts';
import {DrivingChallenge} from '../src/driving-challenge.ts';
import {DAFEI_BEST_KEY,LEGACY_DAFEI_BEST_KEY} from '../src/ranking/shared.ts';

test('dialogue reveals a character per forty visible milliseconds and preserves fractional progress through suspension',()=>{
  const player=new DialoguePlayback(['齐盛，我回来了。']);
  player.tick(39);assert.equal(player.snapshot.text,'');
  player.tick(10_000,true);assert.equal(player.snapshot.text,'');
  player.tick(1);assert.equal(player.snapshot.text,'齐');
  player.tick(80);assert.equal(player.snapshot.text,'齐盛，');
  player.tick(Infinity);player.tick(-1);assert.equal(player.snapshot.text,'齐盛，');
});

test('each first click fills the current line and the next moves forward; skip never begins simulation',()=>{
  const player=new DialoguePlayback();
  for(let line=0;line<DAFEI_DIALOGUE.length;line++){
    assert.equal(player.snapshot.line,line);assert.equal(player.snapshot.complete,false);
    assert.equal(player.advance(),'complete');assert.equal(player.snapshot.text,DAFEI_DIALOGUE[line]);
    assert.equal(player.advance(),line===DAFEI_DIALOGUE.length-1?'ended':'next');
  }
  assert.equal(player.snapshot.ended,true);assert.equal(player.advance(),'ended');
  const skipped=new DialoguePlayback();skipped.tick(80);skipped.skip();assert.equal(skipped.snapshot.ended,true);assert.equal(skipped.snapshot.text,DAFEI_DIALOGUE.at(-1));
});

test('a natural typing finish still requires one deliberate advance; text is character safe',()=>{
  const player=new DialoguePlayback(['好🙂。','走吧。']);player.tick(120);assert.equal(player.snapshot.text,'好🙂。');assert.equal(player.snapshot.complete,true);assert.equal(player.snapshot.ended,false);assert.equal(player.advance(),'next');assert.equal(player.snapshot.text,'');
});

test('guidance queues a combo, spaces comments by twenty seconds, caps four events and separates current and legacy best scores',()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');let saved='1200';
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>key===DAFEI_BEST_KEY?saved:key===LEGACY_DAFEI_BEST_KEY?'9000':null,setItem:(key:string,value:string)=>{assert.equal(key,DAFEI_BEST_KEY);saved=value;}}});
  try{
    const round=new DrivingChallenge([]),none={steer:0,throttle:0,brake:0,reverse:false,boost:false,reset:false};round.tick(3,none,0,[0,0,0]);assert.equal(round.bestScore,1200);assert.equal(round.legacyBestScore,9000);
    round.hit(0);assert.equal(round.guide,DAFEI_COMMENTS.first);round.hit(1);round.hit(2);
    round.tick(19.9,none,0,[0,0,0]);assert.equal(round.guide,'');round.tick(.1,none,0,[0,0,0]);assert.equal(round.guide,DAFEI_COMMENTS.combo);
    round.damage(500);round.tick(20,none,0,[0,0,0]);assert.equal(round.guide,DAFEI_COMMENTS.danger);
    round.tick(200,none,0,[0,0,0]);assert.equal(round.guide,DAFEI_COMMENTS.minute);
    round.tick(20,none,0,[0,0,0]);round.hit(3);round.tick(20,none,0,[0,0,0]);assert.equal(round.guide,'');
    round.score.score=1500;round.finish();assert.equal(saved,'1500');assert.equal(round.bestScore,1500);assert.equal(round.legacyBestScore,9000);
  }finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else Reflect.deleteProperty(globalThis,'localStorage');}
});
