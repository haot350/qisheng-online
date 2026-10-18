#!/usr/bin/env node
// Independent native archives; no database, web symlink, service or retention mutation.
import {readFile,writeFile,stat,lstat,realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalProtocolVersion} from './release-protocol.mjs';
import {mapIdentityFromIndex} from './map-cache-policy.mjs';
import {nativeReleaseEntry,nativeSourceHash,NATIVE_IDENTITY_FIELDS} from './native-release-policy.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),outputs=path.resolve(here,'../..');
const args=process.argv.slice(2),flags=new Set(['--check','--publish','--allow-android']);
const options={};for(let i=0;i<args.length;i++){const key=args[i];if(flags.has(key)){if(options[key])throw Error('Duplicate option '+key);options[key]=true;}else if(['--qa','--package','--target','--report'].includes(key)){if(options[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing or duplicate '+key);options[key]=args[++i];}else throw Error('Unknown option '+key);}
if(!options['--qa']||!options['--package']||options['--check']&&options['--publish'])throw Error('Use --qa <receipt.json> --package <archive.zip|apk> [--check | --publish] [--target <name>] [--report <receipt.json>]. Default is --check.');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fileHash(file){const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);return hash.digest('hex');}
const qaPath=path.resolve(options['--qa']),packagePath=path.resolve(options['--package']);
if((await lstat(packagePath)).isSymbolicLink()||!(await stat(packagePath)).isFile())throw Error('Native package must be a regular file, not a symbolic link');
const qaBytes=await readFile(qaPath);if(qaBytes.length>131072)throw Error('Native acceptance receipt is too large');
const qa=JSON.parse(qaBytes.toString('utf8'));
const manifest=JSON.parse(await readFile(path.join(outputs,'校园逃生游戏/public/map/manifest.json'),'utf8'));
const index=JSON.parse(await readFile(path.join(outputs,'校园逃生游戏/public/map/resource-index.json'),'utf8'));
const mapIdentity=mapIdentityFromIndex(manifest,index);
for(const [key,url]of [['collisionHash',manifest.collisionUrl],['navigationHash',manifest.navmeshUrl??manifest.navigationUrl],['visionHash',manifest.visionUrl]])if(!url||await fileHash(path.join(outputs,'校园逃生游戏/public',url))!==mapIdentity[key])throw Error('Canonical raw map bytes do not match indexed '+key);
const protocolVersion=canonicalProtocolVersion(await readFile(path.join(outputs,'校园共享模块/src/protocol.ts'),'utf8'));
const artifact={name:path.basename(packagePath),bytes:(await stat(packagePath)).size,sha256:await fileHash(packagePath)};
const sourceHash=await nativeSourceHash(path.join(outputs,'齐盛原生客户端'),mapIdentity);
const entry=nativeReleaseEntry(qa,{protocolVersion,mapIdentity,artifact,sourceHash,allowAndroid:!!options['--allow-android']});
const packageMetadata=JSON.parse(await readFile(packagePath+'.json','utf8'));
if(packageMetadata.schema!==1||packageMetadata.kind!=='native-package'||packageMetadata.profile!=='production'||packageMetadata.stage!=='preview-candidate'||packageMetadata.platform!==qa.platform||packageMetadata.version!==qa.version||packageMetadata.sourceHash!==sourceHash||packageMetadata.protocolVersion!==protocolVersion||packageMetadata.artifact?.bytes!==artifact.bytes||packageMetadata.artifact?.sha256!==artifact.sha256||NATIVE_IDENTITY_FIELDS.some(key=>packageMetadata.mapIdentity?.[key]!==mapIdentity[key]))throw Error('An inspected preview-candidate package sidecar is required; internal/demo packages cannot be published');
if(sha(await readFile(path.join(outputs,'校园逃生游戏/public/map/manifest.json')))!==mapIdentity.manifestHash)throw Error('Canonical map manifest does not match its resource index');
const evidenceRoot=path.dirname(qaPath);
for(const test of qa.tests){
 if(path.isAbsolute(test.evidence)||test.evidence.indexOf(String.fromCharCode(92))>=0||test.evidence.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('Evidence must be a safe relative path under the acceptance directory: '+test.id);
 const file=path.resolve(evidenceRoot,test.evidence),canonical=await realpath(file),relative=path.relative(await realpath(evidenceRoot),canonical);
 if(relative.startsWith('..')||path.isAbsolute(relative)||!(await stat(canonical)).isFile()||await fileHash(canonical)!==test.evidenceSha256)throw Error('Native evidence is missing, outside the receipt directory or changed: '+test.id);
}
const result={checked:true,published:false,platform:qa.platform,version:qa.version,sourceHash,...entry,acceptanceSha256:sha(qaBytes),checks:qa.tests.map(test=>test.id)};
if(!options['--publish']){if(options['--report'])await writeFile(path.resolve(options['--report']),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));process.exit(0);}
const targetTools=await import('./deployment-target.mjs');
const {resolveDeploymentTarget,verifyRemoteTarget,captureProcess,localBinary,sshArguments,scpArguments,guardedRemoteScript,shellQuote}=targetTools;
const target=resolveDeploymentTarget(options['--target']);await verifyRemoteTarget(target);
if(!/^\/[A-Za-z0-9_./-]+$/.test(target.paths.root)||target.paths.root==='/'||target.paths.root.split('/').includes('..'))throw Error('Unsafe deployment workspace');
const remoteBase=target.paths.root+'/native';
const remoteProgram=await readFile(new URL('./native-publish-remote.py',import.meta.url),'utf8');
async function remote(action,values={}){
 const payload=Buffer.from(JSON.stringify({base:remoteBase,action,...values})).toString('base64');
 const script='set -euo pipefail\numask 077\npython3 - '+shellQuote(payload)+" <<'QS_NATIVE_PUBLISH'\n"+remoteProgram+'\nQS_NATIVE_PUBLISH\n';
 return JSON.parse((await captureProcess(localBinary('ssh'),sshArguments(target,'bash -s'),guardedRemoteScript(target,script))).trim());
}
const origin=new URL(target.publicSites.game);if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.username||origin.password)throw Error('Native public origin must be the configured HTTPS game origin');
async function response(route,headers={}){return fetch(new URL(route,origin),{redirect:'error',headers,signal:AbortSignal.timeout(30000)});}
const sameEntry=(actual,expected)=>actual?.available===true&&['version','protocolVersion','downloadUrl','bytes','sha256','minimumOS'].every(key=>actual[key]===expected[key])&&NATIVE_IDENTITY_FIELDS.every(key=>actual.mapIdentity?.[key]===expected.mapIdentity[key])&&JSON.stringify(actual.notes)===JSON.stringify(expected.notes);
let stage,activated;
try{
 stage=await remote('stage');
 await captureProcess(localBinary('scp'),scpArguments(target,packagePath,stage.file));
 await remote('install',{source:stage.file,name:artifact.name,entry});
 const download=await response(entry.downloadUrl,{Range:'bytes=0-15'});
 if(download.status!==206||download.headers.get('content-range')!=='bytes 0-15/'+entry.bytes||!/^public,.*max-age=31536000.*immutable/.test(download.headers.get('cache-control')??'')){await download.body?.cancel();throw Error('Native archive route or immutable Range check failed; manifest was not activated');}
 const rangeBytes=new Uint8Array(await download.arrayBuffer());if(rangeBytes.byteLength!==16)throw Error('Native archive Range size is invalid; manifest was not activated');
 activated=await remote('activate',{platform:qa.platform,entry,acceptanceSha256:result.acceptanceSha256});
 const status=await response('/api/v1/native/updates');const publicManifest=await status.json();
 if(!status.ok||!/no-store/.test(status.headers.get('cache-control')??'')||!sameEntry(publicManifest[qa.platform],entry))throw Error('Native API manifest is not configured, stale, cached or different; reverting only the manifest');
 Object.assign(result,{published:true,target:target.id,publishedAt:new Date().toISOString(),manifestSha256:activated.manifestSha256});
 if(options['--report'])await writeFile(path.resolve(options['--report']),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}catch(error){
 if(activated){try{await remote('rollback',activated);}catch(rollback){throw new AggregateError([error,rollback],'Native publication failed and concurrent manifest state requires review; no database or old archive was changed');}}
 throw error;
}finally{if(stage)await remote('cleanup',{folder:stage.folder}).catch(()=>console.error('Native upload staging needs cleanup; publication data unchanged.'));}
