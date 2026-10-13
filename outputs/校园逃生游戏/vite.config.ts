import {defineConfig, type Plugin} from 'vite';
import react from '@vitejs/plugin-react';
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {readBuildProfile, demoProxy} from './scripts/build-profile-policy.mjs';
import {privateNpcAliases} from './scripts/private-npc-profile.mjs';

export default defineConfig(async context => {
 const profile=readBuildProfile();
 if(profile==='production'){
  const {default:production}=await import('./vite.production.config');
  const config=typeof production==='function'?await production(context):production;
  const aliases=await privateNpcAliases();
  const identity:Plugin={name:'explicit-production-profile',async writeBundle(){await mkdir(path.resolve('dist'),{recursive:true});await writeFile(path.resolve('dist/openqs-profile.json'),JSON.stringify({profile:'production',application:'game',privateNpcCalibration:true})+'\n');}};
  return {...config,resolve:{...config.resolve,alias:[...aliases,...(Array.isArray(config.resolve?.alias)?config.resolve.alias:[])]},plugins:[...(config.plugins??[]),identity]};
 }
 const demoHtml:Plugin={name:'openqs-demo-entry',transformIndexHtml:{order:'pre',handler(html){
  const account=html.includes('/src/account-entry.tsx');
  return '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="author" content="OpenQS"><title>'+ (account?'本地演示账号':'OpenQS 本地演示')+'</title><link rel="icon" href="/anonymous-avatar.svg"></head><body><div id="root"></div><script type="module" src="/src/demo/'+(account?'account-entry':'main')+'.tsx"></script></body></html>';
 }},async writeBundle(){await writeFile(path.resolve('dist/openqs-profile.json'),JSON.stringify({profile:'demo',application:'game',sourceVersion:'openqs-demo-v1',localOnly:true})+'\n');}};
 return {plugins:[react(),demoHtml],publicDir:'demo/public',resolve:{dedupe:['react','react-dom']},base:'/',build:{emptyOutDir:true,target:'es2022',rollupOptions:{input:{main:path.resolve('index.html'),account:path.resolve('account/index.html')}}},server:{host:'127.0.0.1',port:5180,strictPort:true,hmr:false,allowedHosts:['localhost','127.0.0.1'],proxy:demoProxy()},preview:{host:'127.0.0.1',port:5180,strictPort:true,proxy:demoProxy()}};
});
