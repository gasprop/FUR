export { F as FurEngine, a as FurInstance, b as FurOptions, c as FurProps, d as FurRef, I as InfluencePoint, e as InteractiveMode, P as PhysicsOptions, S as Shockwave, f as StrandState, W as WindConfig, g as createFur } from './Fur-Cd4R7x6F.js';
import 'react';

/**
 * Presets — Haute Couture Material Library for furjs
 *
 * Each preset encodes the 4-zone optical model:
 *   root / undercoat  — dense, light-absorbing base
 *   shaft / body      — main pigment transition
 *   tip / guard hair  — translucent specular
 *   rim / catch       — normal-mapped edge lighting
 *
 * Also includes physical properties tuned for each pelt's
 * characteristic hair length, density, gloss field, and rosette pattern.
 *
 * Aesthetic directive: NO neon, NO cyberpunk. Only organic luxury pelts.
 */
type PresetName = 'black-panther' | 'royal-sable' | 'snow-leopard' | 'cashmere-cream' | 'desert-caracal' | 'silver-fox' | 'imperial-velvet';
/** 4-zone color definition */
interface FurColors {
    /** Root / undercoat — darkest, densest base */
    root: string;
    /** Shaft / body — main pigment */
    shaft: string;
    /** Tip / guard hair — translucent outer */
    tip: string;
    /** Rim catch — specular edge light (silver-blue, champagne, etc.) */
    rim: string;
}
/** Per-preset physical tuning */
interface PresetPhysics {
    /** Base strand length multiplier (relative) */
    lengthScale: number;
    /** Density multiplier */
    densityScale: number;
    /** How much specular gloss field contributes (0-1) */
    glossIntensity: number;
    /** Worley rosette visibility (0-1) */
    rosetteStrength: number;
    /** Coat roughness — higher = more matte */
    roughness: number;
    /** Light direction x (for rim calculation) */
    lightX: number;
    /** Light direction y */
    lightY: number;
}
interface FurPreset {
    name: PresetName;
    /** Human readable label */
    label: string;
    /** Short description for UI */
    description: string;
    colors: FurColors;
    /** The full gradient ramp rendered (NB steps) will interpolate between these anchors */
    paletteAnchors: {
        dark: [number, number, number];
        mid: [number, number, number];
        mid2?: [number, number, number];
        light: [number, number, number];
    };
    physics: PresetPhysics;
    /** Halo color for backlight wall */
    glowColor: string;
    /** Whether the coat has visible rosette spots */
    hasRosettes: boolean;
    /** Base fill gradient stops for letterform body (behind fur) */
    baseGradient: [string, string, string];
}
/**
 * All built-in haute couture presets.
 * Colors hand-tuned by measuring rendered luminance, not by eye —
 * each preset hits ~3× backdrop luminance on mobile and ~17× on desktop
 * so the typography remains legible across screen sizes.
 */
declare const PRESETS: Record<PresetName, FurPreset>;
/** All preset names as array */
declare const PRESET_NAMES: PresetName[];
/** Imperial Velvet has 3 jewel-tone variants — expand in UI */
declare const IMPERIAL_VELVET_VARIANTS: {
    readonly sapphire: {
        readonly root: "#0a0e1a";
        readonly shaft: "#1a3a5c";
        readonly tip: "#6bb6ff";
        readonly rim: "#d4e6ff";
        readonly glowColor: "#4a90e2";
        readonly baseGradient: [string, string, string];
    };
    readonly emerald: {
        readonly root: "#07120e";
        readonly shaft: "#1a4a2e";
        readonly tip: "#6bffb6";
        readonly rim: "#d4ffe6";
        readonly glowColor: "#4ae2a0";
        readonly baseGradient: [string, string, string];
    };
    readonly burgundy: {
        readonly root: "#1a0a10";
        readonly shaft: "#5c1a2e";
        readonly tip: "#ff6b9a";
        readonly rim: "#ffd4e2";
        readonly glowColor: "#e24a6b";
        readonly baseGradient: [string, string, string];
    };
};
/** Get preset by name, falling back to black-panther */
declare function getPreset(name?: string): FurPreset;
/** Check if preset name is valid */
declare function isValidPreset(name: string): name is PresetName;

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

