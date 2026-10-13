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
 return Object.freeze({id:name,...entry,paths:Object.freeze({...configuration.paths}),publicSites:Object.freeze({...configuration.publicSites})});
}
export function parseDeploymentTargetArgs(argv){
 const args=[];let name;
 for(let i=0;i<argv.length;i++){
  const argument=argv[i];
  if(argument==='--target'||argument.startsWith('--target=')){
   if(name!==undefined)throw Error('Pass --target only once');
   name=argument==='--target'?argv[++i]:argument.slice(9);
   if(!name||name.startsWith('-'))throw Error('--target requires us or hk');
  }else args.push(argument);
 }
 return{target:resolveDeploymentTarget(name),args};
}
export const shellQuote=value=>"'"+String(value).replaceAll("'","'\\''")+"'";
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
 return{target:target.id,sshHost:target.sshHost,hostname:identity.hostname,address:identity.address};
}
export function identityGuard(target){
 // Executed in the same SSH session as a mutation, before reading credentials or writing.
 return `python3 - <<'QS_TARGET_IDENTITY'\nimport os,socket,sys\nexpected_host=${JSON.stringify(target.hostname)}\nexpected_address=${JSON.stringify(target.address)}\nconnection=os.environ.get('SSH_CONNECTION','').split()\nactual_address=connection[2] if len(connection)==4 else ''\nif socket.gethostname()!=expected_host or actual_address!=expected_address:\n print('Remote deployment identity mismatch; command refused.',file=sys.stderr)\n sys.exit(73)\nQS_TARGET_IDENTITY\n[ $? -eq 0 ] || exit 73\n`;
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
 const command="python3 -c "+shellQuote("import os,socket,json; c=os.environ.get('SSH_CONNECTION','').split(); print(json.dumps({'hostname':socket.gethostname(),'address':c[2] if len(c)==4 else ''}))");
 const value=JSON.parse((await capture(localBinary('ssh'),sshArguments(target,command))).trim());return assertRemoteIdentity(target,value);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const{target,args}=parseDeploymentTargetArgs(process.argv.slice(2));
 if(args.some(value=>!['--json','--verify'].includes(value)))throw Error('Use --target us|hk [--verify] [--json]');
 const identity=args.includes('--verify')?await verifyRemoteTarget(target):undefined;
 console.log(JSON.stringify({...target,identity,sshOptions:sshArguments(target).slice(0,-1)}));
}
