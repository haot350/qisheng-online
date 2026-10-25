import type {MapManifest,Vec3} from '../../types';
import type {OnlineMode} from './protocol';

/** New exploration and task areas do not automatically become PvP spawn locations. */
export function combatSpawnCandidates(map:Pick<MapManifest,'spawn'|'pvpSpawns'>,mode:OnlineMode,legacyRespawns:readonly {position:Vec3}[],legacyTasks:readonly {position:Vec3}[]):Vec3[]{
 const selected=mode==='pvp'&&map.pvpSpawns!==undefined?map.pvpSpawns:[...legacyRespawns,...legacyTasks].map(site=>site.position);
 return [map.spawn,...selected].map(point=>[...point] as Vec3);
}
