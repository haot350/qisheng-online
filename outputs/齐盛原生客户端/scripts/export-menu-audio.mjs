// Reuse the already licensed original without recompression. Formal audio is
// generated locally and remains outside the public anonymous source assets.
import {mkdir,readFile,copyFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {CREDITS_MUSIC} from '../../校园共享模块/src/credits.ts';
const root=new URL('../',import.meta.url),source=new URL('../../校园逃生游戏/assets-source/credits/Wildflowers-original.mp3',import.meta.url),directory=new URL('content/audio/',root);
const bytes=await readFile(source),sha256=createHash('sha256').update(bytes).digest('hex'),file='wildflowers-'+sha256.slice(0,20)+'.mp3';
await mkdir(directory,{recursive:true});await copyFile(source,new URL(file,directory));
await writeFile(new URL('manifest.json',directory),JSON.stringify({schema:1,music:{...CREDITS_MUSIC,file,bytes:bytes.length,sha256,modified:false}},null,2)+'\n');
await writeFile(new URL('LICENSE-Wildflowers.txt',directory),`${CREDITS_MUSIC.attribution}\n${CREDITS_MUSIC.source}\n${CREDITS_MUSIC.license}: ${CREDITS_MUSIC.licenseUrl}\nThe original recording is included without modification. Playback may loop and adjust gain.\n`);
console.log(JSON.stringify({music:CREDITS_MUSIC.title,bytes:bytes.length,sha256,modified:false}));
