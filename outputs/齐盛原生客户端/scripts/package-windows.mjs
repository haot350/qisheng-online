import {readFile,writeFile,access,rename} from 'node:fs/promises';
import path from 'node:path';
import {createPortableZip} from '../../校园交互网站/site/scripts/portable-zip.mjs';
import {exportOptions,exportIdentity,collectExportFiles,project,NATIVE_VERSION} from './native-export-profile.mjs';
import {verifyPhysicsArtifact} from './physics-build-receipt.mjs';
import {verifyColyseusArtifact} from './verify-colyseus-artifact.mjs';
import {inspectPck} from './inspect-pck.mjs';
import {inspectWindowsDependencies} from './inspect-windows-export.mjs';
import {PHYSICS_RUNTIME_LICENSES} from './prepare-runtime-licenses.mjs';
const argv=process.argv.slice(2),archiveIndex=argv.indexOf('--archive');let archive;
if(archiveIndex>=0){if(!argv[archiveIndex+1]||argv[archiveIndex+1].startsWith('--'))throw Error('--archive requires a new ZIP path under native dist');archive=path.resolve(argv[archiveIndex+1]);argv.splice(archiveIndex,2);}
const options=exportOptions(argv),identity=await exportIdentity(options),physics=await verifyPhysicsArtifact('windows'),sdk=await verifyColyseusArtifact('windows',{release:options.mode!=='internal'});
archive??=path.join(project,'dist','qisheng-native-'+NATIVE_VERSION+'-windows'+(options.mode==='preview'?'':'-'+options.mode)+'.zip');
const relative=path.relative(path.join(project,'dist'),archive);if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||!archive.endsWith('.zip'))throw Error('Archive must be a ZIP under native dist');
const inside=path.relative(options.output,archive);if(inside!=='..'&&!inside.startsWith('..'+path.sep)&&!path.isAbsolute(inside))throw Error('Do not write the ZIP inside its own exported directory');
if(!options.check&&await access(archive).then(()=>true,()=>false))throw Error('Archive already exists; select a new --archive path. Historical packages are never overwritten.');
const metadata=JSON.parse(await readFile(path.join(options.output,'native-export.json'),'utf8'));
if(metadata.schema!==1||metadata.kind!=='native-export'||metadata.platform!=='windows'||metadata.version!==NATIVE_VERSION||metadata.stage!==(options.preview?'preview-candidate':options.mode)||metadata.sourceHash!==identity.sourceHash||metadata.physics?.binary?.sha256!==physics.binary.sha256||metadata.sdk?.binary?.sha256!==sdk.binary.sha256||metadata.sdk?.archiveSha256!==sdk.archiveSha256)throw Error('Native export is missing, stale or belongs to another mode');
const files=await collectExportFiles(options.output),byName=new Map(files.map(row=>[row.path,row]));
if(files.length!==metadata.files?.length+1||!byName.has('native-export.json'))throw Error('Native export file set changed after inspection');
for(const expected of metadata.files){const actual=byName.get(expected.path);if(!actual||actual.bytes!==expected.bytes||actual.sha256!==expected.sha256)throw Error('Native export file changed after inspection: '+expected.path);}
if(!byName.has(metadata.executable))throw Error('Native executable missing');
for(const name of PHYSICS_RUNTIME_LICENSES)if(!byName.has('runtime_licenses/physics/'+name))throw Error('External native runtime notice missing: '+name);
for(const name of ['Godot-MIT.txt','Colyseus-MIT.txt'])if(!byName.has('third_party_licenses/'+name))throw Error('Native dependency license missing: '+name);
const physicsFile=files.find(row=>path.basename(row.path)==='qs_native_physics.dll');if(physicsFile?.sha256!==physics.binary.sha256)throw Error('Packaged physics DLL differs from verified build');
if(files.find(row=>path.basename(row.path)===sdk.binary.file)?.sha256!==sdk.binary.sha256)throw Error('Packaged SDK differs from locked official archive');
const {names,...pck}=await inspectPck(path.join(options.output,metadata.executable.replace(/[.]exe$/,'.pck')),{demo:options.demo,projectRoot:project});
if(pck.sha256!==metadata.pck.sha256)throw Error('Native PCK changed after export');
const dependencies=await inspectWindowsDependencies(options.output,files);
if(options.check){console.log(JSON.stringify({checked:true,packaged:false,published:false,mode:options.mode,version:NATIVE_VERSION,files:files.length}));process.exit(0);}
const pending=archive+'.pending-'+Date.now(),result=await createPortableZip(options.output,pending,files);await rename(pending,archive);
const report={schema:1,kind:'native-package',platform:'windows',version:NATIVE_VERSION,profile:options.demo?'demo':'production',stage:options.preview?'preview-candidate':options.mode,published:false,formalAssets:!options.demo,file:path.basename(archive),...result,...identity,checkedAt:new Date().toISOString(),pck,physics,sdk,dependencies,files,artifact:{file:path.basename(archive),bytes:result.bytes,sha256:result.sha256}};
await writeFile(archive+'.json',JSON.stringify(report,null,2)+'\n');await writeFile(archive+'.sha256',result.sha256+'  '+path.basename(archive)+'\n');
console.log(JSON.stringify({file:archive,version:NATIVE_VERSION,mode:options.mode,published:false,bytes:result.bytes,sha256:result.sha256,verifiedEntries:result.verifiedEntries,sourceHash:identity.sourceHash}));
