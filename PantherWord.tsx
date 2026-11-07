import React, { useEffect, useRef } from 'react';

/* The brand's first word, drawn by public/fur/panther.js on the page's own
   background. The renderer is loaded once the canvas is near the viewport. */

declare global {
  interface Window {
    __mountPantherFur?: (root: HTMLElement) => (() => void) | null;
  }
}

export function PantherWord({ className, text = 'account' }: { className?: string; text?: string }) {
  const rootRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    let unmount: (() => void) | null = null;

    const mount = () => {
      if (cancelled || unmount) return;
      const w = window;
      if (w.__mountPantherFur) {
        unmount = w.__mountPantherFur(root);
        return;
      }
      const script = document.createElement('script');
      script.src = '/fur/panther.js';
      script.async = true;
      script.onload = () => {
        if (cancelled) return;
        unmount = w.__mountPantherFur ? w.__mountPantherFur(root) : null;
      };
      document.head.appendChild(script);
    };

    if (!('IntersectionObserver' in window)) {
      mount();
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        io.disconnect();
        mount();
      }
    }, { rootMargin: '400px 0px' });
    io.observe(root);

    return () => {
      cancelled = true;
      io.disconnect();
      if (unmount) unmount();
    };
  }, []);

  return (
    <span ref={rootRef} className={`panther-word${className ? ' ' + className : ''}`} data-fit="tight" data-text={text}>
      <canvas
        className="panther-canvas"
        role="img"
        aria-label={text}
      />
    </span>
  );
}
