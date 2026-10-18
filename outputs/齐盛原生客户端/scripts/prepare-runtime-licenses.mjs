import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const project=fileURLToPath(new URL('../',import.meta.url));
export const PHYSICS_RUNTIME_LICENSES=['Android-NDK-runtime-NOTICE.txt','godot-rust-MPL-2.0.txt','nalgebra-BSD-3-Clause.txt','Rapier-Apache-2.0.txt','Rust-Apache-2.0.txt','Rust-GCC-exception-3.1.txt','Rust-GPL-3.0-or-later.txt','Rust-library-COPYRIGHT.html','Rust-LLVM-exception.txt','Rust-MIT.txt','Rust-NCSA.txt','Rust-Unicode-3.0.txt','SOURCE-NOTICE.txt'];
export async function prepareRuntimeLicenses(){
 const source=path.join(project,'physics-rs/licenses'),target=path.join(project,'runtime_licenses/physics');await fs.mkdir(target,{recursive:true});
 const rows=[];
 for(const name of PHYSICS_RUNTIME_LICENSES){
  const file=name==='SOURCE-NOTICE.txt'?path.join(project,'physics-rs/THIRD-PARTY.md'):path.join(source,name),info=await fs.lstat(file);
  if(!info.isFile()||info.isSymbolicLink()||info.size<30)throw Error('Pinned native runtime notice missing or invalid: '+name);
  await fs.copyFile(file,path.join(target,name));rows.push(name);
 }
 return{notices:rows.length,files:rows};
}
export async function copyRuntimeLicenses(output){
 await prepareRuntimeLicenses();
 await fs.copyFile(path.join(project,'LICENSES.txt'),path.join(output,'LICENSES.txt'));
 await fs.cp(path.join(project,'third_party_licenses'),path.join(output,'third_party_licenses'),{recursive:true});
 await fs.cp(path.join(project,'runtime_licenses'),path.join(output,'runtime_licenses'),{recursive:true});
 return{physicsRuntimeNotices:PHYSICS_RUNTIME_LICENSES.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await prepareRuntimeLicenses()));
