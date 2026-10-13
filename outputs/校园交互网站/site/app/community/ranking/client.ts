import {RankingClient,RankingError} from '@qisheng/shared/community/client';
import {GAME_ORIGIN} from '../../site-config';
export {RankingClient,RankingError};
export const RANKING_API=GAME_ORIGIN+'/api';
export const rankingClient=new RankingClient(RANKING_API);
