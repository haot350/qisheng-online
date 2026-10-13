import {useEffect,useState} from 'react';
import {achievementById} from '@qisheng/shared/achievements';
import {rankingClient} from '../ranking/client';
import {achievementIconUrls} from '../achievement-icons';
export function OnlineAchievements({resultId}:{resultId:string}){
 const [ids,setIds]=useState<string[]>([]);
 useEffect(()=>{let cancelled=false;let timer:ReturnType<typeof setTimeout>|undefined;const owner=rankingClient.getPlayer()?.id;setIds([]);if(!owner||rankingClient.getPlayer()?.accountStatus!=='active')return;async function load(attempt:number){try{const profile=await rankingClient.profile();if(cancelled||rankingClient.getPlayer()?.id!==owner)return;const recorded=profile.recent.some(row=>('id' in row?row.id:row.runId)===resultId);if(recorded){setIds(profile.achievements.filter(item=>item.sourceId==='multi:'+resultId&&item.unlocked!==false).map(item=>item.id));return;}if(attempt<3)timer=setTimeout(()=>void load(attempt+1),700);}catch{/* The archived account page remains available if settlement is still uploading. */}}void load(0);return()=>{cancelled=true;clearTimeout(timer);};},[resultId]);
 if(!ids.length)return null;
 return <div className="account-result-achievements" aria-label="本局新解锁成就">{ids.map(id=>{const a=achievementById(id);return a?<article key={id}><img src={achievementIconUrls[id]} alt="" width="40" height="40"/><div><small>成就解锁</small><strong>{a.title}</strong></div></article>:null;})}</div>;
}
