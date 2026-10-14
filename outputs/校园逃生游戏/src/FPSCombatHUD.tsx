import type {Snapshot,WeaponId} from './types';
import {WEAPONS} from './rules';
import './fps-combat.css';

export type FPSWeaponAction = Snapshot['weaponAction'] & {stageProgress?:number};
const clamp=(value:number)=>Math.max(0,Math.min(100,Number.isFinite(value)?value:0));
const stageNames:Record<string,string>={'mag-out':'取出弹匣','mag-in':'装入弹匣',chamber:'上膛','open-cover':'打开机盖','belt-in':'装入弹链','close-cover':'闭合机盖',shell:'逐发装填',bolt:'拉栓',pump:'泵动'};
export function fpsAmmoState(weapon:WeaponId,ammo:number,reserve:number,action?:FPSWeaponAction,reloading=false){
 const active=action?.phase==='reload'||action?.phase==='cycle'||reloading;
 const label=active?(stageNames[action?.stage??'']??(action?.phase==='cycle'?'准备下一发':'装填中')):ammo===0?(reserve>0?'空仓 · 换弹':'弹药耗尽'):ammo<=Math.ceil(WEAPONS[weapon].capacity*.2)?'弹量偏低':null;
 return {active,label,low:ammo<=Math.ceil(WEAPONS[weapon].capacity*.2),empty:ammo===0,progress:action?Math.max(0,Math.min(1,action.stageProgress??action.progress)):null};
}
export function FPSVitals({health,stamina,touch=false}:{health:number;stamina:number;touch?:boolean}){
 return <section className={'fps-vitals fps-tactical-vitals'+(health<=30?' critical':'')+(touch?' is-touch':'')} aria-label="生命与体力" data-critical={health<=30}>
  <div className="fps-health"><span><i className="fps-health-icon" aria-hidden="true">＋</i>生命</span><strong>{Math.ceil(clamp(health)).toString().padStart(3,'0')}</strong><i className="fps-meter"><b style={{width:clamp(health)+'%'}}/></i></div>
  <div className="fps-stamina"><span>体力</span><strong>{Math.round(clamp(stamina))}</strong><i className="fps-meter"><b style={{width:clamp(stamina)+'%'}}/></i></div>
 </section>;
}
export function FPSAmmo({weapon,ammo,reserve,action,reloading=false,touch=false}:{weapon:WeaponId;ammo:number;reserve:number;action?:FPSWeaponAction;reloading?:boolean;touch?:boolean}){
 const status=fpsAmmoState(weapon,ammo,reserve,action,reloading);
 return <section className={'fps-ammo fps-tactical-ammo'+(status.low?' is-low':'')+(status.empty?' is-empty':'')+(touch?' is-touch':'')} aria-label="弹药" data-ammo-state={status.empty?'empty':status.low?'low':'ready'} data-weapon-phase={action?.phase??'ready'} data-weapon-stage={action?.stage??'ready'}>
  <span className="fps-weapon-name">{WEAPONS[weapon].label}</span><strong className={status.low?'low':''}>{Math.max(0,ammo).toString().padStart(2,'0')}<small><span aria-hidden="true"> / </span>{Math.max(0,reserve)}</small></strong>
  {status.label&&<div className={'fps-weapon-action'+(status.active?' is-active':'')}><span>{status.label}</span>{status.active&&status.progress!==null&&<progress aria-label={status.label+'进度'} value={status.progress} max={1}/>}</div>}
 </section>;
}
