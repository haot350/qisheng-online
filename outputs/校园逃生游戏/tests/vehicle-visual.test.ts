import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Scene,Mesh,Vector3,Quaternion,Box3} from 'three';
import {createVehicleVisual} from '../src/vehicle-visual.ts';
import {staticAssetUrl} from '../src/static-assets.ts';
function mockVehicleFiles(){const original=globalThis.fetch;globalThis.fetch=async input=>{assert.equal(String(input),staticAssetUrl(VEHICLE.assetUrl));return new Response(await readFile(new URL('../public'+VEHICLE.assetUrl,import.meta.url)));};return ()=>{globalThis.fetch=original;};}
import VEHICLE from '../src/vehicle-definition.json' with {type:'json'};
import RAPIER from '@dimforge/rapier3d-compat';
import {createDrivingPhysics,type DriveMap} from '../src/vehicle-physics.ts';
import type {DriveInput} from '../src/types.ts';
test('authored Bao 5 asset preserves agreed scale, independent wheel pivots, physics transforms and disposal',async()=>{
 const restoreFetch=mockVehicleFiles();
 const scene=new Scene();let visual:Awaited<ReturnType<typeof createVehicleVisual>>|undefined;
 try{
  visual=await createVehicleVisual(scene);const box=new Box3().setFromObject(visual.root),size=box.getSize(new Vector3());
  assert.ok(Math.abs(size.z-VEHICLE.dimensions.length)<.02);assert.ok(size.x>VEHICLE.dimensions.width&&size.x<VEHICLE.clearance.half[0]*2);assert.ok(Math.abs(size.y-VEHICLE.dimensions.height)<.02);assert.ok(Math.abs(box.min.y)<.01);
  const meshes:Mesh[]=[];visual.root.traverse(o=>{if(o instanceof Mesh)meshes.push(o);});
  const triangles=meshes.reduce((sum,m)=>sum+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0);assert.ok(triangles>=15000&&triangles<=35000);
  assert.ok(new Set(meshes.flatMap(m=>Array.isArray(m.material)?m.material:[m.material])).size<=6);assert.ok(meshes.length<=10);
  const wheel=visual.root.getObjectByName('wheel_fl')!,initial=wheel.getWorldPosition(new Vector3());assert.ok(initial.distanceTo(new Vector3(VEHICLE.physics.wheels[0][0],VEHICLE.visual.wheelCenterHeight,VEHICLE.physics.wheels[0][2]))<.001);
  for(const name of ['wheel_fl','wheel_fr','wheel_rl','wheel_rr'])assert.ok(visual.root.getObjectByName(name));
  const position=new Vector3(15,2,-4),rotation=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),1.1),steering=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.3),wheelPositions=VEHICLE.physics.wheels.map(p=>new Vector3(p[0],VEHICLE.visual.wheelCenterHeight,p[2]).applyQuaternion(rotation).add(position)),wheelRot=rotation.clone().multiply(steering).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),2.3)),expected=rotation.clone().multiply(steering).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-2.3));
  visual.update({position,rotation,yaw:1.1,speed:12,velocity:new Vector3(0,0,-12),lateralSpeed:0,slipAngle:0,handbrake:false,handbrakeAssist:0,wheelContacts:4,resetRequired:false,wheels:wheelPositions.map(p=>({position:p,rotation:wheelRot}))},.016);
  assert.ok(wheel.getWorldPosition(new Vector3()).distanceTo(wheelPositions[0])<.00001);assert.ok(wheel.getWorldQuaternion(new Quaternion()).angleTo(expected)<.00001,'spin correction preserves chassis pose and steering');
  let releases=0;for(const geometry of new Set(meshes.map(m=>m.geometry)))geometry.addEventListener('dispose',()=>releases++);
  visual.dispose();assert.equal(scene.children.length,0);assert.equal(releases,new Set(meshes.map(m=>m.geometry)).size);visual.dispose();assert.equal(scene.children.length,0);
 }finally{visual?.dispose();restoreFetch();}
});

