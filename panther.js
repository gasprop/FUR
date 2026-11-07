/* ============================================================================
   BLACK PANTHER TYPE  ·  the word "account", wearing real black panther fur
   ----------------------------------------------------------------------------
   No libraries, no WebGL — plain Canvas 2D, one file, works offline.

   How it works
     1. The word is rasterised to a hidden mask, then a chamfer distance
        transform gives every glyph pixel the direction to its nearest
        outside edge. Strands grow along that direction, so fur combs
        outward from the stroke edge like real hair.
     2. Strand roots are sampled from the mask (spacing follows the device
        budget). Each strand gets a length (undercoat vs. guard hair), a
        comb angle and a colour taken from a pre-built ramp (root → tip).
     3. Per frame each strand is a damped spring: ambient breeze + a
        radial push and tangential swirl around every live pointer, with
        capped bend so the word stays legible. Each hair is drawn as a
        gently curved 2-segment strand (midpoint evaluated on a quadratic
        Bezier bent by a coherent curl field), so the coat flows instead of
        bristling — for the same cost as straight hairs. Strands are batched
        into one Path2D per colour band, so a fur coat costs ~2 ms of JS.
     4. Quality auto-tunes: real frame times are measured and the canvas
        resolution + strand count step down (or back up) on their own.
   ----------------------------------------------------------------------------
   This build is the melanistic-panther coat: short dense glossy hairs, cool
   blue-black roots, and a silver-blue rim light that only lands on the lit
   side of each tuft (rim uses the un-bent geometric normal, then a tuft
   field breaks it up so the edge doesn't read as a neon outline). Rosettes
   from a cheap Worley-cell ring are buried in the coat: they dull the sheen
   in rings, which is how the spots survive on a real black panther.

   RESPONSIVENESS (every screen, every browser)
     * The canvas backing store, its CSS box and the coat are re-derived from
       visualViewport/innerWidth on every size change — coalesced into one
       rAF, with a ResizeObserver watch and a self-healing check every 8th
       frame. A missed event (mobile browsers drop them) fixes itself.
     * Sizes are clamped to >=80px and the CSS box is written explicitly, so a
       collapsed container can never bake a 1px coat and stretch it.
     * A PIXEL_BUDGET caps backing-store pixels per quality level, and the
       tuner has two independent levers (resolution/pixel budget and strand
       density), with a fast path that drops 1-2 levels when a device is
       clearly choking. Nothing can run away on a 4K or ultrawide panel.
     * Fur size comes from the letterform (a fraction of the widest stem), so
       the same animal appears at 320px and at 2560px. Small screens get a
       denser, shorter, thicker coat plus a stronger backlight halo, because
       a physically small screen needs more contrast to read the same fur.
     * visualViewport scroll/resize, orientationchange, pageshow, ResizeObserver
       and devicePixelRatio changes are all handled.

   Exposure was tuned by measuring rendered pixel luminance, not by eye:
   the phone build sits ~3x above backdrop luminance, desktop ~17x, so the
   black cat still holds its shape on a small dark screen.

   Tweaks: TEXT (word), FONT, TRACK (letter-spacing), baseLen / furW (hair),
   LEVELS (quality ladder), palette colours in buildPalette().
   ========================================================================== */
/* Mounted inside the landing page: the coat lives in a band, not the whole
   window, so the size comes from the host element. Everything else is the
   original engine. */
