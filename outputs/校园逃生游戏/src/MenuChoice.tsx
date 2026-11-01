import {useId,type ReactNode} from 'react';
import './ui-choice.css';
export type MenuChoiceOption<T extends string>={value:T;label:ReactNode};
export function MenuChoice<T extends string>({label,value,options,onChange,disabled=false,hint,purpose}:{label:string;value:T;options:readonly MenuChoiceOption<T>[];onChange:(value:T)=>void;disabled?:boolean;hint?:string;purpose?:string}){
 const id=useId();
 return <fieldset className="b-choice" disabled={disabled} data-choice={purpose}><legend>{label}</legend><div className="b-choice-options" data-count={options.length}>{options.map(option=><label key={option.value} className="b-choice-option"><input type="radio" name={id} value={option.value} checked={value===option.value} onChange={()=>onChange(option.value)}/><span>{option.label}</span></label>)}</div>{hint&&<p className="b-choice-hint">{hint}</p>}</fieldset>;
}
