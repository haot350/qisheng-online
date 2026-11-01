import {readFile,readdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const nativeFiles=['release-config.json','settings.gradle.kts','build.gradle.kts','gradle.properties','app/build.gradle.kts','app/gradle.lockfile','toolchain-lock.json'];
const webFiles=['package.json','package-lock.json','vite.config.ts','vite.production.config.ts','vite.release.config.ts','vite.android.config.ts'];
async function rows(root,prefix,files,directories){
 const names=[...files];
 async function visit(relative){for(const entry of await readdir(path.join(root,relative),{withFileTypes:true})){const name=relative+'/'+entry.name;if(entry.isSymbolicLink())throw Error('Source snapshot cannot contain links');if(entry.isDirectory())await visit(name);else if(entry.isFile())names.push(name);}}
 for(const directory of directories)await visit(directory);
 const result=[];
 for(const name of names.sort()){
  let info;try{info=await lstat(path.join(root,name));}catch(error){if(error.code==='ENOENT'&&name.endsWith('vite.release.config.ts'))continue;throw error;}
  if(!info.isFile()||info.isSymbolicLink())throw Error('Source snapshot requires ordinary files');
  const bytes=await readFile(path.join(root,name));result.push({path:prefix+'/'+name,bytes:bytes.length,sha256:digest(bytes)});
 }
 return result;
}
/** Bind the actual Kotlin host, web runtime source/lock, and immutable bundle.
 * This is separate from the retired Godot source/parity policy. */
export async function androidSourceSnapshot(nativeRoot,webRoot,identity){
 for(const key of ['mapManifestSha256','bundleManifestSha256'])if(!/^[a-f0-9]{64}$/.test(identity[key]))throw Error('Missing Android bundle identity');
 if(identity.protocolVersion!=='campus-mp-0.9.4')throw Error('Unexpected Android protocol');
 const files=[...await rows(nativeRoot,'android',nativeFiles,['app/src','scripts']),...await rows(webRoot,'web',webFiles,['src','vendor'])];
 const value={schema:1,kind:'qisheng-online-android-source',files,identity};
 return {...value,sourceHash:digest(JSON.stringify(value))};
}
