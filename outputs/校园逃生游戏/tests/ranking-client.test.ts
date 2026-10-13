import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {RankingClient,RankingError} from '../src/ranking/client.ts';
import type {RankingPlayer} from '../src/ranking/shared.ts';

const SESSION='qisheng-ranking-session-v1';
const originalStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
const player=(id='a',autoSubmit=true):RankingPlayer=>({id,nickname:'玩家'+id,shortId:'code'+id,renameAt:0,autoSubmit,restricted:false});
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
function network(initialToken='session-a'){
 const data=new Map<string,string>(initialToken?[[SESSION,initialToken]]:[]);
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value),removeItem:(key:string)=>data.delete(key)}});
 const calls:Array<{url:string;options:RequestInit;pending:ReturnType<typeof deferred<Response>>}>=[];
 const transport=((url:unknown,options:RequestInit={})=>{const pending=deferred<Response>();calls.push({url:String(url),options,pending});const abort=()=>pending.reject(new DOMException('Aborted','AbortError'));if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});return pending.promise.finally(()=>options.signal?.removeEventListener('abort',abort));}) as typeof fetch;
 return {client:new RankingClient('https://example.invalid',transport),calls,data};
}
const turn=()=>new Promise<void>(resolve=>setImmediate(resolve));
afterEach(()=>{if(originalStorage)Object.defineProperty(globalThis,'localStorage',originalStorage);else Reflect.deleteProperty(globalThis,'localStorage');});

test('registration persists only the ordinary session, never the recovery code',async()=>{
 const {client,calls,data}=network('');const work=client.register('玩家a');calls[0].pending.resolve(response({player:player(),token:'ordinary-session',expiresAt:123,recoveryCode:'test-only-recovery-secret'}));const auth=await work;
 assert.equal(auth.recoveryCode,'test-only-recovery-secret');assert.deepEqual([...data],[[SESSION,'ordinary-session']]);assert.equal(client.getPlayer()?.id,'a');assert.equal(calls[0].options.credentials,'omit');assert.equal((calls[0].options.headers as Record<string,string>).Authorization,undefined);
});

test('older identity responses cannot replace a newer restored identity',async()=>{
 const {client,calls,data}=network('');const older=client.register('玩家a');const newer=client.restore('test-only-code-b');const rejection=assert.rejects(older,(error:unknown)=>error instanceof RankingError&&error.code==='CANCELLED');calls[1].pending.resolve(response({player:player('b'),token:'session-b',expiresAt:123}));await newer;calls[0].pending.resolve(response({player:player(),token:'session-a',expiresAt:123,recoveryCode:'test-only-code-a'}));await rejection;
 assert.equal(client.getPlayer()?.id,'b');assert.equal(data.get(SESSION),'session-b');assert(![...data.values()].some(value=>value.includes('test-only')));
});

test('stale me returns null and does not clear a newer in-flight me request',async()=>{
 const {client,calls}=network();const old=client.me();const restore=client.restore('test-only-code-b');calls[1].pending.resolve(response({player:player('b'),token:'session-b',expiresAt:123}));await restore;const next=client.me();calls[0].pending.resolve(response(player()));assert.equal(await old,null);await turn();const duplicate=client.me();assert.equal(calls.length,3);calls[2].pending.resolve(response(player('b')));assert.equal((await next)?.id,'b');assert.equal((await duplicate)?.id,'b');
});

test('an unauthorized response for the current session clears only that session',async()=>{
 const {client,calls,data}=network();const work=client.me();calls[0].pending.resolve(response({error:{code:'UNAUTHORIZED',message:'请重新登录',retryable:false}},401));assert.equal(await work,null);assert.equal(client.getPlayer(),null);assert.equal(data.has(SESSION),false);
});

test('an old unauthorized response cannot log out a new identity',async()=>{
 const {client,calls,data}=network();const old=client.me();const rejection=assert.rejects(old,(error:unknown)=>error instanceof RankingError&&error.code==='UNAUTHORIZED');const restore=client.restore('test-only-code-b');calls[1].pending.resolve(response({player:player('b'),token:'session-b',expiresAt:123}));await restore;calls[0].pending.resolve(response({error:{code:'UNAUTHORIZED',message:'请重新登录',retryable:false}},401));await rejection;assert.equal(client.getPlayer()?.id,'b');assert.equal(data.get(SESSION),'session-b');
});

