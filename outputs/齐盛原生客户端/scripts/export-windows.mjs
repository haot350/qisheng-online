import {mkdir,readFile,stat,writeFile,copyFile,cp} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const demo=process.argv.includes('--demo');
const preset=demo?'Windows Demo':'Windows Internal';
const output=path.join(root,'dist',demo?'windows-demo':'windows-internal');
if(!demo){
 const map=JSON.parse(await readFile(path.join(root,'content/production/map.json'),'utf8'));
 if(map.profile!=='production'||map.chunks?.length!==209)throw Error('Export the verified formal campus with export-campus.mjs --production first.');
}
await stat(path.join(root,'work/templates/windows_debug_x86_64.exe'));
await mkdir(output,{recursive:true});
const code=await new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[path.join(root,'scripts/run-godot.mjs'),'--headless','--export-debug',preset],{cwd:root,stdio:'inherit',windowsHide:true});
 child.on('error',reject);child.on('exit',resolve);
});
if(code!==0)process.exit(Number(code)||1);
await copyFile(path.join(root,'LICENSES.txt'),path.join(output,'LICENSES.txt'));
await cp(path.join(root,'third_party_licenses'),path.join(output,'third_party_licenses'),{recursive:true});
await writeFile(path.join(output,'READ-ME-FIRST.txt'),[
 demo?'OpenQS native anonymous demo':'齐盛Online 原生技术样板 M1（内部）','',
 'Run the EXE beside its PCK file and addons directory. No installer or registry changes are required.',
 'This is a native Godot application, not a webview. Windows x64 / OpenGL 3.3+.',
 demo?'Only original anonymous demonstration geometry is bundled.':'The existing open campus is bundled. Use remains subject to the formal game asset permissions.',
 'WASD move, mouse look, Space jump, Esc/menu pause. Android touch UI is a separate build.',
 'Network compatibility is restricted to loopback fixtures. Competitive Rapier prediction has NOT passed parity.',
 'This prototype is not a replacement for the public web game, and does not submit rankings.',
 'No production passwords, tokens, certificates or player data are included.',
 '© 2026 OpenQS. Source MIT; third-party libraries and formal assets retain their own terms.',''
].join('\r\n'));
console.log(JSON.stringify({preset,output,stage:'internal',published:false}));
