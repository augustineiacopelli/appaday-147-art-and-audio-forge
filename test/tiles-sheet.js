// Contact sheets for tiles (eyeballing only): every tileset's 47 blob set, every interior tile, the test room map with
// its biome transitions, and every battle background. node tiles-sheet.js [tileSize]
'use strict';
const path = require('path');
const { boot } = require('./boot');
const { sheet, png } = require('./png');
const fs = require('fs');

// A 2D context that paints into an RGBA buffer. Only what the engine's tile and background paths use.
function pixelCtx(w, h) {
  const buf = new Uint8ClampedArray(w * h * 4);
  const ctx = {
    canvas: { width: w, height: h }, globalAlpha: 1, imageSmoothingEnabled: false, _fill: [0, 0, 0],
    set fillStyle(v) { const m = /^#([0-9a-f]{6})$/i.exec(v); if (m) this._fill = [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4), 16)]; else { const r = /rgb\((\d+),(\d+),(\d+)\)/.exec(v); if (r) this._fill = [+r[1], +r[2], +r[3]]; } },
    get fillStyle() { return '#000000'; },
    fillRect(x, y, ww, hh) {
      x = Math.round(x); y = Math.round(y); ww = Math.round(ww); hh = Math.round(hh);
      const a = this.globalAlpha;
      for (let yy = Math.max(0, y); yy < Math.min(h, y + hh); yy++) for (let xx = Math.max(0, x); xx < Math.min(w, x + ww); xx++) {
        const o = (yy * w + xx) * 4;
        buf[o] = buf[o] * (1 - a) + this._fill[0] * a; buf[o + 1] = buf[o + 1] * (1 - a) + this._fill[1] * a; buf[o + 2] = buf[o + 2] * (1 - a) + this._fill[2] * a; buf[o + 3] = 255;
      }
    },
    drawImage() {}, save() {}, restore() {}, translate() {}
  };
  return { ctx, buf, w, h };
}

(async () => {
  const { win } = boot(path.join(__dirname, '..', 'index.html'), { url: 'https://augustineiacopelli.github.io/appaday/147/' });
  await new Promise((r) => setTimeout(r, 80));
  const Kit = win.Kit, ART = win.ART, ER = win.ENGINE_RENDER, ET = ER.tiles;
  const T = +(process.argv[2] || 16);
  const bundle = win.ART_DEMO.bundle();
  bundle.charter.specs.tileSize = T;
  Kit.bundle.load(bundle); ART.quickBuild.run();
  const b = Kit.bundle.current(), ent = ART.palette.entries(b);
  const k = ER.createCache(b.art, { size: T, entries: ent, budget: 256e6 });
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Blob sets: one row of 47 per tileset (biomes, then interior autotiles).
  const cells = [];
  ART.tiles.ordered(b).forEach((t) => { for (let i = 0; i < 47; i++) cells.push(k.tile(t.id, i, 0)); cells.push(null); });
  ART.tiles.interiors(b).forEach((t) => (t.tiles || []).filter((it) => it.autotile).forEach((it) => { for (let i = 0; i < 47; i++) cells.push(k.tile(t.id, i, 0, it.key)); cells.push(null); }));
  sheet(path.join(outDir, 'tiles-blob-' + T + '.png'), cells, { cols: 48, scale: T <= 16 ? 2 : 1, pad: 1 });

  // 2. Interior single tiles and animation frames.
  const items = [];
  ART.tiles.interiors(b).forEach((t) => (t.tiles || []).forEach((it) => { for (let f = 0; f < (it.anim ? 4 : 1); f++) items.push(k.tile(t.id, it.autotile ? 46 : 0, f, it.key)); }));
  sheet(path.join(outDir, 'tiles-interior-' + T + '.png'), items, { cols: 12, scale: T <= 16 ? 4 : 2 });

  // 3. The test room, drawn through drawMap (below, a stand in for the player, above).
  const room = ART.tiles.room(b, 7, 40, 30);
  const P = pixelCtx(room.w * T, room.h * T);
  const t0 = Date.now();
  const st = ET.drawMap(P.ctx, k, room, { x: 0, y: 0, w: room.w * T, h: room.h * T }, 0);
  ET.drawMap(P.ctx, k, room, { x: 0, y: 0, w: room.w * T, h: room.h * T }, 0, { layer: 'above' });
  fs.writeFileSync(path.join(outDir, 'tiles-room-' + T + '.png'), png(P.w, P.h, P.buf));
  console.log('room', room.w + 'x' + room.h, 'blits', st.blits, 'in', Date.now() - t0, 'ms; start', room.start, 'town', JSON.stringify(room.town), 'ruin', JSON.stringify(room.ruin));

  // 4. Battle backgrounds at the Charter resolution.
  const bgs = ART.tiles.backgrounds(b).map((r) => { const Q = pixelCtx(256, 224); ER.bg.draw(Q.ctx, r, 1200, 256, 224, { entries: ent }); return { w: 256, h: 224, rgba: Q.buf }; });
  sheet(path.join(outDir, 'tiles-bg.png'), bgs, { cols: 4, scale: 1, pad: 4 });
  console.log('cache', JSON.stringify(k.stats()));
  win.close();
})();
