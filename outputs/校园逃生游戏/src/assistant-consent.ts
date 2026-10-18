const CONSENT_KEY='qisheng:assistant-consent:v1';
export function hasAssistantConsent(identity:string,noticeRevision:number):boolean {
 try {const saved=JSON.parse(localStorage.getItem(CONSENT_KEY)??'{}');return saved[identity]===noticeRevision;}catch{return false;}
}
export function rememberAssistantConsent(identity:string,noticeRevision:number):void {
 try {const saved=JSON.parse(localStorage.getItem(CONSENT_KEY)??'{}'),entries=Object.entries(saved&&typeof saved==='object'?saved:{}).filter(([key])=>key!==identity).slice(-19);localStorage.setItem(CONSENT_KEY,JSON.stringify({...Object.fromEntries(entries),[identity]:noticeRevision}));}catch{}
}
