import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,nextResolve){if(context.parentURL?.includes('/src/')&&specifier.startsWith('./')&&!/\.(ts|tsx|json)$/.test(specifier))return nextResolve(specifier+'.ts',context);return nextResolve(specifier,context);}});
const {DEFAULT_SETTINGS,parseStoredSettings}=await import('../src/types.ts');


test('old preferences retain their settings and default to automatic transmission without a migration',()=>{
 const old={sensitivity:1.4,fov:70,music:.6,sfx:.8,quality:'smooth',controls:'touch',headBob:false,recoilShake:false,aimAssist:false,realityHints:true};
 assert.deepEqual(parseStoredSettings(JSON.stringify(old)),{...DEFAULT_SETTINGS,onlinePing:false,escapeTouchLayout:undefined,...old,transmission:'auto',escapeDifficulty:'standard',escapeMusic:'battle'});
 assert.deepEqual(parseStoredSettings(null),{...DEFAULT_SETTINGS,onlinePing:false,escapeTouchLayout:undefined});
});

test('manual transmission roundtrips with local preferences and cannot introduce unknown settings',()=>{
 const manual={...DEFAULT_SETTINGS,onlinePing:false,escapeTouchLayout:undefined,transmission:'manual' as const,music:0};
 assert.deepEqual(parseStoredSettings(JSON.stringify(manual)),manual);
 assert.equal(parseStoredSettings(JSON.stringify({...manual,transmission:'auto'})).transmission,'auto');
 assert.equal('privateField' in parseStoredSettings(JSON.stringify({...manual,privateField:'unused'})),false);
});

test('invalid stored transmission and enum values consistently select automatic defaults',()=>{
 for(const transmission of ['AUTO','Manual','sport',1,true,null,{},[]])assert.equal(parseStoredSettings(JSON.stringify({transmission})).transmission,'auto');
 const invalid=parseStoredSettings(JSON.stringify({quality:'ultra',controls:'unknown',transmission:'reverse'}));assert.equal(invalid.quality,'auto');assert.equal(invalid.controls,'auto');assert.equal(invalid.transmission,'auto');
 for(const raw of ['null','[]','false','123','"manual"','{broken'])assert.deepEqual(parseStoredSettings(raw),{...DEFAULT_SETTINGS,onlinePing:false,escapeTouchLayout:undefined});
});

test('preference loading accepts finite ranges and boolean flags without casting invalid values',()=>{
 const actual=parseStoredSettings(JSON.stringify({sensitivity:99,fov:0,music:-3,sfx:4,headBob:'false',recoilShake:0,aimAssist:null,realityHints:'true'}));
 assert.equal(actual.sensitivity,2);assert.equal(actual.fov,50);assert.equal(actual.music,0);assert.equal(actual.sfx,1);assert.equal(actual.headBob,true);assert.equal(actual.recoilShake,true);assert.equal(actual.aimAssist,true);assert.equal(actual.realityHints,false);
 const nonNumbers=parseStoredSettings('{"sensitivity":null,"fov":"60","music":1e999,"sfx":null}');assert.equal(nonNumbers.sensitivity,1);assert.equal(nonNumbers.fov,60);assert.equal(nonNumbers.music,.38);assert.equal(nonNumbers.sfx,.75);
});
test('escape preferences default independently and accept only approved difficulty and music',()=>{
 const old=parseStoredSettings(JSON.stringify({transmission:'manual',music:.5}));assert.equal(old.escapeDifficulty,'standard');assert.equal(old.escapeMusic,'battle');assert.equal(old.transmission,'manual');
 for(const escapeDifficulty of ['easy','standard','hard'] as const)for(const escapeMusic of ['battle','run','off'] as const){const actual=parseStoredSettings(JSON.stringify({escapeDifficulty,escapeMusic}));assert.equal(actual.escapeDifficulty,escapeDifficulty);assert.equal(actual.escapeMusic,escapeMusic);}
 for(const value of ['unknown',null,42,{},[]]){const actual=parseStoredSettings(JSON.stringify({escapeDifficulty:value,escapeMusic:value}));assert.equal(actual.escapeDifficulty,'standard');assert.equal(actual.escapeMusic,'battle');}
});

test('desktop controls are a valid explicitly selected preference',()=>{const stored=parseStoredSettings(JSON.stringify({controls:'desktop'}));assert.equal(stored.controls,'desktop');assert.equal(stored.transmission,'auto');});
