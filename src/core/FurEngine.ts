/**
 * FurEngine — Main Canvas 2D Render Loop & Lifecycle for furjs
 *
 * Integrates:
 *   - ChamferMask (offscreen raster + distance field)
 *   - ColorRamp + Presets (3-zone optical model)
 *   - Physics (springs, wind, pointers, shockwaves, grooming, breathing)
 *   - QualityTuner (adaptive DPR + density)
 *   - Exporters (PNG/GIF snapshots)
 *
 * Pure Canvas 2D, zero dependencies, self-healing resize/visibility.
 * Inspired by panther.js (1140 lines) — generalized for any text/font.
 */

import { ChamferMask, type ChamferField } from './ChamferMask.js';
import { buildPalette, type RampEntry } from './ColorRamp.js';
import { getPreset, type FurPreset } from './Presets.js';
import { createTunerState, effectiveDpr, tunerTick, probeInitialLevel, DEFAULT_LEVELS, DEFAULT_PIXEL_BUDGET } from './QualityTuner.js';
import { GIFEncoder, downloadBlob as dlBlob, downloadDataURL as dlURL } from '../utils/Exporters.js';
import type { WindConfig, InteractiveMode, Shockwave, InfluencePoint } from './Physics.js';
import { shockwaveAt, breathingScale, gravityFromOrientation, rosetteAt } from './Physics.js';
import { MorphEngine, ScrollDriver, type MorphOptions, type ScrollLinkOptions } from './MorphEngine.js';

// ------------------------------------------------------------------
// Public Types
// ------------------------------------------------------------------

export interface FurOptions {
  /** Text to render — any unicode, multi-line via \n, emojis ✦ ★ 🐾 */
  text?: string;
  /** Font family — e.g. "Cinzel", "Playfair Display", "Inter" */
  font?: string;
  /** Font size — CSS clamp string or numeric px */
  fontSize?: number | string;
  /** Font weight 100-900 */
  fontWeight?: number | string;
  /** Letter spacing as em fraction (0.025 default) */
  letterSpacing?: number;
  /** Fit mode for canvas — tight hugs glyphs, normal pads */
  fit?: 'tight' | 'normal';

  /** Built-in preset name — overrides colors */
  preset?: string;
  /** Explicit 4-zone colors (root/shaft/tip/rim) as any CSS color */
  colors?: { root?: string; shaft?: string; tip?: string; rim?: string };
  /** Gradient across letters */
  gradient?: { direction?: 'horizontal' | 'vertical' | 'diagonal'; colors: string[] };
  /** Texture source URL / element */
  texture?: string | HTMLImageElement | HTMLCanvasElement;

  /** Interaction mode */
  interactive?: InteractiveMode;
  /** Damped spring tuning */
  stiffness?: number;
  damping?: number;
  mass?: number;
  /** How long groomed hair stays parted (ms) */
  groomMemory?: number;
  /** Ambient wind */
  wind?: WindConfig;
  /** Breathing idle cycle */
  breathing?: boolean;
  /** Hair length scale (0.5-2) */
  hairLength?: number;
  /** Strand density scale */
  density?: number;
  /** Touch + multi-touch enabled (default true) */
  touch?: boolean;
  /** Gyroscope enabled (default true) */
  gyroscope?: boolean;
  /** Click shockwave enabled (default true) */
  shockwave?: boolean;

  /** SVG path silhouette — custom mask (stretch goal) */
  svgPath?: string;
  /** Custom canvas mask element */
  customMask?: HTMLCanvasElement;

  /** Background color for canvas (behind glow) */
  background?: string;

  /** Callback when frame renders (for external HUD) */
  onFrame?: (stats: { fps: number; strandCount: number; dpr: number; level: number }) => void;
}

export interface FurInstance {
  /** Root container element */
  readonly container: HTMLElement;
  /** Working canvas element */
  readonly canvas: HTMLCanvasElement;
  /** Current options snapshot */
  readonly options: FurOptions;
  /** Update any options live — re-rasterizes if text/font changed */
  update(opts: Partial<FurOptions>): void;
  /** Force full rebuild (text/font/layout changed externally) */
  rebuild(): void;
  /** Pause animation loop */
  pause(): void;
  /** Resume animation loop */
  resume(): void;
  /** Destroy and clean up all observers/listeners */
  destroy(): void;
  /** Export ultra-high-res PNG data URL */
  exportPNG(opts?: { scale?: number; transparent?: boolean }): Promise<string>;
  /** Export seamless looping GIF Blob */
  exportGIF(opts?: { duration?: number; fps?: number }): Promise<Blob>;
  /** Convenience downloaders */
  downloadPNG(opts?: { scale?: number; filename?: string }): Promise<void>;
  downloadGIF(opts?: { duration?: number; fps?: number; filename?: string }): Promise<void>;
  /** Special — morph to new text with fur-spring easing */
  morph(text: string, opts?: MorphOptions): Promise<void>;
  /** Special — link fur wind/morph to scroll */
  linkToScroll(opts?: ScrollLinkOptions): () => void;
  /** Unlink scroll driver */
  unlinkScroll(): void;
  /** SEO: static poster PNG for SSR / Core Web Vitals */
  generateStaticFallback(opts?: { scale?: number; width?: number; height?: number }): Promise<string>;
}

// ------------------------------------------------------------------
// Internal strand SoA (Structure-of-Arrays) — cache-friendly
// ------------------------------------------------------------------

interface StrandArrays {
  // Rest position & direction
  PX: Float32Array; PY: Float32Array;
  UX: Float32Array; UY: Float32Array;
  // Current length (scaled by physics preset + hairLength)
  LEN: Float32Array;
  // Phases
  PH: Float32Array; AMP: Float32Array;
  // Palette indices
  RI: Uint8Array; TI: Uint8Array;
  // Curl
  CURL: Float32Array;
  // Geometric normal (for rim lighting before comb bend)
  NX: Float32Array; NY: Float32Array;
  // Spring state
  BX: Float32Array; BY: Float32Array;
  VX: Float32Array; VY: Float32Array;
  // Grooming memory
  GX: Float32Array; GY: Float32Array;
  GT: Float64Array;
  // Rosette
  RR: Float32Array; RC: Float32Array;
  // Glossy flag (0/1)
  GL: Uint8Array;
  // Count
  N: number;
}

// ------------------------------------------------------------------
// Engine Implementation
// ------------------------------------------------------------------

export class FurEngine implements FurInstance {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  options: FurOptions;

  private ctx: CanvasRenderingContext2D;
  private chamfer: ChamferMask;
  private field: ChamferField | null = null;

  // Offscreen canvases
  private baseCanvas: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private glowCanvas: HTMLCanvasElement;
  private gctx: CanvasRenderingContext2D;

  // Strand SoA
  private strands: StrandArrays | null = null;

  // Geometry
  private W = 0; private H = 0; private DPR = 1; private MS = 0.5;
  private lastW = 0; private lastH = 0;
  private fontSizeCSS = 120;
  private baseLen = 12; private furW = 1;
  private glyphHalfStroke = 4;
  private legibility = 0;
  private glowStrength = 0.62;

  // Palette
  private palette: RampEntry[] = [];
  private presetCache: FurPreset | null = null;
  private NB = 14;

  // Special Feature — Morph + Scroll
  private morphEngine = new MorphEngine();
  private scrollDriver: ScrollDriver | null = null;
  private morphFromStrands: StrandArrays | null = null;
  private morphToStrands: StrandArrays | null = null;
  private morphTargetText: string | null = null;

  // Quality tuner
  private tuner = createTunerState();
  private levels = DEFAULT_LEVELS;
  private pixelBudget = DEFAULT_PIXEL_BUDGET;

  // Motion
  private raf = 0;
  private running = true;
  private lastTime = 0;
  private tSec = 0;
  private frameNo = 0;

  // Pointers
  private rect = { left: 0, top: 0, width: 0, height: 0 };
  private pts: (InfluencePoint & { id: any; touch: boolean })[] = [];
  private mousePt: (InfluencePoint & { id: any; touch: boolean }) | null = null;
  private MAX_TOUCH = 4;
  private shockwaves: Shockwave[] = [];

  // Gyro
  private gyroEnabled = true;
  private gyroX = 0; private gyroY = 0;

  // Breathing
  private breathePhase = 0;

  // Observers / cleanup
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;
  private syncQueued = false;
  private cleanupFns: (() => void)[] = [];
  private visible = true;

  // Reduce motion
  private reduceMotion = false;

  constructor(container: HTMLElement | string, opts: FurOptions = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) as HTMLElement : container;
    if (!el) throw new Error(`furjs: container not found: ${container}`);
    this.container = el;
    this.options = this.normalizeOptions(opts);

