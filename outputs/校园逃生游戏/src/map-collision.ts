import RAPIER from '@dimforge/rapier3d-compat';

const MAGIC=0x32435351;
const DELTA_MAGIC=0x33435351,MAX_COMPONENTS=12000000;
export interface MapCollisionGeometry {
  positions:Float32Array;
  indices:Uint32Array;
  /** Each cuboid is center XYZ, half extents XYZ, quaternion XYZW. */
  cuboids:Float32Array;
}

function readDeltaCollision(data:ArrayBuffer):MapCollisionGeometry{
 if(data.byteLength<24)throw Error('Invalid map collision size');
 const view=new DataView(data);if(view.getUint32(4,true)!==1)throw Error('Unsupported map collision revision');
 const components=view.getUint32(8,true),count=view.getUint32(12,true),positionBytes=view.getUint32(16,true),indexBytes=view.getUint32(20,true);
 if(components%3||count%3||components>MAX_COMPONENTS||count>MAX_COMPONENTS||positionBytes<components||positionBytes>components*5||indexBytes<count||indexBytes>count*5||24+positionBytes+indexBytes!==data.byteLength)throw Error('Invalid map collision ranges');
 const bytes=new Uint8Array(data),positions=new Float32Array(components),indices=new Uint32Array(count),previous=[0,0,0];let offset=24;
 const number=(end:number)=>{
  let value=0,factor=1;
  for(let n=0;n<5;n++){
   if(offset>=end)throw Error('Truncated map collision delta');
   const byte=bytes[offset++];value+=(byte&127)*factor;
   if(value>8589934590)throw Error('Map collision delta overflow');
   if(!(byte&128)){if(n>0&&(byte&127)===0)throw Error('Noncanonical map collision delta');return value%2===0?value/2:-(value+1)/2;}
   factor*=128;
  }
  throw Error('Unterminated map collision delta');
 };
 const positionEnd=24+positionBytes;
 for(let k=0;k<components;k++){const axis=k%3,value=previous[axis]+number(positionEnd);if(value< -2147483648||value>2147483647)throw Error('Map collision position overflow');previous[axis]=value;positions[k]=value/10000;}
 if(offset!==positionEnd)throw Error('Invalid map collision position stream');
 let index=0;const indexEnd=positionEnd+indexBytes;
 for(let k=0;k<count;k++){index+=number(indexEnd);if(index<0||index>=components/3)throw Error('Invalid map collision triangle');indices[k]=index;}
 if(offset!==indexEnd)throw Error('Invalid map collision index stream');
 return{positions,indices,cuboids:new Float32Array(0)};
}

/** Legacy triangle binaries remain readable for rollback and old samples. */
export function readMapCollision(data:ArrayBuffer):MapCollisionGeometry {
  if(data.byteLength<8||data.byteLength>128*1024*1024)throw Error('Invalid map collision size');
  if(new DataView(data).getUint32(0,true)===DELTA_MAGIC)return readDeltaCollision(data);
  if(data.byteLength%4!==0)throw Error('Invalid map collision size');
  const view=new DataView(data),modern=view.getUint32(0,true)===MAGIC;
  if(modern&&(data.byteLength<20||view.getUint32(4,true)!==1))throw Error('Unsupported map collision revision');
  const offset=modern?20:8,vertices=view.getUint32(modern?8:0,true),indices=view.getUint32(modern?12:4,true),boxes=modern?view.getUint32(16,true):0;
  if(vertices%3||indices%3||vertices>12000000||indices>12000000||boxes>200000||offset+vertices*4+indices*4+boxes*40!==data.byteLength)throw Error('Invalid map collision ranges');
  const positions=new Float32Array(data,offset,vertices),triangles=new Uint32Array(data,offset+vertices*4,indices),cuboids=new Float32Array(data,offset+vertices*4+indices*4,boxes*10);
  for(const n of positions)if(!Number.isFinite(n))throw Error('Invalid map collision position');
  for(const id of triangles)if(id>=vertices/3)throw Error('Invalid map collision triangle');
  for(let k=0;k<cuboids.length;k+=10){for(let j=0;j<10;j++)if(!Number.isFinite(cuboids[k+j]))throw Error('Invalid map collision cuboid');if(cuboids[k+3]<=0||cuboids[k+4]<=0||cuboids[k+5]<=0||Math.abs(Math.hypot(cuboids[k+6],cuboids[k+7],cuboids[k+8],cuboids[k+9])-1)>.002)throw Error('Invalid map collision shape');}
  return{positions,indices:triangles,cuboids};
}

export function createMapColliders(world:RAPIER.World,geometry:MapCollisionGeometry){
  const meshCollider=geometry.indices.length?world.createCollider(RAPIER.ColliderDesc.trimesh(geometry.positions,geometry.indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)):null;
  const a=geometry.cuboids;
  for(let k=0;k<a.length;k+=10)world.createCollider(RAPIER.ColliderDesc.cuboid(a[k+3],a[k+4],a[k+5]).setTranslation(a[k],a[k+1],a[k+2]).setRotation({x:a[k+6],y:a[k+7],z:a[k+8],w:a[k+9]}));
  return{meshCollider,cuboidCount:a.length/10};
}