test('actual forward and reverse driving rotate all visual tyre rims in the rolling direction',async()=>{
 await RAPIER.init();const restoreFetch=mockVehicleFiles();
 const world=new RAPIER.World({x:0,y:-18,z:0});world.createCollider(RAPIER.ColliderDesc.cuboid(200,.1,200).setTranslation(0,-.1,0));world.step();
 const map:DriveMap={version:12,spawn:[0,0,12],spawnYaw:0,npcSpawns:[],repairs:[],barriers:[],bounds:{min:[-200,-4,-200],max:[200,25,200]}};
 const car=createDrivingPhysics(world,map,new Map(),()=>world.createCharacterController(.015),()=>{}),visual=await createVehicleVisual(new Scene());
 const idle:DriveInput={steer:0,throttle:0,brake:0,handbrake:false,reverse:false,boost:false,reset:false},names=['wheel_fl','wheel_fr','wheel_rl','wheel_rr'];
 const tick=(input=idle)=>{car.beforeStep(input,false,1/60);world.timestep=1/60;world.step();car.afterStep(1/60);visual.update(car.read(),1/60);};
 const rotations=()=>names.map(name=>visual.root.getObjectByName(name)!.quaternion.clone());
 const checkRoll=(before:Quaternion[],sign:number)=>{const after=rotations();for(let i=0;i<4;i++){const delta=before[i].clone().invert().multiply(after[i]);if(delta.w<0)delta.set(-delta.x,-delta.y,-delta.z,-delta.w);const angle=2*Math.atan2(delta.x,delta.w);assert.ok(angle*sign>0,`wheel ${names[i]} rolls ${sign<0?'forward':'backward'}: ${angle}`);}};
 try{
  for(let i=0;i<120;i++)tick();for(let i=0;i<150;i++)tick({...idle,throttle:1});assert.ok(car.read().speed>4);let before=rotations();tick({...idle,throttle:1});checkRoll(before,-1);
  // At the bottom of a forward (-Z) moving tyre, negative X roll moves the rim
  // toward +Z relative to its centre, cancelling the body's road motion.
  for(let i=0;i<120;i++)tick({...idle,brake:1});for(let i=0;i<150;i++)tick({...idle,throttle:1,reverse:true});assert.ok(car.read().speed< -1);before=rotations();tick({...idle,throttle:1,reverse:true});checkRoll(before,1);
 }finally{visual.dispose();car.dispose();world.free();restoreFetch();}
});


test('vehicle preparation cancels its real pending download without attaching a partial car',async()=>{
 const original=globalThis.fetch,scene=new Scene(),controller=new AbortController();let signal:AbortSignal|undefined;globalThis.fetch=async(_url,options)=>{signal=options?.signal as AbortSignal;return new Promise((_,reject)=>signal!.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true}));};
 try{const work=createVehicleVisual(scene,controller.signal);while(!signal)await new Promise(resolve=>setImmediate(resolve));controller.abort();await assert.rejects(work,{name:'AbortError'});assert.equal(signal.aborted,true);assert.equal(scene.children.length,0);}finally{controller.abort();globalThis.fetch=original;}
});

test('two prepared cars share immutable meshes while wheel transforms and cancellation remain independent',async()=>{
 const original=globalThis.fetch;let requests=0;globalThis.fetch=async()=>{requests++;return new Response(await readFile(new URL('../public'+VEHICLE.assetUrl,import.meta.url)));};const aScene=new Scene(),bScene=new Scene();let a:Awaited<ReturnType<typeof createVehicleVisual>>|undefined,b:Awaited<ReturnType<typeof createVehicleVisual>>|undefined;
 try{[a,b]=await Promise.all([createVehicleVisual(aScene),createVehicleVisual(bScene)]);assert.equal(requests,1);const aWheel=a.root.getObjectByName('wheel_fl')!,bWheel=b.root.getObjectByName('wheel_fl')!;assert.notEqual(aWheel,bWheel);aWheel.position.x+=4;assert.notEqual(aWheel.position.x,bWheel.position.x);const mesh=(root:Scene|typeof a.root)=>{let value:Mesh|undefined;root.traverse(o=>{if(!value&&o instanceof Mesh)value=o;});return value!;};const geometry=mesh(a.root).geometry;assert.equal(geometry,mesh(b.root).geometry);let disposed=0;geometry.addEventListener('dispose',()=>disposed++);a.dispose();a=undefined;assert.equal(disposed,0);b.dispose();b=undefined;assert.equal(disposed,1);}finally{a?.dispose();b?.dispose();globalThis.fetch=original;}
});
