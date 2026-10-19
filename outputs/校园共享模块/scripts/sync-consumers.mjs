import {mkdir,readFile,writeFile as writeBytes,cp} from 'node:fs/promises';import {existsSync} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {protectOptionalRecords} from './lock-protection.mjs';
// Windows indexers/watchers can briefly hold package files during npm updates.
// Retry only transient sharing errors; final errors and lock restoration remain fatal.
async function writeFile(file,bytes){for(let attempt=0;;attempt++){try{return await writeBytes(file,bytes);}catch(error){if(process.platform!=='win32'||attempt>=3||!['UNKNOWN','EPERM','EBUSY'].includes(error.code))throw error;await new Promise(resolve=>setTimeout(resolve,50*2**attempt));}}}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base=path.dirname(root);const npm=[process.env.npm_execpath,path.resolve(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),path.resolve(path.dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')].find(file=>file&&existsSync(file));
if(!npm)throw Error('Node.js 24 with npm is required to synchronize the shared package.');
function run(args,cwd){const r=spawnSync(process.execPath,args,{cwd,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});if(r.status!==0)throw Error(r.stdout+r.stderr);return r.stdout;}
function cleanOptionalPlaceholders(lock){for(const [key,value]of Object.entries(lock.packages??{}))if(key!==''&&!value.version&&!value.link&&value.optional)delete lock.packages[key];return lock;}
console.log(run([path.join(root,'scripts/build.mjs')],root));const pack=JSON.parse(run([npm,'pack','--ignore-scripts','--json'],root))[0],tar=pack.filename;
for(const project of ['校园逃生游戏','校园联机服务','校园排行榜服务','校园交互网站/site']){
 const dir=path.join(base,project),packageFile=path.join(dir,'package.json'),lockFile=path.join(dir,'package-lock.json');
 const oldPackage=await readFile(packageFile,'utf8'),oldLock=await readFile(lockFile,'utf8'),previous=JSON.parse(oldLock);
 await mkdir(path.join(dir,'vendor'),{recursive:true});await cp(path.join(root,tar),path.join(dir,'vendor',tar));
 try{
  const config=JSON.parse(oldPackage);config.dependencies['@qisheng/shared']='file:vendor/'+tar;await writeFile(packageFile,JSON.stringify(config,null,2)+'\n');
  const lock=cleanOptionalPlaceholders(structuredClone(previous));delete lock.packages['node_modules/@qisheng/shared'];lock.packages[''].dependencies['@qisheng/shared']='file:vendor/'+tar;await writeFile(lockFile,JSON.stringify(lock,null,2)+'\n');
  console.log(project,run([npm,'install','--ignore-scripts','--no-audit','--no-fund',...(process.env.QISHENG_SYNC_OFFLINE==='1'?['--offline']:[])],dir).trim());
  const final=protectOptionalRecords(previous,JSON.parse(await readFile(lockFile,'utf8')));
  await writeFile(lockFile,JSON.stringify(final,null,2)+'\n');
 }catch(error){const restored=await Promise.allSettled([writeFile(packageFile,oldPackage),writeFile(lockFile,oldLock)]);const failed=restored.filter(result=>result.status==='rejected');if(failed.length)throw new AggregateError([error,...failed.map(result=>result.reason)],'Shared sync failed and package/lock restoration was incomplete');throw error;}
}
console.log('Synced canonical tarball with npm-managed installations and exact locks.');
