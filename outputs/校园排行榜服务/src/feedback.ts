import {processFeedbackScreenshots,resolutionView,feedbackFollowupRoutes} from './feedback-resolution.js';
import sharp from 'sharp';
import {body,params,hash,random,type Context} from './app.js';import {AppError} from './validation.js';
sharp.concurrency(1);sharp.cache({memory:16,files:0,items:16});
export const ISSUE_STATES=['evaluating','planned','developing','verification','released','wontfix'];
export const text=(v:unknown,min=0,max=3000)=>{if(typeof v!=='string')throw new AppError('REQUEST','请填写内容。');const s=v.trim();if(s.length<min||s.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s))throw new AppError('REQUEST','内容长度或格式不合适。');return s;};
export const page=(v:unknown)=>Math.max(1,Math.min(10000,Math.floor(Number(v)||1)));
export function issueReplyView(r:any){return {id:r.id,message:r.message,createdAt:r.created,updatedAt:r.updated,publishedAt:r.published_at};}
export function issueReplies(c:Context,id:string,all=false){return (c.db.prepare('SELECT * FROM issue_replies WHERE issue_id=?'+(all?'':" AND status='published'")+' ORDER BY updated DESC,id DESC').all(id) as any[]).map(r=>({...issueReplyView(r),...(all?{status:r.status}:{})}));}
export function issueView(c:Context,r:any,playerId?:string){const latest=c.db.prepare("SELECT * FROM issue_replies WHERE issue_id=? AND status='published' ORDER BY updated DESC,id DESC LIMIT 1").get(r.id) as any;return {resolution:resolutionView(c,'issue_resolutions',r.id),id:r.id,title:r.title,description:r.description,status:r.status,releaseId:r.release_id??undefined,version:r.release_id?(c.db.prepare('SELECT version FROM releases WHERE id=? AND published=1').get(r.release_id) as any)?.version:undefined,createdAt:r.created,updatedAt:r.updated,replyCount:(c.db.prepare("SELECT count(*) n FROM issue_replies WHERE issue_id=? AND status='published'").get(r.id) as any).n,latestReply:latest?issueReplyView(latest):undefined,votes:(c.db.prepare('SELECT count(*) n FROM issue_votes WHERE issue_id=?').get(r.id) as any).n,myVote:playerId?!!c.db.prepare('SELECT 1 FROM issue_votes WHERE issue_id=? AND player_id=?').get(r.id,playerId):false};}
/** List metadata is fetched in bounded batches, without one SQL walk per card. */
export function issueViews(c:Context,rows:any[],playerId?:string){
 if(!rows.length)return[];
 const ids=rows.map(r=>r.id),slots=ids.map(()=>'?').join(','),byId=(values:any[])=>new Map(values.map(r=>[r.issue_id,r]));
 const resolutions=byId(c.db.prepare('SELECT * FROM issue_resolutions WHERE issue_id IN ('+slots+')').all(...ids) as any[]);
 const replies=byId(c.db.prepare("SELECT * FROM (SELECT *,row_number() OVER(PARTITION BY issue_id ORDER BY updated DESC,id DESC) position FROM issue_replies WHERE status='published' AND issue_id IN ("+slots+')) WHERE position=1').all(...ids) as any[]);
 const counts=byId(c.db.prepare("SELECT issue_id,count(*) n FROM issue_replies WHERE status='published' AND issue_id IN ("+slots+') GROUP BY issue_id').all(...ids) as any[]);
 const votes=byId(c.db.prepare('SELECT issue_id,count(*) n FROM issue_votes WHERE issue_id IN ('+slots+') GROUP BY issue_id').all(...ids) as any[]);
 const mine=playerId?new Set((c.db.prepare('SELECT issue_id FROM issue_votes WHERE player_id=? AND issue_id IN ('+slots+')').all(playerId,...ids) as any[]).map(r=>r.issue_id)):new Set<string>();
 const releaseIds=[...new Set([...rows.map(r=>r.release_id),...[...resolutions.values()].map(r=>r.release_id)].filter(Boolean))];
 const releases=new Map<string,string>(releaseIds.length?(c.db.prepare('SELECT id,version FROM releases WHERE published=1 AND id IN ('+releaseIds.map(()=>'?').join(',')+')').all(...releaseIds) as any[]).map(r=>[r.id,r.version]):[]);
 return rows.map(r=>{const resolution=resolutions.get(r.id),latest=replies.get(r.id);return {resolution:resolution?{kind:resolution.kind,summary:resolution.summary,effectiveAt:resolution.effective,updatedAt:resolution.updated,releaseId:resolution.release_id??undefined,version:releases.get(resolution.release_id)}:undefined,id:r.id,title:r.title,description:r.description,status:r.status,releaseId:r.release_id??undefined,version:releases.get(r.release_id),createdAt:r.created,updatedAt:r.updated,replyCount:counts.get(r.id)?.n??0,latestReply:latest?issueReplyView(latest):undefined,votes:votes.get(r.id)?.n??0,myVote:mine.has(r.id)};});
}
export function feedbackView(c:Context,r:any,privateData=false){const i=r.issue_id?c.db.prepare('SELECT * FROM issues WHERE id=? AND published=1').get(r.issue_id) as any:null,replies=c.db.prepare('SELECT id,message,created as createdAt FROM feedback_replies WHERE feedback_id=? ORDER BY id').all(r.id) as any[];const resolution=resolutionView(c,'feedback_resolutions',r.id),followups=c.db.prepare('SELECT id,message,created as createdAt FROM feedback_followups WHERE feedback_id=? ORDER BY created,id').all(r.id);return {resolution,followups,id:r.id,title:r.title,category:r.category,status:resolution&&r.status==='closed'?'resolved':r.status,createdAt:r.created,updatedAt:r.updated,replies,replyCount:replies.length,latestReply:replies.at(-1),issue:i?issueView(c,i):undefined,...(privateData?{message:r.message,diagnostics:r.diagnostics?JSON.parse(r.diagnostics):null,images:c.db.prepare('SELECT id,width,height,bytes FROM feedback_images WHERE feedback_id=?').all(r.id),playerId:r.player_id,issueId:r.issue_id??undefined}:{} )};}
/** Authorized feedback rows only: details are grouped without changing private/public fields. */
export function feedbackViews(c:Context,rows:any[],privateData=false){
 if(!rows.length)return[];
 const ids=rows.map(r=>r.id),slots=ids.map(()=>'?').join(','),group=(values:any[])=>{const result=new Map<string,any[]>();for(const value of values){const owner=value.feedback_id;delete value.feedback_id;const items=result.get(owner)??[];items.push(value);result.set(owner,items);}return result;};
 const replies=group(c.db.prepare('SELECT feedback_id,id,message,created as createdAt FROM feedback_replies WHERE feedback_id IN ('+slots+') ORDER BY id').all(...ids) as any[]);
 const followups=group(c.db.prepare('SELECT feedback_id,id,message,created as createdAt FROM feedback_followups WHERE feedback_id IN ('+slots+') ORDER BY created,id').all(...ids) as any[]);
 const resolutions=new Map((c.db.prepare('SELECT * FROM feedback_resolutions WHERE feedback_id IN ('+slots+')').all(...ids) as any[]).map(row=>[row.feedback_id,row]));
 const releaseIds=[...new Set([...resolutions.values()].map(row=>row.release_id).filter(Boolean))];
 const releases=new Map(releaseIds.length?(c.db.prepare('SELECT id,version FROM releases WHERE published=1 AND id IN ('+releaseIds.map(()=>'?').join(',')+')').all(...releaseIds) as any[]).map(row=>[row.id,row.version]):[]);
 const issueIds=[...new Set(rows.map(row=>row.issue_id).filter(Boolean))],issues=new Map(issueIds.length?issueViews(c,c.db.prepare('SELECT * FROM issues WHERE published=1 AND id IN ('+issueIds.map(()=>'?').join(',')+')').all(...issueIds) as any[]).map(issue=>[issue.id,issue]):[]);
 const images=privateData?group(c.db.prepare('SELECT feedback_id,id,width,height,bytes FROM feedback_images WHERE feedback_id IN ('+slots+')').all(...ids) as any[]):new Map<string,any[]>();
 return rows.map(row=>{const stored=resolutions.get(row.id),resolution=stored?{kind:stored.kind,summary:stored.summary,effectiveAt:stored.effective,updatedAt:stored.updated,releaseId:stored.release_id??undefined,version:releases.get(stored.release_id)}:undefined,items=replies.get(row.id)??[];return {resolution,followups:followups.get(row.id)??[],id:row.id,title:row.title,category:row.category,status:resolution&&row.status==='closed'?'resolved':row.status,createdAt:row.created,updatedAt:row.updated,replies:items,replyCount:items.length,latestReply:items.at(-1),issue:issues.get(row.issue_id),...(privateData?{message:row.message,diagnostics:row.diagnostics?JSON.parse(row.diagnostics):null,images:images.get(row.id)??[],playerId:row.player_id,issueId:row.issue_id??undefined}:{})};});
}
export function feedbackRoutes(c:Context){const {app,db,now,auth}=c;feedbackFollowupRoutes(c);
 app.post('/v1/feedback',{bodyLimit:22*1024*1024,config:{rateLimit:{max:60,timeWindow:'1 hour'}}},async req=>{
  const b=body(req),candidate=auth(req,true),p=candidate&&c.safe(candidate).accountStatus==='active'?candidate:null,category=b.category;
  if(!['bug','suggestion','content','other'].includes(category))throw new AppError('REQUEST','请选择反馈类型。');
  const title=text(b.title,4,80),message=text(b.message,10,3000),images=b.screenshots??[];
  if(!Array.isArray(images)||images.length>3)throw new AppError('IMAGE','最多上传三张截图。');
  const diagnostics:Record<string,unknown>={};for(const k of ['version','mode','controls','browser','os','viewport','errorCode'])if(typeof b.diagnostics?.[k]==='string')diagnostics[k]=b.diagnostics[k].slice(0,120);
  const submissionToken=b.submissionToken;
  if(submissionToken!==undefined&&(typeof submissionToken!=='string'||!/^[A-Za-z0-9_-]{43,100}$/.test(submissionToken)))throw new AppError('REQUEST','请重新打开反馈页面后提交。');
  const key=submissionToken?'feedback-create:'+(p?'player:'+p.id:'guest')+':'+hash(submissionToken):null;
  const fingerprint=hash(JSON.stringify({category,title,message,diagnostics,screenshots:images.map(image=>typeof image?.dataUrl==='string'?hash(image.dataUrl):null)}));
  const existing=()=>{
   if(!key)return null;
   const old=db.prepare('SELECT fingerprint,response FROM feedback_operations WHERE key=?').get(key) as any;
   if(!old)return null;if(old.fingerprint!==fingerprint)throw new AppError('CONFLICT','这份反馈的内容已变化，请作为新反馈提交。',409);
   const response=JSON.parse(old.response);
   if(!db.prepare('SELECT 1 FROM feedback WHERE id=?').get(response.id))throw new AppError('FEEDBACK','这份反馈已经删除，请重新提交。',404);
   return {...response,receiptCode:c.credential('feedback-receipt:'+key+':'+response.id)};
  };
  const cached=existing();if(cached)return cached;
  const processed=await processFeedbackScreenshots(c,images);
  return db.transaction(()=>{
   const again=existing();if(again)return again;
   const id=random(16),receiptCode=key?c.credential('feedback-receipt:'+key+':'+id):random(24),createdAt=now(),response={id,status:'received',createdAt};
   db.prepare('INSERT INTO feedback(id,player_id,receipt_hash,category,title,message,diagnostics,created,updated) VALUES(?,?,?,?,?,?,?,?,?)').run(id,p?.id??null,hash(receiptCode),category,title,message,Object.keys(diagnostics).length?JSON.stringify(diagnostics):null,createdAt,createdAt);
   for(const image of processed)db.prepare('INSERT INTO feedback_images VALUES(?,?,?,?,?,?)').run(image.id,id,image.data,image.data.length,image.info.width,image.info.height);
   if(key)db.prepare('INSERT INTO feedback_operations VALUES(?,?,?,?)').run(key,fingerprint,JSON.stringify(response),createdAt);
   return {...response,receiptCode};
  })();
 });
 app.post('/v1/feedback/query',{config:{rateLimit:{max:60,timeWindow:'1 minute'}}},req=>{const b=body(req),r=db.prepare('SELECT * FROM feedback WHERE id=? AND receipt_hash=?').get(String(b.id??''),hash(String(b.receiptCode??''))) as any;if(!r)throw new AppError('RECEIPT','查询凭证不正确或反馈已删除。',404);return feedbackView(c,r);});
 app.get('/v1/feedback/mine',req=>{const p=c.requireAccount(req),pg=page((req.query as any).page);return {items:feedbackViews(c,db.prepare('SELECT * FROM feedback WHERE player_id=? ORDER BY created DESC LIMIT 20 OFFSET ?').all(p.id,(pg-1)*20) as any[]),total:(db.prepare('SELECT count(*) n FROM feedback WHERE player_id=?').get(p.id) as any).n,page:pg,pageSize:20};});
 app.post('/v1/feedback/check',{config:{rateLimit:{max:30,timeWindow:'1 minute'}}},req=>{
  const b=body(req),p=auth(req,true),receipts=b.receipts??[];
  if(!Array.isArray(receipts)||receipts.length>20)throw new AppError('REQUEST','最多检查二十份查询凭证。');
  const predicates:string[]=[],args:any[]=[];
  if(p){predicates.push('f.player_id=?');args.push(p.id);}
  for(const receipt of receipts){if(typeof receipt?.id!=='string'||typeof receipt?.receiptCode!=='string'||receipt.id.length>100||receipt.receiptCode.length>200)throw new AppError('REQUEST','查询凭证格式无效。');predicates.push('(f.id=? AND f.receipt_hash=?)');args.push(receipt.id,hash(receipt.receiptCode));}
  if(!predicates.length)return{items:[]};
  const rows=db.prepare('SELECT f.id,count(r.id) replyCount,max(r.id) latestReplyId,max(r.created) latestReplyAt FROM feedback f LEFT JOIN feedback_replies r ON r.feedback_id=f.id WHERE '+predicates.join(' OR ')+' GROUP BY f.id').all(...args) as any[];
  return{items:rows.map(r=>({id:r.id,replyCount:r.replyCount,latestReplyId:r.latestReplyId??0,latestReplyAt:r.latestReplyAt??null}))};
 });
 app.get('/v1/feedback/:id',req=>{const p=auth(req)!,r=db.prepare('SELECT * FROM feedback WHERE id=? AND player_id=?').get(params(req).id,p.id) as any;if(!r)throw new AppError('FEEDBACK','找不到这条反馈。',404);return feedbackView(c,r);});
 app.get('/v1/issues',req=>{const q=req.query as any,pg=page(q.page),status=ISSUE_STATES.includes(q.status)?q.status:null,p=auth(req,true),where=status?'published=1 AND status=?':'published=1',args=status?[status]:[];return {items:issueViews(c,db.prepare('SELECT * FROM issues WHERE '+where+' ORDER BY updated DESC,id ASC LIMIT 20 OFFSET ?').all(...args,(pg-1)*20) as any[],p?.id),total:(db.prepare('SELECT count(*) n FROM issues WHERE '+where).get(...args) as any).n,page:pg,pageSize:20};});
 app.get('/v1/issues/board',req=>{const p=auth(req,true);return db.transaction(()=>{const totals=new Map((db.prepare('SELECT status,count(*) n FROM issues WHERE published=1 GROUP BY status').all() as any[]).map(r=>[r.status,r.n]));const rows=db.prepare('SELECT * FROM (SELECT *,row_number() OVER(PARTITION BY status ORDER BY updated DESC,id ASC) row_position FROM issues WHERE published=1) WHERE row_position<=20 ORDER BY updated DESC,id ASC').all() as any[],views=issueViews(c,rows,p?.id);return{columns:ISSUE_STATES.map(status=>({status,total:totals.get(status)??0,items:views.filter(r=>r.status===status),page:1,pageSize:20}))};})();});
 app.get('/v1/issues/:id',req=>{const r=db.prepare('SELECT * FROM issues WHERE id=? AND published=1').get(params(req).id) as any;if(!r)throw new AppError('ISSUE','问题尚未公开。',404);return {...issueView(c,r,auth(req,true)?.id),replies:issueReplies(c,r.id)};});
 app.post('/v1/issues/:id/vote',req=>{const p=auth(req)!,id=params(req).id,agree=body(req).agree;if(typeof agree!=='boolean'||!db.prepare('SELECT 1 FROM issues WHERE id=? AND published=1').get(id))throw new AppError('ISSUE','找不到公开问题。',404);if(agree)db.prepare('INSERT OR IGNORE INTO issue_votes VALUES(?,?)').run(id,p.id);else db.prepare('DELETE FROM issue_votes WHERE issue_id=? AND player_id=?').run(id,p.id);return {votes:(db.prepare('SELECT count(*) n FROM issue_votes WHERE issue_id=?').get(id) as any).n,myVote:agree};});
 app.get('/v1/releases',()=>{const rows=db.prepare('SELECT * FROM releases WHERE published=1 ORDER BY date DESC,created DESC LIMIT 100').all() as any[],ids=rows.map(row=>row.id),issues=new Map<string,string[]>();if(ids.length)for(const row of db.prepare("SELECT id,release_id FROM issues WHERE published=1 AND status='released' AND release_id IN ("+ids.map(()=>'?').join(',')+")").all(...ids) as any[]){const linked=issues.get(row.release_id)??[];linked.push(row.id);issues.set(row.release_id,linked);}return{items:rows.map(row=>({id:row.id,version:row.version,date:row.date,summary:row.summary,changes:JSON.parse(row.changes),issueIds:issues.get(row.id)??[]}))};});
}
