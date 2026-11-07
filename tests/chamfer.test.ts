import { describe, it, expect } from 'vitest';
import { ChamferMask } from '../src/core/ChamferMask.js';
import { buildChamferSync } from '../src/core/ChamferWorker.js';

describe('ChamferMask (production level)', () => {
  it('buildChamferSync computes halfStroke>0 for non-empty alpha', () => {
    const MW=20,MH=10;
    const alpha=new Uint8Array(MW*MH);
    // draw a 6x6 block in center
    for(let y=2;y<8;y++) for(let x=7;x<13;x++) alpha[y*MW+x]=255;
    const { halfStroke, ndx, ndy } = buildChamferSync(MW,MH,alpha);
    expect(halfStroke).toBeGreaterThan(0);
    expect(ndx.length).toBe(MW*MH);
    expect(ndy.length).toBe(MW*MH);
  });
  it('ChamferMask buildSync handles empty text gracefully', () => {
    const cm = new ChamferMask();
    const field = cm.buildSync(200,100,{ text:'', fontFamily:'system-ui, sans-serif', fontWeight:900, letterSpacing:0.025, fit:'normal' });
    expect(field.MW).toBeGreaterThan(0);
    expect(field.alpha.length).toBe(field.MW*field.MH);
  });
  it('memoization check: same params produce same halfStroke', () => {
    const cm = new ChamferMask();
    const a = cm.buildSync(320,120,{ text:'FUR', fontFamily:'system-ui, sans-serif', fontWeight:900, letterSpacing:0.025, fit:'normal' });
    const b = cm.buildSync(320,120,{ text:'FUR', fontFamily:'system-ui, sans-serif', fontWeight:900, letterSpacing:0.025, fit:'normal' });
    expect(a.halfStrokeMask).toBe(b.halfStrokeMask);
  });
});
