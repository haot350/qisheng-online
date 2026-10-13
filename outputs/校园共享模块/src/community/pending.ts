import type {RankingRunConfig,RankingSummary,RankingSubmission} from '../ranking.ts';
export type PendingRankingRun={id:string;config:RankingRunConfig;summary?:RankingSummary;finishedAt?:number};
export type PendingRunsAdapter={list:()=>Promise<PendingRankingRun[]>;submit:(id:string)=>Promise<RankingSubmission>};
