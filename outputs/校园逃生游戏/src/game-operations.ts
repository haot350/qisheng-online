import { GameConfigStore } from './game-config-store';
import { RANKING_API } from './ranking/client';
let storage: Storage | undefined;
try { storage = globalThis.localStorage; } catch {}
export const gameOperations = new GameConfigStore(RANKING_API + '/v1/game-config', (input, init) => globalThis.fetch(input, init), storage);
