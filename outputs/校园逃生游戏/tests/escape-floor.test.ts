import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {escapeFloorAt} from '../src/escape-floor.ts';
import type {MapManifest,Vec3} from '../src/types';
const manifest=JSON.parse(readFileSync(new URL('../public/map/manifest.json',import.meta.url),'utf8')) as MapManifest;
test('all four actual source floors and both stair landings are classified',()=>{
 for(const f of manifest.floors!){assert.equal(escapeFloorAt([-50,f.elevation,-77.4],manifest.floors),f.id);for(const x of [-65.31,-34])assert.equal(escapeFloorAt([x,f.elevation,-78.14],manifest.floors),f.id);}
 assert.equal(escapeFloorAt([0,.067,-50],manifest.floors),0);assert.equal(escapeFloorAt([-50,.067,-77.4],manifest.floors),0);
});
test('floor IDs come from the manifest rather than a fixed 1/2 range',()=>{
 const floors=[{id:7,elevation:2,bounds:{min:[-1,1,-1] as Vec3,max:[1,5,1] as Vec3}}];assert.equal(escapeFloorAt([0,2,0],floors),7);assert.equal(escapeFloorAt([8,2,0],floors),0);
});
