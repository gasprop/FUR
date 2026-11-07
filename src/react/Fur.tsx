'use client';

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

import React, { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { createFur, type FurOptions, type FurInstance } from '../core/FurEngine.js';

export interface FurProps extends FurOptions {
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

export type FurRef = FurInstance | null;

export const Fur = forwardRef<FurRef, FurProps>(function Fur(props, forwardedRef) {
  const {
    className,
    style,
    aspectRatio = '5.2 / 1',
    height,
    ariaLabel,
    role = 'img',
    // Extract FurOptions — remainder are fur props
    ...furOptions
  } = props;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<FurInstance | null>(null);

  // Imperative handle
  useImperativeHandle(forwardedRef, () => instanceRef.current as FurInstance, []);

  // Mount lifecycle
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let cancelled = false;
    let inst: FurInstance | null = null;
    let ro: ResizeObserver | null = null;

    const mount = () => {
      if (cancelled) return;
      // Prevent double-mount in StrictMode
      if (inst || instanceRef.current) return;
      try {
        inst = createFur(root, furOptions as FurOptions);
        instanceRef.current = inst;
      } catch (e) {
        console.error('[furjs] mount failed:', e);
      }
    };

    // Defer mount to ensure layout is computed (parent may still be measuring)
    if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((en) => en.isIntersecting)) {
            io.disconnect();
            // Small delay so root has non-zero dimensions
            requestAnimationFrame(() => mount());
          }
        },
        { rootMargin: '400px 0px' }
      );
      io.observe(root);
      // Fallback: mount anyway after 2s if observer never fires (hidden tab etc.)
      const timer = setTimeout(() => {
        io.disconnect();
        mount();
      }, 2000);

      return () => {
        cancelled = true;
        clearTimeout(timer);
        io.disconnect();
        if (inst) inst.destroy();
        if (instanceRef.current) instanceRef.current.destroy();
        instanceRef.current = null;
        (ro as any)?.disconnect?.();
      };
    } else {
      // No IO — mount immediately (SSR fallback / old browsers)
      const raf = requestAnimationFrame(() => mount());
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf);
        if (inst) inst.destroy();
        if (instanceRef.current) instanceRef.current.destroy();
        instanceRef.current = null;
        (ro as any)?.disconnect?.();
      };
    }
    // Only mount once; options updates handled separately
    
  }, []);

  // Live updates when fur-relevant props change
  useEffect(() => {
    if (instanceRef.current) {
      instanceRef.current.update(furOptions as FurOptions);
    }
  }, [furOptions.text, furOptions.font, furOptions.fontWeight, furOptions.letterSpacing, furOptions.preset, furOptions.colors, furOptions.gradient, furOptions.texture, furOptions.interactive, furOptions.stiffness, furOptions.damping, furOptions.wind, furOptions.breathing, furOptions.hairLength, furOptions.density, furOptions.fit, furOptions.svgPath, furOptions.customMask, furOptions.background]);

  const text = furOptions.text ?? 'FUR';
  const containerStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    height: height !== undefined ? (typeof height === 'number' ? `${height}px` : height) : undefined,
    aspectRatio: height !== undefined ? undefined : aspectRatio,
    overflow: 'hidden',
    position: 'relative',
    ...style,
  };

  return (
    <div
      ref={rootRef}
      className={className ? `fur-container ${className}` : 'fur-container'}
      style={containerStyle}
      data-fur={text}
      data-preset={furOptions.preset ?? 'black-panther'}
      // Canvas is created dynamically inside
    >
      {/* Fallback text for SEO / no-JS — hidden when canvas mounts */}
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
        aria-hidden
      >
        {text}
      </span>
      {/* Aria canvas — the engine injects a real <canvas> sibling */}
      <canvas
        // This is a placeholder for SSR — engine creates its own canvas on mount
        // We keep it so hydration matches; engine will reuse it if found
        className="fur-canvas"
        role={role as any}
        aria-label={ariaLabel ?? text}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
      <style>{`
        .fur-container canvas { display:block; width:100%; height:100%; touch-action: pan-y; cursor: crosshair; }
        .fur-container[data-preset] canvas { aspect-ratio: ${aspectRatio}; }
      `}</style>
    </div>
  );
});

Fur.displayName = 'Fur';

export default Fur;
