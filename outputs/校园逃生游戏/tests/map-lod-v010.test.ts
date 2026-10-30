import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MapScenePreparer,mapWarmupProxy} from '../src/map-scene-preparer.ts';
import {MapLodSelection} from '../src/map-lod-selection.ts';
import {ChunkStreamer} from '../src/streaming.ts';
import type {MapChunk} from '../src/types.ts';
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
const box=(x:number)=>({min:[x-1,0,-1],max:[x+1,3,1]}) as MapChunk['bounds'];
const group=(id:string,x:number):MapChunk[]=>['near','far'].map(lod=>({url:id+'-'+lod,lod:lod as 'near'|'far',lodGroup:id,lodBounds:box(x),bounds:box(x),center:[x,1,0],radius:2,kind:'exterior',residency:'structure',bytes:100,decodedGeometryBytes:1000}));

test('new map prepares one stable shell and nearby variant, not both LODs for every building',async()=>{
 const calls:string[]=[],chunks=[...group('nearby',4),...group('distant',180)];
 const s=new ChunkStreamer(chunks,async c=>{calls.push(c.url);return c.url;},()=>{});
 await s.initialize([0,0,0],()=>{});const release=await s.prepareCombat(new AbortController().signal);
 assert.deepEqual(calls.sort(),['distant-far','nearby-far','nearby-near']);
 for(let turn=0;turn<3;turn++)for(let yaw=0;yaw<Math.PI*2;yaw+=.1){
  s.setCombatViews([{origin:[0,1.6,0],direction:[Math.sin(yaw),0,Math.cos(yaw)],fov:78,aspect:1.8,far:420}]);
  assert.equal(s.update([0,0,0],[],true).blocked,false);await flush();
 }
 assert.equal(calls.filter(x=>x==='distant-near').length,0);
 assert.equal(s.visibleLod('nearby-near'),true);assert.equal(s.visibleLod('nearby-far'),false);
 release();s.dispose();
});

test('walking starts near preparation outside the switch distance and retains complete far geometry until ready',async()=>{
 const pending=new Map<string,(v:string)=>void>(),s=new ChunkStreamer(group('wall',40),c=>new Promise<string>(r=>pending.set(c.url,r)),()=>{});
 const init=s.initialize([0,0,0],()=>{});pending.get('wall-far')!('far');await init;
 s.update([8,0,0],[],false);assert.ok(pending.has('wall-near'));assert.equal(s.visibleLod('wall-far'),true);
 s.update([18,0,0],[],false);assert.equal(s.visibleLod('wall-far'),true);assert.equal(s.status().blocked,false);
 pending.get('wall-near')!('near');await flush();assert.equal(s.visibleLod('wall-near'),true);assert.equal(s.visibleLod('wall-far'),false);s.dispose();
});

test('room furniture requirements distinguish repeated floor numbers in different buildings',()=>{
 const make=(url:string,building:string,z:number):MapChunk=>({url,center:[0,5,z],radius:4,bounds:{min:[-3,4,z-3],max:[3,7,z+3]},kind:'interior',roomCore:true,residency:'detail',building,levelId:building+'-f2',floor:2});
 const south=make('south-furniture','south',0),north=make('north-furniture','north',80);
 const selection=new MapLodSelection([...group('shell',0),south,north]);
 const plan=selection.plan([0,4.3,0],true,[{id:2,buildingId:'south',levelId:'south-f2',elevation:4.3,bounds:box(0)!},{id:2,buildingId:'north',levelId:'north-f2',elevation:4.3,bounds:box(80)!}]);
 assert.ok(plan.required.some(c=>c.url==='south-furniture'));assert.ok(!plan.required.some(c=>c.url==='north-furniture'));
});

test('GPU preparation retains instance count, matrices, colors, vertex attributes and world transform',()=>{
 const geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial({vertexColors:true}),mesh=new THREE.InstancedMesh(geometry,material,2),root=new THREE.Group();
 root.position.set(2,3,4);root.add(mesh);mesh.position.set(1,0,0);mesh.setMatrixAt(0,new THREE.Matrix4().makeTranslation(20,0,0));mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(-5,0,3));mesh.setColorAt(0,new THREE.Color('red'));root.updateMatrixWorld(true);
 const proxy=mapWarmupProxy(mesh) as THREE.InstancedMesh;
 assert.equal(proxy.isInstancedMesh,true);assert.equal(proxy.count,2);assert.equal(proxy.instanceMatrix,mesh.instanceMatrix);assert.equal(proxy.instanceColor,mesh.instanceColor);assert.equal(proxy.geometry,geometry);assert.deepEqual(proxy.matrix.elements,mesh.matrixWorld.elements);geometry.dispose();material.dispose();
});

test('map preparation preserves glTF transparent alpha and depth semantics even at opacity 1',async()=>{
 const material=new THREE.MeshStandardMaterial({transparent:true,opacity:1,depthWrite:false}),geometry=new THREE.BoxGeometry(),root=new THREE.Group();root.add(new THREE.Mesh(geometry,material));
 const preparer=new MapScenePreparer(new THREE.Scene());await preparer.prepare(root,new AbortController().signal);
 assert.equal(material.transparent,true);assert.equal(material.depthWrite,false);preparer.dispose();geometry.dispose();material.dispose();
});
