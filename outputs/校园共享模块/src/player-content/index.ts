export {FAQ_GROUPS} from './faq';
export * from './faq-search';
export * from './releases';
export * from './release-read';
import {FAQ_GROUPS} from './faq';
import {LATEST_RELEASE,PLAYER_RELEASES} from './releases';
export const PLAYER_CONTENT={latest:LATEST_RELEASE,releases:PLAYER_RELEASES,faq:FAQ_GROUPS} as const;
