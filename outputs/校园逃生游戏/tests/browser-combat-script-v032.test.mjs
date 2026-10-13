import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import {QA_MARKER,injectCombatQA,movingShotEvidence,mobileLayoutIssues} from '../scripts/browser-combat-v032.mjs';

test('combat fixture insertion requires one explicit hook point and leaves production source unchanged',async()=>{
 const file=new URL('../src/engine.ts',import.meta.url),source=await fs.readFile(file,'utf8'),hook=await fs.readFile(new URL('../scripts/combat-fixture-v032.ts',import.meta.url),'utf8'),injected=injectCombatQA(source,hook);
 assert.ok(injected.includes('__combatQA'));assert.equal(source.includes('__combatQA'),false);
 assert.equal(await fs.readFile(file,'utf8'),source);
 assert.throws(()=>injectCombatQA('no marker',hook));
 assert.throws(()=>injectCombatQA(QA_MARKER+'\n'+QA_MARKER,hook));
 const output=ts.transpileModule(injected,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},reportDiagnostics:true,fileName:'engine.ts'});
 assert.deepEqual(output.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error),[]);
});

test('moving-fire evidence requires an observed new shot, actual displacement speed, combat pose and true visibility',()=>{
 const n={id:0,shotSerial:0,active:true,actualSpeed:3.2,skill:null,reloadLeft:0,sees:true,eyeClear:true,muzzleClear:true,pose:'combat-run-a',weapon:'mp5',spread:1.6};
 assert.equal(movingShotEvidence([{npcs:[n]},{npcs:[{...n,shotSerial:1}]}]).length,1);
 for(const bad of [{actualSpeed:0},{active:false},{skill:'sprint'},{reloadLeft:.5},{sees:false},{eyeClear:false},{muzzleClear:false},{pose:'attack'}])assert.equal(movingShotEvidence([{npcs:[n]},{npcs:[{...n,...bad,shotSerial:1}]}]).length,0);
 assert.equal(movingShotEvidence([{npcs:[{...n,shotSerial:1}]}]).length,0,'a first sample is not evidence of a moving shot');
 assert.equal(movingShotEvidence([{npcs:[n]},{npcs:[n]}]).length,0);
});

test('mobile layout gate identifies clipped, undersized and central permanent controls',()=>{
 const row={width:667,height:375,scroll:667,buttons:[{label:'射击',x:580,y:250,w:60,h:60,right:640,bottom:310},{label:'移动',x:20,y:200,w:100,h:100,right:120,bottom:300}]};
 assert.deepEqual(mobileLayoutIssues(row),[]);
 assert.ok(mobileLayoutIssues({...row,buttons:[{...row.buttons[0],w:40}]}).includes('射击 touch target'));
 assert.ok(mobileLayoutIssues({...row,buttons:[{...row.buttons[0],right:700}]}).includes('射击 offscreen'));
 assert.ok(mobileLayoutIssues({...row,buttons:[{...row.buttons[0],x:300,right:360}]}).includes('射击 central overlap'));
 assert.ok(mobileLayoutIssues({...row,scroll:680}).includes('horizontal page overflow'));
});
