import test from 'node:test';
import assert from 'node:assert/strict';
import {RankingClient} from '../dist/community/client.js';
import {inspectAvatarInput} from '../dist/community/avatar-input.js';
const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
const player=id=>({id,nickname:id,shortId:id,renameAt:0,autoSubmit:false,restricted:false,accountStatus:'active'});
const identity=(id,updatedAt=1)=>({player:player(id),account:{username:id,avatar:'initials',updatedAt,publicProfile:true,syncStats:true,featuredAchievements:[]}});
const auth=id=>({...identity(id),token:'token-'+id,expiresAt:123});
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const image={revision:'rev-1',url:'/api/v1/accounts/avatar?size=512&revision=rev-1',thumbnailUrl:'/api/v1/accounts/avatar?size=96&revision=rev-1',width:512,height:512,authenticated:true};
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};}

test('private avatar uses Bearer headers and revision cache, then invalidates on profile mutation',async()=>{
 storage.clear();const calls=[];const client=new RankingClient('/api',async(url,options)=>{calls.push({url,options});if(url.includes('/avatar?'))return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'image/webp'}});if(options.method==='PATCH')return json(identity('alpha',2));return json(auth('alpha'));});
 await client.login('alpha','abcdef');const first=await client.avatarBlob(image,'thumbnail');assert.equal(first.size,3);await client.avatarBlob(image,'thumbnail');assert.equal(calls.filter(row=>row.url.includes('/avatar?')).length,1);const request=calls.find(row=>row.url.includes('/avatar?'));assert.equal(request.options.headers.Authorization,'Bearer token-alpha');assert.ok(!request.url.includes('token-alpha'));
 await client.setProfile({publicProfile:false});await client.avatarBlob(image,'thumbnail');assert.equal(calls.filter(row=>row.url.includes('/avatar?')).length,2);
});
test('a late private avatar cannot enter the next account cache',async()=>{
 storage.clear();const pending=deferred();const client=new RankingClient('/api',async(url,options)=>url.includes('/avatar?')?pending.promise:json(auth(JSON.parse(options.body).username)));
 await client.login('alpha','abcdef');const old=client.avatarBlob(image,'full');const rejected=assert.rejects(old,{code:'CANCELLED'});await client.login('beta','ghijkl');pending.resolve(new Response(new Uint8Array([1]),{headers:{'Content-Type':'image/webp'}}));await rejected;assert.equal(client.getPlayer().id,'beta');
});
test('cancelling one avatar consumer does not cancel another consumer of the same image',async()=>{
 storage.clear();const pending=deferred();let reads=0;const client=new RankingClient('/api',async(url)=>{if(url.includes('/avatar?')){reads++;return pending.promise;}return json(auth('alpha'));});await client.login('alpha','abcdef');const controller=new AbortController(),a=client.avatarBlob(image,'full',controller.signal),b=client.avatarBlob(image,'full');const rejected=assert.rejects(a,{code:'CANCELLED'});controller.abort();pending.resolve(new Response(new Uint8Array([1]),{headers:{'Content-Type':'image/webp'}}));await rejected;assert.equal((await b).size,1);assert.equal(reads,1);
});
test('avatar reads reject arbitrary hosts, unexpected content and oversize output',async()=>{
 const client=new RankingClient('/api',async()=>new Response(new Uint8Array(196609),{headers:{'Content-Type':'image/webp'}}));const publicImage={...image,authenticated:false};await assert.rejects(client.avatarBlob({...publicImage,url:'https://other.example/api/v1/players/a/avatar'},'full'),{code:'AVATAR_URL'});await assert.rejects(client.avatarBlob(publicImage,'full'),{code:'AVATAR_READ'});
});
test('avatar mutation retains concurrency revision and clearing a preset is one request',async()=>{
 storage.clear();const writes=[];const client=new RankingClient('/api',async(url,options)=>{if(url.endsWith('/accounts/avatar')){writes.push({method:options.method,body:JSON.parse(options.body)});return json(identity('alpha',writes.length+1));}return json(auth('alpha'));});await client.login('alpha','abcdef');await client.uploadAvatar('data:image/webp;base64,AA==',1);await client.removeAvatar('preset-3',2);assert.deepEqual(writes,[{method:'POST',body:{dataUrl:'data:image/webp;base64,AA==',expectedUpdatedAt:1}},{method:'DELETE',body:{avatar:'preset-3',expectedUpdatedAt:2}}]);
});
test('match filters/cursor are encoded with a twenty record cap and appearance IDs deduplicate',async()=>{
 const requests=[];const client=new RankingClient('/api',async(url,options)=>{requests.push({url,options});return json({items:[],nextCursor:null});});await client.matches({mode:'escape',cursor:'time/id+cursor',limit:500});const url=new URL(requests[0].url,'https://local.invalid');assert.equal(url.searchParams.get('limit'),'20');assert.equal(url.searchParams.get('cursor'),'time/id+cursor');await client.appearances(['a','a','b']);assert.deepEqual(JSON.parse(requests[1].options.body).playerIds,['a','b']);assert.equal(requests[1].options.headers.Authorization,undefined);
});
function png(width,height,animated=false){const bytes=new Uint8Array(animated?57:33),view=new DataView(bytes.buffer);view.setUint32(0,0x89504e47);bytes.set([13,10,26,10],4);view.setUint32(8,13);bytes.set(new TextEncoder().encode('IHDR'),12);view.setUint32(16,width);view.setUint32(20,height);if(animated){view.setUint32(33,8);bytes.set(new TextEncoder().encode('acTL'),37);}return bytes;}
test('source image header limits run before bitmap/canvas creation',()=>{assert.deepEqual(inspectAvatarInput(png(1000,2000)),{width:1000,height:2000,format:'png'});assert.throws(()=>inspectAvatarInput(png(6000,4000)),/2000万/);assert.throws(()=>inspectAvatarInput(png(100,100,true)),/静态/);assert.throws(()=>inspectAvatarInput(new Uint8Array(5*1024*1024+1)),/5 MiB/);assert.throws(()=>inspectAvatarInput(new TextEncoder().encode('<svg/>')),/JPEG/);});
