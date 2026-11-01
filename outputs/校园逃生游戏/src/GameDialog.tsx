import {useId,type ReactNode} from 'react';
import {useDialogFocus} from '@qisheng/shared/community/dialog-focus';
import styles from './GameDialog.module.css';

export interface GameDialogProps {
 title:string; children:ReactNode; confirmLabel:string; onConfirm:()=>void;
 onCancel?:()=>void; cancelLabel?:string; busy?:boolean; busyLabel?:string;
 tone?:'normal'|'danger'; tactical?:boolean;
}
/** Short decisions have one action row; long reading stays in a reading page. */
export function GameDialog({title,children,confirmLabel,onConfirm,onCancel,cancelLabel='取消',busy=false,busyLabel='正在处理…',tone='normal',tactical=false}:GameDialogProps){
 const id=useId(),ref=useDialogFocus(true,()=>{if(!busy)(onCancel??onConfirm)();},!!onCancel||tone==='normal');
 return <div className={styles.shade} data-ui-theme={tactical?'tactical':'campus'}><section ref={ref} className={styles.dialog} data-tone={tone} role="dialog" aria-modal="true" aria-labelledby={id+'-title'} aria-describedby={id+'-body'} aria-busy={busy}>
  <header className={styles.header}>{tone==='danger'&&<span className={styles.symbol} aria-hidden="true">!</span>}<h2 id={id+'-title'}>{title}</h2></header>
  <div className={styles.body} id={id+'-body'}>{children}</div>
  <footer className={styles.actions}>{onCancel&&<button type="button" className={styles.cancel} disabled={busy} onClick={onCancel}>{cancelLabel}</button>}<button type="button" className={styles.confirm} disabled={busy} onClick={onConfirm}>{busy?<><i className={styles.spinner} aria-hidden="true"/>{busyLabel}</>:confirmLabel}</button></footer>
 </section></div>;
}
