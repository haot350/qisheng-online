import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StorySession,validateStoryCheckpoint} from '../src/story/session.ts';
import {STORY_STEPS,STORY_START,STORY_STAGE} from '../src/story/content.ts';
import type {StoryPhoto,StoryVec3} from '../src/story/types.ts';

function fixture(id:string){const c=new StorySession().checkpoint();c.step=id;c.flags.guideStage='skipped';c.actors.forEach(a=>{a.destination=[...a.position];});const s=new StorySession();s.restore(c);return s;}
function ready(s:StorySession){for(let i=0;i<120;i++){for(const a of s.snapshot.actors)s.setActorPosition(a.id,a.destination);s.update(.1,{position:s.snapshot.target?.position??STORY_START,photoOpen:false});if(s.snapshot.interaction.state!=='waiting')break;}}
function capture(s:StorySession,id:string,extra:Partial<StoryPhoto>={}){const t=s.snapshot.target!;return s.photographed({id,position:[t.position[0],t.position[1]+1.63,t.position[2]],lookAt:t.lookAt,url:`/qa/${id}.jpg`,subjects:s.snapshot.photoTask?.subjects,subjectsVerified:true,frameClear:true,...extra});}

test('the main story retains 44 compatible step IDs and eight required photographs',()=>{
 assert.equal(STORY_STEPS.length,44);assert.equal(STORY_STEPS.filter(s=>s.kind==='photo').length,8);
 assert.ok(STORY_STEPS.every(s=>!s.title.includes('长镜头')&&!s.objective.includes('长镜头')));
 assert.ok(STORY_STEPS.every(s=>!s.choices?.some(c=>c.label.includes('坐在')||c.label.includes('合上练习册'))));
});
test('the first station matches the surveyed real-photo view; both companions arrive before teaching photography',()=>{
 const arrive=STORY_STEPS.find(s=>s.id==='courtyard-arrive')!,photo=STORY_STEPS.find(s=>s.id==='yard-first-shot')!;
 assert.deepEqual(arrive.target!.position,[-29.1232287,.067,-86]);assert.deepEqual(arrive.target!.position,photo.target!.position);assert.deepEqual(arrive.target!.lookAt,photo.target!.lookAt);assert.equal(arrive.target!.radius,1.5);assert.equal(photo.target!.radius,4);
 const s=new StorySession();s.skipIntro();while(s.snapshot.dialogue)s.advance();s.choose(0);s.guidance('skip');s.update(.1,{position:arrive.target!.position,photoOpen:false});assert.equal(s.snapshot.interaction.state,'waiting');s.interact();assert.equal(s.snapshot.step,'courtyard-arrive');ready(s);assert.equal(s.snapshot.step,'yard-first-shot');assert.equal(s.snapshot.canInteract,true);
});
test('the second station walks both companions back and fits the eight-metre waiting rule and the original photo area',()=>{
 const arrive=STORY_STEPS.find(s=>s.id==='courtyard-arrive')!,second=STORY_STEPS.find(s=>s.id==='yard-second-station')!,photo=STORY_STEPS.find(s=>s.id==='yard-with-friends')!;
 const d=(a:StoryVec3,b:StoryVec3)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
 assert.ok(d(second.target!.position,photo.target!.position)+second.target!.radius<photo.target!.radius);
 for(const id of['lin-cen','zhou-xu'] as const){assert.ok(d(second.target!.position,second.actors![id]!.at)+second.target!.radius+.55<8);assert.ok(second.actors![id]!.route!.length>2);}
 const c=fixture('frame-outside').checkpoint();for(const a of c.actors){a.position=[...arrive.actors![a.id]!.at];a.destination=[...a.position];}c.actorRoutes={};const s=new StorySession();s.restore(c);while(s.snapshot.dialogue)s.advance();assert.equal(s.snapshot.step,'yard-second-station');assert.deepEqual(s.snapshot.actors.find(a=>a.id==='lin-cen')!.position,arrive.actors!['lin-cen']!.at);ready(s);assert.equal(s.snapshot.step,'yard-with-friends');assert.deepEqual(s.snapshot.actors.find(a=>a.id==='lin-cen')!.destination,[-43,.18,-99.25]);assert.deepEqual(s.snapshot.actors.find(a=>a.id==='zhou-xu')!.destination,[-47,.18,-98]);
});
test('onboarding requires actual walking and looking, freezes in overlays, and hands over only after capture and closing',()=>{
 const s=new StorySession();s.skipIntro();while(s.snapshot.dialogue)s.advance();s.choose(0);
 const position:StoryVec3=[STORY_START[0]+.3,STORY_START[1],STORY_START[2]];
 s.update(.1,{position,photoOpen:false,viewForward:[0,0,1]});assert.equal(s.snapshot.guidance.stage,'move');
 position[0]+=1;s.update(.1,{position,photoOpen:false,viewForward:[0,0,1]});assert.equal(s.snapshot.guidance.stage,'look');
 s.update(.1,{position,photoOpen:false,viewForward:[.4,0,.92],overlayOpen:true});assert.equal(s.snapshot.guidance.stage,'look');
 s.update(.1,{position,photoOpen:false,viewForward:[0,0,1]});assert.equal(s.snapshot.guidance.stage,'look');
 s.update(.1,{position,photoOpen:false,viewForward:[.4,0,.92]});assert.equal(s.snapshot.guidance.stage,'follow');
 ready(s);assert.equal(s.snapshot.step,'yard-first-shot');assert.equal(s.snapshot.guidance.stage,'raise');
 s.update(.1,{position:s.snapshot.target!.position,photoOpen:true});assert.equal(s.snapshot.guidance.stage,'focus');
 s.guidance('focused');assert.equal(s.snapshot.guidance.stage,'shutter');assert.equal(capture(s,'first'),true);
 assert.equal(s.snapshot.guidance.stage,'close');assert.equal(s.snapshot.step,'yard-first-shot');assert.equal(s.snapshot.photoTask?.status,'completed');
 for(let i=0;i<15;i++)s.update(.5,{position:s.snapshot.target!.position,photoOpen:true});assert.equal(s.snapshot.photoTask?.status,'completed');
 s.update(.1,{position:s.snapshot.target!.position,photoOpen:false});assert.equal(s.snapshot.step,'frame-outside');assert.equal(s.snapshot.guidance.stage,'complete');
});
test('restoring movement guidance starts at the restored player feet instead of the old opening',()=>{
 const cp=fixture('courtyard-arrive').checkpoint();cp.flags.guideStage='move';
 const position:StoryVec3=[-29.1232287,.067,-86],s=new StorySession();s.restore(cp,position);
 s.update(.1,{position:[...position],photoOpen:false,viewForward:[0,0,1]});assert.equal(s.snapshot.guidance.stage,'move');
 s.update(.1,{position:[position[0]+.79,position[1],position[2]],photoOpen:false,viewForward:[0,0,1]});assert.equal(s.snapshot.guidance.stage,'move');
 s.update(.1,{position:[position[0]+.81,position[1],position[2]],photoOpen:false,viewForward:[0,0,1]});assert.equal(s.snapshot.guidance.stage,'look');
 assert.equal(s.snapshot.step,'courtyard-arrive');assert.equal(s.snapshot.photos.length,0);
});
test('skip never fabricates a task photograph; replay preserves dialogue and professional-task state',()=>{
 const s=fixture('frame-outside');s.update(.2,{position:STORY_START,photoOpen:false});const before=s.checkpoint();
 s.guidance('replay');assert.equal(s.snapshot.dialogue,null);s.advance();s.choose(0);assert.equal(s.checkpoint().line,before.line);
 const p:StoryVec3=[STORY_START[0]+1,STORY_START[1],STORY_START[2]];
 s.update(.1,{position:p,photoOpen:false,viewForward:[0,0,1]});s.update(.1,{position:p,photoOpen:false,viewForward:[.4,0,.9]});
 s.guidance('raised');s.guidance('focused');s.update(.1,{position:p,photoOpen:true});
 assert.equal(s.photographed({id:'practice',position:p,url:'/qa/practice.jpg'}),false);assert.equal(s.snapshot.guidance.stage,'close');
 s.update(.1,{position:p,photoOpen:false});assert.equal(s.snapshot.step,'frame-outside');assert.equal(s.checkpoint().line,before.line);assert.equal(s.checkpoint().revealed,before.revealed);assert.equal(s.snapshot.photos[0].taskId,undefined);
 const fresh=fixture('yard-first-shot');fresh.guidance('replay');fresh.guidance('skip');assert.equal(fresh.snapshot.step,'yard-first-shot');assert.equal(fresh.snapshot.photos.length,0);
});
test('arriving starts conversation automatically; building photographs ignore unrelated companions',()=>{
 const travel=fixture('east-stair-top');travel.update(.1,{position:travel.snapshot.target!.position,photoOpen:false});assert.equal(travel.snapshot.step,'corridor-conversation');assert.equal(travel.checkpoint().line,0);
 const photo=fixture('corridor-photo');photo.update(.1,{position:photo.snapshot.target!.position,photoOpen:false});assert.equal(photo.snapshot.interaction.state,'photo');assert.equal(capture(photo,'window'),true);
});
test('companions wait beyond eight metres, resume within six, and never lose the remaining route',()=>{
 const s=fixture('courtyard-arrive'),cp=s.checkpoint(),a=cp.actors[0];cp.actorRoutes={'lin-cen':[[a.position[0],a.position[1],a.position[2]+5]]};a.destination=cp.actorRoutes['lin-cen']![0];s.restore(cp);
 const far:StoryVec3=[a.position[0]+10,a.position[1],a.position[2]];s.update(.2,{position:far,photoOpen:false});assert.equal(s.snapshot.actors[0].holding,true);assert.deepEqual(s.snapshot.actors[0].position,a.position);
 assert.equal(s.checkpoint().actorRoutes?.['lin-cen']?.length,1);
 s.update(.2,{position:[a.position[0]+5,a.position[1],a.position[2]],photoOpen:false});assert.equal(s.snapshot.actors[0].holding,false);assert.notDeepEqual(s.snapshot.actors[0].position,a.position);
});
test('failed photographs remain ordinary shots with a visible actionable verdict; verified missing people cannot satisfy a task',()=>{
 const s=fixture('yard-with-friends');ready(s);
 assert.equal(capture(s,'missing',{subjects:[]}),false);assert.equal(s.snapshot.photoTask?.status,'retry');assert.match(s.snapshot.photoTask!.message,/同伴/);assert.equal(s.snapshot.photos[0].taskId,undefined);assert.equal(s.snapshot.photos[0].label,'校园随拍');
 assert.equal(capture(s,'blocked',{frameClear:false}),false);assert.match(s.snapshot.photoTask!.message,/挡住/);
 assert.equal(capture(s,'accepted'),true);assert.equal(s.snapshot.photos.at(-1)?.taskId,'yard-with-friends');
 assert.equal(s.photographed(s.snapshot.photos.at(-1)!),false);
});
test('approved comparison uses exactly the accepted courtyard and reflector tasks, never an arbitrary free photograph',()=>{
 const c=fixture('approved-comparison').checkpoint();c.photos=[
 {id:'free',url:'/qa/free.jpg',position:STORY_START,label:'画框里的我们'},
 {id:'yard',url:'/qa/yard.jpg',position:STORY_START,label:'画框里的我们',taskId:'yard-with-friends'},
 {id:'reflector',url:'/qa/reflector.jpg',position:STORY_START,label:'窗边的人',taskId:'reflector-capture'}];
 const s=new StorySession();s.restore(c);assert.deepEqual(s.snapshot.comparison.map(p=>p.id),['yard','reflector']);
});
test('supported reflector and replacement choices change positions and poses; legacy book/seated flags migrate',()=>{
 const side=fixture('reflector-order');while(side.snapshot.dialogue)side.advance();side.choose(1);while(side.snapshot.dialogue)side.advance();ready(side);
 assert.equal(side.snapshot.actors.find(a=>a.id==='lin-cen')?.pose,'strap');assert.equal(side.snapshot.actors.find(a=>a.id==='zhou-xu')?.destination[0],-58);
 for(const replacement of ['strap','wave']){const cp=fixture('reshoot-order').checkpoint();cp.flags.replacement=replacement;cp.step='reshoot-photo';const s=new StorySession();s.restore(cp);ready(s);capture(s,replacement);assert.match(s.snapshot.photos[0].label!,replacement==='strap'?/整理背带/:/抬手收工/);}
 const c=fixture('reshoot-photo').checkpoint();c.flags.replacement='book';c.flags.reflector='seated';const migrated=new StorySession();migrated.restore(c);assert.equal(migrated.checkpoint().flags.replacement,'wave');assert.equal(migrated.checkpoint().flags.reflector,'side');
});
test('film ending references only selected task photographs and the action that was actually chosen',()=>{
 const c=fixture('screening-end').checkpoint();c.flags.replacement='strap';c.photos=[{id:'replacement',position:STORY_START,taskId:'reshoot-photo'},{id:'window',position:STORY_START,taskId:'reflector-capture'}];
 const s=new StorySession();c.selected=['replacement'];s.restore(c);s.advance();s.advance();assert.match(s.snapshot.dialogue!.fullText,/整理背带/);
 c.selected=['window'];s.restore(c);s.advance();s.advance();assert.match(s.snapshot.dialogue!.fullText,/挡光/);assert.ok(!s.snapshot.dialogue!.fullText.includes('背带'));
});
test('stalled route help is optional, toggles cleanly, and does not run during overlays',()=>{
 const s=fixture('sound-investigate');s.update(.1,{position:STORY_START,photoOpen:false});for(let i=0;i<42;i++)s.update(.5,{position:STORY_START,photoOpen:false});assert.equal(s.snapshot.guidance.stalled,true);assert.equal(s.snapshot.guidance.routeHelpRequested,false);
 s.guidance('route-help');assert.equal(s.snapshot.guidance.routeHelpRequested,true);s.guidance('route-help');assert.equal(s.snapshot.guidance.routeHelpRequested,false);
 const cp=s.checkpoint();s.update(.5,{position:STORY_STAGE.actors['lin-cen'],photoOpen:false,overlayOpen:true});assert.equal(s.checkpoint().elapsed,cp.elapsed);
});
test('format 1 checkpoints preserve onboarding close and accepted task evidence without new database schema',()=>{
 const s=fixture('yard-first-shot');s.guidance('replay');s.guidance('skip');const c=s.checkpoint();c.flags.guideStage='shutter';const restored=new StorySession();restored.restore(c);restored.update(.1,{position:restored.snapshot.target!.position,photoOpen:true});capture(restored,'persist');const cp=validateStoryCheckpoint(restored.checkpoint());assert.equal(cp.version,1);
 const again=new StorySession();again.restore(cp);assert.equal(again.snapshot.guidance.stage,'close');assert.equal(again.snapshot.photoTask?.acceptedPhotoId,'persist');again.update(.1,{position:STORY_START,photoOpen:false});assert.equal(again.snapshot.step,'frame-outside');
});

