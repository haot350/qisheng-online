import {readdir,lstat,readFile,writeFile,mkdir,copyFile,realpath} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const root=fileURLToPath(new URL('../',import.meta.url));
const fileSet=new Set();
const rootFiles=['.gitignore','AGENTS.md','README.md','LICENSE','CONTRIBUTING.md','SECURITY.md'];
const docs=['HANDOFF.md','architecture.md','development.md','admin.md','operations.md','roadmap.md','OPEN_SOURCE.md','DEMO.md','THIRD_PARTY.md'];
const code=/\.(?:[cm]?js|ts|tsx|css|scss|json|html|sql|sh|py|md|yml|yaml)$/;
const forbidden=/(?:^|\/)(?:node_modules|dist|build|release|releases|backups?|data|config|\.git|\.next|\.vinext|\.openai|\.sites-runtime|\.npm-cache|generated|assets|public|docs\/v[^/]*|[^/]*(?:备份|快照)[^/]*)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.(?:sqlite(?:3)?|db|log|cookies|png|jpe?g|webp|glb|blend|bin|mp3|wav|ogg|mp4|zip|7z|pdf)$/i;
const scriptLists={
 '校园共享模块':['build.mjs','lock-protection.mjs','sync-consumers.mjs'],
 '校园逃生游戏':['build-profile.mjs','build-profile-policy.mjs','dev-profile.mjs','private-npc-profile.mjs','assert-production-profile.mjs','build-map-cache-index.mjs','build-static-assets.mjs','sync-fresh-helper.mjs','package-release.mjs','npc-pose-release-v032.mjs','guard-static-release.mjs','guard-static-release.test.mjs','test-current.mjs','build-map.mjs','build-fairness-map-070.mjs','build-combat-map-071.mjs','combat-map-classification-071.mjs','map-path.mjs','spatial-split.mjs','nav-ring-clip.mjs'],
 '校园排行榜服务':['build.mjs','build-admin.mjs','dev-server.mjs','demo-server.mjs','migration-preflight.mjs','backup.mjs','restore.mjs','check-release.mjs'],
 '校园联机服务':['build.mjs','typecheck.mjs','demo-server.mjs','package-release.mjs','package-online-v062.mjs','package-capacity-v070.mjs','package-capacity-v071.mjs','loadtest.mjs'],
 '校园交互网站/site':['build-profile.mjs','dev-profile.mjs','build-static-assets.mjs','build-map-cache-index.mjs','sync-community-ui.mjs','sync-player-content.mjs','run-framework.mjs','execution-profile.mjs','clean-build-chunks.mjs','clean-build-chunks.test.mjs','serve-local.mjs','package-release.mjs','portable-zip.mjs','guard-static-release.mjs','guard-static-release.test.mjs','validate-static-styles.mjs','resource-loading.test.mjs','telemetry.test.mjs','build-verified.sh'],
 '校园服务器部署':['deployment-target.mjs','package-tools.mjs','map-cache-policy.mjs','html-cache-policy.mjs','admin-csp-policy.mjs','static-release-audit.mjs'],
};
async function add(relative,required=false){try{const info=await lstat(path.join(root,relative));if(!info.isFile()||info.isSymbolicLink())throw Error('Public input must be a regular file: '+relative);fileSet.add(relative.replaceAll('\\','/'));}catch(error){if(error.code==='ENOENT'&&!required)return;throw error;}}
async function sourceTree(relative){let entries;try{entries=await readdir(path.join(root,relative),{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
 for(const entry of entries){const file=relative+'/'+entry.name;if(forbidden.test(file)||entry.isDirectory()&&/^release/i.test(entry.name)||file.endsWith('/app/astra/logo.json'))continue;if(entry.isSymbolicLink())throw Error('Source symlink is not allowed: '+file);if(entry.isDirectory())await sourceTree(file);else if(entry.isFile()&&code.test(entry.name))await add(file);}
}
export async function listPublicSource(){fileSet.clear();for(const file of rootFiles)await add(file);for(const file of docs)await add('docs/'+file);await sourceTree('.github');
 for(const script of ['dev-demo.mjs','check-demo.mjs','public-source.mjs','collect-third-party-licenses.mjs'])await add('scripts/'+script);
 for(const entry of await readdir(path.join(root,'THIRD_PARTY_LICENSES')).catch(error=>{if(error.code==='ENOENT')return [];throw error;}))if(/LICENSE|NOTICE|licen[cs]e|notice|dependencies\.json/i.test(entry))await add('THIRD_PARTY_LICENSES/'+entry);
 for(const [module,scripts]of Object.entries(scriptLists)){
  const base='outputs/'+module;for(const file of ['README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','vite.production.config.ts','next.config.ts','next-env.d.ts','postcss.config.mjs','eslint.config.mjs','components.json'])await add(base+'/'+file);
  for(const dir of module==='校园交互网站/site'?['app','components','hooks','lib','tests']:module==='校园排行榜服务'?['src','tests','admin']:['src','tests'])await sourceTree(base+'/'+dir);
  for(const script of scripts)await add(base+'/scripts/'+script);
  if(module==='校园逃生游戏'){await add(base+'/index.html',true);await add(base+'/account/index.html',true);await add(base+'/demo/arena.json',true);await add(base+'/demo/public/anonymous-avatar.svg',true);}
  if(module==='校园交互网站/site')await add(base+'/index.html',true);
  const packageFile=path.join(root,base,'package.json');try{const manifest=JSON.parse(await readFile(packageFile,'utf8')),vendor=manifest.dependencies?.['@qisheng/shared'];if(vendor){if(!/^file:vendor\/qisheng-shared-\d+\.\d+\.\d+\.tgz$/.test(vendor))throw Error('Public consumers must pin a rebuildable shared vendor tarball: '+base);await add(base+'/'+vendor.slice(5),true);}}catch(error){if(error.code!=='ENOENT')throw error;}
 }
 await add('outputs/校园交互网站/README.md');await add('outputs/校园服务器部署/templates/local-demo.env.example',true);
 await add('outputs/校园逃生游戏/scripts/legacy/characters.ts',true);
 return [...fileSet].sort();
}
function checkVendor(bytes,name){const archive=gunzipSync(bytes);let offset=0,count=0;while(offset+512<=archive.length){const header=archive.subarray(offset,offset+512);if(header.every(byte=>byte===0))break;const entry=header.subarray(0,100).toString().replace(/\0.*$/s,''),size=parseInt(header.subarray(124,136).toString().replace(/\0.*$/s,'').trim()||'0',8),type=header[156];if(!Number.isFinite(size)||size<0||!entry.startsWith('package/')||entry.split('/').includes('..')||entry.includes('\\')||![0,48,53].includes(type)||/\.(?:png|webp|jpe?g|glb|bin|blend|sqlite|log)$|(?:^|\/)\.(?:env|git)/i.test(entry))throw Error('Unsafe shared vendor entry in '+name+': '+entry);count++;offset+=512+Math.ceil(size/512)*512;}if(!count)throw Error('Empty shared vendor tarball: '+name);return count;}
async function check(files){let vendorEntries=0;for(const file of files){if(file.includes('..')||path.isAbsolute(file))throw Error('Unsafe public path: '+file);if(file.endsWith('.tgz'))vendorEntries+=checkVendor(await readFile(path.join(root,file)),file);else if(forbidden.test(file)&&!file.endsWith('/templates/local-demo.env.example')&&!file.endsWith('/demo/public/anonymous-avatar.svg'))throw Error('Private asset path in public whitelist: '+file);if(/\/npc-(?:contours|layout(?:-v13|-motion|-combat)?)\.ts$/.test(file)){const source=await readFile(path.join(root,file),'utf8');if(/preserved PNG masters|calibrated pixel regions|native pixel regions|per-pose alpha bounds|"rows"\s*:\s*\[|PNG母版|原有母版参考/.test(source)||source.length>1000)throw Error('Photograph-derived NPC calibration cannot enter public source: '+file);}}console.log(JSON.stringify({ok:true,files:files.length,sharedVendorEntries:vendorEntries,policy:'explicit-source-whitelist',note:'Path/archive and private-NPC payload check; maintainers must also review source for sensitive literals.'}));}
const command=process.argv[2]??'--list';if(fileURLToPath(import.meta.url)===path.resolve(process.argv[1]??'')){
 const files=await listPublicSource();
 if(command==='--list')console.log(files.join('\n'));
 else if(command==='--check')await check(files);
 else if(command==='--write-ignore'){
  const directories=new Set();for(const file of files){const parts=file.split('/');parts.pop();let current='';for(const part of parts){current+=(current?'/':'')+part;directories.add(current);}}
  const text='# Default deny. Regenerate with node scripts/public-source.mjs --write-ignore.\n/*\n'+[...directories].sort().map(dir=>'!/'+dir+'/\n/'+dir+'/*').join('\n')+'\n'+files.map(file=>'!/'+file).join('\n')+'\n';await writeFile(path.join(root,'.gitignore'),text);console.log('Wrote explicit public-source .gitignore for '+files.length+' files.');
 }else if(command==='--export'){
  await check(files);const destination=path.resolve(process.argv[3]??'');if(!process.argv[3]||destination===path.resolve(root)||path.relative(root,destination).startsWith('..')===false)throw Error('Export to a separate empty review directory outside this workspace.');await mkdir(destination,{recursive:true});if((await readdir(destination)).length)throw Error('Export destination must be empty.');const resolved=await realpath(destination);for(const file of files){const target=path.resolve(resolved,file);if(!target.startsWith(resolved+path.sep))throw Error('Export path escaped review directory.');await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,file),target);}console.log('Exported '+files.length+' white-listed files to '+resolved);
 }else throw Error('Usage: node scripts/public-source.mjs [--list|--check|--write-ignore|--export <empty-directory>]');
}
