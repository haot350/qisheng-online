import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {registerHooks} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import ts from 'typescript';
registerHooks({resolve(specifier,context,next){if(context.parentURL?.includes('/src/')&&specifier.startsWith('.')&&!/\.(ts|tsx)$/.test(specifier)){for(const ext of ['.ts','.tsx'])if(existsSync(new URL(specifier+ext,context.parentURL)))return next(specifier+ext,context);}return next(specifier,context);},load(url,context,next){if(url.endsWith('.tsx'))return{format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText,shortCircuit:true};return next(url,context);}});
const {MapLevelPicker}=await import('../src/MapLevelPicker.tsx');
const {EscapeMapCanvas}=await import('../src/EscapeMapCanvas.tsx');
import type {Snapshot} from '../src/types';
import type {MapLayout} from '../../校园共享模块/src/types.ts';
const map={bounds:{min:[-10,-4,-10],max:[80,25,40]},buildings:[{id:'south-teaching',label:'南教学楼',bounds:{min:[0,0,0],max:[10,20,10]}},{id:'north-teaching',label:'北教学楼',bounds:{min:[30,0,0],max:[40,20,10]}}],levels:[{id:'south-f1',buildingId:'south-teaching',floor:1,elevation:.61,bounds:{min:[0,.4,0],max:[10,4,10]}},{id:'north-f1',buildingId:'north-teaching',floor:1,elevation:.61,bounds:{min:[30,.4,0],max:[40,4,10]}},{id:'north-f5',buildingId:'north-teaching',floor:5,elevation:16.38,bounds:{min:[30,16,0],max:[40,20,10]}}]} as MapLayout;
test('area selector shows floors for the chosen building rather than fifteen flat buttons',()=>{
 const html=renderToStaticMarkup(createElement(MapLevelPicker,{map,floor:1,levelId:'north-f1',onChange(){}}));
 assert.match(html,/地图区域/);assert.match(html,/value="north-teaching" selected/);assert.match(html,/5 层/);assert.equal((html.match(/>1 层<\/button>/g)??[]).length,1);
});
test('same numbered level in another building does not leak into the selected map projection',()=>{
 const snapshot={escape:{mapLayout:map,playerPosition:[35,.61,5],playerFloor:1,playerLevelId:'north-f1',tasks:[],enemyContacts:[],supplies:[],extractionAvailable:false}} as unknown as Snapshot;
 const html=renderToStaticMarkup(createElement(EscapeMapCanvas,{snapshot,floor:1,levelId:'north-f1',markers:[{id:'north',position:[35,.61,5],floor:1,label:'北楼队友'},{id:'south',position:[5,.61,5],floor:1,label:'南楼队友'}]}));
 assert.match(html,/data-map-level="north-f1"/);assert.match(html,/<title>北楼队友<\/title>/);assert.doesNotMatch(html,/<title>南楼队友<\/title>/);
});
