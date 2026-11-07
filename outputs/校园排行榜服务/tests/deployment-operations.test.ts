import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {summarizeLog,normalizeAdmission,readDeploymentOperations} from '../src/deployment-operations.ts';
test('file summary returns fixed categories only',()=>{
 const secret='private-name token=SHOULD_NOT_LEAVE 203.0.113.10';
 const summary=summarizeLog(JSON.stringify({level:50,code:'ECONNRESET',msg:secret})+'\n'+JSON.stringify({level:40,code:secret})+'\nError: '+secret);
 assert.deepEqual(summary,{errors:2,warnings:1,codes:{ECONNRESET:1}});assert(!JSON.stringify(summary).includes(secret));
});
test('admission shape rejects unknown state and bounds queue',()=>{
 assert.equal(normalizeAdmission({admission:{canCreate:true,reason:'made-up'}}),null);
 assert.deepEqual(normalizeAdmission({admission:{canCreate:false,reason:'maintenance',queued:8}}),{canCreate:false,reason:'maintenance',queued:8});
});
test('operations metadata handles stale receipts without private values',async()=>{
 const base=path.resolve('.cache/ops-tests');await mkdir(base,{recursive:true});const root=await mkdtemp(path.join(base,'metadata-'));
 try{
  await mkdir(path.join(root,'receipts'));await mkdir(path.join(root,'logs'));
  await writeFile(path.join(root,'receipts/backup-latest.json'),JSON.stringify({backup:{schema:2,created:1000,complete:true,restoreVerified:true,bytes:300,name:'private-archive',secret:'do-not-return'}}));
  await writeFile(path.join(root,'receipts/tls-certificate.json'),JSON.stringify({expiresAt:2000,automaticRenewal:false,key:'do-not-return'}));
  await writeFile(path.join(root,'logs/api.log'),JSON.stringify({level:50,err:{code:'SQLITE_BUSY'},msg:'person email password'}));
  const result=await readDeploymentOperations(root,1000*1000+27*3600000);assert(result);assert.equal(result.backup.available,true);assert.equal((result.backup as any).stale,true);assert.equal(result.privateValuesReturned,false);
  assert.equal(result.logs[0].available,true);assert(!JSON.stringify(result).includes('do-not-return'));assert(!JSON.stringify(result).includes('person email'));
 }finally{await rm(root,{recursive:true,force:true});}
});
