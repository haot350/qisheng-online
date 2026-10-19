import type {ReactNode} from 'react';
import type {GameAPI,Snapshot} from './types';
import {FPSVitals,FPSAmmo} from './FPSCombatHUD';
import {NearbyInteractionUI} from './NearbyInteractionUI';
import {GameDialog} from './GameDialog';
import './training.css';

export function TrainingHUD({snapshot,api,touch,onExit,children}:{snapshot:Snapshot;api:GameAPI|null;touch:boolean;onExit:()=>void;children?:ReactNode}){
 const lesson=snapshot.training;if(!lesson)return null;
 const prompts={look:['环顾四周',touch?'在右侧空白处拖动，看看周围。':'移动鼠标，看看周围。'],move:['走动一下',touch?'拖动左侧摇杆，向前走几步。':'按 WASD，向前走几步。'],aim:['举枪瞄准',touch?'点击瞄准按钮，或按住你设置的瞄准键。':'按住鼠标右键，举枪瞄准。'],fire:['试射一发',touch?'朝空地点击射击。':'朝空地按鼠标左键。'],reload:['完成一次换弹',touch?'点击换弹，等待装填完成。':'按 R 换弹，等待装填完成。'],map:['看看任务地图',touch?'点击“地图”，找到练习物资，再返回游戏。':'按 M 打开地图，找到练习物资，再返回游戏。'],interact:['取回练习物资',touch?'跟随方向提示走近物资，再点互动。':'跟随方向提示走近物资，再按 E。']} as const;
 const [title,detail]=prompts[lesson.step];
 return <div className={'training-hud'+(touch?' is-touch':'')}>
  <section className="training-guidance" aria-label="操作练习"><div><small>操作练习 · {Math.min(lesson.total,lesson.index+1)}/{lesson.total}</small><button onClick={onExit}>结束练习</button></div><h2>{title}</h2><p>{detail}</p>{lesson.step==='interact'&&<span className="training-destination"><i style={{transform:'rotate('+snapshot.goalAngle+'rad)'}}>↑</i>{Math.round(snapshot.goalDistance)} 米 · 练习物资</span>}<progress value={lesson.index} max={lesson.total} aria-label="练习进度"/></section>
  <div className="training-tools"><button onClick={()=>void api?.taskMap?.(true)}>地图{touch?'':' · M'}</button><button aria-label="暂停练习" onClick={()=>api?.pause()}>Ⅱ</button></div>
  <FPSVitals health={snapshot.health} stamina={snapshot.stamina} touch={touch}/><FPSAmmo weapon={snapshot.weapon} ammo={snapshot.ammo} reserve={snapshot.reserve} action={snapshot.weaponAction} touch={touch}/>
  {snapshot.interaction?.taskId===lesson.taskId&&<NearbyInteractionUI interaction={snapshot.interaction} screen={snapshot.interactionScreen} label="练习物资" touch={touch} onPress={pressed=>api?.action('interact',pressed)}/>}
  {children}
 </div>;
}
export function TrainingComplete({onPrepare,onExit}:{onPrepare:()=>void;onExit:()=>void}){
 return <GameDialog tactical title="准备好出发了" confirmLabel="进入突围准备" cancelLabel="返回主菜单" onConfirm={onPrepare} onCancel={onExit}><p>移动、射击、换弹和任务互动都已熟悉。下一步，选好装备，开始你的行动。</p></GameDialog>;
}
