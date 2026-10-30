import {defineConfig} from 'vite';
import production from './vite.production.config';
import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {isolatedSharedGuard} from '../../校园逃生游戏/scripts/isolated-shared-guard.mjs';
export default defineConfig({
 ...production,
 plugins:[...(production.plugins??[]),isolatedSharedGuard('campus'),{name:'openqs-production-profile',async writeBundle(){await mkdir(path.resolve('dist/client'),{recursive:true});await writeFile(path.resolve('dist/client/openqs-profile.json'),JSON.stringify({profile:'production',application:'campus'})+'\n');}}],
 publicDir:false,
 build:{...production.build,copyPublicDir:false},
 resolve:{...production.resolve,alias:[
  ...['community/account.css','community/ranking.css','community/feedback.css','player-content/reading.css','accounts','achievements'].map(name=>({find:new RegExp('^@qisheng/shared/'+name.replace('.','\\.')+'$'),replacement:path.resolve('../../\u6821\u56ed\u5171\u4eab\u6a21\u5757/src',name.includes('.')?name:name+'.ts')})),
  ...(Array.isArray(production.resolve?.alias)?production.resolve.alias:[]),{find:/^@qisheng\/shared\/(.+)$/,replacement:path.resolve("../../\u6821\u56ed\u5171\u4eab\u6a21\u5757/src")+ '/$1'}
 ]}
});
