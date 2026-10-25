import SITE_CATALOGS from './site-catalogs.json' with {type:'json'};
import {rankingRuleVersionForCatalog,coopRuleVersionForCatalog,type RankingMode,type DrivingVehicleId} from './shared.js';

/** The compatible API follows its installed map, while archived runs keep their own scope. */
export const activeMapCatalogId:string=SITE_CATALOGS.current;
if(!Object.hasOwn(SITE_CATALOGS.catalogs,activeMapCatalogId)||!coopRuleVersionForCatalog(activeMapCatalogId))throw Error('Current map catalog is not installed');
export function currentRankingRuleVersion(mode:RankingMode,vehicleId:DrivingVehicleId='bao5'){return rankingRuleVersionForCatalog(mode,activeMapCatalogId,vehicleId)!;}
export function currentCoopRuleVersion(){return coopRuleVersionForCatalog(activeMapCatalogId)!;}