test('a completed photo asks to lower the camera even after its short result notice expires',()=>{
 const s=fixture('longshot-third');ready(s);s.update(.1,{position:s.snapshot.target!.position,photoOpen:true});
 assert.equal(capture(s,'last'),true);assert.equal(s.snapshot.step,'longshot-end');
 for(let i=0;i<15;i++)s.update(.5,{position:STORY_START,photoOpen:true});
 assert.equal(s.snapshot.photoTask,null);assert.equal(s.snapshot.canInteract,false);
 assert.equal(s.snapshot.interaction.label,'先放下相机');assert.match(s.snapshot.interaction.reason,/按 C|放下相机/);assert.doesNotMatch(s.snapshot.interaction.reason,/点击对白/);
 s.update(.1,{position:STORY_START,photoOpen:false});assert.match(s.snapshot.interaction.reason,/点击对白/);
});

test('arrival waits for companions and a lowered camera, then consumes only one step after restore',()=>{
 const cp=fixture('go-east-stair').checkpoint();const target=STORY_STEPS.find(s=>s.id==='go-east-stair')!.target!;
 cp.actorRoutes={};for(const a of cp.actors){a.destination=[...a.position];}
 const s=new StorySession();s.restore(cp,target.position);
 s.update(.1,{position:target.position,photoOpen:true});assert.equal(s.snapshot.step,'go-east-stair');
 s.update(.1,{position:target.position,photoOpen:false});assert.equal(s.snapshot.step,'east-stair-top');
 assert.equal(s.checkpoint().line,0);assert.equal(s.snapshot.dialogue,null);
 s.update(.1,{position:target.position,photoOpen:false});assert.equal(s.snapshot.step,'east-stair-top');
});

