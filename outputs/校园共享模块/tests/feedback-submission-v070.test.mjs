import test from 'node:test';
import assert from 'node:assert/strict';
import {feedbackSubmission} from '../dist/community/feedback-submission.js';
import {rankingRuleSupported,rankingRuleVersion,DRIVE_RANKING_RULES,DAFEI_OLD_BEST_KEYS} from '../dist/ranking.js';
test('feedback retry preserves its operation, changed draft or identity obtains another',()=>{
 let serial=0;const random=()=>String(++serial),body={title:'问题',message:'同一内容'};
 const first=feedbackSubmission(null,'alice',body,random);
 assert.equal(feedbackSubmission(first,'alice',{...body},random),first);
 assert.notEqual(feedbackSubmission(first,'bob',body,random).token,first.token);
 assert.notEqual(feedbackSubmission(first,'alice',{...body,message:'新内容'},random).token,first.token);
});
test('new boards retain all previously issued rule versions',()=>{
 assert.equal(rankingRuleVersion('escape'),'campus-2026-0.7.0');
 assert.equal(rankingRuleVersion('dafei'),'dafei-2026-0.7.0');
 assert.equal(rankingRuleSupported('escape','campus-2026-0.4.0'),true);
 for(const version of ['campus-2026-0.4.0','dafei-2026-0.6.5','dafei-2026-0.7.0'])assert.ok(DRIVE_RANKING_RULES[version]);
 assert.equal(rankingRuleSupported('escape','unrecognized'),false);
 assert.ok(DAFEI_OLD_BEST_KEYS.includes('qisheng-game-dafei-best:dafei-2026-0.6.5'));
});
