import {useEffect,useMemo,useState} from 'react';
import type {AccountAppearance} from '../accounts.ts';
import type {RankingClient} from './client';

/** Public room/board appearances are refreshed independently of simulation snapshots. */
export function useAccountAppearances(client:RankingClient,playerIds:readonly string[],enabled=true):ReadonlyMap<string,AccountAppearance>{
 const key=[...new Set(playerIds.filter(Boolean))].sort().slice(0,200).join(',');
 const [items,setItems]=useState<ReadonlyMap<string,AccountAppearance>>(()=>new Map()),[identityRevision,setIdentityRevision]=useState(0);
 useEffect(()=>client.subscribe(()=>setIdentityRevision(value=>value+1)),[client]);
 useEffect(()=>{
  let live=true,request:AbortController|undefined;
  setItems(new Map());
  if(!enabled||!key)return;
  const load=async()=>{if(document.hidden||request)return;const controller=new AbortController();request=controller;try{const ids=key.split(','),items:AccountAppearance[]=[];for(let start=0;start<ids.length;start+=100){const responses=await Promise.all([ids.slice(start,start+50),ids.slice(start+50,start+100)].filter(chunk=>chunk.length).map(chunk=>client.appearances(chunk,controller.signal)));for(const response of responses)items.push(...response.items);if(!live||controller.signal.aborted)return;}if(live&&!controller.signal.aborted)setItems(new Map(items.map(item=>[item.playerId,item])));}catch{if(live&&!controller.signal.aborted)setItems(new Map());}finally{if(request===controller)request=undefined;}};
  void load();const interval=setInterval(()=>void load(),30000),visible=()=>{if(!document.hidden)void load();};document.addEventListener('visibilitychange',visible);
  return()=>{live=false;request?.abort();clearInterval(interval);document.removeEventListener('visibilitychange',visible);};
 },[client,key,enabled,identityRevision]);
 return useMemo(()=>{if(!enabled)return new Map<string,AccountAppearance>();const result=new Map(items),player=client.getPlayer(),account=client.getAccount();if(player&&account&&key.split(',').includes(player.id))result.set(player.id,{playerId:player.id,avatar:account.avatar,...(account.avatarImage?{avatarImage:account.avatarImage}:{})});return result;},[client,key,enabled,items,identityRevision]);
}