test('east-stair arrival directs the player beyond the shared stair exit without changing actor routes',()=>{
 const step=STORY_STEPS.find(s=>s.id==='east-stair-top')!,target=step.target!;
 assert.deepEqual(target.position,[-37,4.32,-76.8]);assert.equal(target.radius,.55);
 for(const actor of['lin-cen','zhou-xu'] as const){assert.deepEqual(step.actors![actor]!.route!.slice(0,4),[[-35.9,.61,-78.14],[-35.9,2.465,-82.02],[-34,2.465,-82.02],[-34,4.32,-78.14]]);}
 const cp=fixture(step.id).checkpoint();cp.actorRoutes={};for(const a of cp.actors){a.position=[...step.actors![a.id]!.at];a.destination=[...a.position];}
 const s=new StorySession();s.restore(cp);s.update(.1,{position:[-33.998,4.322,-78.374],photoOpen:false});assert.equal(s.snapshot.step,step.id);assert.match(s.snapshot.interaction.reason,/等候位置/);
 s.update(.1,{position:target.position,photoOpen:false});assert.equal(s.snapshot.step,'corridor-conversation');
});

test('first-shot autofocus confirmation does not require a separate pointer-click event',()=>{
 const cp=fixture('yard-first-shot').checkpoint();cp.flags.guideStage='focus';const s=new StorySession();s.restore(cp);
 s.update(.1,{position:s.snapshot.target!.position,photoOpen:true});s.guidance('focused');
 assert.equal(capture(s,'automatic-focus'),true);assert.equal(s.snapshot.guidance.stage,'close');
 assert.equal(s.snapshot.lastCaptureResult?.status,'completed');
});

