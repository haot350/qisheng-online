/** Explicit, bounded numeric allowlist. Never accepts addresses, tokens or entity data. */
export const CONNECTION_SUMMARY_FIELDS=['rttMs','jitterMs','snapshotIntervalMs','snapshotAgeMs','bufferMs','inputAckAgeMs','backlogAgeMs','correctionP95M','hardCorrections','longFrames','resyncs','replaySteps'] as const;
export type ConnectionFeedbackSummary=Partial<Record<typeof CONNECTION_SUMMARY_FIELDS[number],number>>;
export function safeConnectionSummary(value:unknown):ConnectionFeedbackSummary|undefined {
 if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
 const summary:ConnectionFeedbackSummary={};
 for(const key of CONNECTION_SUMMARY_FIELDS){const n=(value as Record<string,unknown>)[key];if(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e9)summary[key]=Math.round(n*1000)/1000;}
 return Object.keys(summary).length?summary:undefined;
}

export type PreparationFeedbackEvent={code:string;stage:string;mode?:string;quality?:string;generation:number;resourceHash?:string;atMs:number};
export type PreparationFeedbackSummary={events:PreparationFeedbackEvent[]};
const preparationStages=['initialize','download','decode','characters','gpu','entry'];
const preparationModes=['escape','dafei','story','roam','training','coop','pvp','online-coop','online-pvp','online-tdm','online-ffa'];
/** Only finite timings, known enums and content hashes may leave the local trace. */
export function safePreparationSummary(value:unknown):PreparationFeedbackSummary|undefined{
 if(!value||typeof value!=='object'||Array.isArray(value)||!Array.isArray((value as {events?:unknown}).events))return undefined;
 const events:PreparationFeedbackEvent[]=[];
 for(const source of (value as {events:unknown[]}).events.slice(-32)){
  if(!source||typeof source!=='object'||Array.isArray(source))continue;
  const row=source as Record<string,unknown>,stage=row.stage,code=row.code;
  if(typeof stage!=='string'||!preparationStages.includes(stage)||typeof code!=='string'||!/^PREP_[A-Z]+_(CANCELLED|NETWORK|TIMEOUT|INTEGRITY|PERMISSION|VERSION|GRAPHICS|MISSING|UNKNOWN)$/.test(code)||!code.startsWith('PREP_'+stage.toUpperCase()+'_'))continue;
  const valid=(number:unknown):number is number=>typeof number==='number'&&Number.isFinite(number)&&number>=0&&number<=1e9;
  if(!valid(row.generation)||!valid(row.atMs))continue;
  const event:PreparationFeedbackEvent={code,stage,generation:Math.floor(row.generation),atMs:Math.round(row.atMs)};
  if(typeof row.mode==='string'&&preparationModes.includes(row.mode))event.mode=row.mode;
  if(typeof row.quality==='string'&&['auto','smooth','high','ultra'].includes(row.quality))event.quality=row.quality;
  if(typeof row.resourceHash==='string'&&/^[a-f0-9]{64}$/i.test(row.resourceHash))event.resourceHash=row.resourceHash.toLowerCase();
  events.push(event);
 }
 return events.length?{events}:undefined;
}
