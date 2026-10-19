import './team-identity.css';
export function TeamIdentity({team,relation,compact=false}:{team:'blue'|'red'|'none';relation?:'self'|'ally'|'enemy';compact?:boolean}){
 const label=relation==='self'?'你':relation==='ally'?'队友':relation==='enemy'?'对手':team==='blue'?'蓝队':team==='red'?'红队':'未分队';
 return <span className={'team-identity team-'+team+(compact?' is-compact':'')}><span aria-hidden="true">{team==='blue'?'◆':team==='red'?'▲':'○'}</span><span>{label}</span></span>;
}
