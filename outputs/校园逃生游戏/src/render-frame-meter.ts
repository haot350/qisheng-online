type TimerExtension={TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number};
/** Sparse GPU queries never wait for a result or add a rendering pass. */
export class RenderFrameMeter{
 private extension:TimerExtension|null;
 private query:WebGLQuery|null=null;
 private pending:WebGLQuery[]=[];
 private frames=0;private began=0;
 cpuMs=0;gpuMs:number|undefined;
 private gl:WebGL2RenderingContext;
 constructor(context:WebGLRenderingContext|WebGL2RenderingContext){this.gl=context as WebGL2RenderingContext;this.extension=typeof this.gl.beginQuery==='function'?this.gl.getExtension('EXT_disjoint_timer_query_webgl2'):null;}
 begin(){
  this.began=performance.now();
  const e=this.extension;if(!e||this.gl.isContextLost())return;
  if(this.gl.getParameter(e.GPU_DISJOINT_EXT)){this.pending.splice(0).forEach(q=>this.gl.deleteQuery(q));this.gpuMs=undefined;}
  while(this.pending.length&&this.gl.getQueryParameter(this.pending[0],this.gl.QUERY_RESULT_AVAILABLE)){
   const q=this.pending.shift()!,n=this.gl.getQueryParameter(q,this.gl.QUERY_RESULT);this.gl.deleteQuery(q);
   if(Number.isFinite(n)&&n>=0)this.gpuMs=n/1e6;
  }
  if(++this.frames%15||this.pending.length>=4)return;
  const q=this.gl.createQuery();if(q){this.query=q;this.gl.beginQuery(e.TIME_ELAPSED_EXT,q);}
 }
 end(){
  if(this.query&&this.extension){if(!this.gl.isContextLost()){this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);this.pending.push(this.query);}this.query=null;}
  this.cpuMs=Math.max(0,performance.now()-this.began);
 }
 dispose(){
  if(this.query&&this.extension&&!this.gl.isContextLost())this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
  if(this.query)this.gl.deleteQuery(this.query);
  this.pending.splice(0).forEach(q=>this.gl.deleteQuery(q));this.query=null;
 }
}
