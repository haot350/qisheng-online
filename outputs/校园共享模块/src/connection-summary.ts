/** Explicit, bounded numeric allowlist. Never accepts addresses, tokens or entity data. */
export const CONNECTION_SUMMARY_FIELDS=['rttMs','jitterMs','snapshotIntervalMs','snapshotAgeMs','bufferMs','inputAckAgeMs','backlogAgeMs','correctionP95M','hardCorrections','longFrames','resyncs','replaySteps'] as const;
export type ConnectionFeedbackSummary=Partial<Record<typeof CONNECTION_SUMMARY_FIELDS[number],number>>;
export function safeConnectionSummary(value:unknown):ConnectionFeedbackSummary|undefined {
 if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
 const summary:ConnectionFeedbackSummary={};
 for(const key of CONNECTION_SUMMARY_FIELDS){const n=(value as Record<string,unknown>)[key];if(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e9)summary[key]=Math.round(n*1000)/1000;}
 return Object.keys(summary).length?summary:undefined;
}
