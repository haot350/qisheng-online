import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {Texture,PerspectiveCamera,Mesh,Vector3,MeshBasicMaterial} from 'three';
import {NPC_LAYOUT} from '../src/npc-layout.ts';
import {NPC_LAYOUT_V13} from '../src/npc-layout-v13.ts';
import {NPC_LAYOUT_MOTION} from '../src/npc-layout-motion.ts';
import {NPC_LAYOUT_COMBAT} from '../src/npc-layout-combat.ts';
import {NPC_MOTION_POSES,type NpcMotionPose} from '../src/npc-locomotion.ts';
import {NPC_IDS,NPC_IDENTITY,type NpcIdentityId,type NpcPose,npcPoseFilename} from '../src/npc-roster.ts';
import {staticAssetUrl} from '../src/static-assets.ts';
import type {CharacterState} from '../src/characters.ts';

// Keep real billboard geometry, material, pose loading and resource ownership.
// Replace the firearm so these checks need neither WebGL nor GLB downloads.
const threeUrl=import.meta.resolve('three');
const weaponMock=`data:text/javascript,${encodeURIComponent(`
  import {Group,Object3D,Vector3,Quaternion} from ${JSON.stringify(threeUrl)};
  export function createWorldWeapon(id,lod){
    const root=new Group(),muzzle=new Object3D(),fixture=globalThis.billboardFixture;
    muzzle.position.set(0,0,-.55);root.add(muzzle);root.name='test-firearm';
    const record={id,lod,updates:[],disposed:0};fixture.guns.push(record);
    return {root,setWeapon(next){record.id=next;},
      update(_dt,state){record.updates.push({...state});},
      getMuzzleWorld(){root.updateWorldMatrix(true,true);return muzzle.getWorldPosition(new Vector3());},
      getMuzzleDirectionWorld(){return new Vector3(0,0,-1).applyQuaternion(root.getWorldQuaternion(new Quaternion())).normalize();},
      getEjectionWorld(){return root.localToWorld(new Vector3(.04,0,-.1));},
      getAnchorLocal(name,out=new Vector3()){return name==='grip'?out.set(.03,-.07,.06):out.copy(muzzle.position);},
      getAimReady(){return !record.updates.at(-1)?.lowered;},isAimReady(){return !record.updates.at(-1)?.lowered;},
      dispose(){record.disposed++;root.clear();}};
  }
