import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameLoadingGate } from '../src/multiplayer/loading-gate.ts';
const identity={epoch:4,generation:7};
const ready={blocked:false,failed:false,combatReady:true};
const blocked={blocked:true,failed:false,combatReady:false};
const rig=()=>{const reports:{epoch:number;ready:boolean;scopeReady:boolean}[]=[];return{reports,gate:new FrameLoadingGate(report=>{reports.push({...report});})};};
test('ready may only be released after the final exact view and every substep agree',()=>{
 const{gate,reports}=rig();const token=gate.begin(identity);
 assert.equal(gate.observe(token,ready).blocked,true);assert.deepEqual(reports,[]);
 gate.observe(token,ready);assert.equal(gate.finish(token,identity,0).blocked,false);
 assert.deepEqual(reports,[{epoch:4,ready:true,scopeReady:true}]);
});
test('600 frames with coarse ready and exact blocked emit one restriction, never 120Hz flips',()=>{
 const{gate,reports}=rig();for(let i=0;i<600;i++){const token=gate.begin(identity);gate.observe(token,ready);gate.observe(token,blocked);assert.equal(gate.finish(token,identity,i*1000/60).blocked,true);}
 assert.deepEqual(reports,[{epoch:4,ready:false,scopeReady:false}]);
 const token=gate.begin(identity);assert.equal(gate.observe(token,ready).blocked,true);assert.equal(reports.length,1);gate.observe(token,ready);assert.equal(gate.finish(token,identity,10001).blocked,false);assert.equal(reports.length,2);
});
test('precheck or any movement substep blocked cannot be undone by a ready render in that frame',()=>{
 const{gate,reports}=rig();let token=gate.begin(identity);gate.observe(token,ready);gate.finish(token,identity,0);
 token=gate.begin(identity);gate.observe(token,ready);gate.observe(token,blocked);assert.equal(reports.at(-1)?.ready,false);gate.observe(token,ready);assert.equal(gate.finish(token,identity,16).blocked,true);assert.equal(reports.filter(r=>r.ready).length,1);
});
test('scope restriction is immediate but its recovery waits for all views in the final frame',()=>{
 const{gate,reports}=rig();let token=gate.begin(identity);gate.observe(token,ready);gate.finish(token,identity,0);
 token=gate.begin(identity);gate.observe(token,{...ready,combatReady:false});assert.deepEqual(reports.at(-1),{epoch:4,ready:true,scopeReady:false});gate.observe(token,ready);assert.equal(gate.finish(token,identity,16).scopeReady,false);
 token=gate.begin(identity);assert.equal(gate.observe(token,ready).scopeReady,false);gate.observe(token,ready);assert.equal(gate.finish(token,identity,32).scopeReady,true);
});
test('a cancelled, dead-life generation or obsolete loading frame cannot release the current gate',()=>{
 const{gate,reports}=rig();const token=gate.begin(identity);gate.observe(token,ready);gate.invalidate();assert.equal(gate.finish(token,identity,0).blocked,true);assert.equal(reports.length,0);
 const next={epoch:5,generation:8},newToken=gate.begin(next);gate.observe(newToken,blocked);assert.equal(gate.finish(token,identity,1).blocked,true);assert.equal(reports.at(-1)?.epoch,5);gate.observe(newToken,ready);assert.equal(gate.finish(newToken,next,2).blocked,true);
 const again=gate.begin(next);gate.observe(again,ready);gate.cancelFrame();assert.equal(gate.finish(again,next,3).blocked,true);assert.equal(reports.filter(r=>r.ready).length,0);
});
test('server loading budget retry waits then sends a freshly verified ready report without deadlock',()=>{
 const{gate,reports}=rig();let token=gate.begin(identity);gate.observe(token,ready);gate.finish(token,identity,0);assert.equal(gate.retry(3,100,1),false);assert.equal(gate.retry(4,100,1),true);
 for(const now of [2,50,100]){token=gate.begin(identity);gate.observe(token,ready);assert.equal(gate.finish(token,identity,now).blocked,true);}
 assert.equal(reports.length,1);token=gate.begin(identity);gate.observe(token,ready);assert.equal(gate.finish(token,identity,101).blocked,false);assert.equal(reports.length,2);
 assert.equal(gate.retry(4,100,102),true);token=gate.begin(identity);gate.observe(token,blocked);assert.equal(gate.finish(token,identity,205).blocked,true);assert.equal(reports.at(-1)?.ready,false);
 token=gate.begin(identity);gate.observe(token,ready);assert.equal(gate.finish(token,identity,206).blocked,false);assert.equal(reports.at(-1)?.ready,true);
});
test('a disconnected send is retried only from a new final complete frame',()=>{
 const reports:unknown[]=[];let open=false;const gate=new FrameLoadingGate(report=>{if(!open)return false;reports.push(report);return true;});let token=gate.begin(identity);gate.observe(token,ready);gate.finish(token,identity,0);assert.equal(reports.length,0);open=true;token=gate.begin(identity);gate.observe(token,ready);assert.equal(reports.length,0);gate.finish(token,identity,16);assert.equal(reports.length,1);
});
