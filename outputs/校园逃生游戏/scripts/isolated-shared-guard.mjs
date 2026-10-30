import path from 'node:path';
import {fileURLToPath} from 'node:url';
const shared=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../校园共享模块/src').replaceAll('\\','/')+'/';
export function isolatedSharedGuard(){return{name:'shared-source-boundary',generateBundle(){for(const id of this.getModuleIds()){const clean=id.replaceAll('\\','/');if(clean.includes('/node_modules/@qisheng/shared/'))throw Error('Expected the workspace shared source.');if(clean.includes('/校园共享模块/src/')&&!clean.startsWith(shared))throw Error('Shared source is outside this checkout.');}}};}
