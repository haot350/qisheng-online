import {useEffect,useState,type CSSProperties} from 'react';
import type {GameAPI} from './types';

const panel:CSSProperties={position:'absolute',right:12,bottom:12,zIndex:5,width:248,maxWidth:'calc(100vw - 24px)',padding:10,background:'#f0efeaee',color:'#282e2b',border:'1px solid #b5b5ab',fontSize:14,lineHeight:1.4};
const control:CSSProperties={padding:'8px 5px',background:'#e5e4de',color:'#282e2b',border:'1px solid #c8c8bc',minHeight:36,fontSize:14};

// Loaded only by App's development guard and explicit driving QA profile.
// These visible controls send the ordinary driving API, not physics shortcuts.
export default function DrivingQA({api}:{api:GameAPI|null}){
  const [expanded,setExpanded]=useState(true),[resetHeld,setResetHeld]=useState(false);
  useEffect(()=>()=>api?.drive({steer:0,throttle:0,brake:0,reverse:false,boost:false,reset:false}),[api]);
  const boost=()=>{api?.drive({boost:true});queueMicrotask(()=>api?.drive({boost:false}));};
  return <aside style={panel} aria-label="开发环境驾驶检查"><button style={{...control,width:'100%',textAlign:'left'}} onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}>驾驶检查 {expanded?'收起':'展开'}</button>{expanded&&<div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:5,marginTop:8}}>
    <button style={control} onClick={()=>api?.drive({throttle:1,brake:0,reverse:false})}>保持油门</button>
    <button style={control} onClick={()=>api?.drive({throttle:0,brake:1,reverse:false,steer:0})}>停稳</button>
    <button style={control} onClick={()=>api?.drive({brake:0})}>松刹</button>
    <button style={control} onClick={()=>api?.drive({steer:-1})}>左转</button>
    <button style={control} onClick={()=>api?.drive({steer:1})}>右转</button>
    <button style={control} onClick={()=>api?.drive({steer:0})}>回正</button>
    <button style={control} onClick={()=>api?.drive({throttle:1,reverse:true,brake:0})}>保持倒车</button>
    <button style={control} onClick={boost}>加速</button>
    <button style={{...control,background:resetHeld?'#94503d':'#e5e4de',color:resetHeld?'#fff':'#282e2b'}} aria-pressed={resetHeld} onClick={()=>{const held=!resetHeld;setResetHeld(held);api?.drive({reset:held});}}>{resetHeld?'停止脱困':'按住脱困'}</button>
  </div>}</aside>;
}
