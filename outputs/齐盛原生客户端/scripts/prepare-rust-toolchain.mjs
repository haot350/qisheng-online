import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tools=path.join(project,'work','rust-toolchain');
await fs.mkdir(tools,{recursive:true});
const run=(cmd,args)=>new Promise((resolve,reject)=>{const p=spawn(cmd,args,{stdio:'inherit'});p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(Error(cmd+' failed '+code)));});
const fetchFile=async(url,file,hash)=>{try{const bytes=await fs.readFile(file);if(!hash||crypto.createHash('sha256').update(bytes).digest('hex')===hash)return;}catch{}await run('curl.exe',['--fail','--location','--retry','2','--output',file,url]);if(hash&&crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')!==hash)throw Error('Toolchain hash mismatch');};
const manifestFile=path.join(tools,'channel-rust-1.94.0.toml');await fetchFile('https://static.rust-lang.org/dist/channel-rust-1.94.0.toml',manifestFile);
const manifest=await fs.readFile(manifestFile,'utf8');
for(const component of ['rustc','cargo','rust-std','rust-mingw','rustfmt-preview']){const re=new RegExp('\\[pkg\\.'+component+'\\.target\\.x86_64-pc-windows-gnu\\]([\\s\\S]*?)(?=\\n\\[)');const section=manifest.match(re)?.[1];if(!section)throw Error('Missing Rust component '+component);const url=section.match(/xz_url = "([^"]+)"/)[1],hash=section.match(/xz_hash = "([^"]+)"/)[1];const archive=path.join(tools,path.basename(url));await fetchFile(url,archive,hash);const stamp=path.join(tools,component+'.installed');try{await fs.access(stamp);continue;}catch{}await run('tar.exe',['-xf',archive,'-C',tools]);const expanded=path.join(tools,path.basename(archive,'.tar.xz'));const componentDirs=(await fs.readdir(expanded,{withFileTypes:true})).filter(d=>d.isDirectory()&&d.name!=='.');for(const dir of componentDirs)await fs.cp(path.join(expanded,dir.name),path.join(tools,'installed'),{recursive:true});await fs.writeFile(stamp,hash+'\n');}
const llvmName='llvm-mingw-20261006-ucrt-x86_64';const llvmArchive=path.join(tools,llvmName+'.zip');await fetchFile('https://github.com/mstorsjo/llvm-mingw/releases/download/20261006/'+llvmName+'.zip',llvmArchive,'317492c456aa27ee607a5919f1d2d38dcdc1112516a24d0bf4b00d078f52d17a');try{await fs.access(path.join(tools,llvmName,'bin','clang.exe'));}catch{await run('tar.exe',['-xf',llvmArchive,'-C',tools]);}
await fs.writeFile(path.join(tools,'resolved.json'),JSON.stringify({rust:'1.94.0',host:'x86_64-pc-windows-gnu',cargo:path.join(tools,'installed/bin/cargo.exe'),rustc:path.join(tools,'installed/bin/rustc.exe'),linker:path.join(tools,llvmName,'bin/x86_64-w64-mingw32-clang.exe'),path:[path.join(tools,'installed/bin'),path.join(tools,llvmName,'bin')]},null,2));
console.log('Pinned local Rust 1.94.0 / LLVM-MinGW 20261006 prepared.');
