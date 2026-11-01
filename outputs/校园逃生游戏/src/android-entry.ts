import {initializeAndroid,bindAndroidReadingPage} from './platform/android';
import {configureBundledMapResources} from '@qisheng/shared/map-client';

try{
 const bundle=await initializeAndroid();
 configureBundledMapResources(bundle.resources);
 if(['account','credits','copyright'].includes(document.documentElement.dataset.qishengEntry??''))bindAndroidReadingPage();
 switch(document.documentElement.dataset.qishengEntry){
  case 'account':await import('./account-entry');break;
  case 'credits':await import('./credits-entry');break;
  case 'copyright':await import('./copyright-entry');break;
  default:await import('./main');
 }
}catch(error){
 const root=document.getElementById('root')??document.body;
 root.textContent='';
 const panel=document.createElement('main');Object.assign(panel.style,{padding:'max(32px, env(safe-area-inset-top)) 24px',font:'17px/1.6 sans-serif',maxWidth:'36rem',margin:'auto',color:'#252b31'});
 const title=document.createElement('h1');title.textContent='齐盛Online';
 const text=document.createElement('p');text.textContent=error instanceof Error?error.message:'游戏暂时无法打开，请重试。';
 const retry=document.createElement('button');retry.textContent='重新进入';Object.assign(retry.style,{padding:'14px 24px',font:'inherit'});retry.onclick=()=>location.reload();
 panel.append(title,text,retry);root.append(panel);
}
