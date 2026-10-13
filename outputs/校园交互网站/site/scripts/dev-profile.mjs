import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const profile=process.argv[2]??'demo';if(!['demo','production'].includes(profile))throw Error('Expected demo or production.');
const cli=profile==='demo'?'node_modules/vite/bin/vite.js':'scripts/run-framework.mjs';
const child=spawn(process.execPath,[fileURLToPath(new URL('../'+cli,import.meta.url)),...(profile==='production'?['dev']:['--host','127.0.0.1'])],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:'inherit',env:{...process.env,OPENQS_PROFILE:profile}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>process.exit(code??1));
