import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const files=(await fs.readdir(path.join(root,'tests')))
 .filter(file=>/\.test\.(?:ts|mjs)$/.test(file))
 .sort()
 .map(file=>path.join('tests',file));

console.log('[test:current] 当前版本回归：'+files.length+' 个文件，串行执行。');

if(files.length===0)throw Error('没有发现当前测试文件，拒绝空测试通过。');
if(process.argv.includes('--list')){
 console.log(files.join('\n'));
}else{
 const child=spawn(process.execPath,['--experimental-transform-types','--test','--test-concurrency=1',...files],{cwd:root,stdio:'inherit',windowsHide:true});
 const code=await new Promise(resolve=>{
  child.on('error',error=>{console.error('[test:current] 无法启动测试：',error);resolve(1);});
  child.on('exit',(exitCode,signal)=>resolve(exitCode??(signal?1:0)));
 });
 process.exitCode=code;
}
