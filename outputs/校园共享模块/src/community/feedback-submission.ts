import {safeConnectionSummary,type ConnectionFeedbackSummary} from '../connection-summary.ts';

export type FeedbackDiagnostics={connection?:ConnectionFeedbackSummary;version?:string;mode?:string;controls?:string;browser?:string;os?:string;viewport?:string;errorCode?:string};
export type FeedbackAttachmentSelection={includeDiagnostics:boolean;includeConnection:boolean};

/** A connection-only report contains no device fields. */
export function selectedFeedbackDiagnostics(diagnostics:FeedbackDiagnostics,connection:unknown,selection:FeedbackAttachmentSelection):FeedbackDiagnostics|undefined {
 const selected:FeedbackDiagnostics={};
 if(selection.includeDiagnostics){
  for(const key of ['version','mode','controls','browser','os','viewport','errorCode'] as const){
   const value=diagnostics[key];if(typeof value==='string'&&value)selected[key]=value;
  }
 }
 if(selection.includeConnection){
  const summary=safeConnectionSummary(connection??diagnostics.connection);
  if(summary)selected.connection=summary;
 }
 return Object.keys(selected).length?selected:undefined;
}

/** A retry keeps the original payload while live diagnostics continue changing. */
export type FeedbackSubmission<T extends object=Record<string,unknown>>={owner:string;fingerprint:string;token:string;payload:T};
export function feedbackSubmission<T extends object>(previous:FeedbackSubmission<T>|null,owner:string,payload:T,random:()=>string=newFeedbackToken,draft:unknown=payload):FeedbackSubmission<T> {
 const fingerprint=JSON.stringify(draft);
 if(previous?.owner===owner&&previous.fingerprint===fingerprint)return previous;
 return {owner,fingerprint,token:random(),payload:structuredClone(payload)};
}
function newFeedbackToken(){
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