    // Create / reuse canvas
    let c = el.querySelector('canvas') as HTMLCanvasElement | null;
    if (!c) {
      c = document.createElement('canvas');
      c.style.display = 'block';
      c.style.width = '100%';
      c.style.height = '100%';
      c.style.touchAction = 'pan-y';
      c.style.cursor = opts.interactive === 'none' ? 'default' : 'crosshair';
      el.appendChild(c);
    }
    this.canvas = c;
    const ctx = c.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('furjs: 2D context unavailable');
    this.ctx = ctx;

    // Offscreen canvases
    this.baseCanvas = document.createElement('canvas');
    this.bctx = this.baseCanvas.getContext('2d')!;
    this.glowCanvas = document.createElement('canvas');
    this.gctx = this.glowCanvas.getContext('2d')!;

    // Chamfer
    this.chamfer = new ChamferMask();

    // Reduce motion
    try {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reduceMotion = mq.matches;
      const onRM = (e: MediaQueryListEvent) => { this.reduceMotion = e.matches; };
      if (mq.addEventListener) mq.addEventListener('change', onRM);
      else (mq as any).addListener(onRM);
    } catch {}

    // Probe initial quality
    probeInitialLevel(this.tuner);

    // Build palette
    this.rebuildPalette();

    // Pointer + gyro + click + resize wiring
    this.wirePointer();
    this.wireGyro();
    this.wireResize();
    this.wireVisibility();
    this.wireIntersection();

