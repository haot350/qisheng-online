import type {WeaponId} from './types';
import {PRIMARY_WEAPONS,WEAPONS} from './rules';
import {weaponDamage} from './multiplayer/shared/combat';
import {staticAssetUrl} from './static-assets';
import './fps-combat.css';

export type LoadoutMode='solo'|'coop'|'tdm'|'ffa';
const roles:Record<WeaponId,string>={glock:'随身副武器',mp5:'近距离灵活连射',m4a1:'中距离均衡交火',ak47:'有力的短点射',r870:'近距离散射',awm:'六倍镜精准射击',m249:'长时间火力压制'};
export function weaponCardStats(id:WeaponId,mode:LoadoutMode){const w=WEAPONS[id];return {damage:weaponDamage(id,'torso',mode==='tdm'||mode==='ffa'),pellets:w.pellets,rpm:Math.round(60/w.interval),capacity:w.capacity,reserve:w.reserve,reload:w.reload,reloadEmpty:w.reloadEmpty,range:w.range,ads:w.adsTime};}
export function WeaponLoadout({value,onChange,mode,disabled=false}:{value:WeaponId;onChange:(id:WeaponId)=>void;mode:LoadoutMode;disabled?:boolean}){
 const stats=weaponCardStats(value,mode),selected=WEAPONS[value];
 return <section className="fps-loadout" aria-label="选择主武器"><div className="fps-loadout-heading"><h3>主武器</h3><span>{mode==='solo'?'单人突围':mode==='coop'?'合作突围':'玩家对战'}</span></div>
  <div className="fps-weapon-grid" role="group" aria-label="主武器">{PRIMARY_WEAPONS.map(id=><button type="button" key={id} className={'fps-weapon-card'+(value===id?' selected':'')} aria-pressed={value===id} disabled={disabled} onClick={()=>onChange(id)}><span className="fps-weapon-card-art"><img src={staticAssetUrl('/weapon-cards/'+id+'.webp')} alt="" loading="lazy" onError={e=>{e.currentTarget.style.visibility='hidden';}}/></span><strong>{WEAPONS[id].label}</strong><small>{roles[id]}</small><span className="fps-weapon-card-check" aria-hidden="true">{value===id?'✓':''}</span></button>)}</div>
  <div className="fps-loadout-details"><div className="fps-selected-heading"><strong>{selected.label}</strong><span>{roles[value]}</span></div><dl className="fps-weapon-stats"><div><dt>{stats.pellets>1?'单颗伤害':'胸部伤害'}</dt><dd>{stats.damage}{stats.pellets>1&&<small> × {stats.pellets} 颗</small>}</dd></div><div><dt>射速</dt><dd>{stats.rpm}<small> 发/分</small></dd></div><div><dt>弹量</dt><dd>{stats.capacity}<small> / {stats.reserve}</small></dd></div><div><dt>装填</dt><dd>{stats.reload.toFixed(1)}<small> 秒</small></dd></div></dl><details className="fps-weapon-more"><summary>更多参数</summary><dl><div><dt>空仓装填</dt><dd>{stats.reloadEmpty.toFixed(2).replace(/0$/,'')} 秒</dd></div><div><dt>有效射程</dt><dd>{stats.range} 米</dd></div><div><dt>开镜时间</dt><dd>{stats.ads.toFixed(2)} 秒</dd></div></dl>{value==='r870'&&<p>逐发装填，装入所需弹药后即可继续交火。</p>}{value==='awm'&&<p>固定六倍镜，每次射击后自动拉栓。</p>}</details></div>
  <div className="fps-sidearm"><img src={staticAssetUrl('/weapon-cards/glock.webp')} alt="" onError={e=>{e.currentTarget.style.visibility='hidden';}}/><div><span>固定副武器</span><strong>Glock 17</strong></div><span>{WEAPONS.glock.capacity} / {WEAPONS.glock.reserve}</span></div>
 </section>;
}
