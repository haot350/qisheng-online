import {isIP} from 'node:net';
import type {IncomingMessage,Server,ServerResponse} from 'node:http';
export function installHttpGuard(server:Server,originAllowed:(origin?:string)=>boolean,maxBytes=16384){
  const listeners=server.listeners('request');server.removeAllListeners('request');
  const dispatch=(req:IncomingMessage,res:ServerResponse)=>{for(const listener of listeners)listener.call(server,req,res);};
  server.on('request',(req,res)=>{
    const origin=req.headers.origin;
    const respond=(status:number,code:string)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'});res.end(JSON.stringify({code,message:code==='QUEUE_REQUIRED'?'请通过房间列表加入':'请求暂时无法处理'}));};
    if(!originAllowed(origin)){respond(403,'ORIGIN_NOT_ALLOWED');req.resume();return;}
    if(origin)res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');res.setHeader('Cache-Control','no-store');
    res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    const path=(req.url??'/').split('?')[0];
    if(!path.startsWith('/matchmake')){dispatch(req,res);return;}
    if(req.method!=='POST'||!/^\/matchmake\/reconnect\/[A-Za-z0-9_-]{5,64}$/.test(path)){respond(403,'QUEUE_REQUIRED');req.resume();return;}
    if(Number(req.headers['content-length']??0)>maxBytes){respond(413,'BODY_TOO_LARGE');req.resume();return;}
    if(!(req.headers['content-type']??'').includes('application/json')){respond(415,'JSON_REQUIRED');req.resume();return;}
    const chunks:Buffer[]=[];let size=0,done=false;
    const reject=(status:number,code:string)=>{if(done)return;done=true;respond(status,code);};
    req.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>maxBytes){reject(413,'BODY_TOO_LARGE');return;}if(!done)chunks.push(chunk);});
    req.on('end',()=>{if(done)return;try{const body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');if(!body||typeof body!=='object'||Array.isArray(body)){reject(400,'INVALID_BODY');return;}(req as IncomingMessage&{body:unknown}).body=body;done=true;dispatch(req,res);}catch{reject(400,'INVALID_JSON');}});
    req.on('error',()=>reject(400,'INVALID_BODY'));
  });
}

/** Only the loopback Caddy proxy may provide one validated client address. */
export function trustedClientAddress(remote:string|undefined,forwarded:string|string[]|undefined){const loopback=remote==='127.0.0.1'||remote==='::1'||remote==='::ffff:127.0.0.1';if(loopback&&typeof forwarded==='string'&&isIP(forwarded))return forwarded.startsWith('::ffff:')&&isIP(forwarded.slice(7))===4?forwarded.slice(7):forwarded;return remote??'unknown';}
