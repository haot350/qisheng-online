import {readFile, writeFile, mkdir, lstat} from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {listPublicSource, checkReviewedGenerated, root} from './public-source.mjs';
import ts from '../outputs/校园逃生游戏/node_modules/typescript/lib/typescript.js';

const args=process.argv.slice(2);
const option=(name,fallback)=>{const index=args.indexOf(name);return index<0?fallback:args[index+1];};
const version=option('--version','');
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Use --version <semver> explicitly.');
const phase=args.includes('--final')?'final':'prepare';
const outputDirectory=path.join(root,'docs','v'+version);
const outputFile=path.join(outputDirectory,phase==='final'?'public-source-final-audit.json':'public-source-preparation-audit.json');
if(args.includes('--verify')){
 const report=JSON.parse(await readFile(outputFile,'utf8'));
 if(report.version!==version||report.phase!==phase)throw Error('Audit identity mismatch.');
 if(phase==='final'&&(report.status!=='PASS'||report.sourceFrozen!==true))throw Error('No passing final audit exists.');
 const current=await listPublicSource(),expected=report.fileDigests.map(row=>row.file);
 if(JSON.stringify(current)!==JSON.stringify(expected))throw Error('Public whitelist changed after audit.');
 for(const row of report.fileDigests){const bytes=await readFile(path.join(root,row.file));if(createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw Error('Audited file changed: '+row.file);}
 console.log(JSON.stringify({status:'UNCHANGED',version,phase,files:current.length,whitelistDigest:report.whitelistDigest}));
 process.exit(0);
}

// Read only the explicit public-source set, never production configuration or credentials.
const files = await listPublicSource(), allowed = new Set(files), issues = [], warnings = [], vendors = [], digests = [];
const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const changed = execFileSync('git', ['diff', '--name-only', '-z', 'HEAD'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
const credential = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|github_pat_[A-Za-z0-9_]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{25,}|AKIA[A-Z0-9]{16}/;
const productionIP = /(?:38\.22\.95\.192|154\.40\.59\.1)/;
const unsafeAsset = /\.(?:png|jpe?g|webp|gif|bmp|ico|glb|gltf|blend|bin|fbx|obj|mtl|ktx2?|dds|mp3|wav|ogg|flac|mp4|sqlite(?:3)?|db|log|zip|7z|pck|apk|aab|exe|dll|so|dylib|pdf)$/i;
const privateDirectory = /(?:^|\/)(?:private(?:-data)?|credentials?|screenshots?|backups?|releases?|node_modules|\.git|\.godot|target)(?:\/|$)/i;
const approvedAsset = new Set(['outputs/校园逃生游戏/demo/public/anonymous-avatar.svg', 'outputs/齐盛原生客户端/icon.svg']);
let sourceCount = 0, uidCount = 0, rustFiles = 0, nativeFiles = 0, deployFiles = 0;
const scan = (text, file, entry) => {
  for (const [kind, pattern] of [['credential-signature', credential], ['production-IP-literal', productionIP]]) {
    const match = pattern.exec(text);
    if (match) issues.push({file, ...(entry ? {entry} : {}), kind, line: text.slice(0, match.index).split('\n').length});
  }
  // Report only locations, never matched credential-like contents.
  const bearer = /\b(?:Authorization|authorization)["']?\s*[:=]\s*["'`]Bearer\s+([A-Za-z0-9_.-]{24,})/g;
  for (const match of text.matchAll(bearer)) {
    if (!/^(?:test|demo|example|fixture|invalid|synthetic|placeholder)[-_]/i.test(match[1]) && !/^([a-zA-Z0-9])\1+$/.test(match[1])) {
      warnings.push({file, ...(entry ? {entry} : {}), kind: 'review-literal-bearer', line: text.slice(0, match.index).split('\n').length});
    }
  }
};
for (const file of files) {
  if (path.isAbsolute(file) || file.includes('\\') || file.split('/').some(part => part === '..' || part === '.')) issues.push({file, kind: 'unsafe-source-path'});
  const stat = await lstat(path.join(root, file));
  if (!stat.isFile() || stat.isSymbolicLink()) issues.push({file, kind: 'non-regular-public-file'});
  const bytes = await readFile(path.join(root, file));
  digests.push({file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')});
  if (file.endsWith('.tgz')) {
    const tar = gunzipSync(bytes), entries = [];
    let offset = 0;
    while (offset + 512 <= tar.length) {
      const header = tar.subarray(offset, offset + 512);
      if (header.every(byte => byte === 0)) break;
      const name = header.subarray(0, 100).toString().replace(/\0.*$/s, '');
      const prefix = header.subarray(345, 500).toString().replace(/\0.*$/s, '');
      const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/s, '').trim() || '0', 8), type = header[156];
      const storedChecksum = parseInt(header.subarray(148, 156).toString().replace(/\0.*$/s, '').trim() || '0', 8);
      const checksum = [...header].reduce((sum, value, index) => sum + (index >= 148 && index < 156 ? 32 : value), 0);
      if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length || !name.startsWith('package/') || name.includes('\\') || name.split('/').includes('..') || prefix || ![0, 48, 53].includes(type) || checksum !== storedChecksum) {
        issues.push({file, entry: name, kind: 'unsafe-vendor-header'}); break;
      }
      const payload = tar.subarray(offset + 512, offset + 512 + size);
      if (unsafeAsset.test(name) || name.endsWith('.svg') || privateDirectory.test(name) || /(?:^|\/)(?:data|config)(?:\/|$)|(?:^|\/)\.env(?:\.|$)/i.test(name)) issues.push({file, entry: name, kind: 'forbidden-vendor-asset'});
      if (type !== 53) scan(payload.toString('utf8'), file, name);
      entries.push(name);
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    if (!entries.length) issues.push({file, kind: 'empty-vendor-archive'});
    vendors.push({file, sha256: createHash('sha256').update(bytes).digest('hex'), entries: entries.length});
    continue;
  }
  sourceCount++;
  if (file.includes('/齐盛原生客户端/')) nativeFiles++;
  if (file.includes('/physics-rs/') && /\.(?:rs|toml|lock)$/.test(file)) rustFiles++;
  if (file.includes('/校园服务器部署/')) deployFiles++;
  if (unsafeAsset.test(file) && !approvedAsset.has(file)) issues.push({file, kind: 'formal-or-binary-asset-in-whitelist'});
  if (privateDirectory.test(file)) issues.push({file, kind: 'private-directory-in-whitelist'});
  if (bytes.includes(0)) issues.push({file, kind: 'NUL-in-source'});
  const text = bytes.toString('utf8');
  scan(text, file);
  try{checkReviewedGenerated(file,text);}catch(error){issues.push({file,kind:'unreviewed-generated-payload',message:error.message});}
  if (file.endsWith('.uid')) {
    uidCount++;
    if (!/^uid:\/\/[a-z0-9]+\s*$/.test(text)) issues.push({file, kind: 'unexpected-resource-UID-content'});
  }
  if (/export_presets.*\.cfg$/.test(file)) {
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (/keystore\/(?:release|release_user|release_password)\s*=\s*"[^"]+"|codesign\/(?:identity|password)\s*=\s*"[^"]+"/.test(line)) issues.push({file, kind: 'export-signing-material', line: index + 1});
    }
  }
}
const mustExclude = [
  'outputs/校园逃生游戏/public/credits/wildflowers.mp3',
  'outputs/校园逃生游戏/assets-source/credits/Wildflowers-original.mp3',
  ...['openai', 'gemini', 'deepseek', 'chatglm'].map(name => `outputs/校园逃生游戏/public/credits/icons/${name}.svg`),
  'outputs/校园服务器部署/deployment-targets.json',
  'outputs/NPC新增素材_v0.9.0/generation.json',
  'outputs/新增NPC人物图片/README.md',
  'outputs/校园逃生游戏/private-data/npc-layout-combat.ts',
  'outputs/齐盛原生客户端/content/production/map.json',
  'outputs/齐盛原生客户端/content/production/characters.json',
  'outputs/齐盛原生客户端/content/production/weapons.json',
  'outputs/齐盛原生客户端/docs/qa-0.1.0/sdk-tls/https.json',
  'outputs/齐盛原生客户端/work/presentation-qa/combat-desktop.png',
  'outputs/齐盛原生客户端/physics-rs/target/release/qisheng_native_physics.dll',
  'work/activate-native-manifest.mjs',
  'work/native-seat-shape.mjs',
  'outputs/齐盛原生客户端/content/branding/lobby-campus-v020.webp',
  'outputs/齐盛原生客户端/content/audio/manifest.json',
  'outputs/齐盛原生客户端/docs/qa-0.2.0/ui-1440/lobby.png',
  'outputs/齐盛原生客户端/work/PRIVATE-crash.dmp',
  'docs/v0.9.3/browser/admin/report.json',
  'docs/v0.9.4/public-source-final-audit.json',
];
for (const file of mustExclude) if (allowed.has(file)) issues.push({file, kind: 'private-or-formal-sample-in-whitelist'});
const importClosure = {scope: 'AST-based relative static/dynamic JavaScript and TypeScript imports plus new-URL code helpers in explicit public scripts, and native GDScript preloads; installed dependencies and generated output with public source counterparts are identified separately.', checkedImports: 0, installedDependencies: 0, nativePreloads: 0, generatedOutputs: [], issues: []};
function sourceForGenerated(relative) {
  const marker = relative.indexOf('/dist/');
  if (marker < 0) return;
  const base = relative.slice(0, marker), tail = relative.slice(marker + 6);
  const moduleSource = /^modules\/([^/]+)\/src\/(.*)\.js$/.exec(tail);
  const candidate = moduleSource ? 'outputs/' + moduleSource[1] + '/src/' + moduleSource[2] + '.ts' : base + '/src/' + tail.replace(/\.js$/, '.ts');
  return allowed.has(candidate) ? candidate : undefined;
}
for (const file of files.filter(file => /(?:^|\/)scripts\/.*\.[cm]?[jt]s$/.test(file))) {
  const text = await readFile(path.join(root, file), 'utf8');
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true), imports = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require') && node.arguments.length && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL' && node.arguments?.length && ts.isStringLiteral(node.arguments[0]) && /\.(?:mjs|cjs|js|ts|py|sh)$/.test(node.arguments[0].text)) imports.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  for (const specifier of imports.filter(specifier => specifier.startsWith('.'))) {
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    importClosure.checkedImports++;
    if (relative.split('/').includes('node_modules')) {importClosure.installedDependencies++; continue;}
    const candidates = [relative, ...['.mjs', '.js', '.ts', '.tsx', '/index.mjs', '/index.js', '/index.ts', '/index.tsx'].map(suffix => relative + suffix)];
    if (candidates.some(candidate => allowed.has(candidate))) continue;
    const source = sourceForGenerated(relative);
    if (source) {importClosure.generatedOutputs.push({file, dependency: relative, source}); continue;}
    importClosure.issues.push({file, dependency: relative, kind: 'public-script-import-not-in-whitelist'});
  }
}
for (const file of files.filter(file => file.startsWith('outputs/齐盛原生客户端/') && file.endsWith('.gd'))) {
  const text = await readFile(path.join(root, file), 'utf8');
  for (const match of text.matchAll(/\bpreload\(\s*["']res:\/\/([^"']+)["']\s*\)/g)) {
    importClosure.nativePreloads++;
    const dependency = 'outputs/齐盛原生客户端/' + match[1];
    if (dependency.includes('/addons/colyseus/')) {importClosure.installedDependencies++; continue;}
    if (!allowed.has(dependency)) importClosure.issues.push({file, dependency, kind: 'native-preload-not-in-whitelist'});
  }
}
issues.push(...importClosure.issues);
const trackedOutsideWhitelist=tracked.filter(file=>!allowed.has(file));
if(phase==='final')for(const file of trackedOutsideWhitelist)issues.push({file,kind:'tracked-file-outside-current-whitelist'});
const consumerVersions=vendors.map(v=>({file:v.file,version:/qisheng-shared-(\d+\.\d+\.\d+)\.tgz$/.exec(v.file)?.[1]??null}));
if(phase==='final')for(const item of consumerVersions)if(item.version!==version)issues.push({file:item.file,kind:'vendor-version-mismatch'});
if(vendors.length!==4)issues.push({kind:'expected-four-shared-vendor-archives',count:vendors.length});
if(new Set(vendors.map(v=>v.sha256)).size!==1)issues.push({kind:'different-shared-vendor-bytes'});
const report = {
  version,phase,sourceFrozen:phase==='final',reviewedAt:new Date().toISOString(),status:issues.length||warnings.length?'REVIEW':phase==='final'?'PASS':'PREPARED',
  scope: 'Read-only explicit public whitelist, native/Rust source, Godot UID/export presets and shared vendor archives. No Git mutation, production requests or secret-file reads.',
  files: files.length, sourceFiles: sourceCount, nativeFiles, rustFiles, deploymentFiles: deployFiles, resourceUIDFiles: uidCount,
  newWhitelistedFiles:files.filter(file=>!tracked.includes(file)),trackedOutsideWhitelist,consumerVersions,
  changedWhitelistedFiles: changed.filter(file => allowed.has(file)).length,
  changedWhitelisted: changed.filter(file => allowed.has(file)),
  vendorArchives: vendors, vendorBytesIdentical: new Set(vendors.map(item => item.sha256)).size === 1,
  importClosure,
  excludedSamples: mustExclude.map(file => ({file, excluded: !allowed.has(file)})), issues, warnings,
  whitelistDigest: createHash('sha256').update(JSON.stringify(digests)).digest('hex'), fileDigests: digests,
  limitations: ['Signature/path scans cannot prove absence of every possible sensitive value; source allowlist and manual new-tool review remain required.', 'No private production configuration, account store, credential file, screenshot or formal asset payload was opened by this audit.', 'This report describes the exact file digests shown, not later source changes.'],
};
await mkdir(outputDirectory,{recursive:true});
await writeFile(outputFile, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({version,phase,outputFile,status:report.status,newWhitelistedFiles:report.newWhitelistedFiles.length,trackedOutsideWhitelist, files: report.files, nativeFiles, rustFiles, deploymentFiles: deployFiles, resourceUIDFiles: uidCount, changedWhitelistedFiles: report.changedWhitelistedFiles, vendorArchives: vendors.length, vendorEntries: vendors.map(item => item.entries), vendorBytesIdentical: report.vendorBytesIdentical, whitelistDigest: report.whitelistDigest, issues, warnings}));
if (issues.length || warnings.length) process.exitCode = 1;