test('capture eligibility uses the exposure start rather than later actor readiness',()=>{
 const s=fixture('yard-with-friends');ready(s);const acceptedStep=s.snapshot.step;
 assert.equal(capture(s,'early',{exposureStepId:acceptedStep,actorsReady:false,rhythmReady:true}),false);
 assert.match(s.snapshot.lastCaptureResult!.message,/等同伴/);assert.equal(s.snapshot.photos[0].taskId,undefined);
 const cp=s.checkpoint();cp.actorRoutes={'lin-cen':[[-42,.18,-95]]};cp.actors[0].destination=[-42,.18,-95];s.restore(cp);
 assert.equal(s.snapshot.captureEligibility.actorsReady,false);
 assert.equal(capture(s,'steady-at-start',{exposureStepId:acceptedStep,actorsReady:true,rhythmReady:true}),true);
 assert.equal(s.snapshot.photos.at(-1)?.taskId,acceptedStep);
});

test('a stale exposure is kept as a free photo and cannot complete the new task',()=>{
 const s=fixture('corridor-photo');ready(s);
 assert.equal(capture(s,'old-exposure',{exposureStepId:'yard-first-shot',actorsReady:true,rhythmReady:true}),false);
 assert.equal(s.snapshot.step,'corridor-photo');assert.equal(s.snapshot.photos[0].taskId,undefined);assert.equal(s.snapshot.lastCaptureResult?.status,'saved');
 assert.equal(capture(s,'bad-window',{exposureStepId:'corridor-photo',actorsReady:true,rhythmReady:false}),false);
 assert.equal(s.snapshot.lastCaptureResult?.status,'retry');
});

