import type {OnlineDiagnostics} from '../types';
import type {RoomSnapshot,TeamId} from './shared/protocol';
import type {PublicRosterEntry} from './shared/wire';
import {connectionQuality} from './connection-quality.ts';

export type ScoreboardRow={id:string;nickname:string;team:TeamId;self:boolean;departed:boolean;status:string;rank:number|null;values:[number,number,number];ping:string};
export type ScoreboardGroup={id:string;label:string;score:number|null;rows:ScoreboardRow[]};
export type ScoreboardView={roomId:string;mode:'coop'|'tdm'|'ffa';remaining:number;groups:ScoreboardGroup[]};
export type ScoreboardNetwork={rtt:string;jitter:string;label:string;poor:boolean};
export const SCOREBOARD_INTERVAL_MS=250;
export const SCOREBOARD_NETWORK_INTERVAL_MS=1000;
const count=(n:number)=>Number.isFinite(n)?Math.max(0,Math.floor(n)):0;
export function rosterPing(value:number){return !Number.isFinite(value)||value<=0?'—':value>=500?'≥500 ms':Math.round(value)+' ms';}
export function scoreboardView(room:Pick<RoomSnapshot,'roomId'|'mode'|'variant'|'remaining'|'teamScores'>,roster:readonly PublicRosterEntry[],playerId:string|null):ScoreboardView{
 const mode=room.mode==='coop'?'coop':room.variant==='tdm'?'tdm':'ffa';
 const ordered=mode==='coop'?[...roster]:[...roster].sort((a,b)=>count(b.kills)-count(a.kills)||count(a.deaths)-count(b.deaths)||a.id.localeCompare(b.id));
 let rank=1;
 const rows:ScoreboardRow[]=ordered.map((p,i)=>{
  if(i>0&&(p.kills!==ordered[i-1].kills||p.deaths!==ordered[i-1].deaths))rank=i+1;
  return{id:p.id,nickname:p.nickname,team:p.team,self:p.id===playerId,departed:!!p.departed,status:p.departed?'已离场':!p.connected?'重连中':p.loading?'载入中':'在线',rank:mode==='ffa'?rank:null,values:mode==='coop'?[count(p.downs),count(p.assists),count(p.headshots)]:[count(p.kills),count(p.deaths),count(p.assists)],ping:rosterPing(p.ping)};
 });
 const groups:ScoreboardGroup[]=mode==='tdm'?(['blue','red','none'] as const).filter(team=>team!=='none'||rows.some(p=>p.team==='none')).map(team=>({id:team,label:team==='blue'?'蓝队':team==='red'?'红队':'未分队',score:team==='none'?null:count(room.teamScores[team]),rows:rows.filter(p=>p.team===team)})):[{id:mode,label:mode==='coop'?'合作突围':'个人混战',score:null,rows}];
 return{roomId:room.roomId,mode,remaining:Math.max(0,Math.ceil(room.remaining)),groups};
}
export function sameScoreboard(a:ScoreboardView|null,b:ScoreboardView){
 if(!a||a.roomId!==b.roomId||a.mode!==b.mode||a.remaining!==b.remaining||a.groups.length!==b.groups.length)return false;
 return a.groups.every((group,i)=>{const other=b.groups[i];return group.id===other.id&&group.score===other.score&&group.rows.length===other.rows.length&&group.rows.every((p,j)=>{const q=other.rows[j];return p.id===q.id&&p.nickname===q.nickname&&p.team===q.team&&p.self===q.self&&p.departed===q.departed&&p.status===q.status&&p.rank===q.rank&&p.ping===q.ping&&p.values.every((n,k)=>n===q.values[k]);});});
}
export function scoreboardNetwork(d?:OnlineDiagnostics,measured=true):ScoreboardNetwork{
 const quality=connectionQuality(d);
 const rtt=d?.rttMs??0;
 return{rtt:!measured||!Number.isFinite(rtt)||rtt<=0?'—':rtt>=1000?'≥1000 ms':Math.round(rtt)+' ms',jitter:d&&Number.isFinite(d.jitterMs)&&d.jitterMs>=0?Math.round(d.jitterMs)+' ms':'—',label:d?quality.label:'等待连接数据',poor:quality.poor};
}
export const sameScoreboardNetwork=(a:ScoreboardNetwork|null,b:ScoreboardNetwork)=>!!a&&a.rtt===b.rtt&&a.jitter===b.jitter&&a.label===b.label&&a.poor===b.poor;
