import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, chmodSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { providerURL, type AssistantProvider } from './assistant-upstream.js';
import { AppError } from './validation.js';
export interface AssistantConfig extends AssistantProvider {
    revision: number;
    enabled: boolean;
    tested: boolean;
    guestDaily: number;
    accountDaily: number;
    globalDailyTokens: number;
}
export const defaultAssistantConfig = (): AssistantConfig => ({ revision: 1, enabled: false, tested: false, endpoint: 'https://api.tianhw.top/v1/chat/completions', model: 'DeepSeek-V4.1-Flash', apiKey: '', guestDaily: 30, accountDaily: 300, globalDailyTokens: 20000000 });
/** Persist under systemd's existing writable data directory, never the read-only runtime config directory. */
export const assistantConfigFilePath = (dbPath: string, configured?: string): string => configured ?? join(dirname(dbPath), 'private', 'assistant-private.json');
export const safeAssistantConfig = (c: AssistantConfig) => ({ revision: c.revision, enabled: c.enabled, endpoint: c.endpoint, model: c.model, keyConfigured: !!c.apiKey, tested: c.tested, guestDaily: c.guestDaily, accountDaily: c.accountDaily, globalDailyTokens: c.globalDailyTokens });
export class AssistantConfigStore {
    private current: AssistantConfig;
    constructor(private path?: string) { this.current = defaultAssistantConfig(); if (path && existsSync(path)) {
        try {
            const raw = JSON.parse(readFileSync(path, 'utf8')), next = { ...this.current, ...raw };
            this.validate(next);
            next.endpoint = providerURL(next.endpoint).href;
            if (!Number.isSafeInteger(next.revision) || next.revision < 1 || typeof next.enabled !== 'boolean' || typeof next.tested !== 'boolean')
                throw Error();
            this.current = next;
            chmodSync(path, 0o600);
        }
        catch {
            console.error(JSON.stringify({ level: 'error', event: 'assistant-config-unavailable' }));
        }
    } }
    read() { return { ...this.current }; }
    private validate(c: AssistantConfig) { try {
        providerURL(c.endpoint);
    }
    catch {
        throw new AppError('ASSISTANT_CONFIG', '请填写公开 HTTPS 接口地址。');
    } if (!/^[\w./:+-]{1,100}$/.test(c.model))
        throw new AppError('ASSISTANT_CONFIG', '模型名称无效。'); for (const [key, max] of [['guestDaily', 100], ['accountDaily', 1000], ['globalDailyTokens', 100000000]] as const)
        if (!Number.isSafeInteger(c[key]) || c[key] < 1 || c[key] > max)
            throw new AppError('ASSISTANT_CONFIG', '使用额度无效。'); if (c.apiKey.length > 1000 || /[\r\n]/.test(c.apiKey))
        throw new AppError('ASSISTANT_CONFIG', '密钥格式无效。'); }
    save(next: AssistantConfig) { this.validate(next); if (this.path) {
        mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
        const tmp = this.path + '.' + randomBytes(6).toString('hex') + '.tmp';
        try {
            writeFileSync(tmp, JSON.stringify(next), { mode: 0o600, flag: 'wx' });
            renameSync(tmp, this.path);
            chmodSync(this.path, 0o600);
        }
        finally {
            if (existsSync(tmp))
                unlinkSync(tmp);
        }
    } this.current = { ...next }; return this.read(); }
    update(raw: Record<string, unknown>, owner: boolean) { const old = this.read(); if (raw.expectedRevision !== old.revision)
        throw new AppError('CONFLICT', '设置已改变，请刷新后重试。', 409); if (!owner && ['endpoint', 'model', 'apiKey'].some(k => raw[k] !== undefined))
        throw new AppError('PERMISSION', '只有负责人可以修改模型与密钥。', 403); const next = { ...old, revision: old.revision + 1 }; for (const k of ['enabled', 'endpoint', 'model', 'apiKey', 'guestDaily', 'accountDaily', 'globalDailyTokens'] as const)
        if (raw[k] !== undefined)
            (next as any)[k] = raw[k]; if (typeof next.enabled !== 'boolean' || typeof next.endpoint !== 'string' || typeof next.model !== 'string' || typeof next.apiKey !== 'string')
        throw new AppError('ASSISTANT_CONFIG', '设置格式无效。'); this.validate(next); next.endpoint = providerURL(next.endpoint).href; if (new URL(next.endpoint).hostname !== new URL(old.endpoint).hostname && !raw.apiKey)
        throw new AppError('ASSISTANT_CONFIG', '更换接口主机时请重新填写密钥。'); if (next.endpoint !== old.endpoint || next.model !== old.model || next.apiKey !== old.apiKey) {
        next.tested = false;
        next.enabled = false;
    } if (next.enabled && (!next.apiKey || !next.tested))
        throw new AppError('ASSISTANT_CONFIG', '请先保存密钥并通过连接测试。'); return this.save(next); }
}
