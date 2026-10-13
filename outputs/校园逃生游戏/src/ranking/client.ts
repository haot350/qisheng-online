import {RankingClient,RankingError} from '@qisheng/shared/community/client';
const env=(import.meta as ImportMeta & {env?:Record<string,string|boolean>}).env;
export {RankingClient,RankingError};
export const RANKING_API=String(env?.VITE_RANKING_API||'/api').replace(/\/$/,'');
export const rankingClient=new RankingClient(RANKING_API);
