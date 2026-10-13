import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {STORY_BY_ID,STORY_START} from '../src/story/content.ts';
import {StorySession} from '../src/story/session.ts';
import {fieldOfView} from '../src/photography/math.ts';
import type {StoryVec3} from '../src/story/types.ts';

const setups=[['longshot-first','yard-return'],['longshot-second','longshot-second-position'],['longshot-third','longshot-third-position']] as const;
function visiblePoints(feet:StoryVec3,lookAt:StoryVec3,actor:StoryVec3){
 const camera=new THREE.PerspectiveCamera(fieldOfView(24),3/2,.075,420);camera.position.fromArray(feet).add(new THREE.Vector3(0,1.63,0));camera.lookAt(...lookAt);camera.updateMatrixWorld(true);
 return [.35,.95,1.55].filter(y=>{const p=new THREE.Vector3(...actor).add(new THREE.Vector3(0,y,0)).project(camera);return p.z>=-1&&p.z<=1&&Math.abs(p.x)<.95&&Math.abs(p.y)<.95;}).length;
}
for(const [photoId,arrivalId]of setups)test(`${photoId} includes both companions throughout its guided 24mm framing position`,()=>{
 const photo=STORY_BY_ID.get(photoId)!,arrival=STORY_BY_ID.get(arrivalId)!,target=arrival.target!;
 assert.ok(target.radius<=1.25,'guided arrival must not stop beside or behind a subject');
 for(let ring=0;ring<=2;ring++)for(let i=0;i<36;i++){
  const angle=i*Math.PI/18,radius=target.radius*ring/2,feet:StoryVec3=[target.position[0]+Math.cos(angle)*radius,target.position[1],target.position[2]+Math.sin(angle)*radius];
  for(const id of photo.photoSubjects!)assert.ok(visiblePoints(feet,photo.target!.lookAt!,arrival.actors![id]!.at)>=2,`${id} cropped at ${feet}`);
 }
});
test('the failed natural first-shot feet now frame Zhou as well as Lin without weakening the subject requirement',()=>{
 const feet:StoryVec3=[-51.13647558676101,.18010003009315856,-98.5389945293747],lin:StoryVec3=[-45.12635532565058,.18010004680883007,-98.17338951550374],zhou:StoryVec3=[-44.210111792713185,.17960024847530853,-102.74125786913184];
 assert.equal(visiblePoints(feet,[-45,1.4,-98],zhou),0,'original framing reproduces the rejected subject');
 const shot=STORY_BY_ID.get('longshot-first')!;for(const actor of [lin,zhou])assert.ok(visiblePoints(feet,shot.target!.lookAt!,actor)>=2);
 assert.deepEqual(shot.photoSubjects,['lin-cen','zhou-xu']);
});
test('a rejected group photograph identifies exactly the missing companion and stays an ordinary saved photo',()=>{
 const s=new StorySession(),cp=s.checkpoint();cp.step='longshot-first';cp.flags.guideStage='skipped';cp.actorRoutes={};
 const arrival=STORY_BY_ID.get('yard-return')!;for(const actor of cp.actors){actor.position=[...arrival.actors![actor.id]!.at];actor.destination=[...actor.position];}
 s.restore(cp);s.update(.1,{position:s.snapshot.target!.position,photoOpen:false});
 assert.equal(s.photographed({id:'missing-zhou',position:[-51,1.81,-101],lookAt:s.snapshot.target!.lookAt,subjects:['lin-cen'],subjectsVerified:true,frameClear:true}),false);
 assert.match(s.snapshot.photoTask!.message,/还没拍清周序/);assert.ok(!s.snapshot.photoTask!.message.includes('林岑'));
 assert.equal(s.snapshot.photos[0].taskId,undefined);assert.equal(s.snapshot.step,'longshot-first');
 assert.equal(s.photographed({id:'both',position:[-51,1.81,-101],lookAt:s.snapshot.target!.lookAt,subjects:['lin-cen','zhou-xu'],subjectsVerified:true,frameClear:true}),true);
 assert.equal(s.snapshot.step,'longshot-second-position');assert.notDeepEqual(s.snapshot.target!.position,STORY_START);
});
