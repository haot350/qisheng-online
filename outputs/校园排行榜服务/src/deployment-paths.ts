import path from 'node:path';
export function deploymentPaths(env:NodeJS.ProcessEnv=process.env){
 const configured=(key:string,fallback:string)=>{const v=env[key];if(!v)return fallback;if(v.includes('\0')||!path.isAbsolute(v))throw Error('Invalid deployment path '+key);return path.normalize(v);};
 const raw=env.QISHENG_REALTIME_HEALTH_PORTS;
 const workerPorts=raw?raw.split(',').map(v=>Number(v.trim())):[2567,2568,2569];
 if(workerPorts.length!==3||new Set(workerPorts).size!==3||workerPorts.some(p=>!Number.isInteger(p)||p<1024||p>65535))throw Error('Invalid realtime health ports');
 const staticManifest=configured('QISHENG_STATIC_MANIFEST','/srv/codex/sites/current/manifest.json');
 const marker=staticManifest.split(path.sep+'sites'+path.sep)[0];
 const workspaceRoot=env.QISHENG_WORKSPACE_ROOT?configured('QISHENG_WORKSPACE_ROOT',''):marker!==staticManifest?marker:undefined;
 return {workspaceRoot,staticManifest:configured('QISHENG_STATIC_MANIFEST','/srv/codex/sites/current/manifest.json'),realtimeDirectory:configured('QISHENG_REALTIME_DIRECTORY','/srv/codex/realtime/current'),workerPorts};
}