`)}`;
const resourceUrl=new URL('../src/resource-leases.ts',import.meta.url).href;
const imageDecodeMock=`data:text/javascript,${encodeURIComponent(`export * from ${JSON.stringify(resourceUrl)};export async function decodeResourceImage(bytes,signal){return globalThis.billboardFixture.decode(bytes,signal);}`)}`;
registerHooks({resolve(specifier,context,nextResolve){
  if(context.parentURL?.endsWith('/src/billboards.ts')&&specifier==='./resource-leases.ts')return {url:imageDecodeMock,shortCircuit:true};
  if(context.parentURL?.endsWith('/src/billboards.ts')&&specifier==='./weapons')return {url:weaponMock,shortCircuit:true};
  if(context.parentURL?.includes('/src/')&&specifier.startsWith('./')&&!/\.(ts|json)$/.test(specifier))return nextResolve(`${specifier}.ts`,context);
  return nextResolve(specifier,context);
}});
const {prepareBillboards,createBillboardCharacter,billboardResourceDiagnostics}=await import('../src/billboards.ts');
type Rig=ReturnType<typeof createBillboardCharacter>;
type GunRecord={id:string;lod:string;updates:{lowered:boolean;shotSerial:number;reloadProgress:number}[];disposed:number};
type Fixture={urls:string[];images:{width:number;height:number}[];textures:Texture[];disposed:Texture[];decode:(bytes:ArrayBuffer,signal:AbortSignal)=>Promise<{width:number;height:number}>;guns:GunRecord[];rigs:Rig[];fail:string|null;make:(index:number | NpcIdentityId,mobile?:boolean)=>Rig;prepare:(mobile?:boolean,progress?:(p:number)=>void,ids?:readonly NpcIdentityId[],signal?:AbortSignal)=>Promise<()=>void>};
const IDs=['jiang','meng','xu','luan'];
const idle:CharacterState={speed:0,aim:false,firing:false,reloading:false,suppressed:0,hit:0,attackPhase:'search',shotSerial:0};
async function fixture(run:(f:Fixture)=>Promise<void>){
  const originalFetch=globalThis.fetch,originalDispose=Texture.prototype.dispose,originalUpdate=Object.getOwnPropertyDescriptor(Texture.prototype,'needsUpdate')!,releases:(()=>void)[]=[],f:Fixture={urls:[],images:[],textures:[],disposed:[],guns:[],rigs:[],fail:null,
    make(index,mobile=false){const rig=createBillboardCharacter(typeof index==='number'?NPC_IDS[index]:index,mobile);f.rigs.push(rig);return rig;},
    async prepare(mobile=false,progress=()=>{},ids:readonly NpcIdentityId[]=NPC_IDS.slice(0,4),signal?:AbortSignal){const release=await prepareBillboards(ids,progress,mobile,signal);releases.push(release);return release;},
    async decode(bytes){const url=new TextDecoder().decode(bytes),match=url.match(/\/(jiang|meng|xu|luan|xutao|chengguotao)(-attack|-skill|-walk-a|-walk-b|-run-a|-run-b|-combat-walk-a|-combat-walk-b|-combat-run-a|-combat-run-b|-reload)?\.webp$/);assert.ok(match,url);
      const id=match[1] as NpcIdentityId,pose=(match[2]?.slice(1)??'idle') as NpcPose,def=NPC_IDENTITY[id];
      const shape=pose==='attack'||pose==='reload'||pose.startsWith('combat-')?(NPC_LAYOUT_COMBAT as any)[id][pose]:pose.startsWith('walk-')||pose.startsWith('run-')?NPC_LAYOUT_MOTION[id][pose as NpcMotionPose]:def.legacyLayout!==undefined?NPC_LAYOUT[def.legacyLayout][pose==='attack'?1:0]:NPC_LAYOUT_V13[id as 'xutao'|'chengguotao'][pose as 'idle'|'attack'|'skill'];
      const image={width:shape.w,height:shape.h};f.images.push(image);return image;},
  };
  (globalThis as any).billboardFixture=f;
  const paths=NPC_IDS.flatMap(id=>NPC_IDENTITY[id].poses.flatMap(pose=>[npcPoseFilename(id,pose,false),npcPoseFilename(id,pose,true)]));
  globalThis.fetch=async input=>{const url=String(input),logical=paths.find(path=>staticAssetUrl(path)===url)??url;f.urls.push(logical);if(f.fail&&logical.includes(f.fail))throw Error('fixture image failure');return new Response(new TextEncoder().encode(logical));};
  Texture.prototype.dispose=function(){if(f.images.includes(this.image))f.disposed.push(this);originalDispose.call(this);};
  Object.defineProperty(Texture.prototype,'needsUpdate',{...originalUpdate,set(value:boolean){if(value&&f.images.includes(this.image)&&!f.textures.includes(this))f.textures.push(this);originalUpdate.set!.call(this,value);}});
  try{await run(f);}finally{
    f.rigs.forEach(rig=>{if(rig.root.children.length)rig.dispose();});releases.forEach(release=>release());
    globalThis.fetch=originalFetch;Texture.prototype.dispose=originalDispose;Object.defineProperty(Texture.prototype,'needsUpdate',originalUpdate);delete (globalThis as any).billboardFixture;
  }
}
function planeOf(rig:Rig){return rig.root.children[0] as Mesh<import('three').BufferGeometry,MeshBasicMaterial>;}

test('NPC stays upright and camera facing while AI heading and shared portraits survive restart',async()=>fixture(async f=>{
  const progress:number[]=[],release=await f.prepare(false,p=>progress.push(p)),rig=f.make(0),camera=new PerspectiveCamera();
  assert.equal(f.urls.length,28);assert.equal(new Set(f.urls).size,28);assert.equal(progress.at(-1),1);
  rig.root.rotation.y=.7;camera.position.set(5,4,-2);rig.update(1/60,idle,6,camera);rig.root.updateMatrixWorld(true);
  const plane=planeOf(rig),normal=plane.getWorldDirection(new Vector3()),toward=new Vector3(5,0,-2).normalize();
  assert.equal(rig.root.rotation.y,.7);assert.ok(normal.distanceTo(toward)<1e-6);assert.equal(plane.rotation.x,0);assert.equal(plane.rotation.z,0);
  rig.dispose();assert.equal(f.disposed.length,0);assert.equal(f.guns[0].disposed,1);
  const next=f.make(0);next.dispose();assert.equal(f.urls.length,28);release();release();assert.equal(f.disposed.length,28);
}));

