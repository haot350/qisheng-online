import {body,params,random,type Context,DAY} from './app.js';
import {AppError} from './validation.js';
import {avatarImageView} from './account-avatar-view.js';
import {blogText,normalizeBlogDocument,renderBlogDocument,type BlogDocument} from './blog-content.js';
import {blogPage,blogStyle,blogClient} from './blog-public.js';

export type BlogPostRow={id:string;slug:string;draft_revision:number;public_revision:number|null;scheduled_revision:number|null;scheduled_at:number|null;comments_enabled:number;created:number;updated:number};
export type BlogRevision={post_id:string;revision:number;title:string;excerpt:string;category:string;author:string;document:string;search_text:string;cover_id:string|null;created:number};
const page=(v:unknown)=>Math.min(10000,Math.max(1,Math.floor(Number(v)||1)));
export function blogPost(c:Context,id:string){const p=c.db.prepare('SELECT * FROM blog_posts WHERE id=?').get(id) as BlogPostRow|undefined;if(!p)throw new AppError('BLOG_POST','找不到这篇文章。',404);return p;}
export function blogRevision(c:Context,id:string,revision:number){const r=c.db.prepare('SELECT * FROM blog_revisions WHERE post_id=? AND revision=?').get(id,revision) as BlogRevision|undefined;if(!r)throw new AppError('BLOG_REVISION','找不到这份稿件。',404);return r;}
export function publicBlogPost(c:Context,slug:string){const p=c.db.prepare('SELECT * FROM blog_posts WHERE slug=? AND public_revision IS NOT NULL').get(slug) as BlogPostRow|undefined;if(!p)throw new AppError('BLOG_POST','这篇文章暂未公开。',404);return {post:p,revision:blogRevision(c,p.id,p.public_revision!)};}
export function blogSummary(c:Context,p:BlogPostRow,r:BlogRevision){const publication=c.db.prepare('SELECT published,updated FROM blog_publications WHERE post_id=?').get(p.id) as {published:number;updated:number}|undefined;return {id:p.id,slug:p.slug,title:r.title,excerpt:r.excerpt,category:r.category,author:r.author,cover:r.cover_id?'/api/v1/blog/media/'+r.cover_id:null,publishedAt:publication?.published??null,updatedAt:publication?.updated??r.created,revision:r.revision,commentsEnabled:!!p.comments_enabled,url:'/blog/'+encodeURIComponent(p.slug)+'/'};}
export function assertBlogPublishable(r:BlogRevision){if(!r.title||!r.search_text.trim()&&!JSON.parse(r.document).content.some((n:any)=>n.type==='image'))throw new AppError('BLOG_CONTENT','请补充文章正文。');}
export function listBlog(c:Context,q:any={}){
 const pg=page(q.page),filters=['p.public_revision IS NOT NULL'],args:any[]=[],search=String(q.search??'').trim().slice(0,100),category=String(q.category??'').trim().slice(0,40);
 if(search){filters.push('(instr(lower(r.title),lower(?))>0 OR instr(lower(r.search_text),lower(?))>0)');args.push(search,search);}if(category){filters.push('r.category=?');args.push(category);}
 const source=' FROM blog_posts p JOIN blog_revisions r ON r.post_id=p.id AND r.revision=p.public_revision JOIN blog_publications b ON b.post_id=p.id WHERE '+filters.join(' AND ');
 const rows=c.db.prepare('SELECT p.*'+source+' ORDER BY b.published DESC,p.id DESC LIMIT 12 OFFSET ?').all(...args,(pg-1)*12) as BlogPostRow[];
 return {items:rows.map(p=>blogSummary(c,p,blogRevision(c,p.id,p.public_revision!))),page:pg,pageSize:12,total:(c.db.prepare('SELECT count(*) n'+source).get(...args) as any).n,categories:(c.db.prepare('SELECT DISTINCT r.category FROM blog_posts p JOIN blog_revisions r ON r.post_id=p.id AND r.revision=p.public_revision ORDER BY r.category').all() as any[]).map(r=>r.category)};
}
export function publishBlog(c:Context,postId:string,revision:number,actor='system'){
 return c.db.transaction(()=>{
  const p=blogPost(c,postId),r=blogRevision(c,postId,revision);
  if(p.public_revision===revision&&!p.scheduled_at)return blogSummary(c,p,r);
  assertBlogPublishable(r);
  const time=Math.max(c.now(),p.updated+1);
  c.db.prepare('UPDATE blog_posts SET public_revision=?,scheduled_revision=NULL,scheduled_at=NULL,updated=? WHERE id=?').run(revision,time,p.id);
  c.db.prepare('INSERT INTO blog_publications(post_id,published,updated) VALUES(?,?,?) ON CONFLICT(post_id) DO UPDATE SET updated=excluded.updated').run(p.id,time,time);
  c.audit('blog-publish',p.id,{revision},actor);
  return blogSummary(c,blogPost(c,p.id),r);
 })();
}
export function publishDueBlogs(c:Context){
 const due=c.db.prepare('SELECT id FROM blog_posts WHERE scheduled_at IS NOT NULL AND scheduled_at<=? ORDER BY scheduled_at LIMIT 50').all(c.now()) as {id:string}[];
 for(const {id} of due)c.db.transaction(()=>{const p=blogPost(c,id);if(p.scheduled_at!==null&&p.scheduled_at<=c.now()&&p.scheduled_revision!==null)publishBlog(c,p.id,p.scheduled_revision);})();
}
const schedulers=new WeakMap<object,ReturnType<typeof setInterval>>();
export function startBlogScheduler(c:Context){if(schedulers.has(c.db))return;publishDueBlogs(c);const t=setInterval(()=>{try{publishDueBlogs(c);}catch{console.error(JSON.stringify({code:'BLOG_SCHEDULE',time:c.now()}));}},15000);t.unref();schedulers.set(c.db,t);}
export function closeBlogScheduler(c:Context){const t=schedulers.get(c.db);if(t)clearInterval(t);schedulers.delete(c.db);}
export function clearBlogIdentity(c:Context,playerId:string){
 c.db.prepare("UPDATE blog_comments SET body='',state='deleted',player_id=NULL,updated=? WHERE player_id=? AND official=0").run(c.now(),playerId);
 c.db.prepare('DELETE FROM blog_reports WHERE player_id=?').run(playerId);
 c.db.prepare('DELETE FROM blog_mutes WHERE player_id=?').run(playerId);
}
function canComment(c:Context,pid:string){const m=c.db.prepare('SELECT expires FROM blog_mutes WHERE player_id=?').get(pid) as {expires:number}|undefined;if(m&&m.expires>c.now())throw new AppError('BLOG_MUTED','此账号暂时不能发表评论。',403);}
export function blogCommentView(c:Context,r:any,viewer:string|null=null){
 const a=r.player_id?c.db.prepare('SELECT p.nickname,a.public_profile,a.status,a.avatar,v.revision FROM players p JOIN accounts a ON a.player_id=p.id LEFT JOIN account_avatars v ON v.account_id=a.id WHERE p.id=?').get(r.player_id) as any:null;
 const visible=r.state==='published';return {id:r.id,postId:r.post_id,postSlug:(c.db.prepare('SELECT slug FROM blog_posts WHERE id=?').get(r.post_id) as any)?.slug??'',parentId:r.parent_id,body:visible?r.body:'',state:r.state,official:!!r.official,author:r.official?'齐盛Online':r.state==='deleted'?'':a?.nickname??'已注销账号',createdAt:r.created,updatedAt:r.updated,own:!!viewer&&r.player_id===viewer&&!r.official,avatar:a?.public_profile&&a.status==='active'?a.avatar:'initials',...(a?.public_profile&&a.status==='active'&&a.revision&&visible?{avatarImage:avatarImageView(r.player_id,a.revision,false)}:{})};
}
function visibleComments(c:Context,postId:string,q:any,viewer:string|null){
 const pg=page(q.page),parent=typeof q.parentId==='string'?q.parentId:null;
 if(parent&&!c.db.prepare('SELECT 1 FROM blog_comments WHERE id=? AND post_id=? AND parent_id IS NULL').get(parent,postId))throw new AppError('BLOG_COMMENT','找不到这条评论。',404);
 const where='post_id=? AND '+(parent?'parent_id=?':'parent_id IS NULL')+" AND state!='hidden'",args=parent?[postId,parent]:[postId];
 const rows=c.db.prepare('SELECT * FROM blog_comments WHERE '+where+' ORDER BY created,id LIMIT 20 OFFSET ?').all(...args,(pg-1)*20) as any[];
 return {items:rows.map(r=>({...blogCommentView(c,r,viewer),replyCount:(c.db.prepare("SELECT count(*) n FROM blog_comments WHERE parent_id=? AND state!='hidden'").get(r.id) as any).n})),page:pg,pageSize:20,total:(c.db.prepare('SELECT count(*) n FROM blog_comments WHERE '+where).get(...args) as any).n};
}
export function blogRoutes(c:Context){
 const {app,db}=c;
 app.get('/v1/blog/posts',req=>listBlog(c,req.query));
 app.get('/v1/blog/posts/:slug',req=>{const {post,revision}=publicBlogPost(c,params(req).slug);return {...blogSummary(c,post,revision),document:JSON.parse(revision.document),html:renderBlogDocument(JSON.parse(revision.document)),related:listBlog(c,{category:revision.category}).items.filter(r=>r.id!==post.id).slice(0,3)};});
 app.get('/v1/blog/media/:id',(req,reply)=>{
  const id=params(req).id,visible=db.prepare('SELECT 1 FROM blog_media_refs r JOIN blog_posts p ON p.id=r.post_id AND p.public_revision=r.revision WHERE r.media_id=? LIMIT 1').get(id);
  if(!visible)throw new AppError('BLOG_IMAGE','图片暂未公开。',404);const media=db.prepare('SELECT image FROM blog_media WHERE id=?').get(id) as any;if(!media)throw new AppError('BLOG_IMAGE','图片不存在。',404);
  return reply.type('image/webp').header('Cache-Control','no-store').send(media.image);
 });
 app.get('/v1/blog/posts/:slug/comments',req=>{const {post}=publicBlogPost(c,params(req).slug),viewer=c.auth(req,true);return {...visibleComments(c,post.id,req.query,viewer?.id??null),commentsEnabled:!!post.comments_enabled};});
 app.post('/v1/blog/posts/:slug/comments',{config:{rateLimit:{max:3,timeWindow:'1 minute'}}},req=>{
  const p=c.requireAccount(req),{post}=publicBlogPost(c,params(req).slug),b=body(req),message=blogText(b.body,1,1000,'评论'),key=blogText(b.requestId,8,100,'请求编号'),parent=typeof b.parentId==='string'?b.parentId:null;
  if(!post.comments_enabled)throw new AppError('BLOG_CLOSED','这篇文章已关闭评论。',403);canComment(c,p.id);
  const requestKey=p.id+':'+key,previous=db.prepare('SELECT * FROM blog_comments WHERE request_key=?').get(requestKey) as any;
  if(previous){if(previous.post_id!==post.id||previous.body!==message||previous.parent_id!==parent)throw new AppError('CONFLICT','这个请求已用于另一条评论。',409);return blogCommentView(c,previous,p.id);}
  if(parent&&!db.prepare("SELECT 1 FROM blog_comments WHERE id=? AND post_id=? AND parent_id IS NULL AND state='published'").get(parent,post.id))throw new AppError('BLOG_COMMENT','这条评论暂时不能回复。',404);
  const today=(db.prepare('SELECT count(*) n FROM blog_comments WHERE player_id=? AND created>?').get(p.id,c.now()-DAY) as any).n;if(today>=100)throw new AppError('BLOG_LIMIT','今天发表的评论较多，请明天再来。',429);
  const id=random(16);db.prepare("INSERT INTO blog_comments(id,post_id,player_id,parent_id,official,body,state,request_key,created,updated) VALUES(?,?,?,?,0,?,'published',?,?,?)").run(id,post.id,p.id,parent,message,requestKey,c.now(),c.now());return blogCommentView(c,db.prepare('SELECT * FROM blog_comments WHERE id=?').get(id),p.id);
 });
 app.patch('/v1/blog/comments/:id',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},req=>{
  const p=c.requireAccount(req),b=body(req),r=db.prepare('SELECT * FROM blog_comments WHERE id=? AND player_id=? AND official=0').get(params(req).id,p.id) as any;
  if(!r||r.state==='deleted')throw new AppError('BLOG_COMMENT','找不到这条评论。',404);canComment(c,p.id);if(b.expectedUpdatedAt!==r.updated)throw new AppError('CONFLICT','评论已变化，请重新读取。',409);
  const text=blogText(b.body,1,1000,'评论');db.prepare('UPDATE blog_comments SET body=?,updated=? WHERE id=?').run(text,Math.max(c.now(),r.updated+1),r.id);return blogCommentView(c,db.prepare('SELECT * FROM blog_comments WHERE id=?').get(r.id),p.id);
 });
 app.delete('/v1/blog/comments/:id',req=>{
  const p=c.requireAccount(req),r=db.prepare('SELECT * FROM blog_comments WHERE id=? AND player_id=? AND official=0').get(params(req).id,p.id) as any;if(!r)throw new AppError('BLOG_COMMENT','找不到这条评论。',404);
  if(body(req).expectedUpdatedAt!==r.updated)throw new AppError('CONFLICT','评论已变化，请重新读取。',409);db.prepare("UPDATE blog_comments SET body='',state='deleted',updated=? WHERE id=?").run(Math.max(c.now(),r.updated+1),r.id);return {ok:true};
 });
 app.post('/v1/blog/comments/:id/report',{config:{rateLimit:{max:10,timeWindow:'1 day'}}},req=>{
  const p=c.requireAccount(req),r=db.prepare("SELECT * FROM blog_comments WHERE id=? AND state='published'").get(params(req).id) as any;if(!r)throw new AppError('BLOG_COMMENT','找不到这条评论。',404);
  const reason=blogText(body(req).reason,2,500,'举报原因');db.prepare('INSERT INTO blog_reports(id,comment_id,player_id,reason,created) VALUES(?,?,?,?,?) ON CONFLICT(comment_id,player_id) DO NOTHING').run(random(16),r.id,p.id,reason,c.now());return {ok:true};
 });
 const headers=(reply:any)=>reply.type('text/html; charset=utf-8').header('Cache-Control','no-store').header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 for(const route of ['/blog','/blog/'])app.get(route,(req,reply)=>headers(reply).send(blogPage(c,null,req.query)));
 app.get('/blog/assets/blog.css',(_,reply)=>reply.type('text/css; charset=utf-8').send(blogStyle));
 app.get('/blog/assets/blog.js',(_,reply)=>reply.type('application/javascript; charset=utf-8').send(blogClient));
 app.get('/blog/:slug/',(req,reply)=>{try{return headers(reply).send(blogPage(c,params(req).slug,{}));}catch(error){if(error instanceof AppError&&error.status===404)return headers(reply).code(404).send(blogPage(c,'__404__',{}));throw error;}});
}
