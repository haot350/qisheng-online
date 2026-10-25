import {test} from 'node:test';
import assert from 'node:assert/strict';
import {escapeLevelAt,escapeFloorAt,mapStreamingFloors,streamFloorForChunk,chunkAllowedAtLevel,mapLevelLabel} from '../src/escape-floor.ts';
import {presentMapLod} from '../src/map-lod.ts';
import {stairGuideForRoute} from '../src/escape-stair-guidance.ts';
import type {MapLayout,MapLevel,MapChunk,Vec3} from '../../校园共享模块/src/types.ts';

const level=(id:string,buildingId:string,floor:number,x:number,z:number,elevation:number):MapLevel=>({id,buildingId,floor,elevation,bounds:{min:[x,elevation-.2,z],max:[x+10,elevation+3.5,z+10]}});
const map:MapLayout={bounds:{min:[0,-4,0],max:[100,25,100]},buildings:[{id:'south-teaching',label:'南教学楼',bounds:{min:[0,0,0],max:[10,25,10]}},{id:'north-teaching',label:'北教学楼',bounds:{min:[30,0,0],max:[40,25,10]}},{id:'garage',label:'地下自行车库',bounds:{min:[50,-3,0],max:[60,0,10]}}],levels:[level('south-f1','south-teaching',1,0,0,.61),level('south-f5','south-teaching',5,0,0,16.38),level('north-f1','north-teaching',1,30,0,.61),level('north-f5','north-teaching',5,30,0,16.38),level('garage-b1','garage',-1,50,0,-2.8)]};
test('building identity disambiguates equal floor numbers, fifth floor and basement',()=>{
 assert.equal(escapeLevelAt([5,.61,5],map)?.id,'south-f1');assert.equal(escapeLevelAt([35,.61,5],map)?.id,'north-f1');
 assert.equal(escapeLevelAt([35,16.38,5],map)?.id,'north-f5');assert.equal(escapeFloorAt([55,-2.8,5],map),-1);
 assert.equal(escapeLevelAt([20,0,5],map),null);assert.equal(escapeLevelAt([5,0,5],map),null);assert.match(mapLevelLabel(map,'north-f5'),/北教学楼.*5/);
});
test('streaming resolves exact level rather than the last same-number entry',()=>{
 const floors=mapStreamingFloors(map),chunk:MapChunk={url:'south',center:[5,.7,5],radius:1,kind:'interior',floor:1,building:'south-teaching',levelId:'south-f1'};
 assert.equal(streamFloorForChunk(chunk,floors)?.buildingId,'south-teaching');
 assert.equal(chunkAllowedAtLevel(chunk,[5,.61,5],map),true);assert.equal(chunkAllowedAtLevel({...chunk,levelId:'north-f5',building:'north-teaching',floor:5},[5,.61,5],map),false);
 assert.equal(chunkAllowedAtLevel({...chunk,levelId:'garage-b1',building:'garage',floor:-1},[55,-2.8,5],map),true);assert.equal(chunkAllowedAtLevel(chunk,[5,.61,5],map,true),false);
});
test('LOD only changes representation children and leaves the outer safety gate intact',()=>{
 const near={name:'near__tree',visible:true,userData:{}},far={name:'far__tree',visible:true,userData:{}},structure={name:'wall',visible:true,userData:{}},root={name:'chunk',visible:false,userData:{},traverse:(f:(o:typeof near)=>void)=>[near,far,structure].forEach(f)};
 assert.equal(presentMapLod(root,10,false),true);assert.equal(near.visible,true);assert.equal(far.visible,false);assert.equal(root.visible,false);assert.equal(structure.visible,true);
 assert.equal(presentMapLod(root,10,false),false);presentMapLod(root,10,true);assert.equal(near.visible,false);assert.equal(far.visible,true);
 presentMapLod(root,50,false);assert.equal(far.visible,true);
});
test('same numbered floors in different buildings can still direct a real descending route',()=>{
 const stair={core:'south-west',buildingId:'south-teaching',from_floor:0,to_floor:1,fromLevelId:'outdoor',toLevelId:'south-f1',points:[[0,0,0],[0,1,1],[0,2,2]] as Vec3[]};
 const guide=stairGuideForRoute([0,2,3],[[0,2,2],[0,1,1],[0,0,0],[20,0,0]],[stair],1,1);assert.equal(guide?.direction,'down');assert.equal(guide?.floor,0);assert.match(guide!.label,/南楼/);
});
