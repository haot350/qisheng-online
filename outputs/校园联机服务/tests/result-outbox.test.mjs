import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,readFile,rm,writeFile,stat,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {persistResult} from '../dist/modules/校园联机服务/src/result-outbox.js';
const testBase=fileURLToPath(new URL('../../../work/',import.meta.url));
await mkdir(testBase,{recursive:true});
async function cleanup(dir){assert.ok(path.resolve(dir).startsWith(path.resolve(testBase)+path.sep)&&path.basename(dir).startsWith('qisheng-result-'));await rm(dir,{recursive:true,force:true});}

test('durable settlement is idempotent under retries and rejects conflicting payloads without overwriting',async()=>{
 const dir=await mkdtemp(path.join(testBase,'qisheng-result-unit-'));
 try{const result={resultId:'room:2:round-1',players:[{id:'synthetic',kills:1}]};
  await Promise.all([persistResult(dir,result),persistResult(dir,{players:result.players,resultId:result.resultId})]);
  const names=await readdir(dir);assert.equal(names.length,1);assert.ok(names[0].endsWith('.json'));assert.deepEqual(JSON.parse(await readFile(path.join(dir,names[0]),'utf8')),result);
  await assert.rejects(persistResult(dir,{...result,players:[{id:'synthetic',kills:9}]}),/RESULT_OUTBOX_CONFLICT/);
  assert.deepEqual(JSON.parse(await readFile(path.join(dir,names[0]),'utf8')),result);assert.equal((await readdir(dir)).length,1);
  if(process.platform!=='win32')assert.equal((await stat(path.join(dir,names[0]))).mode&0o777,0o600);
 }finally{await cleanup(dir);}
});
test('failed outbox location rejects before a new match can be admitted',async()=>{
 const dir=await mkdtemp(path.join(testBase,'qisheng-result-fail-'));try{const file=path.join(dir,'not-a-directory');await writeFile(file,'fixture');await assert.rejects(persistResult(file,{resultId:'fixture'}));assert.equal(await readFile(file,'utf8'),'fixture');}finally{await cleanup(dir);}
});
