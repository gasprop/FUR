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

export { createFur, FurEngine } from './core/FurEngine.js';
export type { FurOptions, FurInstance } from './core/FurEngine.js';

export { buildPalette, parseColor, createTextureSampler, sampleTexture, getPaletteColors, getPresetColors } from './core/ColorRamp.js';
export type { DirectColors, GradientConfig, TextureConfig, RampEntry, PaletteBuildOptions } from './core/ColorRamp.js';

export { PRESETS, PRESET_NAMES, getPreset, isValidPreset, IMPERIAL_VELVET_VARIANTS } from './core/Presets.js';
export type { PresetName, FurColors, FurPreset, PresetPhysics } from './core/Presets.js';

export { ChamferMask } from './core/ChamferMask.js';
export type { ChamferMaskOptions, ChamferField } from './core/ChamferMask.js';

export { effectiveDpr, createTunerState, tunerTick, DEFAULT_LEVELS, DEFAULT_PIXEL_BUDGET } from './core/QualityTuner.js';
export type { QualityLevel, TunerState } from './core/QualityTuner.js';

export { ensureFontLoaded, ensureFontsLoaded, supportsFontLoadingAPI } from './utils/FontLoader.js';
export type { FontLoadOptions } from './utils/FontLoader.js';

export { GIFEncoder, canvasToPNG, downloadDataURL, downloadBlob, captureGIFFromCanvas } from './utils/Exporters.js';
export type { ExportPNGOptions, ExportGIFOptions } from './utils/Exporters.js';

export type { WindConfig, InteractiveMode, Shockwave, PhysicsOptions, StrandState, InfluencePoint } from './core/Physics.js';

export { MorphEngine, ScrollDriver, ease } from './core/MorphEngine.js';
export type { MorphOptions, MorphEasing, MorphState, ScrollLinkOptions } from './core/MorphEngine.js';

export { createChamferWorker, buildChamferSync } from './core/ChamferWorker.js';
export type { ChamferWorkerHandle } from './core/ChamferWorker.js';

// Re-export React entry for convenience (tree-shaken if unused)
export type { FurProps, FurRef } from './react/Fur.js';

// Version — injected at build
export const VERSION = '1.0.0';
