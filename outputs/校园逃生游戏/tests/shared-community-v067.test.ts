import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MapByteCache as GameMapByteCache,mapByteCache as gameCache} from '../src/map-cache.ts';
import {MapByteCache as SiteMapByteCache,mapByteCache as siteCache} from '../../校园交互网站/site/app/map-cache.ts';
import {MapByteCache as SharedMapByteCache} from '@qisheng/shared/map-client';
import {RankingClient as GameRankingClient} from '../src/ranking/client.ts';
import {RankingClient as SharedRankingClient} from '@qisheng/shared/community/client';
import {FAQ_GROUPS,PLAYER_CONTENT,PLAYER_RELEASES} from '@qisheng/shared/player-content';
import {FAQ_GROUPS as GameFAQ} from '../src/faq.ts';
import {PLAYER_RELEASES as GameReleases} from '../src/releases.ts';
import {readFeedbackReceipts,feedbackHasUnread} from '../src/feedback-unread.ts';

test('map adapters keep the same policy and one singleton per independently bundled consumer',()=>{
 assert.equal(GameMapByteCache,SharedMapByteCache);
 assert.equal(gameCache(),gameCache());
 assert.equal(siteCache(),siteCache());
 assert.equal(typeof SiteMapByteCache,'function');
 assert.deepEqual(siteCache().stats(),gameCache().stats());
});

test('API transport uses the explicitly injected origin and does not invent a host',async()=>{
 assert.equal(GameRankingClient,SharedRankingClient);
 const calls:{url:string;authorization:string|null}[]=[];
 const transport:typeof fetch=async(input,init)=>{
  calls.push({url:String(input),authorization:new Headers(init?.headers).get('Authorization')});
  return new Response(JSON.stringify({items:[]}),{headers:{'Content-Type':'application/json'}});
 };
 const game=new SharedRankingClient('/api',transport),campus=new SharedRankingClient('https://game.tianhw.top/api',transport);
 await game.request('/issues/board',{auth:false});
 await campus.request('/issues/board',{auth:false});
 assert.deepEqual(calls,[{url:'/api/v1/issues/board',authorization:null},{url:'https://game.tianhw.top/api/v1/issues/board',authorization:null}]);
});

test('both builds expose the same FAQ and release objects rather than generated copies',()=>{
 assert.equal(GameFAQ,FAQ_GROUPS);assert.equal(GameReleases,PLAYER_RELEASES);
 assert.equal(PLAYER_CONTENT.faq,FAQ_GROUPS);assert.equal(PLAYER_CONTENT.releases,PLAYER_RELEASES);
 assert.ok(FAQ_GROUPS.flatMap(group=>group.items).length>=10);
});

test('existing anonymous receipt and unread storage keys continue to work',()=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 const rows=new Map<string,string>([
  ['qisheng-feedback-receipts-v1',JSON.stringify([{id:'f-1',receiptCode:'private-receipt',title:'测试反馈'}])],
  ['qisheng-feedback-read-v1',JSON.stringify({'f-1':7})],
 ]);
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>rows.get(key)??null}});
 try{
  assert.deepEqual(readFeedbackReceipts(),[{id:'f-1',receiptCode:'private-receipt',title:'测试反馈'}]);
  assert.equal(feedbackHasUnread([{id:'f-1',latestReplyId:7,latestReplyAt:1,replyCount:1}]),false);
  assert.equal(feedbackHasUnread([{id:'f-1',latestReplyId:8,latestReplyAt:2,replyCount:2}]),true);
 }finally{if(old)Object.defineProperty(globalThis,'localStorage',old);else Reflect.deleteProperty(globalThis,'localStorage');}
});

test('site build checks shared entries without copying source, changing hosts or exporting a snapshot',async()=>{
 const base=new URL('../../校园交互网站/site/scripts/',import.meta.url);
 for(const name of ['sync-community-ui.mjs','sync-player-content.mjs','build-map-cache-index.mjs']){
  const code=await readFile(new URL(name,base),'utf8');
  assert.equal(code.includes('copyFile('),false);assert.equal(code.includes('writeFile('),false);
  assert.equal(code.includes('.replace('),false);
 }
 const legacy=await readFile(new URL('../scripts/export-player-content.ts',import.meta.url),'utf8');
 assert.equal(legacy.includes('writeFile('),false);assert.equal(legacy.includes('mkdir('),false);
});
