// The same read-only server check is used before external proof and registration.
export const STATIC_V080_BACKEND_RELEASE_ID='20261012T161350Z-0.8.0';
export function staticSiteAuditSource(releaseId,backendReleaseId=STATIC_V080_BACKEND_RELEASE_ID){
 if(!/^\d{8}T\d{6}Z-0\.8\.0$/.test(releaseId)||backendReleaseId!==STATIC_V080_BACKEND_RELEASE_ID||releaseId===backendReleaseId)throw Error('Explicit static 0.8.0 release and retained account backend required');
 return String.raw`import{readFile,realpath}from'node:fs/promises';import{createRequire}from'node:module';
 const releaseId=${JSON.stringify(releaseId)},backendReleaseId=${JSON.stringify(backendReleaseId)},base='/srv/codex/sites',release=base+'/releases/'+releaseId,backend=base+'/releases/'+backendReleaseId;
 const state=JSON.parse(await readFile(base+'/state/'+releaseId+'.json','utf8')),manifest=JSON.parse(await readFile(release+'/manifest.json','utf8')),backendState=JSON.parse(await readFile(base+'/state/'+backendReleaseId+'.json','utf8'));
 const currentSites=await realpath(base+'/current'),currentApi=await realpath('/srv/codex/leaderboard/current'),currentRealtime=await realpath('/srv/codex/realtime/current');
 if(state.releaseId!==releaseId||state.status!=='published'||currentSites!==release||backendState.releaseId!==backendReleaseId||backendState.status!=='published'||currentApi!==backend+'/server-api'||currentRealtime!==backend+'/server-realtime')throw Error('Static sites or retained backend are no longer active');
 if(manifest.releaseId!==releaseId||manifest.version!=='0.8.0'||Object.hasOwn(manifest,'backend')||manifest.sites?.game!=='https://game.tianhw.top'||manifest.sites?.campus!=='https://zbqsgz.tianhw.top'||!Array.isArray(manifest.files)||manifest.files.some(row=>/^server-(api|realtime)\//.test(row.path)))throw Error('Expected sites-only release manifest');
 const apiVersion=JSON.parse(await readFile(currentApi+'/package.json','utf8')).version,realtimeVersion=JSON.parse(await readFile(currentRealtime+'/package.json','utf8')).version;
 if(apiVersion!=='0.8.0'||realtimeVersion!=='0.8.0')throw Error('Retained backend versions changed');
 const config=JSON.parse(await readFile('/srv/codex/leaderboard/config/production.json','utf8')),require=createRequire(currentApi+'/package.json'),Database=require('better-sqlite3'),db=new Database(config.dbPath,{readonly:true,fileMustExist:true});
 const schema=db.pragma('user_version',{simple:true}),integrity=db.pragma('quick_check',{simple:true}),foreignKeyViolations=db.pragma('foreign_key_check').length;db.close();
 if(schema!==6||integrity!=='ok'||foreignKeyViolations!==0)throw Error('Retained account database is not healthy');
 const serviceToken=(await readFile('/srv/codex/leaderboard/config/realtime-service-token','utf8')).trim(),statusResponse=await fetch('http://127.0.0.1:8788/internal/multiplayer/status',{headers:{'X-Service-Token':serviceToken},signal:AbortSignal.timeout(8000)});
 if(!statusResponse.ok)throw Error('Retained service status unavailable');const serviceStatus=await statusResponse.json();if(serviceStatus.maintenance!==false)throw Error('Retained backend is in maintenance');
 const audit={releaseId,backendReleaseId,state:state.status,manifestBackend:false,currentSites,currentApi,currentRealtime,apiVersion,realtimeVersion,schema,integrity,foreignKeyViolations,maintenance:serviceStatus.maintenance,combatRooms:serviceStatus.combatRooms,backendState:backendState.status,readOnly:true};
 `;
}
