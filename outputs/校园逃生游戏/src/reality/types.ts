import type {PhotoRecord} from '../photography/types.ts';

export type RealityPoint = [number, number, number];
export type RealityLandmark = {name:string;world:RealityPoint;image:[number,number];role:'fit'|'check';required?:boolean};
export type RealityAnchor = {
 id:string;photoId:string;title:string;date:string|null;image:string;thumbnail:string;sourceSha:string;
 kind:'composition';enabled:boolean;region:string;orientation:'landscape'|'portrait';
 crop:[number,number,number,number];reference:{position:RealityPoint;quaternion:[number,number,number,number];focalLength:number;radius:number;verticalTolerance:number};
 landmarks:RealityLandmark[];subject:{minArea:number;maxArea:number;referenceArea:number};
 validation:{median:number;p90:number;visible:number;walkable:boolean;geometry:boolean};
};
export type RealityManifest={version:1;modelSha:string;policy:{yawDegrees:number;pitchDegrees:number;focalRelative:number;median:number;p90:number;minimumVisible:number};anchors:RealityAnchor[]};
export type RealityAssociation={anchorId:string;realPhotoId:string;title:string;date:string|null;image:string;thumbnail:string;sourceSha:string;matchedAt:string;kind:'composition';cropped?:boolean;sourceImage?:string};
export type RealityMatch={association:RealityAssociation;anchor:RealityAnchor;photo:PhotoRecord;median:number;p90:number;visible:number;first:boolean};
export type RealityContext={mode:string;isLandmarkVisible:(point:RealityPoint,photo:PhotoRecord)=>boolean};
