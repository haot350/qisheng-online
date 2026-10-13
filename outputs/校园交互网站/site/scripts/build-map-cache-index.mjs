import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMapCacheIndex} from '../../../校园逃生游戏/scripts/build-map-cache-index.mjs';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
export async function prepareCampusMapCache(){
 return buildMapCacheIndex(path.join(root,'public'),'/campus.manifest.json','/map/resource-index.json');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log('Campus map cache index:',await prepareCampusMapCache());
