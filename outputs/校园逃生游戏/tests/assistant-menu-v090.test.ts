import test from 'node:test';
import assert from 'node:assert/strict';
import {AssistantMenuExecution} from '../src/assistant-menu.ts';
import type {AssistantActionPlan,AssistantMenuContext} from '@qisheng/shared/assistant';

const base:AssistantActionPlan={id:'approved-plan-001',contextToken:'menu-context-001',actions:[{type:'select_mode',mode:'escape'},{type:'select_weapon',weapon:'m4a1'}]};
test('approved menu execution is ordered, cannot repeat and requires current context',async()=>{
 const executor=new AssistantMenuExecution(),seen:string[]=[],context:AssistantMenuContext={token:base.contextToken,inBattle:false,page:'assistant'},runtime={context:()=>context,identity:()=> 'player-one',execute:async(a:any)=>{seen.push(a.type);return a.type;}};
 assert.deepEqual(await executor.run(base,runtime),['select_mode','select_weapon']);assert.deepEqual(seen,['select_mode','select_weapon']);
 await assert.rejects(executor.run(base,runtime),/已经处理/);
 await assert.rejects(executor.run({...base,id:'different-context',contextToken:'menu-context-002'},runtime),/页面已变化/);
 context.inBattle=true;await assert.rejects(executor.run({...base,id:'in-battle'},runtime),/页面已变化/);
});
test('room confirmation and identity or cancellation stop later actions',async()=>{
 const executor=new AssistantMenuExecution(),context:AssistantMenuContext={token:base.contextToken,inBattle:false,page:'assistant'};let identity='one',calls=0;
 const runtime={context:()=>context,identity:()=>identity,execute:async()=>{calls++;identity='two';return 'done';}};
 await assert.rejects(executor.run({...base,id:'identity-change'},runtime),/取消/);assert.equal(calls,1);
 const room:AssistantActionPlan={...base,id:'room-confirm-001',actions:[{type:'create_room',mode:'tdm',difficulty:'normal',maxPlayers:8,private:false}]};
 await assert.rejects(executor.run(room,runtime),/先确认/);assert.equal(calls,1);
 identity='one';await assert.rejects(executor.run({...base,id:'cancel-operation'}, {...runtime,execute:async()=>{calls++;executor.cancel();return 'done';}}),/取消/);assert.equal(calls,2);
});
