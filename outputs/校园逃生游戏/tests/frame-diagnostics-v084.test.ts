import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameDiagnostics} from '../src/frame-diagnostics.ts';
test('visible one-second stalls remain measurable while explicit background intervals are excluded',()=>{let clock=0;const frames=new FrameDiagnostics(10,()=>clock);frames.begin(100);frames.end();clock=1200;frames.begin(1300);frames.end();assert.equal(frames.snapshot().frameIntervalMs.max,1200);assert.equal(frames.snapshot().longFrames,1);frames.begin(1400,false);frames.begin(100000,true);frames.begin(100016,true);assert.equal(frames.snapshot().frameIntervalMs.max,1200);assert.equal(frames.snapshot().frameIntervalMs.samples,2);});
