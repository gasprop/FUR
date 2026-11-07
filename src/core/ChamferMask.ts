/**
 * ChamferMask — Offscreen Glyph Rasterization & Chamfer Distance Field
 *
 * 1. Rasterizes any text (any font, weight, letter-spacing, unicode,
 *    multi-line) into a small offscreen mask.
 * 2. Builds a chamfer distance transform: for each interior pixel,
 *    the vector to the nearest outside pixel (the "grow direction").
 * 3. Provides sampling helpers for strand root distribution.
 *
 * The mask is kept small (W * MS pixels, MS = 0.22-0.50 scale factor)
 * so the O(WH) chamfer passes are cheap. All coordinates are converted
 * back to CSS pixels via toCss = 1/MS.
 *
 * Based on the panther.js chamfer implementation, generalized for
 * arbitrary text + fonts.
 */

import { ensureFontLoaded } from '../utils/FontLoader.js';

/** Options for glyph mask */
export interface ChamferMaskOptions {
  /** Text to rasterize (any unicode, multi-line via \n) */
  text: string;
  /** Font family CSS string */
  fontFamily: string;
  /** Font weight 100-900 */
  fontWeight?: number | string;
  /** Font style normal | italic */
  fontStyle?: string;
  /** Letter spacing as fraction of fontSize (e.g. 0.025) */
  letterSpacing?: number;
  /** Fit mode: tight = hug word, normal = pad */
  fit?: 'tight' | 'normal';
}

/** Result of mask build */
export interface ChamferField {
  /** Mask width (MS-scaled) */
  MW: number;
  /** Mask height */
  MH: number;
  /** Inverse scale: CSS px = mask px * MSinv */
  MS: number;
  /** CSS fontSize used */
  fontSizeCSS: number;
  /** Track (letter-spacing) actually used */
  trackUsed: number;
  /** Alpha channel (0-255) for each mask pixel */
  alpha: Uint8Array;
  /** Vector to nearest outside pixel — X component */
  ndx: Float32Array;
  /** Vector to nearest outside pixel — Y component */
  ndy: Float32Array;
  /** Half thickest stem in mask px (for fur length scaling) */
  halfStrokeMask: number;
  /** Offscreen mask canvas (for base/glow rendering reuse) */
  maskCanvas: HTMLCanvasElement;
  /** Mask 2D context */
  maskCtx: CanvasRenderingContext2D;
}

