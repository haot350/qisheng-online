import {ACHIEVEMENT_CATALOG} from '@qisheng/shared/achievements';
import {staticAssetUrl} from './static-assets';
export const achievementIconUrls=Object.fromEntries(ACHIEVEMENT_CATALOG.map(item=>[item.id,staticAssetUrl('/images/achievements/'+item.id+'.webp')]));
