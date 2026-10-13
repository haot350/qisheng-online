import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {NPC_LAYOUT_V13} from '../src/npc-layout-v13.ts';
const root=path.resolve(import.meta.dirname,'..');
test('six PNG masters and twelve WebPs preserve real transparency, face coverage and edge limits',async()=>{
 const manifest=JSON.parse(await fs.readFile(path.join(root,'assets-source/NPC贴图_v1.3/asset-manifest.json'),'utf8'));
 assert.equal(manifest.assets.length,6);
 for(const row of manifest.assets){
  const shape=NPC_LAYOUT_V13[row.id as keyof typeof NPC_LAYOUT_V13][row.pose as 'idle'|'attack'|'skill'];
  const {data,info}=await sharp(path.join(root,row.source)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,shape.w);assert.equal(info.height,shape.h);assert.equal(info.channels,4);
  const [left,top,right,bottom]=shape.box;
  assert.ok(left>0&&top>0&&right<info.width-1&&bottom<info.height-1,'full body is not clipped');
  let opaqueFeet=false,zero=0;
  for(let x=left;x<=right;x++)if(data[(bottom*info.width+x)*4+3]>=128)opaqueFeet=true;
  for(let i=3;i<data.length;i+=4)if(data[i]===0)zero++;
  assert.ok(opaqueFeet,'grounded box ends at an actual opaque shoe pixel');
  assert.ok(zero>info.width*info.height*.25,'actual transparent background, not a painted backdrop');
  const headX=Math.floor((shape.head[0]+shape.head[2])/2),headY=Math.floor((shape.head[1]+shape.head[3])/2);
  assert.ok(data[(headY*info.width+headX)*4+3]>=128,'hand-calibrated head covers visible facial pixels');
  assert.ok(shape.hand.every(Number.isFinite));assert.ok(shape.hand[1]>.6&&shape.hand[1]<1.4,'gun mount is calibrated at a visible hand');
  for(const output of row.outputs){
   const metadata=await sharp(path.join(root,output.path)).metadata();
   assert.equal(metadata.hasAlpha,true);assert.ok(Math.max(metadata.width!,metadata.height!)<=(output.path.includes('/mobile/')?1024:2048));
   assert.equal((await fs.stat(path.join(root,output.path))).size,output.bytes);
  }
 }
});

