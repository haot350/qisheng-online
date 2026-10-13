import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ESCAPE_TOUCH_IDS,defaultEscapeTouchLayout,escapeControlRect,escapeTouchLayoutIssues,normalizeEscapeTouchLayout,resolveEscapeTouchLayout,sanitizeEscapeTouchLayout} from '../src/escape-touch-layout.ts';
const screens=[[667,375],[812,375],[844,390]] as const;
const safe={top:0,right:47,bottom:21,left:47};
for(const [width,height] of screens)test('touch targets fit '+width+'x'+height+' with safe areas and a clear central view',()=>{
 const layout=resolveEscapeTouchLayout(undefined,width,height,safe);assert.deepEqual(escapeTouchLayoutIssues(layout,width,height,safe),[]);
 for(const id of ESCAPE_TOUCH_IDS){const r=escapeControlRect(id,layout.buttons[id],width,height,safe);assert.ok(r.size>=44,id+' touch size');assert.ok(r.left>=safe.left+7.99,id+' left safe');assert.ok(r.right<=width-safe.right-7.99,id+' right safe');assert.ok(r.top>=7.99,id+' top safe');assert.ok(r.bottom<=height-safe.bottom-7.99,id+' bottom safe');const left=safe.left+(width-safe.left-safe.right)*.275,right=width-safe.right-(width-safe.left-safe.right)*.275;assert.ok(r.right<=left||r.left>=right,id+' must stay outside central 45%');}
});
test('old or malformed layout stays undefined; all finite positions and appearance are clamped',()=>{
 for(const raw of [undefined,null,[],{}, {version:2,buttons:{}}, {version:1,buttons:{}}])assert.equal(sanitizeEscapeTouchLayout(raw),undefined);
 const raw=defaultEscapeTouchLayout();raw.buttons.fire.x=Infinity;assert.equal(sanitizeEscapeTouchLayout(raw),undefined);raw.buttons.fire={x:-2,y:4,scale:9,opacity:-1};const result=sanitizeEscapeTouchLayout(raw)!;assert.deepEqual(result.buttons.fire,{x:0,y:1,scale:1.5,opacity:.25});
});
test('custom layouts round-trip normalized centres and appearance without mutation',()=>{
 const original=defaultEscapeTouchLayout(844,390);original.buttons.fire.opacity=.38;original.buttons.fire.scale=1.15;const copy=structuredClone(original),resolved=resolveEscapeTouchLayout(original,844,390);assert.deepEqual(original,copy);assert.equal(resolved.buttons.fire.opacity,.38);assert.equal(resolved.buttons.fire.scale,1.15);const n=normalizeEscapeTouchLayout(resolved,844,390);assert.deepEqual(n,resolved);
});
test('overlapping custom controls safely fall back without discarding stored preferences',()=>{
 const original=defaultEscapeTouchLayout(844,390);original.buttons.fire.x=original.buttons.aim.x;original.buttons.fire.y=original.buttons.aim.y;assert.ok(escapeTouchLayoutIssues(original,844,390).includes('fire'));const copy=structuredClone(original);assert.deepEqual(resolveEscapeTouchLayout(original,844,390),normalizeEscapeTouchLayout(defaultEscapeTouchLayout(844,390),844,390));assert.deepEqual(original,copy);
});
