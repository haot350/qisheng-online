import sharp from 'sharp';
import {body,params,hash,random,type Context,type PlayerRow} from './app.js';
import {accountFor,accountView,ACCOUNT_AVATARS} from './accounts.js';
import {avatarImageView} from './account-avatar-view.js';
import {acquireImageJob} from './image-budget.js';
import {AppError} from './validation.js';

const MAX_INPUT=5*1024*1024, MAX_OUTPUT=192*1024, MAX_STORAGE=256*1024*1024;
type AvatarRow={revision:string;image:Buffer;thumbnail:Buffer;bytes:number};
const attempts=new WeakMap<object,Map<string,number[]>>();
function animatedContainer(bytes:Buffer) {
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    for(let offset=8;offset+12<=bytes.length;) {
      const length=bytes.readUInt32BE(offset),end=offset+12+length;
      if(end>bytes.length)break;
      if(bytes.toString('ascii',offset+4,offset+8)==='acTL')return true;
      offset=end;
    }
  } else if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP') {
    for(let offset=12;offset+8<=bytes.length;) {
      const kind=bytes.toString('ascii',offset,offset+4),length=bytes.readUInt32LE(offset+4),end=offset+8+length;
      if(end>bytes.length)break;
      if(kind==='ANIM'||kind==='ANMF'||kind==='VP8X'&&length>=1&&(bytes[offset+8]&2)!==0)return true;
      offset=end+(length%2);
    }
  }
  return false;
}
function chargeAttempt(c:Context,accountId:string) {
  let entries=attempts.get(c.db);if(!entries){entries=new Map();attempts.set(c.db,entries);}
  const time=c.now();for(const [key,value] of entries)if(!value.length||time-value[value.length-1]>=3600000)entries.delete(key);
  const value=(entries.get(accountId)??[]).filter(at=>time-at<3600000);
  if(value.length>=20)throw new AppError('AVATAR_LIMIT','头像提交次数较多，请一小时后再试。',429,true);
  value.push(time);entries.set(accountId,value);
}
function owner(c:Context,req:Parameters<Context['auth']>[0],playerId:string,expected:number) {
  const token=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):'';
  if(!token||!c.db.prepare('SELECT 1 FROM sessions WHERE hash=? AND player_id=? AND expires>?').get(hash(token),playerId,c.now()))throw new AppError('AUTH','会话已撤销，请重新登录。',401);
  const a=accountFor(c.db,playerId);
  if(!a||a.status!=='active')throw new AppError('ACCOUNT_DISABLED','此账号暂时不能使用在线服务。',403);
  if(!Number.isSafeInteger(expected)||expected!==a.updated)throw new AppError('CONFLICT','档案已变化，请刷新后重试。',409);
  return a;
}
export async function normalizeAvatar(dataUrl:unknown) {
  if(typeof dataUrl!=='string'||dataUrl.length>7*1024*1024)throw new AppError('AVATAR_IMAGE','图片大小不能超过5 MiB。');
  const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if(!match)throw new AppError('AVATAR_IMAGE','请选择静态JPEG、PNG或WebP图片。');
  const bytes=Buffer.from(match[2],'base64');
  if(!bytes.length||bytes.length>MAX_INPUT)throw new AppError('AVATAR_IMAGE','图片大小不能超过5 MiB。');
  if(animatedContainer(bytes))throw new AppError('AVATAR_IMAGE','请选择静态图片。');
  const release=acquireImageJob();
  try {
    const image=sharp(bytes,{limitInputPixels:20000000,animated:false}),meta=await image.metadata();
    if(!['jpeg','png','webp'].includes(meta.format??'')||(meta.pages??1)>1||!meta.width||!meta.height||meta.width*meta.height>20000000)throw Error('format');
    // Re-encode an upright square. Sharp drops EXIF, GPS and source metadata by default.
    const square=await image.rotate().resize(512,512,{fit:'cover',position:'centre'}).raw().toBuffer({resolveWithObject:true});
    let result:{image:Buffer;thumbnail:Buffer}|undefined;
    for(const quality of [82,68,50,32,18]) {
      const input=()=>sharp(square.data,{raw:{width:512,height:512,channels:square.info.channels}});
      const full=await input().webp({quality,effort:4}).toBuffer();
      const thumbnail=await input().resize(96,96).webp({quality,effort:4}).toBuffer();
      if(full.length+thumbnail.length<=MAX_OUTPUT){result={image:full,thumbnail};break;}
    }
    if(!result)throw Error('output');
    return {...result,bytes:result.image.length+result.thumbnail.length};
  } catch(error) {
    if(error instanceof AppError)throw error;
    throw new AppError('AVATAR_IMAGE','这张图片无法读取，请换一张图片。');
  } finally {release();}
}
export function avatarResponse(c:Context,accountId:string,query:Record<string,unknown>,reply:any) {
  const size=query.size??'96';if(size!=='96'&&size!=='512')throw new AppError('AVATAR_IMAGE','头像尺寸无效。');
  const row=c.db.prepare('SELECT revision,image,thumbnail,bytes FROM account_avatars WHERE account_id=?').get(accountId) as AvatarRow|undefined;
  if(!row||typeof query.revision!=='string'||query.revision!==row.revision)throw new AppError('AVATAR_IMAGE','头像已更新，请重新读取档案。',404);
  return reply.type('image/webp').header('Cache-Control','no-store').send(size==='512'?row.image:row.thumbnail);
}
export function accountAvatarRoutes(c:Context) {
  const {app,db,requireAccount}=c;
  app.post('/v1/accounts/avatar',{bodyLimit:7*1024*1024},async req=>{
    const p=requireAccount(req),b=body(req),a=owner(c,req,p.id,b.expectedUpdatedAt);chargeAttempt(c,a.id);
    const prepared=await normalizeAvatar(b.dataUrl);
    return db.transaction(()=>{
      const fresh=owner(c,req,p.id,b.expectedUpdatedAt);if(fresh.id!==a.id)throw new AppError('CONFLICT','账号已变化，请重新打开档案。',409);
      const previous=db.prepare('SELECT bytes FROM account_avatars WHERE account_id=?').get(fresh.id) as {bytes:number}|undefined;
      const used=(db.prepare('SELECT COALESCE(sum(bytes),0) n FROM account_avatars').get() as {n:number}).n;
      if(used-(previous?.bytes??0)+prepared.bytes>MAX_STORAGE)throw new AppError('AVATAR_STORAGE','暂时无法保存头像，请稍后再试。',503,true);
      const revision=random(16),time=Math.max(c.now(),fresh.updated+1);
      db.prepare('INSERT INTO account_avatars(account_id,revision,image,thumbnail,bytes,updated) VALUES(?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET revision=excluded.revision,image=excluded.image,thumbnail=excluded.thumbnail,bytes=excluded.bytes,updated=excluded.updated').run(fresh.id,revision,prepared.image,prepared.thumbnail,prepared.bytes,time);
      db.prepare('UPDATE accounts SET updated=? WHERE id=?').run(time,fresh.id);c.audit('player-avatar-update',p.id,{},p.id);
      return {player:c.safe(db.prepare('SELECT * FROM players WHERE id=?').get(p.id) as PlayerRow),account:accountView(accountFor(db,p.id)!)};
    })();
  });
  app.delete('/v1/accounts/avatar',req=>{
    const p=requireAccount(req),b=body(req);if(b.avatar!==undefined&&!ACCOUNT_AVATARS.includes(b.avatar))throw new AppError('AVATAR','请选择预设头像。');
    return db.transaction(()=>{const a=owner(c,req,p.id,b.expectedUpdatedAt);db.prepare('DELETE FROM account_avatars WHERE account_id=?').run(a.id);db.prepare('UPDATE accounts SET avatar=?,updated=? WHERE id=?').run(b.avatar??a.avatar,Math.max(c.now(),a.updated+1),a.id);c.audit('player-avatar-remove',p.id,{},p.id);return {player:c.safe(p),account:accountView(accountFor(db,p.id)!)};})();
  });
  app.get('/v1/accounts/avatar',(req,reply)=>{const p=requireAccount(req);return avatarResponse(c,accountFor(db,p.id)!.id,req.query as any,reply);});
  app.get('/v1/players/:id/avatar',(req,reply)=>{const a=db.prepare("SELECT a.id FROM accounts a JOIN players p ON p.id=a.player_id WHERE p.id=? AND p.restricted=0 AND a.status='active' AND a.public_profile=1").get(params(req).id) as {id:string}|undefined;if(!a)throw new AppError('AVATAR_IMAGE','此头像未公开。',404);return avatarResponse(c,a.id,req.query as any,reply);});
  app.post('/v1/players/appearances',req=>{
    const ids=body(req).playerIds;if(!Array.isArray(ids)||ids.length>50||ids.some(id=>typeof id!=='string'||id.length<1||id.length>100))throw new AppError('PLAYERS','一次最多查询50位玩家。');
    const find=db.prepare("SELECT a.avatar,v.revision FROM accounts a JOIN players p ON p.id=a.player_id LEFT JOIN account_avatars v ON v.account_id=a.id WHERE p.id=? AND p.restricted=0 AND a.status='active' AND a.public_profile=1");
    return {items:[...new Set<string>(ids)].map(playerId=>{const a=find.get(playerId) as {avatar:string;revision?:string}|undefined;return {playerId,avatar:a?.avatar??'initials',...(a?.revision?{avatarImage:avatarImageView(playerId,a.revision,false)}:{})};})};
  });
}
