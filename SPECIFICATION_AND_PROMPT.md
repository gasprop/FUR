# MISSION SPECIFICATION: FURJS (`furjs` & `@thatanearyan/fur`)
### The Universal Interactive Living Fur Typography Engine

---

## 1. Executive Summary & Vision
You are tasked with engineering **`furjs`** (also distributed as **`@thatanearyan/fur`**), a world-class, zero-dependency, open-source library that turns any text, font, glyph, or vector shape into a photorealistic, physics-driven, living fur canvas element.

The foundation is provided in `panther.js` (an original 1,140-line procedural Canvas 2D engine that renders the word "account" wearing real Black Panther fur using chamfer distance transforms, damped spring physics, Bezier curl fields, and Worley noise rosettes).

Your goal is to extract, generalize, modernize, and package this engine into a production-grade library with a **dual architecture** (Vanilla JS Core + React/Next.js Wrapper), an **infinite color/material pipeline** (focusing on luxury, photorealistic pelts and organic textiles—NO cheap glowing neons), and an **ultra-clean 1-line developer API**.

---

## 2. Source Files in Workspace
- `panther.js`: Core 1,140-line Canvas 2D procedural rendering loop and physics simulation. Study its distance transform, chamfer normal extraction, spring dynamics, and pixel-budget tuner.
- `PantherWord.tsx`: Existing React 19 component showing viewport intersection observation and canvas mounting.
- `panther-styles.css`: Existing responsive lockup rules and aspect ratio handling.

---

## 3. Architecture & Packaging Requirements

### A. Dual-Layer API
1. **Core Engine (Vanilla JS / Framework-Agnostic)**:
   - Zero dependencies. Runs on pure HTML5 Canvas 2D.
   - Usable anywhere: React, Next.js, Vue, Svelte, Nuxt, Astro, Webflow, Shopify, or plain HTML `<script>` tags.
   - API:
     ```ts
     import { createFur } from 'furjs';
     const instance = createFur('#canvas-container', { text: 'ROYAL', ...options });
     instance.update({ text: 'KRONOS' });
     instance.destroy();
     ```
2. **React / Next.js Component**:
   - SSR-safe (marked with `'use client'`).
   - Seamless compatibility with React 18 and React 19.
   - Auto-resizing via `ResizeObserver` with cleanup on unmount.
   - API:
     ```tsx
     import { Fur } from 'furjs';
     <Fur text="CHANDELIER" font="Playfair Display" preset="royal-sable" />
     ```

### B. Package Distribution & Config (`package.json`)
- Names: **`furjs`** / **`@thatanearyan/fur`**
- Dual ESM and CommonJS exports (`exports` map with `"import"` and `"require"`).
- Full TypeScript type definitions (`.d.ts`) included out-of-the-box with complete JSDoc comments.
- Tree-shakable, zero external runtime dependencies (`dependencies: {}`).
- Bundled size target: `< 30 KB` gzipped.

---

## 4. Deep Feature Specifications

### Feature 1: Universal Typography & Dynamic Masking Engine
The original `panther.js` was hardcoded to rasterize a fixed string. Generalize this into a dynamic off-screen raster mask generator:
- **Any Text & Multi-Line**: Accept any arbitrary string (`text: string`). Handle single words, multi-line headlines, numbers, and symbols.
- **Any Font Family**:
  - Accept any font family (`font: string`, e.g., `"Cinzel"`, `"Playfair Display"`, `"Inter"`, `"Times New Roman"`).
  - Built-in font loading detector: Ensure custom web fonts (Google Fonts, `@font-face`) are fully loaded via `document.fonts.load` before rasterizing the chamfer distance mask.
- **Typography Controls**:
  - `fontSize`: CSS clamp or numeric pixel value.
  - `fontWeight`: 100 to 900.
  - `letterSpacing`: Optical kerning expansion/compression.
- **Unicode & Multilingual**: Latin, Cyrillic, Devanagari (Hindi), Japanese Kanji, Arabic, and glyph symbols (✦, ★, 🐾).
- **SVG Path / Silhouette Support (Stretch Goal)**: Ability to pass an SVG path or custom off-screen canvas mask so company logos can wear fur.

### Feature 2: Infinite Color Pipeline & Haute Couture Materials
> [!IMPORTANT]
> **Aesthetic Directive**: Strictly avoid tacky neon/cyberpunk aesthetics. Focus on organic realism, luxury pelts, royal velvet, cashmere, and haute couture textiles.

Real biological fur consists of three optical zones. The engine must support:
1. **Root / Undercoat (`root`)**: Dark, dense, light-absorbing base providing volume and typographic legibility.
2. **Shaft / Body (`shaft`)**: The main pigment transition zone.
3. **Tip / Guard Hair (`tip`)**: Translucent, specular-catching outer hairs.
4. **Rim Catch (`rim`)**: Specular normal-mapped edge lighting.

#### Custom Palette Modes:
- **Direct Hex/RGB/HSL Object**:
  ```ts
  colors: {
    root: '#0d0907',
    shaft: '#382417',
    tip: '#c29b68',
    rim: '#f5eee6'
  }
  ```
- **Horizontal & Vertical Gradient Mapping**: Color smoothly transitions across the letters (e.g. espresso left to honey-blonde right).
- **Texture / Image Sampling**: Sample strand colors directly from an image URL or canvas pattern.

