import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){
  if(specifier.startsWith('.')&&context.parentURL?.includes('/src/')){
    const url=new URL(specifier,context.parentURL);
    if(!/\.[a-z]+$/i.test(url.pathname)&&existsSync(fileURLToPath(url)+'.ts'))return next(specifier+'.ts',context);
  }
  return next(specifier,context);
}});
const prefix=process.env.QUERY_QA==='1'?'../.qa-v070-query/src/':'../src/';
const {RecipientVisibility}=await import(prefix+'multiplayer/shared/visibility.ts');
const {SimWorld}=await import(prefix+'multiplayer/shared/sim-world.ts');
const actor=(id:string,position:number[],velocity=[0,0,0])=>({id,position,velocity,crouched:false,generation:1}) as any;

test('stationary hidden bodies and zero-radius events perform only distinct visibility rays',()=>{
  let rays=0;
  const world={visible:()=>false,visionRayDistance:()=>{rays++;return 0;}};
  const visibility=new RecipientVisibility(),self=actor('self',[0,0,0]),target=actor('hidden',[10,0,0]);
  assert.equal(visibility.permits(world,self,target,[],60),false);
  assert.equal(rays,5,'five distinct body points; no second eye→body evaluation');
  rays=0;
  assert.equal(visibility.point(world,self,[10,1,0],[]),false);
  assert.equal(rays,1,'a point event has one distinct location');
});

test('smoke still blocks the original and swept body samples without issuing geometry rays',()=>{
  let rays=0;
  const world={visible:()=>true,visionRayDistance:(_a:any,_b:any,length:number)=>{rays++;return length;}};
  const self=actor('self',[0,0,0]),target=actor('target',[0,0,-12]);
  assert.equal(new RecipientVisibility().permits(world,self,target,[{id:'s',position:[0,1,-6],radius:3,left:6,bornTick:0}],60),false);
  assert.equal(rays,0);
});

test('only validated corner movement grants previsibility; complete wall never does',()=>{
  const self=actor('self',[0,0,0]),target=actor('target',[10,0,-.3],[0,0,6]);
  const fullWall={visible:(a:number[],b:number[])=>!((a[0]<5&&b[0]>5)||(a[0]>5&&b[0]<5))};
  const corner={visible:(a:number[],b:number[])=>{if((a[0]<5&&b[0]>5)||(a[0]>5&&b[0]<5)){const t=(5-a[0])/(b[0]-a[0]);return a[2]+(b[2]-a[2])*t>=0;}return true;}};
  assert.equal(new RecipientVisibility().permits(corner,self,target,[],60),true);
  assert.equal(new RecipientVisibility().permits(fullWall,self,target,[],60),false);
  target.velocity=[1000,0,0];
  assert.equal(new RecipientVisibility().permits(fullWall,self,target,[],60),false);
});

test('vision search stops at physical obstruction while retaining the exact nearest hit',()=>{
  const world=Object.create(SimWorld.prototype) as any;
  let maximum=-1;
  world.rayDistance=()=>3;
  world.vision={rayDistance:(_a:any,_b:any,max:number)=>{maximum=max;return Math.min(max,7);}};
  assert.equal(world.visionRayDistance([0,0,0],[1,0,0],100),3);
  assert.equal(maximum,3);
  world.vision.rayDistance=(_a:any,_b:any,max:number)=>{maximum=max;return Math.min(max,1.25);};
  assert.equal(world.visionRayDistance([0,0,0],[1,0,0],100),1.25,'near shrub remains nearer than physical wall');
  world.rayDistance=()=>100;
  assert.equal(world.visionRayDistance([0,0,0],[1,0,0],100),1.25);
  assert.equal(maximum,100,'no physical obstruction retains the full search distance');
});
