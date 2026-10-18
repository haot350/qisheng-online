import test from 'node:test';
import assert from 'node:assert/strict';
import {WEATHER_PRESETS,WEATHER_VISUALS,isWeatherPreset,weatherState} from '../src/weather.ts';
test('weather accepts only three bounded visual presets and rejects malformed clock/seed',()=>{
 assert.deepEqual(WEATHER_PRESETS,['clear','overcast','light-rain']);
 for(const preset of WEATHER_PRESETS){assert.equal(isWeatherPreset(preset),true);const state=weatherState(preset,0xffffffff,1234);assert.deepEqual(state,{preset,seed:0xffffffff,startedAtTick:1234});assert(WEATHER_VISUALS[preset].ambientIntensity>=2.6);}
 for(const preset of ['night','storm','__proto__',null,{}])assert.throws(()=>weatherState(preset,1));
 for(const seed of [-1,NaN,Infinity,4294967296,1.5])assert.throws(()=>weatherState('clear',seed));
 assert.throws(()=>weatherState('clear',1,-1));
});
