  // ================================================================ PHASE 4: TILES
  // build.js splices this file into ENGINE:RENDER after engine-motion.js. It reads no host global.

  // ---------------------------------------------------------------- tile palette layout and flags
  // Tilesets use 32 local slots: 0 transparent, 1 outline, then six material ramps. Slots 28 to 31 are spare and point
  // at the outline. Terrain needs more simultaneous ramps than a character, and tiles are never swapped by tier.
  var TILE_SLOTS = 32;
  var TILE_RAMPS = { A: [2, 3, 4, 5, 6], B: [7, 8, 9, 10, 11], C: [12, 13, 14, 15], D: [16, 17, 18, 19], E: [20, 21, 22, 23], F: [24, 25, 26, 27] };
  var TA = TILE_RAMPS.A, TB = TILE_RAMPS.B, TC = TILE_RAMPS.C, TD = TILE_RAMPS.D, TE = TILE_RAMPS.E, TF = TILE_RAMPS.F;
  var FLAGS = { passable: 1, encounter: 2, swim: 4, damage: 8, counter: 16, above: 32 };
  function tileSlots(master, mats) {
    var s = new Array(TILE_SLOTS), out = outline(master);
    for (var i = 0; i < TILE_SLOTS; i++) s[i] = out;
    s[0] = null;
    Object.keys(TILE_RAMPS).forEach(function (k) { (TILE_RAMPS[k] || []).forEach(function (slot, j) { var v = mats[k] && mats[k][j]; if (typeof v === 'number' && v >= 0 && v < master.length) s[slot] = v; }); });
    return s;
  }
  // Fits material source colors {A: hex, ...} to the master: {A: [m x5], B: [m x5], C..F: [m x4]}.
  function tileColorway(master, src) {
    // Materials may share master colors (terrain often should), so no material avoids another's picks.
    var cw = {};
    Object.keys(TILE_RAMPS).forEach(function (k) {
      var hex = src && src[k] || '#808080';
      cw[k] = master.length <= 4 ? TILE_RAMPS[k].map(function (_, j) { return nearest(master, lchToHex(0.18 + 0.78 * j / (TILE_RAMPS[k].length - 1), 0, 0)); }) : rampFor(master, hex, TILE_RAMPS[k].length, k === 'A' || k === 'B' ? 0.09 : 0.11);
    });
    return cw;
  }

  // ---------------------------------------------------------------- periodic noise
  function hh(x, y, k) {
    var h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul((y | 0) + 0x3c6ef372, 0x165667b1) ^ Math.imul(k | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function mod(a, n) { return ((a % n) + n) % n; }
  // n cells across one tile, wrapping, so every texture repeats exactly at the tile size and fills join seamlessly.
  function pnoise(lx, ly, T, n, k) {
    var gx = lx / T * n, gy = ly / T * n, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = smooth(gx - x0), fy = smooth(gy - y0);
    var x1 = mod(x0 + 1, n), y1 = mod(y0 + 1, n); x0 = mod(x0, n); y0 = mod(y0, n);
    var a = hh(x0, y0, k), b = hh(x1, y0, k), c = hh(x0, y1, k), d = hh(x1, y1, k);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  // The detail cell: about a sixteenth of a tile, always a divisor of the tile size so hashed cells tile too.
  function detailCell(T) { var d = Math.max(1, Math.round(T / 16)); while (T % d) d--; return d; }
  function makeCtx(T, seed, params, ph, variant) {
    var dc = detailCell(T), N = T / dc;
    return {
      T: T, dc: dc, N: N, seed: seed >>> 0, p: params || {}, ph: ph || 0, v: variant || 0,
      n: function (lx, ly, cells, k) { return pnoise(lx, ly, T, cells, (seed + k * 7919) | 0); },
      h: function (cx, cy, k) { return hh(mod(cx, N), mod(cy, N), (seed + k * 104729) | 0); },
      d: function (key, def) { var v = Number(params && params[key]); return isFinite(v) ? v : def; }
    };
  }

  // ---------------------------------------------------------------- the blob set (47 tiles)
  // Neighbor bits: N 1, NE 2, E 4, SE 8, S 16, SW 32, W 64, NW 128. The corner rule: a diagonal counts only when both
  // of its adjacent edges match. Reducing all 256 masks by that rule leaves exactly 47 distinct tiles.
  var BN = 1, BNE = 2, BE = 4, BSE = 8, BS = 16, BSW = 32, BW = 64, BNW = 128;
  function reduceMask(m) {
    m &= 255;
    if (!((m & BN) && (m & BE))) m &= ~BNE;
    if (!((m & BS) && (m & BE))) m &= ~BSE;
    if (!((m & BS) && (m & BW))) m &= ~BSW;
    if (!((m & BN) && (m & BW))) m &= ~BNW;
    return m;
  }
  var BLOB = [], BLOB_INDEX = new Int16Array(256);
  (function () {
    var seen = {};
    for (var m = 0; m < 256; m++) { var r = reduceMask(m); if (!seen[r]) { seen[r] = 1; BLOB.push(r); } }
    BLOB.sort(function (a, b) { return a - b; });
    for (var k = 0; k < 256; k++) BLOB_INDEX[k] = BLOB.indexOf(reduceMask(k));
  })();
  function blobIndex(mask) { return BLOB_INDEX[mask & 255]; }
  var BLOB_FULL = BLOB_INDEX[255];
  // mask8(grid, x, y, sameFn): grid {w, h, cells}. Off the map, a neighbor repeats the nearest edge cell, so a region
  // runs cleanly off the screen edge instead of growing a border there.
  var DIRS8 = [[0, -1, BN], [1, -1, BNE], [1, 0, BE], [1, 1, BSE], [0, 1, BS], [-1, 1, BSW], [-1, 0, BW], [-1, -1, BNW]];
  function mask8(grid, x, y, sameFn) {
    var w = grid.w, h = grid.h, c = grid.cells, me = c[y * w + x], m = 0;
    for (var i = 0; i < 8; i++) {
      var nx = clamp(x + DIRS8[i][0], 0, w - 1), ny = clamp(y + DIRS8[i][1], 0, h - 1);
      if (sameFn(me, c[ny * w + nx])) m |= DIRS8[i][2];
    }
    return m;
  }

  // ---------------------------------------------------------------- templates and compose47
  // A template is a 2 by 3 tile block: top left the isolated preview, top right four inner corner quarters, the bottom
  // 2 by 2 a square patch whose quarters are outer corners, edges, and fill. Each tile of the 47 is assembled from four
  // quarters. Parity is kept (a left half quarter always comes from a left half), so textures and odd sizes line up.
  // [vertical bit, horizontal bit, diagonal bit, corner x, corner y, fill, inner, vertical edge, horizontal edge, outer]
  var CORNERS = [
    [BN, BW, BNW, 0, 0, [2, 4], [2, 0], [0, 4], [2, 2], [0, 2]],
    [BN, BE, BNE, 1, 0, [1, 4], [3, 0], [3, 4], [1, 2], [3, 2]],
    [BS, BW, BSW, 0, 1, [2, 3], [2, 1], [0, 3], [2, 5], [0, 5]],
    [BS, BE, BSE, 1, 1, [1, 3], [3, 1], [3, 3], [1, 5], [3, 5]]
  ];
  // quarterFor(reducedMask, corner) -> [qx, qy] in the template's 4 by 6 quarter grid.
  function quarterFor(rm, k) {
    var c = CORNERS[k], v = rm & c[0], hz = rm & c[1], d = rm & c[2];
    return v && hz ? (d ? c[5] : c[6]) : v ? c[7] : hz ? c[8] : c[9];
  }
  function composeTile(tmpl, T, rm) {
    var out = new Uint8Array(T * T), q0 = T >> 1, q1 = T - q0, W = 2 * T;
    for (var k = 0; k < 4; k++) {
      var q = quarterFor(rm, k), c = CORNERS[k];
      var sx = (q[0] >> 1) * T + (q[0] & 1 ? q0 : 0), sy = (q[1] >> 1) * T + (q[1] & 1 ? q0 : 0);
      var ox = c[3] ? q0 : 0, oy = c[4] ? q0 : 0, w = c[3] ? q1 : q0, h = c[4] ? q1 : q0;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) out[(oy + y) * T + ox + x] = tmpl[(sy + y) * W + sx + x];
    }
    return out;
  }
  // Distance inside the region boundary for a template pixel, and the direction toward that boundary.
  function rrect(px, py, W, H, r) {
    var dl = px, dr = W - px, dt = py, db = H - py, dx = Math.min(dl, dr), dy = Math.min(dt, db), sx = dl < dr ? -1 : 1, sy = dt < db ? -1 : 1;
    if (dx < r && dy < r) { var ax = r - dx, ay = r - dy, L = Math.sqrt(ax * ax + ay * ay) || 1; return { d: r - L, nx: sx * ax / L, ny: sy * ay / L }; }
    return dx < dy ? { d: dx, nx: sx, ny: 0 } : { d: dy, nx: 0, ny: sy };
  }
  function regionAt(x, y, T, r) {
    var px = x + 0.5, py = y + 0.5;
    if (y < T && x < T) return rrect(px, py, T, T, r);
    if (y < T) {
      var lx = px - T, cx = lx < T / 2 ? 0 : T, cy = py < T / 2 ? 0 : T, vx = lx - cx, vy = py - cy, L = Math.sqrt(vx * vx + vy * vy) || 1;
      return { d: L - r, nx: -vx / L, ny: -vy / L };
    }
    return rrect(px, py - T, 2 * T, 2 * T, r);
  }
  // Paints a template from a style: fill(c, x, y) for the inside, edge(c, e, n, x, y) for the band along the boundary
  // (returns a slot, 0 for clear, or -1 to use the fill), wob(c, x, y) a non negative inward wobble.
  // ox, oy shift the texture only (the scroll animation), never the region.
  function paintTemplate(style, c, ox, oy) {
    var T = c.T, W = 2 * T, H = 3 * T, out = new Uint8Array(W * H), r = style.square ? 0 : Math.max(1, Math.round(T * 0.28));
    var edge = style.edge || EDGE.soft, bw = 1 + c.dc * (style.band || 1);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var lx = mod(x, T), ly = mod(y, T), R = regionAt(x, y, T, r);
      var e = R.d - (style.wob ? style.wob(c, lx, ly) : 0);
      if (e <= 0) continue;
      var s = -1;
      if (e < bw) s = edge(c, e, R, lx, ly);
      if (s < 0) s = style.fill(c, mod(lx + (ox || 0), T), mod(ly + (oy || 0), T));
      out[y * W + x] = s;
    }
    return out;
  }
  // A full fill tile, optionally a variant. Every tile of a texture repeats exactly, so large cells of one biome would
  // show a grid; variants break it up. mode 'reseed' redraws the middle of the tile from another seed, with a dithered
  // seam well inside the border so neighbors still match; mode 'deco' adds a small decoration in the middle.
  function paintFull(style, c, ox, oy, mode) {
    var T = c.T, out = new Uint8Array(T * T), inset = Math.max(1, c.dc * 2), alt = null;
    if (c.v && mode === 'reseed') alt = makeCtx(T, (c.seed + c.v * 7717) >>> 0, c.p, c.ph, 0);
    for (var y = 0; y < T; y++) for (var x = 0; x < T; x++) {
      var tx = mod(x + (ox || 0), T), ty = mod(y + (oy || 0), T), s;
      if (alt) {
        var edgeD = Math.min(x, y, T - 1 - x, T - 1 - y), t = (edgeD - inset) / Math.max(1, inset);
        s = t > 1 || (t > 0 && hh(x, y, c.seed + 3) < t) ? style.fill(alt, tx, ty) : style.fill(c, tx, ty);
      } else s = style.fill(c, tx, ty);
      if (c.v && mode !== 'reseed' && x >= inset && y >= inset && x < T - inset && y < T - inset) { var dv = (style.deco || decoDefault)(c, x, y); if (dv > 0) s = dv; }
      out[y * T + x] = s;
    }
    return out;
  }
  function decoDefault(c, x, y) {
    var T = c.T, cx = T * (0.32 + 0.36 * hh(c.v, 1, c.seed)), cy = T * (0.32 + 0.36 * hh(c.v, 2, c.seed)), r = T * 0.14;
    var dx = x + 0.5 - cx, dy = (y + 0.5 - cy) * 1.4, d = Math.sqrt(dx * dx + dy * dy);
    if (d > r) return 0;
    var stones = c.v % 2 === 1;
    if (d > r - c.dc) return dy > 0 ? 1 : stones ? TC[1] : TD[0];
    return stones ? (dx + dy < 0 ? TC[3] : TC[2]) : (hh(Math.floor(x / c.dc), Math.floor(y / c.dc), c.seed + 5) < 0.4 ? TD[3] : TD[1]);
  }

  // ---------------------------------------------------------------- edges
  var EDGE = {
    // Dithered first pixel, a lit lip on top edges, a shadow on bottom edges.
    soft: function (c, e, R, x, y) { if (e < 1) return (x + y) & 1 ? 0 : TA[1]; return R.ny < -0.5 ? TA[3] : R.ny > 0.5 ? TA[0] : TA[1]; },
    outlined: function (c, e, R) { if (e < 1) return 1; return R.ny > 0.4 ? TA[0] : -1; },
    foam: function (c, e) { return e < 1 ? TF[3] : e < 1 + c.dc ? TF[1] : -1; },
    beach: function (c, e) { return e < 1 ? TF[3] : e < 1 + c.dc ? TF[1] : TB[1]; },
    bevel: function (c, e, R) { if (e < 1) return 1; return R.ny < -0.5 ? TB[4] : R.ny > 0.5 ? TB[0] : TB[1]; },
    rug: function (c, e) { return e < 1 ? TD[0] : e < 1 + c.dc ? TF[2] : TD[0]; },
    lip: function (c, e, R) { if (e < 1) return 1; return R.ny > 0.5 ? TA[0] : TA[3]; }
  };
  function organic(k) { return function (c, x, y) { return c.n(x, y, 4, 13) * c.T * k * c.d('rough', 1); }; }

  // ---------------------------------------------------------------- biome styles
  // Each draws in tile coordinates (x, y within one tile), from hashed detail cells and periodic noise, so any tile
  // size rasterizes natively. Material slots: A ground, B second ground or canopy, C stone or wood, D flora or accent,
  // E liquid or glow, F foam, snow, or light.
  function crowns(c, x, y, list, r, hi) {
    var T = c.T, best = -1, bdx = 0, bdy = 0, bd = 0;
    for (var i = 0; i < list.length; i++) {
      var dx = x + 0.5 - list[i][0] * T, dy = y + 0.5 - list[i][1] * T;
      dx -= T * Math.round(dx / T); dy -= T * Math.round(dy / T);
      var d = Math.sqrt(dx * dx + dy * dy * 1.15);
      if (d < r) { best = i; bdx = dx; bdy = dy; bd = d; }
    }
    if (best < 0) return -1;
    var sway = c.ph ? (1 - Math.cos(c.ph * Math.PI * 2)) * 0.16 : 0;
    if (bd > r - c.dc) return bdy > -r * 0.2 ? 1 : TB[1];
    var q = (bdx + bdy * 1.1) / r + sway;
    if (c.h(Math.floor(x / c.dc), Math.floor(y / c.dc), 11) < 0.05) return q < 0 ? TB[4] : TB[2];
    return q < -0.62 ? (hi || TB[4]) : q < -0.12 ? TB[3] : q < 0.48 ? TB[2] : TB[1];
  }
  function crownSet(c, n) {
    var base = n === 5 ? [[0.25, 0.25], [0.75, 0.2], [0.5, 0.52], [0.24, 0.78], [0.76, 0.76]] : [[0.25, 0.28], [0.75, 0.22], [0.27, 0.76], [0.76, 0.72]];
    return base.map(function (p, i) { return [p[0] + (hh(i, 3, c.seed) - 0.5) * 0.08, p[1] + (hh(i, 4, c.seed) - 0.5) * 0.08]; });
  }
  function peak(x, y, T, cx, ay, by, hw) {
    var px = x + 0.5, py = y + 0.5, slope = (by - ay) / hw, top = ay + Math.abs(px - cx) * slope;
    if (py < top || py >= by) return null;
    return { e: (py - top) / Math.max(1, slope) * slope, lit: px < cx, ridge: Math.abs(px - cx), t: (py - ay) / (by - ay) };
  }
  var STYLES = {
    grass: { label: 'Grass', mats: { A: '#4f9a3e', B: '#6aa848', C: '#8a6a44', D: '#e8d468', E: '#3a72c0', F: '#eaf2fa' }, wob: organic(0.14),
      fill: function (c, x, y) {
        var n = c.n(x, y, 4, 1), cx = Math.floor(x / c.dc), cy = Math.floor(y / c.dc), t = 0.16 * c.d('detail', 0.5);
        if (c.h(cx, cy + 1, 3) < t) return TA[4];
        if (c.h(cx, cy, 3) < t) return TA[0];
        if (c.h(cx - 1, cy + 1, 3) < t) return TA[3];
        if (c.h(cx, cy, 5) < 0.025 * c.d('detail', 0.5)) return TD[2];
        return n < 0.36 ? TA[1] : n < 0.72 ? TA[2] : TA[3];
      } },
    steppe: { label: 'Dry grass', mats: { A: '#a8a454', B: '#c8b86a', C: '#8a6e48', D: '#d89a4a', E: '#3a72c0', F: '#eaf2fa' }, wob: organic(0.14),
      fill: function (c, x, y) {
        var n = c.n(x, y, 3, 1), cx = Math.floor(x / c.dc), cy = Math.floor(y / c.dc), t = 0.12 * c.d('detail', 0.5);
        if (c.h(cx >> 1, cy, 7) < 0.1 && (cx & 1)) return TB[3];
        if (c.h(cx, cy + 1, 3) < t) return TB[4];
        if (c.h(cx, cy, 3) < t) return TA[0];
        if (c.h(cx, cy, 6) < 0.01) return TC[1];
        return n < 0.4 ? TA[1] : n < 0.78 ? TA[2] : TA[3];
      } },
    sand: { label: 'Sand dunes', mats: { A: '#e2c27e', B: '#d8b070', C: '#9a7a54', D: '#c86a3a', E: '#3a72c0', F: '#fff4dc' }, wob: organic(0.12),
      fill: function (c, x, y) {
        var T = c.T, v = Math.sin(Math.PI * 2 * (3 * y / T + x / T) + Math.PI * 2 * 0.8 * c.n(x, y, 3, 2));
        if (c.h(Math.floor(x / c.dc), Math.floor(y / c.dc), 4) < 0.012 * c.d('detail', 0.5) * 2) return TC[1];
        return v > 0.9 ? TA[4] : v > 0.5 ? TA[3] : v < -0.62 ? TA[1] : TA[2];
      } },
    beach: { label: 'Beach', mats: { A: '#ead6a0', B: '#b89a6a', C: '#9a8a7a', D: '#e8a0a0', E: '#4a8ac8', F: '#f4faff' }, wob: organic(0.1), edge: EDGE.beach, band: 2,
      fill: function (c, x, y) {
        var T = c.T, v = Math.sin(Math.PI * 2 * (2 * y / T) + Math.PI * 2 * c.n(x, y, 2, 2) * 0.6);
        var cx = Math.floor(x / c.dc), cy = Math.floor(y / c.dc);
        if (c.h(cx, cy, 9) < 0.008 * c.d('detail', 0.5) * 2) return TD[2];
        if (c.h(cx, cy, 4) < 0.01) return TC[2];
        return v > 0.8 ? TA[3] : v < -0.8 ? TA[1] : TA[2];
      } },
    water: { label: 'Open water', mats: { A: '#2a5a9a', B: '#3a72c0', C: '#1e3e6a', D: '#5a9ad0', E: '#7ab8e8', F: '#eaf6ff' }, wob: organic(0.1), edge: EDGE.foam,
      fill: function (c, x, y) {
        var n = c.n(x, y, 6, 1), col = Math.floor(x / c.dc), row = Math.floor(y / c.dc);
        if (row % 3 === 0 && c.h(col >> 2, row, 6) < 0.2 * c.d('detail', 0.5) * 2) return TE[mod(col + row, 4)];
        if (c.h(col, row, 7) < 0.1) return TA[2];
        return n < 0.3 ? TA[0] : TA[1];
      } },
    marsh: { label: 'Marsh', mats: { A: '#5a7040', B: '#6a8048', C: '#8a8a4a', D: '#c8c070', E: '#4a6a6a', F: '#c8dcd8' }, wob: organic(0.14),
      fill: function (c, x, y) {
        var n = c.n(x, y, 4, 1), m = c.n(x, y, 5, 4), cx = Math.floor(x / c.dc), cy = Math.floor(y / c.dc);
        if (m > 0.72) return c.h(cx, cy, 12) < 0.06 ? TE[3] : m > 0.8 ? TE[1] : TE[0];
        if (m > 0.69) return TA[0];
        if (c.h(cx, 0, 8) < 0.14 * c.d('detail', 0.5) * 2 && mod(cy + Math.floor(c.h(cx, 1, 9) * 16), 7) < 3) return mod(cy + Math.floor(c.h(cx, 1, 9) * 16), 7) === 0 ? TC[3] : TC[1];
        return n < 0.45 ? TA[1] : TA[2];
      } },
    forest: { label: 'Forest canopy', mats: { A: '#2d4a2a', B: '#3e7a38', C: '#5a3e2a', D: '#a8c858', E: '#3a72c0', F: '#eaf2fa' }, wob: organic(0.1), edge: EDGE.outlined,
      variants: false,
      fill: function (c, x, y) { var s = crowns(c, x, y, crownSet(c, 4), c.T * 0.33 * c.d('size', 1)); return s >= 0 ? s : c.n(x, y, 4, 1) < 0.5 ? TA[0] : TA[1]; },
      deco: function (c, x, y) { var T = c.T, dx = x + 0.5 - T / 2, dy = y + 0.5 - T / 2; return dx * dx + dy * dy < T * T * 0.03 ? (c.v % 2 ? TA[2] : TD[1]) : 0; } },
    jungle: { label: 'Jungle canopy', mats: { A: '#1e3a24', B: '#2e6a34', C: '#4a3424', D: '#b8e060', E: '#3a72c0', F: '#eaf2fa' }, wob: organic(0.1), edge: EDGE.outlined,
      variants: false,
      fill: function (c, x, y) { var s = crowns(c, x, y, crownSet(c, 5), c.T * 0.27 * c.d('size', 1), TD[2]); return s >= 0 ? s : TA[0]; },
      deco: function () { return 0; } },
    tundra: { label: 'Tundra', mats: { A: '#7a8a6a', B: '#8a9478', C: '#7e848e', D: '#b88a5a', E: '#5a7a9a', F: '#eef4fa' }, wob: organic(0.14),
      fill: function (c, x, y) {
        var n = c.n(x, y, 4, 1), s = c.n(x, y, 6, 5), cx = Math.floor(x / c.dc), cy = Math.floor(y / c.dc);
        if (s > 0.78) return s > 0.85 ? TF[3] : TF[2];
        if (c.h(cx, cy, 5) < 0.05 * c.d('detail', 0.5) * 2) return TD[1];
        if (c.h(cx, cy, 6) < 0.012) return TC[1];
        return n < 0.4 ? TA[1] : n < 0.75 ? TA[2] : TA[3];
      } },
    snow: { label: 'Snowfield', mats: { A: '#d8e4f0', B: '#b8c8e0', C: '#8a98a8', D: '#a0b8d8', E: '#6a90c0', F: '#ffffff' }, wob: organic(0.14),
      fill: function (c, x, y) {
        var T = c.T, n = c.n(x, y, 4, 1), v = Math.sin(Math.PI * 2 * (2 * y / T + x / T) + Math.PI * 2 * c.n(x, y, 2, 3));
        if (c.h(Math.floor(x / c.dc), Math.floor(y / c.dc), 7) < 0.01) return TF[3];
        if (v > 0.93) return TA[1];
        return n < 0.3 ? TA[2] : n < 0.7 ? TA[3] : TA[4];
      } },
    mountain: { label: 'Mountains', mats: { A: '#7a6e62', B: '#8a8478', C: '#5a5048', D: '#6a7a4a', E: '#3a72c0', F: '#f4f8fc' }, wob: organic(0.08), edge: EDGE.outlined, variants: false,
      fill: function (c, x, y) {
        var T = c.T, k = peak(x, y, T, T * 0.54, T * 0.1, T * 0.94, T * 0.44), dc = c.dc;
        if (!k) k = peak(x, y, T, T * 0.2, T * 0.44, T * 0.96, T * 0.18);
        if (k) {
          if (k.e < dc) return 1;
          if (k.t < 0.3 * c.d('snow', 1)) return k.lit ? TF[3] : TF[1];
          if (k.ridge < dc * 0.6) return TB[3];
          return k.lit ? (k.t < 0.6 ? TB[4] : TB[3]) : (k.t < 0.6 ? TB[1] : TB[0]);
        }
        if (c.h(Math.floor(x / dc), Math.floor(y / dc), 4) < 0.05) return TC[1];
        return c.n(x, y, 4, 1) < 0.5 ? TA[1] : TA[2];
      }, deco: function () { return 0; } },
    lava: { label: 'Lava rock', mats: { A: '#3a3034', B: '#4a3a3a', C: '#5a4a44', D: '#8a4a2a', E: '#f06a20', F: '#ffd860' }, wob: organic(0.1), edge: EDGE.outlined,
      fill: function (c, x, y) {
        var m = Math.abs(c.n(x, y, 5, 3) - 0.5), w = 0.04 * c.d('flow', 1);
        if (m < w) return TE[3];
        if (m < w * 1.6) return TE[2];
        if (m < w * 2.3) return TE[0];
        if (c.h(Math.floor(x / c.dc), Math.floor(y / c.dc), 4) < 0.04) return TA[2];
        return c.n(x, y, 4, 1) < 0.5 ? TA[0] : TA[1];
      } },
    // Interior autotiles.
    'wall.brick': { label: 'Brick wall', interior: true, square: true, edge: EDGE.bevel,
      fill: function (c, x, y) {
        var T = c.T, bh = Math.max(2, Math.round(T / 4)), row = Math.floor(y / bh), off = row % 2 ? T / 4 : 0, bwid = T / 2, col = Math.floor(mod(x + off, T) / bwid);
        if (y % bh < Math.max(1, Math.round(c.dc * 0.6)) || mod(x + off, bwid) < Math.max(1, Math.round(c.dc * 0.6))) return TB[0];
        if (y % bh === Math.max(1, Math.round(c.dc * 0.6))) return TB[3];
        return hh(row, col, c.seed) < 0.5 ? TB[2] : TB[1];
      } },
    'wall.block': { label: 'Block wall', interior: true, square: true, edge: EDGE.bevel,
      fill: function (c, x, y) {
        var T = c.T, bh = Math.max(2, Math.round(T / 2)), row = Math.floor(y / bh), off = row % 2 ? T / 2 : 0, col = Math.floor(mod(x + off, T) / (T / 2)), m = Math.max(1, Math.round(c.dc * 0.7));
        if (y % bh < m || mod(x + off, T / 2) < m) return TB[0];
        if (y % bh < m * 2 || mod(x + off, T / 2) < m * 2) return TB[3];
        if (c.h(Math.floor(x / c.dc), Math.floor(y / c.dc), 9) < 0.05) return TD[1];
        return hh(row, col, c.seed) < 0.5 ? TB[2] : TB[1];
      } },
    rug: { label: 'Rug', interior: true, square: true, edge: EDGE.rug, band: 3,
      fill: function (c, x, y) { var T = c.T, q = T / 2, a = mod(x + y, q), b = mod(x - y, q); return a < c.dc || b < c.dc ? TD[2] : (mod(x, T) < T / 2) === (mod(y, T) < T / 2) ? TD[1] : TD[0]; } },
    channel: { label: 'Water channel', interior: true, edge: EDGE.lip, band: 1,
      fill: function (c, x, y) { var col = Math.floor(x / c.dc), row = Math.floor(y / c.dc); if (col % 3 === 1 && c.h(col, row >> 2, 6) < 0.3) return (row & 3) ? TE[2] : TE[3]; return c.n(x, y, 3, 1) < 0.5 ? TE[0] : TE[1]; } }
  };
  STYLES.channel.anim = true;

  // ---------------------------------------------------------------- interior single tiles
  // draw(c) -> Uint8Array T by T. Rectangles and circles in tile fractions, then an outline from the alpha mask.
  function Px(T) { return { T: T, a: new Uint8Array(T * T) }; }
  function pr(r, x0, y0, x1, y1, s) {
    var T = r.T, ax = Math.max(0, Math.round(x0 * T)), ay = Math.max(0, Math.round(y0 * T)), bx = Math.min(T, Math.round(x1 * T)), by = Math.min(T, Math.round(y1 * T));
    for (var y = ay; y < by; y++) for (var x = ax; x < bx; x++) r.a[y * T + x] = s;
  }
  function pc(r, cx, cy, rad, s, sy) {
    var T = r.T, R = rad * T, k = sy || 1;
    for (var y = 0; y < T; y++) for (var x = 0; x < T; x++) { var dx = x + 0.5 - cx * T, dy = (y + 0.5 - cy * T) / k; if (dx * dx + dy * dy <= R * R) r.a[y * T + x] = s; }
  }
  function pout(r) {
    var T = r.T, a = r.a, o = new Uint8Array(a);
    for (var y = 0; y < T; y++) for (var x = 0; x < T; x++) {
      if (a[y * T + x]) continue;
      if ((x > 0 && a[y * T + x - 1] > 1) || (x < T - 1 && a[y * T + x + 1] > 1) || (y > 0 && a[(y - 1) * T + x] > 1) || (y < T - 1 && a[(y + 1) * T + x] > 1)) o[y * T + x] = 1;
    }
    r.a = o;
    return r;
  }
  function pline(r, y0, s, step) { var T = r.T; for (var y = Math.round(y0 * T); y < T; y += Math.max(2, Math.round(step * T))) for (var x = 0; x < T; x++) r.a[y * T + x] = s; }
  var ISTYLES = {
    planks: { label: 'Wood floor', full: true, fill: function (c, x, y) {
      var T = c.T, bh = Math.max(2, Math.round(T / 4)), b = Math.floor(y / bh), j = Math.floor(hh(b, 9, c.seed) * T);
      if (y % bh === 0 || x === j) return TC[0];
      if (x === mod(j + 2, T) && y % bh === 1) return TA[0];
      if (c.h(Math.floor(x / (c.dc * 3)), Math.floor(y / c.dc), 3) < 0.08) return TA[3];
      return b % 2 ? TA[2] : TA[1];
    } },
    flagstone: { label: 'Stone floor', full: true, fill: function (c, x, y) {
      var T = c.T, sh = T / 2, row = Math.floor(y / sh), off = row % 2 ? T / 4 : 0, sx = mod(x + off, sh), sy = y % sh, m = Math.max(1, Math.round(c.dc * 0.6));
      if (sx < m || sy < m) return c.h(Math.floor(x / c.dc), Math.floor(y / c.dc), 4) < 0.18 ? TD[1] : TA[0];
      if (sx < m * 2 && sy < sh * 0.6) return TA[3];
      return hh(row, Math.floor(mod(x + off, T) / sh), c.seed) < 0.5 ? TA[2] : TA[1];
    } },
    'door.wood': { label: 'Wooden door', draw: function (c) { var r = Px(c.T); pr(r, 0, 0, 1, 1, TB[1]); pr(r, 0.12, 0.08, 0.88, 1, TC[0]); pr(r, 0.2, 0.16, 0.8, 1, TC[2]); for (var i = 1; i < 3; i++) pr(r, 0.2 + i * 0.2, 0.16, 0.2 + i * 0.2 + 0.04, 1, TC[1]); pr(r, 0.66, 0.56, 0.74, 0.64, TF[3]); return r.a; } },
    'door.iron': { label: 'Iron door', draw: function (c) { var r = Px(c.T); pr(r, 0, 0, 1, 1, TB[1]); pr(r, 0.12, 0.06, 0.88, 1, TC[0]); pr(r, 0.18, 0.12, 0.82, 1, TC[2]); pr(r, 0.18, 0.3, 0.82, 0.38, TC[3]); pr(r, 0.18, 0.7, 0.82, 0.78, TC[3]); pr(r, 0.64, 0.5, 0.72, 0.58, TF[3]); return r.a; } },
    'stairs.up': { label: 'Stairs up', draw: function (c) { var r = Px(c.T); for (var i = 0; i < 4; i++) { pr(r, 0, i / 4, 1, (i + 1) / 4, i % 2 ? TA[2] : TA[3]); pr(r, 0, (i + 1) / 4 - 0.06, 1, (i + 1) / 4, TA[0]); } pr(r, 0, 0, 0.1, 1, TB[1]); pr(r, 0.9, 0, 1, 1, TB[1]); return r.a; } },
    'stairs.down': { label: 'Stairs down', draw: function (c) { var r = Px(c.T); pr(r, 0, 0, 1, 1, 1); for (var i = 0; i < 4; i++) pr(r, 0.1, i / 4 + 0.04, 0.9, (i + 1) / 4 - 0.04, [TA[3], TA[2], TA[1], TA[0]][i]); return r.a; } },
    counter: { label: 'Counter', draw: function (c) { var r = Px(c.T); pr(r, 0, 0.18, 1, 0.46, TA[4]); pr(r, 0, 0.42, 1, 0.48, TA[1]); pr(r, 0, 0.48, 1, 0.94, TC[1]); pr(r, 0.1, 0.56, 0.45, 0.86, TC[2]); pr(r, 0.55, 0.56, 0.9, 0.86, TC[2]); return pout(r).a; } },
    altar: { label: 'Altar', draw: function (c) { var r = Px(c.T); pr(r, 0.06, 0.2, 0.94, 0.44, TB[3]); pr(r, 0.06, 0.4, 0.94, 0.46, TB[1]); pr(r, 0.14, 0.46, 0.86, 0.92, TB[2]); pr(r, 0.42, 0.52, 0.58, 0.8, TD[2]); return pout(r).a; } },
    table: { label: 'Table', draw: function (c) { var r = Px(c.T); pr(r, 0.12, 0.62, 0.2, 0.92, TC[0]); pr(r, 0.8, 0.62, 0.88, 0.92, TC[0]); pr(r, 0.06, 0.26, 0.94, 0.64, TA[3]); pr(r, 0.06, 0.26, 0.94, 0.34, TA[4]); pr(r, 0.06, 0.58, 0.94, 0.64, TA[1]); return pout(r).a; } },
    barrel: { label: 'Barrel', draw: function (c) { var r = Px(c.T); pr(r, 0.18, 0.2, 0.82, 0.92, TA[1]); pr(r, 0.24, 0.2, 0.42, 0.92, TA[3]); pr(r, 0.66, 0.2, 0.82, 0.92, TA[0]); pr(r, 0.18, 0.12, 0.82, 0.24, TA[4]); pr(r, 0.18, 0.36, 0.82, 0.42, TC[0]); pr(r, 0.18, 0.72, 0.82, 0.78, TC[0]); return pout(r).a; } },
    bed: { label: 'Bed', draw: function (c) { var r = Px(c.T); pr(r, 0.08, 0.04, 0.92, 0.96, TC[0]); pr(r, 0.14, 0.1, 0.86, 0.9, TD[1]); pr(r, 0.14, 0.1, 0.86, 0.34, TF[3]); pr(r, 0.14, 0.4, 0.86, 0.48, TD[2]); return pout(r).a; } },
    shelf: { label: 'Bookshelf', draw: function (c) { var r = Px(c.T); pr(r, 0.04, 0.02, 0.96, 0.96, TC[0]); [0.08, 0.5].forEach(function (y0) { pr(r, 0.1, y0, 0.9, y0 + 0.38, TC[1]); for (var i = 0; i < 6; i++) pr(r, 0.12 + i * 0.13, y0 + 0.06 + (i % 3) * 0.03, 0.12 + i * 0.13 + 0.1, y0 + 0.36, [TD[1], TE[1], TF[1], TD[2], TE[2], TA[3]][i]); }); return r.a; } },
    plant: { label: 'Potted plant', draw: function (c) { var r = Px(c.T); pr(r, 0.32, 0.64, 0.68, 0.94, TC[1]); pr(r, 0.28, 0.6, 0.72, 0.68, TC[2]); pc(r, 0.5, 0.38, 0.28, TE[1]); pc(r, 0.42, 0.32, 0.12, TE[2]); pc(r, 0.62, 0.44, 0.08, TE[0]); return pout(r).a; } },
    lintel: { label: 'Beam (above)', draw: function (c) { var r = Px(c.T); pr(r, 0, 0, 1, 0.3, TC[1]); pr(r, 0, 0, 1, 0.08, TC[2]); pr(r, 0, 0.26, 1, 0.3, TC[0]); return r.a; } },
    pillar: { label: 'Pillar', draw: function (c) { var r = Px(c.T); pr(r, 0.22, 0.1, 0.78, 0.92, TB[2]); pr(r, 0.22, 0.1, 0.4, 0.92, TB[3]); pr(r, 0.62, 0.1, 0.78, 0.92, TB[1]); pr(r, 0.14, 0.02, 0.86, 0.14, TB[4]); pr(r, 0.14, 0.86, 0.86, 0.98, TB[1]); return pout(r).a; } },
    torch: { label: 'Torch', draw: function (c) {
      var r = Px(c.T), f = c.ph ? Math.sin(c.ph * Math.PI * 2) : 0;
      pr(r, 0.44, 0.48, 0.56, 0.86, TC[1]); pr(r, 0.36, 0.44, 0.64, 0.52, TC[2]);
      pc(r, 0.5, 0.32 - f * 0.03, 0.15 + f * 0.02, TF[1], 1.4); pc(r, 0.5, 0.36, 0.08, TF[3], 1.3);
      return pout(r).a;
    } },
    chest: { label: 'Chest', draw: function (c) { var r = Px(c.T); pr(r, 0.12, 0.34, 0.88, 0.88, TC[1]); pr(r, 0.12, 0.3, 0.88, 0.52, TC[2]); pr(r, 0.12, 0.5, 0.88, 0.56, TF[1]); pr(r, 0.44, 0.46, 0.56, 0.64, TF[3]); pr(r, 0.12, 0.3, 0.2, 0.88, TF[1]); pr(r, 0.8, 0.3, 0.88, 0.88, TF[1]); return pout(r).a; } },
    spikes: { label: 'Spike floor', draw: function (c) { var r = Px(c.T); for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) { var cx = 0.17 + i * 0.33, cy = 0.2 + j * 0.3; pr(r, cx - 0.06, cy, cx + 0.06, cy + 0.12, TC[2]); pr(r, cx - 0.02, cy - 0.06, cx + 0.02, cy + 0.02, TF[3]); } return r.a; }, under: true },
    arch: { label: 'Archway (above)', draw: function (c) { var r = Px(c.T); pr(r, 0, 0, 1, 0.34, TB[2]); pr(r, 0, 0, 1, 0.06, TB[4]); pr(r, 0, 0.3, 1, 0.36, TB[0]); pr(r, 0, 0, 0.18, 1, TB[2]); pr(r, 0.82, 0, 1, 1, TB[1]); return r.a; } }
  };

  // ---------------------------------------------------------------- tile animation
  // Three techniques. cycle rotates one material's master colors through its slots (the pixels never change, so any
  // hand drawn template animates too). scroll slides the texture across the shape (flowing water). phase redraws the
  // generator at successive phases (swaying canopy, flicker). Every tile bakes at most four frames.
  var TECHNIQUES = ['cycle', 'scroll', 'phase'];
  var ANIM_TYPES = {
    liquid: { label: 'Liquid shimmer', technique: 'cycle', params: { mat: 'E', ms: 240 } },
    flame: { label: 'Flame flicker', technique: 'phase', params: { ms: 130, frames: 4 } },
    flow: { label: 'Flowing current', technique: 'scroll', params: { ms: 150, frames: 4, dx: 0, dy: 1 } },
    foliage: { label: 'Foliage sway', technique: 'phase', params: { ms: 520, frames: 2 } },
    mechanism: { label: 'Mechanism', technique: 'phase', params: { ms: 200, frames: 4 } }
  };
  // animOf(art, anim) -> {technique, mat, ms, frames, dx, dy} with the type's defaults under the record's own params.
  function animOf(art, anim) {
    if (!anim || !anim.type || anim.type === 'none') return null;
    var reg = art && art.tileAnimTypes && art.tileAnimTypes[anim.type] || ANIM_TYPES[anim.type] || {};
    var p = Object.assign({}, reg.params || {}, anim.params || {}), tech = TECHNIQUES.indexOf(anim.technique) >= 0 ? anim.technique : reg.technique || 'cycle';
    var mat = TILE_RAMPS[p.mat] ? p.mat : 'E';
    var frames = tech === 'cycle' ? Math.min(4, TILE_RAMPS[mat].length) : clamp(Math.round(Number(p.frames) || 4), 2, 4);
    return { technique: tech, mat: mat, ms: clamp(Number(p.ms) || 200, 40, 4000), frames: frames, dx: Number(p.dx) || 0, dy: p.dy == null ? 1 : Number(p.dy) || 0 };
  }
  function frameAtTile(art, anim, tMs) { var a = animOf(art, anim); return a ? Math.floor((Number(tMs) || 0) / a.ms) % a.frames : 0; }
  // Slots for one animation frame: cycle rotates the material's last four slots; other techniques keep the slots.
  function cycleSlots(slots, a, frame) {
    if (!slots || !a || a.technique !== 'cycle' || !frame) return slots;
    var s = slots.slice(), sub = TILE_RAMPS[a.mat].slice(-4);
    for (var i = 0; i < sub.length; i++) s[sub[i]] = slots[sub[(i + frame) % sub.length]];
    return s;
  }

  // ---------------------------------------------------------------- records to pixels (pure; art is bundle.art)
  function tileItem(til, key) { return til && Array.isArray(til.tiles) ? til.tiles.filter(function (t) { return t && t.key === key; })[0] || null : null; }
  function styleOf(gen) { return gen && STYLES[gen.shape || gen.style] || null; }
  // template(art, til, T, frame, key) -> {w: 2T, h: 3T, idx} for a biome (key null) or an autotile interior item.
  function template(art, til, T, frame, key) {
    var src = key ? tileItem(til, key) : til && til.templates, anim = key ? src && src.anim : til && til.anim, a = animOf(art, anim);
    var seed = ((til && til.seed) >>> 0) ^ (key ? hash32(key) : 0), W = 2 * T, H = 3 * T;
    if (src && src.px && src.px.d) {
      try {
        var w = src.px.w || W, h = src.px.h || H, idx = decodePx(src.px.d, w, h);
        if (w !== W || h !== H) idx = resample(idx, w, h, W, H);
        return { w: W, h: H, idx: idx, px: true, resampled: w !== W || h !== H };
      } catch (e) { /* fall back to the generator */ }
    }
    var st = styleOf(src && src.gen) || STYLES.grass, f = a && a.technique !== 'cycle' ? frame % a.frames : 0;
    var c = makeCtx(T, seed, src && src.gen && src.gen.params, a && a.technique === 'phase' ? f / a.frames : 0, 0);
    var sh = a && a.technique === 'scroll' ? T / a.frames * f : 0;
    return { w: W, h: H, idx: paintTemplate(st, c, sh * (a ? a.dx : 0), sh * (a ? a.dy : 0)) };
  }
  function compose47(art, til, T, key) { var t = template(art, til, T, 0, key); return BLOB.map(function (rm) { return composeTile(t.idx, T, rm); }); }
  // tileIdx(art, til, blob, frame, key, variant, T, memo) -> Uint8Array T by T.
  function tileIdx(art, til, blob, frame, key, variant, T, memo) {
    var item = key ? tileItem(til, key) : null, anim = key ? item && item.anim : til.anim, a = animOf(art, anim), f = a && a.technique !== 'cycle' ? frame % a.frames : 0;
    var seed = ((til.seed >>> 0) ^ (key ? hash32(key) : 0)) >>> 0;
    if (key && item && !item.autotile) {
      if (item.px && item.px.d) { try { var pw = item.px.w || T, ph = item.px.h || T, pi = decodePx(item.px.d, pw, ph); return pw === T && ph === T ? pi : resample(pi, pw, ph, T, T); } catch (e) { /* generator */ } }
      var g = item.gen || {}, is = ISTYLES[g.shape || g.style], c0 = makeCtx(T, seed, g.params, a && a.technique === 'phase' ? f / a.frames : 0, 0);
      if (!is) return new Uint8Array(T * T);
      if (is.full) { var sh0 = a && a.technique === 'scroll' ? T / a.frames * f : 0; return paintFull(is, c0, sh0 * (a ? a.dx : 0), sh0 * (a ? a.dy : 0)); }
      return is.draw(c0);
    }
    var src = key ? item : til.templates;
    if (variant && blob === BLOB_FULL && !(src && src.px && src.px.d)) {
      var st = styleOf(src && src.gen) || STYLES.grass, c = makeCtx(T, seed, src && src.gen && src.gen.params, a && a.technique === 'phase' ? f / a.frames : 0, variant);
      var sh = a && a.technique === 'scroll' ? T / a.frames * f : 0, vs = !key && Array.isArray(til.fillVariants) ? til.fillVariants[variant - 1] : null;
      return paintFull(st, c, sh * (a ? a.dx : 0), sh * (a ? a.dy : 0), vs && vs.mode === 'deco' ? 'deco' : 'reseed');
    }
    var mk = til.id + '|' + (key || '') + '|' + f + '|' + T, t = memo && memo.get(mk);
    if (!t) { t = template(art, til, T, f, key); if (memo) memo.set(mk, t); }
    return composeTile(t.idx, T, BLOB[blob] == null ? 0 : BLOB[blob]);
  }
  // Slots for a tileset: its pal_ record's 32 slots.
  function tileSlotsFor(art, til) { var p = rec(art, til && til.pal); return p && Array.isArray(p.slots) ? p.slots : null; }
  function tileBake(art, til, blob, frame, key, variant, T, entries, memo) {
    var idx = tileIdx(art, til, blob, frame, key, variant, T, memo), item = key ? tileItem(til, key) : null;
    var a = animOf(art, key ? item && item.anim : til.anim);
    return { w: T, h: T, ax: 0, ay: 0, idx: idx, rgba: rgba(idx, cycleSlots(tileSlotsFor(art, til), a, frame), entries) };
  }

  // ---------------------------------------------------------------- maps
  // map: {w, h, ground: [ref], deco: [ref or null]}. A ref is a tileset ID (a biome) or "<til id>:<tile key>" (an
  // interior tile). Biomes compose by priority: a cell belongs to every biome layer at or below its own, so higher
  // biomes draw their blob over the lower one and the lower one shows through their rounded, transparent edges.
  function prioList(art) {
    var all = recs(art, 'til_'), ids = Object.keys(all).filter(function (id) { return all[id] && all[id].kind === 'biome'; });
    var order = Array.isArray(art && art.priority) ? art.priority : [];
    ids.sort(function (a, b) {
      var ia = order.indexOf(a), ib = order.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0 !== ib >= 0) return ia >= 0 ? -1 : 1;
      return (Number(all[a].priority) || 0) - (Number(all[b].priority) || 0) || (a < b ? -1 : 1);
    });
    return ids;
  }
  function resolveRef(art, ref) {
    if (typeof ref !== 'string' || !ref) return null;
    var i = ref.indexOf(':'), id = i < 0 ? ref : ref.slice(0, i), key = i < 0 ? null : ref.slice(i + 1), til = rec(art, id);
    if (!til) return null;
    if (!key) return til.kind === 'biome' ? { til: til, key: null, biome: true, flags: Number(til.flags) | 0, autotile: true } : null;
    var it = tileItem(til, key);
    return it ? { til: til, key: key, item: it, biome: false, flags: Number(it.flags) | 0, autotile: !!it.autotile } : null;
  }
  var PREP = typeof WeakMap === 'function' ? new WeakMap() : null;
  function prepare(art, map, token) {
    var old = PREP && PREP.get(map);
    if (old && old.art === art && old.token === token && old.n === map.ground.length) return old;
    var ranks = prioList(art), codes = [], byRef = {};
    function code(ref) {
      if (ref == null) return -1;
      if (byRef[ref] !== undefined) return byRef[ref];
      var r = resolveRef(art, ref);
      if (r) { r.rank = r.biome ? ranks.indexOf(r.til.id) : -1; r.ref = ref; }
      codes.push(r); byRef[ref] = codes.length - 1;
      return byRef[ref];
    }
    var n = map.w * map.h, g = new Int32Array(n), d = new Int32Array(n);
    for (var i = 0; i < n; i++) { g[i] = code(map.ground[i]); d[i] = map.deco ? code(map.deco[i]) : -1; }
    var rankInfo = ranks.map(function (id) { return codes.filter(function (c) { return c && c.biome && c.til.id === id; })[0] || null; });
    var p = { art: art, token: token, n: n, codes: codes, g: g, d: d, rankInfo: rankInfo };
    if (PREP) PREP.set(map, p);
    return p;
  }
  function flagsAt(art, map, x, y) {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return 0;
    var i = y * map.w + x, dr = map.deco ? resolveRef(art, map.deco[i]) : null;
    if (dr) return dr.flags;
    var gr = resolveRef(art, map.ground[i]);
    return gr ? gr.flags : 0;
  }
  function variantAt(til, x, y) {
    var v = Array.isArray(til.fillVariants) ? til.fillVariants : [];
    if (!v.length) return 0;
    var r = hh(x, y, til.seed >>> 0), acc = 0;
    for (var i = 0; i < v.length; i++) { acc += clamp(Number(v[i] && v[i].weight) || 0, 0, 1); if (r < acc) return i + 1; }
    return 0;
  }
  // drawMap(ctx, cache, map, cam, tMs, opts) draws the visible cells. cam {x, y, w, h} in logical pixels. opts.layer
  // 'below' (default: ground, then decorations without the above flag) or 'above' (decorations with it).
  function drawMap(ctx, cache, map, cam, tMs, opts) {
    opts = opts || {};
    var art = cache.art, T = cache.size, P = prepare(art, map, cache), W = map.w, H = map.h, codes = P.codes, st = { cells: 0, blits: 0 };
    var x0 = Math.max(0, Math.floor(cam.x / T)), y0 = Math.max(0, Math.floor(cam.y / T)), x1 = Math.min(W - 1, Math.floor((cam.x + cam.w - 1) / T)), y1 = Math.min(H - 1, Math.floor((cam.y + cam.h - 1) / T));
    var above = opts.layer === 'above';
    function at(arr, x, y) { return arr[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)]; }
    function rankAt(x, y) { var c = codes[at(P.g, x, y)]; return c && c.biome ? c.rank : 1e9; }
    function blit(til, blob, key, variant, anim, px, py) {
      var f = cache.tile(til.id, blob, frameAtTile(art, anim, tMs), key, variant);
      if (f) { blitFrame(ctx, f, px, py); st.blits++; }
    }
    function sameMask(arr, x, y, me) { var m = 0; for (var i = 0; i < 8; i++) if (at(arr, x + DIRS8[i][0], y + DIRS8[i][1]) === me) m |= DIRS8[i][2]; return m; }
    function drawInterior(info, arr, x, y, px, py, codeHere) {
      if (info.item.autotile || info.item.under) {
        var under = tileItem(info.til, 'floor');
        if (under && arr === P.g && info.key !== 'floor') blit(info.til, 0, 'floor', 0, under.anim, px, py);
      }
      blit(info.til, info.item.autotile ? blobIndex(sameMask(arr, x, y, codeHere)) : 0, info.key, 0, info.item.anim, px, py);
    }
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var i = y * W + x, px = x * T - Math.round(cam.x), py = y * T - Math.round(cam.y);
      st.cells++;
      if (!above) {
        var info = codes[P.g[i]];
        if (info && info.biome) {
          var own = info.rank, rs = [];
          for (var k = 0; k < 9; k++) { var rk = rankAt(x + (k % 3) - 1, y + Math.floor(k / 3) - 1); if (rk <= own && rs.indexOf(rk) < 0) rs.push(rk); }
          rs.sort(function (a, b) { return b - a; });
          var stack = [];
          for (var j = 0; j < rs.length; j++) {
            var m = 0;
            for (var q = 0; q < 8; q++) if (rankAt(x + DIRS8[q][0], y + DIRS8[q][1]) >= rs[j]) m |= DIRS8[q][2];
            stack.push([rs[j], m]);
            if (reduceMask(m) === 255) break;
          }
          for (var s = stack.length - 1; s >= 0; s--) {
            var ri = P.rankInfo[stack[s][0]];
            if (!ri) continue;
            var b = blobIndex(stack[s][1]), v = s === 0 && b === BLOB_FULL ? variantAt(ri.til, x, y) : 0;
            blit(ri.til, b, null, v, ri.til.anim, px, py);
          }
        } else if (info) drawInterior(info, P.g, x, y, px, py, P.g[i]);
      }
      var dinfo = codes[P.d[i]];
      if (dinfo && !dinfo.biome && !!(dinfo.flags & FLAGS.above) === above) drawInterior(dinfo, P.d, x, y, px, py, P.d[i]);
    }
    return st;
  }
  // matchClimate(tils, temp, moist, elev) -> the biome tileset whose climate box holds the point, preferring the
  // tightest box, then the higher priority. Feature biomes (volcanic) are placed by their own rule and never match.
  // With no box holding the point, the nearest box wins.
  function inBand(b, v) { return Array.isArray(b) && v >= b[0] && v <= b[1]; }
  function bandGap(b, v) { return !Array.isArray(b) ? 9 : v < b[0] ? b[0] - v : v > b[1] ? v - b[1] : 0; }
  function matchClimate(tils, t, m, e) {
    var best = null, bs = Infinity, near = null, nd = Infinity;
    (tils || []).forEach(function (til) {
      var c = til && til.climate;
      if (!c || til.kind !== 'biome' || c.feature) return;
      if (inBand(c.temp, t) && inBand(c.moist, m) && inBand(c.elev, e)) {
        var vol = (c.temp[1] - c.temp[0] + 1) * (c.moist[1] - c.moist[0] + 1) * (c.elev[1] - c.elev[0] + 1) * 100 - (Number(til.priority) || 0);
        if (vol < bs) { bs = vol; best = til; }
      } else {
        var d = bandGap(c.temp, t) + bandGap(c.moist, m) + bandGap(c.elev, e) * 1.5;
        if (d < nd) { nd = d; near = til; }
      }
    });
    return best || near;
  }

  // ---------------------------------------------------------------- battle backgrounds
  // bgd: {layers: [{kind, gen: {style, seed, colors: [dark, mid, light]}, parallax, drift}]}. Drawn straight to the
  // logical canvas in scanline rectangles, back to front. Horizontal drift scrolls a layer by parallax; everything wraps.
  var BG_KINDS = ['sky', 'far', 'mid', 'near', 'floor'];
  var BG_STYLES = {
    sky: ['gradient', 'stars', 'cave', 'storm', 'clouds'],
    far: ['peaks', 'hills', 'dunes', 'sea', 'canopy', 'wall', 'none'],
    mid: ['trees', 'pines', 'rocks', 'reeds', 'pillars', 'waves', 'mounds', 'none'],
    near: ['tufts', 'stones', 'none'],
    floor: ['grass', 'sand', 'snow', 'stone', 'water', 'planks', 'ash', 'mud']
  };
  function bgColors(L, ent) { var c = (L.gen && L.gen.colors) || []; return [0, 1, 2].map(function (i) { var m = c[i]; return typeof m === 'number' && ent[m] ? ent[m] : ['#203040', '#406080', '#8098b0'][i]; }); }
  // A periodic ridge: integer frequency sines over period P, so a scrolled layer wraps without a seam.
  function ridge(x, P, seed, amp) { var r = rng(seed), v = 0; for (var k = 1; k <= 4; k++) v += Math.sin((x / P) * Math.PI * 2 * (k * 2 + Math.floor(r() * 3)) + r() * 6.283) / k; return v * amp; }
  function bgDraw(ctx, bgd, tMs, w, h, opts) {
    opts = opts || {};
    var ent = opts.entries || [], hy = Math.round(h * 0.56), t = (Number(tMs) || 0) / 1000;
    var layers = (bgd && Array.isArray(bgd.layers) ? bgd.layers : []).slice().sort(function (a, b) { return BG_KINDS.indexOf(a && a.kind) - BG_KINDS.indexOf(b && b.kind); });
    var floorTop = hy;
    layers.forEach(function (L) {
      if (!L || BG_KINDS.indexOf(L.kind) < 0) return;
      var st = L.gen && L.gen.style || 'none', seed = (L.gen && L.gen.seed) >>> 0 || 1, c = bgColors(L, ent), r = rng(seed);
      var par = clamp(Number(L.parallax) || 0, 0, 1), off = (Number(L.drift) || 0) * t * 24 * (0.25 + par), P = w * 2, u = Math.max(1, Math.round(h / 224));
      function sx(x) { return mod(Math.round(x - off), P); }
      if (L.kind === 'sky') {
        var bands = 8, top = st === 'cave' ? h : hy;
        for (var i = 0; i < bands; i++) {
          var y0 = Math.floor(top * i / bands), y1 = Math.floor(top * (i + 1) / bands);
          ctx.fillStyle = i < bands / 2 ? c[0] : c[1]; ctx.fillRect(0, y0, w, y1 - y0);
          if (i === bands / 2 - 1 || i === bands / 2) { ctx.fillStyle = i < bands / 2 ? c[1] : c[0]; for (var dy = y0 + (i < bands / 2 ? 1 : 0); dy < y1; dy += 2) for (var dx = (dy >> 1) & 1; dx < w; dx += 2) ctx.fillRect(dx, dy, 1, 1); }
        }
        if (st === 'stars') { ctx.fillStyle = c[2]; for (var s = 0; s < 40; s++) { var tw = Math.sin(t * 3 + s) > -0.6; if (tw) ctx.fillRect(Math.floor(r() * w), Math.floor(r() * hy * 0.8), u, u); } }
        if (st === 'clouds' || st === 'storm') {
          ctx.fillStyle = st === 'storm' ? c[0] : c[2];
          for (var k = 0; k < 6; k++) { var cx = r() * P, cy = r() * hy * 0.6, cw = (30 + r() * 50) * u, ch = (6 + r() * 8) * u, px0 = sx(cx); for (var yy = 0; yy < ch; yy++) { var half = cw / 2 * Math.sqrt(1 - Math.pow(yy / ch * 2 - 1, 2)); var a0 = Math.round(px0 - half), a1 = Math.round(px0 + half); ctx.fillRect(a0, Math.round(cy + yy), a1 - a0, 1); ctx.fillRect(a0 - P, Math.round(cy + yy), a1 - a0, 1); } }
        }
        if (st === 'cave') { ctx.fillStyle = c[0]; for (var x = 0; x < w; x += 2 * u) { var dl = (6 + 18 * Math.abs(ridge(sx(x), P, seed, 1))) * u; ctx.fillRect(x, 0, 2 * u, Math.round(dl)); } }
        return;
      }
      if (L.kind === 'far') {
        if (st === 'none') return;
        if (st === 'wall') { ctx.fillStyle = c[1]; ctx.fillRect(0, 0, w, hy); ctx.fillStyle = c[0]; var bh = 8 * u; for (var y = 0; y < hy; y += bh) { ctx.fillRect(0, y, w, u); for (var x2 = ((y / bh) % 2) * 8 * u; x2 < w; x2 += 16 * u) ctx.fillRect(x2, y, u, bh); } return; }
        var amp = st === 'peaks' ? hy * 0.32 : st === 'hills' ? hy * 0.12 : st === 'dunes' ? hy * 0.08 : st === 'canopy' ? hy * 0.06 : hy * 0.02, base = st === 'peaks' ? hy * 0.62 : st === 'sea' ? hy : hy * 0.8;
        // Peaks are seeded triangles (the highest wins per column), lit on their left flank, capped in the light color.
        var pk = [];
        if (st === 'peaks') for (var q3 = 0; q3 < 9; q3++) pk.push([r() * P, hy * (0.25 + r() * 0.5), 0.55 + r() * 0.6]);
        for (var x3 = 0; x3 < w; x3++) {
          var X = sx(x3), yt, lit = false, cap = 0;
          if (st === 'peaks') {
            var top = hy;
            pk.forEach(function (p) { var dxp = X - p[0]; dxp -= P * Math.round(dxp / P); var y = hy - p[1] + Math.abs(dxp) * p[2]; if (y < top) { top = y; lit = dxp < 0; cap = Math.max(0, p[1] * 0.28 - Math.abs(dxp) * p[2] * 0.2); } });
            yt = Math.round(top + (hh(Math.floor(X / (2 * u)), 0, seed) - 0.5) * 2 * u);
          } else yt = Math.round(base - amp * (ridge(X, P, seed, 1) * 0.5 + 0.5) - (st === 'canopy' ? Math.abs(Math.sin(X / (6 * u))) * 5 * u : 0));
          ctx.fillStyle = st === 'peaks' && !lit ? c[0] : c[1]; ctx.fillRect(x3, yt, 1, hy - yt + 1);
          ctx.fillStyle = st === 'peaks' ? c[2] : c[0]; ctx.fillRect(x3, yt, 1, st === 'peaks' ? Math.max(1, Math.round(cap)) : u);
        }
        if (st === 'sea') { ctx.fillStyle = c[2]; for (var y4 = 0; y4 < 4; y4++) for (var k4 = 0; k4 < 10; k4++) ctx.fillRect(sx(r() * P + y4 * 7), hy - 2 * u - y4 * 3 * u, 6 * u, u); }
        return;
      }
      if (L.kind === 'mid' || L.kind === 'near') {
        if (st === 'none') return;
        var near = L.kind === 'near', count = near ? 7 : st === 'pillars' ? 5 : 8, sc = near ? 2 : 1.8;
        for (var n = 0; n < count; n++) {
          var ox = r() * P, ph = r(), x5 = sx(ox), gy = near ? h - Math.round((4 + r() * 10) * u) : hy + Math.round(r() * 3 * u), s5 = (0.7 + r() * 0.6) * sc * u;
          [x5, x5 - P].forEach(function (bx) {
            if (bx < -60 * s5 || bx > w + 60 * s5) return;
            if (st === 'trees') { ctx.fillStyle = c[0]; ctx.fillRect(Math.round(bx - 2 * s5), gy - Math.round(12 * s5), Math.round(4 * s5), Math.round(12 * s5)); for (var j = 0; j < 14 * s5; j++) { var hw = Math.sqrt(Math.max(0, 1 - Math.pow(j / (14 * s5) * 2 - 1, 2))) * 12 * s5; ctx.fillStyle = j < 6 * s5 ? c[2] : c[1]; ctx.fillRect(Math.round(bx - hw), gy - Math.round(26 * s5) + j, Math.round(hw * 2), 1); } }
            else if (st === 'pines') { for (var j2 = 0; j2 < 30 * s5; j2++) { var hw2 = (j2 % (10 * s5)) / (10 * s5) * 6 * s5 + j2 / (30 * s5) * 4 * s5; ctx.fillStyle = j2 % (10 * s5) < 3 * s5 ? c[2] : c[1]; ctx.fillRect(Math.round(bx - hw2), gy - Math.round(32 * s5) + j2, Math.max(1, Math.round(hw2 * 2)), 1); } ctx.fillStyle = c[0]; ctx.fillRect(Math.round(bx - s5), gy - Math.round(3 * s5), Math.max(1, Math.round(2 * s5)), Math.round(3 * s5)); }
            else if (st === 'rocks' || st === 'stones' || st === 'mounds') { var rw = (st === 'mounds' ? 22 : 10) * s5, rh = (st === 'mounds' ? 10 : 7) * s5; for (var j3 = 0; j3 < rh; j3++) { var hw3 = Math.sqrt(1 - Math.pow(1 - j3 / rh, 2)) * rw / 2; ctx.fillStyle = j3 < rh * 0.35 ? c[2] : c[1]; ctx.fillRect(Math.round(bx - hw3), gy - Math.round(rh) + j3, Math.max(1, Math.round(hw3 * 2)), 1); } ctx.fillStyle = c[0]; ctx.fillRect(Math.round(bx - rw / 2), gy - 1, Math.round(rw), Math.max(1, u)); }
            else if (st === 'reeds' || st === 'tufts') { ctx.fillStyle = c[1]; for (var j4 = 0; j4 < 5; j4++) { var hh4 = (st === 'reeds' ? 10 + j4 * 3 : 3 + j4) * s5; ctx.fillRect(Math.round(bx + (j4 - 2) * 2 * s5), gy - Math.round(hh4), Math.max(1, Math.round(s5)), Math.round(hh4)); } ctx.fillStyle = c[2]; ctx.fillRect(Math.round(bx), gy - Math.round((st === 'reeds' ? 22 : 6) * s5), Math.max(1, Math.round(2 * s5)), Math.max(1, Math.round(3 * s5))); }
            else if (st === 'pillars') { var pw = 13 * s5, phh = hy * (0.7 + ph * 0.2); ctx.fillStyle = c[1]; ctx.fillRect(Math.round(bx - pw / 2), Math.round(gy - phh), Math.round(pw), Math.round(phh)); ctx.fillStyle = c[2]; ctx.fillRect(Math.round(bx - pw / 2), Math.round(gy - phh), Math.max(1, Math.round(pw / 3)), Math.round(phh)); ctx.fillStyle = c[0]; ctx.fillRect(Math.round(bx - pw / 2 - 2 * s5), Math.round(gy - phh), Math.round(pw + 4 * s5), Math.max(1, Math.round(3 * s5))); }
            else if (st === 'waves') { ctx.fillStyle = c[2]; ctx.fillRect(Math.round(bx), gy + Math.round(Math.sin(t * 2 + ph * 6) * 2 * u), Math.round(10 * s5), Math.max(1, u)); }
          });
        }
        return;
      }
      if (L.kind === 'floor') {
        floorTop = hy;
        ctx.fillStyle = c[1]; ctx.fillRect(0, hy, w, h - hy);
        var rows = 7;
        for (var i2 = 0; i2 < rows; i2++) {
          var fy = hy + Math.round((h - hy) * Math.pow(i2 / rows, 1.7)), gap = Math.max(4, Math.round((4 + i2 * 5) * u));
          ctx.fillStyle = i2 % 2 ? c[0] : c[2];
          if (st === 'planks' || st === 'stone') { ctx.fillRect(0, fy, w, u); for (var x6 = mod(-Math.round(off * (0.3 + i2 * 0.1)) + i2 * 7, gap * 3); x6 < w; x6 += gap * 3) ctx.fillRect(x6, fy, u, Math.max(1, Math.round((h - hy) / rows))); }
          else if (st === 'water') { for (var k6 = 0; k6 < w; k6 += gap * 2) ctx.fillRect(mod(k6 + Math.round(Math.sin(t + i2) * gap), w), fy, gap, u); }
          else { for (var k7 = 0; k7 < w / gap; k7++) { var xx = mod(Math.floor(r() * w) - Math.round(off * (0.3 + i2 * 0.15)), w); ctx.fillRect(xx, fy + Math.floor(r() * 2 * u), Math.max(u, Math.round(gap / 3)), u); } }
        }
        ctx.fillStyle = c[0]; ctx.fillRect(0, hy, w, u);
      }
    });
    return { horizon: floorTop };
  }

  R.tiles = {
    SLOTS: TILE_SLOTS, RAMPS: TILE_RAMPS, FLAGS: FLAGS, STYLES: STYLES, ISTYLES: ISTYLES, TECHNIQUES: TECHNIQUES, ANIM_TYPES: ANIM_TYPES,
    BLOB: BLOB, BLOB_FULL: BLOB_FULL, slots: tileSlots, colorway: tileColorway, detailCell: detailCell,
    reduce: reduceMask, mask8: mask8, blobIndex: blobIndex, quarterFor: quarterFor, compose: composeTile, template: template, compose47: compose47,
    tile: tileIdx, slotsFor: tileSlotsFor, cycleSlots: cycleSlots, anim: animOf, frameAt: frameAtTile,
    item: tileItem, resolve: resolveRef, prioList: prioList, prepare: prepare, flagsAt: flagsAt, drawMap: drawMap, matchClimate: matchClimate, variantAt: variantAt
  };
  R.bg = { KINDS: BG_KINDS, STYLES: BG_STYLES, draw: bgDraw };
