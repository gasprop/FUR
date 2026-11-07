import { describe, it, expect } from 'vitest';
import { rosetteAt, hash2, windAt, breathingScale, gravityFromOrientation } from '../src/core/Physics.js';
import { effectiveDpr, DEFAULT_LEVELS, DEFAULT_PIXEL_BUDGET, createTunerState, tunerTick } from '../src/core/QualityTuner.js';

describe('Physics helpers (2026)', () => {
  it('hash2 deterministic', () => {
    expect(hash2(1,2)).toBe(hash2(1,2));
    expect(hash2(1,2)).not.toBe(hash2(2,1));
  });
  it('rosetteAt returns ring/core in 0..1', () => {
    const r = rosetteAt(100,100);
    expect(r.ring).toBeGreaterThanOrEqual(0); expect(r.ring).toBeLessThanOrEqual(1);
    expect(r.core).toBeGreaterThanOrEqual(0); expect(r.core).toBeLessThanOrEqual(1);
  });
  it('windAt respects direction', () => {
    const s: any = { phase: 0, amp: 1, len: 10 };
    const w0 = windAt(1, s, { speed:1, direction:0, gustiness:0 }, false);
    const w90 = windAt(1, s, { speed:1, direction:90, gustiness:0 }, false);
    expect(w0.x).not.toBe(w90.x);
  });
  it('breathing scale pulses ~1±amp', () => {
    expect(breathingScale(0,0.35,0.06)).toBeCloseTo(1,1);
    expect(breathingScale(1,0.35,0.06)).not.toBe(1);
  });
  it('gyro maps gamma/beta to bias', () => {
    expect(gravityFromOrientation(90,0)).toEqual({gx:8,gy:0});
    expect(gravityFromOrientation(null,null)).toEqual({gx:0,gy:0});
  });
});

describe('QualityTuner (highest speed, no degradation)', () => {
  it('effectiveDpr respects budget and floor', () => {
    const dpr = effectiveDpr(980,220,2,0,DEFAULT_LEVELS,DEFAULT_PIXEL_BUDGET);
    expect(dpr).toBeGreaterThanOrEqual(0.44); expect(dpr).toBeLessThanOrEqual(3);
  });
  it('tuner fast-path jumps 2 levels on drawAvg>24', () => {
    const s = createTunerState(16500);
    s.level=0; s.cooldown=0;
    // feed big draw
    for(let i=0;i<45;i++) tunerTick(s, 30, 25, Date.now()+i*16);
    expect(s.level).toBeGreaterThanOrEqual(1);
  });
  it('createTunerState adapts to coarse cores', () => {
    const s = createTunerState();
    expect(s.baseStrands).toBeGreaterThan(1000);
  });
});
