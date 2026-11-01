import {createContext,useContext,useSyncExternalStore,type ReactNode} from 'react';
export type UIPlatform='desktop'|'web-mobile'|'android';
export type UIPresentation={platform:UIPlatform;orientation:'portrait'|'landscape';width:number;height:number;compact:boolean;narrow:boolean};
const SERVER:UIPresentation={platform:'desktop',orientation:'landscape',width:1280,height:720,compact:false,narrow:false};
const Context=createContext<UIPresentation|null>(null);
export function resolveUIPresentation({width,height,touch=false,android=false,orientation}:{width:number;height:number;touch?:boolean;android?:boolean;orientation?:UIPresentation['orientation']}):UIPresentation{const platform:UIPlatform=android?'android':touch||width<900?'web-mobile':'desktop';return{platform,width,height,orientation:orientation??(height>width?'portrait':'landscape'),compact:platform!=='desktop',narrow:width<600};}
export function screenUIOrientation():UIPresentation['orientation']|undefined{if(typeof window==='undefined')return;const type=window.screen.orientation?.type;return type?.startsWith('portrait')?'portrait':type?.startsWith('landscape')?'landscape':undefined;}
export function UIPresentationProvider({value,children}:{value:UIPresentation;children:ReactNode}){return <Context.Provider value={value}>{children}</Context.Provider>;}
let cached=SERVER;const listeners=new Set<()=>void>();let attached=false;
function read(){if(typeof window==='undefined')return SERVER;const width=Math.round(window.visualViewport?.width??window.innerWidth),height=Math.round(window.visualViewport?.height??window.innerHeight),touch=window.matchMedia('(pointer:coarse)').matches,orientation=touch?screenUIOrientation():undefined;if(cached.width!==width||cached.height!==height||cached.platform!==(touch||width<900?'web-mobile':'desktop')||cached.orientation!==(orientation??(height>width?'portrait':'landscape')))cached=resolveUIPresentation({width,height,touch,orientation});return cached;}
function changed(){const previous=cached;read();if(previous!==cached)for(const listener of listeners)listener();}
function subscribe(listener:()=>void){if(typeof window==='undefined')return()=>{};listeners.add(listener);if(!attached){attached=true;window.addEventListener('resize',changed);window.visualViewport?.addEventListener('resize',changed);window.matchMedia('(pointer:coarse)').addEventListener('change',changed);}return()=>{listeners.delete(listener);if(!listeners.size&&attached){attached=false;window.removeEventListener('resize',changed);window.visualViewport?.removeEventListener('resize',changed);window.matchMedia('(pointer:coarse)').removeEventListener('change',changed);}};}
const idle=()=>()=>{};
/** The game supplies its verified native identity and existing usable viewport.
 * Standalone readers share one resize subscription without an app provider. */
export function useUIPresentation(){const provided=useContext(Context),fallback=useSyncExternalStore(provided?idle:subscribe,provided?()=>provided:read,()=>SERVER);return provided??fallback;}
