/** A retry belongs to the same draft and identity; the token is never a login credential. */
export type FeedbackSubmission = {owner:string;fingerprint:string;token:string};
export function feedbackSubmission(previous:FeedbackSubmission|null,owner:string,payload:unknown,random:()=>string=newFeedbackToken):FeedbackSubmission {
 const fingerprint=JSON.stringify(payload);
 return previous?.owner===owner&&previous.fingerprint===fingerprint?previous:{owner,fingerprint,token:random()};
}
function newFeedbackToken(){
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
