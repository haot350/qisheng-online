import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreboardView,sameScoreboard,scoreboardNetwork,rosterPing} from '../src/multiplayer/scoreboard-state.ts';
import {connectionQuality} from '../src/multiplayer/connection-quality.ts';
import {bindScoreboardKeyboard} from '../src/multiplayer/scoreboard-input.ts';
import type {PublicRosterEntry} from '../src/multiplayer/shared/wire.ts';
const member=(id:string,changes:Partial<PublicRosterEntry>={})=>({id,nickname:id,shortId:id,avatar:'campus-a',team:'blue',ready:true,rankConsent:false,connected:true,loading:false,life:'alive',weapon:'m4a1',kills:0,deaths:0,assists:0,downs:0,headshots:0,ping:36,...changes} as PublicRosterEntry);
const base={roomId:'round-1',mode:'pvp',variant:'ffa',remaining:60.7,teamScores:{blue:4,red:3}} as const;
test('full public roster stays present without reading hidden entity health or location',()=>{
 const hidden=member('hidden');Object.defineProperty(hidden,'health',{get(){throw Error('private health read');}});Object.defineProperty(hidden,'position',{get(){throw Error('private location read');}});
 const roster=[member('me'),hidden],view=scoreboardView(base,roster,'me');assert.equal(view.groups[0].rows.length,2);assert.equal(view.groups[0].rows.find(p=>p.id==='me')?.self,true);assert.equal('health' in view.groups[0].rows[1],false);assert.equal('position' in view.groups[0].rows[1],false);assert.deepEqual(roster.map(p=>p.id),['me','hidden']);
});
test('FFA rank and equal ranks match kills, deaths and stable ID ordering',()=>{
 const view=scoreboardView(base,[member('c',{kills:4,deaths:2}),member('b',{kills:5,deaths:2,assists:99}),member('a',{kills:5,deaths:2}),member('d',{kills:5,deaths:3})],'a');assert.deepEqual(view.groups[0].rows.map(p=>[p.id,p.rank]),[['a',1],['b',1],['d',3],['c',4]]);
});
test('cooperative columns use NPC downs, assists and headshots',()=>{
 const view=scoreboardView({...base,mode:'coop'},[member('a',{kills:9,downs:2,assists:3,headshots:1})],'a');assert.equal(view.mode,'coop');assert.deepEqual(view.groups[0].rows[0].values,[2,3,1]);assert.equal(view.groups[0].rows[0].rank,null);
});
test('team view preserves all teams, reconnect seats and departing records',()=>{
 const view=scoreboardView({...base,variant:'tdm'},[member('a',{connected:false}),member('b',{team:'red',loading:true}),member('c',{team:'none',departed:true})],'a');assert.deepEqual(view.groups.map(g=>[g.id,g.score]),[['blue',4],['red',3],['none',null]]);assert.deepEqual(view.groups.map(g=>g.rows[0].status),['重连中','载入中','已离场']);
});
test('only displayed fields invalidate a sampled scoreboard',()=>{
 const roster=[member('a')],first=scoreboardView(base,roster,'a');assert.equal(sameScoreboard(first,scoreboardView({...base,remaining:60.4},[{...roster[0],health:1}],'a')),true);assert.equal(sameScoreboard(first,scoreboardView(base,[{...roster[0],kills:1}],'a')),false);assert.equal(sameScoreboard(first,scoreboardView({...base,roomId:'new'},roster,'a')),false);assert.equal(sameScoreboard(first,scoreboardView({...base,remaining:59.9},roster,'a')),false);
});
test('server and local RTT ceilings remain distinct and unknown values stay unknown',()=>{
 assert.deepEqual([0,NaN,499,500,900].map(rosterPing),['—','—','499 ms','≥500 ms','≥500 ms']);
 const d={rttMs:750,jitterMs:0,snapshotAgeMs:50,bufferedBytes:0} as any;assert.equal(scoreboardNetwork(d).rtt,'750 ms');assert.equal(scoreboardNetwork({...d,rttMs:1000}).rtt,'≥1000 ms');assert.equal(scoreboardNetwork(d,false).rtt,'—');assert.equal(scoreboardNetwork(d).jitter,'0 ms');assert.equal(scoreboardNetwork().label,'等待连接数据');
});
test('connection labels share existing indicator thresholds without synthetic loss metrics',()=>{
 const d={rttMs:100,jitterMs:2,snapshotAgeMs:40,bufferedBytes:0} as any;for(const value of [d,{...d,rttMs:310},{...d,bufferedBytes:70000},{...d,snapshotAgeMs:650}]){assert.equal(scoreboardNetwork(value).label,connectionQuality(value).label);assert.equal(scoreboardNetwork(value).poor,connectionQuality(value).poor);}assert.equal('loss' in scoreboardNetwork(d),false);
});
class Doc extends EventTarget{hidden=false;body={tagName:'BODY'} as Element;activeElement:Element|null={tagName:'CANVAS'} as Element;pointerLockElement:Element|null=null;}
const key=(win:EventTarget,type:string,changes:Record<string,unknown>={})=>{const e=Object.assign(new Event(type,{cancelable:true}),{code:'Tab',repeat:false,...changes});win.dispatchEvent(e);return e;};
test('Tab hold/release, background and blur close without pausing or leaving listeners',()=>{
 const win=new EventTarget(),doc=new Doc(),events:boolean[]=[];const off=bindScoreboardKeyboard(v=>events.push(v),{win:win as any,doc:doc as any});assert.equal(key(win,'keydown').defaultPrevented,true);key(win,'keydown',{repeat:true});assert.deepEqual(events,[true]);key(win,'keyup');key(win,'keydown');win.dispatchEvent(new Event('blur'));key(win,'keydown',{repeat:true});assert.deepEqual(events,[true,false,true,false]);key(win,'keydown');doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.deepEqual(events,[true,false,true,false,true,false]);off();doc.hidden=false;key(win,'keydown');assert.equal(events.length,6);
});
test('menu, input and modifier Tab retain ordinary focus navigation',()=>{
 const win=new EventTarget(),doc=new Doc(),events:boolean[]=[];let enabled=false;const off=bindScoreboardKeyboard(v=>events.push(v),{win:win as any,doc:doc as any,enabled:()=>enabled});assert.equal(key(win,'keydown').defaultPrevented,false);enabled=true;doc.activeElement={tagName:'INPUT'} as Element;assert.equal(key(win,'keydown').defaultPrevented,false);doc.activeElement={tagName:'BUTTON'} as Element;assert.equal(key(win,'keydown').defaultPrevented,false);doc.activeElement={tagName:'CANVAS'} as Element;for(const modifier of ['ctrlKey','metaKey','altKey'])assert.equal(key(win,'keydown',{[modifier]:true}).defaultPrevented,false);assert.deepEqual(events,[]);off();
});
