import {defineConfig,type Plugin} from 'vite';
import path from 'node:path';
import {readFile,mkdir,writeFile,readdir,lstat,unlink} from 'node:fs/promises';
import production from './vite.production.config';
import {isolatedSharedGuard} from './scripts/isolated-shared-guard.mjs';
import {privateNpcAliases} from './scripts/private-npc-profile.mjs';
export default defineConfig(async context=>{
 const config=typeof production==='function'?await production(context):production;
 const urls=JSON.parse(await readFile(path.resolve('src/generated/static-assets.json'),'utf8'));
 const numeric=JSON.parse(await readFile(path.resolve('package.json'),'utf8')).version;
 const marker:Plugin={name:'isolated-ui-only',transformIndexHtml(html){
  html=html.replaceAll('__GAME_RELEASE_LABEL__','Preview '+numeric);
  if(html.includes('__GAME_SHARE_IMAGE__'))html=html.replaceAll('__GAME_SHARE_IMAGE__',new URL(urls['/images/qisheng-online-share-v070.webp'],'https://game.tianhw.top').href);
  if(html.includes('__QS2027_SHARE_IMAGE__')){if(!urls['/images/qisheng-2027/share.webp'])throw Error('Missing independent promotional share image');html=html.replaceAll('__QS2027_SHARE_IMAGE__',new URL(urls['/images/qisheng-2027/share.webp'],'https://game.tianhw.top').href);}
  const csp="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' blob: wss://game.tianhw.top; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'";
  if(!/http-equiv=["']Content-Security-Policy/.test(html))html=html.replace(/<meta charset=["']UTF-8["']\s*\/?\s*>/i,match=>match+'<meta http-equiv="Content-Security-Policy" content="'+csp+'">');
  return html;
 },async writeBundle(_options,bundle){const output=path.resolve('dist'),assets=path.join(output,'assets');await mkdir(output,{recursive:true});const info=await lstat(assets).catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(info?.isSymbolicLink())throw Error('Refuse generated cleanup through a link');if(info?.isDirectory()){const emitted=new Set(Object.keys(bundle).map(p=>p.replaceAll('\\','/')));for(const entry of await readdir(assets,{withFileTypes:true})){if(!entry.isFile()||!['.js','.css'].includes(path.extname(entry.name)))continue;const file=path.resolve(assets,entry.name);if(path.dirname(file)!==assets)throw Error('Generated cleanup escaped output');if(!emitted.has('assets/'+entry.name))await unlink(file);}}await writeFile(path.resolve('dist/openqs-profile.json'),JSON.stringify({profile:'production',application:'game',privateNpcCalibration:true})+'\n');}};
 const aliases=await privateNpcAliases();
 const sharedCss=['community/ranking.css','community/feedback.css','community/account.css','player-content/reading.css'].map(name=>({find:new RegExp('^@qisheng/shared/'+name.replace('.','\\.')+'$'),replacement:path.resolve('../\u6821\u56ed\u5171\u4eab\u6a21\u5757/src',name)}));
 return {...config,plugins:[...(config.plugins??[]).filter((p:any)=>p?.name!=='runtime-assets-only'),marker,isolatedSharedGuard()],publicDir:false,resolve:{...config.resolve,alias:[...aliases,...sharedCss,...(Array.isArray(config.resolve?.alias)?config.resolve.alias:[]),{find:/^@qisheng\/shared\/(.+)$/,replacement:path.resolve("../\u6821\u56ed\u5171\u4eab\u6a21\u5757/src")+ '/$1'}]},build:{...config.build,copyPublicDir:false,rollupOptions:{...config.build?.rollupOptions,input:{...config.build?.rollupOptions?.input as Record<string,string>,qisheng2027:path.resolve('qisheng-2027/index.html')}}}};
});
