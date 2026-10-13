import {withDeadline} from './network.ts';
import type {Mode} from './types';
import {modeCapabilities} from './mode-policy.ts';

/** A failed request is retryable; a late request never replaces its successor. */
export function moduleResource<T>(loader:()=>Promise<T>,timeout=12000){
  let pending:Promise<T>|undefined;
  return ()=>{
    if(!pending){
      const request=withDeadline(Promise.resolve().then(loader),timeout);
      pending=request;
      void request.catch(()=>{if(pending===request)pending=undefined;});
    }
    return pending;
  };
}
export const loadStoryUI=moduleResource(()=>import('./StoryUI'));
export const loadPhotoUI=moduleResource(()=>import('./PhotoUI'));
export const loadArchiveUI=moduleResource(()=>import('./ArchiveUI'));
export const loadRealityUI=moduleResource(()=>import('./RealityUI'));
export async function preloadModeUI(mode:Mode){
  if(mode==='story')await Promise.all([loadStoryUI(),loadPhotoUI()]);
  else if(modeCapabilities(mode).photography)await loadPhotoUI();
}

export const loadRankingUI=moduleResource(()=>import('./RankingUI'));
export const loadFeedbackUI=moduleResource(()=>import('./FeedbackUI'));
export const loadMultiplayerUI=moduleResource(()=>import('./multiplayer/MultiplayerUI'));
