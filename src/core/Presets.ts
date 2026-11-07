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

export type PresetName =
  | 'black-panther'
  | 'royal-sable'
  | 'snow-leopard'
  | 'cashmere-cream'
  | 'desert-caracal'
  | 'silver-fox'
  | 'imperial-velvet';

/** 4-zone color definition */
export interface FurColors {
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
export interface PresetPhysics {
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

export interface FurPreset {
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
export const PRESETS: Record<PresetName, FurPreset> = {
  'black-panther': {
    name: 'black-panther',
    label: 'Black Panther',
    description: 'Melanistic obsidian-black, faint Worley rosettes, cold silver-blue rim catch.',
    colors: {
      root: '#07080d',
      shaft: '#2a3142',
      tip: '#d6e3f5',
      rim: '#e8f0ff',
    },
    paletteAnchors: {
      dark: [7, 8, 13],
      mid: [42, 49, 62],
      mid2: [94, 110, 136],
      light: [214, 227, 245],
    },
    physics: {
      lengthScale: 0.92,
      densityScale: 1.12,
      glossIntensity: 0.95,
      rosetteStrength: 0.55,
      roughness: 0.25,
      lightX: -0.55,
      lightY: -0.835,
    },
    glowColor: '#a8c6f0',
    hasRosettes: true,
    baseGradient: ['#151a22', '#0a0d12', '#020305'],
  },

  'royal-sable': {
    name: 'royal-sable',
    label: 'Royal Sable',
    description: 'Dense dark chocolate with velvet sheen — the rarest fur in the world.',
    colors: {
      root: '#0d0907',
      shaft: '#382417',
      tip: '#c29b68',
      rim: '#f5eee6',
    },
    paletteAnchors: {
      dark: [13, 9, 7],
      mid: [56, 36, 23],
      mid2: [110, 78, 45],
      light: [245, 238, 230],
    },
    physics: {
      lengthScale: 1.05,
      densityScale: 1.18,
      glossIntensity: 0.72,
      rosetteStrength: 0.08,
      roughness: 0.32,
      lightX: -0.5,
      lightY: -0.78,
    },
    glowColor: '#e8c9a6',
    hasRosettes: false,
    baseGradient: ['#1a0f08', '#0e0703', '#040201'],
  },

  'snow-leopard': {
    name: 'snow-leopard',
    label: 'Snow Leopard',
    description: 'Frosty silver-white undercoat, charcoal/slate spots, icy crystalline rim.',
    colors: {
      root: '#e8ecf0',
      shaft: '#9aa3b2',
      tip: '#f7f9fb',
      rim: '#d0e8ff',
    },
    paletteAnchors: {
      dark: [58, 62, 72],
      mid: [154, 163, 178],
      mid2: [200, 210, 220],
      light: [247, 249, 251],
    },
    physics: {
      lengthScale: 1.28,
      densityScale: 0.95,
      glossIntensity: 0.6,
      rosetteStrength: 1.0,
      roughness: 0.38,
      lightX: -0.6,
      lightY: -0.8,
    },
    glowColor: '#cde4ff',
    hasRosettes: true,
    baseGradient: ['#d0d6de', '#a8b0bc', '#7e8794'],
  },

  'cashmere-cream': {
    name: 'cashmere-cream',
    label: 'Cashmere Cream',
    description: 'Ultra-soft matte cloud-like ivory/vanilla, airy fluttering guard hairs.',
    colors: {
      root: '#f5efe6',
      shaft: '#e8dccb',
      tip: '#fffaf2',
      rim: '#ffffff',
    },
    paletteAnchors: {
      dark: [198, 185, 165],
      mid: [232, 220, 203],
      mid2: [245, 238, 225],
      light: [255, 250, 242],
    },
    physics: {
      lengthScale: 1.35,
      densityScale: 1.05,
      glossIntensity: 0.22,
      rosetteStrength: 0.0,
      roughness: 0.82,
      lightX: -0.45,
      lightY: -0.7,
    },
    glowColor: '#ffe9c9',
    hasRosettes: false,
    baseGradient: ['#efe6d8', '#e8dccb', '#ddd2be'],
  },

  'desert-caracal': {
    name: 'desert-caracal',
    label: 'Desert Caracal',
    description: 'Warm sand and terracotta tawny coat with charcoal-tipped tufts.',
    colors: {
      root: '#3d2817',
      shaft: '#c17a3a',
      tip: '#f0d5b8',
      rim: '#ffe8c8',
    },
    paletteAnchors: {
      dark: [61, 40, 23],
      mid: [160, 110, 58],
      mid2: [193, 122, 58],
      light: [240, 213, 184],
    },
    physics: {
      lengthScale: 0.88,
      densityScale: 1.0,
      glossIntensity: 0.45,
      rosetteStrength: 0.15,
      roughness: 0.42,
      lightX: -0.52,
      lightY: -0.75,
    },
    glowColor: '#ffb86a',
    hasRosettes: false,
    baseGradient: ['#4a2e14', '#2e1a08', '#1a0e04'],
  },

  'silver-fox': {
    name: 'silver-fox',
    label: 'Silver Fox',
    description: 'Jet-black undercoat exploding into frosted platinum-silver tips.',
    colors: {
      root: '#050508',
      shaft: '#3a3d44',
      tip: '#e8eaef',
      rim: '#f2f4f8',
    },
    paletteAnchors: {
      dark: [5, 5, 8],
      mid: [58, 61, 68],
      mid2: [140, 145, 155],
      light: [232, 234, 239],
    },
    physics: {
      lengthScale: 1.42,
      densityScale: 0.92,
      glossIntensity: 0.78,
      rosetteStrength: 0.0,
      roughness: 0.28,
      lightX: -0.55,
      lightY: -0.82,
    },
    glowColor: '#c8d4e8',
    hasRosettes: false,
    baseGradient: ['#0a0a0e', '#050508', '#000000'],
  },

  'imperial-velvet': {
    name: 'imperial-velvet',
    label: 'Imperial Velvet',
    description: 'Deep royal jewel tones (Sapphire/Emerald/Burgundy) with metallic micro-sheen.',
    colors: {
      root: '#0a0e1a',
      shaft: '#1a3a5c',
      tip: '#6bb6ff',
      rim: '#d4e6ff',
    },
    paletteAnchors: {
      dark: [10, 14, 26],
      mid: [26, 58, 92],
      mid2: [42, 95, 148],
      light: [107, 182, 255],
    },
    physics: {
      lengthScale: 1.0,
      densityScale: 1.08,
      glossIntensity: 0.68,
      rosetteStrength: 0.0,
      roughness: 0.35,
      lightX: -0.5,
      lightY: -0.8,
    },
    glowColor: '#6bb6ff',
    hasRosettes: false,
    baseGradient: ['#0f1d33', '#0a1433', '#050a1a'],
  },
};

/** All preset names as array */
export const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];

/** Imperial Velvet has 3 jewel-tone variants — expand in UI */
export const IMPERIAL_VELVET_VARIANTS = {
  sapphire: {
    root: '#0a0e1a',
    shaft: '#1a3a5c',
    tip: '#6bb6ff',
    rim: '#d4e6ff',
    glowColor: '#4a90e2',
    baseGradient: ['#0f1d33', '#0a1433', '#050a1a'] as [string, string, string],
  },
  emerald: {
    root: '#07120e',
    shaft: '#1a4a2e',
    tip: '#6bffb6',
    rim: '#d4ffe6',
    glowColor: '#4ae2a0',
    baseGradient: ['#0f2e1a', '#0a3318', '#051a0a'] as [string, string, string],
  },
  burgundy: {
    root: '#1a0a10',
    shaft: '#5c1a2e',
    tip: '#ff6b9a',
    rim: '#ffd4e2',
    glowColor: '#e24a6b',
    baseGradient: ['#330f1d', '#330a18', '#1a050a'] as [string, string, string],
  },
} as const;

/** Get preset by name, falling back to black-panther */
export function getPreset(name?: string): FurPreset {
  if (name && name in PRESETS) return PRESETS[name as PresetName];
  return PRESETS['black-panther'];
}

/** Check if preset name is valid */
export function isValidPreset(name: string): name is PresetName {
  return name in PRESETS;
}
