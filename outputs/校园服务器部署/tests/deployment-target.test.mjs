import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const configuration={defaultTarget:'hk',paths:{root:'/srv/codex',sites:'/srv/codex/sites',api:'/srv/codex/leaderboard',realtime:'/srv/codex/realtime',node:'/opt/qisheng-node/current/bin/node'},publicSites:{game:'https://game.tianhw.top',campus:'https://zbqsgz.tianhw.top'},targets:{us:{sshHost:'fixture-us',address:'192.0.2.1',hostname:'fixture-us.example'},hk:{sshHost:'fixture-hk',address:'192.0.2.2',hostname:'fixture-hk.example'}}};
const configurationDirectory=await mkdtemp(path.join(os.tmpdir(),'target-config-')),configurationFile=path.join(configurationDirectory,'deployment-targets.json');
await writeFile(configurationFile,JSON.stringify(configuration));after(()=>rm(configurationDirectory,{recursive:true,force:true}));
const previousConfiguration=process.env.OPENQS_DEPLOYMENT_TARGET_CONFIG;
process.env.OPENQS_DEPLOYMENT_TARGET_CONFIG=configurationFile;
const {resolveDeploymentTarget,parseDeploymentTargetArgs,sshArguments,scpArguments,verifyRemoteTarget,identityGuard,guardedRemoteCommand}=await import('../scripts/deployment-target.mjs');
const {publishArchive}=await import('../scripts/publish-release.mjs');
const {verifiedReportTarget}=await import('../scripts/register-verified-deployment.mjs');
const {pullBackup}=await import('../../校园排行榜服务/scripts/pull-backup.mjs');
const {rollbackRelease}=await import('../scripts/rollback-release.mjs');
if(previousConfiguration===undefined)delete process.env.OPENQS_DEPLOYMENT_TARGET_CONFIG;else process.env.OPENQS_DEPLOYMENT_TARGET_CONFIG=previousConfiguration;

