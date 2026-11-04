import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
/** Anonymous map illustration for the public demo export. No campus asset is read. */
export function demoBattleMap(){const bounds={min:[-24,-4,-24],max:[24,10,24]},empty={floor:'',walls:'',road:'',paving:'M-24,-24H24V24H-24Z',green:'',footprint:''};return {schema:1,sourceSha256:'anonymous-demo-map-1',visualRevision:'anonymous-demo-1',bounds,buildings:[],levels:[],stairs:[],rooms:[],landmarks:[{id:'demo-ground',label:'演示场地',position:[0,0]}],layers:{outdoor:empty}};}
export async function writeDemoBattleMap(gameRoot){const output=path.join(gameRoot,'src/generated');await fs.mkdir(output,{recursive:true});const data=demoBattleMap(),{layers,...layout}=data;await fs.writeFile(path.join(output,'battle-map.json'),JSON.stringify(data)+'\n');await fs.writeFile(path.join(output,'map-layout.json'),JSON.stringify(layout)+'\n');}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const target=process.argv[2];if(!target)throw Error('Pass the public demo game directory.');await writeDemoBattleMap(path.resolve(target));}
