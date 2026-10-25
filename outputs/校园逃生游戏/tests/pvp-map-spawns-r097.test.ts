import test from 'node:test';
import assert from 'node:assert/strict';
import {combatSpawnCandidates} from '../src/multiplayer/shared/spawn-points.ts';
import type {Vec3} from '../src/types.ts';

test('curated PvP points exclude new task areas while coop and old maps retain their existing candidates',()=>{
 const spawn:Vec3=[0,0,0],curated:Vec3=[2,0,0],respawns=[{position:[10,0,0] as Vec3}],newTaskAreas=[{position:[20,8,0] as Vec3}];
 const map={spawn,pvpSpawns:[curated]};
 const pvp=combatSpawnCandidates(map,'pvp',respawns,newTaskAreas);
 assert.deepEqual(pvp,[spawn,curated]);assert.deepEqual(combatSpawnCandidates(map,'coop',respawns,newTaskAreas),[spawn,respawns[0].position,newTaskAreas[0].position]);
 assert.deepEqual(combatSpawnCandidates({spawn},'pvp',respawns,newTaskAreas),[spawn,respawns[0].position,newTaskAreas[0].position]);
 assert.deepEqual(combatSpawnCandidates({spawn,pvpSpawns:[]},'pvp',respawns,newTaskAreas),[spawn]);
 pvp[1][0]=999;assert.equal(curated[0],2);
});
