import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StorySession} from '../src/story/session.ts';
import {STORY_BY_ID} from '../src/story/content.ts';

function blockedStair(){
 const s=new StorySession(),cp=s.checkpoint(),step=STORY_BY_ID.get('go-east-stair')!;
 cp.step=step.id;cp.flags.guideStage='skipped';cp.actorRoutes={};
 for(const a of cp.actors){const p=step.actors?.[a.id]?.at??a.position;a.destination=[...p];a.position=a.id==='lin-cen'?[p[0]-2,p[1],p[2]]:[...p];a.holding=false;}
 s.restore(cp,step.target!.position);s.setCompanionBlocking(['lin-cen']);return s;
}
test('physically blocked companion gives one actionable instruction without granting readiness',()=>{
 const s=blockedStair();assert.equal(s.snapshot.interaction.state,'waiting');assert.match(s.snapshot.interaction.reason,/旁边或后退一步.*林岑/);assert.equal(s.snapshot.canInteract,false);assert.equal(s.snapshot.captureEligibility.actorsReady,false);
 s.setCompanionBlocking([]);assert.match(s.snapshot.interaction.reason,/等林岑站好/);
});
test('blocking state is transient and clears on restored checkpoints',()=>{
 const s=blockedStair(),cp=s.checkpoint();s.restore(cp,STORY_BY_ID.get(cp.step)!.target!.position);assert.doesNotMatch(s.snapshot.interaction.reason,/旁边或后退/);
});