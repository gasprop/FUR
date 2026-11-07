import React from 'react';

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
type InteractiveMode = 'repel' | 'attract' | 'none';
interface WindConfig {
    /** Wind speed (0 = still, 1 = normal breeze, 2 = storm) */
    speed?: number;
    /** Direction in degrees 0-360 (0 = east, 90 = south) */
    direction?: number;
    /** Random gustiness 0-1 (coherent turbulence) */
    gustiness?: number;
}
interface Shockwave {
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
interface PhysicsOptions {
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
interface StrandState {
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
interface InfluencePoint {
    x: number;
    y: number;
    tx: number;
    ty: number;
    vx: number;
    vy: number;
    act: number;
    want: number;
    seen: boolean;
}

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
 * MorphEngine — Text-to-Text Fur Morph for furjs (Special Feature)
 *
 * The Killer Feature people actually use: hero text that morphs like living fur.
 * e.g. "FUR" → "ROYAL" → "SABLE" on scroll or autoplay.
 *
 * Uses chamfer field interpolation + strand FLIP: captures A→B strand endpoints,
 * then tweens PX/PY/LEN/RI/TI via spring easing. Keeps 60FPS because it reuses
 * the existing spring system instead of rebuilding 12K strands per frame.
 *
 * Widely used: landing hero loops, product name rotations, pricing tier switches.
 */

type MorphEasing = 'linear' | 'easeInOut' | 'spring' | 'fur-spring';
interface MorphOptions {
    /** Duration ms (default 900) */
    duration?: number;
    /** Easing — 'fur-spring' feels organic (uses same 0.862 damp) */
    easing?: MorphEasing;
    /** Target preset to cross-fade (colors morph too) */
    preset?: string;
    /** Keep groom state through morph (default false) */
    keepGroom?: boolean;
    /** Called each frame with progress 0..1 */
    onProgress?: (p: number) => void;
    /** Called on complete */
    onComplete?: () => void;
}
interface MorphState {
    from: string;
    to: string;
    t: number;
    active: boolean;
    start: number;
    duration: number;
    easing: MorphEasing;
}
declare function ease(type: MorphEasing, t: number): number;
/**
 * Morph driver — stateless helper that FurEngine owns.
 * FurEngine calls `morphTick(now)` each frame; when active it interpolates
 * strand roots and returns blended ChamferField progress.
 */
declare class MorphEngine {
    state: MorphState | null;
    private mask;
    start(from: string, to: string, opts?: MorphOptions): void;
    /**
     * Tick — returns eased progress 0..1. When >=1, marks inactive.
     * Caller lerps strand arrays with this value.
     */
    tick(now?: number, opts?: MorphOptions): number;
    isActive(): boolean;
    progress(): number;
    cancel(): void;
    /** Build target field async (non-blocking) for preview */
    buildTargetField(W: number, H: number, text: string, fontFamily: string, fontWeight: string, letterSpacing: number): Promise<ChamferField>;
}
/**
 * ScrollDriver — links scrollY or element intersection to fur params.
 *
 * Used for: parallax wind, scrubbed morphs, “fur reveals as you scroll” stories.
 * Zero deps — uses scroll listener + rAF, auto-cleans on destroy.
 *
 * @example
 * fur.linkToScroll({ target: '#hero', scrubsMorph: ['FUR','ROYAL','SABLE'] })
 * fur.linkToScroll({ windLink: true }) // wind speed = scrollVelocity * 0.04
 */
interface ScrollLinkOptions {
    /** Element to track — default window */
    target?: HTMLElement | string;
    /** If set, morph through this text array as you scroll 0→1 */
    scrubsMorph?: string[];
    /** Link wind speed to scroll velocity */
    windLink?: boolean;
    /** Link breathing to scroll (pause when scrolling) */
    breathingLink?: boolean;
    /** Custom mapper: scrollProgress 0..1 → partial FurOptions */
    map?: (progress: number) => Record<string, any>;
    /** Throttle ms (default 16) */
    throttle?: number;
}
declare class ScrollDriver {
    private apply;
    private morph?;
    private cleanup;
    private raf;
    private lastY;
    private vel;
    constructor(apply: (opts: Record<string, any>) => void, morph?: ((t: string) => void) | undefined);
    link(opts?: ScrollLinkOptions): () => void;
    unlink(): void;
    velocity(): number;
}

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

interface FurOptions {
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
    colors?: {
        root?: string;
        shaft?: string;
        tip?: string;
        rim?: string;
    };
    /** Gradient across letters */
    gradient?: {
        direction?: 'horizontal' | 'vertical' | 'diagonal';
        colors: string[];
    };
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
    onFrame?: (stats: {
        fps: number;
        strandCount: number;
        dpr: number;
        level: number;
    }) => void;
}
interface FurInstance {
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
    exportPNG(opts?: {
        scale?: number;
        transparent?: boolean;
    }): Promise<string>;
    /** Export seamless looping GIF Blob */
    exportGIF(opts?: {
        duration?: number;
        fps?: number;
    }): Promise<Blob>;
    /** Convenience downloaders */
    downloadPNG(opts?: {
        scale?: number;
        filename?: string;
    }): Promise<void>;
    downloadGIF(opts?: {
        duration?: number;
        fps?: number;
        filename?: string;
    }): Promise<void>;
    /** Special — morph to new text with fur-spring easing */
    morph(text: string, opts?: MorphOptions): Promise<void>;
    /** Special — link fur wind/morph to scroll */
    linkToScroll(opts?: ScrollLinkOptions): () => void;
    /** Unlink scroll driver */
    unlinkScroll(): void;
    /** SEO: static poster PNG for SSR / Core Web Vitals */
    generateStaticFallback(opts?: {
        scale?: number;
        width?: number;
        height?: number;
    }): Promise<string>;
}
declare class FurEngine implements FurInstance {
    container: HTMLElement;
    canvas: HTMLCanvasElement;
    options: FurOptions;
    private ctx;
    private chamfer;
    private field;
    private baseCanvas;
    private bctx;
    private glowCanvas;
    private gctx;
    private strands;
    private W;
    private H;
    private DPR;
    private MS;
    private lastW;
    private lastH;
    private fontSizeCSS;
    private baseLen;
    private furW;
    private glyphHalfStroke;
    private legibility;
    private glowStrength;
    private palette;
    private presetCache;
    private NB;
    private morphEngine;
    private scrollDriver;
    private morphFromStrands;
    private morphToStrands;
    private morphTargetText;
    private tuner;
    private levels;
    private pixelBudget;
    private raf;
    private running;
    private lastTime;
    private tSec;
    private frameNo;
    private rect;
    private pts;
    private mousePt;
    private MAX_TOUCH;
    private shockwaves;
    private gyroEnabled;
    private gyroX;
    private gyroY;
    private breathePhase;
    private ro;
    private io;
    private syncQueued;
    private cleanupFns;
    private visible;
    private reduceMotion;
    constructor(container: HTMLElement | string, opts?: FurOptions);
    private normalizeOptions;
    update(opts: Partial<FurOptions>): void;
    rebuild(): void;
    private rebuildPalette;
    private measureViewport;
    private effectiveDpr;
    private syncSize;
    private layout;
    private buildField;
    private buildSvgField;
    private buildCanvasMaskField;
    private chamferFieldFromAlpha;
    private buildBase;
    private buildGlow;
    private drawGlyphsTo;
    private drawSingleLineTo;
    private buildStrands;
    private start;
    pause(): void;
    resume(): void;
    private frame;
    private renderFrame;
    private wirePointer;
    private wireGyro;
    private wireResize;
    private wireVisibility;
    private wireIntersection;
    exportPNG(opts?: {
        scale?: number;
        transparent?: boolean;
    }): Promise<string>;
    /**
     * generateStaticFallback — SEO / Core Web Vitals helper
     * Renders a high-res snapshot as data URL to use as <img> poster
     * before hydration. No animation loop needed.
     * Used for SSR: <img src={staticDataURL} /> → hydration replaces with live canvas.
     */
    generateStaticFallback(opts?: {
        scale?: number;
        width?: number;
        height?: number;
    }): Promise<string>;
    exportGIF(opts?: {
        duration?: number;
        fps?: number;
    }): Promise<Blob>;
    downloadPNG(opts?: {
        scale?: number;
        filename?: string;
    }): Promise<void>;
    downloadGIF(opts?: {
        duration?: number;
        fps?: number;
        filename?: string;
    }): Promise<void>;
    morph(text: string, opts?: MorphOptions): Promise<void>;
    linkToScroll(opts?: ScrollLinkOptions): () => void;
    unlinkScroll(): void;
    destroy(): void;
}
declare function createFur(container: HTMLElement | string, options?: FurOptions): FurInstance;

/**
 * Fur — React / Next.js Component for furjs (SSR-safe)
 *
 * Automatically:
 *  - lazy-mounts the Canvas 2D engine on the client
 *  - wires ResizeObserver with cleanup on unmount
 *  - pauses via IntersectionObserver when scrolled off-screen
 *  - supports React 18 and React 19
 *
 * @example
 * ```tsx
 * import { Fur } from 'furjs';
 * <Fur text="CHANDELIER" font="Playfair Display" preset="royal-sable" />
 * ```
 *
 * @example with custom colors
 * ```tsx
 * <Fur text="NOIR" colors={{ root: '#0d0907', shaft: '#382417', tip: '#c29b68', rim: '#f5eee6' }} />
 * ```
 */

interface FurProps extends FurOptions {
    /** Additional className for the wrapper */
    className?: string;
    /** Inline style for wrapper */
    style?: React.CSSProperties;
    /** Aspect ratio fallback — default 5.2/1 like panther.js */
    aspectRatio?: string;
    /** Fixed height — if omitted, container is height:100% and expects parent to size it */
    height?: string | number;
    /** Accessibility label — defaults to text */
    ariaLabel?: string;
    /** Role override — default img */
    role?: string;
    /** Children are ignored — text prop is canonical */
    children?: never;
}
type FurRef = FurInstance | null;
declare const Fur: React.ForwardRefExoticComponent<FurProps & React.RefAttributes<FurRef>>;

export { type ChamferField as C, FurEngine as F, type InfluencePoint as I, type MorphEasing as M, type PhysicsOptions as P, ScrollDriver as S, type WindConfig as W, ChamferMask as a, type ChamferMaskOptions as b, type FurInstance as c, type FurOptions as d, type FurProps as e, type FurRef as f, type InteractiveMode as g, MorphEngine as h, type MorphOptions as i, type MorphState as j, type ScrollLinkOptions as k, type Shockwave as l, type StrandState as m, createFur as n, ease as o, Fur as p };
