import type {FastifyRequest} from 'fastify';
import {body, params, type Context} from './app.js';
import {AppError} from './validation.js';
import {page, text} from './feedback.js';
import {editRevision} from './admin-revision.js';
import {accountAdminView, recomputeAchievements, resolveAccountAppeal, revokeAccountSessions} from './accounts.js';

type Admin = (req: FastifyRequest, write?: boolean, scope?: string) => any;
type Log = (a: any, action: string, target: string, detail?: any) => void;
const fields = ['id','restricted','account_updated','status','public_profile'] as const;
const accountRow = (c: Context, id: string) => c.db.prepare('SELECT p.id,p.short_id,p.nickname,p.restricted,p.created,a.username,a.status,a.public_profile,a.updated account_updated FROM players p LEFT JOIN accounts a ON a.player_id=p.id WHERE p.id=?').get(id) as any;
const safeRow = (r: any) => ({id:r.id,shortId:r.short_id,nickname:r.nickname,restricted:!!r.restricted,createdAt:r.created,username:r.username??null,status:r.status??'legacy',publicProfile:!!r.public_profile,updatedAt:r.account_updated??null,revision:editRevision(r,fields)});
function expected(value: unknown, row: any) {
  if (typeof value !== 'string' || value !== editRevision(row, fields)) throw new AppError('CONFLICT','玩家资料已经更新，请重新读取后处理。',409);
}
export function playerAccountAdminRoutes(c: Context, admin: Admin, log: Log) {
  const {app,db,now}=c;
  app.get('/admin/player-accounts',req=>{
    admin(req,false,'player-accounts');
    const q=req.query as any,pg=page(q.page),filters:string[]=[],args:any[]=[];
    const search=String(q.search??'').trim().slice(0,100);
    if(search){filters.push('(instr(lower(p.nickname),lower(?))>0 OR instr(lower(COALESCE(a.username,\'\')),lower(?))>0 OR p.id=? OR p.short_id=?)');args.push(search,search,search,search);}
    if(q.status==='legacy')filters.push('a.id IS NULL');
    else if(['active','disabled'].includes(q.status)){filters.push('a.status=?');args.push(q.status);}
    if(q.restricted==='true')filters.push('p.restricted=1');
    else if(q.restricted==='false')filters.push('p.restricted=0');
    const source=' FROM players p LEFT JOIN accounts a ON a.player_id=p.id',where=filters.length?' WHERE '+filters.join(' AND '):'';
    return {items:(db.prepare('SELECT p.id,p.short_id,p.nickname,p.restricted,p.created,a.username,a.status,a.public_profile,a.updated account_updated'+source+where+' ORDER BY COALESCE(a.updated,p.created) DESC,p.id ASC LIMIT 20 OFFSET ?').all(...args,(pg-1)*20) as any[]).map(safeRow),total:(db.prepare('SELECT count(*) n'+source+where).get(...args) as any).n,page:pg,pageSize:20};
  });
  app.get('/admin/player-accounts/:id',req=>{
    admin(req,false,'player-accounts');const id=params(req).id,row=accountRow(c,id);
    if(!row)throw new AppError('PLAYER','找不到玩家。',404);
    return {...accountAdminView(c,id),revision:editRevision(row,fields),sessions:(db.prepare('SELECT count(*) n FROM sessions WHERE player_id=? AND expires>?').get(id,now()) as any).n};
  });
  app.post('/admin/player-accounts/:id',req=>{
    const a=admin(req,true,'player-accounts'),id=params(req).id,b=body(req),reason=text(b.reason,2,300);
    if(!['settings','revoke-sessions','recompute'].includes(b.action))throw new AppError('REQUEST','请选择有效的账号操作。');
    return db.transaction(()=>{
      const old=accountRow(c,id);if(!old)throw new AppError('PLAYER','找不到玩家。',404);expected(b.expectedRevision,old);
      if(b.action==='settings'){
        if(typeof b.restricted!=='boolean'||b.status!==undefined&&!['active','disabled'].includes(b.status)||b.publicProfile!==undefined&&typeof b.publicProfile!=='boolean')throw new AppError('REQUEST','账号设置无效。');
        db.prepare('UPDATE players SET restricted=? WHERE id=?').run(b.restricted?1:0,id);
        if(old.username){
          if(b.publicProfile===true&&!old.public_profile)throw new AppError('PROFILE','管理员只能隐藏档案，公开设置由玩家本人选择。');
          db.prepare('UPDATE accounts SET status=?,public_profile=?,updated=? WHERE player_id=?').run(b.status??old.status,b.publicProfile===undefined?old.public_profile:b.publicProfile?1:0,Math.max(now(),old.account_updated+1),id);
          if(b.status==='disabled')revokeAccountSessions(c,id);
        }else if(b.status!==undefined||b.publicProfile!==undefined)throw new AppError('ACCOUNT','这个旧身份尚未升级为账号。');
      }else if(b.action==='revoke-sessions')revokeAccountSessions(c,id);
      else recomputeAchievements(c,id);
      const after=accountRow(c,id);
      log(a,'player-account-'+b.action,id,{reason,before:safeRow(old),after:safeRow(after)});
      return {ok:true,revision:editRevision(after,fields)};
    })();
  });
  app.get('/admin/account-appeals',req=>{
    admin(req,false,'accounts');const q=req.query as any,pg=page(q.page),filters:string[]=[],args:any[]=[];
    if(['received','approved','rejected'].includes(q.status)){filters.push('status=?');args.push(q.status);}
    const search=String(q.search??'').trim().slice(0,100);if(search){filters.push('(id=? OR instr(lower(username),lower(?))>0 OR short_id=?)');args.push(search,search,search);}
    const where=filters.length?' WHERE '+filters.join(' AND '):'';
    return {items:db.prepare('SELECT id,player_id playerId,username,short_id shortId,message,status,response,created createdAt,updated updatedAt,reset_expires resetExpiresAt,reset_used resetUsed FROM account_appeals'+where+' ORDER BY updated DESC,id ASC LIMIT 20 OFFSET ?').all(...args,(pg-1)*20),total:(db.prepare('SELECT count(*) n FROM account_appeals'+where).get(...args) as any).n,page:pg,pageSize:20};
  });
  app.post('/admin/account-appeals/:id',req=>{
    const a=admin(req,true,'accounts'),id=params(req).id,b=body(req);
    if(!['approved','rejected'].includes(b.status))throw new AppError('APPEAL','请选择批准或拒绝。');
    const response=text(b.response,4,2000);
    return db.transaction(()=>{
      const old=db.prepare('SELECT * FROM account_appeals WHERE id=?').get(id) as any;
      if(!old)throw new AppError('APPEAL','找不到申诉。',404);
      if(b.expectedUpdatedAt!==old.updated)throw new AppError('CONFLICT','申诉已经更新，请重新读取。',409);
      if(old.status!=='received')throw new AppError('APPEAL','这条申诉已经处理。',409);
      if(b.status==='approved'&&(b.evidenceConfirmed!==true||typeof b.playerId!=='string'||!b.playerId))throw new AppError('APPEAL','请先核验独立归属证据，并填写明确的玩家编号。');
      const result=resolveAccountAppeal(c,id,{status:b.status,response,playerId:b.status==='approved'?b.playerId:undefined});
      log(a,'account-appeal-'+b.status,id,{playerId:b.status==='approved'?b.playerId:null,response,evidenceConfirmed:b.evidenceConfirmed===true});
      return {ok:true,status:b.status,resetExpiresAt:(result as any)?.resetExpiresAt??null};
    })();
  });
}
