export type SitePage='home'|'campus'|'architecture'|'landscape'|'about'|'game'|'feedback';
export type SitePlatform='desktop'|'ios'|'android'|'other';
export type SiteFault='runtime'|'unhandled'|'script-load'|'style-load'|'image-load'|'campus-network'|'campus-timeout'|'campus-decode'|'campus-webgl'|'campus-startup'|'campus-context'|'campus-capture';
export const TELEMETRY_ENDPOINT='https://game.tianhw.top/api/v1/telemetry';
export const TELEMETRY_VERSION='Preview 0.8.0';
const faults=new Set<SiteFault>(['runtime','unhandled','script-load','style-load','image-load','campus-network','campus-timeout','campus-decode','campus-webgl','campus-startup','campus-context','campus-capture']);
export function sitePage(pathname:string):SitePage|null{
 const paths:Record<string,SitePage>={'/':'home','/explore':'campus','/school':'about','/making':'about','/astra':'about','/game':'game','/feedback':'feedback'};
 return paths[pathname.replace(/\/$/,'')||'/']??null;
}
export function sitePlatform(userAgent:string,maxTouchPoints=0):SitePlatform{
 if(/iPad|iPhone|iPod/.test(userAgent)||(/Macintosh/.test(userAgent)&&maxTouchPoints>1))return 'ios';
 if(/Android/.test(userAgent))return 'android';
 return /Windows|Macintosh|X11|Linux/.test(userAgent)?'desktop':'other';
}
export function telemetryPayload(type:'page-view'|'session-start'|'error',page:SitePage,platform:SitePlatform,code?:SiteFault,sessionId?:string){
 return {type,page,platform,version:TELEMETRY_VERSION,...(type==='error'&&code&&faults.has(code)?{code}:{}),...(type==='session-start'&&sessionId&&/^[a-zA-Z0-9_-]{16,100}$/.test(sessionId)?{sessionId}:{})};
}
export function sendSiteTelemetry(payload:ReturnType<typeof telemetryPayload>,fetcher:typeof fetch=fetch){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
 return fetcher(TELEMETRY_ENDPOINT,{method:'POST',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',keepalive:true,signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(()=>{},()=>{}).finally(()=>clearTimeout(timer));
}
