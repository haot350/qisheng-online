import test from 'node:test';
import assert from 'node:assert/strict';
import {ASSISTANT_KNOWLEDGE,validateAssistantActions,validateAssistantMenuContext,assistantActionNeedsConfirmation} from '../dist/assistant.js';

test('menu tools accept only explicit safe capabilities and confirm room mutations',()=>{
 const actions=validateAssistantActions([{type:'select_mode',mode:'escape'},{type:'select_difficulty',difficulty:'normal'},{type:'select_weapon',weapon:'m4a1'},{type:'create_room',mode:'coop',difficulty:'normal',maxPlayers:4,private:true}]);
 assert.equal(actions.length,4);assert.equal(assistantActionNeedsConfirmation(actions[0]),false);assert.equal(assistantActionNeedsConfirmation(actions[3]),true);
 assert.deepEqual(validateAssistantActions([{type:'join_room',code:'ab12cd'}]),[{type:'join_room',code:'AB12CD'}]);
 for(const action of [{type:'start'},{type:'fire'},{type:'navigate',page:'admin'},{type:'setting',setting:'password',value:'secret'},{type:'setting',setting:'music',value:99},{type:'setting',setting:'quality',value:true},{type:'navigate',page:'home',script:'alert(1)'},{type:'join_room',code:'https://x.invalid'},{type:'create_room',mode:'coop',difficulty:'normal',maxPlayers:8,private:true}])assert.throws(()=>validateAssistantActions([action]));
 assert.throws(()=>validateAssistantActions(Array(5).fill({type:'navigate',page:'help'})));
});
test('context is bounded and player knowledge uses the canonical gadget values',()=>{
 assert.deepEqual(validateAssistantMenuContext({token:'menu-000001',inBattle:false,page:'assistant'}),{token:'menu-000001',inBattle:false,page:'assistant'});
 assert.throws(()=>validateAssistantMenuContext({token:'menu-000001',inBattle:false,page:'assistant',password:'not-allowed'}));
 assert.throws(()=>validateAssistantMenuContext({token:'short',inBattle:false,page:'assistant'}));
 const gadget=ASSISTANT_KNOWLEDGE.find(x=>x.id==='gadgets');assert.match(gadget.text,/30秒/);assert.match(gadget.text,/40%/);assert.match(gadget.text,/孟庆升/);
 assert.ok(ASSISTANT_KNOWLEDGE.length>=12);
});

test('navigation is terminal so a deferred page change cannot override later preparation',()=>{
 const selected={type:'select_mode',mode:'escape'},navigate={type:'navigate',page:'modes'};
 assert.deepEqual(validateAssistantActions([selected,navigate]),[selected,navigate]);
 assert.deepEqual(validateAssistantActions([navigate]),[navigate]);
 assert.throws(()=>validateAssistantActions([navigate,selected]),/ASSISTANT_ACTION/);
 assert.throws(()=>validateAssistantActions([navigate,navigate]),/ASSISTANT_ACTION/);
});