test('a photo result remains separate from the next task and temporary photos never claim to be saved',()=>{
 const s=fixture('longshot-first');ready(s);s.update(.1,{position:s.snapshot.target!.position,photoOpen:true});
 assert.equal(capture(s,'temporary',{persisted:false}),true);assert.equal(s.snapshot.step,'longshot-second-position');
 assert.equal(s.snapshot.photoTask,null);assert.equal(s.snapshot.lastCaptureResult?.taskId,'longshot-first');
 assert.equal(s.snapshot.lastCaptureResult?.persisted,false);assert.match(s.snapshot.lastCaptureResult!.message,/任务完成/);assert.match(s.snapshot.lastCaptureResult!.message,/照片暂存/);assert.doesNotMatch(s.snapshot.lastCaptureResult!.message,/已保存|请先导出/);
});

test('travel prompts name this step destination and waiting prompts name the companions',()=>{
 const cp=fixture('yard-second-station').checkpoint(),step=STORY_STEPS.find(step=>step.id===cp.step)!;cp.actorRoutes={};
 for(const a of cp.actors){a.position=[step.target!.position[0]+3,step.target!.position[1],step.target!.position[2]];a.destination=[...step.actors![a.id]!.at];}
 const s=new StorySession();s.restore(cp);s.update(.1,{position:STORY_START,photoOpen:false});
 assert.match(s.snapshot.interaction.reason,new RegExp(s.snapshot.target!.label));
 s.update(.1,{position:s.snapshot.target!.position,photoOpen:false});assert.equal(s.snapshot.interaction.state,'waiting');
 assert.match(s.snapshot.interaction.reason,/林岑|周序/);assert.match(s.snapshot.interaction.reason,/站好/);assert.doesNotMatch(s.snapshot.interaction.reason,/同伴还在|可以先|走到/);
});

