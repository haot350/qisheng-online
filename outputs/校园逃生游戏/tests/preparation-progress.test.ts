import assert from 'node:assert/strict';
import test from 'node:test';
import { PreparationProgress } from '../src/preparation-progress.ts';

test('parallel completions do not hide unfinished campus work or regress the total', () => {
  const reports: [number, string][] = [];
  const progress = new PreparationProgress([{id:'map',label:'下载校园'},{id:'people',label:'准备人物与装备'},{id:'gpu',label:'准备场景'}], (value,label) => reports.push([value,label]));
  progress.update('people',1);
  assert.match(reports.at(-1)![1], /下载校园/);
  progress.update('map',.6,'下载校园 3/5 MB');
  const high = reports.at(-1)![0];
  progress.update('map',.2);
  assert.equal(reports.at(-1)![0],high);
  progress.update('map',1);
  assert.match(reports.at(-1)![1], /准备场景/);
  assert.ok(reports.at(-1)![0] < 1);
  progress.update('gpu',1);
  assert.deepEqual(reports.at(-1),[1,'准备完成']);
});

test('timings retain unfinished work instead of claiming success', () => {
  let now = 0;
  const progress = new PreparationProgress([{id:'map',label:'下载校园'},{id:'gpu',label:'准备场景'}],()=>{},()=>now);
  progress.update('map',0);
  now = 25;progress.update('map',1);
  now = 70;
  assert.deepEqual(progress.timings(),[{label:'下载校园',durationMs:25,complete:true},{label:'准备场景',durationMs:0,complete:false}]);
});
