'use client';

/**
 * useFur — Custom React hook for furjs
 *
 * SSR-safe: no window access during server render.
 * Handles ResizeObserver cleanup, IntersectionObserver pause, and
 * reactive option updates via createFur().update().
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { createFur, type FurOptions, type FurInstance } from '../core/FurEngine.js';

export interface UseFurOptions extends FurOptions {
  /** Pause when off-screen (default true) */
  autoPause?: boolean;
}

export function useFur(
  containerRef: React.RefObject<HTMLElement>,
  options: UseFurOptions
): FurInstance | null {
  const instanceRef = useRef<FurInstance | null>(null);
  const optionsRef = useRef(options);
  const [_ready, setReady] = useState(false);

  // Keep options ref fresh for update() diffing
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Mount / unmount lifecycle
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    let inst: FurInstance | null = null;

    // Defer to next frame so container has layout
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      inst = createFur(el, optionsRef.current);
      instanceRef.current = inst;
      setReady(true);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (inst) inst.destroy();
      instanceRef.current = null;
      setReady(false);
    };
    // Only remount when container changes — options flow via update()
    
  }, [containerRef]);

  // Reactive update for option changes (text/font/preset/wind etc.)
  useEffect(() => {
    if (instanceRef.current) {
      instanceRef.current.update(options);
    }
  }, [options]);

  return instanceRef.current;
}

/** Imperative handle type for forwarding */
export type FurHandle = {
  /** Current engine instance (nullable during SSR) */
  instance: FurInstance | null;
  /** Convenience update */
  update: (opts: Partial<FurOptions>) => void;
  /** Destroy */
  destroy: () => void;
  /** Export helpers */
  exportPNG: (opts?: { scale?: number; transparent?: boolean }) => Promise<string>;
  exportGIF: (opts?: { duration?: number; fps?: number }) => Promise<Blob>;
};

export function useFurHandle(instance: FurInstance | null): FurHandle {
  const update = useCallback((opts: Partial<FurOptions>) => instance?.update(opts), [instance]);
  const destroy = useCallback(() => instance?.destroy(), [instance]);
  const exportPNG = useCallback((opts?: { scale?: number; transparent?: boolean }) => {
    if (!instance) return Promise.reject(new Error('furjs: not mounted'));
    return instance.exportPNG(opts);
  }, [instance]);
  const exportGIF = useCallback((opts?: { duration?: number; fps?: number }) => {
    if (!instance) return Promise.reject(new Error('furjs: not mounted'));
    return instance.exportGIF(opts);
  }, [instance]);

  return { instance, update, destroy, exportPNG, exportGIF };
}
