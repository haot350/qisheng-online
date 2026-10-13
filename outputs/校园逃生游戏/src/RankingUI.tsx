import {RankingUI as SharedRankingUI,type RankingUIProps} from '@qisheng/shared/community';
import {rankingClient} from './ranking/client';
import {achievementIconUrls} from './achievement-icons';
import {pendingRankingRuns,retryPendingRanking} from './ranking/recorder';
const pendingRuns={list:pendingRankingRuns,submit:retryPendingRanking};
export {RankingResultStatus} from '@qisheng/shared/community';
export default function RankingUI(props:Omit<RankingUIProps,'client'|'pendingRuns'>){return <SharedRankingUI {...props} iconUrls={props.iconUrls??achievementIconUrls} client={rankingClient} pendingRuns={pendingRuns}/>;}
