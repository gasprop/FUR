/**
 * Physics — Damped Spring-Mass, Wind, Gravity, Grooming Memory,
 * Shockwaves & Breathing for furjs.
 *
 * Each strand is a 2D damped spring:
 *   v += (target - pos) * stiffness * dt
 *   v *= damping   (per-frame exponential decay)
 *   pos += v
 *
 * Target is the sum of influences:
 *   - rest direction (chamfer outward normal)
 *   - ambient wind (coherent curl field)
 *   - pointer repel/attract (radial + tangential swirl)
 *   - shockwave displacement
 *   - gravity / gyro tilt
 *   - grooming memory (lingering comb offset)
 *
 * Strands are rendered as quadratic Bezier curves with a
 * coherent curl field so the coat flows instead of bristling.
 */

export type InteractiveMode = 'repel' | 'attract' | 'none';

export interface WindConfig {
  /** Wind speed (0 = still, 1 = normal breeze, 2 = storm) */
  speed?: number;
  /** Direction in degrees 0-360 (0 = east, 90 = south) */
  direction?: number;
  /** Random gustiness 0-1 (coherent turbulence) */
  gustiness?: number;
}

export interface Shockwave {
  /** Center in CSS px */
  x: number;
  y: number;
  /** Birth time (performance.now) */
  t0: number;
  /** Duration ms */
  duration: number;
  /** Peak radius */
  radius: number;
  /** Strength multiplier */
  strength: number;
}

export interface PhysicsOptions {
  /** Spring stiffness (0.01-0.5, default 0.20) */
  stiffness?: number;
  /** Damping (0.7-0.99, default 0.862 — higher = more sluggish) */
  damping?: number;
  /** Strand mass/inertia (default 1) — scales push */
  mass?: number;
  /** Interaction mode */
  interactive?: InteractiveMode;
  /** How long groomed hair holds its parted state before relaxing (ms) */
  groomMemory?: number;
  /** Ambient wind */
  wind?: WindConfig;
  /** Breathing idle cycle enabled */
  breathing?: boolean;
  /** Breathing speed (cycles per second, default 0.35) */
  breathingSpeed?: number;
  /** Breathing amplitude (default 0.06) */
  breathingAmplitude?: number;
}

/** Per-strand state (Structure-of-Arrays in FurEngine, this is the spec) */
export interface StrandState {
  /** Rest position (root) CSS px */
  px: number;
  py: number;
  /** Rest direction unit vector */
  ux: number;
  uy: number;
  /** Strand length CSS px */
  len: number;
  /** Random phase for wind */
  phase: number;
  /** Wind amplitude  */
  amp: number;
  /** Palette indices */
  ri: number;
  ti: number;
  /** Curl curvature (-0.85 to 0.85) */
  curl: number;
  /** Geometric normal (before comb bend) for rim lighting */
  nx: number;
  ny: number;
  /** Current bend offset (spring position) — mutable per frame */
  bx: number;
  by: number;
  /** Velocity */
  vx: number;
  vy: number;
  /** Groom offset that persists after pointer leaves */
  gx: number;
  gy: number;
  /** Groom timestamp (performance.now when last groomed) */
  groomT: number;
  /** Rosette ring/core values (0-1) */
  rosetteRing: number;
  rosetteCore: number;
  /** Whether this strand is glossy (specular flash) */
  glossy: boolean;
}

/** Live pointer influence point */
export interface InfluencePoint {
  x: number; y: number;     // smoothed pos
  tx: number; ty: number;   // target pos
  vx: number; vy: number;   // velocity
  act: number;              // current strength 0-1
  want: number;             // target strength
  seen: boolean;
}

/**
 * Compute spring update for one strand.
 *
 * @param strand — mutable StrandState (bx,by,vx,vy updated in place)
 * @param targetX / targetY — desired bend offset this frame (from wind+pointer+shockwave)
 * @param dt — frame delta as multiple of 16.667ms
 * @param opts — physics tunables
 * @param now — performance.now for grooming memory decay
 * @returns clamped bend offset [bx, by]
 */
