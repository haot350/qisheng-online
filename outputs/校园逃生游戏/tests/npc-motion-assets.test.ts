import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {NPC_LAYOUT_MOTION} from '../src/npc-layout-motion.ts';

const root=path.resolve(import.meta.dirname,'..');
const ids=['jiang','meng','xu','luan','xutao','chengguotao'];
const poses=['walk-a','walk-b','run-a','run-b'];
const sha=(buffer:Buffer)=>createHash('sha256').update(buffer).digest('hex');
const manifest=JSON.parse(await fs.readFile(path.join(root,'assets-source/NPC贴图_v0.2.5/asset-manifest.json'),'utf8'));
const inside=(rect:readonly number[],x:number,y:number)=>x>=rect[0]&&x<=rect[2]&&y>=rect[1]&&y<=rect[3];

test('24 movement masters and 48 quality variants are transparent, complete and hash-verified',async()=>{
 assert.equal(manifest.assets.length,24);
 assert.equal(new Set(manifest.assets.map((a:any)=>a.id+'/'+a.pose)).size,24);
 const publicPaths=new Set<string>();
 for(const id of ids)for(const pose of poses)assert.ok(manifest.assets.some((a:any)=>a.id===id&&a.pose===pose),id+'/'+pose+' is missing');
 for(const row of manifest.assets){
  const buffer=await fs.readFile(path.join(root,row.source));assert.equal(sha(buffer),row.sourceSha256,row.source);
  const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const shape=NPC_LAYOUT_MOTION[row.id as keyof typeof NPC_LAYOUT_MOTION][row.pose as 'walk-a'|'walk-b'|'run-a'|'run-b'];
  assert.equal(info.width,shape.w);assert.equal(info.height,shape.h);assert.equal(info.channels,4);
  let left=info.width,top=info.height,right=-1,bottom=-1,zero=0,opaque=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
   const alpha=data[(y*info.width+x)*4+3];if(!alpha)zero++;
   if(alpha>=128){opaque++;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  }
  assert.deepEqual([left,top,right,bottom],[...shape.box],row.id+'/'+row.pose+' grounded box');
  assert.equal(zero,row.zeroAlpha);assert.equal(opaque,row.opaqueAlpha);
  assert.ok(zero>info.width*info.height*.25,'real alpha transparency rather than checkerboard pixels');
  assert.ok(left>0&&top>0&&right<info.width-1&&bottom<info.height-1,'no clipped head, hand or shoe');
  assert.equal(row.outputs.length,2);
  for(const output of row.outputs){
   assert.ok(!publicPaths.has(output.path),'duplicated runtime file');publicPaths.add(output.path);
   const webp=await fs.readFile(path.join(root,output.path)),meta=await sharp(webp).metadata();
   assert.equal(sha(webp),output.sha256);assert.equal(webp.length,output.bytes);assert.equal(meta.format,'webp');assert.equal(meta.hasAlpha,true);
   assert.equal(meta.width,output.width);assert.equal(meta.height,output.height);
   assert.ok(Math.max(meta.width!,meta.height!)<=(output.path.includes('/mobile/')?1024:2048));
   assert.ok(Math.abs(meta.width!/meta.height!-info.width/info.height)<.003,'resizing does not stretch the pose');
  }
 }
 assert.equal(publicPaths.size,48);
});

test('each movement frame has a facial head region, opaque low hand and leg-covered shoe baseline',async()=>{
 for(const row of manifest.assets){
  const {data,info}=await sharp(path.join(root,row.source)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const shape=NPC_LAYOUT_MOTION[row.id as keyof typeof NPC_LAYOUT_MOTION][row.pose as 'walk-a'|'walk-b'|'run-a'|'run-b'];
  const alpha=(x:number,y:number)=>data[(Math.round(y)*info.width+Math.round(x))*4+3];
  const [left,top,right,bottom]=shape.box,head=shape.head,bodyHeight=bottom-top;
  assert.ok(alpha((head[0]+head[2])/2,(head[1]+head[3])/2)>=128,row.id+'/'+row.pose+' actual face');
  assert.ok(head[1]<=top+bodyHeight*.02&&head[3]<top+bodyHeight*.29,'head stays in upper body');
  assert.ok(Math.abs(shape.anchorX-(head[0]+head[2])/2)<=.5,'horizontal anchor follows the head');
  assert.ok(shape.anchorX>left&&shape.anchorX<right);
  const [gx,gy]=row.gripPixel;
  assert.ok(alpha(gx,gy)>=128,row.id+'/'+row.pose+' hand is visible and solid');
  assert.deepEqual(row.gripPixel,row.requestedGripPixel,'no automatic search masks an incorrect hand annotation');
  assert.ok(gy>top+bodyHeight*.30&&gy<top+bodyHeight*.65,'mount is a lowered hand, not head or foot');
  const scale=1.75/bodyHeight;
  assert.ok(Math.abs(shape.hand[0]-(gx-shape.anchorX)*scale)<.0001);
  assert.ok(Math.abs(shape.hand[1]-(bottom-gy)*scale)<.0001);
  for(let x=left;x<=right;x++)if(alpha(x,bottom)>=128)assert.ok(shape.legs.some(rect=>inside(rect,x,bottom)),row.id+'/'+row.pose+' planted shoe is included in leg hit regions at x='+x);
 }
});

test('movement extraction preserves the generated pixels and uses visibly distinct stride images',async()=>{
 for(const row of manifest.assets){
  const sheet=await fs.readFile(path.join(root,row.sourceSheet));assert.equal(sha(sheet),row.sourceSheetSha256);
  const source=await sharp(sheet).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const output=await sharp(path.join(root,row.source)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  if(!row.extract){assert.deepEqual(output.data,source.data,'standalone override preserves pixels');continue;}
  const e=row.extract;
  assert.equal(output.info.width,e.width);assert.equal(output.info.height,e.height);
  if(e.mode!=='transparent-seam'){
   const original=await sharp(sheet).extract(e).ensureAlpha().raw().toBuffer();assert.deepEqual(output.data,original,'straight crop preserves original RGBA');
  }else{
   assert.equal(e.leftBoundary.length,e.height);assert.equal(e.rightBoundary.length,e.height);
   for(let y=0;y<e.height;y++)for(let x=0;x<e.width;x++){
    const sx=x+e.left,j=(y*e.width+x)*4;
    if(sx>=e.leftBoundary[y]&&sx<e.rightBoundary[y]){
     const i=(y*source.info.width+sx)*4;for(let c=0;c<4;c++)assert.equal(output.data[j+c],source.data[i+c],'curved transparent crop preserves source pixel');
    }else assert.equal(output.data[j+3],0,'other figure excluded only beyond the transparent separation');
   }
  }
 }
 for(const id of ids)for(const phase of ['walk','run']){
  const pair=manifest.assets.filter((a:any)=>a.id===id&&a.pose.startsWith(phase+'-'));
  assert.equal(pair.length,2);assert.notEqual(pair[0].sourceSha256,pair[1].sourceSha256,'alternating strides cannot be duplicate files');
  const images=[];
  for(const row of pair){const [l,t,r,b]=row.layout.box;images.push(await sharp(path.join(root,row.source)).extract({left:l,top:t,width:r-l+1,height:b-t+1}).resize(120,320).ensureAlpha().raw().toBuffer());}
  let different=0;for(let i=3;i<images[0].length;i+=4)if(Math.abs(images[0][i]-images[1][i])>80)different++;
  assert.ok(different>120*320*.025,id+'/'+phase+' has distinct moving silhouettes');
 }
});