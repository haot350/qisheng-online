import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {storyObjectiveCopy,deviceGuidance} from '../src/story/guidance.ts';
import {StorySession} from '../src/story/session.ts';
import {STORY_BY_ID} from '../src/story/content.ts';
import {FAQ_GROUPS} from '../src/faq.ts';
import {collectTaskInteractionCandidates,nearbyInteractionSummary,resolveNearbyInteraction} from '../src/nearby-interaction.ts';
import {pickupReachable} from '../src/interactions.ts';
registerHooks({
 resolve(specifier,context,next){if(specifier.endsWith('.css'))return {url:'data:text/javascript,export%20%7B%7D',shortCircuit:true};if(context.parentURL?.includes('/src/')&&specifier.startsWith('.')&&!/\.(ts|tsx)$/.test(specifier)){for(const ext of ['.ts','.tsx'])if(existsSync(new URL(specifier+ext,context.parentURL)))return next(specifier+ext,context);}return next(specifier,context);},
 load(url,context,next){if(url.endsWith('.tsx'))return{format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText,shortCircuit:true};return next(url,context);}
});
const {EscapeHUD}=await import('../src/EscapeUI.tsx');

function storyAt(step:string,flags:Record<string,string>={}){
 const session=new StorySession(),save=session.checkpoint();save.step=step;save.flags={guideStage:'complete',...flags};save.line=0;save.revealed=0;save.actorRoutes={};session.restore(save,STORY_BY_ID.get(step)?.target?.position);return session;
}
test('a photo objective retains its named subjects instead of becoming a camera shortcut',()=>{
 const session=storyAt('yard-with-friends'),copy=storyObjectiveCopy(session.snapshot);
 assert.match(copy.action,/林岑和周序/);assert.doesNotMatch(copy.action,/按 C/);
 assert.equal(copy.blocker,undefined);
 session.setActorPosition('lin-cen',[-70,0,-100]);const waiting=storyObjectiveCopy(session.snapshot);
 assert.match(waiting.action,/林岑和周序/);assert.equal(waiting.blocker,session.snapshot.interaction.reason,'real companion waiting remains separate');
});
test('ready photo tasks show the actual task without an invented waiting reason',()=>{
 const session=storyAt('corridor-photo'),copy=storyObjectiveCopy(session.snapshot);
 assert.match(copy.action,/窗格/);assert.equal(copy.blocker,undefined);
});
test('replacement intentions match the chosen real character action after restore',()=>{
 for(const replacement of ['strap','wave']){
  const session=storyAt('reshoot-photo',{replacement});
  assert.match(session.snapshot.objective,replacement==='strap'?/整理背带/:/抬手示意收工/);
  assert.equal(session.snapshot.photoTask?.objective,session.snapshot.objective);
 }
});
test('a valid temporary photograph completes a task without requiring export to proceed',()=>{
 const session=storyAt('corridor-photo'),target=STORY_BY_ID.get('corridor-photo')!.target!;
 const accepted=session.photographed({id:'temporary-frame',url:'blob:frame',position:[...target.position],lookAt:target.lookAt,subjects:[],subjectsVerified:true,frameClear:true,actorsReady:true,rhythmReady:true,persisted:false});
 assert.equal(accepted,true);assert.equal(session.snapshot.lastCaptureResult?.persisted,false);
 assert.match(session.snapshot.lastCaptureResult!.message,/任务完成/);
 assert.match(session.snapshot.lastCaptureResult!.message,/暂存/);
 assert.doesNotMatch(session.snapshot.lastCaptureResult!.message,/请先导出/);
 assert.notEqual(session.snapshot.step,'corridor-photo');
});
test('focus teaching uses one device-specific action and its actual subject',()=>{
 const guide={active:true,stage:'focus' as const,title:'',body:'',replaying:false,canSkip:true,stalled:false,routeHelpRequested:false};
 const mobile=deviceGuidance(guide,true,'林岑'),desktop=deviceGuidance(guide,false,'庭院与教学楼');
 assert.match(mobile.body,/林岑.*按住“对焦”/);assert.doesNotMatch(mobile.body,/ F |空格|WASD/);
 assert.match(desktop.body,/庭院与教学楼.*按住 F/);assert.doesNotMatch(desktop.body,/也可以/);
});

