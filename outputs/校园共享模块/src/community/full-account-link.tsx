import type {RankingClient} from './client';
import './full-account-link.css';

const fallbackOrigin='https://game.tianhw.top/';
export function fullAccountUrl(client:Pick<RankingClient,'base'>){
 const current=typeof window==='undefined'?fallbackOrigin:window.location.href;
 try{return new URL('/account/',new URL(client.base,current)).href;}catch{return new URL('/account/',fallbackOrigin).href;}
}
export function FullAccountLink({client,busy=false}:{client:RankingClient;busy?:boolean}){
 return <a className="community-account-link" href={busy?undefined:fullAccountUrl(client)} target="_blank" rel="noopener noreferrer" aria-disabled={busy||undefined} onClick={event=>{if(busy)event.preventDefault();}}>打开完整账号页 ↗</a>;
}
