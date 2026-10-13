import RAPIER from '@dimforge/rapier3d-compat';

export type RayPoint = {x:number;y:number;z:number};

/** A separate query world: dense foliage affects perception, never movement or bullets. */
export class VisionGeometry {
 private world?: RAPIER.World;
 constructor(bytes?:ArrayBuffer){
  if(!bytes)return;
  if(bytes.byteLength<8)throw new Error('Invalid vision geometry');
  const [positions,indices]=new Uint32Array(bytes,0,2);
  if(positions%3||indices%3||bytes.byteLength!==8+(positions+indices)*4)throw new Error('Invalid vision geometry');
  const points=new Float32Array(bytes,8,positions),triangles=new Uint32Array(bytes,8+positions*4,indices);
  if(points.some(n=>!Number.isFinite(n))||triangles.some(n=>n>=positions/3))throw new Error('Invalid vision geometry');
  if(!indices)return;
  this.world=new RAPIER.World({x:0,y:0,z:0});
  this.world.createCollider(RAPIER.ColliderDesc.trimesh(points,triangles,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES));
  this.world.step();
 }
 rayDistance(origin:RayPoint,direction:RayPoint,max:number){return this.world?.castRay(new RAPIER.Ray(origin,direction),max,true,RAPIER.QueryFilterFlags.ONLY_FIXED)?.timeOfImpact??max;}
 dispose(){this.world?.free();this.world=undefined;}
}
