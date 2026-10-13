import {readFile} from 'node:fs/promises';
import path from 'node:path';
export async function assertProductionProfile(directory){
 let profile;try{profile=JSON.parse(await readFile(path.join(directory,'openqs-profile.json'),'utf8'));}catch(error){throw Error('Production package requires an explicit production build profile. Run npm run build:production. '+error.message);}
 if(profile.profile!=='production'||profile.localOnly)throw Error('Demo builds cannot be packaged or deployed as a production release.');
 if(['game','realtime'].includes(profile.application)&&profile.privateNpcCalibration!==true)throw Error('Production game/realtime packaging requires preserved private NPC calibration. Rebuild with explicit production profile.');
}
