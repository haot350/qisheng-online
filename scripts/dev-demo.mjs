import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),install=process.argv.includes('--install');
if(process.argv.slice(2).some(arg=>arg!=='--install'))throw Error('Usage: node scripts/dev-demo.mjs [--install]');
if(Number(process.versions.node.split('.')[0])!==24)throw Error('Use Node.js 24 for the account API and locked dependencies.');
const modules=['校园共享模块','校园逃生游戏','校园排行榜服务','校园联机服务'];
const npmCli=process.env.npm_execpath??path.resolve(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
function run(directory,args){const result=spawnSync(process.execPath,[npmCli,...args],{cwd:path.join(root,'outputs',directory),stdio:'inherit',env:{...process.env,OPENQS_PROFILE:'demo'}});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);}
if(install)for(const directory of modules)run(directory,['ci','--no-audit','--no-fund']);
run('校园共享模块',['run','build']);run('校园排行榜服务',['run','build']);
const children=[];let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');setTimeout(()=>process.exit(code),800).unref();}
for(const [directory,script,args] of [['校园排行榜服务','scripts/demo-server.mjs',[]],['校园联机服务','scripts/demo-server.mjs',[]],['校园逃生游戏','node_modules/vite/bin/vite.js',['--host','127.0.0.1']]]){
 const child=spawn(process.execPath,[path.join(root,'outputs',directory,script),...args],{cwd:path.join(root,'outputs',directory),stdio:'inherit',env:{...process.env,OPENQS_PROFILE:'demo'}});children.push(child);child.on('error',error=>{console.error(error.message);stop(1);});child.on('exit',code=>{if(!stopping)stop(code??1);});
}
console.log('Open http://127.0.0.1:5180/ in two browser windows. Accounts live only in memory. Ctrl+C stops all demo processes.');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>stop());
