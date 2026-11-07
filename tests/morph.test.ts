import { describe, it, expect } from 'vitest';
import { MorphEngine, ease } from '../src/core/MorphEngine.js';

describe('MorphEngine (killer feature)', () => {
  it('ease fur-spring stays 0..1 and ends at 1', () => {
    expect(ease('fur-spring',0)).toBe(0);
    expect(ease('fur-spring',1)).toBeCloseTo(1,2);
    for(let t=0;t<=1;t+=0.1) { const v=ease('fur-spring',t); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1.02); }
  });
  it('MorphEngine tick progresses and completes', async () => {
    const m=new MorphEngine();
    m.start('FUR','ROYAL',{duration:40, easing:'linear'});
    expect(m.isActive()).toBe(true);
    // fast-forward 50ms
    await new Promise(r=>setTimeout(r,60));
    const p=m.tick(Date.now());
    expect(p).toBe(1);
    expect(m.isActive()).toBe(false);
  });
  it('cancel stops morph', () => {
    const m=new MorphEngine();
    m.start('A','B'); m.cancel(); expect(m.isActive()).toBe(false);
  });
});
