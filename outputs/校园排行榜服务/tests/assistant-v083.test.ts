import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../dist/app.js';
import { assistantDay } from '../dist/assistant-service.js';
import { publicAddress, providerURL, readAssistantCompletion } from '../dist/assistant-upstream.js';
import {assistantConfigFilePath} from '../dist/assistant-config.js';
const answer = '点击首页“开始游玩”，选择喜欢的模式。', secretKey = 'local-test-provider-not-a-production-key', origin = 'https://game.tianhw.top';
async function fixture() { const directory = await mkdtemp(join(tmpdir(), 'openqs-assistant-')), path = join(directory, 'assistant-private.json'), calls: any[] = [], releases: (()=>void)[] = []; let mode = 'pass'; const transport = async (p: any, messages: any[], maxTokens: number, signal: AbortSignal) => { calls.push({ model: p.model, endpoint: p.endpoint, messages, maxTokens }); if(mode==='formatError')throw new Error('ASSISTANT_FORMAT'); if (mode === 'defer') return new Promise<any>(resolve=>releases.push(()=>resolve({text:messages[0].content.includes('审核员')?JSON.stringify({approved:true}):JSON.stringify({answer}),tokens:100}))); if (mode === 'hold')
    return new Promise<any>(() => { }); if (mode === 'bad')
    return { text: 'not-json' }; return { text: messages[0].content.includes('审核员') ? JSON.stringify({ approved: mode !== 'reject' }) : JSON.stringify({ answer }), tokens: mode === 'noUsage' ? undefined : 100 }; }; const password = 'local-assistant-owner-password', salt = 'assistant-local', f = await createApp({ dbPath: ':memory:', assistantConfigFile: path, assistantTransport: transport, credentialSecret: 'local-assistant-signing-secret', adminPasswordHash: salt + ':' + scryptSync(password, salt, 32).toString('hex') }); const req = (method: any, url: string, payload?: unknown, headers: any = {}) => f.app.inject({ method, url, payload, headers }); const session = (await req('POST', '/admin/login', { username: 'owner', password })); const admin = { cookie: String(session.headers['set-cookie']).split(';')[0], 'x-csrf-token': session.json().csrf }; const config = async () => (await req('GET', '/admin/assistant/config', undefined, admin)).json(); const save = async (update: any) => req('POST', '/admin/assistant/config', { expectedRevision: (await config()).revision, ...update }, admin); const enable = async () => { assert.equal((await save({ apiKey: secretKey })).statusCode, 200); const tested = await req('POST', '/admin/assistant/test', { expectedRevision: (await config()).revision }, admin); assert.equal(tested.statusCode, 200, tested.body); assert.equal((await save({ enabled: true })).statusCode, 200); }; const visitor = async () => (await req('POST', '/v1/assistant/visitor', {}, { origin })).json().visitorToken; return { ...f, calls, req, admin, config, save, enable, visitor, path, setMode: (m: string) => mode = m, release:()=>releases.shift()?.(), close: async () => { await f.app.close(); await rm(directory, { recursive: true, force: true }); } }; }