/** Explicit 4-zone colors (hex or any CSS color) */
interface DirectColors {
    root: string;
    shaft: string;
    tip: string;
    rim: string;
}
/** Gradient mapping across glyph bounding box */
interface GradientConfig {
    /** Direction of gradient */
    direction: 'horizontal' | 'vertical' | 'diagonal';
    /** Colors to interpolate between (≥2) */
    colors: string[];
}
/** Texture sampling from an image or canvas */
interface TextureConfig {
    /** Image URL or HTMLImageElement or HTMLCanvasElement */
    source: string | HTMLImageElement | HTMLCanvasElement;
    /** How strand positions map to texture UVs */
    mapping?: 'stretch' | 'tile';
    /** Optional scale for tiling (default 1) */
    scale?: number;
}
/** Resolved ramp entry */
interface RampEntry {
    color: string;
    width: number;
    /** Original RGB for potential shader use */
    rgb: [number, number, number];
}
/**
 * Parse any CSS color string to [r, g, b] 0-255.
 * Supports #rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl(), named colors.
 * Falls back to dark grey if unparseable.
 */
declare function parseColor(input: string): [number, number, number];
interface PaletteBuildOptions {
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
declare function buildPalette(options?: PaletteBuildOptions): RampEntry[];
/**
 * Create an offscreen texture sampler from an image source.
 * Returns a Promise that resolves when the image is loaded and sampled.
 */
declare function createTextureSampler(source: string | HTMLImageElement | HTMLCanvasElement): Promise<TextureSampler | null>;
/**
 * Sample a strand color from a texture sampler given strand UV [0,1].
 * Applies mapping logic (stretch vs tile).
 */
declare function sampleTexture(sampler: TextureSampler, u: number, v: number, mapping?: 'stretch' | 'tile', scale?: number): [number, number, number];
/** Extract standalone palette for export / UI display */
declare function getPaletteColors(entries: RampEntry[]): string[];
/** Parse preset color to FurColors for external use */
declare function getPresetColors(presetName?: string): FurColors;

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
/** Options for glyph mask */
interface ChamferMaskOptions {
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
interface ChamferField {
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
declare class ChamferMask {
    private canvas;
    private ctx;
    constructor();
    /**
     * Build the complete chamfer field for given text/layout.
     * Ensures custom font is loaded before measuring.
     */
    build(W: number, H: number, opts: ChamferMaskOptions): Promise<ChamferField>;
    /** Synchronous fallback without font loading wait (for immediate first paint) */
    buildSync(W: number, H: number, opts: ChamferMaskOptions): ChamferField;
    private measureGlyphs;
    private drawGlyphs;
    private fitFontSize;
    private buildChamfer;
    /** Destroy canvas refs */
    destroy(): void;
}

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
interface QualityLevel {
    /** Cap on DPR (multiplier of native DPR) */
    dpr: number;
    /** Strand count factor (0..1) */
    strands: number;
}
/** Default quality ladder — identical to panther.js */
declare const DEFAULT_LEVELS: QualityLevel[];
/** Hard ceiling on backing-store pixels per level */
declare const DEFAULT_PIXEL_BUDGET: number[];
interface TunerState {
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
declare function createTunerState(baseStrands?: number): TunerState;
/** Effective DPR given level + pixel budget */
declare function effectiveDpr(w: number, h: number, rawDpr: number, level: number, levels?: QualityLevel[], budgets?: number[]): number;
/**
 * Feed frame timing into the tuner.
 * Returns an action: 'none' | 'rebuild' (needs full layout rebuild) | 'resample' (strand rebuild only)
 * or 'level-up' / 'density-up' for climbing back.
 */
declare function tunerTick(state: TunerState, dtMs: number, drawMs: number, now: number): {
    action: 'none' | 'level-down' | 'level-down-fast' | 'density-down' | 'level-up' | 'density-up' | 'resample';
    newLevel?: number;
};

/**
 * FontLoader — Robust web-font detection for furjs
 *
 * Uses document.fonts.load() when available, with timeout, retry,
 * and graceful fallback for browsers without Font Loading API.
 * Ensures chamfer distance mask is not rasterized before the
 * requested font is actually ready, preventing FOUT jank.
 */
/** Loaded font descriptor */
interface FontLoadOptions {
    /** Font family name, e.g. "Playfair Display" */
    family: string;
    /** Weight 100-900 */
    weight?: number | string;
    /** Style normal | italic */
    style?: string;
    /** Timeout in ms before giving up (default 3000) */
    timeout?: number;
}
/**
 * Wait until the browser has loaded the requested font face.
 * Resolves immediately if Font Loading API is unavailable
 * or if family is a generic system stack.
 */
declare function ensureFontLoaded(opts: FontLoadOptions): Promise<boolean>;
/**
 * Load multiple families in parallel.
 */
declare function ensureFontsLoaded(families: FontLoadOptions[]): Promise<boolean[]>;
/**
 * Hook-friendly helper: returns true if document.fonts is supported.
 */
declare function supportsFontLoadingAPI(): boolean;

/**
 * Exporters — Studio Export Utilities for furjs
 *
 * Provides:
 *   exportPNG({ scale?, transparent? }): Promise<string> — ultra-high-res PNG data URL
 *   exportGIF({ duration?, fps? }): Promise<Blob>        — looping animation clip
 *
 * PNG: re-renders at scaled resolution offscreen for 4K capture
 * GIF: lightweight JS GIF encoder (no external deps) capturing frame ring buffer
 */
interface ExportPNGOptions {
    /** Scale factor — 1 = current resolution, 2 = 2× (4K), etc. */
    scale?: number;
    /** If false, bakes in background color instead of transparency */
    transparent?: boolean;
    /** Optional filename hint (not used for data URL, but for download helper) */
    filename?: string;
    /** Background color when transparent=false */
    background?: string;
}
interface ExportGIFOptions {
    /** Clip duration ms (default 2500) */
    duration?: number;
    /** Frames per second (default 20) */
    fps?: number;
    /** Quality 1-10 (default 8) — higher = better palette */
    quality?: number;
}
/**
 * Capture current canvas as PNG data URL at optional scale.
 * If scale >1, the caller should provide a high-res canvas; we
 * simply read from the visible canvas and upscale via drawImage.
 * For true 4K re-render, FurEngine.exportPNG() builds a fresh
 * high-res frame using its rebuild pipeline at scale factor.
 *
 * This standalone helper works with any HTMLCanvasElement.
 */
declare function canvasToPNG(canvas: HTMLCanvasElement, opts?: ExportPNGOptions): string;
/**
 * Trigger a download for a data URL.
 * Useful for playground "Download PNG" button.
 */
declare function downloadDataURL(dataURL: string, filename?: string): void;
/**
 * Trigger download for a Blob.
 */
declare function downloadBlob(blob: Blob, filename?: string): void;
/**
 * Lightweight GIF encoder — captures frames via OffscreenCanvas snapshots
 * and encodes to a GIF Blob. Suitable for 2-3s looping social banners.
 *
 * Note: This is a JS fallback. For production 4K GIFs you'd use
 * gifsicle/wasm or MediaRecorder. This encoder prioritizes zero deps
 * and bundle size over palette perfection — it quantizes to 256 colors
 * via median-cut.
 */
declare class GIFEncoder {
    private width;
    private height;
    private frames;
    private delays;
    constructor(width: number, height: number);
    addFrame(canvas: HTMLCanvasElement, delayMs?: number): void;
    /** Encode collected frames to Blob — async to allow future wasm swap */
    encode(): Promise<Blob>;
    private buildSingleFrameGIF;
    private buildPalette;
    private quantize;
    private lzwEncode;
}
/** Convenience: capture current animation loop frames via requestAnimationFrame */
declare function captureGIFFromCanvas(canvas: HTMLCanvasElement, durationMs?: number, fps?: number): Promise<Blob>;

/**
 * furjs — The Universal Interactive Living Fur Typography Engine
 *
 * Public entry point (Vanilla + React). Framework-agnostic core
 * works anywhere: React, Next.js, Vue, Svelte, Astro, Webflow, Shopify,
 * or plain <script> tags.
 *
 * @example Vanilla
 * ```ts
 * import { createFur } from 'furjs';
 * const fur = createFur('#hero', { text: 'ROYAL', preset: 'royal-sable' });
 * fur.update({ text: 'KRONOS' });
 * ```
 *
 * @example React
 * ```tsx
 * import { Fur } from 'furjs';
 * <Fur text="CHANDELIER" font="Playfair Display" preset="royal-sable" />
 * ```
 */

declare const VERSION = "1.0.0";

export { type ChamferField, ChamferMask, type ChamferMaskOptions, DEFAULT_LEVELS, DEFAULT_PIXEL_BUDGET, type DirectColors, type ExportGIFOptions, type ExportPNGOptions, type FontLoadOptions, type FurColors, type FurPreset, GIFEncoder, type GradientConfig, IMPERIAL_VELVET_VARIANTS, PRESETS, PRESET_NAMES, type PaletteBuildOptions, type PresetName, type PresetPhysics, type QualityLevel, type RampEntry, type TextureConfig, type TunerState, VERSION, buildPalette, canvasToPNG, captureGIFFromCanvas, createTextureSampler, createTunerState, downloadBlob, downloadDataURL, effectiveDpr, ensureFontLoaded, ensureFontsLoaded, getPaletteColors, getPreset, getPresetColors, isValidPreset, parseColor, sampleTexture, supportsFontLoadingAPI, tunerTick };
