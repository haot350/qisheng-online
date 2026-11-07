// The only current SSH deployment-target configuration. No credential material.
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const configuration=JSON.parse(readFileSync(process.env.OPENQS_DEPLOYMENT_TARGET_CONFIG||new URL('../deployment-targets.json',import.meta.url),'utf8'));
export function resolveDeploymentTarget(name=configuration.defaultTarget){
 const entry=configuration.targets[name];
 if(!entry||!Object.hasOwn(configuration.targets,name))throw Error('Unknown deployment target: '+String(name));
 if(!/^[a-z0-9][a-z0-9-]*$/.test(entry.sshHost)||!/^\d{1,3}(\.\d{1,3}){3}$/.test(entry.address)||! /^[A-Za-z0-9._-]+$/.test(entry.hostname))throw Error('Invalid deployment target configuration');
 const paths=Object.freeze({...configuration.paths,...entry.paths});
 for(const key of ['root','sites','api','realtime','node'])if(typeof paths[key]!=='string'||!paths[key].startsWith('/')||/[\r\n\0]/.test(paths[key]))throw Error('Invalid deployment path '+key);
 const services=entry.services??'system';if(!['system','user'].includes(services))throw Error('Invalid service mode');
 if(services==='user'&&(name!=='hk-main'||entry.sshHost!=='hk-main-codex'||entry.user!=='codex'||paths.root!=='/home/codex/qisheng'))throw Error('User service target identity differs from the authorized workspace');
 return Object.freeze({id:name,...entry,services,paths,publicSites:Object.freeze({...configuration.publicSites})});
}
export function parseDeploymentTargetArgs(argv){
 const args=[];let name;
 for(let i=0;i<argv.length;i++){
  const argument=argv[i];
  if(argument==='--target'||argument.startsWith('--target=')){
   if(name!==undefined)throw Error('Pass --target only once');
   name=argument==='--target'?argv[++i]:argument.slice(9);
   if(!name||name.startsWith('-'))throw Error('--target requires a configured target name');
  }else args.push(argument);
 }
 return{target:resolveDeploymentTarget(name),args};
}
export const shellQuote=value=>"'"+String(value).replaceAll("'","'\\''")+"'";
export function deploymentRuntime(target){
 const user=target.services==='user',root=target.paths.root;
 return Object.freeze({root,sites:target.paths.sites,node:target.paths.node,api:target.paths.api,realtime:target.paths.realtime,services:target.services,
  apiPort:user?18788:8788,workerPorts:Object.freeze(user?[12567,12568,12569]:[2567,2568,2569]),
  apiConfig:user?root+'/config/production-api.json':root+'/leaderboard/config/production.json',
  serviceToken:user?root+'/config/realtime-service-token':root+'/leaderboard/config/realtime-service-token',
  systemctl:Object.freeze(user?['systemctl','--user']:['sudo','-n','systemctl']),
  units:Object.freeze(user?['qisheng-shadow-api.service','qisheng-shadow-realtime@1.service','qisheng-shadow-realtime@2.service','qisheng-shadow-realtime@3.service']:['qisheng-ranking.service','qisheng-realtime@w1.service','qisheng-realtime@w2.service','qisheng-realtime@w3.service'])});
}
export function sshArguments(target,command){
 // HostName pins the transport too: changing an alias cannot silently redirect a command.
 return['-o','BatchMode=yes','-o','ConnectTimeout=15','-o','HostName='+target.address,target.sshHost,...(command===undefined?[]:[command])];
}
export function scpArguments(target,source,destination){
 if(!destination.startsWith(target.paths.root+'/')||/[\r\n]/.test(destination))throw Error('SCP destination must be within the selected server workspace');
 return['-o','BatchMode=yes','-o','ConnectTimeout=15','-o','HostName='+target.address,'--',source,target.sshHost+':'+destination];
}
export function assertRemoteIdentity(target,identity){
 if(identity?.hostname!==target.hostname||identity?.address!==target.address)throw Error('Remote identity does not match target '+target.id+'; no mutation is permitted');
 if(target.services==='user'&&(identity.user!=='codex'||identity.uid===0))throw Error('User target must use the existing codex account');
 return{target:target.id,sshHost:target.sshHost,hostname:identity.hostname,address:identity.address,...(target.services==='user'?{user:identity.user,uid:identity.uid}:{})};
}
export function identityGuard(target){
 // Executed in the same SSH session as a mutation, before reading credentials or writing.
 return `python3 - <<'QS_TARGET_IDENTITY'\nimport os,socket,sys,pwd\nexpected_host=${JSON.stringify(target.hostname)}\nexpected_address=${JSON.stringify(target.address)}\nexpected_user=${JSON.stringify(target.services==='user'?'codex':'')}\nconnection=os.environ.get('SSH_CONNECTION','').split()\nactual_address=connection[2] if len(connection)==4 else ''\nif socket.gethostname()!=expected_host or actual_address!=expected_address or expected_user and (os.geteuid()==0 or pwd.getpwuid(os.geteuid()).pw_name!=expected_user):\n print('Remote deployment identity mismatch; command refused.',file=sys.stderr)\n sys.exit(73)\nQS_TARGET_IDENTITY\n[ $? -eq 0 ] || exit 73\n`;
}
export function guardedRemoteCommand(target,command){
 const text=Array.isArray(command)?command.map(shellQuote).join(' '):command;
 return 'bash -c '+shellQuote('set -euo pipefail\n'+identityGuard(target)+text);
}
export function guardedRemoteScript(target,script){return identityGuard(target)+script;}
export function localBinary(name){return process.platform==='win32'?(process.env.SystemRoot??'C:/Windows')+'/System32/OpenSSH/'+name+'.exe':name;}
export async function captureProcess(binary,args,input,spawnImpl=spawn){
 return new Promise((resolve,reject)=>{
  const child=spawnImpl(binary,args,{stdio:['pipe','pipe','pipe'],windowsHide:true});let output='',errors='';
  child.stdout.on('data',value=>output+=value);child.stderr.on('data',value=>errors+=value);
  child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(Error(path.basename(binary)+' failed ('+code+'): '+errors.slice(-800))));child.stdin.end(input);
 });
}
export async function verifyRemoteTarget(target,{capture=captureProcess}={}){
 const command="python3 -c "+shellQuote("import os,socket,json,pwd; c=os.environ.get('SSH_CONNECTION','').split(); print(json.dumps({'hostname':socket.gethostname(),'address':c[2] if len(c)==4 else '','user':pwd.getpwuid(os.geteuid()).pw_name,'uid':os.geteuid()}))");
 const value=JSON.parse((await capture(localBinary('ssh'),sshArguments(target,command))).trim());return assertRemoteIdentity(target,value);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const{target,args}=parseDeploymentTargetArgs(process.argv.slice(2));
 if(args.some(value=>!['--json','--verify'].includes(value)))throw Error('Use --target us|hk [--verify] [--json]');
 const identity=args.includes('--verify')?await verifyRemoteTarget(target):undefined;
 console.log(JSON.stringify({...target,identity,sshOptions:sshArguments(target).slice(0,-1)}));
}