test('both native poses keep aspect ratio, grounded opaque feet and a 1.75m body',async()=>fixture(async f=>{
  await f.prepare();
  for(let index=0;index<4;index++){
    const rig=f.make(index);
    for(const variant of [0,1]){
      rig.update(0,{...idle,attackPhase:variant?'aim':'search'},5);
      const shape=variant?(NPC_LAYOUT_COMBAT as any)[NPC_IDS[index]].attack:NPC_LAYOUT[index][0],plane=planeOf(rig);plane.geometry.computeBoundingBox();const box=plane.geometry.boundingBox!;
      const width=box.max.x-box.min.x,height=box.max.y-box.min.y;
      const foot=box.min.y+height*(shape.h-shape.box[3])/shape.h,head=box.min.y+height*(shape.h-shape.box[1])/shape.h;
      assert.ok(Math.abs(width/height-shape.w/shape.h)<1e-6,`${IDs[index]} pose ${variant} has no stretching`);
      assert.ok(Math.abs(foot)<1e-6,`${IDs[index]} pose ${variant} has grounded shoes`);assert.ok(Math.abs(head-1.75)<1e-6);
    }
    rig.dispose();
  }
}));

test('attack swaps one opaque-tested portrait and lowers its firearm during reload or suppression',async()=>fixture(async f=>{
  await f.prepare();const rig=f.make(2),plane=planeOf(rig),normalGeometry=plane.geometry,normalMap=plane.material.map,gun=f.guns[0];
  rig.setWeapon('ak47');assert.equal(gun.id,'ak47');assert.equal(gun.lod,'far');
  rig.update(1/60,{...idle,aim:true,attackPhase:'aim',aimTarget:new Vector3(0,1,-3)},3);const attackGeometry=plane.geometry,attackMap=plane.material.map;
  assert.notEqual(attackMap,normalMap);assert.notEqual(attackGeometry,normalGeometry);assert.equal(gun.updates.at(-1)?.lowered,false);
  for(const attackPhase of ['fire','cooldown','aim'] as const){
    rig.update(1/60,{...idle,attackPhase,shotSerial:3},3);assert.equal(plane.geometry,attackGeometry);assert.equal(plane.material.map,attackMap);
  }
  assert.equal(rig.root.children.filter(child=>child instanceof Mesh&&child.material instanceof MeshBasicMaterial&&child.material.map).length,1);
  assert.equal(plane.material.transparent,false);assert.equal(plane.material.alphaTest,.5);assert.equal(plane.material.depthTest,true);assert.equal(plane.material.depthWrite,true);
  rig.update(1/60,{...idle,attackPhase:'reload',reloading:true,reloadProgress:.5},3);assert.equal(gun.updates.at(-1)?.lowered,true);assert.equal(gun.updates.at(-1)?.reloadProgress,.5);
  rig.update(1/60,{...idle,attackPhase:'suppressed',suppressed:10},3);assert.equal(plane.geometry,normalGeometry);assert.equal(plane.material.map,normalMap);assert.equal(gun.updates.at(-1)?.lowered,true);assert.ok(plane.scale.y<1);
  assert.ok(rig.getMuzzleWorld().toArray().every(Number.isFinite));
  let disposedGeometry=0;normalGeometry.addEventListener('dispose',()=>disposedGeometry++);attackGeometry.addEventListener('dispose',()=>disposedGeometry++);
  rig.dispose();assert.equal(disposedGeometry,2);assert.equal(gun.disposed,1);assert.equal(f.disposed.length,0);
}));

test('mobile preload is shared until the last lease releases all selected images',async()=>fixture(async f=>{
  const first=await f.prepare(true),second=await f.prepare(true);assert.equal(f.urls.length,28);assert.ok(f.urls.every(url=>url.includes('/mobile/')));
  first();assert.equal(f.disposed.length,0);const rig=f.make(3,true);rig.update(0,idle,1);rig.dispose();second();assert.equal(f.disposed.length,28);assert.equal(new Set(f.disposed).size,28);
  await f.prepare(true);assert.equal(f.urls.length,56);const next=f.make(1,true);next.dispose();
}));

