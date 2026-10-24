import test from 'node:test';
import assert from 'node:assert/strict';
import {scryptSync} from 'node:crypto';
import {createApp} from '../dist/app.js';
import {feedbackView,feedbackViews} from '../dist/feedback.js';

async function fixture(){
  const password='r1-admin-fixture-password',salt='r1-feedback';
  const f=await createApp({dbPath:':memory:',adminPasswordHash:salt+':'+scryptSync(password,salt,32).toString('hex')});
  const login=await f.app.inject({method:'POST',url:'/admin/login',payload:{username:'owner',password}});
  const headers={cookie:String(login.headers['set-cookie']).split(';')[0],'x-csrf-token':login.json().csrf};
  const create=async(mode:string,version='Preview 0.9.5')=>{
    const r=await f.app.inject({method:'POST',url:'/v1/feedback',payload:{category:'bug',title:'检查反馈玩法 '+mode,message:'这是临时数据库中的反馈，仅用于定向检查。',diagnostics:{mode,version,connection:{rttMs:123}}}});
    assert.equal(r.statusCode,200,r.body);return r.json();
  };
  const list=async(query:string)=>{
    const r=await f.app.inject({method:'GET',url:'/admin/feedback?status=all&'+query,headers});
    assert.equal(r.statusCode,200,r.body);return r.json();
  };
  return {...f,headers,create,list};
}

test('feedback filters match current and historical modes without guessing generic PvP',async()=>{
  const f=await fixture();try{
    for(const mode of ['coop','online-coop','tdm','online-tdm','ffa','online-ffa','online-pvp'])await f.create(mode);
    for(const [mode,expected] of [['coop',2],['tdm',2],['ffa',2],['pvp',1]] as const){
      const result=await f.list('mode='+mode);assert.equal(result.total,expected);
      if(mode!=='pvp')assert.ok(result.items.every((item:any)=>item.diagnostics.mode!=='online-pvp'));
    }
    assert.equal((await f.list('mode='+encodeURIComponent("tdm') OR 1=1--"))).total,0);
  }finally{await f.app.close();}
});

test('feedback version filtering accepts visible Preview labels and plain version numbers',async()=>{
  const f=await fixture();try{
    await f.create('escape','Preview 0.9.5');await f.create('escape','0.9.5');await f.create('escape','Preview 0.9.4');
    assert.equal((await f.list('version=0.9.5')).total,2);
    assert.equal((await f.list('version=Preview%200.9.5')).total,2);
    assert.equal((await f.list('version=0.9.4')).total,1);
  }finally{await f.app.close();}
});

test('admin list projection preserves private detail and uses bounded batch reads',async()=>{
  const f=await fixture();try{
    for(let i=0;i<20;i++)await f.create('online-coop');
    const rows=f.db.prepare('SELECT * FROM feedback ORDER BY id').all();
    const first:any=rows[0];
    f.db.prepare('INSERT INTO feedback_replies(feedback_id,message,created) VALUES(?,?,?)').run(first.id,'私人回复',Date.now());
    let queries=0;
    const db=new Proxy(f.db,{get(target,key){if(key==='prepare')return(sql:string)=>{queries++;return target.prepare(sql);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
    const context={db} as any;
    const single=rows.map(row=>feedbackView(context,row,true)),individualQueries=queries;
    queries=0;const batch=feedbackViews(context,rows,true),batchQueries=queries;
    assert.deepEqual(batch,single);assert.ok(batchQueries<=6,{batchQueries});assert.ok(individualQueries>=80);
    const listed=await f.list('mode=coop');assert.equal(listed.total,20);
    assert.equal(listed.items.find((item:any)=>item.id===first.id).replies[0].message,'私人回复');
    assert.equal(listed.items[0].diagnostics.connection.rttMs,123);
    for(const item of feedbackViews(context,rows,false))for(const key of ['message','diagnostics','images','playerId'])assert.equal(Object.hasOwn(item,key),false);
    assert.equal((await f.app.inject({method:'GET',url:'/admin/feedback'})).statusCode,401);
  }finally{await f.app.close();}
});

test('feedback statistics permission does not grant private feedback access',async()=>{
  const f=await fixture();try{
    const created=await f.app.inject({method:'POST',url:'/admin/accounts',headers:f.headers,payload:{username:'stats-only',name:'统计检查',password:'r1-stats-fixture-password',scopes:['stats']}});
    assert.equal(created.statusCode,200,created.body);
    const login=await f.app.inject({method:'POST',url:'/admin/login',payload:{username:'stats-only',password:'r1-stats-fixture-password'}});
    assert.equal(login.statusCode,200,login.body);
    const denied=await f.app.inject({method:'GET',url:'/admin/feedback',headers:{cookie:String(login.headers['set-cookie']).split(';')[0]}});
    assert.equal(denied.statusCode,403,denied.body);
  }finally{await f.app.close();}
});
