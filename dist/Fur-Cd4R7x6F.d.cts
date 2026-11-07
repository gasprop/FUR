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
    destroy(): void;
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

export { FurEngine as F, type InfluencePoint as I, type PhysicsOptions as P, type Shockwave as S, type WindConfig as W, type FurInstance as a, type FurOptions as b, type FurProps as c, type FurRef as d, type InteractiveMode as e, type StrandState as f, createFur as g, Fur as h };
