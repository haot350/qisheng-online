import test from 'node:test';
import assert from 'node:assert/strict';
process.env.REALTIME_SERVICE_TOKEN??='isolated-control-test-only';delete process.env.REDIS_URL;
const {CampusRoom}=await import('../dist/modules/校园联机服务/src/room.js');
function fixture(){
 const room=new CampusRoom(),messages=[],client={auth:{player:{id:'host'}},send:(type,data)=>messages.push({type,...data})};let starts=0;
 room.roomId='control-unit';room._listing={metadata:{phase:'lobby',occupancy:1}};room.clients.push(client);room.setMetadata=async m=>{room._listing.metadata=m;};
 room.sim={phase:'lobby',tick:100,maintenance:false,options:{mode:'pvp',variant:'tdm'},players:new Map([['host',{state:{id:'host',nickname:'test',connected:true}}]]),occupantCount:1,start(){if(this.maintenance)return false;starts++;this.phase='preparing';return true;}};
 return{room,client,messages,get starts(){return starts;}};
}
test('start shares the actual pending control poll and duplicate clicks commit only once',async()=>{
 const f=fixture(),saved=globalThis.fetch;let release,commands=0,gates=0;
 globalThis.fetch=async url=>{if(String(url).endsWith('/commands')){commands++;await new Promise(resolve=>release=resolve);return new Response(JSON.stringify({maintenance:false,commands:[]}));}if(String(url).includes('/operations/gate'))gates++;return new Response(JSON.stringify({enabled:true,reason:'',revision:0}));};
 try{const poll=f.room.control();assert.equal(f.room.control(),poll);const first=f.room.requestStart(f.client),duplicate=f.room.requestStart(f.client);assert.equal(first,duplicate);assert.equal(commands,1);assert.equal(f.starts,0);release();await Promise.all([poll,first,duplicate]);assert.equal(f.starts,1);assert.equal(gates,1);assert.deepEqual(f.messages,[]);assert.equal(f.room.startRequests.size,0);await f.room.requestStart(f.client);assert.equal(f.starts,1);assert.deepEqual(f.messages,[]);}finally{globalThis.fetch=saved;f.room.clock.stop();}
});
test('failed control remains fail-closed and maintenance refuses a new match',async()=>{
 const f=fixture(),saved=globalThis.fetch,warn=console.error;console.error=()=>{};
 try{globalThis.fetch=async()=>{throw Error('isolated unavailable');};await f.room.requestStart(f.client);assert.equal(f.starts,0);assert.equal(f.messages[0].code,'CONTROL_UNAVAILABLE');assert.equal(f.room.controlPending,undefined);assert.equal(f.room.startRequests.size,0);
 globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/commands')?{maintenance:true,commands:[]}:{enabled:true,reason:'',revision:0}));await f.room.requestStart(f.client);assert.equal(f.starts,0);assert.equal(f.messages[1].code,'NOT_READY');assert.equal(f.room.sim.phase,'lobby');
 }finally{globalThis.fetch=saved;console.error=warn;f.room.clock.stop();}
});
test('leaving or a room phase change during the awaited poll cannot start an old lobby',async()=>{
 for(const leave of [true,false]){const f=fixture(),saved=globalThis.fetch;let release;
 globalThis.fetch=async url=>{if(String(url).endsWith('/commands'))await new Promise(resolve=>release=resolve);return new Response(JSON.stringify({maintenance:false,commands:[],enabled:true,reason:'',revision:0}));};
 try{const task=f.room.requestStart(f.client);if(leave)f.room.clients.splice(0);else f.room.sim.phase='draining';release();await task;assert.equal(f.starts,0);assert.deepEqual(f.messages,[]);assert.equal(f.room.startRequests.size,0);}finally{globalThis.fetch=saved;f.room.clock.stop();}}
});
