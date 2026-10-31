import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn,spawnSync} from 'node:child_process';import {createHash,randomBytes} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tools=JSON.parse(await fs.readFile(path.join(root,'work/toolchain.json'),'utf8'));
const run=async(file,args,options={})=>new Promise((resolve,reject)=>{const child=spawn(file,args,{cwd:root,stdio:'inherit',windowsHide:true,...options});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(path.basename(file)+' failed with '+code)));});
await run(process.execPath,[path.join(root,'scripts/stage-assets.mjs')]);
const bundle=JSON.parse(await fs.readFile(path.join(root,'work/bundle-prepared.json'),'utf8'));
await run(process.execPath,[path.join(root,'scripts/run-gradle.mjs'),'testReleaseUnitTest','assembleRelease','--write-locks','-Pqisheng.webAssets='+bundle.assetView,'-Pqisheng.bundleDigest='+bundle.bundleDigest]);
const privateDir=path.join(root,'private');await fs.mkdir(privateDir,{recursive:true});
const key=path.join(privateDir,'android-release.jks'),password=path.join(privateDir,'signing-password.txt');
let exists=true;try{await fs.access(key);}catch{exists=false;}
if(!exists){await fs.writeFile(password,randomBytes(48).toString('base64url'),{mode:0o600,flag:'wx'});await run(path.join(tools.javaSdk,'bin/keytool.exe'),['-genkeypair','-keystore',key,'-alias','qisheng-online','-keyalg','RSA','-keysize','3072','-validity','10000','-storetype','PKCS12','-storepass:file',password,'-keypass:file',password,'-dname','CN=LIUFRAME INTERACTIVE, OU=Qisheng Online, O=LIUFRAME INTERACTIVE, C=CN']);}
await fs.access(password);
const unsigned=path.resolve(root,'../../work/android-online-build/host/app/build/outputs/apk/release/app-release-unsigned.apk');
const dist=path.join(root,'dist');await fs.mkdir(dist,{recursive:true});
const file=path.join(dist,'qisheng-online-android-v0.1.0-internal.apk');
try{await fs.access(file);throw Error('An internal package already exists; retain it and use a new version before rebuilding');}catch(error){if(error.code!=='ENOENT')throw error;}
const java=path.join(tools.javaSdk,'bin/java.exe'),signer=path.join(tools.androidSdk,'build-tools/35.0.1/lib/apksigner.jar');
await run(java,['-jar',signer,'sign','--ks',key,'--ks-key-alias','qisheng-online','--ks-pass','file:'+password,'--v1-signing-enabled','false','--v2-signing-enabled','true','--v3-signing-enabled','true','--v4-signing-enabled','false','--out',file,unsigned]);
const verification=spawnSync(java,['-jar',signer,'verify','--verbose','--print-certs',file],{encoding:'utf8',windowsHide:true});
await fs.writeFile(path.join(root,'work/apk-signature.txt'),verification.stdout+verification.stderr);
if(verification.status!==0)throw Error('APK signature verification failed');
const certificateSha256=/certificate SHA-256 digest:\s*([a-f0-9]{64})/i.exec(verification.stdout)?.[1]?.toLowerCase();if(!certificateSha256)throw Error('APK public signing certificate digest was not returned');
await run(path.join(tools.androidSdk,'build-tools/35.0.1/zipalign.exe'),['-c','-P','16','4',file]);
const bytes=await fs.readFile(file),digest=createHash('sha256').update(bytes).digest('hex');await fs.writeFile(file+'.sha256',digest+'  '+path.basename(file)+'\n');
const receipt={version:'0.1.0',versionCode:1,applicationId:'com.liuframe.qishengonline',productId:'qisheng-online-android',stage:'internal',available:false,internalOnly:true,webVersion:bundle.webVersion,mapManifestSha256:bundle.mapManifestSha256,bundleManifestSha256:bundle.bundleDigest,archive:path.basename(file),bytes:bytes.length,sha256:digest,signatureVerified:true,signingCertificateSha256:certificateSha256,alignmentVerified:true,deviceVerified:false,publicDownloadEnabled:false,createdAt:new Date().toISOString()};
await fs.writeFile(path.join(dist,'internal-release.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
