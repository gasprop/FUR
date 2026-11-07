'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var react = require('react');
var jsxRuntime = require('react/jsx-runtime');

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/utils/FontLoader.ts
var FontLoader_exports = {};
__export(FontLoader_exports, {
  ensureFontLoaded: () => ensureFontLoaded,
  ensureFontsLoaded: () => ensureFontsLoaded,
  supportsFontLoadingAPI: () => supportsFontLoadingAPI
});
async function ensureFontLoaded(opts) {
  const { family, weight = 400, style = "normal", timeout = 3e3 } = opts;
  const generic = /* @__PURE__ */ new Set([
    "serif",
    "sans-serif",
    "monospace",
    "cursive",
    "fantasy",
    "system-ui",
    "ui-sans-serif",
    "ui-serif",
    "ui-monospace"
  ]);
  const normalized = family.trim().replace(/^["']|["']$/g, "").toLowerCase();
  if (generic.has(normalized)) return true;
  if (family.includes(",")) {
    const parts = family.split(",").map((s) => s.trim().toLowerCase());
    if (parts.some((p) => generic.has(p.replace(/^["']|["']$/g, "")))) ;
  }
  if (typeof document === "undefined" || !("fonts" in document)) {
    return true;
  }
  const fonts = document.fonts;
  try {
    if (fonts.check) {
      const descriptor = `${style} ${weight} 12px "${family}"`;
      if (fonts.check(descriptor)) return true;
    }
  } catch {
  }
  const loadPromise = (async () => {
    try {
      const spec = `${style} ${weight} 32px "${family}"`;
      await fonts.load(spec, "BESbwy");
      if (fonts.ready) await fonts.ready;
      return true;
    } catch {
      return false;
    }
  })();
  const timeoutPromise = new Promise(
    (resolve) => setTimeout(() => resolve(false), timeout)
  );
  const result = await Promise.race([loadPromise, timeoutPromise]);
  return result;
}
async function ensureFontsLoaded(families) {
  return Promise.all(families.map((f) => ensureFontLoaded(f)));
}
function supportsFontLoadingAPI() {
  return typeof document !== "undefined" && "fonts" in document;
}
var init_FontLoader = __esm({
  "src/utils/FontLoader.ts"() {
  }
});

// src/core/ChamferMask.ts
init_FontLoader();
var ChamferMask = class {
  constructor() {
    if (typeof document !== "undefined") {
      this.canvas = document.createElement("canvas");
      const c = this.canvas.getContext("2d", { willReadFrequently: true });
      if (!c) throw new Error("ChamferMask: 2D context unavailable");
      this.ctx = c;
    } else {
      this.canvas = null;
      this.ctx = null;
    }
  }
  /**
   * Build the complete chamfer field for given text/layout.
   * Ensures custom font is loaded before measuring.
   */
  async build(W, H, opts) {
    const fontFamily = opts.fontFamily || "system-ui, sans-serif";
    const fontWeight = String(opts.fontWeight ?? 900);
    const fontStyle = opts.fontStyle ?? "normal";
    const tight = opts.fit === "tight";
    const letterSpacing = opts.letterSpacing ?? 0.025;
    const text = (opts.text ?? "").slice(0, 256);
    try {
      await ensureFontLoaded({ family: fontFamily.split(",")[0].replace(/["']/g, "").trim(), weight: fontWeight, style: fontStyle, timeout: 3e3 });
    } catch {
    }
    let MS = Math.min(0.5, 1100 / W);
    if (MS < 0.22) MS = 0.22;
    const MW = Math.max(4, Math.round(W * MS));
    const MH = Math.max(4, Math.round(H * MS));
    this.canvas.width = MW;
    this.canvas.height = MH;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, MW, MH);
    this.ctx.fillStyle = "#fff";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "alphabetic";
    const fontSizeCSS = this.fitFontSize(W, H, text, fontFamily, fontWeight, fontStyle, letterSpacing, tight);
    const fs = fontSizeCSS * MS;
    this.ctx.font = `${fontStyle} ${fontWeight} ${fs}px ${fontFamily}`;
    const lines = text.split("\n");
    const lineHeight = fs * 1.15;
    if (lines.length === 1) {
      const metrics = this.ctx.measureText(text);
      const asc = metrics.actualBoundingBoxAscent ?? fs * 0.72;
      const desc = metrics.actualBoundingBoxDescent ?? fs * 0.02;
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
      MW,
      MH,
      MS,
      fontSizeCSS,
      trackUsed: letterSpacing,
      alpha,
      ndx,
      ndy,
      halfStrokeMask: halfStroke,
      maskCanvas: this.canvas,
      maskCtx: this.ctx
    };
  }
  /** Synchronous fallback without font loading wait (for immediate first paint) */
  buildSync(W, H, opts) {
    const fontFamily = opts.fontFamily || "system-ui, sans-serif";
    const fontWeight = String(opts.fontWeight ?? 900);
    const fontStyle = opts.fontStyle ?? "normal";
    const tight = opts.fit === "tight";
    const letterSpacing = opts.letterSpacing ?? 0.025;
    const text = (opts.text ?? "").slice(0, 256);
    let MS = Math.min(0.5, 1100 / W);
    if (MS < 0.22) MS = 0.22;
    const MW = Math.max(4, Math.round(W * MS));
    const MH = Math.max(4, Math.round(H * MS));
    this.canvas.width = MW;
    this.canvas.height = MH;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, MW, MH);
    this.ctx.fillStyle = "#fff";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "alphabetic";
    const fontSizeCSS = this.fitFontSize(W, H, text, fontFamily, fontWeight, fontStyle, letterSpacing, tight);
    const fs = fontSizeCSS * MS;
    this.ctx.font = `${fontStyle} ${fontWeight} ${fs}px ${fontFamily}`;
    const lines = text.split("\n");
    const lineHeight = fs * 1.15;
    if (lines.length === 1) {
      const metrics = this.ctx.measureText(text);
      const asc = metrics.actualBoundingBoxAscent ?? fs * 0.72;
      const desc = metrics.actualBoundingBoxDescent ?? fs * 0.02;
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
      MW,
      MH,
      MS,
      fontSizeCSS,
      trackUsed: letterSpacing,
      alpha,
      ndx,
      ndy,
      halfStrokeMask: halfStroke,
      maskCanvas: this.canvas,
      maskCtx: this.ctx
    };
  }
  // -----------------------------------------------------------------
  // Measurement helpers
  // -----------------------------------------------------------------
  measureGlyphs(c, fs, fontFamily, fontWeight, fontStyle, text, track) {
    c.font = `${fontStyle} ${fontWeight} ${fs}px ${fontFamily}`;
    const ws = [];
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
  drawGlyphs(c, fs, fontFamily, fontWeight, fontStyle, cx, baselineY, text, track) {
    const m = this.measureGlyphs(c, fs, fontFamily, fontWeight, fontStyle, text, track);
    let x = cx - m.total * 0.5;
    const prevAlign = c.textAlign;
    c.textAlign = "left";
    for (let i = 0; i < text.length; i++) {
      c.fillText(text[i], x, baselineY);
      x += m.ws[i] + m.sp;
    }
    c.textAlign = prevAlign;
  }
  fitFontSize(W, H, text, fontFamily, fontWeight, fontStyle, track, tight) {
    const maxW = W * (tight ? 0.99 : W < 620 ? 0.86 : 0.91);
    const lines = text.split("\n");
    const longest = lines.reduce((a, b) => a.length > b.length ? a : b, "");
    const lineCount = lines.length;
    const maxH = tight ? H * 0.9 / lineCount : Math.min(H * 0.62 / lineCount, W * 0.46);
    const ref = this.measureGlyphs(this.ctx, 100, fontFamily, fontWeight, fontStyle, longest, track);
    let fs = Math.min(maxW * 100 / (ref.total || 430), maxH);
    if (!tight) {
      const looseRef = this.measureGlyphs(this.ctx, 100, fontFamily, fontWeight, fontStyle, longest, 0);
      const fsTight = Math.min(maxW * 100 / (looseRef.total || 430), maxH);
      if (fsTight > fs * 1.12) {
        fs = Math.min(maxW * 100 / (this.measureGlyphs(this.ctx, 100, fontFamily, fontWeight, fontStyle, longest, 6e-3).total || 430), maxH);
      }
    }
    return Math.max(14, fs);
  }
  // -----------------------------------------------------------------
  // Chamfer distance transform (3-4 chamfer: D1=1, D2=1.4142)
  // Forward + backward passes. Produces per-pixel vector to nearest
  // background pixel. Strands grow along this vector outward.
  // -----------------------------------------------------------------
  buildChamfer(MW, MH, alpha) {
    const n = MW * MH;
    const dist = new Float32Array(n);
    const vx = new Float32Array(n);
    const vy = new Float32Array(n);
    const INF = 1e9;
    for (let i = 0; i < n; i++) {
      if (alpha[i] > 128) {
        dist[i] = INF;
        vx[i] = 0;
        vy[i] = 0;
      } else {
        dist[i] = 0;
        vx[i] = 0;
        vy[i] = 0;
      }
    }
    const D1 = 1, D2 = 1.41421356;
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const i = y * MW + x;
        if (dist[i] === 0) continue;
        let best = dist[i], bx = vx[i], by = vy[i];
        if (x > 0) {
          let j = i - 1;
          let d = dist[j] + D1;
          if (d < best) {
            best = d;
            bx = vx[j] - 1;
            by = vy[j];
          }
          if (y > 0) {
            j = i - MW - 1;
            d = dist[j] + D2;
            if (d < best) {
              best = d;
              bx = vx[j] - 1;
              by = vy[j] - 1;
            }
          }
        }
        if (y > 0) {
          let j2 = i - MW;
          let d2 = dist[j2] + D1;
          if (d2 < best) {
            best = d2;
            bx = vx[j2];
            by = vy[j2] - 1;
          }
          if (x < MW - 1) {
            j2 = i - MW + 1;
            d2 = dist[j2] + D2;
            if (d2 < best) {
              best = d2;
              bx = vx[j2] + 1;
              by = vy[j2] - 1;
            }
          }
        }
        dist[i] = best;
        vx[i] = bx;
        vy[i] = by;
      }
    }
    for (let y = MH - 1; y >= 0; y--) {
      for (let x = MW - 1; x >= 0; x--) {
        const i = y * MW + x;
        if (dist[i] === 0) continue;
        let best = dist[i], bx = vx[i], by = vy[i];
        if (x < MW - 1) {
          let j = i + 1;
          let d = dist[j] + D1;
          if (d < best) {
            best = d;
            bx = vx[j] + 1;
            by = vy[j];
          }
          if (y < MH - 1) {
            j = i + MW + 1;
            d = dist[j] + D2;
            if (d < best) {
              best = d;
              bx = vx[j] + 1;
              by = vy[j] + 1;
            }
          }
        }
        if (y < MH - 1) {
          let j2 = i + MW;
          let d2 = dist[j2] + D1;
          if (d2 < best) {
            best = d2;
            bx = vx[j2];
            by = vy[j2] + 1;
          }
          if (x > 0) {
            j2 = i + MW - 1;
            d2 = dist[j2] + D2;
            if (d2 < best) {
              best = d2;
              bx = vx[j2] - 1;
              by = vy[j2] + 1;
            }
          }
        }
        dist[i] = best;
        vx[i] = bx;
        vy[i] = by;
      }
    }
    let mx = 0;
    for (let i = 0; i < n; i++) {
      if (alpha[i] > 128 && dist[i] > mx && dist[i] < INF * 0.5) mx = dist[i];
    }
    if (mx < 1) mx = 4;
    return { ndx: vx, ndy: vy, halfStroke: mx };
  }
  /** Destroy canvas refs */
  destroy() {
    this.canvas = null;
    this.ctx = null;
  }
};

// src/core/Presets.ts
var PRESETS = {
  "black-panther": {
    name: "black-panther",
    label: "Black Panther",
    description: "Melanistic obsidian-black, faint Worley rosettes, cold silver-blue rim catch.",
    colors: {
      root: "#07080d",
      shaft: "#2a3142",
      tip: "#d6e3f5",
      rim: "#e8f0ff"
    },
    paletteAnchors: {
      dark: [7, 8, 13],
      mid: [42, 49, 62],
      mid2: [94, 110, 136],
      light: [214, 227, 245]
    },
    physics: {
      lengthScale: 0.92,
      densityScale: 1.12,
      glossIntensity: 0.95,
      rosetteStrength: 0.55,
      roughness: 0.25,
      lightX: -0.55,
      lightY: -0.835
    },
    glowColor: "#a8c6f0",
    hasRosettes: true,
    baseGradient: ["#151a22", "#0a0d12", "#020305"]
  },
  "royal-sable": {
    name: "royal-sable",
    label: "Royal Sable",
    description: "Dense dark chocolate with velvet sheen \u2014 the rarest fur in the world.",
    colors: {
      root: "#0d0907",
      shaft: "#382417",
      tip: "#c29b68",
      rim: "#f5eee6"
    },
    paletteAnchors: {
      dark: [13, 9, 7],
      mid: [56, 36, 23],
      mid2: [110, 78, 45],
      light: [245, 238, 230]
    },
    physics: {
      lengthScale: 1.05,
      densityScale: 1.18,
      glossIntensity: 0.72,
      rosetteStrength: 0.08,
      roughness: 0.32,
      lightX: -0.5,
      lightY: -0.78
    },
    glowColor: "#e8c9a6",
    hasRosettes: false,
    baseGradient: ["#1a0f08", "#0e0703", "#040201"]
  },
  "snow-leopard": {
    name: "snow-leopard",
    label: "Snow Leopard",
    description: "Frosty silver-white undercoat, charcoal/slate spots, icy crystalline rim.",
    colors: {
      root: "#e8ecf0",
      shaft: "#9aa3b2",
      tip: "#f7f9fb",
      rim: "#d0e8ff"
    },
    paletteAnchors: {
      dark: [58, 62, 72],
      mid: [154, 163, 178],
      mid2: [200, 210, 220],
      light: [247, 249, 251]
    },
    physics: {
      lengthScale: 1.28,
      densityScale: 0.95,
      glossIntensity: 0.6,
      rosetteStrength: 1,
      roughness: 0.38,
      lightX: -0.6,
      lightY: -0.8
    },
    glowColor: "#cde4ff",
    hasRosettes: true,
    baseGradient: ["#d0d6de", "#a8b0bc", "#7e8794"]
  },
  "cashmere-cream": {
    name: "cashmere-cream",
    label: "Cashmere Cream",
    description: "Ultra-soft matte cloud-like ivory/vanilla, airy fluttering guard hairs.",
    colors: {
      root: "#f5efe6",
      shaft: "#e8dccb",
      tip: "#fffaf2",
      rim: "#ffffff"
    },
    paletteAnchors: {
      dark: [198, 185, 165],
      mid: [232, 220, 203],
      mid2: [245, 238, 225],
      light: [255, 250, 242]
    },
    physics: {
      lengthScale: 1.35,
      densityScale: 1.05,
      glossIntensity: 0.22,
      rosetteStrength: 0,
      roughness: 0.82,
      lightX: -0.45,
      lightY: -0.7
    },
    glowColor: "#ffe9c9",
    hasRosettes: false,
    baseGradient: ["#efe6d8", "#e8dccb", "#ddd2be"]
  },
  "desert-caracal": {
    name: "desert-caracal",
    label: "Desert Caracal",
    description: "Warm sand and terracotta tawny coat with charcoal-tipped tufts.",
    colors: {
      root: "#3d2817",
      shaft: "#c17a3a",
      tip: "#f0d5b8",
      rim: "#ffe8c8"
    },
    paletteAnchors: {
      dark: [61, 40, 23],
      mid: [160, 110, 58],
      mid2: [193, 122, 58],
      light: [240, 213, 184]
    },
    physics: {
      lengthScale: 0.88,
      densityScale: 1,
      glossIntensity: 0.45,
      rosetteStrength: 0.15,
      roughness: 0.42,
      lightX: -0.52,
      lightY: -0.75
    },
    glowColor: "#ffb86a",
    hasRosettes: false,
    baseGradient: ["#4a2e14", "#2e1a08", "#1a0e04"]
  },
  "silver-fox": {
    name: "silver-fox",
    label: "Silver Fox",
    description: "Jet-black undercoat exploding into frosted platinum-silver tips.",
    colors: {
      root: "#050508",
      shaft: "#3a3d44",
      tip: "#e8eaef",
      rim: "#f2f4f8"
    },
    paletteAnchors: {
      dark: [5, 5, 8],
      mid: [58, 61, 68],
      mid2: [140, 145, 155],
      light: [232, 234, 239]
    },
    physics: {
      lengthScale: 1.42,
      densityScale: 0.92,
      glossIntensity: 0.78,
      rosetteStrength: 0,
      roughness: 0.28,
      lightX: -0.55,
      lightY: -0.82
    },
    glowColor: "#c8d4e8",
    hasRosettes: false,
    baseGradient: ["#0a0a0e", "#050508", "#000000"]
  },
  "imperial-velvet": {
    name: "imperial-velvet",
    label: "Imperial Velvet",
    description: "Deep royal jewel tones (Sapphire/Emerald/Burgundy) with metallic micro-sheen.",
    colors: {
      root: "#0a0e1a",
      shaft: "#1a3a5c",
      tip: "#6bb6ff",
      rim: "#d4e6ff"
    },
    paletteAnchors: {
      dark: [10, 14, 26],
      mid: [26, 58, 92],
      mid2: [42, 95, 148],
      light: [107, 182, 255]
    },
    physics: {
      lengthScale: 1,
      densityScale: 1.08,
      glossIntensity: 0.68,
      rosetteStrength: 0,
      roughness: 0.35,
      lightX: -0.5,
      lightY: -0.8
    },
    glowColor: "#6bb6ff",
    hasRosettes: false,
    baseGradient: ["#0f1d33", "#0a1433", "#050a1a"]
  }
};
function getPreset(name) {
  if (name && name in PRESETS) return PRESETS[name];
  return PRESETS["black-panther"];
}

// src/core/ColorRamp.ts
var DEFAULT_NB = 14;
function parseColor(input) {
  const s = input.trim().toLowerCase();
  if (s.startsWith("#")) {
    let h = s.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    else if (h.length === 4) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    else if (h.length === 8) h = h.slice(0, 6);
    if (h.length === 6) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b];
    }
  }
  const rgbMatch = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (rgbMatch) {
    return [clampByte(parseFloat(rgbMatch[1])), clampByte(parseFloat(rgbMatch[2])), clampByte(parseFloat(rgbMatch[3]))];
  }
  const hslMatch = s.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/);
  if (hslMatch) {
    return hslToRgb(parseFloat(hslMatch[1]), parseFloat(hslMatch[2]), parseFloat(hslMatch[3]));
  }
  if (typeof document !== "undefined") {
    try {
      const ctx = document.createElement("canvas").getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#000";
        ctx.fillStyle = s;
        const computed = ctx.fillStyle.toLowerCase();
        if (computed !== "#000000" || s === "black" || s === "#000" || s === "#000000") {
          return parseColor(computed);
        }
      }
    } catch {
    }
  }
  const NAMED = {
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
    burgundy: [128, 0, 32]
  };
  if (s in NAMED) return NAMED[s];
  return [32, 32, 32];
}
function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}
function hslToRgb(h, s, l) {
  h = (h % 360 + 360) % 360;
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(h / 60 % 2 - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) {
    r1 = c;
    g1 = x;
  } else if (h < 120) {
    r1 = x;
    g1 = c;
  } else if (h < 180) {
    g1 = c;
    b1 = x;
  } else if (h < 240) {
    g1 = x;
    b1 = c;
  } else if (h < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  return [clampByte((r1 + m) * 255), clampByte((g1 + m) * 255), clampByte((b1 + m) * 255)];
}
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function rgbToString(c) {
  return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
}
function buildPalette(options = {}) {
  const nb = options.nb ?? DEFAULT_NB;
  const preset = getPreset(options.preset);
  const anchors = preset.paletteAnchors;
  let dark = anchors.dark;
  let mid = anchors.mid;
  let mid2 = anchors.mid2 ?? [94, 110, 136];
  let light = anchors.light;
  if (options.directColors) {
    if (options.directColors.root) dark = parseColor(options.directColors.root);
    if (options.directColors.shaft) mid = parseColor(options.directColors.shaft);
    if (options.directColors.tip) light = parseColor(options.directColors.tip);
    if (options.directColors.shaft || options.directColors.tip) {
      const sa = options.directColors.shaft ? parseColor(options.directColors.shaft) : mid;
      const ta = options.directColors.tip ? parseColor(options.directColors.tip) : light;
      mid2 = mix(sa, ta, 0.5);
    }
  }
  const entries = [];
  for (let i = 0; i < nb; i++) {
    const t = i / (nb - 1);
    let c;
    if (t < 0.45) c = mix(dark, mid, t / 0.45);
    else if (t < 0.7) c = mix(mid, mid2, (t - 0.45) / 0.25);
    else c = mix(mid2, light, Math.pow((t - 0.7) / 0.3, 0.8));
    const width = 1.42 - 0.85 * t;
    entries.push({ color: rgbToString(c), width, rgb: c });
  }
  if (options.gradient && options.gradient.colors.length >= 2) {
    applyGradientTint(entries, options.gradient);
  }
  return entries;
}
function applyGradientTint(entries, g) {
  const gradRgb = g.colors.map(parseColor);
  for (let i = 0; i < entries.length; i++) {
    const t = i / (entries.length - 1);
    const gt = sampleGradient(gradRgb, t);
    const lerp = 0.35 + 0.45 * t;
    const c = mix(entries[i].rgb, gt, lerp);
    entries[i].rgb = c;
    entries[i].color = rgbToString(c);
  }
}
function sampleGradient(colors, t) {
  if (colors.length === 1) return colors[0];
  const seg = (colors.length - 1) * t;
  const lo = Math.floor(seg);
  const hi = Math.min(colors.length - 1, lo + 1);
  const f = seg - lo;
  if (lo === hi) return colors[lo];
  return mix(colors[lo], colors[hi], f);
}

// src/core/QualityTuner.ts
var DEFAULT_LEVELS = [
  { dpr: 1.75, strands: 1 },
  { dpr: 1.45, strands: 0.88 },
  { dpr: 1.2, strands: 0.74 },
  { dpr: 1, strands: 0.6 },
  { dpr: 0.85, strands: 0.46 }
];
var DEFAULT_PIXEL_BUDGET = [26e5, 2e6, 15e5, 11e5, 78e4];
function createTunerState(baseStrands) {
  let bs = baseStrands ?? 12e3;
  const coarse = (() => {
    try {
      return window.matchMedia("(pointer: coarse)").matches;
    } catch {
      return false;
    }
  })();
  const cores = navigator.hardwareConcurrency || 4;
  if (bs === 12e3) {
    bs = coarse ? 6e3 : 16500;
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
    baseStrands: bs
  };
}
function probeInitialLevel(state) {
  const w = window.innerWidth || 1, h = window.innerHeight || 1;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = w * h * dpr * dpr;
  let coarse = false;
  try {
    coarse = window.matchMedia("(pointer: coarse)").matches;
  } catch {
  }
  const cores = navigator.hardwareConcurrency || 4;
  if (coarse) state.level = 1;
  if (px > 42e5) state.level = Math.max(state.level, 1);
  if (cores <= 4) state.level = Math.max(state.level, 1);
  if (px > 8e6) state.level = Math.max(state.level, 2);
  if (coarse && cores <= 4) state.level = 2;
  if (state.level > DEFAULT_LEVELS.length - 1) state.level = DEFAULT_LEVELS.length - 1;
}
function effectiveDpr(w, h, rawDpr, level, levels = DEFAULT_LEVELS, budgets = DEFAULT_PIXEL_BUDGET) {
  let d = Math.min(rawDpr || 1, levels[level].dpr);
  const cssPx = Math.max(1, w * h);
  const budget = budgets[level];
  const maxDpr = Math.sqrt(budget / cssPx);
  if (d > maxDpr) d = maxDpr;
  const floor = cssPx > 3e6 ? 0.44 : cssPx > 15e5 ? 0.52 : 0.62;
  if (d < floor) d = floor;
  if (d > 3) d = 3;
  return d;
}
function tunerTick(state, dtMs, drawMs, now) {
  state.ftAcc += dtMs;
  state.ftCount++;
  state.samples++;
  state.drawAcc += drawMs;
  const windowSize = state.samples < 3 ? 20 : 45;
  if (state.ftCount < windowSize) return { action: "none" };
  const avg = state.ftAcc / state.ftCount;
  const drawAvg = state.drawAcc / state.ftCount;
  state.ftAcc = 0;
  state.ftCount = 0;
  state.drawAcc = 0;
  if (drawAvg > 12 && now - state.cooldown > 320) {
    const jump2 = drawAvg > 24 ? 2 : 1;
    const nl = Math.min(DEFAULT_LEVELS.length - 1, state.level + jump2);
    if (nl !== state.level) {
      state.level = nl;
      state.cooldown = now;
      state.lastChange = now;
      state.smoothSince = 0;
      state.slowStreak = 0;
      return { action: "level-down", newLevel: nl };
    } else if (state.density > 0.34) {
      state.density = Math.max(0.34, state.density * 0.76);
      state.cooldown = now;
      state.lastChange = now;
      state.smoothSince = 0;
      state.slowStreak = 0;
      return { action: "density-down" };
    }
  }
  if (avg > 30 && state.level < 2 && now - state.cooldown > 1200) {
    state.level++;
    state.cooldown = now;
    state.lastChange = now;
    return { action: "level-down", newLevel: state.level };
  }
  if (avg > 40) {
    if (!state.badFpsSince) state.badFpsSince = now;
    if (now - state.badFpsSince > 5e3 && state.level < DEFAULT_LEVELS.length - 1 && now - state.cooldown > 2500) {
      state.level++;
      state.cooldown = now;
      state.lastChange = now;
      state.badFpsSince = now;
      return { action: "level-down-fast", newLevel: state.level };
    }
  } else if (avg < 24) {
    state.badFpsSince = 0;
  }
  if (now - state.cooldown > 1400) {
    state.slowStreak = drawAvg > 8 ? state.slowStreak + 1 : 0;
    if (drawAvg > 8 && state.slowStreak >= 2) {
      if (state.level < DEFAULT_LEVELS.length - 1) {
        state.level++;
        state.slowStreak = 0;
        state.cooldown = now;
        state.lastChange = now;
        state.smoothSince = 0;
        return { action: "level-down", newLevel: state.level };
      } else if (state.density > 0.34) {
        state.density = Math.max(0.34, state.density * 0.82);
        state.slowStreak = 0;
        state.cooldown = now;
        state.lastChange = now;
        return { action: "density-down" };
      }
    }
    if (drawAvg < 4.5 && avg < 18 && now - state.lastChange > 9e3) {
      if (state.density < 1) {
        state.density = Math.min(1, state.density / 0.88);
        state.cooldown = now;
        state.lastChange = now;
        return { action: "density-up" };
      } else if (state.level > 0) {
        state.level--;
        state.cooldown = now;
        state.lastChange = now;
        state.smoothSince = 0;
        return { action: "level-up", newLevel: state.level };
      }
    }
  }
  return { action: "none" };
}

// src/utils/Exporters.ts
function downloadDataURL(dataURL, filename = "fur-export.png") {
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1e3);
}
function downloadBlob(blob, filename = "fur-export.gif") {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1e3);
}
var GIFEncoder = class {
  constructor(width, height) {
    this.frames = [];
    this.delays = [];
    this.width = width | 0;
    this.height = height | 0;
  }
  addFrame(canvas, delayMs = 50) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const src = ctx.getImageData(0, 0, this.width, this.height);
    this.frames.push(src);
    this.delays.push(delayMs);
  }
  /** Encode collected frames to Blob — async to allow future wasm swap */
  async encode() {
    if (this.frames.length === 0) throw new Error("GIFEncoder: no frames");
    const gif = this.buildSingleFrameGIF(this.frames[0]);
    return new Blob([gif], { type: "image/gif" });
  }
  buildSingleFrameGIF(frame) {
    const palette = this.buildPalette(frame);
    const indices = this.quantize(frame, palette);
    const lzw = this.lzwEncode(indices, 8);
    const out = [];
    const push = (...b) => {
      for (const v of b) out.push(v & 255);
    };
    const pushStr = (s) => {
      for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    };
    const pushWord = (w) => {
      out.push(w & 255);
      out.push(w >> 8 & 255);
    };
    pushStr("GIF89a");
    pushWord(this.width);
    pushWord(this.height);
    push(247, 0, 0);
    for (let i = 0; i < 256; i++) {
      const c = palette[i] ?? [0, 0, 0];
      push(c[0], c[1], c[2]);
    }
    push(33, 255, 11);
    pushStr("NETSCAPE2.0");
    push(3, 1, 0, 0, 0);
    for (let f = 0; f < this.frames.length; f++) {
      const delay = Math.round((this.delays[f] ?? 50) / 10);
      push(33, 249, 4, 0);
      pushWord(delay);
      push(0, 0);
      push(44, 0, 0, 0, 0);
      pushWord(this.width);
      pushWord(this.height);
      push(0);
      push(8);
      let pos = 0;
      while (pos < lzw.length) {
        const chunk = Math.min(255, lzw.length - pos);
        push(chunk);
        for (let i = 0; i < chunk; i++) push(lzw[pos + i]);
        pos += chunk;
      }
      push(0);
    }
    push(59);
    return new Uint8Array(out);
  }
  buildPalette(frame) {
    const pal = [];
    for (let i = 0; i < 256; i++) {
      if (i < 216) {
        const r = Math.floor(i / 36);
        const g = Math.floor(i % 36 / 6);
        const b = i % 6;
        pal.push([Math.round(r / 5 * 255), Math.round(g / 5 * 255), Math.round(b / 5 * 255)]);
      } else {
        const v = Math.round((i - 216) / 39 * 255);
        pal.push([v, v, v]);
      }
    }
    return pal;
  }
  quantize(frame, palette) {
    const d = frame.data;
    const out = [];
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const ri = Math.min(5, Math.max(0, Math.round(r / 255 * 5)));
      const gi = Math.min(5, Math.max(0, Math.round(g / 255 * 5)));
      const bi = Math.min(5, Math.max(0, Math.round(b / 255 * 5)));
      let idx = ri * 36 + gi * 6 + bi;
      if (idx >= 216) idx = 216 + Math.min(39, Math.round((r * 0.299 + g * 0.587 + b * 0.114) / 255 * 39));
      out.push(idx);
    }
    return out;
  }
  lzwEncode(indices, minCodeSize) {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = eoiCode + 1;
    const table = /* @__PURE__ */ new Map();
    for (let i = 0; i < clearCode; i++) table.set(String.fromCharCode(i), i);
    const outBits = [];
    let bitBuf = 0, bitLen = 0;
    const emit = (code, bits) => {
      bitBuf |= code << bitLen;
      bitLen += bits;
      while (bitLen >= 8) {
        outBits.push(bitBuf & 255);
        bitBuf >>= 8;
        bitLen -= 8;
      }
    };
    emit(clearCode, codeSize);
    let prefix = String.fromCharCode(indices[0]);
    for (let i = 1; i < indices.length; i++) {
      const k = String.fromCharCode(indices[i]);
      const combined = prefix + k;
      if (table.has(combined)) {
        prefix = combined;
      } else {
        emit(table.get(prefix), codeSize);
        if (nextCode < 4096) {
          table.set(combined, nextCode++);
          if (nextCode === 1 << codeSize && codeSize < 12) codeSize++;
        } else {
          emit(clearCode, codeSize);
          table.clear();
          for (let c = 0; c < clearCode; c++) table.set(String.fromCharCode(c), c);
          codeSize = minCodeSize + 1;
          nextCode = eoiCode + 1;
        }
        prefix = k;
      }
    }
    emit(table.get(prefix), codeSize);
    emit(eoiCode, codeSize);
    if (bitLen > 0) outBits.push(bitBuf & 255);
    return outBits;
  }
};

