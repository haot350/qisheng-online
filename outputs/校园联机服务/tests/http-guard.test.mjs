import test from 'node:test';import assert from 'node:assert/strict';import {createServer,request} from 'node:http';import {installHttpGuard} from '../dist/modules/校园联机服务/src/http-guard.js';
test('native matchmake cannot bypass queue; reconnect origin and bounded body are enforced',async()=>{
  const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({accepted:true,body:req.body??null}));});installHttpGuard(server,o=>!o||o==='https://game.tianhw.top');await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;try{
  for(const method of ['joinOrCreate','create','join','joinById']){const response=await fetch(base+'/matchmake/'+method+'/campus',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,403);}
  assert.equal((await fetch(base+'/matchmake/reconnect/validroom',{method:'POST',headers:{Origin:'https://invalid.example','Content-Type':'application/json'},body:'{}'})).status,403);
  const preflight=await fetch(base+'/matchmake/reconnect/validroom',{method:'OPTIONS',headers:{Origin:'https://game.tianhw.top'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://game.tianhw.top');
  assert.equal((await fetch(base+'/matchmake/reconnect/validroom',{method:'OPTIONS',headers:{Origin:'https://invalid.example'}})).status,403);
  const accepted=await fetch(base+'/matchmake/reconnect/validroom',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reconnectionToken:'test'})});assert.deepEqual((await accepted.json()).body,{reconnectionToken:'test'});
  assert.equal((await fetch(base+'/matchmake/reconnect/validroom',{method:'POST',headers:{'Content-Type':'application/json'},body:'invalid'})).status,400);
  assert.equal((await fetch(base+'/matchmake/reconnect/validroom',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({x:'a'.repeat(17000)})})).status,413);
  const chunkStatus=await new Promise((resolve,reject)=>{const req=request(base+'/matchmake/reconnect/validroom',{method:'POST',headers:{'Content-Type':'application/json'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.write('{"x":"'+'a'.repeat(17000));req.end('"}');});assert.equal(chunkStatus,413);
  assert.equal((await fetch(base+'/health',{headers:{Origin:'https://invalid.example'}})).status,403);
  assert.equal((await fetch(base+'/health')).status,200);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('only loopback proxy can supply a single valid client IP',async()=>{const {trustedClientAddress}=await import('../dist/modules/校园联机服务/src/http-guard.js');assert.equal(trustedClientAddress('127.0.0.1','203.0.113.8'),'203.0.113.8');assert.equal(trustedClientAddress('::ffff:127.0.0.1','2001:db8::2'),'2001:db8::2');assert.equal(trustedClientAddress('198.51.100.1','203.0.113.8'),'198.51.100.1');assert.equal(trustedClientAddress('127.0.0.1','1.1.1.1, 2.2.2.2'),'127.0.0.1');assert.equal(trustedClientAddress('127.0.0.1',['1.1.1.1']),'127.0.0.1');assert.equal(trustedClientAddress('127.0.0.1','not-an-ip'),'127.0.0.1');});
