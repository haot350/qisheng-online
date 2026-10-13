import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {pathMotion} from '../src/path-following.ts';

test('route following keeps a nearby waypoint on a different floor',()=>{
 const route=[new Vector3(0,4,0),new Vector3(2,4,0)];
 assert.equal(pathMotion(new Vector3(0,0,0),route,3,1/60).length(),0);
 assert.equal(route.length,2,'a horizontal coincidence is not evidence the upper waypoint was reached');
});
test('route following preserves an unreached corner and clamps the final step',()=>{
 const route=[new Vector3(.14,0,0),new Vector3(.14,0,2)];
 const move=pathMotion(new Vector3(),route,3,1/60);assert.equal(route.length,2);assert.deepEqual(move.toArray(),[.05,0,0]);
 const near=[new Vector3(.1,0,0),new Vector3(.1,0,.13)];
 const final=pathMotion(new Vector3(),near,100,1);assert.ok(Math.abs(final.length()-Math.hypot(.1,.13))<1e-9);
});
