import {mkdir,stat,writeFile,rename,access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {exportOptions,exportIdentity,collectExportFiles,project,NATIVE_VERSION} from './native-export-profile.mjs';
import {verifyPhysicsArtifact} from './physics-build-receipt.mjs';
import {verifyColyseusArtifact} from './verify-colyseus-artifact.mjs';
import {prepareRuntimeLicenses,copyRuntimeLicenses} from './prepare-runtime-licenses.mjs';
import {inspectPck} from './inspect-pck.mjs';
import {inspectWindowsDependencies} from './inspect-windows-export.mjs';
const options=exportOptions(),identity=await exportIdentity(options),physics=await verifyPhysicsArtifact('windows'),sdk=await verifyColyseusArtifact('windows',{release:options.mode!=='internal'});
await stat(path.join(project,'work/templates',options.mode==='internal'?'windows_debug_x86_64.exe':'windows_release_x86_64.exe'));
if(!options.check && await access(options.output).then(()=>true,()=>false))throw Error('Export output already exists; select a new --output directory. Old artifacts are never overwritten.');
if(options.check){console.log(JSON.stringify({checked:true,exported:false,version:NATIVE_VERSION,mode:options.mode,identity,physics,sdk}));process.exit(0);}
await prepareRuntimeLicenses();
const staging=path.join(project,'work','windows-export-'+options.mode+'-'+Date.now());await mkdir(staging,{recursive:false});
const executable=path.join(staging,options.executable),pck=executable.replace(/[.]exe$/,'.pck');
const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(project,'scripts/run-godot.mjs'),'--headless',options.mode==='internal'?'--export-debug':'--export-release',options.preset,executable],{cwd:project,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',resolve);});
if(code!==0)throw Error('Godot Windows export failed; the staging directory is retained for review');
await stat(executable);await stat(pck);await copyRuntimeLicenses(staging);
const after=await exportIdentity(options);if(after.sourceHash!==identity.sourceHash)throw Error('Native source changed during export; candidate not installed');
const {names,...pckAudit}=await inspectPck(pck,{demo:options.demo,projectRoot:project});
await writeFile(path.join(staging,'READ-ME-FIRST.txt'),[
 options.demo?'OpenQS · Anonymous Native Demo':'齐盛Online · 原生 Preview '+NATIVE_VERSION+(options.preview?'':'（内部测试）'),'',
 '解压后运行同目录的EXE，请保留PCK、addons与bin文件夹。',
 'Windows 10/11 x64，支持OpenGL 3.3的显卡。首次启动请等待必要资源准备。',
 options.demo?'本包使用原创匿名演示资源，与正式校园、账号和房间隔离。':options.preview?'内置完整开放校园；账号登录状态与浏览器分别保存。':'本包仍限制本机隔离服务，不作为公开游玩版本。',
 'WASD移动，鼠标观察，Esc打开菜单；其他按键可在设置中查看或调整。',
 '© 2026 OpenQS · 齐盛Online。自有源码MIT，第三方技术及正式素材保留各自许可。',
 '运行库完整声明位于LICENSES.txt、third_party_licenses与runtime_licenses。',''
].join('\r\n'));
const files=await collectExportFiles(staging),dependencies=await inspectWindowsDependencies(staging,files);
const sdkName=sdk.binary.file,sdkHash=sdk.binary.sha256;
if(files.find(row=>path.basename(row.path)===sdkName)?.sha256!==sdkHash)throw Error('Exported Colyseus SDK differs from the selected fixed platform library');
const expected=files.find(row=>path.basename(row.path)==='qs_native_physics.dll');if(expected?.sha256!==physics.binary.sha256)throw Error('Exported native physics DLL differs from verified build');
const metadata={schema:1,kind:'native-export',version:NATIVE_VERSION,platform:'windows',profile:options.demo?'demo':'production',stage:options.preview?'preview-candidate':options.mode,published:false,formalAssets:!options.demo,checkedAt:new Date().toISOString(),...identity,physics,sdk,pck:pckAudit,dependencies,executable:options.executable,files};
await writeFile(path.join(staging,'native-export.json'),JSON.stringify(metadata,null,2)+'\n');
await mkdir(path.dirname(options.output),{recursive:true});
// Windows virus scanning may briefly hold newly written native libraries.
for(let attempt=0;;attempt++){try{await rename(staging,options.output);break;}catch(error){if(!['EPERM','EACCES'].includes(error.code)||attempt>=7||await access(options.output).then(()=>true,()=>false))throw error;await new Promise(resolve=>setTimeout(resolve,250));}}
console.log(JSON.stringify({version:NATIVE_VERSION,mode:options.mode,output:options.output,exported:true,published:false,files:files.length,pck:pckAudit,sourceHash:identity.sourceHash}));
