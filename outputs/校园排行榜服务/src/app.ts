import Fastify,{type FastifyRequest} from 'fastify';
import {operationsRoutes} from './operations.js';
import {accountRoutes,accountFor} from './accounts.js';
import {accountProfileRoutes} from './account-profile.js';
import {achievementRoutes} from './achievements.js';
import cors from '@fastify/cors';import rateLimit from '@fastify/rate-limit';import {randomBytes,createHash,createHmac} from 'node:crypto';
import {openDatabase,type RankingDatabase} from './db.js';import {AppError} from './validation.js';import {RANKING_RULE_VERSION,rankingRuleVersion,type RankingPlayer} from './shared.js';import {identityRoutes} from './identity.js';import {runRoutes} from './runs.js';import {boardRoutes} from './boards.js';import {adminRoutes} from './admin.js';import {feedbackRoutes} from './feedback.js';import {multiplayerRoutes} from './multiplayer.js';import {telemetryRoutes} from './telemetry.js';
export const DAY=86400000;export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');export const random=(n=32)=>randomBytes(n).toString('base64url');
export interface PlayerRow{id:string;short_id:string;nickname:string;renamed:number;auto_submit:number;restricted:number;}
export interface RunRow{id:string;player_id:string;client_id:string;credential_hash:string;created:number;expires:number;config:string;status:string;summary:string|null;flags:string|null;submitted:number|null;week:string|null;reason:string|null;acked:number;record_stats:number;publish_board:number;}
export interface AppOptions{dbPath?:string;origins?:string[];adminPasswordHash?:string;credentialSecret?:string;serviceSecret?:string;telemetrySecret?:string;clock?:()=>number;db?:RankingDatabase;}
export const body=(req:FastifyRequest)=>((req.body??{}) as Record<string,any>);export const params=(req:FastifyRequest)=>(req.params as Record<string,string>);
export async function createApp(opts:AppOptions={}){
 const db=opts.db??openDatabase(opts.dbPath??'data/ranking.sqlite'),now=opts.clock??Date.now;
 const app=Fastify({logger:false,bodyLimit:2*1024*1024,trustProxy:'127.0.0.1'});
 await app.register(cors,{origin:opts.origins??['https://game.tianhw.top','https://zbqsgz.tianhw.top'],methods:['GET','POST','PATCH','DELETE','OPTIONS'],allowedHeaders:['Authorization','Content-Type','X-CSRF-Token'],credentials:false,maxAge:3600});
 const requestIdentity=new WeakMap<FastifyRequest,{player:(PlayerRow&{sessionExpires:number})|null;tokenHash:string;problem:'missing'|'invalid'|'long'|null;renewed:boolean}>();
 const lookupIdentity=db.prepare('SELECT players.*,sessions.expires AS sessionExpires FROM sessions JOIN players ON players.id=sessions.player_id WHERE sessions.hash=? AND sessions.expires>?');
 const renewIdentity=db.prepare('UPDATE sessions SET expires=? WHERE hash=? AND expires>?');
 function identityFor(req:FastifyRequest){
  const cached=requestIdentity.get(req);if(cached)return cached;
  const header=req.headers.authorization,token=header?.startsWith('Bearer ')?header.slice(7):'';
  const tokenHash=token&&token.length<=100?hash(token):'';
  const player=tokenHash?lookupIdentity.get(tokenHash,now()) as (PlayerRow&{sessionExpires:number})|undefined:undefined;
  const value={player:player??null,tokenHash,problem:(!token?'missing':token.length>100?'long':!player?'invalid':null) as 'missing'|'invalid'|'long'|null,renewed:false};
  requestIdentity.set(req,value);return value;
 }
 await app.register(rateLimit,{global:true,max:1200,timeWindow:'1 minute',keyGenerator:req=>{const identity=identityFor(req);return identity.player?'player:'+identity.player.id:'ip:'+req.ip;}});
 const safe=(p:PlayerRow):RankingPlayer=>{const a=accountFor(db,p.id);return {id:p.id,nickname:p.nickname,shortId:p.short_id,renameAt:p.renamed?p.renamed+7*DAY:0,autoSubmit:!!p.auto_submit,restricted:!!p.restricted,accountStatus:a?.status??'legacy',needsUpgrade:!a,syncStats:a?!!a.sync_stats:false,accountId:a?.id} as RankingPlayer;};
 const credentialSecret=opts.credentialSecret??random();const credential=(id:string)=>createHmac('sha256',credentialSecret).update(id).digest('base64url');
 const session=(id:string)=>{const token=random(),expiresAt=now()+30*DAY;db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token),id,expiresAt);return {token,expiresAt};};
 function auth(req:FastifyRequest,optional=false):PlayerRow|null{
  const identity=identityFor(req);
  if(identity.problem==='long')throw new AppError('AUTH','登录状态已失效。',401);
  if(!identity.player){if(optional)return null;throw new AppError('AUTH',identity.problem==='missing'?'请先设置昵称或恢复身份。':'登录状态已失效，请重新恢复身份。',401);}
  // Renew at most once per day of normal usage, not on every read under FULL WAL.
  if(!identity.renewed&&identity.player.sessionExpires<now()+29*DAY){renewIdentity.run(now()+30*DAY,identity.tokenHash,now());identity.renewed=true;}
  return identity.player;
 }
 function requireAccount(req:FastifyRequest){const p=auth(req)!,a=accountFor(db,p.id);if(!a)throw new AppError('ACCOUNT_UPGRADE','请先把旧身份升级为账号。',403);if(a.status!=='active')throw new AppError('ACCOUNT_DISABLED','此账号暂时不能使用在线服务。',403);return p;}
 function loadRun(req:FastifyRequest,id:string,credential?:string){const p=auth(req)!;const run=db.prepare('SELECT * FROM runs WHERE id=? AND player_id=?').get(id,p.id) as RunRow|undefined;if(!run)throw new AppError('RUN','找不到这局比赛。',404);if(credential!==undefined&&hash(credential)!==run.credential_hash)throw new AppError('CREDENTIAL','本局凭证无效。',403);return run;}
 const submission=(run:RunRow)=>({runId:run.id,status:run.status,reason:run.reason??undefined,summary:run.summary?JSON.parse(run.summary):undefined,recorded:!!run.record_stats,recordStats:!!run.record_stats,published:!!run.publish_board&&run.status==='ranked'});
 const audit=(action:string,target:string,detail:unknown={},actor?:string)=>db.prepare('INSERT INTO audit(created,action,target,detail,actor) VALUES (?,?,?,?,?)').run(now(),action,target,JSON.stringify(detail),actor??null);
 app.setErrorHandler((error,req,reply)=>{const e=error as Error&{statusCode?:number};if(e.statusCode===429)return reply.code(429).send({error:{code:'RATE_LIMIT',message:'请求较多，请稍后再试。',retryable:true}});if(e instanceof AppError)return reply.code(e.status).send({error:{code:e.code,message:e.message,retryable:e.retryable}});if(e.statusCode&&e.statusCode<500)return reply.code(e.statusCode).send({error:{code:'REQUEST',message:'请求格式无效。',retryable:false}});console.error(JSON.stringify({time:now(),level:'error',route:req.routeOptions.url,code:'INTERNAL',name:e.name}));return reply.code(500).send({error:{code:'INTERNAL',message:'服务暂时不可用，请稍后重试。',retryable:true}});});
 app.addHook('onSend',async(req,reply,payload)=>{reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer').header('Cache-Control','no-store');if(req.url.startsWith('/admin'))reply.header('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");return payload;});
 app.get('/health',()=>({ok:true,version:'0.8.2',ruleVersion:RANKING_RULE_VERSION,ruleVersions:{escape:rankingRuleVersion('escape'),dafei:rankingRuleVersion('dafei')},sqliteVersion:(db.prepare('select sqlite_version() v').get() as {v:string}).v}));
 const ctx={app,db,now,auth,requireAccount,safe,session,loadRun,submission,audit,opts,credential};operationsRoutes(ctx);identityRoutes(ctx);accountRoutes(ctx);accountProfileRoutes(ctx);achievementRoutes(ctx);runRoutes(ctx);boardRoutes(ctx);feedbackRoutes(ctx);multiplayerRoutes(ctx);telemetryRoutes(ctx);adminRoutes(ctx);
 app.addHook('onClose',async()=>{if(!opts.db)db.close();});return {app,db};
}
export type Context=Awaited<ReturnType<typeof createContext>>;
async function createContext(){const db=openDatabase(':memory:');return {app:Fastify(),db,now:Date.now,auth:(_req:FastifyRequest,_optional?:boolean)=>null as PlayerRow|null,requireAccount:(_req:FastifyRequest)=>({}) as PlayerRow,safe:(_p:PlayerRow)=>({}) as RankingPlayer,session:(_id:string)=>({token:'',expiresAt:0}),loadRun:(_req:FastifyRequest,_id:string,_credential?:string)=>({}) as RunRow,submission:(_r:RunRow)=>({}) as any,audit:(_a:string,_t:string,_d?:unknown,_actor?:string)=>({}),opts:{} as AppOptions,credential:(_id:string)=>''};}
