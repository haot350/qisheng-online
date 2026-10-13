import {cp,mkdir,readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Archive already-compiled programs only. This script never builds, starts or deploys a service.
const rt=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),outputs=path.dirname(rt);
const api=path.join(outputs,'校园排行榜服务'),sites=path.join(outputs,'校园服务器部署');
const version='0.6.2',id=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
const stage=path.join(rt,'release-online-v'+version+'-'+id),archive=path.join(rt,'qisheng-online-v'+version+'.tar.gz');
const sha=b=>createHash('sha256').update(b).digest('hex');
const forbidden=new Set(['node_modules','.git','.env','data','backups','config','.npm-cache','qa-map','.qa-standalone']);
async function files(dir,prefix=''){
 const result=[];
 for(const entry of await readdir(dir,{withFileTypes:true})){
  if(entry.isSymbolicLink())throw Error('Symbolic links are not allowed in a release');
  if(forbidden.has(entry.name))throw Error('Private/runtime directory in release: '+prefix+entry.name);
  const relative=prefix+entry.name;
  if(entry.isDirectory())result.push(...await files(path.join(dir,entry.name),relative+'/'));
  else if(entry.isFile())result.push(relative);else throw Error('Unsupported release entry');
 }
 return result;
}
async function copy(source,dest){await mkdir(path.dirname(dest),{recursive:true});await cp(source,dest,{recursive:true,dereference:false});}
async function licenses(source,dest){
 const lock=JSON.parse(await readFile(path.join(source,'package-lock.json'),'utf8')),rows=[];
 await mkdir(dest,{recursive:true});
 for(const [key,meta]of Object.entries(lock.packages??{})){
  if(!key||meta.dev===true||!key.startsWith('node_modules/'))continue;
  const folder=path.join(source,key),installed=await stat(folder).catch(()=>null),copied=[];
  if(installed?.isDirectory())for(const name of await readdir(folder)){
   if(!/^(licen[sc]e|copying|notice)(?:[._-]|$)/i.test(name)||!(await stat(path.join(folder,name))).isFile())continue;
   const relative=key.slice('node_modules/'.length).replaceAll('/','__')+'/'+name;
   await copy(path.join(folder,name),path.join(dest,relative));copied.push(relative);
  }
  rows.push({package:key.slice('node_modules/'.length),version:meta.version,license:meta.license??null,optional:!!meta.optional,installedLocally:!!installed,files:copied});
 }
 await writeFile(path.join(dest,'dependencies.json'),JSON.stringify({generatedFrom:'package-lock.json',runtimeOnly:true,note:'Optional platform packages absent locally retain lockfile license metadata; npm ci supplies their original license files on the target platform.',packages:rows},null,2)+'\n');
 return rows.length;
}
for(const source of [api,rt])if(JSON.parse(await readFile(path.join(source,'package.json'),'utf8')).version!==version)throw Error('Compiled release version mismatch');
await mkdir(stage,{recursive:false});
for(const [source,name,dirs]of [[api,'server-api',['dist','admin']],[rt,'server-realtime',['dist','licenses']]]){
 for(const item of ['package.json','package-lock.json',...dirs])await copy(path.join(source,item),path.join(stage,name,item));
}
for(const name of ['backup.mjs','restore.mjs','pull-backup.ps1','check-release.mjs','migration-preflight.mjs','server-preflight.sh','server-verify.sh'])await copy(path.join(api,'scripts',name),path.join(stage,'server-api/scripts',name));
for(const name of ['init-server.sh','realtime-caddy.caddy','generate-licenses.mjs'])await copy(path.join(rt,'scripts',name),path.join(stage,'server-realtime/scripts',name));
for(const name of ['prepare-release.mjs','activate-release.mjs','publish-server.sh','rollback-server.sh','verify-live.mjs','shared-resources.mjs','map-cache-policy.mjs','rollback-compat.mjs','verify-api-rollback.mjs','publish.ps1','update-tools.mjs'])await copy(path.join(sites,'scripts',name),path.join(stage,'publish-tools',name));
for(const name of ['manifest.json','collision.bin','navigation.bin'])await copy(path.join(outputs,'校园逃生游戏/public/map',name),path.join(stage,'server-realtime/assets/map',name));
for(const name of ['capacity-and-privacy.md','debian-wire-capacity-final.json','local-wire-capacity.json','protocol-auth-test.log'])await copy(path.join(rt,'docs/v0.6.2',name),path.join(stage,'reports',name));
const counts={api:await licenses(api,path.join(stage,'server-api/licenses')),realtime:await licenses(rt,path.join(stage,'server-realtime/licenses/runtime'))};
await copy(fileURLToPath(import.meta.url),path.join(stage,'scripts/package-online-v062.mjs'));
const readme=`# 齐盛在线服务 · Preview ${version}\n\n本包包含已编译 API、管理界面、三个联机工作进程使用的同一实时程序、锁文件、许可、地图字节副本与发布辅助脚本。公开入口为 https://game.tianhw.top/api/v1、/realtime、/admin；主站为 https://zbqsgz.tianhw.top。客户端协议为 campus-mp-${version}，旧规则榜单版本保持原值。\n\n## 验收\n\n容量与快照隐私的实际数据和限制见 [定向报告](reports/capacity-and-privacy.md)。其中三房24人最终 Debian 180秒短测通过完整周期门槛；本地两种8人PvP自然600秒结算。协议机器人合作短局不能代替自然玩家合作通关，协议客户端也不能证明输入到画面的延迟。浏览器操作报告随同版本主发行包交付，不在这里提前宣称通过。\n\n## 上线\n\n此脚本只归档现有 dist，不构建、不启动、不发布。解包后先用 node scripts/verify-package.mjs 核对全部文件哈希。现有服务器已初始化，勿重复运行 init-server.sh；其中只有新服务器重建才需管理员审阅。Node 使用24，两个服务在各自目录运行 npm ci --omit=dev 安装锁定运行依赖；API 原生依赖必须在目标 Linux 安装，不能复制 Windows node_modules。\n\n本包是独立后端归档，不是双站发布器要求的完整网站 manifest。正常上线应继续使用同版本游戏、主站及后端组成的统一发行包；在校园服务器部署项目运行 node scripts/prepare-release.mjs --version ${version} --backend --qa <已通过的验收JSON>，再由现有 publish.ps1 -Mode Publish 上传及发布。发行包中 publish-tools 是该流程的审阅副本，不直接把本后端包传给 publish-server.sh。\n\n更新必须先关闭新开局并等待比赛排空，再在线备份、验证 schema3→4 的独立兼容回滚副本、安装候选依赖、核对哈希与健康、切换版本、复检 API 和三个 WSS。不能只切后端而让仍打开的旧协议客户端继续战斗。首次静态切换后旧标签页会要求刷新；保留同版本静态文件与上一兼容程序。\n\n## 回滚与持久数据\n\n沿现有流程使用 bash /srv/codex/sites/tools/rollback-server.sh <当前发行ID>。schema4 不能盲目指回只接受 schema3 的旧 API；只允许发布器验证过的独立兼容副本。回滚代码与静态入口，不覆盖在线数据库、附件、照片、身份或新成绩，不重新开放退役的 API 域名。\n\n持久目录继续在 /srv/codex/leaderboard/data、config、backups 与 /srv/codex/realtime/data。本包不含这些目录、凭据、数据库、Bearer、恢复码、node_modules 或重复 QA 大包。verify-package 只检查归档文件，不读取服务器私有配置。\n\n许可来自锁定运行依赖的本地原件与 lockfile 元数据；目标平台未在本机安装的可选依赖列于 dependencies.json，npm ci 会一并带入它们的原始许可。\n`;
await writeFile(path.join(stage,'README.md'),readme);
const verifier=`import {readFile,readdir,lstat} from 'node:fs/promises';import {createHash} from 'node:crypto';import path from 'node:path';import {fileURLToPath} from 'node:url';const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),manifest=JSON.parse(await readFile(path.join(root,'release-manifest.json'),'utf8'));let bytes=0;for(const row of manifest.files){if(row.path.startsWith('/')||row.path.includes(String.fromCharCode(92))||row.path.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Unsafe path');const file=path.join(root,row.path),info=await lstat(file);if(!info.isFile()||info.isSymbolicLink())throw Error('Unexpected file');const b=await readFile(file);if(b.length!==row.bytes||createHash('sha256').update(b).digest('hex')!==row.sha256)throw Error('Hash mismatch: '+row.path);bytes+=b.length;}console.log(JSON.stringify({ok:true,version:manifest.version,files:manifest.files.length,bytes,credentialsIncluded:false}));\n`;
await writeFile(path.join(stage,'scripts/verify-package.mjs'),verifier);
const manifest={schema:1,kind:'backend-only',version,protocolVersion:'campus-mp-'+version,createdAt:new Date().toISOString(),builtFromExistingDist:true,licenses:counts,credentialsAndRuntimeDataIncluded:false,files:[]};
for(const name of await files(stage)){const bytes=await readFile(path.join(stage,name));manifest.files.push({path:name,bytes:bytes.length,sha256:sha(bytes)});}
await writeFile(path.join(stage,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const nodeCheck=spawnSync(process.execPath,['scripts/verify-package.mjs'],{cwd:stage,encoding:'utf8'});if(nodeCheck.status!==0)throw Error(nodeCheck.stderr||nodeCheck.stdout);
const tar=process.platform==='win32'?path.join(process.env.SystemRoot??'C:/Windows','System32/tar.exe'):'tar';
const packed=spawnSync(tar,['-czf',archive,'-C',stage,'.'],{encoding:'utf8'});if(packed.status!==0)throw Error(packed.stderr||'tar failed');
const archiveBytes=await readFile(archive),digest=sha(archiveBytes);await writeFile(archive+'.sha256',digest+'  '+path.basename(archive)+'\n');
await writeFile(path.join(rt,'qisheng-online-v'+version+'-delivery.json'),JSON.stringify({version,archive,staging:stage,sha256:digest,bytes:archiveBytes.length,files:manifest.files.length,licenses:counts,verified:true,published:false},null,2)+'\n');
console.log(JSON.stringify({archive,sha256:digest,bytes:archiveBytes.length,files:manifest.files.length,licenses:counts,verified:true,published:false}));
