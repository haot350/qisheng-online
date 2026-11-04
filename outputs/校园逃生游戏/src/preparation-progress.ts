type Work = { id: string; label: string; value: number; started?: number; finished?: number };
export type PreparationTiming = { label: string; durationMs: number; complete: boolean };

/** Complete the real preparation jobs before publishing readiness. In
 * particular, an abort arriving during a GPU await cannot report completion. */
export async function runPreparationJobs(
  jobs: readonly (() => void | Promise<void>)[],
  signal: AbortSignal,
  publish: (ratio: number) => void,
) {
  signal.throwIfAborted();
  publish(0);
  for (const [index, job] of jobs.entries()) {
    signal.throwIfAborted();
    await job();
    signal.throwIfAborted();
    publish((index + 1) / jobs.length);
  }
  if (!jobs.length) publish(1);
}

/** Work completion, not an estimate of the time remaining. Parallel reports
 * retain their own progress and cannot reset another operation's completion. */
export class PreparationProgress {
  private work: Work[];
  private last = 0;
  constructor(
    tasks: readonly { id: string; label: string }[],
    private publish: (ratio: number, message: string) => void,
    private clock = () => performance.now(),
  ) {
    this.work = tasks.map(task => ({ ...task, value: 0 }));
  }
  update(id: string, value: number, detail?: string) {
    const task = this.work.find(item => item.id === id);
    if (!task || !Number.isFinite(value)) return;
    task.started ??= this.clock();
    task.value = Math.max(task.value, Math.min(1, Math.max(0, value)));
    if (task.value === 1 && task.finished === undefined) task.finished = this.clock();
    const active = this.work.find(item => item.value < 1);
    this.last = Math.max(this.last, this.work.reduce((sum, item) => sum + item.value, 0) / Math.max(1, this.work.length));
    const done = this.work.filter(item => item.value === 1).length;
    this.publish(this.last, active
      ? (active === task && detail ? detail : active.label) + ` ${done}/${this.work.length} 项`
      : '准备完成');
  }
  timings(): PreparationTiming[] {
    const now = this.clock();
    return this.work.map(task => ({ label: task.label, durationMs: task.started===undefined?0:Math.round((task.finished ?? now) - task.started), complete: task.finished !== undefined }));
  }
}
