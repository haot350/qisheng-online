import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const profile=process.argv[2]??'demo';if(!['demo','production'].includes(profile))throw Error('Expected demo or production.');
const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/vite/bin/vite.js',import.meta.url)),'--host','127.0.0.1'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,OPENQS_PROFILE:profile},stdio:'inherit'});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>process.exit(code??1));
