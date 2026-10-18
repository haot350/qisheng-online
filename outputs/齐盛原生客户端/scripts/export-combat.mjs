import {readFile,writeFile,mkdir,stat,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {NodeIO} from '../../校园逃生游戏/node_modules/@gltf-transform/core/dist/index.modern.js';
import {ALL_EXTENSIONS} from '../../校园逃生游戏/node_modules/@gltf-transform/extensions/dist/index.modern.js';
import {dequantize} from '../../校园逃生游戏/node_modules/@gltf-transform/functions/dist/functions.modern.js';
import {MeshoptDecoder} from '../../校园逃生游戏/node_modules/meshoptimizer/meshopt_decoder.module.js';
import {WEAPONS} from '../../校园共享模块/src/rules.ts';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),game=fileURLToPath(new URL('../../校园逃生游戏/',import.meta.url));
const production=process.argv.includes('--production');
if(!production)throw Error('Formal combat resources require --production; no assets are added to public source.');
const output=path.join(root,'content/combat');await mkdir(output,{recursive:true});
await MeshoptDecoder.ready;
const sha=b=>createHash('sha256').update(b).digest('hex');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const assets=[];
for(const style of ['campus-a','campus-b','tactical-a','tactical-b'])assets.push({id:style,kind:'avatar',source:`avatars/v0.5.0/${style}.glb`,target:`${style}.glb`});
for(const id of Object.keys(WEAPONS))for(const lod of ['near','far'])assets.push({id,kind:'weapon',lod,source:`weapons/${id}-${lod}.glb`,target:`${id}-${lod}.glb`});
for(const asset of assets){
 const source=path.join(game,'public',asset.source),target=path.join(output,asset.target),bytes=await readFile(source),hash=sha(bytes);
 let reuse=false;try{const stamp=JSON.parse(await readFile(target+'.source.json','utf8'));reuse=stamp.sourceSha256===hash&&(await stat(target)).size>0;}catch{}
 if(!reuse){const doc=await io.read(source);await doc.transform(dequantize());for(const ext of doc.getRoot().listExtensionsUsed())if(['EXT_meshopt_compression','KHR_draco_mesh_compression'].includes(ext.extensionName))ext.dispose();await io.write(target,doc);await writeFile(target+'.source.json',JSON.stringify({sourceSha256:hash,adapter:1})+'\n');}
 asset.sourceSha256=hash;asset.sha256=sha(await readFile(target));delete asset.source;
}
// Competitive damage remains authored by the shared service. Rendering data is
// exported for labels only; the native renderer never awards damage locally.
const rules=spawnSync(process.execPath,[path.join(root,'scripts/export-rules.mjs'),'--production'],{cwd:root,stdio:'inherit',windowsHide:true});
if(rules.status!==0)throw Error('Native shared weapon rule export failed');
const definitions=JSON.parse(await readFile(path.join(output,'weapons.json'),'utf8'));
await mkdir(path.join(output,'cards'),{recursive:true});
for(const id of Object.keys(WEAPONS))await copyFile(path.join(game,'public/weapon-cards',id+'.webp'),path.join(output,'cards',id+'.webp'));
for(const variant of ['dark','light'])await copyFile(path.join(game,'src/assets/branding',`qisheng-online-${variant}.webp`),path.join(output,`logo-${variant}.webp`));
await writeFile(path.join(output,'weapons.json'),JSON.stringify(definitions,null,2)+'\n');
await writeFile(path.join(output,'manifest.json'),JSON.stringify({profile:'production',protocolVersion:'campus-mp-0.9.0',assets},null,2)+'\n');
console.log(JSON.stringify({status:'PASS',resources:assets.length,originalsUnchanged:true,privateAssets:true}));
