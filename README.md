# furjs — The Universal Interactive Living Fur Typography Engine

> **Turn any text, font, glyph, or vector shape into photorealistic, physics-driven, living fur — on pure Canvas 2D. Zero dependencies. One line.**

[![npm](https://img.shields.io/npm/v/furjs?label=furjs&color=%23c29b68)](https://www.npmjs.com/package/furjs)
[![npm](https://img.shields.io/npm/v/@thatanearyan/fur?label=%40thatanearyan%2Ffur&color=%23070a12)](https://www.npmjs.com/package/@thatanearyan/fur)
[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Bundle](https://img.shields.io/badge/bundle-%3C30KB%20gzipped-black)](#)
[![Canvas 2D](https://img.shields.io/badge/renderer-Canvas%202D-%23a8c6f0)](#)

Built from **1,140 lines** of procedural Canvas 2D — chamfer distance transforms, damped spring physics, quadratic Bezier curl fields, and Worley rosette noise — generalized into a production library used across React, Next.js, Vue, Svelte, Astro, Webflow, and plain HTML.

---

## ✦ Demo

```bash
npx furjs "ROYAL"
npx furjs "SNOW LEOPARD"
npx @thatanearyan/fur "CHANDELIER"
```

Opens a local playground with live sliders for hair length, density, presets, wind, and colors — plus **Copy React Snippet** / **Copy Vanilla Code** and PNG/GIF export.

Live demo: `http://localhost:3474` after running the command above.

---

## Features

| Area | Details |
|---|---|
| **Typography & Masking** | Any text, multi-line, unicode (Latin, Cyrillic, Devanagari, Kanji, Arabic, ✦★🐾), any `font` via `document.fonts.load`, `fontWeight` 100-900, `letterSpacing`, SVG `svgPath` or canvas `customMask` silhouettes |
| **Materials** | 3-zone optical model (root/shaft/tip/rim), 7 luxury presets, direct hex/RGB/HSL, horizontal/vertical/diagonal gradients, image/canvas texture sampling |
| **Physics** | Damped springs (`stiffness`/`damping`/`mass`), `interactive: 'repel' | 'attract' | 'none'`, velocity-driven swirl, grooming memory, wind (`speed`/`direction`/`gustiness`), breathing idle, gyroscope `DeviceOrientation`, multi-touch, click shockwave ripples |
| **Performance** | Chamfer transform memoized per text/font, adaptive DPR + density auto-tuner (60 FPS lock), `IntersectionObserver` pause, `ResizeObserver`, `visualViewport` aware, handles 4K/ProMotion/budget Android |
| **Studio** | `exportPNG({ scale, transparent })`, `exportGIF({ duration, fps })`, download helpers |
| **DX** | Dual ESM/CJS, full `.d.ts`, tree-shakeable, `<30 KB` gzipped, SSR-safe `'use client'` |

### Haute Couture Presets — No Neon, Only Luxury

1. `black-panther` — melanistic obsidian, silver-blue rim, faint rosettes *(default)*
2. `royal-sable` — dark chocolate velvet (rarest fur in the world)
3. `snow-leopard` — frosty silver, charcoal spots, icy rim
4. `cashmere-cream` — ivory cloud, matte fluttering guard hairs
5. `desert-caracal` — sand & terracotta, charcoal tips
6. `silver-fox` — jet base → platinum frost
7. `imperial-velvet` — jewel tones: Sapphire / Emerald / Burgundy, metallic micro-sheen

---

## Installation

```bash
npm i furjs
# or the scoped alias — same package
npm i @thatanearyan/fur

yarn add furjs
pnpm add furjs
```

No peer installs required. `react` is optional — only for the `<Fur>` component.

---

## Quick Start — Vanilla (any framework or plain HTML)

```html
<div id="hero" style="width:100%; height:220px"></div>
<script type="module">
  import { createFur } from 'furjs';
  const fur = createFur('#hero', {
    text: 'ROYAL',
    font: 'Cinzel',
    preset: 'royal-sable',
    interactive: 'repel',
    wind: { speed: 0.6, direction: 45 },
  });
  // Live updates
  fur.update({ text: 'KRONOS' });
  // Snapshots
  const png = await fur.exportPNG({ scale: 2, transparent: false });
  const gif = await fur.exportGIF({ duration: 2500, fps: 20 });
  // Cleanup
  // fur.destroy();
</script>
```

Or via CDN / plain `<script>` after build:

```html
<script type="module">
  import { createFur } from 'https://cdn.jsdelivr.net/npm/furjs/dist/index.js';
  createFur('#hero', { text: 'LUXE', preset: 'silver-fox' });
</script>
```

### Options Reference (Vanilla)

```ts
createFur(container, {
  text: 'FUR',                          // string — unicode OK, \n for multi-line
  font: 'Playfair Display',             // any installed / web font
  fontWeight: 900,                      // 100-900
  letterSpacing: 0.025,                 // em fraction
  fit: 'normal',                        // 'tight' | 'normal'
  preset: 'black-panther',              // or any of the 7 names
  colors: {                             // override 4-zone (any CSS color)
    root: '#0d0907',
    shaft: '#382417',
    tip: '#c29b68',
    rim: '#f5eee6',
  },
  gradient: {                           // tint across letters
    direction: 'horizontal',            // 'horizontal'|'vertical'|'diagonal'
    colors: ['#0d0907','#c29b68','#f5eee6']
  },
  texture: '/fur/marble.jpg',           // image URL / <img> / <canvas>
  interactive: 'repel',                 // 'repel'|'attract'|'none'
  stiffness: 0.20, damping: 0.862, mass: 1,
  groomMemory: 2000,                     // ms hair remembers parting
  wind: { speed: 0.6, direction: 45, gustiness: 0.45 },
  breathing: false,
  hairLength: 1, density: 1,            // scales
  gyroscope: true, touch: true, shockwave: true,
  svgPath: 'M ... Z',                   // custom silhouette
  customMask: myCanvas,
  background: '#07080d',
})
```

`instance` methods: `update(opts)`, `rebuild()`, `pause()`, `resume()`, `destroy()`, `exportPNG()`, `exportGIF()`, `downloadPNG()`, `downloadGIF()`.

---

## Quick Start — React / Next.js

```tsx
'use client';
import { Fur } from 'furjs';

export default function Page() {
  return (
    <Fur
      text="CHANDELIER"
      font="Playfair Display"
      preset="royal-sable"
      hairLength={1.1}
      wind={{ speed: 0.5, direction: 30 }}
      breathing
      style={{ height: 220 }}
      className="hero-fur"
    />
  );
}
```

The component is `'use client'`-marked and SSR-safe — it mounts via `IntersectionObserver` (400px pre-load margin) and tears down `ResizeObserver` on unmount.

For manual control, use the hook:

```tsx
'use client';
import { useRef } from 'react';
import { useFur } from 'furjs'; // or 'furjs/react' if you split entry

function Manual() {
  const ref = useRef<HTMLDivElement>(null);
  const fur = useFur(ref, { text: 'MIRAGE', preset: 'snow-leopard' });
  return <div ref={ref} style={{ height: 180 }} />;
}
```

Or imperative via ref-forward:

```tsx
import { useRef } from 'react';
import { Fur, type FurRef } from 'furjs';

function Demo() {
  const r = useRef<FurRef>(null);
  return (
    <>
      <Fur ref={r} text="NOCTURNE" preset="imperial-velvet" />
      <button onClick={() => r.current?.exportPNG({ scale: 2 }).then(url => open(url))}>
        Snapshot
      </button>
    </>
  );
}
```

---

## Typography & Masking — Deep Dive

- **Any string** — single words (`ROYAL`), headlines (`SNOW LEOPARD`), numbers, symbols, emojis, multi-line via `\n`.
- **Any font** — pass `font: 'Cinzel'` and the engine awaits `document.fonts.load('900 32px "Cinzel"', 'BESbwy')` before rasterizing, with 3s timeout + graceful fallback. Works with Google Fonts, `@font-face`, variable fonts.
- **SVG silhouettes** — `svgPath: 'M10 10 ... Z'` centers + scales the path to the canvas; use for logos. `customMask: HTMLCanvasElement` accepts any offscreen canvas (e.g., an icon renderer).
- **Unicode** — raster path uses `CanvasText` with `measureText` per glyph, handles RTL glyphs where supported by the browser canvas.

---

## Color Pipeline — 3-Zone Optical Model

Real fur has three optical zones + rim catch:

```
root (undercoat, dense, dark) → shaft (mid pigment) → tip (translucent) → rim (specular edge)
```

The engine discretizes this into **14 color bands** with tapered stroke widths (`1.42 → 0.57`). Each strand picks a root band + tip band separated by ~2 steps, preserving the optical gradient.

```ts
// Direct
colors: { root: '#07080d', shaft: '#2a3142', tip: '#d6e3f5', rim: '#e8f0ff' }

// Gradient across letters (e.g. espresso → honey)
gradient: { direction: 'horizontal', colors: ['#382417','#c29b68','#f5eee6'] }

// Texture sampling
texture: { source: '/pelts/sable.jpg', mapping: 'stretch' }
```

All color strings accept `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, or named colors.

---

## Physics — Living Fur

- **Damped spring** per strand: `v += (target - pos) * k; v *= d; pos += v` with bend cap `1.15× length` to keep letterforms legible.
- **Repel vs Attract** — repel combs outward (comb/beard brush), attract leans toward cursor (petting). Swirl emerges from pointer cross-product × speed.
- **Grooming memory** — on pointer-up, nearby strands record `groomOffset × easedFade(0→groomMemory)` so a comb stroke visibly lingers.
- **Wind** — directional bias + sinusoidal breeze per strand `sin(t*1.6 + phase)` + gust sinusoid; tunable `speed`, `direction` (0°=east), `gustiness`.
- **Breathing** — `1 + sin(t*0.35*2π)*0.035` global scale pulse on all strands; idle-only and frame-rate independent.
- **Gyroscope** — maps `gamma/90*8, beta/180*8` to gravity bias on every strand.
- **Multi-touch** — up to 4 simultaneous `pointerType !== mouse` points, each with velocity + radial + swirl.
- **Click shockwave** — radial Gaussian pulse `exp(-dist²/(2σ²)) * timeFade * strength` that rolls outward at `max(W,H)*0.6` radius.

All forces sum per strand before spring integration; strands render as two-segment quadratic Bezier curves via a coherent curl field (`glossField + tuft`) so the coat **flows**, not bristles.

---

## Performance

- **Pixel budget** — `effectiveDpr = min(nativeDpr, levelCap)` clamped by `sqrt(budget / cssPixels)` so 4K/ultrawide cannot blow fill rate.
- **Two-lever tuner** — `level` (resolution+budget+strand factor) vs `density` (strand count only). Fast path: if `drawAvg > 24ms`, jump 2 levels at once.
- **Self-healing** — `frameNo & 7 === 0` size check repairs missed `visualViewport`/`ResizeObserver` events within ~8 frames.
- **Idle zero-cost** — `IntersectionObserver` cancels `rAF` off-screen; `visibilitychange` pauses in background tabs.
- **Measured, not guessed** — tuner uses `performance.now()` wall-clock + draw-pass sub-timer to avoid degrading on compositor-bound frames.

---

## Studio Exports

```ts
const fur = createFur('#stage', { text: 'KRONOS' });

// PNG — up to 4K via offscreen upscale
const dataUrl = await fur.exportPNG({ scale: 2, transparent: false });
document.querySelector('img').src = dataUrl;
await fur.downloadPNG({ scale: 2, filename: 'kronos.png' });

// GIF — seamless loop via frame-ring encoder (no deps)
const blob = await fur.exportGIF({ duration: 2500, fps: 20 });
await fur.downloadGIF({ filename: 'kronos.gif' });

// React
import { Fur } from 'furjs';
const ref = useRef<FurRef>(null);
ref.current?.exportPNG({ scale: 2 });
```

GIFs use a JS LZW encoder with uniform-cube palette quantization; for production 4K GIFs swap in a wasm encoder without API break — the `GIFEncoder` class is the extension point.

---

## File Structure (as shipped)

```
dist/                 # ESM + CJS + .d.ts (via tsup)
src/
  core/ChamferMask.ts  # Offscreen glyph raster + chamfer distance field
  core/ColorRamp.ts    # 3-zone optical model + gradient/texture sampler
  core/Presets.ts      # Sable/Panther/Snow/Cashmere/Caracal/Fox/Velvet
  core/Physics.ts      # Springs, Bezier curls, wind, gravity, shockwaves
  core/QualityTuner.ts # Pixel budget + adaptive FPS throttler
  core/FurEngine.ts    # Canvas 2D render loop & lifecycle
  react/Fur.tsx        # SSR-safe React component ('use client')
  react/useFur.ts      # Custom hook
  utils/FontLoader.ts  # document.fonts.load detector
  utils/Exporters.ts   # PNG + GIF helpers
  index.ts             # Universal entry
bin/cli.mjs             # npx playground server
panther.js              # Original 1,140-line engine reference (kept for provenance)
SPECIFICATION_AND_PROMPT.md
```

---

## Development

```bash
npm install
npm run build        # tsup → dist/
npm run typecheck
npm run playground   # or npx furjs "HELLO"
```

The playground server is dependency-free — just `node bin/cli.mjs`.

---

## Design Notes — Relationship to `panther.js`

The original `panther.js` renders the word **"account"** as Black Panther fur with obsidian roots, Worley rosettes, and a studio wall backlight. This library:

- Promotes its chamfer distance transform + spring + curl math into typed modules,
- Preserves its self-healing resize + pixel-budget tuner verbatim (levels, budgets, `FT/AVG` windows),
- Generalizes the hardcoded `"account"` raster into `ChamferMask` for any text/font/weight/track/multi-line,
- Extracts its color ramp into `ColorRamp` with preset anchors so every luxury pelt reuses the same proven exposure curve,
- Keeps the Canvas 2D philosophy — **no WebGL, no physics libs**.

---

## License

MIT — see `LICENSE`. The `panther.js` reference engine is included for provenance under the same license.

**Copyright (c) 2026 thatonearyan**

## Author & Links

**Author:** thatonearyan <https://github.com/thatonearyan-sh>

- **GitHub Repo:** https://github.com/thatonearyan-sh/furjs
- **Git Remote:** `git@github.com:thatonearyan-sh/furjs.git`
- **Repository URL:** `git+https://github.com/thatonearyan-sh/furjs.git`
- **Bugs / Issues:** https://github.com/thatonearyan-sh/furjs/issues
- **Homepage:** https://github.com/thatonearyan-sh/furjs#readme
- **npm Username:** `thatanearyan` — packages `furjs` (`npm i furjs`) and `@thatanearyan/fur` (`npm i @thatanearyan/fur`)

> [@thatonearyan](https://github.com/thatonearyan-sh) — `furjs` / `@thatanearyan/fur` — 2026

