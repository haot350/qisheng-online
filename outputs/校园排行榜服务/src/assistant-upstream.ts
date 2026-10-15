import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
export interface AssistantProvider {
    endpoint: string;
    model: string;
    apiKey: string;
}
export interface AssistantCompletion {
    text: string;
    tokens?: number;
}
export type AssistantTransport = (provider: AssistantProvider, messages: {
    role: 'system' | 'user';
    content: string;
}[], maxTokens: number, signal: AbortSignal) => Promise<AssistantCompletion>;
/** Standard Chat Completions, optionally wrapped once in a gateway's data object. Never use reasoning as an answer. */
export function readAssistantCompletion(value: unknown): AssistantCompletion {
    const b=value as any, chat=Array.isArray(b?.choices)?b:Array.isArray(b?.data?.choices)?b.data:null;
    const content=chat?.choices?.[0]?.message?.content;
    const text=typeof content==='string'?content:Array.isArray(content)&&content.length<=16&&content.every(p=>p?.type==='text'&&typeof p.text==='string')?content.map(p=>p.text).join(''):null;
    if(typeof text!=='string'||!text.trim())throw new Error('ASSISTANT_FORMAT');
    const usage=b?.usage?.total_tokens??chat?.usage?.total_tokens;
    return {text,tokens:Number.isSafeInteger(usage)&&usage>0?usage:undefined};
}
/** Reject special-use addresses, including IPv4 embedded in IPv6. DNS answers are pinned to the socket. */
export function publicAddress(address: string): boolean {
    const ip = address.toLowerCase().split('%')[0];
    if (isIP(ip) === 4) {
        const [a, b] = ip.split('.').map(Number);
        return a > 0 && a < 224 && a !== 10 && a !== 127 && !(a === 100 && b >= 64 && b <= 127) && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 0 || b === 168 || b === 88)) && !(a === 198 && (b === 18 || b === 19 || b === 51)) && !(a === 203 && b === 0);
    }
    // Only globally routable unicast. Excludes mapped/compatible, ULA, link-local, multicast and documentation ranges.
    return isIP(ip) === 6 && /^[23][0-9a-f]{0,3}:/.test(ip) && !ip.startsWith('2001:db8:') && !ip.startsWith('2001:0:') && !ip.startsWith('2002:') && !ip.startsWith('3fff:');
}
export function providerURL(value: string): URL {
    let url: URL;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error('ASSISTANT_ENDPOINT');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || url.port && url.port !== '443' || url.href.length > 500 || url.hostname.endsWith('.') || url.hostname === 'localhost' || isIP(url.hostname.replace(/^\[|\]$/g, '')) && !publicAddress(url.hostname.replace(/^\[|\]$/g, '')))
        throw new Error('ASSISTANT_ENDPOINT');
    if (url.pathname === '/v1' || url.pathname === '/v1/')
        url.pathname = '/v1/chat/completions';
    return url;
}
export const httpsAssistantTransport: AssistantTransport = async (provider, messages, maxTokens, signal) => {
    const url = providerURL(provider.endpoint), host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = await new Promise<{
        address: string;
        family: number;
    }[]>((resolve, reject) => { const abort = () => reject(new Error('ASSISTANT_ABORT')); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) {
        abort();
        return;
    } lookup(host, { all: true, verbatim: true }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort)); });
    if (signal.aborted)
        throw new Error('ASSISTANT_ABORT');
    if (!addresses.length || addresses.some(a => !publicAddress(a.address)))
        throw new Error('ASSISTANT_ENDPOINT');
    const chosen = addresses.find(a => a.family === 4) ?? addresses[0], payload = JSON.stringify({ model: provider.model, messages, max_tokens: maxTokens, temperature: 0.2, stream: false });
    return new Promise((resolve, reject) => {
        const req = request(url, { method: 'POST', agent: false, signal, lookup: ((_name: any, options: any, done: any) => { if (options?.all)
                done(null, [chosen]);
            else
                done(null, chosen.address, chosen.family); }) as any, headers: { 'Authorization': 'Bearer ' + provider.apiKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, res => {
            // Never follow redirects or relay upstream error bodies.
            if (res.statusCode !== 200) {
                res.resume();
                reject(Object.assign(new Error('ASSISTANT_UPSTREAM'),{upstreamStatus:res.statusCode}));
                return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 96 * 1024) {
                res.destroy();
                reject(new Error('ASSISTANT_SIZE'));
            }
            else
                chunks.push(chunk); });
            res.on('error', () => reject(new Error('ASSISTANT_UPSTREAM')));
            res.on('end', () => { try {
                resolve(readAssistantCompletion(JSON.parse(Buffer.concat(chunks).toString('utf8'))));
            }
            catch {
                reject(new Error('ASSISTANT_FORMAT'));
            } });
        });
        req.on('error', () => reject(new Error(signal.aborted ? 'ASSISTANT_ABORT' : 'ASSISTANT_UPSTREAM')));
        req.end(payload);
    });
};
