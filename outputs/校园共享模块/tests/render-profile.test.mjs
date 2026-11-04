import test from 'node:test';
import assert from 'node:assert/strict';
import {AdaptiveRenderQuality,resolveRenderProfile} from '../src/render-profile.ts';
import {applyRendererProfile} from '../../校园逃生游戏/src/render-quality.ts';

test('mobile high and ultra use full textures independently from controls; desktop high is preserved',()=>{
 const mobile={mobile:true,pixelRatio:3},desktop={mobile:false,pixelRatio:2};
 assert.deepEqual([resolveRenderProfile('high',mobile).pixelRatio,resolveRenderProfile('high',mobile).mobileTextures],[1.5,false]);
 assert.equal(resolveRenderProfile('ultra',mobile).pixelRatio,2);assert.equal(resolveRenderProfile('ultra',mobile).shadowSize,2048);
 assert.equal(resolveRenderProfile('high',desktop).pixelRatio,1.6);assert.equal(resolveRenderProfile('auto',mobile).mobileTextures,true);
});
test('live profile application disables shadows and releases the old shadow map when resizing',()=>{
 let ratio=0,disposed=0;const renderer={setPixelRatio:value=>ratio=value,shadowMap:{enabled:true,needsUpdate:false}},shadow={map:{dispose:()=>disposed++},mapSize:{x:1024,set(value){this.x=value;}}};
 applyRendererProfile(renderer,shadow,resolveRenderProfile('ultra',{mobile:true,pixelRatio:3}));
 assert.equal(ratio,2);assert.equal(shadow.mapSize.x,2048);assert.equal(shadow.map,null);assert.equal(disposed,1);
 applyRendererProfile(renderer,shadow,resolveRenderProfile('smooth',{mobile:true,pixelRatio:3}));
 assert.equal(renderer.shadowMap.enabled,false);assert.equal(renderer.shadowMap.needsUpdate,true);assert.equal(ratio,.8);
});
test('auto quality recovers only after sustained headroom; manual quality warns without degrading',()=>{
 const auto=new AdaptiveRenderQuality();for(let i=0;i<40;i++)auto.observe(.05,'auto');assert.equal(auto.scale,.9);
 for(let i=0;i<1100;i++)auto.observe(1/60,'auto');assert.ok(auto.scale>.9);
 const manual=new AdaptiveRenderQuality();let warnings=0;for(let i=0;i<260;i++)warnings+=Number(manual.observe(.05,'ultra').warn);
 assert.equal(manual.scale,1);assert.equal(warnings,1);
});
test('CPU-bound frames do not trigger repeated resolution cuts; GPU load does',()=>{
 const cpu=new AdaptiveRenderQuality(),gpu=new AdaptiveRenderQuality();
 for(let i=0;i<240;i++){cpu.observe(1/30,'auto',{cpuMs:24,gpuMs:5});gpu.observe(1/30,'auto',{cpuMs:4,gpuMs:28});}
 assert.equal(cpu.scale,1);assert.equal(cpu.bottleneck,'cpu');assert.ok(gpu.scale<1);assert.equal(gpu.bottleneck,'gpu');
});
test('thermal hints constrain automatic quality and leave manual settings unchanged',()=>{
 const auto=new AdaptiveRenderQuality(),manual=new AdaptiveRenderQuality();
 auto.observe(1/60,'auto',{thermalStatus:3});manual.observe(1/60,'ultra',{thermalStatus:3});
 assert.equal(auto.scale,.7);assert.equal(manual.scale,1);
 for(let i=0;i<180;i++)auto.observe(1/60,'auto',{thermalStatus:3});assert.equal(auto.scale,.7);
 for(let i=0;i<100;i++)manual.observe(1,'auto');assert.equal(manual.scale,1);
});
