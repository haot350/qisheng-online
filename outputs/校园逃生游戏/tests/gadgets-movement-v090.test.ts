import test from 'node:test';
import assert from 'node:assert/strict';
import {EscapeMovement} from '../src/escape/movement.ts';

test('cards preserve the current stamina through sprinting and slide costs without refilling',()=>{
 const movement=new EscapeMovement();movement.stamina=36;const input={sprintHeld:true,moving:true,speed:6,grounded:true,routeSafe:true,staminaFree:true,direction:[0,-1] as [number,number]};
 const running=movement.update(29,input);assert.equal(running.stamina,36);assert.equal(running.sprinting,true);assert.equal(running.speed,6);
 const sliding=movement.update(0,{...input,slidePressed:true});assert.equal(sliding.stamina,36);assert.equal(sliding.sliding,true);movement.update(1,{...input,slidePressed:false});
 assert.equal(movement.update(1,{...input,staminaFree:false}).stamina,23.5);
});
test('cards do not revive an exhausted bar; normal rest still restores stamina',()=>{
 const movement=new EscapeMovement();movement.stamina=0;assert.equal(movement.update(.5,{sprintHeld:true,moving:true,speed:6,grounded:true,routeSafe:true,staminaFree:true}).sprinting,false);
 assert.ok(movement.update(2,{sprintHeld:false,moving:false,speed:0,grounded:true,routeSafe:true,staminaFree:true}).stamina>0);
});
