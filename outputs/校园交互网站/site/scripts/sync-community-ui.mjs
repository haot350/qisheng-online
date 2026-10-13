import {access} from 'node:fs/promises';
await access(new URL('../../../校园共享模块/src/community/index.ts',import.meta.url));
await import('./sync-player-content.mjs');
console.log('Community UI uses the shared package directly; no source copying.');
