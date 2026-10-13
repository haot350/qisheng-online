import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {scryptSync} from 'node:crypto';
import {prepareCompatibleRollback,schemaCeiling} from '../scripts/rollback-compat.mjs';
const api=fileURLToPath(new URL('../../校园排行榜服务/',import.meta.url)).replace(/[\\/]$/,'');

test('schema6 migration fallback authenticates retained accounts after reopen without touching backup',async t=>{
  const base=await mkdtemp(path.join(os.tmpdir(),'qisheng-schema6-rollback-'));t.after(()=>rm(base,{recursive:true,force:true}));
  await mkdir(base+'/backups');await mkdir(base+'/config');
  const {openDatabase}=await import(new URL('../../校园排行榜服务/dist/db.js',import.meta.url));
  const file='ranking-20261012T000000Z.sqlite',db=openDatabase(base+'/backups/'+file);
  // Disposable empty fixture reproduces the actual additive schema5 layout.
  for(const table of ['multiplayer_recording','player_achievements','achievement_sources','account_appeals','accounts'])db.exec('DROP TABLE '+table);
  db.exec('ALTER TABLE runs DROP COLUMN publish_board; ALTER TABLE runs DROP COLUMN record_stats; PRAGMA user_version=5;');
  db.prepare("UPDATE mode_availability SET enabled=0,reason='保留停用设置' WHERE entry='escape-coop'").run();
  db.close();
  await writeFile(base+'/backups/last-backup.json',JSON.stringify({file}));
  const salt='schema6-rollback-fixture';await writeFile(base+'/config/production.json',JSON.stringify({adminPasswordHash:salt+':'+scryptSync('fixture-admin-password',salt,32).toString('hex'),credentialSecret:'fixture-only-secret'}));
  const before=await readFile(base+'/backups/'+file);
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/verify-api-rollback.mjs',import.meta.url)),api,api,base],{encoding:'utf8',timeout:30000,windowsHide:true});
  assert.equal(result.status,0,result.stdout+result.stderr);
  const proof=JSON.parse(result.stdout.trim().split('\n').at(-1));assert.equal(proof.originalSchema,5);assert.equal(proof.upgradedSchema,6);assert.equal(proof.accountCorePreserved,true);assert.equal(proof.retainedSchema6Api,true);
  assert.deepEqual(await readFile(base+'/backups/'+file),before,'original backup bytes must not change');
});
test('schema5 to schema6 preparation copies new account core and vendor instead of changing an old guard',async t=>{
  const base=await mkdtemp(path.join(os.tmpdir(),'qisheng-account-core-'));t.after(()=>rm(base,{recursive:true,force:true}));
  const previous=base+'/previous';await mkdir(previous+'/dist',{recursive:true});
  const old="const version = 5; if (version > 5) throw Error('Database schema newer than application');";await writeFile(previous+'/dist/db.js',old);
  const calls=[];
  const proof=await prepareCompatibleRollback({previousApi:previous,nextApi:api,releaseId:'20261012T000001Z-0.8.0',serviceBase:base,node:process.execPath,toolsBase:base+'/tools',run:async(...args)=>calls.push(args)});
  assert.equal(proof.retainAccountApi,true);assert.equal(proof.sourceApi,api);assert.equal(proof.from,5);assert.equal(proof.to,6);
  assert.equal(schemaCeiling(await readFile(proof.path+'/dist/db.js','utf8')),6);
  assert.equal(await readFile(previous+'/dist/db.js','utf8'),old);
  assert.deepEqual(await readFile(proof.path+'/dist/accounts.js'),await readFile(api+'/dist/accounts.js'));
  assert.ok(proof.files.some(row=>row.path.startsWith('vendor/')));assert.equal(proof.patchedFiles.length,0);assert.equal(calls.length,2);
});