test('capture result and current task describe the correction separately from storage status',()=>{
 const s=fixture('longshot-first');ready(s);
 assert.equal(capture(s,'blocked',{frameClear:false,persisted:false}),false);
 assert.match(s.snapshot.lastCaptureResult!.message,/主体被挡/);assert.doesNotMatch(s.snapshot.lastCaptureResult!.message,/保存|导出/);
 assert.equal(s.snapshot.photoTask!.message,s.snapshot.lastCaptureResult!.message);assert.doesNotMatch(s.snapshot.photoTask!.message,/保存|导出/);assert.equal(s.snapshot.lastCaptureResult!.persisted,false);
});

test('a retry instruction remains beyond the result timer until another capture replaces it',()=>{
 const s=fixture('longshot-first');ready(s);s.update(.1,{position:s.snapshot.target!.position,photoOpen:true});
 assert.equal(capture(s,'blocked-long-lived',{frameClear:false}),false);const instruction=s.snapshot.photoTask!.message;
 for(let i=0;i<25;i++)s.update(.5,{position:s.snapshot.target!.position,photoOpen:true});
 assert.equal(s.snapshot.lastCaptureResult,null);assert.equal(s.snapshot.photoTask!.status,'retry');assert.equal(s.snapshot.photoTask!.message,instruction);assert.match(instruction,/主体被挡/);
 assert.equal(capture(s,'new-stale',{exposureStepId:'reflector-capture'}),false);assert.equal(s.snapshot.photoTask!.status,'ready');assert.doesNotMatch(s.snapshot.photoTask!.message,/挡住/);
});

test('west-stair arrival reserves a side wait point while keeping both original actor destinations',()=>{
 const step=STORY_STEPS.find(s=>s.id==='west-stair')!;assert.deepEqual(step.target!.position,[-62.3,4.32,-76.8]);assert.equal(step.target!.radius,.55);
 assert.deepEqual(step.actors!['lin-cen']!.at,[-65.31,4.32,-81.54]);assert.deepEqual(step.actors!['lin-cen']!.route,[[-55,4.32,-78],[-63,4.32,-78],[-65.31,4.32,-81.54]]);
 assert.deepEqual(step.actors!['zhou-xu']!.at,[-65,4.32,-80.8]);
 const cp=fixture(step.id).checkpoint();cp.actorRoutes={};for(const a of cp.actors){a.position=[...step.actors![a.id]!.at];a.destination=[...a.position];}
 const s=new StorySession();s.restore(cp);s.update(.1,{position:[-65.31,4.32,-81.54],photoOpen:false});assert.equal(s.snapshot.step,'west-stair');
 s.update(.1,{position:step.target!.position,photoOpen:false});assert.equal(s.snapshot.step,'yard-return');
});

test('restored selected records without image sources never enter the film before reconciliation',()=>{
 const cp=fixture('film-selection').checkpoint();cp.photos=[{id:'available',position:STORY_START,url:'/qa/available.jpg'},{id:'missing-1',position:STORY_START},{id:'missing-2',position:STORY_START}];cp.selected=cp.photos.map(p=>p.id);
 const s=new StorySession();s.restore(cp);assert.equal(s.snapshot.film.length,1);assert.equal(s.snapshot.film[0].id,'available');
 s.interact();assert.equal(s.snapshot.step,'film-selection');
 s.reconcileAvailablePhotos(cp.photos.map(p=>({id:p.id,url:p.url??`/qa/${p.id}.jpg`})));assert.equal(s.snapshot.film.length,3);
 s.interact();assert.equal(s.snapshot.step,'screening');
 const screening=s.checkpoint();delete screening.photos[1].url;const restored=new StorySession();restored.restore(screening);assert.equal(restored.snapshot.film.length,2);assert.ok(restored.snapshot.film.every(f=>f.photos.every(p=>!!p.url)));
});

