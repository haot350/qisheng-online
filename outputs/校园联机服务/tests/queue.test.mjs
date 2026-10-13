import test from 'node:test';
import assert from 'node:assert/strict';
import {QueueRecords,queueView,processQueueEntries} from '../dist/modules/校园联机服务/src/queue.js';
function fixture(){
 const values=new Map(),removed=[];
 const store={get:async k=>values.get(k)??null,put:async(k,v)=>{values.set(k,v);},remove:async k=>{values.delete(k);},compareSwap:async(k,old,next)=>{if(values.get(k)!==old)return false;if(next===null)values.delete(k);else values.set(k,next);return true;},queueRemove:async id=>{removed.push(id);}};
 const records=new QueueRecords(store,()=>1000),add=(id,playerId=id)=>{const row={queueId:id,tokenHash:'token-'+id,player:{id:playerId,nickname:'队员',shortId:'ABC'},options:{mode:'pvp'},createdAt:1000,status:'waiting',create:true,reservation:null};values.set('campus:queue:'+id,JSON.stringify(row));values.set('campus:player-queue:'+playerId,id);return row;};
 return{values,records,add,store,removed};
}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
test('a capacity-blocked new-room request does not block a later existing-room join',async()=>{
 const f=fixture();f.add('create');f.add('join');const calls=[];
 await processQueueEntries(['create','join'],id=>f.records.reserve(id,async()=>{calls.push(id);return id==='create'?null:{grant:'seat',reservation:{sessionId:'join-seat'},discard:async()=>{}};}),()=>assert.fail('unexpected failure'));
 assert.deepEqual(calls,['create','join']);assert.equal((await f.records.read('create')).status,'waiting');assert.equal((await f.records.read('join')).status,'ready');
});
test('cancel during an in-flight reservation seals a tombstone and revokes the late grant',async()=>{
 const f=fixture(),row=f.add('r','p'),started=deferred(),finish=deferred();let discarded=0;
 const pending=f.records.reserve('r',async()=>{started.resolve();await finish.promise;f.values.set('campus:grant:g','secret');return{grant:'g',reservation:{sessionId:'s'},discard:async()=>{discarded++;f.values.delete('campus:grant:g');}};});
 await started.promise;await f.records.cancel('r',row.tokenHash);f.values.set('campus:player-queue:p','new-queue');finish.resolve();await pending;
 assert.equal((await f.records.read('r')).status,'cancelled');assert.equal(queueView(await f.records.read('r'),0).reservation,undefined);assert.equal(f.values.has('campus:grant:g'),false);assert.equal(discarded,1);assert.equal(f.values.get('campus:player-queue:p'),'new-queue');
});
test('ready cancellation is authenticated and idempotent; an old cancellation cannot erase a new player queue',async()=>{
 const f=fixture(),row=f.add('r','p');f.values.set('campus:grant:g','secret');await f.records.reserve('r',async()=>({grant:'g',reservation:{sessionId:'s'},discard:async()=>{}}));
 assert.equal(await f.records.cancel('r','wrong'),null);assert.equal((await f.records.read('r')).status,'ready');await f.records.cancel('r',row.tokenHash);f.values.set('campus:player-queue:p','new');await f.records.cancel('r',row.tokenHash);
 assert.equal(f.values.has('campus:grant:g'),false);assert.equal(f.values.get('campus:player-queue:p'),'new');assert.equal((await f.records.read('r')).reservation,null);
});
test('late reservation error cannot overwrite cancellation; other requests still run',async()=>{
 const f=fixture(),row=f.add('r'),started=deferred(),finish=deferred();
 const pending=f.records.reserve('r',async()=>{started.resolve();await finish.promise;throw Error('late');});await started.promise;await f.records.cancel('r',row.tokenHash);finish.resolve();await pending;
 assert.equal((await f.records.read('r')).status,'cancelled');let later=false;await processQueueEntries(['bad','good'],async id=>{if(id==='bad')throw Error('bad');later=true;},()=>{});assert.equal(later,true);
});
test('overlapping reservation passes acquire a queue entry only once and keep internal reserving private',async()=>{
 const f=fixture();f.add('r');const finish=deferred(),started=deferred();let count=0;
 const acquire=async()=>{count++;started.resolve();await finish.promise;return null;};const first=f.records.reserve('r',acquire);await started.promise;
 assert.equal(queueView(await f.records.read('r'),1).status,'waiting');await f.records.reserve('r',acquire);finish.resolve();await first;assert.equal(count,1);assert.equal((await f.records.read('r')).status,'waiting');
});
test('actual local store compare-and-swap refuses stale replacement and removes only the matching lock',async()=>{
 const {put,get,compareSwap,remove}=await import('../dist/modules/校园联机服务/src/store.js');const k='unit:queue-cas:'+Date.now();
 try{await put(k,'waiting');assert.equal(await compareSwap(k,'waiting','cancelled'),true);assert.equal(await compareSwap(k,'waiting','ready'),false);assert.equal(await get(k),'cancelled');assert.equal(await compareSwap(k,'old',null),false);assert.equal(await compareSwap(k,'cancelled',null),true);assert.equal(await get(k),null);}finally{await remove(k);}
});
test('identity-authenticated retry replaces only its own waiting queue and preserves a newer player lock',async()=>{
 const f=fixture();f.add('old','p');assert.equal(await f.records.cancelWaitingForPlayer('old','someone-else'),false);assert.equal((await f.records.read('old')).status,'waiting');
 f.values.set('campus:player-queue:p','newer');assert.equal(await f.records.cancelWaitingForPlayer('old','p'),true);assert.equal((await f.records.read('old')).status,'cancelled');assert.equal(f.values.get('campus:player-queue:p'),'newer');assert.equal(await f.records.cancelWaitingForPlayer('old','p'),true,'a sealed same-player tombstone supports idempotent cleanup');assert.equal(f.values.get('campus:player-queue:p'),'newer');
 for(const status of ['reserving','ready']){f.add(status,'p');const row=await f.records.read(status);f.values.set('campus:queue:'+status,JSON.stringify({...row,status,admitted:status==='ready'}));assert.equal(await f.records.cancelWaitingForPlayer(status,'p'),false);assert.equal((await f.records.read(status)).status,status);}
});
test('simultaneous identity retries cancel one old wait only once and only one new request can claim its lock',async()=>{
 const f=fixture();f.add('old','p');const attempts=await Promise.all([f.records.cancelWaitingForPlayer('old','p'),f.records.cancelWaitingForPlayer('old','p')]);assert.equal(attempts.filter(Boolean).length,1);assert.deepEqual(f.removed,['old']);
 const claim=async id=>{if(f.values.has('campus:player-queue:p'))return false;f.values.set('campus:player-queue:p',id);return true;};assert.equal((await Promise.all([claim('first'),claim('second')])).filter(Boolean).length,1);assert.equal(f.values.get('campus:player-queue:p'),'first');
});
test('a reserve winning the exact waiting CAS is never cancelled by a late identity retry',async()=>{
 const f=fixture(),started=deferred(),continueCancel=deferred(),acquired=deferred(),finish=deferred();f.add('old','p');const compare=f.store.compareSwap;
 f.store.compareSwap=async(key,before,next)=>{if(key==='campus:queue:old'&&next&&JSON.parse(next).status==='cancelled'){started.resolve();await continueCancel.promise;}return compare(key,before,next);};
 const cancel=f.records.cancelWaitingForPlayer('old','p');await started.promise;
 const reserve=f.records.reserve('old',async()=>{acquired.resolve();await finish.promise;return{grant:'live-grant',reservation:{sessionId:'live-seat'},discard:async()=>assert.fail('live seat must not be discarded')};});await acquired.promise;
 continueCancel.resolve();assert.equal(await cancel,false);assert.equal((await f.records.read('old')).status,'reserving');finish.resolve();await reserve;assert.equal((await f.records.read('old')).status,'ready');assert.equal((await f.records.read('old')).reservation.sessionId,'live-seat');
});
test('identity retry can finish tombstone cleanup after a transient store failure without clearing a newer lock',async()=>{
 const f=fixture();f.add('old','p');let failed=false;const remove=f.store.queueRemove;f.store.queueRemove=async id=>{if(!failed){failed=true;throw Error('Redis interrupted after CAS');}return remove(id);};
 await assert.rejects(f.records.cancelWaitingForPlayer('old','p'),/Redis interrupted/);assert.equal((await f.records.read('old')).status,'cancelled');assert.equal(f.values.get('campus:player-queue:p'),'old');
 assert.equal(await f.records.cancelWaitingForPlayer('old','p'),true);assert.equal(f.values.has('campus:player-queue:p'),false);
 f.values.set('campus:player-queue:p','newer');assert.equal(await f.records.cancelWaitingForPlayer('old','p'),true);assert.equal(f.values.get('campus:player-queue:p'),'newer');
});
test('identity retry clears only its own exact lock when the old queue row has expired',async()=>{
 const f=fixture();f.add('expired','p');f.values.delete('campus:queue:expired');f.values.set('campus:player-queue:other','expired');
 assert.equal(await f.records.cancelWaitingForPlayer('expired','p'),true);assert.equal(f.values.has('campus:player-queue:p'),false);assert.equal(f.values.get('campus:player-queue:other'),'expired');
 f.values.set('campus:player-queue:p','newer');assert.equal(await f.records.cancelWaitingForPlayer('expired','p'),false);assert.equal(f.values.get('campus:player-queue:p'),'newer');
});
