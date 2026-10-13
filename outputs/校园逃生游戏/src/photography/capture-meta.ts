import * as THREE from 'three';
import type {PhotoCaptureEvidence,PhotoCaptureMeta} from './types.ts';
export function capturePoseMeta(first:{position:THREE.Vector3;quaternion:THREE.Quaternion},current:{position:THREE.Vector3;quaternion:THREE.Quaternion},previous:PhotoCaptureMeta):PhotoCaptureMeta{
 const translation=Math.max(previous.translation,first.position.distanceTo(current.position)),rotationDegrees=Math.max(previous.rotationDegrees,first.quaternion.angleTo(current.quaternion)*180/Math.PI),unstable=previous.unstable||translation>.12||rotationDegrees>2;
 return {...previous,translation,rotationDegrees,unstable,samples:previous.samples+1,eligible:previous.resourcesComplete&&!unstable};
}
export function copyCaptureEvidence(evidence:PhotoCaptureEvidence):PhotoCaptureEvidence{return {...evidence,subjects:evidence.subjects?[...evidence.subjects]:undefined};}
/** Every accumulated sample must support a subject or timing verdict claimed by the final image. */
export function mergeCaptureEvidence(first:PhotoCaptureEvidence,next:PhotoCaptureEvidence):PhotoCaptureEvidence{
 const result=copyCaptureEvidence(first);
 if(first.subjectsVerified||next.subjectsVerified){result.subjectsVerified=true;result.subjects=(first.subjects??[]).filter(id=>next.subjects?.includes(id));}
 for(const key of ['frameClear','actorsReady','rhythmReady'] as const)if(next[key]===false)result[key]=false;
 if(first.exposureStepId!==next.exposureStepId)result.frameClear=false;
 return result;
}
