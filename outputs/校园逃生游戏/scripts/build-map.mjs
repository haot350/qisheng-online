/** Read-only v16 derivative -> chunked web game, full-height collision and offline Recast. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {NodeIO,Document} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {weld,simplify,prune,dedup,flatten,join,meshopt,cloneDocument,unweld,mergeDocuments,textureCompress,unpartition} from '@gltf-transform/functions';
import sharp from 'sharp';
import {spatialSplit} from './spatial-split.mjs';
import {clipCourtyardTriangle} from './nav-ring-clip.mjs';
import {MeshoptEncoder,MeshoptSimplifier} from 'meshoptimizer';
import {Matrix4,Vector3,Box3} from 'three';
import {init,exportNavMesh,NavMeshQuery} from 'recast-navigation';
import {generateSoloNavMesh} from 'recast-navigation/generators';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.resolve(ROOT,'../校园交互网站/assets-work/raw-models/campus-base.glb');
const OUT=path.join(ROOT,'public/map');await fs.mkdir(OUT,{recursive:true});
await Promise.all([MeshoptEncoder.ready,MeshoptSimplifier.ready,init()]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder});
const sourceBytes=await fs.readFile(source);const doc=await io.read(source);
const sourceManifest=JSON.parse(await fs.readFile(path.resolve(ROOT,'../校园交互网站/assets-work/manifest-base-draft.json'),'utf8'));
if(sourceManifest.sourceVersion!=='v16'||sourceManifest.sourceSha256!=='7f64cf655c54e6c8e4d1c55869855c9bf8a3624eb8ab633b56ed159627f86c66')throw new Error('Expected authoritative v16 asset generation');
const floorHeights=[.61,4.32,8.34,12.36];
for(const filename of ['campus-south-structure.glb',...floorHeights.map((_,i)=>`campus-south-floor-${i+1}.glb`)]){
  const extra=await io.read(path.resolve(path.dirname(source),filename));
  if(filename==='campus-south-structure.glb'){for(const node of [...extra.getRoot().listNodes()])if(node.getExtras().role==='facade')node.dispose();await extra.transform(prune());}
  mergeDocuments(doc,extra);
}
const scenes=doc.getRoot().listScenes(),mainScene=scenes[0];
for(const extra of scenes.slice(1)){for(const child of extra.listChildren())mainScene.addChild(child);extra.dispose();}
doc.getRoot().setDefaultScene(mainScene);
const collider=await io.read(path.resolve(path.dirname(source),'campus-v16-collision.glb'));
// A read-only Blender export repairs the original outdoor support faces. Never
// infer new flat ground from render bounds or cover the sunken courtyard hole.
const supportPath=path.join(ROOT,'assets-source/map/campus-v16-support.glb');
let supportSourceHash;
try{
 const supportBytes=await fs.readFile(supportPath),support=await io.read(supportPath);
 const supportNodes=support.getRoot().listNodes().filter(n=>n.getMesh());
 if(supportNodes.some(n=>!n.getExtras().sourceObject||!n.getExtras().collisionProtected))throw new Error('Unexpected non-support mesh in collision supplement.');
 const replacements=new Set(supportNodes.map(n=>n.getExtras().sourceObject));
 for(const node of [...collider.getRoot().listNodes()])if(node.getMesh()&&replacements.has(node.getExtras().sourceObject))node.dispose();
 mergeDocuments(collider,support);supportSourceHash=crypto.createHash('sha256').update(supportBytes).digest('hex');
 console.log('Protected support objects',replacements.size);
}catch(error){if(error?.code!=='ENOENT')throw error;}

if(!process.argv.includes('--physics-only'))spatialSplit(doc);
const rows=[];const positions=[],indices=[],protectedStarts=new Set();const p0=new Vector3(),p1=new Vector3(),p2=new Vector3();
const nonSolid=/树|乔木|灌木|叶|植被|花卉|地被|树冠|窗框|分缝|拼缝|嵌带|标线|边线|虚线|题字|校名|灯|雨管|落水管|螺栓|固定卡|窗帘|窗后|窗台|球网|网格|防护网|排水|井盖|格栅|百叶|金属网|压条|细部|外机|扶栏与帘|石缝/;
const solidStructure=/地块|道路|沥青|路面|地坪|地面|底面|台阶|踏步|步梯|坐阶|缓坡|坡道|平台|挡墙|铺装|草地|草坪|绿地|绿岛|路缘|石边|勒脚|基座|基脚|台基|墙体|实墙|砖墙|内衬|内部体量|内部暗色体|暗衬|室内遮挡|首层|底层|立柱|砖柱|落地柱|边沿|压顶|八道红色跑道|八片红绿面层|网类场地$|双侧拱形幕墙|三组双开门|门扇|门禁|文化石|抬高楼板|楼板及退后内墙/;
const removeRender=/铺装细分缝|铺装分缝|石材分缝|坐阶拼缝|深色墙基砌缝|球场分区排水篦子|内圈排水沟与盖板|逐块浅灰石板|入口轴线广场砖|条叶|螺栓|固定卡|球台红色弧形支架|六组外机|窗后扶栏与帘/;
const bounds=new Box3();
for(const node of doc.getRoot().listNodes()) {
  const mesh=node.getMesh();if(!mesh)continue;
  const name=node.getName(),box=new Box3(),m=new Matrix4().fromArray(node.getWorldMatrix());let tris=0;
  const worldPrims=[];
  for(const prim of mesh.listPrimitives()) {const a=prim.getAttribute('POSITION');if(!a)continue;const arr=new Float32Array(a.getCount()*3),tmp=[];
    for(let i=0;i<a.getCount();i++){a.getElement(i,tmp);p0.fromArray(tmp).applyMatrix4(m);p0.toArray(arr,i*3);box.expandByPoint(p0);}
    const idx=prim.getIndices()?.getArray()??Uint32Array.from({length:a.getCount()},(_,i)=>i);tris+=idx.length/3;worldPrims.push({arr,idx});
  }
  rows.push({name,zone:node.getExtras().zoneId??'core',triangles:tris,min:box.min.toArray(),max:box.max.toArray()});bounds.union(box);
  // Visual geometry never determines collision by fragile object-name heuristics.
  const center=box.getCenter(new Vector3());
  const inheritedFloor=node.getExtras().floor;
  const kind=inheritedFloor?'interior':'exterior';
  node.setExtras({...node.getExtras(),kind,building:inheritedFloor?'south-teaching':undefined,gameZone:inheritedFloor?`interior_floor_${inheritedFloor}_${Math.floor(center.x/32)}_${Math.floor(center.z/32)}`:`${node.getExtras().zoneId??'core'}_${Math.floor(center.x/32)}_${Math.floor(center.z/32)}`});
  if(removeRender.test(name)||name.includes('校外道路'))node.dispose();
}
// Dedicated source contains structural triangles and inexpensive desk/cabinet proxies.
for(const node of collider.getRoot().listNodes()){
 const mesh=node.getMesh();if(!mesh)continue;const matrix=new Matrix4().fromArray(node.getWorldMatrix()),protectedSupport=!!node.getExtras().collisionProtected;
 for(const primitive of mesh.listPrimitives()){
  const position=primitive.getAttribute('POSITION'),offset=positions.length/3,tmp=[];
  for(let i=0;i<position.getCount();i++){position.getElement(i,tmp);p0.fromArray(tmp).applyMatrix4(matrix);positions.push(p0.x,p0.y,p0.z);}
  const index=primitive.getIndices()?.getArray()??Uint32Array.from({length:position.getCount()},(_,i)=>i);
  for(let i=0;i<index.length;i+=3){p0.fromArray(positions,(offset+index[i])*3);p1.fromArray(positions,(offset+index[i+1])*3);p2.fromArray(positions,(offset+index[i+2])*3);
   if(Math.max(p0.y,p1.y,p2.y)<-3||Math.min(p0.y,p1.y,p2.y)>16.5)continue;
   if(['VR校准_庭院地坪与三色步道','VR校准_环形上沿步道'].includes(node.getExtras().sourceObject)){for(const triangle of clipCourtyardTriangle([p0.toArray(),p1.toArray(),p2.toArray()])){const next=positions.length/3;positions.push(...triangle.flat());if(protectedSupport)protectedStarts.add(indices.length);indices.push(next,next+1,next+2);}}else{if(protectedSupport)protectedStarts.add(indices.length);indices.push(offset+index[i],offset+index[i+1],offset+index[i+2]);}
  }
 }
}
function boxMesh(min,max){const o=positions.length/3;positions.push(min[0],min[1],min[2], max[0],min[1],min[2], max[0],max[1],min[2],min[0],max[1],min[2],min[0],min[1],max[2],max[0],min[1],max[2],max[0],max[1],max[2],min[0],max[1],max[2]);for(const i of [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5])indices.push(o+i);}
// Preserve the original entry plaza's actual 50m x42m hardscape as a cheap solid
// contact slab. Its individual brick object does not match structural wall names.
const entryPlaza=rows.find(r=>r.name==='web_综合楼_入口轴线广场砖');if(!entryPlaza)throw new Error('Missing v16 entrance plaza');boxMesh(entryPlaza.min,entryPlaza.max);
// Continuous fence proxies cannot be slipped between decorative bars. They match source campus perimeter.
boxMesh([-175.2,-.2,-192.2],[-173.9,3.1,2.2]);boxMesh([89.7,-.2,-192.2],[90.4,3.1,2.2]);
boxMesh([-175.2,-.2,-192.4],[90.4,3.1,-191.8]);boxMesh([-175.2,-.2,1.85],[-15.5,3.1,2.3]);boxMesh([15.5,-.2,1.85],[90.4,3.1,2.3]);
// The gate is the extraction limit; players remain on the campus side of its real closed gates.
boxMesh([-15.5,-.2,-3.55],[15.5,2.0,-3.1]);
// The unbuilt library/canteen basements remain enclosed by their real safety rail edges.
for(const [xmin,xmax,zmin,zmax] of [[-15,-3.5,-126.6,-120.5],[3.5,15,-126.6,-120.5],[-16.8,-7.7,-149.3,-136.8],[7.7,16.8,-149.3,-136.8]]){
  boxMesh([xmin,-3.4,zmin],[xmax,1.3,zmin+.13]);boxMesh([xmin,-3.4,zmax-.13],[xmax,1.3,zmax]);boxMesh([xmin,-3.4,zmin],[xmin+.13,1.3,zmax]);boxMesh([xmax-.13,-3.4,zmin],[xmax,1.3,zmax]);
}
// Closed buildings keep source proxy volumes; south teaching interiors are explicitly opened.
for(const r of rows.filter(r=>/内部暗色体|短回翼暗衬|室内遮挡|主体内衬|退后内衬|内部体量|后侧走廊内部/.test(r.name)&&!r.name.includes('教学楼一段_')))boxMesh([r.min[0],-.2,r.min[2]],[r.max[0],Math.max(4,r.max[1]),r.max[2]]);
boxMesh([-11.65,0,-120.4],[14.8,14,-87.7]);
// Four original fourteen-tread aisles: a ramp proxy smooths contact across 18cm risers.
// The visual steps stay unchanged; the proxy follows their exact radial span and endpoints.
for(const degrees of [-131,-55,55,131]){const a=degrees*Math.PI/180,half=.047,o=positions.length/3;
  for(const [r,y,t] of [[8.75,-2.35,a-half],[18.55,.18,a-half],[18.55,.18,a+half],[8.75,-2.35,a+half]])positions.push(44+r*Math.cos(t),y,-124-r*Math.sin(t));
  indices.push(o,o+1,o+2,o,o+2,o+3);
}
// Collision ignores UV and hard-normal seams. Weld coincident positions and collapse coplanar
// faces within 2cm; this keeps steps/holes but avoids sending decorative render topology to Rapier.
const cv=[],ci=[],protectedCi=[],vertexMap=new Map(),faceMap=new Map();
for(let i=0;i<indices.length;i+=3){const t=[];for(let j=0;j<3;j++){const off=indices[i+j]*3,v=positions.slice(off,off+3),key=v.map(x=>Math.round(x*10000)).join(',');let index=vertexMap.get(key);if(index===undefined){index=cv.length/3;vertexMap.set(key,index);cv.push(...v);}t.push(index);}if(new Set(t).size<3)continue;const key=[...t].sort((a,b)=>a-b).join(','),previous=faceMap.get(key);if(previous){previous.protected||=protectedStarts.has(i);continue;}faceMap.set(key,{triangle:t,protected:protectedStarts.has(i)});}
for(const face of faceMap.values())(face.protected?protectedCi:ci).push(...face.triangle);
const cvTyped=new Float32Array(cv),ciTyped=new Uint32Array(ci);
const [regularCollision]=MeshoptSimplifier.simplify(ciTyped,cvTyped,3,Math.floor(ciTyped.length*.18/3)*3,.02,['ErrorAbsolute']);
const simpleCollision=new Uint32Array([...regularCollision,...protectedCi]);
const remap=new Map(),compact=[];const idx=new Uint32Array(simpleCollision.length);
for(let i=0;i<simpleCollision.length;i++){const old=simpleCollision[i];let n=remap.get(old);if(n===undefined){n=compact.length/3;remap.set(old,n);compact.push(...cv.slice(old*3,old*3+3));}idx[i]=n;}
const pos=new Float32Array(compact);
const header=new Uint32Array([pos.length,idx.length]);
await fs.writeFile(path.join(OUT,'collision.bin'),Buffer.concat([Buffer.from(header.buffer),Buffer.from(pos.buffer),Buffer.from(idx.buffer)]));
console.log('Collision triangles',idx.length/3,'vertices',pos.length/3);
await fs.writeFile(path.join(ROOT,'docs/collision-support-build-v1.1.json'),JSON.stringify({sourceVersion:'v16',sourceSha256:sourceManifest.sourceSha256,supportSourceHash,protectedTriangles:protectedCi.length/3,otherTriangles:regularCollision.length/3,collisionTriangles:idx.length/3,collisionBytes:8+pos.byteLength+idx.byteLength,courtyardOpening:'18.55m original disk; seven seating levels and four actual stair aisles retained'},null,2));
// Reserve 0.36m around walls for the 0.30m capsule plus its 0.015m contact
// skin and voxel corners. An exact-radius bake produced physically blocked
// canteen corners even though Recast reported a complete route.
const navOptions={cs:.12,ch:.08,walkableSlopeAngle:48,walkableHeight:22,walkableClimb:5,walkableRadius:3,minRegionArea:12,mergeRegionArea:30,maxEdgeLen:48,maxSimplificationError:1.0,detailSampleDist:6,detailSampleMaxError:1,bounds:[[-175,-3.5,-192],[90,27,2]]};
const baked=generateSoloNavMesh(pos,idx,navOptions);if(!baked.success)throw new Error(baked.error);
await fs.writeFile(path.join(OUT,'navigation.bin'),exportNavMesh(baked.navMesh));const query=new NavMeshQuery(baked.navMesh);
function nearest(a){const r=query.findClosestPoint({x:a[0],y:a[1],z:a[2]},{halfExtents:{x:3,y:1.2,z:3}});if(!r.success)throw new Error('No walk surface near '+a);return [r.point.x,r.point.y,r.point.z];}
const spawn=nearest([0,.06,-15]);
const wanted=[['teaching','教学庭院',[-46,.2,-103]],['library','图书馆西侧',[-18,.16,-106]],['canteen','食堂北侧',[0,.16,-184]],['sports','运动场',[-118,.18,-95]],['dorm','宿舍下沉庭院',[45,-2.36,-124]]];
const checks=[];
const clues=wanted.map(([id,label,p])=>{const position=nearest(p);const route=query.computePath({x:spawn[0],y:spawn[1],z:spawn[2]},{x:position[0],y:position[1],z:position[2]});const end=route.path?.at(-1);const reached=route.success&&end&&Math.hypot(end.x-position[0],end.z-position[2])<1;checks.push({id,requested:p,position,pathPoints:route.path?.length??0,reached});if(!reached&&!process.argv.includes('--physics-only'))throw new Error('Clue unreachable: '+id+' '+JSON.stringify(checks));return {id,label,position};});
const npcSpawns=[[-24,.1,-65],[-78,.1,-90],[25,.1,-146],[54,.2,-151]].map(nearest);
const supplies=[['supply-teaching','教学区补给',[-24,.1,-100]],['supply-field','运动区补给',[-80,.1,-61]],['supply-dorm','宿舍区补给',[60,.2,-151]]].map(([id,label,p])=>({id,label,position:nearest(p)}));
const stairRecord=JSON.parse(await fs.readFile(path.resolve(ROOT,'../总模型_南楼室内整合_v16/整合与优化记录.json'),'utf8'));
const stairRoutes=stairRecord.stairs.routes.map(route=>({...route,points:route.points.map(([x,y,z])=>[x,z,-y])}));
const interiorChecks=[];
for(const route of stairRoutes){
 for(const reverse of [false,true]){
  const requested=reverse?[route.points.at(-1),route.points[0]]:[route.points[0],route.points.at(-1)];
  try{const start=nearest(requested[0]),end=nearest(requested[1]);const result=query.computePath({x:start[0],y:start[1],z:start[2]},{x:end[0],y:end[1],z:end[2]});const last=result.path?.at(-1);const reached=!!(result.success&&last&&Math.hypot(last.x-end[0],last.z-end[2])<.7&&Math.abs(last.y-end[1])<.45&&Math.abs(start[1]-requested[0][1])<.45&&Math.abs(end[1]-requested[1][1])<.45);interiorChecks.push({core:route.core,fromFloor:reverse?route.to_floor:route.from_floor,toFloor:reverse?route.from_floor:route.to_floor,reached,requested,start,end,path:result.path});}
  catch(error){interiorChecks.push({core:route.core,reached:false,error:String(error),requested});}
 }
}
const entryPoints=[[-31.65,.06,-86],[-31.65,.61,-80.5],[-51,.61,-77.4]];
for(let index=0;index<entryPoints.length-1;index++){try{const start=nearest(entryPoints[index]),end=nearest(entryPoints[index+1]);const result=query.computePath({x:start[0],y:start[1],z:start[2]},{x:end[0],y:end[1],z:end[2]});const last=result.path?.at(-1);interiorChecks.push({id:'entry-'+index,reached:!!(result.success&&last&&Math.hypot(last.x-end[0],last.z-end[2])<.7&&Math.abs(last.y-end[1])<.45),start,end,path:result.path});}catch(error){interiorChecks.push({id:'entry-'+index,reached:false,error:String(error)});}}
console.log('Interior navigation',JSON.stringify(interiorChecks.map(({path,...item})=>({...item,pathPoints:path?.length??0}))));
await fs.writeFile(path.join(ROOT,'docs/v16-interior-nav-checks.json'),JSON.stringify({entryPoints,stairRoutes,checks:interiorChecks},null,2));
console.log('Navigation checks',JSON.stringify(checks));
await fs.writeFile(path.join(ROOT,'docs/map-nav-checks.json'),JSON.stringify({navOptions,checks,npcSpawns},null,2));
query.destroy();baked.navMesh.destroy();
if(interiorChecks.some(item=>!item.reached)&&!process.argv.includes('--physics-only'))throw new Error('v16 interior nav connectivity failed');
if(process.argv.includes('--physics-only')){
 const previous=JSON.parse(await fs.readFile(path.join(OUT,'manifest.json'),'utf8'));
 if(previous.sourceSha256!==sourceManifest.sourceSha256)throw new Error('Cannot replace physics for a different source map.');
 Object.assign(previous,{spawn,npcSpawns,clues,supplies,extraction:spawn.slice(),physicsRevision:'v1.1-support-20261002',lowestOpenElevation:-2.55,supportSourceHash});
 await fs.writeFile(path.join(OUT,'manifest.json'),JSON.stringify(previous,null,2));process.exit(0);
}
await doc.transform(unpartition(),textureCompress({encoder:sharp,targetFormat:'webp',resize:[768,768],quality:78,effort:4}),prune(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:.34,error:.012,lockBorder:true}),dedup());
// Each zone is a separately fetched and culled chunk. Node metadata is consumed before merges.
const chunks=[];const zones=[...new Set(doc.getRoot().listNodes().filter(n=>n.getMesh()).map(n=>n.getExtras().gameZone))];
for(const zone of zones){const chunk=cloneDocument(doc);for(const n of [...chunk.getRoot().listNodes()])if(n.getMesh()&&n.getExtras().gameZone!==zone)n.dispose();
  await chunk.transform(prune(),flatten(),join(),prune(),dedup());
  let triangles=0,draws=0;const b=new Box3();for(const n of chunk.getRoot().listNodes()){const mesh=n.getMesh();if(!mesh)continue;const m=new Matrix4().fromArray(n.getWorldMatrix());for(const p of mesh.listPrimitives()){draws++;const a=p.getAttribute('POSITION'),tmp=[];triangles+=(p.getIndices()?.getCount()??a.getCount())/3;for(let i=0;i<a.getCount();i++){a.getElement(i,tmp);b.expandByPoint(p0.fromArray(tmp).applyMatrix4(m));}}}
  await chunk.transform(meshopt({encoder:MeshoptEncoder,level:'medium',quantizePosition:16,quantizeNormal:10,quantizeTexcoord:12}));
  const filename=`campus-${zone}.glb`;await io.write(path.join(OUT,filename),chunk);const s=await fs.stat(path.join(OUT,filename));const center=b.getCenter(new Vector3());const floorMatch=/^interior_floor_(\d)_/.exec(zone);chunks.push({url:'/map/'+filename,kind:floorMatch?'interior':'exterior',...(floorMatch?{floor:Number(floorMatch[1]),building:'south-teaching'}:{}),bounds:{min:b.min.toArray(),max:b.max.toArray()},center:center.toArray(),radius:b.getSize(new Vector3()).length()/2,triangles,draws,bytes:s.size});console.log('Chunk',zone,triangles,draws,s.size);
}
const manifest={version:2,source:sourceManifest.source.split(/[\\/]/).at(-1),sourceVersion:'v16',sourceSha256:sourceManifest.sourceSha256,derivativeSha256:crypto.createHash('sha256').update(sourceBytes).digest('hex'),chunks,collisionUrl:'/map/collision.bin',navmeshUrl:'/map/navigation.bin',physicsRevision:'v1.1-support-20261002',lowestOpenElevation:-2.55,supportSourceHash,floors:floorHeights.map((elevation,i)=>({id:i+1,elevation,bounds:{min:[-71.64,elevation-.2,-85.50],max:[-30.36,elevation+3.9,-69.4]}})),stairRoutes,spawn,spawnYaw:0,npcSpawns,clues,supplies,extraction:nearestPlaceholder(spawn),bounds:{min:[-175,-4,-192],max:[90,27,2]}};
function nearestPlaceholder(a){return a.slice();}
await fs.writeFile(path.join(OUT,'manifest.json'),JSON.stringify(manifest,null,2));
await fs.writeFile(path.join(ROOT,'docs/map-source-audit.json'),JSON.stringify(rows,null,2));
console.log('TOTAL',chunks.reduce((n,c)=>n+c.triangles,0),chunks.reduce((n,c)=>n+c.bytes,0));
