import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import sharp from 'sharp';
import {createApp,hash,DAY} from '../dist/app.js';
import {publishDueBlogs} from '../dist/blog.js';
import {removeIdentity} from '../dist/identity.js';
import {normalizeBlogDocument,renderBlogDocument} from '../dist/blog-content.js';
import {compareWorkerCompatibility} from '../dist/deployment-compatibility.js';

async function fixture(){
 let time=Date.UTC(2026,10,4),counter=0;const salt='blog-fixture',password='local-blog-password',f=await createApp({dbPath:':memory:',clock:()=>time,credentialSecret:'local-fixture',adminPasswordHash:salt+':'+scryptSync(password,salt,32).toString('hex')});
 const request=(method:string,url:string,payload?:unknown,headers:Record<string,string>={})=>f.app.inject({method:method as any,url,payload,headers});
 const login=await request('POST','/admin/login',{username:'owner',password}),admin={cookie:String(login.headers['set-cookie']).split(';')[0],'x-csrf-token':login.json().csrf};
 function seed(){const i=++counter,id='blog-player-'+i,token='blog-session-'+i;f.db.prepare('INSERT INTO players(id,short_id,nickname,recovery_hash,created) VALUES(?,?,?,?,?)').run(id,'BLOG'+i,'博客玩家'+i,'old-recovery-'+i,time);f.db.prepare('INSERT INTO accounts(id,player_id,username,password_hash,recovery_hash,created,updated) VALUES(?,?,?,?,?,?,?)').run('blog-account-'+i,id,'博客玩家'+i,'private-password','private-recovery-'+i,time,time);f.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),id,time+30*DAY);return {id,headers:{authorization:'Bearer '+token}};}
 const post=async(title='校园新消息')=>{const r=await request('POST','/admin/blog/posts',{title,document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'这是一篇用于隔离检查的校园文章。'}]}]}},admin);assert.equal(r.statusCode,200,r.body);return r.json();};
 const publish=async(p:any)=>{const r=await request('POST','/admin/blog/posts/'+p.id+'/publish',{expectedRevision:p.draft_revision},admin);assert.equal(r.statusCode,200,r.body);return r.json();};
 return {...f,request,admin,seed,post,publish,time:()=>time,advance:(n:number)=>{time+=n;}};
}

test('blog drafts and image bytes stay private until explicit publication',async()=>{
 const f=await fixture();try{
  const p=await f.post();assert.equal((await f.request('GET','/v1/blog/posts')).json().total,0);assert.equal((await f.request('GET','/v1/blog/posts/'+p.slug)).statusCode,404);
  assert.equal((await f.request('POST','/admin/blog/posts',{title:'未授权'},{})).statusCode,401);
  assert.equal((await f.request('POST','/admin/blog/posts',{title:'缺CSRF'},{cookie:f.admin.cookie})).statusCode,403);
  const bytes=await sharp({create:{width:800,height:600,channels:3,background:'#d4c7ab'}}).jpeg().toBuffer(),image=await f.request('POST','/admin/blog/media',{dataUrl:'data:image/jpeg;base64,'+bytes.toString('base64')},f.admin);assert.equal(image.statusCode,200,image.body);
  const media=image.json();assert.equal((await f.request('GET',media.url.replace('/api',''))).statusCode,404);assert.equal((await f.request('GET',media.previewUrl,undefined,f.admin)).statusCode,200);
  const saved=await f.request('POST','/admin/blog/posts/'+p.id,{title:'照片与校园',coverId:media.id,document:{type:'doc',content:[{type:'image',attrs:{src:media.url,alt:'校园照片'}},{type:'paragraph',content:[{type:'text',text:'<script>alert(1)</script>'}]}]},expectedRevision:p.draft_revision},f.admin);assert.equal(saved.statusCode,200,saved.body);await f.publish(saved.json());
  const publicImage=await f.request('GET',media.url.replace('/api',''));assert.equal(publicImage.statusCode,200);assert.equal(publicImage.headers['content-type'],'image/webp');assert.equal(publicImage.headers['cache-control'],'no-store');
  const html=await f.request('GET','/blog/'+p.slug+'/');assert.equal(html.statusCode,200,html.body);assert.match(html.body,/&lt;script&gt;/);assert.doesNotMatch(html.body,/<script>alert/);assert.match(html.headers['content-security-policy'] as string,/script-src 'self'/);assert.doesNotMatch(html.body,/three|WebGLRenderer|tiptap/);
  assert.equal((await f.request('DELETE','/admin/blog/media/'+media.id,{},f.admin)).statusCode,409);
  assert.equal((await f.request('POST','/admin/blog/posts/'+p.id+'/withdraw',{expectedRevision:saved.json().draft_revision},f.admin)).statusCode,200);
  assert.equal((await f.request('GET',media.url.replace('/api',''))).statusCode,404);
 }finally{await f.app.close();}
});