test('owner config is private, revision checked, and requires an independent dual-call test before enable', async () => { const f = await fixture(); try {
    assert.equal((await f.req('GET', '/v1/assistant/status')).json().available, false);
    assert.equal((await f.save({ enabled: true })).statusCode, 400);
    const saved = await f.save({ apiKey: secretKey });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.ok(!saved.body.includes(secretKey));
    assert.equal((await f.req('POST', '/admin/assistant/config', { expectedRevision: 1, enabled: true }, f.admin)).statusCode, 409);
    const tested = await f.req('POST', '/admin/assistant/test', { expectedRevision: (await f.config()).revision }, f.admin);
    assert.equal(tested.statusCode, 200, tested.body);
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[0].model, 'DeepSeek-V4.1-Flash');
    assert.equal(f.calls[0].model, f.calls[1].model);
    assert.notEqual(f.calls[0].messages[0].content, f.calls[1].messages[0].content);
    assert.equal((await f.config()).enabled, false);
    assert.equal((await f.save({ enabled: true })).statusCode, 200);
    assert.equal((await f.save({ endpoint: 'https://another.example/v1/chat/completions' })).statusCode, 400);
    assert.ok((await readFile(f.path, 'utf8')).includes(secretKey));
    if (process.platform !== 'win32')
        assert.equal((await stat(f.path)).mode & 0o777, 0o600);
    assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM audit').all()).includes(secretKey));
    const pub = (await f.req('GET', '/v1/assistant/status')).body;
    assert.ok(!pub.includes('api.tianhw.top') && !pub.includes('DeepSeek'));
    assert.equal((await f.req('GET', '/admin/assistant/config')).statusCode, 401);
    assert.equal((await f.req('POST', '/admin/assistant/config', { expectedRevision: (await f.config()).revision, enabled: false }, { cookie: f.admin.cookie })).statusCode, 403);
    assert.equal((await f.req('POST', '/admin/accounts', { username: 'helper', name: '助手运营员', password: 'local-assistant-owner-password', scopes: ['assistant'] }, f.admin)).statusCode, 200);
    const limitedLogin = await f.req('POST', '/admin/login', { username: 'helper', password: 'local-assistant-owner-password' });
    const limited = { cookie: String(limitedLogin.headers['set-cookie']).split(';')[0], 'x-csrf-token': limitedLogin.json().csrf };
    const limitedConfig = await f.req('GET', '/admin/assistant/config', undefined, limited);
    assert.equal(limitedConfig.json().endpoint, '');
    assert.equal(limitedConfig.json().model, '');
    assert.equal((await f.req('POST', '/admin/assistant/config', { expectedRevision: (await f.config()).revision, apiKey: 'forbidden-key' }, limited)).statusCode, 403);
    assert.equal((await f.req('POST', '/admin/assistant/test', { expectedRevision: (await f.config()).revision }, limited)).statusCode, 403);
}
finally {
    await f.close();
} });
test('only approved answer is returned, duplicate ids cost no new call, and reviewer rejection never exposes candidate', async () => { const f = await fixture(); try {
    await f.enable();
    f.calls.length = 0;
    const visitorToken = await f.visitor(), payload = { requestId: 'question-0001', question: '怎样操作大飞模式？', visitorToken }, approved = await f.req('POST', '/v1/assistant/chat', payload, { origin });
    assert.equal(approved.statusCode, 200, approved.body);
    assert.equal(approved.json().answer, answer);
    assert.equal(f.calls.length, 2);
    assert.ok(f.calls[0].messages[1].content.includes('大飞'));
    const duplicate = await f.req('POST', '/v1/assistant/chat', payload, { origin });
    assert.equal(duplicate.statusCode, 200);
    assert.equal(f.calls.length, 2);
    assert.equal((await f.req('POST', '/v1/assistant/chat', { ...payload, question: '另一个问题' }, { origin })).statusCode, 409);
    f.setMode('reject');
    const rejected = await f.req('POST', '/v1/assistant/chat', { ...payload, requestId: 'question-0002' }, { origin });
    assert.equal(rejected.statusCode, 503);
    assert.ok(!rejected.body.includes(answer));
    assert.equal(rejected.json().error.message, 'AI助手暂不可用');
    const usage = (await f.req('GET', '/admin/assistant/usage', undefined, f.admin)).json();
    assert.equal(usage.turns, 3);
    assert.equal(usage.approved, 2);
    assert.equal(usage.rejected, 1);
    assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM assistant_limits').all()).includes(payload.question));
    assert.equal((await f.req('POST', '/v1/assistant/chat', { ...payload, requestId: 'question-0003', model: 'arbitrary' }, { origin })).statusCode, 400);
    assert.equal((await f.req('POST', '/v1/assistant/chat', { ...payload, requestId: 'question-0004' }, { origin: 'https://other.invalid' })).statusCode, 403);
}
finally {
    await f.close();
} });
test('cancel releases only its round, stops waiting output and accounts conservatively', async () => { const f = await fixture(); try {
    await f.enable();
    f.setMode('hold');
    const visitorToken = await f.visitor(), payload = { requestId: 'cancelled-0001', question: '怎么开始？', visitorToken }, startCount = f.calls.length;
    const pending = f.req('POST', '/v1/assistant/chat', payload, { origin });
    void pending.then(() => { });
    for (let i = 0; i < 20 && f.calls.length === startCount; i++)
        await new Promise(r => setTimeout(r, 2));
    assert.equal((await f.req('POST', '/v1/assistant/chat', { ...payload, requestId: 'another-0002' }, { origin })).statusCode, 429);
    assert.equal((await f.req('POST', '/v1/assistant/cancel', { requestId: payload.requestId, visitorToken }, { origin })).statusCode, 200);
    assert.equal((await pending).statusCode, 503);
    const usage = (await f.req('GET', '/admin/assistant/usage', undefined, f.admin)).json();
    assert.equal(usage.active, 0);
    assert.ok(usage.tokens > 200);
    assert.equal(usage.failed, 1);
    assert.equal((await f.req('POST', '/v1/assistant/chat', payload, { origin })).statusCode, 503);
}
finally {
    await f.close();
} });
test('guest daily quota survives day accounting, missing provider usage is conservative, and budgets include tests', async () => { const f = await fixture(); try {
    await f.enable();
    f.setMode('noUsage');
    const unknown = await f.req('POST', '/v1/assistant/chat', { requestId: 'unknown-usage-01', question: '怎样开始？', visitorToken: await f.visitor() }, { origin });
    assert.equal(unknown.statusCode, 200, unknown.body);
    assert.ok((await f.req('GET', '/admin/assistant/usage', undefined, f.admin)).json().tokens > 200);
    f.setMode('pass');
    assert.equal((await f.save({ guestDaily: 1 })).statusCode, 200);
    const visitorToken = await f.visitor(), payload = { requestId: 'quota-0001', question: '怎样开始？', visitorToken };
    assert.equal((await f.req('POST', '/v1/assistant/chat', payload, { origin })).statusCode, 200);
    assert.equal((await f.req('POST', '/v1/assistant/chat', { ...payload, requestId: 'quota-0002' }, { origin })).statusCode, 429);
    assert.equal((await f.save({ globalDailyTokens: 1 })).statusCode, 200);
    assert.equal((await f.req('POST', '/admin/assistant/test', { expectedRevision: (await f.config()).revision }, f.admin)).statusCode, 429);
    assert.equal(assistantDay(Date.UTC(2026, 9, 14, 15, 59)), '2026-10-14');
    assert.equal(assistantDay(Date.UTC(2026, 9, 14, 16, 0)), '2026-10-15');
}
finally {
    await f.close();
} });
test('frozen provider finishes both calls after model change, but explicit off aborts output',async()=>{
    const f=await fixture();
    const waitCalls=async(count:number)=>{for(let i=0;i<40&&f.calls.length<count;i++)await new Promise(r=>setTimeout(r,2));assert.equal(f.calls.length,count);};
    try{
        await f.enable();f.setMode('defer');const visitorToken=await f.visitor(),base=f.calls.length;
        const payload={requestId:'frozen-turn-0001',question:'怎样开始？',visitorToken};
        const pending=f.req('POST','/v1/assistant/chat',payload,{origin});void pending.then(()=>{});await waitCalls(base+1);
        assert.equal((await f.save({model:'next-model-id'})).statusCode,200);assert.equal((await f.config()).enabled,false);
        f.release();await waitCalls(base+2);assert.equal(f.calls[base].model,'DeepSeek-V4.1-Flash');assert.equal(f.calls[base+1].model,'DeepSeek-V4.1-Flash');
        f.release();assert.equal((await pending).statusCode,200);
        assert.equal((await f.req('POST','/v1/assistant/chat',{...payload,requestId:'frozen-new-0002'},{origin})).statusCode,503);
        f.setMode('pass');assert.equal((await f.req('POST','/admin/assistant/test',{expectedRevision:(await f.config()).revision},f.admin)).statusCode,200);assert.equal((await f.save({enabled:true})).statusCode,200);
        f.setMode('defer');const next=f.calls.length,pendingOff=f.req('POST','/v1/assistant/chat',{...payload,requestId:'explicit-off-0003'},{origin});void pendingOff.then(()=>{});await waitCalls(next+1);
        assert.equal((await f.save({enabled:false})).statusCode,200);assert.equal((await pendingOff).statusCode,503);
    }finally{await f.close();}
});

