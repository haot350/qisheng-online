import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {Scene} from 'three';
registerHooks({resolve(specifier,context,nextResolve){if(context.parentURL?.includes('/src/')&&specifier.startsWith('./')&&!/\.(ts|tsx|json)$/.test(specifier))return nextResolve(specifier+'.ts',context);return nextResolve(specifier,context);}});
const {createStoryWorld}=await import('../src/story-world.ts');
const turn=()=>new Promise<void>(resolve=>setImmediate(resolve));

test('cancelling story preparation aborts active picture downloads and removes its static stage',async()=>{
 const original=globalThis.fetch,signals:AbortSignal[]=[],controller=new AbortController(),scene=new Scene();let movement=0;
 globalThis.fetch=async(_url,options)=>{const signal=options?.signal as AbortSignal;signals.push(signal);return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));};
 try{const world={supportAt:()=>({height:0}),moveActor:()=>{movement++;}} as any,work=createStoryWorld(scene,world,controller.signal);while(!signals.length)await turn();assert.equal(scene.children.length,1);assert.ok(signals.length<=4);controller.abort();await assert.rejects(work);await turn();assert.ok(signals.every(signal=>signal.aborted));assert.equal(scene.children.length,0);assert.equal(movement,0);}finally{controller.abort();globalThis.fetch=original;}
});

test('a pre-cancelled story preparation requests no pictures and leaves no stage',async()=>{
 const original=globalThis.fetch,controller=new AbortController(),scene=new Scene();let requests=0;controller.abort();globalThis.fetch=async()=>{requests++;throw Error('unexpected');};
 try{await assert.rejects(createStoryWorld(scene,{supportAt:()=>({height:0})} as any,controller.signal));assert.equal(requests,0);assert.equal(scene.children.length,0);}finally{globalThis.fetch=original;}
});