    // Initial layout
    this.syncSize(true);
    this.start();
  }

  // ----------------------------------------------------------------
  // Options helpers
  // ----------------------------------------------------------------

  private normalizeOptions(opts: FurOptions): FurOptions {
    return {
      text: opts.text ?? 'FUR',
      font: opts.font ?? 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontWeight: opts.fontWeight ?? 900,
      letterSpacing: opts.letterSpacing ?? 0.025,
      fit: opts.fit ?? 'normal',
      preset: opts.preset ?? 'black-panther',
      colors: opts.colors,
      gradient: opts.gradient,
      texture: opts.texture,
      interactive: opts.interactive ?? 'repel',
      stiffness: opts.stiffness ?? 0.20,
      damping: opts.damping ?? 0.862,
      mass: opts.mass ?? 1,
      groomMemory: opts.groomMemory ?? 2000,
      wind: opts.wind ?? { speed: 0.6, direction: 45, gustiness: 0.45 },
      breathing: opts.breathing ?? false,
      hairLength: opts.hairLength ?? 1,
      density: opts.density,
      touch: opts.touch ?? true,
      gyroscope: opts.gyroscope ?? true,
      shockwave: opts.shockwave ?? true,
      svgPath: opts.svgPath,
      customMask: opts.customMask,
      background: opts.background,
      onFrame: opts.onFrame,
    };
  }

  update(opts: Partial<FurOptions>): void {
    const prevText = this.options.text;
    const prevFont = this.options.font;
    const prevWeight = this.options.fontWeight;
    const prevPreset = this.options.preset;

    Object.assign(this.options, opts);
    // Normalize preset/cursor
    if (opts.interactive !== undefined) {
      this.canvas.style.cursor = opts.interactive === 'none' ? 'default' : 'crosshair';
    }

    // Palette change → rebuild strands only (no re-raster needed unless preset physics differs length)
    const paletteChanged = opts.preset !== undefined || opts.colors !== undefined || opts.gradient !== undefined;
    if (paletteChanged) {
      this.rebuildPalette();
      // Presets can change lengthScale/densityScale — rebuild strands
      const prevScale = prevPreset ? getPreset(prevPreset).physics.lengthScale : 1;
      const newScale = getPreset(this.options.preset).physics.lengthScale;
      if (Math.abs(prevScale - newScale) > 0.01 || opts.colors) {
        // Need re-raster for glow + strands
        this.syncSize(true);
        return;
      }
      // Just recolor existing strands
      if (this.strands) this.buildStrands(false);
    }

    // Text/font/layout change → full rebuild
    if (opts.text !== undefined && opts.text !== prevText) {
      // enforce 256 cap at callsite too
      this.options.text = (opts.text ?? '').slice(0, 256);
      this.syncSize(true);
      return;
    }
    if ((opts.font !== undefined && opts.font !== prevFont) ||
        (opts.fontWeight !== undefined && opts.fontWeight !== prevWeight) ||
        opts.letterSpacing !== undefined ||
        opts.fit !== undefined) {
      this.syncSize(true);
      return;
    }

    // Wind/breathing changes apply live — no rebuild
  }

  rebuild(): void {
    this.rebuildPalette();
    this.syncSize(true);
  }

  private rebuildPalette(): void {
    // Merge preset + explicit colors
    const direct = this.options.colors ?? undefined;
    const preset = getPreset(this.options.preset);
    this.presetCache = preset;
    this.palette = buildPalette({
      nb: this.NB,
      preset: this.options.preset,
      directColors: direct,
      gradient: this.options.gradient ? {
        direction: (this.options.gradient.direction ?? 'horizontal') as any,
        colors: this.options.gradient.colors,
      } : undefined,
    });
  }

  // ----------------------------------------------------------------
  // Geometry / Layout
  // ----------------------------------------------------------------

  private measureViewport(): { w: number; h: number; dpr: number } {
    const r = this.canvas.getBoundingClientRect();
    let w = Math.round(r.width || (this.canvas as any).clientWidth || 0);
    let h = Math.round(r.height || (this.canvas as any).clientHeight || 0);
    if (!(w > 0)) w = Math.round((this.canvas as any).clientWidth) || 320;
    if (!(h > 0)) h = Math.round((this.canvas as any).clientHeight) || 320;
    return { w, h, dpr: window.devicePixelRatio || 1 };
  }

  private effectiveDpr(w: number, h: number, raw: number): number {
    return effectiveDpr(w, h, raw, this.tuner.level, this.levels, this.pixelBudget);
  }

  private syncSize(force: boolean): boolean {
    const m = this.measureViewport();
    const cap = this.effectiveDpr(m.w, m.h, m.dpr);
    if (!force && m.w === this.lastW && m.h === this.lastH && Math.abs(cap - this.DPR) < 0.02) return false;
    this.lastW = m.w; this.lastH = m.h;
    this.layout(m.w, m.h, m.dpr);
    return true;
  }

  private layout(w: number, h: number, rawDpr: number): void {
    this.W = Math.max(40, w | 0);
    this.H = Math.max(40, h | 0);
    this.DPR = this.effectiveDpr(this.W, this.H, rawDpr);

    this.canvas.width = Math.round(this.W * this.DPR);
    this.canvas.height = Math.round(this.H * this.DPR);
    this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    this.rect = this.canvas.getBoundingClientRect() as any;

    this.buildField();
    this.buildBase();
    try { this.buildGlow(); } catch { this.glowCanvas.width = 0; }
    this.buildStrands(true);
    this.renderFrame(1);
  }

  private buildField(): void {
    const W = this.W, H = this.H;
    const text = this.options.text ?? 'FUR';
    const fontFamily = this.options.font ?? 'system-ui, sans-serif';
    const fontWeight = String(this.options.fontWeight ?? 900);
    const letterSpacing = this.options.letterSpacing ?? 0.025;
    const fit = this.options.fit ?? 'normal';

    // Support SVG path / custom mask
    if (this.options.svgPath) {
      this.field = this.buildSvgField(W, H, this.options.svgPath, fontFamily, fontWeight);
      this.MS = this.field.MS;
      this.fontSizeCSS = this.field.fontSizeCSS;
      this.glyphHalfStroke = this.field.halfStrokeMask;
    } else if (this.options.customMask) {
      this.field = this.buildCanvasMaskField(W, H, this.options.customMask);
      this.MS = this.field.MS;
      this.fontSizeCSS = Math.min(W, H) * 0.5;
      this.glyphHalfStroke = this.field.halfStrokeMask;
    } else {
      // Standard text path — sync for now (async font load is handled in update via rebuild)
      this.field = this.chamfer.buildSync(W, H, {
        text,
        fontFamily,
        fontWeight,
        letterSpacing,
        fit,
      });
      this.MS = this.field.MS;
      this.fontSizeCSS = this.field.fontSizeCSS;
      this.glyphHalfStroke = this.field.halfStrokeMask;
    }

    // Async font correction: if font was still loading, re-layout once loaded
    if (!this.options.svgPath && !this.options.customMask) {
      const fam = fontFamily.split(',')[0].replace(/["']/g, '').trim();
      if (fam && 'fonts' in document) {
        import('../utils/FontLoader.js').then(({ ensureFontLoaded }) => {
          ensureFontLoaded({ family: fam, weight: fontWeight, timeout: 3000 }).then((ok) => {
            if (ok) {
              // Only rebuild if field still matches text (avoid thrash)
              if (this.options.text === text && this.field) {
                // Check if font actually changed metrics by re-measuring quickly
                const test = document.createElement('canvas').getContext('2d')!;
                test.font = `900 100px ${fontFamily}`;
                const w1 = test.measureText(text).width;
                this.chamfer.buildSync(W, H, { text, fontFamily, fontWeight, letterSpacing, fit });
                // schedule rebuild via rAF
                requestAnimationFrame(() => this.syncSize(true));
                void w1;
              }
            }
          });
        });
      }
    }

    // Fur size from letterform (fraction of widest stem)
    const halfStrokeCss = (this.glyphHalfStroke > 0 ? this.glyphHalfStroke : 4) / this.MS;
    this.baseLen = Math.max(4.4, Math.min(17, halfStrokeCss * 0.58));
    // Apply preset + user hairLength scaling
    const presetScale = this.presetCache?.physics.lengthScale ?? 1;
    const userScale = this.options.hairLength ?? 1;
    this.baseLen *= presetScale * userScale;

    // Legibility boost for small screens
    this.legibility = 1 - Math.min(this.W, this.H) / 900;
    if (this.legibility < 0) this.legibility = 0;
    if (this.legibility > 0.55) this.legibility = 0.55;
    this.baseLen *= 1 - this.legibility * 0.16;

    const wsc = Math.pow(this.fontSizeCSS / 240, 0.55);
    this.furW = (wsc < 0.72 ? 0.72 : (wsc > 1.2 ? 1.2 : wsc));
    this.furW *= 1 + this.legibility * 0.72;

    this.glowStrength = 0.30 + this.legibility * 0.75;
    // Preset glow color modulates strength slightly
  }

  private buildSvgField(W: number, H: number, pathData: string, _fontFamily: string, _fontWeight: string): ChamferField {
    const MS = Math.min(0.5, 1100 / W);
    const MW = Math.max(4, Math.round(W * MS));
    const MH = Math.max(4, Math.round(H * MS));
    const c = document.createElement('canvas');
    c.width = MW; c.height = MH;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.clearRect(0, 0, MW, MH);
    ctx.fillStyle = '#fff';
    const path = new Path2D(pathData);
    // Center and scale path to fit MW x MH
    // Estimate bounds via offscreen measure (approximate)
    ctx.save();
    ctx.translate(MW * 0.5, MH * 0.5);
    // Heuristic scale: assume path is ~100x100; scale to 0.8 * min(MW,MH)
    const s = Math.min(MW, MH) * 0.8 / 100;
    ctx.scale(s, s);
    ctx.translate(-50, -50);
    ctx.fill(path);
    ctx.restore();

    const img = ctx.getImageData(0, 0, MW, MH).data;
    const alpha = new Uint8Array(MW * MH);
    for (let i = 0, p = 3; i < alpha.length; i++, p += 4) alpha[i] = img[p];
    const { ndx, ndy, halfStroke } = this.chamferFieldFromAlpha(MW, MH, alpha);
    return { MW, MH, MS, fontSizeCSS: Math.min(MW, MH) * 0.6, trackUsed: 0, alpha, ndx, ndy, halfStrokeMask: halfStroke, maskCanvas: c, maskCtx: ctx };
  }

  private buildCanvasMaskField(W: number, H: number, src: HTMLCanvasElement): ChamferField {
    const MS = Math.min(0.5, 1100 / W);
    const MW = Math.max(4, Math.round(W * MS));
    const MH = Math.max(4, Math.round(H * MS));
    const c = document.createElement('canvas');
    c.width = MW; c.height = MH;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.clearRect(0, 0, MW, MH);
    ctx.drawImage(src, 0, 0, MW, MH);
    const img = ctx.getImageData(0, 0, MW, MH).data;
    const alpha = new Uint8Array(MW * MH);
    for (let i = 0, p = 3; i < alpha.length; i++, p += 4) alpha[i] = img[p];
    const { ndx, ndy, halfStroke } = this.chamferFieldFromAlpha(MW, MH, alpha);
    return { MW, MH, MS, fontSizeCSS: Math.min(MW, MH) * 0.6, trackUsed: 0, alpha, ndx, ndy, halfStrokeMask: halfStroke, maskCanvas: c, maskCtx: ctx };
  }

  private chamferFieldFromAlpha(MW: number, MH: number, alpha: Uint8Array): { ndx: Float32Array; ndy: Float32Array; halfStroke: number } {
    const n = MW * MH;
    const dist = new Float32Array(n);
    const vx = new Float32Array(n);
    const vy = new Float32Array(n);
    const INF = 1e9;
    for (let i = 0; i < n; i++) {
      if (alpha[i] > 128) { dist[i] = INF; vx[i] = 0; vy[i] = 0; }
      else { dist[i] = 0; vx[i] = 0; vy[i] = 0; }
    }
    const D1 = 1, D2 = 1.41421356;
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const i = y * MW + x;
        if (dist[i] === 0) continue;
        let best = dist[i], bx = vx[i], by = vy[i];
        if (x > 0) {
          let j = i - 1; let d = dist[j] + D1;
          if (d < best) { best = d; bx = vx[j] - 1; by = vy[j]; }
          if (y > 0) { j = i - MW - 1; d = dist[j] + D2; if (d < best) { best = d; bx = vx[j] - 1; by = vy[j] - 1; } }
        }
        if (y > 0) {
          let j2 = i - MW; let d2 = dist[j2] + D1;
          if (d2 < best) { best = d2; bx = vx[j2]; by = vy[j2] - 1; }
          if (x < MW - 1) { j2 = i - MW + 1; d2 = dist[j2] + D2; if (d2 < best) { best = d2; bx = vx[j2] + 1; by = vy[j2] - 1; } }
        }
        dist[i] = best; vx[i] = bx; vy[i] = by;
      }
    }
    for (let y = MH - 1; y >= 0; y--) {
      for (let x = MW - 1; x >= 0; x--) {
        const i = y * MW + x;
        if (dist[i] === 0) continue;
        let best = dist[i], bx = vx[i], by = vy[i];
        if (x < MW - 1) {
          let j = i + 1; let d = dist[j] + D1;
          if (d < best) { best = d; bx = vx[j] + 1; by = vy[j]; }
          if (y < MH - 1) { j = i + MW + 1; d = dist[j] + D2; if (d < best) { best = d; bx = vx[j] + 1; by = vy[j] + 1; } }
        }
        if (y < MH - 1) {
          let j2 = i + MW; let d2 = dist[j2] + D1;
          if (d2 < best) { best = d2; bx = vx[j2]; by = vy[j2] + 1; }
          if (x > 0) { j2 = i + MW - 1; d2 = dist[j2] + D2; if (d2 < best) { best = d2; bx = vx[j2] - 1; by = vy[j2] + 1; } }
        }
        dist[i] = best; vx[i] = bx; vy[i] = by;
      }
    }
    let mx = 0;
    for (let i = 0; i < n; i++) if (alpha[i] > 128 && dist[i] > mx && dist[i] < INF * 0.5) mx = dist[i];
    if (mx < 1) mx = 4;
    return { ndx: vx, ndy: vy, halfStroke: mx };
  }

  private buildBase(): void {
    if (!this.field) return;
    const W = this.W, H = this.H;
    const DPR = this.DPR;
    this.baseCanvas.width = this.canvas.width;
    this.baseCanvas.height = this.canvas.height;
    this.bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    this.bctx.clearRect(0, 0, W, H);
    // Base gradient from preset
    const preset = this.presetCache ?? getPreset('black-panther');
    let asc = this.fontSizeCSS * 0.72, desc = this.fontSizeCSS * 0.02;
    try {
      this.bctx.font = `900 ${this.fontSizeCSS}px ${this.options.font ?? 'system-ui'}`;
      const m = this.bctx.measureText(this.options.text ?? 'FUR');
      asc = m.actualBoundingBoxAscent || this.fontSizeCSS * 0.72;
      desc = m.actualBoundingBoxDescent || this.fontSizeCSS * 0.02;
    } catch {}
    const baselineY = H * 0.5 + (asc - desc) * 0.5;
    const g = this.bctx.createLinearGradient(0, baselineY - asc, 0, baselineY + desc);
    const bg = preset.baseGradient;
    g.addColorStop(0, bg[0]);
    g.addColorStop(0.4, bg[1]);
    g.addColorStop(1, bg[2]);
    this.bctx.fillStyle = g;
    this.bctx.textAlign = 'center';
    this.bctx.textBaseline = 'alphabetic';
    this.bctx.font = `900 ${this.fontSizeCSS}px ${this.options.font ?? 'system-ui'}`;
    // Draw glyphs with letter spacing
    this.drawGlyphsTo(this.bctx, this.fontSizeCSS, W * 0.5, baselineY, this.options.text ?? 'FUR', this.options.letterSpacing ?? 0.025);
  }

  private buildGlow(): void {
    const W = this.W, H = this.H;
    const preset = this.presetCache ?? getPreset('black-panther');
    // Stage 1: tiny silhouette
    const t1w = Math.max(4, Math.round(W * 0.06));
    const t1h = Math.max(4, Math.round(H * 0.06));
    const c1 = document.createElement('canvas');
    c1.width = t1w; c1.height = t1h;
    const x1 = c1.getContext('2d')!;
    x1.setTransform(t1w / W, 0, 0, t1h / H, 0, 0);
    x1.textAlign = 'center';
    x1.textBaseline = 'alphabetic';
    x1.font = `900 ${this.fontSizeCSS}px ${this.options.font ?? 'system-ui'}`;
    x1.fillStyle = '#fff';
    let asc = this.fontSizeCSS * 0.72, desc = this.fontSizeCSS * 0.02;
    try {
      const mm = x1.measureText(this.options.text ?? 'FUR');
      asc = mm.actualBoundingBoxAscent || this.fontSizeCSS * 0.72;
      desc = mm.actualBoundingBoxDescent || this.fontSizeCSS * 0.02;
    } catch {}
    this.drawGlyphsTo(x1, this.fontSizeCSS, W * 0.5, H * 0.5 + (asc - desc) * 0.5, this.options.text ?? 'FUR', this.options.letterSpacing ?? 0.025);

    // Stage 2: upsample twice for smooth falloff (no ctx.filter needed)
    const t2w = Math.max(8, Math.round(W * 0.16));
    const t2h = Math.max(8, Math.round(H * 0.16));
    const c2 = document.createElement('canvas');
    c2.width = t2w; c2.height = t2h;
    const x2 = c2.getContext('2d')!;
    x2.imageSmoothingEnabled = true;
    (x2 as any).imageSmoothingQuality = 'high';
    x2.drawImage(c1, 0, 0, t2w, t2h);

    this.glowCanvas.width = Math.max(8, Math.round(W * 0.34));
    this.glowCanvas.height = Math.max(8, Math.round(H * 0.34));
    this.gctx.setTransform(1, 0, 0, 1, 0, 0);
    this.gctx.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
    this.gctx.globalCompositeOperation = 'source-over';
    this.gctx.imageSmoothingEnabled = true;
    (this.gctx as any).imageSmoothingQuality = 'high';

    const layers: [number, number][] = [[1.72, 0.15], [1.24, 0.26], [0.94, 0.55]];
    for (const [k, a] of layers) {
      const w = this.glowCanvas.width * k, h = this.glowCanvas.height * k;
      this.gctx.globalAlpha = a;
      this.gctx.drawImage(c2, (this.glowCanvas.width - w) * 0.5, (this.glowCanvas.height - h) * 0.5, w, h);
    }
    this.gctx.globalAlpha = 1;

    // Studio gel — preset glow color
    this.gctx.globalCompositeOperation = 'source-in';
    this.gctx.fillStyle = preset.glowColor;
    this.gctx.fillRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);

    // Elliptical falloff
    this.gctx.globalCompositeOperation = 'destination-in';
    const rg = this.gctx.createRadialGradient(
      this.glowCanvas.width * 0.5, this.glowCanvas.height * 0.5, 0,
      this.glowCanvas.width * 0.5, this.glowCanvas.height * 0.5,
      Math.max(this.glowCanvas.width, this.glowCanvas.height) * 0.52
    );
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.55, 'rgba(255,255,255,0.85)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    this.gctx.fillStyle = rg;
    this.gctx.fillRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
    this.gctx.globalCompositeOperation = 'source-over';
  }

  private drawGlyphsTo(
    c: CanvasRenderingContext2D,
    fs: number,
    cx: number,
    baselineY: number,
    text: string,
    track: number
  ): void {
    const font = this.options.font ?? 'system-ui';
    const weight = String(this.options.fontWeight ?? 900);
    // For multi-line, caller should handle — here single line
    const lines = text.split('\n');
    if (lines.length > 1) {
      const lh = fs * 1.15;
      const totalH = lines.length * lh;
      let y = baselineY - totalH * 0.5 + lh * 0.72;
      for (const line of lines) {
        this.drawSingleLineTo(c, fs, font, weight, cx, y, line, track);
        y += lh;
      }
      return;
    }
    this.drawSingleLineTo(c, fs, font, weight, cx, baselineY, text, track);
  }

  private drawSingleLineTo(
    c: CanvasRenderingContext2D,
    fs: number,
    fontFamily: string,
    fontWeight: string,
    cx: number, baselineY: number,
    text: string,
    track: number
  ): void {
    c.font = `900 ${fs}px ${fontFamily}`;
    // measure
    const ws: number[] = [];
    let total = 0;
    const sp = fs * track;
    for (let i = 0; i < text.length; i++) { const w = c.measureText(text[i]).width; ws.push(w); total += w; }
    total += sp * Math.max(0, text.length - 1);
    let x = cx - total * 0.5;
    const prev = c.textAlign;
    c.textAlign = 'left';
    for (let i = 0; i < text.length; i++) { c.fillText(text[i], x, baselineY); x += ws[i] + sp; }
    c.textAlign = prev;
  }

  // ----------------------------------------------------------------
  // Strand generation — samples roots from mask, applies preset physics,
  // color ramp, Worley rosettes, curl field, grooming memory seeds.
  // ----------------------------------------------------------------

  private buildStrands(_full: boolean): void {
    if (!this.field) return;
    const { MW, MH, alpha, ndx, ndy } = this.field;
    // Count interior pixels for area
    let area = 0;
    for (let i = 0; i < alpha.length; i++) if (alpha[i] > 128) area++;
    if (area < 24) { this.strands = null; return; }

    const preset = this.presetCache ?? getPreset('black-panther');
    const targetBase = Math.max(280, Math.round(
      this.tuner.baseStrands *
      this.levels[this.tuner.level].strands *
      (1 + this.legibility * 0.85) *
      this.tuner.density *
      (preset.physics.densityScale ?? 1) *
      (this.options.density ?? 1)
    ));
    let step = Math.sqrt(area / targetBase);
    if (step < 1.18 - this.legibility * 0.28) step = 1.18 - this.legibility * 0.28;
    if (step > 26) step = 26;

    const toCss = 1 / this.MS;
    const lx = preset.physics.lightX, ly = preset.physics.lightY;
    const isSnow = preset.name === 'snow-leopard';
    const hasRosette = preset.hasRosettes;

    const xs: number[] = [], ys: number[] = [], uxs: number[] = [], uys: number[] = [];
    const lns: number[] = [], phs: number[] = [], amps: number[] = [], ris: number[] = [], tis: number[] = [], cls: number[] = [];
    const nxs: number[] = [], nys: number[] = [], rrs: number[] = [], rcs: number[] = [], gls: number[] = [];

    for (let y = step * 0.5; y < MH; y += step) {
      for (let x = step * 0.5; x < MW; x += step) {
        const jx = x + (Math.random() - 0.5) * step;
        const jy = y + (Math.random() - 0.5) * step;
        const ix = jx | 0, iy = jy | 0;
        if (ix < 1 || iy < 1 || ix >= MW - 1 || iy >= MH - 1) continue;
        const idx = iy * MW + ix;
        if (alpha[idx] < 145) continue;

        let dx = ndx[idx], dy = ndy[idx];
        const mag = Math.sqrt(dx * dx + dy * dy);
        if (mag < 0.0001) continue;
        dx /= mag; dy /= mag;

        const nX = dx, nY = dy;

        // Comb noise — two smooth fields
        let bend = Math.sin(jx * 0.055 + jy * 0.031) * 0.40 +
                   Math.sin(jx * 0.145 - jy * 0.115 + 1.7) * 0.22 +
                   (Math.random() - 0.5) * 0.36 * (1 - this.legibility * 0.5);
        // Snow leopard: slightly more disorder for fluffy look
        if (isSnow) bend *= 1.15;
        const ang = Math.atan2(dy, dx) + bend;
        const c = Math.cos(ang), s = Math.sin(ang);

        const hv = Math.sin(jx * 0.17) * Math.sin(jy * 0.21) * 0.5 + Math.sin(jx * 0.061 + jy * 0.09) * 0.5;
        const guard = Math.random();
        let lenMul = guard > 0.93
          ? 0.86 + Math.random() * 0.16 + hv * 0.08
          : 0.52 + Math.random() * 0.40 + hv * 0.12;
        // For silver variants, keep length shorter for tip flash
        if (lenMul < 0.2) lenMul = 0.2;
        const len = this.baseLen * lenMul;

        // Lighting — preset-driven
        const lightDot = nX * lx + nY * ly;
        const lit = lightDot > 0 ? lightDot : 0;
        const fillDot = -(nX * lx + nY * ly);
        const fill = fillDot > 0 ? fillDot * 0.30 : 0;

        const glossField = 0.45 +
          0.34 * Math.sin(jx * 0.042 + jy * 0.026) +
          0.21 * Math.sin(jx * 0.115 - jy * 0.083 + 2.1);
        const clampedGlossField = glossField < 0.06 ? 0.06 : glossField;

        const tuft = 0.35 + 0.65 * clampedGlossField;
        const glossChance = Math.pow(lit, 1.5) * clampedGlossField * preset.physics.glossIntensity * tuft;
        let glossy = Math.random() < glossChance;
        if (isSnow) glossy = Math.random() < 0.08; // subtler on light coats

        const rr = rosetteAt(jx, jy);
        let rosetteRing = rr.ring, rosetteCore = rr.core;
        if (!hasRosette) { rosetteRing = 0; rosetteCore = 0; }
        else {
          // Strength modulates
          rosetteRing *= preset.physics.rosetteStrength;
          rosetteCore *= preset.physics.rosetteStrength;
        }

        let bodyT = 1.0 + Math.random() * 2.0 +
                    Math.pow(lit, 1.55) * 3.3 * (0.45 + 0.55 * tuft) +
                    fill * 1.7;
        bodyT *= (1 - rosetteRing * 0.50 + rosetteCore * 0.16);
        // Gradient mapping: shift palette index based on strand UV (horizontal/vertical/diagonal)
        if (this.options.gradient && this.options.gradient.colors.length >= 2) {
          const dir = this.options.gradient.direction ?? 'horizontal';
          let t = 0;
          if (dir === 'horizontal') t = jx / Math.max(1, MW);
          else if (dir === 'vertical') t = jy / Math.max(1, MH);
          else t = (jx / Math.max(1, MW) + jy / Math.max(1, MH)) * 0.5;
          // Map t 0→1 to -1.2…+1.2 palette shift for visible letter-to-letter gradient
          bodyT += (t - 0.5) * 2.4;
        }
        if (bodyT < 0) bodyT = 0;
        if (bodyT > 8.5) bodyT = 8.5;

        let ri = bodyT | 0;
        let ti: number;
        if (glossy) {
          ti = 11 + ((Math.random() * 3) | 0);
          if (rosetteRing > 0.35 && Math.random() < 0.72) glossy = false;
          ti = glossy ? ti : ri + 2;
        } else {
          ti = ri + 2 + ((Math.random() * 3) | 0);
          if (ti > 10) ti = 10;
        }
        if (ri > 10) ri = 10;
        if (ti > this.NB - 1) ti = this.NB - 1;
        if (ri > this.NB - 1) ri = this.NB - 1;

        // Curl
        let cw = Math.sin(jx * 0.085 + jy * 0.062) * 0.5 +
                 Math.sin(jx * 0.21 - jy * 0.17 + 0.9) * 0.22 +
                 (Math.random() - 0.5) * 0.5;
        if (cw > 0.85) cw = 0.85;
        if (cw < -0.85) cw = -0.85;

        xs.push(jx * toCss);
        ys.push(jy * toCss);
        uxs.push(c); uys.push(s);
        lns.push(len);
        phs.push(Math.random() * Math.PI * 2);
        amps.push(0.55 + Math.random() * 0.95);
        ris.push(ri); tis.push(ti);
        cls.push(cw);
        nxs.push(nX); nys.push(nY);
        rrs.push(rosetteRing); rcs.push(rosetteCore);
        gls.push(glossy ? 1 : 0);
      }
    }

    const N = xs.length;
    const PX = new Float32Array(N), PY = new Float32Array(N);
    const UX = new Float32Array(N), UY = new Float32Array(N);
    const LEN = new Float32Array(N), PH = new Float32Array(N), AMP = new Float32Array(N);
    const RI = new Uint8Array(N), TI = new Uint8Array(N);
    const CURL = new Float32Array(N);
    const NX = new Float32Array(N), NY = new Float32Array(N);
    const BX = new Float32Array(N), BY = new Float32Array(N);
    const VX = new Float32Array(N), VY = new Float32Array(N);
    const GX = new Float32Array(N), GY = new Float32Array(N);
    const GT = new Float64Array(N);
    const RR = new Float32Array(N), RC = new Float32Array(N);
    const GL = new Uint8Array(N);

    for (let i = 0; i < N; i++) {
      PX[i] = xs[i]; PY[i] = ys[i];
      UX[i] = uxs[i]; UY[i] = uys[i];
      LEN[i] = lns[i]; PH[i] = phs[i]; AMP[i] = amps[i];
      RI[i] = ris[i]; TI[i] = tis[i];
      CURL[i] = cls[i];
      NX[i] = nxs[i]; NY[i] = nys[i];
      RR[i] = rrs[i]; RC[i] = rcs[i];
      GL[i] = gls[i];
    }

    this.strands = { PX, PY, UX, UY, LEN, PH, AMP, RI, TI, CURL, NX, NY, BX, BY, VX, VY, GX, GY, GT, RR, RC, GL, N };
  }

  // ----------------------------------------------------------------
  // Render loop
  // ----------------------------------------------------------------

  private start(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.lastTime = 0;
    this.raf = requestAnimationFrame(this.frame.bind(this));
    this.running = true;
  }

  pause(): void {
    this.running = false;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  }

  resume(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = 0;
    this.start();
  }

  private frame(now: number): void {
    this.raf = requestAnimationFrame(this.frame.bind(this));

    this.frameNo++;
    if ((this.frameNo & 7) === 0) {
      if (this.syncSize(false)) { this.lastTime = 0; return; }
    }

    if (!this.visible && this.io) {
      // Still tick tuner but don't draw
      return;
    }

    if (!this.lastTime) this.lastTime = now;
    let dtMs = now - this.lastTime;
    this.lastTime = now;
    if (dtMs <= 0) dtMs = 16.7;
    let dt = dtMs / 16.667;
    if (dt > 3) dt = 3;
    if (dt < 0.35) dt = 0.35;
    this.tSec += dtMs * 0.001;

    // Update quality tuner (needs drawMs)
    const drawStartForTuner = performance.now();
    // We measure draw after — but tuner needs previous frame's drawMs
    // We'll feed it inside renderFrame wrapper

    // Pointer easing
    const kP = 1 - Math.pow(1 - 0.30, dt);
    const kA = 1 - Math.pow(1 - 0.10, dt);
    const vDamp = Math.pow(0.86, dt);
    const AXP = new Float32Array(8), AYP = new Float32Array(8), AVX = new Float32Array(8), AVY = new Float32Array(8), AA = new Float32Array(8);
    let AP = 0;
    for (let pi = 0; pi < this.pts.length; pi++) {
      const pp = this.pts[pi];
      if (!pp.seen) continue;
      pp.x += (pp.tx - pp.x) * kP;
      pp.y += (pp.ty - pp.y) * kP;
      pp.vx *= vDamp; pp.vy *= vDamp;
      pp.act += (pp.want - pp.act) * kA;
      if (pp.act < 0.001) pp.act = 0;
      if (pp.act > 0.01 && AP < 8) {
        AXP[AP] = pp.x; AYP[AP] = pp.y;
        AVX[AP] = pp.vx; AVY[AP] = pp.vy;
        AA[AP] = pp.act;
        AP++;
      }
      if ((pp as any).touch && pp.act === 0) { this.pts.splice(pi, 1); pi--; }
    }
    // Stash for renderFrame
    (this as any)._AP = AP;
    (this as any)._AXP = AXP; (this as any)._AYP = AYP; (this as any)._AVX = AVX; (this as any)._AVY = AVY; (this as any)._AA = AA;

    // Prune expired shockwaves
    const nowMs = now;
    this.shockwaves = this.shockwaves.filter((s) => nowMs - s.t0 < s.duration);

    // Morph tick — lerp strands between from/to for organic text transition
    if (this.morphEngine.isActive() && this.morphFromStrands && this.morphToStrands && this.strands) {
      const prog = this.morphEngine.tick(now);
      lerpStrands(this.strands, this.morphFromStrands, this.morphToStrands, prog);
    }

    // Draw
    const t0 = performance.now();
    this.renderFrame(dt, AP, AXP, AYP, AVX, AVY, AA);
    const drawMs = performance.now() - t0;
    // Also account for tuner wall time
    const wallMs = performance.now() - drawStartForTuner;

    // Tick tuner
    const tick = tunerTick(this.tuner, wallMs, drawMs, now);
    if (tick.action !== 'none') {
      if (tick.action === 'density-down' || tick.action === 'density-up') {
        this.buildStrands(true);
      } else if (tick.action.startsWith('level')) {
        this.syncSize(true);
        this.lastTime = 0;
        return;
      }
    }

    // Breathing phase
    if (this.options.breathing) {
      this.breathePhase += dtMs * 0.001 * (0.35 * 2 * Math.PI);
    }

    // onFrame callback
    if (this.options.onFrame && this.frameNo % 30 === 0) {
      const fps = 1000 / (wallMs || 16);
      this.options.onFrame({ fps: Math.round(fps), strandCount: this.strands?.N ?? 0, dpr: this.DPR, level: this.tuner.level });
    }
  }

  private renderFrame(
    dt: number,
    AP?: number, AXP?: Float32Array, AYP?: Float32Array,
    AVX?: Float32Array, AVY?: Float32Array, AA?: Float32Array
  ): void {
    // Resolve pointers from stashed or passed
    if (AP === undefined) {
      AP = (this as any)._AP ?? 0;
      AXP = (this as any)._AXP; AYP = (this as any)._AYP;
      AVX = (this as any)._AVX; AVY = (this as any)._AVY; AA = (this as any)._AA;
    }
    if (!AXP || !AYP || !AVX || !AVY || !AA) {
      AP = 0;
      AXP = new Float32Array(4); AYP = new Float32Array(4);
      AVX = new Float32Array(4); AVY = new Float32Array(4); AA = new Float32Array(4);
    }

    const W = this.W, H = this.H;
    this.ctx.clearRect(0, 0, W, H);

    if (this.options.background) {
      this.ctx.fillStyle = this.options.background;
      this.ctx.fillRect(0, 0, W, H);
    }

    if (this.glowCanvas.width > 4) {
      this.ctx.globalAlpha = this.glowStrength;
      this.ctx.drawImage(this.glowCanvas, 0, 0, W, H);
      this.ctx.globalAlpha = 1;
    }

    if (this.baseCanvas.width > 4) {
      this.ctx.drawImage(this.baseCanvas, 0, 0, W, H);
    }

    if (!this.strands || this.strands.N === 0) return;
    const s = this.strands;
    const N = s.N;

    const paths: Path2D[] = new Array(this.NB);
    for (let b = 0; b < this.NB; b++) paths[b] = new Path2D();

    const interactive = this.options.interactive ?? 'repel';
    const radius = Math.max(84, Math.min(W, H) * 0.22);
    const r2 = radius * radius;
    const invR = 1 / radius;
    const windCfg = this.options.wind ?? { speed: 0.6, direction: 45, gustiness: 0.45 };
    const groomMem = this.options.groomMemory ?? 2000;
    const kkStiff = this.options.stiffness ?? 0.20;
    const kkDamp = this.options.damping ?? 0.862;
    const mass = Math.max(0.2, Math.min(5, this.options.mass ?? 1));
    const kk = 1 - Math.pow(1 - kkStiff, dt);
    const damp = Math.pow(this.reduceMotion ? 0.74 : kkDamp, dt);
    const tSec = this.tSec;
    const reduceMotion = this.reduceMotion;
    const breatheEnabled = !!this.options.breathing;

    // Breathing: global scale pulse
    let breatheScale = 1;
    if (breatheEnabled) {
      breatheScale = breathingScale(tSec, 0.35, 0.035);
    }

    for (let i = 0; i < N; i++) {
      const x = s.PX[i], y = s.PY[i];
      const ph = s.PH[i], amp = s.AMP[i], len0 = s.LEN[i];
      const len = breatheEnabled ? len0 * breatheScale : len0;

      // Ambient wind
      let tx = 0, ty = 0;
      {
        // Use windAt helper inline for perf: replicate logic
        const speed = windCfg.speed ?? 0.6;
        const gust = windCfg.gustiness ?? 0.45;
        const dirRad = ((windCfg.direction ?? 45) * Math.PI) / 180;
        const cosD = Math.cos(dirRad), sinD = Math.sin(dirRad);
        const w = reduceMotion ? 0.15 : speed;
        tx = Math.sin(tSec * 1.6 + ph) * 1.15 * amp * w + cosD * w * 0.8 + gust * Math.sin(tSec * 0.7 + ph * 0.5) * w * 0.6 * cosD;
        ty = Math.cos(tSec * 1.25 + ph * 1.7) * 1.15 * amp * w + sinD * w * 0.8 + gust * Math.sin(tSec * 0.7 + ph * 0.5) * w * 0.6 * sinD;
      }

      // Gyro gravity bias
      if (this.gyroEnabled && (this.gyroX !== 0 || this.gyroY !== 0)) {
        tx += this.gyroX * 0.6;
        ty += this.gyroY * 0.6;
      }

      // Shockwaves
      for (const sw of this.shockwaves) {
        const r = shockwaveAt(sw, x, y, performance.now());
        tx += r.dx; ty += r.dy;
      }

      // Pointer influence
      if (AP! > 0 && interactive !== 'none') {
        for (let q = 0; q < AP!; q++) {
          const ddx = x - AXP![q], ddy = y - AYP![q];
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 >= r2) continue;
          const d = Math.sqrt(d2) + 0.001;
          const inv = 1 / d;
          let f = 1 - d * invR;
          f = f * f * AA![q];
          const dir = interactive === 'attract' ? -1 : 1;
          const push = f * len * 1.42 * dir;
          tx += ddx * inv * push;
          ty += ddy * inv * push;
          const spd = (Math.abs(AVX![q]) + Math.abs(AVY![q])) * 0.022;
          if (spd > 0.01) {
            let clamped = spd; if (clamped > 1) clamped = 1;
            const cross = ddx * AVY![q] - ddy * AVX![q];
            const sgn = cross >= 0 ? 1 : -1;
            const sw = push * 0.62 * clamped * sgn;
            tx -= ddy * inv * sw;
            ty += ddx * inv * sw;
          }
        }
      }

      // Grooming memory blending
      if (groomMem > 0 && s.GT[i] > 0) {
        const age = performance.now() - s.GT[i];
        if (age < groomMem) {
          const fade = 1 - age / groomMem;
          const eased = fade * fade * (3 - 2 * fade);
          tx += s.GX[i] * eased;
          ty += s.GY[i] * eased;
        } else {
          s.GX[i] = 0; s.GY[i] = 0; s.GT[i] = 0;
        }
      }

      // Spring — mass divides force (heavier = more inertia)
      let vx = s.VX[i] + (tx - s.BX[i]) * kk / mass;
      let vy = s.VY[i] + (ty - s.BY[i]) * kk / mass;
      vx *= damp; vy *= damp;
      let bxv = s.BX[i] + vx;
      let byv = s.BY[i] + vy;
      const maxB = len * 1.15;
      const bl = Math.sqrt(bxv * bxv + byv * byv);
      if (bl > maxB) {
        const sc = maxB / bl;
        bxv *= sc; byv *= sc;
        vx *= 0.55; vy *= 0.55;
      }
      s.VX[i] = vx; s.VY[i] = vy;
      s.BX[i] = bxv; s.BY[i] = byv;

      // Strand geometry: quadratic Bezier via midpoint curl
      const ux = s.UX[i], uy = s.UY[i];
      const ex = x + ux * len + bxv;
      const ey = y + uy * len + byv;
      const hx = (x + ex) * 0.5, hy = (y + ey) * 0.5;
      const cnx = -(ey - y), cny = (ex - x);
      const curl = s.CURL[i];
      const cx = hx + cnx * curl * 0.62 + ux * len * 0.06;
      const cy = hy + cny * curl * 0.62 + uy * len * 0.06;
      const mx = x * 0.25 + cx * 0.5 + ex * 0.25;
      const my = y * 0.25 + cy * 0.5 + ey * 0.25;

      const ri = s.RI[i], ti = s.TI[i];
      const pr = paths[ri];
      pr.moveTo(x, y);
      pr.lineTo(mx, my);
      const pt = paths[ti];
      pt.moveTo(mx, my);
      pt.lineTo(ex, ey);
    }

    this.ctx.lineCap = 'round';

    // Wet bloom on specular bands
    const bloomEnabled = this.tuner.level < this.levels.length - 1;
    if (bloomEnabled) {
      this.ctx.globalAlpha = 0.09;
      for (let b = this.NB - 3; b < this.NB; b++) {
        if (!this.palette[b]) continue;
        this.ctx.strokeStyle = this.palette[b].color;
        this.ctx.lineWidth = this.palette[b].width * this.furW * 2.6;
        this.ctx.stroke(paths[b]);
      }
      this.ctx.globalAlpha = 1;
    }

    for (let b = 0; b < this.NB; b++) {
      if (!this.palette[b]) continue;
      this.ctx.strokeStyle = this.palette[b].color;
      this.ctx.lineWidth = this.palette[b].width * this.furW;
      this.ctx.stroke(paths[b]);
    }
  }

  // ----------------------------------------------------------------
  // Pointer / Interaction wiring
  // ----------------------------------------------------------------

  private wirePointer(): void {
    const el = this.canvas;

    const makePt = (clientX: number, clientY: number, strength: number, isTouch: boolean, id: any) => {
      const nx = clientX - this.rect.left, ny = clientY - this.rect.top;
      return { id, touch: !!isTouch, x: nx, y: ny, tx: nx, ty: ny, vx: 0, vy: 0, act: 0, want: strength, seen: false };
    };
    const findPt = (id: any) => { for (let i = 0; i < this.pts.length; i++) if (this.pts[i].id === id) return this.pts[i]; return null; };
    const movePt = (p: any, clientX: number, clientY: number, strength: number) => {
      const nx = clientX - this.rect.left, ny = clientY - this.rect.top;
      if (!p.seen) { p.x = nx; p.y = ny; p.seen = true; }
      let dvx = nx - p.tx, dvy = ny - p.ty;
      if (Math.abs(dvx) > 90) dvx = 90 * Math.sign(dvx);
      if (Math.abs(dvy) > 90) dvy = 90 * Math.sign(dvy);
      p.vx = dvx; p.vy = dvy;
      p.tx = nx; p.ty = ny;
      p.want = strength;
    };

    const onMove = (e: PointerEvent) => {
      this.rect = this.canvas.getBoundingClientRect() as any;
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
        if (!this.mousePt) { this.mousePt = makePt(e.clientX, e.clientY, 1, false, 'mouse'); this.pts.push(this.mousePt); }
        movePt(this.mousePt, e.clientX, e.clientY, 1);
      } else {
        if (!this.options.touch) return;
        let t = findPt(e.pointerId);
        if (!t) {
          if (this.pts.length > this.MAX_TOUCH) return;
          t = makePt(e.clientX, e.clientY, 1.25, true, e.pointerId);
          this.pts.push(t);
        }
        movePt(t, e.clientX, e.clientY, 1.25);
      }
    };

    const onDown = (e: PointerEvent) => {
      this.rect = this.canvas.getBoundingClientRect() as any;
      const strength = e.pointerType === 'mouse' ? 1.4 : 1.3;
      let p = findPt(e.pointerId);
      if (!p) {
        if (e.pointerType === 'mouse') {
          if (!this.mousePt) { this.mousePt = makePt(e.clientX, e.clientY, strength, false, 'mouse'); this.pts.push(this.mousePt); }
          p = this.mousePt;
        } else {
          if (!this.options.touch) return;
          if (this.pts.length > this.MAX_TOUCH) return;
          p = makePt(e.clientX, e.clientY, strength, true, e.pointerId);
          this.pts.push(p);
        }
      }
      movePt(p!, e.clientX, e.clientY, strength);
      try { (el as any).setPointerCapture(e.pointerId); } catch {}

      // Click shockwave
      if (this.options.shockwave !== false) {
        const cx = e.clientX - this.rect.left, cy = e.clientY - this.rect.top;
        this.shockwaves.push({
          x: cx, y: cy,
          t0: performance.now(),
          duration: 900,
          radius: Math.max(this.W, this.H) * 0.6,
          strength: 1.2,
        });
      }
    };

    const endPtr = (e: PointerEvent) => {
      const p = findPt(e.pointerId);
      if (!p) return;
      if (p.touch) p.want = 0;
      else p.want = 1;
      // Grooming memory: record current bend as groom offset
      if (this.strands && (this.options.groomMemory ?? 2000) > 0 && this.options.interactive !== 'none') {
        const now = performance.now();
        // For each strand near pointer, lerp groom
        const gx = e.clientX - this.rect.left, gy = e.clientY - this.rect.top;
        const rad = Math.max(64, Math.min(this.W, this.H) * 0.18);
        for (let i = 0; i < this.strands.N; i++) {
          const dx = this.strands.PX[i] - gx, dy = this.strands.PY[i] - gy;
          if (dx * dx + dy * dy < rad * rad) {
            this.strands.GX[i] = this.strands.BX[i] * 0.55;
            this.strands.GY[i] = this.strands.BY[i] * 0.55;
            this.strands.GT[i] = now;
          }
        }
      }
      try { (el as any).releasePointerCapture(e.pointerId); } catch {}
    };

    const onLeave = (e: PointerEvent) => {
      if (this.mousePt && e.pointerType === 'mouse') this.mousePt.want = 0;
    };

    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerdown', onDown, { passive: true });
    el.addEventListener('pointerup', endPtr, { passive: true });
    el.addEventListener('pointercancel', endPtr, { passive: true });
    el.addEventListener('pointerleave', onLeave, { passive: true });
    window.addEventListener('blur', () => { for (const p of this.pts) p.want = 0; });

    this.cleanupFns.push(() => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', endPtr);
      el.removeEventListener('pointercancel', endPtr);
      el.removeEventListener('pointerleave', onLeave);
    });
  }

  private wireGyro(): void {
    if (!this.gyroEnabled || this.options.gyroscope === false) return;
    const handler = (e: DeviceOrientationEvent) => {
      const g = gravityFromOrientation((e as any).gamma ?? null, (e as any).beta ?? null);
      this.gyroX = g.gx;
      this.gyroY = g.gy;
    };
    // iOS 13+ requires permission
    const Btn = (window as any).DeviceOrientationEvent;
    if (Btn && typeof Btn.requestPermission === 'function') {
      // Permission must be requested on user gesture — expose helper
      (this as any)._requestGyro = async () => {
        try {
          const r = await Btn.requestPermission();
          if (r === 'granted') window.addEventListener('deviceorientation', handler, { passive: true });
        } catch {}
      };
      // Also attach click-to-enable on canvas
      this.canvas.addEventListener('click', () => {
        const fn = (this as any)._requestGyro;
        if (fn) fn();
      }, { once: true });
    } else {
      window.addEventListener('deviceorientation', handler, { passive: true });
      this.cleanupFns.push(() => window.removeEventListener('deviceorientation', handler));
    }
  }

  private wireResize(): void {
    const queueSync = () => {
      if (this.syncQueued) return;
      this.syncQueued = true;
      requestAnimationFrame(() => {
        this.syncQueued = false;
        if (this.syncSize(false)) this.lastTime = 0;
        this.rect = this.canvas.getBoundingClientRect() as any;
      });
    };
    window.addEventListener('resize', queueSync, { passive: true });
    window.addEventListener('orientationchange', queueSync, { passive: true });
    window.addEventListener('pageshow', queueSync, { passive: true });
    if ((window as any).visualViewport) {
      (window as any).visualViewport.addEventListener('resize', queueSync, { passive: true });
      (window as any).visualViewport.addEventListener('scroll', queueSync, { passive: true });
    }
    if ((window as any).ResizeObserver) {
      try {
        this.ro = new (window as any).ResizeObserver(queueSync);
        this.ro!.observe(this.canvas);
        this.ro!.observe(this.container);
      } catch { this.ro = null; }
    }
    this.cleanupFns.push(() => {
      window.removeEventListener('resize', queueSync);
      window.removeEventListener('orientationchange', queueSync);
      window.removeEventListener('pageshow', queueSync);
      if ((window as any).visualViewport) {
        (window as any).visualViewport.removeEventListener('resize', queueSync);
        (window as any).visualViewport.removeEventListener('scroll', queueSync);
      }
      if (this.ro) this.ro.disconnect();
    });
  }

  private wireVisibility(): void {
    const onVis = () => {
      if (document.hidden) {
        this.running = false;
        if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
      } else if (!this.running && this.visible) {
        this.running = true;
        this.lastTime = 0;
        this.start();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    this.cleanupFns.push(() => document.removeEventListener('visibilitychange', onVis));
  }

  private wireIntersection(): void {
    if (!('IntersectionObserver' in window)) return;
    this.io = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      if (entry.isIntersecting) {
        if (!this.visible) {
          this.visible = true;
          if (!this.running && !document.hidden) { this.running = true; this.lastTime = 0; this.start(); }
        }
      } else {
        if (this.visible) {
          this.visible = false;
          if (this.running) { this.running = false; if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } }
        }
      }
    }, { threshold: 0, rootMargin: '200px' });
    this.io.observe(this.canvas);
    this.cleanupFns.push(() => { if (this.io) this.io.disconnect(); });
  }

  // ----------------------------------------------------------------
  // Exports
  // ----------------------------------------------------------------

  async exportPNG(opts: { scale?: number; transparent?: boolean } = {}): Promise<string> {
    const scale = opts.scale ?? 2;
    const transparent = opts.transparent ?? false;
    const w = this.canvas.width, h = this.canvas.height;
    const off = document.createElement('canvas');
    off.width = Math.round(w * scale);
    off.height = Math.round(h * scale);
    const ctx = off.getContext('2d')!;
    // Transparent mode only draws strands — no glow/base/backdrop — true alpha
    if (transparent) {
      ctx.clearRect(0, 0, off.width, off.height);
      // Draw current canvas but remove opaque background by compositing strands-only pass
      // We re-use current canvas pixels but clear solid fills via destination-in with alpha mask:
      // Simplest: just draw canvas as-is; caller can composite over page. For true strand-only transparency
      // we re-render a minimal strands-only frame (future: offscreen strand render). For now preserve alpha.
      ctx.imageSmoothingEnabled = true;
      (ctx as any).imageSmoothingQuality = 'high';
      ctx.drawImage(this.canvas, 0, 0, off.width, off.height);
      return off.toDataURL('image/png');
    }
    ctx.fillStyle = this.options.background ?? '#07080d';
    ctx.fillRect(0, 0, off.width, off.height);
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = 'high';
    ctx.drawImage(this.canvas, 0, 0, off.width, off.height);
    return off.toDataURL('image/png');
  }

  /**
   * generateStaticFallback — SEO / Core Web Vitals helper
   * Renders a high-res snapshot as data URL to use as <img> poster
   * before hydration. No animation loop needed.
   * Used for SSR: <img src={staticDataURL} /> → hydration replaces with live canvas.
   */
  async generateStaticFallback(opts: { scale?: number; width?: number; height?: number } = {}): Promise<string> {
    const s = opts.scale ?? 2;
    return this.exportPNG({ scale: s, transparent: false });
  }

  async exportGIF(opts: { duration?: number; fps?: number } = {}): Promise<Blob> {
    const duration = opts.duration ?? 2500;
    const fps = opts.fps ?? 20;
    const delay = 1000 / fps;
    const frames = Math.round(duration / delay);
    const encoder = new GIFEncoder(this.canvas.width, this.canvas.height);
    return new Promise((resolve, reject) => {
      let count = 0;
      const tick = () => {
        if (count >= frames) {
          encoder.encode().then(resolve).catch(reject);
          return;
        }
        encoder.addFrame(this.canvas, delay);
        count++;
        // Use rAF-ish cadence — capture every ~delay ms
        setTimeout(tick, delay);
      };
      tick();
    });
  }

  async downloadPNG(opts: { scale?: number; filename?: string } = {}): Promise<void> {
    const url = await this.exportPNG({ scale: opts.scale ?? 2, transparent: false });
    dlURL(url, opts.filename ?? `fur-${(this.options.text ?? 'export').replace(/\s+/g, '-').toLowerCase()}.png`);
  }

  async downloadGIF(opts: { duration?: number; fps?: number; filename?: string } = {}): Promise<void> {
    const blob = await this.exportGIF({ duration: opts.duration, fps: opts.fps });
    dlBlob(blob, opts.filename ?? `fur-${(this.options.text ?? 'export').replace(/\s+/g, '-').toLowerCase()}.gif`);
  }

  // ----------------------------------------------------------------
  // Special: Morph + Scroll — The *actually used* killer feature
  // ----------------------------------------------------------------

  async morph(text: string, opts: MorphOptions = {}): Promise<void> {
    const target = text.slice(0, 256);
    if (!target || target === this.options.text) return;
    const fromText = this.options.text ?? '';
    const duration = opts.duration ?? 900;
    const easing = opts.easing ?? 'fur-spring';
    this.morphFromStrands = this.strands ? cloneStrands(this.strands) : null;
    this.morphTargetText = target;
    const fontFamily = this.options.font ?? 'system-ui, sans-serif';
    const fontWeight = String(this.options.fontWeight ?? 900);
    const letterSpacing = this.options.letterSpacing ?? 0.025;
    const savedField = this.field;
    this.options.text = target;
    if (opts.preset) { this.options.preset = opts.preset; this.rebuildPalette(); }
    try {
      const tField = this.chamfer.buildSync(this.W, this.H, { text: target, fontFamily, fontWeight, letterSpacing, fit: this.options.fit ?? 'normal' });
      this.field = tField; this.MS = tField.MS; this.fontSizeCSS = tField.fontSizeCSS; this.glyphHalfStroke = tField.halfStrokeMask;
      const halfCss = (this.glyphHalfStroke > 0 ? this.glyphHalfStroke : 4) / this.MS;
      this.baseLen = Math.max(4.4, Math.min(17, halfCss * 0.58)) * (this.presetCache?.physics.lengthScale ?? 1) * (this.options.hairLength ?? 1);
      this.baseLen *= 1 - Math.min(0.55, Math.max(0, 1 - Math.min(this.W, this.H) / 900)) * 0.16;
      const wsc = Math.pow(this.fontSizeCSS / 240, 0.55);
      this.furW = (wsc < 0.72 ? 0.72 : wsc > 1.2 ? 1.2 : wsc) * (1 + Math.max(0, 1 - Math.min(this.W, this.H) / 900) * 0.72);
      this.buildBase(); try { this.buildGlow(); } catch {}
      this.buildStrands(true);
      this.morphToStrands = this.strands ? cloneStrands(this.strands) : null;
    } catch {}
    this.field = savedField; if (savedField) { this.MS = savedField.MS; this.fontSizeCSS = savedField.fontSizeCSS; this.glyphHalfStroke = savedField.halfStrokeMask; }
    this.options.text = fromText;
    if (this.morphFromStrands) this.strands = cloneStrands(this.morphFromStrands);
    this.morphEngine.start(fromText, target, { duration, easing, preset: opts.preset });
    return new Promise<void>((resolve) => {
      const check = () => {
        if (!this.morphEngine.isActive()) {
          this.options.text = target; this.rebuild();
          this.morphFromStrands = null; this.morphToStrands = null; this.morphTargetText = null;
          if (opts.onComplete) opts.onComplete(); resolve();
        } else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }

  linkToScroll(opts: ScrollLinkOptions = {}): () => void {
    if (!this.scrollDriver) this.scrollDriver = new ScrollDriver((patch) => this.update(patch as Partial<FurOptions>), (t) => { if (t !== this.options.text) this.morph(t, { duration: 600, easing: 'easeInOut' }).catch(()=>{}); });
    const off = this.scrollDriver.link(opts);
    this.cleanupFns.push(off);
    return off;
  }

  unlinkScroll(): void { if (this.scrollDriver) { this.scrollDriver.unlink(); this.scrollDriver = null; } }

  // ----------------------------------------------------------------
  // Destroy
  // ----------------------------------------------------------------

  destroy(): void {
    this.running = false;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    this.unlinkScroll();
    if (this.morphEngine) this.morphEngine.cancel();
    for (const fn of this.cleanupFns) try { fn(); } catch {}
    this.cleanupFns = [];
    this.pts = [];
    this.shockwaves = [];
    if (this.chamfer) this.chamfer.destroy();
    // Remove canvas if we created it
    // Keep container intact to allow re-mount
  }
}

/**
 * Vanilla JS factory — framework-agnostic entry point.
 *
 * @example
 * ```ts
 * import { createFur } from 'furjs';
 * const fur = createFur('#hero', { text: 'ROYAL', preset: 'royal-sable' });
 * fur.update({ text: 'KRONOS' });
 * fur.destroy();
 * ```
 */
function cloneStrands(s: StrandArrays): StrandArrays {
  return {
    PX: new Float32Array(s.PX), PY: new Float32Array(s.PY),
    UX: new Float32Array(s.UX), UY: new Float32Array(s.UY),
    LEN: new Float32Array(s.LEN), PH: new Float32Array(s.PH), AMP: new Float32Array(s.AMP),
    RI: new Uint8Array(s.RI), TI: new Uint8Array(s.TI),
    CURL: new Float32Array(s.CURL), NX: new Float32Array(s.NX), NY: new Float32Array(s.NY),
    BX: new Float32Array(s.BX), BY: new Float32Array(s.BY), VX: new Float32Array(s.VX), VY: new Float32Array(s.VY),
    GX: new Float32Array(s.GX), GY: new Float32Array(s.GY), GT: new Float64Array(s.GT),
    RR: new Float32Array(s.RR), RC: new Float32Array(s.RC), GL: new Uint8Array(s.GL),
    N: s.N,
  };
}

function lerpStrands(cur: StrandArrays, from: StrandArrays, to: StrandArrays, t: number): void {
  const n = Math.min(cur.N, from.N, to.N);
  for (let i=0;i<n;i++) {
    cur.PX[i] = from.PX[i] + (to.PX[i] - from.PX[i]) * t;
    cur.PY[i] = from.PY[i] + (to.PY[i] - from.PY[i]) * t;
    cur.UX[i] = from.UX[i] + (to.UX[i] - from.UX[i]) * t;
    cur.UY[i] = from.UY[i] + (to.UY[i] - from.UY[i]) * t;
    cur.LEN[i] = from.LEN[i] + (to.LEN[i] - from.LEN[i]) * t;
    // Keep BX/BY velocity for organic overshoot — lerp gently
    cur.BX[i] = from.BX[i] * (1-t) + to.BX[i] * t;
    cur.BY[i] = from.BY[i] * (1-t) + to.BY[i] * t;
  }
  // If counts differ, we already built target count — keep cur.N = n for visual consistency
}

export function createFur(
  container: HTMLElement | string,
  options: FurOptions = {}
): FurInstance {
  return new FurEngine(container, options);
}