test('draft revisions, frozen schedules and optimistic updates keep published content stable',async()=>{
 const f=await fixture();try{
  let p=await f.publish(await f.post('第一份公开稿'));
  const saved=await f.request('POST','/admin/blog/posts/'+p.id,{title:'预约稿',expectedRevision:p.draft_revision,document:JSON.parse(p.draft.document)},f.admin);assert.equal(saved.statusCode,200,saved.body);p=saved.json();
  assert.equal((await f.request('GET','/v1/blog/posts/'+p.slug)).json().title,'第一份公开稿');
  const scheduled=await f.request('POST','/admin/blog/posts/'+p.id+'/publish',{expectedRevision:p.draft_revision,scheduledAt:new Date(f.time()+120000).toISOString()},f.admin);assert.equal(scheduled.statusCode,200,scheduled.body);
  const newer=await f.request('POST','/admin/blog/posts/'+p.id,{title:'还未预约的后续稿',expectedRevision:p.draft_revision,document:JSON.parse(p.draft.document)},f.admin);assert.equal(newer.statusCode,200,newer.body);
  assert.equal((await f.request('POST','/admin/blog/posts/'+p.id,{title:'迟到覆盖',expectedRevision:p.draft_revision},f.admin)).statusCode,409);
  f.advance(120001);publishDueBlogs({db:f.db,now:f.time,audit:()=>{}} as any);publishDueBlogs({db:f.db,now:f.time,audit:()=>{}} as any);
  assert.equal((await f.request('GET','/v1/blog/posts/'+p.slug)).json().title,'预约稿');
  assert.equal((f.db.prepare('SELECT count(*) n FROM blog_publications').get() as any).n,1);
  assert.equal((f.db.prepare('SELECT scheduled_at FROM blog_posts WHERE id=?').get(p.id) as any).scheduled_at,null);
 }finally{await f.app.close();}
});

test('public comments enforce account ownership, replay identity, private avatars and one-level replies',async()=>{
 const f=await fixture();try{
  const p=await f.publish(await f.post()),a=f.seed(),b=f.seed();
  f.db.prepare('INSERT INTO account_avatars VALUES(?,?,?,?,?,?)').run('blog-account-1','private',Buffer.from('private-avatar'),Buffer.from('private-thumbnail'),30,f.time());
  const payload={body:'第一次评论',requestId:'request-one'},r=await f.request('POST','/v1/blog/posts/'+p.slug+'/comments',payload,a.headers);assert.equal(r.statusCode,200,r.body);const comment=r.json();assert.equal(comment.avatarImage,undefined);assert.equal(comment.own,true);
  const repeat=await f.request('POST','/v1/blog/posts/'+p.slug+'/comments',payload,a.headers);assert.equal(repeat.json().id,comment.id);assert.equal((f.db.prepare('SELECT count(*) n FROM blog_comments').get() as any).n,1);
  const other=await f.request('DELETE','/v1/blog/comments/'+comment.id,{expectedUpdatedAt:comment.updatedAt},b.headers);assert.equal(other.statusCode,404);
  const reply=await f.request('POST','/v1/blog/posts/'+p.slug+'/comments',{body:'回复这条评论',requestId:'reply-one',parentId:comment.id},b.headers);assert.equal(reply.statusCode,200,reply.body);f.advance(60001);
  assert.equal((await f.request('POST','/v1/blog/posts/'+p.slug+'/comments',{body:'不创建第三层',requestId:'reply-nested',parentId:reply.json().id},b.headers)).statusCode,404);
  const official=await f.request('POST','/admin/blog/posts/'+p.id+'/replies',{body:'感谢反馈，已经记录。',parentId:comment.id,requestId:'official-reply-one'},f.admin);assert.equal(official.statusCode,200,official.body);assert.equal(official.json().author,'齐盛Online');
  const replies=(await f.request('GET','/v1/blog/posts/'+p.slug+'/comments?parentId='+comment.id)).json();assert.equal(replies.items.length,2);assert.ok(replies.items.every((r:any)=>!r.own));
 }finally{await f.app.close();}
});

