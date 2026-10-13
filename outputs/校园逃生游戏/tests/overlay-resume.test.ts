import test from 'node:test';
import assert from 'node:assert/strict';
import {OverlayResumeGate} from '../src/overlay-resume.ts';
test('nested panels delay resume and resume exactly once',()=>{const gate=new OverlayResumeGate(),api={};gate.request(api,true);assert.equal(gate.take(api,true),false);assert.equal(gate.take(api,false),true);assert.equal(gate.take(api,false),false);});
test('manual pause is not converted into automatic resume',()=>{const gate=new OverlayResumeGate(),api={};gate.request(api,false);assert.equal(gate.take(api,false),false);});
test('new engine cannot inherit an old panel resume',()=>{const gate=new OverlayResumeGate();gate.request({},true);assert.equal(gate.take({},false),false);});
test('background or portrait invalidates pending resume',()=>{const gate=new OverlayResumeGate(),api={};gate.request(api,true);gate.cancel();assert.equal(gate.take(api,false),false);});
