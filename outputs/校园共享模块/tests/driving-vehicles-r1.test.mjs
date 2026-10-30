import test from 'node:test';import assert from 'node:assert/strict';
import {drivingRuleVersion,drivingRankingRules,drivingVehicleId,RankingDriveScore,DAFEI_RULE_VERSION} from '../dist/ranking.js';
test('archived runs remain cars and new vehicles get compatible separate rules',()=>{
 assert.equal(drivingVehicleId(undefined),'bao5');assert.equal(drivingRuleVersion('bao5'),DAFEI_RULE_VERSION);
 assert.equal(drivingRankingRules(drivingRuleVersion('tank'),'tank').durability,800);
 assert.equal(drivingRankingRules(drivingRuleVersion('tank'),'tank').repairAmount,400);
 assert.equal(drivingRankingRules(drivingRuleVersion('scooter'),'scooter').repairAmount,80);
 assert.equal(drivingRankingRules(DAFEI_RULE_VERSION,'tank'),undefined);
});
test('cannon and collision share combo while preserving collision achievement counts',()=>{
 const score=new RankingDriveScore(drivingRankingRules(drivingRuleVersion('tank'),'tank'));
 assert.equal(score.hit(0,1,'cannon'),100);assert.equal(score.hit(1,2,'collision'),200);
 assert.equal(score.hits,1);assert.equal(score.cannonHits,1);assert.equal(score.totalHits,2);assert.equal(score.bestCombo,2);
 score.resetCar();assert.equal(score.score,250);assert.equal(score.combo,0);
});