test('failed attack image disposes completed downloads and fresh preload retries',async()=>fixture(async f=>{
  f.fail='meng-attack';await assert.rejects(f.prepare(),/人物图片未能载入/);await new Promise(resolve=>setImmediate(resolve));const attempts=f.urls.length,decoded=f.images.length,created=f.textures.length;assert.ok(attempts>0&&attempts<=28);assert.equal(f.disposed.length,created);assert.equal(billboardResourceDiagnostics().entries,0);
  assert.throws(()=>createBillboardCharacter('jiang'),/人物图片尚未准备好/);
  f.fail=null;const release=await f.prepare();assert.equal(f.urls.length,attempts+28);assert.equal(f.images.length,decoded+28);
  const rig=f.make(1);rig.update(0,{...idle,attackPhase:'aim'},3);rig.dispose();release();assert.equal(f.disposed.length,created+28);assert.equal(new Set(f.disposed).size,created+28);
}));

test('roam requests zero portraits and only a selected four load their 32 necessary poses',async()=>fixture(async f=>{
 const releaseRoam=await f.prepare(false,()=>{},[]);assert.equal(f.urls.length,0);releaseRoam();
 const roster=['jiang','meng','xutao','chengguotao'] as const;
 const release=await f.prepare(false,()=>{},roster);assert.equal(f.urls.length,32);
 assert.ok(f.urls.every(url=>!url.endsWith('/xu.webp')&&!url.endsWith('/luan.webp')));
 for(const id of ['xutao','chengguotao'] as const){
  const rig=f.make(id),plane=planeOf(rig),gun=f.guns.at(-1)!;
  assert.equal(rig.root.name,NPC_IDENTITY[id].name);assert.equal(gun.id,NPC_IDENTITY[id].weapon);
  const idleMap=plane.material.map;
  rig.update(0,{...idle,attackPhase:'aim'},3);const attackMap=plane.material.map;assert.notEqual(attackMap,idleMap);
  rig.update(0,{...idle,skill:NPC_IDENTITY[id].skill},3);const skillMap=plane.material.map;
  assert.notEqual(skillMap,idleMap);assert.notEqual(skillMap,attackMap);assert.equal(gun.updates.at(-1)?.lowered,true);
  for(const pose of ['idle','attack','skill'] as const){
   rig.update(0,{...idle,attackPhase:pose==='attack'?'aim':'search',skill:pose==='skill'?NPC_IDENTITY[id].skill:undefined},3);
   const shape=pose==='attack'?(NPC_LAYOUT_COMBAT as any)[id].attack:NPC_LAYOUT_V13[id][pose];plane.geometry.computeBoundingBox();const box=plane.geometry.boundingBox!,height=box.max.y-box.min.y;
   assert.ok(Math.abs(box.min.y+height*(shape.h-shape.box[3])/shape.h)<1e-6,id+' '+pose+' grounded feet');
   assert.ok(Math.abs(box.min.y+height*(shape.h-shape.box[1])/shape.h-1.75)<1e-6);
  }
  rig.update(0,{...idle,skill:NPC_IDENTITY[id].skill,suppressed:10},3);assert.equal(plane.material.map,idleMap);rig.dispose();
 }
 release();assert.equal(f.disposed.length,32);
}));

test('overlapping roster leases release only unused identities and rigs retain live art',async()=>fixture(async f=>{
 const first=await f.prepare(),second=await f.prepare(false,()=>{},['jiang','meng','xutao','chengguotao']);
 assert.equal(f.urls.length,46);first();assert.equal(f.disposed.length,14);
 const rig=f.make('xutao');second();assert.equal(f.disposed.length,36);
 rig.update(0,{...idle,skill:'sprint'},3);rig.dispose();assert.equal(f.disposed.length,46);
 second();rig.dispose();assert.equal(new Set(f.disposed).size,46);
}));

test('desktop and mobile pose storage stay independent across simultaneous leases',async()=>fixture(async f=>{
 const desktop=await f.prepare(false,()=>{},['xutao']),mobile=await f.prepare(true,()=>{},['xutao']);
 assert.equal(f.urls.length,20);const a=f.make('xutao'),b=f.make('xutao',true);
 assert.notEqual(planeOf(a).material.map,planeOf(b).material.map);
 desktop();a.dispose();assert.equal(f.disposed.length,10);b.update(0,idle,3);b.dispose();mobile();assert.equal(f.disposed.length,20);
}));

