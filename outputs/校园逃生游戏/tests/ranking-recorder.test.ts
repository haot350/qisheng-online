import test,{beforeEach,afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import {rankingClient,RankingError} from '../src/ranking/client.ts';
import {RankingRecorder,pendingRankingRuns,retryPendingRanking,type StoredRankingRun} from '../src/ranking/recorder.ts';
import {RANKING_RULE_VERSION,DAFEI_RULE_VERSION,type RankingPlayer,type RankingRunConfig,type RankingSummary,type RankingEvent,type RankingSubmission} from '../src/ranking/shared.ts';

const originalIndexedDB=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');
const rows=new Map<string,StoredRankingRun>();let holdReads=false,writeFails=false;
let delayedReads:Array<()=>void>=[];let identityCounter=0,runCounter=0;
let activePlayer:RankingPlayer|null;
let uploads:Array<{id:string;events:RankingEvent[]}>,finalizations:Array<{id:string;summary:RankingSummary;count:number}>;
let beginCalls=0;
let uploadOverride:((id:string,events:RankingEvent[])=>Promise<{ackedSeq:number}>)|null=null;
let beginOverride:(()=>Promise<{runId:string;credential:string;expiresAt:number}>)|null=null;
let finalizeOverride:((id:string,summary:RankingSummary)=>Promise<RankingSubmission>)|null=null;
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
const turn=()=>new Promise<void>(resolve=>setImmediate(resolve));
async function waitFor(predicate:()=>boolean){for(let i=0;i<30&&!predicate();i++)await turn();assert(predicate(),'expected asynchronous operation to start');}
const makePlayer=(id='owner-'+(++identityCounter),autoSubmit=false):RankingPlayer=>({id,nickname:'玩家',shortId:'12345',renameAt:0,autoSubmit,restricted:false});
const ticket=()=>({runId:'test-run-'+(++runCounter),credential:'test-only-match-ticket',expiresAt:Date.now()+24*3600000});
const config=():RankingRunConfig=>({mode:'dafei',ruleVersion:RANKING_RULE_VERSION,seed:123,weapon:'m4',roster:['a','b','c','d'],tasks:[],controls:'keyboard',transmission:'auto'});
const summary=(score=100):RankingSummary=>({won:true,elapsed:10,score,hits:1,bestCombo:1,controls:'keyboard',transmission:'auto'});

// A controllable IndexedDB transaction facade: writes clone at request time,
// reads may be delayed independently and quota failures affect writes only.
const database={createObjectStore(){},transaction(){
 const tx:{oncomplete?:()=>void;onerror?:()=>void;error?:Error;objectStore:()=>unknown}={objectStore:()=>({
  put(value:StoredRankingRun){const copy=structuredClone(value);queueMicrotask(()=>{if(writeFails){tx.error=new Error('QuotaExceededError');tx.onerror?.();}else{rows.set(copy.id,copy);tx.oncomplete?.();}});},
  delete(id:string){queueMicrotask(()=>{rows.delete(id);tx.oncomplete?.();});},
  getAll(){const request:{result?:StoredRankingRun[];onsuccess?:()=>void;onerror?:()=>void}={};const finish=()=>{request.result=structuredClone([...rows.values()]);request.onsuccess?.();};if(holdReads)delayedReads.push(finish);else queueMicrotask(finish);return request;}
 })};return tx;
}};
Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{open(){const request:{result:typeof database;onsuccess?:()=>void;onerror?:()=>void}={result:database};queueMicrotask(()=>request.onsuccess?.());return request;}}});

