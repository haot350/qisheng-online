import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
try{
 const Database=require('better-sqlite3'),db=new Database(':memory:');
 try{db.exec('CREATE TABLE native_check(value INTEGER); INSERT INTO native_check VALUES(9)');if(db.prepare('SELECT value FROM native_check').get().value!==9)throw Error('SQLite result mismatch');}finally{db.close();}
 const sharp=require('sharp'),bytes=await sharp({create:{width:2,height:2,channels:4,background:'#9a4a3d'}}).webp().toBuffer(),image=await sharp(bytes).metadata();if(image.width!==2||image.height!==2)throw Error('Sharp encode/decode mismatch');
 console.log('SQLite and Sharp bundled native binaries are ready.');
}catch(error){
 throw new Error('Account API native dependency check failed. Use Node.js 24 on a supported 64-bit platform and run npm ci in this API directory. Do not copy node_modules from another OS. See docs/DEMO.md for source-build troubleshooting.',{cause:error});
}
