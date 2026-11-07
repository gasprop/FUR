/**
 * ColorRamp — 3-Layer Optical Model & Gradient Sampler
 *
 * Real biological fur consists of three optical zones plus rim catch:
 *   1. Root / Undercoat  — dark, dense, light-absorbing base
 *   2. Shaft / Body      — main pigment transition
 *   3. Tip / Guard Hair  — translucent, specular-catching outer
 *   4. Rim Catch         — specular normal-mapped edge lighting
 *
 * This module builds a palette of NB discrete color bands (default 14),
 * each with an RGB string and a stroke width, from anchors or explicit colors.
 * It supports:
 *   - Direct hex/RGB/HSL object colors
 *   - Horizontal & vertical gradient mapping across the letters
 *   - Texture / image sampling (pixel-read from an offscreen canvas)
 */

import { getPreset, type FurColors } from './Presets.js';

/** Explicit 4-zone colors (hex or any CSS color) */
export interface DirectColors {
  root: string;
  shaft: string;
  tip: string;
  rim: string;
}

/** Gradient mapping across glyph bounding box */
export interface GradientConfig {
  /** Direction of gradient */
  direction: 'horizontal' | 'vertical' | 'diagonal';
  /** Colors to interpolate between (≥2) */
  colors: string[];
}

/** Texture sampling from an image or canvas */
export interface TextureConfig {
  /** Image URL or HTMLImageElement or HTMLCanvasElement */
  source: string | HTMLImageElement | HTMLCanvasElement;
  /** How strand positions map to texture UVs */
  mapping?: 'stretch' | 'tile';
  /** Optional scale for tiling (default 1) */
  scale?: number;
}

/** Unified color input — one of preset, direct, gradient, texture */
export type ColorInput =
  | { preset?: string }
  | { colors: DirectColors }
  | { gradient: GradientConfig; colors?: DirectColors }
  | { texture: TextureConfig };

/** Resolved ramp entry */
export interface RampEntry {
  color: string;
  width: number;
  /** Original RGB for potential shader use */
  rgb: [number, number, number];
}

export const DEFAULT_NB = 14;

/* ------------------------------------------------------------------ */
/* Color parsing utilities                                             */
/* ------------------------------------------------------------------ */

/**
 * Parse any CSS color string to [r, g, b] 0-255.
 * Supports #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl(), named colors.
 * Falls back to dark grey if unparseable.
 */
export function parseColor(input: string): [number, number, number] {
  const s = input.trim().toLowerCase();

  // Hex #rgb / #rrggbb / #rrggbbaa
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    else if (h.length === 4) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; // skip alpha
    else if (h.length === 8) h = h.slice(0, 6);
    if (h.length === 6) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b];
    }
  }

  // rgb() / rgba()
  const rgbMatch = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (rgbMatch) {
    return [clampByte(parseFloat(rgbMatch[1])), clampByte(parseFloat(rgbMatch[2])), clampByte(parseFloat(rgbMatch[3]))];
  }

  // hsl() / hsla() — convert to rgb
  const hslMatch = s.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/);
  if (hslMatch) {
    return hslToRgb(parseFloat(hslMatch[1]), parseFloat(hslMatch[2]), parseFloat(hslMatch[3]));
  }

  // Named colors — use canvas trick when available, else fallback map
  if (typeof document !== 'undefined') {
    try {
      const ctx = document.createElement('canvas').getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000';
        ctx.fillStyle = s;
        const computed = (ctx.fillStyle as string).toLowerCase();
        if (computed !== '#000000' || s === 'black' || s === '#000' || s === '#000000') {
          // re-parse hex output
          return parseColor(computed);
        }
      }
    } catch { /* ignore */ }
  }

  // Minimal named-color fallback map
  const NAMED: Record<string, [number, number, number]> = {
    black: [0, 0, 0],
    white: [255, 255, 255],
    red: [255, 0, 0],
    green: [0, 128, 0],
    blue: [0, 0, 255],
    ivory: [255, 255, 240],
    cream: [255, 253, 208],
    brown: [139, 69, 19],
    chocolate: [210, 105, 30],
    sand: [194, 178, 128],
    silver: [192, 192, 192],
    gold: [255, 215, 0],
    sapphire: [15, 82, 186],
    emerald: [2, 143, 30],
    burgundy: [128, 0, 32],
  };
  if (s in NAMED) return NAMED[s];

  // Default: dark grey
  return [32, 32, 32];
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  return [clampByte((r1 + m) * 255), clampByte((g1 + m) * 255), clampByte((b1 + m) * 255)];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function rgbToString(c: [number, number, number]): string {
  return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
}

/* ------------------------------------------------------------------ */
/* Palette builders                                                     */
/* ------------------------------------------------------------------ */

export interface PaletteBuildOptions {
  /** Number of bands (default 14) */
  nb?: number;
  /** Preset name to use as anchor source */
  preset?: string;
  /** Explicit 4-zone colors override preset anchors */
  directColors?: Partial<DirectColors>;
  /** Gradient config */
  gradient?: GradientConfig;
  /** Texture config — sampled asynchronously if source is URL */
  texture?: TextureConfig;
}

/** Loaded texture sampler — internal */
interface TextureSampler {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  ready: boolean;
}

/**
 * Build the discrete palette: array of NB RampEntry.
 * Synchronous version — uses anchors or direct colors.
 * For texture sampling, use buildPaletteWithTextureAsync.
 */