// src/core/Physics.ts
function shockwaveAt(sw, px, py, now) {
  const age = now - sw.t0;
  if (age < 0 || age > sw.duration) return { dx: 0, dy: 0 };
  const prog = age / sw.duration;
  const curR = sw.radius * prog;
  const dx = px - sw.x, dy = py - sw.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-3) return { dx: 0, dy: 0 };
  const waveW = sw.radius * 0.18;
  const distFromFront = curR - d;
  if (distFromFront < -waveW || distFromFront > waveW) return { dx: 0, dy: 0 };
  const sigma = waveW * 0.5;
  const g = Math.exp(-(distFromFront * distFromFront) / (2 * sigma * sigma));
  const timeFade = 1 - prog;
  const strength = g * sw.strength * timeFade * 18;
  const inv = 1 / d;
  return { dx: dx * inv * strength, dy: dy * inv * strength };
}
function breathingScale(tSec, speed = 0.35, amplitude = 0.06) {
  return 1 + Math.sin(tSec * speed * Math.PI * 2) * amplitude;
}
function gravityFromOrientation(gamma, beta) {
  if (gamma == null || beta == null) return { gx: 0, gy: 0 };
  const gx = gamma / 90 * 8;
  const gy = beta / 180 * 8;
  return { gx, gy };
}
function hash2(ix, iy) {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
var ROS = 24;
function rosetteAt(x, y) {
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
  let core = 1 - f1 * f1 / (r * r);
  if (core < 0) core = 0;
  return { ring, core };
}

// src/core/FurEngine.ts
var FurEngine = class {
  constructor(container, opts = {}) {
    this.field = null;
    // Strand SoA
    this.strands = null;
    // Geometry
    this.W = 0;
    this.H = 0;
    this.DPR = 1;
    this.MS = 0.5;
    this.lastW = 0;
    this.lastH = 0;
    this.fontSizeCSS = 120;
    this.baseLen = 12;
    this.furW = 1;
    this.glyphHalfStroke = 4;
    this.legibility = 0;
    this.glowStrength = 0.62;
    // Palette
    this.palette = [];
    this.presetCache = null;
    this.NB = 14;
    // Quality tuner
    this.tuner = createTunerState();
    this.levels = DEFAULT_LEVELS;
    this.pixelBudget = DEFAULT_PIXEL_BUDGET;
    // Motion
    this.raf = 0;
    this.running = true;
    this.lastTime = 0;
    this.tSec = 0;
    this.frameNo = 0;
    // Pointers
    this.rect = { left: 0, top: 0, width: 0, height: 0 };
    this.pts = [];
    this.mousePt = null;
    this.MAX_TOUCH = 4;
    this.shockwaves = [];
    // Gyro
    this.gyroEnabled = true;
    this.gyroX = 0;
    this.gyroY = 0;
    // Breathing
    this.breathePhase = 0;
    // Observers / cleanup
    this.ro = null;
    this.io = null;
    this.syncQueued = false;
    this.cleanupFns = [];
    this.visible = true;
    // Reduce motion
    this.reduceMotion = false;
    const el = typeof container === "string" ? document.querySelector(container) : container;
    if (!el) throw new Error(`furjs: container not found: ${container}`);
    this.container = el;
    this.options = this.normalizeOptions(opts);
    let c = el.querySelector("canvas");
    if (!c) {
      c = document.createElement("canvas");
      c.style.display = "block";
      c.style.width = "100%";
      c.style.height = "100%";
      c.style.touchAction = "pan-y";
      c.style.cursor = opts.interactive === "none" ? "default" : "crosshair";
      el.appendChild(c);
    }
    this.canvas = c;
    const ctx = c.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("furjs: 2D context unavailable");
    this.ctx = ctx;
    this.baseCanvas = document.createElement("canvas");
    this.bctx = this.baseCanvas.getContext("2d");
    this.glowCanvas = document.createElement("canvas");
    this.gctx = this.glowCanvas.getContext("2d");
    this.chamfer = new ChamferMask();
    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      this.reduceMotion = mq.matches;
      const onRM = (e) => {
        this.reduceMotion = e.matches;
      };
      if (mq.addEventListener) mq.addEventListener("change", onRM);
      else mq.addListener(onRM);
    } catch {
    }
    probeInitialLevel(this.tuner);
    this.rebuildPalette();
    this.wirePointer();
    this.wireGyro();
    this.wireResize();
    this.wireVisibility();
    this.wireIntersection();
    this.syncSize(true);
    this.start();
  }
  // ----------------------------------------------------------------
  // Options helpers
  // ----------------------------------------------------------------
  normalizeOptions(opts) {
    return {
      text: opts.text ?? "FUR",
      font: opts.font ?? 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontWeight: opts.fontWeight ?? 900,
      letterSpacing: opts.letterSpacing ?? 0.025,
      fit: opts.fit ?? "normal",
      preset: opts.preset ?? "black-panther",
      colors: opts.colors,
      gradient: opts.gradient,
      texture: opts.texture,
      interactive: opts.interactive ?? "repel",
      stiffness: opts.stiffness ?? 0.2,
      damping: opts.damping ?? 0.862,
      mass: opts.mass ?? 1,
      groomMemory: opts.groomMemory ?? 2e3,
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
      onFrame: opts.onFrame
    };
  }
  update(opts) {
    const prevText = this.options.text;
    const prevFont = this.options.font;
    const prevWeight = this.options.fontWeight;
    const prevPreset = this.options.preset;
    this.options.colors;
    Object.assign(this.options, opts);
    if (opts.interactive !== void 0) {
      this.canvas.style.cursor = opts.interactive === "none" ? "default" : "crosshair";
    }
    const paletteChanged = opts.preset !== void 0 || opts.colors !== void 0 || opts.gradient !== void 0;
    if (paletteChanged) {
      this.rebuildPalette();
      const prevScale = prevPreset ? getPreset(prevPreset).physics.lengthScale : 1;
      const newScale = getPreset(this.options.preset).physics.lengthScale;
      if (Math.abs(prevScale - newScale) > 0.01 || opts.colors) {
        this.syncSize(true);
        return;
      }
      if (this.strands) this.buildStrands(false);
    }
    if (opts.text !== void 0 && opts.text !== prevText) {
      this.options.text = (opts.text ?? "").slice(0, 256);
      this.syncSize(true);
      return;
    }
    if (opts.font !== void 0 && opts.font !== prevFont || opts.fontWeight !== void 0 && opts.fontWeight !== prevWeight || opts.letterSpacing !== void 0 || opts.fit !== void 0) {
      this.syncSize(true);
      return;
    }
  }
  rebuild() {
    this.rebuildPalette();
    this.syncSize(true);
  }
  rebuildPalette() {
    const direct = this.options.colors ?? void 0;
    const preset = getPreset(this.options.preset);
    this.presetCache = preset;
    this.palette = buildPalette({
      nb: this.NB,
      preset: this.options.preset,
      directColors: direct,
      gradient: this.options.gradient ? {
        direction: this.options.gradient.direction ?? "horizontal",
        colors: this.options.gradient.colors
      } : void 0
    });
  }
  // ----------------------------------------------------------------
  // Geometry / Layout
  // ----------------------------------------------------------------
  measureViewport() {
    const r = this.canvas.getBoundingClientRect();
    let w = Math.round(r.width || this.canvas.clientWidth || 0);
    let h = Math.round(r.height || this.canvas.clientHeight || 0);
    if (!(w > 0)) w = Math.round(this.canvas.clientWidth) || 320;
    if (!(h > 0)) h = Math.round(this.canvas.clientHeight) || 320;
    return { w, h, dpr: window.devicePixelRatio || 1 };
  }
  effectiveDpr(w, h, raw) {
    return effectiveDpr(w, h, raw, this.tuner.level, this.levels, this.pixelBudget);
  }
  syncSize(force) {
    const m = this.measureViewport();
    const cap = this.effectiveDpr(m.w, m.h, m.dpr);
    if (!force && m.w === this.lastW && m.h === this.lastH && Math.abs(cap - this.DPR) < 0.02) return false;
    this.lastW = m.w;
    this.lastH = m.h;
    this.layout(m.w, m.h, m.dpr);
    return true;
  }
  layout(w, h, rawDpr) {
    this.W = Math.max(40, w | 0);
    this.H = Math.max(40, h | 0);
    this.DPR = this.effectiveDpr(this.W, this.H, rawDpr);
    this.canvas.width = Math.round(this.W * this.DPR);
    this.canvas.height = Math.round(this.H * this.DPR);
    this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    this.rect = this.canvas.getBoundingClientRect();
    this.buildField();
    this.buildBase();
    try {
      this.buildGlow();
    } catch {
      this.glowCanvas.width = 0;
    }
    this.buildStrands(true);
    this.renderFrame(1);
  }
  buildField() {
    const W = this.W, H = this.H;
    const text = this.options.text ?? "FUR";
    const fontFamily = this.options.font ?? "system-ui, sans-serif";
    const fontWeight = String(this.options.fontWeight ?? 900);
    const letterSpacing = this.options.letterSpacing ?? 0.025;
    const fit = this.options.fit ?? "normal";
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
      this.field = this.chamfer.buildSync(W, H, {
        text,
        fontFamily,
        fontWeight,
        letterSpacing,
        fit
      });
      this.MS = this.field.MS;
      this.fontSizeCSS = this.field.fontSizeCSS;
      this.glyphHalfStroke = this.field.halfStrokeMask;
    }
    if (!this.options.svgPath && !this.options.customMask) {
      const fam = fontFamily.split(",")[0].replace(/["']/g, "").trim();
      if (fam && "fonts" in document) {
        Promise.resolve().then(() => (init_FontLoader(), FontLoader_exports)).then(({ ensureFontLoaded: ensureFontLoaded2 }) => {
          ensureFontLoaded2({ family: fam, weight: fontWeight, timeout: 3e3 }).then((ok) => {
            if (ok) {
              if (this.options.text === text && this.field) {
                const test = document.createElement("canvas").getContext("2d");
                test.font = `900 100px ${fontFamily}`;
                test.measureText(text).width;
                this.chamfer.buildSync(W, H, { text, fontFamily, fontWeight, letterSpacing, fit });
                requestAnimationFrame(() => this.syncSize(true));
              }
            }
          });
        });
      }
    }
    const halfStrokeCss = (this.glyphHalfStroke > 0 ? this.glyphHalfStroke : 4) / this.MS;
    this.baseLen = Math.max(4.4, Math.min(17, halfStrokeCss * 0.58));
    const presetScale = this.presetCache?.physics.lengthScale ?? 1;
    const userScale = this.options.hairLength ?? 1;
    this.baseLen *= presetScale * userScale;
    this.legibility = 1 - Math.min(this.W, this.H) / 900;
    if (this.legibility < 0) this.legibility = 0;
    if (this.legibility > 0.55) this.legibility = 0.55;
    this.baseLen *= 1 - this.legibility * 0.16;
    const wsc = Math.pow(this.fontSizeCSS / 240, 0.55);
    this.furW = wsc < 0.72 ? 0.72 : wsc > 1.2 ? 1.2 : wsc;
    this.furW *= 1 + this.legibility * 0.72;
    this.glowStrength = 0.3 + this.legibility * 0.75;
  }
  buildSvgField(W, H, pathData, fontFamily, fontWeight) {
    const MS = Math.min(0.5, 1100 / W);
    const MW = Math.max(4, Math.round(W * MS));
    const MH = Math.max(4, Math.round(H * MS));
    const c = document.createElement("canvas");
    c.width = MW;
    c.height = MH;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, MW, MH);
    ctx.fillStyle = "#fff";
    const path = new Path2D(pathData);
    ctx.save();
    ctx.translate(MW * 0.5, MH * 0.5);
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
  buildCanvasMaskField(W, H, src) {
    const MS = Math.min(0.5, 1100 / W);
    const MW = Math.max(4, Math.round(W * MS));
    const MH = Math.max(4, Math.round(H * MS));
    const c = document.createElement("canvas");
    c.width = MW;
    c.height = MH;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, MW, MH);
    ctx.drawImage(src, 0, 0, MW, MH);
    const img = ctx.getImageData(0, 0, MW, MH).data;
    const alpha = new Uint8Array(MW * MH);
    for (let i = 0, p = 3; i < alpha.length; i++, p += 4) alpha[i] = img[p];
    const { ndx, ndy, halfStroke } = this.chamferFieldFromAlpha(MW, MH, alpha);
    return { MW, MH, MS, fontSizeCSS: Math.min(MW, MH) * 0.6, trackUsed: 0, alpha, ndx, ndy, halfStrokeMask: halfStroke, maskCanvas: c, maskCtx: ctx };
  }
  chamferFieldFromAlpha(MW, MH, alpha) {
    const n = MW * MH;
    const dist = new Float32Array(n);
    const vx = new Float32Array(n);
    const vy = new Float32Array(n);
    const INF = 1e9;
    for (let i = 0; i < n; i++) {
      if (alpha[i] > 128) {
        dist[i] = INF;
        vx[i] = 0;
        vy[i] = 0;
      } else {
        dist[i] = 0;
        vx[i] = 0;
        vy[i] = 0;
      }
    }
    const D1 = 1, D2 = 1.41421356;
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const i = y * MW + x;
        if (dist[i] === 0) continue;
        let best = dist[i], bx = vx[i], by = vy[i];
        if (x > 0) {
          let j = i - 1;
          let d = dist[j] + D1;
          if (d < best) {
            best = d;
            bx = vx[j] - 1;
            by = vy[j];
          }
          if (y > 0) {
            j = i - MW - 1;
            d = dist[j] + D2;
            if (d < best) {
              best = d;
              bx = vx[j] - 1;
              by = vy[j] - 1;
            }
          }
        }
        if (y > 0) {
          let j2 = i - MW;
          let d2 = dist[j2] + D1;
          if (d2 < best) {
            best = d2;
            bx = vx[j2];
            by = vy[j2] - 1;
          }
          if (x < MW - 1) {
            j2 = i - MW + 1;
            d2 = dist[j2] + D2;
            if (d2 < best) {
              best = d2;
              bx = vx[j2] + 1;
              by = vy[j2] - 1;
            }
          }
        }
        dist[i] = best;
        vx[i] = bx;
        vy[i] = by;
      }
    }
    for (let y = MH - 1; y >= 0; y--) {
      for (let x = MW - 1; x >= 0; x--) {
        const i = y * MW + x;
        if (dist[i] === 0) continue;
        let best = dist[i], bx = vx[i], by = vy[i];
        if (x < MW - 1) {
          let j = i + 1;
          let d = dist[j] + D1;
          if (d < best) {
            best = d;
            bx = vx[j] + 1;
            by = vy[j];
          }
          if (y < MH - 1) {
            j = i + MW + 1;
            d = dist[j] + D2;
            if (d < best) {
              best = d;
              bx = vx[j] + 1;
              by = vy[j] + 1;
            }
          }
        }
        if (y < MH - 1) {
          let j2 = i + MW;
          let d2 = dist[j2] + D1;
          if (d2 < best) {
            best = d2;
            bx = vx[j2];
            by = vy[j2] + 1;
          }
          if (x > 0) {
            j2 = i + MW - 1;
            d2 = dist[j2] + D2;
            if (d2 < best) {
              best = d2;
              bx = vx[j2] - 1;
              by = vy[j2] + 1;
            }
          }
        }
        dist[i] = best;
        vx[i] = bx;
        vy[i] = by;
      }
    }
    let mx = 0;
    for (let i = 0; i < n; i++) if (alpha[i] > 128 && dist[i] > mx && dist[i] < INF * 0.5) mx = dist[i];
    if (mx < 1) mx = 4;
    return { ndx: vx, ndy: vy, halfStroke: mx };
  }
  buildBase() {
    if (!this.field) return;
    const W = this.W, H = this.H;
    const DPR = this.DPR;
    this.baseCanvas.width = this.canvas.width;
    this.baseCanvas.height = this.canvas.height;
    this.bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    this.bctx.clearRect(0, 0, W, H);
    const preset = this.presetCache ?? getPreset("black-panther");
    let asc = this.fontSizeCSS * 0.72, desc = this.fontSizeCSS * 0.02;
    try {
      this.bctx.font = `900 ${this.fontSizeCSS}px ${this.options.font ?? "system-ui"}`;
      const m = this.bctx.measureText(this.options.text ?? "FUR");
      asc = m.actualBoundingBoxAscent || this.fontSizeCSS * 0.72;
      desc = m.actualBoundingBoxDescent || this.fontSizeCSS * 0.02;
    } catch {
    }
    const baselineY = H * 0.5 + (asc - desc) * 0.5;
    const g = this.bctx.createLinearGradient(0, baselineY - asc, 0, baselineY + desc);
    const bg = preset.baseGradient;
    g.addColorStop(0, bg[0]);
    g.addColorStop(0.4, bg[1]);
    g.addColorStop(1, bg[2]);
    this.bctx.fillStyle = g;
    this.bctx.textAlign = "center";
    this.bctx.textBaseline = "alphabetic";
    this.bctx.font = `900 ${this.fontSizeCSS}px ${this.options.font ?? "system-ui"}`;
    this.drawGlyphsTo(this.bctx, this.fontSizeCSS, W * 0.5, baselineY, this.options.text ?? "FUR", this.options.letterSpacing ?? 0.025);
  }
  buildGlow() {
    const W = this.W, H = this.H;
    const preset = this.presetCache ?? getPreset("black-panther");
    const t1w = Math.max(4, Math.round(W * 0.06));
    const t1h = Math.max(4, Math.round(H * 0.06));
    const c1 = document.createElement("canvas");
    c1.width = t1w;
    c1.height = t1h;
    const x1 = c1.getContext("2d");
    x1.setTransform(t1w / W, 0, 0, t1h / H, 0, 0);
    x1.textAlign = "center";
    x1.textBaseline = "alphabetic";
    x1.font = `900 ${this.fontSizeCSS}px ${this.options.font ?? "system-ui"}`;
    x1.fillStyle = "#fff";
    let asc = this.fontSizeCSS * 0.72, desc = this.fontSizeCSS * 0.02;
    try {
      const mm = x1.measureText(this.options.text ?? "FUR");
      asc = mm.actualBoundingBoxAscent || this.fontSizeCSS * 0.72;
      desc = mm.actualBoundingBoxDescent || this.fontSizeCSS * 0.02;
    } catch {
    }
    this.drawGlyphsTo(x1, this.fontSizeCSS, W * 0.5, H * 0.5 + (asc - desc) * 0.5, this.options.text ?? "FUR", this.options.letterSpacing ?? 0.025);
    const t2w = Math.max(8, Math.round(W * 0.16));
    const t2h = Math.max(8, Math.round(H * 0.16));
    const c2 = document.createElement("canvas");
    c2.width = t2w;
    c2.height = t2h;
    const x2 = c2.getContext("2d");
    x2.imageSmoothingEnabled = true;
    x2.imageSmoothingQuality = "high";
    x2.drawImage(c1, 0, 0, t2w, t2h);
    this.glowCanvas.width = Math.max(8, Math.round(W * 0.34));
    this.glowCanvas.height = Math.max(8, Math.round(H * 0.34));
    this.gctx.setTransform(1, 0, 0, 1, 0, 0);
    this.gctx.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
    this.gctx.globalCompositeOperation = "source-over";
    this.gctx.imageSmoothingEnabled = true;
    this.gctx.imageSmoothingQuality = "high";
    const layers = [[1.72, 0.15], [1.24, 0.26], [0.94, 0.55]];
    for (const [k, a] of layers) {
      const w = this.glowCanvas.width * k, h = this.glowCanvas.height * k;
      this.gctx.globalAlpha = a;
      this.gctx.drawImage(c2, (this.glowCanvas.width - w) * 0.5, (this.glowCanvas.height - h) * 0.5, w, h);
    }
    this.gctx.globalAlpha = 1;
    this.gctx.globalCompositeOperation = "source-in";
    this.gctx.fillStyle = preset.glowColor;
    this.gctx.fillRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
    this.gctx.globalCompositeOperation = "destination-in";
    const rg = this.gctx.createRadialGradient(
      this.glowCanvas.width * 0.5,
      this.glowCanvas.height * 0.5,
      0,
      this.glowCanvas.width * 0.5,
      this.glowCanvas.height * 0.5,
      Math.max(this.glowCanvas.width, this.glowCanvas.height) * 0.52
    );
    rg.addColorStop(0, "rgba(255,255,255,1)");
    rg.addColorStop(0.55, "rgba(255,255,255,0.85)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    this.gctx.fillStyle = rg;
    this.gctx.fillRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
    this.gctx.globalCompositeOperation = "source-over";
  }
  drawGlyphsTo(c, fs, cx, baselineY, text, track) {
    const font = this.options.font ?? "system-ui";
    const weight = String(this.options.fontWeight ?? 900);
    const lines = text.split("\n");
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
  drawSingleLineTo(c, fs, fontFamily, fontWeight, cx, baselineY, text, track) {
    c.font = `900 ${fs}px ${fontFamily}`;
    const ws = [];
    let total = 0;
    const sp = fs * track;
    for (let i = 0; i < text.length; i++) {
      const w = c.measureText(text[i]).width;
      ws.push(w);
      total += w;
    }
    total += sp * Math.max(0, text.length - 1);
    let x = cx - total * 0.5;
    const prev = c.textAlign;
    c.textAlign = "left";
    for (let i = 0; i < text.length; i++) {
      c.fillText(text[i], x, baselineY);
      x += ws[i] + sp;
    }
    c.textAlign = prev;
  }
  // ----------------------------------------------------------------
  // Strand generation — samples roots from mask, applies preset physics,
  // color ramp, Worley rosettes, curl field, grooming memory seeds.
  // ----------------------------------------------------------------
  buildStrands(_full) {
    if (!this.field) return;
    const { MW, MH, alpha, ndx, ndy } = this.field;
    let area = 0;
    for (let i = 0; i < alpha.length; i++) if (alpha[i] > 128) area++;
    if (area < 24) {
      this.strands = null;
      return;
    }
    const preset = this.presetCache ?? getPreset("black-panther");
    const targetBase = Math.max(280, Math.round(
      this.tuner.baseStrands * this.levels[this.tuner.level].strands * (1 + this.legibility * 0.85) * this.tuner.density * (preset.physics.densityScale ?? 1) * (this.options.density ?? 1)
    ));
    let step = Math.sqrt(area / targetBase);
    if (step < 1.18 - this.legibility * 0.28) step = 1.18 - this.legibility * 0.28;
    if (step > 26) step = 26;
    const toCss = 1 / this.MS;
    const lx = preset.physics.lightX, ly = preset.physics.lightY;
    const isSnow = preset.name === "snow-leopard";
    const hasRosette = preset.hasRosettes;
    const xs = [], ys = [], uxs = [], uys = [];
    const lns = [], phs = [], amps = [], ris = [], tis = [], cls = [];
    const nxs = [], nys = [], rrs = [], rcs = [], gls = [];
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
        if (mag < 1e-4) continue;
        dx /= mag;
        dy /= mag;
        const nX = dx, nY = dy;
        let bend = Math.sin(jx * 0.055 + jy * 0.031) * 0.4 + Math.sin(jx * 0.145 - jy * 0.115 + 1.7) * 0.22 + (Math.random() - 0.5) * 0.36 * (1 - this.legibility * 0.5);
        if (isSnow) bend *= 1.15;
        const ang = Math.atan2(dy, dx) + bend;
        const c = Math.cos(ang), s = Math.sin(ang);
        const hv = Math.sin(jx * 0.17) * Math.sin(jy * 0.21) * 0.5 + Math.sin(jx * 0.061 + jy * 0.09) * 0.5;
        const guard = Math.random();
        let lenMul = guard > 0.93 ? 0.86 + Math.random() * 0.16 + hv * 0.08 : 0.52 + Math.random() * 0.4 + hv * 0.12;
        if (lenMul < 0.2) lenMul = 0.2;
        const len = this.baseLen * lenMul;
        const lightDot = nX * lx + nY * ly;
        const lit = lightDot > 0 ? lightDot : 0;
        const fillDot = -(nX * lx + nY * ly);
        const fill = fillDot > 0 ? fillDot * 0.3 : 0;
        const glossField = 0.45 + 0.34 * Math.sin(jx * 0.042 + jy * 0.026) + 0.21 * Math.sin(jx * 0.115 - jy * 0.083 + 2.1);
        const clampedGlossField = glossField < 0.06 ? 0.06 : glossField;
        const tuft = 0.35 + 0.65 * clampedGlossField;
        const glossChance = Math.pow(lit, 1.5) * clampedGlossField * preset.physics.glossIntensity * tuft;
        let glossy = Math.random() < glossChance;
        if (isSnow) glossy = Math.random() < 0.08;
        const rr = rosetteAt(jx, jy);
        let rosetteRing = rr.ring, rosetteCore = rr.core;
        if (!hasRosette) {
          rosetteRing = 0;
          rosetteCore = 0;
        } else {
          rosetteRing *= preset.physics.rosetteStrength;
          rosetteCore *= preset.physics.rosetteStrength;
        }
        let bodyT = 1 + Math.random() * 2 + Math.pow(lit, 1.55) * 3.3 * (0.45 + 0.55 * tuft) + fill * 1.7;
        bodyT *= 1 - rosetteRing * 0.5 + rosetteCore * 0.16;
        if (bodyT < 0) bodyT = 0;
        if (bodyT > 8.5) bodyT = 8.5;
        let ri = bodyT | 0;
        let ti;
        if (glossy) {
          ti = 11 + (Math.random() * 3 | 0);
          if (rosetteRing > 0.35 && Math.random() < 0.72) glossy = false;
          ti = glossy ? ti : ri + 2;
        } else {
          ti = ri + 2 + (Math.random() * 3 | 0);
          if (ti > 10) ti = 10;
        }
        if (ri > 10) ri = 10;
        if (ti > this.NB - 1) ti = this.NB - 1;
        if (ri > this.NB - 1) ri = this.NB - 1;
        let cw = Math.sin(jx * 0.085 + jy * 0.062) * 0.5 + Math.sin(jx * 0.21 - jy * 0.17 + 0.9) * 0.22 + (Math.random() - 0.5) * 0.5;
        if (cw > 0.85) cw = 0.85;
        if (cw < -0.85) cw = -0.85;
        xs.push(jx * toCss);
        ys.push(jy * toCss);
        uxs.push(c);
        uys.push(s);
        lns.push(len);
        phs.push(Math.random() * Math.PI * 2);
        amps.push(0.55 + Math.random() * 0.95);
        ris.push(ri);
        tis.push(ti);
        cls.push(cw);
        nxs.push(nX);
        nys.push(nY);
        rrs.push(rosetteRing);
        rcs.push(rosetteCore);
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
      PX[i] = xs[i];
      PY[i] = ys[i];
      UX[i] = uxs[i];
      UY[i] = uys[i];
      LEN[i] = lns[i];
      PH[i] = phs[i];
      AMP[i] = amps[i];
      RI[i] = ris[i];
      TI[i] = tis[i];
      CURL[i] = cls[i];
      NX[i] = nxs[i];
      NY[i] = nys[i];
      RR[i] = rrs[i];
      RC[i] = rcs[i];
      GL[i] = gls[i];
    }
    this.strands = { PX, PY, UX, UY, LEN, PH, AMP, RI, TI, CURL, NX, NY, BX, BY, VX, VY, GX, GY, GT, RR, RC, GL, N };
  }
  // ----------------------------------------------------------------
  // Render loop
  // ----------------------------------------------------------------
  start() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.lastTime = 0;
    this.raf = requestAnimationFrame(this.frame.bind(this));
    this.running = true;
  }
  pause() {
    this.running = false;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }
  resume() {
    if (this.running) return;
    this.running = true;
    this.lastTime = 0;
    this.start();
  }
  frame(now) {
    this.raf = requestAnimationFrame(this.frame.bind(this));
    this.frameNo++;
    if ((this.frameNo & 7) === 0) {
      if (this.syncSize(false)) {
        this.lastTime = 0;
        return;
      }
    }
    if (!this.visible && this.io) {
      return;
    }
    if (!this.lastTime) this.lastTime = now;
    let dtMs = now - this.lastTime;
    this.lastTime = now;
    if (dtMs <= 0) dtMs = 16.7;
    let dt = dtMs / 16.667;
    if (dt > 3) dt = 3;
    if (dt < 0.35) dt = 0.35;
    this.tSec += dtMs * 1e-3;
    const drawStartForTuner = performance.now();
    const kP = 1 - Math.pow(1 - 0.3, dt);
    const kA = 1 - Math.pow(1 - 0.1, dt);
    const vDamp = Math.pow(0.86, dt);
    const AXP = new Float32Array(8), AYP = new Float32Array(8), AVX = new Float32Array(8), AVY = new Float32Array(8), AA = new Float32Array(8);
    let AP = 0;
    for (let pi = 0; pi < this.pts.length; pi++) {
      const pp = this.pts[pi];
      if (!pp.seen) continue;
      pp.x += (pp.tx - pp.x) * kP;
      pp.y += (pp.ty - pp.y) * kP;
      pp.vx *= vDamp;
      pp.vy *= vDamp;
      pp.act += (pp.want - pp.act) * kA;
      if (pp.act < 1e-3) pp.act = 0;
      if (pp.act > 0.01 && AP < 8) {
        AXP[AP] = pp.x;
        AYP[AP] = pp.y;
        AVX[AP] = pp.vx;
        AVY[AP] = pp.vy;
        AA[AP] = pp.act;
        AP++;
      }
      if (pp.touch && pp.act === 0) {
        this.pts.splice(pi, 1);
        pi--;
      }
    }
    this._AP = AP;
    this._AXP = AXP;
    this._AYP = AYP;
    this._AVX = AVX;
    this._AVY = AVY;
    this._AA = AA;
    const nowMs = now;
    this.shockwaves = this.shockwaves.filter((s) => nowMs - s.t0 < s.duration);
    const t0 = performance.now();
    this.renderFrame(dt, AP, AXP, AYP, AVX, AVY, AA);
    const drawMs = performance.now() - t0;
    const wallMs = performance.now() - drawStartForTuner;
    const tick = tunerTick(this.tuner, wallMs, drawMs, now);
    if (tick.action !== "none") {
      if (tick.action === "density-down" || tick.action === "density-up") {
        this.buildStrands(true);
      } else if (tick.action.startsWith("level")) {
        this.syncSize(true);
        this.lastTime = 0;
        return;
      }
    }
    if (this.options.breathing) {
      this.breathePhase += dtMs * 1e-3 * (0.35 * 2 * Math.PI);
    }
    if (this.options.onFrame && this.frameNo % 30 === 0) {
      const fps = 1e3 / (wallMs || 16);
      this.options.onFrame({ fps: Math.round(fps), strandCount: this.strands?.N ?? 0, dpr: this.DPR, level: this.tuner.level });
    }
  }
  renderFrame(dt, AP, AXP, AYP, AVX, AVY, AA) {
    if (AP === void 0) {
      AP = this._AP ?? 0;
      AXP = this._AXP;
      AYP = this._AYP;
      AVX = this._AVX;
      AVY = this._AVY;
      AA = this._AA;
    }
    if (!AXP || !AYP || !AVX || !AVY || !AA) {
      AP = 0;
      AXP = new Float32Array(4);
      AYP = new Float32Array(4);
      AVX = new Float32Array(4);
      AVY = new Float32Array(4);
      AA = new Float32Array(4);
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
    const paths = new Array(this.NB);
    for (let b = 0; b < this.NB; b++) paths[b] = new Path2D();
    const interactive = this.options.interactive ?? "repel";
    const radius = Math.max(84, Math.min(W, H) * 0.22);
    const r2 = radius * radius;
    const invR = 1 / radius;
    const windCfg = this.options.wind ?? { speed: 0.6, direction: 45, gustiness: 0.45 };
    const groomMem = this.options.groomMemory ?? 2e3;
    const kkStiff = this.options.stiffness ?? 0.2;
    const kkDamp = this.options.damping ?? 0.862;
    const kk = 1 - Math.pow(1 - kkStiff, dt);
    const damp = Math.pow(this.reduceMotion ? 0.74 : kkDamp, dt);
    const tSec = this.tSec;
    const reduceMotion = this.reduceMotion;
    const breatheEnabled = !!this.options.breathing;
    let breatheScale = 1;
    if (breatheEnabled) {
      breatheScale = breathingScale(tSec, 0.35, 0.035);
    }
    for (let i = 0; i < N; i++) {
      const x = s.PX[i], y = s.PY[i];
      const ph = s.PH[i], amp = s.AMP[i], len0 = s.LEN[i];
      const len = breatheEnabled ? len0 * breatheScale : len0;
      let tx = 0, ty = 0;
      {
        const speed = windCfg.speed ?? 0.6;
        const gust = windCfg.gustiness ?? 0.45;
        const dirRad = (windCfg.direction ?? 45) * Math.PI / 180;
        const cosD = Math.cos(dirRad), sinD = Math.sin(dirRad);
        const w = reduceMotion ? 0.15 : speed;
        tx = Math.sin(tSec * 1.6 + ph) * 1.15 * amp * w + cosD * w * 0.8 + gust * Math.sin(tSec * 0.7 + ph * 0.5) * w * 0.6 * cosD;
        ty = Math.cos(tSec * 1.25 + ph * 1.7) * 1.15 * amp * w + sinD * w * 0.8 + gust * Math.sin(tSec * 0.7 + ph * 0.5) * w * 0.6 * sinD;
      }
      if (this.gyroEnabled && (this.gyroX !== 0 || this.gyroY !== 0)) {
        tx += this.gyroX * 0.6;
        ty += this.gyroY * 0.6;
      }
      for (const sw of this.shockwaves) {
        const r = shockwaveAt(sw, x, y, performance.now());
        tx += r.dx;
        ty += r.dy;
      }
      if (AP > 0 && interactive !== "none") {
        for (let q = 0; q < AP; q++) {
          const ddx = x - AXP[q], ddy = y - AYP[q];
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 >= r2) continue;
          const d = Math.sqrt(d2) + 1e-3;
          const inv = 1 / d;
          let f = 1 - d * invR;
          f = f * f * AA[q];
          const dir = interactive === "attract" ? -1 : 1;
          const push = f * len * 1.42 * dir;
          tx += ddx * inv * push;
          ty += ddy * inv * push;
          const spd = (Math.abs(AVX[q]) + Math.abs(AVY[q])) * 0.022;
          if (spd > 0.01) {
            let clamped = spd;
            if (clamped > 1) clamped = 1;
            const cross = ddx * AVY[q] - ddy * AVX[q];
            const sgn = cross >= 0 ? 1 : -1;
            const sw = push * 0.62 * clamped * sgn;
            tx -= ddy * inv * sw;
            ty += ddx * inv * sw;
          }
        }
      }
      if (groomMem > 0 && s.GT[i] > 0) {
        const age = performance.now() - s.GT[i];
        if (age < groomMem) {
          const fade = 1 - age / groomMem;
          const eased = fade * fade * (3 - 2 * fade);
          tx += s.GX[i] * eased;
          ty += s.GY[i] * eased;
        } else {
          s.GX[i] = 0;
          s.GY[i] = 0;
          s.GT[i] = 0;
        }
      }
      let vx = s.VX[i] + (tx - s.BX[i]) * kk;
      let vy = s.VY[i] + (ty - s.BY[i]) * kk;
      vx *= damp;
      vy *= damp;
      let bxv = s.BX[i] + vx;
      let byv = s.BY[i] + vy;
      const maxB = len * 1.15;
      const bl = Math.sqrt(bxv * bxv + byv * byv);
      if (bl > maxB) {
        const sc = maxB / bl;
        bxv *= sc;
        byv *= sc;
        vx *= 0.55;
        vy *= 0.55;
      }
      s.VX[i] = vx;
      s.VY[i] = vy;
      s.BX[i] = bxv;
      s.BY[i] = byv;
      const ux = s.UX[i], uy = s.UY[i];
      const ex = x + ux * len + bxv;
      const ey = y + uy * len + byv;
      const hx = (x + ex) * 0.5, hy = (y + ey) * 0.5;
      const cnx = -(ey - y), cny = ex - x;
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
    this.ctx.lineCap = "round";
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
  wirePointer() {
    const el = this.canvas;
    const makePt = (clientX, clientY, strength, isTouch, id) => {
      const nx = clientX - this.rect.left, ny = clientY - this.rect.top;
      return { id, touch: !!isTouch, x: nx, y: ny, tx: nx, ty: ny, vx: 0, vy: 0, act: 0, want: strength, seen: false };
    };
    const findPt = (id) => {
      for (let i = 0; i < this.pts.length; i++) if (this.pts[i].id === id) return this.pts[i];
      return null;
    };
    const movePt = (p, clientX, clientY, strength) => {
      const nx = clientX - this.rect.left, ny = clientY - this.rect.top;
      if (!p.seen) {
        p.x = nx;
        p.y = ny;
        p.seen = true;
      }
      let dvx = nx - p.tx, dvy = ny - p.ty;
      if (Math.abs(dvx) > 90) dvx = 90 * Math.sign(dvx);
      if (Math.abs(dvy) > 90) dvy = 90 * Math.sign(dvy);
      p.vx = dvx;
      p.vy = dvy;
      p.tx = nx;
      p.ty = ny;
      p.want = strength;
    };
    const onMove = (e) => {
      this.rect = this.canvas.getBoundingClientRect();
      if (e.pointerType === "mouse" || e.pointerType === "pen") {
        if (!this.mousePt) {
          this.mousePt = makePt(e.clientX, e.clientY, 1, false, "mouse");
          this.pts.push(this.mousePt);
        }
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
    const onDown = (e) => {
      this.rect = this.canvas.getBoundingClientRect();
      const strength = e.pointerType === "mouse" ? 1.4 : 1.3;
      let p = findPt(e.pointerId);
      if (!p) {
        if (e.pointerType === "mouse") {
          if (!this.mousePt) {
            this.mousePt = makePt(e.clientX, e.clientY, strength, false, "mouse");
            this.pts.push(this.mousePt);
          }
          p = this.mousePt;
        } else {
          if (!this.options.touch) return;
          if (this.pts.length > this.MAX_TOUCH) return;
          p = makePt(e.clientX, e.clientY, strength, true, e.pointerId);
          this.pts.push(p);
        }
      }
      movePt(p, e.clientX, e.clientY, strength);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
      }
      if (this.options.shockwave !== false) {
        const cx = e.clientX - this.rect.left, cy = e.clientY - this.rect.top;
        this.shockwaves.push({
          x: cx,
          y: cy,
          t0: performance.now(),
          duration: 900,
          radius: Math.max(this.W, this.H) * 0.6,
          strength: 1.2
        });
      }
    };
    const endPtr = (e) => {
      const p = findPt(e.pointerId);
      if (!p) return;
      if (p.touch) p.want = 0;
      else p.want = 1;
      if (this.strands && (this.options.groomMemory ?? 2e3) > 0 && this.options.interactive !== "none") {
        const now = performance.now();
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
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
      }
    };
    const onLeave = (e) => {
      if (this.mousePt && e.pointerType === "mouse") this.mousePt.want = 0;
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerdown", onDown, { passive: true });
    el.addEventListener("pointerup", endPtr, { passive: true });
    el.addEventListener("pointercancel", endPtr, { passive: true });
    el.addEventListener("pointerleave", onLeave, { passive: true });
    window.addEventListener("blur", () => {
      for (const p of this.pts) p.want = 0;
    });
    this.cleanupFns.push(() => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", endPtr);
      el.removeEventListener("pointercancel", endPtr);
      el.removeEventListener("pointerleave", onLeave);
    });
  }
  wireGyro() {
    if (!this.gyroEnabled || this.options.gyroscope === false) return;
    const handler = (e) => {
      const g = gravityFromOrientation(e.gamma ?? null, e.beta ?? null);
      this.gyroX = g.gx;
      this.gyroY = g.gy;
    };
    const Btn = window.DeviceOrientationEvent;
    if (Btn && typeof Btn.requestPermission === "function") {
      this._requestGyro = async () => {
        try {
          const r = await Btn.requestPermission();
          if (r === "granted") window.addEventListener("deviceorientation", handler, { passive: true });
        } catch {
        }
      };
      this.canvas.addEventListener("click", () => {
        const fn = this._requestGyro;
        if (fn) fn();
      }, { once: true });
    } else {
      window.addEventListener("deviceorientation", handler, { passive: true });
      this.cleanupFns.push(() => window.removeEventListener("deviceorientation", handler));
    }
  }
  wireResize() {
    const queueSync = () => {
      if (this.syncQueued) return;
      this.syncQueued = true;
      requestAnimationFrame(() => {
        this.syncQueued = false;
        if (this.syncSize(false)) this.lastTime = 0;
        this.rect = this.canvas.getBoundingClientRect();
      });
    };
    window.addEventListener("resize", queueSync, { passive: true });
    window.addEventListener("orientationchange", queueSync, { passive: true });
    window.addEventListener("pageshow", queueSync, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", queueSync, { passive: true });
      window.visualViewport.addEventListener("scroll", queueSync, { passive: true });
    }
    if (window.ResizeObserver) {
      try {
        this.ro = new window.ResizeObserver(queueSync);
        this.ro.observe(this.canvas);
        this.ro.observe(this.container);
      } catch {
        this.ro = null;
      }
    }
    this.cleanupFns.push(() => {
      window.removeEventListener("resize", queueSync);
      window.removeEventListener("orientationchange", queueSync);
      window.removeEventListener("pageshow", queueSync);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", queueSync);
        window.visualViewport.removeEventListener("scroll", queueSync);
      }
      if (this.ro) this.ro.disconnect();
    });
  }
  wireVisibility() {
    const onVis = () => {
      if (document.hidden) {
        this.running = false;
        if (this.raf) {
          cancelAnimationFrame(this.raf);
          this.raf = 0;
        }
      } else if (!this.running && this.visible) {
        this.running = true;
        this.lastTime = 0;
        this.start();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    this.cleanupFns.push(() => document.removeEventListener("visibilitychange", onVis));
  }
  wireIntersection() {
    if (!("IntersectionObserver" in window)) return;
    this.io = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      if (entry.isIntersecting) {
        if (!this.visible) {
          this.visible = true;
          if (!this.running && !document.hidden) {
            this.running = true;
            this.lastTime = 0;
            this.start();
          }
        }
      } else {
        if (this.visible) {
          this.visible = false;
          if (this.running) {
            this.running = false;
            if (this.raf) {
              cancelAnimationFrame(this.raf);
              this.raf = 0;
            }
          }
        }
      }
    }, { threshold: 0, rootMargin: "200px" });
    this.io.observe(this.canvas);
    this.cleanupFns.push(() => {
      if (this.io) this.io.disconnect();
    });
  }
  // ----------------------------------------------------------------
  // Exports
  // ----------------------------------------------------------------
  async exportPNG(opts = {}) {
    const scale = opts.scale ?? 2;
    const transparent = opts.transparent ?? false;
    const w = this.canvas.width, h = this.canvas.height;
    const off = document.createElement("canvas");
    off.width = Math.round(w * scale);
    off.height = Math.round(h * scale);
    const ctx = off.getContext("2d");
    if (!transparent) {
      ctx.fillStyle = this.options.background ?? "#07080d";
      ctx.fillRect(0, 0, off.width, off.height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.canvas, 0, 0, off.width, off.height);
    return off.toDataURL("image/png");
  }
  async exportGIF(opts = {}) {
    const duration = opts.duration ?? 2500;
    const fps = opts.fps ?? 20;
    const delay = 1e3 / fps;
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
        setTimeout(tick, delay);
      };
      tick();
    });
  }
  async downloadPNG(opts = {}) {
    const url = await this.exportPNG({ scale: opts.scale ?? 2, transparent: false });
    downloadDataURL(url, opts.filename ?? `fur-${(this.options.text ?? "export").replace(/\s+/g, "-").toLowerCase()}.png`);
  }
  async downloadGIF(opts = {}) {
    const blob = await this.exportGIF({ duration: opts.duration, fps: opts.fps });
    downloadBlob(blob, opts.filename ?? `fur-${(this.options.text ?? "export").replace(/\s+/g, "-").toLowerCase()}.gif`);
  }
  // ----------------------------------------------------------------
  // Destroy
  // ----------------------------------------------------------------
  destroy() {
    this.running = false;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    for (const fn of this.cleanupFns) try {
      fn();
    } catch {
    }
    this.cleanupFns = [];
    this.pts = [];
    this.shockwaves = [];
    if (this.chamfer) this.chamfer.destroy();
  }
};
function createFur(container, options = {}) {
  return new FurEngine(container, options);
}
var Fur = react.forwardRef(function Fur2(props, forwardedRef) {
  const {
    className,
    style,
    aspectRatio = "5.2 / 1",
    height,
    ariaLabel,
    role = "img",
    // Extract FurOptions — remainder are fur props
    ...furOptions
  } = props;
  const rootRef = react.useRef(null);
  const instanceRef = react.useRef(null);
  react.useImperativeHandle(forwardedRef, () => instanceRef.current, []);
  react.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    let inst = null;
    const mount = () => {
      if (cancelled) return;
      if (inst || instanceRef.current) return;
      try {
        inst = createFur(root, furOptions);
        instanceRef.current = inst;
      } catch (e) {
        console.error("[furjs] mount failed:", e);
      }
    };
    if (typeof window !== "undefined" && "IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((en) => en.isIntersecting)) {
            io.disconnect();
            requestAnimationFrame(() => mount());
          }
        },
        { rootMargin: "400px 0px" }
      );
      io.observe(root);
      const timer = setTimeout(() => {
        io.disconnect();
        mount();
      }, 2e3);
      return () => {
        cancelled = true;
        clearTimeout(timer);
        io.disconnect();
        if (inst) inst.destroy();
        if (instanceRef.current) instanceRef.current.destroy();
        instanceRef.current = null;
      };
    } else {
      const raf = requestAnimationFrame(() => mount());
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
        if (inst) inst.destroy();
        if (instanceRef.current) instanceRef.current.destroy();
        instanceRef.current = null;
      };
    }
  }, []);
  react.useEffect(() => {
    if (instanceRef.current) {
      instanceRef.current.update(furOptions);
    }
  }, [furOptions.text, furOptions.font, furOptions.fontWeight, furOptions.letterSpacing, furOptions.preset, furOptions.colors, furOptions.gradient, furOptions.texture, furOptions.interactive, furOptions.stiffness, furOptions.damping, furOptions.wind, furOptions.breathing, furOptions.hairLength, furOptions.density, furOptions.fit, furOptions.svgPath, furOptions.customMask, furOptions.background]);
  const text = furOptions.text ?? "FUR";
  const containerStyle = {
    display: "block",
    width: "100%",
    height: height !== void 0 ? typeof height === "number" ? `${height}px` : height : void 0,
    aspectRatio: height !== void 0 ? void 0 : aspectRatio,
    overflow: "hidden",
    position: "relative",
    ...style
  };
  return /* @__PURE__ */ jsxRuntime.jsxs(
    "div",
    {
      ref: rootRef,
      className: className ? `fur-container ${className}` : "fur-container",
      style: containerStyle,
      "data-fur": text,
      "data-preset": furOptions.preset ?? "black-panther",
      children: [
        /* @__PURE__ */ jsxRuntime.jsx(
          "span",
          {
            style: {
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
              whiteSpace: "nowrap",
              border: 0
            },
            "aria-hidden": true,
            children: text
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx(
          "canvas",
          {
            className: "fur-canvas",
            role,
            "aria-label": ariaLabel ?? text,
            style: {
              display: "block",
              width: "100%",
              height: "100%"
            }
          }
        ),
        /* @__PURE__ */ jsxRuntime.jsx("style", { children: `
        .fur-container canvas { display:block; width:100%; height:100%; touch-action: pan-y; cursor: crosshair; }
        .fur-container[data-preset] canvas { aspect-ratio: ${aspectRatio}; }
      ` })
      ]
    }
  );
});
Fur.displayName = "Fur";
var Fur_default = Fur;

exports.Fur = Fur;
exports.default = Fur_default;
//# sourceMappingURL=Fur.cjs.map
//# sourceMappingURL=Fur.cjs.map