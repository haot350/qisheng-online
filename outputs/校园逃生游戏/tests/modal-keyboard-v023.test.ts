import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Execute the real scoped effects/functions. EventTarget preserves registration
// order and stopImmediatePropagation without mounting a browser or renderer.
function declaration(file:string,name:string){
 const source=ts.createSourceFile(file,readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 let found:ts.FunctionDeclaration|undefined;
 function visit(node:ts.Node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node;ts.forEachChild(node,visit);}
 visit(source);assert.ok(found,`${file} contains ${name}`);return {source,node:found};
}
function keyboardEffect(file:string,component:string){
 const {source,node}=declaration(file,component),effects:string[]=[];
 function visit(child:ts.Node){
  if(ts.isCallExpression(child)&&child.expression.getText(source)==='useEffect'&&child.arguments[0]?.getText(source).includes("window.addEventListener('keydown'"))effects.push(child.arguments[0].getText(source));
  ts.forEachChild(child,visit);
 }
 visit(node);assert.equal(effects.length,1,`${component} has one keyboard effect`);return effects[0];
}
const effects={photo:keyboardEffect('PhotoUI.tsx','PhotoUI'),album:keyboardEffect('PhotoUI.tsx','PhotoAlbum'),archive:keyboardEffect('ArchiveUI.tsx','ArchiveUI'),reality:keyboardEffect('RealityUI.tsx','RealityUI')};
// Node's boolean capture removal differs from the browser overload. Normalize
// it to the equivalent options object so effect cleanup follows DOM semantics.
class KeyboardWindow extends EventTarget {
 override addEventListener(type:string,listener:EventListenerOrEventListenerObject|null,options?:boolean|AddEventListenerOptions){super.addEventListener(type,listener,typeof options==='boolean'?{capture:options}:options);}
 override removeEventListener(type:string,listener:EventListenerOrEventListenerObject|null,options?:boolean|EventListenerOptions){super.removeEventListener(type,listener,typeof options==='boolean'?{capture:options}:options);}
}
function compile(source:string){return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;}
function install(effect:string,window:EventTarget,scope:Record<string,unknown>){
 const values={window,...(effect===effects.album?{confirmDelete:null,setConfirmDelete:()=>{}}:{}),...scope};const cleanup=new Function(...Object.keys(values),compile(`const effect=${effect};return effect();`))(...Object.values(values));
 assert.equal(typeof cleanup,'function');return cleanup as ()=>void;
}
function key(code:string){return Object.assign(new Event('keydown',{cancelable:true}),{code,key:code==='Space'?' ':code,repeat:false});}
function counters(){return {camera:0,cancel:0,panel:0,album:0,archive:0,reality:0,fallthrough:0};}
type Counts=ReturnType<typeof counters>;
function photoScope(count:Counts,flags:{keyboardBlocked?:boolean;album?:boolean;panel?:boolean;busy?:boolean}={}){
 return {keyboardBlocked:false,album:false,panel:false,busy:false,...flags,setAlbum:()=>count.album++,setPanel:()=>count.panel++,system:{cancel:()=>count.cancel++},onClose:()=>count.camera++};
}
function withEffects(window:EventTarget,items:{effect:string;scope:Record<string,unknown>}[],run:()=>void){
 const cleanups=items.map(item=>install(item.effect,window,item.scope));
 try{run();}finally{for(const cleanup of cleanups.reverse())cleanup();}
}

test('pending and ready reality own Escape regardless of camera listener registration order',()=>{
 for(const ready of [false,true])for(const reversed of [false,true]){
  const window=new KeyboardWindow(),count=counters();
  const items=[{effect:effects.photo,scope:photoScope(count,{keyboardBlocked:true,busy:true})},{effect:effects.reality,scope:{ready,closeRef:{current:()=>count.reality++}}}];
  if(reversed)items.reverse();
  withEffects(window,items,()=>{
   const fallback=()=>count.fallthrough++;window.addEventListener('keydown',fallback);
   try{const escape=key('Escape');window.dispatchEvent(escape);assert.equal(escape.defaultPrevented,true);assert.deepEqual(count,{camera:0,cancel:0,panel:0,album:0,archive:0,reality:1,fallthrough:0});}
   finally{window.removeEventListener('keydown',fallback);}
  });
  window.dispatchEvent(key('Escape'));assert.equal(count.reality,1,'unmount removes the real keyboard listeners');
 }
});

test('replaying reality closes one layer and leaves its photo album and camera open',()=>{
 for(const ready of [false,true])for(const reversed of [false,true]){
  const window=new KeyboardWindow(),count=counters(),albumControls={current:{reality:{} as unknown,onClose:()=>count.album++}};
  const items=[{effect:effects.photo,scope:photoScope(count,{album:true,panel:true})},{effect:effects.album,scope:{albumControls}},{effect:effects.reality,scope:{ready,closeRef:{current:()=>count.reality++}}}];
  if(reversed)items.reverse();
  withEffects(window,items,()=>{
   window.dispatchEvent(key('Escape'));assert.deepEqual(count,{camera:0,cancel:0,panel:0,album:0,archive:0,reality:1,fallthrough:0});
  });
  albumControls.current.reality=null;
  withEffects(window,[{effect:effects.photo,scope:photoScope(count,{album:true})},{effect:effects.album,scope:{albumControls}}],()=>{
   window.dispatchEvent(key('Escape'));assert.equal(count.album,1);assert.equal(count.camera,0);assert.equal(count.reality,1);
  });
 }
});

test('an external photo album returns on Escape without starting a game pause or closing the camera',()=>{
 for(const reversed of [false,true]){
  const window=new KeyboardWindow(),count=counters();const items=[{effect:effects.photo,scope:photoScope(count,{keyboardBlocked:true})},{effect:effects.album,scope:{albumControls:{current:{reality:null,onClose:()=>count.album++}}}}];
  if(reversed)items.reverse();
  withEffects(window,items,()=>{
   window.addEventListener('keydown',()=>count.fallthrough++);window.dispatchEvent(key('Escape'));
   assert.deepEqual(count,{camera:0,cancel:0,panel:0,album:1,archive:0,reality:0,fallthrough:0});
  });
 }
});

test('an archive gives Escape to its pending or ready reality and otherwise closes only the archive',()=>{
 for(const ready of [false,true])for(const reversed of [false,true]){
  const window=new KeyboardWindow(),count=counters(),controls={current:{reality:true,onClose:()=>count.archive++}};
  const items=[{effect:effects.photo,scope:photoScope(count,{keyboardBlocked:true})},{effect:effects.archive,scope:{controls}},{effect:effects.reality,scope:{ready,closeRef:{current:()=>count.reality++}}}];
  if(reversed)items.reverse();
  withEffects(window,items,()=>{window.dispatchEvent(key('Escape'));assert.equal(count.reality,1);assert.equal(count.archive,0);assert.equal(count.camera,0);});
  controls.current.reality=false;
  withEffects(window,[{effect:effects.photo,scope:photoScope(count,{keyboardBlocked:true})},{effect:effects.archive,scope:{controls}}],()=>{
   const escape=key('Escape');window.dispatchEvent(escape);assert.equal(escape.defaultPrevented,true);assert.equal(count.archive,1);assert.equal(count.camera,0);
  });
 }
});

test('camera Escape still closes its settings, cancels an exposure, or lowers the camera once',()=>{
 for(const [flags,expected] of [[{panel:true},'panel'],[{busy:true},'cancel'],[{},'camera']] as const){
  const window=new KeyboardWindow(),count=counters();
  withEffects(window,[{effect:effects.photo,scope:photoScope(count,flags)}],()=>{window.dispatchEvent(key('Escape'));assert.equal(count[expected],1);assert.equal(count.camera+count.cancel+count.panel,1);});
 }
});

test('loading reality reserves Escape while ready reality also accepts Space and Enter',()=>{
 for(const ready of [false,true]){
  const window=new KeyboardWindow(),count=counters();
  withEffects(window,[{effect:effects.reality,scope:{ready,closeRef:{current:()=>count.reality++}}}],()=>{
   for(const code of ['Space','Enter']){const event=key(code);window.dispatchEvent(event);assert.equal(event.defaultPrevented,ready);}
   assert.equal(count.reality,ready?2:0);const escape=key('Escape');window.dispatchEvent(escape);assert.equal(escape.defaultPrevented,true);assert.equal(count.reality,ready?3:1);
  });
 }
});

test('the real storyAction rejects every background action while an overlay owns input',()=>{
 const {source,node}=declaration('engine.ts','storyAction'),calls:string[]=[];
 const story={snapshot:{cinematicActive:false},interact:()=>calls.push('interact'),advance:()=>calls.push('advance'),hint:()=>calls.push('hint'),skipIntro:()=>calls.push('skip'),skipCinematic:()=>calls.push('skip-cinematic'),setPresentOnly:()=>calls.push('present'),choose:()=>calls.push('choose'),skipToCredits:()=>calls.push('credits')};
 const scope={story,phaseActive:()=>true,buffering:false,storyOverlayOpen:true,photo:null,pitch:0,camera:{fov:60,updateProjectionMatrix:()=>calls.push('camera')},settings:{fov:60},finishOpening:()=>calls.push('opening'),saveStory:()=>calls.push('save'),canvas:{focus:()=>calls.push('focus')},syncObservationCursor:()=>{},observe:()=>{},emit:()=>calls.push('emit')};
 const create=(overlay:boolean)=>new Function(...Object.keys(scope),compile(`${node.getText(source)};return storyAction;`))(...Object.values({...scope,storyOverlayOpen:overlay})) as (action:string,value?:number|boolean)=>void;
 const blocked=create(true);for(const action of ['interact','advance','hint','skip','present','choose','credits'])blocked(action,1);
 assert.deepEqual(calls,[],'callbacks cannot bypass the overlay by activating a background button');
 create(false)('advance');assert.deepEqual(calls,['advance','save','focus','emit'],'closing the overlay restores the actual action path');
});


test('album Escape dismisses a deletion confirmation before closing the photo album',()=>{
 const window=new KeyboardWindow(),count=counters();let dismissals=0;
 withEffects(window,[{effect:effects.album,scope:{albumControls:{current:{reality:null,onClose:()=>count.album++}},confirmDelete:{id:'current-photo'},setConfirmDelete:(value:unknown)=>{assert.equal(value,null);dismissals++;}}}],()=>{
  const escape=key('Escape');window.dispatchEvent(escape);assert.equal(escape.defaultPrevented,true);assert.equal(dismissals,1);assert.equal(count.album,0);
 });
});
