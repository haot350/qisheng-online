import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),work=path.join(project,'work/rust-toolchain');
const run=(cmd,args)=>new Promise((resolve,reject)=>{const p=spawn(cmd,args,{stdio:'inherit',windowsHide:true});p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(Error(cmd+' failed '+code)));});
const download=async(url,file,algorithm,hash)=>{try{if(crypto.createHash(algorithm).update(await fs.readFile(file)).digest('hex')===hash)return;}catch{}await run('curl.exe',['--fail','--location','--retry','2','--output',file,url]);if(crypto.createHash(algorithm).update(await fs.readFile(file)).digest('hex')!==hash)throw Error('Official Android build archive checksum mismatch');};
const manifest=await fs.readFile(path.join(work,'channel-rust-1.94.0.toml'),'utf8'),section=manifest.match(/\[pkg\.rust-std\.target\.aarch64-linux-android\]([\s\S]*?)(?=\n\[)/)[1],url=section.match(/xz_url = "([^"]+)"/)[1],hash=section.match(/xz_hash = "([^"]+)"/)[1];
const archive=path.join(work,path.basename(url));await download(url,archive,'sha256',hash);await run('tar.exe',['-xf',archive,'-C',work]);await fs.cp(path.join(work,path.basename(archive,'.tar.xz'),'rust-std-aarch64-linux-android'),path.join(work,'installed'),{recursive:true});
const ndkArchive=path.join(work,'android-ndk-r28c-windows.zip');await download('https://dl.google.com/android/repository/android-ndk-r28c-windows.zip',ndkArchive,'sha1','086bba43ff2f5eb0e387b15c8278bb4e0d89ba1d');try{await fs.access(path.join(work,'android-ndk-r28c/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe'));}catch{await run('tar.exe',['-xf',ndkArchive,'-C',work]);}
console.log('Pinned Android NDK r28c and Rust 1.94.0 arm64 standard library prepared.');
