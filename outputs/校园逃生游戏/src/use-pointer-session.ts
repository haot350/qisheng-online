import {useLayoutEffect,useRef} from 'react';
import {listenPointerSession,PointerSession} from './pointer-owner.ts';

export function usePointerSession(enabled=true,attached=true){
  const session=useRef<PointerSession|null>(null);if(!session.current)session.current=new PointerSession();
  const value=session.current;
  useLayoutEffect(()=>{if(attached)return listenPointerSession(value,window,document);},[value,attached]);
  useLayoutEffect(()=>{value.setEnabled(enabled&&attached);return()=>value.setEnabled(false);},[value,enabled,attached]);
  return value;
}
