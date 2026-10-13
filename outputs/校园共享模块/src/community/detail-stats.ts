import type {RankingSummary} from '../ranking.ts';

/** Missing legacy/team statistics are unknown; a recorded zero remains meaningful. */
export function combatDetailStats(summary: Pick<RankingSummary,'downs'|'headshots'|'damage'>): Array<{label:string;value:string}>{
 const rows:Array<{label:string;value:string}>=[];
 const recorded=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
 if(recorded(summary.downs))rows.push({label:'击倒',value:String(summary.downs)});
 if(recorded(summary.headshots))rows.push({label:'爆头',value:String(summary.headshots)});
 if(recorded(summary.damage))rows.push({label:'累计承伤',value:String(Math.round(summary.damage))});
 return rows;
}
