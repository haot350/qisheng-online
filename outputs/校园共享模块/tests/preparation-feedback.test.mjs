import test from 'node:test';
import assert from 'node:assert/strict';
import {safePreparationSummary} from '../dist/connection-summary.js';
import {selectedFeedbackDiagnostics} from '../dist/community/feedback-submission.js';
const entry={code:'PREP_DOWNLOAD_NETWORK',stage:'download',mode:'escape',quality:'auto',generation:3,resourceHash:'a'.repeat(64),atMs:52};
test('preparation trace is opt-in and independent from connection-only consent',()=>{
 const diagnostics={version:'0.13.3',preparation:{events:[entry]}};
 assert.equal(selectedFeedbackDiagnostics(diagnostics,undefined,{includeDiagnostics:false,includeConnection:true}),undefined);
 assert.deepEqual(selectedFeedbackDiagnostics(diagnostics,undefined,{includeDiagnostics:true,includeConnection:false}),diagnostics);
});
test('trace rejects free text and private URLs while bounding its size',()=>{
 const result=safePreparationSummary({events:Array.from({length:40},(_,atMs)=>({...entry,atMs,token:'private',url:'/api/v1/npc-assets/private',quality:'private-token'}))});
 assert.equal(result.events.length,32);assert.equal(result.events[0].atMs,8);
 for(const row of result.events){assert.equal(row.url,undefined);assert.equal(row.token,undefined);assert.equal(row.quality,undefined);}
 assert.equal(safePreparationSummary({events:[{...entry,code:'user-secret'},{...entry,stage:'https://private'},{...entry,atMs:Infinity}]}),undefined);
});
