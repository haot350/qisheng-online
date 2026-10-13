import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Mesh,MeshBasicMaterial,PlaneGeometry,Vector3} from 'three';
import {AttackCycle,DamageDirections,RecoilSpring,hitDamage,muzzleTarget,portraitHit,type BodyLayout} from '../src/combat.ts';
import {Magazine,WEAPONS} from '../src/rules.ts';

const close=(actual:number,expected:number,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} should equal ${expected}`);
const shape:BodyLayout={
  w:100,h:100,box:[10,0,90,100],head:[40,0,60,20],torso:[30,20,70,65],
  arms:[[10,20,30,65],[70,20,90,65]],legs:[[30,65,46,100],[54,65,70,100]],
};
const portrait=()=>new Mesh(new PlaneGeometry(2,2),new MeshBasicMaterial());
const rayAt=(x:number,y:number,z=5)=>({origin:new Vector3(x,y,z),direction:new Vector3(0,0,-1)});

test('first and reacquired attacks cannot authorize a shot before the 0.65 second preparation',()=>{
  const cycle=new AttackCycle();
  assert.equal(cycle.update(0,true,false,true),false);
  assert.equal(cycle.phase,'aim');close(cycle.left,.65);
  assert.equal(cycle.update(.64,true,false,true),false);
  assert.equal(cycle.update(.009,true,false,true),false);
  assert.equal(cycle.update(.002,true,false,true),true);
  assert.equal(cycle.phase,'fire');
  cycle.update(0,false,false,true);
  assert.equal(cycle.phase,'search');
  assert.equal(cycle.update(0,true,false,true),false);close(cycle.left,.65);
  assert.equal(cycle.update(.64,true,false,true),false);
});

test('three successful rounds make one burst, followed by cooldown and a 0.25 second raised-gun preparation',()=>{
  const cycle=new AttackCycle(),magazine=new Magazine('mp5');
  cycle.update(0,true,false,true);assert.equal(cycle.update(.65,true,false,true),true);
  assert.equal(magazine.fire(),true);cycle.shot(()=>.5);
  assert.equal(cycle.remaining,2);assert.equal(cycle.phase,'fire');
  assert.equal(magazine.fire(),false,'a magazine cooldown does not consume another round');
  assert.equal(cycle.remaining,2,'the cycle only advances when its successful-shot callback is used');
  magazine.update(WEAPONS.mp5.interval);
  assert.equal(magazine.fire(),true);cycle.shot(()=>.5);
  magazine.update(WEAPONS.mp5.interval);
  assert.equal(magazine.fire(),true);cycle.shot(()=>.5);
  assert.equal(magazine.ammo,27);assert.equal(cycle.remaining,0);assert.equal(cycle.phase,'cooldown');close(cycle.left,1.1);
  assert.equal(cycle.update(1.09,true,false,true),false);
  assert.equal(cycle.update(.011,true,false,true),false);
  assert.equal(cycle.phase,'aim');close(cycle.left,.25);
  assert.equal(cycle.update(.249,true,false,true),false);
  assert.equal(cycle.update(.002,true,false,true),true);assert.equal(cycle.remaining,3);
});

test('losing visibility, reloading and suppression discard an unfinished attack',()=>{
  for(const state of ['visibility','reload','suppressed']){
    const cycle=new AttackCycle();cycle.update(0,true,false,false);cycle.update(.65,true,false,false);
    assert.equal(cycle.phase,'fire');
    if(state==='visibility')assert.equal(cycle.update(0,false,false,false),false);
    if(state==='reload')assert.equal(cycle.update(0,true,true,false),false);
    if(state==='suppressed')cycle.cancel('suppressed');
    assert.equal(cycle.remaining,0);
    assert.equal(cycle.update(0,true,false,false),false);close(cycle.left,.65);
    assert.equal(cycle.remaining,1,'single-shot weapons never request a three-round burst');
  }
});

test('every weapon has instant head suppression and lower arm and leg damage',()=>{
  for(const def of Object.values(WEAPONS)){
    assert.equal(hitDamage(def.damage,'head'),100);
    assert.equal(hitDamage(def.damage,'torso'),def.damage);
    close(hitDamage(def.damage,'arm'),def.damage*.65);
    close(hitDamage(def.damage,'leg'),def.damage*.55);
  }
});

test('portrait intersections distinguish anatomy and reject transparent image pixels and the gap between legs',()=>{
  const plane=portrait(),alpha={width:100,height:100,data:new Uint8Array(10000).fill(255)};
  try{
    for(const [x,y,expected] of [[0,.8,'head'],[0,.2,'torso'],[.6,.2,'arm'],[-.3,-.8,'leg']] as const){
      const {origin,direction}=rayAt(x,y);assert.equal(portraitHit(origin,direction,plane,shape,alpha)?.region,expected);
    }
    const head=rayAt(0,.8),headHit=portraitHit(head.origin,head.direction,plane,shape,alpha);
    assert.ok(headHit);close(headHit.distance,5);
    // Cover several rows around the ray's image-space coordinates to avoid
    // making alpha-edge behavior depend on floating point pixel rounding.
    for(let y=8;y<=11;y++)for(let x=49;x<=51;x++)alpha.data[y*alpha.width+x]=0;
    assert.equal(portraitHit(head.origin,head.direction,plane,shape,alpha),null,'opaque geometry does not make a transparent photograph area hittable');
    const gap=rayAt(0,-.8),outside=rayAt(1.2,0),away=rayAt(0,.8,-5);
    assert.equal(portraitHit(gap.origin,gap.direction,plane,shape),null);
    assert.equal(portraitHit(outside.origin,outside.direction,plane,shape),null);
    assert.equal(portraitHit(away.origin,away.direction,plane,shape),null,'a portrait behind the ray cannot be hit');
    assert.equal(portraitHit(new Vector3(0,0,5),new Vector3(1,0,0),plane,shape),null,'parallel rays cannot hit the image plane');
  }finally{plane.geometry.dispose();plane.material.dispose();}
});

test('rotated and scaled portraits return world distances suitable for nearest-target and wall selection',()=>{
  const near=portrait(),far=portrait();
  try{
    near.position.set(3,1.62,-5);near.rotation.y=.4;near.scale.set(.8,1.2,1);near.updateMatrixWorld(true);
    const point=near.localToWorld(new Vector3(.6,.4,0)),normal=near.getWorldDirection(new Vector3());
    const origin=point.clone().addScaledVector(normal,7),direction=normal.clone().negate();
    const hit=portraitHit(origin,direction,near,shape);assert.ok(hit);assert.equal(hit.region,'arm');close(hit.distance,7);
    assert.ok(hit.point.distanceTo(point)<1e-7);
    near.position.set(0,0,2);near.rotation.y=0;near.scale.set(1,1,1);far.position.set(0,0,-2);
    const ray=rayAt(0,.8,5),hits=[far,near].map(plane=>portraitHit(ray.origin,ray.direction,plane,shape)).filter(hit=>hit!==null).sort((a,b)=>a.distance-b.distance);
    assert.equal(hits.length,2);close(hits[0].distance,3);close(hits[1].distance,7);
    assert.equal(hits.filter(hit=>hit.distance<4).length,1,'a wall at four metres excludes the farther target');
  }finally{for(const plane of [near,far]){plane.geometry.dispose();plane.material.dispose();}}
});

test('an actual muzzle ray stops at a wall before the camera aim point',()=>{
  const origin=new Vector3(.25,1.3,0),aim=new Vector3(.25,1.3,-10);
  let queried=false;
  const blocked=muzzleTarget(origin,aim,(o,d,max)=>{queried=true;assert.ok(o.equals(origin));close(d.x,0);close(d.z,-1);close(max,10);return 2;});
  assert.equal(queried,true);assert.equal(blocked.blocked,true);close(blocked.distance,2);close(blocked.point.z,-2);
  assert.ok(origin.equals(new Vector3(.25,1.3,0)),'aim validation never mutates the gun origin');
  const clear=muzzleTarget(origin,aim,(_o,_d,max)=>max);
  assert.equal(clear.blocked,false);assert.ok(clear.point.equals(aim));
});

test('incoming damage retains its world source while turns, floor differences and time change its HUD output',()=>{
  const directions=new DamageDirections(),eye=new Vector3(0,1.62,0),source=new Vector3(0,5.62,-10);
  directions.add(7,source,10);source.set(100,100,100);
  const initial=directions.read(eye,0)[0];close(initial.angle,0);assert.equal(initial.vertical,1);close(initial.remaining,1);
  const turned=directions.read(eye,Math.PI/2)[0];close(turned.angle,Math.PI/2);
  assert.equal(directions.read(new Vector3(0,7.62,0),0)[0].vertical,-1);
  assert.equal(directions.read(new Vector3(0,5.62,0),0)[0].vertical,0);
  directions.update(.4);close(directions.read(eye,0)[0].remaining,.6);
  directions.update(.61);assert.deepEqual(directions.read(eye,0),[]);
  directions.add(8,new Vector3(10,1.62,0),50);close(directions.read(eye,0)[0].angle,Math.PI/2);
  assert.equal(directions.read(eye,0)[0].strength,1);directions.reset();assert.deepEqual(directions.read(eye,0),[]);
});

test('damage markers merge a repeated source and retain at most six recent attackers',()=>{
  const directions=new DamageDirections(),eye=new Vector3();
  for(let id=0;id<6;id++)directions.add(id,new Vector3(id,0,-10),5);
  assert.deepEqual(directions.read(eye,0).map(source=>source.id),[0,1,2,3,4,5]);
  directions.add(6,new Vector3(6,0,-10),5);
  assert.deepEqual(directions.read(eye,0).map(source=>source.id),[1,2,3,4,5,6]);
  directions.add(7,new Vector3(7,0,-10),5);
  assert.deepEqual(directions.read(eye,0).map(source=>source.id),[2,3,4,5,6,7]);
  directions.update(.4);directions.add(3,new Vector3(-10,0,0),5);
  assert.deepEqual(directions.read(eye,0).map(source=>source.id),[2,4,5,6,7,3]);
  const refreshed=directions.read(eye,0).at(-1)!;close(refreshed.remaining,1);close(refreshed.angle,-Math.PI/2);
  close(directions.read(eye,Math.PI/2).at(-1)!.angle,0);
  close(directions.read(eye,0)[0].remaining,.6);
});

test('sustained recoil is bounded and smoothly returns to zero without altering unrelated aim',()=>{
  const recoil=new RecoilSpring();
  for(let i=0;i<1000;i++)recoil.kick(.03,.01,()=>1);
  assert.equal(recoil.pitch,.18);assert.equal(recoil.yaw,.055);
  let previousPitch=recoil.pitch,previousYaw=recoil.yaw;
  for(let i=0;i<60;i++){
    recoil.update(1/60,8);
    assert.ok(recoil.pitch>=0&&recoil.pitch<previousPitch);assert.ok(recoil.yaw>=0&&recoil.yaw<previousYaw);
    previousPitch=recoil.pitch;previousYaw=recoil.yaw;
  }
  assert.ok(recoil.pitch<.001);assert.ok(recoil.yaw<.001);
  recoil.kick(.02,.01,()=>0);assert.ok(recoil.yaw<0);
  recoil.reset();assert.equal(recoil.pitch,0);assert.equal(recoil.yaw,0);
});
