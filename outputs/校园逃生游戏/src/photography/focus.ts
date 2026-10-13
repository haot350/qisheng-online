export type AlphaPixels={data:ArrayLike<number>;width:number;height:number};
/** The caller passes the texture-transformed UV, including flipY and atlas transforms. */
export function alphaPixelPass(pixels:AlphaPixels,u:number,v:number,threshold:number){if(!Number.isFinite(u)||!Number.isFinite(v))return false;const x=Math.min(pixels.width-1,Math.max(0,Math.floor(u*pixels.width))),y=Math.min(pixels.height-1,Math.max(0,Math.floor(v*pixels.height)));return (pixels.data[(y*pixels.width+x)*4+3]??255)/255>=threshold;}
export function axialFocusDistance(cameraSpaceZ:number){return Math.min(2000,Math.max(.45,-cameraSpaceZ));}
/** Lens travel is interpolated in optical power so infinity does not dominate a focus pull. */
export function focusPullDistance(start:number,target:number,progress:number){const t=Math.min(1,Math.max(0,progress)),smooth=t*t*(3-2*t);return 1/((1-smooth)/start+smooth/target);}