test('cancelled pending load discards late image decoding and never contaminates the next round',async()=>fixture(async f=>{
 const original=f.decode,completions:(()=>Promise<void>)[]=[];f.decode=(bytes,signal)=>new Promise(resolve=>{completions.push(async()=>resolve(await original(bytes,signal)));});
 const controller=new AbortController(),request=f.prepare(false,()=>{},['xutao'],controller.signal);
 while(!completions.length)await new Promise(resolve=>setImmediate(resolve));controller.abort();await assert.rejects(request,/人物图片未能载入/);
 assert.throws(()=>createBillboardCharacter('xutao'),/尚未准备好/);await Promise.all(completions.map(done=>done()));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.disposed.length,0,'late decoded images must never publish a texture');const before=f.images.length;f.decode=original;
 const retry=await f.prepare(false,()=>{},['xutao']);const rig=f.make('xutao');rig.dispose();retry();assert.equal(f.images.length,before+10);assert.equal(f.disposed.length,10);assert.equal(new Set(f.disposed).size,10);
}));

test('pre-aborted load does not create downloads or an active portrait cache',async()=>fixture(async f=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(f.prepare(false,()=>{},['xutao'],controller.signal),/中止/);
 assert.equal(f.urls.length,0);assert.throws(()=>createBillboardCharacter('xutao'),/尚未准备好/);
}));


test('every four-of-six combination renders the selected identities and their own firearms',async()=>fixture(async f=>{
 let checked=0;
 for(let a=0;a<3;a++)for(let b=a+1;b<4;b++)for(let c=b+1;c<5;c++)for(let d=c+1;d<6;d++){
  const roster=[NPC_IDS[a],NPC_IDS[b],NPC_IDS[c],NPC_IDS[d]],release=await f.prepare(false,()=>{},roster);
  const before=f.guns.length,rigs=roster.map(id=>f.make(id));
  for(let i=0;i<4;i++){
   assert.equal(rigs[i].root.name,NPC_IDENTITY[roster[i]].name);
   assert.equal(rigs[i].root.userData.identityId,roster[i]);
   assert.equal(f.guns[before+i].id,NPC_IDENTITY[roster[i]].weapon);
   rigs[i].update(0,{...idle,attackPhase:'aim'},5);assert.equal(f.guns[before+i].updates.at(-1)?.lowered,false);
  }
  rigs.forEach(rig=>rig.dispose());release();checked++;
 }
 assert.equal(checked,15);assert.equal(f.images.length,f.disposed.length);assert.equal(new Set(f.disposed).size,f.images.length);
}));


