import type { FastifyRequest } from 'fastify';
import { body, type Context } from './app.js';
import { accountFor } from './accounts.js';
import { AppError } from './validation.js';
import { AssistantService } from './assistant-service.js';
import { safeAssistantConfig } from './assistant-config.js';
const services = new WeakMap<object, AssistantService>();
const allowedKeys = (b: Record<string, unknown>, keys: string[]) => { if (Object.keys(b).some(k => !keys.includes(k)))
    throw new AppError('ASSISTANT_INPUT', '请求格式无效。'); };
export function assistantRoutes(c: Context) {
    const s = new AssistantService(c.db, c.now, { configFile: c.opts.assistantConfigFile, secret: c.credential('assistant-token-signing'), transport: c.opts.assistantTransport });
    services.set(c, s);
    const origin = (req: FastifyRequest) => { const value = req.headers.origin; if (typeof value !== 'string' || !(c.opts.origins ?? ['https://game.tianhw.top', 'https://zbqsgz.tianhw.top']).includes(value))
        throw new AppError('ASSISTANT_ORIGIN', '请从游戏页面打开小齐助手。', 403); if (req.headers['sec-fetch-site'] === 'cross-site')
        throw new AppError('ASSISTANT_ORIGIN', '请从游戏页面打开小齐助手。', 403); };
    const principal = (req: FastifyRequest) => { const p = c.auth(req, true), a = p ? accountFor(c.db, p.id) : null; if (a && a.status !== 'active')
        throw new AppError('ACCOUNT_DISABLED', '此账号暂时不能使用在线服务。', 403); return s.principal(a ? p!.id : null, body(req).visitorToken); };
    c.app.get('/v1/assistant/status', () => s.status());
    c.app.post('/v1/assistant/visitor', { bodyLimit: 1024, config: { rateLimit: { max: 60, timeWindow: '1 hour' } } }, req => { origin(req); return s.visitor(req.ip); });
    c.app.post('/v1/assistant/chat', { bodyLimit: 40 * 1024, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
        origin(req);
        const b = body(req);
        allowedKeys(b, ['requestId', 'question', 'history', 'visitorToken']);
        const admitted = principal(req), turn = s.chat(admitted, req.ip, b as any);
        // Bind disconnect cleanup to the admitted identity, not a later account/session.
        // IncomingMessage close also fires after a normal request body; only response close is cancellation.
        const disconnect = () => { if (!reply.raw.writableEnded) s.cancel(admitted.id, b.requestId); };
        reply.raw.once('close', disconnect);
        if (reply.raw.destroyed) disconnect();
        try { return await turn; }
        finally { reply.raw.removeListener('close', disconnect); }
    });
    c.app.post('/v1/assistant/cancel', { bodyLimit: 1024, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, req => { origin(req); const b = body(req); allowedKeys(b, ['requestId', 'visitorToken']); if (typeof b.requestId !== 'string' || b.requestId.length > 100)
        throw new AppError('ASSISTANT_INPUT', '请求格式无效。'); return s.cancel(principal(req).id, b.requestId); });
}
export async function closeAssistant(c: Context) { await services.get(c)?.close(); }
export function assistantAdminRoutes(c: Context, admin: (req: FastifyRequest, write?: boolean, scope?: string) => any, log: (a: any, action: string, target: string, detail?: any) => void) {
    const s = services.get(c)!;
    c.app.get('/admin/assistant/config', req => { const a = admin(req, false, 'assistant'), config = safeAssistantConfig(s.store.read()); return a.owner ? config : { ...config, endpoint: '', model: '' }; });
    c.app.get('/admin/assistant/usage', req => { admin(req, false, 'assistant'); return s.usage(); });
    c.app.post('/admin/assistant/config', { bodyLimit: 4096 }, req => { const a = admin(req, true, 'assistant'), b = body(req); allowedKeys(b, ['expectedRevision', 'enabled', 'endpoint', 'model', 'apiKey', 'guestDaily', 'accountDaily', 'globalDailyTokens']); const old = s.store.read(), next = s.store.update(b, !!a.owner); if (b.enabled === false)
        s.disable(); log(a, 'assistant-config-update', 'assistant', { revision: next.revision, enabled: next.enabled, providerChanged: old.endpoint !== next.endpoint || old.model !== next.model, keyChanged: b.apiKey !== undefined, limitsChanged: old.guestDaily !== next.guestDaily || old.accountDaily !== next.accountDaily || old.globalDailyTokens !== next.globalDailyTokens }); const safe = safeAssistantConfig(next); return a.owner ? safe : { ...safe, endpoint: '', model: '' }; });
    c.app.post('/admin/assistant/test', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => { const a = admin(req, true, 'assistant'); if (!a.owner)
        throw new AppError('PERMISSION', '只有负责人可以测试模型。', 403); if (body(req).expectedRevision !== s.store.read().revision)
        throw new AppError('CONFLICT', '设置已改变，请刷新后重试。', 409); const result = await s.test(); log(a, 'assistant-provider-test', 'assistant', { revision: result.revision, ok: true }); return result; });
}
