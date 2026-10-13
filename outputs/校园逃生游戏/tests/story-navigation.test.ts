import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {storyNavigation,nextStoryLeg} from '../src/story-navigation.ts';
import type {StorySnapshot} from '../src/story/types.ts';

type NavigationState=Pick<StorySnapshot,'guidance'|'target'|'distance'|'dialogue'|'finished'>;
// The navigation helper only reads these snapshot fields. Route geometry comes
// from the engine; these fixtures test how the assistance presents that route.
function state(overrides:Partial<NavigationState>={}):StorySnapshot{
 return {guidance:{active:false,stage:'complete',title:'',body:'',replaying:false,canSkip:false,stalled:false,routeHelpRequested:true},target:{position:[10,.61,0],radius:1.5,label:'跟上同伴'},distance:10,dialogue:null,finished:false,...overrides} as StorySnapshot;
}
const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} differs from ${expected}`);

test('route assistance points to the next walkable leg instead of directly through a wall',()=>{
 const from=new Vector3(0,.61,0),path=[from.clone(),new Vector3(.1,.61,0),new Vector3(0,.61,-3),new Vector3(10,.61,0)],before=path.map(p=>p.toArray());
 const help=storyNavigation(state(),from,0,path)!;
 assert.equal(help.visible,true);assert.equal(help.label,'跟上同伴');near(help.bearing,0);near(help.distance,3);
 assert.deepEqual(path.map(p=>p.toArray()),before,'reading the next leg must not rewrite the engine path');assert.deepEqual(from.toArray(),[0,.61,0]);
});

test('the navigation bearing follows the current view and stays within the signed half turn',()=>{
 const from=new Vector3(0,.61,0),path=[new Vector3(3,.61,0)];
 near(storyNavigation(state(),from,-Math.PI/2,path)!.bearing,0);
 near(storyNavigation(state(),from,Math.PI,path)!.bearing,-Math.PI/2);
 const backward=storyNavigation(state(),from,0,[new Vector3(0,.61,3)])!.bearing;near(Math.abs(backward),Math.PI);
});

test('help remains opt-in and is hidden during dialogue, after completion and at the target',()=>{
 const from=new Vector3(0,.61,0),path=[new Vector3(0,.61,-3)],base=state();
 assert.equal(storyNavigation(state({guidance:{...base.guidance,routeHelpRequested:false}}),from,0,path),undefined);
 assert.equal(storyNavigation(state({target:null}),from,0,path),undefined);
 assert.equal(storyNavigation(state({dialogue:{speaker:'lin-cen',text:'等等我。',fullText:'等等我。',complete:true,speakerName:'林岑'}}),from,0,path),undefined);
 assert.equal(storyNavigation(state({finished:true}),from,0,path),undefined);
 assert.equal(storyNavigation(state({distance:1}),from,0,path),undefined);
});

test('an unavailable or exhausted route does not invent a direction through campus geometry',()=>{
 const from=new Vector3(0,.61,0);
 for(const path of [[],[from.clone(),new Vector3(.1,.61,0)]]){
  const help=storyNavigation(state(),from,0,path)!;assert.equal(help.visible,false);assert.equal(help.label,'路线正在确认');assert.equal(help.distance,0);
 }
});

test('floor changes direct players along stairs for all open teaching floors',()=>{
 const heights=[.61,4.43,8.25,12.07];
 for(let floor=1;floor<=4;floor++){
  const targetY=heights[floor-1],fromY=floor===1?heights[1]:heights[0],from=new Vector3(0,fromY,0),path=[new Vector3(0,fromY,-3)];
  const help=storyNavigation(state({target:{position:[10,targetY,0],radius:1.5,label:'前往机位'}}),from,0,path)!;
  assert.equal(help.floorHint,`前往${floor}层 · 沿楼梯走`);assert.equal(help.visible,true);near(help.bearing,0);
 }
});

test('same-floor assistance names the upper floor without asking players to find stairs',()=>{
 for(const [floor,y]of [[2,4.43],[3,8.25],[4,12.07]]){
  const help=storyNavigation(state({target:{position:[10,y,0],radius:1.5,label:'沿走廊前进'}}),new Vector3(0,y,0),0,[new Vector3(0,y,-3)])!;
  assert.equal(help.floorHint,`${floor}层`);near(help.distance,3);
 }
 assert.equal(storyNavigation(state(),new Vector3(0,.61,0),0,[new Vector3(0,.61,-3)])!.floorHint,undefined);
});

test('cached route assistance keeps moving forward after passing its old starting point',()=>{
 const path=[new Vector3(0,.61,0),new Vector3(0,.61,-4),new Vector3(-3,.61,-4)],from=new Vector3(0,.61,-1.4);
 assert.deepEqual(nextStoryLeg(from,path)?.toArray(),[0,.61,-4]);
 near(storyNavigation(state(),from,0,path)!.bearing,0);
 assert.deepEqual(nextStoryLeg(new Vector3(-1.4,.61,-4),path)?.toArray(),[-3,.61,-4]);
});

test('route assistance uses the correct height at vertically overlapping stair flights',()=>{
 const path=[new Vector3(0,.61,0),new Vector3(0,2.4,-4),new Vector3(1,2.4,-4),new Vector3(1,4.32,0),new Vector3(6,4.32,0)];
 assert.deepEqual(nextStoryLeg(new Vector3(1,3.4,-2),path)?.toArray(),[1,4.32,0]);
});
