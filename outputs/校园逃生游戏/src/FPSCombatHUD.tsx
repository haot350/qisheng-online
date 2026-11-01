import type {Snapshot,WeaponId} from './types';
import {WEAPONS} from './rules';
import styles from './FPSCombatHUD.module.css';
const cx=(value:string)=>value.trim().split(/\s+/).map(name=>styles[name]).filter(Boolean).join(' ');

export type FPSWeaponAction = Snapshot['weaponAction'] & {stageProgress?:number};
const clamp=(value:number)=>Math.max(0,Math.min(100,Number.isFinite(value)?value:0));
export function fpsAmmoState(weapon:WeaponId,ammo:number,reserve:number,action?:FPSWeaponAction,reloading=false){
 const active=action?.phase==='reload'||reloading;
 const label=active?'装填中':action?.phase==='cycle'?null:ammo===0?(reserve>0?'空仓，请换弹':'弹药耗尽'):ammo<=Math.ceil(WEAPONS[weapon].capacity*.2)?'弹量偏低':null;
 return {active,label,low:ammo<=Math.ceil(WEAPONS[weapon].capacity*.2),empty:ammo===0,progress:action?Math.max(0,Math.min(1,action.progress)):null};
}
export function FPSVitals({health,stamina,touch=false}:{health:number;stamina:number;touch?:boolean}){
 return <section className={cx('fps-vitals fps-tactical-vitals'+(health<=30?' critical':'')+(touch?' is-touch':''))} aria-label="生命与体力" data-ui-theme="tactical" data-combat-ui="vitals" data-touch={touch} data-critical={health<=30}>
  <div className={cx("fps-health")}><span><i className={cx("fps-health-icon")} aria-hidden="true">＋</i>生命</span><strong>{Math.ceil(clamp(health)).toString().padStart(3,'0')}</strong><i className={cx("fps-meter")}><b style={{width:clamp(health)+'%'}}/></i></div>
  <div className={cx("fps-stamina")}><span>体力</span><strong>{Math.round(clamp(stamina))}</strong><i className={cx("fps-meter")}><b style={{width:clamp(stamina)+'%'}}/></i></div>
 </section>;
}
export function FPSAmmo({weapon,ammo,reserve,action,reloading=false,touch=false}:{weapon:WeaponId;ammo:number;reserve:number;action?:FPSWeaponAction;reloading?:boolean;touch?:boolean}){
 const status=fpsAmmoState(weapon,ammo,reserve,action,reloading);
 return <section className={cx('fps-ammo fps-tactical-ammo'+(status.low?' is-low':'')+(status.empty?' is-empty':'')+(touch?' is-touch':''))} aria-label="弹药" data-ui-theme="tactical" data-combat-ui="ammo" data-touch={touch} data-ammo-state={status.empty?'empty':status.low?'low':'ready'} data-weapon-phase={action?.phase??'ready'} data-weapon-stage={action?.stage??'ready'}>
  <span className={cx("fps-weapon-name")}>{WEAPONS[weapon].label}</span><strong className={cx(status.low?'low':'')}>{Math.max(0,ammo).toString().padStart(2,'0')}<small><span aria-hidden="true"> / </span>{Math.max(0,reserve)}</small></strong>
  {status.label&&<div className={cx('fps-weapon-action'+(status.active?' is-active':''))}><span>{status.label}</span>{status.active&&status.progress!==null&&<progress aria-label={status.label+'进度'} value={status.progress} max={1}/>}</div>}
 </section>;
}
