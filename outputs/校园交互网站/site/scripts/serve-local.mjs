import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('../dist/client/',import.meta.url)));
const port=Number(process.argv[2]||process.env.PORT||5177);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.wasm':'application/wasm','.txt':'text/plain; charset=utf-8','.rsc':'text/x-component; charset=utf-8','.woff':'font/woff','.woff2':'font/woff2','.ico':'image/x-icon'};
await stat(path.join(root,'index.html')).catch(()=>{throw Error('静态构建不存在，请先运行 npm run build。')});
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/.well-known/qisheng-local'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({app:'qisheng-digital-campus',root,pid:process.pid}));return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const requested=decodeURIComponent(url.pathname);
  let file=path.resolve(root,'.'+requested);
  if((file!==root&&!file.startsWith(root+path.sep))||requested.includes('\0')){res.writeHead(403);res.end();return;}
  let info;
  try{info=await stat(file);}catch(error){
   if(error.code!=='ENOENT'||path.extname(file))throw error;
   file+='.html';info=await stat(file);
  }
  if(info.isDirectory()){file=path.join(file,'index.html');info=await stat(file);}
  const etag=`"${info.size}-${Math.floor(info.mtimeMs)}"`;
  if(req.headers['if-none-match']===etag){res.writeHead(304,{'ETag':etag,'Cache-Control':'no-cache'});res.end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-cache','ETag':etag,'X-Content-Type-Options':'nosniff'});
  if(req.method==='HEAD')res.end();else createReadStream(file).on('error',()=>res.destroy()).pipe(res);
 }catch{
  const fallback=path.join(root,'404.html');
  try{await stat(fallback);res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});if(req.method==='HEAD')res.end();else createReadStream(fallback).on('error',()=>res.destroy()).pipe(res);}
  catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('资源不存在');}
 }
});
server.listen(port,'127.0.0.1',()=>console.log(`齐盛 · 数字校园  http://127.0.0.1:${port}/\n静态目录：${root}\n按 Ctrl+C 停止。`));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
