import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
/** Opt-in actual GPU check: set PHOTO_RENDER_TEST=1 with Vite running, no production diagnostics. */
test('actual WebGL photography changes exposure and focus, exports and stores images, and cancels cleanly',{skip:process.env.PHOTO_RENDER_TEST!=='1',timeout:60000},async()=>{
 const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE??path.join(process.env.USERPROFILE??'','.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
  const context=await browser.newContext({viewport:{width:844,height:390}}),page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',(e:Error)=>errors.push(e.message));page.on('console',(m:{type:()=>string;text:()=>string})=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/photography-test',async(r:{fulfill:(v:unknown)=>Promise<void>})=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0"></body></html>'}));
  await page.goto((process.env.PHOTO_DEV_ORIGIN??'http://127.0.0.1:5180')+'/photography-test');
  const result=await page.evaluate(async()=>{
   // Use Vite's exact resolved Three module URL, avoiding duplicate class constructors.
   const source=await fetch('/src/photography/PhotoSystem.ts').then(r=>r.text()),moduleURL=source.match(/from\s+"([^"]*three[^"]*)"/)![1];
   const T=await import(/* @vite-ignore */moduleURL),{PhotoSystem}=await import(/* @vite-ignore */'/src/photography/PhotoSystem.ts');
   const renderer=new T.WebGLRenderer();renderer.setSize(844,390);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.setClearColor(0x335566);document.body.appendChild(renderer.domElement);
   const scene=new T.Scene();scene.background=new T.Color(.1,.12,.15);scene.add(new T.HemisphereLight(0xffffff,0x334466,1));
   for(let i=0;i<12;i++){const box=new T.Mesh(new T.BoxGeometry(.25,2,.2),new T.MeshStandardMaterial({color:i%2?0xf9f9ec:0x352c27}));box.position.set((i-5.5)*.35,0,-5);scene.add(box);}
   const camera=new T.PerspectiveCamera(53,2,.075,420);camera.updateMatrixWorld();let captures=0;const photo=new PhotoSystem(renderer,scene,{mobile:true,onCapture:()=>captures++});photo.open(camera);photo.setViewStatus({ready:true,failed:false,progress:1});
   async function snap(partial:Record<string,unknown>){
    photo.configure({interface:'professional',mode:'M',aperture:4,iso:100,focusMode:'manual',focusDistance:5,autoISO:false,whiteBalance:'daylight',shutter:1/1000,...partial});photo.render(camera,1/60);const promised=photo.capture();
    for(let i=0;i<100&&photo.snapshot().state!=='saving';i++)photo.render(camera,1/60);
    const record=await promised,image=await createImageBitmap(record.blob),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,image.width,image.height).data;let sum=0,sum2=0,n=0;
    for(let y=250;y<770;y+=4)for(let x=300;x<1236;x+=4){const i=(y*image.width+x)*4,v=(pixels[i]+pixels[i+1]+pixels[i+2])/3;sum+=v;sum2+=v*v;n++;}
    return{mean:sum/n,variance:sum2/n-(sum/n)**2,width:image.width,height:image.height,bytes:record.blob.size,kind:record.kind};
   }
   const base=await snap({}),oneStop=await snap({iso:200}),sharp=await snap({focalLength:105}),blur=await snap({focalLength:105,focusDistance:.45});photo.configure({shutter:2});const pending=photo.capture();for(let i=0;i<10;i++)photo.render(camera,1/60);const progress=photo.snapshot().progress;photo.pause();const cancelled=await pending;photo.resume();
   const album=await import(/* @vite-ignore */'/src/photography/album.ts'),photos=await album.listPhotos();await album.removePhoto(photos[0].id);await new Promise(r=>setTimeout(r,30));const afterDelete=photo.snapshot().albumCount;const controller=new AbortController();controller.abort();let aborted=false;try{await album.savePhoto({...photos[0],id:crypto.randomUUID()},controller.signal);}catch{aborted=true;}const afterAbort=await album.photoCount();for(let i=0;i<47;i++)await album.savePhoto({...photos[0],id:crypto.randomUUID(),blob:new Blob(['fixture'],{type:'image/png'}),width:1,height:1});let albumFull=false;try{await album.savePhoto({...photos[0],id:crypto.randomUUID()});}catch(e){albumFull=e instanceof album.AlbumFullError;}const finalCount=await album.photoCount();photo.close();const closed=photo.snapshot();photo.dispose();const toneMappingRestored=renderer.toneMapping===T.ACESFilmicToneMapping;renderer.dispose();return{base,oneStop,sharp,blur,captures,progress,cancelled,stored:photos.length,afterDelete,aborted,afterAbort,albumFull,finalCount,closed,toneMappingRestored};
  });
  assert.deepEqual(errors,[]);assert.equal(result.base.width,1536);assert.equal(result.base.height,1024);assert.ok(result.base.bytes>10000);assert.equal(result.base.kind,'virtual-photo');assert.ok(result.oneStop.mean>result.base.mean*1.3);assert.ok(result.blur.variance<result.sharp.variance*.95);assert.equal(result.captures,4);assert.equal(result.cancelled,null);assert.ok(result.progress>0&&result.progress<1);assert.equal(result.stored,4);assert.equal(result.afterDelete,3);assert.equal(result.aborted,true);assert.equal(result.afterAbort,3);assert.equal(result.albumFull,true);assert.equal(result.finalCount,50);assert.equal(result.closed.open,false);assert.ok(result.closed.bufferBytes<4096);assert.equal(result.toneMappingRestored,true);
 }finally{await browser.close();}
});
