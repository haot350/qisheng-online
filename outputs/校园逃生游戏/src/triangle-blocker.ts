/** Static source-triangle hints prove obstruction only, never visibility.
 * Every segment is checked again; this is not a position/permission cache. */
export class StaticTriangleBlockers {
  private hints: {id:number;vertices:Float64Array}[]=[];
  private readonly faces:number;
  constructor(private readonly positions:Float32Array,private readonly indices:Uint32Array){
    this.faces=indices.length/3;
  }
  clear(){this.hints.length=0;}
  /** Strict interior intersection, away from edges and the 5mm LOS endpoint. */
  private intersection(a:readonly number[],b:readonly number[],v:Float64Array,strict=true){
    const length=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    if(length<.005||!Number.isFinite(length))return null;
    // The WASM query receives f32 origin, normalized direction and max TOI.
    // Prove the same segment, rather than a JS-double-only neighbouring ray.
    const range=Math.fround(length),ox=Math.fround(a[0]),oy=Math.fround(a[1]),oz=Math.fround(a[2]);
    const dx=Math.fround((b[0]-a[0])/length)*range,dy=Math.fround((b[1]-a[1])/length)*range,dz=Math.fround((b[2]-a[2])/length)*range;
    const ex=v[3]-v[0],ey=v[4]-v[1],ez=v[5]-v[2];
    const fx=v[6]-v[0],fy=v[7]-v[1],fz=v[8]-v[2];
    const px=dy*fz-dz*fy,py=dz*fx-dx*fz,pz=dx*fy-dy*fx;
    const det=ex*px+ey*py+ez*pz;
    if(Math.abs(det)<1e-7)return null;
    const sx=ox-v[0],sy=oy-v[1],sz=oz-v[2];
    const u=(sx*px+sy*py+sz*pz)/det;
    const qx=sy*ez-sz*ey,qy=sz*ex-sx*ez,qz=sx*ey-sy*ex;
    const w=(dx*qx+dy*qy+dz*qz)/det;
    const t=(fx*qx+fy*qy+fz*qz)/det;
    const distance=t*range;
    if(strict){
      if(u<=.0001||w<=.0001||u+w>=.9999||distance<=.025||distance>=range-.025)return null;
      const nx=ey*fz-ez*fy,ny=ez*fx-ex*fz,nz=ex*fy-ey*fx,area=Math.hypot(nx,ny,nz);
      // A relative barycentric margin alone is insufficient on tiny rail or
      // trunk triangles. Require a real 5mm distance from all three edges.
      if(area<1e-8||Math.abs(det)<area*range*.0001
        ||u*area/Math.hypot(fx,fy,fz)<=.005
        ||w*area/Math.hypot(ex,ey,ez)<=.005
        ||(1-u-w)*area/Math.hypot(ex-fx,ey-fy,ez-fz)<=.005)return null;
    }else if(u<-.0001||w<-.0001||u+w>1.0001||distance<0||distance>range+.001)return null;
    return distance;
  }
  blocks(a:readonly number[],b:readonly number[]){
    for(const hint of this.hints)if(this.intersection(a,b,hint.vertices)!==null)return true;
    return false;
  }
  /** Rapier uses N additional face IDs for reverse sides of a trimesh. Verify
   * the decoded source triangle against the real hit before retaining it. */
  remember(featureId:number|undefined,a:readonly number[],b:readonly number[],distance:number){
    if(featureId===undefined||!Number.isInteger(featureId)||featureId<0||featureId>=this.faces*2)return -1;
    const id=featureId>=this.faces?featureId-this.faces:featureId;
    const old=this.hints.findIndex(h=>h.id===id);
    if(old>=0){const [hint]=this.hints.splice(old,1);this.hints.unshift(hint);return 0;}
    const vertices=new Float64Array(9);
    for(let corner=0;corner<3;corner++){
      const index=this.indices[id*3+corner]*3;
      vertices[corner*3]=this.positions[index];vertices[corner*3+1]=this.positions[index+1];vertices[corner*3+2]=this.positions[index+2];
    }
    const expected=this.intersection(a,b,vertices,false);
    if(expected===null||Math.abs(expected-distance)>.001)return -1;
    this.hints.unshift({id,vertices});if(this.hints.length>8)this.hints.pop();
    return 1;
  }
}