function escapeFixture(){
 const site={id:'signal',label:'守点',region:'teaching',position:[0,0,0],floor:0},task={id:'hold',kind:'hold',label:'守点',sites:[site],duration:15,radius:6};
 const selected={id:'hold',kind:'hold',type:'hold',name:'守点',state:'pending',status:'pending',task,progress:0,visited:[],carrying:false,blockReason:null,selected:true,currentAction:'开始守点'};
 return {phase:'active',graceLeft:0,remaining:480,tasks:[selected],playerPosition:[0,0,0],playerFloor:0,extractionAvailable:false,extractionProgress:0,extractionDuration:20,completed:0};
}
// Exercise the real selector, 3D reachability gate and nested rendered HUD.
// The obsolete distance-only HUD fallback is intentionally no longer emulated.
function authorizedInteraction(round:any,rayDistance=(_origin:any,_direction:any,max:number)=>max){
 const position=round.playerPosition as [number,number,number],feet={x:position[0],y:position[1],z:position[2]},eye={...feet,y:feet.y+1.6};
 const tasks=round.tasks.map((t:any)=>({id:t.id,kind:t.kind,status:t.state,positions:t.task.sites.map((s:any)=>s.position),siteIds:t.task.sites.map((s:any)=>s.id),visited:t.visited,carrierId:null,drop:null}));
 const candidates=collectTaskInteractionCandidates(tasks,'local',position,round.extractionPosition?{available:round.extractionAvailable,started:round.phase==='extraction',position:round.extractionPosition}:undefined);
 return nearbyInteractionSummary(resolveNearbyInteraction(candidates.filter(c=>pickupReachable(feet,eye,{x:c.position[0],y:c.position[1],z:c.position[2]},c.range,rayDistance))));
}
const render=(round:any,interaction=authorizedInteraction(round))=>renderToStaticMarkup(createElement(EscapeHUD,{snapshot:{escape:round,interaction,weapon:'glock',health:100,stamina:100,ammo:30,reserve:90,aiming:false} as any,api:null,onPause:()=>{},onFullscreen:()=>{},touch:false}));
const keyCount=(markup:string)=>(markup.match(/<kbd>E<\/kbd>/g)??[]).length;
test('the HUD trusts engine-verified interaction rather than showing a key through an obstacle',()=>{
 const round=escapeFixture(),blocked=authorizedInteraction(round,()=>0);assert.equal(blocked,null);assert.equal(keyCount(render({...round,interactionAvailable:true},blocked)),0,'legacy boolean cannot override a blocked candidate');
 const visible=authorizedInteraction(round);assert.equal(visible?.action,'hold');assert.equal(keyCount(render(round,visible)),1);
});
test('authorized snapshots do not repeat interaction for active hold or interrupted extraction',()=>{
 const round=escapeFixture();assert.equal(keyCount(render(round)),1);
 round.tasks[0].state='active';assert.equal(keyCount(render(round)),0);
 assert.equal(keyCount(render({...round,phase:'extraction',extractionAvailable:true,extractionPosition:[0,0,0],extractionProgress:0})),0);
});
test('interaction candidates use real three-dimensional reach and pending activation endpoints',()=>{
 const round=escapeFixture();round.playerPosition=[0,3,0];assert.equal(authorizedInteraction(round),null);assert.equal(keyCount(render(round)),0);
 round.playerPosition=[10,0,0];round.tasks[0].kind=round.tasks[0].task.kind='activate';round.tasks[0].task.sites.push({id:'second',label:'第二台',region:'teaching',position:[10,0,0],floor:0});round.tasks[0].visited=['signal'];const interaction=authorizedInteraction(round);assert.equal(interaction?.siteId,'second');assert.equal(interaction?.action,'activate');assert.equal(keyCount(render(round)),1);
});
test('FAQ has the five agreed themes and covers static characters, map differences and local saving',()=>{
 assert.deepEqual(FAQ_GROUPS.map(g=>g.id),['start','escape','dafei','story','storage']);
 const questions=FAQ_GROUPS.flatMap(g=>g.items);assert.ok(questions.length>=10);
 assert.equal(new Set(questions.map(q=>q.q)).size,questions.length);
 for(const pattern of [/静态贴图/,/真实校园不一样/,/保存在哪里/])assert.ok(questions.some(q=>pattern.test(q.q)));
 assert.ok(questions.every(q=>q.q.length&&q.a.length));
});
