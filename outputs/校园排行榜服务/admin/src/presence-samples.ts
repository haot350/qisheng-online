export const PRESENCE_SAMPLE_INTERVAL_MS = 12 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
export type PresenceSample = {minute:number;sessions:number};

export function samplePresenceMinutes(rows:readonly PresenceSample[],checkedAt:number):PresenceSample[]{
 if(!Number.isFinite(checkedAt)||checkedAt<0)return [];
 const earliestBucket=Math.floor(checkedAt/PRESENCE_SAMPLE_INTERVAL_MS)-119;
 const buckets=new Map<number,PresenceSample>();
 for(const row of rows){
  if(!row||!Number.isSafeInteger(row.minute)||row.minute<0||row.minute<=checkedAt-DAY_MS||row.minute>checkedAt||!Number.isSafeInteger(row.sessions)||row.sessions<0)continue;
  const bucket=Math.floor(row.minute/PRESENCE_SAMPLE_INTERVAL_MS),previous=buckets.get(bucket);
  if(bucket<earliestBucket)continue;
  if(!previous||row.minute>=previous.minute)buckets.set(bucket,{minute:row.minute,sessions:row.sessions});
 }
 return [...buckets.entries()].sort(([a],[b])=>a-b).slice(-120).map(([,sample])=>sample);
}
