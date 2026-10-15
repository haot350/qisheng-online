/** Keep render smoothing separate from elapsed fixed simulation time. A long
 * frame either executes a bounded number of real steps or explicitly rebases;
 * it never silently throws away 100–250ms and later calls that a server error. */
export const PREDICTION_STEP = 1 / 60;
export const MAX_FRAME_STEPS = 12;
export function predictionFrame(accumulator: number, elapsed: number) {
  const seconds = Number.isFinite(elapsed) ? Math.max(0, elapsed) : Infinity;
  const total = Math.max(0, accumulator) + seconds;
  const steps = Math.floor((total + 1e-9) / PREDICTION_STEP);
  if (seconds > .2 + 1e-9 || steps > MAX_FRAME_STEPS)
    return { steps: 0, remainder: 0, rebase: true, elapsedMs: seconds * 1000 };
  return { steps, remainder: Math.max(0, total - steps * PREDICTION_STEP), rebase: false, elapsedMs: seconds * 1000 };
}
