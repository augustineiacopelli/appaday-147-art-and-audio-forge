// === ENGINE:RENDER BEGIN ===
// ENGINE_RENDER is the pure rendering engine. It reads no host global: art, rules, charter, contexts, and callbacks always
// arrive as arguments, so Phase 8 can lift this fence into engine-render.js unchanged. Phase 1 adds color math (OKLab) and
// the palette module. Later phases add their sections above the freeze at the bottom of this fence.
var ENGINE_RENDER = (function () {
  'use strict';
  var R = { version: '1.0.0' };

  // ---------------------------------------------------------------- shared helpers
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash32(str) {
    var h = 0x811c9dc5;
    str = String(str);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  R.util = { clamp: clamp, rng: rng, hash32: hash32 };

  // ---------------------------------------------------------------- color (sRGB, OKLab, OKLCH)
  var HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
  function normHex(hex) {
    var m = HEX_RE.exec(String(hex == null ? '' : hex).trim());
    if (!m) return null;
    var h = m[1].toLowerCase();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return '#' + h;
  }
  function hexToRgb(hex) {
    var h = normHex(hex);
    if (!h) return null;
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  function byteHex(v) { var t = clamp(Math.round(v), 0, 255).toString(16); return t.length < 2 ? '0' + t : t; }
  function rgbToHex(r, g, b) { return '#' + byteHex(r) + byteHex(g) + byteHex(b); }
  function toLinear(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function toSrgb(c) { var v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return v * 255; }
  function linToLab(r, g, b) {
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function labToLin(L, a, b) {
    var l = L + 0.3963377774 * a + 0.2158037573 * b, m = L - 0.1055613458 * a - 0.0638541728 * b, s = L - 0.0894841775 * a - 1.2914855480 * b;
    l = l * l * l; m = m * m * m; s = s * s * s;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  var labMemo = {}, labMemoSize = 0;
  function hexToLab(hex) {
    var fast = typeof hex === 'string' ? labMemo[hex] : null;
    if (fast) return fast;
    var h = normHex(hex);
    if (!h) return null;
    var hit = labMemo[h];
    if (hit) return hit;
    var c = hexToRgb(h), lab = linToLab(toLinear(c[0]), toLinear(c[1]), toLinear(c[2]));
    if (labMemoSize > 20000) { labMemo = {}; labMemoSize = 0; }
    labMemo[h] = lab; labMemoSize++;
    return lab;
  }
  function labToLch(lab) {
    var C = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]), h = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
    return [lab[0], C, h < 0 ? h + 360 : h];
  }
  function lchToLab(L, C, h) { var r = h * Math.PI / 180; return [L, C * Math.cos(r), C * Math.sin(r)]; }
  function inGamut(lin) { var e = 0.0005; return lin[0] >= -e && lin[0] <= 1 + e && lin[1] >= -e && lin[1] <= 1 + e && lin[2] >= -e && lin[2] <= 1 + e; }
  // OKLCH to hex with gamut mapping by chroma reduction (hue and lightness are kept, chroma shrinks until it fits).
  function lchToHex(L, C, h) {
    L = clamp(L, 0, 1); C = Math.max(0, C);
    var lab = lchToLab(L, C, h), lin = labToLin(lab[0], lab[1], lab[2]);
    if (!inGamut(lin)) {
      var lo = 0, hi = C;
      for (var i = 0; i < 18; i++) {
        var mid = (lo + hi) / 2, t = lchToLab(L, mid, h), tl = labToLin(t[0], t[1], t[2]);
        if (inGamut(tl)) lo = mid; else hi = mid;
      }
      lab = lchToLab(L, lo, h); lin = labToLin(lab[0], lab[1], lab[2]);
    }
    return rgbToHex(toSrgb(clamp(lin[0], 0, 1)), toSrgb(clamp(lin[1], 0, 1)), toSrgb(clamp(lin[2], 0, 1)));
  }
  function hexToLch(hex) { var lab = hexToLab(hex); return lab ? labToLch(lab) : null; }
  function labToHex(lab) { var l = labToLch(lab); return lchToHex(l[0], l[1], l[2]); }
  function dist(a, b) { var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return Math.sqrt(x * x + y * y + z * z); }
  function distHex(a, b) { var x = hexToLab(a), y = hexToLab(b); return x && y ? dist(x, y) : Infinity; }
  // Signed hue distance, from h toward target, in (-180, 180].
  function hueDelta(h, target) { var d = ((target - h) % 360 + 540) % 360 - 180; return d === -180 ? 180 : d; }
  function rotateToward(h, target, deg) {
    var d = hueDelta(h, target), step = Math.sign(d) * Math.min(Math.abs(d), deg);
    return ((h + step) % 360 + 360) % 360;
  }
  // A shade or tint of a color the way pixel artists ramp: shadows cool toward blue violet, highlights warm toward yellow,
  // and chroma falls off toward both ends. k is in steps (negative darker); spread is the lightness change per step.
  function shade(lch, k, spread) {
    var L = clamp(lch[0] + k * spread, 0.06, 0.97);
    var ak = Math.abs(k), grey = lch[1] < 0.03;
    var h = grey ? lch[2] : k < 0 ? rotateToward(lch[2], 265, 9 * ak) : k > 0 ? rotateToward(lch[2], 85, 7 * ak) : lch[2];
    var C = lch[1] * (k < 0 ? 1 - 0.12 * ak : k > 0 ? 1 - 0.2 * ak : 1);
    if (L > 0.9) C *= 0.6;
    return [L, Math.max(0, C), h];
  }
  function idealRamp(hex, steps, spread) {
    var lch = hexToLch(hex) || [0.5, 0, 0], out = [], mid = (steps - 1) / 2;
    for (var i = 0; i < steps; i++) out.push(shade(lch, i - mid, spread));
    return out;
  }
  function contrastInk(hex) { var lab = hexToLab(hex); return lab && lab[0] > 0.66 ? '#111111' : '#ffffff'; }
  R.color = {
    normHex: normHex, hexToRgb: hexToRgb, rgbToHex: rgbToHex, hexToLab: hexToLab, hexToLch: hexToLch, labToHex: labToHex,
    lchToHex: lchToHex, dist: dist, distHex: distHex, hueDelta: hueDelta, rotateToward: rotateToward, shade: shade,
    idealRamp: idealRamp, contrastInk: contrastInk
  };

  // ---------------------------------------------------------------- palette
  // Local sprite palettes have 16 slots: 0 transparent, 1 outline, then three step ramps and a two step metal ramp. The
  // enemy layout reuses the same slots with enemy materials. Tilesets use their own 32 slot layout (Phase 4).
  var RAMPS = { skin: [2, 3, 4], hair: [5, 6, 7], clothA: [8, 9, 10], clothB: [11, 12, 13], metal: [14, 15] };
  var ENEMY_RAMPS = { body: [2, 3, 4], shade: [5, 6, 7], accent: [8, 9, 10], eye: [11, 12, 13], metal: [14, 15] };
  var LOCAL_SLOTS = 16;
  var SKIN = ['#f6d8bf', '#eabf98', '#d39a6e', '#b07a4e', '#8a5634', '#5e3a24'];
  var HAIR = ['#2a2220', '#4a2e1c', '#7a4a24', '#b07a34', '#d8b060', '#c8c4bc', '#9a3a2a', '#3a3a4a'];
  var METAL = ['#a3abba', '#c4a04c', '#7c7f88', '#b07a54'];
  // Built in anchors keep a palette usable for people, terrain, and metal whatever the bundle's own colors are.
  var BUILTIN = [
    { hex: '#f2c9a8', role: 'skin', w: 0.8 }, { hex: '#b47e54', role: 'skin', w: 0.8 }, { hex: '#6a4430', role: 'skin', w: 0.75 },
    { hex: '#3a2a22', role: 'hair', w: 0.65 }, { hex: '#c8963c', role: 'hair', w: 0.6 },
    { hex: '#4f9a3e', role: 'terrain', w: 0.75 }, { hex: '#2d5a32', role: 'terrain', w: 0.7 }, { hex: '#3a72c0', role: 'terrain', w: 0.75 },
    { hex: '#8cc4ec', role: 'terrain', w: 0.7 }, { hex: '#e2cc92', role: 'terrain', w: 0.65 }, { hex: '#8a5e3a', role: 'terrain', w: 0.65 },
    { hex: '#7e848e', role: 'terrain', w: 0.6 }, { hex: '#eaf2fa', role: 'terrain', w: 0.55 },
    { hex: '#a3abba', role: 'metal', w: 0.6 }, { hex: '#c4a04c', role: 'metal', w: 0.6 }
  ];
  var DARK = '#140f1c', LIGHT = '#f7f2e4';

  function famColors(rules) {
    var m = rules && rules.fam_ && typeof rules.fam_ === 'object' ? rules.fam_ : {};
    return Object.keys(m).map(function (id) { return m[id]; }).filter(function (f) { return f && typeof f === 'object'; });
  }
  function collectAnchors(charter, rules) {
    var out = [{ hex: DARK, role: 'outline', w: 9 }, { hex: LIGHT, role: 'highlight', w: 9 }];
    var els = charter && charter.ruleset && Array.isArray(charter.ruleset.elements) ? charter.ruleset.elements : [];
    els.forEach(function (e) { var h = e && normHex(e.color); if (h) out.push({ hex: h, role: 'element', src: e.key, w: 1 }); });
    famColors(rules).forEach(function (f) {
      var p = f.palette || {};
      var a = normHex(p.base), c = normHex(p.accent);
      if (a) out.push({ hex: a, role: 'family', src: f.id, w: 0.95 });
      if (c) out.push({ hex: c, role: 'family accent', src: f.id, w: 0.75 });
    });
    BUILTIN.forEach(function (x) { out.push({ hex: x.hex, role: x.role, w: x.w }); });
    // Collapse near duplicates, keeping the heavier anchor.
    var kept = [];
    out.forEach(function (a) {
      var lab = hexToLab(a.hex);
      for (var i = 0; i < kept.length; i++) {
        if (dist(lab, hexToLab(kept[i].hex)) < 0.018) { if (a.w > kept[i].w) kept[i] = a; return; }
      }
      kept.push(a);
    });
    return kept;
  }
  // Weighted farthest point selection in OKLab. Each pick maximizes weight times distance to everything already chosen.
  function maximin(pool, chosen, count) {
    var labs = pool.map(function (c) { return hexToLab(c.hex); });
    var best = labs.map(function (l) { var d = Infinity; chosen.forEach(function (h) { d = Math.min(d, dist(l, hexToLab(h))); }); return d; });
    while (chosen.length < count) {
      var bi = -1, bs = 0;
      for (var i = 0; i < pool.length; i++) { var s = pool[i].w * best[i]; if (s > bs) { bs = s; bi = i; } }
      if (bi < 0) break;
      var hx = pool[bi].hex, bl = labs[bi];
      chosen.push(hx);
      for (var j = 0; j < pool.length; j++) best[j] = Math.min(best[j], dist(labs[j], bl));
    }
    return chosen;
  }
  function sortEntries(entries) {
    var rows = entries.map(function (h) { var l = hexToLch(h); return { h: h, L: l[0], C: l[1], H: l[2] }; });
    rows.sort(function (a, b) {
      var an = a.C < 0.035, bn = b.C < 0.035;
      if (an !== bn) return an ? -1 : 1;
      if (!an) { var ab = Math.floor(((a.H + 15) % 360) / 30), bb = Math.floor(((b.H + 15) % 360) / 30); if (ab !== bb) return ab - bb; }
      return a.L - b.L;
    });
    return rows.map(function (r) { return r.h; });
  }
  // Two to four colors: a single hue lightness ramp, the way tiny handheld palettes work.
  function monoRamp(size, anchors) {
    var el = anchors.filter(function (a) { return a.role === 'element' || a.role === 'family'; })[0];
    var h = el ? hexToLch(el.hex)[2] : 110, out = [];
    for (var i = 0; i < size; i++) {
      var t = size === 1 ? 0 : i / (size - 1);
      out.push(lchToHex(0.13 + t * 0.83, 0.035 + 0.03 * Math.sin(t * Math.PI), h));
    }
    return out;
  }
  function paletteSize(charter) {
    var n = charter && charter.specs ? Math.round(Number(charter.specs.paletteSize)) : NaN;
    return clamp(isFinite(n) ? n : 64, 2, 256);
  }
  // buildMaster(charter, rules, seed) -> {size, entries: [hex x size], anchors: [{hex, role, src}]}
  function buildMaster(charter, rules, seed) {
    var size = paletteSize(charter), anchors = collectAnchors(charter, rules), rnd = rng(seed || 1), entries;
    if (size <= 4) entries = monoRamp(size, anchors);
    else {
      var forced = anchors.filter(function (a) { return a.w > 5; }).map(function (a) { return a.hex; });
      var soft = anchors.filter(function (a) { return a.w <= 5; });
      // Stage one spends up to half the budget on anchors only, so bundle colors are honored before ramps compete.
      var chosen = maximin(soft, forced.slice(), Math.min(size, Math.max(forced.length + 1, Math.floor(size * 0.5))));
      var pool = soft.slice(), ks = [-2, -1, 1, 2], kw = [0.5, 0.72, 0.68, 0.45];
      soft.forEach(function (a) {
        var lch = hexToLch(a.hex);
        ks.forEach(function (k, i) { var s = shade(lch, k, 0.11); pool.push({ hex: lchToHex(s[0], s[1], s[2]), w: Math.min(1, a.w) * kw[i] }); });
      });
      // Even fill so large palettes still cover the hue wheel; the seed turns the wheel.
      var turn = rnd() * 30;
      for (var L = 0.22; L < 0.93; L += 0.1) {
        for (var hh = 0; hh < 360; hh += 30) { pool.push({ hex: lchToHex(L, 0.07, hh + turn), w: 0.3 }); if (L < 0.85) pool.push({ hex: lchToHex(L, 0.14, hh + turn + 15), w: 0.28 }); }
        pool.push({ hex: lchToHex(L, 0, 0), w: 0.32 });
      }
      chosen = maximin(pool, chosen, size);
      var guard = 0;
      while (chosen.length < size && guard++ < 5000) {
        var hx = lchToHex(0.15 + rnd() * 0.8, rnd() * 0.18, rnd() * 360);
        if (chosen.indexOf(hx) < 0) chosen.push(hx);
      }
      entries = chosen.slice(0, size);
    }
    return { size: size, entries: sortEntries(entries), anchors: anchors.map(function (a) { var o = { hex: a.hex, role: a.role }; if (a.src) o.src = a.src; return o; }) };
  }
  // nearest(master, hex) -> index of the closest master entry in OKLab.
  function nearest(master, hex) {
    var lab = hexToLab(hex), bi = 0, bd = Infinity;
    if (!lab) return 0;
    for (var i = 0; i < master.length; i++) { var m = hexToLab(master[i]); if (!m) continue; var d = dist(lab, m); if (d < bd) { bd = d; bi = i; } }
    return bi;
  }
  // Maps an ideal ramp onto master indices, dark to light. Picks stay monotone in lightness and avoid reuse while any
  // fresh candidate keeps the order; tiny palettes fall back to repeats, which is correct for them.
  // The k nearest labs to t, nearest first, by insertion into a short list (no full sort of the master).
  // Ramp matching weighs hue and chroma above lightness (order keeps lightness honest) and adds a soft penalty for indices
  // another material already uses, so cloth A and cloth B stop sharing colors whenever the master has room.
  function closest(labs, t, k, avoid) {
    var out = [];
    for (var i = 0; i < labs.length; i++) {
      var l = labs[i], dl = l[0] - t[0], da = l[1] - t[1], db = l[2] - t[2];
      var d = Math.sqrt(0.45 * dl * dl + da * da + db * db) + (avoid && avoid[i] ? 0.06 : 0);
      if (out.length === k && d >= out[k - 1].d) continue;
      var j = out.length < k ? out.length : k - 1;
      while (j > 0 && out[j - 1].d > d) { out[j] = out[j - 1]; j--; }
      out[j] = { i: i, d: d, L: labs[i][0] };
    }
    return out;
  }
  function rampFor(master, hex, steps, spread, avoid) {
    var ideal = idealRamp(hex, steps, spread || 0.12), used = {}, out = [], prevL = -1;
    var labs = master.map(function (h) { return hexToLab(h) || [0, 0, 0]; });
    ideal.forEach(function (lch) {
      var t = lchToLab(lch[0], lch[1], lch[2]);
      var order = closest(labs, t, 12, avoid);
      var pick = null, near = order[0];
      for (var j = 0; j < order.length; j++) {
        var o = order[j];
        if (used[o.i] || o.L <= prevL) continue;
        if (o.d > near.d + 0.09) break;
        pick = o; break;
      }
      if (!pick) pick = near.L >= prevL ? near : (out.length ? { i: out[out.length - 1], L: prevL } : near);
      used[pick.i] = 1; out.push(pick.i); prevL = Math.max(prevL, pick.L);
    });
    return out;
  }
  function ramp(master, idx, steps, spread) { return rampFor(master, master[clamp(idx | 0, 0, master.length - 1)], steps, spread); }
  function outline(master) {
    var bi = 0, bl = Infinity;
    master.forEach(function (h, i) { var l = hexToLab(h); if (l && l[0] < bl) { bl = l[0]; bi = i; } });
    return bi;
  }
  function slotsFrom(master, mats, layout) {
    var s = new Array(LOCAL_SLOTS);
    for (var i = 0; i < LOCAL_SLOTS; i++) s[i] = 0;
    s[0] = null; s[1] = outline(master);
    Object.keys(layout).forEach(function (k) { (layout[k] || []).forEach(function (slot, j) { var v = mats[k] && mats[k][j]; s[slot] = typeof v === 'number' && v >= 0 && v < master.length ? v : s[1]; }); });
    return s;
  }
  // Seeded colorway sources: the colors a character is dressed in, before they are fitted to the master palette.
  // hint: {hue (degrees, spreads a party), dark (villain)}
  function colorwaySource(seed, hint) {
    hint = hint || {};
    var r = rng(seed), hueA = typeof hint.hue === 'number' ? hint.hue : r() * 360;
    var skin = SKIN[Math.floor(r() * SKIN.length)], hair = HAIR[Math.floor(r() * HAIR.length)];
    var la = hint.dark ? 0.38 + r() * 0.08 : 0.52 + r() * 0.1, ca = 0.11 + r() * 0.05;
    var compl = r() < 0.5, hueB = hueA + (compl ? 150 + r() * 60 : 25 + r() * 35);
    var clothA = lchToHex(la, ca, hueA), clothB = lchToHex(hint.dark ? 0.3 + r() * 0.1 : 0.48 + r() * 0.2, 0.08 + r() * 0.06, hueB);
    var metal = METAL[Math.floor(r() * METAL.length)];
    return { skin: skin, hair: hair, clothA: clothA, clothB: clothB, metal: metal, accent: r() < 0.5 ? 'clothB' : 'metal' };
  }
  // colorway(master, src) -> {skin, hair, clothA, clothB: [m, m, m], metal: [m, m], accent}
  function colorway(master, src) {
    var cw = { accent: src.accent === 'metal' ? 'metal' : 'clothB' };
    // Two colors: every material reads as light with a dark shadow step, so figures stay readable against the outline
    // instead of collapsing into dark silhouettes.
    if (master.length <= 2) {
      var dk = outline(master), lt = master.length > 1 ? 1 - dk : dk;
      Object.keys(RAMPS).forEach(function (k) { cw[k] = RAMPS[k].map(function (_, j) { return j === 0 ? dk : lt; }); });
      return cw;
    }
    var taken = {};
    taken[outline(master)] = 1;
    Object.keys(RAMPS).forEach(function (k) {
      cw[k] = rampFor(master, src[k] || '#808080', RAMPS[k].length, k === 'metal' ? 0.16 : 0.12, taken);
      cw[k].forEach(function (i) { taken[i] = 1; });
    });
    return cw;
  }
  function local(master, cw) { return slotsFrom(master, cw, RAMPS); }
  // tier(fam, tierIndex, master, avoid) -> {slots, ramps, rampOffset, inverted, collapsed}. Day 146 tier families carry
  // their own shifted colors; when that shift lands on the same master indices as a sibling (common at small sizes),
  // the ramps are offset in lightness, then inverted, until the palette differs from everything in avoid.
  function tier(fam, tierIndex, master, avoid) {
    var p = (fam && fam.palette) || {}, base = normHex(p.base) || '#7a7a7a', acc = normHex(p.accent) || '#d0d0d0';
    var bl = hexToLch(base), seen = {};
    (avoid || []).forEach(function (s) { seen[String(s)] = 1; });
    var shadeHex = lchToHex(bl[0] * 0.82, bl[1] * 0.7, rotateToward(bl[2], 265, 28));
    var eyeHex = bl[0] > 0.6 ? lchToHex(0.3, 0.12, bl[2] + 180) : lchToHex(0.88, 0.14, (bl[2] + 180) % 360);
    var tries = [0, 1, -1, 2, -2, 3, -3], first = null;
    function lift(hex, k) { var l = hexToLch(hex); return lchToHex(clamp(l[0] + k * 0.13, 0.08, 0.96), l[1], l[2]); }
    for (var t = 0; t < tries.length * 2; t++) {
      var k = tries[t % tries.length], inv = t >= tries.length;
      var mats = { body: rampFor(master, lift(base, k), 3), shade: rampFor(master, lift(shadeHex, k), 3), accent: rampFor(master, lift(acc, k), 3), eye: rampFor(master, eyeHex, 3), metal: rampFor(master, '#9aa0ac', 2, 0.16) };
      if (inv) { var sw = mats.body; mats.body = mats.accent; mats.accent = sw; }
      var slots = slotsFrom(master, mats, ENEMY_RAMPS);
      var res = { slots: slots, ramps: ENEMY_RAMPS, rampOffset: k, inverted: inv, collapsed: false, tier: tierIndex || 1 };
      if (!first) first = res;
      if (!seen[String(slots)]) return res;
    }
    first.collapsed = true;
    return first;
  }
  // element(color, master) -> {palette: [dark, base, light, hot], flash, tint}
  function element(color, master) {
    var hex = normHex(color) || '#c0c0c0', l = hexToLch(hex);
    var ideal = [shade(l, -1.2, 0.12), l, shade(l, 1, 0.12), [0.95, l[1] * 0.35, rotateToward(l[2], 85, 20)]];
    var used = {}, prevL = -1, pal = [];
    ideal.forEach(function (c) {
      var i = nearest(master, lchToHex(c[0], c[1], c[2]));
      if ((used[i] || hexToLab(master[i])[0] < prevL) && master.length > 4) {
        var t = lchToLab(c[0], c[1], c[2]), bd = Infinity;
        master.forEach(function (h, j) { var lb = hexToLab(h); if (used[j] || lb[0] < prevL) return; var d = dist(lb, t); if (d < bd) { bd = d; i = j; } });
      }
      used[i] = 1; prevL = Math.max(prevL, hexToLab(master[i])[0]); pal.push(i);
    });
    return { palette: pal, flash: nearest(master, '#ffffff'), tint: nearest(master, hex) };
  }
  // collapse(pal, size) -> {entries, map}: reduce any palette to size colors, keeping the darkest and lightest, and map
  // every old index to its nearest survivor.
  function collapse(pal, size) {
    size = clamp(size | 0, 1, 256);
    var list = pal.map(normHex).filter(Boolean);
    if (list.length <= size) return { entries: list.slice(), map: list.map(function (_, i) { return i; }) };
    var dark = list[outline(list)], light = list.reduce(function (a, h) { return hexToLab(h)[0] > hexToLab(a)[0] ? h : a; }, list[0]);
    var seed = size === 1 ? [dark] : dark === light ? [dark] : [dark, light];
    var entries = maximin(list.map(function (h) { return { hex: h, w: 1 }; }), seed, size);
    return { entries: entries, map: list.map(function (h) { return nearest(entries, h); }) };
  }
  R.palette = {
    LOCAL_SLOTS: LOCAL_SLOTS, RAMPS: RAMPS, ENEMY_RAMPS: ENEMY_RAMPS,
    size: paletteSize, anchors: collectAnchors, buildMaster: buildMaster, nearest: nearest, ramp: ramp, rampFor: rampFor,
    outline: outline, colorwaySource: colorwaySource, colorway: colorway, local: local, slotsFrom: slotsFrom,
    tier: tier, element: element, collapse: collapse
  };

  // ---------------------------------------------------------------- later phases insert sections above this line
  Object.keys(R).forEach(function (k) { if (R[k] && typeof R[k] === 'object') Object.freeze(R[k]); });
  return Object.freeze(R);
})();
// === ENGINE:RENDER END ===
