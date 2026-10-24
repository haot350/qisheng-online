import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {scryptSync} from 'node:crypto';

test('schema6 vehicle fallback runs real account and vehicle credential/board checks on a disposable backup only',async t=>{
 const api=fileURLToPath(new URL('../../校园排行榜服务/',import.meta.url)).replace(/[\\/]$/,'');
 const base=await mkdtemp(path.join(os.tmpdir(),'openqs-vehicles-db-'));t.after(()=>rm(base,{recursive:true,force:true}));
 await mkdir(base+'/backups');await mkdir(base+'/config');
 const {openDatabase}=await import(new URL('../../校园排行榜服务/dist/db.js',import.meta.url));
 const file='ranking-20261024T000000Z.sqlite',db=openDatabase(base+'/backups/'+file);
 db.prepare("UPDATE mode_availability SET enabled=0,reason='Fixture disabled mode' WHERE entry IN ('dafei','escape-coop')").run();db.close();
 await writeFile(base+'/backups/last-backup.json',JSON.stringify({file}));
 const salt='vehicle-compat-test';await writeFile(base+'/config/production.json',JSON.stringify({adminPasswordHash:salt+':'+scryptSync('fixture-admin-password',salt,32).toString('hex'),credentialSecret:'fixture-vehicle-secret'}));
 const bytes=await readFile(base+'/backups/'+file);
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/verify-api-rollback.mjs',import.meta.url)),api,api,base],{encoding:'utf8',timeout:30000,windowsHide:true});
 assert.equal(result.status,0,result.stdout+result.stderr);
 const proof=JSON.parse(result.stdout.trim().split('\n').at(-1));assert.equal(proof.originalSchema,6);assert.equal(proof.upgradedSchema,6);assert.equal(proof.drivingCompatibility,true);assert.equal(proof.accountCorePreserved,true);assert(proof.compatibilityEndpoints>=25);
 assert.deepEqual(await readFile(base+'/backups/'+file),bytes);
});
