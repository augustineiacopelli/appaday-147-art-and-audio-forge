  // ================================================================ PHASE 3: MOTION
  // build.js splices this file into ENGINE:RENDER after the composer. It reads no host global: records, palettes, and
  // drawing contexts arrive as arguments. Drawing uses fillRect and drawImage only, at logical resolution.

  // ---------------------------------------------------------------- animation records
  // anm_ kinds:
  //   sprite  {frames: [{pose, ms, off: [dx, dy], flash}], loop, markers: [{f, type, arg}]}
  //           off is in logical pixels at a 16 pixel tile (scaled by tile size); dx is forward, so it flips facing left.
  //   death   {method: scatter|fade|melt, ms}: generated at runtime from the sprite's own pixels.
  //   ability {caster: attack|cast|item|limit, travel: {type: none|projectile|beam|rise|fall, ms},
  //            impact: {fx: efx_ id or null, ms, flash, shake}, hits, markers: [{ms, type, arg}]}
  var MARKER_TYPES = ['hit', 'sfx', 'particle', 'flash', 'shake'];
  var DEATH_METHODS = ['scatter', 'fade', 'melt'];
  var CASTERS = ['attack', 'cast', 'item', 'limit'];
  var TRAVELS = ['none', 'projectile', 'beam', 'rise', 'fall'];
  function frames(anm) { return anm && Array.isArray(anm.frames) ? anm.frames.filter(function (f) { return f && typeof f === 'object'; }) : []; }
  function frameMs(f) { var m = Number(f && f.ms); return m > 0 ? Math.min(m, 10000) : 100; }
  function duration(anm) {
    if (!anm) return 0;
    if (anm.kind === 'death') return Math.max(1, Number(anm.ms) || 700);
    if (anm.kind === 'ability') { var tl = abilityTimeline(anm, null); return tl.duration; }
    return frames(anm).reduce(function (s, f) { return s + frameMs(f); }, 0);
  }
  function frameStart(anm, i) { var fr = frames(anm), t = 0; for (var k = 0; k < i && k < fr.length; k++) t += frameMs(fr[k]); return t; }
  // frameAt(anm, t) -> {index, pose, off, flash, ms, done, cycle}. A looping animation wraps; a one shot holds its last
  // frame and reports done.
  function frameAt(anm, t) {
    var fr = frames(anm), D = duration(anm);
    if (!fr.length || !(D > 0)) return { index: 0, pose: 'stand', off: [0, 0], flash: false, ms: 0, done: true, cycle: 0 };
    t = Math.max(0, Number(t) || 0);
    var cycle = 0, done = false;
    if (anm.loop) { cycle = Math.floor(t / D); t = t - cycle * D; } else if (t >= D) { done = true; t = D - 0.0001; }
    var acc = 0;
    for (var i = 0; i < fr.length; i++) {
      var m = frameMs(fr[i]);
      if (t < acc + m) {
        var f = fr[i], off = Array.isArray(f.off) ? [Number(f.off[0]) || 0, Number(f.off[1]) || 0] : [0, 0];
        return { index: i, pose: f.pose || 'stand', off: off, flash: !!f.flash, ms: m, done: done, cycle: cycle, local: t - acc };
      }
      acc += m;
    }
    var L = fr[fr.length - 1];
    return { index: fr.length - 1, pose: L.pose || 'stand', off: L.off || [0, 0], flash: !!L.flash, ms: frameMs(L), done: true, cycle: cycle };
  }
  // Markers whose frame starts in (t0, t1], across loops. Pass t0 = -1 at the start so frame zero markers fire.
  function markersBetween(anm, t0, t1) {
    var mk = anm && Array.isArray(anm.markers) ? anm.markers : [], out = [], D = duration(anm);
    if (!mk.length || !(D > 0) || !(t1 > t0)) return out;
    var times = mk.map(function (m) { return anm.kind === 'ability' ? Number(m.ms) || 0 : frameStart(anm, m.f | 0); });
    var c0 = anm.loop ? Math.max(0, Math.floor(Math.max(0, t0) / D)) : 0, c1 = anm.loop ? Math.floor(t1 / D) : 0;
    for (var c = c0; c <= c1; c++) {
      mk.forEach(function (m, i) {
        var at = c * D + times[i];
        if (at > t0 && at <= t1) out.push({ type: m.type, arg: m.arg == null ? null : m.arg, f: m.f, t: at });
      });
    }
    return out.sort(function (a, b) { return a.t - b.t; });
  }
  function firstMarker(anm, type) {
    var mk = anm && Array.isArray(anm.markers) ? anm.markers : [];
    for (var i = 0; i < mk.length; i++) if (mk[i] && mk[i].type === type) return anm.kind === 'ability' ? Number(mk[i].ms) || 0 : frameStart(anm, mk[i].f | 0);
    return null;
  }
  // The animation a sprite plays for a taxonomy key: the sprite's own map, then its shared base's, then the library
  // record whose subject is role anim:<key>.
  function animFor(art, spr, key) {
    var b = spr ? baseSprite(art, spr) : null, id = (spr && spr.anims && spr.anims[key]) || (b && b.anims && b.anims[key]);
    var r = id ? rec(art, id) : null;
    if (r) return r;
    var all = recs(art, 'anm_'), ks = Object.keys(all);
    for (var i = 0; i < ks.length; i++) { var a = all[ks[i]]; if (a && a.subject && a.subject.kind === 'role' && a.subject.ref === 'anim:' + key) return a; }
    return null;
  }

  // ---------------------------------------------------------------- small pixel helpers
  function rgbStr(hex) { return normHex(hex) || '#ffffff'; }
  function px(ctx, x, y, s) { ctx.fillRect(Math.round(x), Math.round(y), s || 1, s || 1); }
  function pxLine(ctx, x0, y0, x1, y1, s) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy, n = 0;
    while (n++ < 4000) {
      ctx.fillRect(x0, y0, s || 1, s || 1);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  function unitOf(size) { return Math.max(1, Math.round((Number(size) || 16) / 16)); }

  // ---------------------------------------------------------------- death (scatter, fade, melt)
  // deathPixels(frame, method, p, seed) -> [{x, y, i, a}]: the visible pixels at progress p (0 to 1), in frame
  // coordinates, with i the pixel's index in the frame and a its alpha. Pure, so the presenter and tests share it.
  function deathPixels(frame, method, p, seed) {
    var out = [], w = frame.w, h = frame.h, idx = frame.idx, r = rng(seed || 7), cx = w / 2, cy = h / 2;
    p = clamp(Number(p) || 0, 0, 1);
    var cols = [];
    for (var c = 0; c < w; c++) cols.push(0.45 + r() * 0.55);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var i = y * w + x;
      if (!idx[i]) continue;
      var hh = hash32(seed + ':' + i) / 4294967296;
      if (method === 'fade') { if (hh >= 1 - p) continue; out.push({ x: x, y: y, i: i, a: 1 }); continue; }
      if (method === 'melt') {
        var dy = p * h * 1.15 * cols[x], ny = y + dy;
        if (ny > h - 1) continue;
        out.push({ x: x, y: ny, i: i, a: 1 - p * 0.5 });
        continue;
      }
      // scatter: every pixel flies out from the center, faster the farther out it starts, and fades.
      var ax = x - cx + (hh - 0.5) * 2, ay = y - cy + (hash32(i + ':' + seed) / 4294967296 - 0.5) * 2, d = Math.sqrt(ax * ax + ay * ay) || 1;
      var k = p * p * (w * 0.9) * (0.6 + hh * 0.8);
      out.push({ x: x + ax / d * k, y: y + ay / d * k - p * h * 0.15, i: i, a: 1 - p });
    }
    return out;
  }
  function drawDeath(ctx, frame, method, p, x0, y0, seed) {
    var pts = deathPixels(frame, method, p, seed), rgba = frame.rgba, last = '', la = -1;
    for (var k = 0; k < pts.length; k++) {
      var q = pts[k], o = q.i * 4;
      if (!rgba || !rgba[o + 3]) continue;
      var st = 'rgb(' + rgba[o] + ',' + rgba[o + 1] + ',' + rgba[o + 2] + ')';
      if (st !== last) { ctx.fillStyle = st; last = st; }
      var a = clamp(q.a, 0, 1);
      if (a !== la) { ctx.globalAlpha = a; la = a; }
      ctx.fillRect(Math.round(x0 + q.x), Math.round(y0 + q.y), 1, 1);
    }
    ctx.globalAlpha = 1;
    return pts.length;
  }

  // ---------------------------------------------------------------- drawing sprites with animation
  function blitFrame(ctx, f, x, y) {
    if (!f) return;
    if (f.canvas) { ctx.drawImage(f.canvas, x, y); return; }
    // No host canvas (tests, workers): draw the pixels one by one.
    var last = '';
    for (var i = 0; i < f.w * f.h; i++) {
      var o = i * 4;
      if (!f.rgba[o + 3]) continue;
      var st = 'rgb(' + f.rgba[o] + ',' + f.rgba[o + 1] + ',' + f.rgba[o + 2] + ')';
      if (st !== last) { ctx.fillStyle = st; last = st; }
      ctx.fillRect(x + i % f.w, y + Math.floor(i / f.w), 1, 1);
    }
  }
  // draw.sprite(ctx, cache, sprId, anm, tMs, x, y, opts) draws the sprite's anchor (feet) at x, y.
  // anm is an anm_ record (or null for opts.pose held still). opts: {dir, pal, flash, alpha, pose, seed}.
  // Returns the frame info used, or null.
  function drawSprite(ctx, cache, sprId, anm, tMs, x, y, opts) {
    opts = opts || {};
    var dir = opts.dir || 'down', u = unitOf(cache.size), fi;
    if (anm && anm.kind === 'death') {
      var base = cache.sprite(sprId, opts.pose || 'idle', dir, opts.pal);
      if (!base) return null;
      var p = clamp((Number(tMs) || 0) / duration(anm), 0, 1);
      if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
      drawDeath(ctx, base, anm.method || 'scatter', p, Math.round(x - base.ax), Math.round(y - base.ay), opts.seed || 7);
      ctx.globalAlpha = 1;
      return { pose: opts.pose || 'idle', death: true, p: p, done: p >= 1 };
    }
    fi = anm ? frameAt(anm, tMs) : { pose: opts.pose || 'stand', off: [0, 0], flash: false, done: true };
    var f = cache.sprite(sprId, fi.pose, dir, opts.pal, fi.flash || opts.flash ? 'flash' : null);
    if (!f) return null;
    var fdx = (fi.off[0] || 0) * u * (dir === 'left' ? -1 : 1), fdy = (fi.off[1] || 0) * u;
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    blitFrame(ctx, f, Math.round(x - f.ax + fdx), Math.round(y - f.ay + fdy));
    if (opts.alpha != null) ctx.globalAlpha = 1;
    fi.w = f.w; fi.h = f.h; fi.ax = f.ax; fi.ay = f.ay;
    return fi;
  }

  // ---------------------------------------------------------------- particle systems
  // spec: {x, y, colors: [hex x 4 (dark, base, light, hot)], particle: {shape, count, life, gravity, spread, speed},
  //        mode: burst|rise|fall|stream, to: {x, y} (bolts aim here), unit, radius}
  // create(spec, seed) -> sys; step(sys, dtMs) -> live count; draw(ctx, sys).
  var SHAPES = ['spark', 'flake', 'bubble', 'shard', 'ring', 'wisp', 'bolt'];
  function spawn(sys, r) {
    var pt = sys.pt, u = sys.unit, shape = sys.shape, sp = (Number(pt.speed) || 1) * 46 * u, spread = clamp(Number(pt.spread) || 1, 0.1, 3);
    var a, v = sp * (0.45 + r() * 0.75), q = { age: 0, life: (Number(pt.life) || 420) * (0.6 + r() * 0.6), seed: (r() * 1e9) >>> 0, c: r() < 0.3 ? 3 : r() < 0.6 ? 2 : 1 };
    var R = (sys.radius || 6 * u);
    if (sys.mode === 'rise') { q.x = sys.x + (r() - 0.5) * R * 2 * spread; q.y = sys.y + r() * R * 0.5; a = -Math.PI / 2 + (r() - 0.5) * 0.6 * spread; }
    else if (sys.mode === 'fall') { q.x = sys.x + (r() - 0.5) * R * 2 * spread; q.y = sys.y - R * 3 - r() * R * 2; a = Math.PI / 2 + (r() - 0.5) * 0.4 * spread; v *= 1.6; }
    else { q.x = sys.x + (r() - 0.5) * u * 2; q.y = sys.y + (r() - 0.5) * u * 2; a = r() * Math.PI * 2; if (spread < 1) a = -Math.PI / 2 + (a - Math.PI) * spread; }
    q.vx = Math.cos(a) * v; q.vy = Math.sin(a) * v;
    if (shape === 'bubble') q.vy -= sp * 0.4;
    if (shape === 'ring') { q.vx *= 0.15; q.vy *= 0.15; q.r0 = 1 + r() * 2; }
    return q;
  }
  function fxCreate(spec, seed) {
    spec = spec || {};
    var pt = spec.particle || {}, r = rng(seed || 1), shape = SHAPES.indexOf(pt.shape) >= 0 ? pt.shape : 'spark';
    var cols = (spec.colors || []).map(rgbStr);
    while (cols.length < 4) cols.push(cols[cols.length - 1] || '#ffffff');
    var sys = { x: Number(spec.x) || 0, y: Number(spec.y) || 0, to: spec.to || null, unit: Math.max(1, Math.round(spec.unit || 1)), shape: shape, pt: pt, colors: cols,
      mode: spec.mode || 'burst', radius: spec.radius || 0, gravity: Number(pt.gravity) || 0, parts: [], t: 0, rnd: r, seed: seed || 1 };
    var n = clamp(Math.round(Number(pt.count) || 12), 1, 120);
    if (shape === 'ring') n = Math.max(1, Math.min(4, Math.round(n / 5)));
    if (shape === 'bolt') n = Math.max(1, Math.min(3, Math.round(n / 6)));
    for (var i = 0; i < n; i++) sys.parts.push(spawn(sys, r));
    return sys;
  }
  function fxStep(sys, dt) {
    dt = Math.max(0, Math.min(100, Number(dt) || 0));
    sys.t += dt;
    var s = dt / 1000, g = sys.gravity * 220 * sys.unit, live = 0;
    sys.parts.forEach(function (q) {
      if (q.age >= q.life) return;
      q.age += dt;
      if (sys.shape === 'wisp') q.vx += Math.sin((q.age + q.seed) / 90) * 20 * s * sys.unit;
      q.vy += g * s;
      var drag = sys.shape === 'flake' || sys.shape === 'wisp' ? 0.985 : 0.995;
      q.vx *= drag; q.vy *= drag;
      q.x += q.vx * s; q.y += q.vy * s;
      if (q.age < q.life) live++;
    });
    return live;
  }
  function fxDone(sys) { return sys.parts.every(function (q) { return q.age >= q.life; }); }
  function fxDraw(ctx, sys) {
    var u = sys.unit;
    sys.parts.forEach(function (q) {
      if (q.age >= q.life) return;
      var k = q.age / q.life, ci = k < 0.25 ? 3 : k < 0.6 ? q.c : k < 0.85 ? 1 : 0;
      ctx.fillStyle = sys.colors[ci];
      ctx.globalAlpha = k > 0.75 ? clamp((1 - k) * 4, 0, 1) : 1;
      var x = q.x, y = q.y;
      switch (sys.shape) {
        case 'flake': px(ctx, x, y, u); px(ctx, x - u, y, u); px(ctx, x + u, y, u); px(ctx, x, y - u, u); px(ctx, x, y + u, u); break;
        case 'bubble': [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]].forEach(function (d) { if (d[0] && d[1]) return; px(ctx, x + d[0] * u, y + d[1] * u, u); }); ctx.fillStyle = sys.colors[3]; px(ctx, x - u, y - u, u); break;
        case 'shard': var m = Math.sqrt(q.vx * q.vx + q.vy * q.vy) || 1; px(ctx, x, y, u); px(ctx, x - q.vx / m * u * 1.5, y - q.vy / m * u * 1.5, u); px(ctx, x - q.vx / m * u * 3, y - q.vy / m * u * 3, u); break;
        case 'ring': var rr = (q.r0 + k * 9) * u, n = Math.max(8, Math.round(rr * 1.6)); for (var j = 0; j < n; j++) px(ctx, x + Math.cos(j / n * 6.283) * rr, y + Math.sin(j / n * 6.283) * rr * 0.75, u); break;
        case 'wisp': px(ctx, x, y, u * 2); ctx.globalAlpha *= 0.5; px(ctx, x - q.vx * 0.04, y - q.vy * 0.04, u * 2); break;
        case 'bolt':
          var tx = sys.to ? sys.to.x : sys.x + (q.vx > 0 ? 1 : -1) * 20 * u, ty = sys.to ? sys.to.y : sys.y - 30 * u, br = rng(q.seed + Math.floor(q.age / 60)), segs = 6, px0 = sys.x, py0 = sys.y;
          for (var g2 = 1; g2 <= segs; g2++) { var f2 = g2 / segs, nx = sys.x + (tx - sys.x) * f2 + (g2 < segs ? (br() - 0.5) * 8 * u : 0), ny = sys.y + (ty - sys.y) * f2 + (g2 < segs ? (br() - 0.5) * 4 * u : 0); pxLine(ctx, px0, py0, nx, ny, u); px0 = nx; py0 = ny; }
          break;
        default: px(ctx, x, y, u); ctx.globalAlpha *= 0.6; px(ctx, x - q.vx * 0.03, y - q.vy * 0.03, u);
      }
    });
    ctx.globalAlpha = 1;
  }
  // Screen behavior of an effect at progress p (0 to 1): shake offsets, a darkening alpha, and a wave amplitude.
  function screenAt(kind, p, unit, seed) {
    var e = Math.max(0, 1 - p), u = unit || 1, r = rng(((seed || 1) + Math.floor(p * 40)) >>> 0);
    return {
      shake: kind === 'shake' ? [Math.round((r() - 0.5) * 4 * u * e), Math.round((r() - 0.5) * 3 * u * e)] : [0, 0],
      darken: kind === 'darken' ? 0.45 * Math.sin(Math.min(1, p) * Math.PI) : 0,
      wave: kind === 'wave' ? Math.round(2 * u * e) : 0
    };
  }
  // Applies a wave to rows already drawn on ctx (drawImage of the canvas onto itself, one row strip at a time).
  function applyWave(ctx, amp, tMs, w, h) {
    if (!amp || !ctx.canvas) return;
    for (var y = 0; y < h; y += 2) { var dx = Math.round(Math.sin(y / 6 + tMs / 70) * amp); if (dx) ctx.drawImage(ctx.canvas, 0, y, w, 2, dx, y, w, 2); }
  }

  // ---------------------------------------------------------------- weather overlays
  // wov: {layers: [{type, density, angle, speed, depth, m}], tint: {m, alpha}, lightning: {every: [min, max], flashMs, m}}
  // create(wov, w, h, seed, {entries, unit}) -> state; step(state, dtMs); draw(ctx, state).
  // Particle counts scale with the logical area (a 256 by 224 screen is the reference), never with screen pixels.
  var WEATHER_TYPES = ['streak', 'flake', 'mote', 'band', 'bolt', 'leaf', 'none'];
  var WEATHER_BASE = { streak: 140, flake: 90, mote: 70, leaf: 16, band: 5, bolt: 0, none: 0 };
  function wParticle(L, st, r, fresh) {
    var q = { x: r() * st.w, y: fresh ? r() * st.h : -r() * 20, z: 0.45 + r() * 0.55 * (L.depth == null ? 1 : clamp(L.depth, 0, 1)) + 0.0001, ph: r() * 6.283 };
    if (L.type === 'band') { q.y = r() * st.h; q.hh = Math.round((0.05 + r() * 0.1) * st.h); q.z = 0.3 + r() * 0.7; }
    return q;
  }
  function weatherCreate(wov, w, h, seed, opts) {
    opts = opts || {};
    var r = rng(seed || 3), ent = opts.entries || [], u = Math.max(1, Math.round(opts.unit || 1)), area = (w * h) / (256 * 224);
    var st = { w: w, h: h, t: 0, unit: u, rnd: r, layers: [], tint: null, lightning: null, flash: 0, bolt: null, nextBolt: 0, strikes: 0 };
    function col(m, fb) { return typeof m === 'number' && ent[m] ? ent[m] : fb; }
    ((wov && wov.layers) || []).forEach(function (L) {
      if (!L || WEATHER_TYPES.indexOf(L.type) < 0 || L.type === 'none' || L.type === 'bolt') return;
      var dens = clamp(L.density == null ? 0.5 : Number(L.density) || 0, 0, 1), n = Math.min(900, Math.round(dens * WEATHER_BASE[L.type] * area));
      var lay = { type: L.type, angle: Number(L.angle) || 0, speed: L.speed == null ? 1 : clamp(Number(L.speed), 0, 4), color: col(L.m, L.type === 'flake' ? '#f4f6fa' : L.type === 'leaf' ? '#8a9a3a' : '#c8d8f0'),
        alpha: L.type === 'band' ? clamp(0.12 + 0.3 * dens, 0, 0.6) : 1, parts: [] };
      for (var i = 0; i < n; i++) lay.parts.push(wParticle(L, st, r, true));
      st.layers.push(lay);
    });
    if (wov && wov.tint && typeof wov.tint.m === 'number' && ent[wov.tint.m]) st.tint = { color: ent[wov.tint.m], alpha: clamp(Number(wov.tint.alpha) || 0, 0, 0.8) };
    var hasBoltLayer = ((wov && wov.layers) || []).some(function (L) { return L && L.type === 'bolt'; });
    if (wov && (wov.lightning || hasBoltLayer)) {
      var lg = wov.lightning || {}, ev = Array.isArray(lg.every) && lg.every.length === 2 ? lg.every : [2500, 7000];
      st.lightning = { min: Math.max(200, Number(ev[0]) || 2500), max: Math.max(Number(ev[0]) || 2500, Number(ev[1]) || 7000), flashMs: clamp(Number(lg.flashMs) || 160, 40, 1200), color: col(lg.m, '#ffffff') };
      st.nextBolt = st.lightning.min + r() * (st.lightning.max - st.lightning.min);
    }
    return st;
  }
  function weatherStep(st, dt) {
    dt = Math.max(0, Math.min(100, Number(dt) || 0));
    st.t += dt;
    var s = dt / 1000, u = st.unit, r = st.rnd;
    st.layers.forEach(function (L) {
      var a = L.angle * Math.PI / 180;
      L.parts.forEach(function (q) {
        var v;
        if (L.type === 'streak') { v = 260 * L.speed * q.z * u; q.x += Math.sin(a) * v * s; q.y += Math.cos(a) * v * s; }
        else if (L.type === 'flake') { v = 26 * L.speed * q.z * u; q.y += v * s; q.x += (Math.sin(a) * v + Math.sin(st.t / 700 + q.ph) * 8 * u) * s; }
        else if (L.type === 'mote') { v = 18 * L.speed * q.z * u; q.x += Math.sin(a) * v * s + Math.sin(st.t / 900 + q.ph) * 3 * u * s; q.y += Math.cos(a) * v * s * 0.6; }
        else if (L.type === 'leaf') { v = 48 * L.speed * q.z * u; q.x += (Math.sin(a) * v + 14 * u) * s; q.y += (12 * u + Math.sin(st.t / 300 + q.ph) * 20 * u) * s; }
        else if (L.type === 'band') { q.x += 6 * L.speed * q.z * u * s; }
        if (L.type === 'band') { if (q.x > st.w) q.x -= st.w * 2; return; }
        if (q.y > st.h + 4) { q.y -= st.h + 8; q.x = r() * st.w; }
        if (q.y < -10) q.y += st.h + 8;
        if (q.x > st.w + 4) q.x -= st.w + 8; else if (q.x < -4) q.x += st.w + 8;
      });
    });
    if (st.lightning) {
      st.flash = Math.max(0, st.flash - dt / st.lightning.flashMs);
      if (st.t >= st.nextBolt) {
        st.flash = 1; st.strikes++;
        var x0 = r() * st.w, pts = [[x0, 0]], y = 0;
        while (y < st.h * 0.62) { y += (6 + r() * 10) * u; pts.push([pts[pts.length - 1][0] + (r() - 0.5) * 14 * u, y]); }
        st.bolt = pts;
        st.nextBolt = st.t + st.lightning.min + r() * (st.lightning.max - st.lightning.min);
      }
    }
    return st;
  }
  function weatherDraw(ctx, st) {
    var u = st.unit;
    st.layers.forEach(function (L) {
      ctx.fillStyle = L.color;
      if (L.type === 'band') {
        L.parts.forEach(function (q) { ctx.globalAlpha = L.alpha * q.z; ctx.fillRect(Math.round(q.x), Math.round(q.y), st.w, q.hh); ctx.fillRect(Math.round(q.x - st.w), Math.round(q.y), st.w, q.hh); });
        ctx.globalAlpha = 1;
        return;
      }
      var a = L.angle * Math.PI / 180;
      L.parts.forEach(function (q) {
        ctx.globalAlpha = 0.45 + 0.55 * q.z;
        if (L.type === 'streak') { var len = Math.max(2, Math.round((2 + q.z * 5) * u * Math.max(0.5, L.speed))); pxLine(ctx, q.x, q.y, q.x - Math.sin(a) * len, q.y - Math.cos(a) * len, 1); }
        else if (L.type === 'flake') { var sz = q.z > 0.8 ? 2 * u : u; ctx.fillRect(Math.round(q.x), Math.round(q.y), sz, sz); }
        else if (L.type === 'mote') { ctx.globalAlpha *= 0.6 + 0.4 * Math.sin(st.t / 300 + q.ph); ctx.fillRect(Math.round(q.x), Math.round(q.y), u, u); }
        else if (L.type === 'leaf') { var flip = Math.sin(st.t / 160 + q.ph) > 0; ctx.fillRect(Math.round(q.x), Math.round(q.y), flip ? 2 * u : u, flip ? u : 2 * u); }
      });
      ctx.globalAlpha = 1;
    });
    if (st.tint && st.tint.alpha > 0) { ctx.globalAlpha = st.tint.alpha; ctx.fillStyle = st.tint.color; ctx.fillRect(0, 0, st.w, st.h); ctx.globalAlpha = 1; }
    if (st.lightning && st.flash > 0) {
      if (st.bolt && st.flash > 0.35) { ctx.fillStyle = st.lightning.color; for (var i = 1; i < st.bolt.length; i++) pxLine(ctx, st.bolt[i - 1][0], st.bolt[i - 1][1], st.bolt[i][0], st.bolt[i][1], u); }
      ctx.globalAlpha = 0.55 * st.flash; ctx.fillStyle = st.lightning.color; ctx.fillRect(0, 0, st.w, st.h); ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- ability playback
  // timeline(anm, casterAnm) -> {release, travelEnd, impactStart, impactEnd, duration, hits: [ms]}. The caster's own
  // animation fires its first hit marker at the release; projectiles travel after it; hits land through the impact.
  function abilityTimeline(anm, casterAnm) {
    anm = anm || {};
    var cd = casterAnm ? duration(casterAnm) : 480, rel = casterAnm ? firstMarker(casterAnm, 'hit') : null;
    var release = rel == null ? Math.round(cd * 0.6) : rel;
    var tr = anm.travel || {}, travel = tr.type && tr.type !== 'none' ? clamp(Number(tr.ms) || 260, 0, 4000) : 0;
    var imp = anm.impact || {}, ims = clamp(Number(imp.ms) || 450, 60, 4000);
    var n = clamp(Math.round(Number(anm.hits) || 1), 1, 16), gap = Math.min(160, ims / (n + 1));
    var hits = [];
    for (var i = 0; i < n; i++) hits.push(Math.round(release + travel + i * gap));
    var end = release + travel + ims;
    return { release: release, travelEnd: release + travel, impactStart: release + travel, impactEnd: end, duration: Math.max(end, cd), casterMs: cd, hits: hits, melee: anm.caster === 'attack' && !travel };
  }
  // create(cfg) -> playback. cfg: {anm, caster (anm_ record), from: {x, y}, to: {x, y}, efx (record), entries, unit, seed}.
  // step(dtMs) returns the markers that fired; draw(ctx) draws travel and impact effects; screen() reports shake,
  // flash, darkening, and wave; casterAt() gives the time into the caster's animation and its forward offset.
  function abilityCreate(cfg) {
    var anm = cfg.anm || {}, tl = abilityTimeline(anm, cfg.caster), u = Math.max(1, Math.round(cfg.unit || 1)), ent = cfg.entries || [], fx = cfg.efx || null;
    var cols = fx && Array.isArray(fx.palette) ? fx.palette.map(function (m) { return ent[m] || '#ffffff'; }) : ['#6a6a6a', '#b8b8b8', '#e8e8e8', '#ffffff'];
    var flashCol = fx && ent[fx.flash] ? ent[fx.flash] : '#ffffff', from = cfg.from || { x: 0, y: 0 }, to = cfg.to || { x: 0, y: 0 };
    var pt = Object.assign({ shape: 'spark', count: 12, life: 420, gravity: 0, spread: 1, speed: 1 }, fx && fx.particle || {});
    var imp = anm.impact || {}, tr = anm.travel || {}, seed = cfg.seed || 11;
    var screenKind = imp.shake ? 'shake' : fx && fx.screen || 'none';
    var pb = { t: 0, timeline: tl, systems: [], fired: [], next: 0 };
    var extra = (Array.isArray(anm.markers) ? anm.markers : []).map(function (m) { return { ms: Number(m.ms) || 0, type: m.type, arg: m.arg == null ? null : m.arg }; });
    var sched = [{ ms: 0, type: 'sfx', arg: anm.sfx || 'cast' }, { ms: tl.release, type: 'sfx', arg: anm.sfx || 'release' }]
      .concat(tl.hits.map(function (h, i) { return { ms: h, type: 'hit', arg: i }; }), [{ ms: tl.impactStart, type: 'particle', arg: fx ? fx.id || null : null }])
      .concat(imp.flash ? [{ ms: tl.impactStart, type: 'flash', arg: null }] : [], imp.shake ? [{ ms: tl.impactStart, type: 'shake', arg: imp.shake }] : [], extra)
      .sort(function (a, b) { return a.ms - b.ms; });
    pb.step = function (dt) {
      var t0 = pb.t, t1 = pb.t + Math.max(0, Number(dt) || 0), out = [];
      while (pb.next < sched.length && sched[pb.next].ms <= t1) { var m = sched[pb.next++]; out.push({ type: m.type, arg: m.arg, t: m.ms }); }
      if (t0 < tl.release && t1 >= tl.release && tr.type && tr.type !== 'none') {
        var mode = tr.type === 'rise' ? 'rise' : tr.type === 'fall' ? 'fall' : 'stream';
        if (tr.type === 'rise' || tr.type === 'fall') pb.systems.push(fxCreate({ x: to.x, y: to.y, colors: cols, particle: Object.assign({}, pt, { count: Math.round(pt.count * 1.4), life: tl.travelEnd - tl.release + 200 }), mode: mode, unit: u, radius: 8 * u }, seed + 1));
      }
      if (t0 < tl.impactStart && t1 >= tl.impactStart) pb.systems.push(fxCreate({ x: to.x, y: to.y, to: { x: to.x + 6 * u, y: to.y - 30 * u }, colors: cols, particle: pt, mode: 'burst', unit: u }, seed + 2));
      pb.t = t1;
      pb.systems.forEach(function (s) { fxStep(s, Math.min(100, t1 - t0)); });
      pb.fired = pb.fired.concat(out);
      return out;
    };
    pb.done = function () { return pb.t >= tl.duration && pb.systems.every(fxDone); };
    pb.casterAt = function () {
      var off = 0;
      if (tl.melee) {
        var D = Math.max(0, Math.abs(to.x - from.x) - 18 * u), go = tl.release * 0.45, back = tl.impactEnd;
        off = pb.t < go ? D * (pb.t / Math.max(1, go)) : pb.t < back ? D : Math.max(0, D * (1 - (pb.t - back) / 220));
      }
      return { t: Math.min(pb.t, tl.casterMs), off: [Math.round(off), 0] };
    };
    pb.screen = function () {
      var p = clamp((pb.t - tl.impactStart) / Math.max(1, tl.impactEnd - tl.impactStart), 0, 1), on = pb.t >= tl.impactStart && pb.t <= tl.impactEnd;
      var sc = on ? screenAt(screenKind, p, u * (imp.shake || 1), seed) : { shake: [0, 0], darken: 0, wave: 0 };
      var fl = imp.flash && pb.t >= tl.impactStart && pb.t < tl.impactStart + 140 ? 1 - (pb.t - tl.impactStart) / 140 : 0;
      return { shake: sc.shake, darken: sc.darken, wave: sc.wave, flash: fl * 0.7, flashColor: flashCol };
    };
    pb.draw = function (ctx) {
      if (tr.type === 'projectile' && pb.t >= tl.release && pb.t < tl.travelEnd) {
        var k = (pb.t - tl.release) / Math.max(1, tl.travelEnd - tl.release), x = from.x + (to.x - from.x) * k, y = from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 6 * u;
        ctx.fillStyle = cols[2]; ctx.fillRect(Math.round(x - u), Math.round(y - u), 3 * u, 3 * u);
        ctx.fillStyle = cols[3]; ctx.fillRect(Math.round(x), Math.round(y), u, u);
        ctx.fillStyle = cols[1]; ctx.globalAlpha = 0.6; ctx.fillRect(Math.round(x - (to.x - from.x) * 0.06), Math.round(y), 2 * u, u); ctx.globalAlpha = 1;
      }
      if (tr.type === 'beam' && pb.t >= tl.release && pb.t < tl.impactEnd) {
        var kb = clamp((pb.t - tl.release) / Math.max(1, tl.travelEnd - tl.release), 0, 1), bx = from.x + (to.x - from.x) * kb, by = from.y + (to.y - from.y) * kb;
        ctx.fillStyle = cols[1]; pxLine(ctx, from.x, from.y, bx, by, 3 * u);
        ctx.fillStyle = cols[3]; pxLine(ctx, from.x, from.y, bx, by, u);
      }
      pb.systems.forEach(function (s) { fxDraw(ctx, s); });
    };
    return pb;
  }

  R.anim = {
    MARKER_TYPES: MARKER_TYPES, DEATH_METHODS: DEATH_METHODS, CASTERS: CASTERS, TRAVELS: TRAVELS,
    duration: duration, frameAt: frameAt, frameStart: frameStart, markersBetween: markersBetween, firstMarker: firstMarker,
    forSprite: animFor, deathPixels: deathPixels, drawDeath: drawDeath, unit: unitOf
  };
  R.draw = { sprite: drawSprite, frame: blitFrame, line: pxLine };
  R.fx = { SHAPES: SHAPES, SCREENS: ['none', 'wave', 'shake', 'darken'], create: fxCreate, step: fxStep, draw: fxDraw, done: fxDone, screen: screenAt, wave: applyWave };
  R.weather = { TYPES: WEATHER_TYPES, BASE: WEATHER_BASE, create: weatherCreate, step: weatherStep, draw: weatherDraw };
  R.ability = { timeline: abilityTimeline, create: abilityCreate };
