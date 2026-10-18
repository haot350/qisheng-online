import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
const project=fileURLToPath(new URL('../',import.meta.url));
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
let official;
async function officialArchive(){
 if(!official)official=(async()=>{
  const installer=await fs.readFile(path.join(project,'scripts/install-colyseus.ps1'),'utf8'),checksum=/^\$expected\s*=\s*'([a-f0-9]{64})'\s*$/m.exec(installer)?.[1],version=/releases\/download\/godot-v(\d+\.\d+\.\d+)\/colyseus-godot-\1[.]zip/.exec(installer)?.[1];
  if(!checksum||version!=='0.18.7')throw Error('Expected pinned Colyseus 0.18.7 installer lock');
  const zip=await fs.readFile(path.join(project,'work','colyseus-godot-'+version+'.zip'));
  if(digest(zip)!==checksum)throw Error('Official Colyseus SDK archive SHA256 mismatch');
  let end=-1;for(let at=zip.length-22;at>=Math.max(0,zip.length-65557);at--)if(zip.readUInt32LE(at)===0x06054b50){end=at;break;}
  if(end<0||zip.readUInt16LE(end+4)||zip.readUInt16LE(end+6))throw Error('Expected a normal single-volume SDK archive');
  const count=zip.readUInt16LE(end+10),rows=new Map();let cursor=zip.readUInt32LE(end+16);
  for(let i=0;i<count;i++){
   if(cursor+46>zip.length||zip.readUInt32LE(cursor)!==0x02014b50)throw Error('Invalid SDK ZIP directory');
   const length=zip.readUInt16LE(cursor+28),extra=zip.readUInt16LE(cursor+30),comment=zip.readUInt16LE(cursor+32),name=zip.subarray(cursor+46,cursor+46+length).toString('utf8');
   if(rows.has(name))throw Error('Duplicate SDK archive entry');rows.set(name,{flags:zip.readUInt16LE(cursor+8),method:zip.readUInt16LE(cursor+10),packed:zip.readUInt32LE(cursor+20),bytes:zip.readUInt32LE(cursor+24),offset:zip.readUInt32LE(cursor+42)});cursor+=46+length+extra+comment;
  }
  function read(name){const row=rows.get(name);if(!row||row.flags&1||![0,8].includes(row.method)||row.offset+30>zip.length||zip.readUInt32LE(row.offset)!==0x04034b50)throw Error('Pinned SDK entry missing or encrypted: '+name);const start=row.offset+30+zip.readUInt16LE(row.offset+26)+zip.readUInt16LE(row.offset+28);if(start+row.packed>zip.length)throw Error('SDK ZIP data outside archive');const data=row.method===0?zip.subarray(start,start+row.packed):inflateRawSync(zip.subarray(start,start+row.packed));if(data.length!==row.bytes)throw Error('SDK ZIP entry size differs');return data;}
  return{version,archiveSha256:checksum,read};
 })().catch(error=>{official=undefined;throw error;});
 return official;
}
export async function verifyColyseusArtifact(platform,{release=false}={}){
 if(!['windows','android'].includes(platform))throw Error('Unsupported Colyseus platform');
 const archive=await officialArchive(),configuration=JSON.parse(await fs.readFile(path.join(project,'addons/colyseus/version.json'),'utf8'));
 if(configuration.version!==archive.version)throw Error('Installed Colyseus version differs from locked official SDK');
 const file=platform==='windows'?'colyseus_godot.windows.x86_64.'+(release?'release':'debug')+'.dll':'libcolyseus_godot.android.arm64.'+(release?'release':'debug')+'.so';
 const relative='addons/colyseus/bin/'+file,expected=archive.read(relative),installed=await fs.readFile(path.join(project,relative));
 if(!expected.equals(installed))throw Error('Installed Colyseus binary differs from pinned official archive: '+file);
 const extension='addons/colyseus/colyseus.gdextension',definition=await fs.readFile(path.join(project,extension));if(!archive.read(extension).equals(definition))throw Error('Colyseus extension selectors differ from pinned SDK');
 return{passed:true,version:archive.version,archiveSha256:archive.archiveSha256,platform,build:release?'release':'debug',binary:{file,bytes:installed.length,sha256:digest(installed)},extensionSha256:digest(definition)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await verifyColyseusArtifact(process.argv[2],{release:process.argv.includes('--release')})));
