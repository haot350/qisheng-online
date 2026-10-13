import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {createElement,isValidElement,type ReactElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import type {Mode,Snapshot,DrivingSnapshot,GameAPI} from '../src/types.ts';
import {DEFAULT_PHOTO_SETTINGS,type PhotoRecord,type PhotoSnapshot,type PhotoControl} from '../src/photography/types.ts';
import {AlbumFullError} from '../src/photography/album.ts';
import {StorySession} from '../src/story/session.ts';
import {EscapeRound} from '../src/escape/round.ts';
import {staticAssetUrl} from '../src/static-assets.ts';

// Render the real UI branches and exercise menu callbacks without mounting a
// browser/GPU. App's top-level hooks retain fixture state; child components use
// React's normal server renderer. This is not a phone or pointer-capture test.
const moduleURL=(source:string)=>`data:text/javascript,${encodeURIComponent(source)}`;
const reactURL=import.meta.resolve('react');
const hooksURL=moduleURL(`export * from ${JSON.stringify(reactURL)};
  import {lazy as originalLazy,useState as realUseState,useRef as realUseRef} from ${JSON.stringify(reactURL)};
  export const lazy=(loader)=>{const source=loader.toString();for(const name of ['PhotoAlbum','PhotoUI','StoryHUD','ArchiveUI','RealityUI'])if(source.includes('m.'+name))return globalThis.uiLazyModules[name];return originalLazy(loader);};
  export const useState=(initial)=>globalThis.uiFixture.topActive?globalThis.uiFixture.useState(initial):realUseState(initial);
  export const useRef=(initial)=>globalThis.uiFixture.topActive?globalThis.uiFixture.useRef(initial):realUseRef(initial);
  export const useCallback=(callback)=>callback;
  export const useEffect=()=>{};
  export const useLayoutEffect=()=>{};`);
const engineURL=moduleURL('export function createGame(){throw new Error("The UI fixture must not initialize the engine");}');
const storyStoreURL=moduleURL('export class StorySaveStore{async load(previous){return globalThis.uiStoryStore.load(previous);}async close(){globalThis.uiStoryStore.closed++;}}');
const cssURL=moduleURL('export {};');
registerHooks({
  resolve(specifier,context,nextResolve){
    if(context.parentURL?.endsWith('/src/App.tsx')){
      if(specifier==='react')return {url:hooksURL,shortCircuit:true};
      if(specifier==='./usable-viewport')return {url:moduleURL('export function useUsableViewport(){return {width:1280,height:720};}'),shortCircuit:true};
      if(specifier==='./engine')return {url:engineURL,shortCircuit:true};
      if(specifier==='./story/storage')return {url:storyStoreURL,shortCircuit:true};
      // Unread polling has its own shared-module tests; keep this menu callback
      // fixture from executing a nested React hook outside React's renderer.
      if(specifier==='./feedback-unread')return {url:moduleURL('export function useFeedbackUnread(){return false;}'),shortCircuit:true};
      if(specifier==='./OperationsUI')return {url:moduleURL(`export * from ${JSON.stringify(new URL('../src/OperationsUI.tsx',import.meta.url).href)}; import {gameOperations} from ${JSON.stringify(new URL('../src/game-operations.ts',import.meta.url).href)}; export function useGameOperations(){return {...gameOperations.snapshot(),ready:true};} export function useAnnouncements(){return {list:[],flash:null,markRead(){}};}`),shortCircuit:true};
    }
    if(specifier.endsWith('.css'))return {url:cssURL,shortCircuit:true};
    if(/\.(webp|png|jpe?g)$/.test(specifier))return {url:moduleURL('export default '+JSON.stringify(specifier)+';'),shortCircuit:true};
    if(context.parentURL?.includes('/src/')&&specifier.startsWith('.')&&!/\.(ts|tsx)$/.test(specifier)){
      const base=new URL(specifier,context.parentURL);
      for(const ext of ['.ts','.tsx'])if(existsSync(new URL(base.href+ext)))return nextResolve(specifier+ext,context);
    }
    return nextResolve(specifier,context);
  },
  load(url,context,nextLoad){
    if(url.endsWith('.tsx'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8').replaceAll('import.meta.env.DEV','false'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText,shortCircuit:true};
    return nextLoad(url,context);
  },
});
const {DEFAULT_SETTINGS}=await import('../src/types.ts');
const {StoryHUD}=await import('../src/StoryUI.tsx');
const {PhotoAlbum,PhotoUI}=await import('../src/PhotoUI.tsx');
const {ArchiveUI}=await import('../src/ArchiveUI.tsx');
const {RealityUI}=await import('../src/RealityUI.tsx');
Object.defineProperty(globalThis,'uiLazyModules',{configurable:true,value:{StoryHUD,PhotoAlbum,PhotoUI,ArchiveUI,RealityUI}});
const {default:App}=await import('../src/App.tsx');
const {DafeiIntro,DrivingHelp}=await import('../src/DrivingUI.tsx');
const {EscapeTouchControls}=await import('../src/EscapeTouchUI.tsx');
const {ModuleBoundary}=await import('../src/ModuleBoundary.tsx');
const {MainMenu,MenuReadingPanel}=await import('../src/MainMenu.tsx');

type Element=ReactElement<Record<string,unknown>>;
function elements(node:unknown,result:Element[]=[]):Element[]{
  if(Array.isArray(node)){for(const child of node)elements(child,result);}
  else if(isValidElement(node)){const element=node as Element;result.push(element);elements(element.props.children,result);}
  return result;
}
function element(tree:unknown,predicate:(node:Element)=>boolean){const found=elements(tree).find(predicate);assert.ok(found,'expected UI element is present');return found;}
const html=(tree:ReactElement)=>renderToStaticMarkup(tree);
const mainMenu=(tree:ReactElement)=>element(tree,n=>n.type===MainMenu);
const menuStart=(tree:ReactElement)=>({props:{onClick:mainMenu(tree).props.onStart}});
const driving=():DrivingSnapshot=>({gear:1,rpm:900,transmission:'auto',shiftLeft:0,shiftSerial:0,rejectedShiftSerial:0,score:300,hits:2,combo:2,bestCombo:2,bestScore:500,durability:340,speed:10,boostLeft:0,boostCooldown:0,countdown:0,resetProgress:0,repairProgress:0,repairName:'',guide:'',targets:[{id:0,name:'追逐者',angle:Math.PI/2,remaining:2}]});
function escapeState(phase:Snapshot['phase']){const site=(id:string,x:number)=>({id,label:id,region:'teaching' as const,position:[x,0,0] as [number,number,number],floor:0 as const});const points=[site('one',10),site('two',20),site('three',30)],gate=site('gate',0);const round=new EscapeRound({difficulty:'standard',plan:{seed:17,difficulty:'standard',spawn:[0,0,0],extraction:gate,tasks:points.map((point,i)=>({id:'task-'+i,kind:'take' as const,label:'任务'+i,sites:[point],duration:0,radius:2.4}))}});if(phase==='won'){for(const point of points)round.update(.016,{position:point.position,interactPressed:true});round.update(.016,{position:[0,0,0],interactPressed:true});round.update(20,{position:[0,0,0],extractionClear:true});}return {...round.snapshot(),best:92,playerPosition:[0,0,0] as [number,number,number],playerFloor:0,mapFloor:0,mapFloors:[0,1,2,3,4]};}
const snapshot=(mode:Mode,phase:Snapshot['phase']='menu'):Snapshot=>({phase,mode,progress:100,message:'',health:100,stamina:100,ammo:17,reserve:51,weapon:'glock',hasPrimary:mode==='escape',smokes:2,remaining:mode==='dafei'?300:480,elapsed:0,grace:0,clues:0,goalName:'庭院',goalDistance:30,goalAngle:0,extraction:0,running:false,crouching:false,aiming:false,reloading:false,hit:0,hitType:null,hurt:0,incoming:[{id:1,angle:0,vertical:0,strength:.8,remaining:.8}],fps:30,quality:'自动',musicError:false,best:null,resultReason:'',notice:'',buffering:false,mapError:false,mapProgress:1,...(mode==='dafei'?{driving:driving()}:mode==='escape'?{escape:escapeState(phase)}:{})});

// Bind actual named App states rather than interpreting a changed hook order as
// another state. Parsing keeps this lifecycle fixture independent of formatting.
const appSource=ts.createSourceFile('App.tsx',readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const appDeclaration=appSource.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='App');assert.ok(appDeclaration);
const stateNames:string[]=[];
const refNames:string[]=[];
function refDeclarations(node:ts.Node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer&&ts.isCallExpression(node.initializer)&&node.initializer.expression.getText(appSource)==='useRef')refNames.push(node.name.text);ts.forEachChild(node,refDeclarations);}refDeclarations(appDeclaration);
function stateDeclarations(node:ts.Node){if(ts.isVariableDeclaration(node)&&ts.isArrayBindingPattern(node.name)&&node.initializer&&ts.isCallExpression(node.initializer)&&node.initializer.expression.getText(appSource)==='useState'){const first=node.name.elements[0];assert.ok(ts.isBindingElement(first)&&ts.isIdentifier(first.name));stateNames.push(first.name.text);}ts.forEachChild(node,stateDeclarations);}stateDeclarations(appDeclaration);
async function fixture(mode:Mode,run:(f:{render:()=>ReactElement;starts:{mode:Mode;loadout:unknown}[];state:Record<string,unknown>;cues:()=>number;prepares:()=>number;api:GameAPI;store:{load:(previous?:boolean)=>Promise<unknown>;closed:number}})=>void|Promise<void>,overrides:Record<string,unknown>={}){
  const starts:{mode:Mode;loadout:unknown}[]=[],state:Record<string,unknown>={snapshot:snapshot(mode),settings:{...DEFAULT_SETTINGS},selectedMode:mode,menuScreen:'prepare',preparation:{state:'ready',progress:100,message:''},...overrides};
  let cueCount=0,prepareCount=0;
  const api={start:async(mode:Mode,loadout?:unknown)=>{starts.push({mode,loadout});},prepareDafeiIntro:async()=>{prepareCount++;state.snapshot=snapshot('dafei','intro');},guide(){cueCount++;},menu(){state.snapshot=snapshot(mode);},setSettings(){},drive(){},action(){},move(){},look(){},holdLook(){}} as unknown as GameAPI;
  let stateIndex=0,refIndex=0;
  const refs:{current:unknown}[]=[];
  const store={load:async(_previous?:boolean):Promise<unknown>=>null,closed:0};
  const globals={uiStoryStore:store,uiFixture:{topActive:false,useState(initial:unknown){const key=stateNames[stateIndex++];assert.ok(key,'unexpected App state hook');if(!(key in state))state[key]=typeof initial==='function'?(initial as ()=>unknown)():initial;return [state[key],(next:unknown)=>{state[key]=typeof next==='function'?(next as (old:unknown)=>unknown)(state[key]):next;}];},useRef(initial:unknown){const index=refIndex++;return refs[index]??(refs[index]={current:refNames[index]==='game'?api:initial});}},localStorage:{getItem:(key:string)=>key==='qisheng-combat-briefing-v1'?'["solo","coop","pvp"]':null,setItem(){}},matchMedia:()=>({matches:false}),navigator:{maxTouchPoints:0},document:{documentElement:{requestFullscreen:undefined}},location:{search:''},window:{innerWidth:800,innerHeight:600}};
  const descriptors=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value]of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,value});
  const render=()=>{stateIndex=refIndex=0;let tree:ReactElement;globalThis.uiFixture.topActive=true;try{tree=App();}finally{globalThis.uiFixture.topActive=false;}assert.equal(stateIndex,stateNames.length);return tree;};
  try{await run({render,starts,state,cues:()=>cueCount,prepares:()=>prepareCount,api,store});}finally{for(const [key,descriptor]of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
}

test('four menu modes share one start action, prepare separately and keep FAQ and updates in reading panels',async()=>{
  for(const mode of ['story','escape','roam','dafei'] as const)await fixture(mode,({render,state})=>{
    let menu=mainMenu(render());assert.equal(menu.props.screen,'prepare');assert.equal(menu.props.mode,mode);
    const prepared=html(render());assert.equal(prepared.includes('id="primary-weapon"'),mode==='escape');assert.match(prepared,/预览版/);
    assert.equal(prepared.includes('faq-list'),false,'reading material does not crowd preparation');
    (menu.props.onModes as ()=>void)();const modes=html(render());assert.equal((modes.match(/class="menu-mode-card /g)??[]).length,4);
    (mainMenu(render()).props.onMode as (value:Mode)=>void)(mode);assert.equal(state.selectedMode,mode);assert.equal(state.menuScreen,'prepare');
    menu=mainMenu(render());(menu.props.onFAQ as ()=>void)();const faq=html(render());assert.ok((faq.match(/<details>/g)??[]).length>=3);assert.ok((faq.match(/aria-pressed="/g)??[]).length>=5);
    (element(render(),n=>n.type===MenuReadingPanel).props.onClose as ()=>void)();assert.equal(state.menuReading,null);
    (mainMenu(render()).props.onUpdates as ()=>void)();const updates=html(render());
    const versions=['Preview 0.2.2','Preview 0.2.1','Preview 0.2.0','Preview 0.1.5','Preview 0.1.4','Preview 0.1.3','Preview 0.1.2','Preview 0.1.1','Preview 0.1.0'];
    for(const [index,version]of versions.entries()){assert.ok(updates.includes(version),`missing public release ${version}`);if(index)assert.ok(updates.indexOf(versions[index-1])<updates.indexOf(version),'updates must retain newest-first order');}
    assert.match(updates,/<time dateTime="2026-10-04">2026-10-04<\/time>/,'historical date remains exact after the shared reading layout migration');
  });
});

test('dafei prepares intro without a round; phase drives dialogue and restart skips it',async()=>{
  await fixture('dafei',async({render,starts,state,cues,prepares})=>{
    const button=menuStart(render());
    (button.props.onClick as ()=>void)();await Promise.resolve();await Promise.resolve();assert.deepEqual(starts,[]);assert.equal(prepares(),1);assert.equal((state.snapshot as Snapshot).phase,'intro');assert.equal(cues(),0);
    const intro=element(render(),n=>n.type===DafeiIntro),markup=html(intro);
    assert.match(markup,/大飞老师/);assert.match(markup,/跳过对白/);assert.ok(markup.includes(staticAssetUrl('/images/dafei-guide.webp')),'portrait uses its canonical hashed resource');assert.doesNotMatch(markup,/五分钟内|600 点耐久/);
    (intro.props.onCue as ()=>void)();assert.equal(cues(),1);assert.deepEqual(starts,[]);
    (intro.props.onStart as ()=>void)();await Promise.resolve();await Promise.resolve();
    assert.deepEqual(starts,[{mode:'dafei',loadout:undefined}]);
    state.busy=false;state.snapshot=snapshot('dafei','won');
    const result=element(render(),n=>typeof n.props.onRestart==='function');
    (result.props.onRestart as ()=>void)();assert.equal(starts.length,2);assert.equal(prepares(),1);
  });
  for(const mode of ['escape','roam'] as const)await fixture(mode,({render,starts,state})=>{
    (menuStart(render()).props.onClick as ()=>void)();
    assert.deepEqual(starts,[{mode,loadout:mode==='escape'?{primary:'m4a1',difficulty:'standard'}:undefined}]);
  });
});

test('driving HUD uses speed, vehicle and score controls while walking combat remains separate',async()=>{
  for(const mode of ['escape','roam','dafei'] as const)await fixture(mode,({render})=>{
    const markup=html(render());
    assert.doesNotMatch(markup,/class="drive-status"|steer-caption/);
    assert.equal(markup.includes('drive-summary'),mode==='dafei');
    assert.equal((mode==='escape'?markup.includes('reticle escape-reticle'):markup.includes('class="reticle"')),mode!=='dafei');
    assert.equal((mode==='escape'?markup.includes('fps-vitals'):markup.includes('class="vitals"')),mode!=='dafei');
    assert.equal(markup.includes('fps-ammo'),mode==='escape');
    assert.equal(markup.includes('aria-label="射击"'),false);
    assert.equal(markup.includes('aria-label="左右拖动转向"'),mode==='dafei');
    if(mode==='escape'||mode==='dafei')assert.match(markup,/incoming-hud/);else assert.doesNotMatch(markup,/incoming-hud/,'enemy-free roam does not mount combat directions');
    assert.doesNotMatch(markup,/开发环境驾驶检查|保持油门/,'production mode does not expose driving QA controls');
    if(mode==='dafei'){assert.match(markup,/aria-label="车速 36 公里每小时/);assert.match(markup,/340 \/ 400/);assert.match(markup,/积分 300/);assert.match(markup,/追逐者 右侧/);assert.doesNotMatch(markup,/右键拖动 观察/,'persistent controls have moved to help');assert.doesNotMatch(markup,/最高连击|纪录 500/);}
  },{snapshot:snapshot(mode,'playing')});
});

test('returning during intro preparation rejects stale completion without affecting a fresh preparation',async()=>{
  await fixture('dafei',async({render,state,api})=>{
    let rejectOld!:(reason:Error)=>void,resolveNew!:()=>void;
    const old=new Promise<void>((_resolve,reject)=>{rejectOld=reject;});
    api.prepareDafeiIntro=()=>{state.snapshot=snapshot('dafei','intro');return old;};
    (menuStart(render()).props.onClick as ()=>void)();
    const firstIntro=element(render(),n=>n.type===DafeiIntro);assert.equal(firstIntro.props.busy,true);
    (firstIntro.props.onBack as ()=>void)();assert.equal((state.snapshot as Snapshot).phase,'menu');assert.equal(state.busy,false);
    const fresh=new Promise<void>(resolve=>{resolveNew=resolve;});
    api.prepareDafeiIntro=()=>{state.snapshot=snapshot('dafei','intro');return fresh;};
    (menuStart(render()).props.onClick as ()=>void)();
    rejectOld(new Error('stale failure'));await Promise.resolve();await Promise.resolve();
    assert.equal(state.uiError,'');assert.equal(state.busy,true);
    resolveNew();await Promise.resolve();await Promise.resolve();assert.equal(state.busy,false);
  });
});

test('intro failure exposes retry and return while no driving input or simulation HUD is mounted',async()=>{
  await fixture('dafei',({render})=>{
    const markup=html(render());assert.match(markup,/重试准备|返回模式选择/);assert.doesNotMatch(markup,/touch-layer|drive-summary|title-screen/);
  },{snapshot:snapshot('dafei','intro'),uiError:'汽车资源未能载入，请重试。'});
});

test('manual pause removes touch controls while loading retains the escape cleanup component with actions disabled',async()=>{
  for(const mode of ['escape','dafei'] as const)for(const paused of [true,false])await fixture(mode,({render})=>{
    const tree=render(),markup=html(tree);if(paused)assert.doesNotMatch(markup,/class="touch-layer|fps-touch-controls/);else if(mode==='escape'){assert.doesNotMatch(markup,/fps-touch-controls/,'loading disables new touch actions');assert.equal((element(tree,n=>n.type===EscapeTouchControls).props.snapshot as Snapshot).buffering,true);}else assert.match(markup,/class="touch-layer/);
    assert.match(markup,paused?/pause-panel/:/streaming-panel/);
  },{snapshot:{...snapshot(mode,paused?'paused':'playing'),buffering:!paused,bufferingVisible:!paused},settings:{...DEFAULT_SETTINGS,controls:'touch'}});
});

test('driving and escape result panels display their own record type',async()=>{
  for(const mode of ['escape','dafei'] as const)await fixture(mode,({render})=>{
    const markup=html(render());assert.equal(markup.includes('本局积分'),mode==='dafei');assert.equal(markup.includes('最高积分'),mode==='dafei');assert.equal(markup.includes('本机最高评分'),mode==='escape');assert.equal(markup.includes('本次评分'),mode==='escape');
  },{snapshot:snapshot(mode,'won')});
});

test('help follows the selected mode and correctly explains driving timing, damage and observation',async()=>{
  for(const mode of ['escape','roam','dafei'] as const)await fixture(mode,({render})=>{
    const help=element(render(),n=>n.props.className==='help-panel'),markup=html(help);
    if(mode==='dafei'){assert.match(markup,/落地.*昏迷十秒/);assert.match(markup,/视线外重新登场/);assert.match(markup,/普通碰墙不扣耐久/);assert.match(markup,/右键拖动/);assert.doesNotMatch(markup,/选枪与命中|在校园中找到三份线索/);}
    if(mode==='escape'){assert.match(markup,/枪械与掩护/);assert.match(markup,/AWM|M249/);assert.doesNotMatch(markup,/维修与脱困/);}
    if(mode==='roam'){assert.match(markup,/自由走一走/);assert.doesNotMatch(markup,/选枪与命中|维修与脱困/);}
  },{showHelp:true});
  const touchHelp=renderToStaticMarkup(createElement(DrivingHelp,{touch:true}));assert.doesNotMatch(touchHelp,/<h3>电脑<\/h3>/);assert.match(touchHelp,/左侧横摇杆转向/);
});

function finishedStory(){const story=new StorySession(),checkpoint=story.checkpoint();checkpoint.step='finished';checkpoint.finished=true;checkpoint.flags.guideStage='skipped';story.restore(checkpoint);return story.snapshot;}
function playerPhoto(storageStatus:'saved'|'temporary',id='ending-player-photo'):PhotoRecord{return{id,createdAt:'2026-10-05T10:00:00Z',kind:'virtual-photo',blob:new Blob(['player-image-'+id],{type:'image/jpeg'}),width:1536,height:1024,settings:{...DEFAULT_PHOTO_SETTINGS},exposure:{aperture:8,shutter:1/125,iso:100,gain:1,meterEV:0,limited:false},position:[0,0,0],quaternion:[0,0,0,1],storageStatus,software:'齐盛数字校园',camera:'虚拟 EOS 5D Mark II',lens:'虚拟 EF24–105mm f/4L IS USM'};}
function assertEndingActionsDisabled(hud:Element,disabled:boolean){const actions=html(hud).match(/<div class="story-ending-actions">([\s\S]*?)<\/div>/)?.[1];assert.ok(actions,'real StoryHUD ending actions rendered');const buttons=actions.match(/<button\b[^>]*>/g)??[];assert.equal(buttons.length,4);for(const button of buttons)assert.equal(/\bdisabled(?:=|\s|>)/.test(button),disabled,'ending actions follow suspended state');}

test('story ending opens the player album, suspends story actions, and keeps the campus archive as a separate action',async()=>{
 await fixture('story',({render,state,api})=>{
  const removed:string[]=[];api.photoRemoved=id=>removed.push(id);
  const tree=render(),hud=element(tree,n=>n.type===StoryHUD),markup=html(tree);
  assert.match(markup,/story-ending/);assert.match(markup,/打开相册/);assert.match(markup,/校园实拍/);
  assertEndingActionsDisabled(hud,false);
  (hud.props.onAlbum as ()=>void)();assert.equal(state.playerAlbumOpen,true);assert.equal(state.archiveOpen,false);
  const opened=render(),album=element(opened,n=>n.type===PhotoAlbum);assert.match(html(album),/本机摄影相册/);assert.equal(element(opened,n=>n.type===StoryHUD).props.suspended,true);
  assertEndingActionsDisabled(element(opened,n=>n.type===StoryHUD),true);
  (album.props.onRemove as (id:string)=>void)('ending-player-photo');assert.deepEqual(removed,['ending-player-photo']);
  (album.props.onClose as ()=>void)();assert.equal(state.playerAlbumOpen,false);const returned=render();assert.equal(elements(returned).some(n=>n.type===PhotoAlbum),false);assert.equal(element(returned,n=>n.type===StoryHUD).props.suspended,false);
  assertEndingActionsDisabled(element(returned,n=>n.type===StoryHUD),false);
  (element(returned,n=>n.type===StoryHUD).props.onArchive as ()=>void)();assert.equal(state.archiveOpen,true);assert.equal(state.playerAlbumOpen,false);assert.ok(elements(render()).some(n=>n.type===ArchiveUI));
 },{snapshot:{...snapshot('story','playing'),story:finishedStory()}});
});

test('the ending album retains both original temporary Blobs and forwards independent deletion updates',async()=>{
 const first=playerPhoto('temporary','ending-temporary-first'),second=playerPhoto('temporary','ending-temporary-second'),photos=[second,first];
 await fixture('story',({render,state,api})=>{
  const removed:string[]=[];api.photoRemoved=id=>{removed.push(id);const previous=state.snapshot as Snapshot;state.snapshot={...previous,temporaryPhotos:previous.temporaryPhotos?.filter(p=>p.id!==id),latestPhoto:previous.latestPhoto?.id===id?undefined:previous.latestPhoto};};
  let album=element(render(),n=>n.type===PhotoAlbum);assert.equal(album.props.extra,undefined);assert.equal(album.props.extras,photos);assertEndingActionsDisabled(element(render(),n=>n.type===StoryHUD),true);
  const markup=html(album);assert.match(markup,/导出照片/);assert.match(markup,/导出拍摄参数/);assert.match(markup,/选择一张照片，查看、分享或导出。/);assert.doesNotMatch(markup,/照片保存在这台设备中/);assert.equal((markup.match(/未保存 · /g)??[]).length,2,'each temporary thumbnail is labelled');assert.match(markup,/<p role="status">未保存，可导出本次照片。<\/p>/);for(const [index,photo]of photos.entries())assert.equal((album.props.extras as PhotoRecord[])[index].blob,photo.blob,'App passes the original Blob for each export');
  // This fixture exercises App's real album callback and the next emitted
  // snapshot. Browser QA separately clicks the real album deletion controls.
  for(const [index,photo]of photos.entries()){
   (album.props.onRemove as (id:string)=>void)(photo.id);assert.deepEqual(removed,photos.slice(0,index+1).map(p=>p.id));album=element(render(),n=>n.type===PhotoAlbum);const remaining=album.props.extras as PhotoRecord[];assert.deepEqual(remaining.map(p=>p.id),photos.slice(index+1).map(p=>p.id));for(const p of remaining)assert.equal(p.blob,photos.find(original=>original.id===p.id)!.blob);assert.equal((state.snapshot as Snapshot).latestPhoto,undefined);
  }
  assert.match(html(album),/相册还没有照片/);(album.props.onClose as ()=>void)();assert.equal(state.playerAlbumOpen,false);assertEndingActionsDisabled(element(render(),n=>n.type===StoryHUD),false);
 },{snapshot:{...snapshot('story','playing'),story:finishedStory(),latestPhoto:second,temporaryPhotos:photos},playerAlbumOpen:true});
 const saved=playerPhoto('saved');await fixture('story',({render})=>{const album=element(render(),n=>n.type===PhotoAlbum);assert.equal(album.props.extra,undefined);assert.deepEqual(album.props.extras,[]);assert.doesNotMatch(html(album),/photo-review[^>]*><img/,'saved photos are loaded by the album rather than duplicated in extras');const savedReview=html(createElement(PhotoAlbum,{extra:saved,onClose:()=>{}}));assert.match(savedReview,/photo-review/);assert.doesNotMatch(savedReview,/未保存/,'saved thumbnails and selected photos have no temporary warning');},{snapshot:{...snapshot('story','playing'),story:finishedStory(),latestPhoto:saved,temporaryPhotos:[]},playerAlbumOpen:true});
 const photoState:PhotoSnapshot={open:true,settings:saved.settings,exposure:saved.exposure,state:'viewfinder',remaining:0,progress:0,viewReady:true,viewFailed:false,viewProgress:1,focusConfirmed:false,focusState:'idle',shutterPending:false,focusDistance:20,focusPoint:[0,0],roll:0,histogram:[],message:'',albumCount:50,lastPhotoId:null,width:1536,height:1024,bufferBytes:0};
 const system:PhotoControl={snapshot:()=>photoState,configure(){},focus(){},setFocusHeld(){},capture:async()=>null,cancel(){},close(){}};
 for(const [albumCount,message,shown]of [[50,'',false],[50,new AlbumFullError().message,true],[49,new AlbumFullError().message,false]] as const){const markup=html(createElement(PhotoUI,{snapshot:{...photoState,albumCount,message},system,onClose:()=>{}}));assert.equal(markup.includes('管理相册'),shown,'only an actual full-capacity attempt exposes management, and freeing a slot removes it');assert.equal(markup.includes('本机相册已有 50 张照片'),shown);}
});

test('continuing photography from the ending starts roam through the shared start action',async()=>{
 await fixture('story',({render,starts})=>{
  const hud=element(render(),n=>n.type===StoryHUD);(hud.props.onContinueRoam as ()=>void)();assert.deepEqual(starts,[{mode:'roam',loadout:undefined}]);
 },{snapshot:{...snapshot('story','playing'),story:finishedStory()}});
});

test('returning during file import discards the late checkpoint and cannot clear a new start request',async()=>{
 await fixture('story',async({render,state,api})=>{
  api.unlockAudio=()=>{};const restores:unknown[]=[];api.restoreStory=async cp=>{restores.push(cp);};
  let finishFile!:(text:string)=>void,finishStart!:()=>void;const file={size:100,text:()=>new Promise<string>(resolve=>{finishFile=resolve;})} as File;
  const hud=element(render(),n=>n.type===StoryHUD);(hud.props.onImport as (file:File)=>void)(file);assert.equal(state.busy,true);
  (hud.props.onReturnMenu as ()=>void)();state.selectedMode='roam';api.start=()=>new Promise<void>(resolve=>{finishStart=resolve;});
  (menuStart(render()).props.onClick as ()=>void)();assert.equal(state.busy,true);
  finishFile(JSON.stringify(new StorySession().checkpoint()));await new Promise<void>(resolve=>setImmediate(resolve));assert.deepEqual(restores,[]);assert.equal(state.busy,true);
  finishStart();await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(state.busy,false);assert.equal(state.uiError,'');
 },{snapshot:{...snapshot('story','playing'),story:finishedStory()}});
});

test('returning during saved-story lookup closes the store and never resurrects that story',async()=>{
 await fixture('story',async({render,state,api,store})=>{
  api.unlockAudio=()=>{};let release!:(cp:unknown)=>void;store.load=()=>new Promise(resolve=>{release=resolve;});const restores:unknown[]=[];api.restoreStory=async cp=>{restores.push(cp);};
  (mainMenu(render()).props.onContinue as ()=>void)();
  for(let i=0;i<20&&!release;i++)await new Promise<void>(resolve=>setImmediate(resolve));assert.ok(release);assert.equal(state.busy,true);
  state.snapshot={...snapshot('story','playing'),story:finishedStory()};(element(render(),n=>n.type===StoryHUD).props.onReturnMenu as ()=>void)();
  release(new StorySession().checkpoint());await new Promise<void>(resolve=>setImmediate(resolve));assert.deepEqual(restores,[]);assert.equal(state.busy,false);assert.equal(store.closed,1);assert.equal((state.snapshot as Snapshot).phase,'menu');
 },{savedStory:true});
});

test('a late resume failure cannot replace the new menu operation error or busy state',async()=>{
 await fixture('story',async({render,state,api})=>{
  let fail!:(error:Error)=>void;api.resume=()=>new Promise<void>((_resolve,reject)=>{fail=reject;});
  (element(render(),n=>n.type==='button'&&n.props.children instanceof Array&&n.props.children[0]==='继续游玩').props.onClick as ()=>void)();assert.equal(state.busy,true);
  (element(render(),n=>n.type==='button'&&n.props.children==='返回首页').props.onClick as ()=>void)();state.uiError='新的操作反馈';
  fail(Error('旧恢复失败'));await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(state.uiError,'新的操作反馈');assert.equal(state.busy,false);
 },{snapshot:snapshot('story','paused')});
});

test('independent module failures stay gated until every failed panel has recovered',async()=>{
 await fixture('story',({render,api})=>{
  const blocked:boolean[]=[];api.storyOverlay=(source,open)=>{assert.equal(source,'ui-module');blocked.push(open);};
  const boundaries=elements(render()).filter(n=>n.type===ModuleBoundary),album=boundaries.find(n=>n.props.label==='相册')!,archive=boundaries.find(n=>n.props.label==='影像档案')!;
  assert.ok(album&&archive);(album.props.onBlocked as (open:boolean)=>void)(true);(archive.props.onBlocked as (open:boolean)=>void)(true);(album.props.onBlocked as (open:boolean)=>void)(false);assert.equal(blocked.at(-1),true);
  (archive.props.onBlocked as (open:boolean)=>void)(false);assert.equal(blocked.at(-1),false);
 },{snapshot:{...snapshot('story','playing'),story:finishedStory()},playerAlbumOpen:true,archiveOpen:true});
});

test('module errors offer local retry and explicit refresh; retry replaces the rejected lazy type',()=>{
 const blocked:boolean[]=[];let retries=0;const first=()=>createElement('div',null,'first'),replacement=()=>createElement('div',null,'retry');
 const boundary=new ModuleBoundary({children:createElement(first),label:'相机',retry:()=>{retries++;return replacement;},onBlocked:open=>blocked.push(open)});
 // Drive the error-boundary lifecycle without a browser renderer. The real
 // module rejection and retry cache are tested separately in ui-module-resource.
 boundary.setState=(patch:unknown)=>{boundary.state={...boundary.state,...patch as object};};boundary.state={error:Error('chunk failed'),replacement:null,retrying:false};boundary.componentDidCatch();
 const panel=boundary.render() as ReactElement;assert.match(html(panel),/相机暂时无法打开/);assert.match(html(panel),/重试/);assert.match(html(panel),/刷新页面/);
 (element(panel,n=>n.type==='button'&&n.props.children==='重试').props.onClick as ()=>void)();assert.equal(retries,1);assert.equal(boundary.state.replacement,replacement);assert.notEqual(boundary.state.replacement,first);assert.equal(boundary.state.retrying,true);assert.equal(blocked.at(-1),true);
 boundary.ready();assert.equal(boundary.state.retrying,false);assert.equal(blocked.at(-1),false);
});