test('reports and community mutes remain separate from gameplay restrictions',async()=>{
 const f=await fixture();try{
  const p=await f.publish(await f.post()),a=f.seed(),b=f.seed();f.db.prepare('UPDATE players SET restricted=1 WHERE id=?').run(a.id);
  const posted=await f.request('POST','/v1/blog/posts/'+p.slug+'/comments',{body:'账号的参榜限制不扩大到社区。',requestId:'separate-policy'},a.headers);assert.equal(posted.statusCode,200,posted.body);const comment=posted.json();
  for(let i=0;i<2;i++)assert.equal((await f.request('POST','/v1/blog/comments/'+comment.id+'/report',{reason:'请检查这条评论'},b.headers)).statusCode,200);
  assert.equal((f.db.prepare('SELECT count(*) n FROM blog_reports').get() as any).n,1);
  const hidden=await f.request('POST','/admin/blog/comments/'+comment.id,{action:'hide',reason:'根据举报暂时隐藏',expectedUpdatedAt:comment.updatedAt},f.admin);assert.equal(hidden.statusCode,200,hidden.body);
  const listing=(await f.request('GET','/v1/blog/posts/'+p.slug+'/comments')).json();assert.equal(listing.total,0);
  const current=f.db.prepare('SELECT updated FROM blog_comments WHERE id=?').get(comment.id) as any;
  assert.equal((await f.request('PATCH','/v1/blog/comments/'+comment.id,{body:'编辑不能绕过管理员隐藏。',expectedUpdatedAt:current.updated},a.headers)).statusCode,200);
  assert.equal((f.db.prepare('SELECT state FROM blog_comments WHERE id=?').get(comment.id) as any).state,'hidden');
  assert.equal((await f.request('POST','/admin/blog/mutes',{playerId:a.id,days:1,reason:'连续发送不相关内容'},f.admin)).statusCode,200);
  f.advance(60001);assert.equal((await f.request('POST','/v1/blog/posts/'+p.slug+'/comments',{body:'禁言中无法发言',requestId:'muted-comment'},a.headers)).statusCode,403);
  assert.equal((await f.request('POST','/admin/blog/mutes',{playerId:a.id,days:0,reason:'已经完成处理'},f.admin)).statusCode,200);
  assert.equal((await f.request('POST','/v1/blog/posts/'+p.slug+'/comments',{body:'解除后正常发言',requestId:'unmuted-comment'},a.headers)).statusCode,200);
 }finally{await f.app.close();}
});

test('blog permissions are independent and account removal clears authored text and reports',async()=>{
 const f=await fixture();try{
  const p=await f.publish(await f.post()),a=f.seed(),b=f.seed(),r=await f.request('POST','/v1/blog/posts/'+p.slug+'/comments',{body:'待注销的公开文字',requestId:'delete-player-comment'},a.headers);assert.equal(r.statusCode,200,r.body);
  await f.request('POST','/v1/blog/comments/'+r.json().id+'/report',{reason:'由自己提交的举报记录'},b.headers);
  const ctx={db:f.db,now:f.time,audit:()=>{}} as any;removeIdentity(ctx,a.id);removeIdentity(ctx,b.id);
  const comment=f.db.prepare('SELECT body,state,player_id FROM blog_comments WHERE id=?').get(r.json().id) as any;assert.equal(comment.body,'');assert.equal(comment.state,'deleted');assert.equal(comment.player_id,null);assert.equal((f.db.prepare('SELECT count(*) n FROM blog_reports').get() as any).n,0);assert.deepEqual(f.db.pragma('foreign_key_check'),[]);
 }finally{await f.app.close();}
});

