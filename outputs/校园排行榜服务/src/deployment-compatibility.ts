import {readFileSync,realpathSync} from 'node:fs';
import {dirname,join} from 'node:path';
export type ExpectedWorker={version:string|null;releaseId:string|null;protocolVersion:string|null;manifestHash:string|null};
const read=(file:string)=>{try{return JSON.parse(readFileSync(file,'utf8'));}catch{return null;}};
export function readExpectedWorker(staticManifest:any,root='/srv/codex/realtime/current'):ExpectedWorker{
 let directory=root;try{directory=realpathSync(root);}catch{}
 const pkg=read(join(directory,'package.json')),release=read(join(dirname(directory),'manifest.json'));
 const source=staticManifest?.files?.find((f:any)=>f.path==='game/map/manifest.json');
 return {version:typeof pkg?.version==='string'?pkg.version:null,releaseId:typeof release?.releaseId==='string'?release.releaseId:null,protocolVersion:typeof staticManifest?.protocolVersion==='string'?staticManifest.protocolVersion:null,manifestHash:typeof source?.sha256==='string'?source.sha256:null};
}
export function compareWorkerCompatibility(actual:{version?:unknown;protocolVersion?:unknown;map?:any},expected:ExpectedWorker){
 const same=(a:unknown,b:unknown)=>typeof a==='string'&&typeof b==='string'?a===b:null;
 const checks={component:same(actual.version,expected.version),protocol:same(actual.protocolVersion,expected.protocolVersion),map:same(actual.map?.manifestHash,expected.manifestHash)};
 const values=Object.values(checks);return {compatible:values.includes(false)?false:values.every(v=>v===true)?true:null,checks};
}
