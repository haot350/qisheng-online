import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shareOrDownloadPhoto} from '../src/photography/share.ts';
import {DEFAULT_PHOTO_SETTINGS,type PhotoRecord} from '../src/photography/types.ts';
const photo:PhotoRecord={id:'share',kind:'virtual-photo',createdAt:'2026-10-06T10:00:00.000Z',blob:new Blob(['photo'],{type:'image/jpeg'}),width:2400,height:1600,settings:{...DEFAULT_PHOTO_SETTINGS},exposure:{aperture:8,shutter:1/125,iso:100,gain:1,meterEV:0,limited:false},position:[0,0,0],quaternion:[0,0,0,1],software:'齐盛数字校园',camera:'虚拟相机',lens:'虚拟镜头'};
test('photo file sharing invokes the native share in the original click stack',async()=>{
 let called=false,downloads=0;let sent:ShareData|undefined;
 const result=shareOrDownloadPhoto(photo,{navigator:{canShare:data=>{assert.equal(data.files?.length,1);assert.equal(data.files?.[0].type,'image/jpeg');return true;},share:data=>{called=true;sent=data;return Promise.resolve();}},download:()=>downloads++});
 assert.equal(called,true,'no asynchronous database read consumes Safari user activation');assert.equal(await result,'shared');assert.equal(downloads,0);assert.match(sent!.files![0].name,/齐盛-2026-10-06T10-00-00-000Z\.jpg/);
});
test('unsupported or throwing file capability checks fall back to download without invoking share',async()=>{
 for(const capability of[()=>false,()=>{throw Error('unsupported');}]){let downloads=0;assert.equal(await shareOrDownloadPhoto(photo,{navigator:{canShare:capability,share:()=>assert.fail('unsupported file share')},download:row=>{assert.equal(row,photo);downloads++;}}),'downloaded');assert.equal(downloads,1);}
});
test('cancelling the native share does not create a download or an error',async()=>{
 let downloads=0;assert.equal(await shareOrDownloadPhoto(photo,{navigator:{canShare:()=>true,share:async()=>{throw{name:'AbortError'};}},download:()=>downloads++}),'cancelled');assert.equal(downloads,0);
});
test('an actual share failure can export the same original blob, without implying gallery storage',async()=>{
 let downloaded:PhotoRecord|undefined;assert.equal(await shareOrDownloadPhoto(photo,{navigator:{canShare:()=>true,share:async()=>{throw Error('share failed');}},download:row=>{downloaded=row;}}),'downloaded');assert.equal(downloaded?.blob,photo.blob);
});
test('closing an album before a failed share completes prevents a late download',async()=>{
 let reject:((reason:Error)=>void)|undefined,current=true,downloads=0;const result=shareOrDownloadPhoto(photo,{navigator:{canShare:()=>true,share:()=>new Promise((_resolve,fail)=>{reject=fail;})},isCurrent:()=>current,download:()=>downloads++});current=false;reject!(Error('late'));assert.equal(await result,'cancelled');assert.equal(downloads,0);
});
test('a real download failure reaches the caller for a local retry',async()=>{
 await assert.rejects(shareOrDownloadPhoto(photo,{navigator:{canShare:()=>false,share:async()=>{}},download:()=>{throw Error('download blocked');}}),/download blocked/);
});
