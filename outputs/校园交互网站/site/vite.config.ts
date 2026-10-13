import {defineConfig,type Plugin} from 'vite';
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
export default defineConfig(async()=>{
 const profile=process.env.OPENQS_PROFILE??'demo';if(!['demo','production'].includes(profile))throw Error('OPENQS_PROFILE must be demo or production.');
 const marker:Plugin={name:'openqs-build-profile',async writeBundle(){await mkdir(path.resolve('dist/client'),{recursive:true});await writeFile(path.resolve('dist/client/openqs-profile.json'),JSON.stringify({profile,application:'campus',...(profile==='demo'?{localOnly:true}: {})})+'\n');}};
 if(profile==='production'){const {default:production}=await import('./vite.production.config');return {...production,plugins:[...(production.plugins??[]),marker]};}
 return {plugins:[marker],publicDir:false,build:{outDir:'dist/client',emptyOutDir:true,rollupOptions:{input:path.resolve('index.html')}},server:{host:'127.0.0.1',port:5173,strictPort:true,allowedHosts:['127.0.0.1','localhost']}};
});