test('response disconnect cancels the admitted identity while normal completion remains reusable', async()=>{
    const f=await fixture();
    try{
        await f.enable();
        const address=await f.app.listen({host:'127.0.0.1',port:0}),visitorToken=await f.visitor();
        const good={requestId:'tcp-normal-0001',question:'怎样开始？',visitorToken};
        const normal=await fetch(address+'/v1/assistant/chat',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(good)});
        assert.equal(normal.status,200);await normal.json();
        assert.equal((await f.req('POST','/v1/assistant/chat',good,{origin})).statusCode,200);
        f.setMode('hold');const controller=new AbortController(),count=f.calls.length;
        const pending=fetch(address+'/v1/assistant/chat',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({...good,requestId:'tcp-abort-0002'}),signal:controller.signal});
        const caught=pending.catch(()=>null);
        for(let i=0;i<30&&f.calls.length===count;i++)await new Promise(r=>setTimeout(r,2));
        assert.equal(f.calls.length,count+1);controller.abort();await caught;
        let active=1;for(let i=0;i<30&&active;i++){await new Promise(r=>setTimeout(r,2));active=(await f.req('GET','/admin/assistant/usage',undefined,f.admin)).json().active;}
        assert.equal(active,0);
    }finally{await f.close();}
});

test('provider addresses reject private, special-use and redirect-capable configurations', () => {
    assert.equal(providerURL('https://api.tianhw.top/v1').href,'https://api.tianhw.top/v1/chat/completions');
    assert.equal(providerURL('https://api.tianhw.top/v1/').href,'https://api.tianhw.top/v1/chat/completions');
    assert.equal(providerURL('https://api.tianhw.top/v1/chat/completions').href,'https://api.tianhw.top/v1/chat/completions');
    assert.equal(providerURL('https://api.tianhw.top/custom-route').pathname,'/custom-route');
    assert.equal(assistantConfigFilePath(join('data','ranking.sqlite')),join('data','private','assistant-private.json'));
    assert.equal(assistantConfigFilePath('/srv/codex/leaderboard/data/ranking.sqlite'),join('/srv/codex/leaderboard/data','private','assistant-private.json'));
    assert.equal(assistantConfigFilePath('data/ranking.sqlite','/operator/private.json'),'/operator/private.json');
    for (const address of ['127.0.0.1', '10.0.0.1', '100.64.0.1', '172.20.1.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', '::ffff:127.0.0.1', 'fd00::1', 'fe80::1', '2001:db8::1'])
    assert.equal(publicAddress(address), false, address); assert.equal(publicAddress('8.8.8.8'), true); assert.equal(publicAddress('2606:4700::1111'), true); for (const url of ['http://api.example/v1', 'https://user:pass@api.example/v1', 'https://127.0.0.1/v1', 'https://[::1]/v1', 'https://api.example/v1?key=x'])
    assert.throws(() => providerURL(url)); assert.equal(providerURL('https://api.tianhw.top/v1/chat/completions').pathname, '/v1/chat/completions'); });

