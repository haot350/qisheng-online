import {test} from 'node:test';
import assert from 'node:assert/strict';
import {protectOptionalRecords} from '../scripts/lock-protection.mjs';
test('preserves Linux optional records pruned on Windows',()=>{const entry={version:'1.11.3',resolved:'https://registry.npmjs.org/@emnapi/core/-/core-1.11.3.tgz',optional:true};assert.deepEqual(protectOptionalRecords({packages:{'node_modules/@emnapi/core':entry}},{packages:{}}).packages['node_modules/@emnapi/core'],entry);});
test('does not replace new records or retain placeholders',()=>{const next=protectOptionalRecords({packages:{x:{version:'1',resolved:'url',optional:true}}},{packages:{x:{version:'2',resolved:'new',optional:true},y:{optional:true}}});assert.equal(next.packages.x.version,'2');assert.equal(next.packages.y,undefined);});
