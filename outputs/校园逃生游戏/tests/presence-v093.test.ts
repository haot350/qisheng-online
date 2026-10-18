import test from 'node:test';import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';import {existsSync} from 'node:fs';import {fileURLToPath} from 'node:url';
registerHooks({resolve(specifier,context,next){if(specifier.startsWith('.')&&context.parentURL?.includes('/src/')){const url=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts'))return next(specifier+'.ts',context);}return next(specifier,context);}});
const {GamePresence}=await import('../src/game-presence.ts');
function memory(){const data=new Map<string,string>();return {data,getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};}
test('presence uses only a per-tab opaque session and removes it without player or location fields',async()=>{
 const store=memory(),calls:any[]=[],token='a'.repeat(43);const tracker=new GamePresence((async(path:string,options:any)=>{calls.push({path,options});return {sessionId:token};})as any,store);
 await tracker.active();await tracker.active();assert.equal(calls.length,2);assert.deepEqual(calls[0].options.body,{client:'web',active:true});assert.deepEqual(calls[1].options.body,{sessionId:token,client:'web',active:true});tracker.inactive();assert.equal(store.data.size,0);assert.deepEqual(calls[2].options.body,{sessionId:token,client:'web',active:false});assert.equal(calls[2].options.auth,false);
});
test('hidden-page cancellation ignores a late heartbeat result and permits a fresh foreground session',async()=>{
 const store=memory(),first=Promise.withResolvers<any>();let calls=0;const tracker=new GamePresence((async()=>++calls===1?first.promise:{sessionId:'b'.repeat(43)})as any,store);
 const work=tracker.active();await tracker.active();assert.equal(calls,1);tracker.inactive();first.resolve({sessionId:'a'.repeat(43)});await work;assert.equal(store.data.size,0);await tracker.active();assert.equal(calls,2);assert.equal([...store.data.values()][0],'b'.repeat(43));
});
test('malformed or rejected token is discarded, and pagehide sends no account credential',async()=>{
 const store=memory();store.setItem('qisheng-active-session-v1','bad');const tracker=new GamePresence((async()=>{throw Object.assign(Error('invalid'),{code:'PRESENCE'});})as any,store);await tracker.active();assert.equal(store.data.size,0);
 const next=new GamePresence((async()=>({sessionId:'c'.repeat(43)}))as any,store);await next.active();let body='';next.inactive(value=>body=value);assert.deepEqual(JSON.parse(body),{sessionId:'c'.repeat(43),client:'web',active:false});
});
