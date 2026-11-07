import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {sendQueuedAdmission} from '../dist/modules/校园联机服务/src/queue-response.js';

function deferred(){let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};}
async function endpoint(t,handler){
 const app=express();app.post('/v1/queue',handler);
 const server=await new Promise(resolve=>{const value=app.listen(0,'127.0.0.1',()=>resolve(value));});
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 return 'http://127.0.0.1:'+server.address().port+'/v1/queue';
}

test('durable admission returns HTTP202 while cold processing remains pending',{timeout:2000},async t=>{
 const cold=deferred(),started=deferred(),finished=deferred(),errors=[];
 let calls=0,completed=false;
 t.after(()=>cold.resolve());
 const url=await endpoint(t,(_request,response)=>{
  sendQueuedAdmission(response,{queueId:'durable-queue',status:'waiting',position:1},async()=>{
   calls++;assert.equal(response.writableFinished,true);started.resolve();
   await cold.promise;completed=true;finished.resolve();
  },error=>errors.push(error));
 });
 const response=await fetch(url,{method:'POST',signal:AbortSignal.timeout(1500)});
 assert.equal(response.status,202);
 assert.deepEqual(await response.json(),{queueId:'durable-queue',status:'waiting',position:1});
 await started.promise;
 assert.equal(completed,false);assert.equal(calls,1);
 cold.resolve();await finished.promise;
 assert.equal(completed,true);assert.deepEqual(errors,[]);assert.equal(calls,1);
});

test('background processing rejection is reported without replacing the accepted response',{timeout:2000},async t=>{
 const reported=deferred(),failure=Error('cold worker unavailable');let calls=0;
 const url=await endpoint(t,(_request,response)=>{
  sendQueuedAdmission(response,{queueId:'accepted-queue',status:'waiting'},async()=>{calls++;throw failure;},error=>reported.resolve(error));
 });
 const response=await fetch(url,{method:'POST',signal:AbortSignal.timeout(1500)});
 assert.equal(response.status,202);
 assert.deepEqual(await response.json(),{queueId:'accepted-queue',status:'waiting'});
 assert.equal(await reported.promise,failure);assert.equal(calls,1);
});
