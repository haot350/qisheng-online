import {associateReality} from '../photography/album.ts';
import type {PhotoRecord} from '../photography/types.ts';
import type {RealityMatch} from './types.ts';
export async function attachReality(record:PhotoRecord,match:RealityMatch){record.reality={...match.association};try{await associateReality(record.id,record.reality);}catch{/* An unsaved photo can still be exported / encountered in this session. */}return record;}
