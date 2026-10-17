import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateConfig,replay} from '../dist/validation.js';
import {RANKING_RULE_VERSION,DAFEI_RULE_VERSION,escapeScore} from '../dist/shared.js';
const sites=JSON.parse(readFileSync(new URL('../src/sites.json',import.meta.url),'utf8')),site=id=>sites.find(s=>s.id===id);
const roster=['meng','jiang','xu','luan','xutao','chengguotao','wangwenrui','wangdi','wangyuhan'];
const config={mode:'escape',ruleVersion:RANKING_RULE_VERSION,seed:1,weapon:'m4a1',controls:'keyboard',difficulty:'standard',roster,tasks:[{id:'take',kind:'take',label:'道路物资',duration:0,radius:2.4,sites:[site('sports-road')]},{id:'activate',kind:'activate',label:'启动设备',duration:0,radius:2.4,sites:[site('yard'),site('library-west')]},{id:'hold',kind:'hold',label:'守点',duration:15,radius:6,sites:[site('sports-north')]}]};
const event=(seq,t,action,kind='grenade',data={})=>({seq,t,order:seq,type:'gadget',data:{action,kind,...data}});
const summary=(extra={})=>({won:false,elapsed:5,controls:'keyboard',completed:0,downs:0,uniqueDowns:0,headshots:0,damage:0,score:10,...extra});
test('new escape needs nine names with Meng first; issued six-person credentials remain valid',()=>{
 assert.equal(validateConfig(config).roster.length,9);assert.throws(()=>validateConfig({...config,roster:roster.slice(0,6)}));assert.throws(()=>validateConfig({...config,roster:[...roster].reverse()}));
 const legacy={...config,ruleVersion:'campus-2026-0.7.0',roster:roster.slice(0,6)};assert.throws(()=>validateConfig(legacy));assert.equal(validateConfig(legacy,{allowLegacy:true}).roster.length,6);assert.equal(replay(legacy,[],summary()).summary.score,10);
 const drive={mode:'dafei',ruleVersion:DAFEI_RULE_VERSION,seed:1,weapon:'vehicle',controls:'keyboard',transmission:'auto',roster:['wangdi','wangwenrui','wangyuhan','meng'],tasks:[]};assert.equal(validateConfig(drive).roster.length,4);assert.throws(()=>validateConfig({...drive,ruleVersion:'dafei-2026-0.7.0'},{allowLegacy:true}));
});
test('gadget replay rejects inventory invention, over-capacity, double pickup and early grenade detonation',()=>{
 assert.throws(()=>replay(config,[event(1,0,'use','grenade',{id:'a'})],summary()));
 const pick=event(1,0,'pickup','grenade',{id:'loot1'});assert.throws(()=>replay(config,[pick,event(2,0,'pickup','grenade',{id:'loot1'})],summary()));
 assert.throws(()=>replay(config,[pick,event(2,0,'pickup','grenade',{id:'loot2'}),event(3,0,'pickup','grenade',{id:'loot3'})],summary()));
 assert.throws(()=>replay(config,[pick,event(2,0,'use','grenade',{id:'a'}),event(3,2,'explode','grenade',{id:'a'})],summary()));
});
test('two valid grenades can cause one non-headshot down without a fabricated bullet',()=>{
 const events=[event(1,0,'pickup','grenade',{id:'loot1'}),event(2,0,'pickup','grenade',{id:'loot2'}),event(3,0,'use','grenade',{id:'a'}),event(4,.1,'use','grenade',{id:'b'}),event(5,3,'explode','grenade',{id:'a'}),event(6,3,'hit','grenade',{id:'a',npcId:0,generation:0,damage:80}),event(7,3.1,'explode','grenade',{id:'b'}),event(8,3.1,'hit','grenade',{id:'b',npcId:0,generation:0,damage:40}),{seq:9,t:3.1,order:9,type:'down',data:{npcId:0,generation:0,identity:'meng',headshot:false,source:'grenade'}}];
 const result=replay(config,events,summary({score:12,downs:1,uniqueDowns:1}));assert.equal(result.summary.downs,1);assert.equal(result.summary.headshots,0);assert.equal(result.summary.score,12);
 const duplicate=[...events.slice(0,6),{...events[5],seq:7,order:7}];assert.throws(()=>replay(config,duplicate,summary()));
});
test('cards cannot stack and confiscation damage requires an actual still-active use',()=>{
 const events=[event(1,0,'pickup','cards',{id:'cards-1'}),event(2,0,'use','cards',{use:1}),event(3,2,'confiscated','cards',{use:1}),{seq:4,t:2,order:4,type:'damage',data:{amount:50,source:'cards',health:50}}];
 const score=escapeScore({won:false,difficulty:'standard',elapsed:5,completed:0,uniqueDowns:0,headshots:0,damage:50}).score;assert.equal(replay(config,events,summary({damage:50,score})).summary.damage,50);
 assert.throws(()=>replay(config,[event(1,0,'confiscated','cards',{use:1})],summary()));
 assert.throws(()=>replay(config,[events[0],events[1],event(3,1,'pickup','cards',{id:'cards-2'}),event(4,2,'use','cards',{use:2})],summary()));
 assert.throws(()=>replay(config,[events[0],events[1],event(3,31,'confiscated','cards',{use:1})],summary({elapsed:32})));
});
