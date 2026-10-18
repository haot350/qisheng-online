import type {Mode} from './types';
export type RecentPlay={mode:Mode;entry:'single'|'coop'|'pvp';variant:'tdm'|'ffa'};
const key='qisheng:recent-play:v1';
export function readRecentPlay():RecentPlay|null {try{const v=JSON.parse(localStorage.getItem(key)??'null');if(v&&['story','escape','dafei','roam'].includes(v.mode)&&['single','coop','pvp'].includes(v.entry)&&['tdm','ffa'].includes(v.variant))return {mode:v.mode,entry:v.entry,variant:v.variant};}catch{}return null;}
export function saveRecentPlay(value:RecentPlay){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
export function recentPlayName(value:RecentPlay):string{return value.mode==='escape'?(value.entry==='single'?'单人突围':value.entry==='coop'?'合作突围':value.variant==='tdm'?'团队对战':'个人混战'):({story:'明天，照常见',roam:'自由漫游',dafei:'大飞模式'} as const)[value.mode];}
