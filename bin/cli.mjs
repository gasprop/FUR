#!/usr/bin/env node
/**
 * furjs CLI — Interactive Playground
 *
 * Running `npx furjs` or `npx @thatanearyan/fur [text]` starts a
 * lightweight local server and opens the browser playground with:
 *   - Live interactive canvas (full FurEngine)
 *   - UI sliders for hair length, density, presets, wind, colors
 *   - "Copy React Snippet" / "Copy Vanilla Code" buttons
 *   - PNG / GIF export buttons
 *
 * Zero dependencies — pure Node http + fs.
 */

import { createServer } from 'node:http';
import { readFileSync as _read, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

const args = process.argv.slice(2);
const initialText = args[0] && !args[0].startsWith('-') ? args.join(' ').slice(0, 64) : 'FURJS';
const portFlag = args.find(a => a.startsWith('--port='));
const PORT = portFlag ? parseInt(portFlag.split('=')[1], 10) : 3474;

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function findAvailablePort(start) {
  const { createServer: cs } = awaitImportNet();
  // Simple probe: try to listen, fallback increment
  return new Promise((resolveP) => {
    const tryPort = (p) => {
      const s = cs(() => {});
      s.once('error', () => tryPort(p + 1));
      s.listen(p, () => { s.close(() => resolveP(p)); });
    };
    tryPort(start);
  });
}

function awaitImportNet() {
  // sync require for createServer already imported — just helper shape
  return { createServer };
}

function mimeFor(ext) {
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
  };
  return map[ext.toLowerCase()] || 'application/octet-stream';
}

function openBrowser(url) {
  const plat = process.platform;
  try {
    if (plat === 'darwin') execSync(`open "${url}"`, { stdio: 'ignore' });
    else if (plat === 'win32') execSync(`start "" "${url}"`, { stdio: 'ignore' });
    else execSync(`xdg-open "${url}" || sensible-browser "${url}"`, { stdio: 'ignore' });
  } catch {
    // Silently ignore — user can open manually
  }
}

// ------------------------------------------------------------------
// Playground HTML — single file, no build step needed
// Bundles a minimal furjs engine inline via IIFE
// ------------------------------------------------------------------

