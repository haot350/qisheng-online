import {useId,type ReactNode} from 'react';
import {useDialogFocus} from '@qisheng/shared/community/dialog-focus';
import './game-dialog.css';

export interface GameDialogProps {
 title:string; children:ReactNode; confirmLabel:string; onConfirm:()=>void;
 onCancel?:()=>void; cancelLabel?:string; busy?:boolean; busyLabel?:string;
 tone?:'normal'|'danger'; tactical?:boolean;
}
/** Short decisions have one action row; long reading stays in a reading page. */
export function GameDialog({title,children,confirmLabel,onConfirm,onCancel,cancelLabel='取消',busy=false,busyLabel='正在处理…',tone='normal',tactical=false}:GameDialogProps){
 const id=useId(),ref=useDialogFocus(true,()=>{if(!busy)(onCancel??onConfirm)();},!!onCancel||tone==='normal');
 return <div className={'game-dialog-shade'+(tactical?' is-tactical':'')}><section ref={ref} className={'game-dialog is-'+tone} role="dialog" aria-modal="true" aria-labelledby={id+'-title'} aria-describedby={id+'-body'} aria-busy={busy}>
  <div className="game-dialog-accent" aria-hidden="true"/>
  <header><span className="game-dialog-symbol" aria-hidden="true">{tone==='danger'?'!':'·'}</span><h2 id={id+'-title'}>{title}</h2></header>
  <div className="game-dialog-body" id={id+'-body'}>{children}</div>
  <footer>{onCancel&&<button type="button" className="game-dialog-cancel" disabled={busy} onClick={onCancel}>{cancelLabel}</button>}<button type="button" className="game-dialog-confirm" disabled={busy} onClick={onConfirm}>{busy?<><i className="game-dialog-spinner" aria-hidden="true"/>{busyLabel}</>:confirmLabel}</button></footer>
 </section></div>;
}
