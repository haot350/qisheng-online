import test from 'node:test';
import assert from 'node:assert/strict';
import {QueueRoomOwnership} from '../dist/modules/校园联机服务/src/queue-room.js';

test('cancelling the creating request releases a new empty room exactly once',async()=>{
 let closed=0;const owner=new QueueRoomOwnership('creator',()=>true,async()=>{closed++;});
 try{owner.register('creator');assert.equal(await owner.release('creator'),true);assert.equal(await owner.release('creator'),false);assert.equal(closed,1);assert.throws(()=>owner.register('late'),/ROOM_CLOSING/);}finally{owner.dispose();}
});
test('another pending entrant protects the new room until all applications cancel',async()=>{
 let closed=0;const owner=new QueueRoomOwnership('creator',()=>true,async()=>{closed++;});
 try{owner.register('creator');owner.register('other');assert.equal(await owner.release('creator'),false);assert.equal(closed,0);assert.equal(await owner.release('other'),true);assert.equal(closed,1);}finally{owner.dispose();}
});
test('members and existing rooms are never removed by cancelling a reservation',async()=>{
 let members=1,closed=0;const created=new QueueRoomOwnership('creator',()=>members===0,async()=>{closed++;}),existing=new QueueRoomOwnership(null,()=>true,async()=>{closed++;});
 try{created.register('creator');assert.equal(await created.release('creator'),false);existing.register('joiner');assert.equal(await existing.release('joiner'),false);assert.equal(closed,0);}finally{created.dispose();existing.dispose();}
});
