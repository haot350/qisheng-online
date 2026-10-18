import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {recordPhysicsBuild,physicsBuildSourceHash} from './physics-build-receipt.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(project,'scripts/export-movement-rules.mjs')],{stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('canonical movement export failed')));});
const tools=JSON.parse(await fs.readFile(path.join(project,'work/rust-toolchain/resolved.json'),'utf8'));
const runtime=path.join(project,'work/rust-toolchain/installed/lib/rustlib/x86_64-pc-windows-gnu/lib/self-contained');
const env={...process.env,PATH:[...tools.path,process.env.PATH].join(path.delimiter),RUSTC:tools.rustc,CARGO_ENCODED_RUSTFLAGS:['-C','link-self-contained=yes','-L','native='+runtime].join('\x1f'),CARGO_HOME:path.join(project,'work/cargo'),CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER:tools.linker};
delete env.RUSTFLAGS;
const args=process.argv.slice(2);if(!args.length)args.push('build','--release','--locked');
const copyToBin=!args.includes('--no-copy');
if(!copyToBin)args.splice(args.indexOf('--no-copy'),1);
const android=args.includes('aarch64-linux-android');
if(android){delete env.CARGO_ENCODED_RUSTFLAGS;env.RUSTC_WRAPPER=path.join(project,'scripts/rustc-local-wrapper.cmd');}
const buildSourceHash=args[0]==='build'&&!args.includes('--no-default-features')?await physicsBuildSourceHash():null;
await new Promise((resolve,reject)=>{const child=spawn(tools.cargo,args,{cwd:path.join(project,'physics-rs'),env,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('cargo exited '+code)));});
if(args[0]==='build'&&!args.includes('--no-default-features')){if(await physicsBuildSourceHash()!==buildSourceHash)throw Error('Native physics source changed during compilation; retry build');await fs.mkdir(path.join(project,'bin'),{recursive:true});const mode=args.includes('--release')?'release':'debug';const source=android?path.join(project,'physics-rs/target/aarch64-linux-android',mode,'libqs_native_physics.so'):path.join(project,'physics-rs/target',mode,'qs_native_physics.dll');if(copyToBin)await fs.copyFile(source,path.join(project,'bin',android?'libqs_native_physics.arm64.so':'qs_native_physics.dll'));await recordPhysicsBuild(android?'android':'windows',source,buildSourceHash);}
