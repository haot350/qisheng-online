import {loadGameMapBundle} from '../game-map';
import {prepareWeapons} from '../weapons';
import {prepareBillboards} from '../billboards';
import {preparePlayerAvatars} from './avatar';
import {NPC_IDS} from '../npc-roster';
import {WEAPON_IDS} from '../rules';
import type {PreparationOptions} from '../types';
import {PreparationProgress} from '../preparation-progress';

/** No room is reserved and no actor is created by this resource preparation. */
export async function prepareOnlineResources(mode:'coop'|'pvp',mobile:boolean,options:PreparationOptions={}):Promise<()=>void>{
 const controller=new AbortController(),leases:(()=>void)[]=[];let released=false;
 const stages=new PreparationProgress([
  {id:'0',label:'下载校园'}, {id:'1',label:'准备人物与装备'},
  ...(mode==='coop'?[{id:'2',label:'准备人物与装备'}]:[]),{id:'3',label:'准备人物与装备'},
 ],(progress,message)=>{if(!released)options.onProgress?.(progress,message);});
 const release=()=>{if(released)return;released=true;controller.abort();for(const drop of leases.splice(0))drop();};
 const abort=()=>release();options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)release();
 const report=(index:number,value:number,message:string)=>{if(!released)stages.update(String(index),value,message);};
 const hold=(drop:()=>void)=>{if(released)drop();else leases.push(drop);};
 try{
  await Promise.all([
   loadGameMapBundle(controller.signal,detail=>report(0,detail.stage==='ready'?1:detail.totalBytes?Math.min(.95,detail.completedBytes/detail.totalBytes):0,detail.stage==='decode'?'准备校园结构':'读取校园 '+(detail.completedBytes/1048576).toFixed(1)+' / '+(detail.totalBytes/1048576).toFixed(1)+' MiB')).then(()=>report(0,1,'准备校园')),
   prepareWeapons(value=>report(1,value,'准备装备'),WEAPON_IDS.flatMap(id=>[{id,lod:'near' as const},{id,lod:'far' as const}]),controller.signal).then(hold),
   mode==='coop'?prepareBillboards(NPC_IDS,value=>report(2,value,'准备本局人物'),mobile,controller.signal).then(hold):Promise.resolve(),
   preparePlayerAvatars(['campus-a','campus-b','tactical-a','tactical-b'],controller.signal).then(value=>{hold(value.release);report(3,1,'准备角色');}),
  ]);
  if(released)throw new DOMException('Cancelled','AbortError');return release;
 }catch(error){release();throw error;}finally{options.signal?.removeEventListener('abort',abort);}
}