test('all six identities step through independently calibrated motion frames with grounded geometry and attached guns',async()=>fixture(async f=>{
 const release=await f.prepare(false,()=>{},NPC_IDS);assert.equal(f.urls.length,46);
 for(const id of NPC_IDS){
  const rig=f.make(id),plane=planeOf(rig),gun=rig.root.children.find(child=>child.name==='test-firearm')!;
  rig.update(.2,{...idle,speed:1.75},5);
  for(const [pose,speed,delta] of [['combat-walk-a',1.75,.35],['combat-walk-b',1.75,.35],['combat-run-a',3,.6],['combat-run-b',3,.6]] as const){
   if(pose==='combat-run-a')rig.update(.2,idle,5);
   rig.root.position.x+=delta;rig.update(.2,{...idle,speed},5);assert.equal(plane.userData.pose,pose,id+' '+pose);
   const shape=(NPC_LAYOUT_COMBAT as any)[id][pose];plane.geometry.computeBoundingBox();const bounds=plane.geometry.boundingBox!,height=bounds.max.y-bounds.min.y;
   assert.ok(Math.abs((bounds.max.x-bounds.min.x)/height-shape.w/shape.h)<1e-6,id+' '+pose+' native aspect');
   assert.ok(Math.abs(bounds.min.y+height*(shape.h-shape.box[3])/shape.h)<1e-6,id+' '+pose+' grounded body');
   assert.ok(Math.abs(bounds.min.y+height*(shape.h-shape.box[1])/shape.h-1.75)<1e-6,id+' '+pose+' calibrated height');
   const grip=gun.position.clone().add(new Vector3(.03,-.07,.06).applyQuaternion(gun.quaternion));assert.ok(grip.distanceTo(new Vector3(shape.hand[0],shape.hand[1]+plane.position.y,shape.hand[2]))<1e-6,id+' '+pose+' authored grip follows body bob');
   const headX=(shape.head[0]+shape.head[2])*.5,headY=(shape.head[1]+shape.head[3])*.5;
   const target=plane.localToWorld(new Vector3(bounds.min.x+(bounds.max.x-bounds.min.x)*headX/shape.w,bounds.min.y+height*(1-headY/shape.h),0));
   assert.ok(Number.isFinite(shape.anchorX),id+' '+pose+' stable head anchor');
   const anchored=plane.localToWorld(new Vector3(bounds.min.x+(bounds.max.x-bounds.min.x)*shape.anchorX/shape.w,bounds.min.y+height*(1-headY/shape.h),0));
   assert.ok(Math.abs(anchored.x-rig.root.position.x)<1e-6,id+' '+pose+' calibrated anchor stays horizontally aligned');
   assert.ok(Math.abs(headX-shape.anchorX)<=.5,id+' '+pose+' head anchor differs by at most half a native pixel');
   assert.ok(Math.abs(target.x-rig.root.position.x)<=height/shape.h*.5+1e-6,id+' '+pose+' head centre stays horizontally aligned');
   const hit=rig.hitTest(target.clone().add(new Vector3(0,0,2)),new Vector3(0,0,-1));assert.equal(hit?.region,'head',id+' '+pose+' frame-specific head hit');
  }
  rig.dispose();
 }
 release();assert.equal(f.disposed.length,46);assert.equal(new Set(f.disposed).size,46);
}));

test('combat refreshes preserve actual stepping; firing retains the moving body and suppression stops it',async()=>fixture(async f=>{
 const release=await f.prepare(false,()=>{},['jiang']),rig=f.make('jiang'),plane=planeOf(rig);
 rig.update(.1,{...idle,speed:2},5);rig.root.position.x=.2;rig.update(.1,{...idle,speed:2},5);assert.equal(plane.userData.pose,'combat-walk-a');
 const movingMap=plane.material.map,bob=plane.position.y;
 rig.update(0,idle,5);assert.equal(plane.material.map,movingMap);assert.equal(plane.position.y,bob);
 rig.update(.1,{...idle,speed:2},5);assert.equal(plane.userData.pose,'idle');assert.equal(plane.position.y,0);
 rig.root.position.x=.4;rig.update(.1,{...idle,speed:2,attackPhase:'aim'},5);assert.equal(plane.userData.pose,'combat-walk-a');assert.ok(plane.position.y>=0);
 rig.update(.1,{...idle,speed:2,suppressed:10,attackPhase:'fire'},5);assert.equal(plane.userData.pose,'idle');assert.equal(plane.position.y,0);assert.equal(f.guns.at(-1)?.updates.at(-1)?.lowered,true);
 rig.dispose();release();
}));

