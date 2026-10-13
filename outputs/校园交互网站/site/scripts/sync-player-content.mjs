import {access} from 'node:fs/promises';
await access(new URL('../../../校园共享模块/src/player-content/index.ts',import.meta.url));
console.log('Player content uses the shared package directly; no generated content snapshot.');
