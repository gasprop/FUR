import { describe, it, expect } from 'vitest';
import { PRESETS, PRESET_NAMES, getPreset, isValidPreset } from '../src/core/Presets.js';
import { buildPalette, parseColor } from '../src/core/ColorRamp.js';

describe('Presets (2026)', () => {
  it('has 7 haute-couture presets', () => {
    expect(PRESET_NAMES).toHaveLength(7);
    expect(PRESET_NAMES).toContain('black-panther');
    expect(PRESET_NAMES).toContain('imperial-velvet');
  });
  it('every preset has 4-zone colors + anchors', () => {
    for (const n of PRESET_NAMES) {
      const p = PRESETS[n];
      expect(p.colors.root).toBeTruthy();
      expect(p.colors.shaft).toBeTruthy();
      expect(p.colors.tip).toBeTruthy();
      expect(p.colors.rim).toBeTruthy();
      expect(p.paletteAnchors.dark).toHaveLength(3);
      expect(p.paletteAnchors.light).toHaveLength(3);
      expect(p.physics.lengthScale).toBeGreaterThan(0);
    }
  });
  it('getPreset fallback is black-panther', () => {
    expect(getPreset('unknown-preset').name).toBe('black-panther');
  });
  it('isValidPreset guards', () => {
    expect(isValidPreset('royal-sable')).toBe(true);
    expect(isValidPreset('neon-pink')).toBe(false);
  });
});

describe('ColorRamp parseColor', () => {
  it('parses hex #rgb/#rrggbb', () => {
    expect(parseColor('#07080d')).toEqual([7, 8, 13]);
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
  });
  it('parses rgb() and hsl()', () => {
    expect(parseColor('rgb(214,227,245)')).toEqual([214, 227, 245]);
    expect(parseColor('hsl(0,100%,50%)')).toEqual([255, 0, 0]);
  });
  it('buildPalette produces 14 bands with tapered widths', () => {
    const pal = buildPalette({ preset: 'black-panther' });
    expect(pal).toHaveLength(14);
    expect(pal[0].width).toBeCloseTo(1.42, 2);
    expect(pal[13].width).toBeCloseTo(0.57, 2);
  });
  it('gradient tint shifts palette', () => {
    const a = buildPalette({ preset: 'black-panther' });
    const b = buildPalette({ preset: 'black-panther', gradient: { direction: 'horizontal', colors: ['#000','#fff'] } });
    expect(a[0].color).not.toBe(b[0].color);
  });
});
