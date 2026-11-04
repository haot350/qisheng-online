import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {packAssetEntities} from '../asset-entities.mjs';

test('APK aliases share exact bytes without changing logical URL or MIME source',async()=>{
 const parent=await fs.realpath(os.tmpdir()),dir=await fs.mkdtemp(path.join(parent,'qisheng-entities-'));
 try{
  const dist=path.join(dir,'dist'),overlay=path.join(dir,'overlay');await fs.mkdir(dist);await fs.mkdir(overlay);
  const bytes=Buffer.from('same content'),sha256=createHash('sha256').update(bytes).digest('hex');
  await fs.writeFile(path.join(dist,'sample.css'),bytes);await fs.writeFile(path.join(dist,'license.txt'),bytes);
  const result=await packAssetEntities([{path:'sample.css',bytes:bytes.length,sha256},{path:'license.txt',bytes:bytes.length,sha256}],{dist,overlay});
  assert.equal(result.report.physicalEntities,1);assert.equal(result.report.savedUncompressedBytes,bytes.length);
  assert.deepEqual(result.files.map(x=>[x.url,x.mimePath]),[['/sample.css','sample.css'],['/license.txt','license.txt']]);
  assert.equal(result.files[0].path,result.files[1].path);
  assert.deepEqual(await fs.readFile(path.join(overlay,result.files[0].path)),bytes);
  await fs.mkdir(path.join(dist,'licenses'));
  await fs.writeFile(path.join(dist,'licenses','LICENSE'),Buffer.from('License text'));
  const license=Buffer.from('License text'),licenseHash=createHash('sha256').update(license).digest('hex');
  const plain=await packAssetEntities([{path:'licenses/LICENSE',bytes:license.length,sha256:licenseHash}],{dist,overlay});
  assert.equal(plain.files[0].mimePath,'licenses/LICENSE');
  assert.match(plain.files[0].path,/\.bin$/);
  assert.deepEqual(await fs.readFile(path.join(overlay,plain.files[0].path)),license);
  await fs.writeFile(path.join(dist,'sample.css'),'changed');
  await assert.rejects(packAssetEntities([{path:'sample.css',bytes:bytes.length,sha256}],{dist,overlay}),/changed/);
  await assert.rejects(packAssetEntities([{path:'../sample.css',bytes:bytes.length,sha256}],{dist,overlay}),/Unsafe/);
 }finally{const checked=await fs.realpath(dir);if(path.dirname(checked)!==parent||!path.basename(checked).startsWith('qisheng-entities-'))throw Error('Unsafe fixture cleanup');await fs.rm(checked,{recursive:true});}
});
