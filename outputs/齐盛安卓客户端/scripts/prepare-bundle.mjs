import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),argument=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
const dist=path.resolve(argument('--web-dist')??'');
if(!argument('--web-dist')||path.basename(dist)!=='dist')throw Error('Pass the accepted production game --web-dist path');
const game=path.dirname(dist),profile=JSON.parse(await fs.readFile(path.join(dist,'openqs-profile.json'),'utf8'));
if(profile.profile!=='production'||profile.application!=='game'||profile.privateNpcCalibration!==true)throw Error('Only the accepted full production game can be bundled');
const metadata=JSON.parse(await fs.readFile(path.join(game,'package.json'),'utf8'));
const overlay=path.join(root,'work/overlay'),runtime=path.join(overlay,'android/runtime');await fs.mkdir(runtime,{recursive:true});
await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(game,'node_modules/vite/bin/vite.js'),'build','--config','vite.android.config.ts'],{cwd:game,env:{...process.env,OPENQS_PROFILE:'production',QISHENG_ANDROID_WEB_DIST:runtime},stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Android runtime build failed')));});
const runtimeManifest=JSON.parse(await fs.readFile(path.join(runtime,'.vite/manifest.json'),'utf8'));
const entry=runtimeManifest['src/android-entry.ts'];if(!entry?.isEntry||!entry.file)throw Error('Android entry was not emitted');
const documents=[['index.html','main'],['account/index.html','account'],['credits/index.html','credits'],['copyright/index.html','copyright']];
const excluded=new Set([...documents.map(([name])=>name),'release-manifest.json','licenses/dependencies.json','_headers']);
const rows=[];const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const nativeDependencyFile=path.join(root,'work/native-dependencies.json');
await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,'scripts/run-gradle.mjs'),'writeNativeDependencyReport','--write-locks','-Pqisheng.dependencyReport='+nativeDependencyFile],{cwd:root,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Native dependency inventory failed')));});
const dependencies=JSON.parse(await fs.readFile(nativeDependencyFile,'utf8'));
const apacheComponent=row=>row.group.startsWith('androidx.')||row.group.startsWith('org.jetbrains.')||row.group==='org.jetbrains'&&row.name==='annotations'||row.group==='org.jspecify'&&row.name==='jspecify'||row.group==='com.google.guava'&&row.name==='listenablefuture';
if(dependencies.some(row=>!apacheComponent(row)))throw Error('Review native dependency license before bundling');
const tools=JSON.parse(await fs.readFile(path.join(root,'work/toolchain.json'),'utf8'));
const apache=await fs.readFile(path.join(path.dirname(tools.gradle),'../LICENSE'),'utf8');
if(!apache.includes('Apache License')||!apache.includes('Version 2.0'))throw Error('Expected Apache license text');
await fs.mkdir(path.join(overlay,'licenses'),{recursive:true});
await fs.writeFile(path.join(overlay,'licenses/Android-Native-Apache-2.0.txt'),apache);
const notice='齐盛Online Android\nLIUFRAME INTERACTIVE\n\nNative runtime components (Apache-2.0):\n'+dependencies.map(row=>row.group+':'+row.name+':'+row.version).join('\n')+'\n\nSources: https://android.googlesource.com/platform/frameworks/support/ , https://github.com/JetBrains/kotlin , https://github.com/Kotlin/kotlinx.coroutines , https://github.com/jspecify/jspecify , https://github.com/google/guava\n';
await fs.writeFile(path.join(overlay,'licenses/Android-Native-NOTICE.txt'),notice);
const licenses=JSON.parse(await fs.readFile(path.join(dist,'licenses/dependencies.json'),'utf8'));
const licenseBytes=Buffer.from(JSON.stringify([...licenses,...dependencies.map(row=>({name:row.group+':'+row.name,version:row.version,license:'Apache-2.0',files:['Android-Native-Apache-2.0.txt','Android-Native-NOTICE.txt']}))]));
await fs.mkdir(path.join(overlay,'android/licenses'),{recursive:true});await fs.writeFile(path.join(overlay,'android/licenses/dependencies.json'),licenseBytes);
rows.push({path:'android/licenses/dependencies.json',url:'/licenses/dependencies.json',bytes:licenseBytes.length,sha256:sha(licenseBytes)});
for(const [file,kind]of documents){
 let text=await fs.readFile(path.join(dist,file),'utf8');
 text=text.replace('<html ',`<html data-qisheng-entry="${kind}" `).replace(/<script\b[^>]*type=["']module["'][^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*rel=["'](?:modulepreload|stylesheet)["'][^>]*>/g,'');
 text=text.replace('</body>',`<script type="module" src="/android/runtime/${entry.file}"></script></body>`);
 if(!text.includes('data-qisheng-entry="'+kind+'"')||text.includes('src="/src/'))throw Error('Android document entry is inconsistent');
 const target='android/documents/'+kind+'.html';await fs.mkdir(path.dirname(path.join(overlay,target)),{recursive:true});await fs.writeFile(path.join(overlay,target),text);
 rows.push({path:target,url:'/'+file,bytes:Buffer.byteLength(text),sha256:sha(Buffer.from(text))});
}
const mapBytes=await fs.readFile(path.join(dist,'map/manifest.json')),map=JSON.parse(mapBytes),index=JSON.parse(await fs.readFile(path.join(dist,'map/resource-index.json'),'utf8'));
if(index.schema!==2||index.manifest.sha256!==sha(mapBytes))throw Error('Map identity does not match the accepted source index');
const resources=new Map();for(const row of Object.values(index.resources)){const list=[row,...(row.encoding?[{url:row.encoding.decodedUrl,bytes:row.encoding.decodedBytes,sha256:row.encoding.decodedSha256}]:[])];for(const item of list){if(!/^\/assets\/map\/[a-f0-9]{64}\.[a-z0-9]+$/.test(item.url))throw Error('Unexpected native map resource URL');const existing=resources.get(item.url);if(existing&&(existing.bytes!==item.bytes||existing.sha256!==item.sha256))throw Error('Conflicting resource identity');resources.set(item.url,{url:item.url,bytes:item.bytes,sha256:item.sha256});}}
const info={schema:1,productId:'qisheng-online-android',applicationId:'com.liuframe.qishengonline',version:'0.1.0',versionCode:1,internalOnly:true,available:false,webVersion:metadata.version,protocolVersion:'campus-mp-0.9.4',mapManifestSha256:sha(mapBytes),mapCatalogId:map.mapCatalogId??map.sourceVersion,resources:[...resources.values()]};
await fs.writeFile(path.join(overlay,'android/bundle-info.json'),JSON.stringify(info));
const release={version:metadata.version,releaseId:'android-0.1.0-web-'+sha(mapBytes).slice(0,12),protocolVersion:'campus-mp-0.9.4',productId:info.productId,nativeVersion:'0.1.0',internalOnly:true,mapManifestSha256:info.mapManifestSha256};
const releaseBytes=Buffer.from(JSON.stringify(release));await fs.writeFile(path.join(overlay,'android/release-manifest.json'),releaseBytes);rows.push({path:'android/release-manifest.json',url:'/release-manifest.json',bytes:releaseBytes.length,sha256:sha(releaseBytes)});
const visit=async(directory,base,prefix='')=>{for(const file of await fs.readdir(path.join(base,directory),{withFileTypes:true})){const relative=directory?directory+'/'+file.name:file.name;if(file.isSymbolicLink())throw Error('APK assets cannot be links');if(file.isDirectory()){if(relative==='.vite'||relative==='android/runtime/.vite'||relative==='android/encoded')continue;await visit(relative,base,prefix);}else if(file.isFile()){
 if(base===dist&&excluded.has(relative))continue;
 if(base===overlay&&(relative.startsWith('android/documents/')||relative==='android/release-manifest.json'||relative==='android/asset-manifest.json'||relative==='android/licenses/dependencies.json'))continue;
 if(/(?:^|\/)(?:private|node_modules|\.git|qa)(?:\/|$)|\.(?:jks|keystore|pem|sqlite|db|log)$|(?:^|\/)\.env(?:\.|$)|production\.json/i.test(relative))throw Error('A non-player/private file entered the APK asset source: '+relative);
 const bytes=await fs.readFile(path.join(base,relative));
 // Android's asset merger strips .gz and treats it as a pre-compressed asset.
 // Preserve exact schema2 bytes under an APK-only extension and route the public
 // .gz URL to it. Equal payloads share this one physical asset.
 if(base===dist&&relative.endsWith('.gz')){const digest=sha(bytes),encoded='android/encoded/'+digest+'.qsgz';await fs.mkdir(path.dirname(path.join(overlay,encoded)),{recursive:true});let existing=false;try{existing=sha(await fs.readFile(path.join(overlay,encoded)))===digest;}catch{}if(!existing)await fs.writeFile(path.join(overlay,encoded),bytes);rows.push({path:encoded,url:'/'+relative,bytes:bytes.length,sha256:digest});}
 else rows.push({path:prefix+relative,bytes:bytes.length,sha256:sha(bytes)});
 }}};
await visit('',dist);await visit('',overlay);
const urls=new Set();for(const row of rows){const url=row.url??'/'+row.path;if(urls.has(url))throw Error('Duplicate local asset URL: '+url);urls.add(url);}
for(const item of resources.values()){const row=rows.find(row=>(row.url??'/'+row.path)===item.url);if(!row||row.bytes!==item.bytes||row.sha256!==item.sha256)throw Error('Bundled map bytes differ from the accepted resource index');}
const manifest={schema:1,productId:info.productId,version:'0.1.0',webVersion:metadata.version,internalOnly:true,mapManifestSha256:info.mapManifestSha256,files:rows.sort((a,b)=>a.path.localeCompare(b.path))};
const manifestBytes=Buffer.from(JSON.stringify(manifest));await fs.writeFile(path.join(overlay,'android/asset-manifest.json'),manifestBytes);
const receipt={preparedAt:new Date().toISOString(),productId:info.productId,applicationId:info.applicationId,version:'0.1.0',versionCode:1,internalOnly:true,available:false,webVersion:metadata.version,webDist:dist,generatedAssets:overlay,bundleDigest:sha(manifestBytes),mapManifestSha256:info.mapManifestSha256,files:rows.length,bytes:rows.reduce((total,row)=>total+row.bytes,0),mapRepresentations:resources.size,modelAssetsCopied:false,productionDistModified:false,publicDownloadEnabled:false};
await fs.writeFile(path.join(root,'work/bundle-prepared.json'),JSON.stringify(receipt,null,2)+'\n');
const icon=path.join(dist,'branding/qisheng-online-icon.png');try{await fs.mkdir(path.join(root,'app/src/main/res/drawable-nodpi'),{recursive:true});await fs.copyFile(icon,path.join(root,'app/src/main/res/drawable-nodpi/ic_qisheng_logo.png'));}catch{throw Error('The accepted game icon is required');}
console.log(JSON.stringify({prepared:true,webVersion:metadata.version,files:receipt.files,bytes:receipt.bytes,mapManifestSha256:receipt.mapManifestSha256,modelAssetsCopied:false,publicDownloadEnabled:false}));
