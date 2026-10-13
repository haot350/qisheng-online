export type PhotoPreviewQuality='auto'|'smooth'|'high';
export type PhotoPreviewTier='high'|'medium'|'low';

/** Uses the existing renderer ratio; capture resolution has a separate policy. */
export function previewTier(quality:PhotoPreviewQuality,adaptiveRatio=1):PhotoPreviewTier{
 if(quality==='high')return'high';
 if(quality==='smooth')return'medium';
 const ratio=Number.isFinite(adaptiveRatio)?adaptiveRatio:1;
 return ratio>=1-1e-7?'high':ratio>=.85-1e-7?'medium':'low';
}

export function previewSize(mobile:boolean,tier:PhotoPreviewTier,portrait=false):[number,number]{
 const scale=tier==='high'?1:tier==='medium'?.75:.625;
 // The original portrait preview uses a shorter long edge than landscape.
 const original=portrait?(mobile?[480,720]:[720,1080]):(mobile?[960,640]:[1440,960]);
 return[Math.round(original[0]*scale),Math.round(original[1]*scale)];
}
