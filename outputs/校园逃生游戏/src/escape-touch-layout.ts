export const ESCAPE_TOUCH_IDS = ['move','sprint','crouch','slide','aim','fire','reload','switch','smoke','jump','interact'] as const;
export type EscapeTouchId = typeof ESCAPE_TOUCH_IDS[number];
export type EscapeAimMode = 'toggle'|'hold';
export type EscapeTouchButton = {x:number;y:number;scale:number;opacity:number};
export type EscapeTouchLayout = {version:1;buttons:Record<EscapeTouchId,EscapeTouchButton>};
export type EscapeTouchPreferences = {escapeAimMode?:EscapeAimMode;escapeTouchLayout?:EscapeTouchLayout};
export type EscapeSafeInsets = {top:number;right:number;bottom:number;left:number};
export const ESCAPE_TOUCH_LABELS:Record<EscapeTouchId,string> = {move:'移动',sprint:'冲刺',crouch:'蹲伏',slide:'滑铲',aim:'瞄准',fire:'射击',reload:'换弹',switch:'切枪',smoke:'使用道具',jump:'跳跃',interact:'互动'};
export const ESCAPE_TOUCH_SIZE:Record<EscapeTouchId,number> = {move:108,sprint:44,crouch:44,slide:44,aim:48,fire:64,reload:44,switch:44,smoke:44,jump:44,interact:44};
const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
export function defaultEscapeTouchLayout(width=844,height=390,insets:EscapeSafeInsets={top:0,right:0,bottom:0,left:0}):EscapeTouchLayout {
 const left=insets.left,right=width-insets.right,bottom=height-insets.bottom;
 const position:Record<EscapeTouchId,[number,number]>={move:[left+76,bottom-76],sprint:[left+34,bottom-170],crouch:[left+88,bottom-170],slide:[left+134,bottom-170],aim:[right-120,bottom-110],fire:[right-52,bottom-110],reload:[right-44,bottom-184],switch:[right-90,bottom-184],smoke:[right-134,bottom-184],jump:[right-44,bottom-43],interact:[right-96,bottom-43]};
 return {version:1,buttons:Object.fromEntries(ESCAPE_TOUCH_IDS.map(id=>[id,{x:position[id][0]/width,y:position[id][1]/height,scale:1,opacity:.72}])) as Record<EscapeTouchId,EscapeTouchButton>};
}
export function sanitizeEscapeTouchLayout(raw:unknown):EscapeTouchLayout|undefined {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return undefined;
 const value=raw as {version?:unknown;buttons?:unknown};if(value.version!==1||!value.buttons||typeof value.buttons!=='object'||Array.isArray(value.buttons))return undefined;
 const source=value.buttons as Record<string,unknown>,buttons={} as Record<EscapeTouchId,EscapeTouchButton>;
 for(const id of ESCAPE_TOUCH_IDS){const item=source[id];if(!item||typeof item!=='object'||Array.isArray(item))return undefined;const b=item as Record<string,unknown>;if(!finite(b.x)||!finite(b.y)||!finite(b.scale)||!finite(b.opacity))return undefined;buttons[id]={x:clamp(b.x,0,1),y:clamp(b.y,0,1),scale:clamp(b.scale,.8,1.5),opacity:clamp(b.opacity,.25,1)};}
 return {version:1,buttons};
}
export function escapeControlRect(id:EscapeTouchId,value:EscapeTouchButton,width:number,height:number,insets:EscapeSafeInsets={top:0,right:0,bottom:0,left:0}) {
 const size=Math.max(id==='move'?86:44,ESCAPE_TOUCH_SIZE[id]*value.scale),edge=8;
 const minX=insets.left+edge+size/2,maxX=Math.max(minX,width-insets.right-edge-size/2),minY=insets.top+edge+size/2,maxY=Math.max(minY,height-insets.bottom-edge-size/2);
 const x=clamp(value.x*width,minX,maxX),y=clamp(value.y*height,minY,maxY);
 return {x,y,size,left:x-size/2,top:y-size/2,right:x+size/2,bottom:y+size/2,opacity:value.opacity};
}
export function normalizeEscapeTouchLayout(layout:EscapeTouchLayout,width:number,height:number,insets?:EscapeSafeInsets):EscapeTouchLayout {
 return {version:1,buttons:Object.fromEntries(ESCAPE_TOUCH_IDS.map(id=>{const b=layout.buttons[id],r=escapeControlRect(id,b,width,height,insets);return [id,{...b,x:r.x/width,y:r.y/height}];})) as Record<EscapeTouchId,EscapeTouchButton>};
}
export function escapeTouchLayoutIssues(layout:EscapeTouchLayout,width:number,height:number,insets?:EscapeSafeInsets):EscapeTouchId[] {
 const reserved=escapeReservedTouchZones(width,height,insets);const invalid=new Set<EscapeTouchId>(),rects=ESCAPE_TOUCH_IDS.map(id=>({id,...escapeControlRect(id,layout.buttons[id],width,height,insets)}));
 for(let a=0;a<rects.length;a++)for(let b=a+1;b<rects.length;b++){const x=rects[a],y=rects[b];if(Math.min(x.right,y.right)-Math.max(x.left,y.left)>4&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>4){invalid.add(x.id);invalid.add(y.id);}}
 for(const rect of rects)if(reserved.some(zone=>rect.left<zone.right&&rect.right>zone.left&&rect.top<zone.bottom&&rect.bottom>zone.top))invalid.add(rect.id);
 return [...invalid];
}

