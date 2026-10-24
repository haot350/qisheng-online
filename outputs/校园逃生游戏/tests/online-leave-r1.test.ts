import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

registerHooks({resolve(specifier,context,next){
  if(specifier.startsWith('.')&&context.parentURL?.includes('/src/')){
    const url=new URL(specifier,context.parentURL);
    if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts'))
      return next(specifier+'.ts',context);
  }
  return next(specifier,context);
}});
const {OnlineClient}=await import('../src/multiplayer/client.ts');

function fakeRoom(){
  const callbacks=new Map<string,Function>();
  const sent:{type:string;data:unknown}[]=[];
  let left=0;
  const connection={isOpen:true,close(){connection.isOpen=false;}};
  return {
    roomId:'test',reconnectionToken:'temporary',reconnection:{enabled:true},connection,
    onMessage:(name:string,fn:Function)=>callbacks.set(name,fn),
    onDrop:(fn:Function)=>callbacks.set('drop',fn),
    onReconnect:(fn:Function)=>callbacks.set('reconnect',fn),
    onError:(fn:Function)=>callbacks.set('transport-error',fn),
    onLeave:(fn:Function)=>callbacks.set('leave',fn),
    send:(type:string,data:unknown)=>sent.push({type,data}),
    leave:()=>{left++;connection.close();return Promise.resolve(0);},
    callbacks,sent,get left(){return left;},
  };
}

test('active leave uses only the SDK exit and retires a repeated request once',async()=>{
  const client=new OnlineClient(),room=fakeRoom();
  try{
    (client as any).bind(room);
    await Promise.all([client.leave(),client.leave()]);
    assert.equal(room.sent.some(message=>message.type==='leave'),false);
    assert.equal(room.left,1);
    assert.equal(room.reconnection.enabled,false);
    assert.equal(room.connection.isOpen,false);
    assert.equal(client.room,null);
    assert.equal(client.view.currentRoom,null);
    assert.equal(client.view.status,'lobby');
    assert.equal((client as any).pingTimer,null);
  }finally{client.dispose();}
});

test('active leave closes a stalled SDK connection after one second',async t=>{
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const client=new OnlineClient(),room=fakeRoom();
  const leave=t.mock.method(room,'leave',()=>new Promise<number>(()=>{}));
  const close=t.mock.method(room.connection,'close');
  try{
    (client as any).bind(room);
    const leaving=client.leave();
    assert.equal(leave.mock.callCount(),1);
    assert.equal(room.reconnection.enabled,false);
    t.mock.timers.tick(999);
    assert.equal(close.mock.callCount(),0);
    t.mock.timers.tick(1);
    await leaving;
    assert.equal(close.mock.callCount(),1);
    assert.equal(room.connection.isOpen,false);
    assert.equal(client.view.status,'lobby');
    await client.leave();
    assert.equal(leave.mock.callCount(),1);
  }finally{client.dispose();}
});

test('active leave of an already closed connection does not send an SDK exit',async t=>{
  const client=new OnlineClient(),room=fakeRoom();
  const close=t.mock.method(room.connection,'close');
  try{
    (client as any).bind(room);
    room.connection.isOpen=false;
    await client.leave();
    assert.equal(room.left,0);
    assert.equal(close.mock.callCount(),1);
    assert.equal(room.reconnection.enabled,false);
    assert.equal(room.sent.some(message=>message.type==='leave'),false);
    assert.equal(client.room,null);
    assert.equal(client.view.status,'lobby');
  }finally{client.dispose();}
});
