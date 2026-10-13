import test from 'node:test';
import assert from 'node:assert/strict';
import {onlineModeEntry,requireModeAdmission,publicAdmissionError} from '../dist/modules/校园联机服务/src/mode-admission.js';
import {QueueRecords} from '../dist/modules/校园联机服务/src/queue.js';

test('online admission maps three real room variants and refuses malformed metadata', () => {
  assert.equal(onlineModeEntry({mode:'coop'}),'escape-coop');
  assert.equal(onlineModeEntry({mode:'pvp',variant:'tdm'}),'escape-tdm');
  assert.equal(onlineModeEntry({mode:'pvp',variant:'ffa'}),'escape-ffa');
  for(const options of [{mode:'story'},{mode:'pvp'},{}])assert.throws(()=>onlineModeEntry(options),e=>e.code==='MODE_MISMATCH');
});

test('fake requested variant cannot bypass closed actual room; a different mode cannot borrow a gate', async () => {
  const seen=[],lookup=async entry=>{seen.push(entry);return {enabled:entry!=='escape-ffa',reason:'个人混战暂时关闭。',revision:3};};
  await assert.rejects(requireModeAdmission(lookup,{mode:'pvp',variant:'tdm'},{mode:'pvp',variant:'ffa'}),e=>e.code==='MODE_DISABLED'&&e.publicMessage==='个人混战暂时关闭。');
  assert.deepEqual(seen,['escape-ffa']);
  await assert.rejects(requireModeAdmission(lookup,{mode:'coop'},{mode:'pvp',variant:'tdm'}),e=>e.code==='MODE_MISMATCH');
  assert.deepEqual(seen,['escape-ffa']);
  assert.equal(await requireModeAdmission(lookup,{mode:'pvp',variant:'ffa'},{mode:'pvp',variant:'tdm'}),'escape-tdm');
});

test('fresh checks detect closure between prepare, reservation and start; lookup failure never opens a mode', async () => {
  let open=true,revision=1;
  const lookup=async()=>({enabled:open,revision,reason:''}),options={mode:'coop'};
  await requireModeAdmission(lookup,options);open=false;revision++;
  await assert.rejects(requireModeAdmission(lookup,options),e=>e.code==='MODE_DISABLED'&&e.publicMessage==='该玩法暂时不可用，请稍后再试。');
  open=true;revision++;await requireModeAdmission(lookup,options);
  await assert.rejects(requireModeAdmission(async()=>{throw Error('offline token=private');},options));
  for(const invalid of [{enabled:'true',revision:1},{enabled:true,revision:NaN},{}])await assert.rejects(requireModeAdmission(async()=>invalid,options),e=>e.code==='CONTROL_UNAVAILABLE');
});

test('disabled queue entry releases player lock and carries only safe public reason', async () => {
  const values=new Map(),removed=[];
  const store={get:async k=>values.get(k)??null,put:async(k,v)=>{values.set(k,v);},remove:async k=>{values.delete(k);},compareSwap:async(k,old,next)=>{if(values.get(k)!==old)return false;if(next===null)values.delete(k);else values.set(k,next);return true;},queueRemove:async id=>removed.push(id)};
  const queues=new QueueRecords(store,()=>1000),row={queueId:'q',tokenHash:'token',player:{id:'p'},options:{mode:'pvp',variant:'ffa'},createdAt:1000,status:'waiting',create:false,reservation:null};
  values.set('campus:queue:q',JSON.stringify(row));values.set('campus:player-queue:p','q');
  let reserved=false;
  await queues.reserve('q',async item=>{await requireModeAdmission(async()=>({enabled:false,reason:'维护中。',revision:4}),item.options,{mode:'pvp',variant:'ffa'});reserved=true;return null;});
  const result=await queues.read('q');assert.equal(reserved,false);assert.equal(result.status,'error');assert.deepEqual(result.error,{code:'MODE_DISABLED',message:'维护中。'});assert.equal(values.has('campus:player-queue:p'),false);assert.deepEqual(removed,['q']);
});

test('public admission error hides internal authority details and preserves mode closure action', () => {
  assert.deepEqual(publicAdmissionError({code:'MODE_DISABLED',publicMessage:'维护中。'}),{code:'MODE_DISABLED',message:'维护中。',status:403});
  assert.deepEqual(publicAdmissionError(Error('secret token and stack')),{code:'JOIN_UNAVAILABLE',message:'暂时无法加入，请重试。',status:503});
});
