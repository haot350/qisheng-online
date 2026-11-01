import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),config=JSON.parse(await fs.readFile(path.join(root,'work/toolchain.json'),'utf8'));
// AGP rejects non-ASCII project roots on Windows. Generate a small host-only
// working tree at an ASCII path; the actual campus assets remain at their source.
const stage=path.resolve(root,'../../work/android-online-build/host');await fs.mkdir(stage,{recursive:true});
const files=['settings.gradle.kts','build.gradle.kts','gradle.properties','release-config.json','app/build.gradle.kts'];
const visit=async directory=>{for(const row of await fs.readdir(path.join(root,directory),{withFileTypes:true})){const name=directory+'/'+row.name;if(row.isSymbolicLink())throw Error('Host source must not contain links');if(row.isDirectory())await visit(name);else if(row.isFile())files.push(name);}};await visit('app/src');
for(const file of ['app/gradle.lockfile','gradle/verification-metadata.xml'])try{await fs.access(path.join(root,file));files.push(file);}catch{}
const proof=[];for(const file of files){const bytes=await fs.readFile(path.join(root,file)),to=path.join(stage,file),hash=createHash('sha256').update(bytes).digest('hex');let same=false;try{same=createHash('sha256').update(await fs.readFile(to)).digest('hex')===hash;}catch{}if(!same){await fs.mkdir(path.dirname(to),{recursive:true});await fs.writeFile(to,bytes);}proof.push({path:file,sha256:hash});}
await fs.writeFile(path.join(stage,'local.properties'),'sdk.dir='+config.androidSdk.replaceAll('\\','/')+'\n');
await fs.writeFile(path.join(root,'work/host-source-stage.json'),JSON.stringify({source:'outputs/齐盛安卓客户端',stage,files:proof,modelAssetsCopied:false},null,2)+'\n');
const gradleHome=path.resolve(stage,'../gradle-home'),oldHome=path.join(root,'work/gradle-home');
try{await fs.access(gradleHome);}catch{try{await fs.access(oldHome);await fs.cp(oldHome,gradleHome,{recursive:true,dereference:false});}catch{await fs.mkdir(gradleHome,{recursive:true});}}
const env={...process.env,JAVA_HOME:config.javaSdk,ANDROID_HOME:config.androidSdk,ANDROID_SDK_ROOT:config.androidSdk,GRADLE_USER_HOME:gradleHome,PATH:path.join(config.javaSdk,'bin')+';'+process.env.PATH};
const args=['--no-daemon','--console=plain',...process.argv.slice(2)];
const proxy=process.env.HTTPS_PROXY||process.env.HTTP_PROXY;
if(proxy){const url=new URL(proxy);if(url.hostname&&url.port&&!url.username&&!url.password)args.unshift(`-Dhttps.proxyHost=${url.hostname}`,`-Dhttps.proxyPort=${url.port}`,`-Dhttp.proxyHost=${url.hostname}`,`-Dhttp.proxyPort=${url.port}`);}
const launcher=path.join(path.dirname(config.gradle),'../lib/gradle-launcher-8.9.jar');
const child=spawn(path.join(config.javaSdk,'bin/java.exe'),['-classpath',launcher,'org.gradle.launcher.GradleMain',...args],{cwd:stage,env,stdio:'inherit',windowsHide:true});
child.on('error',error=>{throw error;});child.on('exit',async code=>{if(code===0){for(const file of ['app/gradle.lockfile','gradle/verification-metadata.xml'])try{const bytes=await fs.readFile(path.join(stage,file));await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),bytes);}catch{}}process.exitCode=code??1;});
