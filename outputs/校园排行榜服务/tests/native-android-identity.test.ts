import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {readNativeUpdates} from '../src/native-updates.ts';
const sha='a'.repeat(64),base={available:true,version:'0.1.0',protocolVersion:'campus-mp-0.9.4',mapIdentity:{sourceVersion:'web-r01-campus-1',manifestHash:sha,collisionHash:sha,navigationHash:sha,visionHash:sha},downloadUrl:'/native/releases/'+sha+'/qisheng.apk',bytes:123,sha256:sha,minimumOS:'Android 10+',notes:[]};
async function withManifest(value:unknown,run:(file:string)=>Promise<void>){const dir=await mkdtemp(path.join(tmpdir(),'qs-android-meta-'));try{const file=path.join(dir,'updates.json');await writeFile(file,JSON.stringify(value));await run(file);}finally{await rm(dir,{recursive:true,force:true});}}
test('internal Android stays unavailable while existing Windows entry remains unchanged',async()=>{
 const windows={...base,downloadUrl:base.downloadUrl.replace('.apk','.zip')};
 await withManifest({windows,android:{available:false,internalOnly:true}},async file=>{const result=await readNativeUpdates(file);assert.deepEqual(result.android,{available:false});assert.equal(result.windows.version,windows.version);assert.equal('productId' in result.windows,false);});
});
test('new Android identity is explicit and cannot publish a retired package',async()=>{
 const android={...base,productId:'qisheng-online-android',applicationId:'com.liuframe.qishengonline',versionCode:1};
 await withManifest({android},async file=>{const result=await readNativeUpdates(file);assert.equal((result.android as any).productName,'齐盛Online');assert.equal((result.android as any).versionCode,1);});
 await withManifest({android:{...android,applicationId:'org.openqs.oldgodot'}},async file=>{await assert.rejects(readNativeUpdates(file),/NATIVE_MANIFEST/);});
});
