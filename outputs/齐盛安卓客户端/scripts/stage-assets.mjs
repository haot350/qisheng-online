import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bundle=JSON.parse(await fs.readFile(path.join(root,'work/bundle-prepared.json'),'utf8'));
const manifest=JSON.parse(await fs.readFile(path.join(bundle.generatedAssets,'android/asset-manifest.json'),'utf8'));
const base=path.resolve(root,'../../work/android-online-build'),view=path.join(base,'assets'),record=path.join(base,'asset-view-source.json');
await fs.mkdir(view,{recursive:true});
const files=[...new Set([...manifest.files.map(row=>row.path),'android/asset-manifest.json'])];
const safe=name=>{if(name.startsWith('/')||name.includes('\\')||name.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('Unsafe asset view path');const file=path.resolve(view,name);if(!file.startsWith(view+path.sep))throw Error('Asset view escaped its work directory');return file;};
let previous=[];try{previous=JSON.parse(await fs.readFile(record,'utf8')).files??[];}catch{}
for(const name of previous)if(!files.includes(name)){const file=safe(name);try{const info=await fs.lstat(file);if(!info.isFile()||info.isSymbolicLink())throw Error('Unexpected old asset view entry');await fs.unlink(file);}catch(error){if(error.code!=='ENOENT')throw error;}}
for(const name of files){
 let source;for(const directory of [bundle.generatedAssets,bundle.webDist]){const candidate=path.join(directory,name);try{const info=await fs.lstat(candidate);if(!info.isFile()||info.isSymbolicLink())throw Error('Source asset must be an ordinary file');source=candidate;break;}catch(error){if(error.code!=='ENOENT')throw error;}}
 if(!source)throw Error('Manifest asset was not found: '+name);
 const target=safe(name);await fs.mkdir(path.dirname(target),{recursive:true});
 let same=false;try{const a=await fs.stat(source,{bigint:true}),b=await fs.lstat(target,{bigint:true});if(!b.isFile()||b.isSymbolicLink())throw Error('Asset view target must be an ordinary file');same=a.dev===b.dev&&a.ino===b.ino;if(!same)await fs.unlink(target);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(!same)await fs.link(source,target);
}
await fs.writeFile(record,JSON.stringify({files,view,sourceWebDist:bundle.webDist,modelBytesCopied:0},null,2)+'\n');
bundle.assetView=view;await fs.writeFile(path.join(root,'work/bundle-prepared.json'),JSON.stringify(bundle,null,2)+'\n');
console.log(JSON.stringify({assetViewReady:true,files:files.length,modelBytesCopied:0}));
