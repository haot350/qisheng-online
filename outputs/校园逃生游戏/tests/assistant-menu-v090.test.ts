import test from 'node:test';
import assert from 'node:assert/strict';
import {AssistantMenuExecution,type AssistantMenuProgress,type AssistantMenuRuntime} from '../src/assistant-menu.ts';
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

test('progress follows actual ordered execution and reports returned results only after completion',async()=>{
 const executor=new AssistantMenuExecution(),progress:AssistantMenuProgress[]=[],calls:string[]=[],context:AssistantMenuContext={token:base.contextToken,inBattle:false,page:'assistant'};
 const first=Promise.withResolvers<string>();
 const runtime:AssistantMenuRuntime={context:()=>context,identity:()=> 'player-one',onProgress:event=>progress.push({...event}),execute:async action=>{
  calls.push(action.type);
  assert.equal(progress.at(-1)?.phase,'running');
  return action.type==='select_mode'?first.promise:'已装备 M4A1';
 }};
 const pending=executor.run({...base,id:'ordered-progress'},runtime);
 assert.deepEqual(calls,['select_mode']);
 assert.deepEqual(progress,[{index:0,total:2,phase:'running'}]);
 first.resolve('已选择校园突围');
 assert.deepEqual(await pending,['已选择校园突围','已装备 M4A1']);
 assert.deepEqual(calls,['select_mode','select_weapon']);
 assert.deepEqual(progress,[
  {index:0,total:2,phase:'running'},
  {index:0,total:2,phase:'done',message:'已选择校园突围'},
  {index:1,total:2,phase:'running'},
  {index:1,total:2,phase:'done',message:'已装备 M4A1'},
 ]);
 await assert.rejects(executor.run({...base,id:'ordered-progress'},runtime),/已经处理/);
 assert.equal(progress.length,4);assert.equal(calls.length,2);
});

test('unconfirmed room plans emit no progress and perform no earlier menu side effects',async()=>{
 const executor=new AssistantMenuExecution(),progress:AssistantMenuProgress[]=[],context:AssistantMenuContext={token:base.contextToken,inBattle:false,page:'assistant'};let calls=0;
 const plan:AssistantActionPlan={...base,id:'unconfirmed-progress',actions:[{type:'select_mode',mode:'escape'},{type:'create_room',mode:'coop',difficulty:'normal',maxPlayers:4,private:true}]};
 const runtime:AssistantMenuRuntime={context:()=>context,identity:()=> 'player-one',onProgress:event=>progress.push({...event}),execute:async()=>{calls++;return '不应执行';}};
 await assert.rejects(executor.run(plan,runtime),/先确认/);
 assert.equal(calls,0);assert.deepEqual(progress,[]);
});

test('an action failure reports that item once and does not run later actions or repeat completion',async()=>{
 const executor=new AssistantMenuExecution(),progress:AssistantMenuProgress[]=[],calls:string[]=[],context:AssistantMenuContext={token:base.contextToken,inBattle:false,page:'assistant'};
 const plan:AssistantActionPlan={...base,id:'failed-progress',actions:[...base.actions,{type:'select_difficulty',difficulty:'hard'}]};
 const runtime:AssistantMenuRuntime={context:()=>context,identity:()=> 'player-one',onProgress:event=>progress.push({...event}),execute:async action=>{
  calls.push(action.type);if(action.type==='select_weapon')throw Error('武器暂不可用');return '已选择校园突围';
 }};
 await assert.rejects(executor.run(plan,runtime),/已完成：已选择校园突围.*武器暂不可用/);
 assert.deepEqual(calls,['select_mode','select_weapon']);
 assert.deepEqual(progress,[
  {index:0,total:3,phase:'running'},
  {index:0,total:3,phase:'done',message:'已选择校园突围'},
  {index:1,total:3,phase:'running'},
  {index:1,total:3,phase:'failed',message:'武器暂不可用'},
 ]);
 await assert.rejects(executor.run(plan,runtime),/已经处理/);
 assert.equal(progress.length,4);assert.equal(calls.length,2);
});

test('cancellation during an awaited action marks it failed and ignores its late successful result',async()=>{
 const executor=new AssistantMenuExecution(),progress:AssistantMenuProgress[]=[],calls:string[]=[],context:AssistantMenuContext={token:base.contextToken,inBattle:false,page:'assistant'};
 const second=Promise.withResolvers<string>();let activeSignal:AbortSignal|undefined;
 const plan:AssistantActionPlan={...base,id:'cancelled-progress',actions:[...base.actions,{type:'select_difficulty',difficulty:'hard'}]};
 const runtime:AssistantMenuRuntime={context:()=>context,identity:()=> 'player-one',onProgress:event=>progress.push({...event}),execute:async(action,signal)=>{
  calls.push(action.type);if(action.type==='select_weapon'){activeSignal=signal;return second.promise;}return '已选择校园突围';
 }};
 const pending=executor.run(plan,runtime);
 await Promise.resolve();
 assert.deepEqual(calls,['select_mode','select_weapon']);
 executor.cancel();assert.equal(activeSignal?.aborted,true);
 second.resolve('迟到的装配成功');
 await assert.rejects(pending,/取消/);
 assert.deepEqual(progress,[
  {index:0,total:3,phase:'running'},
  {index:0,total:3,phase:'done',message:'已选择校园突围'},
  {index:1,total:3,phase:'running'},
  {index:1,total:3,phase:'failed',message:'操作已取消。'},
 ]);
 await assert.rejects(executor.run(plan,runtime),/已经处理/);
 assert.equal(progress.length,4);assert.equal(calls.length,2);
});
