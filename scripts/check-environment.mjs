import {existsSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url)),native=process.argv.includes('--native');
if(process.argv.slice(2).some(a=>a!=='--native'))throw Error('Usage: node scripts/check-environment.mjs [--native]');
const checks=[],errors=[],nodeMajor=Number(process.versions.node.split('.')[0]);
checks.push({name:'Node.js 24',ok:nodeMajor===24,actual:process.version});if(nodeMajor!==24)errors.push('Install Node.js 24 LTS; older releases cannot run all source and account dependencies.');
const npmCli=[process.env.npm_execpath,path.resolve(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),path.resolve(path.dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')].find(p=>p&&existsSync(p));
checks.push({name:'npm beside Node',ok:!!npmCli});if(!npmCli)errors.push('Install Node.js 24 with npm, or run this command from npm.');
const modules=['校园共享模块','校园逃生游戏','校园排行榜服务','校园联机服务','校园交互网站/site'];
for(const module of modules){
 const folder=path.join(root,'outputs',module),manifestFile=path.join(folder,'package.json'),lockFile=path.join(folder,'package-lock.json');
 if(!existsSync(manifestFile)||!existsSync(lockFile)){errors.push('Missing module or lockfile: outputs/'+module);continue;}
 const manifest=JSON.parse(readFileSync(manifestFile,'utf8')),lock=JSON.parse(readFileSync(lockFile,'utf8')),same=manifest.version===lock.packages?.['']?.version;
 checks.push({name:module+' lock version',ok:same});if(!same)errors.push('Package version and lockfile disagree: '+module);
 const vendor=manifest.dependencies?.['@qisheng/shared'];if(vendor){const present=/^file:vendor\/qisheng-shared-\d+\.\d+\.\d+\.tgz$/.test(vendor)&&existsSync(path.join(folder,vendor.slice(5)));checks.push({name:module+' shared source archive',ok:present});if(!present)errors.push('Shared vendor archive is missing; use a complete clone without moving the outputs modules.');}
}
if(native){
 const foundPython=['python3','python','py'].find(binary=>{const p=spawnSync(binary,['--version'],{encoding:'utf8',windowsHide:true});return !p.error&&p.status===0;});
 checks.push({name:'Python for native addons',ok:!!foundPython});
 if(process.platform==='win32'){
  const locator=path.join(process.env['ProgramFiles(x86)']??'C:/Program Files (x86)','Microsoft Visual Studio/Installer/vswhere.exe');
  const result=existsSync(locator)?spawnSync(locator,['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],{encoding:'utf8',windowsHide:true}):null;
  const hasCpp=!!result&&result.status===0&&!!result.stdout.trim();checks.push({name:'Visual Studio C++ build tools fallback',ok:hasCpp,required:'only for an unsupported platform needing a deliberate source build'});
  if(!foundPython||!hasCpp)console.log('Windows account API: if the bundled SQLite binary does not support your platform, install Python and Visual Studio Build Tools with Desktop development with C++. Static demo builds do not require this toolchain.');
 }else{
  const cpp=spawnSync('c++',['--version'],{encoding:'utf8'}),hasCpp=!cpp.error&&cpp.status===0;checks.push({name:'C++ compiler fallback',ok:hasCpp,required:'only for an unsupported platform needing a deliberate source build'});
  if(!foundPython||!hasCpp)console.log('Linux native-addon fallback needs Python 3 and a C/C++ build toolchain; prefer Node.js 24 and the locked dependencies.');
 }
}
console.log(JSON.stringify({ok:errors.length===0,platform:process.platform,architecture:process.arch,checks,errors},null,2));
if(errors.length)process.exitCode=1;
