# Contributing to furjs

Thanks for helping make **furjs** the universal living-fur engine!

## Setup (2026)

```bash
git clone git@github.com:thatonearyan-sh/furjs.git
cd furjs
nvm use # 22
npm ci
npm run typecheck
npm run build
npm run test
npm run playground # npx furjs "ROYAL"
```

## Branching

- `main` is protected. All work on `feat/*`, `fix/*`, or `arena/*` branches.
- PR title: `feat: morph easing` / `fix: gyro leak` / `docs: readme`.
- One commit per logical change — squash before merge.

## Code Style

- **Pure Canvas2D, zero deps** — no WebGL/physics libs in `src/core`.
- TypeScript `strict`, `noEmitOnError: false` is not allowed to pass. Run `npm run typecheck`.
- Prettier `printWidth:100`, ESLint `eslint:recommended + @typescript-eslint`. Run `npm run lint` and `npm run format`.
- Keep `dist/` out of PRs — CI builds it. `files` in `package.json` whitelists `dist+bin+README`.

## Adding a Preset

1. Add entry to `src/core/Presets.ts` (anchors + `physics` + `glow` + `baseGradient`).
2. Add demo to `bin/cli.mjs` playground `PRESETS` + `PRESET_ORDER`.
3. Screenshot + luminance note (mobile 3×, desktop 17× backdrop).

## Physics / Performance PRs

- Preserve `panther.js` tuner math (`LEVELS`, `PIXEL_BUDGET`, `ftAcc/drawAcc`, `frameNo &7`). If you change thresholds, attach `performance.now()` traces on Moto G4 + MacBook + iPhone.
- New strands must reuse `Structure-of-Arrays` (no per-strand objects) — GC stalls at 12K strands.
- Worker changes need `node --check bin/cli.mjs` + Chrome DevTools Performance panel.

## Testing

```bash
npm test                # vitest (jsdom + canvas mock)
npm run test:watch
npm run test:coverage   # keep ≥80% on src/core
```

## Commits & Releases

- Conventional Commits. `npm version patch|minor|major` updates `CHANGELOG.md` (Keep a Changelog).
- Publish is automated: `main` → `.github/workflows/publish.yml` → `npm publish` (needs `NPM_TOKEN`).

## Issues

- Bugs: https://github.com/thatonearyan-sh/furjs/issues — include `text`, `font`, `W×H`, `devicePixelRatio`, `preset`, `level`, `fps`.
- Security: see `SECURITY.md` — do NOT open public issue for vulns.

## License

By contributing you agree your code is MIT-licensed as in `LICENSE` (© 2026 thatonearyan).

---

**Author:** thatonearyan <https://github.com/thatonearyan-sh> — https://github.com/thatonearyan-sh/furjs
