import type {RankingClient} from './client';
import styles from './full-account-link.module.css';

const fallbackOrigin='https://game.tianhw.top/';
export function fullAccountUrl(client:Pick<RankingClient,'base'>){
 const current=typeof window==='undefined'?fallbackOrigin:window.location.href;
 try{return new URL('/account/',new URL(client.base,current)).href;}catch{return new URL('/account/',fallbackOrigin).href;}
}
export function FullAccountLink({client,busy=false}:{client:RankingClient;busy?:boolean}){
 return <a className={styles.link} href={busy?undefined:fullAccountUrl(client)} target="_blank" rel="noopener noreferrer" aria-label="账号与档案，在新标签页打开" aria-disabled={busy||undefined} onClick={event=>{if(busy)event.preventDefault();}}>账号与档案</a>;
}
