import type {Loadout, Mode, Settings} from './types';

type Selection = {mode:Mode; primary:Loadout['primary']; practice:boolean; settings:Settings; identity:string|null};
export type LaunchIntent = Readonly<Selection & {id:number; loadout?:Loadout; resumeStory:boolean}>;

/** A launch owns a committed selection; subsequent menu edits cannot change it. */
export function freezeLaunch(id:number, selection:Selection & {resumeStory?:boolean}):LaunchIntent {
  const settings=Object.freeze(structuredClone(selection.settings));
  const loadout=selection.mode==='escape'?Object.freeze({primary:selection.practice?'m4a1' as const:selection.primary,difficulty:selection.practice?'easy' as const:settings.escapeDifficulty??'standard',training:selection.practice}):undefined;
  return Object.freeze({...selection,id,settings,loadout,resumeStory:!!selection.resumeStory});
}

export function launchMatches(request:LaunchIntent, selection:Selection) {
  return request.mode===selection.mode && request.primary===selection.primary && request.practice===selection.practice && request.identity===selection.identity && JSON.stringify(request.settings)===JSON.stringify(selection.settings);
}
