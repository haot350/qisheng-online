import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CombatTraining,trainingPlan,TRAINING_TASK_ID} from '../src/training.ts';
import {EscapeRound} from '../src/escape/round.ts';
import {Magazine} from '../src/rules.ts';
import {parseStoredSettings} from '../src/types.ts';

function readyToFire(){
 const lesson=new CombatTraining(),gun=new Magazine('m4a1');
 const frame={position:[0,0,0] as [number,number,number],yaw:0,pitch:0,aiming:false,ammo:gun.ammo,weapon:'m4a1',reloading:false,active:true};
 const tick=(values:Partial<typeof frame>={})=>{Object.assign(frame,values);lesson.observe(frame);};
 tick();tick({yaw:.35});assert.equal(lesson.read().step,'move');
 tick({active:false,position:[100,0,0]});assert.equal(lesson.read().step,'move');
 tick({position:[0,0,0],active:true});for(let i=1;i<=11;i++)tick({position:[i*.2,0,0]});assert.equal(lesson.read().step,'aim');
 tick({aiming:true});assert.equal(lesson.read().step,'fire');return{lesson,gun,tick};
}
test('actual displacement, magazine completion, map closure and shared task are required',()=>{
 const{lesson,gun,tick}=readyToFire();assert.equal(gun.fire(),true);lesson.record('shot',{weapon:'m4a1'});tick({ammo:gun.ammo});assert.equal(lesson.read().step,'reload');
 assert.equal(gun.reload(),true);tick({ammo:gun.ammo,reloading:true});gun.update(.1);tick({ammo:gun.ammo,reloading:true});assert.equal(lesson.read().step,'reload');
 gun.update(10);tick({ammo:gun.ammo,reloading:gun.reloadLeft>0});assert.equal(lesson.read().step,'map');
 lesson.map(false);assert.equal(lesson.read().step,'map');lesson.map(true);assert.equal(lesson.read().step,'map');lesson.map(false);assert.equal(lesson.read().step,'interact');
 const site={id:'existing-site',label:'现有物资点',region:'sports',position:[0,0,0] as [number,number,number]};
 const plan=trainingPlan(site,[0,0,6],123),round=new EscapeRound({difficulty:'easy',plan,onRecord:(type,data)=>lesson.record(type,data)});
 round.update(0,{position:[0,0,6],interactPressed:true});tick();assert.equal(lesson.read().complete,false);
 round.update(0,{position:[0,0,1],interactPressed:true,canInteract:()=>true});tick();assert.equal(round.completed,1);assert.equal(lesson.read().complete,true);assert.equal(plan.tasks[0].id,TRAINING_TASK_ID);
});
test('cancelled reload and switching weapons do not finish reload lesson',()=>{
 const{lesson,gun,tick}=readyToFire();gun.fire();lesson.record('shot',{});tick({ammo:gun.ammo});gun.reload();tick({reloading:true,ammo:gun.ammo});gun.cancelReload();tick({reloading:false,ammo:gun.ammo});assert.equal(lesson.read().step,'reload');
 tick({weapon:'glock',ammo:100,reloading:false});assert.equal(lesson.read().step,'reload');
});
test('old settings get safe defaults and assisted display settings survive storage roundtrip',()=>{
 const old=parseStoredSettings('{"sensitivity":1.4,"music":0.6}');assert.equal(old.sensitivity,1.4);assert.equal(old.crosshairSize,1);assert.equal(old.crosshairOutline,true);assert.equal(old.uiTextScale,1);
 const selected=parseStoredSettings(JSON.stringify({...old,crosshairSize:1.45,crosshairOutline:false,uiTextScale:1.25}));assert.equal(selected.crosshairSize,1.45);assert.equal(selected.crosshairOutline,false);assert.equal(selected.uiTextScale,1.25);
 const invalid=parseStoredSettings('{"crosshairSize":999,"uiTextScale":-1,"crosshairOutline":"false","credential":"private"}');assert.equal(invalid.crosshairSize,1.75);assert.equal(invalid.uiTextScale,1);assert.equal(invalid.crosshairOutline,true);assert.equal('credential'in invalid,false);
});
