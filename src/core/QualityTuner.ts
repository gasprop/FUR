/**
 * QualityTuner — Adaptive Performance & Pixel Budget
 *
 * Retains and refines panther.js's self-healing frame monitor:
 * - Measures actual render milliseconds per frame via performance.now()
 * - Automatically scales device pixel ratio + strand density to lock 60 FPS
 * - Handles 4K / ProMotion / budget Android transparently
 *
 * Two independent levers:
 *   level   → resolution cap + pixel budget + strand budget (rebuild)
 *   density → strand count only (cheap re-sample)
 *
 * Fast path: when clearly choking, jump 1-2 levels immediately
 * instead of crawling down one per 4s.
 */

export interface QualityLevel {
  /** Cap on DPR (multiplier of native DPR) */
  dpr: number;
  /** Strand count factor (0..1) */
  strands: number;
}

/** Default quality ladder — identical to panther.js */
export const DEFAULT_LEVELS: QualityLevel[] = [
  { dpr: 1.75, strands: 1.0 },
  { dpr: 1.45, strands: 0.88 },
  { dpr: 1.20, strands: 0.74 },
  { dpr: 1.00, strands: 0.60 },
  { dpr: 0.85, strands: 0.46 },
];

/** Hard ceiling on backing-store pixels per level */
export const DEFAULT_PIXEL_BUDGET = [2600000, 2000000, 1500000, 1100000, 780000];

export interface TunerState {
  level: number;
  /** Strand density lever (0.34..1) */
  density: number;
  samples: number;
  lastChange: number;
  smoothSince: number;
  slowStreak: number;
  badFpsSince: number;
  ftAcc: number;
  ftCount: number;
  drawAcc: number;
  cooldown: number;
  baseStrands: number;
}

export function createTunerState(baseStrands?: number): TunerState {
  // Tune baseStrands to device class
  let bs = baseStrands ?? 12000;
  const coarse = (() => {
    try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
  })();
  const cores = (navigator as any).hardwareConcurrency || 4;
  if (bs === 12000) {
    bs = coarse ? 6000 : 16500;
    if (cores <= 4) bs *= 0.78;
  }
  return {
    level: 0,
    density: 1,
    samples: 0,
    lastChange: 0,
    smoothSince: 0,
    slowStreak: 0,
    badFpsSince: 0,
    ftAcc: 0,
    ftCount: 0,
    drawAcc: 0,
    cooldown: 0,
    baseStrands: bs,
  };
}

/** Initial quality guess from device before first build */
export function probeInitialLevel(state: TunerState): void {
  const w = window.innerWidth || 1, h = window.innerHeight || 1;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = w * h * dpr * dpr;
  let coarse = false;
  try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch { }
  const cores = (navigator as any).hardwareConcurrency || 4;
  if (coarse) state.level = 1;
  if (px > 4200000) state.level = Math.max(state.level, 1);
  if (cores <= 4) state.level = Math.max(state.level, 1);
  if (px > 8000000) state.level = Math.max(state.level, 2);
  if (coarse && cores <= 4) state.level = 2;
  if (state.level > DEFAULT_LEVELS.length - 1) state.level = DEFAULT_LEVELS.length - 1;
}

/** Effective DPR given level + pixel budget */
export function effectiveDpr(
  w: number, h: number, rawDpr: number,
  level: number,
  levels = DEFAULT_LEVELS,
  budgets = DEFAULT_PIXEL_BUDGET
): number {
  let d = Math.min(rawDpr || 1, levels[level].dpr);
  const cssPx = Math.max(1, w * h);
  const budget = budgets[level];
  const maxDpr = Math.sqrt(budget / cssPx);
  if (d > maxDpr) d = maxDpr;
  // Floor prevents dissolving on small viewports, but must give way on huge panels
  const floor = cssPx > 3000000 ? 0.44 : (cssPx > 1500000 ? 0.52 : 0.62);
  if (d < floor) d = floor;
  if (d > 3) d = 3;
  return d;
}

/**
 * Feed frame timing into the tuner.
 * Returns an action: 'none' | 'rebuild' (needs full layout rebuild) | 'resample' (strand rebuild only)
 * or 'level-up' / 'density-up' for climbing back.
 */
export function tunerTick(
  state: TunerState,
  dtMs: number,
  drawMs: number,
  now: number
): { action: 'none' | 'level-down' | 'level-down-fast' | 'density-down' | 'level-up' | 'density-up' | 'resample'; newLevel?: number } {
  state.ftAcc += dtMs;
  state.ftCount++;
  state.samples++;
  state.drawAcc += drawMs;

  const windowSize = state.samples < 3 ? 20 : 45;
  if (state.ftCount < windowSize) return { action: 'none' };

  const avg = state.ftAcc / state.ftCount;
  const drawAvg = state.drawAcc / state.ftCount;
  state.ftAcc = 0; state.ftCount = 0; state.drawAcc = 0;

  // ---- Budget check on OUR drawing pass first ----
  if (drawAvg > 12 && now - state.cooldown > 320) {
    const jump2 = drawAvg > 24 ? 2 : 1;
    const nl = Math.min(DEFAULT_LEVELS.length - 1, state.level + jump2);
    if (nl !== state.level) {
      state.level = nl;
      state.cooldown = now; state.lastChange = now; state.smoothSince = 0; state.slowStreak = 0;
      return { action: 'level-down', newLevel: nl };
    } else if (state.density > 0.34) {
      state.density = Math.max(0.34, state.density * 0.76);
      state.cooldown = now; state.lastChange = now; state.smoothSince = 0; state.slowStreak = 0;
      return { action: 'density-down' };
    }
  }

  if (avg > 30 && state.level < 2 && now - state.cooldown > 1200) {
    state.level++;
    state.cooldown = now; state.lastChange = now;
    return { action: 'level-down', newLevel: state.level };
  }

  // Last resort: software GPU, ancient tablet — allow shrinking past normal cap
  if (avg > 40) {
    if (!state.badFpsSince) state.badFpsSince = now;
    if (now - state.badFpsSince > 5000 && state.level < DEFAULT_LEVELS.length - 1 && now - state.cooldown > 2500) {
      state.level++;
      state.cooldown = now; state.lastChange = now; state.badFpsSince = now;
      return { action: 'level-down-fast', newLevel: state.level };
    }
  } else if (avg < 24) {
    state.badFpsSince = 0;
  }

  if (now - state.cooldown > 1400) {
    state.slowStreak = drawAvg > 8 ? state.slowStreak + 1 : 0;

    if (drawAvg > 8 && state.slowStreak >= 2) {
      if (state.level < DEFAULT_LEVELS.length - 1) {
        state.level++; state.slowStreak = 0;
        state.cooldown = now; state.lastChange = now; state.smoothSince = 0;
        return { action: 'level-down', newLevel: state.level };
      } else if (state.density > 0.34) {
        state.density = Math.max(0.34, state.density * 0.82);
        state.slowStreak = 0; state.cooldown = now; state.lastChange = now;
        return { action: 'density-down' };
      }
    }

    // Climb back only after long comfortable stretch
    if (drawAvg < 4.5 && avg < 18 && now - state.lastChange > 9000) {
      if (state.density < 1) {
        state.density = Math.min(1, state.density / 0.88);
        state.cooldown = now; state.lastChange = now;
        return { action: 'density-up' };
      } else if (state.level > 0) {
        state.level--;
        state.cooldown = now; state.lastChange = now; state.smoothSince = 0;
        return { action: 'level-up', newLevel: state.level };
      }
    }
  }

  return { action: 'none' };
}
