import test from 'node:test';
import assert from 'node:assert/strict';
import {CardsPursuit,GADGET_RULES,newGadgetInventory,canCollectGadget,collectGadget,helmetDamage,grenadeDamage,useCards,confiscatedHealth,cycleGadget} from '../dist/gadgets.js';

test('helmet only absorbs real head bullets and spends the exact absorbed durability',()=>{
 assert.deepEqual(helmetDamage(100,true,50),{damage:60,durability:10,absorbed:40});
 assert.deepEqual(helmetDamage(100,true,10),{damage:90,durability:0,absorbed:10});
 assert.deepEqual(helmetDamage(80,false,50),{damage:80,durability:50,absorbed:0});
});
test('inventory caps preserve pickups and full helmets cannot be consumed',()=>{
 const state=newGadgetInventory();assert.equal(collectGadget(state,'helmet'),true);assert.equal(collectGadget(state,'helmet'),false);
 state.helmetDurability=49;assert.equal(collectGadget(state,'helmet'),true);
 for(let i=0;i<2;i++)assert.equal(collectGadget(state,'grenade'),true);assert.equal(canCollectGadget(state,'grenade'),false);assert.equal(collectGadget(state,'grenade'),false);assert.equal(state.grenades,2);
 assert.equal(collectGadget(state,'cards'),true);assert.equal(collectGadget(state,'cards'),false);
});
test('cards last exactly 30 simulated seconds and cannot stack or refill',()=>{
 const state=newGadgetInventory();state.cards=1;assert.equal(useCards(state,10),true);assert.equal(state.cardsUntil,40);assert.equal(state.cardsUse,1);assert.equal(state.cards,0);
 state.cards=1;assert.equal(useCards(state,20),false);assert.equal(state.cards,1);assert.equal(useCards(state,40),true);assert.equal(state.cardsUntil,70);
 assert.equal(confiscatedHealth(100),50);assert.equal(confiscatedHealth(1),1);assert.equal(confiscatedHealth(5),2.5);
});
test('grenade radial falloff never goes through a wall or extends past five meters',()=>{
 assert.equal(grenadeDamage(0,true),80);assert.equal(grenadeDamage(2.5,true),40);assert.equal(grenadeDamage(5,true),0);assert.equal(grenadeDamage(1,false),0);assert.equal(grenadeDamage(NaN,true),0);
});
const frame=(extra={})=>({now:10,targetId:'p',use:1,generation:2,alive:true,npcActive:true,distance:1.5,reachable:true,...extra});
test('Meng captures one fixed clue and needs uninterrupted reachable windup',()=>{
 const pursuit=new CardsPursuit(),position=[1,0,2];pursuit.begin('p',1,2,position,40);position[0]=99;assert.deepEqual(pursuit.clue,[1,0,2]);
 assert.equal(pursuit.update(.6,frame()),false);assert.equal(pursuit.update(.6,frame({reachable:false})),false);assert.equal(pursuit.windup,0);
 assert.equal(pursuit.update(.6,frame()),false);pursuit.interrupt();assert.equal(pursuit.update(.6,frame()),false);assert.equal(pursuit.windup,0);
 assert.equal(pursuit.update(.6,frame()),false);assert.equal(pursuit.update(.4,frame()),true);assert.equal(pursuit.targetId,null);assert.equal(pursuit.update(2,frame()),false);
});
test('death, new generation and expiry cancel late confiscation; downed Meng cannot advance it',()=>{
 for(const change of [{alive:false},{generation:3},{use:2},{now:40}]){const p=new CardsPursuit();p.begin('p',1,2,[0,0,0],40);assert.equal(p.update(2,frame(change)),false);assert.equal(p.targetId,null);}
 const p=new CardsPursuit();p.begin('p',1,2,[0,0,0],40);p.update(.8,frame());p.update(2,frame({npcActive:false}));assert.equal(p.windup,0);assert.equal(p.update(.3,frame()),false);
});
test('PvP selection never includes cards while cooperative rotation preserves smoke default',()=>{
 assert.equal(newGadgetInventory().selectedGadget,'smoke');assert.equal(cycleGadget('smoke',false),'grenade');assert.equal(cycleGadget('grenade',false),'smoke');assert.equal(cycleGadget('grenade',true),'cards');assert.equal(GADGET_RULES.grenadeFuse,3);
});