test('profile PATCH operations are serialized so the latest choice wins',async()=>{
 const {client,calls}=network();const load=client.me();calls[0].pending.resolve(response(player()));await load;const older=client.setAutoSubmit(false),newer=client.setAutoSubmit(true);await turn();assert.equal(calls.length,2);assert.deepEqual(JSON.parse(String(calls[1].options.body)),{autoSubmit:false});calls[1].pending.resolve(response(player('a',false)));await older;await turn();assert.equal(calls.length,3);assert.deepEqual(JSON.parse(String(calls[2].options.body)),{autoSubmit:true});calls[2].pending.resolve(response(player('a',true)));await newer;assert.equal(client.getPlayer()?.autoSubmit,true);
});

test('a me snapshot requested before a profile change cannot overwrite the changed setting',async()=>{
 const {client,calls}=network();const load=client.me();calls[0].pending.resolve(response(player()));await load;const oldMe=client.me();const change=client.setAutoSubmit(false);await turn();calls[2].pending.resolve(response(player('a',false)));await change;calls[1].pending.resolve(response(player('a',true)));assert.equal(await oldMe,null);assert.equal(client.getPlayer()?.autoSubmit,false);
});

test('a queued profile mutation is cancelled after the identity changes',async()=>{
 const {client,calls}=network();const load=client.me();calls[0].pending.resolve(response(player()));await load;const first=client.setAutoSubmit(false),queued=client.rename('另一个昵称');const rejection=assert.rejects(queued,(error:unknown)=>error instanceof RankingError&&error.code==='CANCELLED');await turn();const restore=client.restore('test-only-code-b');calls[2].pending.resolve(response({player:player('b'),token:'session-b',expiresAt:123}));await restore;calls[1].pending.resolve(response(player('a',false)));await first;await rejection;assert.equal(calls.filter(call=>call.options.method==='PATCH').length,1);assert.equal(client.getPlayer()?.id,'b');
});

test('cancellation differs from network timeout and both settle without hanging',async()=>{
 const {client}=network();const signal=new AbortController();const cancelled=client.request('/boards',{signal:signal.signal});const rejection=assert.rejects(cancelled,(error:unknown)=>error instanceof RankingError&&error.code==='CANCELLED'&&!error.retryable);signal.abort();await rejection;await assert.rejects(client.request('/boards',{timeout:5}),(error:unknown)=>error instanceof RankingError&&error.code==='NETWORK'&&error.retryable);
});

test('failed logout-all retains the session; failed local logout still clears this device',async()=>{
 const {client,calls,data}=network();const load=client.me();calls[0].pending.resolve(response(player()));await load;const all=client.logout(true);const allRejection=assert.rejects(all);calls[1].pending.reject(new TypeError('offline'));await allRejection;assert.equal(client.getPlayer()?.id,'a');assert.equal(data.get(SESSION),'session-a');const local=client.logout();const localRejection=assert.rejects(local,(error:unknown)=>error instanceof RankingError&&error.message.includes('本机已退出'));calls[2].pending.reject(new TypeError('offline'));await localRejection;assert.equal(client.getPlayer(),null);assert.equal(data.has(SESSION),false);
});

test('successful identity deletion notifies its owner and removes the ordinary session',async()=>{
 const {client,calls,data}=network();const load=client.me();calls[0].pending.resolve(response(player()));await load;const deleted:string[]=[];client.onIdentityDeleted(id=>deleted.push(id));const work=client.deleteIdentity();assert.equal((calls[1].options.headers as Record<string,string>).Authorization,'Bearer session-a');calls[1].pending.resolve(response({ok:true}));await work;assert.deepEqual(deleted,['a']);assert.equal(client.getPlayer(),null);assert.equal(data.has(SESSION),false);
});
