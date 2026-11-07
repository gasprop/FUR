# Security Policy — furjs

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅        |
| <1.0    | ❌        |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security bugs.**

1. Email **thatonearyan** via GitHub: https://github.com/thatonearyan-sh
   - Subject: `[SECURITY] furjs — <title>`
   - Include: affected `text`/`font`/`url` PoC, `furjs` version, `node`/`browser`, steps to reproduce.
2. You’ll get an acknowledgment within 48h. We aim to ship a fix within 14 days for critical (RCE/XSS) and 30 days for low severity.
3. Coordinated disclosure: please allow 90 days before public disclosure. We’ll credit you in `CHANGELOG.md` unless you opt out.

## Scope

- `src/core/*` (ChamferMask, FurEngine, MorphEngine, ChamferWorker)
- `src/utils/*` (Exporters, FontLoader)
- `bin/cli.mjs` playground server (static file serving, `__furjs_health`)
- Published tarball `furjs-*.tgz` (`npm pack --dry-run`)

Out of scope: DoS via intentionally abusive `text` length (>256) or `hairLength>5` — these are clamped by design (`slice(0,256)`, `0.2–5`).

## Security Guarantees

- **XSS:** `text` is never `innerHTML`’d in the library — only `canvas fillText`/`measureText`. Playground URL `?text=` is `encodeURIComponent` + `textContent` only.
- **CSRF/SSRF:** CLI server only serves `repoRoot` and blocks `.env`/`.git` paths.
- **Supply chain:** `dependencies:{}`, `sideEffects:false`, `package.json` `files:[dist,bin,README]`, Sigstore provenance on publish (see `.github/workflows/publish.yml`).

## Disclosure History

No CVEs to date. This policy is effective 2026-01-04.

---

**Author:** thatonearyan <https://github.com/thatonearyan-sh> — https://github.com/thatonearyan-sh/furjs
