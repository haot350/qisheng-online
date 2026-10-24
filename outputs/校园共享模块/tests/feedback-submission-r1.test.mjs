import test from 'node:test';
import assert from 'node:assert/strict';
import {feedbackSubmission, selectedFeedbackDiagnostics} from '../dist/community/feedback-submission.js';

const diagnostics = {version:'Preview 0.9.5',mode:'online-tdm',controls:'keyboard',viewport:'1280×720'};
const draft = (changes = {}) => ({
  category:'bug',title:'连接反馈测试',message:'移动过程中出现了短暂回拉，重试不应重复提交。',
  screenshots:[],includeDiagnostics:true,includeConnection:true,...changes,
});
function payload(value, rttMs = 80) {
  const attached = selectedFeedbackDiagnostics(diagnostics,{rttMs},value);
  return {category:value.category,title:value.title,message:value.message,screenshots:structuredClone(value.screenshots),...(attached ? {diagnostics:attached} : {})};
}
function tokens() {
  let sequence = 0;
  return () => Buffer.alloc(32,++sequence).toString('base64url');
}

test('feedback attachment choices are independent', async t => {
  for (const includeDiagnostics of [false,true]) {
    for (const includeConnection of [false,true]) {
      await t.test(`device=${includeDiagnostics}; connection=${includeConnection}`, () => {
        const actual = selectedFeedbackDiagnostics(diagnostics,{rttMs:123.4567},{includeDiagnostics,includeConnection});
        const expected = {...(includeDiagnostics ? diagnostics : {}),...(includeConnection ? {connection:{rttMs:123.457}} : {})};
        assert.deepEqual(actual,Object.keys(expected).length ? expected : undefined);
      });
    }
  }
});

test('feedback attachments discard unknown, invalid and private fields', () => {
  const untrusted = {...diagnostics,browser:'Synthetic browser',os:'Synthetic OS',errorCode:'TEST',ip:'192.0.2.1',token:'not-a-real-secret',position:[1,2,3],account:{id:'synthetic'}};
  const connection = {rttMs:50.12345,jitterMs:-1,snapshotAgeMs:NaN,inputAckAgeMs:Infinity,backlogAgeMs:1e10,hardCorrections:0,ip:'192.0.2.1',token:'not-a-real-secret',entities:[{position:[1,2,3]}]};
  assert.deepEqual(selectedFeedbackDiagnostics(untrusted,connection,{includeDiagnostics:true,includeConnection:true}),{
    ...diagnostics,browser:'Synthetic browser',os:'Synthetic OS',errorCode:'TEST',connection:{rttMs:50.123,hardCorrections:0},
  });
  assert.equal(selectedFeedbackDiagnostics({version:{private:'value'}},{rttMs:-1},{includeDiagnostics:true,includeConnection:true}),undefined);
  assert.deepEqual(selectedFeedbackDiagnostics({connection:{rttMs:70}},undefined,{includeDiagnostics:false,includeConnection:true}),{connection:{rttMs:70}});
});

test('retry freezes the original attachment snapshot while live RTT changes', () => {
  const edit = draft({screenshots:[{dataUrl:'data:image/png;base64,synthetic'}]});
  const current = payload(edit,100), random = tokens();
  const first = feedbackSubmission(null,'anonymous',current,random,edit);
  assert.notEqual(first.payload,current);
  current.diagnostics.connection.rttMs = 400;
  current.screenshots[0].dataUrl = 'changed-after-submit';
  assert.equal(first.payload.diagnostics.connection.rttMs,100);
  assert.equal(first.payload.screenshots[0].dataUrl,'data:image/png;base64,synthetic');
  const retry = feedbackSubmission(first,'anonymous',payload(edit,200),random,edit);
  assert.equal(retry,first);
  assert.equal(retry.token,first.token);
  assert.equal(retry.payload.diagnostics.connection.rttMs,100);
});

test('explicit draft, screenshot, attachment or identity changes create another operation', async t => {
  const edit = draft(), random = tokens();
  const first = feedbackSubmission(null,'player-a',payload(edit),random,edit);
  const cases = [
    ['message',draft({message:edit.message+'补充一个步骤。'}),'player-a'],
    ['title',draft({title:'另一条反馈标题'}),'player-a'],
    ['category',draft({category:'suggestion'}),'player-a'],
    ['screenshot',draft({screenshots:[{dataUrl:'data:image/png;base64,synthetic'}]}),'player-a'],
    ['device choice',draft({includeDiagnostics:false}),'player-a'],
    ['connection choice',draft({includeConnection:false}),'player-a'],
    ['identity',edit,'player-b'],
  ];
  for (const [name,next,owner] of cases) {
    await t.test(name, () => {
      const actual = feedbackSubmission(first,owner,payload(next),random,next);
      assert.notEqual(actual.token,first.token);
      assert.deepEqual(actual.payload,payload(next));
    });
  }
});

test('saved feedback with a lost response retries to the same real API receipt', {
  skip:process.env.QISHENG_TEST_FEEDBACK_API !== '1' && 'Local integration: set QISHENG_TEST_FEEDBACK_API=1 with the ranking service built.',
}, async () => {
  const {createApp} = await import('../../校园排行榜服务/dist/app.js');
  const {RankingClient} = await import('../dist/community/client.js');
  const fixture = await createApp({dbPath:':memory:',credentialSecret:'synthetic-local-feedback-secret'});
  let calls = 0, saved;
  const transport = async (url, options) => {
    const response = await fixture.app.inject({
      method:options.method,url:new URL(url).pathname,headers:options.headers,payload:options.body,
    });
    assert.equal(response.statusCode,200);
    if (++calls === 1) {
      saved = response.json();
      throw new TypeError('Synthetic response lost after the API saved it.');
    }
    return new Response(response.body,{status:response.statusCode,headers:{'content-type':'application/json'}});
  };
  const client = new RankingClient('https://synthetic.invalid',transport), edit = draft(), random = tokens();
  const first = feedbackSubmission(null,'anonymous',payload(edit,100),random,edit);
  try {
    await assert.rejects(client.request('/feedback',{method:'POST',auth:false,body:{...first.payload,submissionToken:first.token}}),error => error.code === 'NETWORK');
    assert.equal(fixture.db.prepare('SELECT count(*) n FROM feedback').get().n,1);
    const retry = feedbackSubmission(first,'anonymous',payload(edit,200),random,edit);
    const answer = await client.request('/feedback',{method:'POST',auth:false,body:{...retry.payload,submissionToken:retry.token}});
    assert.deepEqual(answer,saved);
    assert.equal(calls,2);
    assert.equal(fixture.db.prepare('SELECT count(*) n FROM feedback').get().n,1);
    assert.equal(fixture.db.prepare('SELECT count(*) n FROM feedback_operations').get().n,1);
    assert.equal(JSON.parse(fixture.db.prepare('SELECT diagnostics FROM feedback').get().diagnostics).connection.rttMs,100);
  } finally {
    await fixture.app.close();
  }
});
