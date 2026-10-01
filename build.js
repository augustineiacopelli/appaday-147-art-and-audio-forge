// Assembles index.html: KIT:CORE CSS and JS copied byte for byte from Day 146, then the Day 147 fences.
'use strict';
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const src146 = fs.readFileSync(require('./day146'), 'utf8');

function fence(text, open, close) {
  const a = text.indexOf(open), z = text.indexOf(close);
  if (a < 0 || z < 0) throw new Error('Fence not found: ' + open);
  return text.slice(a, z + close.length);
}
const kitCss = fence(src146, '/* === KIT:CORE CSS BEGIN === */', '/* === KIT:CORE CSS END === */');
const kitJs = fence(src146, '// === KIT:CORE BEGIN ===', '// === KIT:CORE END ===');
const demoJson = JSON.stringify(JSON.parse(R('test/out/demo-bundle.json')));
const demoSrc = R('src/art-demo.js').replace('/*DEMO_JSON*/null', () => demoJson);
const buildLog = R('src/build-log.txt');
// ENGINE:RENDER is one fence in the output. Later phases keep their engine sections in their own source files, spliced in
// order above the freeze line, so each phase's engine code stays readable on its own.
const ENGINE_SECTIONS = ['src/engine-sprites.js'];
const FREEZE = '  // ---------------------------------------------------------------- later phases insert sections above this line';
const engineBase = R('src/engine-render.js');
if (engineBase.split(FREEZE).length !== 2) throw new Error('ENGINE:RENDER freeze marker not found exactly once.');
const engineRender = engineBase.replace(FREEZE, () => ENGINE_SECTIONS.map((f) => R(f).replace(/\s+$/, '') + '\n\n').join('') + FREEZE).trim();

const artCss = `/* === ART:SHELL CSS BEGIN === */
.size-btn { padding: 0 8px; }
.size-btn .chip { pointer-events: none; }
.store-banner { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px 16px; background: color-mix(in srgb, var(--danger) 16%, var(--bg2)); border-bottom: 1px solid var(--danger); color: var(--ink); font-weight: 700; }
.store-banner[hidden] { display: none; }
.store-banner span { flex: 1 1 240px; min-width: 0; }
.a7-hero .btn-row { margin-top: 10px; }
.a7-grid { margin-top: 14px; margin-bottom: 14px; }
.a7-grid .card .section-h { margin-top: 0; }
.a7-prefixes { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.a7-meter { height: 14px; border-radius: 99px; background: var(--bg2); border: 1px solid var(--line2); overflow: hidden; margin: 4px 0 8px; }
.a7-meter i { display: block; height: 100%; background: var(--ok); }
.a7-meter.a7-amber i { background: var(--warn); }
.a7-meter.a7-red i { background: var(--danger); }
.a7-fixtures { margin: 10px 0 14px; }
.tbl .num { text-align: right; font-variant-numeric: tabular-nums; }
.brand-title { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
@media (max-width: 520px) { .brand-title { font-size: 1.02rem; letter-spacing: .03em; } .brand-num { display: none; } }
/* === ART:SHELL CSS END === */`;

const html = `<!--
${buildLog.trim()}
-->
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Art and Audio Forge | AppADay 147</title>
<meta name="description" content="Art and Audio Forge: dress a Saga Forge bundle with pixel art, tiles, battle presentation, and chiptune audio. AppADay 147.">
<meta name="theme-color" content="#10121a">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Alegreya+Sans:ital,wght@0,400;0,500;0,700;0,800;1,400&family=Cinzel:wght@500;700&display=swap" rel="stylesheet">
<style>
${kitCss}
${artCss}
${R('src/art-palette.css').trim()}
${R('src/art-sprites.css').trim()}
</style>
</head>
<body>
<div class="app" id="app">
  <header class="app-head">
    <div class="brand">
      <h1 class="brand-title">Art and Audio Forge</h1>
      <span class="brand-num">App 147</span>
    </div>
    <a class="backlink" href="https://augustineiacopelli.github.io/appaday/" title="Back to the AppADay portfolio">&larr; AppADay</a>
    <button class="btn btn-ghost btn-icon" id="btnTheme" type="button" aria-label="Toggle night and parchment theme" title="Toggle theme"></button>
    <button class="btn btn-ghost btn-icon" id="btnSettings" type="button" aria-label="Settings" title="Settings"></button>
  </header>
  <div class="topbar" role="toolbar" aria-label="Project">
    <button class="btn btn-ghost proj-title" id="btnTitle" type="button" title="Rename project"><span class="t">Untitled Saga</span></button>
    <button class="btn size-btn" id="btnSize" type="button" aria-label="Bundle size"></button>
    <button class="btn vbadge" id="btnValidation" type="button" title="Open validation panel" aria-label="Validation status"></button>
    <div class="top-actions">
      <button class="btn" id="btnSave" type="button" title="Save draft (Ctrl+S)"></button>
      <button class="btn" id="btnSlots" type="button" title="Project slots"></button>
      <button class="btn" id="btnImport" type="button" title="Import a bundle"></button>
      <button class="btn" id="btnExport" type="button" title="Export the bundle"></button>
    </div>
    <input type="file" id="fileImport" accept=".json,application/json" hidden>
  </div>
  <div class="store-banner" id="storeBanner" role="alert" hidden><span>This browser refused to save the draft because storage is full. Export the bundle now so no work is lost.</span><button class="btn btn-primary" id="btnBannerExport" type="button">Export now</button></div>
  <nav class="tabs" id="tabs" role="tablist" aria-label="Workspaces"></nav>
  <main class="ws" id="ws" tabindex="-1"></main>
  <footer class="app-foot">
    <span>Art and Audio Forge &middot; AppADay 147</span>
    <a class="backlink" href="https://augustineiacopelli.github.io/appaday/">augustineiacopelli.github.io/appaday</a>
  </footer>
</div>
<div id="overlays"></div>
<div class="toast-root" id="toasts" aria-live="polite" role="status"></div>
<script>
${kitJs}
${R('src/art-store.js').trim()}
${demoSrc.trim()}
${R('src/art-contract.js').trim()}
${engineRender}
${R('src/art-palette.js').trim()}
${R('src/ws-palette.js').trim()}
${['src/art-sprites.js', 'src/art-pixed.js', 'src/ws-sprites.js', 'src/ws-interface.js'].filter((f) => fs.existsSync(path.join(__dirname, f))).map((f) => R(f).trim()).join('\n')}
${R('src/ws-art147.js').trim()}
${R('src/app-boot.js').trim()}
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(__dirname, 'index.html'), html);
// Verbatim check: the KIT:CORE fences in the output must equal Day 146's byte for byte.
const out = R('index.html');
const same = fence(out, '// === KIT:CORE BEGIN ===', '// === KIT:CORE END ===') === kitJs && fence(out, '/* === KIT:CORE CSS BEGIN === */', '/* === KIT:CORE CSS END === */') === kitCss;
console.log('index.html', out.length, 'chars,', out.split('\n').length, 'lines; KIT:CORE verbatim:', same);
if (!same) process.exit(1);
