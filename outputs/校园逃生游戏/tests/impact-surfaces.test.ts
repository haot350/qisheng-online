import {test} from 'node:test';import assert from 'node:assert/strict';import {classifyImpactSurface} from '../src/impact-surfaces.ts';
test('real upward and vertical normals identify ground and wall independently of normal length',()=>{
 assert.equal(classifyImpactSurface({normal:{x:0,y:3,z:0}}),'ground');
 assert.equal(classifyImpactSurface({normal:[.2,1,.2]}),'ground');
 assert.equal(classifyImpactSurface({normal:[1,0,0]}),'wall');
 assert.equal(classifyImpactSurface({normal:{x:1,y:.2,z:1}}),'wall');
});
test('unknown, ceiling, ambiguous slope and invalid normals remain neutral',()=>{
 for(const normal of [undefined,null,[0,-1,0],[1,.65,0],[0,0,0],[NaN,1,0],[1,Infinity,0]] as const)assert.equal(classifyImpactSurface({normal}),'neutral');
 assert.equal(classifyImpactSurface({materialName:'Material.023'}),'neutral');
 assert.equal(classifyImpactSurface({materialName:'Concrete'}),'neutral');
 assert.equal(classifyImpactSurface({materialName:'砖石',normal:[0,1,0]}),'ground');
});
test('only explicit collision-material metal names override geometric orientation',()=>{
 for(const materialName of ['Metal.001','SteelReceiver','stainless_steel','cast-iron','AluminiumFrame','铜板','镀锌钢护栏','金属扶手'])assert.equal(classifyImpactSurface({materialName,normal:[0,1,0]}),'metal',materialName);
 for(const materialName of ['MetallicPaint','SteelBlue','IronGray','steel_blue','玻璃','RGB_7c878a'])assert.equal(classifyImpactSurface({materialName}),'neutral',materialName);
 assert.equal(classifyImpactSurface({materialName:'SteelBlue',normal:[1,0,0]}),'wall');
});
