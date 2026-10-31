export interface NativeUIActions {
  background: () => void;
  resume: () => void;
  back: () => boolean;
}

/** The shell owns system navigation; the game consumes only a current UI
 * action. Returning to the foreground never means continuing a match. */
export function bindNativeUIEvents(target: EventTarget, actions: NativeUIActions) {
  const background = () => actions.background();
  const resume = () => actions.resume();
  const back = (event: Event) => {
    if (!actions.back()) return;
    const detail = (event as CustomEvent<{handle?: () => void}>).detail;
    if (typeof detail?.handle === 'function') detail.handle();
  };
  target.addEventListener('qisheng:native-background',background);
  target.addEventListener('qisheng:native-resume',resume);
  target.addEventListener('qisheng:native-back',back);
  return () => {
    target.removeEventListener('qisheng:native-background',background);
    target.removeEventListener('qisheng:native-resume',resume);
    target.removeEventListener('qisheng:native-back',back);
  };
}
