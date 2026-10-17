import {readFile,writeFile,mkdir,stat,copyFile,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeIO,getBounds} from '../../校园逃生游戏/node_modules/@gltf-transform/core/dist/index.modern.js';
import {ALL_EXTENSIONS} from '../../校园逃生游戏/node_modules/@gltf-transform/extensions/dist/index.modern.js';
import {dequantize,dedup,flatten,join} from '../../校园逃生游戏/node_modules/@gltf-transform/functions/dist/functions.modern.js';
import {MeshoptDecoder} from '../../校园逃生游戏/node_modules/meshoptimizer/meshopt_decoder.module.js';
const root=fileURLToPath(new URL('../',import.meta.url)),game=fileURLToPath(new URL('../../校园逃生游戏/',import.meta.url)),publicRoot=path.join(game,'public'),output=path.join(root,'content/production');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const original=await readFile(path.join(publicRoot,'map/manifest.json')),manifest=JSON.parse(original),index=JSON.parse(await readFile(path.join(publicRoot,'map/resource-index.json'),'utf8'));
if(sha(original)!==index.manifest.sha256)throw Error('Map manifest and immutable index differ');
if(process.argv.includes('--list')){console.log(JSON.stringify({chunks:manifest.chunks.length,sourceVersion:manifest.sourceVersion,bytes:manifest.chunks.reduce((sum,row)=>sum+row.bytes,0),privateAssets:true}));process.exit(0);}
if(!process.argv.includes('--production'))throw Error('Use --production explicitly; formal campus resources remain private.');
await mkdir(path.join(output,'chunks'),{recursive:true});await mkdir(path.join(output,'textures'),{recursive:true});await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder}),chunks=[];
for(const [i,row]of manifest.chunks.entries()){
 if(!row.url.startsWith('/map/')||row.url.includes('..'))throw Error('Unsafe map source');
 const source=path.join(publicRoot,row.url),bytes=await readFile(source),expected=index.resources[row.url];
 if(!expected||sha(bytes)!==expected.sha256)throw Error('Original campus chunk identity mismatch');
 const name=path.basename(row.url,'.glb'),target=path.join(output,'chunks',name+'.gltf');
 let reuse=false;try{const stamp=JSON.parse(await readFile(target+'.source.json','utf8'));reuse=(await stat(target)).size>0&&stamp.sha256===expected.sha256&&stamp.adapter===4;}catch{}
 if(!reuse){
  const document=await io.read(source);
  const before=getBounds(document.getRoot().listScenes()[0]);
  await document.transform(dequantize());
  await document.transform(dedup(),flatten(),join({keepNamed:false,filter:node=>node.getMesh()?.listPrimitives().every(primitive=>primitive.getMaterial()?.getAlphaMode()!=='BLEND')??false}));
  const after=getBounds(document.getRoot().listScenes()[0]),boundError=Math.max(...before.min.map((n,i)=>Math.abs(n-after.min[i])),...before.max.map((n,i)=>Math.abs(n-after.max[i])));
  if(boundError>.002)throw Error('Native batching changed campus world bounds: '+name);
  for(const extension of document.getRoot().listExtensionsUsed())if(['EXT_meshopt_compression','KHR_draco_mesh_compression'].includes(extension.extensionName))extension.dispose();
  for(const texture of document.getRoot().listTextures()){const image=texture.getImage();if(!image)continue;const ext=texture.getMimeType()==='image/jpeg'?'jpg':texture.getMimeType()==='image/webp'?'webp':'png';texture.setURI('../textures/'+sha(image)+'.'+ext);}
  document.getRoot().listBuffers().forEach((buffer,i)=>buffer.setURI(name+'-'+i+'.bin'));
  await io.write(target,document);
  await writeFile(target+'.source.json',JSON.stringify({sha256:expected.sha256,adapter:4,boundError,adaptation:'Decoded/dequantized static geometry, joined compatible opaque meshes per chunk, preserved blended objects, shared images by content hash.'})+'\n');
 }
 const rendered=await readFile(target);
 chunks.push({...row,path:'res://content/production/chunks/'+name+'.gltf',nativeSha256:sha(rendered),sourceSha256:expected.sha256});
 // Only this tool's earlier unshipped native derivatives are replaced. Accepted
 // source models and all previously delivered web releases remain untouched.
 for(const suffix of ['.glb','.glb.import','.glb.source.json'])await unlink(path.join(output,'chunks',name+suffix)).catch(error=>{if(error.code!=='ENOENT')throw error;});
 if(i%25===0)console.log('NATIVE_CHUNKS',i+1,manifest.chunks.length);
}
const collisionBytes=await readFile(path.join(publicRoot,manifest.collisionUrl)),positionCount=collisionBytes.readUInt32LE(0),indexCount=collisionBytes.readUInt32LE(4);
if(8+positionCount*4+indexCount*4!==collisionBytes.length)throw Error('Collision buffer length mismatch');
const positions=new Float32Array(collisionBytes.buffer,collisionBytes.byteOffset+8,positionCount),indices=new Uint32Array(collisionBytes.buffer,collisionBytes.byteOffset+8+positionCount*4,indexCount),tiles=new Map();
for(let i=0;i<indices.length;i+=3){const vertices=[indices[i]*3,indices[i+1]*3,indices[i+2]*3],cx=vertices.reduce((sum,at)=>sum+positions[at],0)/3,cz=vertices.reduce((sum,at)=>sum+positions[at+2],0)/3,key=Math.floor(cx/64)+'_'+Math.floor(cz/64);let tile=tiles.get(key);if(!tile){tile={faces:[],min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};tiles.set(key,tile);}for(const at of vertices)for(let axis=0;axis<3;axis++){const value=positions[at+axis];tile.faces.push(value);tile.min[axis]=Math.min(tile.min[axis],value);tile.max[axis]=Math.max(tile.max[axis],value);}}
await mkdir(path.join(output,'collision'),{recursive:true});const collisionTiles=[];
for(const [key,tile]of tiles){const bytes=Buffer.from(new Float32Array(tile.faces).buffer),name=key+'.bin';await writeFile(path.join(output,'collision',name),bytes);collisionTiles.push({path:'res://content/production/collision/'+name,bounds:{min:tile.min,max:tile.max},triangles:tile.faces.length/9,sha256:sha(bytes)});}
for(const logical of [manifest.collisionUrl,manifest.navmeshUrl,manifest.visionUrl].filter(Boolean)){const bytes=await readFile(path.join(publicRoot,logical));if(sha(bytes)!==index.resources[logical]?.sha256)throw Error('Map support identity mismatch');await copyFile(path.join(publicRoot,logical),path.join(output,path.basename(logical)));}
const mapIdentity={sourceVersion:manifest.sourceVersion,manifestHash:index.manifest.sha256,collisionHash:index.resources[manifest.collisionUrl].sha256,navigationHash:index.resources[manifest.navmeshUrl].sha256,visionHash:index.resources[manifest.visionUrl].sha256};
await writeFile(path.join(output,'map.json'),JSON.stringify({...manifest,profile:'production',chunks,collisionTiles,mapIdentity,nativeAdaptation:'GLTF geometry decoded; accepted source identities unchanged. Godot map-preview collision is not the competitive Rapier controller.'},null,2)+'\n');
const total=chunks.reduce((sum,row)=>sum+row.bytes,0);console.log(JSON.stringify({status:'PASS',chunks:chunks.length,collisionTiles:tiles.size,sourceBytes:total,mapIdentity,originalsUnchanged:true}));