test('deleted and missing photos leave selection without rolling back the story; new free shots can refill it',()=>{
 const cp=fixture('film-selection').checkpoint();cp.photos=Array.from({length:50},(_,i)=>({id:`p-${i}`,position:[...STORY_START] as StoryVec3,url:`/qa/${i}.jpg`,taskId:i===0?'yard-first-shot':undefined}));cp.selected=['p-0','p-1','p-2'];
 const s=new StorySession();s.restore(cp);s.removePhotos(['p-0']);assert.equal(s.snapshot.step,'film-selection');assert.equal(s.snapshot.photos.length,49);assert.deepEqual(s.snapshot.selected,['p-1','p-2']);
 s.reconcileAvailablePhotos([{id:'p-1',url:'/qa/restored.jpg'}]);assert.equal(s.snapshot.step,'film-selection');assert.deepEqual(s.snapshot.selected,['p-1']);assert.equal(s.snapshot.film.length,1);
 s.interact();assert.equal(s.snapshot.step,'film-selection');assert.match(s.snapshot.notice,/至少三张/);
 s.photographed({id:'extra-1',url:'/qa/e1.jpg',position:STORY_START});s.photographed({id:'extra-2',url:'/qa/e2.jpg',position:STORY_START});
 s.choose(1);s.choose(2);s.interact();assert.equal(s.snapshot.step,'screening');assert.equal(s.snapshot.film.length,3);
});

test('reconciling sources keeps explicitly available temporary pictures and a completed ending',()=>{
 const cp=fixture('finished').checkpoint();cp.photos=[{id:'temporary',url:'blob:temporary',persisted:false,position:STORY_START}];cp.selected=['temporary'];
 const s=new StorySession();s.restore(cp);s.reconcileAvailablePhotos([{id:'temporary',url:'blob:still-live'}]);assert.equal(s.snapshot.finished,true);assert.equal(s.snapshot.film[0].photos[0].url,'blob:still-live');
 s.removePhotos(['temporary']);assert.equal(s.snapshot.finished,true);assert.equal(s.snapshot.step,'finished');assert.equal(s.snapshot.film.length,0);
});

test('cooperation has three matching one-second gestures, a five-second window and two full cycles before assist',()=>{
 const cp=fixture('longshot-sync').checkpoint();const target=STORY_STEPS.find(s=>s.id==='longshot-sync')!.target!;cp.cooperationTime=0;const s=new StorySession();s.restore(cp,target.position);
 s.update(.5,{position:STORY_START,photoOpen:false});assert.equal(s.snapshot.cooperation!.phase,0);assert.equal(s.snapshot.cooperation!.ready,false);
 for(let second=1;second<=3;second++){s.update(.5,{position:target.position,photoOpen:false});s.update(.5,{position:target.position,photoOpen:false});assert.equal(s.snapshot.cooperation!.gesture,second);assert.equal(s.snapshot.cooperation!.ready,second===3);}
 for(let i=0;i<9;i++)s.update(.5,{position:target.position,photoOpen:false});assert.equal(s.snapshot.cooperation!.ready,true);assert.equal(s.snapshot.cooperation!.canEnableAssist,false);
 s.update(.5,{position:target.position,photoOpen:false});assert.equal(s.snapshot.cooperation!.phase,0);assert.equal(s.snapshot.cooperation!.ready,false);
 for(let i=0;i<15;i++)s.update(.5,{position:target.position,photoOpen:false});assert.equal(s.snapshot.cooperation!.canEnableAssist,false);
 s.update(.5,{position:target.position,photoOpen:false});assert.equal(s.snapshot.cooperation!.canEnableAssist,true);s.guidance('enable-sync');assert.equal(s.snapshot.cooperation!.ready,true);assert.equal(s.snapshot.canInteract,true);
});
