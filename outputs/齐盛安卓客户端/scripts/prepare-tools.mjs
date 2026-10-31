import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const legacy=path.resolve(root,'../齐盛原生客户端/work/android-toolchain.json');
let previous;try{previous=JSON.parse(await fs.readFile(legacy,'utf8'));}catch{previous={};}
const arguments_=process.argv.slice(2),option=name=>{const index=arguments_.indexOf(name);return index<0?undefined:arguments_[index+1];};
previous={...previous,javaSdk:option('--jdk')||process.env.JAVA_HOME||previous.javaSdk,androidSdk:option('--sdk')||process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||previous.androidSdk};
if(!previous.javaSdk||!previous.androidSdk)throw Error('Provide JDK17 and Android SDK35 with --jdk/--sdk or JAVA_HOME/ANDROID_HOME. Official tools can be installed through Android Studio.');
const work=path.join(root,'work'),tools=path.join(work,'tools');
await fs.mkdir(tools,{recursive:true});
const version='8.9',archive=path.join(tools,`gradle-${version}-bin.zip`),checksum=archive+'.sha256';
const run=(file,args)=>{const r=spawnSync(file,args,{stdio:'inherit',windowsHide:true});if(r.status!==0)throw Error(path.basename(file)+' failed');};
const download=(url,file)=>run('curl.exe',['--fail','--silent','--show-error','--location','--retry','2','--connect-timeout','20','--output',file,url]);
try{await fs.access(checksum);}catch{download(`https://downloads.gradle.org/distributions/gradle-${version}-bin.zip.sha256`,checksum);}
const expected=(await fs.readFile(checksum,'utf8')).trim().split(/\s/)[0];
if(!/^[a-f0-9]{64}$/.test(expected))throw Error('Official Gradle checksum is malformed');
let valid=false;try{valid=createHash('sha256').update(await fs.readFile(archive)).digest('hex')===expected;}catch{}
if(!valid){download(`https://downloads.gradle.org/distributions/gradle-${version}-bin.zip`,archive);if(createHash('sha256').update(await fs.readFile(archive)).digest('hex')!==expected)throw Error('Gradle archive checksum mismatch');}
const gradle=path.join(tools,`gradle-${version}`,'bin/gradle.bat');
try{await fs.access(gradle);}catch{const list=spawnSync('tar.exe',['-tf',archive],{encoding:'utf8',windowsHide:true});if(list.status!==0||list.stdout.split(/\r?\n/).filter(Boolean).some(name=>!name.startsWith(`gradle-${version}/`)||name.split('/').includes('..')))throw Error('Unexpected Gradle archive paths');run('tar.exe',['-xf',archive,'-C',tools]);}
for(const file of [path.join(previous.javaSdk,'bin/java.exe'),path.join(previous.androidSdk,'platforms/android-35/android.jar'),path.join(previous.androidSdk,'build-tools/35.0.1/apksigner.bat')])await fs.access(file);
const result={javaSdk:previous.javaSdk,androidSdk:previous.androidSdk,gradle,gradleVersion:version,gradleSha256:expected,compileSdk:35,minSdk:29,targetSdk:35,agp:'8.7.3',kotlin:'2.0.21',webkit:'1.14.0',usesLegacyToolFilesReadOnly:!option('--jdk')&&!option('--sdk')&&!process.env.JAVA_HOME&&!process.env.ANDROID_HOME&&!process.env.ANDROID_SDK_ROOT,legacyGodotProjectReactivated:false};
await fs.writeFile(path.join(work,'toolchain.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({ready:true,gradleVersion:version,gradleSha256:expected,compileSdk:35,minSdk:29,reusedJdkAndSdk:true}));
