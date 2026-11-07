# Changelog — furjs

All notable changes to `furjs` / `@thatanearyan/fur` will be documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-01-04

### Added
- **Core Engine (Vanilla JS, zero deps):** `createFur(container, options)` — pure Canvas2D, works in React/Vue/Svelte/Astro/Webflow/Shopify/plain `<script>` tags.
- **React Wrapper:** `<Fur>` (`'use client'`) + `useFur()` hook — SSR-safe, `ResizeObserver` + `IntersectionObserver` cleanup, React 18/19 compatible, `forwardRef` imperative handle.
- **Universal Typography & Masking:** any text/multi-line/unicode (Latin/Cyrillic/Devanagari/Kanji/Arabic/✦★🐾), any `font` via `document.fonts.load` with 3s timeout, `fontWeight 100-900`, `letterSpacing`, `fit:'tight'|'normal'`, `svgPath` & `customMask` silhouettes.
- **3-Zone Optical Model:** `root/shaft/tip/rim` + 14 tapered bands (`1.42→0.57`), 7 luxury presets (black-panther, royal-sable, snow-leopard, cashmere-cream, desert-caracal, silver-fox, imperial-velvet), direct `colors:{root,shaft,tip,rim}`, `gradient:{direction,colors}`, `texture` (URL/canvas) sampling.
- **Living Physics:** damped springs (`stiffness/damping/mass`), `interactive:'repel'|'attract'|'none'`, velocity swirl, `groomMemory`, `wind:{speed,direction,gustiness}`, `breathing`, `DeviceOrientation` gyro, multi-touch (4), click shockwave (Gaussian), Bezier curl + Worley rosettes.
- **Performance:** chamfer memoized/off-thread via `ChamferWorker` (transferable buffers), pixel-budget `effectiveDpr` (`0.44/0.52/0.62` floor), dual-lever auto-tuner (`level`+`density`, fast-path 2-level jump), `IntersectionObserver` pause, `ResizeObserver`+`visualViewport`, self-heal `frameNo &7`.
- **Studio Exports:** `exportPNG({scale,transparent})` up to 4K, `exportGIF({duration,fps})` (256-cube LZW, Netscape loop), `download*` helpers.
- **Morph + Scroll (Killer Feature):** `morph(text,{duration,easing})` with `fur-spring` FLIP lerp, `linkToScroll({target,scrubsMorph,windLink})`, `generateStaticFallback()` for SSR/CWV.
- **CLI Playground:** `npx furjs [text] --port=3474` — live sliders (text/font/weight/track/hair/density/interactive/wind/breathing), 7 presets, custom colors, React/Vanilla snippet copy, PNG/GIF export, share URL, health endpoint `__furjs_health`.
- **Packaging:** dual ESM/CJS (`exports` map), `.d.ts` with JSDoc, tree-shakable, `sideEffects:false`, `<30KB` gzipped (21.8→26KB), `bin: {furjs,fur}`, zero runtime `dependencies`, optional `peer:react>=18`.
- **Docs:** full `README.md` (install/vanilla/react/typography/color/physics/performance/exports/dev/panther.js notes), `LICENSE` MIT 2026, `SPECIFICATION_AND_PROMPT.md` provenance.

### Provenance
- Built from `panther.js` (1,140 LOC) — chamfer D1/D2, spring `kk/damp`, curl field, rosettes, glow, tuner preserved verbatim and generalized.

### Author
- thatonearyan <https://github.com/thatonearyan-sh> — GitHub: https://github.com/thatonearyan-sh/furjs — npm: thatanearyan — `git@github.com:thatonearyan-sh/furjs.git` — `git+https://github.com/thatonearyan-sh/furjs.git`

---

## [Unreleased]

### Planned (v1.1)
- Vitest + canvas mock + pixel snapshots, ESLint+Prettier, GitHub Actions CI/publish.
- `headless` SSR `node-canvas` adapter for `/_og` image generation.
- Figma plugin.

[1.0.0]: https://github.com/thatonearyan-sh/furjs/releases/tag/v1.0.0
[Unreleased]: https://github.com/thatonearyan-sh/furjs/compare/v1.0.0...HEAD
