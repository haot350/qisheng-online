import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { FAQ_GROUPS, LATEST_RELEASE } from '@qisheng/shared/player-content';
import {ASSISTANT_KNOWLEDGE,validateAssistantActions,validateAssistantMenuContext,type AssistantMenuContext,type AssistantChatReply,type AssistantChatRequest,type AssistantHistoryTurn} from '@qisheng/shared/assistant';
import type { RankingDatabase } from './db.js';
import { AppError } from './validation.js';
import { AssistantConfigStore, type AssistantConfig } from './assistant-config.js';
import { httpsAssistantTransport, type AssistantTransport } from './assistant-upstream.js';
import {ASSISTANT_GENERATION_GUARD,ASSISTANT_REVIEW_GUARD,ASSISTANT_TOOL_GUIDE} from './assistant-prompts.js';
const UNAVAILABLE = 'AI助手暂不可用';
const RESERVE = 512000; // Bounded prompts, knowledge, context and both completions.
export const assistantDay = (now: number) => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const unavailable = () => new AppError('ASSISTANT_UNAVAILABLE', UNAVAILABLE, 503, true);
const json = (value: string) => { if (value.length > 16000)
    throw unavailable(); try {
    return JSON.parse(value.trim());
}
catch {
    throw unavailable();
} };
const sourceText = () => [...ASSISTANT_KNOWLEDGE.map(x=>({q:x.title,a:x.text,group:'小齐游玩手册'})),...FAQ_GROUPS.flatMap(g => g.items.map(i => ({ q: i.q, a: i.a, group: g.title })))];
interface CachedTurn {
    fingerprint: string;
    expires: number;
    controller: AbortController;
    promise: Promise<AssistantChatReply>;
}
export class AssistantService {
    readonly store: AssistantConfigStore;
    private active = new Set<AbortController>();
    private people = new Set<string>();
    private cache = new Map<string, CachedTurn>();
    private cancelled = new Map<string, number>();
    private lastCleanDay = '';
    private secret: string;
    constructor(private db: RankingDatabase, private now: () => number, options: {
        configFile?: string;
        secret: string;
        transport?: AssistantTransport;
    }) {
        this.secret = options.secret;
        this.store = new AssistantConfigStore(options.configFile);
        this.transport = options.transport ?? httpsAssistantTransport;
        db.exec(`CREATE TABLE IF NOT EXISTS assistant_daily(day TEXT PRIMARY KEY,turns INTEGER NOT NULL DEFAULT 0,tokens INTEGER NOT NULL DEFAULT 0,approved INTEGER NOT NULL DEFAULT 0,rejected INTEGER NOT NULL DEFAULT 0,failed INTEGER NOT NULL DEFAULT 0,total_ms INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS assistant_limits(day TEXT NOT NULL,kind TEXT NOT NULL,principal TEXT NOT NULL,turns INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,kind,principal));`);
    }
    private transport: AssistantTransport;
    private reservation(question: string, history: AssistantHistoryTurn[],c=this.store.read(),menuContext?:AssistantMenuContext) { const knowledge = this.knowledge(question), first = JSON.stringify({ publicKnowledge: knowledge, history, question,menuContext }), second = JSON.stringify({ publicKnowledge: knowledge, history, question,menuContext }); const value = Buffer.byteLength(ASSISTANT_GENERATION_GUARD+ASSISTANT_REVIEW_GUARD+ASSISTANT_TOOL_GUIDE.repeat(2)+c.generationPrompt+c.reviewPrompt + first + second, 'utf8') + 18000 + 1600 + 1024 + 4096; if (value > RESERVE)
        throw unavailable(); return value; }
    private complete(c: AssistantConfig, messages: Parameters<AssistantTransport>[1], maxTokens: number, signal: AbortSignal) { if (signal.aborted)
        return Promise.reject(unavailable()); return new Promise<Awaited<ReturnType<AssistantTransport>>>((resolve, reject) => { const abort = () => reject(unavailable()); signal.addEventListener('abort', abort, { once: true }); this.transport(c, messages, maxTokens, signal).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort)); }); }
    private h(value: string) { return createHmac('sha256', this.secret).update(value).digest('hex'); }
    status() { const c = this.store.read(); return { name: '小齐' as const, enabled: c.enabled, available: c.enabled && c.tested && !!c.apiKey, revision: c.revision, limits: { guestDaily: c.guestDaily, accountDaily: c.accountDaily, questionChars: 1500, historyTurns: 6 } }; }
    visitor(network: string) { this.clean(); const day = assistantDay(this.now()); this.takeLimit(day, 'visitor-issue', this.h(network), 240); const expiresAt = this.now() + 86400000, value = randomBytes(24).toString('base64url') + '.' + expiresAt; return { visitorToken: value + '.' + this.h('visitor:' + value), expiresAt }; }
    principal(accountId: string | null, token: unknown) { if (accountId)
        return { id: this.h('account:' + accountId), account: true }; if (typeof token !== 'string' || token.length > 180)
        throw new AppError('ASSISTANT_VISITOR', '请重新打开小齐助手。', 401); const parts = token.split('.'), value = parts.slice(0, 2).join('.'), expected = this.h('visitor:' + value), signature = parts[2] ?? ''; if (parts.length !== 3 || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) || !Number.isSafeInteger(Number(parts[1])) || Number(parts[1]) <= this.now() || Number(parts[1]) > this.now() + 86400000)
        throw new AppError('ASSISTANT_VISITOR', '请重新打开小齐助手。', 401); return { id: this.h('visitor-id:' + parts[0]), account: false }; }
    private takeLimit(day: string, kind: string, id: string, max: number) { this.db.prepare('INSERT OR IGNORE INTO assistant_limits(day,kind,principal) VALUES(?,?,?)').run(day, kind, id); const changed = this.db.prepare('UPDATE assistant_limits SET turns=turns+1 WHERE day=? AND kind=? AND principal=? AND turns<?').run(day, kind, id, max).changes; if (!changed)
        throw new AppError('ASSISTANT_LIMIT', '今天的使用次数已用完，请稍后再来。', 429, true); }
    private clean() { const time = this.now(); for (const [key, expires] of this.cancelled)
        if (expires < time)
            this.cancelled.delete(key); for (const [key, row] of this.cache)
        if (row.expires < time && !this.active.has(row.controller))
            this.cache.delete(key); while (this.cache.size > 256) {
        const key = [...this.cache].find(([, r]) => !this.active.has(r.controller))?.[0];
        if (!key)
            break;
        this.cache.delete(key);
    } if (this.lastCleanDay !== assistantDay(time)) {
        const day = assistantDay(time - 31 * 86400000);
        this.db.prepare('DELETE FROM assistant_limits WHERE day<?').run(day);
        this.db.prepare('DELETE FROM assistant_daily WHERE day<?').run(day);
        this.lastCleanDay = assistantDay(time);
    } }
    usage() { const day = assistantDay(this.now()), r = this.db.prepare('SELECT * FROM assistant_daily WHERE day=?').get(day) as any, c = this.store.read(); return { day, turns: r?.turns ?? 0, tokens: r?.tokens ?? 0, approved: r?.approved ?? 0, rejected: r?.rejected ?? 0, failed: r?.failed ?? 0, active: this.active.size, dailyBudget: c.globalDailyTokens, averageMs: r?.turns ? Math.round(r.total_ms / r.turns) : 0 }; }
    cancel(principal: string, requestId: string) { const key = principal + ':' + requestId; this.cancelled.set(key, this.now() + 120000); while (this.cancelled.size > 512)
        this.cancelled.delete(this.cancelled.keys().next().value!); this.cache.get(key)?.controller.abort(); return { ok: true }; }
    disable() { for (const controller of this.active)
        controller.abort(); }
    async close() { this.disable(); await Promise.allSettled([...this.cache.values()].map(r => r.promise)); this.cache.clear(); this.cancelled.clear(); }
    chat(principal: {
        id: string;
        account: boolean;
    }, network: string, raw: AssistantChatRequest): Promise<AssistantChatReply> {
        this.clean();
        const c = this.store.read();
        if (!c.enabled || !c.tested || !c.apiKey)
            throw unavailable();
        if (typeof raw.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(raw.requestId) || typeof raw.question !== 'string' || !raw.question.trim() || [...raw.question].length > 1500)
            throw new AppError('ASSISTANT_INPUT', '请将问题控制在1500字以内。');
        const history: AssistantHistoryTurn[] = [];
        if (raw.history !== undefined && !Array.isArray(raw.history))
            throw new AppError('ASSISTANT_INPUT', '对话格式无效。');
        for (const turn of (raw.history ?? []).slice(-6)) {
            if (typeof turn?.question !== 'string' || typeof turn?.answer !== 'string' || turn.question.length > 1500 || turn.answer.length > 2000)
                throw new AppError('ASSISTANT_INPUT', '对话内容过长。');
            history.push({ question: turn.question, answer: turn.answer });
        }
        while (JSON.stringify(history).length > 6500)
            history.shift();
        let menuContext:AssistantMenuContext|undefined;
        try{menuContext=validateAssistantMenuContext(raw.menuContext);}catch{throw new AppError('ASSISTANT_INPUT','页面已变化，请重新发送问题。');}
        const question = raw.question.trim(), key = principal.id + ':' + raw.requestId, fingerprint = digest(JSON.stringify({ question, history,menuContext })), old = this.cache.get(key);
        if (this.cancelled.has(key))
            throw unavailable();
        if (old) {
            if (old.fingerprint !== fingerprint)
                throw new AppError('CONFLICT', '请重新发送问题。', 409);
            return old.promise;
        }
        if (this.people.has(principal.id) || this.active.size >= 3)
            throw new AppError('ASSISTANT_BUSY', '小齐正在忙，请稍后再试。', 429, true);
        const day = assistantDay(this.now()), limit = principal.account ? c.accountDaily : c.guestDaily, reservation = this.reservation(question, history,c,menuContext);
        this.db.transaction(() => { this.takeLimit(day, 'person', principal.id, limit); this.takeLimit(day, 'network', this.h(network), 1000); this.db.prepare('INSERT OR IGNORE INTO assistant_daily(day) VALUES(?)').run(day); if (!this.db.prepare('UPDATE assistant_daily SET turns=turns+1,tokens=tokens+? WHERE day=? AND tokens+?<=?').run(reservation, day, reservation, c.globalDailyTokens).changes)
            throw new AppError('ASSISTANT_LIMIT', '小齐今天的服务额度已用完，请稍后再来。', 429, true); })();
        const controller = new AbortController();
        this.active.add(controller);
        this.people.add(principal.id);
        const promise = this.run(c, question, history, controller,menuContext).then(result => ({ ...result,...(result.actions.length&&menuContext?{actionPlan:{id:raw.requestId,contextToken:menuContext.token,actions:result.actions}}:{}),actions:undefined, requestId: raw.requestId, remaining: Math.max(0, limit - ((this.db.prepare("SELECT turns FROM assistant_limits WHERE day=? AND kind='person' AND principal=?").get(day, principal.id) as any)?.turns ?? 0)) }));
        const started = this.now();
        let approved = false, rejected = false, used = reservation;
        const tracked = promise.then(result => { const actual = (result as any).__tokens; used = Number.isSafeInteger(actual) ? Math.max(0, actual) : reservation; if (used > reservation)
            throw unavailable(); approved = true; delete (result as any).__tokens; return result; }, error => { rejected = (error as any)?.reviewRejected === true; const known = (error as any)?.assistantTokens; if (Number.isSafeInteger(known) && known >= 0)
            used = known; throw unavailable(); }).finally(() => { this.active.delete(controller); this.people.delete(principal.id); this.db.prepare('UPDATE assistant_daily SET tokens=tokens-?+?,approved=approved+?,rejected=rejected+?,failed=failed+?,total_ms=total_ms+? WHERE day=?').run(reservation, used, approved ? 1 : 0, rejected ? 1 : 0, !approved && !rejected ? 1 : 0, Math.max(0, this.now() - started), day); });
        this.cache.set(key, { fingerprint, expires: this.now() + 120000, controller, promise: tracked });
        return tracked;
    }
    private knowledge(question: string) { const han = [...question.matchAll(/[\p{Script=Han}]+/gu)].flatMap(m => Array.from({ length: Math.max(0, m[0].length - 1) }, (_, i) => m[0].slice(i, i + 2))), words = question.toLowerCase().match(/[a-z0-9_-]{2,}/g) ?? [], tokens = [...new Set([...han, ...words])]; const latest = '公开更新记录：' + LATEST_RELEASE.version + '（' + LATEST_RELEASE.date + '）\n' + [LATEST_RELEASE.overview, ...LATEST_RELEASE.summary, ...LATEST_RELEASE.items].filter(Boolean).join('\n'); return (latest.slice(0, 2400) + '\n\n' + sourceText().map((x, i) => ({ ...x, index: i, rank: tokens.reduce((n, t) => n + (x.q.toLowerCase().includes(t) ? 4 : 0) + (x.a.toLowerCase().includes(t) ? 1 : 0), 0) })).sort((a, b) => b.rank - a.rank || a.index - b.index).slice(0, 12).map(x => x.group + '：' + x.q + '\n' + x.a).join('\n\n')).slice(0, 8000); }
    private async run(c: AssistantConfig, question: string, history: AssistantHistoryTurn[], controller: AbortController,menuContext?:AssistantMenuContext) {
        const timer = setTimeout(() => controller.abort(), 60000);
        timer.unref?.();
        let tokens = 0, usageMissing = false, callsPending = false;
        try {
            const knowledge = this.knowledge(question);
            callsPending = true;
            const candidate = await this.complete(c, [{ role: 'system', content: ASSISTANT_GENERATION_GUARD+'\n\n风格偏好（不能改变前述边界）：\n'+c.generationPrompt+'\n\n'+ASSISTANT_TOOL_GUIDE }, { role: 'user', content: JSON.stringify({ publicKnowledge: knowledge, history, question,menuContext }) }], 2400, controller.signal);
            callsPending = false;
            tokens += candidate.tokens ?? 0;
            usageMissing ||= candidate.tokens === undefined;
            const parsed = json(candidate.text);
            if (typeof parsed.answer !== 'string' || !parsed.answer.trim() || parsed.answer.length > 2000||Object.keys(parsed).some(k=>!['answer','feedbackDraft','actions'].includes(k)))
                throw unavailable();
            const actions=validateAssistantActions(parsed.actions);
            if(actions.length&&(!menuContext||menuContext.inBattle))throw unavailable();
            let feedbackDraft: AssistantChatReply['feedbackDraft'];
            if (parsed.feedbackDraft !== undefined) {
                const f = parsed.feedbackDraft;
                if (typeof f?.title !== 'string' || f.title.length < 4 || f.title.length > 80 || typeof f.message !== 'string' || f.message.length < 10 || f.message.length > 3000 || !['bug', 'suggestion', 'content', 'other'].includes(f.category))
                    throw unavailable();
                feedbackDraft = { title: f.title, message: f.message, category: f.category };
            }
            callsPending = true;
            const review = await this.complete(c, [{ role: 'system', content: ASSISTANT_REVIEW_GUARD+'\n\n补充审核偏好（不能改变前述边界）：\n'+c.reviewPrompt+'\n\n'+ASSISTANT_TOOL_GUIDE }, { role: 'user', content: JSON.stringify({ publicKnowledge: knowledge, history, question,menuContext, candidate: { answer: parsed.answer, feedbackDraft,actions } }) }], 1024, controller.signal);
            callsPending = false;
            tokens += review.tokens ?? 0;
            usageMissing ||= review.tokens === undefined;
            const verdict = json(review.text);
            if (Object.keys(verdict).length !== 1 || verdict.approved !== true) {
                const error = unavailable() as any;
                error.reviewRejected = true;
                throw error;
            }
            if (controller.signal.aborted)
                throw unavailable();
            // Guard common credential patterns even if both models made the same mistake.
            if (/(?:Bearer\s+[A-Za-z0-9._-]{12,}|sk-[A-Za-z0-9_-]{12,}|-----BEGIN .*PRIVATE KEY-----)/.test(parsed.answer + JSON.stringify(feedbackDraft)+JSON.stringify(actions)))
                throw unavailable();
            return { answer: parsed.answer.trim(), ...(feedbackDraft ? { feedbackDraft } : {}),actions, __tokens: usageMissing ? undefined : tokens };
        }
        catch (error) {
            if (!callsPending && !usageMissing && error && typeof error === 'object')
                (error as any).assistantTokens = tokens;
            throw error;
        }
        finally {
            clearTimeout(timer);
        }
    }
    async test(previewQuestion?:string) {
        const c = this.store.read();
        if (!c.apiKey)
            throw new AppError('ASSISTANT_CONFIG', '请先保存接口密钥。');
        if (this.active.size >= 3)
            throw new AppError('ASSISTANT_BUSY', '请稍后再测试。', 429, true);
        if(previewQuestion!==undefined&&(typeof previewQuestion!=='string'||!previewQuestion.trim()||previewQuestion.length>1500))throw new AppError('ASSISTANT_INPUT','请输入1500字以内的预览问题。');
        const day = assistantDay(this.now()), question = previewQuestion??'第一次玩，怎样选择模式？', reservation = this.reservation(question, [],c), started = this.now();
        this.db.prepare('INSERT OR IGNORE INTO assistant_daily(day) VALUES(?)').run(day);
        if (!this.db.prepare('UPDATE assistant_daily SET turns=turns+1,tokens=tokens+? WHERE day=? AND tokens+?<=?').run(reservation, day, reservation, c.globalDailyTokens).changes)
            throw new AppError('ASSISTANT_LIMIT', '今天的服务额度已用完。', 429, true);
        let used = reservation, approved = false;
        const controller = new AbortController();
        this.active.add(controller);
        try {
            // The exact production two-call path is tested; no test content is stored.
            const oldEnabled = c.enabled, temporary = { ...c, enabled: true };
            const result = await this.run(temporary, question, [], controller);
            if (!result.answer)
                throw unavailable();
            used = Number.isSafeInteger(result.__tokens) ? result.__tokens! : reservation;
            if (used > reservation)
                throw unavailable();
            const current = this.store.read();
            if (current.revision !== c.revision)
                throw new AppError('CONFLICT', '设置已改变，请重新测试。', 409);
            if(previewQuestion===undefined)this.store.save({ ...current, tested: true, enabled: oldEnabled, revision: current.revision + 1 });
            approved = true;
            return { ok: true, revision: current.revision+(previewQuestion===undefined?1:0),...(previewQuestion===undefined?{}:{answer:result.answer}) };
        }
        catch (error) {
            const known = (error as any)?.assistantTokens;
            if (Number.isSafeInteger(known) && known >= 0)
                used = known;
            if (error instanceof AppError && error.code === 'CONFLICT')
                throw error;
            const current = this.store.read();
            if (previewQuestion===undefined&&current.revision === c.revision)
                this.store.save({ ...current, tested: false, enabled: false, revision: current.revision + 1 });
            if (error instanceof Error && error.message === 'ASSISTANT_FORMAT')
                throw new AppError('PROVIDER_FORMAT', '接口未返回可读取的对话内容，请确认渠道使用 Chat Completions 格式。', 502, true);
            if (Number.isInteger((error as any)?.upstreamStatus))
                throw new AppError('PROVIDER_HTTP', '上游接口返回错误（HTTP '+(error as any).upstreamStatus+'），请稍后重试或检查渠道状态。', 502, true);
            throw unavailable();
        }
        finally {
            this.active.delete(controller);
            this.db.prepare('UPDATE assistant_daily SET tokens=tokens-?+?,approved=approved+?,failed=failed+?,total_ms=total_ms+? WHERE day=?').run(reservation, used, approved ? 1 : 0, approved ? 0 : 1, Math.max(0, this.now() - started), day);
        }
    }
}
