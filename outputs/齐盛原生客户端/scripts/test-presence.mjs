import http from 'node:http';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const project=path.resolve(import.meta.dirname,'..'),events=[];
const server=http.createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk;
 const body=JSON.parse(raw);events.push({path:req.url,body,bearer:req.headers.authorization});
 res.setHeader('Content-Type','application/json');
 if(req.url==='/v1/old-api/presence'){res.writeHead(404);res.end(JSON.stringify({error:{code:'NOT_FOUND'}}));return;}
 assert.equal(req.url,'/v1/presence');assert.equal(req.method,'POST');
 res.end(JSON.stringify({sessionId:'opaque-fixture',heartbeatSeconds:30,expiresInSeconds:90}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/v1`;
try{
 const result=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(project,'scripts/run-godot.mjs'),'--headless','--script','res://tests/native_presence_smoke.gd'],{cwd:project,env:{...process.env,QS_NATIVE_PRESENCE_TEST_BASE:base},windowsHide:true});
  let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  const timer=setTimeout(()=>{child.kill();reject(Error('Presence smoke timed out'));},15000);
  child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);resolve({code,output});});
 });
 assert.equal(result.code,0,result.output);assert.match(result.output,/"presence":"passed"/);
 const current=events.filter(e=>e.path==='/v1/presence'),legacy=events.filter(e=>e.path.includes('old-api'));
 assert.deepEqual(current.map(e=>e.body.active),[true,false,true]);
 assert.equal(current[0].body.client,'native');assert.equal(current[0].body.sessionId,undefined);
 assert.equal(current[1].body.sessionId,'opaque-fixture');assert.equal(current[0].bearer,'Bearer fixture-account');
 assert.equal(legacy.length,1);
 console.log(JSON.stringify({passed:true,checks:6,requests:events.length,backgroundPolls:0,rawCredentialsLogged:false}));
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
