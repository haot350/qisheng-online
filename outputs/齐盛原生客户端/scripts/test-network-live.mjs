import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(project,'../..');
const require=createRequire(path.join(project,'../校园联机服务/package.json'));
const {Server,Room,matchMaker}=require('@colyseus/core');
const {WebSocketTransport}=require('@colyseus/ws-transport');
const {Client}=require('@colyseus/sdk');
const express=require('express');
const app=express();app.use(express.json({limit:'16kb'}));
const http=createServer(app);
const identity={sourceVersion:'native-test',collisionHash:'fixture-collision',navigationHash:'fixture-navigation',manifestHash:'fixture-manifest',visionHash:'fixture-vision'};
let nativeInputs=0,nativeFire=false,webReceived=false,bytes=0,roomInfo;
class NativeFixture extends Room {
  sequence=new Map();position=new Map();
  onCreate(){this.maxClients=2;this.onMessage('resync',c=>this.full(c));this.onMessage('loading',()=>{});this.onMessage('latency',(c,b)=>c.send('latency',{...b,serverTick:0,nonce:'fixture'}));this.onMessage('latency-ack',()=>{});this.onMessage('input',(c,b)=>{if(c.auth.id!=='native-smoke')return;for(const cmd of b.commands??[]){nativeInputs++;if(cmd.fire)nativeFire=true;const p=this.position.get(c.sessionId);p[2]-=Math.max(-1,Math.min(1,cmd.moveY))*4.6/60;}});this.timer=setInterval(()=>{for(const c of this.clients)this.full(c);},50);}
  onAuth(_c,opts){return{id:opts.identity==='web-sdk-peer'?'web-sdk-peer':'native-smoke'};}
  onJoin(c){this.position.set(c.sessionId,[c.auth.id==='native-smoke'?0:2,0,0]);this.full(c);}
  onLeave(c){this.position.delete(c.sessionId);}
  onDispose(){clearInterval(this.timer);}
  full(c){const seq=(this.sequence.get(c.sessionId)??0)+1;this.sequence.set(c.sessionId,seq);const players=this.clients.map(p=>({id:p.auth.id,position:this.position.get(p.sessionId)??[0,0,0],yaw:0,pitch:0,life:'alive',health:100,generation:1,loading:false,loadingEpoch:0,inputReceipt:{epoch:0,appliedSeq:0,acceptedSeq:0,cancelledThrough:0},actionAck:0,testShotAccepted:p.auth.id==='native-smoke'&&nativeFire}));const message={wireVersion:1,kind:'full',seq,roomId:this.roomId,viewerId:c.auth.id,room:{protocolVersion:'campus-mp-0.9.4',roomId:this.roomId,phase:'playing',tick:seq*3,map:identity},roster:players.map(p=>({id:p.id,team:'none'})),self:players.find(p=>p.id===c.auth.id),players:players.filter(p=>p.id!==c.auth.id),npcs:[],spectatingId:null,events:[],eventSerial:0};bytes+=Buffer.byteLength(JSON.stringify(message));c.send('snapshot',message);}
}
const server=new Server({transport:new WebSocketTransport({server:http}),greet:false,gracefullyShutdown:false});
server.define('native-preview',NativeFixture);
app.get('/map-identity',(_q,r)=>r.json(identity));
app.post('/v1/accounts/login',(_q,r)=>r.json({token:'temporary-loopback-session',player:{id:'native-smoke',nickname:'Native smoke'}}));
app.post('/v1/multiplayer/tickets',(q,r)=>{if(q.headers.authorization!=='Bearer temporary-loopback-session')return r.status(401).json({message:'not authorized'});r.json({ticket:'one-loopback-ticket'});});
app.post('/v1/queue',async(q,r)=>{if(q.body.ticket!=='one-loopback-ticket')return r.status(401).json({});roomInfo??=await matchMaker.createRoom('native-preview',{});const reservation=await matchMaker.reserveSeatFor(roomInfo,{identity:'native-smoke'});r.json({queueId:'fixture-queue',queueToken:'fixture-cancel-token',status:'ready',position:0,reservation});});
app.delete('/v1/queue/:id',(_q,r)=>r.json({status:'cancelled'}));
let web,child;const report={test:'native-web-wire',method:'Official Colyseus native GDExtension and JavaScript SDK, loopback protocol fixture; no production connection, no formal collision parity',startedAt:new Date().toISOString()};
try{
  await server.listen(0,'127.0.0.1');const endpoint='http://127.0.0.1:'+http.address().port;
  roomInfo=await matchMaker.createRoom('native-preview',{});
  web=await new Client(endpoint.replace('http:','ws:')).consumeSeatReservation(await matchMaker.reserveSeatFor(roomInfo,{identity:'web-sdk-peer'}));
  web.onMessage('snapshot',value=>{if(value.players.some(p=>p.id==='native-smoke'))webReceived=true;});
  const exe=process.env.GODOT_BIN??path.join(root,'work/Godot-4.7.2/Godot_v4.7.2-stable_win64_console.exe');
  let output='';child=spawn(exe,['--headless',...(process.env.NATIVE_QA_VERBOSE?['--verbose']:[]),'--path',project,'--script','res://tests/native_network_live.gd','--','--endpoint='+endpoint],{windowsHide:true,env:{...process.env,APPDATA:path.join(project,'work/appdata'),LOCALAPPDATA:path.join(project,'work/appdata')},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>{output+=b;process.stdout.write(b);});child.stderr.on('data',b=>{output+=b;process.stderr.write(b);});
  const timeout=setTimeout(()=>child.kill(),25000);const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});clearTimeout(timeout);
  report.passed=code===0&&nativeInputs>0&&nativeFire&&webReceived;report.exitCode=code;report.nativeInputs=nativeInputs;report.serverAcceptedFire=nativeFire;report.webSdkReceivedNative=webReceived;report.snapshotJsonEquivalentBytes=bytes;report.output=output;report.endedAt=new Date().toISOString();
  if(!report.passed)process.exitCode=1;
}catch(error){report.passed=false;report.error=error.message;process.exitCode=1;}finally{await web?.leave().catch(()=>{});await server.gracefullyShutdown(false);await mkdir(path.join(project,'work'),{recursive:true});await writeFile(path.join(project,'work/network-live-report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({...report,output:undefined}));
