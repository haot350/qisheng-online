import test from 'node:test';
import assert from 'node:assert/strict';
import {hasImmutableNativeCache} from '../scripts/native-release-policy.mjs';
test('native immutable response policy accepts reordered directives but rejects private or short caching',()=>{
 for(const value of ['public, max-age=31536000, immutable','public, immutable, max-age=31536000','Public, Immutable, max-age=31536000'])assert.equal(hasImmutableNativeCache(value),true);
 for(const value of ['public, max-age=60, immutable','private, max-age=31536000, immutable','public, no-store, immutable, max-age=31536000',null])assert.equal(hasImmutableNativeCache(value),false);
});
