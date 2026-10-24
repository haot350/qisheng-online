import type {WeatherPreset} from '@qisheng/shared/weather';
import {WeatherChoice,RoomWeather} from './WeatherChoice';
import {useRef, useState, type ReactNode} from 'react';
import CacheSettingsUI from './CacheSettingsUI';
import {TransmissionChoice} from './DrivingUI';
import {EscapeMusicChoice, EscapeTouchSettings} from './EscapeUI';
import {modeCapabilities} from './mode-policy';
import type {Mode, Settings} from './types';
import './settings-page.css';

const sections = [
  {id:'controls', name:'操作', detail:'观察与按键'},
  {id:'graphics', name:'画面', detail:'清晰度与视野'},
  {id:'accessibility', name:'可读性', detail:'文字与准星'},
  {id:'audio', name:'声音', detail:'音乐与音效'},
  {id:'gameplay', name:'游玩', detail:'当前玩法偏好'},
  {id:'storage', name:'地图下载', detail:'本机资源与存储'},
] as const;
type Section = typeof sections[number]['id'];

export function SettingsPanel({settings,onChange,onClose,mode,canChangeTransmission,onEditTouch,onlineWeather}:{
  settings:Settings; onChange:(next:Settings)=>void; onClose:()=>void; mode:Mode;
  canChangeTransmission:boolean; onEditTouch:()=>void; onlineWeather?:WeatherPreset;
}) {
  const [section,setSection]=useState<Section>('controls');
  const nav=useRef<HTMLElement>(null);
  const field=(title:string,description:string|undefined,content:ReactNode)=>
    <div className="settings-field"><div className="settings-field-copy"><span>{title}</span>{description&&<p>{description}</p>}</div>{content}</div>;
  const range=(key:'sensitivity'|'fov'|'music'|'sfx'|'crosshairSize'|'uiTextScale',label:string,min:number,max:number,step:number,display:string)=>
    <label className="settings-slider"><span>{label}<output>{display}</output></span><input type="range" aria-label={label} min={min} max={max} step={step} value={settings[key]??1} onChange={e=>onChange({...settings,[key]:Number(e.target.value)})}/></label>;
  const toggle=(key:'headBob'|'recoilShake'|'aimAssist'|'realityHints'|'onlinePing'|'reducedMotion'|'crosshairOutline',label:string,description?:string)=>
    <label className="settings-toggle"><span><strong>{label}</strong>{description&&<small>{description}</small>}</span><input type="checkbox" role="switch" checked={!!settings[key]} onChange={e=>onChange({...settings,[key]:e.target.checked})}/></label>;
  const current=sections.find(s=>s.id===section)!;
  return <div className="settings-workspace">
    <nav ref={nav} className="settings-sections" role="tablist" aria-label="设置分类" onKeyDown={e=>{
      if(!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
      const index=sections.findIndex(s=>s.id===section),next=e.key==='Home'?0:e.key==='End'?sections.length-1:(index+(['ArrowRight','ArrowDown'].includes(e.key)?1:sections.length-1))%sections.length;
      e.preventDefault();setSection(sections[next].id);nav.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }}>{sections.map(item=><button key={item.id} id={'settings-tab-'+item.id} role="tab" type="button" aria-selected={section===item.id} aria-controls={'settings-section-'+item.id} tabIndex={section===item.id?0:-1} onClick={()=>setSection(item.id)}><span>{item.name}</span><small>{item.detail}</small><i aria-hidden="true">›</i></button>)}</nav>
    <div className="settings-body"><header className="settings-section-heading"><h2>{current.name}</h2></header>
      <section id={'settings-section-'+section} role="tabpanel" aria-labelledby={'settings-tab-'+section} className="settings-section-content" key={section}>
        {section==='controls'&&<>
          {field('操作方式',undefined,<div className="settings-segmented" role="group" aria-label="操作方式">{([['auto','自动'],['desktop','键鼠'],['touch','触屏']] as const).map(([value,label])=><button key={value} aria-pressed={settings.controls===value} onClick={()=>onChange({...settings,controls:value})}>{label}</button>)}</div>)}
          {range('sensitivity','观察灵敏度',.35,2,.05,settings.sensitivity.toFixed(2)+' 倍')}
          {mode==='escape'&&<div className="settings-touch-group"><EscapeTouchSettings settings={settings} onChange={onChange} onEdit={onEditTouch}/>{toggle('aimAssist','触屏瞄准减速','准星接近可见目标时，减慢观察速度。')}</div>}
          {mode==='dafei'&&(!settings.drivingVehicle||settings.drivingVehicle==='bao5')&&<div className="settings-choice-block"><h3>换挡方式</h3><TransmissionChoice mode={settings.transmission??'auto'} onChange={transmission=>onChange({...settings,transmission})} disabled={!canChangeTransmission}/>{!canChangeTransmission&&<p className="settings-note">暂停后可以更换换挡方式。</p>}</div>}
        </>}
        {section==='graphics'&&<>
          <div className="settings-quality" role="group" aria-label="画面质量">{([
            ['auto','自动','根据运行表现调整'],['smooth','流畅','降低画面负担'],['high','高清','更清晰的画面与阴影'],['ultra','超清','适合性能充足的设备'],
          ] as const).map(([value,title,detail])=><button key={value} aria-pressed={settings.quality===value} onClick={()=>onChange({...settings,quality:value})}><span>{title}<i aria-hidden="true">{settings.quality===value?'✓':''}</i></span><small>{detail}</small></button>)}</div>
          {toggle('reducedMotion','减少动态效果','简化菜单与小齐的装饰动画。')}
          {range('fov','视野范围',50,80,1,settings.fov+'°')}
          {mode!=='dafei'&&toggle('headBob','轻微行走晃动')}
          {modeCapabilities(mode).enemies&&toggle('recoilShake',mode==='dafei'?'碰撞镜头震动':'射击镜头震动')}
        </>}
        {section==='accessibility'&&<>
          {range('uiTextScale','界面文字',1,1.3,.05,Math.round((settings.uiTextScale??1)*100)+'%')}
          {range('crosshairSize','准星大小',.75,1.75,.05,Math.round((settings.crosshairSize??1)*100)+'%')}
          {toggle('crosshairOutline','准星描边','在明暗背景上更容易看清准星。')}
          <div className="settings-reticle-preview" aria-label="准星预览"><svg viewBox="0 0 72 72" aria-hidden="true"><g stroke="#fff" strokeWidth={2*(settings.crosshairSize??1)} style={{filter:settings.crosshairOutline!==false?'drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000)':'none'}}><path d="M36 15V25M36 47V57M15 36H25M47 36H57"/><circle cx="36" cy="36" r={2*(settings.crosshairSize??1)} fill="#fff" stroke="none"/></g></svg></div>
          <p className="settings-accessibility-note">队伍同时用文字与符号区分：◆ 蓝队 · ▲ 红队。</p>
        </>}
        {section==='audio' &&<>
          {range('music','音乐音量',0,1,.01,Math.round(settings.music*100)+'%')}
          {range('sfx','环境与动作音效',0,1,.01,Math.round(settings.sfx*100)+'%')}
          {mode==='escape'&&<div className="settings-choice-block"><h3>突围配乐</h3><EscapeMusicChoice settings={settings} onChange={onChange}/></div>}
        </>}
        {section==='gameplay'&&<>
          {mode!=='story'&&(onlineWeather?<RoomWeather preset={onlineWeather}/>:<WeatherChoice value={settings.weather??'clear'} onChange={weather=>onChange({...settings,weather})}/>)}
          {toggle('onlinePing','联机显示 Ping','在对局中显示当前网络往返时间。')}
          {modeCapabilities(mode).photography&&toggle('realityHints','实拍机位提示','在校园中显示可以对照实景照片的位置。')}
        </>}
        {section==='storage'&&<CacheSettingsUI/>}
      </section>
      <footer className="settings-done"><button className="primary" onClick={onClose}>完成 <span aria-hidden="true">→</span></button></footer>
    </div>
  </div>;
}
