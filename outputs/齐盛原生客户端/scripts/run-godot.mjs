import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),workspace=path.resolve(root,'../..'),godot=process.env.GODOT_BIN||path.join(workspace,'work/Godot-4.7.2/Godot_v4.7.2-stable_win64_console.exe');
// Keep toolchains, signing material and test drivers outside the editor import scan.
for(const relative of ['work','private','dist','physics-rs','scripts','tests']){const directory=path.join(root,relative);await mkdir(directory,{recursive:true});await writeFile(path.join(directory,'.gdignore'),'',{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});}
const appdata=path.join(root,'work/appdata'),local=path.join(root,'work/localappdata');await mkdir(appdata,{recursive:true});await mkdir(local,{recursive:true});
const child=spawn(godot,['--path',root,...process.argv.slice(2)],{cwd:root,windowsHide:true,stdio:'inherit',env:{...process.env,APPDATA:appdata,LOCALAPPDATA:local,QS_NATIVE_CAPTURE_DIR:path.join(root,'docs/screenshots')}});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
