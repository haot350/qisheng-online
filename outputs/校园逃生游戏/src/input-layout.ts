export type ControlPreference='auto'|'touch'|'desktop';
export function resolveTouchControls(preference:ControlPreference,primaryTouch:boolean){return preference==='touch'||(preference==='auto'&&primaryTouch);}
export function primaryTouchInput(){return typeof matchMedia==='function'?matchMedia('(pointer: coarse)').matches:typeof navigator!=='undefined'&&navigator.maxTouchPoints>0;}
export function activeTouchControls(){const explicit=typeof document!=='undefined'?document.documentElement.dataset.touchControls:undefined;return explicit==='true'?true:explicit==='false'?false:primaryTouchInput();}
