import type {CombatBriefingMode} from './CombatBriefing';
const key='qisheng-combat-briefing-v1';
export function hasSeenCombatBriefing(mode:CombatBriefingMode):boolean {try{return JSON.parse(localStorage.getItem(key)??'[]').includes(mode);}catch{return false;}}
export function markCombatBriefingSeen(mode:CombatBriefingMode):void {try{const values=JSON.parse(localStorage.getItem(key)??'[]');localStorage.setItem(key,JSON.stringify([...new Set([...(Array.isArray(values)?values:[]),mode])]));}catch{}}
