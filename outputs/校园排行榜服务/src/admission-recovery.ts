import type {FastifyRequest} from 'fastify';
import {body,hash,random,type Context} from './app.js';
import {AppError} from './validation.js';

const requestId=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
/** Recovery can seal/release an earlier request; it cannot create a new seat. */
export function admissionRecoveryRoutes(c:Context,internal:(req:FastifyRequest)=>void){
 const {app,db,now}=c;
 app.post('/v1/multiplayer/admissions/credential',{config:{rateLimit:{max:30,timeWindow:'1 minute'}}},req=>{
  const p=c.requireAccount(req),b=body(req);
  if(!c.opts.serviceSecret)throw new AppError('UNAVAILABLE','联机服务暂未开放。',503,true);
  if(!requestId(b.admissionId)||!['coop','pvp'].includes(b.mode)||b.mode==='pvp'&&!['tdm','ffa'].includes(b.variant))throw new AppError('ADMISSION_ID','加入请求已失效，请重新操作。');
  const ticket=random(32),expiresAt=now()+30000,variant=b.mode==='pvp'?b.variant:null;
  db.prepare("INSERT INTO join_tickets(hash,player_id,mode,expires,variant,purpose,admission_id) VALUES(?,?,?,?,?,'reconcile',?)").run(hash(ticket),p.id,b.mode,expiresAt,variant,b.admissionId);
  return {ticket,expiresAt};
 });
 app.post('/internal/multiplayer/admissions/consume',req=>{
  internal(req);const b=body(req);
  if(typeof b.ticket!=='string'||!requestId(b.admissionId)||!['coop','pvp'].includes(b.mode))throw new AppError('TICKET','加入凭证无效。',403);
  return db.transaction(()=>{
   const r=db.prepare("SELECT t.*,p.nickname,p.short_id FROM join_tickets t JOIN players p ON p.id=t.player_id JOIN accounts a ON a.player_id=p.id AND a.status='active' WHERE t.hash=? AND t.consumed=0 AND t.expires>? AND t.purpose='reconcile'").get(hash(b.ticket),now()) as any;
   const variant=b.mode==='pvp'?b.variant:null;
   if(!r||r.admission_id!==b.admissionId||r.mode!==b.mode||r.variant!==variant)throw new AppError('TICKET','加入凭证已失效，请重新核对。',403);
   db.prepare('UPDATE join_tickets SET consumed=1 WHERE hash=? AND consumed=0').run(hash(b.ticket));
   return {player:{id:r.player_id,nickname:r.nickname,shortId:r.short_id},mode:r.mode,variant:r.variant??undefined,purpose:'reconcile',admissionId:r.admission_id};
  })();
 });
}
