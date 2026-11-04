type KeyHost=Pick<Window,'addEventListener'|'removeEventListener'>;
type VisibilityHost=Pick<Document,'hidden'|'activeElement'|'body'|'pointerLockElement'|'addEventListener'|'removeEventListener'>;
export function scoreboardInterfaceTarget(target:EventTarget|null){
 const element=target as Element|null;
 return !!element&&(typeof element.closest==='function'?!!element.closest('input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"]),[role="dialog"]'):['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(element.tagName));
}
export function scoreboardGameFocus(doc:Pick<VisibilityHost,'activeElement'|'body'|'pointerLockElement'>){
 if(scoreboardInterfaceTarget(doc.activeElement))return false;
 return doc.pointerLockElement?.tagName==='CANVAS'||doc.activeElement?.tagName==='CANVAS'||!doc.activeElement||doc.activeElement===doc.body;
}
export function bindScoreboardKeyboard(onHeld:(held:boolean)=>void,{enabled=()=>true,win=window,doc=document}:{enabled?:()=>boolean;win?:KeyHost;doc?:VisibilityHost}={}){
 let held=false;
 const capture={capture:true};
 const update=(next:boolean)=>{if(next===held)return;held=next;onHeld(next);};
 const down=(event:Event)=>{const e=event as KeyboardEvent;if(e.code!=='Tab'||e.ctrlKey||e.altKey||e.metaKey)return;if(held){e.preventDefault();return;}if(e.repeat||e.defaultPrevented||doc.hidden||!enabled()||scoreboardInterfaceTarget(e.target)||!scoreboardGameFocus(doc))return;e.preventDefault();update(true);};
 const up=(event:Event)=>{if((event as KeyboardEvent).code==='Tab'&&held){event.preventDefault();update(false);}};
 const blur=()=>update(false),hidden=()=>{if(doc.hidden)update(false);},focus=(event:Event)=>{if(scoreboardInterfaceTarget(event.target))update(false);};
 win.addEventListener('keydown',down,capture);win.addEventListener('keyup',up,capture);win.addEventListener('blur',blur);doc.addEventListener('visibilitychange',hidden);doc.addEventListener('focusin',focus);
 return()=>{win.removeEventListener('keydown',down,capture);win.removeEventListener('keyup',up,capture);win.removeEventListener('blur',blur);doc.removeEventListener('visibilitychange',hidden);doc.removeEventListener('focusin',focus);};
}
