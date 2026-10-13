import test from 'node:test';
import assert from 'node:assert/strict';
import {RankingClient} from '../dist/community/client.js';
import {ACHIEVEMENTS,eligibleAchievementIds} from '../dist/achievements.js';
const storage=new Map();
globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
const sessionKey='qisheng-ranking-session-v1';
const response=(value,status=200)=>({ok:status<400,status,json:async()=>value});
const player=id=>({id,nickname:id,shortId:id,renameAt:0,autoSubmit:false,restricted:false,accountStatus:'active'});
const auth=id=>({token:'token-'+id,expiresAt:123,player:player(id),account:{username:id,avatar:'initials',publicProfile:true,syncStats:true,featuredAchievements:[]}});
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};}

test('a late sign-in is revoked after logout and never restores its session',async()=>{
 storage.clear();const pending=deferred(),revoked=[];
 const client=new RankingClient('',async(url,options)=>{if(url.endsWith('/accounts/login'))return pending.promise;if(url.endsWith('/identity/logout')){revoked.push(options.headers.Authorization);return response({ok:true});}throw Error('unexpected request');});
 const login=client.login('alpha','a long test password');const failure=assert.rejects(login,{code:'CANCELLED'});await client.logout();pending.resolve(response(auth('alpha')));await failure;
 assert.equal(client.getPlayer(),null);assert.equal(storage.get(sessionKey),undefined);assert.deepEqual(revoked,['Bearer token-alpha']);
});
test('a previous account private response is discarded after account switching',async()=>{
 storage.clear();const privateResponse=deferred();
 const client=new RankingClient('',async(url,options)=>url.endsWith('/accounts/profile')?privateResponse.promise:response(auth(JSON.parse(options.body).username)));
 await client.login('alpha','a long test password');const privateRead=client.profile(),failure=assert.rejects(privateRead,{code:'CANCELLED'});await client.login('beta','another long password');privateResponse.resolve(response({secret:'alpha'}));await failure;
 assert.equal(client.getPlayer().id,'beta');assert.equal(storage.get(sessionKey),'token-beta');
});
test('a failed logout-all preserves the credential needed for retry',async()=>{
 storage.clear();const client=new RankingClient('',async url=>url.endsWith('/accounts/logout-all')?response({error:{code:'NETWORK',message:'retry'}},503):response(auth('alpha')));
 await client.login('alpha','a long test password');await assert.rejects(client.logout(true));assert.equal(client.getPlayer().id,'alpha');assert.equal(storage.get(sessionKey),'token-alpha');
});
test('legacy reads retain the old token and upgrade deferral is local to that identity',async()=>{
 storage.clear();storage.set(sessionKey,'old-token');const legacy={...player('old'),accountStatus:'legacy',needsUpgrade:true};
 const client=new RankingClient('',async()=>response({player:legacy,account:null}));await client.me();assert.equal(client.getPlayer().accountStatus,'legacy');assert.equal(client.getAccount(),null);assert.equal(storage.get(sessionKey),'old-token');assert.equal(client.isUpgradeDeferred(),false);client.deferUpgrade();assert.equal(client.isUpgradeDeferred(),true);
});
test('the canonical catalogue contains 24 unique achievements and respects unknown history',()=>{
 assert.equal(ACHIEVEMENTS.length,24);assert.equal(new Set(ACHIEVEMENTS.map(row=>row.id)).size,24);
 for(const mode of ['escape','coop','pvp','dafei'])assert.equal(ACHIEVEMENTS.filter(row=>row.mode===mode).length,6);
 const oldDrive={mode:'dafei',won:true,elapsed:300};assert.deepEqual(eligibleAchievementIds(oldDrive),['drive-finish']);
 assert.ok(eligibleAchievementIds({...oldDrive,resetCount:0}).includes('drive-clean'));
 assert.ok(!eligibleAchievementIds({...oldDrive,elapsed:299.97}).includes('drive-finish'));
 assert.ok(!eligibleAchievementIds({mode:'pvp',variant:'ffa',won:true,elapsed:300}).includes('pvp-ffa'));
 assert.ok(eligibleAchievementIds({mode:'pvp',variant:'ffa',rank:1,won:true,elapsed:300}).includes('pvp-ffa'));
});
