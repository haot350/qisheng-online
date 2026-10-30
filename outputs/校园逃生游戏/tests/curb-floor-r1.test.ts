import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {Vector3} from 'three';
import {storyCurbLift} from '../src/story-curb.ts';

await RAPIER.init();
function fixture(elevation:number,kind:'curb'|'wall'|'ceiling'|'void'|'stairs'='curb'){
 const physics=new RAPIER.World({x:0,y:-18,z:0});
 if(kind!=='void')physics.createCollider(RAPIER.ColliderDesc.cuboid(3,.1,3).setTranslation(0,elevation-.1,0));
 if(kind==='stairs')for(let n=1;n<=4;n++)physics.createCollider(RAPIER.ColliderDesc.cuboid(1,n*.08,.14).setTranslation(0,elevation+n*.08,.14+n*.28));
 else physics.createCollider(RAPIER.ColliderDesc.cuboid(1,.07,.235).setTranslation(0,elevation+.07,.515));
 if(kind==='wall')physics.createCollider(RAPIER.ColliderDesc.cuboid(1,1.1,.05).setTranslation(0,elevation+1.1,.60));
 if(kind==='ceiling')physics.createCollider(RAPIER.ColliderDesc.cuboid(2,.06,2).setTranslation(0,elevation+1.78,0));
 physics.step();
 return{physics,read:()=>storyCurbLift(physics,new Vector3(0,elevation+.015,0),new Vector3(0,-.001,.0567))};
}
test('same supported low curb works on ground and an upper floor',()=>{
 const ground=fixture(0),upper=fixture(8.34);try{assert.ok(ground.read()>0);assert.equal(upper.read(),ground.read());assert.ok(upper.read()<=.04);}finally{ground.physics.free();upper.physics.free();}
});
for(const kind of ['wall','ceiling','void','stairs'] as const)test('upper-floor curb assistance rejects '+kind,()=>{
 const f=fixture(8.34,kind);try{assert.equal(f.read(),0);}finally{f.physics.free();}
});
test('invalid motion cannot request a lift',()=>{const f=fixture(8.34);try{assert.equal(storyCurbLift(f.physics,new Vector3(0,Infinity,0),new Vector3(0,0,.05)),0);}finally{f.physics.free();}});
