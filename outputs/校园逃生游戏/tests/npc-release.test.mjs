import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {NPC_ASSET_IDS,NPC_BASE_POSES,NPC_LOCOMOTION_POSES,NPC_POSE_WEBPS,NPC_POSE_WEBP_COUNT} from '../scripts/npc-pose-release.mjs';

test('release carries legacy poses and both movement strides at both quality levels',()=>{
 assert.equal(NPC_POSE_WEBPS.length,NPC_POSE_WEBP_COUNT);
 assert.equal(new Set(NPC_POSE_WEBPS).size,76);
 for(const id of NPC_ASSET_IDS){
  const poses=[...NPC_BASE_POSES[id],...NPC_LOCOMOTION_POSES];
  for(const pose of poses){
   const name=pose==='idle'?id:id+'-'+pose;
   for(const dir of ['characters/billboards/','characters/billboards/mobile/'])assert.ok(NPC_POSE_WEBPS.includes(dir+name+'.webp'));
  }
 }
 assert.ok(NPC_POSE_WEBPS.includes('characters/billboards/xutao-skill.webp'));
 assert.ok(NPC_POSE_WEBPS.includes('characters/billboards/mobile/chengguotao-skill.webp'));
 assert.ok(!NPC_POSE_WEBPS.some(name=>name.includes('assets-source')||name.endsWith('.png')),'masters stay outside public packages');
});

test('current preview metadata agrees across packages and canonical history without renumbering older releases',async()=>{
 const game=new URL('../',import.meta.url),site=new URL('../../校园交互网站/site/',import.meta.url);
 const {RELEASE_VERSION,RELEASE_LABEL,RELEASE_DATE}=await import('../src/release.ts');
 const {PLAYER_RELEASES,PLAYER_CONTENT}=await import('@qisheng/shared/player-content');
 assert.match(RELEASE_VERSION,/^0\.\d+\.\d+$/);assert.equal(RELEASE_LABEL,'Preview '+RELEASE_VERSION);assert.match(RELEASE_DATE,/^\d{4}-\d{2}-\d{2}$/);
 for(const root of [game,site]){
  const pkg=JSON.parse(await fs.readFile(new URL('package.json',root),'utf8'));
  const lock=JSON.parse(await fs.readFile(new URL('package-lock.json',root),'utf8'));
  assert.equal(pkg.version,RELEASE_VERSION);assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
 }
 const {LATEST_RELEASE}=await import('../src/releases.ts');const latest=PLAYER_CONTENT.latest;assert.equal(LATEST_RELEASE,latest);assert.equal(latest.id,'preview-'+RELEASE_VERSION);assert.equal(latest.version,RELEASE_LABEL);assert.equal(latest.date,RELEASE_DATE);assert.equal(PLAYER_RELEASES[0],latest);
 assert.equal(new Set(PLAYER_RELEASES.map(r=>r.id)).size,PLAYER_RELEASES.length);
 for(let i=1;i<PLAYER_RELEASES.length;i++)assert.ok(PLAYER_RELEASES[i-1].sequence>PLAYER_RELEASES[i].sequence,'history remains newest-first');
 for(const version of ['0.1.0','0.1.1','0.1.2','0.1.3','0.1.4','0.1.5','0.2.0','0.2.1','0.2.2','0.2.4','0.2.5'])assert.equal(PLAYER_RELEASES.find(r=>r.id==='preview-'+version)?.version,'Preview '+version,'historical public numbering must stay intact');
 const reading=await fs.readFile(new URL('src/MainMenu.tsx',game),'utf8'),intro=await fs.readFile(new URL('app/game/page.tsx',site),'utf8');
 assert.match(reading,/LATEST_RELEASE\.version/);assert.match(intro,/playerContent\.latest\.version/);assert.match(intro,/<summary><time dateTime=\{date\}>/);assert.match(intro,/預覽版|预览版/);
 const index=await fs.readFile(new URL('index.html',game),'utf8');assert.ok(index.includes(RELEASE_LABEL+' 预览版'),'public entry uses the current release');
});
