import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {hashFile,createPortableZip} from './portable-zip.mjs';
import assert from 'node:assert/strict';
import {validateStaticStyles} from './validate-static-styles.mjs';
import {assertStaticReleasePath} from './guard-static-release.mjs';

const site=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const releaseVersion=JSON.parse(await fs.readFile(path.join(site,'package.json'),'utf8')).version;
assert(/^\d+\.\d+\.\d+$/.test(releaseVersion),'公开预览包版本必须为数字 SemVer');
const releaseLabel=`Preview ${releaseVersion}`;
const pagesExport=process.argv.slice(2).includes('--pages');
if(process.argv.slice(2).some(arg=>arg!=='--pages'))throw Error('Usage: node scripts/package-release.mjs [--pages]');
const singleFileLimit=pagesExport?25*1024*1024:null;
const publicReleaseDate=(await fs.readFile(path.join(site,'app/release.ts'),'utf8')).match(/RELEASE_DATE\s*=\s*['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
const root=path.join(site,'dist/client');
const buildProfile=JSON.parse(await fs.readFile(path.join(root,'openqs-profile.json'),'utf8').catch(()=>{throw Error('Production packaging requires an explicit build:production profile.');}));
assert(buildProfile.profile==='production'&&!buildProfile.localOnly,'Demo builds cannot be packaged as production.');
const delivery=path.dirname(site);
const manifest=JSON.parse(await fs.readFile(path.join(root,'campus.manifest.json'),'utf8'));
const source=path.resolve(site,'../../总模型_南楼室内整合_v16/齐盛校园_v16_南教学楼室内轻量整合.blend');
const sha=data=>createHash('sha256').update(data).digest('hex');
assert.equal(manifest.sourceVersion,'v16');
assert.equal(await hashFile(source),manifest.sourceSha256,'原模型哈希或来源版本不符');
assert.equal(sha(await fs.readFile(path.join(root,'campus.manifest.json'))),sha(await fs.readFile(path.join(site,'public/campus.manifest.json'))),'请先重新构建最新资产');
const files=[];
async function walk(dir){for(const item of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,item.name),relative=path.relative(root,full).replaceAll('\\','/');assertStaticReleasePath(relative);assert(!item.isSymbolicLink(),'上传包不允许符号链接');if(item.isDirectory())await walk(full);else if(item.isFile()){const data=await fs.readFile(full);assert(data.length>0,`${item.name} 为零字节`);assert(singleFileLimit===null||data.length<=singleFileLimit,`${item.name} 超过 Pages 单文件 25 MiB 上限`);files.push({path:relative,bytes:data.length,sha256:sha(data)});}}}
await walk(root);
// Next static export copies public recursively. Verify every current source
// resource exists in dist with identical bytes, including the new story images.
async function verifyPublic(dir,relative=''){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const rel=path.posix.join(relative,entry.name),full=path.join(dir,entry.name);assert(!entry.isSymbolicLink(),'public不允许符号链接');if(entry.isDirectory())await verifyPublic(full,rel);else if(entry.isFile()){const data=await fs.readFile(full),built=files.find(f=>f.path===rel);assert(data.length>0&&(singleFileLimit===null||data.length<=singleFileLimit),`public资源大小异常 ${rel}`);assert(built&&built.sha256===sha(data),`dist资源缺失或未更新 ${rel}`);}}}
await verifyPublic(path.join(site,'public'));
const styles = await validateStaticStyles(root);
const pages=[['index','/','app/page.tsx'],['school','/school','app/school/page.tsx'],['making','/making','app/making/page.tsx'],['astra','/astra','app/astra/page.tsx'],['game','/game','app/game/page.tsx'],['explore','/explore','app/explore/page.tsx'],['feedback','/feedback','app/feedback/page.tsx']];
assert.equal(pages.length,7,'主站包含原六页面与反馈进展页面');
for(const [page,url,sourcePage] of pages){
 assert((await fs.stat(path.join(site,sourcePage))).isFile(),`缺少页面源码 ${sourcePage}`);
 const html=await fs.readFile(path.join(root,`${page}.html`),'utf8');
 assert(html.includes(`https://zbqsgz.tianhw.top${url}`),`${page} 正式地址未导出`);
 for(const match of html.matchAll(/(?:src|href)="(\/[^"?#]+)(?:[?#][^"]*)?"/g)){
  const resource=match[1];if(!path.extname(resource)||resource==='/favicon.ico')continue;
  assert(files.some(f=>f.path===resource.slice(1)),`${page} 缺少资源 ${resource}`);
 }
}
assert(files.some(f=>f.path==='404.html'),'需要静态 404 页');
assert(files.some(f=>f.path==='images/game-intro-cover.webp'),'缺少游戏介绍页背景');
const gameHtml=await fs.readFile(path.join(root,'game.html'),'utf8');
assert(gameHtml.includes(releaseLabel),`游戏介绍版本未更新，请完成 ${releaseLabel} 构建后打包`);
assert(gameHtml.includes('五处')&&gameHtml.includes('七章'),'游戏介绍必须包含五处可选实拍发现与七章故事');
const brandedShare=path.join(site,'public/images/qisheng-online-share-v070.webp');
const coverSource=await fs.stat(brandedShare).catch(()=>null)?brandedShare:path.join(site,'public/images/game-intro-cover.webp');
const coverHash=sha(await fs.readFile(coverSource));
assert(gameHtml.includes('https://zbqsgz.tianhw.top/assets/media/'+coverHash+'.webp'),'游戏分享封面必须指向本次内容哈希');
assert.equal([...gameHtml.matchAll(/property="og:image"/g)].length,1,'游戏分享图片必须唯一');
assert((await fs.readFile(path.join(root,'index.html'),'utf8')).includes('https://game.tianhw.top'),'首页缺少游戏入口');
const urls=[manifest.baseUrl,...Object.values(manifest.regions).map(r=>r.detailUrl).filter(Boolean),manifest.interior.structureUrl,...Object.values(manifest.interior.floors).map(f=>f.url)];
for(const url of urls)assert(files.some(f=>f.path===url.replace(/^\//,'')),`缺少模型 ${url}`);
const report={version:`campus-v${releaseVersion}`,publicVersion:releaseLabel,publicReleaseDate,createdAt:new Date().toISOString(),origin:'https://zbqsgz.tianhw.top',gameOrigin:'https://game.tianhw.top',published:false,sourceVersion:manifest.sourceVersion,sourceSha256:manifest.sourceSha256,pageCount:pages.length,styles,zipPaths:'POSIX forward slashes',files:files.sort((a,b)=>a.path.localeCompare(b.path)),totalBytes:files.reduce((sum,f)=>sum+f.bytes,0)};
const reportPath=path.join(delivery,`发行文件清单_v${releaseVersion}.json`);
await fs.writeFile(reportPath,JSON.stringify(report,null,2));
const zip=path.join(delivery,`${pagesExport?'Cloudflare-Pages-campus':'qisheng-campus'}-v${releaseVersion}.zip`);
const zipInfo=await createPortableZip(root,zip,report.files);
report.zip={path:path.basename(zip),...zipInfo};
report.maxFile=files.reduce((max,item)=>item.bytes>max.bytes?item:max,files[0]);
report.target=pagesExport?'cloudflare-pages':'server';report.singleFileLimitMiB=pagesExport?25:null;
await fs.writeFile(reportPath,JSON.stringify(report,null,2));
// Only write this version's archive. Historical ZIPs retain their original names.

console.log(JSON.stringify({zip,files:files.length,bytes:report.totalBytes,zipBytes:zipInfo.bytes,zipSha256:zipInfo.sha256,maxFile:report.maxFile,sourceSha256:manifest.sourceSha256},null,2));
