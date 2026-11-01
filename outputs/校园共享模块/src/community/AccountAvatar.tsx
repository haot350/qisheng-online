'use client';
import {useEffect,useState} from 'react';
import type {AccountAvatarImage,AvatarId} from '../accounts.ts';
import type {RankingClient} from './client';
import styles from './avatar.module.css';
const avatarNames=['天光','远山','窗格','环路','飞鸟','树影','回声','星点'];
export function AccountAvatar({avatar='initials',name='齐',size=80,image,client}:{avatar?:AvatarId;name?:string;size?:number;image?:AccountAvatarImage;client?:RankingClient}){
 const [loaded,setLoaded]=useState<{key:string;url:string;client:RankingClient}|null>(null),[failed,setFailed]=useState('');
 const key=image?[image.url,image.thumbnailUrl,image.revision,image.authenticated?'owner':'public',size<=96?'thumbnail':'full'].join('|'):'';
 const source=loaded?.key===key&&loaded.client===client?loaded.url:'';
 useEffect(()=>{setLoaded(null);setFailed('');if(!image||!client)return;const controller=new AbortController();let objectURL='';void client.avatarBlob(image,size<=96?'thumbnail':'full',controller.signal).then(blob=>{if(controller.signal.aborted)return;objectURL=URL.createObjectURL(blob);setLoaded({key,url:objectURL,client});}).catch(()=>{});return()=>{controller.abort();if(objectURL)URL.revokeObjectURL(objectURL);};},[client,key]);
 const index=Number(avatar.replace('preset-',''));
 const drawings=[<><path d="M16 37h32M20 31a12 12 0 0 1 24 0"/><path d="M32 10v5M15 19l4 4M49 19l-4 4"/></>,<><path d="m10 44 17-23 11 15 7-9 10 17ZM26 24l-5 12h12"/></>,<><rect x="17" y="14" width="30" height="38" rx="2"/><path d="M32 14v38M17 31h30"/></>,<><circle cx="32" cy="32" r="20"/><path d="M17 46 47 16M20 19l7 7M38 38l7 7"/></>,<><path d="M9 32q15-18 23 0 8-18 23 0M32 32v15"/></>,<><path d="M32 50V28M32 36 19 27M32 31l12-9"/><path d="M16 28c-12-18 12-26 18-10 18-10 24 15 8 17-12 12-19 0-26-7Z"/></>,<><path d="M13 27v10M21 18v28M29 25v14M37 13v38M45 22v20M53 28v8"/></>,<><path d="m32 10 6 15 16 2-12 11 3 16-13-8-14 8 3-16L9 27l17-2Z"/></>];
 return <span className={styles.avatar} style={{width:size,height:size,fontSize:Math.round(size*.45)}}>{source&&source!==failed?<img src={source} alt={name+'的头像'} width={size} height={size} onError={()=>setFailed(source)}/>:avatar==='initials'?<span aria-hidden="true">{Array.from(name.trim())[0]??'齐'}</span>:<svg viewBox="0 0 64 64" role="img" aria-label={avatarNames[index-1]??'头像'} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{drawings[index-1]??drawings[0]}</svg>}</span>;
}