test('admin canonical endpoint and raised defaults, test limiter reports minute retry without calling provider',async()=>{
 const f=await fixture();try{
  const initial=await f.config();assert.equal(initial.guestDaily,30);assert.equal(initial.accountDaily,300);assert.equal(initial.globalDailyTokens,20000000);
  const saved=await f.save({endpoint:'https://api.tianhw.top/v1/'});assert.equal(saved.statusCode,200);assert.equal(saved.json().endpoint,'https://api.tianhw.top/v1/chat/completions');
  for(let i=0;i<30;i++){const response=await f.req('POST','/admin/assistant/test',{expectedRevision:saved.json().revision},f.admin);assert.equal(response.statusCode,400,response.body);}
  const limited=await f.req('POST','/admin/assistant/test',{expectedRevision:saved.json().revision},f.admin);assert.equal(limited.statusCode,429);assert.equal(limited.json().error.code,'ASSISTANT_TEST_LIMIT');assert.match(limited.json().error.message,/测试过于频繁/);assert.ok(Number(limited.headers['retry-after'])>=1&&Number(limited.headers['retry-after'])<=60);assert.equal(f.calls.length,0);
 }finally{await f.close();}
});

test('narrow gateway chat envelope and text parts never expose reasoning, owner gets safe format guidance',async()=>{
 const content=JSON.stringify({approved:true});
 assert.deepEqual(readAssistantCompletion({data:{choices:[{message:{content}}]},usage:{total_tokens:133}}),{text:content,tokens:133});
 assert.equal(readAssistantCompletion({choices:[{message:{content:[{type:'text',text:content}]}}]}).text,content);
 assert.throws(()=>readAssistantCompletion({choices:[{message:{reasoning_content:content}}]}));
 assert.throws(()=>readAssistantCompletion({result:{choices:[{message:{content}}]}}));
 const f=await fixture();try{
  await f.enable();assert.equal(f.calls[1].maxTokens,1024);f.setMode('formatError');
  const chat=await f.req('POST','/v1/assistant/chat',{requestId:'format-private-01',question:'怎样开始？',visitorToken:await f.visitor()},{origin});assert.equal(chat.statusCode,503);assert.equal(chat.json().error.message,'AI助手暂不可用');
  const admin=await f.req('POST','/admin/assistant/test',{expectedRevision:(await f.config()).revision},f.admin);assert.equal(admin.statusCode,502);assert.equal(admin.json().error.code,'PROVIDER_FORMAT');assert.match(admin.json().error.message,/Chat Completions/);
 }finally{await f.close();}
});
