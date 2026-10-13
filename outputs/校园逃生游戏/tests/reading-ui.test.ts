import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FAQ_GROUPS} from '../src/faq.ts';
import {defaultFAQGroup,searchFAQs} from '../src/faq-search.ts';
import {LATEST_RELEASE,PLAYER_RELEASES,RELEASE_DATES} from '../src/releases.ts';
import {isReleaseUnread,markReleaseRead,parseReleaseRead,RELEASE_READ_KEY} from '../src/release-read.ts';
import {PLAYER_CONTENT} from '@qisheng/shared/player-content';
function memory(initial:string|null=null){let value=initial;return {getItem:()=>value,setItem:(_key:string,next:string)=>{value=next;}};}
test('history keeps unique release identities, monotonic sequence, actual dates and changes-only entries',()=>{
 assert.equal(LATEST_RELEASE,PLAYER_RELEASES[0]);assert.match(LATEST_RELEASE.version,/^Preview 0\.\d+\.\d+$/);assert.equal(LATEST_RELEASE.summary.length,3);
 assert.equal(new Set(PLAYER_RELEASES.map(r=>r.id)).size,PLAYER_RELEASES.length);
 for(const [index,release] of PLAYER_RELEASES.entries()){
  assert.match(release.date,/^\d{4}-\d{2}-\d{2}$/);assert.equal(new Date(release.date).toISOString().slice(0,10),release.date);
  assert.ok(release.items.length>0);assert.ok(release.items.every(x=>/^(新增|调整|修复|移除)：/.test(x)));
  if(index)assert.ok(release.sequence<PLAYER_RELEASES[index-1].sequence);
 }
 assert.deepEqual(RELEASE_DATES,[...new Set(PLAYER_RELEASES.map(r=>r.date))]);
});
test('home starts with beginner help; preparation follows current mode',()=>{
 for(const mode of ['story','escape','dafei','roam'])assert.equal(defaultFAQGroup(mode,'home'),'start');
 assert.equal(defaultFAQGroup('escape','prepare'),'escape');assert.equal(defaultFAQGroup('dafei','prepare'),'dafei');
 assert.equal(defaultFAQGroup('story','prepare'),'story');assert.equal(defaultFAQGroup('roam','prepare'),'story');
});
test('search checks answers across categories with normalized case and all tokens',()=>{
 const result=searchFAQs(FAQ_GROUPS,'  ａｗｍ 胸部  ');
 assert.ok(result.some(g=>g.items.some(item=>item.q.includes('AWM'))));
 assert.ok(result.every(g=>g.items.every(item=>(item.q+item.a).normalize('NFKC').toLowerCase().includes('awm')&&(item.q+item.a).includes('胸部'))));
 assert.ok(searchFAQs(FAQ_GROUPS,'恢复码').flatMap(g=>g.items).length>=2);
 assert.deepEqual(searchFAQs(FAQ_GROUPS,'不可能存在的关键字'),[]);
 assert.equal(searchFAQs(FAQ_GROUPS,'   '),FAQ_GROUPS);
});
test('filtering never alters the canonical FAQ; labels match current controls',()=>{
 const before=JSON.stringify(FAQ_GROUPS);searchFAQs(FAQ_GROUPS,'地图');assert.equal(JSON.stringify(FAQ_GROUPS),before);
 assert.ok(FAQ_GROUPS.flatMap(g=>g.items).length>=10);assert.equal(before.includes('清理地图文件'),false);
});
test('first visit unread is based on release identity sequence, independent of same-day dates',()=>{
 const storage=memory();assert.equal(isReleaseUnread({id:'test-1000',sequence:1000},storage),true);
 markReleaseRead({id:'test-1000',sequence:1000},storage);
 assert.equal(isReleaseUnread({id:'test-1000',sequence:1000},storage),false);
 assert.equal(isReleaseUnread({id:'test-1001',sequence:1001},storage),true);
 assert.equal(isReleaseUnread({id:'rollback-999',sequence:999},storage),false);
});
test('bad storage is ignored; failed writes remain read for current session',()=>{
 assert.deepEqual(parseReleaseRead('{bad'),{id:'',sequence:0});
 for(const value of [NaN,-1,1.5,null,'3'])assert.equal(parseReleaseRead(JSON.stringify({id:'bad',sequence:value})).sequence,0);
 const broken={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 markReleaseRead({id:'session-3000',sequence:3000},broken);assert.equal(isReleaseUnread({id:'session-3000',sequence:3000},broken),false);
});
test('reading an older release cannot erase a newer persisted read marker',()=>{
 const storage=memory(JSON.stringify({id:'new-5000',sequence:5000}));
 markReleaseRead({id:'old-4000',sequence:4000},storage);
 assert.equal(parseReleaseRead(storage.getItem(RELEASE_READ_KEY)).sequence,5000);
 assert.equal(isReleaseUnread({id:'new-5000',sequence:5000},storage),false);
 assert.equal(isReleaseUnread({id:'next-5001',sequence:5001},storage),true);
});
test('both independent sites use the same canonical player content without runtime API or generated snapshot',async()=>{
 assert.equal(PLAYER_CONTENT.releases,PLAYER_RELEASES);assert.equal(PLAYER_CONTENT.faq,FAQ_GROUPS);
 assert.equal(PLAYER_CONTENT.latest,LATEST_RELEASE);
 const page=await readFile(new URL('../../校园交互网站/site/app/game/page.tsx',import.meta.url),'utf8');
 assert.ok(page.includes("import {PLAYER_CONTENT as playerContent} from '@qisheng/shared/player-content'"));
 assert.equal(page.includes('player-content.json'),false);
 assert.ok(page.includes('href="#game-help"'));assert.ok(page.includes('href="#game-release-title"'));
 assert.equal(page.includes('RELEASE_DATE'),false);
});
