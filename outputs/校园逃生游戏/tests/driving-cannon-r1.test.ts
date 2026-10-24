import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {DrivingCannon,CANNON} from '../src/driving-cannon.ts';
test('cannon finite inventory and fixed cooldown survive repeated input',()=>{
 const gun=new DrivingCannon(),origin=new THREE.Vector3(),direction=new THREE.Vector3(0,0,-1);
 for(let i=0;i<8;i++){assert.equal(gun.fire(origin,direction),i+1);assert.equal(gun.fire(origin,direction),null);for(let j=0;j<241;j++)gun.tick(1/60,()=>null,()=>{});}
 assert.equal(gun.ammo,0);assert.equal(gun.fire(origin,direction),null);gun.dispose();
});
test('continuous segment queries stop a fast shell and offset explosion to visible side',()=>{
 const gun=new DrivingCannon();let explosions=0,point:THREE.Vector3|undefined;
 gun.fire(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,-1));
 gun.tick(.1,(_o,_d,length)=>{assert.ok(length>6);return{distance:2,normal:new THREE.Vector3(0,0,1)};},(_id,p)=>{explosions++;point=p;});
 gun.tick(.1,()=>null,()=>explosions++);assert.equal(explosions,1);assert.ok(point!.z>-2);gun.dispose();
});
test('not advancing simulation keeps ammunition and cooldown unchanged',()=>{
 const gun=new DrivingCannon();gun.fire(new THREE.Vector3(),new THREE.Vector3(0,0,-1));const state=[gun.ammo,gun.cooldown];
 gun.tick(0,()=>null,()=>assert.fail());assert.deepEqual([gun.ammo,gun.cooldown],state);assert.equal(gun.cooldown,CANNON.cooldown);gun.dispose();
});
