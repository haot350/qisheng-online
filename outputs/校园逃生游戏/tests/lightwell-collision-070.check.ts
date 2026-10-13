import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Scene,Vector3} from 'three';
import {loadWorld,type GameWorld} from '../src/world.ts';
import type {DriveMap} from '../src/vehicle-physics.ts';
const root=new URL('../',import.meta.url),read=(name:string)=>readFileSync(new URL(name,root));
const manifest=JSON.parse(read('public/map/manifest.json').toString());
const report:any={createdAt:new Date().toISOString(),manifestHash:createHash('sha256').update(read('public/map/manifest.json')).digest('hex'),capsules:[],rays:[],driving:[]};
async function fixture(run:(w:GameWorld)=>void,old=false){
 const previous=globalThis.fetch;
 globalThis.fetch=async input=>{const url=String(input);return new Response(url==='/map/manifest.json'?JSON.stringify({...manifest,chunks:[]}):old&&url===manifest.collisionUrl?read('public/assets/map/4ea642eea78c488cf7fc9d6ee26e272d7bdac066c5e11ec34dc46a3c6e4c6b06.bin'):read('public'+url));};
 let w:GameWorld|undefined;try{w=await loadWorld(new Scene(),()=>{});run(w);}finally{w?.dispose();globalThis.fetch=previous;}
}
function probe(w:GameWorld,start:Vector3,direction:Vector3,crouch:boolean){
 const support=w.supportAt(start,crouch?1.15:1.75);assert.ok(support?.clear,'supported exterior start '+start.toArray());start.y=support.height;w.restorePlayer(start,crouch);w.step(1/60);
 let p=start.clone(),vertical=-.25,minY=p.y,maxY=p.y,maxStep=0,grounded=true;
 for(let frame=0;frame<150;frame++){
  vertical=grounded?-.25:Math.max(-20,vertical-14/60);
  const delta=direction.clone().multiplyScalar(3.4/60);delta.y=vertical/60;
  const moved=w.move(p,delta,1/60,crouch);maxStep=Math.max(maxStep,Math.abs(moved.position.y-p.y));p=moved.position;grounded=moved.grounded;w.step(1/60);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
 }
 return {start:start.toArray(),direction:direction.toArray(),crouch,minY,maxY,maxStep,end:p.toArray()};
}
test('missing visual guardrail is a reproducible physical fall in the previous patch',async()=>fixture(w=>{
 const result=probe(w,new Vector3(12,.16,-83.95),new Vector3(0,0,-1),false);report.before=result;
 assert.ok(result.minY< -2,'old capsule crosses the missing rail and falls');
},true));
test('exact guardrail blocks standing and crouched continuous approaches without filling the lightwell',async()=>fixture(w=>{
 for(const x of [-14,-12,-10,-5,0,5,10,12,14])for(const crouch of [false,true]){
  const result=probe(w,new Vector3(x,.16,-83.95),new Vector3(0,0,-1),crouch);report.capsules.push(result);assert.ok(result.minY>-.2,'north edge fall at x='+x);
  if(Math.abs(x)>=10)assert.ok(result.end[2]>-84.9,'capsule crosses the actual solid rail');
 }
 for(const sign of [-1,1])for(const crouch of [false,true]){
  const result=probe(w,new Vector3(sign*16.2,.16,-86.15),new Vector3(-sign,0,0),crouch);report.capsules.push(result);assert.ok(result.minY>-.2,'side edge fall');
 }
 const well=w.supportAt(new Vector3(12,-2.8,-86.1),1.75);report.wellSupport=well;
 assert.ok(!well||well.height< -2,'well interior remains below the road or unsupported; no blanket fill');
}));
test('exact railing has solid bars and open gaps for sight and bullets',async()=>fixture(w=>{
 let solid=0,gaps=0;for(let x=-14;x<=14;x+=.05){
  const from=new Vector3(x,.9,-83.8),direction=new Vector3(0,0,-1),distance=w.rayDistance(from,direction,2),vision=w.visionRayDistance(from,direction,2);
  if(distance<1.3)solid++;else gaps++;
  assert.ok(Math.abs(distance-vision)<.0001,'rail uses same physical sight/bullet surface');
  report.rays.push({x,distance});
 }
 report.raySummary={solid,gaps};assert.ok(solid>20&&gaps>20,'real bar spacing survives; no bounding-box wall');
}));
test('actual driving physics remains supported on the road north of the railing',async()=>fixture(w=>{
 const raw=JSON.parse(read('public/map/drive-v122.json').toString()) as DriveMap;
 for(const reverse of [false,true]){
  const spawn:[number,number,number]=[reverse?12:-12,.16,-81.3],yaw=reverse?-Math.PI/2:Math.PI/2;
  const map={...raw,spawn,spawnYaw:yaw};const valid=w.validateDrivingSpawn(map,spawn,yaw);assert.ok(valid,'nearby actual supported road spawn');map.spawn=valid;
  const car=w.startDriving(map);let minY=Infinity,maxTilt=0;for(let frame=0;frame<240;frame++){car.beforeStep({steer:0,throttle:.25,brake:0,handbrake:false,reverse:false,boost:false,reset:false},false,1/60);w.step(1/60);const state=car.read();minY=Math.min(minY,state.position.y);const up=new Vector3(0,1,0).applyQuaternion(state.rotation);maxTilt=Math.max(maxTilt,Math.acos(Math.min(1,up.y)));}
  const state=car.read();report.driving.push({reverse,spawn,position:state.position.toArray(),minY,maxTilt,speed:state.horizontalSpeed,contacts:state.wheelContacts});assert.ok(minY>-.2&&maxTilt<.3&&state.wheelContacts>=3);car.dispose();
 }
}));
test.after(()=>writeFileSync(new URL('docs/v0.7.0/lightwell-physics.json',root),JSON.stringify(report,null,2)+'\n'));