beforeEach(()=>{
 rows.clear();holdReads=false;writeFails=false;delayedReads=[];uploads=[];finalizations=[];beginCalls=0;activePlayer=makePlayer();uploadOverride=null;beginOverride=null;finalizeOverride=null;
 mock.method(rankingClient,'getPlayer',()=>activePlayer);
 mock.method(rankingClient,'me',async()=>activePlayer);
 mock.method(rankingClient,'beginRun',async()=>{beginCalls++;return beginOverride?beginOverride():ticket();});
 mock.method(rankingClient,'upload',async(id:string,_credential:string,events:RankingEvent[])=>{uploads.push({id,events:structuredClone(events)});return uploadOverride?uploadOverride(id,events):{ackedSeq:events.at(-1)!.seq};});
 mock.method(rankingClient,'finalize',async(id:string,_credential:string,value:RankingSummary,count:number)=>{finalizations.push({id,summary:structuredClone(value),count});return finalizeOverride?finalizeOverride(id,value):{runId:id,status:'ranked' as const,summary:structuredClone(value)};});
});
afterEach(async()=>{holdReads=false;for(const release of delayedReads.splice(0))release();await turn();mock.restoreAll();});
process.on('exit',()=>{if(originalIndexedDB)Object.defineProperty(globalThis,'indexedDB',originalIndexedDB);else Reflect.deleteProperty(globalThis,'indexedDB');});
async function start(notify:()=>void=()=>{}){const recorder=new RankingRecorder(notify);await recorder.begin(config());return recorder;}

