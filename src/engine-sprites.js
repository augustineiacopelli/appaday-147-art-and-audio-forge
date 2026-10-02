  // ================================================================ PHASE 2: COMPOSER
  // build.js splices this file into ENGINE:RENDER above the freeze line. It reads no host global either.

  // ---------------------------------------------------------------- codec
  // Pixel strings use 0 to 9 then A to V (indices 0 to 31). Rows are concatenated and the width lives on the containing
  // object. A period followed by one alphabet character n is a run of n + 1 transparent pixels; longer runs chain.
  var ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUV', AIDX = {};
  for (var ai = 0; ai < 32; ai++) AIDX[ALPHA[ai]] = ai;
  function decodePx(str, w, h) {
    var n = w * h, out = new Uint8Array(n), p = 0, s = String(str == null ? '' : str);
    if (!(w > 0 && h > 0)) throw new Error('Width and height must be positive.');
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '.') {
        var c = AIDX[s[i + 1]];
        if (c === undefined) throw new Error('The run marker at character ' + i + ' has no count.');
        p += c + 1; i++;
        continue;
      }
      var v = AIDX[ch];
      if (v === undefined) throw new Error('Character ' + JSON.stringify(ch) + ' at ' + i + ' is not in the pixel alphabet.');
      if (p < n) out[p] = v;
      p++;
    }
    if (p !== n) throw new Error('The pixels expand to ' + p + ', but ' + w + ' by ' + h + ' needs ' + n + '.');
    return out;
  }
  function encodePx(arr) {
    var s = '', i = 0, n = arr.length;
    while (i < n) {
      var v = arr[i] | 0;
      if (v === 0) {
        var j = i;
        while (j < n && (arr[j] | 0) === 0) j++;
        var run = j - i;
        while (run > 0) {
          if (run === 1) { s += '0'; run = 0; } else { var k = Math.min(run, 32); s += '.' + ALPHA[k - 1]; run -= k; }
        }
        i = j;
      } else { s += ALPHA[clamp(v, 0, 31)]; i++; }
    }
    return s;
  }
  function validatePx(str, w, h, maxIndex) {
    var a;
    try { a = decodePx(str, w, h); } catch (e) { return { ok: false, error: e.message }; }
    var mx = maxIndex == null ? 31 : maxIndex;
    for (var i = 0; i < a.length; i++) if (a[i] > mx) return { ok: false, error: 'Pixel ' + i + ' uses index ' + a[i] + ', above the limit of ' + mx + '.' };
    return { ok: true, pixels: a.length };
  }
  R.codec = { ALPHABET: ALPHA, decode: decodePx, encode: encodePx, validate: validatePx };

  // ---------------------------------------------------------------- raster
  // A composing raster holds a cell code and a layer id per pixel. Cell code: low four bits are the material (1 outline,
  // 2 to 6 the five ramps in slot order, 7 the accent alias, 8 ground shadow), high four bits are a fixed ramp step plus
  // one (0 means the shading pass decides). Drawing takes unit coordinates; s scales units to pixels, so generators
  // rasterize natively at any tile size instead of resampling.
  var M_OUT = 1, M_A = 2, M_B = 3, M_C = 4, M_D = 5, M_E = 6, M_ACC = 7, M_GROUND = 8;
  function fx(m, step) { return m | ((step + 1) << 4); }
  function Ras(w, h, s) {
    this.w = w; this.h = h; this.s = s;
    this.c = new Uint8Array(w * h); this.l = new Uint8Array(w * h);
    this.layer = 1; this.clip = null;
  }
  // The outermost ring of pixels stays clear so the outline pass always has room, at any size.
  Ras.prototype.ok = function (px, py) {
    if (px < 1 || py < 1 || px >= this.w - 1 || py >= this.h - 1) return false;
    var k = this.clip;
    if (!k) return true;
    var ux = (px + 0.5) / this.s, uy = (py + 0.5) / this.s;
    return !(ux < k[0] || ux > k[2] || uy < k[1] || uy > k[3]);
  };
  Ras.prototype.put = function (px, py, code) { px |= 0; py |= 0; if (this.ok(px, py)) { var i = py * this.w + px; this.c[i] = code; this.l[i] = this.layer; } };
  // A unit point as one pixel (used for eyes and studs, which must exist even at tiny sizes).
  // Grows with scale so eyes read at large tile sizes too.
  Ras.prototype.dot = function (x, y, code, tall) {
    var n = Math.max(1, Math.floor(this.s * 0.8)), m = tall ? Math.max(1, Math.round(this.s * 1.4)) : n, px = Math.floor(x * this.s), py = Math.floor(y * this.s);
    for (var j = 0; j < m; j++) for (var i = 0; i < n; i++) this.put(px + i, py + j, code);
  };
  Ras.prototype.rect = function (x0, y0, x1, y1, code) {
    var s = this.s, a = Math.round(Math.min(x0, x1) * s), b = Math.round(Math.min(y0, y1) * s);
    var c = Math.round(Math.max(x0, x1) * s), d = Math.round(Math.max(y0, y1) * s);
    if (c <= a) c = a + 1;
    if (d <= b) d = b + 1;
    for (var y = b; y < d; y++) for (var x = a; x < c; x++) this.put(x, y, code);
  };
  Ras.prototype.ell = function (cx, cy, rx, ry, code) {
    var s = this.s, X = cx * s, Y = cy * s, RX = Math.max(0.5, rx * s), RY = Math.max(0.5, ry * s), any = false;
    for (var y = Math.floor(Y - RY); y <= Math.ceil(Y + RY); y++) {
      for (var x = Math.floor(X - RX); x <= Math.ceil(X + RX); x++) {
        var dx = (x + 0.5 - X) / RX, dy = (y + 0.5 - Y) / RY;
        if (dx * dx + dy * dy <= 1.0001) { this.put(x, y, code); any = true; }
      }
    }
    if (!any) this.put(Math.floor(X), Math.floor(Y), code);
  };
  Ras.prototype.poly = function (pts, code) {
    var s = this.s, P = pts.map(function (p) { return [p[0] * s, p[1] * s]; }), y0 = Infinity, y1 = -Infinity, any = false;
    P.forEach(function (p) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    for (var y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      var cy = y + 0.5, xs = [];
      for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
        var a = P[i], b = P[j];
        if ((a[1] > cy) !== (b[1] > cy)) xs.push(a[0] + (cy - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort(function (p, q) { return p - q; });
      for (var k = 0; k + 1 < xs.length; k += 2) {
        for (var x = Math.ceil(xs[k] - 0.5); x < xs[k + 1] - 0.5; x++) { this.put(x, y, code); any = true; }
      }
    }
    if (!any && P.length) { var m = P.reduce(function (o, p) { return [o[0] + p[0] / P.length, o[1] + p[1] / P.length]; }, [0, 0]); this.put(Math.floor(m[0]), Math.floor(m[1]), code); }
  };
  // A capsule: every pixel whose center lies within t / 2 units of the segment.
  Ras.prototype.line = function (x0, y0, x1, y1, t, code) {
    var s = this.s, ax = x0 * s, ay = y0 * s, bx = x1 * s, by = y1 * s, rr = Math.max(0.5, (t || 1) * s / 2);
    var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, any = false;
    for (var y = Math.floor(Math.min(ay, by) - rr); y <= Math.ceil(Math.max(ay, by) + rr); y++) {
      for (var x = Math.floor(Math.min(ax, bx) - rr); x <= Math.ceil(Math.max(ax, bx) + rr); x++) {
        var px = x + 0.5, py = y + 0.5, u = L2 ? clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1) : 0;
        var qx = ax + u * dx - px, qy = ay + u * dy - py;
        if (qx * qx + qy * qy <= rr * rr + 0.0001) { this.put(x, y, code); any = true; }
      }
    }
    if (!any) this.put(Math.floor(ax), Math.floor(ay), code);
  };
  Ras.prototype.next = function () { this.layer++; this.clip = null; return this; };

  // Shading: a pixel whose top and left neighbors leave its region is lit, one whose bottom and right neighbors leave it
  // is shaded, otherwise it takes the middle step. A region is one material within one layer. The light and shade bands
  // widen with scale (one pixel per 1.5 units of scale) so large tile sizes keep readable form.
  function shadeAndOutline(r, outline) {
    var w = r.w, h = r.h, c = r.c, l = r.l, step = new Int8Array(w * h), band = Math.max(1, Math.round(r.s / 1.5));
    // 0 inside the region, 1 open edge (empty or an earlier layer), 2 an edge under a later layer, which casts shade.
    function off(i, x, y, dx, dy) {
      for (var k = 1; k <= band; k++) {
        var X = x + dx * k, Y = y + dy * k;
        if (same(i, X, Y)) continue;
        if (X < 0 || Y < 0 || X >= w || Y >= h) return 1;
        var j = Y * w + X, mj = c[j] & 15;
        return mj && mj !== M_GROUND && l[j] > l[i] ? 2 : 1;
      }
      return 0;
    }
    function same(i, x, y) {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      var j = y * w + x, m = c[j] & 15;
      return m && m !== M_GROUND && l[j] === l[i] && (m === (c[i] & 15));
    }
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var i = y * w + x, m = c[i] & 15, f = c[i] >> 4;
      if (!m || m === M_OUT || m === M_GROUND) { step[i] = -1; continue; }
      if (f) { step[i] = f - 1; continue; }
      var t = off(i, x, y, 0, -1), lf = off(i, x, y, -1, 0);
      var hl = (t === 1 ? 1 : 0) + (lf === 1 ? 1 : 0), sh = (off(i, x, y, 0, 1) ? 1 : 0) + (off(i, x, y, 1, 0) ? 1 : 0) + (t === 2 ? 1 : 0);
      var n = m === M_E ? 2 : 3;
      step[i] = n === 3 ? (hl > sh ? 2 : sh > hl ? 0 : 1) : (hl > sh ? 1 : 0);
    }
    var edge = new Uint8Array(w * h);
    if (outline !== false) {
      for (var y2 = 0; y2 < h; y2++) for (var x2 = 0; x2 < w; x2++) {
        var k = y2 * w + x2, mk = c[k] & 15;
        if (mk && mk !== M_GROUND) continue;
        var hit = false;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var X = x2 + d[0], Y = y2 + d[1];
          if (X < 0 || Y < 0 || X >= w || Y >= h) return;
          var mm = c[Y * w + X] & 15;
          if (mm && mm !== M_GROUND) hit = true;
        });
        if (hit) edge[k] = 1;
      }
    }
    return { step: step, edge: edge };
  }
  // Slot resolution. Every 16 slot layout (humanoid, enemy, icon) keeps ramps at 2-4, 5-7, 8-10, 11-13, and 14-15.
  var RAMP_SLOTS = [[2, 3, 4], [5, 6, 7], [8, 9, 10], [11, 12, 13], [14, 15]];
  function resolve(r, sh, accent) {
    var w = r.w, out = new Uint8Array(w * r.h);
    for (var i = 0; i < out.length; i++) {
      var m = r.c[i] & 15;
      if (sh.edge[i]) { out[i] = 1; continue; }
      if (!m) continue;
      if (m === M_OUT) { out[i] = 1; continue; }
      if (m === M_GROUND) { var x = i % w, y = (i - x) / w; out[i] = (x + y) & 1 ? 1 : 0; continue; }
      var k = m === M_ACC ? (accent === 'metal' ? 4 : accent === 'clothA' ? 2 : 3) : m - 2;
      var ramp = RAMP_SLOTS[k], st = clamp(sh.step[i], 0, ramp.length - 1);
      out[i] = ramp[st];
    }
    return out;
  }
  // A hand drawn local slot back into a fixed cell, so px parts layer exactly like generated ones.
  function slotCell(s) {
    if (!s) return 0;
    if (s === 1) return M_OUT;
    if (s >= 14) return fx(M_E, s - 14);
    return fx(2 + Math.floor((s - 2) / 3), (s - 2) % 3);
  }
  function mirror(idx, w, h) {
    var out = new Uint8Array(idx.length);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) out[y * w + x] = idx[y * w + (w - 1 - x)];
    return out;
  }
  // Pixels drawn for a one tile frame placed in a wider battle frame: same height, centered, nothing stretched.
  function fit(idx, w, h, W, H) {
    if (w === W && h === H) return idx;
    if (h !== H || w > W) return resample(idx, w, h, W, H);
    var out = new Uint8Array(W * H), ox = (W - w) >> 1;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) out[y * W + x + ox] = idx[y * w + x];
    return out;
  }
  function resample(idx, w, h, W, H) {
    var out = new Uint8Array(W * H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) out[y * W + x] = idx[Math.min(h - 1, Math.floor(y * h / H)) * w + Math.min(w - 1, Math.floor(x * w / W))];
    return out;
  }

  // ---------------------------------------------------------------- humanoid rig
  var BODY_PLANS = {
    slight: { sh: 3, hip: 2.3, leg: 6.4, torso: 6, head: 3.9, arm: 1.5, legW: 1.6 },
    average: { sh: 3.5, hip: 2.6, leg: 6, torso: 6, head: 4, arm: 1.8, legW: 1.9 },
    broad: { sh: 4.4, hip: 3.2, leg: 5.6, torso: 6.4, head: 4.1, arm: 2.3, legW: 2.3 },
    small: { sh: 2.8, hip: 2.2, leg: 3.8, torso: 4.4, head: 4.3, arm: 1.5, legW: 1.6 },
    tall: { sh: 3.6, hip: 2.6, leg: 7.4, torso: 6.8, head: 3.8, arm: 1.8, legW: 1.9 }
  };
  // Pose parameters. legs and arms are -1 to 1 per side (index 0 far or viewer left, 1 near or viewer right).
  //   bob, crouch: units the hips drop. ready: battle stance (near arm forward). lean: upper body forward in side view.
  //   hdx, hdy: head offset in side view (hdy also in front and back views); fx: head offset in front and back views.
  //   reach: per arm [x, y] as a fraction of arm length from the shoulder (x forward in side view, outward otherwise).
  //   wpn: weapon angle in degrees in side view (0 forward, -90 up, 90 down). kneel, sit: bent legs with knees.
  //   lie: the figure lies on its back (the frame is rotated, so it is wider than tall).
  // Phase 3 completes the field, emote, and battle sets; generators read only these fields.
  var POSES = {
    stand: { legs: [0, 0], arms: [0, 0], bob: 0 },
    stepA: { legs: [1, -1], arms: [-1, 1], bob: 0.4 },
    stepB: { legs: [-1, 1], arms: [1, -1], bob: 0.4 },
    idle: { legs: [-0.6, 0.7], arms: [0.2, 0.8], bob: 0, crouch: 0.6, ready: true },
    ready: { legs: [-0.7, 0.8], arms: [0.2, 0.8], crouch: 0.9, ready: true, lean: 0.25 },
    step: { legs: [0.9, -0.9], arms: [-0.6, 0.6], bob: 0.3, ready: true, lean: 0.45 },
    windup: { legs: [-0.5, 0.9], arms: [0.3, 0], crouch: 0.4, lean: -0.2, reach: [null, [-0.3, -0.85]], wpn: -125 },
    attack: { legs: [1, -0.9], arms: [-0.4, 0], crouch: 0.7, lean: 0.7, reach: [null, [0.9, -0.05]], wpn: 12 },
    cast: { legs: [-0.3, 0.4], arms: [0, 0], lean: 0.1, hdy: -0.2, reach: [[0.55, -0.75], [0.7, -0.65]], wpn: -70 },
    item: { legs: [0, 0.3], arms: [0, 0], reach: [null, [0.35, -0.95]], wpn: -80 },
    hurt: { legs: [-0.8, 0.5], arms: [-0.6, -0.4], lean: -0.6, hdx: -0.4, hdy: -0.2, fx: 0, reach: [[-0.45, 0.55], [-0.5, 0.5]], wpn: 115 },
    kneel: { legs: [0, 0], arms: [0, 0], kneel: true, lean: 0.35, hdy: 0.5, reach: [[0.2, 0.8], [0.4, 0.75]], wpn: 70 },
    ko: { legs: [0, 0], arms: [0, 0], lie: true },
    revive: { legs: [0, 0], arms: [0, 0], kneel: true, lean: 0.1, hdy: -0.2, reach: [[0.1, 0.7], [0.3, -0.3]], wpn: -40 },
    victory: { legs: [-0.6, 0.6], arms: [0, 0], hdy: -0.3, reach: [[-0.2, 0.85], [0.15, -1]], wpn: -90 },
    limit: { legs: [-1, 1], arms: [0, 0], crouch: 1.2, lean: 0.3, reach: [[-0.7, 0.1], [0.6, -0.8]], wpn: -55 },
    nod: { legs: [0, 0], arms: [0, 0], hdx: 0.3, hdy: 0.7 },
    shakeL: { legs: [0, 0], arms: [0, 0], hdx: -0.4, fx: -0.7 },
    shakeR: { legs: [0, 0], arms: [0, 0], hdx: 0.4, fx: 0.7 },
    crouch: { legs: [-0.3, 0.3], arms: [0.2, -0.2], crouch: 1.1 },
    jump: { legs: [0.4, -0.4], arms: [0, 0], reach: [[-0.5, -0.6], [0.5, -0.6]], hdy: -0.2 },
    sit: { legs: [0, 0], arms: [0, 0], sit: true, reach: [[-0.15, 0.7], [0.3, 0.65]] },
    laugh: { legs: [0, 0], arms: [0, 0], bob: 0.3, hdx: -0.3, hdy: -0.4, reach: [[-0.45, 0.55], [0.45, 0.55]] },
    laughB: { legs: [0, 0], arms: [0, 0], hdx: -0.2, hdy: -0.15, reach: [[-0.35, 0.65], [0.35, 0.65]] }
  };
  // Battle frames are two tiles wide so weapon swings and lunges have room; field frames stay one tile wide.
  function framePx(size, prop, wide) { var h = clamp(Number(prop && prop.height) || 1.5, 1, 2.5); return { w: wide ? size * 2 : size, h: Math.round(size * h) }; }
  function skeleton(plan, prop, pose, dir, Wu, Hu) {
    var bp = BODY_PLANS[plan && BODY_PLANS[plan] ? plan : 'average'];
    if (plan && typeof plan === 'object') bp = plan;
    var hs = clamp(Number(prop && prop.headScale) || 1, 0.6, 1.6), head = bp.head * hs;
    var need = head * 1.8 + bp.torso + bp.leg + 2.2, k = Math.min(1.25, (Hu - 1.6) / need);
    var side = dir === 'right', cx = Wu / 2, footY = Hu - 1.6, crouch = (pose.crouch || 0);
    var L0 = bp.leg * k, L = L0 - crouch, T = bp.torso * k, r = head * k, bob = pose.bob || 0;
    var hipY = footY - L + bob * 0.5;
    if (pose.kneel) hipY = footY - L0 * 0.52;
    if (pose.sit) hipY = footY - Math.max(1, L0 * 0.18);
    var lean = side ? (pose.lean || 0) * 1.3 : 0, ux = cx + lean;
    var neckY = hipY - T + Math.abs(lean) * 0.35, headCy = neckY - r * 0.82 + (pose.hdy || 0);
    var hx = ux + (side ? (pose.hdx || 0) : (pose.fx || 0));
    var sh = bp.sh * (side ? 0.62 : 1), hip = bp.hip * (side ? 0.66 : 1);
    var J = { cx: cx, ux: ux, hx: hx, footY: footY, hipY: hipY, neckY: neckY, headCy: headCy, headR: r, sh: sh, hip: hip, armW: bp.arm, legW: bp.legW, dir: dir, side: side, ready: !!pose.ready, plan: bp, legLen: footY - hipY, wpn: side && typeof pose.wpn === 'number' ? pose.wpn : null };
    var half = L0 * 0.5;
    J.legs = [0, 1].map(function (i) {
      var v = pose.legs[i] || 0, hx0 = side ? cx + (i ? 0.4 : -0.4) : cx + (i ? 1 : -1) * hip * 0.55;
      if (pose.kneel) {
        if (side) return i ? { hx: hx0, kx: hx0 + half * 0.95, ky: hipY - 0.2, x: hx0 + half * 0.95, y: footY, far: false } : { hx: hx0, kx: hx0 - 0.1, ky: footY - 0.4, x: hx0 - half * 0.95, y: footY - 0.4, far: true };
        return { hx: hx0, x: hx0 + (i ? 0.3 : -0.3), y: footY - (i ? 0 : 0.6), far: false };
      }
      if (pose.sit) {
        if (side) return { hx: hx0, kx: hx0 + half * 0.85, ky: hipY - half * 0.55 + (i ? 0 : 0.3), x: hx0 + half * 1.55 + (i ? 0.3 : -0.3), y: footY, far: !i };
        return { hx: hx0, x: hx0 + (i ? 1.6 : -1.6), y: footY, far: false };
      }
      if (side) return { hx: hx0, x: hx0 + v * 2.3, y: footY - (v > 0.3 ? 0.4 : 0), far: !i };
      return { hx: hx0, x: hx0, y: footY - (v > 0 ? 1 : 0), far: false };
    });
    J.arms = [0, 1].map(function (i) {
      var v = pose.arms[i] || 0, sx = side ? ux + (i ? 0.3 : -0.3) : ux + (i ? 1 : -1) * (sh + 0.1), sy = neckY + 1;
      var len = T * 0.95, rc = pose.reach && pose.reach[i];
      if (rc) return { sx: sx, sy: sy, hx: sx + rc[0] * len * (side ? 1 : (i ? 1 : -1)), hy: sy + rc[1] * len, far: side && !i };
      if (side) {
        if (pose.ready && i) return { sx: sx, sy: sy, hx: sx + len * 0.75, hy: sy + len * 0.45, far: false };
        return { sx: sx, sy: sy, hx: sx + v * 2.4, hy: sy + len - Math.abs(v) * 0.4, far: !i };
      }
      return { sx: sx, sy: sy, hx: sx + (i ? 0.5 : -0.5), hy: sy + len - (v > 0 ? 0.8 : 0), far: false };
    });
    return J;
  }
  // A leg from hip to foot, through the knee when the pose bends it.
  function limb(r, g, y0, w, code, trim) {
    var fy = g.y - (trim || 0);
    if (g.kx == null) { r.line(g.hx, y0, g.x, fy, w, code); return; }
    r.line(g.hx, y0, g.kx, g.ky, w, code);
    r.line(g.kx, g.ky, g.x, fy, w, code);
  }
  // Materials for the humanoid layout: 2 skin, 3 hair, 4 cloth A, 5 cloth B, 6 metal, 7 accent alias.
  var SKN = M_A, HAI = M_B, CLA = M_C, CLB = M_D, MET = M_E, ACC = M_ACC;
  function farc(code, far) { return far ? fx(code & 15, 0) : code; }
  var HUMANOID = {};
  HUMANOID['shadow.ground'] = function (r, J, p) { r.ell(J.cx, J.footY + 0.4, J.plan.sh * 1.05 * (p.width || 1), 0.9, M_GROUND); };
  HUMANOID['body.plan'] = function (r, J) {
    r.rect(J.ux - 0.8, J.neckY - 1, J.ux + 0.8, J.neckY + 1.2, SKN);
    J.arms.forEach(function (a) { if (a.far) { r.line(a.sx, a.sy, a.hx, a.hy, J.armW, farc(SKN, 1)); } });
    J.legs.forEach(function (g) { limb(r, g, J.hipY, J.legW, farc(SKN, g.far)); });
    r.poly([[J.ux - J.sh, J.neckY + 0.4], [J.ux + J.sh, J.neckY + 0.4], [J.cx + J.hip, J.hipY + 0.5], [J.cx - J.hip, J.hipY + 0.5]], SKN);
    J.arms.forEach(function (a) { if (!a.far) r.line(a.sx, a.sy, a.hx, a.hy, J.armW, SKN); r.ell(a.hx, a.hy + 0.2, J.armW * 0.55, J.armW * 0.55, farc(SKN, a.far)); });
  };
  function headShape(r, J, shape, code) {
    var cx = J.hx + (J.side ? 0.3 : 0), cy = J.headCy, R0 = J.headR;
    if (shape === 'square') r.poly([[cx - R0 * 0.85, cy - R0 * 0.8], [cx + R0 * 0.85, cy - R0 * 0.8], [cx + R0 * 0.9, cy + R0 * 0.4], [cx + R0 * 0.45, cy + R0], [cx - R0 * 0.45, cy + R0], [cx - R0 * 0.9, cy + R0 * 0.4]], code);
    else if (shape === 'long') r.ell(cx, cy + R0 * 0.1, R0 * 0.8, R0 * 1.1, code);
    else r.ell(cx, cy, R0 * 0.92, R0, code);
  }
  HUMANOID['head.shape'] = function (r, J, p) {
    headShape(r, J, p.shape, SKN);
    var cy = J.headCy + J.headR * 0.18, R0 = J.headR;
    if (J.dir === 'down') { r.dot(J.hx - R0 * 0.42, cy, M_OUT, true); r.dot(J.hx + R0 * 0.42 - 0.01, cy, M_OUT, true); }
    else if (J.dir === 'right') { r.dot(J.hx + R0 * 0.55, cy, M_OUT, true); r.dot(J.hx + R0 * 1.12, cy + R0 * 0.25, SKN); }
  };
  HUMANOID['hair.style'] = function (r, J, p) {
    var st = p.style || 'short', cx = J.hx + (J.side ? 0.3 : 0), cy = J.headCy, R0 = J.headR, code = st === 'covered' ? CLB : HAI;
    if (st === 'none') return;
    if (J.dir === 'up') {
      if (st === 'cropped') { r.clip = [-99, -99, 99, cy + R0 * 0.2]; r.ell(cx, cy, R0 * 0.95, R0 * 1.02, code); r.clip = null; }
      else r.ell(cx, cy, R0 * (st === 'covered' ? 1.1 : 0.98), R0 * (st === 'covered' ? 1.08 : 1.02), code);
      if (st === 'long') r.rect(cx - R0 * 0.85, cy, cx + R0 * 0.85, J.neckY + 2.6, code);
      if (st === 'tied') r.line(cx, cy + R0 * 0.6, cx, J.neckY + 2.4, 1.4, code);
      if (st === 'covered') r.poly([[cx - R0 * 1.05, cy], [cx + R0 * 1.05, cy], [cx + J.sh * 0.9, J.neckY + 1.5], [cx - J.sh * 0.9, J.neckY + 1.5]], code);
      if (st === 'spiked') for (var u = -1; u <= 1; u++) r.poly([[cx + u * R0 * 0.55 - R0 * 0.3, cy - R0 * 0.55], [cx + u * R0 * 0.55 + R0 * 0.3, cy - R0 * 0.55], [cx + u * R0 * 0.7, cy - R0 * 1.4]], code);
      return;
    }
    var back = J.side ? -R0 * 0.18 : 0, depth = st === 'cropped' ? -0.45 : -0.08;
    if (st === 'long') {
      if (J.side) r.rect(cx - R0 * 1.0, cy - R0 * 0.2, cx - R0 * 0.1, J.neckY + 2.4, code);
      else { r.rect(cx - R0 * 1.04, cy - R0 * 0.2, cx - R0 * 0.6, J.neckY + 2.4, code); r.rect(cx + R0 * 0.6, cy - R0 * 0.2, cx + R0 * 1.04, J.neckY + 2.4, code); }
    }
    if (st === 'covered') {
      r.ell(cx + back, cy - R0 * 0.05, R0 * 1.12, R0 * 1.12, code);
      r.poly([[cx - R0 * 1.05, cy + R0 * 0.2], [cx + R0 * 1.05, cy + R0 * 0.2], [cx + J.sh * 0.95, J.neckY + 1.6], [cx - J.sh * 0.95, J.neckY + 1.6]], code);
      r.next(); headFace(r, J);
      return;
    }
    r.clip = [-99, -99, 99, cy + R0 * depth];
    r.ell(cx + back, cy - R0 * 0.08, R0 * 1.0, R0 * 0.98, code);
    r.clip = null;
    if (J.side) { r.clip = [-99, -99, cx - R0 * 0.05, cy + R0 * 0.5]; r.ell(cx + back, cy, R0, R0, code); r.clip = null; }
    else if (st !== 'cropped') { r.rect(cx - R0 * 0.98, cy - R0 * 0.2, cx - R0 * 0.62, cy + R0 * 0.45, code); r.rect(cx + R0 * 0.62, cy - R0 * 0.2, cx + R0 * 0.98, cy + R0 * 0.45, code); }
    if (st === 'spiked') for (var v = -1; v <= 1; v++) r.poly([[cx + v * R0 * 0.55 - R0 * 0.32, cy - R0 * 0.6], [cx + v * R0 * 0.55 + R0 * 0.32, cy - R0 * 0.6], [cx + v * R0 * 0.75 + back, cy - R0 * 1.45]], code);
    if (st === 'tied') { if (J.side) r.line(cx - R0 * 0.9, cy - R0 * 0.2, cx - R0 * 1.5, cy + R0 * 1.1, 1.4, code); else r.ell(cx, cy - R0 * 1.0, R0 * 0.4, R0 * 0.35, code); }
  };
  // A hood leaves the face open: redraw it in its own layer so the shading reads.
  function headFace(r, J) {
    var cx = J.hx + (J.side ? 0.45 : 0), R0 = J.headR;
    r.ell(cx, J.headCy + R0 * 0.2, R0 * 0.62, R0 * 0.7, SKN);
    var cy = J.headCy + J.headR * 0.18;
    if (J.dir === 'down') { r.dot(J.hx - R0 * 0.32, cy, M_OUT); r.dot(J.hx + R0 * 0.32 - 0.01, cy, M_OUT); }
    else if (J.dir === 'right') r.dot(J.hx + R0 * 0.62, cy, M_OUT);
  }
  function sleeves(r, J, len, code) {
    J.arms.forEach(function (a) {
      var ex = a.sx + (a.hx - a.sx) * len, ey = a.sy + (a.hy - a.sy) * len;
      r.line(a.sx, a.sy, ex, ey, J.armW + 0.5, farc(code, a.far));
    });
  }
  function chest(r, J, wid, bottom, flare, code) {
    var s = J.sh * wid, hb = J.hip * flare;
    r.poly([[J.ux - s, J.neckY + 0.3], [J.ux + s, J.neckY + 0.3], [J.cx + hb, bottom], [J.cx - hb, bottom]], code);
  }
  HUMANOID['torso.cloth'] = function (r, J, p) {
    var st = p.style || 'tunic', front = J.dir === 'down';
    if (st === 'robe') {
      chest(r, J, 1.02, J.footY - 0.3, 1.6, CLA); sleeves(r, J, 1, CLA);
      if (J.dir !== 'up') r.rect(J.cx - J.hip * 0.9, J.hipY - 0.6, J.cx + J.hip * 0.9, J.hipY + 0.3, ACC);
    } else if (st === 'coat') {
      chest(r, J, 1.05, J.hipY + J.legLen * 0.55, 1.45, CLA); sleeves(r, J, 1, CLA);
      if (front) r.rect(J.cx - 0.35, J.neckY + 1.2, J.cx + 0.35, J.hipY + J.legLen * 0.5, CLB);
      if (J.dir !== 'up') r.rect(J.ux - J.sh * 0.6, J.neckY + 0.2, J.ux + J.sh * 0.6, J.neckY + 1.0, ACC);
    } else if (st === 'plate') {
      sleeves(r, J, 1, CLA);
      chest(r, J, 1.0, J.hipY + 0.6, 1.1, MET);
      J.arms.forEach(function (a) { if (!J.side || !a.far) r.ell(a.sx, a.sy - 0.1, J.armW * 0.9, J.armW * 0.75, MET); });
      r.rect(J.cx - J.hip * 1.05, J.hipY - 0.3, J.cx + J.hip * 1.05, J.hipY + 0.5, CLB);
    } else if (st === 'bodysuit') {
      chest(r, J, 0.92, J.hipY + 0.5, 1.0, CLA); sleeves(r, J, 1, CLA);
      if (front) r.line(J.cx - J.sh * 0.6, J.neckY + 1, J.cx + J.sh * 0.5, J.hipY - 0.5, 0.8, ACC);
    } else if (st === 'vest') {
      chest(r, J, 1.0, J.hipY + 0.6, 1.1, CLA); sleeves(r, J, 0.45, CLA);
      if (front) { r.rect(J.cx - J.sh, J.neckY + 0.5, J.cx - 0.5, J.hipY + 0.6, CLB); r.rect(J.cx + 0.5, J.neckY + 0.5, J.cx + J.sh, J.hipY + 0.6, CLB); }
      else chest(r, J, 0.95, J.hipY + 0.6, 1.05, CLB);
    } else {
      chest(r, J, 1.0, J.hipY + 1.3, 1.25, CLA); sleeves(r, J, 0.5, CLA);
      r.rect(J.cx - J.hip * 1.2, J.hipY - 0.4, J.cx + J.hip * 1.2, J.hipY + 0.4, CLB);
    }
  };
  HUMANOID['legs.cloth'] = function (r, J, p) {
    var st = p.style || 'trousers';
    function shoes() { J.legs.forEach(function (g) { r.rect(g.x - J.legW * 0.6 + (J.side ? 0.4 : 0), g.y - 0.8, g.x + J.legW * 0.6 + (J.side ? 0.9 : 0), g.y + 0.25, farc(M_OUT, 0)); }); }
    if (st === 'skirt') {
      r.poly([[J.cx - J.hip * 1.05, J.hipY - 0.5], [J.cx + J.hip * 1.05, J.hipY - 0.5], [J.cx + J.hip * 1.5, J.hipY + J.legLen * 0.55], [J.cx - J.hip * 1.5, J.hipY + J.legLen * 0.55]], CLB);
      shoes();
    } else if (st === 'longrobe') {
      r.poly([[J.cx - J.hip * 1.05, J.hipY - 0.5], [J.cx + J.hip * 1.05, J.hipY - 0.5], [J.cx + J.hip * 1.45, J.footY - 0.5], [J.cx - J.hip * 1.45, J.footY - 0.5]], CLA);
      shoes();
    } else {
      J.legs.forEach(function (g) { limb(r, g, J.hipY - 0.3, J.legW * 1.12, farc(CLB, g.far), 0.6); });
      r.rect(J.cx - J.hip * 1.02, J.hipY - 0.5, J.cx + J.hip * 1.02, J.hipY + 0.6, CLB);
      if (st === 'boots') J.legs.forEach(function (g) { var bx = g.kx == null ? g.x : g.kx + (g.x - g.kx) * 0.3, by = g.kx == null ? g.y - J.legLen * 0.38 : g.ky + (g.y - g.ky) * 0.3; r.line(bx, by, g.x + (J.side ? 0.4 : 0), g.y - 0.2, J.legW * 1.25, farc(ACC, g.far)); });
      else shoes();
    }
  };
  HUMANOID['back.gear'] = function (r, J, p) {
    var st = p.style || 'cape', s = J.sh, dx = J.side ? -1.2 : 0;
    if (st === 'cape') {
      if (J.side) r.poly([[J.ux + 0.3, J.neckY + 0.2], [J.ux - 0.8, J.neckY + 0.2], [J.cx - s * 1.3 - 1.8, J.hipY + J.legLen * 0.75], [J.cx - 0.4, J.hipY + J.legLen * 0.75]], CLB);
      else r.poly([[J.cx - s, J.neckY + 0.2], [J.cx + s, J.neckY + 0.2], [J.cx + s * 1.35, J.hipY + J.legLen * 0.75], [J.cx - s * 1.35, J.hipY + J.legLen * 0.75]], CLB);
    }
    else if (st === 'pack') r.rect(J.ux - s * 0.75 + dx * 1.3, J.neckY + 0.4 - (J.dir === 'down' ? 1 : 0), J.ux + s * 0.75 + dx * 0.4, J.hipY - 0.2, CLB);
    else r.line(J.cx - s - 0.5 + dx, J.hipY + 1.5, J.ux + s + 1 + dx, J.neckY - J.headR * 1.2, 1.1, MET);
  };
  HUMANOID['front.gear'] = function (r, J, p) {
    var st = p.style || 'bare';
    if (st === 'bare') return;
    var hi = J.side ? 1 : J.dir === 'up' ? 1 : 0, off = 1 - hi, h = J.arms[hi], o = J.arms[off], hx = h.hx, hy = h.hy + 0.2;
    var up = J.ready, dir = J.dir, w = J.wpn, ca = w == null ? 0 : Math.cos(w * Math.PI / 180), sa = w == null ? 0 : Math.sin(w * Math.PI / 180);
    if (st === 'blade') {
      if (w != null) {
        r.line(hx, hy, hx + ca * 6.4, hy + sa * 6.4, 1.05, MET);
        r.line(hx - sa * 0.95, hy + ca * 0.95, hx + sa * 0.95, hy - ca * 0.95, 0.9, ACC);
      } else {
        var tx = up ? hx + 4.6 : hx + (dir === 'right' ? 1.4 : dir === 'up' ? 1.2 : -1.4), ty = up ? hy - 4.8 : hy + 5.2;
        r.line(hx, hy, tx, ty, 1.05, MET);
        r.line(hx - (up ? 0.8 : 1), hy + (up ? 0.8 : 0), hx + (up ? 0.8 : 1), hy - (up ? 0.8 : 0), 0.9, ACC);
      }
    } else if (st === 'staff') {
      var ex0 = w != null ? hx - ca * 3 : hx, ey0 = w != null ? hy - sa * 3 : hy + 3, ex1 = w != null ? hx + ca * 8.5 : hx + (up ? 1.5 : 0), ey1 = w != null ? hy + sa * 8.5 : hy - 8.5;
      r.line(ex0, ey0, ex1, ey1, 1.05, ACC);
      r.ell(ex1 + (w != null ? ca * 0.3 : 0), ey1 + (w != null ? sa * 0.3 : -0.3), 1.1, 1.1, MET);
    } else if (st === 'shield') {
      var sx = J.side ? J.ux + J.sh + 1.2 : o.hx + (off ? 0.4 : -0.4), sy = J.side ? J.neckY + J.plan.torso * 0.55 : o.hy - 1.4;
      r.ell(sx, sy, J.side ? 1.1 : 1.9, 2.3, MET);
      r.dot(sx, sy, ACC);
    } else if (st === 'tool') {
      var ex = w != null ? hx + ca * 3.6 : up ? hx + 3 : hx, ey = w != null ? hy + sa * 3.6 : up ? hy - 3.6 : hy + 3.6;
      r.line(hx, hy, ex, ey, 0.9, ACC);
      if (w != null) r.line(ex - sa * 1.3, ey + ca * 1.3, ex + sa * 1.3, ey - ca * 1.3, 1.6, MET); else r.line(ex - 1.3, ey, ex + 1.3, ey, 1.6, MET);
    } else if (st === 'device') {
      var bx = hx + (J.side ? 0.6 : 0);
      for (var t = 0; t < 6; t++) {
        var a0 = -1.1 + t * 0.44, a1 = a0 + 0.44, rr = 4.2;
        r.line(bx + Math.cos(a0) * 1.4, hy + Math.sin(a0) * rr, bx + Math.cos(a1) * 1.4, hy + Math.sin(a1) * rr, 0.9, ACC);
      }
      r.line(bx + Math.cos(-1.1) * 1.4, hy + Math.sin(-1.1) * 4.2, bx + Math.cos(1.54) * 1.4, hy + Math.sin(1.54) * 4.2, 0.6, M_OUT);
    }
  };
  // Each default part generator: shape key, the layer it fills, and its parameters.
  var LAYERS = ['shadow', 'back', 'body', 'legs', 'torso', 'head', 'hair', 'front'];
  var ORDER = {
    down: ['shadow', 'back', 'body', 'legs', 'torso', 'head', 'hair', 'front'],
    right: ['shadow', 'back', 'body', 'legs', 'torso', 'head', 'hair', 'front'],
    up: ['shadow', 'front', 'body', 'legs', 'torso', 'head', 'hair', 'back']
  };
  var GEN_KEY = { shadow: 'shadow.ground', body: 'body.plan', head: 'head.shape', hair: 'hair.style', torso: 'torso.cloth', legs: 'legs.cloth', back: 'back.gear', front: 'front.gear' };
  var LIBRARY = [];
  function lib(layer, style, label, params) { LIBRARY.push({ key: layer + '.' + style, layer: layer, rig: 'humanoid', label: label, gen: { shape: GEN_KEY[layer], params: params } }); }
  Object.keys(BODY_PLANS).forEach(function (k) { lib('body', k, k.charAt(0).toUpperCase() + k.slice(1) + ' build', { plan: k }); });
  [['round', 'Round head'], ['square', 'Square head'], ['long', 'Long head']].forEach(function (x) { lib('head', x[0], x[1], { shape: x[0] }); });
  [['short', 'Short hair'], ['long', 'Long hair'], ['tied', 'Tied hair'], ['spiked', 'Spiked hair'], ['cropped', 'Cropped hair'], ['covered', 'Hood'], ['none', 'No hair']].forEach(function (x) { lib('hair', x[0], x[1], { style: x[0] }); });
  [['tunic', 'Tunic'], ['robe', 'Robe'], ['coat', 'Coat'], ['plate', 'Plate'], ['bodysuit', 'Bodysuit'], ['vest', 'Vest']].forEach(function (x) { lib('torso', x[0], x[1], { style: x[0] }); });
  [['trousers', 'Trousers'], ['skirt', 'Skirt'], ['longrobe', 'Long robe'], ['boots', 'Boots']].forEach(function (x) { lib('legs', x[0], x[1], { style: x[0] }); });
  [['cape', 'Cape'], ['pack', 'Pack'], ['item', 'Long carried item']].forEach(function (x) { lib('back', x[0], x[1], { style: x[0] }); });
  [['blade', 'Blade'], ['staff', 'Staff'], ['shield', 'Shield'], ['tool', 'Tool'], ['device', 'Ranged device'], ['bare', 'Bare hand']].forEach(function (x) { lib('front', x[0], x[1], { style: x[0] }); });

  // ---------------------------------------------------------------- enemy rigs (battle, facing right, 2 by 2 tiles)
  // Materials for the enemy layout: 2 body, 3 shade, 4 accent, 5 eye, 6 metal.
  var BOD = M_A, SHD = M_B, EAC = M_C, EYE = M_D, EMT = M_E;
  function eyes(r, x, y, n, sz) {
    for (var i = 0; i < n; i++) { var ex = x - i * (sz * 2.4 + 0.6); r.ell(ex, y, sz, sz * 1.15, fx(EYE, 2)); r.dot(ex + sz * 0.35, y + sz * 0.2, M_OUT); }
  }
  var ENEMY = {};
  ENEMY.ooze = function (r, p, rnd) {
    var w = 13 * (p.width || 0.85), hgt = 20 * (p.height || 0.7), base = 29.5, cx = 16;
    r.clip = [-99, -99, 99, base];
    r.ell(cx, base, w, hgt, BOD);
    r.clip = null;
    if (p.crest) r.poly([[cx - 2, base - hgt + 1], [cx + 2, base - hgt + 1], [cx + 0.5, base - hgt - 4]], BOD);
    r.next(); r.clip = [-99, base - 2.4, 99, base]; r.ell(cx, base, w, hgt, SHD); r.clip = null;
    for (var i = 0; i < (p.drip == null ? 1 : p.drip); i++) r.ell(cx - w * 0.5 + rnd() * w, base + 0.4, 1.1, 1.3, SHD);
    r.next(); r.ell(cx - w * 0.45, base - hgt * 0.62, w * 0.16, hgt * 0.1, fx(EAC, 2));
    r.next(); eyes(r, cx + w * 0.45, base - hgt * 0.5, p.eyes == null ? 2 : p.eyes, 1.5);
    r.line(cx + w * 0.05, base - hgt * 0.22, cx + w * 0.5, base - hgt * 0.22, 0.7, M_OUT);
  };
  ENEMY.floater = function (r, p, rnd) {
    var sz = 7 * (p.size || 0.9) + 2, cx = 15, cy = 13;
    var n = p.tails == null ? 3 : p.tails;
    for (var i = 0; i < n; i++) {
      var a = (i - (n - 1) / 2) * 0.55, len = 9 + rnd() * 4;
      r.line(cx - Math.sin(a) * 2, cy + sz * 0.5, cx - 2 - Math.sin(a) * len * 0.6, cy + sz * 0.6 + len, 3.2 - i * 0.2, EAC);
    }
    r.next(); r.ell(cx, cy, sz, sz, BOD);
    r.next(); r.ell(cx - sz * 0.25, cy - sz * 0.15, sz * 0.5, sz * 0.5, fx(EAC, 2));
    r.next(); eyes(r, cx + sz * 0.45, cy + 0.5, p.eyes == null ? 2 : p.eyes, 1.2);
  };
  ENEMY.quadruped = function (r, p, rnd) {
    var sz = p.size || 0.85, leg = 4 + 5 * (p.legLen == null ? 0.5 : p.legLen), base = 29.5, by = base - leg - 3.5;
    var bx = 13, bw = 9.5 * sz, bh = 4.6 * sz, hx = bx + bw + 1.5 + 2 * (p.neck || 0.5), hy = by - 4 - 2 * (p.neck || 0.5);
    [[bx - bw * 0.55, 1], [bx + bw * 0.55, 1]].forEach(function (q) { r.line(q[0] + 1.2, by + 1, q[0] + 1.8, base, 2.1, fx(SHD, 0)); });
    if (p.tail !== 0) r.line(bx - bw * 0.85, by - 1, bx - bw - 3, by - 5 - rnd() * 2, 1.8, SHD);
    r.next(); r.ell(bx, by, bw, bh, BOD);
    if (p.mane) r.ell(bx + bw * 0.55, by - bh * 0.5, bw * 0.4, bh * 0.75, EAC);
    r.line(bx + bw * 0.6, by - 1, hx - 1, hy + 1, 3.6 * sz, BOD);
    [[bx - bw * 0.55], [bx + bw * 0.55]].forEach(function (q) { r.line(q[0], by + 1.5, q[0] + 0.4, base, 2.3, BOD); });
    r.next(); r.ell(hx, hy, 3.6 * sz + 0.4, 3.1 * sz + 0.4, BOD); r.ell(hx + 3.2 * sz, hy + 1.3, 2.3, 1.5, BOD);
    if (p.ears !== 0) r.poly([[hx - 2.2, hy - 1.5], [hx - 0.2, hy - 2.5], [hx - 2.4, hy - 5.8]], BOD);
    if (p.horns) r.line(hx - 0.5, hy - 2.6, hx - 3.5, hy - 6.5, 1.3, EMT);
    r.next(); r.ell(hx + 0.6, hy - 0.4, 0.9, 0.9, fx(EYE, 2)); r.dot(hx + 0.9, hy - 0.3, M_OUT);
    r.dot(hx + 5.2 * sz, hy + 1.2, M_OUT);
  };
  ENEMY.avian = function (r, p) {
    var base = 29.5, bx = 14, by = 18, span = p.wingspan == null ? 1 : p.wingspan, hx = 21.5, hy = 10.5;
    r.poly([[bx - 2, by - 2], [bx + 3, by - 3], [bx - 6 * span, by - 12 * span], [bx - 10 * span, by - 6]], fx(EAC, 0));
    r.line(bx, by + 4, bx - 0.5, base, 1, EMT); r.line(bx + 2.5, by + 4, bx + 3, base, 1, EMT);
    r.next(); r.poly([[bx - 6, by + 1], [bx - 12, by + 1 + 2 * (p.tail == null ? 1 : p.tail)], [bx - 11, by - 2]], SHD);
    r.ell(bx, by, 6.6, 5, BOD); r.line(bx + 3, by - 3, hx - 1, hy + 1.5, 3.2, BOD);
    r.next(); r.ell(hx, hy, 3.6, 3.3, BOD);
    r.poly([[hx + 2.8, hy - 0.4], [hx + 2.8, hy + 1.6], [hx + 4 + 2.5 * (p.beak == null ? 1 : p.beak), hy + 0.8]], EMT);
    r.next(); r.poly([[bx - 4, by - 1], [bx + 4, by - 2], [bx - 3 * span, by - 10 * span], [bx - 8 * span, by - 5]], EAC);
    r.next(); r.ell(hx + 0.8, hy - 0.6, 0.9, 0.9, fx(EYE, 2)); r.dot(hx + 1.1, hy - 0.5, M_OUT);
  };
  ENEMY.serpent = function (r, p) {
    var coils = p.coils == null ? 2 : p.coils, pts = [], n = 18;
    for (var i = 0; i <= n; i++) {
      var t = i / n, x = 3 + t * 20, y = 27 - t * 13 - Math.sin(t * Math.PI * coils) * 3.5;
      pts.push([x, y, 2.2 + t * 4.4 * (p.length || 1)]);
    }
    for (var j = 1; j < pts.length; j++) r.line(pts[j - 1][0], pts[j - 1][1], pts[j][0], pts[j][1], pts[j][2], BOD);
    r.next();
    for (var k = 2; k < pts.length - 1; k += 2) r.line(pts[k][0], pts[k][1] + pts[k][2] * 0.32, pts[k + 1][0], pts[k + 1][1] + pts[k + 1][2] * 0.32, Math.max(0.8, pts[k][2] * 0.35), EAC);
    var h = pts[n];
    r.next(); if (p.hood) r.ell(h[0] - 1, h[1] - 0.5, 3.2, 4.6, SHD);
    r.ell(h[0] + 1.5, h[1] - 1, 3.6, 2.6, BOD);
    r.line(h[0] + 4.8, h[1] - 0.4, h[0] + 7.5, h[1] + 0.6, 0.6, EAC);
    r.next(); r.ell(h[0] + 2.2, h[1] - 2, 0.85, 0.85, fx(EYE, 2)); r.dot(h[0] + 2.5, h[1] - 1.9, M_OUT);
  };
  ENEMY.construct = function (r, p) {
    var b = p.bulk || 1, base = 29.5, cx = 15;
    r.rect(cx - 4.5, base - 7, cx - 1.5, base, fx(SHD, 0)); r.rect(cx + 1.5, base - 7, cx + 4.5, base, SHD);
    if (p.arms !== 0) r.rect(cx - 9 * b, base - 18, cx - 6 * b, base - 7, fx(SHD, 0));
    r.next(); r.rect(cx - 6.5 * b, base - 19, cx + 6.5 * b, base - 6, BOD);
    r.rect(cx - 3, base - 25, cx + 3.5, base - 19, BOD);
    if (p.arms !== 0) r.rect(cx + 6 * b, base - 18, cx + 9 * b, base - 7, BOD);
    r.next(); r.rect(cx - 4.5 * b, base - 16, cx + 4.5 * b, base - 13, EMT);
    r.dot(cx - 5 * b, base - 8, EMT); r.dot(cx + 5 * b, base - 8, EMT);
    r.next(); r.rect(cx - 1, base - 23, cx + 3, base - 21.6, p.glow === 0 ? EYE : fx(EYE, 2));
  };
  ENEMY.plant = function (r, p, rnd) {
    var base = 29.5, cx = 15, top = base - 20 * (p.height || 0.75);
    r.line(cx, base, cx + 1, top + 3, 2.2, SHD);
    for (var i = 0; i < 3; i++) r.line(cx, base - 0.3, cx - 4 + i * 4, base + 0.4, 1, fx(SHD, 0));
    r.next(); r.poly([[cx, base - 7], [cx - 7, base - 11], [cx - 2, base - 6]], EAC); r.poly([[cx + 1, base - 10], [cx + 8, base - 14], [cx + 3, base - 9]], EAC);
    var n = p.petals == null ? 5 : p.petals;
    r.next();
    for (var k = 0; k < n; k++) { var a = k / n * Math.PI * 2 + rnd() * 0.3; r.ell(cx + 1 + Math.cos(a) * 5, top + Math.sin(a) * 4.6, 2.6, 2.2, EAC); }
    r.next(); r.ell(cx + 1, top, 4.4, 4, BOD);
    r.line(cx + 2, top + 1.2, cx + 5, top + 1.2, 0.9, M_OUT); r.dot(cx + 3, top + 1.9, EMT); r.dot(cx + 4.4, top + 1.9, EMT);
    r.next(); r.ell(cx + 2.6, top - 1.6, 0.8, 0.8, fx(EYE, 2));
  };
  ENEMY.humanoid = function (r, p) {
    var base = 29.5, cx = 14, b = p.bulk || 1, hunch = p.hunch == null ? 0.5 : p.hunch;
    r.line(cx - 1.5, base - 9, cx - 3, base, 2.4 * b, fx(SHD, 0)); r.line(cx - 4 * b, base - 19, cx - 6 * b, base - 10, 2.2 * b, fx(SHD, 0));
    r.next(); r.line(cx + 1.5, base - 9, cx + 2.5, base, 2.6 * b, SHD);
    r.ell(cx, base - 14, 5 * b, 6.5, BOD);
    r.ell(cx + 2 + hunch * 2.5, base - 22 + hunch * 2, 3.4, 3.4, BOD);
    r.line(cx + 4 * b, base - 18, cx + 7 * b, base - 11, 2.2 * b, BOD);
    if (p.weapon !== 0) { r.next(); r.line(cx + 7 * b, base - 10, cx + 12 * b, base - 20, 1.3, EMT); }
    r.next(); r.ell(cx + 3.6 + hunch * 2.5, base - 22.6 + hunch * 2, 0.8, 0.8, fx(EYE, 2));
  };
  var RIGS = ['humanoid', 'quadruped', 'avian', 'serpent', 'ooze', 'construct', 'floater', 'plant'];
  var RIG_PARAMS = {
    ooze: { width: 0.85, height: 0.7, eyes: 2, drip: 1, crest: 0 }, floater: { size: 0.9, tails: 3, eyes: 2 },
    quadruped: { size: 0.85, legLen: 0.5, neck: 0.5, tail: 1, ears: 1, horns: 0, mane: 0 }, avian: { wingspan: 1, beak: 1, tail: 1 },
    serpent: { coils: 2, length: 1, hood: 0 }, construct: { bulk: 1, arms: 1, glow: 1 }, plant: { height: 0.75, petals: 5 },
    humanoid: { bulk: 1, hunch: 0.5, weapon: 1 }
  };
  RIGS.forEach(function (k) { LIBRARY.push({ key: 'enemy.' + k, layer: 'body', rig: k, label: k.charAt(0).toUpperCase() + k.slice(1) + ' body', gen: { shape: 'enemy.' + k, params: clone(RIG_PARAMS[k]) } }); });
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------------------------------------------------------------- portraits
  var EXPRESSIONS = {
    neutral: { brow: 0, tilt: 0, eye: 1, mouth: 'line' }, happy: { brow: -0.4, tilt: 0, eye: 0.55, mouth: 'smile' },
    sad: { brow: 0.4, tilt: 1, eye: 0.8, mouth: 'frown' }, angry: { brow: 0.6, tilt: -1, eye: 0.75, mouth: 'grit' },
    surprised: { brow: -1.2, tilt: 0, eye: 1.3, mouth: 'open' }, determined: { brow: 0.4, tilt: -0.5, eye: 0.85, mouth: 'set' }
  };
  function portraitSize(T) { return clamp(Math.round(T * 3), 24, 96); }
  function portrait(recipe, expr, P) {
    recipe = recipe || {}; var e = typeof expr === 'object' && expr ? expr : EXPRESSIONS[expr] || EXPRESSIONS.neutral;
    var r = new Ras(P, P, P / 48), hair = recipe.hair || 'short', cx = 24, cy = 21, hr = 11.5;
    var hc = hair === 'covered' ? CLB : HAI;
    if (hair === 'long' || hair === 'tied' || hair === 'covered') { r.rect(cx - 13, cy - 4, cx + 13, 41, hc); r.next(); }
    r.poly([[3, 48], [45, 48], [38, 37], [10, 37]], CLA);
    r.poly([[18, 37], [30, 37], [24, 45]], CLB);
    if (recipe.collar === 'plate') { r.ell(10, 41, 6, 4, MET); r.ell(38, 41, 6, 4, MET); }
    r.next(); r.rect(cx - 4, cy + 8, cx + 4, 39, SKN);
    r.next();
    var shp = recipe.head || 'round';
    if (shp === 'square') r.poly([[cx - 10.5, cy - 11], [cx + 10.5, cy - 11], [cx + 11, cy + 5], [cx + 5, cy + 12.5], [cx - 5, cy + 12.5], [cx - 11, cy + 5]], SKN);
    else if (shp === 'long') r.ell(cx, cy + 1, 9.6, 14, SKN);
    else r.ell(cx, cy, hr, 13, SKN);
    r.ell(cx - hr - 0.3, cy + 2, 1.8, 2.8, SKN); r.ell(cx + hr + 0.3, cy + 2, 1.8, 2.8, SKN);
    r.next();
    var ey = cy + 1.5, eo = 5, eh = 2.2 * clamp(e.eye, 0.3, 1.6);
    [-1, 1].forEach(function (sd) {
      var ex = cx + sd * eo;
      if (e.eye > 0.4) { r.ell(ex, ey + 0.2, 1.3, Math.max(0.8, eh * 0.8), M_OUT); r.dot(ex - 0.6, ey - eh * 0.35, fx(SKN, 2)); }
      r.line(ex - 2.4, ey - eh + 0.1, ex + 2.4, ey - eh + 0.1, 0.8, M_OUT);
      r.line(ex - 1.8 * sd, ey + eh * 0.9, ex + 1.2 * sd, ey + eh * 0.9, 0.6, fx(SKN, 0));
      var by = ey - 4.2 + e.brow, inner = ex - sd * 2.2, outer = ex + sd * 2.6;
      r.line(inner, by - e.tilt * 0.9, outer, by + e.tilt * 0.6, 1.1, fx(HAI, 0));
    });
    r.line(cx + 0.4, cy + 4, cx + 1, cy + 6.5, 0.9, fx(SKN, 0));
    var my = cy + 9.5, mw = 3.6 * (recipe.mouth || 1);
    if (e.mouth === 'smile') { r.line(cx - mw, my - 0.8, cx - mw * 0.4, my + 0.5, 0.8, M_OUT); r.line(cx - mw * 0.4, my + 0.5, cx + mw * 0.4, my + 0.5, 0.8, M_OUT); r.line(cx + mw * 0.4, my + 0.5, cx + mw, my - 0.8, 0.8, M_OUT); }
    else if (e.mouth === 'frown') { r.line(cx - mw, my + 0.8, cx - mw * 0.4, my - 0.3, 0.8, M_OUT); r.line(cx - mw * 0.4, my - 0.3, cx + mw * 0.4, my - 0.3, 0.8, M_OUT); r.line(cx + mw * 0.4, my - 0.3, cx + mw, my + 0.8, 0.8, M_OUT); }
    else if (e.mouth === 'open') { r.ell(cx, my + 0.4, mw * 0.55, 1.9, M_OUT); }
    else if (e.mouth === 'grit') { r.rect(cx - mw * 0.8, my - 0.6, cx + mw * 0.8, my + 1, fx(SKN, 2)); r.line(cx - mw * 0.8, my - 0.6, cx + mw * 0.8, my - 0.6, 0.6, M_OUT); r.line(cx - mw * 0.8, my + 1, cx + mw * 0.8, my + 1, 0.6, M_OUT); }
    else r.line(cx - mw * (e.mouth === 'set' ? 0.85 : 0.7), my, cx + mw * (e.mouth === 'set' ? 0.85 : 0.7), my, 0.8, M_OUT);
    r.next();
    if (hair !== 'none') {
      r.clip = [-99, -99, 99, cy - (hair === 'cropped' ? 7 : 3.5)];
      r.ell(cx, cy - 1, hr + 1.4, 14.4, hc);
      r.clip = null;
      if (hair !== 'cropped') { r.rect(cx - hr - 1.4, cy - 5, cx - hr + 2, cy + 6, hc); r.rect(cx + hr - 2, cy - 5, cx + hr + 1.4, cy + 6, hc); }
      if (hair === 'spiked') for (var v = -2; v <= 2; v++) r.poly([[cx + v * 4.6 - 3, cy - 10], [cx + v * 4.6 + 3, cy - 10], [cx + v * 5.4, cy - 19]], hc);
      if (hair === 'tied') { r.next(); r.ell(cx, cy - 15.2, 3.4, 2.8, hc); }
      if (hair === 'covered') r.poly([[cx - 14, cy - 2], [cx - 12, cy - 15], [cx + 12, cy - 15], [cx + 14, cy - 2], [cx + 12, cy + 8], [cx + 10, cy - 4], [cx - 10, cy - 4], [cx - 12, cy + 8]], hc);
      if (hair === 'short' || hair === 'long') r.poly([[cx - 9, cy - 8], [cx + 6, cy - 9], [cx - 2, cy - 4.5]], hc);
    }
    var sh = shadeAndOutline(r, true);
    return { w: P, h: P, ax: P >> 1, ay: P - 1, idx: resolve(r, sh, recipe.accent) };
  }

  // ---------------------------------------------------------------- icons
  // The icon layout: 2 to 4 metal, 5 to 7 wood, 8 to 10 tint (swapped per icon), 11 to 13 cloth, 14 and 15 light.
  var GLYPHS = ['blade', 'staff', 'shield', 'helm', 'body', 'ring', 'vial', 'scroll', 'gem', 'seed', 'tool', 'device'];
  var STATUS_SHAPES = ['drop', 'skull', 'sleep', 'spiral', 'star', 'up', 'down', 'clock', 'heart', 'bolt', 'flame', 'leaf', 'eye', 'chain'];
  var I_MET = M_A, I_WOD = M_B, I_TNT = M_C, I_CLO = M_D, I_LGT = M_E;
  function iconSize(T) { T = Number(T) || 16; return T <= 16 ? Math.max(8, Math.round(T)) : clamp(Math.round(T / 2), 16, 32); }
  var ICON = {
    blade: function (r) { r.line(4, 12, 12.5, 3.5, 1.7, I_MET); r.line(2.8, 9.8, 6.2, 13.2, 1.2, I_TNT); r.line(2.2, 13.8, 4.2, 11.8, 1.3, I_WOD); },
    staff: function (r) { r.line(3, 14, 11, 5, 1.3, I_WOD); r.ell(11.8, 4, 2.4, 2.4, I_TNT); },
    shield: function (r) { r.poly([[3, 2.5], [13, 2.5], [13, 8], [8, 14], [3, 8]], I_MET); r.next(); r.poly([[5, 4.5], [11, 4.5], [11, 8], [8, 11.5], [5, 8]], I_TNT); },
    helm: function (r) { r.clip = [-9, -9, 99, 10]; r.ell(8, 10, 5.6, 7, I_MET); r.clip = null; r.rect(2.4, 10, 13.6, 12.4, I_MET); r.next(); r.rect(6, 8, 10, 9.4, M_OUT); r.line(8, 2.5, 8, 6.5, 1.3, I_TNT); },
    body: function (r) { r.poly([[3, 3], [6, 2.5], [8, 4], [10, 2.5], [13, 3], [13.5, 7], [11.5, 7.5], [11.5, 13.5], [4.5, 13.5], [4.5, 7.5], [2.5, 7]], I_MET); r.next(); r.rect(5.5, 9, 10.5, 10.4, I_TNT); },
    ring: function (r) { r.ell(8, 9.5, 4.6, 4.6, I_MET); r.next(); r.ell(8, 9.5, 2.5, 2.5, 0); r.next(); r.ell(8, 4.4, 2.2, 1.9, I_TNT); },
    vial: function (r) { r.rect(6.6, 2.2, 9.4, 4.2, I_WOD); r.rect(7, 4, 9, 6.4, I_LGT); r.ell(8, 10.2, 4.4, 4.2, I_LGT); r.next(); r.clip = [-9, 9.4, 99, 99]; r.ell(8, 10.2, 4.4, 4.2, I_TNT); r.clip = null; },
    scroll: function (r) { r.rect(3.5, 4, 12.5, 12, I_CLO); r.next(); r.rect(2.4, 2.6, 13.6, 4.6, I_WOD); r.rect(2.4, 11.4, 13.6, 13.4, I_WOD); r.next(); r.line(5, 7, 11, 7, 0.7, M_OUT); r.line(5, 9.4, 10, 9.4, 0.7, M_OUT); },
    gem: function (r) { r.poly([[4, 6], [6.5, 2.8], [9.5, 2.8], [12, 6], [8, 13.5]], I_TNT); r.next(); r.poly([[6.4, 5.6], [8, 3.6], [9.6, 5.6], [8, 9]], fx(I_TNT, 2)); },
    seed: function (r) { r.ell(8, 9.5, 3.8, 4.6, I_WOD); r.next(); r.line(8, 5.2, 10.6, 2.6, 1.2, I_TNT); r.ell(11.4, 2.8, 1.6, 1.1, I_TNT); },
    tool: function (r) { r.line(4, 13, 10, 7, 1.4, I_WOD); r.next(); r.poly([[8, 3], [13.5, 8.5], [11.5, 10.5], [6, 5]], I_MET); },
    device: function (r) { for (var t = 0; t < 7; t++) { var a = -1.25 + t * 0.4; r.line(6 + Math.cos(a) * 5.5, 8 + Math.sin(a) * 6, 6 + Math.cos(a + 0.4) * 5.5, 8 + Math.sin(a + 0.4) * 6, 1.3, I_WOD); } r.line(6 + Math.cos(-1.25) * 5.5, 8 + Math.sin(-1.25) * 6, 6 + Math.cos(1.55) * 5.5, 8 + Math.sin(1.55) * 6, 0.6, I_LGT); r.line(3, 8, 12.5, 8, 0.8, I_TNT); },
    'status.drop': function (r) { r.poly([[8, 2], [12, 9], [4, 9]], I_TNT); r.ell(8, 10, 4, 3.8, I_TNT); },
    'status.skull': function (r) { r.ell(8, 7, 5, 4.8, I_LGT); r.rect(5.4, 10, 10.6, 13.4, I_LGT); r.next(); r.ell(6, 7.4, 1.2, 1.3, M_OUT); r.ell(10, 7.4, 1.2, 1.3, M_OUT); r.line(6.6, 12, 9.4, 12, 0.6, M_OUT); },
    'status.sleep': function (r) { r.line(3, 4, 8, 4, 1.2, I_TNT); r.line(8, 4, 3, 10, 1.2, I_TNT); r.line(3, 10, 8, 10, 1.2, I_TNT); r.line(9.5, 9, 13, 9, 1, I_TNT); r.line(13, 9, 9.5, 13, 1, I_TNT); r.line(9.5, 13, 13, 13, 1, I_TNT); },
    'status.spiral': function (r) { var px = 8, py = 8; for (var t = 0; t < 26; t++) { var a = t * 0.5, rr = 0.4 + t * 0.24, x = 8 + Math.cos(a) * rr, y = 8 + Math.sin(a) * rr; r.line(px, py, x, y, 1.1, I_TNT); px = x; py = y; } },
    'status.star': function (r) { var pts = []; for (var k = 0; k < 10; k++) { var a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 2.6 : 6.2; pts.push([8 + Math.cos(a) * rr, 8.5 + Math.sin(a) * rr]); } r.poly(pts, I_TNT); },
    'status.up': function (r) { r.poly([[8, 2], [13.5, 8], [10, 8], [10, 14], [6, 14], [6, 8], [2.5, 8]], I_TNT); },
    'status.down': function (r) { r.poly([[8, 14], [13.5, 8], [10, 8], [10, 2], [6, 2], [6, 8], [2.5, 8]], I_TNT); },
    'status.clock': function (r) { r.ell(8, 8, 5.8, 5.8, I_LGT); r.next(); r.line(8, 8, 8, 4.2, 0.9, M_OUT); r.line(8, 8, 10.8, 9.6, 0.9, M_OUT); r.next(); r.dot(8, 8, I_TNT); },
    'status.heart': function (r) { r.ell(5.6, 6.4, 3, 3, I_TNT); r.ell(10.4, 6.4, 3, 3, I_TNT); r.poly([[2.8, 7.4], [13.2, 7.4], [8, 13.6]], I_TNT); },
    'status.bolt': function (r) { r.poly([[9.5, 1.8], [4, 9], [7.6, 9], [6.2, 14.2], [12, 6.6], [8.4, 6.6]], I_TNT); },
    'status.flame': function (r) { r.ell(8, 10, 4.6, 4.2, I_TNT); r.poly([[3.6, 9.6], [12.4, 9.6], [9, 1.8], [7.6, 5.6], [6, 3.8]], I_TNT); r.next(); r.ell(8, 10.8, 2, 2.4, fx(I_TNT, 2)); },
    'status.leaf': function (r) { r.poly([[3, 13], [4, 6], [9, 2.6], [13.4, 3], [12, 9], [6, 12]], I_TNT); r.next(); r.line(3.6, 12.4, 11, 4.4, 0.7, fx(I_TNT, 0)); },
    'status.eye': function (r) { r.poly([[1.8, 8], [5, 4.6], [11, 4.6], [14.2, 8], [11, 11.4], [5, 11.4]], I_LGT); r.next(); r.ell(8, 8, 2.6, 2.6, I_TNT); r.dot(8, 8, M_OUT); },
    'status.chain': function (r) { r.ell(5.6, 8, 3.4, 2.4, I_MET); r.ell(10.4, 8, 3.4, 2.4, I_MET); r.next(); r.ell(5.6, 8, 1.6, 0.9, 0); r.ell(10.4, 8, 1.6, 0.9, 0); }
  };
  function icon(glyph, N) {
    var r = new Ras(N, N, N / 16), g = ICON[glyph] || ICON.gem;
    g(r);
    // A zero code erases (rings and links are hollow); erased pixels must not count as filled.
    return { w: N, h: N, ax: N >> 1, ay: N >> 1, idx: resolve(r, shadeAndOutline(r, true), 'metal') };
  }

  // ---------------------------------------------------------------- composing a sprite
  // spec: {layout, rig, size, proportions, accent, seed, layers: [{layer, gen: {shape, params}} | {layer, px}]}
  // poseKey is a POSES key; dir is down, up, right, or left (left mirrors right). Returns {w, h, ax, ay, idx}.
  function compose(spec, poseKey, dir) {
    if (dir === 'left') { var f = compose(spec, poseKey, 'right'); return { w: f.w, h: f.h, ax: f.w - 1 - f.ax, ay: f.ay, idx: mirror(f.idx, f.w, f.h) }; }
    var T = clamp(Math.round(spec.size || 16), 4, 128), layers = spec.layers || [], pose = poseOf(spec, poseKey);
    if (pose.lie && spec.layout !== 'enemy') return lieDown(spec, pose, dir);
    if (spec.layout === 'enemy') {
      var N = T * 2, r = new Ras(N, N, N / 32), rnd = rng(spec.seed || 1);
      layers.forEach(function (L) {
        if (L.px) blit(r, L.px, poseKey, 'right');
        else { var g = ENEMY[(L.gen.shape || '').replace('enemy.', '')]; if (g) g(r, Object.assign(clone(RIG_PARAMS[(L.gen.shape || '').replace('enemy.', '')] || {}), L.gen.params || {}), rnd); }
        r.next();
      });
      return { w: N, h: N, ax: N >> 1, ay: N - 2, idx: resolve(r, shadeAndOutline(r, true), 'clothB') };
    }
    var fp = framePx(T, spec.proportions, spec.wide), s = T / 16, Wu = fp.w / s, Hu = fp.h / s;
    var byLayer = {};
    layers.forEach(function (L) { byLayer[L.layer] = L; });
    var body = byLayer.body && byLayer.body.gen && byLayer.body.gen.params ? byLayer.body.gen.params.plan : 'average';
    var J = skeleton(body, spec.proportions, pose, dir === 'up' ? 'up' : dir, Wu, Hu);
    var r2 = new Ras(fp.w, fp.h, s), order = ORDER[dir] || ORDER.down;
    if (spec.shadow !== false && !byLayer.shadow) byLayer.shadow = { layer: 'shadow', gen: { shape: 'shadow.ground', params: {} } };
    order.forEach(function (name) {
      var L = byLayer[name];
      if (!L) return;
      if (L.px) blit(r2, L.px, poseKey, dir);
      else { var g = HUMANOID[L.gen && L.gen.shape]; if (g) g(r2, J, L.gen.params || {}); }
      r2.next();
    });
    return { w: fp.w, h: fp.h, ax: Math.round(J.cx * s), ay: Math.min(fp.h - 1, Math.round(J.footY * s)), idx: resolve(r2, shadeAndOutline(r2, true), spec.accent) };
  }
  // A pose key resolves through the spec's own pose table (sprite and project overrides) over the engine defaults; a
  // pose may also be passed as an object. Unknown keys fall back to stand.
  function poseOf(spec, key) {
    if (key && typeof key === 'object') return Object.assign({ legs: [0, 0], arms: [0, 0] }, key);
    var own = spec && spec.poses && spec.poses[key], base = POSES[key] || (own && own.base && POSES[own.base]) || POSES.stand;
    if (!own) return base;
    var out = Object.assign({}, base, own);
    out.legs = own.legs || base.legs || [0, 0]; out.arms = own.arms || base.arms || [0, 0];
    return out;
  }
  // Lying down: compose the figure standing with limp limbs and no ground shadow, turn it a quarter turn so the head
  // points behind, and rest it on the bottom row. Rotation is exact, so outlines and shading survive.
  function lieDown(spec, pose, dir) {
    var flat = Object.assign({}, pose, { lie: false, crouch: 0, bob: 0, kneel: false, sit: false, ready: false, wpn: 160, reach: [[0.05, 0.95], [0.1, 0.95]] });
    var d = dir === 'up' || dir === 'down' ? 'right' : dir;
    // Composed one tile wide even for battle sprites: rotating a two tile battle frame would make a tall frame.
    var f = compose(Object.assign({}, spec, { shadow: false, poses: null, wide: false }), flat, d === 'left' ? 'right' : d);
    var W = f.h, H = f.w, out = new Uint8Array(W * H), last = 0;
    for (var y = 0; y < f.h; y++) for (var x = 0; x < f.w; x++) {
      var v = f.idx[y * f.w + x];
      if (!v) continue;
      var X = y, Y = f.w - 1 - x;
      out[Y * W + X] = v;
      if (Y > last) last = Y;
    }
    // Drop the figure so its lowest pixel sits on the frame's bottom row (the ground line).
    var drop = H - 1 - last;
    if (drop > 0) { var sh = new Uint8Array(W * H); for (var i = 0; i < W * (H - drop); i++) sh[i + W * drop] = out[i]; out = sh; }
    var res = { w: W, h: H, ax: W >> 1, ay: H - 1, idx: out };
    if (dir === 'left') res.idx = mirror(res.idx, W, H);
    return res;
  }
  // A hand drawn part: variants keyed "<pose>.<dir>" (or "<dir>", or "*"), each {w, h, d} in local slots at the part's
  // base size. Variants at another size are resampled with nearest neighbor, which the editor warns about.
  function pickVariant(px, poseKey, dir) {
    var v = px && px.variants || {};
    return v[poseKey + '.' + dir] || v['stand.' + dir] || v[dir] || v['*'] || null;
  }
  function blit(r, px, poseKey, dir) {
    var v = pickVariant(px, poseKey, dir === 'left' ? 'right' : dir);
    if (!v) return;
    var a;
    try { a = decodePx(v.d, v.w, v.h); } catch (e) { return; }
    a = fit(a, v.w, v.h, r.w, r.h);
    for (var i = 0; i < a.length; i++) if (a[i]) { r.c[i] = slotCell(a[i]); r.l[i] = r.layer; }
  }
  // Just one layer rasterized alone and resolved to slots: what "draw a part by hand" starts from.
  function partFrame(spec, layerName, poseKey, dir) {
    var only = (spec.layers || []).filter(function (L) { return L.layer === layerName || L.layer === 'body'; });
    var full = compose(Object.assign({}, spec, { layers: only, shadow: false }), poseKey, dir);
    if (layerName === 'body') return full;
    var base = compose(Object.assign({}, spec, { layers: only.filter(function (L) { return L.layer === 'body'; }), shadow: false }), poseKey, dir);
    var out = new Uint8Array(full.idx.length);
    for (var i = 0; i < out.length; i++) out[i] = full.idx[i] !== base.idx[i] ? full.idx[i] : 0;
    return { w: full.w, h: full.h, ax: full.ax, ay: full.ay, idx: out };
  }

  // ---------------------------------------------------------------- records to specs (pure; art is bundle.art)
  function recs(art, p) { return art && art.records && art.records[p] && typeof art.records[p] === 'object' ? art.records[p] : {}; }
  function rec(art, id) { var p = typeof id === 'string' ? id.slice(0, 4) : ''; return recs(art, p)[id] || null; }
  // A tier family sprite shares its base sprite's recipe and overrides and keeps its own palette.
  function baseSprite(art, spr) {
    var seen = {}, s = spr;
    while (s && s.shares && !seen[s.id]) { seen[s.id] = 1; s = rec(art, s.shares); }
    return s || spr;
  }
  // Optional poses a project adds to its taxonomy: entries {key, label, required: false, pose: {base, ...params}}.
  function artPoses(art) {
    var out = {}, tax = art && art.poseTaxonomy;
    if (!tax || typeof tax !== 'object') return out;
    Object.keys(tax).forEach(function (g) { (Array.isArray(tax[g]) ? tax[g] : []).forEach(function (e) { if (e && e.key && e.pose && typeof e.pose === 'object') out[e.key] = e.pose; }); });
    return out;
  }
  function spriteSpec(art, spr, size) {
    var b = baseSprite(art, spr), rc = b && b.recipe || {}, parts = rc.parts || {}, layers = [];
    Object.keys(parts).forEach(function (layer) {
      var pid = parts[layer];
      if (!pid) return;
      var p = rec(art, pid);
      if (!p) return;
      if (p.px && p.px.variants && Object.keys(p.px.variants).length) layers.push({ layer: layer, px: p.px });
      else if (p.gen) layers.push({ layer: layer, gen: { shape: p.gen.shape, params: Object.assign({}, p.gen.params || {}, (rc.params && rc.params[layer]) || {}) } });
    });
    var cw = rc.colorway || {};
    var poses = Object.assign({}, artPoses(art), b && b.poses || {}, spr !== b && spr.poses || {});
    return { poses: poses, layout: spr.kind === 'enemy' ? 'enemy' : 'humanoid', rig: rc.rig || 'humanoid', size: size, proportions: rc.proportions || {}, accent: rc.accent || cw.accent || 'clothB', seed: b.seed, layers: layers, shadow: spr.mode !== 'battle', wide: spr.mode === 'battle' && spr.kind !== 'enemy' };
  }
  // The frame with any hand edited override applied. Overrides are keyed "<pose>.<dir>" and stored at the size they
  // were drawn; left falls back to mirroring right.
  function spriteFrame(art, spr, poseKey, dir, size, accentOverride) {
    // Overrides on the sprite itself win over the ones it inherits from a shared base.
    var b = baseSprite(art, spr), ov = Object.assign({}, b && b.overrides || {}, spr && spr !== b && spr.overrides || {});
    var key = poseKey + '.' + dir, o = ov[key];
    var spec = spriteSpec(art, spr, size);
    if (accentOverride) spec.accent = accentOverride;
    if (!o && dir === 'left' && ov[poseKey + '.right']) { var f = spriteFrame(art, spr, poseKey, 'right', size, accentOverride); return { w: f.w, h: f.h, ax: f.w - 1 - f.ax, ay: f.ay, idx: mirror(f.idx, f.w, f.h), override: f.override }; }
    var g = compose(spec, poseKey, dir);
    if (o) {
      try {
        var a = decodePx(o.d, o.w, o.h);
        a = fit(a, o.w, o.h, g.w, g.h);
        return { w: g.w, h: g.h, ax: g.ax, ay: g.ay, idx: a, override: true, resampled: o.h !== g.h || o.w > g.w };
      } catch (e) { g.badOverride = e.message; }
    }
    return g;
  }
  function portraitFrame(art, por, expr, size) {
    var ov = por && por.overrides || {}, o = ov[expr], P = por && por.size || portraitSize(size);
    var e = Object.assign({}, EXPRESSIONS[expr] || EXPRESSIONS.neutral, (por && por.expressions && por.expressions[expr]) || {});
    var g = portrait(por && por.recipe, e, P);
    if (o) { try { var a = decodePx(o.d, o.w, o.h); if (o.w !== P || o.h !== P) a = resample(a, o.w, o.h, P, P); return { w: P, h: P, ax: g.ax, ay: g.ay, idx: a, override: true }; } catch (e2) { g.badOverride = e2.message; } }
    return g;
  }
  function iconFrame(art, ico, size) {
    var N = ico && ico.size || iconSize(size);
    if (ico && ico.px && ico.px.d) { try { var a = decodePx(ico.px.d, ico.px.w, ico.px.h); if (ico.px.w !== N || ico.px.h !== N) a = resample(a, ico.px.w, ico.px.h, N, N); return { w: N, h: N, ax: N >> 1, ay: N >> 1, idx: a, override: true }; } catch (e) {} }
    return icon(ico && ico.gen && ico.gen.glyph, N);
  }
  // Local slots to master indices for one record: the sprite's pal_, with an icon's tint ramp swapped into 8 to 10.
  function slotsFor(art, palId, tintRamp) {
    var p = rec(art, palId), s = p && Array.isArray(p.slots) ? p.slots.slice() : null;
    if (s && tintRamp && tintRamp.length === 3) { s[8] = tintRamp[0]; s[9] = tintRamp[1]; s[10] = tintRamp[2]; }
    return s;
  }
  function rgba(idx, slots, entries) {
    var out = new Uint8ClampedArray(idx.length * 4), lut = [];
    for (var k = 0; k < 32; k++) { var m = slots && k ? slots[k] : null, rgb = typeof m === 'number' && entries[m] ? hexToRgb(entries[m]) : null; lut.push(rgb); }
    for (var i = 0; i < idx.length; i++) {
      var c = lut[idx[i]];
      if (!c) continue;
      out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
    }
    return out;
  }

  // ---------------------------------------------------------------- bake cache
  // createCache(art, {size, entries, makeCanvas(w, h), budget}) bakes frames once and keeps them in an LRU capped by an
  // estimate of their memory (index plus RGBA plus canvas). makeCanvas is the host's; without it frames carry RGBA only.
  function lightest(list) { var bi = null, bl = -1; (list || []).forEach(function (h) { var l = hexToLab(h); if (l && l[0] > bl) { bl = l[0]; bi = h; } }); return bi || '#ffffff'; }
  function createCache(art, opts) {
    opts = opts || {};
    var map = new Map(), bytes = 0, cap = opts.budget || 8e6, st = { hits: 0, misses: 0, evictions: 0 };
    function put(k, v) {
      v.bytes = v.w * v.h * (v.canvas ? 9 : 5);
      map.set(k, v); bytes += v.bytes;
      var it = map.keys();
      while (bytes > cap && map.size > 1) { var old = it.next().value; if (old === k) continue; bytes -= map.get(old).bytes; map.delete(old); st.evictions++; }
    }
    function get(k, make) {
      if (map.has(k)) { var v = map.get(k); map.delete(k); map.set(k, v); st.hits++; return v; }
      st.misses++;
      var f = make();
      if (!f) return null;
      if (opts.makeCanvas) {
        var cv = opts.makeCanvas(f.w, f.h), ctx = cv && cv.getContext && cv.getContext('2d');
        if (ctx) { var im = ctx.createImageData(f.w, f.h); im.data.set(f.rgba); ctx.putImageData(im, 0, 0); f.canvas = cv; }
      }
      put(k, f);
      return f;
    }
    var T = opts.size || 16, entries = opts.entries || [];
    function finish(f, slots) { if (!f) return null; f.rgba = rgba(f.idx, slots, entries); return f; }
    return {
      // flags 'flash' bakes the frame's silhouette in the palette's lightest color (the hurt flash).
      sprite: function (sprId, poseKey, dir, palId, flags) {
        var spr = rec(art, sprId);
        if (!spr) return null;
        var pal = palId || spr.pal;
        return get('s|' + sprId + '|' + poseKey + '|' + dir + '|' + pal + (flags ? '|' + flags : ''), function () {
          var f = finish(spriteFrame(art, spr, poseKey, dir, T), slotsFor(art, pal));
          if (f && flags === 'flash') { var c = hexToRgb(lightest(entries)) || [255, 255, 255]; for (var i = 0; i < f.idx.length; i++) if (f.idx[i]) { f.rgba[i * 4] = c[0]; f.rgba[i * 4 + 1] = c[1]; f.rgba[i * 4 + 2] = c[2]; } }
          return f;
        });
      },
      portrait: function (porId, expr) {
        var por = rec(art, porId);
        if (!por) return null;
        return get('p|' + porId + '|' + expr, function () { return finish(portraitFrame(art, por, expr, T), slotsFor(art, por.pal)); });
      },
      icon: function (icoId) {
        var ico = rec(art, icoId);
        if (!ico) return null;
        return get('i|' + icoId, function () { return finish(iconFrame(art, ico, T), slotsFor(art, ico.pal, ico.tintRamp)); });
      },
      invalidate: function (id) { var tag = '|' + id + '|', tail = '|' + id; Array.from(map.keys()).forEach(function (k) { if (k.indexOf(tag) >= 0 || k.slice(-tail.length) === tail) { bytes -= map.get(k).bytes; map.delete(k); } }); },
      size: T, entries: entries, art: art,
      stats: function () { return { entries: map.size, bytes: bytes, budget: cap, hits: st.hits, misses: st.misses, evictions: st.evictions }; },
      clear: function () { map.clear(); bytes = 0; },
      budget: function (n) { if (n > 0) { cap = n; var it = map.keys(); while (bytes > cap && map.size > 1) { var k = it.next().value; bytes -= map.get(k).bytes; map.delete(k); st.evictions++; } } return cap; }
    };
  }

  R.sprite = {
    LAYERS: LAYERS, ORDER: ORDER, POSES: POSES, BODY_PLANS: BODY_PLANS, LIBRARY: LIBRARY, RIGS: RIGS, RIG_PARAMS: RIG_PARAMS,
    GENERATORS: Object.keys(HUMANOID).concat(RIGS.map(function (k) { return 'enemy.' + k; })),
    DIRS: ['down', 'up', 'right', 'left'], FIELD_POSES: ['stand', 'stepA', 'stepB'],
    BATTLE_POSES: ['idle', 'ready', 'step', 'windup', 'attack', 'cast', 'item', 'hurt', 'kneel', 'ko', 'revive', 'victory', 'limit'],
    EMOTE_POSES: ['nod', 'shakeL', 'shakeR', 'crouch', 'jump', 'sit', 'kneel', 'ko', 'laugh', 'laughB'],
    ENEMY_POSES: ['idle', 'attack', 'hurt'], poseOf: poseOf, artPoses: artPoses,
    handPoses: function () {
      var out = [], seen = {};
      function add(p, d) { if (POSES[p] && POSES[p].lie) return; var k = p + '.' + d; if (!seen[k]) { seen[k] = 1; out.push([p, d]); } }
      ['stand', 'stepA', 'stepB'].forEach(function (p) { ['down', 'up', 'right'].forEach(function (d) { add(p, d); }); });
      ['idle', 'ready', 'step', 'windup', 'attack', 'cast', 'item', 'hurt', 'kneel', 'revive', 'victory', 'limit'].forEach(function (p) { add(p, 'right'); });
      ['nod', 'shakeL', 'shakeR', 'crouch', 'jump', 'sit', 'kneel', 'laugh', 'laughB'].forEach(function (p) { add(p, 'down'); });
      return out;
    },
    framePx: framePx, compose: compose, partFrame: partFrame, mirror: mirror, resample: resample, slotCell: slotCell,
    spec: spriteSpec, frame: spriteFrame, base: baseSprite, slotsFor: slotsFor, rgba: rgba
  };
  R.portrait = { EXPRESSIONS: EXPRESSIONS, size: portraitSize, compose: portrait, frame: portraitFrame };
  R.icon = { GLYPHS: GLYPHS, STATUS_SHAPES: STATUS_SHAPES, size: iconSize, compose: icon, frame: iconFrame };
  R.createCache = createCache;