export function springUpdate(
  strand: StrandState,
  targetX: number,
  targetY: number,
  dt: number,
  opts: { stiffness: number; damping: number },
  now: number,
  groomMemory: number
): [number, number] {
  // Grooming memory: blend groom offset toward zero over groomMemory duration
  let groomX = 0, groomY = 0;
  if (groomMemory > 0 && strand.groomT > 0) {
    const age = now - strand.groomT;
    if (age < groomMemory) {
      const fade = 1 - age / groomMemory;
      // Ease-out curve
      const eased = fade * fade * (3 - 2 * fade);
      groomX = strand.gx * eased;
      groomY = strand.gy * eased;
    } else {
      strand.gx = 0; strand.gy = 0; strand.groomT = 0;
    }
  }

  const totalTX = targetX + groomX;
  const totalTY = targetY + groomY;

  // Damped spring — same math as panther.js (kk = 1 - (1-k)^dt, exponential decay)
  const kk = 1 - Math.pow(1 - opts.stiffness, dt);
  const damp = Math.pow(opts.damping, dt);

  let vx = strand.vx + (totalTX - strand.bx) * kk;
  let vy = strand.vy + (totalTY - strand.by) * kk;
  vx *= damp; vy *= damp;

  let bx = strand.bx + vx;
  let by = strand.by + vy;

  // Legibility cap: bend no more than ~1.15× strand length
  const maxB = strand.len * 1.15;
  const bl = Math.sqrt(bx * bx + by * by);
  if (bl > maxB) {
    const sc = maxB / bl;
    bx *= sc; by *= sc;
    vx *= 0.55; vy *= 0.55;
  }

  strand.vx = vx; strand.vy = vy;
  strand.bx = bx; strand.by = by;
  return [bx, by];
}

/** Record a grooming event — caller updates strand.gx/gy/groomT on pointer lift */
export function recordGroom(strand: StrandState, now: number): void {
  strand.gx = strand.bx * 0.55;
  strand.gy = strand.by * 0.55;
  strand.groomT = now;
}

/** Shockwave displacement at a position — radial ripple */
export function shockwaveAt(
  sw: Shockwave,
  px: number, py: number,
  now: number
): { dx: number; dy: number } {
  const age = now - sw.t0;
  if (age < 0 || age > sw.duration) return { dx: 0, dy: 0 };
  const prog = age / sw.duration; // 0..1
  const curR = sw.radius * prog;
  const dx = px - sw.x, dy = py - sw.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.001) return { dx: 0, dy: 0 };
  // Ring-shaped wave: strongest just behind the front
  const waveW = sw.radius * 0.18;
  const distFromFront = curR - d;
  // Only displace if within wave band
  if (distFromFront < -waveW || distFromFront > waveW) return { dx: 0, dy: 0 };
  // Actually we want a pulse: gaussian around front
  const sigma = waveW * 0.5;
  const g = Math.exp(-(distFromFront * distFromFront) / (2 * sigma * sigma));
  // Time fade
  const timeFade = 1 - prog;
  const strength = g * sw.strength * timeFade * 18;
  const inv = 1 / d;
  return { dx: dx * inv * strength, dy: dy * inv * strength };
}

/** Ambient wind target for a strand given time + phase */
export function windAt(
  tSec: number,
  strand: StrandState,
  wind: WindConfig,
  reduceMotion: boolean
): { x: number; y: number } {
  const speed = wind.speed ?? 0.6;
  const gustiness = wind.gustiness ?? 0.5;
  const dirRad = ((wind.direction ?? 45) * Math.PI) / 180;
  const cosD = Math.cos(dirRad), sinD = Math.sin(dirRad);

  const w = reduceMotion ? 0.15 : speed;
  // Base breeze: sinusoid per strand phase
  const baseX = Math.sin(tSec * 1.6 + strand.phase) * 1.15 * strand.amp * w;
  const baseY = Math.cos(tSec * 1.25 + strand.phase * 1.7) * 1.15 * strand.amp * w;

  // Add directional bias
  const biasX = cosD * w * 0.8;
  const biasY = sinD * w * 0.8;

  // Gustiness: low-frequency coherent noise
  const gust = gustiness * Math.sin(tSec * 0.7 + strand.phase * 0.5) * w * 0.6;

  return {
    x: baseX + biasX + gust * cosD,
    y: baseY + biasY + gust * sinD,
  };
}

