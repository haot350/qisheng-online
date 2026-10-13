import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const requested=process.argv[2];if(requested){if(!['demo','production'].includes(requested)||process.argv.length!==3)throw Error('Expected demo or production.');process.env.OPENQS_PROFILE=requested;}
const profile=process.env.OPENQS_PROFILE??'demo';if(!['demo','production'].includes(profile))throw Error('Invalid OPENQS_PROFILE.');
const root=fileURLToPath(new URL('../',import.meta.url));
const tasks=profile==='demo'?[['node_modules/vite/bin/vite.js','build']]:[['scripts/build-static-assets.mjs'],['scripts/sync-community-ui.mjs'],['scripts/run-framework.mjs','build']];
for(const [script,...args] of tasks){const result=spawnSync(process.execPath,[fileURLToPath(new URL('../'+script,import.meta.url)),...args],{cwd:root,stdio:'inherit',env:{...process.env,OPENQS_PROFILE:profile}});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);}
