export {FAQ_GROUPS} from './faq.js';
export * from './faq-search.js';
export * from './releases.js';
export * from './release-read.js';
import {FAQ_GROUPS} from './faq.js';
import {LATEST_RELEASE,PLAYER_RELEASES} from './releases.js';
export const PLAYER_CONTENT={latest:LATEST_RELEASE,releases:PLAYER_RELEASES,faq:FAQ_GROUPS} as const;
