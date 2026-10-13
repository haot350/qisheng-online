export function readBuildProfile(){
 const profile=process.env.OPENQS_PROFILE??'demo';
 if(!['demo','production'].includes(profile))throw new Error('OPENQS_PROFILE must be demo or production.');
 return profile;
}
export function demoProxy(){return {
 '/api':{target:'http://127.0.0.1:8792',changeOrigin:false,rewrite:url=>url.replace(/^\/api/,'')},
 '/demo-realtime':{target:'http://127.0.0.1:2577',changeOrigin:false,ws:true,rewrite:url=>url.replace(/^\/demo-realtime/,'')},
};}
