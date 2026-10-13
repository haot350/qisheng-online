import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile,access} from 'node:fs/promises';
import {readBuildProfile} from './build-profile-policy.mjs';
const requested=process.argv[2];
if(requested){if(!['production','demo'].includes(requested)||process.argv.length!==3)throw Error('Usage: node scripts/build-profile.mjs [demo|production]');process.env.OPENQS_PROFILE=requested;}
const profile=readBuildProfile(),root=fileURLToPath(new URL('../',import.meta.url));
if(profile==='demo'){
 const generated=new URL('../src/generated/',import.meta.url);await mkdir(generated,{recursive:true});
 const mapping=new URL('static-assets.json',generated);try{await access(mapping);}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(mapping,'{}\n',{flag:'wx'});}
}
for(const [script,args] of [['typescript/bin/tsc',['--noEmit']],['vite/bin/vite.js',['build']]]){
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../node_modules/'+script,import.meta.url)),...args],{cwd:root,stdio:'inherit',env:process.env});
 if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
}
console.log('Built explicit profile: '+profile);