#### Built-in Photorealistic Presets:
1. **`black-panther`** (Default): Melanistic obsidian-black, subtle faint Worley rosettes, cold silver-blue rim catch.
2. **`royal-sable`**: Dense, deep dark chocolate brown with rich velvet sheen (the rarest fur in the world).
3. **`snow-leopard`**: Thick frosty silver-white undercoat, charcoal/slate spots, icy crystalline rim.
4. **`cashmere-cream`**: Ultra-soft, matte, cloud-like ivory/vanilla with airy, fluttering guard hairs.
5. **`desert-caracal`**: Warm sand and terracotta tawny coat with charcoal-tipped tufts.
6. **`silver-fox`**: Jet-black undercoat exploding into frosted platinum-silver hair tips.
7. **`imperial-velvet`**: Deep royal jewel tones (Midnight Sapphire, Emerald, Burgundy) with metallic micro-sheen.

### Feature 3: Kinetic "Living Fur" Physics Engine
Upgrade the spring-mass-damper simulation:
- **Damped Spring Physics**:
  - `stiffness`: Hair springiness.
  - `damping`: How fast hairs settle back to rest.
  - `mass`: Strand inertia.
- **Interaction Modes (`interactive`)**:
  - `'repel'` (default): Mouse/finger parts the fur outward like a comb.
  - `'attract'`: Fur reaches and leans toward the cursor like a cat leaning into a touch.
  - `'none'`: Display-only / ambient mode.
- **Velocity Dynamics**: Fast cursor swipes whip strands dramatically; slow dragging creates silky, wave-like ripples.
- **Grooming Memory**: When combed or brushed, the fur retains its parted state for a configurable duration (`groomMemory: 2000` ms) before slowly relaxing.
- **Ambient Breeze & Wind (`wind`)**:
  - `speed`: Wind velocity.
  - `direction`: 0° to 360° wind angle.
  - `gustiness`: Random coherent turbulence.
- **Breathing Idle Cycle (`breathing: boolean`)**:
  - When idle, text gently expands and contracts in a slow, rhythmic, animal-like breathing motion.
- **Mobile Gyroscope Support**:
  - On mobile devices with `DeviceOrientationEvent`, tilting the phone shifts the physical gravity vector of the fur strands in real time!
- **Touch & Multi-touch**:
  - Simultaneous multi-finger petting support on iPads and smartphones.
- **Click Shockwave**:
  - Clicking/tapping the canvas triggers a circular acoustic pressure wave rippling through the fur.

### Feature 4: Performance & Adaptive Quality Architecture
- **Chamfer Distance Transform**: Keep the distance transform optimized (run off-thread in a Web Worker or memoized during text/font changes).
- **Dynamic Pixel Budget & Auto-Tuning**:
  - Retain and refine `panther.js`'s self-healing frame monitor: measure actual render milliseconds per frame (`performance.now()`).
  - Automatically scale device pixel ratio and strand density up or down to guarantee a locked 60 FPS on everything from budget Android phones to 4K / ProMotion displays.
- **Intersection Observer**: Auto-pause `requestAnimationFrame` when the element is off-screen. Zero CPU/GPU drain when scrolled away.

### Feature 5: Studio Export Utilities
Provide programmatic utility methods on the instance:
- **`instance.exportPNG({ scale?: number, transparent?: boolean }): Promise<string>`**: Captures an ultra-high-resolution (up to 4K) transparent PNG snapshot of the current frame.
- **`instance.exportGIF({ duration?: number, fps?: number }): Promise<Blob>`**: Captures a seamless looping animation clip for social media banners or portfolio presentations.

### Feature 6: Interactive CLI Playground (`npx furjs`)
Add a `"bin"` executable in `package.json`:
- Running `npx furjs` or `npx @thatanearyan/fur [optional text]` in terminal starts a lightweight local server and opens a browser playground featuring:
  - Live interactive canvas.
  - UI sliders for hair length, density, presets, wind, and colors.
  - A **"Copy React Snippet"** / **"Copy Vanilla Code"** button.

---

## 5. Proposed File Structure
```text
furjs/
├── bin/
│   └── cli.mjs                  # npx playground server & CLI runner
├── src/
│   ├── core/
│   │   ├── ChamferMask.ts       # Offscreen glyph rasterization & distance field
│   │   ├── ColorRamp.ts         # 3-layer optical model & gradient sampler
│   │   ├── Presets.ts           # Sable, Panther, Snow Leopard, Cashmere, etc.
│   │   ├── Physics.ts           # Damped springs, Bezier curls, wind, gravity
│   │   ├── QualityTuner.ts      # Pixel budget & dynamic FPS throttler
│   │   └── FurEngine.ts         # Main Canvas 2D render loop & lifecycle
│   ├── react/
│   │   ├── Fur.tsx              # React component ('use client')
│   │   └── useFur.ts            # Custom React hook
│   ├── utils/
│   │   ├── FontLoader.ts        # Dynamic web font detector
│   │   └── Exporters.ts         # PNG & GIF export tools
│   └── index.ts                 # Main universal entry point
├── package.json                 # Configured for 'furjs' and '@thatanearyan/fur'
├── tsconfig.json
├── tsup.config.ts               # Bundler config (outputs ESM, CJS, and .d.ts)
└── README.md                    # Developer-facing documentation & examples
```

---

## 6. Execution Instructions for the AI
1. Thoroughly read `panther.js` to absorb the exact math (Worley cells, quadratic Bezier strand curvature, chamfer distance transform, damped spring physics).
2. Maintain the pure Canvas 2D philosophy: **Zero external 3D/physics dependencies**.
3. Implement clean, robust, defensive TypeScript code.
4. Export clear types and comprehensive documentation.
5. Provide complete, runnable code files without placeholders or `// TODO` shortcuts.
