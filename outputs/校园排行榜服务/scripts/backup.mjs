import Database from 'better-sqlite3';
import {readFile,writeFile,mkdir,readdir,rename,unlink,chmod} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {assistantConfigFilePath} from '../dist/assistant-config.js';

const config=JSON.parse(await readFile(process.argv[2]??'/srv/codex/leaderboard/config/production.json','utf8'));
const folder=config.backupDir??join(dirname(config.dbPath),'..','backups');
await mkdir(folder,{recursive:true,mode:0o700});
const db=new Database(config.dbPath);
db.pragma('foreign_keys = ON');db.pragma('busy_timeout = 5000');
const name='ranking-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite';
const target=join(folder,name),tmp=target+'.tmp';
await db.backup(tmp);
const check=new Database(tmp,{readonly:true});
if(check.pragma('quick_check',{simple:true})!=='ok')throw Error('Backup integrity check failed');
check.close();
await chmod(tmp,0o600);
await rename(tmp,target);

// Optional private companion: no key or provider response is printed or placed in a release.
let assistantConfigBackedUp=false;
const privateSource=assistantConfigFilePath(config.dbPath,config.assistantConfigFile);
try {
 const contents=await readFile(privateSource);
 const privateTarget=target+'.assistant.json',privateTmp=privateTarget+'.tmp';
 try {
  await writeFile(privateTmp,contents,{mode:0o600,flag:'wx'});
  await rename(privateTmp,privateTarget);
  await chmod(privateTarget,0o600);
  assistantConfigBackedUp=true;
 } finally {await unlink(privateTmp).catch(e=>{if(e.code!=='ENOENT')throw e;});}
} catch(e) {if(e.code!=='ENOENT')throw e;}

db.transaction(()=>{
 db.prepare('DELETE FROM events WHERE run_id IN (SELECT id FROM runs WHERE submitted<? AND status!=?)').run(Date.now()-30*86400000,'review');
 db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
 db.prepare('DELETE FROM admin_sessions WHERE expires<?').run(Date.now());
 if(Number(db.pragma('user_version',{simple:true}))>=2){
  db.prepare('DELETE FROM feedback_images WHERE feedback_id IN(SELECT id FROM feedback WHERE closed IS NOT NULL AND closed<?)').run(Date.now()-90*86400000);
  db.prepare('DELETE FROM telemetry_events WHERE created<?').run(Date.now()-30*86400000);
  db.prepare('DELETE FROM telemetry_sessions WHERE day<?').run(new Date(Date.now()-30*86400000).toISOString().slice(0,10));
  db.prepare('DELETE FROM telemetry_daily WHERE day<?').run(new Date(Date.now()-365*86400000).toISOString().slice(0,10));
  db.prepare('DELETE FROM join_tickets WHERE expires<?').run(Date.now());
  db.prepare('DELETE FROM multiplayer_bans WHERE expires<?').run(Date.now());
 }
})();
db.close();
const files=(await readdir(folder)).filter(s=>/^ranking-.*\.sqlite$/.test(s)).sort().reverse();
for(const old of files.slice(14)){
 await unlink(join(folder,old));
 await unlink(join(folder,old+'.assistant.json')).catch(e=>{if(e.code!=='ENOENT')throw e;});
}
await writeFile(join(folder,'last-backup.json'),JSON.stringify({lastSuccess:new Date().toISOString(),file:name,assistantConfigBackedUp,retained:Math.min(14,files.length)},null,2),{mode:0o600});
console.log(JSON.stringify({ok:true,file:target,assistantConfigBackedUp}));