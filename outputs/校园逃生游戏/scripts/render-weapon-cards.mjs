import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Offline thumbnails from existing authored GLBs; never starts a game scene.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=path.join(process.env.USERPROFILE||process.env.HOME,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
const require=createRequire(import.meta.url);
const {chromium}=require(path.join(runtime,'playwright'));
const serviceRequire=createRequire(path.join(root,'../校园联机服务/package.json'));
const {build}=serviceRequire('esbuild');
const sharp=require('sharp');
const ids=['glock','mp5','m4a1','ak47','r870','awm','m249'];
const master=path.join(root,'work/weapon-cards-v082'),output=path.join(root,'public/weapon-cards');
await Promise.all([mkdir(master,{recursive:true}),mkdir(output,{recursive:true})]);
const rendererSource=`import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(1024,320);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0,0);document.body.append(renderer.domElement);
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;
window.renderCard=async id=>{const scene=new THREE.Scene();scene.environment=environment;scene.environmentIntensity=1.6;const gltf=await loader.loadAsync('/weapons/'+id+'-near.glb');const gun=gltf.scene;scene.add(gun);const bounds=new THREE.Box3().setFromObject(gun),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());gun.position.sub(center);const radius=Math.max(.15,size.length()*.52),camera=new THREE.OrthographicCamera(-radius*1.6,radius*1.6,radius*.5,-radius*.5,.01,20);camera.position.set(radius*2.7,radius*.8,radius*.36);camera.lookAt(0,0,0);camera.updateMatrixWorld();const localBounds=new THREE.Box3().setFromObject(gun);let maxX=0,maxY=0;for(const bx of [localBounds.min.x,localBounds.max.x])for(const by of [localBounds.min.y,localBounds.max.y])for(const bz of [localBounds.min.z,localBounds.max.z]){const corner=new THREE.Vector3(bx,by,bz).applyMatrix4(camera.matrixWorldInverse);maxX=Math.max(maxX,Math.abs(corner.x));maxY=Math.max(maxY,Math.abs(corner.y));}const halfHeight=Math.max(maxY,maxX/3.2)*1.12;camera.left=-halfHeight*3.2;camera.right=halfHeight*3.2;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();scene.add(new THREE.HemisphereLight(0xe7f3ff,0x343b34,3));const key=new THREE.DirectionalLight(0xffecd5,3);key.position.set(2,3,1);scene.add(key);const rim=new THREE.DirectionalLight(0xc3e0ff,2);rim.position.set(-2,2,-1);scene.add(rim);renderer.render(scene,camera);const data=renderer.domElement.toDataURL('image/png');gun.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});return data;};window.cardReady=true;`;
const compiled=await build({stdin:{contents:rendererSource,resolveDir:root,sourcefile:'weapon-card-renderer.ts',loader:'ts'},bundle:true,format:'iife',platform:'browser',write:false,minify:true});
const js=compiled.outputFiles[0].contents;
const server=createServer(async(req,res)=>{try{if(req.url==='/entry.js'){res.setHeader('Content-Type','text/javascript');res.end(js);return;}const match=/^\/weapons\/(glock|mp5|m4a1|ak47|r870|awm|m249)-near\.glb$/.exec(req.url);if(match){res.setHeader('Content-Type','model/gltf-binary');res.end(await readFile(path.join(root,'public/weapons',match[1]+'-near.glb')));return;}res.setHeader('Content-Type','text/html');res.end('<!doctype html><style>html,body{margin:0;background:transparent}</style><body><script src="/entry.js"></script></body>');}catch{res.statusCode=500;res.end('render resource unavailable');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.OPENQS_CARD_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-unsafe-swiftshader','--use-angle=swiftshader']});
try{const page=await browser.newPage({viewport:{width:1024,height:320}});page.on('pageerror',error=>process.stderr.write('weapon renderer: '+error.message+'\n'));page.on('console',message=>{if(message.type()==='error')process.stderr.write('weapon renderer: '+message.text()+'\n');});await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.cardReady===true,null,{timeout:10000});let total=0;for(const id of ids){const data=await page.evaluate(id=>window.renderCard(id),id);const png=Buffer.from(data.split(',')[1],'base64');await writeFile(path.join(master,id+'.png'),png);const webp=await sharp(png).resize({width:768}).webp({quality:86,alphaQuality:100}).toBuffer();await writeFile(path.join(output,id+'.webp'),webp);total+=webp.length;}await writeFile(path.join(master,'generation.json'),JSON.stringify({version:'0.8.2',source:'existing authored near GLB',ids,width:1024,height:320,webpTotalBytes:total,transparent:true},null,2));process.stdout.write(JSON.stringify({ok:true,count:ids.length,webpBytes:total,master,output})+'\n');}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
