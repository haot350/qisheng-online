/** Read-only source extraction; never opens or saves Blender. Idempotent on the pinned base. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {Matrix4,Vector3,Box3} from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {init,exportNavMesh,NavMeshQuery} from 'recast-navigation';
import {generateSoloNavMesh} from 'recast-navigation/generators';
import {buildGameMapIndex} from './build-map-cache-index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'public/map'),base=path.join(root,'assets-source/map/v0.7.0-base'),docs=path.join(root,'docs/v0.7.0');
const expected={source:'7f64cf655c54e6c8e4d1c55869855c9bf8a3624eb8ab633b56ed159627f86c66',collision:'ecc81da96f23b1b7c96ba4830debc74d8ed9e2595373c7c364ae65120114aab6',navigation:'262ebb8b8b402d5063ad51a1fdea4b44becb4b41448208aeef727777d3a66b8c',manifest:'7f05feb405066fbb7b03065d0ff1536e88b7b1b2a678f54caf4a778845ae6146'};
const sha=b=>createHash('sha256').update(b).digest('hex');
await fs.mkdir(base,{recursive:true});await fs.mkdir(docs,{recursive:true});
for(const name of ['collision.bin','navigation.bin','manifest.json']){
 const target=path.join(base,name);try{await fs.access(target);}catch{await fs.copyFile(path.join(out,name),target);}
 const key=name.split('.')[0];if(sha(await fs.readFile(target))!==expected[key])throw Error('Pinned base mismatch: '+name);
}
const manifest=JSON.parse(await fs.readFile(path.join(base,'manifest.json'),'utf8'));if(manifest.sourceSha256!==expected.source)throw Error('Blender source mismatch');
const source=path.resolve(root,'../校园交互网站/assets-work/raw-models/campus-base.glb'),sourceBytes=await fs.readFile(source);
const blender=path.resolve(root,'../总模型_南楼室内整合_v16',manifest.source);const blenderHash=sha(await fs.readFile(blender));if(blenderHash!==expected.source)throw Error('Original Blender changed; recalibration required');
await Promise.all([MeshoptDecoder.ready,RAPIER.init(),init()]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}),doc=await io.read(source),collisionSource=await io.read(path.join(path.dirname(source),'campus-v16-collision.glb'));
const existing=new Set(collisionSource.getRoot().listNodes().filter(n=>n.getMesh()).map(n=>n.getExtras().sourceObject??n.getName()));
const original=await fs.readFile(path.join(base,'collision.bin')),header=new Uint32Array(original.buffer,original.byteOffset,2),positions=Array.from(new Float32Array(original.buffer,original.byteOffset+8,header[0])),indices=Array.from(new Uint32Array(original.buffer,original.byteOffset+8+header[0]*4,header[1]));
const physics=new RAPIER.World({x:0,y:0,z:0});physics.createCollider(RAPIER.ColliderDesc.trimesh(Float32Array.from(positions),Uint32Array.from(indices),RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES));physics.step();
const visionPositions=[],visionIndices=[],objects=[],coverage=[];
const bark=/树干|树皮|trunk|bark/i,dense=/修剪灌木|灌木|绿篱/,foliage=/叶|绿植|树冠|植被|草绿/,pool=/石材池壁|种植土|右侧长花池$/;
function extract(node,primitive){const matrix=new Matrix4().fromArray(node.getWorldMatrix()),p=primitive.getAttribute('POSITION'),a=[],temp=[],v=new Vector3();if(!p)return null;for(let i=0;i<p.getCount();i++){p.getElement(i,temp);v.fromArray(temp).applyMatrix4(matrix);a.push(v.x,v.y,v.z);}return {positions:a,indices:Array.from(primitive.getIndices()?.getArray()??Uint32Array.from({length:p.getCount()},(_,i)=>i))};}
function append(targetP,targetI,geometry){const offset=targetP.length/3;targetP.push(...geometry.positions);for(const index of geometry.indices)targetI.push(index+offset);}
function bounds(geometry){const box=new Box3();for(let i=0;i<geometry.positions.length;i+=3)box.expandByPoint(new Vector3().fromArray(geometry.positions,i));return {min:box.min.toArray(),max:box.max.toArray()};}
function coverageProbe(geometry){let missing=0,checked=0;const {positions:p,indices:ix}=geometry,a=new Vector3(),b=new Vector3(),c=new Vector3(),normal=new Vector3(),at=new Vector3();const stride=Math.max(3,Math.floor(ix.length/120/3)*3);for(let i=0;i<ix.length;i+=stride){a.fromArray(p,ix[i]*3);b.fromArray(p,ix[i+1]*3);c.fromArray(p,ix[i+2]*3);normal.copy(b).sub(a).cross(c.clone().sub(a));if(normal.lengthSq()<1e-10)continue;normal.normalize();at.copy(a).add(b).add(c).divideScalar(3).addScaledVector(normal,.12);const hit=physics.castRay(new RAPIER.Ray(at,normal.clone().negate()),.24,true,RAPIER.QueryFilterFlags.ONLY_FIXED);checked++;if(!hit)missing++;}return {checked,missing};}
for(const node of doc.getRoot().listNodes()){
 const mesh=node.getMesh();if(!mesh)continue;const name=node.getExtras().sourceObject??node.getName();
 for(const primitive of mesh.listPrimitives()){
  const material=primitive.getMaterial()?.getName()??'',geometry=extract(node,primitive);if(!geometry)continue;
  const facade=name==='教学楼二段_北向凹口门厅实体'&&!existing.has(name),guardrail=name==='V15_图书馆南采光井连续栏杆'&&!existing.has(name),hard=bark.test(material)||pool.test(name)&&!existing.has(name)||facade||guardrail;
  if(hard){const probe=coverageProbe(geometry);append(positions,indices,geometry);objects.push({object:name,material,kind:bark.test(material)?'tree-trunk':facade?'facade-solid':guardrail?'guardrail-solid':'planter-solid',triangles:geometry.indices.length/3,bounds:bounds(geometry),before:probe});}
  if(dense.test(name)&&foliage.test(material)&&!bark.test(material)&&!/花瓣|花朵|细枝/.test(material)){append(visionPositions,visionIndices,geometry);objects.push({object:name,material,kind:'vision-only-shrub',triangles:geometry.indices.length/3,bounds:bounds(geometry)});}
  if(!existing.has(name)&&/墙体|挡墙|实体|石材池壁|门厅/.test(name)&&!dense.test(name)){const probe=coverageProbe(geometry);coverage.push({object:name,material,bounds:bounds(geometry),...probe,patched:hard});}
 }
}
function binary(p,i){const bytes=Buffer.alloc(8+(p.length+i.length)*4);bytes.writeUInt32LE(p.length);bytes.writeUInt32LE(i.length,4);Buffer.from(Float32Array.from(p).buffer).copy(bytes,8);Buffer.from(Uint32Array.from(i).buffer).copy(bytes,8+p.length*4);return bytes;}
const collision=binary(positions,indices),vision=binary(visionPositions,visionIndices);
console.log('Generating navigation',indices.length/3,'triangles');
const options={cs:.12,ch:.08,walkableSlopeAngle:48,walkableHeight:22,walkableClimb:5,walkableRadius:3,minRegionArea:12,mergeRegionArea:30,maxEdgeLen:48,maxSimplificationError:1.0,detailSampleDist:6,detailSampleMaxError:1,bounds:[[-175,-3.5,-192],[90,27,2]]};
const result=generateSoloNavMesh(Float32Array.from(positions),Uint32Array.from(indices),options);if(!result.success)throw Error('Navigation bake failed');
const navigation=Buffer.from(exportNavMesh(result.navMesh)),query=new NavMeshQuery(result.navMesh),navChecks=[];
for(const point of [manifest.spawn,...manifest.npcSpawns,...manifest.clues.map(c=>c.position),...manifest.supplies.map(c=>c.position)]){const hit=query.findClosestPoint({x:point[0],y:point[1],z:point[2]},{halfExtents:{x:2,y:1.2,z:2}});navChecks.push({point,found:hit.success,distance:hit.success?Math.hypot(point[0]-hit.point.x,point[1]-hit.point.y,point[2]-hit.point.z):null});}
if(navChecks.some(c=>!c.found))throw Error('Existing navigation endpoint lost');
query.destroy();result.navMesh.destroy();
// Structure flags are derived from accepted visual chunks, not coarse zone boxes.
for(const chunk of manifest.chunks){const visual=await io.read(path.join(root,'public',chunk.url));let structure=chunk.kind==='interior';for(const node of visual.getRoot().listNodes()){const mesh=node.getMesh();if(!mesh)continue;const name=node.getExtras().sourceObject??node.getName();if(mesh.listPrimitives().some(p=>bark.test(p.getMaterial()?.getName()??''))||/楼|墙|实体|石材池壁|柱|挡|门厅|门扇|花池|建筑/.test(name))structure=true;}chunk.combatOccluder=structure;}
const patchHash=sha(Buffer.from(JSON.stringify(objects))),version='collision-fairness-0.7.0';
manifest.visionUrl='/map/vision.bin';manifest.physicsRevision=version;manifest.collisionPatch={version,sourceCollisionHash:expected.collision,sourceVisualHash:sha(sourceBytes),patchHash};
const report={version,sourceBlenderHash:blenderHash,sourceVisualHash:sha(sourceBytes),sourceCollisionHash:expected.collision,sourceNavigationHash:expected.navigation,collisionHash:sha(collision),navigationHash:sha(navigation),visionHash:sha(vision),originalTriangles:header[1]/3,patchedTriangles:indices.length/3,visionTriangles:visionIndices.length/3,objects,coverage,navChecks,limitations:['Visual foliage is not solid; only exact trunk, stone/soil, facade and the confirmed library lightwell guardrail source triangles were added.','Automated rays and navigation endpoints cannot establish every corner or continuous player route; real capsule route checks are separate.','No original Blender, original visual model, or closed fifth/basement area was edited.']};
await fs.writeFile(path.join(out,'collision.bin'),collision);await fs.writeFile(path.join(out,'navigation.bin'),navigation);await fs.writeFile(path.join(out,'vision.bin'),vision);await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');await fs.writeFile(path.join(docs,'collision-patch.json'),JSON.stringify(report,null,2)+'\n');
if(sha(await fs.readFile(blender))!==blenderHash)throw Error('Original Blender altered');
physics.free();console.log(await buildGameMapIndex(root));console.log(JSON.stringify({objects:objects.length,triangles:indices.length/3,visionTriangles:visionIndices.length/3,bytes:collision.length,visionBytes:vision.length}));
