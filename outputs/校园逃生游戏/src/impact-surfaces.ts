/** Classify a real fixed-collider hit. No visual colour or nearest-mesh inference. */
export type ImpactSurface='ground'|'wall'|'metal'|'neutral';
export type ImpactNormal={readonly x:number;readonly y:number;readonly z:number}|readonly [number,number,number];
export interface ImpactEvidence {
 normal?:ImpactNormal|null;
 /** Exact material assigned to the hit collider/triangle, when known. */
 materialName?:string|null;
}
const METAL_WORD=/(?:^|[^a-z0-9])(?:metal|steel|iron|aluminium|aluminum|brass|copper|bronze|titanium)(?=$|[^a-z0-9])/i;
const METAL_CHINESE=/(?:金属|不锈钢|铸铁|铝合金|铜合金|镀锌钢|铝型材|[钢铁铝铜][材板管])/;
function explicitMetal(name:string):boolean {
 // CamelCase names are common in authored materials; metallic paint and colour
 // names such as SteelBlue do not assert that the collider is actually metal.
 const spaced=name.replace(/([a-z])([A-Z])/g,'$1 $2');
 if(/(?:steel[ _.-]*blue|iron[ _.-]*gray|iron[ _.-]*grey|metallic[ _.-]*paint|铁灰|钢蓝)/i.test(spaced))return false;
 return METAL_WORD.test(spaced)||METAL_CHINESE.test(spaced);
}
export function classifyImpactSurface(hit:ImpactEvidence):ImpactSurface {
 if(typeof hit.materialName==='string'&&explicitMetal(hit.materialName))return 'metal';
 const normal=hit.normal;if(!normal)return 'neutral';
 const xyz=Array.isArray(normal)?normal:[(normal as {x:number;y:number;z:number}).x,(normal as {x:number;y:number;z:number}).y,(normal as {x:number;y:number;z:number}).z];
 if(xyz.length!==3||!xyz.every(Number.isFinite))return 'neutral';
 const length=Math.hypot(xyz[0]!,xyz[1]!,xyz[2]!);if(length<1e-6)return 'neutral';
 const up=xyz[1]!/length;
 if(up>=.7)return 'ground';
 if(Math.abs(up)<=.35)return 'wall';
 // Ceilings and ambiguous bevels retain neutral feedback.
 return 'neutral';
}
