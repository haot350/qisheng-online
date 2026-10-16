import {mkdir,readFile,writeFile,copyFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const game=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workspace=path.resolve(game,'../..');
const source=path.join(game,'assets-source/credits'),output=path.join(game,'public/credits');
const hash=data=>createHash('sha256').update(data).digest('hex');
const download=async url=>{try{const response=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'OpenQS-Credits-Assets'}});if(!response.ok)throw Error('Asset request failed '+response.status);return Buffer.from(await response.arrayBuffer());}catch{const result=spawnSync(process.platform==='win32'?'curl.exe':'curl',['--fail','--location','--silent','--show-error','--retry','2','--connect-timeout','10','--max-time','60',url],{windowsHide:true,maxBuffer:32*1024*1024});if(result.error)throw result.error;if(result.status!==0)throw Error('Asset download failed: '+url+' '+result.stderr.toString());return result.stdout;}};
await mkdir(source,{recursive:true});await mkdir(path.join(output,'icons'),{recursive:true});
const rows=[];
const revision='8a1b2821bb768c484fe8da20c5e1838b6bf551a9';
if(!/^[a-f0-9]{40}$/.test(revision))throw Error('Missing fixed LobeHub source revision');
for(const [id,name]of [['openai','openai'],['gemini','gemini-color'],['deepseek','deepseek-color'],['chatglm','chatglm-color']]){
 const url=`https://raw.githubusercontent.com/lobehub/lobe-icons/${revision}/packages/static-svg/icons/${name}.svg`,data=await download(url),text=data.toString();
 if(data.length>50000||!text.includes('<svg')||/<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|\/\/)/i.test(text))throw Error('Unsafe or unexpected icon '+id);
 await writeFile(path.join(output,'icons',id+'.svg'),data);rows.push({id,url,revision,sha256:hash(data),bytes:data.length,license:'MIT',owner:'LobeHub'});
}
await writeFile(path.join(output,'LOBEHUB-LICENSE.txt'),await download(`https://raw.githubusercontent.com/lobehub/lobe-icons/${revision}/LICENSE`));
const musicUrl='https://www.scottbuckley.com.au/library/wp-content/uploads/2025/12/Wildflowers.mp3';
const original=path.join(source,'Wildflowers-original.mp3');let music;try{music=await readFile(original);}catch(error){if(error.code!=='ENOENT')throw error;music=await download(musicUrl);if(music.length<100000||music.length>30000000)throw Error('Unexpected music file size');await writeFile(original,music,{flag:'wx'});}
const ffmpeg=process.env.QISHENG_FFMPEG||'ffmpeg';
const web=path.join(output,'wildflowers.mp3');
const result=spawnSync(ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-y','-i',original,'-map','0:a:0','-vn','-t','180','-c:a','libmp3lame','-b:a','128k','-ar','44100','-ac','2','-map_metadata','-1',web],{encoding:'utf8',windowsHide:true});
if(result.error)throw result.error;if(result.status!==0)throw Error(result.stderr);
const derived=await readFile(web);rows.push({id:'wildflowers',title:'Wildflowers',artist:'Scott Buckley',url:musicUrl,source:'https://www.scottbuckley.com.au/library/wildflowers/',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',original:{path:'assets-source/credits/Wildflowers-original.mp3',sha256:hash(music),bytes:music.length},web:{path:'/credits/wildflowers.mp3',sha256:hash(derived),bytes:derived.length},modifications:'First 180 seconds, 128 kbit/s MP3; opening and closing volume envelopes applied during playback; original download retained separately.'});
await writeFile(path.join(output,'ATTRIBUTION.txt'),"'Wildflowers' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au\nhttps://www.scottbuckley.com.au/library/wildflowers/\nhttps://creativecommons.org/licenses/by/4.0/\nWeb version: first 180 seconds, 128 kbit/s MP3, opening and closing fades.\n\nAI model brand icons from LobeHub Icons, MIT. Brand names and marks belong to their respective owners.\nhttps://github.com/lobehub/lobe-icons\nSee LOBEHUB-LICENSE.txt and asset-sources.json for fixed source revision and hashes.\n");
await writeFile(path.join(output,'asset-sources.json'),JSON.stringify({preparedAt:new Date().toISOString(),assets:rows},null,2)+'\n');
const licenses=path.join(game,'public/licenses');await mkdir(licenses,{recursive:true});
const licenseRoot=path.join(workspace,'THIRD_PARTY_LICENSES');
for(const file of await readdir(licenseRoot)){if((await stat(path.join(licenseRoot,file))).isFile())await copyFile(path.join(licenseRoot,file),path.join(licenses,file));}
await copyFile(path.join(workspace,'LICENSE'),path.join(licenses,'OpenQS-MIT.txt'));
await writeFile(path.join(source,'asset-sources.json'),JSON.stringify({preparedAt:new Date().toISOString(),assets:rows},null,2)+'\n');
console.log(JSON.stringify({icons:4,revision,musicOriginalBytes:music.length,musicWebBytes:derived.length,webSeconds:180,sourcePreserved:true}));
