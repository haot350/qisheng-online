import {defineConfig,type Plugin} from 'vite';
import baseConfig from './vite.config';
import path from 'node:path';

export default defineConfig(async context=>{
 if(process.env.OPENQS_PROFILE!=='production')throw Error('Android requires the accepted production game profile.');
 const config=await (typeof baseConfig==='function'?baseConfig(context):baseConfig);
 // The accepted web build owns the campus assets. This build emits only the
 // Android bootstrap and the same application modules, without map codegen/copy.
 const plugins=(config.plugins??[]).filter(plugin=>!plugin||Array.isArray(plugin)||!['runtime-assets-only','explicit-production-profile'].includes((plugin as Plugin).name));
 return{...config,plugins,base:'/android/runtime/',publicDir:false,build:{...config.build,outDir:path.resolve(process.env.QISHENG_ANDROID_WEB_DIST||'dist-android-runtime'),emptyOutDir:true,manifest:true,cssCodeSplit:true,rollupOptions:{input:{'android-entry':path.resolve('src/android-entry.ts')},output:{entryFileNames:'android-entry-[hash].js',chunkFileNames:'chunks/[name]-[hash].js',assetFileNames:'resources/[name]-[hash][extname]'}}}};
});
