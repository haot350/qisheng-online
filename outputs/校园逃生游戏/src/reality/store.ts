const KEY='qisheng-reality-discoveries-v1';
const memory=new Set<string>();
function storage(){try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}
export function discoveredReality():Set<string>{try{const value=JSON.parse(storage()?.getItem(KEY)??'[]');return new Set([...memory,...(Array.isArray(value)?value.filter((v):v is string=>typeof v==='string'&&v.length<100):[])]);}catch{return new Set(memory);}}
/** Only a successfully decoded encounter is marked seen; a failed image remains retryable. */
export function markRealityDiscovered(id:string):boolean{const found=discoveredReality(),first=!found.has(id);found.add(id);memory.add(id);try{storage()?.setItem(KEY,JSON.stringify([...found]));}catch{/* Private / full storage does not prevent the encounter. */}return first;}
export const claimDiscovery=markRealityDiscovered;
