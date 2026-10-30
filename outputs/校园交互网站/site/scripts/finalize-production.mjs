import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {assertStaticReleasePath} from './guard-static-release.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=path.join(root,'public'),output=path.join(root,'dist/client');
const profile=JSON.parse(await readFile(path.join(output,'openqs-profile.json'),'utf8'));
if(profile.profile!=='production'||profile.application!=='campus')throw Error('Expected a completed campus production build.');
const hash=data=>createHash('sha256').update(data).digest('hex');
const manifestBytes=await readFile(path.join(source,'map/manifest.json'));
const indexBytes=await readFile(path.join(source,'map/resource-index.json'));
const index=JSON.parse(indexBytes);
if(index.manifest.url!=='/map/manifest.json'||index.manifest.sha256!==hash(manifestBytes))throw Error('Campus map index does not match the accepted manifest.');
const requested=new Map();
function include(url,expected){
 if(typeof url!=='string'||!url.startsWith('/')||url.includes('..')||url.includes('\\'))throw Error('Invalid public resource path.');
 const relative=url.slice(1);assertStaticReleasePath(relative);
 const previous=requested.get(relative);if(previous&&expected&&previous!==expected)throw Error('Conflicting resource hash.');
 requested.set(relative,expected??previous);
}
include('/map/manifest.json',hash(manifestBytes));include('/map/resource-index.json',hash(indexBytes));
for(const [logical,resource] of Object.entries(index.resources)){include(logical,resource.sha256);include(resource.url,resource.sha256);}
const staticAssets=JSON.parse(await readFile(path.join(root,'lib/generated/static-assets.json'),'utf8'));
for(const url of Object.values(staticAssets)){include(url,path.basename(url).match(/^([a-f0-9]{64})\./)?.[1]);}
for(const url of ['/favicon.svg','/_headers','/spaces.json'])if(await stat(path.join(source,url)).catch(()=>null))include(url);
let bytes=0;
for(const [relative,expected] of requested){
 const data=await readFile(path.join(source,relative));if(expected&&hash(data)!==expected)throw Error('Resource checksum failed: '+relative);
 const target=path.join(output,relative);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(source,relative),target);bytes+=data.length;
}
// The current site resolves all map content through this single accepted index.
await writeFile(path.join(output,'openqs-profile.json'),JSON.stringify(profile)+'\n');
console.log(JSON.stringify({application:'campus',profile:'production',files:requested.size,bytes,mapManifestSha256:index.manifest.sha256,mapCatalogId:JSON.parse(manifestBytes).mapCatalogId}));
