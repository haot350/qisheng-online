import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Group,Mesh,MeshBasicMaterial,Texture,SRGBColorSpace} from 'three';
import {SceneResources} from '../src/resources.ts';
test('evicting one GLTF region keeps shared materials, geometry and textures alive',()=>{
  const geometry=new BoxGeometry(),texture=new Texture(),material=new MeshBasicMaterial({map:texture});
  const a=new Group(),b=new Group();a.add(new Mesh(geometry,material));b.add(new Mesh(geometry,material));
  const disposals:number[]=[0,0,0];[geometry,material,texture].forEach((item,i)=>item.addEventListener('dispose',()=>disposals[i]++));
  const pool=new SceneResources();pool.retain(a);pool.retain(b);pool.release(a);assert.deepEqual(disposals,[0,0,0]);
  pool.release(b);assert.deepEqual(disposals,[1,1,1]);pool.release(b);assert.deepEqual(disposals,[1,1,1]);
});
test('audited identical textures share storage across chunks and leave the pool after final eviction',()=>{
 const texture=()=>{const t=new Texture({width:512,height:512});t.name='audited-brick.webp';t.colorSpace=SRGBColorSpace;return t;};
 const a=texture(),b=texture(),ma=new MeshBasicMaterial({map:a}),mb=new MeshBasicMaterial({map:b}),ra=new Mesh(new BoxGeometry(),ma),rb=new Mesh(new BoxGeometry(),mb);
 let firstDisposed=0,duplicateDisposed=0;a.addEventListener('dispose',()=>firstDisposed++);b.addEventListener('dispose',()=>duplicateDisposed++);
 const pool=new SceneResources(true);pool.retain(ra);pool.retain(rb);assert.equal(mb.map,a);assert.equal(duplicateDisposed,1);
 pool.release(ra);assert.equal(firstDisposed,0);pool.release(rb);assert.equal(firstDisposed,1);
 const c=texture(),rc=new Mesh(new BoxGeometry(),new MeshBasicMaterial({map:c}));pool.retain(rc);assert.equal(rc.material.map,c,'reloading never receives a disposed pooled texture');pool.release(rc);
});
test('texture pooling never changes independent UV transforms or colour spaces',()=>{
 const make=(repeat:number,srgb:boolean)=>{const t=new Texture({width:256,height:256});t.name='same-image.webp';t.repeat.x=repeat;if(srgb)t.colorSpace=SRGBColorSpace;return new Mesh(new BoxGeometry(),new MeshBasicMaterial({map:t}));};
 const a=make(1,true),b=make(2,true),c=make(1,false),pool=new SceneResources(true);[a,b,c].forEach(r=>pool.retain(r));
 assert.notEqual(a.material.map,b.material.map);assert.notEqual(a.material.map,c.material.map);[a,b,c].forEach(r=>pool.release(r));
});