/** Breathing scale factor (1 ± amplitude) for idle pulsing */
export function breathingScale(tSec: number, speed = 0.35, amplitude = 0.06): number {
  return 1 + Math.sin(tSec * speed * Math.PI * 2) * amplitude;
}

/** Pointer influence on a strand — repel or attract */
export function pointerInfluence(
  mode: InteractiveMode,
  strandX: number, strandY: number,
  points: InfluencePoint[],
  strandLen: number,
  radius: number,
  _strand: StrandState
): { x: number; y: number } {
  if (mode === 'none' || points.length === 0) return { x: 0, y: 0 };
  const r2 = radius * radius;
  const invR = 1 / radius;
  let tx = 0, ty = 0;

  for (const p of points) {
    const ddx = strandX - p.x;
    const ddy = strandY - p.y;
    const d2 = ddx * ddx + ddy * ddy;
    if (d2 >= r2) continue;
    const d = Math.sqrt(d2) + 0.001;
    const inv = 1 / d;
    let f = 1 - d * invR;
    f = f * f * p.act;

    const pushBase = f * strandLen * 1.42;
    const dir = mode === 'attract' ? -1 : 1;
    const push = pushBase * dir;

    tx += ddx * inv * push;
    ty += ddy * inv * push;

    // Tangential swirl driven by pointer velocity
    const spd = (Math.abs(p.vx) + Math.abs(p.vy)) * 0.022;
    if (spd > 0.01) {
      let clamped = spd;
      if (clamped > 1) clamped = 1;
      const cross = ddx * p.vy - ddy * p.vx;
      const sgn = cross >= 0 ? 1 : -1;
      const sw = push * 0.62 * clamped * sgn;
      tx -= ddy * inv * sw;
      ty += ddx * inv * sw;
    }
  }

  return { x: tx, y: ty };
}

/** Gravity vector from DeviceOrientation (gamma = left-right, beta = front-back) */
export function gravityFromOrientation(gamma: number | null, beta: number | null): { gx: number; gy: number } {
  if (gamma === null || gamma === undefined || beta === null || beta === undefined) return { gx: 0, gy: 0 };
  // gamma: -90..90 (left/right tilt), beta: -180..180 (front/back)
  // Map to gentle gravity bias — 8px max displacement per axis
  const gx = (gamma / 90) * 8;
  const gy = (beta / 180) * 8;
  return { gx, gy };
}

/** Rosette (Worley cell) helper — matches panther.js exactly */
export function hash2(ix: number, iy: number): number {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

const ROS = 24; // rosette cell size in mask px

export function rosetteAt(x: number, y: number): { ring: number; core: number } {
  const gx = Math.floor(x / ROS), gy = Math.floor(y / ROS);
  let f1 = 1e9, r = ROS * 0.33;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cxg = gx + i, cyg = gy + j;
      const ox = (cxg + 0.15 + 0.7 * hash2(cxg, cyg)) * ROS;
      const oy = (cyg + 0.15 + 0.7 * hash2(cxg + 7.3, cyg + 3.1)) * ROS;
      const dx = ox - x, dy = oy - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) {
        f1 = d;
        r = ROS * (0.26 + 0.18 * hash2(cxg + 13.7, cyg + 5.9));
      }
    }
  }
  const band = (f1 - r) / (ROS * 0.15);
  let ring = 1 - band * band;
  if (ring < 0) ring = 0;
  let core = 1 - (f1 * f1) / (r * r);
  if (core < 0) core = 0;
  return { ring, core };
}