test('editor, publisher and community permissions cannot replace one another',async()=>{
 const f=await fixture();try{
  const headers=(name:string,scope:string)=>{f.db.prepare('INSERT INTO administrators VALUES(?,?,?,?,?,?,?,?)').run(name,name,name,'unused-password',0,JSON.stringify([scope]),1,f.time());f.db.prepare('INSERT INTO admin_sessions(hash,expires,csrf,admin_id) VALUES(?,?,?,?)').run(hash(name+'-session'),f.time()+DAY,name+'-csrf',name);return {cookie:'ranking_admin='+name+'-session','x-csrf-token':name+'-csrf'};};
  const editor=headers('writer','blog-edit'),publisher=headers('publisher','blog-publish'),moderator=headers('moderator','blog-moderate');
  const created=await f.request('POST','/admin/blog/posts',{title:'作者的草稿'},editor);assert.equal(created.statusCode,200,created.body);const p=created.json();
  assert.equal((await f.request('POST','/admin/blog/posts/'+p.id+'/publish',{expectedRevision:p.draft_revision},editor)).statusCode,403);
  assert.equal((await f.request('POST','/admin/blog/posts/'+p.id,{title:'发布者不能改稿',expectedRevision:p.draft_revision},publisher)).statusCode,403);
  assert.equal((await f.request('POST','/admin/blog/posts/'+p.id+'/comments-policy',{enabled:false,expectedUpdatedAt:p.updated},editor)).statusCode,403);
  assert.equal((await f.request('POST','/admin/blog/posts/'+p.id+'/comments-policy',{enabled:false,expectedUpdatedAt:p.updated},moderator)).statusCode,200);
  assert.equal((await f.request('GET','/admin/blog/posts/'+p.id,undefined,publisher)).statusCode,200);
  const text={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'只有有发布权限的管理员才能让这份稿件公开。'}]}]};
  const edited=await f.request('POST','/admin/blog/posts/'+p.id,{title:'作者的草稿',document:text,expectedRevision:p.draft_revision},editor);assert.equal(edited.statusCode,200,edited.body);
  assert.equal((await f.request('POST','/admin/blog/posts/'+p.id+'/publish',{expectedRevision:edited.json().draft_revision},publisher)).statusCode,200);
  const player=f.seed();assert.equal((await f.request('POST','/v1/blog/posts/'+p.slug+'/comments',{body:'已关闭评论',requestId:'closed-comment'},player.headers)).statusCode,403);
  assert.equal((await f.request('GET','/admin/blog/comments',undefined,editor)).statusCode,403);
 }finally{await f.app.close();}
});

test('content normalization rejects executable embeds and output safely escapes text',()=>{
 for(const node of [{type:'iframe',attrs:{src:'https://example.com'}},{type:'image',attrs:{src:'https://example.com/remote.jpg'}},{type:'text',text:'点我',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}])assert.throws(()=>normalizeBlogDocument({type:'doc',content:[node]}));
 const doc=normalizeBlogDocument({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'<img src=x onerror=alert(1)>'}]}]}).document;
 assert.match(renderBlogDocument(doc),/&lt;img/);assert.doesNotMatch(renderBlogDocument(doc),/<img/);
});

test('component compatibility accepts independent API/web/realtime versions and detects actual protocol or map mismatch',()=>{
 const expected={version:'0.10.2',releaseId:'older-rt-release',protocolVersion:'campus-mp-0.9.4',manifestHash:'map-one'};
 assert.equal(compareWorkerCompatibility({version:'0.10.2',protocolVersion:'campus-mp-0.9.4',map:{manifestHash:'map-one'}},expected).compatible,true);
 assert.equal(compareWorkerCompatibility({version:'0.10.2',protocolVersion:'old',map:{manifestHash:'map-one'}},expected).compatible,false);
 assert.equal(compareWorkerCompatibility({version:'0.10.2',protocolVersion:'campus-mp-0.9.4',map:{manifestHash:'wrong'}},expected).compatible,false);
 assert.equal(compareWorkerCompatibility({version:'0.10.2'},expected).compatible,null);
});
