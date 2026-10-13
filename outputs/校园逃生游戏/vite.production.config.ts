import {defineConfig,type Plugin} from 'vite';
import react from '@vitejs/plugin-react';
import {createReadStream} from 'node:fs';
import {stat,lstat,readdir,unlink,cp,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {buildStaticAssets} from './scripts/build-static-assets.mjs';
import {buildGameMapIndex} from './scripts/build-map-cache-index.mjs';
const publicRoot=path.resolve('public');
const allowed=['assets/map','assets/media','branding','audio','avatars','images','map','story','characters/billboards','characters/players','weapons','vehicles','_headers','404.html','favicon.svg','robots.txt'];
function runtimeAssets():Plugin{
  let output=path.resolve('dist');
  return {name:'runtime-assets-only',async buildStart(){await buildGameMapIndex();await buildStaticAssets(path.resolve('.'),'game');},async transformIndexHtml(html,context){
      const urls=JSON.parse(await readFile(path.resolve('src/generated/static-assets.json'),'utf8'));
      const shareImage=urls['/images/qisheng-online-share-v070.webp'];
      if(typeof shareImage!=='string'||!/^\/assets\/media\/[a-f0-9]{64}\.webp$/.test(shareImage))throw Error('Game share image is missing its content-hash address');
      html=html.replaceAll('__GAME_SHARE_IMAGE__',new URL(shareImage,'https://game.tianhw.top').href);
      if(context.server)return html;
      return html.replace('<meta charset="UTF-8"/>', "<meta charset=\"UTF-8\"/><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' blob: wss://game.tianhw.top; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'\"/>");
    },configResolved(config){output=path.resolve(config.root,config.build.outDir);},
    async writeBundle(_options,bundle){
      await mkdir(output,{recursive:true});
      // Limit cleanup to regular JS/CSS files directly inside this output's assets.
      // Runtime models, textures, audio and decoder assets are never removed here.
      const assetRoot=path.resolve(output,'assets');
      let assetInfo;try{assetInfo=await lstat(assetRoot);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      if(assetInfo?.isSymbolicLink())throw new Error('Refusing to clean a symbolic-link build assets directory.');
      if(assetInfo?.isDirectory()){
        const emitted=new Set(Object.keys(bundle).map(key=>key.replace(/\\/g,'/')));
        for(const entry of await readdir(assetRoot,{withFileTypes:true})){
          if(!entry.isFile()||!['.js','.css'].includes(path.extname(entry.name).toLowerCase()))continue;
          const target=path.resolve(assetRoot,entry.name);
          if(path.dirname(target)!==assetRoot||path.relative(output,target).startsWith('..'))throw new Error('Build asset cleanup escaped the output directory.');
          if(!emitted.has(`assets/${entry.name}`))await unlink(target);
        }
      }
      for(const name of allowed){const src=path.join(publicRoot,name);try{await stat(src);}catch{continue;}await cp(src,path.join(output,name),{recursive:true});}
    },
    async configureServer(server){await buildGameMapIndex();await buildStaticAssets(path.resolve('.'),'game');server.middlewares.use(async(req,res,next)=>{
      let pathname:string;try{pathname=decodeURIComponent(new URL(req.url??'/', 'http://localhost').pathname).replace(/^\/+/, '');}catch{res.statusCode=400;res.end();return;}
      // The comparison assets are served only by the development server.
      // Production builds and upload packages keep the accepted campus chunks.
      if(![...allowed,'map-candidate-v122'].some(name=>pathname===name||pathname.startsWith(`${name}/`)))return next();
      const file=path.resolve(publicRoot,pathname);if(!file.startsWith(publicRoot+path.sep)){res.statusCode=403;res.end();return;}
      let info;try{info=await stat(file);}catch{res.statusCode=404;res.end();return;}if(!info.isFile())return next();
      const types:Record<string,string>={'.json':'application/json','.glb':'model/gltf-binary','.bin':'application/octet-stream','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.m4a':'audio/mp4','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.html':'text/html','.txt':'text/plain'};
      res.setHeader('Content-Type',types[path.extname(file)]??'application/octet-stream');res.setHeader('Accept-Ranges','bytes');res.setHeader('Cache-Control',pathname.startsWith('assets/')?'public, max-age=31536000, immutable':'no-store');
      const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range??'');let start=0,end=info.size-1;
      if(range){start=Number(range[1]);end=range[2]?Math.min(end,Number(range[2])):end;if(start>end){res.statusCode=416;res.end();return;}res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);}
      res.setHeader('Content-Length',end-start+1);if(req.method==='HEAD'){res.end();return;}createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
    });},
  };
}
export default defineConfig(({mode})=>({plugins:[react(),runtimeAssets()],resolve:{dedupe:['react','react-dom'],alias:[{find:/^@qisheng\/shared\/accounts$/,replacement:path.resolve('../校园共享模块/src/accounts.ts')},{find:/^@qisheng\/shared\/achievements$/,replacement:path.resolve('../校园共享模块/src/achievements.ts')},{find:/^@qisheng\/shared\/community\/account\.css$/,replacement:path.resolve('../校园共享模块/src/community/account.css')},{find:/^@qisheng\/shared\/rules$/,replacement:path.resolve('../校园共享模块/src/rules.ts')},{find:/^@qisheng\/shared\/ammo$/,replacement:path.resolve('../校园共享模块/src/ammo.ts')},{find:/^@qisheng\/shared\/npc-combat$/,replacement:path.resolve('../校园共享模块/src/npc-combat.ts')},{find:/^@qisheng\/shared\/ranking$/,replacement:path.resolve('../校园共享模块/src/ranking.ts')},{find:/^@qisheng\/shared\/types$/,replacement:path.resolve('../校园共享模块/src/types.ts')},{find:/^@qisheng\/shared\/protocol$/,replacement:path.resolve('../校园共享模块/src/protocol.ts')},{find:/^@qisheng\/shared\/community$/,replacement:path.resolve('../校园共享模块/src/community/index.ts')},{find:/^@qisheng\/shared\/community\/client$/,replacement:path.resolve('../校园共享模块/src/community/client.ts')},{find:/^@qisheng\/shared\/community\/unread$/,replacement:path.resolve('../校园共享模块/src/community/feedback-unread.ts')},{find:/^@qisheng\/shared\/community\/dialog-focus$/,replacement:path.resolve('../校园共享模块/src/community/dialog-focus.ts')},{find:/^@qisheng\/shared\/community\/modal-focus$/,replacement:path.resolve('../校园共享模块/src/community/modal-focus.ts')},{find:/^@qisheng\/shared\/map-client$/,replacement:path.resolve('../校园共享模块/src/map-client/index.ts')},{find:/^@qisheng\/shared\/player-content$/,replacement:path.resolve('../校园共享模块/src/player-content/index.ts')},{find:/^@qisheng\/shared\/player-content\/FAQContent$/,replacement:path.resolve('../校园共享模块/src/player-content/FAQContent.tsx')},{find:/^@qisheng\/shared\/community\/ranking\.css$/,replacement:path.resolve('../校园共享模块/src/community/ranking.css')},{find:/^@qisheng\/shared\/community\/feedback\.css$/,replacement:path.resolve('../校园共享模块/src/community/feedback.css')},{find:/^@qisheng\/shared\/player-content\/reading\.css$/,replacement:path.resolve('../校园共享模块/src/player-content/reading.css')}]},publicDir:false,base:'/',build:{emptyOutDir:true,target:'es2022',chunkSizeWarningLimit:3400,rollupOptions:{input:{main:path.resolve('index.html'),account:path.resolve('account/index.html')}}},server:{port:5180,strictPort:true,hmr:false,...(mode==='online-qa'?{proxy:{'/api':{target:process.env.QA_API_TARGET||'http://127.0.0.1:8796',changeOrigin:true,rewrite:(url:string)=>url.replace(/^\/api/,''),configure(proxy){proxy.on('proxyReq',req=>req.removeHeader('origin'));}},'/realtime':{target:process.env.QA_REALTIME_TARGET||'http://127.0.0.1:2576',changeOrigin:true,ws:true,rewrite:(url:string)=>url.replace(/^\/realtime(?:\/w[123])?/,'')}}}:{})}}));
