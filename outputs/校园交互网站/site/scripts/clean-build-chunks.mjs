import fs from 'node:fs/promises';
import path from 'node:path';

// Only remove stale generated JavaScript after confirming every current entry,
// static page reference and literal chunk dependency belongs to this manifest.
export async function cleanUnusedClientChunks(site) {
 const base=path.resolve(site),client=path.join(base,'dist','client'),chunks=path.join(client,'_next','static','chunks');
 for(const dir of [path.join(base,'dist'),client,path.join(client,'_next'),path.join(client,'_next','static'),chunks]) {
  if((await fs.lstat(dir)).isSymbolicLink())throw Error('Unsafe generated output link.');
 }
 const manifest=JSON.parse(await fs.readFile(path.join(client,'.vite','manifest.json'),'utf8'));
 const keep=new Set();
 for(const entry of Object.values(manifest)) {
  if(typeof entry.file!=='string')throw Error('Invalid client manifest.');
  for(const key of [...(entry.imports??[]),...(entry.dynamicImports??[])])if(!manifest[key])throw Error('Missing manifest dependency '+key);
  if(entry.file.startsWith('_next/static/chunks/')&&entry.file.endsWith('.js'))keep.add(entry.file);
 }
 if(!keep.size)throw Error('Empty chunk ownership set.');
 const requireChunk=relative=>{if(!keep.has(relative))throw Error('Unowned current chunk reference '+relative);};
 for(const file of await fs.readdir(client))if(/\.(html|rsc)$/.test(file)) {
  const text=await fs.readFile(path.join(client,file),'utf8');
  for(const match of text.matchAll(/\/?(_next\/static\/chunks\/[^\s"'\\<>]+\.js)/g))requireChunk(match[1]);
 }
 for(const relative of keep) {
  const text=await fs.readFile(path.join(client,relative),'utf8');
  for(const match of text.matchAll(/["'](?:\.\/)?([^\s"'\/]+\.js)["']/g)) {
   if((await fs.stat(path.join(chunks,match[1])).catch(()=>null))?.isFile())requireChunk('_next/static/chunks/'+match[1]);
  }
  for(const match of text.matchAll(/["']\/?(_next\/static\/chunks\/[^\s"']+\.js)["']/g))requireChunk(match[1]);
 }
 const removed=[];
 for(const file of await fs.readdir(chunks,{withFileTypes:true})) {
  if(file.isSymbolicLink())throw Error('Unsafe generated chunk link.');
  if(!file.isFile()||!file.name.endsWith('.js')||keep.has('_next/static/chunks/'+file.name))continue;
  const absolute=path.resolve(chunks,file.name);
  if(path.dirname(absolute)!==chunks)throw Error('Unsafe generated chunk target.');
  const bytes=(await fs.stat(absolute)).size;
  await fs.unlink(absolute);removed.push({file:file.name,bytes});
 }
 return {retained:keep.size,removed:removed.length,removedBytes:removed.reduce((sum,x)=>sum+x.bytes,0)};
}
