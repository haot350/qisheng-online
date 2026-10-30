import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

const LEGACY='campus-v17-web-1';
const json=async(file)=>JSON.parse(await readFile(file,'utf8'));
const canonical=value=>JSON.stringify([...value].sort((a,b)=>a.id.localeCompare(b.id)));

function validateSites(sites){
 if(!Array.isArray(sites)||!sites.length)throw Error('Map catalog contains no calibrated sites');
 const seen=new Set();
 for(const site of sites){
  if(!site||typeof site.id!=='string'||site.id.length<1||site.id.length>100||seen.has(site.id)||typeof site.label!=='string'||site.label.length<1||site.label.length>120||typeof site.region!=='string'||site.region.length<1||site.region.length>100||!Array.isArray(site.position)||site.position.length!==3||!site.position.every(value=>Number.isFinite(value)&&Math.abs(value)<=1000)||!Number.isInteger(site.floor??0)||(site.floor??0)<-1||(site.floor??0)>5)throw Error('Invalid calibrated map site');
  for(const key of ['buildingId','levelId'])if(site[key]!==undefined&&(typeof site[key]!=='string'||site[key].length<1||site[key].length>100))throw Error('Invalid map building or level identity');
  seen.add(site.id);
 }
}

/** Keep the coordinates used to sign older runs when building a different map. */
export async function prepareSiteCatalogs({root=new URL('../',import.meta.url),source=new URL('../../校园逃生游戏/src/escape/validated.ts',import.meta.url)}={}){
 const sitesFile=new URL('src/sites.json',root),catalogFile=new URL('src/site-catalogs.json',root);
 const oldSites=await json(sitesFile);
 let data;
 try{data=await json(catalogFile);}catch(error){if(error.code!=='ENOENT')throw error;data={schema:1,current:LEGACY,catalogs:{[LEGACY]:oldSites}};}
 if(data.schema!==1||!data.catalogs||!data.current||!Array.isArray(data.catalogs[data.current]))throw Error('Invalid site catalog registry');
 if(canonical(data.catalogs[data.current])!==canonical(oldSites))throw Error('Current sites differ from their frozen map catalog');
 let incoming,sourceExists=true;
 try{await readFile(source);}catch(error){if(error.code!=='ENOENT')throw error;sourceExists=false;}
 if(sourceExists)incoming=await import(source.href);
 const id=incoming?.VALIDATED_ESCAPE_MAP_CATALOG_ID??data.current,sites=incoming?.VALIDATED_ESCAPE_SITES??oldSites;
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||!Array.isArray(sites)||!sites.length)throw Error('Invalid map site catalog');
 validateSites(sites);
 const existing=data.catalogs[id];
 if(existing&&canonical(existing)!==canonical(sites))throw Error('Refusing to change frozen site catalog '+id+'; use a new catalog identity');
 const next={...data,current:id,catalogs:{...data.catalogs,[id]:sites}};
 // Registry first: a failed subsequent build never destroys historical coordinates.
 await writeFile(catalogFile,JSON.stringify(next,null,2)+'\n');
 await writeFile(sitesFile,JSON.stringify(sites));
 return{id,sites:sites.length,catalogs:Object.keys(next.catalogs)};
}

/** Select the active map in a compatibility package; every other catalog stays available. */
export async function selectSiteCatalog({root=new URL('../',import.meta.url),mapCatalogId,directory='dist'}){
 if(!['src','dist'].includes(directory))throw Error('Select src or dist explicitly');
 const catalogFile=new URL(directory+'/site-catalogs.json',root),data=await json(catalogFile),sites=data.catalogs?.[mapCatalogId];
 if(data.schema!==1||!Array.isArray(sites)||!sites.length)throw Error('The requested map catalog is not installed');
 validateSites(sites);
 await writeFile(new URL(directory+'/sites.json',root),JSON.stringify(sites));
 await writeFile(catalogFile,JSON.stringify({...data,current:mapCatalogId},null,2)+'\n');
 return {current:mapCatalogId,catalogs:Object.keys(data.catalogs),sites:sites.length};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
 const mapCatalogId=option('--select');if(!mapCatalogId)throw Error('Use --select <catalog> [--directory dist|src] [--root <compatibility-package>]');
 const root=pathToFileURL(path.resolve(option('--root',fileURLToPath(new URL('../',import.meta.url))))+path.sep);
 console.log(JSON.stringify(await selectSiteCatalog({root,mapCatalogId,directory:option('--directory','dist')})));
}
