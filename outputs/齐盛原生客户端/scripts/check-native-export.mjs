import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {inspectPck} from './inspect-pck.mjs';
import {PHYSICS_RUNTIME_LICENSES} from './prepare-runtime-licenses.mjs';
const h=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function pck(rows){
 const table=[],data=[];let offset=0;
 for(const [name,input]of rows){const content=Buffer.isBuffer(input)?input:Buffer.from(input),padded=Buffer.alloc(Math.ceil((Buffer.byteLength(name)+1)/4)*4);padded.write(name);const row=Buffer.alloc(4+padded.length+8+8+16+4);row.writeUInt32LE(padded.length);padded.copy(row,4);let at=4+padded.length;row.writeBigUInt64LE(BigInt(offset),at);row.writeBigUInt64LE(BigInt(content.length),at+8);crypto.createHash('md5').update(content).digest().copy(row,at+16);table.push(row);data.push(content);offset+=content.length;}
 const directory=Buffer.alloc(4);directory.writeUInt32LE(rows.size);const index=Buffer.concat([directory,...table]),base=40+index.length,header=Buffer.alloc(40);header.writeUInt32LE(0x43504447);header.writeUInt32LE(4,4);header.writeUInt32LE(4,8);header.writeUInt32LE(7,12);header.writeUInt32LE(2,16);header.writeUInt32LE(2,20);header.writeBigUInt64LE(BigInt(base),24);header.writeBigUInt64LE(40n,32);return Buffer.concat([header,index,...data]);
}
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'openqs-native-export-test-'));let checks=0;
try{
 const notices=new Map([['LICENSES.txt','synthetic license boundary only'],['third_party_licenses/Godot-MIT.txt','synthetic Godot license fixture only'],['third_party_licenses/Colyseus-MIT.txt','synthetic Colyseus license fixture only'],...PHYSICS_RUNTIME_LICENSES.map(name=>['runtime_licenses/physics/'+name,'synthetic license fixture; never a distributable notice'])]);
 const demo=new Map([...notices,['content/demo/map.json','{"profile":"demo"}'],['content/demo/weapons.json','{}']]);const file=path.join(temporary,'fixture.pck');await fs.writeFile(file,pck(demo));assert.equal((await inspectPck(file,{demo:true,projectRoot:temporary})).passed,true);checks++;
 for(const entry of [['work/private.json','no'],['content/combat/avatar.glb','no'],['../escape','no']]){const changed=new Map(demo);changed.set(...entry);await fs.writeFile(file,pck(changed));await assert.rejects(()=>inspectPck(file,{demo:true,projectRoot:temporary}));checks++;}
 const missing=new Map(demo);missing.delete('runtime_licenses/physics/Rust-library-COPYRIGHT.html');await fs.writeFile(file,pck(missing));await assert.rejects(()=>inspectPck(file,{demo:true,projectRoot:temporary}));checks++;
 const corrupted=pck(demo);corrupted[corrupted.length-1]^=255;await fs.writeFile(file,corrupted);await assert.rejects(()=>inspectPck(file,{demo:true,projectRoot:temporary}));checks++;
 await fs.mkdir(path.join(temporary,'content/combat'),{recursive:true});await fs.writeFile(path.join(temporary,'content/combat/avatar.glb.import'),'[remap]\npath="res://.godot/imported/formal-avatar.scn"\n');const imported=new Map(demo);imported.set('.godot/imported/formal-avatar.scn','private imported avatar');await fs.writeFile(file,pck(imported));await assert.rejects(()=>inspectPck(file,{demo:true,projectRoot:temporary}));checks++;
 const raw={collision:Buffer.from('fixture collision'),navigation:Buffer.from('fixture navigation'),vision:Buffer.from('fixture vision')};
 const manifest={profile:'production',chunks:Array.from({length:209},()=>({path:'res://content/production/chunks/fixture.gltf'})),mapIdentity:{collisionHash:h(raw.collision),navigationHash:h(raw.navigation),visionHash:h(raw.vision)}};
 const combat={profile:'production',assets:[{target:'fixture.glb'}]};const formal=new Map([...notices,['content/production/map.json',JSON.stringify(manifest)],['content/combat/manifest.json',JSON.stringify(combat)],['content/combat/weapons.json','{}'],['content/production/chunks/fixture.gltf.remap','[remap]\npath="res://.godot/imported/campus.scn"\n'],['.godot/imported/campus.scn','synthetic campus resource'],['content/combat/fixture.glb.remap','[remap]\npath="res://.godot/imported/player.scn"\n'],['.godot/imported/player.scn','synthetic player resource'],...Object.entries(raw).map(([key,value])=>['content/production/'+key+'.bin',value])]);
 for(const name of ['content/production/map.json','content/combat/manifest.json','content/combat/weapons.json']){await fs.mkdir(path.dirname(path.join(temporary,name)),{recursive:true});await fs.writeFile(path.join(temporary,name),formal.get(name));}
 await fs.writeFile(file,pck(formal));assert.equal((await inspectPck(file,{projectRoot:temporary})).passed,true);checks++;
 formal.delete('.godot/imported/player.scn');await fs.writeFile(file,pck(formal));await assert.rejects(()=>inspectPck(file,{projectRoot:temporary}));checks++;
 console.log(JSON.stringify({passed:true,checks,syntheticExportOnly:true,productionTouched:false}));
}finally{await fs.rm(temporary,{recursive:true,force:true});}
