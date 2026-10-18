import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const artifact=platform=>path.join(project,'bin',platform==='android'?'libqs_native_physics.arm64.so':'qs_native_physics.dll');
const receiptPath=platform=>path.join(project,'work','physics-build-'+platform+'.json');
const validPlatform=platform=>{if(!['windows','android'].includes(platform))throw Error('Unsupported native physics platform');};

async function inputs(){
 const files=['physics-rs/Cargo.toml','physics-rs/Cargo.lock','physics-rs/rust-toolchain.toml','physics-rs/movement-source.json'];
 const walk=async relative=>{for(const entry of await fs.readdir(path.join(project,relative),{withFileTypes:true})){const file=relative+'/'+entry.name;if(entry.isDirectory())await walk(file);else if(entry.isFile()&&entry.name.endsWith('.rs'))files.push(file);}};
 await walk('physics-rs/src');files.sort();
 const hashes={};for(const file of files)hashes[file]=digest(await fs.readFile(path.join(project,file)));
 return {hashes,sourceHash:digest(JSON.stringify(hashes))};
}

async function verifyCanonical(){
 const source=JSON.parse(await fs.readFile(path.join(project,'physics-rs/movement-source.json'),'utf8'));
 const game=path.resolve(project,'../校园逃生游戏');
 for(const [file,hash]of Object.entries(source.sources))if(digest(await fs.readFile(path.join(game,file)))!==hash)throw Error('Canonical movement source changed; rebuild native physics: '+file);
 const wasm=await fs.readFile(path.join(game,'node_modules/@dimforge/rapier3d-compat/rapier_wasm3d_bg.wasm'));
 if(digest(wasm)!==source.wasmSha256)throw Error('Installed Rapier WebAssembly changed; rebuild native physics');
 return source;
}

export async function physicsBuildSourceHash(){await verifyCanonical();return (await inputs()).sourceHash;}

export async function recordPhysicsBuild(platform,builtPath,expectedSourceHash){
 validPlatform(platform);const source=await verifyCanonical();const sourceInputs=await inputs();
 if(expectedSourceHash&&expectedSourceHash!==sourceInputs.sourceHash)throw Error('Native physics source changed during compilation; rebuild before exporting');
 const bytes=await fs.readFile(artifact(platform)),built=await fs.readFile(builtPath);
 if(digest(bytes)!==digest(built))throw Error('Running binary differs from the successful build; install it after closing the native client');
 const value={format:1,platform,builtAt:new Date().toISOString(),sourceHash:sourceInputs.sourceHash,inputs:sourceInputs.hashes,binary:{file:path.basename(artifact(platform)),bytes:bytes.length,sha256:digest(bytes)},toolchain:{rust:'1.94.0',godotRust:'0.5.5',godotApi:'4.7',rapier:'0.30.1',parry:'0.25.3',nalgebra:'0.34.1',linker:platform==='android'?'NDK r28c/API29':'LLVM-MinGW 20261006'},canonicalWasm:source.wasmSha256};
 await fs.mkdir(path.dirname(receiptPath(platform)),{recursive:true});const temporary=receiptPath(platform)+'.'+process.pid+'.tmp';await fs.writeFile(temporary,JSON.stringify(value,null,2)+'\n');await fs.rename(temporary,receiptPath(platform));return value;
}

export async function verifyPhysicsArtifact(platform){
 validPlatform(platform);const receipt=JSON.parse(await fs.readFile(receiptPath(platform),'utf8').catch(()=>{throw Error('Native physics build receipt missing; run scripts/build-rust.mjs for '+platform);}));
 const source=await verifyCanonical(),current=await inputs(),bytes=await fs.readFile(artifact(platform));
 if(receipt.format!==1||receipt.platform!==platform||receipt.sourceHash!==current.sourceHash||receipt.binary.sha256!==digest(bytes)||receipt.binary.bytes!==bytes.length||receipt.canonicalWasm!==source.wasmSha256)throw Error('Native physics artifact is stale; rebuild '+platform+' before exporting');
 return {passed:true,platform,sourceHash:current.sourceHash,binary:receipt.binary};
}
