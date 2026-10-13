import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {protectOptionalRecords} from './lock-protection.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base=path.dirname(root);const npm=process.env.npm_execpath||path.resolve(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
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
 }catch(error){await writeFile(packageFile,oldPackage);await writeFile(lockFile,oldLock);throw error;}
}
console.log('Synced canonical tarball with npm-managed installations and exact locks.');
