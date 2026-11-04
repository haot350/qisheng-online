import test from 'node:test';
import assert from 'node:assert/strict';
import {freezeLaunch, launchMatches} from '../src/launch-intent.ts';
import {DEFAULT_SETTINGS} from '../src/types.ts';

test('a launch retains the submitted equipment and settings after draft changes',()=>{
  const draft={mode:'escape' as const,primary:'ak47' as const,practice:false,settings:structuredClone(DEFAULT_SETTINGS),identity:'first'};
  const request=freezeLaunch(1,draft);
  assert.equal(launchMatches(request,draft),true);
  draft.settings.weather='rain';
  assert.notEqual(request.settings.weather,'rain');
  assert.equal(request.loadout?.primary,'ak47');
  assert.equal(launchMatches(request,draft),false);
});
test('identity changes invalidate the pending launch',()=>{
  const selection={mode:'roam' as const,primary:'m4a1' as const,practice:false,settings:DEFAULT_SETTINGS,identity:'first'};
  assert.equal(launchMatches(freezeLaunch(1,selection),{...selection,identity:'second'}),false);
  assert.equal(launchMatches(freezeLaunch(1,selection),{...selection,identity:null}),false);
});
test('practice and story continuation retain their own launch intent',()=>{
  const selection={mode:'escape' as const,primary:'ak47' as const,practice:true,settings:DEFAULT_SETTINGS,identity:null};
  assert.deepEqual(freezeLaunch(1,selection).loadout,{primary:'m4a1',difficulty:'easy',training:true});
  assert.equal(freezeLaunch(2,{...selection,mode:'story',resumeStory:true}).resumeStory,true);
});
