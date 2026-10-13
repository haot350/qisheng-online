'use client';
import {RankingUI as SharedRankingUI,type RankingUIProps} from '@qisheng/shared/community';
import {rankingClient} from './ranking/client';
import {ACHIEVEMENT_CATALOG} from '@qisheng/shared/achievements';
import {staticAssetUrl} from '@/lib/static-assets';
const iconUrls=Object.fromEntries(ACHIEVEMENT_CATALOG.map(item=>[item.id,staticAssetUrl('/images/achievements/'+item.id+'.webp')]));
export {RankingResultStatus} from '@qisheng/shared/community';
export default function RankingUI(props:Omit<RankingUIProps,'client'|'pendingRuns'>){return <SharedRankingUI {...props} client={rankingClient} iconUrls={iconUrls}/>;}
