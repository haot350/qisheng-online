import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CampusGlassEnvironment,calibrateCampusGlass,campusGlassKind,glassReflectionSize,prepareCampusGlass,reflectionPixels} from '../src/campus-glass.ts';
import {SceneResources} from '../src/resources.ts';
import {decodePortraitMask,portraitPixelOpaque} from '../src/portrait-mask.ts';
// @ts-ignore The offline encoder remains a JavaScript build helper.
import {encodePortraitMask} from '../scripts/portrait-mask-codec.mjs';

test('glass semantics keep safety markings opaque and choose bounded reflection quality',()=>{
 const m=new THREE.MeshStandardMaterial();m.name='WEB_glass';assert.equal(campusGlassKind(m),'clear');
 m.userData.qsOpaqueSafety=true;assert.equal(campusGlassKind(m),null);
 assert.equal(glassReflectionSize({quality:'auto',mobile:true}),128);
 assert.equal(glassReflectionSize({quality:'smooth',mobile:false}),128);
 assert.equal(glassReflectionSize({quality:'high',mobile:true}),256);
 assert.equal(glassReflectionSize({quality:'ultra',mobile:false}),256);m.dispose();
});
test('one reflection survives chunk eviction, refreshes only on real changes, and leaves weapon environment intact',()=>{
 const scene=new THREE.Scene(),weaponEnvironment=new THREE.Texture();scene.environment=weaponEnvironment;
 let created=0,disposed=0;
 const env=new CampusGlassEnvironment(scene,{} as THREE.WebGLRenderer,{quality:'auto',mobile:true},(_renderer,pixels)=>{created++;const t=new THREE.WebGLRenderTarget(pixels.width*3/4,pixels.height*2);t.addEventListener('dispose',()=>disposed++);return t;});
 const glass=new THREE.MeshStandardMaterial({transparent:true,opacity:.42,roughness:.19,vertexColors:true});glass.name='WEB_glass';prepareCampusGlass(scene,glass);
 const first=glass.envMap;assert.ok(first);assert.equal(glass.opacity,.66);assert.equal(glass.roughness,.19);assert.equal(glass.vertexColors,true);assert.equal(scene.environment,weaponEnvironment);
 env.set({quality:'auto',mobile:true});assert.equal(created,1);
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(),glass),resources=new SceneResources(true);resources.retain(mesh);resources.release(mesh);
 assert.equal(disposed,0,'a map chunk does not own the shared reflection');assert.equal(env.diagnostics().materials,0);
 const nextMaterial=new THREE.MeshStandardMaterial({opacity:.78,transparent:true});nextMaterial.name='WEB_frosted';prepareCampusGlass(scene,nextMaterial);
 env.set({quality:'auto',mobile:true,weather:'light-rain'});assert.equal(created,2);assert.equal(disposed,1);assert.notEqual(nextMaterial.envMap,first);
 env.dispose();env.dispose();assert.equal(disposed,2);assert.equal(nextMaterial.envMap,null);assert.equal(scene.environment,weaponEnvironment);nextMaterial.dispose();weaponEnvironment.dispose();
});
test('static reflection pixels have fixed alpha and change with weather without scene captures',()=>{
 const clear=reflectionPixels(128,'clear'),rain=reflectionPixels(128,'light-rain');assert.equal(clear.data.length,512*256*4);assert.notDeepEqual(clear.data,rain.data);
 for(let i=3;i<clear.data.length;i+=4)assert.equal(clear.data[i],255);
});
test('glass is visible from either face in one transparent pass while opaque safety paint stays unchanged',()=>{
 const scene=new THREE.Scene(),env=new CampusGlassEnvironment(scene,{} as THREE.WebGLRenderer,{quality:'smooth',mobile:true},()=>new THREE.WebGLRenderTarget(384,512));
 const clear=new THREE.MeshStandardMaterial({transparent:true,opacity:.42,vertexColors:true,depthWrite:true});clear.name='WEB_glass';
 const frosted=new THREE.MeshStandardMaterial({transparent:true,opacity:.78});frosted.name='WEB_frosted';
 for(const m of [clear,frosted]){prepareCampusGlass(scene,m);assert.equal(m.side,THREE.DoubleSide);assert.equal(m.forceSinglePass,true);assert.equal(m.depthWrite,false);}
 assert.equal(clear.opacity,.66);assert.equal(frosted.opacity,.88);assert.equal(clear.vertexColors,true);
 const opaque=new THREE.MeshStandardMaterial({side:THREE.FrontSide,transparent:false,opacity:1,depthWrite:true});opaque.name='WEB_safety';opaque.userData.qsOpaqueSafety=true;
 prepareCampusGlass(scene,opaque);assert.equal(opaque.side,THREE.FrontSide);assert.equal(opaque.transparent,false);assert.equal(opaque.opacity,1);assert.equal(opaque.depthWrite,true);assert.equal(opaque.envMap,null);
 const plane=new THREE.Mesh(new THREE.PlaneGeometry(2,2),clear);plane.updateMatrixWorld(true);
 assert.ok(new THREE.Raycaster(new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1)).intersectObject(plane).length>0);
 assert.ok(new THREE.Raycaster(new THREE.Vector3(0,0,-1),new THREE.Vector3(0,0,1)).intersectObject(plane).length>0);
 plane.geometry.dispose();[clear,frosted,opaque].forEach(m=>m.dispose());env.dispose();
});
test('blue-grey calibration does not accumulate through weather, pooling or cloned materials',()=>{
 const clear=new THREE.MeshStandardMaterial({color:0xffffff,opacity:.42,transparent:true,roughness:.19,metalness:.12});
 calibrateCampusGlass(clear,'clear');const color=clear.color.toArray(),alpha=clear.opacity;
 for(let i=0;i<5;i++)calibrateCampusGlass(clear,'clear');
 assert.deepEqual(clear.color.toArray(),color);assert.equal(clear.opacity,alpha);assert.equal(alpha,.66);
 const clone=clear.clone();calibrateCampusGlass(clone,'clear');assert.deepEqual(clone.color.toArray(),color);
 const frosted=new THREE.MeshStandardMaterial({opacity:.78,roughness:.48});calibrateCampusGlass(frosted,'frosted');assert.equal(frosted.opacity,.88);assert.equal(frosted.roughness,.54);
 [clear,clone,frosted].forEach(m=>m.dispose());
});
test('packed portrait masks preserve every threshold edge and odd row boundary',()=>{
 const width=19,height=17,alpha=Uint8Array.from({length:width*height},(_,i)=>[0,127,128,255][i%4]),mask=decodePortraitMask(encodePortraitMask(alpha,width,height));
 for(let i=0;i<alpha.length;i++)assert.equal(portraitPixelOpaque(mask,i%width,Math.floor(i/width)),alpha[i]>=128);
 assert.equal(mask.bits.length,Math.ceil(alpha.length/8));
});
test('portrait mask decoder rejects truncation, malformed runs and allocation claims',()=>{
 const encoded=encodePortraitMask(new Uint8Array(64).fill(255),8,8);
 assert.throws(()=>decodePortraitMask(encoded.subarray(0,-1)));
 const zero=Buffer.from(encoded);zero[24]=0;assert.throws(()=>decodePortraitMask(zero));
 const huge=Buffer.from(encoded);huge.writeUInt32LE(0xffffffff,8);assert.throws(()=>decodePortraitMask(huge));
 const extra=Buffer.concat([encoded,Buffer.from([0])]);assert.throws(()=>decodePortraitMask(extra));
});
