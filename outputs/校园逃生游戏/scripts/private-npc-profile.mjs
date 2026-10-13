import {access,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const privateNpcFiles=['npc-layout.ts','npc-layout-v13.ts','npc-layout-motion.ts','npc-layout-combat.ts','npc-contours.ts'];
export const privateNpcRoot=fileURLToPath(new URL('../private-data/',import.meta.url));
export async function privateNpcAliases(){
 for(const name of privateNpcFiles)await access(path.join(privateNpcRoot,name)).catch(()=>{throw Error('Production NPC calibration is private and required: '+name);});
 return privateNpcFiles.map(name=>({find:new RegExp('^\\./'+name.replace('.ts','')+'(?:\\.ts)?$'),replacement:path.join(privateNpcRoot,name)}));
}
export async function privateContourSource(){return readFile(path.join(privateNpcRoot,'npc-contours.ts'),'utf8').catch(()=>{throw Error('Explicit production realtime build requires private-data/npc-contours.ts.');});}
