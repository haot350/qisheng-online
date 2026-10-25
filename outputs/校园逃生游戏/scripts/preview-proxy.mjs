import http from 'node:http';

const LOOPBACK = new Set(['127.0.0.1', '[::1]']);
const HOP = new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
export function previewOrigin(value, name) {
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch { throw Error(name + ' must be an explicit loopback HTTP origin'); }
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error(name + ' must be an explicit loopback HTTP origin');
  return url;
}
export function createPreviewProxy({apiOrigin, realtimeOrigin, port}) {
  const api = previewOrigin(apiOrigin, 'PREVIEW_API_ORIGIN'), realtime = previewOrigin(realtimeOrigin, 'PREVIEW_REALTIME_ORIGIN');
  const origins = new Set(['http://127.0.0.1:' + port, 'http://localhost:' + port]);
  function route(raw, upgrade = false) {
    if (typeof raw !== 'string' || !raw.startsWith('/') || /[\\\0#]/.test(raw)) return null;
    const [pathname] = raw.split('?');
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { return null; }
    if (/[\\\0]/.test(decoded) || decoded.split('/').some(part => part === '..') || /%2f/i.test(pathname)) return null;
    if (!upgrade && api && (pathname === '/api/health' || /^\/api\/v1(?:\/|$)/.test(pathname))) return {origin:api, path:raw.slice(4)};
    if (realtime && /^\/realtime(?:\/|$)/.test(pathname)) {
      const target = raw.replace(/^\/realtime(?:\/w[123](?=\/|$))?/, '') || '/';
      if (target === '/' || target.startsWith('/')) return {origin:realtime, path:target};
    }
    return null;
  }
  function headers(request, target, upgrade = false) {
    const result = {};
    for (const [key,value] of Object.entries(request.headers)) if (!HOP.has(key) && !key.startsWith('x-forwarded-') && key !== 'x-real-ip') result[key] = value;
    result.host = target.origin.host;
    result['x-real-ip'] = request.socket.remoteAddress?.replace(/^::ffff:/,'') || '127.0.0.1';
    if (upgrade) { result.connection = 'Upgrade'; result.upgrade = 'websocket'; }
    return result;
  }
  const allowed = request => !request.headers.origin || origins.has(request.headers.origin);
  function fail(response, status) { if(response.headersSent){response.destroy();return;}response.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});response.end(JSON.stringify({error:{code:'PREVIEW_UPSTREAM',message:status===403?'Preview origin denied':'Local preview service unavailable'}})); }
  function forward(request, response) {
    const target = route(request.url); if (!target) return false;
    if (!allowed(request)) { fail(response,403); return true; }
    const upstream = http.request(target.origin, {method:request.method,path:target.path,headers:headers(request,target)}, remote => {
      const outgoing = Object.fromEntries(Object.entries(remote.headers).filter(([key])=>!HOP.has(key)));
      outgoing['cache-control'] = 'no-store';response.writeHead(remote.statusCode || 502,outgoing);remote.on('error',()=>response.destroy());remote.pipe(response);
    });
    upstream.setTimeout(30000,()=>upstream.destroy());
    upstream.on('error',()=>{if(!response.destroyed)fail(response,502);});request.on('aborted',()=>upstream.destroy());response.on('close',()=>{if(!response.writableEnded)upstream.destroy();});request.pipe(upstream);return true;
  }
  function upgrade(request, socket, head) {
    const target = route(request.url,true);
    const reject = status => { if(!socket.destroyed)socket.end('HTTP/1.1 '+status+'\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); };
    if (!target || request.headers.upgrade?.toLowerCase() !== 'websocket') return reject('404 Not Found');
    if (!allowed(request)) return reject('403 Forbidden');
    const upstream = http.request(target.origin,{method:'GET',path:target.path,headers:headers(request,target,true)});
    upstream.setTimeout(10000,()=>upstream.destroy());
    upstream.on('upgrade',(remote, peer, initial)=>{
      upstream.setTimeout(0);const lines=[];for(let i=0;i<remote.rawHeaders.length;i+=2)lines.push(remote.rawHeaders[i]+': '+remote.rawHeaders[i+1]);
      socket.write('HTTP/1.1 101 Switching Protocols\r\n'+lines.join('\r\n')+'\r\n\r\n');if(initial.length)socket.write(initial);if(head.length)peer.write(head);
      socket.on('error',()=>peer.destroy());peer.on('error',()=>socket.destroy());socket.on('close',()=>peer.destroy());peer.on('close',()=>socket.destroy());socket.pipe(peer);peer.pipe(socket);
    });
    upstream.on('response',remote=>{remote.resume();reject('502 Bad Gateway');});upstream.on('error',()=>reject('502 Bad Gateway'));socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());upstream.end();
  }
  return {forward,upgrade,enabled:!!(api||realtime),origins:{api:api?.origin??null,realtime:realtime?.origin??null}};
}