window.__mountPantherFur = function (root) {
  'use strict';

  var canvas = root.querySelector('canvas');
  if (!canvas) return null;
  var ctx = canvas.getContext('2d', { alpha: true });
  var hint = root.querySelector('.panther-hint');

  var maskCanvas = document.createElement('canvas');
  var mctx = maskCanvas.getContext('2d', { willReadFrequently: true });
  var baseCanvas = document.createElement('canvas');
  var bctx = baseCanvas.getContext('2d');

  var TEXT = (root.getAttribute('data-text') || 'account').slice(0, 24);
  var FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  /* ---------------------------------------------------------------
     fur colour ramp: dark root -> warm mid -> pale tip
  --------------------------------------------------------------- */
  var NB = 14;
  var palette = new Array(NB);
  var widths = new Float32Array(NB);
  (function buildPalette() {
    var dark = [7, 8, 13], mid = [42, 49, 62], light = [214, 227, 245];
    function mix(a, b, t) {
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
    for (var i = 0; i < NB; i++) {
      var t = i / (NB - 1), c;
      /* 0.00-0.45 deep black, 0.45-0.70 cool charcoal, 0.70-1.00 silver flash */
      if (t < 0.45) c = mix(dark, mid, t / 0.45);
      else if (t < 0.70) c = mix(mid, [94, 110, 136], (t - 0.45) / 0.25);
      else c = mix([94, 110, 136], light, Math.pow((t - 0.70) / 0.30, 0.8));
      palette[i] = 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
      widths[i] = 1.42 - 0.85 * t;
    }
  })();

  /* ---------------------------------------------------------------
     state
  --------------------------------------------------------------- */
  var W = 1, H = 1, DPR = 1, MS = 0.5;
  var lastW = 0, lastH = 0;         // last viewport the coat was built for
  var glowCanvas = document.createElement('canvas');
  var gctx = glowCanvas.getContext('2d');
  var glyphHalfStroke = 4;          // half the thickest stem, in mask px
  var legibility = 0;               // 0 desktop .. ~0.55 tiny screen
  var glowStrength = 0.62;
  var MW = 1, MH = 1;
  var ALPHA = null;            // mask alpha channel
  var fontSizeCSS = 120;
  var baseLen = 12;            // fur strand length (css px)
  var furW = 1;                // strand thickness scale
  var N = 0;                   // strand count

  var PX, PY, UX, UY, LEN, PH, AMP, RI, TI, BX, BY, VX, VY, CURL;

  var AXP = new Float32Array(4), AYP = new Float32Array(4);
  var AVX = new Float32Array(4), AVY = new Float32Array(4);
  var AA = new Float32Array(4);
  var AP = 0;                  // active influence points this frame

  /* quality levels: resolution cap + strand budget. The auto-tuner walks
     down this list on slow devices and back up when there is headroom. */
  var LEVELS = [
    { dpr: 1.75, strands: 1.00 },
    { dpr: 1.45, strands: 0.88 },
    { dpr: 1.20, strands: 0.74 },
    { dpr: 1.00, strands: 0.60 },
    { dpr: 0.85, strands: 0.46 }
  ];
  /* hard ceiling on backing-store pixels per quality level. Rasterisation cost
     is proportional to this, so no phone, tablet, 4K monitor or ultrawide can
     ever push the fill rate past what the device can sustain. */
  var PIXEL_BUDGET = [2600000, 2000000, 1500000, 1100000, 780000];

  var level = 0;
  var density = 1;                  /* second tuner axis: strand count only */
  var samples = 0;
  var baseStrands = 12000;
  var lastChange = 0;

  var coarse = false;
  try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
  var cores = navigator.hardwareConcurrency || 4;
  var reduceMotion = false;
  try {
    var rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion = rmq.matches;
    var onRM = function (e) { reduceMotion = e.matches; };
    if (rmq.addEventListener) rmq.addEventListener('change', onRM);
    else if (rmq.addListener) rmq.addListener(onRM);
  } catch (e) {}

  baseStrands = coarse ? 6000 : 16500;
  if (cores <= 4) baseStrands *= 0.78;

  /* ---------------------------------------------------------------
     pointer
  --------------------------------------------------------------- */
  var rect = { left: 0, top: 0 };
  var MAX_TOUCH = 3;           /* extra fingers on top of the mouse */
  var pts = [];                /* live influence points */
  var mousePt = null;

  function makePoint(clientX, clientY, strength, isTouch, id) {
    var nx = clientX - rect.left, ny = clientY - rect.top;
    return {
      id: id, touch: !!isTouch,
      x: nx, y: ny, tx: nx, ty: ny,
      vx: 0, vy: 0,
      act: 0, want: strength, seen: false
    };
  }

  function findPoint(id) {
    for (var i = 0; i < pts.length; i++) if (pts[i].id === id) return pts[i];
    return null;
  }

  function movePoint(p, clientX, clientY, strength) {
    var nx = clientX - rect.left, ny = clientY - rect.top;
    if (!p.seen) { p.x = nx; p.y = ny; p.seen = true; }
    var dvx = nx - p.tx, dvy = ny - p.ty;
    if (Math.abs(dvx) > 90) dvx = 90 * Math.sign(dvx);
    if (Math.abs(dvy) > 90) dvy = 90 * Math.sign(dvy);
    p.vx = dvx; p.vy = dvy;
    p.tx = nx; p.ty = ny;
    p.want = strength;
    if (hint) hint.style.opacity = '0';
  }

  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      if (!mousePt) { mousePt = makePoint(e.clientX, e.clientY, 1, false, 'mouse'); pts.push(mousePt); }
      movePoint(mousePt, e.clientX, e.clientY, 1);
    } else {
      var t = findPoint(e.pointerId);
      if (!t) {
        if (pts.length > MAX_TOUCH) return;
        t = makePoint(e.clientX, e.clientY, 1.25, true, e.pointerId);
        pts.push(t);
      }
      movePoint(t, e.clientX, e.clientY, 1.25);
    }
  }, { passive: true });

  canvas.addEventListener('pointerdown', function (e) {
    var strength = e.pointerType === 'mouse' ? 1.4 : 1.3;
    var p = findPoint(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') {
        if (!mousePt) { mousePt = makePoint(e.clientX, e.clientY, strength, false, 'mouse'); pts.push(mousePt); }
        p = mousePt;
      } else {
        if (pts.length > MAX_TOUCH) return;
        p = makePoint(e.clientX, e.clientY, strength, true, e.pointerId);
        pts.push(p);
      }
    }
    movePoint(p, e.clientX, e.clientY, strength);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  }, { passive: true });

  function endPointer(e) {
    var p = findPoint(e.pointerId);
    if (!p) return;
    if (p.touch) p.want = 0;
    else p.want = 1;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
  }

  canvas.addEventListener('pointerup', endPointer, { passive: true });
  canvas.addEventListener('pointercancel', endPointer, { passive: true });
  canvas.addEventListener('pointerleave', function (e) {
    if (mousePt && e.pointerType === 'mouse') mousePt.want = 0;
  }, { passive: true });

  window.addEventListener('blur', function () {
    for (var i = 0; i < pts.length; i++) pts[i].want = 0;
  });

  /* ---------------------------------------------------------------
     layout / text mask
  --------------------------------------------------------------- */
  /* Measure the *real* drawable area. visualViewport is the only reliable
     source on mobile (address bar, pinch zoom, split screen); the client*
     fallbacks cover old browsers. Never returns 0 — a collapsed iframe or a
     hidden panel would otherwise bake a 1px coat and stretch it. */
  function measureViewport() {
    /* The band is the viewport for this coat. clientWidth/Height carry the CSS
       height exactly, and getBoundingClientRect catches sub-pixel columns. */
    var r = canvas.getBoundingClientRect();
    var w = Math.round(r.width || canvas.clientWidth || 0);
    var h = Math.round(r.height || canvas.clientHeight || 0);
    if (!(w > 0)) w = Math.round(canvas.clientWidth) || 320;
    if (!(h > 0)) h = Math.round(canvas.clientHeight) || 320;
    return { w: w, h: h, dpr: window.devicePixelRatio || 1 };
  }

  /* raw device pixel ratio -> the dpr we can actually afford to paint */
  function effectiveDpr(w, h, rawDpr) {
    var d = Math.min(rawDpr || 1, LEVELS[level].dpr);
    var cssPx = Math.max(1, w * h);
    var budget = PIXEL_BUDGET[level];
    var maxDpr = Math.sqrt(budget / cssPx);
    if (d > maxDpr) d = maxDpr;
    /* Floor keeps text from dissolving — but it has to give way on very large
       viewports, where the budget (not the floor) is what protects the frame
       rate. Big CSS pixels can take a little more upscaling. */
    var floor = cssPx > 3000000 ? 0.44 : (cssPx > 1500000 ? 0.52 : 0.62);
    if (d < floor) d = floor;
    if (d > 3) d = 3;
    return d;
  }

  function layout(w, h, rawDpr) {
    /* Hosts that put the word in a lockup legitimately use short boxes; the
       floor only has to stop a collapsed container from baking a 1px coat. */
    W = Math.max(40, w | 0);
    H = Math.max(40, h | 0);

    DPR = effectiveDpr(W, H, rawDpr);

    /* CSS box and backing store in lock-step: the band sets 100% x 100%, so
       the measured W/H are already the CSS box. */
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    rect = canvas.getBoundingClientRect();

    buildMask();
    buildBase();
    try { buildGlow(); } catch (e) { glowCanvas.width = 0; }
    buildStrands(true);

    /* repaint inside this same task: no blank or stretched frame is ever
       painted while the new coat is being built */
    renderFrame(1);
  }

  /* Rebuild only when the size or the pixel cap actually changed. Called from
     resize/orientation/visualViewport/ResizeObserver AND periodically from the
     animation loop, so a missed event self-heals on the next few frames. */
  function syncSize(force) {
    var m = measureViewport();
    var cap = effectiveDpr(m.w, m.h, m.dpr);
    if (!force && m.w === lastW && m.h === lastH && Math.abs(cap - DPR) < 0.02) return false;
    lastW = m.w; lastH = m.h;
    layout(m.w, m.h, m.dpr);
    return true;
  }

  var TRACK = 0.025;   /* letter-spacing, as a fraction of the font size */

  function measureGlyphs(c, fs, track) {
    var tk = (track === undefined) ? TRACK : track;
    c.font = '900 ' + fs + 'px ' + FONT;
    var ws = [], total = 0, sp = fs * tk, i;
    for (i = 0; i < TEXT.length; i++) {
      var w = c.measureText(TEXT[i]).width;
      ws.push(w); total += w;
    }
    total += sp * (TEXT.length - 1);
    return { ws: ws, total: total, sp: sp };
  }

  function drawGlyphs(c, fs, cx, baselineY) {
    var m = measureGlyphs(c, fs);
    var x = cx - m.total * 0.5;
    var prevAlign = c.textAlign;
    c.textAlign = 'left';
    for (var i = 0; i < TEXT.length; i++) {
      c.fillText(TEXT[i], x, baselineY);
      x += m.ws[i] + m.sp;
    }
    c.textAlign = prevAlign;
    return m;
  }

  function fitFontSize() {
    /* In the landing-page lockup the canvas box is meant to hug the word, so
       the host can align it against the typeset half of the name. */
    var tight = root.getAttribute('data-fit') === 'tight';
    var maxW = W * (tight ? 0.99 : (W < 620 ? 0.86 : 0.91));
    var maxH = tight ? H * 0.9 : Math.min(H * 0.62, W * 0.46);

    TRACK = 0.025;
    var m = measureGlyphs(mctx, 100, 0.025);
    var fs = Math.min(maxW * 100 / (m.total || 430), maxH);

    /* on narrow screens tracking costs too much size: tighten to grow the letters */
    var loose = measureGlyphs(mctx, 100, 0);
    var fsTight = Math.min(maxW * 100 / (loose.total || 430), maxH);
    if (fsTight > fs * 1.12) {
      TRACK = 0.006;
      fs = Math.min(maxW * 100 / (measureGlyphs(mctx, 100, 0.006).total || 430), maxH);
    }
    return Math.max(14, fs);
  }

  function buildMask() {
    MS = Math.min(0.5, 1100 / W);
    if (MS < 0.22) MS = 0.22;

    MW = Math.max(4, Math.round(W * MS));
    MH = Math.max(4, Math.round(H * MS));
    maskCanvas.width = MW;
    maskCanvas.height = MH;

    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, MW, MH);
    mctx.fillStyle = '#fff';
    mctx.textAlign = 'center';
    mctx.textBaseline = 'alphabetic';

    fontSizeCSS = fitFontSize();

    var fs = fontSizeCSS * MS;
    mctx.font = '900 ' + fs + 'px ' + FONT;

    var mt = mctx.measureText(TEXT);
    var asc = mt.actualBoundingBoxAscent || fs * 0.72;
    var desc = mt.actualBoundingBoxDescent || fs * 0.02;
    var baselineY = MH * 0.5 + (asc - desc) * 0.5;

    drawGlyphs(mctx, fs, MW * 0.5, baselineY);

    var img = mctx.getImageData(0, 0, MW, MH).data;
    ALPHA = new Uint8Array(MW * MH);
    for (var i = 0, p = 3; i < ALPHA.length; i++, p += 4) ALPHA[i] = img[p];

    buildEdgeField();

    /* Fur is measured against the letterform itself, not the screen: the coat
       is a fraction of the stroke width, so a 90px word on a phone and a 300px
       word on a monitor are the same animal. */
    var halfStroke = (glyphHalfStroke > 0 ? glyphHalfStroke : 4) / MS;   /* css px */
    baseLen = Math.max(4.4, Math.min(17, halfStroke * 0.58));

    /* Small screens are physically small: push hair length, hair thickness and
       the amount of sheen up a little so the coat stays legible at 320-480px.
       This is the fix for "I can't see it on my phone". */
    legibility = 1 - Math.min(W, H) / 900;
    if (legibility < 0) legibility = 0;
    if (legibility > 0.55) legibility = 0.55;

    baseLen *= 1 - legibility * 0.16;

    var wsc = Math.pow(fontSizeCSS / 240, 0.55);
    furW = (wsc < 0.72 ? 0.72 : (wsc > 1.2 ? 1.2 : wsc));
    furW *= 1 + legibility * 0.72;

    /* how hard the backlight behind the word is pushed */
    glowStrength = 0.30 + legibility * 0.75;
  }

  /* Chamfer distance transform: for every glyph pixel, the vector to the
     nearest pixel OUTSIDE the glyph. Fur grows along it, so strands comb
     outward from the stroke edge instead of fanning from the middle. */
  var NDX = null, NDY = null;

  function buildEdgeField() {
    var n = MW * MH;
    var dist = new Float32Array(n);
    var vx = new Float32Array(n);
    var vy = new Float32Array(n);
    var INF = 1e9, i, x, y;

    for (i = 0; i < n; i++) {
      if (ALPHA[i] > 128) { dist[i] = INF; vx[i] = 0; vy[i] = 0; }
      else { dist[i] = 0; vx[i] = 0; vy[i] = 0; }
    }

    var D1 = 1, D2 = 1.41421356;

    /* forward */
    for (y = 0; y < MH; y++) {
      for (x = 0; x < MW; x++) {
        i = y * MW + x;
        if (dist[i] === 0) continue;
        var best = dist[i], bx = vx[i], by = vy[i];
        if (x > 0) {
          var j = i - 1;
          var d = dist[j] + D1;
          if (d < best) { best = d; bx = vx[j] - 1; by = vy[j]; }
          if (y > 0) {
            j = i - MW - 1; d = dist[j] + D2;
            if (d < best) { best = d; bx = vx[j] - 1; by = vy[j] - 1; }
          }
        }
        if (y > 0) {
          var j2 = i - MW;
          var d2b = dist[j2] + D1;
          if (d2b < best) { best = d2b; bx = vx[j2]; by = vy[j2] - 1; }
          if (x < MW - 1) {
            j2 = i - MW + 1; d2b = dist[j2] + D2;
            if (d2b < best) { best = d2b; bx = vx[j2] + 1; by = vy[j2] - 1; }
          }
        }
        dist[i] = best; vx[i] = bx; vy[i] = by;
      }
    }

    /* backward */
    for (y = MH - 1; y >= 0; y--) {
      for (x = MW - 1; x >= 0; x--) {
        i = y * MW + x;
        if (dist[i] === 0) continue;
        var best2 = dist[i], bx2 = vx[i], by2 = vy[i];
        if (x < MW - 1) {
          var j3 = i + 1;
          var d3 = dist[j3] + D1;
          if (d3 < best2) { best2 = d3; bx2 = vx[j3] + 1; by2 = vy[j3]; }
          if (y < MH - 1) {
            j3 = i + MW + 1; d3 = dist[j3] + D2;
            if (d3 < best2) { best2 = d3; bx2 = vx[j3] + 1; by2 = vy[j3] + 1; }
          }
        }
        if (y < MH - 1) {
          var j4 = i + MW;
          var d4 = dist[j4] + D1;
          if (d4 < best2) { best2 = d4; bx2 = vx[j4]; by2 = vy[j4] + 1; }
          if (x > 0) {
            j4 = i + MW - 1; d4 = dist[j4] + D2;
            if (d4 < best2) { best2 = d4; bx2 = vx[j4] - 1; by2 = vy[j4] + 1; }
          }
        }
        dist[i] = best2; vx[i] = bx2; vy[i] = by2;
      }
    }

    NDX = vx; NDY = vy;

    /* widest stem in the mask — the unit the coat is scaled from */
    var mx = 0;
    for (i = 0; i < n; i++) if (ALPHA[i] > 128 && dist[i] > mx && dist[i] < INF * 0.5) mx = dist[i];
    glyphHalfStroke = mx > 0 ? mx : 4;
  }

  function buildBase() {
    baseCanvas.width = canvas.width;
    baseCanvas.height = canvas.height;
    bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    bctx.clearRect(0, 0, W, H);
    bctx.textAlign = 'center';
    bctx.textBaseline = 'alphabetic';
    bctx.font = '900 ' + fontSizeCSS + 'px ' + FONT;

    var m = bctx.measureText(TEXT);
    var asc = m.actualBoundingBoxAscent || fontSizeCSS * 0.72;
    var desc = m.actualBoundingBoxDescent || fontSizeCSS * 0.02;
    var baselineY = H * 0.5 + (asc - desc) * 0.5;

    var g = bctx.createLinearGradient(0, baselineY - asc, 0, baselineY + desc);
    g.addColorStop(0, '#151a22');
    g.addColorStop(0.4, '#0a0d12');
    g.addColorStop(1, '#020305');
    bctx.fillStyle = g;
    drawGlyphs(bctx, fontSizeCSS, W * 0.5, baselineY);
  }

  /* ---------------------------------------------------------------
     backlight: a black cat needs a lit wall behind it. The silhouette is
     rendered once into a tiny canvas and blown back up with smoothing, which
     is a cheap, portable blur (works even where ctx.filter is unsupported).
     Drawn behind the coat every frame — one drawImage, no per-frame cost.
  --------------------------------------------------------------- */
  function buildGlow() {
    /* stage 1: the silhouette, tiny */
    var t1w = Math.max(4, Math.round(W * 0.06));
    var t1h = Math.max(4, Math.round(H * 0.06));
    var c1 = document.createElement('canvas');
    c1.width = t1w; c1.height = t1h;
    var x1 = c1.getContext('2d');
    x1.setTransform(t1w / W, 0, 0, t1h / H, 0, 0);
    x1.textAlign = 'center';
    x1.textBaseline = 'alphabetic';
    x1.font = '900 ' + fontSizeCSS + 'px ' + FONT;
    x1.fillStyle = '#fff';
    var m = x1.measureText(TEXT);
    var asc = m.actualBoundingBoxAscent || fontSizeCSS * 0.72;
    var desc = m.actualBoundingBoxDescent || fontSizeCSS * 0.02;
    drawGlyphs(x1, fontSizeCSS, W * 0.5, H * 0.5 + (asc - desc) * 0.5);

    /* stage 2: upsample twice — two bilinear passes give a far smoother
       falloff than one, and it needs no ctx.filter (Safari <16 lacks it) */
    var t2w = Math.max(8, Math.round(W * 0.16));
    var t2h = Math.max(8, Math.round(H * 0.16));
    var c2 = document.createElement('canvas');
    c2.width = t2w; c2.height = t2h;
    var x2 = c2.getContext('2d');
    x2.imageSmoothingEnabled = true;
    x2.imageSmoothingQuality = 'high';
    x2.drawImage(c1, 0, 0, t2w, t2h);

    glowCanvas.width = Math.max(8, Math.round(W * 0.34));
    glowCanvas.height = Math.max(8, Math.round(H * 0.34));
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
    gctx.globalCompositeOperation = 'source-over';
    gctx.imageSmoothingEnabled = true;
    gctx.imageSmoothingQuality = 'high';

    /* three soft passes, biggest first */
    var layers = [[1.72, 0.15], [1.24, 0.26], [0.94, 0.55]];
    for (var i = 0; i < layers.length; i++) {
      var k = layers[i][0], a = layers[i][1];
      var w = glowCanvas.width * k, h = glowCanvas.height * k;
      gctx.globalAlpha = a;
      gctx.drawImage(c2, (glowCanvas.width - w) * 0.5, (glowCanvas.height - h) * 0.5, w, h);
    }
    gctx.globalAlpha = 1;

    /* cool studio gel */
    gctx.globalCompositeOperation = 'source-in';
    gctx.fillStyle = '#a8c6f0';
    gctx.fillRect(0, 0, glowCanvas.width, glowCanvas.height);

    /* elliptical falloff: kills the rectangular edge of the glow canvas */
    gctx.globalCompositeOperation = 'destination-in';
    var rg = gctx.createRadialGradient(
      glowCanvas.width * 0.5, glowCanvas.height * 0.5, 0,
      glowCanvas.width * 0.5, glowCanvas.height * 0.5,
      Math.max(glowCanvas.width, glowCanvas.height) * 0.52
    );
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.55, 'rgba(255,255,255,0.85)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    gctx.fillStyle = rg;
    gctx.fillRect(0, 0, glowCanvas.width, glowCanvas.height);

    gctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------------------------------------------------------
     rosettes: melanistic cats still carry the spot pattern under the black.
     A cheap Worley-cell ring, evaluated once per strand at build time.
  --------------------------------------------------------------- */
  function hash2(ix, iy) {
    var n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  var ROS = 24;                 /* rosette cell size, in mask pixels */
  var rosetteOut = { ring: 0, core: 0 };

  function rosetteAt(x, y) {
    var gx = Math.floor(x / ROS), gy = Math.floor(y / ROS);
    var f1 = 1e9, r = ROS * 0.33, i, j;
    for (j = -1; j <= 1; j++) {
      for (i = -1; i <= 1; i++) {
        var cxg = gx + i, cyg = gy + j;
        var ox = (cxg + 0.15 + 0.7 * hash2(cxg, cyg)) * ROS;
        var oy = (cyg + 0.15 + 0.7 * hash2(cxg + 7.3, cyg + 3.1)) * ROS;
        var dx = ox - x, dy = oy - y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) {
          f1 = d;
          r = ROS * (0.26 + 0.18 * hash2(cxg + 13.7, cyg + 5.9));
        }
      }
    }
    var band = (f1 - r) / (ROS * 0.15);
    var ring = 1 - band * band;
    if (ring < 0) ring = 0;
    var core = 1 - (f1 * f1) / (r * r);
    if (core < 0) core = 0;
    rosetteOut.ring = ring;
    rosetteOut.core = core;
  }

  /* ---------------------------------------------------------------
     strand generation (roots sampled from the glyph mask)
  --------------------------------------------------------------- */
  function buildStrands(full) {
    if (!ALPHA) return;

    var area = 0, i;
    for (i = 0; i < ALPHA.length; i++) if (ALPHA[i] > 128) area++;
    if (area < 24) { N = 0; return; }

    var target = Math.max(280, Math.round(baseStrands * LEVELS[level].strands * (1 + legibility * 0.85) * density));
    var step = Math.sqrt(area / target);
    if (step < 1.18 - legibility * 0.28) step = 1.18 - legibility * 0.28;
    if (step > 26) step = 26;

    var toCss = 1 / MS;
    var lx = -0.55, ly = -0.835;              // light from top-left

    var xs = [], ys = [], uxs = [], uys = [], lns = [], phs = [], amps = [], ris = [], tis = [], cls = [];

    for (var y = step * 0.5; y < MH; y += step) {
      for (var x = step * 0.5; x < MW; x += step) {
        var jx = x + (Math.random() - 0.5) * step;
        var jy = y + (Math.random() - 0.5) * step;
        var ix = jx | 0, iy = jy | 0;
        if (ix < 1 || iy < 1 || ix >= MW - 1 || iy >= MH - 1) continue;

        var idx = iy * MW + ix;
        if (ALPHA[idx] < 145) continue;

        /* outward direction = toward nearest background pixel */
        var dx = NDX[idx], dy = NDY[idx];
        var mag = Math.sqrt(dx * dx + dy * dy);
        if (mag < 0.0001) continue;
        dx /= mag; dy /= mag;

        /* comb noise: two smooth fields bend neighbouring strands together,
           which is what makes fur look like fur and not like a hairbrush */
        /* geometric outward normal, kept for the rim light (before the comb
           bend): hair on the up-left edge of a stroke catches the key light,
           hair on the down-right edge stays black — exactly how a glossy
           black coat behaves under a rim light */
        var nX = dx, nY = dy;

        var bend = Math.sin(jx * 0.055 + jy * 0.031) * 0.40 +
                   Math.sin(jx * 0.145 - jy * 0.115 + 1.7) * 0.22 +
                   (Math.random() - 0.5) * 0.36 * (1 - legibility * 0.5);
        var ang = Math.atan2(dy, dx) + bend;
        var c = Math.cos(ang), s = Math.sin(ang);

        /* clumping: low-frequency length variation */
        var hv = Math.sin(jx * 0.17) * Math.sin(jy * 0.21) * 0.5 + Math.sin(jx * 0.061 + jy * 0.09) * 0.5;
        /* undercoat (short, dense) + guard hairs (long, sparse) */
        var guard = Math.random();
        var lenMul = guard > 0.93
          ? 0.86 + Math.random() * 0.16 + hv * 0.08
          : 0.52 + Math.random() * 0.40 + hv * 0.12;
        if (glossy) lenMul *= 0.62;          /* silver only on the short tips */
        if (lenMul < 0.20) lenMul = 0.20;
        var len = baseLen * lenMul;

        /* Melanistic coat: the body stays black; only tufts angled into the
           key light catch a hard silver-blue specular. Sparse, bright flashes
           are what make a black cat read as glossy fur and not grey fuzz. */
        var lightDot = nX * lx + nY * ly;      /* key light, up-left */
        var lit = lightDot > 0 ? lightDot : 0;
        var fillDot = -(nX * lx + nY * ly);    /* weak bounce, down-right */
        var fill = fillDot > 0 ? fillDot * 0.30 : 0;

        /* the sheen is coherent: neighbouring hairs light up together along the
           crests of the coat, which is how a real black cat's gloss reads —
           isolated bright hairs would look like glitter, not fur */
        var glossField = 0.45 +
          0.34 * Math.sin(jx * 0.042 + jy * 0.026) +
          0.21 * Math.sin(jx * 0.115 - jy * 0.083 + 2.1);
        if (glossField < 0.06) glossField = 0.06;

        /* break the rim into tufts: the edge should not read as a neon outline */
        var tuft = 0.35 + 0.65 * glossField;
        var glossChance = Math.pow(lit, 1.5) * glossField * 0.95 * tuft;
        var glossy = Math.random() < glossChance;

        /* body: near-black, brightening only toward the lit edge */
        rosetteAt(jx, jy);
        var bodyT = 1.0 + Math.random() * 2.0 +
                    Math.pow(lit, 1.55) * 3.3 * (0.45 + 0.55 * tuft) +
                    fill * 1.7;
        bodyT *= (1 - rosetteOut.ring * 0.50 + rosetteOut.core * 0.16);
        if (bodyT < 0) bodyT = 0;
        if (bodyT > 8.5) bodyT = 8.5;

        var ri = bodyT | 0;
        var ti;
        if (glossy) {
          ti = 11 + ((Math.random() * 3) | 0);      /* silver flash at the tip */
          /* rosettes show up in the gloss: rings dull the sheen, centres keep it */
          if (rosetteOut.ring > 0.35 && Math.random() < 0.72) glossy = false;
          ti = glossy ? ti : ri + 2;
        } else {
          ti = ri + 2 + ((Math.random() * 3) | 0);  /* faint silvered tip */
          if (ti > 10) ti = 10;
        }
        if (ri > 10) ri = 10;
        if (ti > NB - 1) ti = NB - 1;
        if (ri > NB - 1) ri = NB - 1;

        xs.push(jx * toCss);
        ys.push(jy * toCss);
        uxs.push(c); uys.push(s);
        lns.push(len);
        phs.push(Math.random() * 6.2832);
        amps.push(0.55 + Math.random() * 0.95);
        ris.push(ri); tis.push(ti);

        /* wave of the hair: signed curvature, coherent with neighbours so
           the coat reads as soft, flowing fur rather than straight bristles */
        var cw = Math.sin(jx * 0.085 + jy * 0.062) * 0.5 +
                 Math.sin(jx * 0.21 - jy * 0.17 + 0.9) * 0.22 +
                 (Math.random() - 0.5) * 0.5;
        if (cw > 0.85) cw = 0.85;
        if (cw < -0.85) cw = -0.85;
        cls.push(cw);
      }
    }

    N = xs.length;
    PX = new Float32Array(N); PY = new Float32Array(N);
    UX = new Float32Array(N); UY = new Float32Array(N);
    LEN = new Float32Array(N); PH = new Float32Array(N); AMP = new Float32Array(N);
    RI = new Uint8Array(N); TI = new Uint8Array(N);
    BX = new Float32Array(N); BY = new Float32Array(N);
    VX = new Float32Array(N); VY = new Float32Array(N);
    CURL = new Float32Array(N);

    for (i = 0; i < N; i++) {
      PX[i] = xs[i]; PY[i] = ys[i];
      UX[i] = uxs[i]; UY[i] = uys[i];
      LEN[i] = lns[i]; PH[i] = phs[i]; AMP[i] = amps[i];
      RI[i] = ris[i]; TI[i] = tis[i];
      CURL[i] = cls[i];
    }
  }

  /* ---------------------------------------------------------------
     render loop
  --------------------------------------------------------------- */
  var raf = 0;
  var lastTime = 0, tSec = 0;
  var paths = new Array(NB);
  var running = true;
  var ftAcc = 0, ftCount = 0, cooldown = 0, smoothSince = 0, slowStreak = 0;
  var drawAcc = 0;   /* our own drawing pass, ms — the signal we tune on */
  var badFpsSince = 0;   /* last-resort: sustained terrible frame rate */

  var frameNo = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);

    /* safety net: if any resize event was missed (they are unreliable on
       mobile), the very next frames notice and rebuild at the right size */
    frameNo++;
    if ((frameNo & 7) === 0) {
      if (syncSize(false)) { lastTime = 0; return; }
    }

    if (!lastTime) lastTime = now;
    var dtMs = now - lastTime;
    lastTime = now;
    if (dtMs <= 0) dtMs = 16.7;
    var dt = dtMs / 16.667;
    if (dt > 3) dt = 3;
    if (dt < 0.35) dt = 0.35;
    tSec += dtMs * 0.001;

    /* ---- auto quality -------------------------------------------------
       Two independent levers, so a slow device is never stuck:
         level   : resolution cap + pixel budget + strand budget (rebuild)
         density : strand count only (cheap re-sample, no re-layout)
       Fast path: a device that is clearly choking drops several levels at
       once instead of crawling down one per 4 seconds.                    */
    ftAcc += dtMs; ftCount++;
    samples++;
    var window = samples < 3 ? 20 : 45;
    if (ftCount >= window) {
      var avg = ftAcc / ftCount;            /* wall-clock frame time */
      var drawAvg = drawAcc / ftCount;      /* our drawing pass only */
      ftAcc = 0; ftCount = 0; drawAcc = 0;

      /* Budget check on OUR work first. Tuning on raw frame time alone is a
         trap: on a huge display the browser's own layer compositing can
         dominate, and dropping resolution only blurs the word without making
         that compositing any cheaper. So: degrade hard when OUR pass is slow,
         and only gently when the compositor is the limiter. */
      if (drawAvg > 12 && now - cooldown > 320) {
        var jump2 = drawAvg > 24 ? 2 : 1;
        var nl2 = Math.min(LEVELS.length - 1, level + jump2);
        if (nl2 !== level) level = nl2;
        else if (density > 0.34) { density = Math.max(0.34, density * 0.76); buildStrands(true); }
        cooldown = now; lastChange = now; smoothSince = 0; slowStreak = 0;
        syncSize(true); lastTime = 0;
        return;
      }

      /* composited frame time is bad but our pass is cheap: shrink the layer
         cost a little (max two steps) and then stop — more blur would not buy
         any frames back. */
      if (avg > 30 && level < 2 && now - cooldown > 1200) {
        level++;
        cooldown = now; lastChange = now;
        syncSize(true); lastTime = 0;
        return;
      }

      /* Last resort: the machine genuinely cannot composite the layer at
         speed (software-rendered GPU, ancient tablet). Smooth motion beats
         sharp pixels, so allow shrinking past the normal cap — slowly, and
         only while the frame rate really is awful. */
      if (avg > 40) {
        if (!badFpsSince) badFpsSince = now;
        if (now - badFpsSince > 5000 && level < LEVELS.length - 1 && now - cooldown > 2500) {
          level++;
          cooldown = now; lastChange = now;
          badFpsSince = now;
          syncSize(true); lastTime = 0;
          return;
        }
      } else if (avg < 24) {
        badFpsSince = 0;
      }

      if (now - cooldown > 1400) {
        slowStreak = drawAvg > 8 ? slowStreak + 1 : 0;

        if (drawAvg > 8 && slowStreak >= 2) {
          if (level < LEVELS.length - 1) {
            level++; slowStreak = 0;
            cooldown = now; lastChange = now; smoothSince = 0;
            syncSize(true);
            lastTime = 0;
            return;
          } else if (density > 0.34) {
            density = Math.max(0.34, density * 0.82);   /* fewest hairs, still smooth */
            slowStreak = 0; cooldown = now; lastChange = now;
            buildStrands(true);
            return;
          }
        }

        /* climb back only after a long, comfortable stretch with headroom */
        if (drawAvg < 4.5 && avg < 18 && now - lastChange > 9000) {
          if (density < 1) {
            density = Math.min(1, density / 0.88);
            cooldown = now; lastChange = now;
            buildStrands(true);
            return;
          } else if (level > 0) {
            level--;
            cooldown = now; lastChange = now; smoothSince = 0;
            syncSize(true);
            lastTime = 0;
            return;
          }
        }
      }
    }

    /* ---- pointer easing (one or many) ---- */
    var kP = 1 - Math.pow(1 - 0.30, dt);
    var kA = 1 - Math.pow(1 - 0.10, dt);
    var vDamp = Math.pow(0.86, dt);
    AP = 0;
    for (var pi = 0; pi < pts.length; pi++) {
      var pp = pts[pi];
      if (!pp.seen) continue;
      pp.x += (pp.tx - pp.x) * kP;
      pp.y += (pp.ty - pp.y) * kP;
      pp.vx *= vDamp;
      pp.vy *= vDamp;
      pp.act += (pp.want - pp.act) * kA;
      if (pp.act < 0.001) pp.act = 0;
      if (pp.act > 0.01 && AP < 4) {
        AXP[AP] = pp.x; AYP[AP] = pp.y;
        AVX[AP] = pp.vx; AVY[AP] = pp.vy;
        AA[AP] = pp.act;
        AP++;
      }
      /* retire dead touch points */
      if (pp.touch && pp.act === 0) { pts.splice(pi, 1); pi--; }
    }

    var drawStart = performance.now();
    renderFrame(dt);
    drawAcc += performance.now() - drawStart;
  }

  /* The drawing pass on its own, so a resize can repaint synchronously at the
     end of the rebuild — the canvas is never left cleared for a paint. */
  function renderFrame(dt) {
    ctx.clearRect(0, 0, W, H);

    /* backlight wall behind the animal (separation from dark screens) */
    if (glowCanvas.width > 4) {
      ctx.globalAlpha = glowStrength;
      ctx.drawImage(glowCanvas, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    ctx.drawImage(baseCanvas, 0, 0, W, H);
    if (!N) return;

    var b;
    for (b = 0; b < NB; b++) paths[b] = new Path2D();

    var radius = Math.max(84, Math.min(W, H) * 0.22);
    var r2 = radius * radius;
    var invR = 1 / radius;
    var wind = reduceMotion ? 0.15 : 1;

    var kk = 1 - Math.pow(1 - 0.20, dt);
    var damp = Math.pow(reduceMotion ? 0.74 : 0.862, dt);   /* a touch more follow-through */

    for (var i = 0; i < N; i++) {
      var x = PX[i], y = PY[i];
      var ph = PH[i];
      var ln = LEN[i];

      /* ambient breeze */
      var tx = Math.sin(tSec * 1.6 + ph) * 1.15 * AMP[i] * wind;
      var ty = Math.cos(tSec * 1.25 + ph * 1.7) * 1.15 * AMP[i] * wind;

      for (var q = 0; q < AP; q++) {
        var ddx = x - AXP[q], ddy = y - AYP[q];
        var d2 = ddx * ddx + ddy * ddy;
        if (d2 >= r2) continue;

        var d = Math.sqrt(d2) + 0.001;
        var inv = 1 / d;
        var f = 1 - d * invR;
        f = f * f * AA[q];
        var push = f * ln * 1.42;
        tx += ddx * inv * push;
        ty += ddy * inv * push;

        /* tangential swirl driven by pointer speed */
        var spd = (Math.abs(AVX[q]) + Math.abs(AVY[q])) * 0.022;
        if (spd > 0.01) {
          if (spd > 1) spd = 1;
          var cross = ddx * AVY[q] - ddy * AVX[q];
          var sgn = cross >= 0 ? 1 : -1;
          var sw = push * 0.62 * spd * sgn;
          tx -= ddy * inv * sw;
          ty += ddx * inv * sw;
        }
      }

      /* spring + damping (follow-through) */
      var vx = VX[i] + (tx - BX[i]) * kk;
      var vy = VY[i] + (ty - BY[i]) * kk;
      vx *= damp; vy *= damp;

      var bxv = BX[i] + vx;
      var byv = BY[i] + vy;

      /* keep the letterform readable: cap the bend */
      var maxB = ln * 1.15;
      var bl = Math.sqrt(bxv * bxv + byv * byv);
      if (bl > maxB) {
        var sc = maxB / bl;
        bxv *= sc; byv *= sc;
        vx *= 0.55; vy *= 0.55;
      }

      VX[i] = vx; VY[i] = vy;
      BX[i] = bxv; BY[i] = byv;

      /* one soft hair: a gently curved strand. The midpoint is placed on a
         quadratic curve bent along a coherent curl field; drawing it as two
         short segments through that point costs the same as a straight hair
         but removes the kink, so the coat reads as smooth fur. The split
         keeps the root dark and the tip pale. */
      var ux = UX[i], uy = UY[i];
      var ex = x + ux * ln + bxv;
      var ey = y + uy * ln + byv;

      var hx = (x + ex) * 0.5, hy = (y + ey) * 0.5;
      var cnx = -(ey - y), cny = (ex - x);     /* perpendicular to the chord */
      var cx = hx + cnx * CURL[i] * 0.62 + ux * ln * 0.06;
      var cy = hy + cny * CURL[i] * 0.62 + uy * ln * 0.06;

      /* Bezier evaluated at t = 0.5  ->  0.25*root + 0.5*ctrl + 0.25*tip */
      var mx = x * 0.25 + cx * 0.5 + ex * 0.25;
      var my = y * 0.25 + cy * 0.5 + ey * 0.25;

      var pr = paths[RI[i]];
      pr.moveTo(x, y);
      pr.lineTo(mx, my);

      var pt = paths[TI[i]];
      pt.moveTo(mx, my);
      pt.lineTo(ex, ey);
    }

    ctx.lineCap = 'round';

    /* wet-looking bloom on the specular bands only */
    if (level < LEVELS.length - 1) {
      ctx.globalAlpha = 0.09;
      for (b = NB - 3; b < NB; b++) {
        ctx.strokeStyle = palette[b];
        ctx.lineWidth = widths[b] * furW * 2.6;
        ctx.stroke(paths[b]);
      }
      ctx.globalAlpha = 1;
    }

    for (b = 0; b < NB; b++) {
      ctx.strokeStyle = palette[b];
      ctx.lineWidth = widths[b] * furW;
      ctx.stroke(paths[b]);
    }
  }

  /* ---------------------------------------------------------------
     boot + resize + visibility
  --------------------------------------------------------------- */
  function start() {
    if (raf) cancelAnimationFrame(raf);
    lastTime = 0;
    raf = requestAnimationFrame(frame);
  }

  /* One coalesced rebuild per animation frame: during a drag-resize the coat
     follows the window smoothly instead of blanking for a debounce period. */
  var syncQueued = false;
  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(function () {
      syncQueued = false;
      if (syncSize(false)) lastTime = 0;
    });
  }

  window.addEventListener('resize', queueSync, { passive: true });
  window.addEventListener('orientationchange', queueSync, { passive: true });
  window.addEventListener('pageshow', queueSync, { passive: true });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', queueSync, { passive: true });
    window.visualViewport.addEventListener('scroll', queueSync, { passive: true });
  }

  /* catches container resizes that never fire a window resize (iframes,
     split views, dev-tools docking, mobile browser chrome) */
  var ro = null;
  if (window.ResizeObserver) {
    try {
      ro = new ResizeObserver(queueSync);
      ro.observe(canvas);
    } catch (e) { ro = null; }
  }

  function onVisibility() {
    if (document.hidden) {
      running = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    } else if (!running) {
      running = true;
      lastTime = 0;
      start();
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  /* initial quality guess from the device, before the first build */
  (function probe() {
    var w = window.innerWidth || 1, h = window.innerHeight || 1;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var px = w * h * dpr * dpr;               // device pixels to paint
    if (coarse) level = 1;                     // phones/tablets: start a step down
    if (px > 4200000) level = Math.max(level, 1);
    if (cores <= 4) level = Math.max(level, 1);
    if (px > 8000000) level = Math.max(level, 2);
    if (coarse && cores <= 4) level = 2;
    if (level > LEVELS.length - 1) level = LEVELS.length - 1;
  })();

  syncSize(true);
  start();

  var hintTimer = 0;
  if (hint) hintTimer = setTimeout(function () { if (hint) hint.style.opacity = '0'; }, 7000);

  return function unmount() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (hintTimer) clearTimeout(hintTimer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', queueSync);
    window.removeEventListener('orientationchange', queueSync);
    window.removeEventListener('pageshow', queueSync);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', queueSync);
      window.visualViewport.removeEventListener('scroll', queueSync);
    }
    if (ro) ro.disconnect();
    for (var q = 0; q < pts.length; q++) pts[q].want = 0;
  };
};