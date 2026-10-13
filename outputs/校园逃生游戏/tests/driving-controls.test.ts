import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import type {DrivingSnapshot} from '../src/types.ts';
registerHooks({
 resolve(specifier,context,next){if(context.parentURL?.includes('/src/')&&specifier.startsWith('./')&&!/\.(ts|tsx)$/.test(specifier)){for(const ext of ['.ts','.tsx'])if(existsSync(new URL(specifier+ext,context.parentURL)))return next(specifier+ext,context);}return next(specifier,context);},
 load(url,context,next){if(url.endsWith('.css'))return{format:'module',source:'export {};',shortCircuit:true};if(url.endsWith('.tsx'))return{format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText,shortCircuit:true};return next(url,context);}
});
const {TouchDrive,DrivingHelp,DrivingHUD,DrivingInstrument,TransmissionChoice,drivingGearLabel}=await import('../src/DrivingUI.tsx');
const driving:DrivingSnapshot={score:0,hits:0,combo:0,bestCombo:0,bestScore:null,durability:400,speed:8,gear:2,rpm:2500,transmission:'auto',shiftLeft:0,shiftSerial:0,rejectedShiftSerial:0,boostLeft:0,boostCooldown:0,countdown:0,resetProgress:0,repairProgress:0,repairName:'',guide:'',targets:[]};
test('driving renders independent handbrake and ordinary brake controls inside the bounded right-side area',()=>{
 const markup=renderToStaticMarkup(createElement(TouchDrive,{api:null,driving}));
 assert.match(markup,/width:clamp\(186px, 28vw, 226px\)/);assert.equal((markup.match(/class="drive-button /g)||[]).length,6);assert.match(markup,/handbrake-button/);assert.match(markup,/aria-label="手刹"/);assert.match(markup,/aria-label="刹车"/);assert.match(markup,/aria-label="油门"/);assert.match(markup,/aria-label="倒车"/);
 assert.equal((markup.match(/min-width:44px;flex:1/g)||[]).length,3,'utility buttons may shrink only as far as 44 CSS pixels');assert.doesNotMatch(markup,/drive-status|steer-caption/);
 for(const width of [667,812,844]){const utilityWidth=Math.min(226,Math.max(186,width*.28)),gap=width<=667?8:10;assert.ok((utilityWidth-gap*2)/3>=44);assert.ok(utilityWidth<=width*.35,'controls stay at the edge, leaving the center clear');}
});
test('desktop and touch help consistently describe Space as handbrake and S as normal braking then reverse',()=>{
 const help=renderToStaticMarkup(createElement(DrivingHelp,{touch:false}));assert.match(help,/刹车与倒车 \/ 手刹/);assert.match(help,/短拉手刹/);assert.match(help,/不额外计分/);
 const hud=renderToStaticMarkup(createElement(DrivingHUD,{api:null,driving,remaining:300,onPause(){},onFullscreen(){}}));assert.doesNotMatch(hud,/desktop-hints|空格 手刹|空格 刹车/);assert.match(help,/<dt>S \/ 空格<\/dt><dd>刹车与倒车 \/ 手刹<\/dd>/);const touchHelp=renderToStaticMarkup(createElement(DrivingHelp,{touch:true}));assert.doesNotMatch(touchHelp,/<dt>S \/ 空格/);assert.match(touchHelp,/单独按钮/);assert.match(touchHelp,/短按手刹/);
});

test('manual phone mode adds two one-shot shifts without replacing the existing six controls',()=>{
 const markup=renderToStaticMarkup(createElement(TouchDrive,{api:null,driving:{...driving,transmission:'manual'}}));
 assert.equal((markup.match(/class="drive-button /g)||[]).length,8);assert.equal((markup.match(/drive-shift-button/g)||[]).length,2);assert.match(markup,/aria-label="升高一挡"/);assert.match(markup,/aria-label="降低一挡"/);assert.match(markup,/handbrake-button/);assert.match(markup,/aria-label="刹车"/);assert.match(markup,/aria-label="油门"/);assert.match(markup,/aria-label="倒车"/);
 const automatic=renderToStaticMarkup(createElement(TouchDrive,{api:null,driving}));assert.doesNotMatch(automatic,/drive-shift-button/);
});

test('the compact instrument converts signed vehicle speed to km/h and displays gear and rpm separately',()=>{
 for(const [gear,label] of [[0,'N'],[-1,'R'],[1,'1'],[6,'6']] as const){assert.equal(drivingGearLabel(gear),label);const markup=renderToStaticMarkup(createElement(DrivingInstrument,{driving:{...driving,speed:-10,gear,transmission:'manual',rpm:4200}}));assert.match(markup,/车速 36 公里每小时/);assert.match(markup,/转速 4200/);assert.match(markup,/<small>M<\/small>/);assert.ok(markup.includes(`<strong>${label}</strong>`));assert.match(markup,/km\/h/);assert.match(markup,/×1000 rpm/);}
 const hud=renderToStaticMarkup(createElement(DrivingHUD,{api:null,driving,remaining:300,onPause(){},onFullscreen(){}}));const summary=hud.slice(hud.indexOf('drive-summary-car'),hud.indexOf('stat-bar'));assert.doesNotMatch(summary,/km\/h/);assert.equal((hud.match(/class="drive-instrument /g)||[]).length,1);
});

test('rpm arc changes at the warning and redline ranges and remains bounded to its scale',()=>{
 for(const [rpm,color] of [[5000,'#dce7d6'],[5500,'#e8c27e'],[6250,'#f68b77'],[6500,'#f68b77']] as const){const markup=renderToStaticMarkup(createElement(DrivingInstrument,{driving:{...driving,rpm}}));assert.ok(markup.includes(`stroke="${color}"`));}
 const high=renderToStaticMarkup(createElement(DrivingInstrument,{driving:{...driving,rpm:9999,shiftLeft:.2}}));assert.match(high,/stroke-dasharray="100 100"/);assert.match(high,/gear-shifting/);assert.equal(drivingGearLabel(NaN),'N');
});

test('transmission selector exposes automatic and manual choices and respects the pause/menu gate',()=>{
 const manual=renderToStaticMarkup(createElement(TransmissionChoice,{mode:'manual',onChange(){}}));assert.match(manual,/<option value="manual" selected="">/);assert.match(manual,/自动换挡/);assert.match(manual,/手动换挡/);assert.doesNotMatch(manual,/disabled/);
 const disabled=renderToStaticMarkup(createElement(TransmissionChoice,{mode:'auto',disabled:true,onChange(){}}));assert.match(disabled,/disabled=""/);assert.match(disabled,/<option value="auto" selected="">/);
 const help=renderToStaticMarkup(createElement(DrivingHelp,{touch:false}));assert.match(help,/E \/ Q/);assert.match(help,/急弯前先松油门、减速/);assert.match(help,/车速过高时会拒绝危险降挡/);
});
