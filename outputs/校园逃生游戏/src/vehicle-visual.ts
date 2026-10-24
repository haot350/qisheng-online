import {staticAssetUrl} from './static-assets.ts';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {withDeadline} from './network.ts';
import {ResourceLeases,resourceWorkQueue,fetchResource,waitForResource,abortResource} from './resource-leases.ts';
import type {VehicleState} from './vehicle-physics.ts';
import {vehicleDefinition,type DrivingVehicleId} from './vehicles.ts';
export interface VehicleVisual {root:THREE.Group;update(state:VehicleState,dt:number):void;aim?(yaw:number,pitch:number):void;muzzle?():{position:THREE.Vector3;direction:THREE.Vector3};dispose():void;}
function release(root:THREE.Object3D){
 const geometry=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
 root.traverse(o=>{if(o instanceof THREE.Mesh){geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
 geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}
const vehicleResources=new ResourceLeases<THREE.Group>((url,signal)=>resourceWorkQueue.run(signal,async()=>{
 const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),bytes=await withDeadline(fetchResource(url,signal),30000,{signal});
 const loaded=await withDeadline(loader.parseAsync(bytes,url.slice(0,url.lastIndexOf('/')+1)),30000,{signal,onLate:g=>release(g.scene)});if(signal.aborted){release(loaded.scene);abortResource(signal);}
 return loaded.scene;
}),release);
/** Local -Z points forward; source dimensions are metres, root is the road anchor. */
export async function createVehicleVisual(scene:THREE.Scene,signal?:AbortSignal,vehicleId:DrivingVehicleId='bao5'):Promise<VehicleVisual>{
 const VEHICLE=vehicleDefinition(vehicleId);
 if(signal?.aborted)throw new DOMException('Cancelled','AbortError');const lease=vehicleResources.acquire(staticAssetUrl(VEHICLE.assetUrl)),abort=()=>lease.release();signal?.addEventListener('abort',abort,{once:true});let source:THREE.Group;
 try{source=await waitForResource(lease.value,signal);if(signal?.aborted)throw new DOMException('Cancelled','AbortError');}catch(error){lease.release();throw error;}finally{signal?.removeEventListener('abort',abort);}
 const model=source.clone(true),root=new THREE.Group();root.name=VEHICLE.model;root.add(model);root.updateMatrixWorld(true);
 const wheels=VEHICLE.wheelNames.map(name=>model.getObjectByName(name));
 if(wheels.some(w=>!w)){lease.release();throw new Error('载具资源不完整，请重新准备。');}
 const turret=model.getObjectByName('turret'),gun=model.getObjectByName('gun');
 if(vehicleId==='tank'&&(!turret||!gun)){lease.release();throw new Error('坦克装备不完整，请重新准备。');}
 // Give physics full control of wheel suspension/steering/spin, independent of the body.
 for(const wheel of wheels)root.attach(wheel!);
 root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=false;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial)m.envMapIntensity=.7;}});
 scene.add(root);let disposed=false;const inverse=new THREE.Quaternion(),axle=new THREE.Vector3(),steer=new THREE.Quaternion(),roll=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
 return {root,
  update(state,_dt){
   if(disposed)return;root.position.copy(state.position);root.quaternion.copy(state.rotation);root.updateMatrixWorld(true);root.getWorldQuaternion(inverse).invert();
   for(let i=0;i<wheels.length;i++){const wheel=wheels[i]!,physical=state.wheels[i];if(!physical)continue;wheel.position.copy(physical.position);root.worldToLocal(wheel.position);wheel.quaternion.copy(inverse).multiply(physical.rotation);
    // Rapier's axle convention and this -Z-forward mesh give opposite roll signs.
    // Keep steering around Y, reversing only the spin around the wheel's X axle.
    axle.set(1,0,0).applyQuaternion(wheel.quaternion);steer.setFromAxisAngle(up,Math.atan2(-axle.z,axle.x));roll.copy(steer).invert().multiply(wheel.quaternion).invert();wheel.quaternion.copy(steer).multiply(roll);
   }
   root.updateMatrixWorld(true);
  },
  aim(yaw,pitch){if(turret)turret.rotation.y=yaw;if(gun)gun.rotation.x=pitch;root.updateMatrixWorld(true);},
  muzzle(){const point=new THREE.Vector3(0,0,-2.18),direction=new THREE.Vector3(0,0,-1);if(gun){gun.localToWorld(point);direction.transformDirection(gun.matrixWorld);}else{root.localToWorld(point);direction.transformDirection(root.matrixWorld);}return{position:point,direction};},
  dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.clear();lease.release();}
 };
}