test('sprint preparation keeps its dedicated art but moving sprint legs alternate without raising a gun',async()=>fixture(async f=>{
 const release=await f.prepare(false,()=>{},['xutao']),rig=f.make('xutao'),plane=planeOf(rig);
 rig.update(.1,{...idle,skill:'sprint'},5);assert.equal(plane.userData.pose,'skill');
 rig.root.position.x=.54;rig.update(.1,{...idle,speed:5.4,skill:'sprint'},5);assert.equal(plane.userData.pose,'run-a');
 rig.root.position.x=1.08;rig.update(.1,{...idle,speed:5.4,skill:'sprint'},5);assert.equal(plane.userData.pose,'run-b');assert.equal(f.guns.at(-1)?.updates.at(-1)?.lowered,true);
 rig.update(.1,{...idle,skill:'sprint'},5);assert.equal(plane.userData.pose,'skill');rig.dispose();release();
}));
test('移动开火保持持枪步态与枪口资格，换弹和技能同步降枪',async()=>fixture(async f=>{
 const release=await f.prepare(false,()=>{},['jiang']),rig=f.make('jiang'),plane=planeOf(rig),target=new Vector3(1,1.3,-10);
 rig.update(.1,{...idle,speed:3.2,attackPhase:'aim',aimTarget:target},5);rig.root.position.x=.32;rig.update(.1,{...idle,speed:3.2,attackPhase:'aim',aimTarget:target},5);
 assert.equal(plane.userData.pose,'combat-run-a');const movingMap=plane.material.map,movingGeometry=plane.geometry;
 for(let serial=1;serial<=3;serial++){rig.update(0,{...idle,speed:3.2,attackPhase:'fire',firing:true,aimTarget:target,shotSerial:serial},5);assert.equal(plane.material.map,movingMap);assert.equal(plane.geometry,movingGeometry);assert.equal(rig.isAimReady(target),true);}
 assert.ok(rig.getMuzzleDirectionWorld().toArray().every(Number.isFinite));assert.ok(rig.getEjectionWorld().toArray().every(Number.isFinite));
 rig.update(.1,{...idle,reloading:true,attackPhase:'reload',aimTarget:target},5);assert.equal(plane.userData.pose,'reload');assert.equal(rig.isAimReady(target),false);assert.equal(f.guns.at(-1)?.updates.at(-1)?.lowered,true);
 rig.update(.1,{...idle,suppressed:10,attackPhase:'fire'},5);assert.equal(rig.getAimReady(),false);assert.equal(plane.userData.pose,'idle');rig.dispose();release();
}));


test('姜晓峰六种新姿态的足底、原始比例、头部命中和真实握把逐张对齐',async()=>fixture(async f=>{
 const release=await f.prepare(false,()=>{},['jiang']),rig=f.make('jiang'),plane=planeOf(rig),gun=rig.root.children.find(c=>c.name==='test-firearm')!,camera=new PerspectiveCamera();camera.position.set(3,2,-2);rig.root.rotation.y=.7;
 const verify=(pose:string)=>{
  assert.equal(plane.userData.pose,pose);const row=(NPC_LAYOUT_COMBAT as any).jiang[pose];plane.geometry.computeBoundingBox();const b=plane.geometry.boundingBox!,height=b.max.y-b.min.y,width=b.max.x-b.min.x;
  assert.ok(Math.abs(width/height-row.w/row.h)<1e-6,pose+' native aspect');assert.ok(Math.abs(b.min.y+height*(row.h-row.box[3])/row.h)<1e-6,pose+' grounded foot');assert.ok(Math.abs(b.min.y+height*(row.h-row.box[1])/row.h-1.75)<1e-6,pose+' full standing extent');
  const desired=new Vector3(row.hand[0],row.hand[1]*plane.scale.y+plane.position.y,row.hand[2]).applyAxisAngle(new Vector3(0,1,0),plane.rotation.y),grip=gun.position.clone().add(new Vector3(.03,-.07,.06).applyQuaternion(gun.quaternion));assert.ok(grip.distanceTo(desired)<1e-6,pose+' independent portrait-facing grip');
  const headX=(row.head[0]+row.head[2])*.5,headY=(row.head[1]+row.head[3])*.5,head=plane.localToWorld(new Vector3(b.min.x+width*headX/row.w,b.min.y+height*(1-headY/row.h),0)),normal=plane.getWorldDirection(new Vector3());assert.equal(rig.hitTest(head.clone().addScaledVector(normal,2),normal.negate())?.region,'head',pose+' facing head ray');
  const before=gun.position.clone();rig.update(0,{...idle,speed:0,attackPhase:pose==='attack'?'aim':pose==='reload'?'reload':'fire',reloading:pose==='reload'},5,camera);assert.ok(gun.position.distanceTo(before)<1e-6,pose+' zero-dt alignment never accumulates an offset');
 };
 rig.update(.2,{...idle,attackPhase:'aim'},5,camera);verify('attack');
 rig.update(.2,{...idle,reloading:true,attackPhase:'reload'},5,camera);verify('reload');
 rig.update(.2,{...idle,speed:1.75},5,camera);
 for(const [pose,speed,delta]of [['combat-walk-a',1.75,.35],['combat-walk-b',1.75,.35],['combat-run-a',3,.6],['combat-run-b',3,.6]] as const){if(pose==='combat-run-a')rig.update(.2,idle,5,camera);rig.root.position.x+=delta;rig.update(.2,{...idle,speed,attackPhase:'fire'},5,camera);verify(pose);}
 rig.dispose();release();
}));
