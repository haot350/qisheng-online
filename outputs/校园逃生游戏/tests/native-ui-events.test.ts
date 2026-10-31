import test from 'node:test';
import assert from 'node:assert/strict';
import {bindNativeUIEvents} from '../src/native-ui-events.ts';

test('system back acknowledges only a UI action actually consumed by the game',()=>{
  const target=new EventTarget();let consumed=false,acknowledged=0;
  const release=bindNativeUIEvents(target,{background(){},resume(){},back:()=>consumed});
  const back=()=>target.dispatchEvent(new CustomEvent('qisheng:native-back',{detail:{handle(){acknowledged++;}}}));
  back();assert.equal(acknowledged,0);
  consumed=true;back();assert.equal(acknowledged,1);
  release();back();assert.equal(acknowledged,1);
});

test('foreground notification is separate from pause, and all listeners are released',()=>{
  const target=new EventTarget(),actions:string[]=[];
  const release=bindNativeUIEvents(target,{background:()=>actions.push('clear-and-pause'),resume:()=>actions.push('refresh-only'),back:()=>false});
  target.dispatchEvent(new Event('qisheng:native-background'));
  target.dispatchEvent(new Event('qisheng:native-resume'));
  assert.deepEqual(actions,['clear-and-pause','refresh-only']);
  release();target.dispatchEvent(new Event('qisheng:native-background'));target.dispatchEvent(new Event('qisheng:native-resume'));
  assert.deepEqual(actions,['clear-and-pause','refresh-only']);
});