export function buildPalette(options: PaletteBuildOptions = {}): RampEntry[] {
  const nb = options.nb ?? DEFAULT_NB;
  const preset = getPreset(options.preset);
  const anchors = preset.paletteAnchors;

  // Resolve anchors: explicit direct colors override preset anchors
  let dark: [number, number, number] = anchors.dark;
  let mid: [number, number, number] = anchors.mid;
  let mid2: [number, number, number] = anchors.mid2 ?? [94, 110, 136];
  let light: [number, number, number] = anchors.light;

  if (options.directColors) {
    if (options.directColors.root) dark = parseColor(options.directColors.root);
    if (options.directColors.shaft) mid = parseColor(options.directColors.shaft);
    if (options.directColors.tip) light = parseColor(options.directColors.tip);
    // rim is used for specular, not palette — but we can blend mid2 from shaft/tip
    if (options.directColors.shaft || options.directColors.tip) {
      const sa = options.directColors.shaft ? parseColor(options.directColors.shaft) : mid;
      const ta = options.directColors.tip ? parseColor(options.directColors.tip) : light;
      mid2 = mix(sa, ta, 0.5);
    }
  }

  const entries: RampEntry[] = [];
  for (let i = 0; i < nb; i++) {
    const t = i / (nb - 1);
    let c: [number, number, number];
    // Original melanistic mapping: 0-0.45 dark→mid, 0.45-0.70 mid→mid2, 0.70-1 mid2→light
    if (t < 0.45) c = mix(dark, mid, t / 0.45);
    else if (t < 0.70) c = mix(mid, mid2, (t - 0.45) / 0.25);
    else c = mix(mid2, light, Math.pow((t - 0.70) / 0.30, 0.8));

    // Width tapers: root hairs are chunkier, tips are finer
    const width = 1.42 - 0.85 * t;

    entries.push({ color: rgbToString(c), width, rgb: c });
  }

  // Apply horizontal/vertical gradient shift if configured
  if (options.gradient && options.gradient.colors.length >= 2) {
    applyGradientTint(entries, options.gradient);
  }

  return entries;
}

/**
 * Tint palette entries based on a gradient across the glyph.
 * This is applied per-strand at generation time conceptually,
 * but we approximate by tinting the discrete palette steps
 * — the actual per-strand gradient sampling happens in FurEngine
 * where each strand's UV maps to the gradient axis.
 * Here we just pre-modulate the ramp slightly.
 */
function applyGradientTint(entries: RampEntry[], g: GradientConfig): void {
  // Parse gradient colors
  const gradRgb = g.colors.map(parseColor);
  // Blend the palette's luminance toward the gradient average
  // For horizontal gradient, tips get more of the end color
  for (let i = 0; i < entries.length; i++) {
    const t = i / (entries.length - 1);
    // Pick gradient color along t
    const gt = sampleGradient(gradRgb, t);
    // Lerp palette color toward gradient color — more influence toward tips
    const lerp = 0.35 + 0.45 * t; // 35% at root, 80% at tip
    const c = mix(entries[i].rgb, gt, lerp);
    entries[i].rgb = c;
    entries[i].color = rgbToString(c);
  }
}

function sampleGradient(colors: [number, number, number][], t: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const seg = (colors.length - 1) * t;
  const lo = Math.floor(seg);
  const hi = Math.min(colors.length - 1, lo + 1);
  const f = seg - lo;
  if (lo === hi) return colors[lo];
  return mix(colors[lo], colors[hi], f);
}

/**
 * Create an offscreen texture sampler from an image source.
 * Returns a Promise that resolves when the image is loaded and sampled.
 */
export function createTextureSampler(source: string | HTMLImageElement | HTMLCanvasElement): Promise<TextureSampler | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }

    if (source instanceof HTMLCanvasElement) {
      const w = source.width;
      const h = source.height;
      const canvas = source;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      resolve({ canvas, ctx, w, h, ready: true });
      return;
    }

    if (source instanceof HTMLImageElement) {
      if (source.complete && source.naturalWidth > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = source.naturalWidth;
        canvas.height = source.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(source, 0, 0);
        resolve({ canvas, ctx, w: canvas.width, h: canvas.height, ready: true });
      } else {
        source.addEventListener('load', () => {
          const canvas = document.createElement('canvas');
          canvas.width = source.naturalWidth;
          canvas.height = source.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(source, 0, 0);
          resolve({ canvas, ctx, w: canvas.width, h: canvas.height, ready: true });
        });
        source.addEventListener('error', () => resolve(null));
      }
      return;
    }

    // string URL
    if (typeof source === 'string') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve({ canvas, ctx, w: canvas.width, h: canvas.height, ready: true });
      };
      img.onerror = () => resolve(null);
      img.src = source;
      return;
    }

    resolve(null);
  });
}

/**
 * Sample a strand color from a texture sampler given strand UV [0,1].
 * Applies mapping logic (stretch vs tile).
 */
export function sampleTexture(sampler: TextureSampler, u: number, v: number, mapping: 'stretch' | 'tile' = 'stretch', scale = 1): [number, number, number] {
  if (!sampler.ready || sampler.w < 1 || sampler.h < 1) return [128, 128, 128];

  // Tile wraps, stretch clamps
  let su: number, sv: number;
  if (mapping === 'tile') {
    su = ((u * scale) % 1 + 1) % 1;
    sv = ((v * scale) % 1 + 1) % 1;
  } else {
    su = Math.max(0, Math.min(1, u));
    sv = Math.max(0, Math.min(1, v));
  }

  const x = Math.floor(su * (sampler.w - 1));
  const y = Math.floor(sv * (sampler.h - 1));
  try {
    const d = sampler.ctx.getImageData(x, y, 1, 1).data;
    return [d[0], d[1], d[2]];
  } catch {
    return [128, 128, 128];
  }
}

/** Extract standalone palette for export / UI display */
export function getPaletteColors(entries: RampEntry[]): string[] {
  return entries.map((e) => e.color);
}

/** Parse preset color to FurColors for external use */
export function getPresetColors(presetName?: string): FurColors {
  return getPreset(presetName).colors;
}
