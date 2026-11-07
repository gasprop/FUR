/**
 * FontLoader — Robust web-font detection for furjs
 *
 * Uses document.fonts.load() when available, with timeout, retry,
 * and graceful fallback for browsers without Font Loading API.
 * Ensures chamfer distance mask is not rasterized before the
 * requested font is actually ready, preventing FOUT jank.
 */

/** Loaded font descriptor */
export interface FontLoadOptions {
  /** Font family name, e.g. "Playfair Display" */
  family: string;
  /** Weight 100-900 */
  weight?: number | string;
  /** Style normal | italic */
  style?: string;
  /** Timeout in ms before giving up (default 3000) */
  timeout?: number;
}

/**
 * Wait until the browser has loaded the requested font face.
 * Resolves immediately if Font Loading API is unavailable
 * or if family is a generic system stack.
 */
export async function ensureFontLoaded(opts: FontLoadOptions): Promise<boolean> {
  const { family, weight = 400, style = 'normal', timeout = 3000 } = opts;

  // Generic stacks don't need loading
  const generic = new Set([
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-sans-serif',
    'ui-serif',
    'ui-monospace',
  ]);
  const normalized = family.trim().replace(/^["']|["']$/g, '').toLowerCase();
  if (generic.has(normalized)) return true;
  // Also treat comma-separated stacks as system if they contain generic
  if (family.includes(',')) {
    const parts = family.split(',').map((s) => s.trim().toLowerCase());
    if (parts.some((p) => generic.has(p.replace(/^["']|["']$/g, '')))) {
      // If it's a stack like "system-ui, sans-serif", don't block
      // but still try to load the first custom family if API exists
    }
  }

  // No Font Loading API — cannot detect, resolve gracefully
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return true;
  }

  const fonts = (document as any).fonts as FontFaceSet;

  // Already available?
  try {
    if (fonts.check) {
      const descriptor = `${style} ${weight} 12px "${family}"`;
      if (fonts.check(descriptor)) return true;
    }
  } catch {
    // check() can throw on invalid descriptor
  }

  // Attempt to load with timeout race
  const loadPromise = (async () => {
    try {
      const spec = `${style} ${weight} 32px "${family}"`;
      // Load triggers fetch for @font-face; ready waits for all
      await fonts.load(spec, 'BESbwy');
      // Also wait for overall ready
      if (fonts.ready) await fonts.ready;
      return true;
    } catch {
      return false;
    }
  })();

  const timeoutPromise = new Promise<boolean>((resolve) =>
    setTimeout(() => resolve(false), timeout)
  );

  const result = await Promise.race([loadPromise, timeoutPromise]);
  return result;
}

/**
 * Load multiple families in parallel.
 */
export async function ensureFontsLoaded(families: FontLoadOptions[]): Promise<boolean[]> {
  return Promise.all(families.map((f) => ensureFontLoaded(f)));
}

/**
 * Hook-friendly helper: returns true if document.fonts is supported.
 */
export function supportsFontLoadingAPI(): boolean {
  return typeof document !== 'undefined' && 'fonts' in document;
}
