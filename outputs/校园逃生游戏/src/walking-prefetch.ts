import type {Vec3} from './types';
export class WalkingPrefetch {
 private previous?:{point:Vec3;at:number};private ahead?:Vec3;private movingAt=-Infinity;
 update(point:Vec3,now:number):Vec3|undefined{
  const last=this.previous;this.previous={point:[...point],at:now};
  if(last){const dt=(now-last.at)/1000,dx=point[0]-last.point[0],dz=point[2]-last.point[2],d=Math.hypot(dx,dz);
   if(dt>0&&dt<.5&&d>.001&&d<3){const reach=Math.min(18,d/dt*2.5);this.ahead=[point[0]+dx/d*reach,point[1],point[2]+dz/d*reach];this.movingAt=now;}
   else if(d>=3)this.ahead=undefined;
  }
  if(now-this.movingAt>350)this.ahead=undefined;return this.ahead;
 }
 reset(){this.previous=undefined;this.ahead=undefined;this.movingAt=-Infinity;}
}
