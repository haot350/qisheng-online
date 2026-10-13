import http from 'node:http';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {RULES,WEAPONS,Magazine} from '@qisheng/shared/rules';
const require=createRequire(import.meta.url),transportRequire=createRequire(require.resolve('@colyseus/ws-transport'));
const {WebSocketServer}=transportRequire('ws');
const bytes=await readFile(new URL('../../校园逃生游戏/demo/arena.json',import.meta.url)),arena=JSON.parse(bytes.toString());
const identity={sourceVersion:arena.sourceVersion,arenaHash:createHash('sha256').update(bytes).digest('hex'),protocol:'openqs-demo-ws-v1',localOnly:true};
if(identity.sourceVersion!=='openqs-demo-v1')throw Error('Invalid demo arena identity.');
const origins=new Set(['http://127.0.0.1:5180','http://localhost:5180']);
const server=http.createServer((req,res)=>{if(!['127.0.0.1:2577','localhost:2577','127.0.0.1:5180','localhost:5180'].includes(req.headers.host??'')){res.writeHead(403);res.end();return;}res.writeHead(req.url==='/health'?200:404,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(req.url==='/health'?{ok:true,...identity}:{error:'DEMO_ONLY'}));});
const wss=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:false});
server.on('upgrade',(req,socket,head)=>{if(req.url!=='/'||!origins.has(req.headers.origin??'')||!['127.0.0.1:2577','localhost:2577','127.0.0.1:5180','localhost:5180'].includes(req.headers.host??'')||wss.clients.size>=16){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));});
const players=new Map();let shots=[];
function blocked(x,y){return x<RULES.radius||y<RULES.radius||x>arena.width-RULES.radius||y>arena.height-RULES.radius||arena.obstacles.some(o=>x>o.x-RULES.radius&&x<o.x+o.width+RULES.radius&&y>o.y-RULES.radius&&y<o.y+o.height+RULES.radius);}
function respawn(p){const spawn=arena.spawns[p.slot%arena.spawns.length];p.x=spawn[0];p.y=spawn[1];p.health=100;}
wss.on('connection',ws=>{let player;const greeting=setTimeout(()=>ws.close(1008,'Demo hello required'),3000);ws.on('message',raw=>{let message;try{message=JSON.parse(raw.toString());}catch{ws.close(1008,'Invalid JSON');return;}if(!player){if(message.type!=='hello'||message.sourceVersion!==identity.sourceVersion){ws.close(1008,'Demo identity required');return;}clearTimeout(greeting);player={id:randomUUID(),slot:players.size,x:0,y:0,angle:0,health:100,shots:0,weapon:new Magazine('glock'),input:{},lastInput:Date.now(),ws};respawn(player);players.set(player.id,player);ws.send(JSON.stringify({type:'welcome',id:player.id,identity}));return;}if(message.type!=='input')return;player.lastInput=Date.now();player.input={moveX:Number.isFinite(message.moveX)?Math.max(-1,Math.min(1,message.moveX)):0,moveY:Number.isFinite(message.moveY)?Math.max(-1,Math.min(1,message.moveY)):0,angle:Number.isFinite(message.angle)?message.angle:player.angle,sprint:message.sprint===true,fire:message.fire===true,reload:message.reload===true};});ws.on('close',()=>{clearTimeout(greeting);if(player)players.delete(player.id);});});
const timer=setInterval(()=>{const dt=1/30;shots=[];for(const p of players.values()){
 p.weapon.update(dt);if(Date.now()-p.lastInput>250)p.input={};const i=p.input;p.angle=i.angle??p.angle;
 const x=i.moveX??0,y=i.moveY??0,length=Math.max(1,Math.hypot(x,y)),speed=i.sprint?RULES.runSpeed:RULES.walkSpeed,nx=p.x+x/length*speed*dt,ny=p.y+y/length*speed*dt;
 if(!blocked(nx,p.y))p.x=nx;if(!blocked(p.x,ny))p.y=ny;if(i.reload){p.weapon.reload();i.reload=false;}
 if(i.fire&&p.weapon.fire()){
  p.shots++;const dx=Math.cos(p.angle),dy=Math.sin(p.angle);let distance=Math.min(WEAPONS.glock.range,Math.hypot(arena.width,arena.height)),hit;
  for(let d=.2;d<distance;d+=.12){if(blocked(p.x+dx*d,p.y+dy*d)){distance=d;break;}}
  for(const target of players.values()){if(target===p)continue;const tx=target.x-p.x,ty=target.y-p.y,along=tx*dx+ty*dy;if(along>0&&along<distance&&Math.abs(tx*dy-ty*dx)<.48){distance=along;hit=target;}}
  if(hit){hit.health-=WEAPONS.glock.damage;if(hit.health<=0)respawn(hit);}shots.push({id:p.id,x:p.x,y:p.y,endX:p.x+dx*distance,endY:p.y+dy*distance});
 }
}const snapshot=JSON.stringify({type:'snapshot',identity,players:[...players.values()].map(p=>({id:p.id,x:p.x,y:p.y,angle:p.angle,health:p.health,ammo:p.weapon.ammo,reserve:p.weapon.reserve,shots:p.shots})),shots});for(const ws of wss.clients)if(ws.readyState===1)ws.send(snapshot);},1000/30);
server.listen(2577,'127.0.0.1',()=>console.log('OpenQS localhost demo realtime ready on 127.0.0.1:2577'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{clearInterval(timer);for(const ws of wss.clients)ws.close();wss.close();server.close(()=>process.exit(0));});
