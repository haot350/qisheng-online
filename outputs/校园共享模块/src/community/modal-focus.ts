import {useEffect,type RefObject} from 'react';
import {registerDialog} from './dialog-focus';

/** Keep keyboard interaction inside the top dialog, then return its focus. */
export function useModalFocus(root:RefObject<HTMLElement|null>,active=true){
 useEffect(()=>{
  if(active&&root.current)return registerDialog(root.current);
 },[active,root]);
}
