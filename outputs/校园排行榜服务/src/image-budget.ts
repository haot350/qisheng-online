import {AppError} from './validation.js';

let active = 0;
/** A shared bound for all user-supplied raster decoding. There is no waiting queue. */
export function acquireImageJob(): () => void {
  if (active >= 2) throw new AppError('IMAGE_BUSY','图片正在处理，请稍后重试。',503,true);
  active++;
  let released = false;
  return () => { if (!released) { released = true; active--; } };
}
