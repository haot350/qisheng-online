import {readFileSync} from 'node:fs';

/** Source and packaged modules have different depths; find this service's manifest. */
export const REALTIME_VERSION:string=(()=>{
 let directory=new URL('.',import.meta.url);
 for(let depth=0;depth<8;depth++,directory=new URL('../',directory)){
  let manifest:{name?:string;version?:string};
  try{manifest=JSON.parse(readFileSync(new URL('package.json',directory),'utf8'));}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
  if(manifest.name==='qisheng-campus-realtime'){
   if(typeof manifest.version!=='string'||!/^\d+\.\d+\.\d+$/.test(manifest.version))throw Error('Invalid realtime release version');
   return manifest.version;
  }
 }
 throw Error('Realtime package manifest was not found');
})();
