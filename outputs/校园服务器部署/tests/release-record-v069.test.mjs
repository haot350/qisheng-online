import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {RELEASE_RECORD,releaseRecordAction,releaseRecordRemote} from '../scripts/publish-release-record-v069.mjs';
test('public player repair record uses one fixed version and actual release date',()=>{
 assert.equal(RELEASE_RECORD.id,'preview-0.6.9');assert.equal(RELEASE_RECORD.version,'Preview 0.6.9');assert.equal(RELEASE_RECORD.date,'2026-10-10');assert.equal(RELEASE_RECORD.published,true);assert.equal(RELEASE_RECORD.changes.length,4);
 assert(RELEASE_RECORD.changes.every(change=>/^(新增|调整|修复)：/.test(change)));
});
test('a new repair record is idempotent and never replaces conflicting historical records',()=>{
 assert.equal(releaseRecordAction([{id:'old',version:'Preview 0.6.8'}]),'create');assert.equal(releaseRecordAction([structuredClone(RELEASE_RECORD)]),'unchanged');
 for(const changed of [{...RELEASE_RECORD,date:'2026-10-09'},{...RELEASE_RECORD,published:false},{...RELEASE_RECORD,id:'other-record'},{...RELEASE_RECORD,changes:['changed']}])assert.throws(()=>releaseRecordAction([changed]));
 assert.throws(()=>releaseRecordAction([RELEASE_RECORD,{...RELEASE_RECORD,id:'duplicate'}]));
});
test('server script checks current verified deployment, backs up before write, uses CSRF and removes temporary session',()=>{
 for(const apply of [false,true]){const remote=releaseRecordRemote({releaseId:'20261010T120000Z-0.6.9'},'0'.repeat(64),apply),result=spawnSync(process.execPath,['--input-type=module','--check'],{input:remote,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);assert(remote.includes('evidenceSha256!==sha'));assert(remote.includes("FROM deployments WHERE id=?"));assert(remote.includes("open(target,'wx',0o600)"));assert(remote.indexOf('await db.backup(target)')<remote.indexOf("request('/admin/releases','POST'"));assert(remote.includes("'X-CSRF-Token':csrf"));assert(remote.includes("finally{if(sessionHash)db.prepare('DELETE FROM admin_sessions WHERE hash=?')"));assert(!remote.includes('adminPasswordHash'));}
});
