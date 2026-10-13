import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const safeLogical=url=>typeof url==='string'&&/^\/(?!\/)[^?#%\\]+$/.test(url)&&!url.split('/').some(p=>p==='.'||p==='..');
export function validateResourceIndex(index,manifestUrl){
 if(!index||index.schema!==1||index.manifest?.url!==manifestUrl||!/^[a-f0-9]{64}$/.test(index.manifest.sha256)||!index.resources||typeof index.resources!=='object'||Array.isArray(index.resources))throw Error('Invalid versioned map resource index');
 const rows=Object.entries(index.resources);if(!rows.length)throw Error('Empty map resource index');
 for(const [logical,r]of rows){if(!safeLogical(logical)||!r||!/^[a-f0-9]{64}$/.test(r.sha256)||typeof r.url!=='string'||r.url!='/assets/map/'+r.sha256+'.'+r.url.split('.').at(-1)||!/^\/assets\/map\/[a-f0-9]{64}\.[a-z0-9]+$/.test(r.url)||!Number.isSafeInteger(r.bytes)||r.bytes<=0||typeof r.mime!=='string'||!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(r.mime))throw Error('Invalid map resource binding: '+logical);}
 return rows;
}
export async function verifyMapCache(base,read){
 const response=await read(base+'/map/resource-index.json');if(!/no-store/.test(response.headers.get('cache-control')??''))throw Error('Map resource index must not be cached');
 const index=await response.json(),manifestUrl=base==='https://game.tianhw.top'?'/map/manifest.json':'/campus.manifest.json',rows=validateResourceIndex(index,manifestUrl),manifest=await read(base+manifestUrl);
 if(!/no-store/.test(manifest.headers.get('cache-control')??''))throw Error('Map manifest must not be cached');if(sha(Buffer.from(await manifest.arrayBuffer()))!==index.manifest.sha256)throw Error('Map index is not bound to current manifest bytes');
 const samples=[];for(const ext of ['glb','bin']){const row=rows.find(([,r])=>r.url.endsWith('.'+ext));if(row)samples.push(row);}if(!samples.length)samples.push(rows[0]);
 for(const [logical,r]of samples){const asset=await read(base+r.url),cache=asset.headers.get('cache-control')??'';if(!cache.includes('max-age=31536000')||!cache.includes('immutable'))throw Error('Hashed map resource is not immutable');if(asset.headers.get('content-type')?.split(';')[0]!==r.mime)throw Error('Incorrect map resource MIME');const bytes=Buffer.from(await asset.arrayBuffer());if(bytes.length!==r.bytes||sha(bytes)!==r.sha256)throw Error('Hashed map resource bytes do not match index');const original=await read(base+logical,200,{method:'HEAD'});if(!/no-store/.test(original.headers.get('cache-control')??''))throw Error('Legacy logical map URL must not be immutable');}
 const first=samples[0][1],last=Math.min(first.bytes-1,15),range=await read(base+first.url,206,{headers:{Range:'bytes=0-'+last}});if(range.headers.get('content-range')!=='bytes 0-'+last+'/'+first.bytes||(await range.arrayBuffer()).byteLength!==last+1)throw Error('Map resource range response is invalid');
 return{resources:rows.length,verifiedSamples:samples.map(([logical,r])=>({logical,url:r.url,bytes:r.bytes,sha256:r.sha256})),range:true,manifestBound:true};
}

export function requiresMapCache(version){
 if(typeof version!=='string'||!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid release version');
 const [major,minor,patch]=version.split('.').map(Number);return major>0||minor>6||minor===6&&patch>=1;
}
export function validatePackagedMap(index,manifestUrl,files,prefix){
 const rows=validateResourceIndex(index,manifestUrl),byPath=new Map(files.map(f=>[f.path,f]));
 const bound=byPath.get(prefix+manifestUrl);if(!bound||bound.sha256!==index.manifest.sha256)throw Error('Map index does not match packaged manifest: '+prefix);
 for(const [logical,r]of rows)for(const url of [logical,r.url]){const file=byPath.get(prefix+url);if(!file||file.sha256!==r.sha256||file.size!==r.bytes)throw Error('Map resource binding mismatch: '+prefix+url);}
 return{resources:rows.length,manifestBound:true};
}

export const REALTIME_MAP_FILES=['manifest.json','collision.bin','navigation.bin','vision.bin'];
export function requiresReleaseRealtimeMap(version){const [major,minor]=String(version).split('.').map(Number);return major>0||minor>=7;}
export function mapIdentityFromIndex(manifest,index){
 validateResourceIndex(index,'/map/manifest.json');
 const urls={collisionHash:manifest.collisionUrl,navigationHash:manifest.navmeshUrl??manifest.navigationUrl,visionHash:manifest.visionUrl};
 const identity={sourceVersion:manifest.sourceVersion??manifest.source,manifestHash:index.manifest.sha256};
 if(typeof identity.sourceVersion!=='string'||!identity.sourceVersion)throw Error('Missing map source identity');
 for(const [key,url]of Object.entries(urls)){if(key==='visionHash'&&!url)continue;const row=index.resources[url];if(!row)throw Error('Missing indexed realtime map resource: '+key);identity[key]=row.sha256;}
 return identity;
}
export function assertSameMapIdentity(actual,expected){
 for(const key of ['sourceVersion','manifestHash','collisionHash','navigationHash','visionHash'])if(actual?.[key]!==expected?.[key])throw Error('Realtime map identity mismatch: '+key);
 return true;
}
export async function validatePackagedRealtimeMap(root,read){
 const [gameBytes,indexBytes,...serverBytes]=await Promise.all([read(root+'/game/map/manifest.json'),read(root+'/game/map/resource-index.json'),...REALTIME_MAP_FILES.map(name=>read(root+'/server-realtime/assets/map/'+name))]);
 const manifest=JSON.parse(gameBytes.toString()),index=JSON.parse(indexBytes.toString()),identity=mapIdentityFromIndex(manifest,index);
 if(!identity.visionHash)throw Error('Release-bound realtime map requires vision data');
 if(sha(gameBytes)!==index.manifest.sha256||sha(serverBytes[0])!==identity.manifestHash)throw Error('Realtime map manifest does not match game');
 for(const [i,key]of [[1,'collisionHash'],[2,'navigationHash'],[3,'visionHash']])if(sha(serverBytes[i])!==identity[key])throw Error('Realtime map bytes do not match game: '+key);
 const serverManifest=JSON.parse(serverBytes[0].toString());if(serverManifest.collisionUrl!=='/map/collision.bin'||(serverManifest.navmeshUrl??serverManifest.navigationUrl)!=='/map/navigation.bin'||serverManifest.visionUrl!=='/map/vision.bin')throw Error('Unexpected realtime map file paths');
 return identity;
}
export async function verifyRealtimeWorkersMap(identity,fetcher=fetch){
 for(const port of [2567,2568,2569]){const response=await fetcher('http://127.0.0.1:'+port+'/map-identity',{signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('Worker map identity unavailable: '+port);assertSameMapIdentity(await response.json(),identity);}
}
export function selectCompatibleRollbackRealtime(previous,siteVersion,realtimeVersion,{operationalFallback=false}={}){
 if(!previous||siteVersion!==realtimeVersion)throw Error('Rollback realtime must match restored static version');
 const [major,minor,patch]=String(siteVersion).split('.').map(Number);
 if(operationalFallback&&major===0&&(minor<6||minor===6&&patch<9))throw Error('Rollback target lacks compatible operational realtime guards');
 return previous;
}
