import {loadGameMapBundle} from '../game-map';
import {prepareWeapons} from '../weapons';
import {prepareBillboards} from '../billboards';
import {preparePlayerAvatars} from './avatar';
import {NPC_IDS} from '../npc-roster';
import {WEAPON_IDS} from '../rules';
import type {PreparationOptions} from '../types';

/** No room is reserved and no actor is created by this resource preparation. */
export async function prepareOnlineResources(mode:'coop'|'pvp',mobile:boolean,options:PreparationOptions={}):Promise<()=>void>{
 const controller=new AbortController(),leases:(()=>void)[]=[];let released=false;const progress=[0,0,mode==='coop'?0:1,0];
 const release=()=>{if(released)return;released=true;controller.abort();for(const drop of leases.splice(0))drop();};
 const abort=()=>release();options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)release();
 const report=(index:number,value:number,message:string)=>{progress[index]=value;if(!released)options.onProgress?.(progress.reduce((n,v)=>n+v,0)/4,message);};
 const hold=(drop:()=>void)=>{if(released)drop();else leases.push(drop);};
 try{
  await Promise.all([
   loadGameMapBundle(controller.signal).then(()=>report(0,1,'准备校园')),
   prepareWeapons(value=>report(1,value,'准备装备'),WEAPON_IDS.flatMap(id=>[{id,lod:'near' as const},{id,lod:'far' as const}]),controller.signal).then(hold),
   mode==='coop'?prepareBillboards(NPC_IDS,value=>report(2,value,'准备本局人物'),mobile,controller.signal).then(hold):Promise.resolve(),
   preparePlayerAvatars(['campus-a','campus-b','tactical-a','tactical-b'],controller.signal).then(value=>{hold(value.release);report(3,1,'准备角色');}),
  ]);
  if(released)throw new DOMException('Cancelled','AbortError');return release;
 }catch(error){release();throw error;}finally{options.signal?.removeEventListener('abort',abort);}
}
