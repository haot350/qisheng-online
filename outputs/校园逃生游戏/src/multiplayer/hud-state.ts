import type {OnlineMode,MatchResult} from './shared/protocol.ts';

export function onlineResultStats(mode:OnlineMode,player:Partial<Pick<MatchResult['players'][number],'kills'|'downs'|'deaths'|'assists'|'headshots'>>){
 const count=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;
 const assists=count(player.assists),headshots=count(player.headshots);
 return [
  {label:'击倒',value:count(mode==='coop'?player.downs:player.kills)},
  {label:'次倒下',value:count(player.deaths)},
  {label:assists===null&&headshots!==null?'爆头':'助攻',value:assists??headshots}
 ];
}