test('private stats auto sync independently and manual publication never repeats the upload',async()=>{
 activePlayer={...makePlayer(),accountStatus:'legacy',needsUpgrade:true,syncStats:true};
 const legacy=await start();legacy.seal(summary());assert.equal(beginCalls,0);assert.equal(legacy.snapshot().eligible,false);
 activePlayer={...makePlayer(),accountStatus:'active',needsUpgrade:false,syncStats:true,autoSubmit:false};
 mock.method(rankingClient,'beginRun',async(_config:RankingRunConfig,_clientRunId:string,_signal:AbortSignal|undefined,options:{recordStats:boolean;publishBoard:boolean})=>{beginCalls++;assert.deepEqual(options,{recordStats:true,publishBoard:false});return {...ticket(),recordStats:true,publishBoard:false};});
 finalizeOverride=async(id,value)=>({runId:id,status:'ranked',summary:value,recordStats:true,published:false,newAchievements:['drive-combo']});
 let publications=0;mock.method(rankingClient,'publishRun',async(id:string)=>{publications++;return {runId:id,status:'ranked' as const,summary:summary(),recordStats:true,published:true};});
 const recorder=await start();recorder.append(1,'hit',{npc:0});recorder.seal(summary());
 await waitFor(()=>recorder.snapshot().canPublish===true);await turn();await recorder.submit(false);
 assert.equal(uploads.length,1);assert.equal(finalizations.length,1);assert.equal(publications,0);assert.equal(recorder.snapshot().published,false);assert.deepEqual(recorder.snapshot().newAchievements,['drive-combo']);
 await Promise.all([recorder.submit(),recorder.submit()]);
 assert.equal(publications,1);assert.equal(uploads.length,1);assert.equal(finalizations.length,1);assert.equal(recorder.snapshot().published,true);assert.equal(recorder.snapshot().canPublish,false);assert.deepEqual(recorder.snapshot().newAchievements,['drive-combo']);
});

 test('anonymous or offline starts remain playable locally and cannot later acquire a ticket',async()=>{
 activePlayer=null;const anonymous=await start();anonymous.append(1,'hit',{npc:0});anonymous.seal(summary());await anonymous.submit();assert.equal(beginCalls,0);assert.equal(anonymous.snapshot().eligible,false);assert.equal(anonymous.snapshot().status,'local');
 activePlayer=makePlayer();beginOverride=async()=>{throw new TypeError('offline')};const offline=await start();offline.append(1,'hit',{npc:0});offline.seal(summary());await offline.submit();assert.equal(offline.snapshot().status,'local');assert.equal(offline.snapshot().eligible,false);assert.equal(uploads.length,0);assert.equal(finalizations.length,0);
 });

 test('cancelling while a ticket is in flight never creates a late eligible match',async()=>{
 const delayed=deferred<ReturnType<typeof ticket>>();beginOverride=()=>delayed.promise;let notifications=0;const recorder=new RankingRecorder(()=>notifications++);const begin=recorder.begin(config());await waitFor(()=>beginCalls===1);recorder.cancel();const count=notifications,late=ticket();delayed.resolve(late);await begin;assert.equal(recorder.snapshot().eligible,false);assert.equal(notifications,count);assert.equal(rows.has(late.runId),false);
 });

 test('queued persistence cannot resurrect an unsealed match after cancellation',async()=>{
 const recorder=await start(),id=recorder.snapshot().runId!;recorder.append(2,'damage',{amount:1});recorder.append(4,'damage',{amount:2});recorder.cancel();await turn();await turn();assert.equal(rows.has(id),false);assert(!(await pendingRankingRuns()).some(row=>row.id===id));
 });

 test('write quota failure retains a retryable in-memory match even when database reads succeed',async()=>{
 writeFails=true;const recorder=await start(),id=recorder.snapshot().runId!;recorder.append(1,'hit',{npc:0});recorder.seal(summary());await turn();const pending=await pendingRankingRuns();assert(pending.some(row=>row.id===id));assert.equal(rows.has(id),false);writeFails=false;await recorder.submit();assert.equal(finalizations.length,1);assert.equal(recorder.snapshot().status,'ranked');
 });

 test('a pending queue read cannot return records belonging to the previous identity',async()=>{
 const recorder=await start();recorder.seal(summary());await turn();holdReads=true;const work=pendingRankingRuns();await waitFor(()=>delayedReads.length===1);activePlayer=makePlayer();for(const release of delayedReads.splice(0))release();assert.deepEqual(await work,[]);
 });

 test('trying under another identity does not delete the original owner queue',async()=>{
 const owner=activePlayer!,recorder=await start(),id=recorder.snapshot().runId!;recorder.append(1,'hit',{npc:0});recorder.seal(summary());await turn();activePlayer=makePlayer();await assert.rejects(retryPendingRanking(id),(error:unknown)=>error instanceof RankingError&&error.code==='WRONG_IDENTITY'&&error.retryable);assert.equal(uploads.length,0);activePlayer=owner;assert((await pendingRankingRuns()).some(row=>row.id===id));await recorder.submit();assert.equal(recorder.snapshot().status,'ranked');
 });

 test('identity changes between upload batches stop submission and preserve acknowledged progress',async()=>{
 const owner=activePlayer!,recorder=await start(),id=recorder.snapshot().runId!;for(let i=0;i<501;i++)recorder.append(i/1000,'shot',{index:i});recorder.seal(summary());const delayed=deferred<{ackedSeq:number}>();uploadOverride=()=>delayed.promise;const work=recorder.submit();await waitFor(()=>uploads.length===1);activePlayer=makePlayer();delayed.resolve({ackedSeq:500});await work;assert.equal(finalizations.length,0);assert.equal(recorder.snapshot().status,'retry');activePlayer=owner;const pending=(await pendingRankingRuns()).find(row=>row.id===id);assert.equal(pending?.acked,500);uploadOverride=null;await recorder.submit();assert.equal(uploads.length,2);assert.equal(uploads[1].events[0].seq,501);assert.equal(finalizations.length,1);
 });

 test('duplicate seal and concurrent submissions retain the first terminal summary and one upload',async()=>{
 const recorder=await start();recorder.append(1,'hit',{npc:0});recorder.seal(summary(100));recorder.seal(summary(999));recorder.append(2,'hit',{npc:1});const delayed=deferred<{ackedSeq:number}>();uploadOverride=()=>delayed.promise;const first=recorder.submit(),second=recorder.submit();await waitFor(()=>uploads.length===1);delayed.resolve({ackedSeq:1});await Promise.all([first,second]);assert.equal(uploads.length,1);assert.equal(uploads[0].events.length,1);assert.equal(finalizations.length,1);assert.equal(finalizations[0].summary.score,100);assert.equal(finalizations[0].count,1);assert.equal(recorder.snapshot().status,'ranked');
 });

 test('same-frame events and clamped timestamps retain monotonically increasing sequence and order',async()=>{
 const recorder=await start();recorder.append(1,'hit',{npc:0});recorder.append(1,'hit',{npc:1});recorder.append(.9,'damage',{amount:1});recorder.append(1.1,'repair',{point:0});recorder.seal(summary());await recorder.submit();assert.deepEqual(uploads[0].events.map(event=>[event.seq,event.t,event.order]),[[1,1,0],[2,1,1],[3,1,2],[4,1.1,0]]);
 });

 test('an upload failure keeps a sealed match for retry without repeating acknowledged batches',async()=>{
 const recorder=await start(),id=recorder.snapshot().runId!;for(let i=0;i<501;i++)recorder.append(i/1000,'shot',{index:i});recorder.seal(summary());let count=0;uploadOverride=async(_id,events)=>{count++;if(count===2)throw new RankingError('网络暂不可用');return {ackedSeq:events.at(-1)!.seq}};await recorder.submit();assert.equal(recorder.snapshot().status,'retry');assert.equal((await pendingRankingRuns()).find(row=>row.id===id)?.acked,500);uploadOverride=null;await recorder.submit();assert.equal(uploads.length,3);assert.equal(uploads[2].events.length,1);assert.equal(uploads[2].events[0].seq,501);assert.equal(finalizations.length,1);
 });

 test('control and transmission changes are recorded once and final labels are mixed',async()=>{
 const recorder=await start();recorder.observeControls(1,'touch');recorder.observeControls(2,'keyboard');recorder.observeTransmission(2,'manual');recorder.observeTransmission(3,'auto');recorder.seal(summary());await recorder.submit();assert.deepEqual(uploads[0].events.map(event=>event.type),['controls','transmission']);assert.equal(finalizations[0].summary.controls,'mixed');assert.equal(finalizations[0].summary.transmission,'mixed');
 });

 test('cancelled display callbacks stay silent when an already sealed submission finishes',async()=>{
 let notifications=0;const recorder=await start(()=>notifications++);recorder.append(1,'hit',{npc:0});recorder.seal(summary());const delayed=deferred<{ackedSeq:number}>();uploadOverride=()=>delayed.promise;const work=recorder.submit();await waitFor(()=>uploads.length===1);recorder.cancel();const before=notifications;delayed.resolve({ackedSeq:1});await work;assert.equal(notifications,before);assert.equal(finalizations.length,1);
 });

 test('failed extraction is saved privately as unranked rather than being presented as rejected',async()=>{
 const recorder=new RankingRecorder();await recorder.begin({...config(),mode:'escape',difficulty:'standard',transmission:undefined});recorder.append(1,'damage',{amount:100});finalizeOverride=async(id,value)=>({runId:id,status:'unranked',summary:value});recorder.seal({...summary(),won:false});await recorder.submit();assert.equal(recorder.snapshot().status,'unranked');assert.match(recorder.snapshot().message,/个人记录/);assert.equal(recorder.snapshot().canSubmit,false);assert.equal((await pendingRankingRuns()).length,0);
 });

test('new driving begins with its current mode rule, while pending old-rule records keep their signed rule',async()=>{
 mock.method(rankingClient,'beginRun',async(value:RankingRunConfig)=>{assert.equal(value.ruleVersion,DAFEI_RULE_VERSION);return ticket();});
 const recorder=await start();recorder.seal(summary());await turn();const current=(await pendingRankingRuns()).find(row=>row.id===recorder.snapshot().runId)!;assert.equal(current.config.ruleVersion,DAFEI_RULE_VERSION);
 const oldTicket=ticket(),legacy:StoredRankingRun={id:oldTicket.runId,ownerId:activePlayer!.id,ticket:oldTicket,config:config(),events:[],acked:0,summary:summary(0),status:'retry',autoSubmit:false,createdAt:Date.now(),finishedAt:Date.now()};rows.set(legacy.id,legacy);
 assert.equal((await pendingRankingRuns()).find(row=>row.id===legacy.id)!.config.ruleVersion,RANKING_RULE_VERSION);await retryPendingRanking(legacy.id);assert.ok(finalizations.some(v=>v.id===legacy.id));
});
