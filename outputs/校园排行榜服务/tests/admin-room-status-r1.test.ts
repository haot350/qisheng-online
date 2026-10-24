import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {roomCommandNotice,roomSnapshotFresh} from '../admin/src/room-status.ts';
import {createApp} from '../dist/app.js';

// Exercise the changed control source while reusing the built app's dependencies.
registerHooks({resolve(specifier,context,next){
  if(context.parentURL?.endsWith('/src/room-control.ts')&&specifier.startsWith('./')&&specifier.endsWith('.js'))
    return next(new URL('../dist/'+specifier.slice(2),context.parentURL).href,context);
  return next(specifier,context);
}});
const {submitRoomCommand}=await import('../src/room-control.ts');

test('room action validity includes server sample age and elapsed local receipt time',()=>{
  const serverNow=10_000_000,receivedAt=50_000;
  assert.equal(roomSnapshotFresh(serverNow-5000,serverNow,receivedAt,receivedAt+24999),true);
  assert.equal(roomSnapshotFresh(serverNow-5000,serverNow,receivedAt,receivedAt+25000),false);
  assert.equal(roomSnapshotFresh(serverNow-30000,serverNow,receivedAt,receivedAt),false);
  assert.equal(roomSnapshotFresh(serverNow,serverNow,null,receivedAt),false);
  assert.equal(roomSnapshotFresh(NaN,serverNow,receivedAt,receivedAt),false);
});

test('a failed refresh keeps room actions unavailable until a successful fresh sample',()=>{
  const serverNow=10_000_000,receivedAt=50_000;
  assert.equal(roomSnapshotFresh(serverNow,serverNow,receivedAt,receivedAt+1000,true),false);
  assert.equal(roomSnapshotFresh(serverNow,serverNow,receivedAt,receivedAt+2000,true),false);
  assert.equal(roomSnapshotFresh(serverNow+3000,serverNow+3000,receivedAt+3000,receivedAt+3001,false),true);
});

test('room operation notices identify the command and preserve actual execution state',()=>{
  assert.match(roomCommandNotice({commandId:'command-a',state:'executing'}),/command-a.*执行中/);
  assert.doesNotMatch(roomCommandNotice({commandId:'command-a',state:'executing'}),/等待执行/);
  assert.match(roomCommandNotice({commandId:'command-a',state:'executed'}),/已执行/);
  assert.match(roomCommandNotice({commandId:'command-a',state:'noop'}),/无需执行/);
});

test('a repeated target operation returns its existing executing receipt without another command',async()=>{
  const f=await createApp({dbPath:':memory:',credentialSecret:'r1-private-test',serviceSecret:'r1-service-test'});
  try{
    const now=Date.UTC(2026,9,24),room='room-r1',generation='generation-r1';
    f.db.prepare('INSERT INTO online_rooms(id,worker,mode,state,players,max_players,created,updated,health,variant) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(room,'w1','pvp','playing','[]',8,now,now,'{}','tdm');
    f.db.prepare('INSERT INTO room_runtime VALUES(?,?,?,?,?)').run(room,generation,1,'test-signature',JSON.stringify({commandCapable:true}));
    const context={db:f.db,now:()=>now,audit:()=>{}} as any;
    const body={action:'close',reason:'临时库行为检查',requestId:'first-request',generation,expectedRevision:1};
    const first=submitRoomCommand(context,'test-actor',room,body);
    assert.equal(first.state,'queued');
    f.db.prepare("UPDATE room_command_results SET state='executing' WHERE command_id=?").run(first.commandId);
    const repeated=submitRoomCommand(context,'test-actor',room,{...body,requestId:'second-request'});
    assert.equal(repeated.commandId,first.commandId);
    assert.equal(repeated.state,'executing');
    assert.equal(repeated.duplicate,true);
    assert.equal((f.db.prepare('SELECT count(*) n FROM room_commands').get() as any).n,1);
  }finally{await f.app.close();}
});
