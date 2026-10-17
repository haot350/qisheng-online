import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, chmodSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { providerURL, type AssistantProvider } from './assistant-upstream.js';
import { AppError } from './validation.js';
import {DEFAULT_GENERATION_PROMPT,DEFAULT_REVIEW_PROMPT} from './assistant-prompts.js';
import type {AssistantPromptRevision} from '@qisheng/shared/assistant';
export interface AssistantConfig extends AssistantProvider {
    revision: number;
    enabled: boolean;
    tested: boolean;
    guestDaily: number;
    accountDaily: number;
    globalDailyTokens: number;
    generationPrompt:string;
    reviewPrompt:string;
    promptHistory:AssistantPromptRevision[];
}
export const defaultAssistantConfig = (): AssistantConfig => ({ revision: 1, enabled: false, tested: false, endpoint: 'https://api.tianhw.top/v1/chat/completions', model: 'DeepSeek-V4.1-Flash', apiKey: '', guestDaily: 30, accountDaily: 300, globalDailyTokens: 20000000,generationPrompt:DEFAULT_GENERATION_PROMPT,reviewPrompt:DEFAULT_REVIEW_PROMPT,promptHistory:[] });
/** Persist under systemd's existing writable data directory, never the read-only runtime config directory. */
export const assistantConfigFilePath = (dbPath: string, configured?: string): string => configured ?? join(dirname(dbPath), 'private', 'assistant-private.json');
export const safeAssistantConfig = (c: AssistantConfig) => ({ revision: c.revision, enabled: c.enabled, endpoint: c.endpoint, model: c.model, keyConfigured: !!c.apiKey, tested: c.tested, guestDaily: c.guestDaily, accountDaily: c.accountDaily, globalDailyTokens: c.globalDailyTokens,generationPrompt:c.generationPrompt,reviewPrompt:c.reviewPrompt,promptHistory:c.promptHistory });
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
        throw new AppError('ASSISTANT_CONFIG', '密钥格式无效。');
      for(const key of ['generationPrompt','reviewPrompt'] as const)if(typeof c[key]!=='string'||c[key].length<1||c[key].length>8000)throw new AppError('ASSISTANT_CONFIG','提示词请填写1—8000个字符。');
      if(!Array.isArray(c.promptHistory)||c.promptHistory.length>20||c.promptHistory.some(r=>!Number.isSafeInteger(r.revision)||typeof r.changedAt!=='number'||typeof r.generationPrompt!=='string'||r.generationPrompt.length>8000||typeof r.reviewPrompt!=='string'||r.reviewPrompt.length>8000))throw new AppError('ASSISTANT_CONFIG','提示词历史无效。');
    }
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
        throw new AppError('CONFLICT', '设置已改变，请刷新后重试。', 409); if (!owner && ['endpoint', 'model', 'apiKey','generationPrompt','reviewPrompt','restoreDefaultPrompts'].some(k => raw[k] !== undefined))
        throw new AppError('PERMISSION', '只有负责人可以修改模型、密钥与提示词。', 403); const next = { ...old, revision: old.revision + 1 }; for (const k of ['enabled', 'endpoint', 'model', 'apiKey', 'guestDaily', 'accountDaily', 'globalDailyTokens','generationPrompt','reviewPrompt'] as const)
        if (raw[k] !== undefined)
            (next as any)[k] = raw[k];
        if(raw.restoreDefaultPrompts!==undefined&&typeof raw.restoreDefaultPrompts!=='boolean')throw new AppError('ASSISTANT_CONFIG','设置格式无效。');
        if(raw.restoreDefaultPrompts===true){next.generationPrompt=DEFAULT_GENERATION_PROMPT;next.reviewPrompt=DEFAULT_REVIEW_PROMPT;}
        const promptsChanged=next.generationPrompt!==old.generationPrompt||next.reviewPrompt!==old.reviewPrompt;
        if(promptsChanged)next.promptHistory=[{revision:old.revision,changedAt:Date.now(),generationPrompt:old.generationPrompt,reviewPrompt:old.reviewPrompt},...old.promptHistory].slice(0,20);
        if (typeof next.enabled !== 'boolean' || typeof next.endpoint !== 'string' || typeof next.model !== 'string' || typeof next.apiKey !== 'string')
        throw new AppError('ASSISTANT_CONFIG', '设置格式无效。'); this.validate(next); next.endpoint = providerURL(next.endpoint).href; if (new URL(next.endpoint).hostname !== new URL(old.endpoint).hostname && !raw.apiKey)
        throw new AppError('ASSISTANT_CONFIG', '更换接口主机时请重新填写密钥。'); if (next.endpoint !== old.endpoint || next.model !== old.model || next.apiKey !== old.apiKey||promptsChanged) {
        next.tested = false;
        next.enabled = false;
    } if (next.enabled && (!next.apiKey || !next.tested))
        throw new AppError('ASSISTANT_CONFIG', '请先保存密钥并通过连接测试。'); return this.save(next); }
}
