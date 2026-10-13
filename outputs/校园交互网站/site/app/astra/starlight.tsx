'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import logo from './logo.json';

type Star = { x: number; y: number; ox: number; oy: number; size: number; lum: number; warm: boolean; phase: number; delay: number; bright: boolean };
type Controls = { setPaused: (paused: boolean) => void; replay: () => void };
const motionQuery = '(prefers-reduced-motion: reduce)';
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const easeOut = (value: number) => 1 - Math.pow(1 - clamp(value), 3);

function subscribeToMotion(callback: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Reuses the film ending's official compound path and deterministic sampling.
// No filled logo or enclosing ring is drawn; only the sampled points are visible.
function particles(context: CanvasRenderingContext2D, count: number) {
  const random = seeded(6092731);
  const shape = new Path2D(logo.paths[0].d);
  const stars: Star[] = [];
  while (stars.length < count) {
    const sx = 118.557 + random() * 484.139;
    const sy = 120.758 + random() * 479.818;
    if (!context.isPointInPath(shape, sx, sy, 'nonzero')) continue;
    const bright = stars.length % 61 === 0;
    stars.push({
      x: 656 + (sx - 118.557) * 608 / 484.139,
      y: 236 + (sy - 120.758) * 608 / 484.139,
      ox: (random() - .5) * 1000,
      oy: (random() - .5) * 560,
      size: bright ? 1.8 + random() * 1.1 : .45 + random() * 1,
      lum: bright ? .94 + random() * .06 : .38 + random() * .60,
      warm: random() < .15,
      phase: random() * Math.PI * 2,
      delay: random() * .14,
      bright,
    });
  }
  const field: Star[] = Array.from({ length: count < 2000 ? 42 : 74 }, () => ({
    x: 132 + random() * 1656, y: 90 + random() * 886, ox: 0, oy: 0,
    size: .4 + random() * .6, lum: .1 + random() * .23, warm: false,
    phase: random() * 6.28, delay: 0, bright: false,
  }));
  return { stars, field };
}

function drawParticle(context: CanvasRenderingContext2D, star: Star, x: number, y: number, opacity: number, time: number, scale: number) {
  const twinkle = .90 + .10 * Math.sin(star.phase + time * 1.8);
  const alpha = star.lum * opacity * twinkle;
  const color = star.warm ? '255,216,184' : '205,232,255';
  const size = Math.max(.34, star.size * scale);
  if (star.bright) {
    const radius = (10 + star.size * 1.8) * scale;
    const glow = context.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(${color},${alpha * .57})`);
    glow.addColorStop(.24, `rgba(${color},${alpha * .19})`);
    glow.addColorStop(1, `rgba(${color},0)`);
    context.fillStyle = glow;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  context.fillStyle = `rgba(${color},${alpha})`;
  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.fill();
  if (star.bright) {
    context.fillStyle = `rgba(255,255,255,${alpha * .88})`;
    context.beginPath();
    context.arc(x, y, size * .48, 0, Math.PI * 2);
    context.fill();
  }
}

export function Starlight() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlsRef = useRef<Controls | null>(null);
  const elapsedRef = useRef(0);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeToMotion, () => window.matchMedia(motionQuery).matches, () => false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    let width = 0;
    let height = 0;
    let visible = false;
    let frame = 0;
    let lastTime = 0;
    let lastPaint = 0;
    let disposed = false;
    context.setTransform(1, 0, 0, 1, 0, 0);
    const data = particles(context, window.matchMedia('(max-width: 760px)').matches ? 1500 : 2800);

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);
      const scale = Math.min(width * .64, height * .58) / 608;
      const centerY = height * .5;
      for (const star of data.field) {
        drawParticle(context, star, star.x / 1920 * width, star.y / 1080 * height, 1, time, .75);
      }
      for (const star of data.stars) {
        const progress = reducedMotion ? 1 : easeOut((time - star.delay) / (2 - star.delay));
        const x = width / 2 + (star.x - 960 + star.ox * (1 - progress)) * scale;
        const y = centerY + (star.y - 540 + star.oy * (1 - progress)) * scale;
        drawParticle(context, star, x, y, .35 + .65 * progress, time, scale);
      }
    };

    const shouldAnimate = () => !disposed && visible && !document.hidden && !pausedRef.current && !reducedMotion;
    const tick = (now: number) => {
      frame = 0;
      if (!shouldAnimate()) { lastTime = 0; return; }
      if (lastTime) elapsedRef.current += Math.min((now - lastTime) / 1000, .1);
      lastTime = now;
      // The completed mark needs only a quiet shimmer, capped at 30 paints per second.
      if (elapsedRef.current < 2 || now - lastPaint >= 1000 / 30) {
        draw(elapsedRef.current);
        lastPaint = now;
      }
      frame = requestAnimationFrame(tick);
    };
    const syncPlayback = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      if (reducedMotion) draw(2.5);
      else if (shouldAnimate()) frame = requestAnimationFrame(tick);
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(reducedMotion ? 2.5 : elapsedRef.current);
    };

    controlsRef.current = {
      setPaused(value) { pausedRef.current = value; syncPlayback(); },
      replay() { elapsedRef.current = 0; pausedRef.current = false; draw(reducedMotion ? 2.5 : 0); syncPlayback(); },
    };
    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncPlayback();
    }, { threshold: .05 });
    resize();
    resizeObserver.observe(canvas);
    intersectionObserver.observe(canvas);
    document.addEventListener('visibilitychange', syncPlayback);
    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', syncPlayback);
      controlsRef.current = null;
    };
  }, [reducedMotion]);

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    controlsRef.current?.setPaused(next);
  };
  const replay = () => {
    setPaused(false);
    controlsRef.current?.replay();
  };

  return <figure className="starlight-figure" aria-label="星光汇聚成 OpenAI 标识，延续校园影片的片尾设计">
    <canvas ref={canvasRef} className="starlight-canvas" aria-hidden="true" />
    <div className="starlight-controls">
      <p aria-live="polite">{reducedMotion ? '已按系统偏好显示静态星光' : paused ? '星光已暂停' : '星光汇聚，缓缓闪烁'}</p>
      <div className="starlight-buttons">
        <button type="button" onClick={togglePause} disabled={reducedMotion} aria-pressed={paused} aria-label={paused ? '继续星光动画' : '暂停星光动画'}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}{paused ? '继续' : '暂停'}</button>
        <button type="button" onClick={replay} disabled={reducedMotion}><RotateCcw aria-hidden="true" />重播</button>
      </div>
    </div>
  </figure>;
}