/** Reusable mask builder */
export class ChamferMask {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      const c = this.canvas.getContext('2d', { willReadFrequently: true });
      if (!c) throw new Error('ChamferMask: 2D context unavailable');
      this.ctx = c;
    } else {
      // SSR — stub (will be re-created on client)
      this.canvas = null as any;
      this.ctx = null as any;
    }
  }

  /**
   * Build the complete chamfer field for given text/layout.
   * Ensures custom font is loaded before measuring.
   */
  async build(
    W: number,
    H: number,
    opts: ChamferMaskOptions
  ): Promise<ChamferField> {
    const fontFamily = opts.fontFamily || 'system-ui, sans-serif';
    const fontWeight = String(opts.fontWeight ?? 900);
    const fontStyle = opts.fontStyle ?? 'normal';
    const tight = opts.fit === 'tight';
    const letterSpacing = opts.letterSpacing ?? 0.025;
    const text = (opts.text ?? '').slice(0, 256); // safety cap

    // Ensure custom web font is loaded before measuring
    try {
      await ensureFontLoaded({ family: fontFamily.split(',')[0].replace(/["']/g, '').trim(), weight: fontWeight, style: fontStyle, timeout: 3000 });
    } catch { /* fallback to system font */ }

    // Scale factor: smaller mask = faster chamfer, but coarser normals
    let MS = Math.min(0.5, 1100 / W);
    if (MS < 0.22) MS = 0.22;

    const MW = Math.max(4, Math.round(W * MS));
    const MH = Math.max(4, Math.round(H * MS));

    this.canvas.width = MW;
    this.canvas.height = MH;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, MW, MH);
    this.ctx.fillStyle = '#fff';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'alphabetic';

    const fontSizeCSS = this.fitFontSize(W, H, text, fontFamily, fontWeight, fontStyle, letterSpacing, tight);
    const fs = fontSizeCSS * MS;
    this.ctx.font = `${fontStyle} ${fontWeight} ${fs}px ${fontFamily}`;

    // Measure for vertical centering — handle multi-line
    const lines = text.split('\n');
    const lineHeight = fs * 1.15;

    if (lines.length === 1) {
      const metrics = this.ctx.measureText(text);
      const asc = (metrics.actualBoundingBoxAscent ?? fs * 0.72);
      const desc = (metrics.actualBoundingBoxDescent ?? fs * 0.02);
      const baselineY = MH * 0.5 + (asc - desc) * 0.5;
      this.drawGlyphs(this.ctx, fs, fontFamily, fontWeight, fontStyle, MW * 0.5, baselineY, text, letterSpacing);
    } else {
      // Multi-line: stack vertically centered
      const totalH = lines.length * lineHeight;
      let y = MH * 0.5 - totalH * 0.5 + lineHeight * 0.72;
      for (const line of lines) {
        this.drawGlyphs(this.ctx, fs, fontFamily, fontWeight, fontStyle, MW * 0.5, y, line, letterSpacing);
        y += lineHeight;
      }
    }

    const img = this.ctx.getImageData(0, 0, MW, MH).data;
    const alpha = new Uint8Array(MW * MH);
    for (let i = 0, p = 3; i < alpha.length; i++, p += 4) alpha[i] = img[p];

    const { ndx, ndy, halfStroke } = this.buildChamfer(MW, MH, alpha);

    return {
      MW, MH, MS,
      fontSizeCSS,
      trackUsed: letterSpacing,
      alpha, ndx, ndy,
      halfStrokeMask: halfStroke,
      maskCanvas: this.canvas,
      maskCtx: this.ctx,
    };
  }

  /** Synchronous fallback without font loading wait (for immediate first paint) */
  buildSync(
    W: number,
    H: number,
    opts: ChamferMaskOptions
  ): ChamferField {
    const fontFamily = opts.fontFamily || 'system-ui, sans-serif';
    const fontWeight = String(opts.fontWeight ?? 900);
    const fontStyle = opts.fontStyle ?? 'normal';
    const tight = opts.fit === 'tight';
    const letterSpacing = opts.letterSpacing ?? 0.025;
    const text = (opts.text ?? '').slice(0, 256);

    let MS = Math.min(0.5, 1100 / W);
    if (MS < 0.22) MS = 0.22;

    const MW = Math.max(4, Math.round(W * MS));
    const MH = Math.max(4, Math.round(H * MS));

    this.canvas.width = MW;
    this.canvas.height = MH;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, MW, MH);
    this.ctx.fillStyle = '#fff';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'alphabetic';

    const fontSizeCSS = this.fitFontSize(W, H, text, fontFamily, fontWeight, fontStyle, letterSpacing, tight);
    const fs = fontSizeCSS * MS;
    this.ctx.font = `${fontStyle} ${fontWeight} ${fs}px ${fontFamily}`;

    const lines = text.split('\n');
    const lineHeight = fs * 1.15;
    if (lines.length === 1) {
      const metrics = this.ctx.measureText(text);
      const asc = (metrics.actualBoundingBoxAscent ?? fs * 0.72);
      const desc = (metrics.actualBoundingBoxDescent ?? fs * 0.02);
      const baselineY = MH * 0.5 + (asc - desc) * 0.5;
      this.drawGlyphs(this.ctx, fs, fontFamily, fontWeight, fontStyle, MW * 0.5, baselineY, text, letterSpacing);
    } else {
      const totalH = lines.length * lineHeight;
      let y = MH * 0.5 - totalH * 0.5 + lineHeight * 0.72;
      for (const line of lines) {
        this.drawGlyphs(this.ctx, fs, fontFamily, fontWeight, fontStyle, MW * 0.5, y, line, letterSpacing);
        y += lineHeight;
      }
    }

    const img = this.ctx.getImageData(0, 0, MW, MH).data;
    const alpha = new Uint8Array(MW * MH);
    for (let i = 0, p = 3; i < alpha.length; i++, p += 4) alpha[i] = img[p];

    const { ndx, ndy, halfStroke } = this.buildChamfer(MW, MH, alpha);

    return {
      MW, MH, MS,
      fontSizeCSS,
      trackUsed: letterSpacing,
      alpha, ndx, ndy,
      halfStrokeMask: halfStroke,
      maskCanvas: this.canvas,
      maskCtx: this.ctx,
    };
  }

  // -----------------------------------------------------------------
  // Measurement helpers
  // -----------------------------------------------------------------

  private measureGlyphs(
    c: CanvasRenderingContext2D,
    fs: number,
    fontFamily: string,
    fontWeight: string,
    fontStyle: string,
    text: string,
    track: number
  ): { ws: number[]; total: number; sp: number } {
    c.font = `${fontStyle} ${fontWeight} ${fs}px ${fontFamily}`;
    const ws: number[] = [];
    let total = 0;
    const sp = fs * track;
    for (let i = 0; i < text.length; i++) {
      const w = c.measureText(text[i]).width;
      ws.push(w);
      total += w;
    }
    total += sp * Math.max(0, text.length - 1);
    return { ws, total, sp };
  }

  private drawGlyphs(
    c: CanvasRenderingContext2D,
    fs: number,
    fontFamily: string,
    fontWeight: string,
    fontStyle: string,
    cx: number,
    baselineY: number,
    text: string,
    track: number
  ): void {
    const m = this.measureGlyphs(c, fs, fontFamily, fontWeight, fontStyle, text, track);
    let x = cx - m.total * 0.5;
    const prevAlign = c.textAlign;
    c.textAlign = 'left';
    for (let i = 0; i < text.length; i++) {
      c.fillText(text[i], x, baselineY);
      x += m.ws[i] + m.sp;
    }
    c.textAlign = prevAlign;
  }

  private fitFontSize(
    W: number, H: number,
    text: string,
    fontFamily: string,
    fontWeight: string,
    fontStyle: string,
    track: number,
    tight: boolean
  ): number {
    // For tight fit (brand lockup) use almost full width; else pad
    const maxW = W * (tight ? 0.99 : (W < 620 ? 0.86 : 0.91));
    const lines = text.split('\n');
    const longest = lines.reduce((a, b) => (a.length > b.length ? a : b), '');
    // Height budget: for multi-line, divide
    const lineCount = lines.length;
    const maxH = tight
      ? (H * 0.9) / lineCount
      : Math.min((H * 0.62) / lineCount, W * 0.46);

    // Measure at 100px reference
    const ref = this.measureGlyphs(this.ctx, 100, fontFamily, fontWeight, fontStyle, longest, track);
    let fs = Math.min(maxW * 100 / (ref.total || 430), maxH);

    // On narrow screens, try tighter tracking to grow letters
    if (!tight) {
      const looseRef = this.measureGlyphs(this.ctx, 100, fontFamily, fontWeight, fontStyle, longest, 0);
      const fsTight = Math.min(maxW * 100 / (looseRef.total || 430), maxH);
      if (fsTight > fs * 1.12) {
        fs = Math.min(maxW * 100 / (this.measureGlyphs(this.ctx, 100, fontFamily, fontWeight, fontStyle, longest, 0.006).total || 430), maxH);
      }
    }

    return Math.max(14, fs);
  }

  // -----------------------------------------------------------------
  // Chamfer distance transform (3-4 chamfer: D1=1, D2=1.4142)
  // Forward + backward passes. Produces per-pixel vector to nearest
  // background pixel. Strands grow along this vector outward.
  // -----------------------------------------------------------------

  private buildChamfer(
    MW: number, MH: number, alpha: Uint8Array
  ): { ndx: Float32Array; ndy: Float32Array; halfStroke: number } {
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

    // Forward pass: top-left → bottom-right
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const i = y * MW + x;
        if (dist[i] === 0) continue;
        let best = dist[i], bx = vx[i], by = vy[i];
        if (x > 0) {
          let j = i - 1;
          let d = dist[j] + D1;
          if (d < best) { best = d; bx = vx[j] - 1; by = vy[j]; }
          if (y > 0) {
            j = i - MW - 1; d = dist[j] + D2;
            if (d < best) { best = d; bx = vx[j] - 1; by = vy[j] - 1; }
          }
        }
        if (y > 0) {
          let j2 = i - MW;
          let d2 = dist[j2] + D1;
          if (d2 < best) { best = d2; bx = vx[j2]; by = vy[j2] - 1; }
          if (x < MW - 1) {
            j2 = i - MW + 1; d2 = dist[j2] + D2;
            if (d2 < best) { best = d2; bx = vx[j2] + 1; by = vy[j2] - 1; }
          }
        }
        dist[i] = best; vx[i] = bx; vy[i] = by;
      }
    }

    // Backward pass: bottom-right → top-left
    for (let y = MH - 1; y >= 0; y--) {
      for (let x = MW - 1; x >= 0; x--) {
        const i = y * MW + x;
        if (dist[i] === 0) continue;
        let best = dist[i], bx = vx[i], by = vy[i];
        if (x < MW - 1) {
          let j = i + 1;
          let d = dist[j] + D1;
          if (d < best) { best = d; bx = vx[j] + 1; by = vy[j]; }
          if (y < MH - 1) {
            j = i + MW + 1; d = dist[j] + D2;
            if (d < best) { best = d; bx = vx[j] + 1; by = vy[j] + 1; }
          }
        }
        if (y < MH - 1) {
          let j2 = i + MW;
          let d2 = dist[j2] + D1;
          if (d2 < best) { best = d2; bx = vx[j2]; by = vy[j2] + 1; }
          if (x > 0) {
            j2 = i + MW - 1; d2 = dist[j2] + D2;
            if (d2 < best) { best = d2; bx = vx[j2] - 1; by = vy[j2] + 1; }
          }
        }
        dist[i] = best; vx[i] = bx; vy[i] = by;
      }
    }

    // Widest stem = max distance inside glyph
    let mx = 0;
    for (let i = 0; i < n; i++) {
      if (alpha[i] > 128 && dist[i] > mx && dist[i] < INF * 0.5) mx = dist[i];
    }
    if (mx < 1) mx = 4;

    return { ndx: vx, ndy: vy, halfStroke: mx };
  }

  /** Destroy canvas refs */
  destroy(): void {
    // allow GC
    (this.canvas as any) = null;
    (this.ctx as any) = null;
  }
}
