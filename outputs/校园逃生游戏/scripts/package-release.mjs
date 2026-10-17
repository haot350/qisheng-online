import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {createPortableZip} from '../../校园交互网站/site/scripts/portable-zip.mjs';
import { fileURLToPath } from 'node:url';
import {NPC_IDS,NPC_IDENTITY,NPC_COMBAT_POSES,npcPoseFilename,ESCAPE_INITIAL_NPCS,ESCAPE_TOTAL_NPCS} from '../src/npc-roster.ts';
const NPC_POSE_WEBPS=NPC_IDS.flatMap(id=>NPC_IDENTITY[id].poses.flatMap(pose=>[false,true].map(mobile=>npcPoseFilename(id,pose,mobile).slice(1))));
const NPC_POSE_WEBP_COUNT=NPC_POSE_WEBPS.length;
const NPC_LOCOMOTION_POSES=NPC_COMBAT_POSES.filter(pose=>pose!=='reload');
import {assertStaticReleasePath} from './guard-static-release.mjs';
import {assertProductionProfile} from './assert-production-profile.mjs';

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseVersion = JSON.parse(await fs.readFile(path.join(gameRoot, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(releaseVersion)) throw new Error('The public preview package version must be a numeric SemVer.');
const releaseLabel = `Preview ${releaseVersion}`;
const distRoot = path.join(gameRoot, 'dist');
await assertProductionProfile(distRoot);
const publicRoot = path.join(gameRoot, 'public');
const releaseRoot = path.join(gameRoot, 'release');
const pagesExport=process.argv.slice(2).includes('--pages');
const packageName=pagesExport?`Cloudflare-Pages-game-v${releaseVersion}`:`qisheng-game-v${releaseVersion}`;
const stageRoot = path.join(releaseRoot, packageName);
const zipPath = path.join(gameRoot, packageName+'.zip');
const tempZip = path.join(releaseRoot, packageName+'.pending.zip');
const reportPath = path.join(releaseRoot, `game-v${releaseVersion}-package-report.json`);
const limit = pagesExport?25 * 1024 * 1024:null;
const validateOnly = process.argv.slice(2).includes('--validate-only');
if (process.argv.slice(2).some(arg => !['--validate-only','--pages'].includes(arg))) throw new Error('Usage: node scripts/package-release.mjs [--validate-only] [--pages]');
function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
}
function checkedRelative(value) {
  const decoded = decodeURIComponent(value.split(/[?#]/, 1)[0]);
  if (!decoded.startsWith('/') || decoded.startsWith('//') || /[\\\0:]/.test(decoded) || decoded.split('/').includes('..')) throw new Error('Unsafe or external manifest URL: ' + value);
  const target = path.resolve(distRoot, '.' + decoded);
  if (!inside(distRoot, target)) throw new Error('Manifest path escapes dist: ' + value);
  return path.relative(distRoot, target).split(path.sep).join('/');
}
async function fileInfo(root, relative) {
  assertStaticReleasePath(relative);
  const absolute = path.resolve(root, relative);
  if (!inside(root, absolute)) throw new Error('Path escapes root: ' + relative);
  const info = await fs.lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Expected a regular file: ' + absolute);
  const resolved = await fs.realpath(absolute);
  if (!inside(await fs.realpath(root), resolved)) throw new Error('Symlink path escapes root: ' + absolute);
  if (!info.size) throw new Error('Empty file: ' + absolute);
  return { absolute, info };
}
async function walk(root, relative = '') {
  const found = [];
  for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symlinks are not allowed in release inputs: ' + child);
    if (entry.isDirectory()) found.push(...await walk(root, child));
    else if (entry.isFile()) found.push(child.split(path.sep).join('/'));
  }
  return found;
}
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const index = await fileInfo(distRoot, 'index.html');
if (!(await fs.readFile(index.absolute, 'utf8')).includes(releaseLabel)) throw new Error(`Game metadata must advertise ${releaseLabel}; run npm run build before packaging.`);
const manifestFile = await fileInfo(distRoot, 'map/manifest.json');
const manifestBuffer = await fs.readFile(manifestFile.absolute);
const currentManifest = await fs.readFile(path.join(publicRoot, 'map', 'manifest.json'));
if (hash(manifestBuffer) !== hash(currentManifest)) throw new Error('dist/map/manifest.json is stale. Finish the map work and run npm run build before packaging.');
const manifest = JSON.parse(manifestBuffer.toString('utf8'));
if (!Array.isArray(manifest.chunks) || !manifest.chunks.length || typeof manifest.collisionUrl !== 'string' || typeof manifest.navmeshUrl !== 'string') throw new Error('Incomplete map manifest: require chunks, collisionUrl and navmeshUrl.');
const manifestReferences = new Set();
function collectUrls(value, key = '') {
  if (typeof value === 'string' && /url$/i.test(key)) manifestReferences.add(checkedRelative(value));
  else if (Array.isArray(value)) value.forEach(item => collectUrls(item, key));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([childKey, child]) => collectUrls(child, childKey));
}
collectUrls(manifest);
for (const chunk of manifest.chunks) {
  if (typeof chunk.url !== 'string') throw new Error('A map chunk has no URL.');
  const relative = checkedRelative(chunk.url);
  const { info } = await fileInfo(distRoot, relative);
  if (typeof chunk.bytes === 'number' && chunk.bytes !== info.size) throw new Error('Manifest byte size mismatch: ' + relative);
}
const required = [
  ...['campus-a','campus-b','tactical-a','tactical-b'].map(id=>'avatars/v0.5.0/'+id+'.glb'),
  ...NPC_POSE_WEBPS, 'audio/run.mp3',
  'audio/escape-search.wav','audio/escape-combat.wav','audio/escape-extraction.wav','audio/escape-score.json',
  ...['glock','mp5','m4a1','ak47','r870','awm','m249'].flatMap(id=>[`weapons/${id}-near.glb`,`weapons/${id}-far.glb`]),
  'map/drive-v122.json','vehicles/bao5-v122.manifest.json','vehicles/bao5-v122.glb','images/dafei-guide.webp',
  'story/archive/manifest.json','story/camera/manifest.json',
];
// Include the complete public story tree, not just resources named with a URL
// key. Archive image/thumbnail keys, license files and mode-specific audio are
// all runtime resources, and lazy imports may gain assets after initial startup.
const storyFiles = (await walk(path.join(publicRoot, 'story'))).map(name => 'story/' + name);
if (!storyFiles.length) throw new Error(`The ${releaseLabel} story resource tree is empty.`);
const characterPoseWebps = required.filter(name => name.startsWith('characters/billboards/') && name.endsWith('.webp'));
if (characterPoseWebps.length !== NPC_POSE_WEBP_COUNT || new Set(characterPoseWebps).size !== NPC_POSE_WEBP_COUNT) throw new Error(`The current-character release must include exactly ${NPC_POSE_WEBP_COUNT} distinct pose WebPs, including desktop and mobile locomotion frames.`);
const drivingManifest=JSON.parse(await fs.readFile((await fileInfo(distRoot,'map/drive-v122.json')).absolute,'utf8'));
// Public preview numbering does not change the accepted v1.2.2 driving geometry.
if(drivingManifest.sourceSha256!==manifest.sourceSha256||!Array.isArray(drivingManifest.npcSpawns)||drivingManifest.npcSpawns.length!==4||drivingManifest.releaseVersion!=='1.2.2'||!Array.isArray(drivingManifest.npcRegions)||drivingManifest.npcRegions.length!==4)throw new Error('Driving manifest must match the campus source and contain four runtime slots.');
const carManifest=JSON.parse(await fs.readFile((await fileInfo(distRoot,'vehicles/bao5-v122.manifest.json')).absolute,'utf8'));
if(checkedRelative(carManifest.url)!=='vehicles/bao5-v122.glb'||carManifest.triangles>30000||carManifest.bytes!==(await fileInfo(distRoot,'vehicles/bao5-v122.glb')).info.size)throw new Error('Incomplete or mismatched vehicle manifest.');
const cameraManifest=JSON.parse(await fs.readFile((await fileInfo(distRoot,'story/camera/manifest.json')).absolute,'utf8'));
for(const asset of cameraManifest.assets??[]){const relative=checkedRelative(asset.url),data=await fs.readFile((await fileInfo(distRoot,relative)).absolute);if(data.length!==asset.bytes||hash(data)!==asset.sha256)throw new Error('Camera asset manifest mismatch: '+relative);}
if(cameraManifest.assets?.length!==2)throw new Error('Camera high/low LOD resources are required.');
const archiveManifest=JSON.parse(await fs.readFile((await fileInfo(distRoot,'story/archive/manifest.json')).absolute,'utf8'));
if(archiveManifest.photos?.length!==24)throw new Error('The release archive must contain 24 real photos.');
for(const photo of archiveManifest.photos){for(const [url,bytes]of [[photo.image,photo.bytes],[photo.thumbnail,photo.thumbnailBytes]]){const relative=checkedRelative(url);if((await fileInfo(distRoot,relative)).info.size!==bytes)throw new Error('Archive asset size mismatch: '+relative);}}
const realityManifest=JSON.parse(await fs.readFile((await fileInfo(distRoot,'story/reality/manifest.json')).absolute,'utf8'));
const discoveries=realityManifest.anchors?.filter(anchor=>anchor.enabled)??[];
if(realityManifest.version!==1||discoveries.length!==5||realityManifest.modelSha!==manifest.derivativeSha256)throw new Error('Five calibrated discoveries must reference the unchanged exported campus derivative.');
for(const anchor of discoveries){
  const original=archiveManifest.photos.find(photo=>photo.id===anchor.photoId);
  if(!original||anchor.sourceSha!==original.sourceSha||!anchor.validation?.walkable||!anchor.validation.geometry||anchor.landmarks?.length<6||anchor.landmarks.length>8||anchor.validation.visible<4||anchor.validation.median>.06||anchor.validation.p90>.12)throw new Error('Unvalidated reality discovery: '+anchor.id);
  for(const url of[anchor.image,anchor.thumbnail])await fileInfo(distRoot,checkedRelative(url));
}
const standalonePages=['account/index.html','credits/index.html','copyright/index.html'];
const copyFiles = new Set(['index.html', ...standalonePages, 'openqs-profile.json', 'map/manifest.json', 'map/resource-index.json', ...manifestReferences, ...required, ...storyFiles]);
for (const relative of await walk(distRoot)) {
  assertStaticReleasePath(relative);
  // Vite's complete hashed asset tree includes every asynchronous JS chunk and
  // imported image/audio/font dependency; filtering by extension is unsafe.
  if (relative.startsWith('assets/')) copyFiles.add(relative);
  if (relative.startsWith('story/')) copyFiles.add(relative);
  if (relative.startsWith('avatars/')) copyFiles.add(relative);
  if (relative.startsWith('branding/')) copyFiles.add(relative);
  if (relative.startsWith('credits/')||relative.startsWith('licenses/')) copyFiles.add(relative);
  if (relative === 'images/campus-overview.jpg') copyFiles.add(relative);
  if (['_headers', '_redirects', 'favicon.ico', 'favicon.svg', '404.html', 'robots.txt', 'manifest.webmanifest'].includes(relative)) copyFiles.add(relative);
}
const runtimePublic = [...copyFiles].filter(relative => !relative.startsWith('assets/') && relative !== 'index.html'&&!standalonePages.includes(relative));
let newestInput = { path: 'index.html', time: 0 };
for (const relative of [...await walk(path.join(gameRoot, 'src'))].map(name => 'src/' + name).concat(['index.html',...standalonePages,'vite.config.ts','tsconfig.json','package.json','package-lock.json'], runtimePublic.map(name => 'public/' + name))) {
  try {
    const info = await fs.stat(path.join(gameRoot, relative));
    if (info.mtimeMs > newestInput.time) newestInput = { path: relative, time: info.mtimeMs };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
if (index.info.mtimeMs + 1 < newestInput.time) throw new Error('dist is older than current input ' + newestInput.path + '. Run npm run build after all game work is complete.');
for (const relative of new Set([...manifestReferences, ...required, ...storyFiles])) {
  const built = await fs.readFile((await fileInfo(distRoot, relative)).absolute);
  const source = await fs.readFile((await fileInfo(publicRoot, relative)).absolute);
  if (hash(built) !== hash(source)) throw new Error('Stale copied public resource: ' + relative);
}
for (const relative of [...new Set([...required,...storyFiles])].filter(name => name.endsWith('.webp'))) {
  const header = await fs.readFile(path.join(distRoot, relative));
  if (header.toString('ascii',0,4) !== 'RIFF' || header.toString('ascii',8,12) !== 'WEBP') throw new Error('Invalid WebP resource: ' + relative);
}
for (const match of (await fs.readFile(index.absolute, 'utf8')).matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
  if (/^(?:[a-z]+:|#|\/\/)/i.test(match[1])) continue;
  const relative = checkedRelative(match[1].startsWith('/') ? match[1] : '/' + match[1]);
  if (!copyFiles.has(relative)) throw new Error('index.html references a resource excluded from the release: ' + relative);
}
const files = [];
for (const relative of [...copyFiles].sort()) {
  if (/^(?:characters\/(?!billboards\/)|photos?\/|references\/|assets-source\/)/i.test(relative)) throw new Error('Source photo or old character asset cannot enter release: ' + relative);
  const { absolute, info } = await fileInfo(distRoot, relative);
  if (limit!==null&&info.size > limit) throw new Error('File exceeds the optional Pages 25 MiB release limit: ' + relative + ' (' + info.size + ' bytes)');
  files.push({ path: relative, bytes: info.size, sha256: hash(await fs.readFile(absolute)) });
}

const mapIndex=JSON.parse(await fs.readFile(path.join(distRoot,'map/resource-index.json'),'utf8'));
if(mapIndex.schema!==1||mapIndex.manifest.sha256!==hash(manifestBuffer))throw Error('Map cache index is not bound to this manifest.');
for(const resource of Object.values(mapIndex.resources)){const item=files.find(f=>'/'+f.path===resource.url);if(!item||item.sha256!==resource.sha256||item.bytes!==resource.bytes)throw Error('Missing or stale hash map asset: '+resource.url);}

const report = {
  version: `game-v${releaseVersion}`, publicVersion: releaseLabel, generatedAt: new Date().toISOString(),
  gameUrl: 'https://game.tianhw.top', mainSiteUrl: 'https://zbqsgz.tianhw.top',
  domainBoundAutomatically: false, distRoot, packageRoot: stageRoot,
  target:pagesExport?'cloudflare-pages':'server',singleFileLimitBytes: limit, totalFiles: files.length,
  totalUncompressedBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  manifestReferenceCount: manifestReferences.size,
  manifestSha256: hash(manifestBuffer), newestInput, distIndexMtime: index.info.mtime.toISOString(),
  requiredPlayerAvatarsPresent: true,playerAvatarCount:4,requiredBillboardsAndAudioPresent: true, characterCount: NPC_IDS.length, runtimeNpcSlots: ESCAPE_TOTAL_NPCS, escapeStartingNpcCount: ESCAPE_INITIAL_NPCS, escapeReinforcementCount: ESCAPE_TOTAL_NPCS-ESCAPE_INITIAL_NPCS, dafeiNpcSlots: 4, escapeMusicTrackCount: 3,
  characterPoseWebpCount: characterPoseWebps.length, locomotionPoseCount:NPC_IDS.length*NPC_LOCOMOTION_POSES.length,
  drivingMapVersion: drivingManifest.releaseVersion, drivingMapVehicleAndGuidePresent:true, sourcePhotosAndOldCharacterModelsExcluded: true, files,
  storyFileCount:storyFiles.length,storyUncompressedBytes:files.filter(f=>f.path.startsWith('story/')).reduce((sum,f)=>sum+f.bytes,0),archivePhotoCount:archiveManifest.photos.length,cameraLodCount:cameraManifest.assets.length,discoveryCount:discoveries.length,
  zipPaths: 'POSIX forward slashes',
};
if (validateOnly) {
  await fs.mkdir(releaseRoot, {recursive:true}); await fs.writeFile(reportPath, JSON.stringify({...report,status:'validated; package pending'},null,2)+'\n'); console.log(JSON.stringify({ ...report, files: undefined, status: 'validated; no package written' }, null, 2));
} else {
  // All destructive targets are fixed, resolved and checked within this project before removal.
  if (!inside(gameRoot, releaseRoot) || path.dirname(stageRoot) !== releaseRoot || path.dirname(tempZip) !== releaseRoot || path.dirname(zipPath) !== gameRoot) throw new Error('Unsafe release output path.');
  await fs.mkdir(releaseRoot, { recursive: true });
  const resolvedGameRoot = await fs.realpath(gameRoot);
  const resolvedReleaseRoot = await fs.realpath(releaseRoot);
  if (!inside(resolvedGameRoot, resolvedReleaseRoot) || (await fs.lstat(releaseRoot)).isSymbolicLink()) throw new Error('Release directory must be a real directory inside this game.');
  await fs.rm(stageRoot, { recursive: true, force: true });
  await fs.mkdir(stageRoot);
  for (const { path: relative } of files) {
    const target = path.resolve(stageRoot, relative);
    if (!inside(stageRoot, target)) throw new Error('Unsafe package destination: ' + relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(distRoot, relative), target);
  }
  await fs.rm(tempZip, { force: true });
  await createPortableZip(stageRoot,tempZip,files);
  const zipInfo = await fs.stat(tempZip);
  if (!zipInfo.size) throw new Error('ZIP output is empty.');
  await fs.rm(zipPath, { force: true });
  await fs.rename(tempZip, zipPath);
  report.zipPath = zipPath;
  report.zipBytes = zipInfo.size;
  report.zipSha256 = hash(await fs.readFile(zipPath));

  report.status = 'packaged locally; not uploaded or bound to domain';
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, files: undefined, reportPath }, null, 2));
}