export function resolveEscapeTouchLayout(raw:unknown,width:number,height:number,insets?:EscapeSafeInsets):EscapeTouchLayout {
 const stored=sanitizeEscapeTouchLayout(raw),layout=normalizeEscapeTouchLayout(stored??defaultEscapeTouchLayout(width,height,insets),width,height,insets);
 return repairEscapeTouchLayout(layout,width,height,insets);
}

export function escapeReservedTouchZones(width:number,_height:number,insets:EscapeSafeInsets={top:0,right:0,bottom:0,left:0}){return [{label:'地图',left:insets.left+10,top:insets.top+10,right:insets.left+106,bottom:insets.top+106},{label:'暂停 / 全屏',left:width-insets.right-106,top:insets.top+10,right:width-insets.right-10,bottom:insets.top+54}];}
export function repairEscapeTouchLayout(layout:EscapeTouchLayout,width:number,height:number,insets:EscapeSafeInsets={top:0,right:0,bottom:0,left:0}):EscapeTouchLayout{const fixed=normalizeEscapeTouchLayout(layout,width,height,insets),issues=new Set(escapeTouchLayoutIssues(fixed,width,height,insets)),accepted:ReturnType<typeof escapeControlRect>[]=ESCAPE_TOUCH_IDS.filter(id=>!issues.has(id)).map(id=>escapeControlRect(id,fixed.buttons[id],width,height,insets)),zones=escapeReservedTouchZones(width,height,insets),defaults=defaultEscapeTouchLayout(width,height,insets);const intersects=(a:ReturnType<typeof escapeControlRect>,b:{left:number;right:number;top:number;bottom:number})=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>4&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>4;const clear=(r:ReturnType<typeof escapeControlRect>)=>!zones.some(z=>intersects(r,z))&&!accepted.some(a=>intersects(r,a));for(const id of ESCAPE_TOUCH_IDS){if(!issues.has(id))continue;let value=fixed.buttons[id],rect=escapeControlRect(id,value,width,height,insets);if(!clear(rect)){const candidates=[{...value,x:defaults.buttons[id].x,y:defaults.buttons[id].y}];for(let y=height-insets.bottom-32;y>=insets.top+32;y-=12)for(let x=insets.left+32;x<=width-insets.right-32;x+=12)candidates.push({...value,x:x/width,y:y/height});const candidate=candidates.find(b=>clear(escapeControlRect(id,b,width,height,insets)));if(candidate){rect=escapeControlRect(id,candidate,width,height,insets);value={...candidate,x:rect.x/width,y:rect.y/height};fixed.buttons[id]=value;}}accepted.push(rect);}return fixed;}