test('default comes from the configured fixture; US and HK use separate pinned aliases',()=>{
 assert.equal(resolveDeploymentTarget().id,configuration.defaultTarget);assert.equal(resolveDeploymentTarget('us').sshHost,'fixture-us');
 const hk=resolveDeploymentTarget('hk');assert.equal(hk.sshHost,'fixture-hk');assert.equal(hk.address,'192.0.2.2');assert.equal(hk.hostname,'fixture-hk.example');
 assert.deepEqual(hk.publicSites,resolveDeploymentTarget('us').publicSites);assert.deepEqual(hk.paths,resolveDeploymentTarget('us').paths);
});
test('explicit target works before or after positional CLI arguments',()=>{
 assert.deepEqual(parseDeploymentTargetArgs(['--target','hk','id','0.7.0']).args,['id','0.7.0']);
 assert.equal(parseDeploymentTargetArgs(['id','--target=hk','--register']).target.id,'hk');
 assert.deepEqual(parseDeploymentTargetArgs(['id','--target=hk','--register']).args,['id','--register']);
});
test('missing, duplicate and unknown target arguments fail closed',()=>{
 for(const args of [['--target'],['--target','--register'],['--target','hk','--target','us'],['--target='],['--target=elsewhere']])assert.throws(()=>parseDeploymentTargetArgs(args));
});
test('SSH and SCP pin the chosen address regardless of alias config; SCP rejects out-of-workspace destinations',()=>{
 const hk=resolveDeploymentTarget('hk');assert(sshArguments(hk,'hostname').includes('HostName=192.0.2.2'));
 const scp=scpArguments(hk,'local.tar.gz','/srv/codex/sites/incoming/release.tar.gz');assert(scp.includes('HostName=192.0.2.2'));assert.equal(scp.at(-1),'fixture-hk:/srv/codex/sites/incoming/release.tar.gz');
 assert.throws(()=>scpArguments(hk,'file','/etc/file'));
});
test('probe rejects a wrong hostname or actual SSH destination address',async()=>{
 const hk=resolveDeploymentTarget('hk');let commands=[];
 const capture=async(binary,args)=>{commands.push(args);return JSON.stringify({hostname:hk.hostname,address:hk.address});};
 assert.equal((await verifyRemoteTarget(hk,{capture})).target,'hk');assert(commands[0].includes('fixture-hk'));
 for(const bad of [{hostname:'fixture-us.example',address:hk.address},{hostname:hk.hostname,address:'192.0.2.1'},{hostname:hk.hostname,address:''}])await assert.rejects(verifyRemoteTarget(hk,{capture:async()=>JSON.stringify(bad)}),/identity/);
});
test('the actual same-session Python identity guard rejects mismatches before a subsequent mutation',()=>{
 const hk=resolveDeploymentTarget('hk'),python=identityGuard(hk).split("QS_TARGET_IDENTITY'\n")[1].split('\nQS_TARGET_IDENTITY')[0];
 for(const [hostname,address,expected] of [[hk.hostname,hk.address,0],['wrong',hk.address,73],[hk.hostname,'192.0.2.1',73],[hk.hostname,'',73]]){
  const script='import socket,os\nsocket.gethostname=lambda:'+JSON.stringify(hostname)+'\nos.environ["SSH_CONNECTION"]='+JSON.stringify('127.0.0.1 5000 '+address+' 22')+'\n'+python+'\nprint("MUTATION_ALLOWED")\n';
  const result=spawnSync('python',['-c',script],{encoding:'utf8',windowsHide:true});assert.ifError(result.error);assert.equal(result.status,expected);assert.equal(result.stdout.includes('MUTATION_ALLOWED'),expected===0);
 }
 assert(guardedRemoteCommand(hk,['bash','/srv/codex/sites/tools/publish-server.sh']).includes('Remote deployment identity mismatch'));
});
test('wrong identity stops archive publication before mkdir, upload or activation',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'target-release-')),archive=path.join(root,'20261010T000000Z-0.7.0.tar.gz');await writeFile(archive,'local fixture');let commands=[];
 try{await assert.rejects(publishArchive({archive,target:resolveDeploymentTarget('hk'),verifyTarget:async()=>{throw Error('identity mismatch');},runCommand:async(...args)=>commands.push(args)}),/identity/);assert.equal(commands.length,0);}finally{await rm(root,{recursive:true,force:true});}
});
test('HK archive publication sends all three operations only to pinned HK and guards both mutations',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'target-release-')),archive=path.join(root,'20261010T000000Z-0.7.0.tar.gz');await writeFile(archive,'local fixture');let commands=[];
 try{await publishArchive({archive,target:resolveDeploymentTarget('hk'),verifyTarget:async()=>{},runCommand:async(...args)=>commands.push(args)});assert.equal(commands.length,3);for(const [,args]of commands){assert(args.includes('HostName=192.0.2.2'));assert(!args.some(arg=>arg.includes('fixture-us')));}assert(commands[0][1].at(-1).includes('Remote deployment identity mismatch'));assert(commands[2][1].at(-1).includes('Remote deployment identity mismatch'));assert(commands[2][1].at(-1).includes('--publish'));}finally{await rm(root,{recursive:true,force:true});}
});
test('Verify mode checks identity and skips upload; malformed mode is rejected before any remote call',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'target-release-')),archive=path.join(root,'20261010T000000Z-0.7.0.tar.gz');await writeFile(archive,'local fixture');let calls=[];
 try{await publishArchive({archive,mode:'Verify',target:resolveDeploymentTarget('hk'),verifyTarget:async()=>calls.push('identity'),runCommand:async(binary,args)=>calls.push(args)});assert.equal(calls.length,2);assert(calls[1].at(-1).includes('--verify'));await assert.rejects(publishArchive({archive,mode:'Wrong',runCommand:async()=>assert.fail('must not run')}),/mode/);}finally{await rm(root,{recursive:true,force:true});}
});
test('deployment registration never accepts US verification as HK verification, even for the same release',()=>{
 const us=resolveDeploymentTarget('us'),hk=resolveDeploymentTarget('hk');verifiedReportTarget({},us);
 assert.throws(()=>verifiedReportTarget({},hk),/another deployment/);
 assert.throws(()=>verifiedReportTarget({deploymentTarget:{id:'us',hostname:us.hostname,address:us.address}},hk));
 verifiedReportTarget({deploymentTarget:{id:'hk',hostname:hk.hostname,address:hk.address}},hk);
});
test('backup pulling follows HK identity and preserves the validated filename',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'target-backup-')),target=resolveDeploymentTarget('hk'),calls=[];
 try{const result=await pullBackup({target,destination:directory,verifyTarget:async selected=>assert.equal(selected.id,'hk'),capture:async(binary,args)=>{calls.push(args);return calls.length===1?' {"file":"ranking-20261010T120000Z.sqlite"} ':'';}});assert.equal(result.target,'hk');assert.equal(path.basename(result.file),'ranking-20261010T120000Z.sqlite');assert.equal(calls.length,2);for(const args of calls)assert(args.includes('HostName=192.0.2.2'));assert(calls[1].some(value=>value.startsWith('fixture-hk:/srv/codex/leaderboard/backups/')));}finally{await rm(directory,{recursive:true,force:true});}
});
test('backup filename traversal or wrong identity never initiates file copying',async()=>{
 let calls=0;await assert.rejects(pullBackup({target:resolveDeploymentTarget('hk'),verifyTarget:async()=>{},capture:async()=>{calls++;return'{"file":"../../production.json"}';}}),/filename/);assert.equal(calls,1);
 await assert.rejects(pullBackup({target:resolveDeploymentTarget('hk'),verifyTarget:async()=>{throw Error('identity');},capture:async()=>assert.fail('must not copy')}),/identity/);
});
test('rollback uses the chosen pinned target and cannot run after an identity mismatch',async()=>{
 const target=resolveDeploymentTarget('hk'),calls=[];
 await rollbackRelease({id:'20261010T000000Z-0.7.0',target,verifyTarget:async()=>{},capture:async(binary,args)=>{calls.push(args);return'rollback fixture';}});
 assert.equal(calls.length,1);assert(calls[0].includes('HostName=192.0.2.2'));assert(calls[0].at(-1).includes('/tools/rollback-server.sh'));assert(calls[0].at(-1).includes('Remote deployment identity mismatch'));
 await assert.rejects(rollbackRelease({id:'20261010T000000Z-0.7.0',target,verifyTarget:async()=>{throw Error('identity');},capture:async()=>assert.fail('must not mutate')}),/identity/);
});

