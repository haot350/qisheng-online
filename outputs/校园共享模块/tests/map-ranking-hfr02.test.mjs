import test from 'node:test';
import assert from 'node:assert/strict';
import {RANKING_RULE_VERSION,DAFEI_RULE_VERSION,COOP_RULE_VERSION,LEGACY_ESCAPE_RULE_VERSION,LEGACY_DAFEI_RULE_VERSION,DAFEI_VEHICLE_RULE_VERSION,MAP_CATALOG_ID,LEGACY_MAP_CATALOG_ID,rankingRuleSupported,rankingRuleCapabilities,rankingRuleVersionForCatalog,coopRuleVersionForCatalog,drivingRuleVersion,drivingRankingRules,drivingBestKey,drivingOldBestKeys} from '../dist/ranking.js';

test('HF map keeps combat capabilities and uses a distinct record scope',()=>{
 assert.equal(RANKING_RULE_VERSION,'campus-hfr02-1');
 assert.equal(COOP_RULE_VERSION,'coop-hfr02-1');
 assert.equal(DAFEI_RULE_VERSION,'dafei-hfr02-1');
 const current=rankingRuleCapabilities('escape',RANKING_RULE_VERSION),previous=rankingRuleCapabilities('escape',LEGACY_ESCAPE_RULE_VERSION);
 assert.deepEqual(current,{mapCatalogId:MAP_CATALOG_ID,rosterSize:9,expandedRoster:true,gadgets:true,initialMeng:true});
 assert.deepEqual({...previous,mapCatalogId:MAP_CATALOG_ID},current);
 assert.equal(previous.mapCatalogId,LEGACY_MAP_CATALOG_ID);
 assert.equal(rankingRuleCapabilities('escape','campus-2026-0.7.0').rosterSize,6);
 assert.equal(rankingRuleCapabilities('escape','campus-2026-0.7.0').gadgets,false);
 assert.equal(rankingRuleCapabilities('escape','unknown'),undefined);
});

test('all vehicle boards use the new map while archived credentials keep their tuning',()=>{
 for(const [id,durability]of [['bao5',400],['tank',800],['scooter',160]]){
  assert.equal(drivingRuleVersion(id),DAFEI_RULE_VERSION);
  assert.equal(drivingRankingRules(DAFEI_RULE_VERSION,id).durability,durability);
  assert.equal(rankingRuleCapabilities('dafei',DAFEI_RULE_VERSION,id).mapCatalogId,MAP_CATALOG_ID);
  assert.ok(drivingOldBestKeys(id).length);assert.ok(!drivingOldBestKeys(id).includes(drivingBestKey(id)));
 }
 assert.equal(drivingRankingRules(LEGACY_DAFEI_RULE_VERSION,'bao5').durability,400);
 assert.equal(drivingRankingRules(DAFEI_VEHICLE_RULE_VERSION,'tank').durability,800);
 assert.equal(drivingRankingRules(DAFEI_VEHICLE_RULE_VERSION,'scooter').durability,160);
 assert.equal(rankingRuleSupported('dafei',LEGACY_DAFEI_RULE_VERSION,'tank'),false);
 assert.equal(rankingRuleSupported('dafei',DAFEI_VEHICLE_RULE_VERSION,'bao5'),false);
 assert.equal(new Set(['bao5','tank','scooter'].map(drivingBestKey)).size,3);
});

test('compatible rollback selects old-map defaults without rejecting new-map history',()=>{
 assert.equal(rankingRuleVersionForCatalog('escape',LEGACY_MAP_CATALOG_ID),LEGACY_ESCAPE_RULE_VERSION);
 assert.equal(rankingRuleVersionForCatalog('dafei',LEGACY_MAP_CATALOG_ID,'bao5'),LEGACY_DAFEI_RULE_VERSION);
 assert.equal(rankingRuleVersionForCatalog('dafei',LEGACY_MAP_CATALOG_ID,'tank'),DAFEI_VEHICLE_RULE_VERSION);
 assert.equal(coopRuleVersionForCatalog(MAP_CATALOG_ID),COOP_RULE_VERSION);
 assert.equal(coopRuleVersionForCatalog(LEGACY_MAP_CATALOG_ID),'coop-2026-0.9.0');
 assert.equal(rankingRuleVersionForCatalog('escape','unknown-map'),undefined);
 assert.equal(rankingRuleSupported('escape',RANKING_RULE_VERSION),true);
});
