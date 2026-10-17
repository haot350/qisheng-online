import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createConnection} from 'node:net';
const root=fileURLToPath(new URL('../',import.meta.url));
if(process.argv.length>2)throw Error('Usage: node scripts/verify-demo.mjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const health=async port=>{try{const r=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(800)});return r.ok;}catch{return false;}};
const occupied=port=>new Promise(resolve=>{const socket=createConnection({host:'127.0.0.1',port});socket.setTimeout(500);socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));socket.once('timeout',()=>{socket.destroy();resolve(false);});});
for(const port of [5180,2577,8792])if(await occupied(port))throw Error('Port '+port+' is already serving another process; stop your own demo or choose a clean environment. No existing process was stopped.');
const environment=spawnSync(process.execPath,['scripts/check-environment.mjs'],{cwd:root,stdio:'inherit',windowsHide:true});if(environment.status!==0)process.exit(environment.status??1);
const launcher=spawn(process.execPath,['scripts/dev-demo.mjs'],{cwd:root,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],env:{...process.env,OPENQS_PROFILE:'demo'}});
let tail='',exited=false;launcher.on('exit',()=>{exited=true;});launcher.on('error',e=>{tail+=e.message;exited=true;});
const record=data=>{tail=(tail+data.toString()).slice(-6000);};launcher.stdout.on('data',record);launcher.stderr.on('data',record);
try{
 let ready=false;for(let i=0;i<180;i++){if(exited)throw Error('Demo launcher exited before becoming ready.');if(await health(2577)&&await health(8792)){const page=await fetch('http://127.0.0.1:5180/',{signal:AbortSignal.timeout(1000)}).catch(()=>null);if(page?.ok){ready=true;break;}}await pause(250);}
 if(!ready)throw Error('Local demo was not ready within 45 seconds.');
 const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/check-demo.mjs'],{cwd:root,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',resolve);});
 if(result!==0||exited)throw Error('Account and two-client demo checks failed or their server stopped.');console.log('Clean demo launch, accounts and two-client actions passed.');
}catch(error){
 const redacted=tail.replace(/Bearer\s+[^\s"']+/gi,'Bearer [redacted]').replace(/("(?:token|credential|recoveryCode|password)"\s*:\s*")[^"]*/gi,'$1[redacted]');console.error(redacted);throw error;
}finally{
 if(launcher.pid){if(process.platform==='win32')spawnSync('taskkill',['/pid',String(launcher.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else try{process.kill(-launcher.pid,'SIGTERM');}catch{}}
}