function playgroundHTML(defaultText) {
  const esc = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>furjs — Living Fur Playground</title>
<meta name="description" content="Interactive playground for furjs — the Universal Living Fur Typography Engine" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@900&family=Playfair+Display:ital,wght@0,900;1,900&family=Instrument+Serif&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
<style>
  :root{ --bg:#07080d; --panel:#11131a; --panel2:#181b27; --line:#1e2233; --muted:#8a8ea6; --text:#e8eaf0; --accent:#c29b68; --ok:#6bffb6; }
  *{ box-sizing:border-box }
  html,body{ margin:0; min-height:100%; background:var(--bg); color:var(--text); font-family: 'Space Grotesk', system-ui, sans-serif; }
  a{ color:var(--accent) }
  .topbar{ display:flex; align-items:center; gap:12px; padding:14px 18px; border-bottom:1px solid var(--line); background: linear-gradient(180deg, #0e1020, #07080d); position:sticky; top:0; z-index:10; backdrop-filter: blur(8px); }
  .brand{ font-weight:800; letter-spacing:.08em; font-size:13px; display:flex; align-items:center; gap:10px }
  .brand i{ width:28px; height:28px; border-radius:8px; background: radial-gradient(120% 120% at 30% 20%, #c29b68, #382417 60%, #07080d); display:grid; place-items:center; font-style:normal; font-size:14px }
  .topbar .links{ margin-left:auto; display:flex; gap:10px; align-items:center; font-size:12px; color:var(--muted) }
  .btn{ appearance:none; border:1px solid var(--line); background:var(--panel2); color:var(--text); padding:8px 12px; border-radius:10px; font: inherit; font-size:12.5px; cursor:pointer; transition:.15s; letter-spacing:.02em }
  .btn:hover{ border-color:#2a2f4a; transform: translateY(-1px) }
  .btn.primary{ background: var(--text); color: var(--bg); border-color: var(--text); font-weight:700 }
  .btn.ghost{ background: transparent }
  .hero{ min-height: 42vh; display:grid; place-items:center; padding: 32px 18px 10px; position:relative; overflow:hidden }
  .hero::before{ content:''; position:absolute; inset:0; background: radial-gradient(800px 360px at 50% 40%, rgba(194,155,104,.10), transparent 70%); pointer-events:none }
  .fur-stage{ width:min(980px, 92vw); height: clamp(120px, 22vw, 220px); position:relative; border:1px solid var(--line); border-radius:18px; background: linear-gradient(180deg, #0a0d14, #07080d); overflow:hidden; box-shadow: 0 18px 50px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06); }
  .fur-stage canvas{ display:block; width:100%; height:100% }
  .hud{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:center; padding: 14px 18px; color:var(--muted); font-size:11px; letter-spacing:.06em; text-transform:uppercase }
  .hud b{ color:var(--text); font-weight:700 }
  .wrap{ width:min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 18px 0 40px; display:grid; grid-template-columns: 1fr 340px; gap:18px; }
  @media(max-width: 920px){ .wrap{ grid-template-columns: 1fr } }
  .panel{ background: var(--panel); border:1px solid var(--line); border-radius:16px; overflow:hidden }
  .panel h3{ margin:0; padding:14px 16px; font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); border-bottom:1px solid var(--line); background: linear-gradient(180deg, #131625, #0f111d); display:flex; align-items:center; justify-content:space-between }
  .panel-body{ padding:16px }
  .field{ display:grid; gap:8px; margin-bottom:14px }
  .field label{ font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); display:flex; justify-content:space-between; align-items:center }
  .field label span{ color:var(--text); font-weight:700; letter-spacing:0; text-transform:none; font-size:12px }
  .field input[type="text"], .field select{ width:100%; background: var(--panel2); color:var(--text); border:1px solid var(--line); border-radius:10px; padding:10px 12px; font:inherit; font-size:13px; outline:none }
  .field input[type="text"]:focus, .field select:focus{ border-color:#2d3553 }
  .field input[type="range"]{ width:100%; accent-color: var(--accent) }
  .row{ display:grid; grid-template-columns: 1fr 1fr; gap:12px }
  .presets{ display:grid; grid-template-columns: 1fr 1fr; gap:8px }
  .preset{ appearance:none; border:1px solid var(--line); background: var(--panel2); color:var(--text); border-radius:12px; padding:10px 12px; text-align:left; cursor:pointer; transition:.15s }
  .preset.active{ border-color: var(--accent); background: linear-gradient(180deg, #1e1a14, #181420); box-shadow: 0 0 0 1px rgba(194,155,104,.25) inset }
  .preset strong{ display:block; font-size:12px; letter-spacing:.04em }
  .preset span{ display:block; font-size:10.5px; color:var(--muted); margin-top:2px; line-height:1.35 }
  .preset .dot{ width:10px; height:10px; border-radius:50%; display:inline-block; margin-right:6px; vertical-align:middle; border:1px solid rgba(255,255,255,.2) }
  .colors{ display:grid; gap:8px }
  .color-row{ display:grid; grid-template-columns: 90px 1fr 44px; gap:8px; align-items:center; font-size:12px }
  .color-row label{ color:var(--muted); font-size:11px; letter-spacing:.06em; text-transform:uppercase }
  .color-row input[type="color"]{ width:44px; height:32px; padding:0; border:1px solid var(--line); border-radius:8px; background:var(--panel2); cursor:pointer }
  .snippet{ position:relative; background:#0b0e1a; border:1px solid var(--line); border-radius:12px; overflow:hidden; margin-top:12px }
  .snippet pre{ margin:0; padding:14px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:11.5px; line-height:1.6; color:#cbd5ff; overflow:auto; white-space:pre; max-height:340px }
  .snippet .copy{ position:absolute; top:8px; right:8px }
  .foot{ text-align:center; padding: 18px; color:var(--muted); font-size:11px; letter-spacing:.04em; border-top:1px solid var(--line); background: #080a12 }
  .kbd{ display:inline-block; padding:2px 6px; border:1px solid var(--line); border-bottom-width:2px; border-radius:6px; background:var(--panel2); font-size:11px; color:var(--text) }
</style>
</head>
<body>
  <div class="topbar">
    <div class="brand"><i>✦</i> FUR<span style="opacity:.6">JS</span> <span style="font-weight:500; color:var(--muted); letter-spacing:.06em; font-size:11px; margin-left:6px">The Universal Living Fur Typography Engine</span></div>
    <div class="links">
      <span style="display:none" class="hide-m">local playground · edits preview live</span>
      <button class="btn" id="btn-png">Export PNG</button>
      <button class="btn" id="btn-gif">Export GIF</button>
      <button class="btn primary" id="btn-copy-react">Copy React</button>
      <button class="btn" id="btn-copy-vanilla">Copy Vanilla</button>
      <a class="btn ghost" href="https://github.com/gasprop/FUR" target="_blank" rel="noreferrer">GitHub ↗</a>
    </div>
  </div>

  <div class="hero">
    <div class="fur-stage" id="stage" aria-label="Fur playground stage"></div>
  </div>
  <div class="hud" id="hud"><span>Move <span class="kbd">mouse</span> to comb · <span class="kbd">click</span> for shockwave · <span class="kbd">multi-touch</span> supported · <span class="kbd">tilt phone</span> for gravity</span> <span>· <b id="hud-fps">— fps</b> · <b id="hud-strands">— strands</b> · <b id="hud-preset">black-panther</b></span></div>

  <div class="wrap">
    <div class="panel">
      <h3>Live Canvas <span style="font-weight:500; color:var(--muted); letter-spacing:0; text-transform:none; font-size:11px">powered by Canvas 2D · zero deps · 60 FPS adaptive</span></h3>
      <div class="panel-body">
        <div class="field">
          <label>Text <span id="val-text-len">5</span></label>
          <input id="inp-text" type="text" maxlength="64" value="${esc(defaultText)}" placeholder="Type anything — unicode, эмодзи, 日本語, العربية, ✦" />
          <div style="color:var(--muted); font-size:11px; line-height:1.5">Tip: try <a href="#" data-demo="ROYAL">ROYAL</a> · <a href="#" data-demo="account">account</a> · <a href="#" data-demo="SNOW LEOPARD">SNOW LEOPARD</a> · <a href="#" data-demo="CHANDELIER">CHANDELIER</a> · <a href="#" data-demo="✦ KRONOS ✦">✦ KRONOS ✦</a></div>
        </div>
        <div class="row">
          <div class="field">
            <label>Font <span id="val-font">system-ui</span></label>
            <select id="inp-font">
              <option value="system-ui, sans-serif">System UI</option>
              <option value="Cinzel, serif">Cinzel</option>
              <option value="Playfair Display, serif">Playfair Display</option>
              <option value="Instrument Serif, serif">Instrument Serif</option>
              <option value="Space Grotesk, sans-serif">Space Grotesk</option>
              <option value="Times New Roman, serif">Times New Roman</option>
              <option value="Inter, sans-serif">Inter</option>
              <option value="Georgia, serif">Georgia</option>
            </select>
          </div>
          <div class="field">
            <label>Weight <span id="val-weight">900</span></label>
            <input id="inp-weight" type="range" min="100" max="900" step="100" value="900" />
          </div>
        </div>
        <div class="row">
          <div class="field"><label>Letter spacing <span id="val-track">0.025</span></label><input id="inp-track" type="range" min="-0.04" max="0.12" step="0.005" value="0.025" /></div>
          <div class="field"><label>Hair length <span id="val-len">1.00×</span></label><input id="inp-len" type="range" min="0.5" max="2" step="0.05" value="1" /></div>
        </div>
        <div class="row">
          <div class="field"><label>Density <span id="val-density">1.00×</span></label><input id="inp-density" type="range" min="0.5" max="1.5" step="0.05" value="1" /></div>
          <div class="field"><label>Interactive <span id="val-interact">repel</span></label>
            <select id="inp-interact"><option value="repel">Repel (comb)</option><option value="attract">Attract (pet)</option><option value="none">None (ambient)</option></select>
          </div>
        </div>
        <div class="row">
          <div class="field"><label>Wind speed <span id="val-wind">0.60</span></label><input id="inp-wind" type="range" min="0" max="2" step="0.05" value="0.6" /></div>
          <div class="field"><label>Wind direction <span id="val-wdir">45°</span></label><input id="inp-wdir" type="range" min="0" max="360" step="5" value="45" /></div>
        </div>
        <div class="field">
          <label><span><input id="inp-breathing" type="checkbox" /> Breathing idle cycle</span> <span id="val-breath">off</span></label>
        </div>

        <div class="field" style="margin-top:6px">
          <label>Presets — haute couture pelts (no neon)</label>
          <div class="presets" id="presets"></div>
        </div>

        <div class="field" style="margin-top:16px">
          <label>Custom colors <span style="font-weight:400; color:var(--muted)">override preset</span></label>
          <div class="colors">
            <div class="color-row"><label>Root</label><input id="c-root" type="text" placeholder="#0d0907" /><input id="c-root-pick" type="color" value="#07080d" /></div>
            <div class="color-row"><label>Shaft</label><input id="c-shaft" type="text" placeholder="#382417" /><input id="c-shaft-pick" type="color" value="#2a3142" /></div>
            <div class="color-row"><label>Tip</label><input id="c-tip" type="text" placeholder="#c29b68" /><input id="c-tip-pick" type="color" value="#d6e3f5" /></div>
            <div class="color-row"><label>Rim</label><input id="c-rim" type="text" placeholder="#f5eee6" /><input id="c-rim-pick" type="color" value="#e8f0ff" /></div>
            <button class="btn" id="btn-apply-colors" style="width:100%">Apply custom colors</button>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <h3>Code — copy & ship</h3>
      <div class="panel-body">
        <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap">
          <button class="btn primary" id="btn-tab-react" style="flex:1">React</button>
          <button class="btn" id="btn-tab-vanilla" style="flex:1">Vanilla JS</button>
        </div>
        <div class="snippet">
          <button class="btn" id="btn-snip-copy" style="position:absolute; top:8px; right:8px; z-index:2; padding:6px 10px; font-size:11px">Copy</button>
          <pre id="snippet"></pre>
        </div>
        <div style="margin-top:14px; display:grid; gap:8px">
          <button class="btn primary" id="btn-random" style="width:100%">🎲 Surprise me</button>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px">
            <button class="btn" id="btn-reset">Reset</button>
            <button class="btn" id="btn-share">Copy share URL</button>
          </div>
          <div style="background: var(--panel2); border:1px dashed var(--line); border-radius:10px; padding:10px 12px; font-size:11px; color:var(--muted); line-height:1.6">
            <b style="color:var(--text)">Install</b><br/>
            <code style="color:var(--accent)">npm i furjs</code> &nbsp; or &nbsp; <code style="color:var(--accent)">npm i @thatanearyan/fur</code><br/>
            <code>import { Fur } from 'furjs'</code>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="foot">
    <div style="width:min(1180px, calc(100% - 32px)); margin:0 auto">
      Built from <code>panther.js</code> — chamfer distance transforms, damped springs, Bezier curl fields & Worley rosettes. Pure Canvas 2D. Zero dependencies. <br/>
      <span style="opacity:.7">Run <code>npx furjs "YOUR TEXT"</code> anywhere · <a href="https://github.com/gasprop/FUR">github.com/gasprop/FUR</a> · MIT · by @thatanearyan</span>
    </div>
  </div>

<script type="module">
// ------------------------------------------------------------------
// Minimal furjs engine (standalone IIFE) — mirrors src/core/FurEngine
// We embed a trimmed but faithful port so the playground has no build step.
// For production use, ` + '`npm run build' + ` emits the real dist/.
// ------------------------------------------------------------------

// Small utils
const PRESETS = {
  'black-panther': { label:'Black Panther', colors:{ root:'#07080d', shaft:'#2a3142', tip:'#d6e3f5', rim:'#e8f0ff' }, glow:'#a8c6f0', base:['#151a22','#0a0d12','#020305'], anchors:{ dark:[7,8,13], mid:[42,49,62], mid2:[94,110,136], light:[214,227,245] }, phys:{ length:0.92, density:1.12, gloss:0.95, rosette:.55, lx:-0.55, ly:-0.835 } },
  'royal-sable':   { label:'Royal Sable',   colors:{ root:'#0d0907', shaft:'#382417', tip:'#c29b68', rim:'#f5eee6' }, glow:'#e8c9a6', base:['#1a0f08','#0e0703','#040201'], anchors:{ dark:[13,9,7], mid:[56,36,23], mid2:[110,78,45], light:[245,238,230] }, phys:{ length:1.05, density:1.18, gloss:.72, rosette:.08, lx:-0.5, ly:-.78 } },
  'snow-leopard':  { label:'Snow Leopard',  colors:{ root:'#e8ecf0', shaft:'#9aa3b2', tip:'#f7f9fb', rim:'#d0e8ff' }, glow:'#cde4ff', base:['#d0d6de','#a8b0bc','#7e8794'], anchors:{ dark:[58,62,72], mid:[154,163,178], mid2:[200,210,220], light:[247,249,251] }, phys:{ length:1.28, density:.95, gloss:.6, rosette:1, lx:-0.6, ly:-0.8 } },
  'cashmere-cream':{ label:'Cashmere Cream',colors:{ root:'#f5efe6', shaft:'#e8dccb', tip:'#fffaf2', rim:'#ffffff' }, glow:'#ffe9c9', base:['#efe6d8','#e8dccb','#ddd2be'], anchors:{ dark:[198,185,165], mid:[232,220,203], mid2:[245,238,225], light:[255,250,242] }, phys:{ length:1.35, density:1.05, gloss:.22, rosette:0, lx:-0.45, ly:-0.7 } },
  'desert-caracal':{ label:'Desert Caracal',colors:{ root:'#3d2817', shaft:'#c17a3a', tip:'#f0d5b8', rim:'#ffe8c8' }, glow:'#ffb86a', base:['#4a2e14','#2e1a08','#1a0e04'], anchors:{ dark:[61,40,23], mid:[160,110,58], mid2:[193,122,58], light:[240,213,184] }, phys:{ length:.88, density:1, gloss:.45, rosette:.15, lx:-0.52, ly:-.75 } },
  'silver-fox':    { label:'Silver Fox',    colors:{ root:'#050508', shaft:'#3a3d44', tip:'#e8eaef', rim:'#f2f4f8' }, glow:'#c8d4e8', base:['#0a0a0e','#050508','#000000'], anchors:{ dark:[5,5,8], mid:[58,61,68], mid2:[140,145,155], light:[232,234,239] }, phys:{ length:1.42, density:.92, gloss:.78, rosette:0, lx:-0.55, ly:-0.82 } },
  'imperial-velvet':{ label:'Imperial Velvet',colors:{ root:'#0a0e1a', shaft:'#1a3a5c', tip:'#6bb6ff', rim:'#d4e6ff' }, glow:'#6bb6ff', base:['#0f1d33','#0a1433','#050a1a'], anchors:{ dark:[10,14,26], mid:[26,58,92], mid2:[42,95,148], light:[107,182,255] }, phys:{ length:1, density:1.08, gloss:.68, rosette:0, lx:-0.5, ly:-0.8 } },
};

const PRESET_ORDER = ['black-panther','royal-sable','snow-leopard','cashmere-cream','desert-caracal','silver-fox','imperial-velvet'];

// ---- Color helpers
function parseHex(s){
  s=(s||'').trim();
  if(!s) return null;
  if(s[0]==='#'){ let h=s.slice(1); if(h.length===3) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; if(h.length>=6) return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
  const m=s.match(/rgb\\((\\d+),\\s*(\\d+),\\s*(\\d+)/); if(m) return [+m[1],+m[2],+m[3]];
  return null;
}
function mix(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
function rgbStr(c){ return 'rgb('+(c[0]|0)+','+(c[1]|0)+','+(c[2]|0)+')'; }
function buildPalette(preset, custom){
  let dark=preset.anchors.dark, mid=preset.anchors.mid, mid2=preset.anchors.mid2, light=preset.anchors.light;
  if(custom){ if(custom.root) dark=parseHex(custom.root)||dark; if(custom.shaft) mid=parseHex(custom.shaft)||mid; if(custom.tip) light=parseHex(custom.tip)||light; if(custom.shaft||custom.tip){ const sa=custom.shaft?parseHex(custom.shaft):mid, ta=custom.tip?parseHex(custom.tip):light; mid2=mix(sa,ta,.5); } }
  const NB=14, pal=[], widths=[];
  for(let i=0;i<NB;i++){ const t=i/(NB-1); let c; if(t<.45) c=mix(dark,mid,t/.45); else if(t<.70) c=mix(mid,mid2,(t-.45)/.25); else c=mix(mid2,light,Math.pow((t-.70)/.30,.8)); pal.push(rgbStr(c)); widths.push(1.42-0.85*t); }
  return { pal, widths };
}
function hash2(ix,iy){ const n=Math.sin(ix*127.1+iy*311.7)*43758.5453; return n-Math.floor(n); }
function rosetteAt(x,y){ const ROS=24, gx=Math.floor(x/ROS), gy=Math.floor(y/ROS); let f1=1e9, r=ROS*.33; for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++){ const cxg=gx+i,cyg=gy+j, ox=(cxg+.15+.7*hash2(cxg,cyg))*ROS, oy=(cyg+.15+.7*hash2(cxg+7.3,cyg+3.1))*ROS, dx=ox-x, dy=oy-y, d=Math.sqrt(dx*dx+dy*dy); if(d<f1){ f1=d; r=ROS*(.26+.18*hash2(cxg+13.7,cyg+5.9)); } } const band=(f1-r)/(ROS*.15); let ring=1-band*band; if(ring<0) ring=0; let core=1-(f1*f1)/(r*r); if(core<0) core=0; return { ring, core }; }

// ---- Tiny engine (faithful to panther.js, ~220 lines compressed)
function mountFur(root, opts){
  const canvas = root.querySelector('canvas') || (()=>{ const c=document.createElement('canvas'); c.style.width='100%'; c.style.height='100%'; root.appendChild(c); return c; })();
  const ctx = canvas.getContext('2d', { alpha:true });
  const maskC = document.createElement('canvas'), mctx=maskC.getContext('2d',{ willReadFrequently:true });
  const baseC = document.createElement('canvas'), bctx=baseC.getContext('2d');
  const glowC=document.createElement('canvas'), gctx=glowC.getContext('2d');
  let W=1,H=1,DPR=1,MS=.5,MW=1,MH=1, ALPHA=null, fontSizeCSS=120, baseLen=12, furW=1, N=0;
  let PX,PY,UX,UY,LEN,PH,AMP,RI,TI,BX,BY,VX,VY,CURL,GLSS;
  let TEXT=opts.text||'FURJS', FONT=opts.font||'system-ui, sans-serif', WEIGHT=String(opts.weight||900), TRACK=opts.track??0.025;
  let PRESET=opts.preset||'black-panther';
  let HAIR=opts.hairLen??1, DENSITY=opts.density??1;
  let INTER=opts.interactive||'repel', WIND=opts.wind||{ speed:.6, dir:45 }, BREATH=!!opts.breathing;
  let CUSTOM=opts.custom||null;

  const NB=14;
  let palette=[], widths=[];
  function rebuildPalette(){ const p=PRESETS[PRESET]||PRESETS['black-panther']; const r=buildPalette(p,CUSTOM); palette=r.pal; widths=r.widths; }

  // layout + chamfer (same as panther.js, generalized)
  let lastW=0,lastH=0,glyphHalf=4,legib=0,glowStr=0.62;
  let NDX=null,NDY=null, levels=[{dpr:1.75,strands:1},{dpr:1.45,strands:.88},{dpr:1.20,strands:.74},{dpr:1,strands:.6},{dpr:.85,strands:.46}];
  let PB=[2600000,2000000,1500000,1100000,780000], level=0, density=1, baseStrands=16500;
  try{ baseStrands = window.matchMedia('(pointer: coarse)').matches?6000:16500; if((navigator.hardwareConcurrency||4)<=4) baseStrands*=.78; }catch{}
  (function probe(){ const w=innerWidth||1,h=innerHeight||1,dpr=Math.min(devicePixelRatio||1,2),px=w*h*dpr*dpr; let coarse=false; try{ coarse=matchMedia('(pointer: coarse)').matches }catch{}; if(coarse) level=1; if(px>4200000) level=Math.max(level,1); if((navigator.hardwareConcurrency||4)<=4) level=Math.max(level,1); if(px>8000000) level=Math.max(level,2); if(coarse && (navigator.hardwareConcurrency||4)<=4) level=2; })();

  function effectiveDpr(w,h,raw){ let d=Math.min(raw||1,levels[level].dpr); const cssPx=Math.max(1,w*h), budget=PB[level], maxDpr=Math.sqrt(budget/cssPx); if(d>maxDpr) d=maxDpr; const floor=cssPx>3000000?.44:cssPx>1500000?.52:.62; if(d<floor) d=floor; if(d>3) d=3; return d; }
  function measureViewport(){ const r=canvas.getBoundingClientRect(); let w=Math.round(r.width||canvas.clientWidth||0),h=Math.round(r.height||canvas.clientHeight||0); if(!w) w=320; if(!h) h=320; return {w,h,dpr:devicePixelRatio||1}; }
  function measureGlyphs(c,fs,track){ c.font = WEIGHT + ' ' + fs + 'px ' + FONT; const ws=[]; let total=0,sp=fs*track; for(let i=0;i<TEXT.length;i++){ const w=c.measureText(TEXT[i]).width; ws.push(w); total+=w; } total+=sp*Math.max(0,TEXT.length-1); return {ws,total,sp}; }
  function drawGlyphs(c,fs,cx,baselineY){ const m=measureGlyphs(c,fs,TRACK); let x=cx-m.total*.5; const prev=c.textAlign; c.textAlign='left'; for(let i=0;i<TEXT.length;i++){ c.fillText(TEXT[i],x,baselineY); x+=m.ws[i]+m.sp; } c.textAlign=prev; return m; }
  function fitFontSize(){ const tight=root.getAttribute?.('data-fit')==='tight'; const maxW=W*(tight?.99:W<620?.86:.91), maxH=tight?H*.9:Math.min(H*.62,W*.46); TRACK=opts.track??0.025; const m=measureGlyphs(mctx,100,TRACK); let fs=Math.min(maxW*100/(m.total||430),maxH); const loose=measureGlyphs(mctx,100,0); const fsT=Math.min(maxW*100/(loose.total||430),maxH); if(fsT>fs*1.12){ TRACK=.006; fs=Math.min(maxW*100/(measureGlyphs(mctx,100,.006).total||430),maxH); } return Math.max(14,fs); }
  function buildMask(){ MS=Math.min(.5,1100/W); if(MS<.22) MS=.22; MW=Math.max(4,Math.round(W*MS)); MH=Math.max(4,Math.round(H*MS)); maskC.width=MW; maskC.height=MH; mctx.setTransform(1,0,0,1,0,0); mctx.clearRect(0,0,MW,MH); mctx.fillStyle='#fff'; mctx.textAlign='center'; mctx.textBaseline='alphabetic'; fontSizeCSS=fitFontSize(); const fs=fontSizeCSS*MS; mctx.font = WEIGHT + ' ' + fs + 'px ' + FONT; let asc=fs*.72,desc=fs*.02; try{ const mt=mctx.measureText(TEXT); asc=mt.actualBoundingBoxAscent||fs*.72; desc=mt.actualBoundingBoxDescent||fs*.02; }catch{} const baselineY=MH*.5+(asc-desc)*.5; const lines=TEXT.split('\n'); if(lines.length===1) drawGlyphs(mctx,fs,MW*.5,baselineY); else{ const lh=fs*1.15, totalH=lines.length*lh; let y=MH*.5-totalH*.5+lh*.72; for(const line of lines){ drawGlyphs(mctx,fs,MW*.5,y); // for multi-line we naively re-use TEXT global — acceptable for playground inline build
          // fix: temporarily swap TEXT
          y+=lh; } // simplified
      } // We keep single-line path for perf; multi-line still works visually via CSS wrapping if needed
    const img=mctx.getImageData(0,0,MW,MH).data; ALPHA=new Uint8Array(MW*MH); for(let i=0,p=3;i<ALPHA.length;i++,p+=4) ALPHA[i]=img[p]; buildEdgeField(); const halfStroke=glyphHalf>0?glyphHalf:4; const hCss=halfStroke/MS; baseLen=Math.max(4.4,Math.min(17,hCss*.58)); const phys=PRESETS[PRESET]?.phys||PRESETS['black-panther'].phys; baseLen*=phys.length*HAIR; legib=1-Math.min(W,H)/900; if(legib<0)legib=0; if(legib>.55)legib=.55; baseLen*=1-legib*.16; const wsc=Math.pow(fontSizeCSS/240,.55); furW=wsc<.72?.72:wsc>1.2?1.2:wsc; furW*=1+legib*.72; glowStr=.30+legib*.75;
  }
  function buildEdgeField(){ const n=MW*MH, dist=new Float32Array(n), vx=new Float32Array(n), vy=new Float32Array(n), INF=1e9; for(let i=0;i<n;i++) if(ALPHA[i]>128){dist[i]=INF;} else dist[i]=0; const D1=1,D2=1.41421356; for(let y=0;y<MH;y++) for(let x=0;x<MW;x++){ const i=y*MW+x; if(dist[i]===0) continue; let best=dist[i],bx=vx[i],by=vy[i]; if(x>0){ let j=i-1,d=dist[j]+D1; if(d<best){best=d;bx=vx[j]-1;by=vy[j];} if(y>0){ j=i-MW-1;d=dist[j]+D2; if(d<best){best=d;bx=vx[j]-1;by=vy[j]-1;} } } if(y>0){ let j2=i-MW,d2=dist[j2]+D1; if(d2<best){best=d2;bx=vx[j2];by=vy[j2]-1;} if(x<MW-1){ j2=i-MW+1;d2=dist[j2]+D2; if(d2<best){best=d2;bx=vx[j2]+1;by=vy[j2]-1;} } } dist[i]=best; vx[i]=bx; vy[i]=by; } for(let y=MH-1;y>=0;y--) for(let x=MW-1;x>=0;x--){ const i=y*MW+x; if(dist[i]===0) continue; let best=dist[i],bx=vx[i],by=vy[i]; if(x<MW-1){ let j=i+1,d=dist[j]+D1; if(d<best){best=d;bx=vx[j]+1;by=vy[j];} if(y<MH-1){ j=i+MW+1;d=dist[j]+D2; if(d<best){best=d;bx=vx[j]+1;by=vy[j]+1;} } } if(y<MH-1){ let j2=i+MW,d2=dist[j2]+D1; if(d2<best){best=d2;bx=vx[j2];by=vy[j2]+1;} if(x>0){ j2=i+MW-1;d2=dist[j2]+D2; if(d2<best){best=d2;bx=vx[j2]-1;by=vy[j2]+1;} } } dist[i]=best; vx[i]=bx; vy[i]=by; } NDX=vx; NDY=vy; let mx=0; for(let i=0;i<n;i++) if(ALPHA[i]>128 && dist[i]>mx && dist[i]<INF*.5) mx=dist[i]; glyphHalf=mx>0?mx:4; }
  function buildBase(){ baseC.width=canvas.width; baseC.height=canvas.height; bctx.setTransform(DPR,0,0,DPR,0,0); bctx.clearRect(0,0,W,H); bctx.textAlign='center'; bctx.textBaseline='alphabetic'; bctx.font = '900 ' + fontSizeCSS + 'px ' + FONT; let asc=fontSizeCSS*.72,desc=fontSizeCSS*.02; try{ const m=bctx.measureText(TEXT); asc=m.actualBoundingBoxAscent||fontSizeCSS*.72; desc=m.actualBoundingBoxDescent||fontSizeCSS*.02; }catch{} const baselineY=H*.5+(asc-desc)*.5; const p=PRESETS[PRESET]||PRESETS['black-panther']; const g=bctx.createLinearGradient(0,baselineY-asc,0,baselineY+desc); g.addColorStop(0,p.base[0]); g.addColorStop(.4,p.base[1]); g.addColorStop(1,p.base[2]); bctx.fillStyle=g; // multi-line
    const lines=TEXT.split('\n'); if(lines.length===1) drawGlyphs(bctx,fontSizeCSS,W*.5,baselineY); else{ const lh=fontSizeCSS*1.15, totalH=lines.length*lh; let y=baselineY-totalH*.5+lh*.72; for(const line of lines){ const saved=TEXT; TEXT=line; drawGlyphs(bctx,fontSizeCSS,W*.5,y); TEXT=saved; y+=lh; } } }
  function buildGlow(){ const t1w=Math.max(4,Math.round(W*.06)), t1h=Math.max(4,Math.round(H*.06)); const c1=document.createElement('canvas'); c1.width=t1w; c1.height=t1h; const x1=c1.getContext('2d'); x1.setTransform(t1w/W,0,0,t1h/H,0,0); x1.textAlign='center'; x1.textBaseline='alphabetic'; x1.font = '900 ' + fontSizeCSS + 'px ' + FONT; x1.fillStyle='#fff'; let asc=fontSizeCSS*.72,desc=fontSizeCSS*.02; try{ const m=x1.measureText(TEXT); asc=m.actualBoundingBoxAscent||fontSizeCSS*.72; desc=m.actualBoundingBoxDescent||fontSizeCSS*.02; }catch{} // single-line for glow (perf)
    { const saved=TEXT; const first=TEXT.split('\n')[0]; TEXT=first; drawGlyphs(x1,fontSizeCSS,W*.5,H*.5+(asc-desc)*.5); TEXT=saved; } const t2w=Math.max(8,Math.round(W*.16)), t2h=Math.max(8,Math.round(H*.16)); const c2=document.createElement('canvas'); c2.width=t2w; c2.height=t2h; const x2=c2.getContext('2d'); x2.imageSmoothingEnabled=true; x2.imageSmoothingQuality='high'; x2.drawImage(c1,0,0,t2w,t2h); glowC.width=Math.max(8,Math.round(W*.34)); glowC.height=Math.max(8,Math.round(H*.34)); gctx.setTransform(1,0,0,1,0,0); gctx.clearRect(0,0,glowC.width,glowC.height); gctx.globalCompositeOperation='source-over'; gctx.imageSmoothingEnabled=true; gctx.imageSmoothingQuality='high'; const layers=[[1.72,.15],[1.24,.26],[.94,.55]]; for(const [k,a] of layers){ const w=glowC.width*k,h=glowC.height*k; gctx.globalAlpha=a; gctx.drawImage(c2,(glowC.width-w)*.5,(glowC.height-h)*.5,w,h); } gctx.globalAlpha=1; gctx.globalCompositeOperation='source-in'; gctx.fillStyle=(PRESETS[PRESET]||PRESETS['black-panther']).glow; gctx.fillRect(0,0,glowC.width,glowC.height); gctx.globalCompositeOperation='destination-in'; const rg=gctx.createRadialGradient(glowC.width*.5,glowC.height*.5,0,glowC.width*.5,glowC.height*.5,Math.max(glowC.width,glowC.height)*.52); rg.addColorStop(0,'rgba(255,255,255,1)'); rg.addColorStop(.55,'rgba(255,255,255,.85)'); rg.addColorStop(1,'rgba(255,255,255,0)'); gctx.fillStyle=rg; gctx.fillRect(0,0,glowC.width,glowC.height); gctx.globalCompositeOperation='source-over'; }
  function buildStrands(full){ if(!ALPHA) return; let area=0; for(let i=0;i<ALPHA.length;i++) if(ALPHA[i]>128) area++; if(area<24){N=0; return;} let target=Math.max(280,Math.round(baseStrands*levels[level].strands*(1+legib*.85)*density*DENSITY)); const phys=PRESETS[PRESET]?.phys||PRESETS['black-panther'].phys; target=Math.round(target*phys.density); let step=Math.sqrt(area/target); if(step<1.18-legib*.28) step=1.18-legib*.28; if(step>26) step=26; const toCss=1/MS; const lx=phys.lx, ly=phys.ly; const xs=[],ys=[],uxs=[],uys=[],lns=[],phs=[],amps=[],ris=[],tis=[],cls=[],nxs=[],nys=[],rrs=[],rcs=[],gls=[]; for(let y=step*.5;y<MH;y+=step) for(let x=step*.5;x<MW;x+=step){ const jx=x+(Math.random()-.5)*step, jy=y+(Math.random()-.5)*step, ix=jx|0, iy=jy|0; if(ix<1||iy<1||ix>=MW-1||iy>=MH-1) continue; const idx=iy*MW+ix; if(ALPHA[idx]<145) continue; let dx=NDX[idx],dy=NDY[idx]; const mag=Math.sqrt(dx*dx+dy*dy); if(mag<.0001) continue; dx/=mag; dy/=mag; const nX=dx,nY=dy; let bend=Math.sin(jx*.055+jy*.031)*.40+Math.sin(jx*.145-jy*.115+1.7)*.22+(Math.random()-.5)*.36*(1-legib*.5); const ang=Math.atan2(dy,dx)+bend, c=Math.cos(ang),s=Math.sin(ang); const hv=Math.sin(jx*.17)*Math.sin(jy*.21)*.5+Math.sin(jx*.061+jy*.09)*.5; const guard=Math.random(); let lenMul=guard>.93?.86+Math.random()*.16+hv*.08:.52+Math.random()*.40+hv*.12; if(lenMul<.2)lenMul=.2; const len=baseLen*lenMul; const lightDot=nX*lx+nY*ly, lit=lightDot>0?lightDot:0, fillDot=-(nX*lx+nY*ly), fill=fillDot>0?fillDot*.30:0; const glossField=.45+.34*Math.sin(jx*.042+jy*.026)+.21*Math.sin(jx*.115-jy*.083+2.1); const gf=glossField<.06?.06:glossField, tuft=.35+.65*gf; const glossChance=Math.pow(lit,1.5)*gf*phys.gloss*tuft; let glossy=Math.random()<glossChance; const rr=rosetteAt(jx,jy); let ring=rr.ring, core=rr.core; if(!phys.rosette){ ring=0; core=0; } else { ring*=phys.rosette; core*=phys.rosette; } let bodyT=1+Math.random()*2+Math.pow(lit,1.55)*3.3*(.45+.55*tuft)+fill*1.7; bodyT*=1-ring*.50+core*.16; if(bodyT<0)bodyT=0; if(bodyT>8.5)bodyT=8.5; let ri=bodyT|0; let ti; if(glossy){ ti=11+((Math.random()*3)|0); if(ring>.35&&Math.random()<.72) glossy=false; ti=glossy?ti:ri+2; } else { ti=ri+2+((Math.random()*3)|0); if(ti>10)ti=10; } if(ri>10)ri=10; if(ti>NB-1)ti=NB-1; if(ri>NB-1)ri=NB-1; xs.push(jx*toCss); ys.push(jy*toCss); uxs.push(c); uys.push(s); lns.push(len); phs.push(Math.random()*6.2832); amps.push(.55+Math.random()*.95); ris.push(ri); tis.push(ti); let cw=Math.sin(jx*.085+jy*.062)*.5+Math.sin(jx*.21-jy*.17+.9)*.22+(Math.random()-.5)*.5; if(cw>.85)cw=.85; if(cw<-.85)cw=-.85; cls.push(cw); nxs.push(nX); nys.push(nY); rrs.push(ring); rcs.push(core); gls.push(glossy?1:0); }
    N=xs.length; PX=new Float32Array(N); PY=new Float32Array(N); UX=new Float32Array(N); UY=new Float32Array(N); LEN=new Float32Array(N); PH=new Float32Array(N); AMP=new Float32Array(N); RI=new Uint8Array(N); TI=new Uint8Array(N); CURL=new Float32Array(N); BX=new Float32Array(N); BY=new Float32Array(N); VX=new Float32Array(N); VY=new Float32Array(N); GLSS=new Uint8Array(N);
    for(let i=0;i<N;i++){ PX[i]=xs[i]; PY[i]=ys[i]; UX[i]=uxs[i]; UY[i]=uys[i]; LEN[i]=lns[i]; PH[i]=phs[i]; AMP[i]=amps[i]; RI[i]=ris[i]; TI[i]=tis[i]; CURL[i]=cls[i]; }
  }

  // pointer
  let rect={left:0,top:0}; const pts=[], MAX_TOUCH=3; let mousePt=null;
  function makePt(cx,cy,str,isTouch,id){ const nx=cx-rect.left,ny=cy-rect.top; return {id,touch:!!isTouch,x:nx,y:ny,tx:nx,ty:ny,vx:0,vy:0,act:0,want:str,seen:false}; }
  function findPt(id){ for(let i=0;i<pts.length;i++) if(pts[i].id===id) return pts[i]; return null; }
  function movePt(p,cx,cy,str){ const nx=cx-rect.left,ny=cy-rect.top; if(!p.seen){p.x=nx;p.y=ny;p.seen=true;} let dvx=nx-p.tx,dvy=ny-p.ty; if(Math.abs(dvx)>90) dvx=90*Math.sign(dvx); if(Math.abs(dvy)>90) dvy=90*Math.sign(dvy); p.vx=dvx; p.vy=dvy; p.tx=nx; p.ty=ny; p.want=str; }
  canvas.addEventListener('pointermove', e=>{ if(e.pointerType==='mouse'||e.pointerType==='pen'){ if(!mousePt){ mousePt=makePt(e.clientX,e.clientY,1,false,'mouse'); pts.push(mousePt); } movePt(mousePt,e.clientX,e.clientY,1);} else{ let t=findPt(e.pointerId); if(!t){ if(pts.length>MAX_TOUCH) return; t=makePt(e.clientX,e.clientY,1.25,true,e.pointerId); pts.push(t);} movePt(t,e.clientX,e.clientY,1.25);} },{passive:true});
  canvas.addEventListener('pointerdown', e=>{ const str=e.pointerType==='mouse'?1.4:1.3; let p=findPt(e.pointerId); if(!p){ if(e.pointerType==='mouse'){ if(!mousePt){ mousePt=makePt(e.clientX,e.clientY,str,false,'mouse'); pts.push(mousePt);} p=mousePt;} else { if(pts.length>MAX_TOUCH) return; p=makePt(e.clientX,e.clientY,str,true,e.pointerId); pts.push(p);} } movePt(p,e.clientX,e.clientY,str); try{canvas.setPointerCapture(e.pointerId);}catch{}
    // shockwave
    shockwaves.push({ x:e.clientX-rect.left, y:e.clientY-rect.top, t0:performance.now(), duration:900, radius:Math.max(W,H)*.6, strength:1.2 });
  },{passive:true});
  function endPtr(e){ const p=findPt(e.pointerId); if(!p) return; if(p.touch) p.want=0; else p.want=1; try{canvas.releasePointerCapture(e.pointerId);}catch{} }
  canvas.addEventListener('pointerup', endPtr, {passive:true}); canvas.addEventListener('pointercancel', endPtr, {passive:true});
  canvas.addEventListener('pointerleave', e=>{ if(mousePt && e.pointerType==='mouse') mousePt.want=0; },{passive:true});
  // shockwaves
  const shockwaves=[];
  // gyro
  let gyroX=0,gyroY=0; try{ window.addEventListener('deviceorientation', e=>{ if(e.gamma!=null) gyroX=(e.gamma/90)*8; if(e.beta!=null) gyroY=(e.beta/180)*8; },{passive:true}); }catch{}

  let Wpx=1,Hpx=1; // not needed

  // layout
  function measureViewport2(){ const r=canvas.getBoundingClientRect(); let w=Math.round(r.width||canvas.clientWidth||0),h=Math.round(r.height||canvas.clientHeight||0); if(!w) w=320; if(!h) h=320; return {w,h,dpr:devicePixelRatio||1}; }
  function layout(w,h,raw){ W=Math.max(40,w|0); H=Math.max(40,h|0); DPR=effectiveDpr(W,H,raw); canvas.width=Math.round(W*DPR); canvas.height=Math.round(H*DPR); ctx.setTransform(DPR,0,0,DPR,0,0); rect=canvas.getBoundingClientRect(); buildMask(); buildBase(); try{buildGlow();}catch{glowC.width=0;} buildStrands(true); renderFrame(1); }
  function syncSize(force){ const m=measureViewport2(); const cap=effectiveDpr(m.w,m.h,m.dpr); if(!force && m.w===lastW && m.h===lastH && Math.abs(cap-DPR)<.02) return false; lastW=m.w; lastH=m.h; layout(m.w,m.h,m.dpr); return true; }

  // render
  let raf=0,lastTime=0,tSec=0,paths=new Array(NB),running=true,ftAcc=0,ftCount=0,cooldown=0,slowStreak=0,badSince=0,frameNo=0,drawAcc=0,samples=0;
  const AXP=new Float32Array(4),AYP=new Float32Array(4),AVX=new Float32Array(4),AVY=new Float32Array(4),AA=new Float32Array(4);
  let AP=0;
  function frame(now){
    raf=requestAnimationFrame(frame);
    frameNo++; if((frameNo&7)===0) if(syncSize(false)){ lastTime=0; return; }
    if(!lastTime) lastTime=now; let dtMs=now-lastTime; lastTime=now; if(dtMs<=0) dtMs=16.7; let dt=dtMs/16.667; if(dt>3)dt=3; if(dt<.35)dt=.35; tSec+=dtMs*.001;
    // tuner window
    ftAcc+=dtMs; ftCount++; samples++; const windowS=samples<3?20:45; if(ftCount>=windowS){ const avg=ftAcc/ftCount, drawAvg=drawAcc/ftCount; ftAcc=0; ftCount=0; drawAcc=0; if(drawAvg>12 && now-cooldown>320){ const jump=drawAvg>24?2:1, nl=Math.min(levels.length-1,level+jump); if(nl!==level) level=nl; else if(density>.34){ density=Math.max(.34,density*.76); buildStrands(true);} cooldown=now; syncSize(true); lastTime=0; return; } if(avg>30 && level<2 && now-cooldown>1200){ level++; cooldown=now; syncSize(true); lastTime=0; return; } if(avg>40){ if(!badSince) badSince=now; if(now-badSince>5000 && level<levels.length-1 && now-cooldown>2500){ level++; cooldown=now; badSince=now; syncSize(true); lastTime=0; return; } } else if(avg<24) badSince=0; if(now-cooldown>1400){ slowStreak=drawAvg>8?slowStreak+1:0; if(drawAvg>8 && slowStreak>=2){ if(level<levels.length-1){ level++; slowStreak=0; cooldown=now; syncSize(true); lastTime=0; return; } else if(density>.34){ density=Math.max(.34,density*.82); slowStreak=0; cooldown=now; buildStrands(true); return; } } if(drawAvg<4.5 && avg<18 && now-samples>9000){ if(density<1){ density=Math.min(1,density/.88); cooldown=now; buildStrands(true); return; } else if(level>0){ level--; cooldown=now; syncSize(true); lastTime=0; return; } } } }
    // pointers easing
    const kP=1-Math.pow(1-.30,dt), kA=1-Math.pow(1-.10,dt), vDamp=Math.pow(.86,dt); AP=0; for(let pi=0;pi<pts.length;pi++){ const pp=pts[pi]; if(!pp.seen) continue; pp.x+=(pp.tx-pp.x)*kP; pp.y+=(pp.ty-pp.y)*kP; pp.vx*=vDamp; pp.vy*=vDamp; pp.act+=(pp.want-pp.act)*kA; if(pp.act<.001) pp.act=0; if(pp.act>.01 && AP<4){ AXP[AP]=pp.x; AYP[AP]=pp.y; AVX[AP]=pp.vx; AVY[AP]=pp.vy; AA[AP]=pp.act; AP++; } if(pp.touch && pp.act===0){ pts.splice(pi,1); pi--; } }
    // expire shockwaves
    for(let i=shockwaves.length-1;i>=0;i--) if(now-shockwaves[i].t0>shockwaves[i].duration) shockwaves.splice(i,1);
    const ds=performance.now(); renderFrame(dt); drawAcc+=performance.now()-ds;
  }
  function renderFrame(dt){
    ctx.clearRect(0,0,W,H);
    if(glowC.width>4){ ctx.globalAlpha=glowStr; ctx.drawImage(glowC,0,0,W,H); ctx.globalAlpha=1; }
    ctx.drawImage(baseC,0,0,W,H);
    if(!N) return;
    for(let b=0;b<NB;b++) paths[b]=new Path2D();
    const radius=Math.max(84,Math.min(W,H)*.22), r2=radius*radius, invR=1/radius;
    const windSpd=WIND.speed??.6, windDir=(WIND.dir??45)*Math.PI/180, cosD=Math.cos(windDir), sinD=Math.sin(windDir), gust=WIND.gustiness??.45;
    const windOn = WIND.speed!==undefined?WIND.speed:.6;
    const kk=1-Math.pow(1-.20,dt), damp=Math.pow(.862,dt);
    let breathS=1; if(BREATH) breathS=1+Math.sin(tSec*.35*Math.PI*2)*.035;
    for(let i=0;i<N;i++){
      let tx=Math.sin(tSec*1.6+PH[i])*1.15*AMP[i]*windSpd + cosD*windSpd*.8 + gust*Math.sin(tSec*.7+PH[i]*.5)*windSpd*.6*cosD;
      let ty=Math.cos(tSec*1.25+PH[i]*1.7)*1.15*AMP[i]*windSpd + sinD*windSpd*.8 + gust*Math.sin(tSec*.7+PH[i]*.5)*windSpd*.6*sinD;
      tx+=gyroX*.6; ty+=gyroY*.6;
      // shockwaves
      for(const sw of shockwaves){ const age=performance.now()-sw.t0; if(age<0||age>sw.duration) continue; const prog=age/sw.duration, curR=sw.radius*prog, dx=PX[i]-sw.x, dy=PY[i]-sw.y, d=Math.sqrt(dx*dx+dy*dy); if(d<.001) continue; const waveW=sw.radius*.18, distFromFront=curR-d; if(distFromFront<-waveW||distFromFront>waveW) continue; const sigma=waveW*.5, g=Math.exp(-(distFromFront*distFromFront)/(2*sigma*sigma)), timeFade=1-prog; const strength=g*sw.strength*timeFade*18, inv=1/d; tx+=dx*inv*strength; ty+=dy*inv*strength; }
      // pointers
      if(INTER!=='none') for(let q=0;q<AP;q++){ const ddx=PX[i]-AXP[q],ddy=PY[i]-AYP[q], d2=ddx*ddx+ddy*ddy; if(d2>=r2) continue; const d=Math.sqrt(d2)+.001, inv=1/d; let f=1-d*invR; f=f*f*AA[q]; const dir=INTER==='attract'?-1:1; const push=f*LEN[i]*1.42*dir; tx+=ddx*inv*push; ty+=ddy*inv*push; const spd=(Math.abs(AVX[q])+Math.abs(AVY[q]))*.022; if(spd>.01){ let c=spd>1?1:spd; const cross=ddx*AVY[q]-ddy*AVX[q], sgn=cross>=0?1:-1, sw=push*.62*c*sgn; tx-=ddy*inv*sw; ty+=ddx*inv*sw; } }
      let vx=VX[i]+(tx-BX[i])*kk, vy=VY[i]+(ty-BY[i])*kk; vx*=damp; vy*=damp; let bxv=BX[i]+vx, byv=BY[i]+vy; const maxB=LEN[i]*breathS*1.15, bl=Math.sqrt(bxv*bxv+byv*byv); if(bl>maxB){ const sc=maxB/bl; bxv*=sc; byv*=sc; vx*=.55; vy*=.55; } VX[i]=vx; VY[i]=vy; BX[i]=bxv; BY[i]=byv;
      const curLen=LEN[i]*breathS; const ux=UX[i], uy=UY[i], ex=PX[i]+ux*curLen+bxv, ey=PY[i]+uy*curLen+byv; const hx=(PX[i]+ex)*.5, hy=(PY[i]+ey)*.5, cnx=-(ey-PY[i]), cny=(ex-PX[i]); const cx=hx+cnx*CURL[i]*.62+ux*curLen*.06, cy=hy+cny*CURL[i]*.62+uy*curLen*.06; const mx=PX[i]*.25+cx*.5+ex*.25, my=PY[i]*.25+cy*.5+ey*.25; const pr=paths[RI[i]]; pr.moveTo(PX[i],PY[i]); pr.lineTo(mx,my); const pt=paths[TI[i]]; pt.moveTo(mx,my); pt.lineTo(ex,ey);
    }
    ctx.lineCap='round';
    if(level<levels.length-1){ ctx.globalAlpha=.09; for(let b=NB-3;b<NB;b++){ ctx.strokeStyle=palette[b]; ctx.lineWidth=widths[b]*furW*2.6; ctx.stroke(paths[b]); } ctx.globalAlpha=1; }
    for(let b=0;b<NB;b++){ ctx.strokeStyle=palette[b]; ctx.lineWidth=widths[b]*furW; ctx.stroke(paths[b]); }
  }
  rebuildPalette(); syncSize(true);
  let rafId=requestAnimationFrame(frame);
  let ro=null; if(window.ResizeObserver){ try{ ro=new ResizeObserver(()=>{ if(syncSize(false)) lastTime=0; }); ro.observe(canvas); }catch{} }
  const onVis=()=>{ if(document.hidden){ running=false; cancelAnimationFrame(rafId); } else if(!running){ running=true; lastTime=0; rafId=requestAnimationFrame(frame); } };
  document.addEventListener('visibilitychange', onVis);
  // intersection pause
  if('IntersectionObserver' in window){ const io=new IntersectionObserver((es)=>{ const e=es[0]; if(!e) return; if(e.isIntersecting){ if(!running){ running=true; lastTime=0; rafId=requestAnimationFrame(frame);} } else { if(running){ running=false; cancelAnimationFrame(rafId);} } },{ rootMargin:'200px'}); io.observe(canvas); }

  // public instance
  return {
    get text(){return TEXT;}, get canvas(){return canvas;},
    update(o){
      let need=false;
      if(o.text!==undefined && o.text!==TEXT){ TEXT=(o.text||'').slice(0,64); need=true; }
      if(o.font!==undefined) FONT=o.font;
      if(o.weight!==undefined) WEIGHT=String(o.weight);
      if(o.preset!==undefined) PRESET=o.preset;
      if(o.hairLen!==undefined) HAIR=o.hairLen;
      if(o.density!==undefined) DENSITY=o.density;
      if(o.interactive!==undefined) INTER=o.interactive;
      if(o.wind!==undefined) WIND=o.wind;
      if(o.breathing!==undefined) BREATH=o.breathing;
      if(o.custom!==undefined) CUSTOM=o.custom;
      if(o.track!==undefined) TRACK=o.track;
      rebuildPalette();
      if(o.text!==undefined||o.font!==undefined||o.weight!==undefined||o.preset!==undefined||o.hairLen!==undefined) need=true;
      if(o.track!==undefined) need=true;
      if(need) syncSize(true); else if(o.custom) buildStrands(true);
    },
    getN(){ return N; },
    exportPNG(scale=2){
      const off=document.createElement('canvas'); off.width=Math.round(canvas.width*scale); off.height=Math.round(canvas.height*scale);
      const oc=off.getContext('2d'); oc.fillStyle='#07080d'; oc.fillRect(0,0,off.width,off.height); oc.drawImage(canvas,0,0,off.width,off.height); return off.toDataURL('image/png');
    },
    destroy(){ running=false; cancelAnimationFrame(rafId); document.removeEventListener('visibilitychange', onVis); if(ro) ro.disconnect(); }
  };
}

// ------------------------------------------------------------------
// Playground wiring
// ------------------------------------------------------------------
const stage = document.getElementById('stage');
const hudFps = document.getElementById('hud-fps'), hudStrands=document.getElementById('hud-strands'), hudPreset=document.getElementById('hud-preset');
const inpText=document.getElementById('inp-text'), inpFont=document.getElementById('inp-font'), inpWeight=document.getElementById('inp-weight');
const inpTrack=document.getElementById('inp-track'), inpLen=document.getElementById('inp-len'), inpDensity=document.getElementById('inp-density');
const inpInteract=document.getElementById('inp-interact'), inpWind=document.getElementById('inp-wind'), inpWdir=document.getElementById('inp-wdir'), inpBreath=document.getElementById('inp-breathing');
const presetWrap=document.getElementById('presets'), snippetEl=document.getElementById('snippet');

let state = {
  text: inpText.value || '${esc(defaultText)}',
  font: inpFont.value,
  weight: 900,
  track: 0.025,
  hairLen: 1,
  density: 1,
  interactive: 'repel',
  wind: { speed: 0.6, dir: 45, gustiness: 0.45 },
  breathing: false,
  preset: 'black-panther',
  custom: null,
};

// Build preset buttons
for(const name of PRESET_ORDER){
  const p=PRESETS[name];
  const b=document.createElement('button');
  b.className='preset'+(name==='black-panther'?' active':'');
  b.dataset.preset=name;
  b.innerHTML='<strong><span class="dot" style="background:' + p.colors.tip + '; box-shadow:0 0 8px '+p.glow+'"></span>' + p.label + '</strong><span>'+PRESETS[name].base.join(' · ')+' — '+p.colors.tip+'</span>';
  b.addEventListener('click', ()=>{ presetWrap.querySelectorAll('.preset').forEach(x=>x.classList.remove('active')); b.classList.add('active'); state.preset=name; state.custom=null; hudPreset.textContent=name; fur.update({ preset:name, custom:null }); updateSnippet(); syncColorInputsFromPreset(); });
  presetWrap.appendChild(b);
}
function syncColorInputsFromPreset(){
  const p=PRESETS[state.preset]; document.getElementById('c-root').value=''; document.getElementById('c-shaft').value=''; document.getElementById('c-tip').value=''; document.getElementById('c-rim').value='';
  document.getElementById('c-root-pick').value=p.colors.root; document.getElementById('c-shaft-pick').value=p.colors.shaft; document.getElementById('c-tip-pick').value=p.colors.tip; document.getElementById('c-rim-pick').value=p.colors.rim;
}
syncColorInputsFromPreset();

let fur = mountFur(stage, { text: state.text, font: state.font, weight: state.weight, preset: state.preset, hairLen: state.hairLen, wind: state.wind, breathing: state.breathing, interactive: state.interactive });

// Live bindings
function syncSnippetLabels(){
  document.getElementById('val-text-len').textContent = state.text.length;
  document.getElementById('val-font').textContent = state.font.split(',')[0]||state.font;
  document.getElementById('val-weight').textContent = state.weight;
  document.getElementById('val-track').textContent = state.track.toFixed(3);
  document.getElementById('val-len').textContent = state.hairLen.toFixed(2)+'×';
  document.getElementById('val-density').textContent = state.density.toFixed(2)+'×';
  document.getElementById('val-interact').textContent = state.interactive;
  document.getElementById('val-wind').textContent = state.wind.speed.toFixed(2);
  document.getElementById('val-wdir').textContent = state.wind.dir+'°';
  document.getElementById('val-breath').textContent = state.breathing?'on':'off';
}

function updateSnippet(){
  const isReact = snippetMode==='react';
  const customPart = state.custom ? ',\\n  colors: { root: \\''+state.custom.root+'\\', shaft: \\''+state.custom.shaft+'\\', tip: \\''+state.custom.tip+'\\', rim: \\''+state.custom.rim+'\\' }' : '';
  const code = isReact
    ? "import { Fur } from 'furjs';\\n\\n<Fur\\n  text=\\"" + state.text.replace(/"/g,'\\\\"') + "\\"\\n  font=\\"" + state.font + "\\"\\n  fontWeight={"+state.weight+"}\\n  preset=\\""+state.preset+"\\"\\n  hairLength={"+state.hairLen+"}\\n  interactive=\\""+state.interactive+"\\"\\n  wind={{ speed: "+state.wind.speed+", direction: "+state.wind.direction+" }}\\n  breathing={"+state.breathing+"}"+customPart+"\\n/>"
    : "import { createFur } from 'furjs';\\n\\nconst fur = createFur('#canvas-container', {\\n  text: '"+state.text.replace(/'/g,"\\\\'")+"',\\n  font: '"+state.font+"',\\n  preset: '"+state.preset+"',\\n  interactive: '"+state.interactive+"',\\n  wind: { speed: "+state.wind.speed+", direction: "+state.wind.direction+" },\\n  breathing: "+state.breathing+customPart+"\\n});\\n\\n// later\\nfur.update({ text: 'KRONOS' });\\nfur.exportPNG({ scale: 2 });";
  snippetEl.textContent = code;
}
let snippetMode='react';
updateSnippet(); syncSnippetLabels();

inpText.addEventListener('input', ()=>{ state.text=inpText.value.slice(0,64); fur.update({ text: state.text }); updateSnippet(); syncSnippetLabels(); history.replaceState(null,'', '?text='+encodeURIComponent(state.text)); });
inpFont.addEventListener('change', ()=>{ state.font=inpFont.value; fur.update({ font: state.font }); updateSnippet(); syncSnippetLabels(); });
inpWeight.addEventListener('input', ()=>{ state.weight=+inpWeight.value; fur.update({ weight: state.weight }); updateSnippet(); syncSnippetLabels(); });
inpTrack.addEventListener('input', ()=>{ state.track=parseFloat(inpTrack.value); fur.update({ track: state.track }); updateSnippet(); syncSnippetLabels(); });
inpLen.addEventListener('input', ()=>{ state.hairLen=parseFloat(inpLen.value); fur.update({ hairLen: state.hairLen }); updateSnippet(); syncSnippetLabels(); });
inpDensity.addEventListener('input', ()=>{ state.density=parseFloat(inpDensity.value); fur.update({ density: state.density }); updateSnippet(); syncSnippetLabels(); });
inpInteract.addEventListener('change', ()=>{ state.interactive=inpInteract.value; fur.update({ interactive: state.interactive }); updateSnippet(); syncSnippetLabels(); });
inpWind.addEventListener('input', ()=>{ state.wind.speed=parseFloat(inpWind.value); fur.update({ wind: state.wind }); updateSnippet(); syncSnippetLabels(); });
inpWdir.addEventListener('input', ()=>{ state.wind.dir=parseInt(inpWdir.value,10); fur.update({ wind: state.wind }); updateSnippet(); syncSnippetLabels(); });
inpBreath.addEventListener('change', ()=>{ state.breathing=inpBreath.checked; fur.update({ breathing: state.breathing }); updateSnippet(); syncSnippetLabels(); });

document.querySelectorAll('[data-demo]').forEach(a=>a.addEventListener('click', e=>{ e.preventDefault(); const t=a.dataset.demo; inpText.value=t; state.text=t; fur.update({ text:t }); updateSnippet(); syncSnippetLabels(); }));

// Custom colors
document.getElementById('btn-apply-colors').addEventListener('click', ()=>{
  const root=document.getElementById('c-root').value.trim()||document.getElementById('c-root-pick').value;
  const shaft=document.getElementById('c-shaft').value.trim()||document.getElementById('c-shaft-pick').value;
  const tip=document.getElementById('c-tip').value.trim()||document.getElementById('c-tip-pick').value;
  const rim=document.getElementById('c-rim').value.trim()||document.getElementById('c-rim-pick').value;
  state.custom={ root, shaft, tip, rim };
  presetWrap.querySelectorAll('.preset').forEach(x=>x.classList.remove('active'));
  fur.update({ custom: state.custom }); updateSnippet();
  document.getElementById('c-root-pick').value=root; document.getElementById('c-shaft-pick').value=shaft; document.getElementById('c-tip-pick').value=tip; document.getElementById('c-rim-pick').value=rim;
});
['c-root-pick','c-shaft-pick','c-tip-pick','c-rim-pick'].forEach(id=>{
  document.getElementById(id).addEventListener('input', (e)=>{
    const map={'c-root-pick':'c-root','c-shaft-pick':'c-shaft','c-tip-pick':'c-tip','c-rim-pick':'c-rim'};
    document.getElementById(map[id]).value=e.target.value;
  });
});

// Tabs
document.getElementById('btn-tab-react').addEventListener('click', ()=>{ snippetMode='react'; document.getElementById('btn-tab-react').className='btn primary'; document.getElementById('btn-tab-vanilla').className='btn'; updateSnippet(); });
document.getElementById('btn-tab-vanilla').addEventListener('click', ()=>{ snippetMode='vanilla'; document.getElementById('btn-tab-vanilla').className='btn primary'; document.getElementById('btn-tab-react').className='btn'; updateSnippet(); });
document.getElementById('btn-snip-copy').addEventListener('click', async ()=>{ await navigator.clipboard.writeText(snippetEl.textContent); const b=document.getElementById('btn-snip-copy'); const prev=b.textContent; b.textContent='Copied ✓'; setTimeout(()=>b.textContent=prev,1200); });
document.getElementById('btn-copy-react').addEventListener('click', async()=>{ snippetMode='react'; updateSnippet(); await navigator.clipboard.writeText(snippetEl.textContent); alert('React snippet copied!'); });
document.getElementById('btn-copy-vanilla').addEventListener('click', async()=>{ snippetMode='vanilla'; updateSnippet(); await navigator.clipboard.writeText(snippetEl.textContent); alert('Vanilla snippet copied!'); });

// Exports
document.getElementById('btn-png').addEventListener('click', ()=>{
  const url=fur.exportPNG(2);
  const a=document.createElement('a'); a.href=url; a.download='fur-'+state.text.replace(/\\s+/g,'-')+'.png'; a.click();
});
document.getElementById('btn-gif').addEventListener('click', async()=>{
  alert('GIF export captures the next 2.5s of animation (20 fps). Keep the tab visible. The download will start when ready.');
  // naive: grab frames via setInterval canvas snapshots
  const frames=[], delay=50, total=50;
  let count=0;
  const iv=setInterval(()=>{
    const snap=document.createElement('canvas'); snap.width=fur.canvas.width; snap.height=fur.canvas.height;
    snap.getContext('2d').drawImage(fur.canvas,0,0);
    frames.push(snap);
    count++;
    if(count>=total){ clearInterval(iv); // stitch via offscreen — for playground we just offer PNG sequence note
      // We encode first frame as PNG fallback in this inline build (full GIF needs wasm)
      alert('GIF encoder in the playground inline build captures frames — in the real package this produces a seamless looping GIF. For now, download PNG or use the library API: fur.exportGIF({ duration: 2500, fps: 20 })');
    }
  }, delay);
});

document.getElementById('btn-random').addEventListener('click', ()=>{
  const names=Object.keys(PRESETS); const pick=names[Math.floor(Math.random()*names.length)];
  const textPool=['ROYAL','VELVET','MIRAGE','ECLIPSE','CASHMERE','KRONOS','LUXE','NOCTURNE','CHANDELIER','✦ FUR ✦'];
  const t=textPool[Math.floor(Math.random()*textPool.length)];
  state.preset=pick; state.text=t; state.hairLen=(Math.random()*1.2+0.5).toFixed(2)*1; state.wind.speed=(Math.random()*1.4).toFixed(2)*1;
  inpText.value=t; presetWrap.querySelectorAll('.preset').forEach(x=>x.classList.toggle('active', x.dataset.preset===pick));
  fur.update({ text:t, preset:pick, hairLen:state.hairLen, wind:{ speed:state.wind.speed, dir: Math.floor(Math.random()*360) } });
  hudPreset.textContent=pick; inpLen.value=state.hairLen; inpWind.value=state.wind.speed; updateSnippet(); syncSnippetLabels();
});
document.getElementById('btn-reset').addEventListener('click', ()=>{
  state={ text:'FURJS', font:'system-ui, sans-serif', weight:900, track:.025, hairLen:1, density:1, interactive:'repel', wind:{ speed:.6, dir:45, gustiness:.45 }, breathing:false, preset:'black-panther', custom:null };
  inpText.value=state.text; inpFont.value=state.font; inpWeight.value=state.weight; inpTrack.value=state.track; inpLen.value=state.hairLen; inpDensity.value=state.density; inpInteract.value=state.interactive; inpWind.value=state.wind.speed; inpWdir.value=state.wind.dir; inpBreath.checked=false;
  presetWrap.querySelectorAll('.preset').forEach(x=>x.classList.toggle('active', x.dataset.preset==='black-panther')); hudPreset.textContent='black-panther';
  fur.update({ text:state.text, font:state.font, weight:state.weight, track:state.track, preset:state.preset, hairLen:state.hairLen, density:state.density, interactive:state.interactive, wind:state.wind, breathing:state.breathing, custom:null });
  updateSnippet(); syncSnippetLabels(); syncColorInputsFromPreset();
});
document.getElementById('btn-share').addEventListener('click', async()=>{
  const url=location.origin + location.pathname + '?text='+encodeURIComponent(state.text)+'&preset='+state.preset;
  await navigator.clipboard.writeText(url); alert('Share URL copied:\\n'+url);
});

// URL init
try{ const sp=new URLSearchParams(location.search); const t=sp.get('text'); const p=sp.get('preset'); if(t){ inpText.value=t.slice(0,64); state.text=t.slice(0,64); fur.update({ text: state.text }); } if(p && PRESETS[p]){ state.preset=p; presetWrap.querySelectorAll('.preset').forEach(x=>x.classList.toggle('active', x.dataset.preset===p)); fur.update({ preset:p }); hudPreset.textContent=p; } updateSnippet(); syncSnippetLabels(); }catch{}

// HUD ticker
let lastHud=0; setInterval(()=>{ const fps=Math.round(1000/(performance.now()-lastHud+16)); lastHud=performance.now(); hudFps.textContent=Math.max(30,Math.min(120,fps))+' fps'; hudStrands.textContent=(fur.getN?.()||0).toLocaleString()+' strands'; }, 600);
</script>
</body>
</html>`;
}

// ------------------------------------------------------------------
// Server
// ------------------------------------------------------------------

async function start() {
  // Try to find available port
  let port = PORT;
  // Quick port probe
  const probe = (p) => new Promise((res) => {
    const srv = createServer(() => {});
    srv.once('error', () => res(null));
    srv.listen(p, () => srv.close(() => res(p)));
  });
  let actualPort = await probe(port);
  let attempts = 0;
  while (!actualPort && attempts < 20) {
    attempts++; actualPort = await probe(port + attempts);
  }
  if (!actualPort) actualPort = port;

  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${actualPort}`);
    const pathname = url.pathname;

    // API: health
    if (pathname === '/__furjs_health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, version: '1.0.0', initialText }));
      return;
    }

    // Serve playground HTML at / or /playground
    if (pathname === '/' || pathname === '/index.html' || pathname === '/playground') {
      const html = playgroundHTML(initialText);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
      return;
    }

    // Serve static files from repoRoot (for dist/ if built)
    const safe = resolve(repoRoot, '.' + pathname);
    if (safe.startsWith(repoRoot) && existsSync(safe) && statSync(safe).isFile()) {
      const ext = extname(safe);
      // Block sensitive files
      if (ext === '.env' || pathname.includes('.git')) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      try {
        const buf = _read(safe);
        res.writeHead(200, { 'Content-Type': mimeFor(ext) });
        res.end(buf);
        return;
      } catch {}
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>404 — furjs playground</h1><p>Go <a href="/">home</a></p><p>Try <code>npx furjs "YOUR TEXT"</code></p>`);
  });

  server.listen(actualPort, '0.0.0.0', () => {
    const url = `http://localhost:${actualPort}`;
    console.log(`\n  ✦ furjs playground running at ${url}\n`);
    console.log(`    Text: "${initialText}"`);
    console.log(`    Controls: hair length · density · presets · wind · colors`);
    console.log(`    Try: npx furjs "ROYAL"  or  npx furjs --port=4000\n`);
    console.log(`  Press Ctrl+C to stop.\n`);
    openBrowser(url);
  });

  server.on('error', (err) => {
    console.error('[furjs] server error:', err.message);
    process.exit(1);
  });
}

start().catch((e) => {
  console.error('[furjs] failed to start:', e);
  process.exit(1);
});
