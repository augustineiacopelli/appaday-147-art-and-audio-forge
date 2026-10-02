  // ================================================================ PHASE 5: INTERFACE KIT AND BATTLE PRESENTER
  // build.js splices this file into ENGINE:RENDER after the tile engine. It reads no host global: records, palettes,
  // contexts, battle snapshots, events, and the cue callback all arrive as arguments. Drawing uses fillRect and
  // drawImage only, at logical resolution; the host scales the logical canvas once per frame.

  // ---------------------------------------------------------------- the font
  // An original 5 by 7 font (cap height 7, one descender row, so 8 rows per glyph) for code points 32 to 126. Each glyph
  // is eight characters of the codec alphabet, one per row, bit 4 the leftmost pixel. A uik_ ui:font record stores the
  // same glyphs as hex rows ({code: 'rrrrrrrrrrrrrrrr'}, two hex digits per row) so a user can redraw any of them.
  var FONT_ROWS = '0000000044444040AAA00000AAVAVAA04FKE5U40OP248J30CIK8LID044800000248884208422248004LEL400044V440000000448' +
    '000V000000000CC011248GG0EHJLPHE04C4444E0EH1248V0U11E11U026AIV220VGU11HE068GUHHE0V1248880EHHEHHE0EHHF12C0' +
    '0CC0CC000CC0C480248G842000V0V00084212480EH124040EHNLNGF04AHHVHH0UHHUHHU0EHGGGHE0SIHHHIS0VGGUGGV0VGGUGGG0' +
    'EHGNHHF0HHHVHHH0E44444E072222IC0HIKOKIH0GGGGGGV0HRLLHHH0HHPLJHH0EHHHHHE0UHHUGGG0EHHHLID0UHHUKIH0FGGE11U0' +
    'V4444440HHHHHHE0HHHHHA40HHHLLLA0HHA4AHH0HHA44440V1248GV0E88888E0GG842110E22222E04AH000000000000V84200000' +
    '00E1FHF0GGUHHHU000EGGHE011FHHHF000EHVGE0698S888000FHHF1EGGUHHHH040C444E0206222ICGGIKOKI0C44444E000QLLLL0' +
    '00UHHHH000EHHHE000UHHUGG00FHHF1100MPGGG000FGE1U088S8896000HHHJD000HHHA4000HHLLA000HA4AH000HHHF1E00V248V0' +
    '344O443044444440O44344O0008L2000';
  var B32 = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
  function defaultGlyphs() {
    var out = {};
    for (var c = 32; c <= 126; c++) {
      var s = FONT_ROWS.substr((c - 32) * 8, 8), hex = '';
      for (var r = 0; r < 8; r++) { var v = B32.indexOf(s.charAt(r)); hex += (v < 16 ? '0' : '') + Math.max(0, v).toString(16); }
      out[c] = hex;
    }
    return out;
  }
  var DEFAULT_FONT = { w: 5, h: 7, rows: 8, advance: 6, line: 10, glyphs: defaultGlyphs() };
  // fontOf(record or null) -> {w, h, rows, advance, line, bits: {code: [row ints]}}. Memoized by content, so an edited
  // glyph redraws at once and an unchanged record parses once.
  var fontMemo = {}, fontMemoKeys = [], defaultFontObj = null;
  function parseFont(src) {
    var w = clamp(Math.round(Number(src.w) || 5), 1, 8), rows = clamp(Math.round(Number(src.rows) || 8), 1, 16);
    var f = { w: w, h: clamp(Math.round(Number(src.h) || 7), 1, rows), rows: rows, advance: clamp(Math.round(Number(src.advance) || w + 1), 1, 16), line: clamp(Math.round(Number(src.line) || rows + 2), rows, 32), bits: {} };
    var g = src.glyphs && typeof src.glyphs === 'object' ? src.glyphs : {};
    Object.keys(g).forEach(function (k) {
      var hex = String(g[k] || ''), list = [];
      for (var r = 0; r < rows; r++) { var v = parseInt(hex.substr(r * 2, 2), 16); list.push(isFinite(v) ? v & ((1 << w) - 1) : 0); }
      f.bits[Number(k)] = list;
    });
    return f;
  }
  function fontOf(rec0) {
    if (!rec0 || !rec0.glyphs) { if (!defaultFontObj) defaultFontObj = parseFont(DEFAULT_FONT); return defaultFontObj; }
    var key = [rec0.w, rec0.h, rec0.rows, rec0.advance, rec0.line, JSON.stringify(rec0.glyphs)].join('|');
    if (fontMemo[key]) return fontMemo[key];
    var f = parseFont(rec0);
    fontMemo[key] = f; fontMemoKeys.push(key);
    if (fontMemoKeys.length > 8) delete fontMemo[fontMemoKeys.shift()];
    return f;
  }
  function glyphBits(font, code) { return font.bits[code] || font.bits[63] || null; }
  function measure(font, str, scale) {
    font = font && font.bits ? font : fontOf(font);
    var s = String(str == null ? '' : str), k = Math.max(1, Math.round(scale || 1));
    return s.length ? (s.length * font.advance - (font.advance - font.w)) * k : 0;
  }
  // text(ctx, font, str, x, y, {color, shadow, scale, align: left|center|right}) draws runs of lit pixels as single rects.
  function drawText(ctx, font, str, x, y, opts) {
    opts = opts || {};
    font = font && font.bits ? font : fontOf(font);
    var s = String(str == null ? '' : str), k = Math.max(1, Math.round(opts.scale || 1));
    if (opts.align === 'center') x -= Math.floor(measure(font, s, k) / 2);
    else if (opts.align === 'right') x -= measure(font, s, k);
    x = Math.round(x); y = Math.round(y);
    function pass(dx, dy, color) {
      ctx.fillStyle = color;
      for (var i = 0; i < s.length; i++) {
        var bits = glyphBits(font, s.charCodeAt(i));
        if (!bits) continue;
        var gx = x + i * font.advance * k + dx;
        for (var r = 0; r < bits.length; r++) {
          var row = bits[r], c = 0;
          while (c < font.w) {
            if (!(row & (1 << (font.w - 1 - c)))) { c++; continue; }
            var c0 = c;
            while (c < font.w && (row & (1 << (font.w - 1 - c)))) c++;
            ctx.fillRect(gx + c0 * k, y + r * k + dy, (c - c0) * k, k);
          }
        }
      }
    }
    if (opts.shadow) pass(k, k, opts.shadow);
    if (opts.outline) [[-k, 0], [k, 0], [0, -k], [0, k], [-k, -k], [k, -k], [-k, k], [k, k]].forEach(function (d) { pass(d[0], d[1], opts.outline); });
    pass(0, 0, opts.color || '#ffffff');
    return measure(font, s, k);
  }
  // Greedy word wrap to a pixel width.
  function wrapText(font, str, maxW, scale) {
    font = font && font.bits ? font : fontOf(font);
    var words = String(str == null ? '' : str).split(/\s+/).filter(Boolean), lines = [], line = '';
    words.forEach(function (wd) {
      var t = line ? line + ' ' + wd : wd;
      if (!line || measure(font, t, scale) <= maxW) line = t;
      else { lines.push(line); line = wd; }
    });
    if (line) lines.push(line);
    return lines;
  }

  // ---------------------------------------------------------------- colors from records
  // A color field is {hex, m}: m is a master index (wins when the palette has it), hex the source it was fitted from.
  function colOf(o, entries, fb) {
    if (o && typeof o.m === 'number' && entries && entries[o.m]) return entries[o.m];
    var h = o && normHex(o.hex);
    return h || fb;
  }

  // ---------------------------------------------------------------- windows
  // ui:window {gradient: {top, bottom}, border, light, corner: square|round|notch, thickness: 1|2, alpha, open {ms, style}}
  var WIN_CORNERS = ['square', 'round', 'notch'];
  var OPEN_STYLES = ['grow', 'fade', 'none'];
  function drawWindow(ctx, uik, x, y, w, h, opts) {
    opts = opts || {};
    var ent = opts.entries || [], u = Math.max(1, Math.round(opts.unit || 1)), win = uik || {};
    var open = opts.open == null ? 1 : clamp(Number(opts.open) || 0, 0, 1), st = win.open && win.open.style || 'grow';
    if (open <= 0) return null;
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (open < 1 && st === 'grow') { var nh = Math.max(4 * u, Math.round(h * open)); y += Math.round((h - nh) / 2); h = nh; }
    var alpha = clamp(win.alpha == null ? 1 : Number(win.alpha), 0.2, 1) * (open < 1 && st === 'fade' ? open : 1);
    var top = colOf(win.gradient && win.gradient.top, ent, '#2848a8'), bot = colOf(win.gradient && win.gradient.bottom, ent, '#101850');
    var bd = colOf(win.border, ent, '#000000'), li = colOf(win.light, ent, '#e8e8f0'), th = clamp(Math.round(Number(win.thickness) || 1), 1, 3) * u;
    var corner = WIN_CORNERS.indexOf(win.corner) >= 0 ? win.corner : 'round', cut = corner === 'round' ? u : corner === 'notch' ? 2 * u : 0;
    ctx.globalAlpha = alpha;
    // body: top color, a two row checker dither, then the bottom color
    var bx = x + u + th, by = y + u + th, bw = w - 2 * (u + th), bh = h - 2 * (u + th);
    if (bw > 0 && bh > 0) {
      var mid = by + Math.round(bh * 0.5);
      ctx.fillStyle = top; ctx.fillRect(bx, by, bw, Math.max(0, mid - by));
      ctx.fillStyle = bot; ctx.fillRect(bx, mid, bw, by + bh - mid);
      ctx.fillStyle = top;
      for (var dy = mid; dy < Math.min(by + bh, mid + 2 * u); dy += u) for (var dx = bx + (((dy - mid) / u) & 1) * u; dx < bx + bw; dx += 2 * u) ctx.fillRect(dx, dy, u, u);
      ctx.fillStyle = bot;
      for (var dy2 = mid - 2 * u; dy2 < mid; dy2 += u) if (dy2 >= by) for (var dx2 = bx + (((dy2 - mid) / u) & 1) * u; dx2 < bx + bw; dx2 += 2 * u) ctx.fillRect(dx2, dy2, u, u);
    }
    // frame: the outer dark line, then the light border, with the chosen corner
    function frame(x0, y0, w0, h0, s, color, c) {
      ctx.fillStyle = color;
      ctx.fillRect(x0 + c, y0, w0 - 2 * c, s); ctx.fillRect(x0 + c, y0 + h0 - s, w0 - 2 * c, s);
      ctx.fillRect(x0, y0 + c, s, h0 - 2 * c); ctx.fillRect(x0 + w0 - s, y0 + c, s, h0 - 2 * c);
      if (c > s) { ctx.fillRect(x0 + s, y0 + s, c - s, c - s); ctx.fillRect(x0 + w0 - c, y0 + s, c - s, c - s); ctx.fillRect(x0 + s, y0 + h0 - c, c - s, c - s); ctx.fillRect(x0 + w0 - c, y0 + h0 - c, c - s, c - s); }
    }
    frame(x, y, w, h, u, bd, cut);
    frame(x + u, y + u, w - 2 * u, h - 2 * u, th, li, Math.max(0, cut - u));
    ctx.globalAlpha = 1;
    return { x: x, y: y, w: w, h: h, inner: { x: bx + u, y: by + u, w: bw - 2 * u, h: bh - 2 * u } };
  }

  // ---------------------------------------------------------------- cursor
  // ui:cursor {style: triangle|hand|diamond|bar, fill, outline, light, bob: {amp, ms}}. x, y is the point the cursor aims
  // at; the cursor sits to its left and bobs horizontally.
  var CURSOR_SHAPES = {
    triangle: { rows: ['oo....', 'olo...', 'olfo..', 'offfo.', 'offffo', 'offfo.', 'offo..', 'ofo...', 'oo....'], tip: [5, 4] },
    hand: { rows: ['..oooo....', '.ollffoooo', 'olffffllfo', 'offfffoooo', 'offffo....', '.offo.....', '..oo......'], tip: [9, 2] },
    diamond: { rows: ['...o...', '..olo..', '.olffo.', 'offfffo', '.offfo.', '..ofo..', '...o...'], tip: [6, 3] },
    bar: { rows: ['oo', 'lo', 'fo', 'fo', 'fo', 'fo', 'oo'], tip: [1, 3] }
  };
  function drawCursor(ctx, uik, x, y, tMs, opts) {
    opts = opts || {};
    var c = uik || {}, ent = opts.entries || [], u = Math.max(1, Math.round(opts.unit || 1)), sh = CURSOR_SHAPES[c.style] || CURSOR_SHAPES.triangle;
    var bob = c.bob || {}, amp = clamp(Number(bob.amp == null ? 2 : bob.amp), 0, 8), ms = clamp(Number(bob.ms) || 600, 100, 4000);
    var off = Math.round(-Math.abs(Math.sin((Number(tMs) || 0) / ms * Math.PI)) * amp) * u;
    var cols = { o: colOf(c.outline, ent, '#101010'), f: colOf(c.fill, ent, '#f0f0f0'), l: colOf(c.light, ent, '#ffffff') };
    var x0 = Math.round(x - (sh.tip[0] + 2) * u + off), y0 = Math.round(y - sh.tip[1] * u);
    ['o', 'f', 'l'].forEach(function (k) {
      ctx.fillStyle = cols[k];
      sh.rows.forEach(function (row, r) { for (var i = 0; i < row.length; i++) if (row.charAt(i) === k) ctx.fillRect(x0 + i * u, y0 + r * u, u, u); });
    });
    return { x: x0, y: y0, w: sh.rows[0].length * u, h: sh.rows.length * u };
  }

  // ---------------------------------------------------------------- gauges and popups
  function drawGauge(ctx, x, y, w, h, frac, colors) {
    colors = colors || {};
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    ctx.fillStyle = colors.back || '#101018'; ctx.fillRect(x, y, w, h);
    var f = Math.round((w - 2) * clamp(Number(frac) || 0, 0, 1));
    if (f > 0) { ctx.fillStyle = colors.fill || '#e8c040'; ctx.fillRect(x + 1, y + 1, f, h - 2); if (colors.light && h > 3) { ctx.fillStyle = colors.light; ctx.fillRect(x + 1, y + 1, f, 1); } }
  }
  // A number or word popping from a point: bounces for 240 ms, holds, fades over its last 150 ms.
  var POPUP_MS = 600;
  function popupOffset(age, u) {
    if (age < 240) return -Math.round(Math.sin(age / 240 * Math.PI) * 6 * u);
    return 0;
  }

  // ---------------------------------------------------------------- touch skin
  // ui:touch {scheme (null reads the Charter), shape: round|square, opacity, size, color, ink, labels {a, b, menu}}.
  // layout(scheme, w, h, skin) -> {scheme, controls: [{key, kind: dpad|stick|button|area, x, y, r, label}]}, all in
  // logical pixels. hit(layout, x, y) -> {key, dir, vx, vy} or null. draw(ctx, layout, skin, {pressed, entries, font}).
  var SCHEMES = ['dpad', 'stick', 'tap', 'hybrid'];
  function touchLayout(scheme, w, h, skin) {
    skin = skin || {};
    scheme = SCHEMES.indexOf(scheme) >= 0 ? scheme : 'dpad';
    var s = clamp(Math.round(Number(skin.size) || Math.min(w, h) * 0.2), 12, Math.round(Math.min(w, h) * 0.45));
    var r = Math.round(s / 2), m = Math.max(3, Math.round(s * 0.18)), labels = skin.labels || {};
    var out = [], br = Math.max(6, Math.round(r * 0.55)), cy = h - m - r;
    if (scheme === 'tap' || scheme === 'hybrid') out.push({ key: 'tap', kind: 'area', x: 0, y: 0, w: w, h: h });
    if (scheme === 'dpad') out.push({ key: 'dpad', kind: 'dpad', x: m + r, y: cy, r: r });
    if (scheme === 'stick' || scheme === 'hybrid') out.push({ key: 'stick', kind: 'stick', x: m + r, y: cy, r: r });
    if (scheme !== 'tap') {
      out.push({ key: 'a', kind: 'button', x: w - m - br, y: cy - Math.round(br * 0.6), r: br, label: String(labels.a || 'A').slice(0, 2) });
      out.push({ key: 'b', kind: 'button', x: w - m - br * 3 - 2, y: cy + Math.round(br * 0.6), r: br, label: String(labels.b || 'B').slice(0, 2) });
    }
    var mr = Math.max(5, Math.round(br * 0.6));
    out.push({ key: 'menu', kind: 'button', x: w - m - mr, y: m + mr, r: mr, label: String(labels.menu || '=').slice(0, 2), small: true });
    return { scheme: scheme, w: w, h: h, size: s, controls: out };
  }
  function touchHit(layout, x, y) {
    if (!layout) return null;
    var list = layout.controls, area = null;
    for (var i = list.length - 1; i >= 0; i--) {
      var c = list[i];
      if (c.kind === 'area') { area = c; continue; }
      var dx = x - c.x, dy = y - c.y, d = Math.sqrt(dx * dx + dy * dy), reach = c.kind === 'button' ? c.r * 1.25 : c.r * 1.35;
      if (d > reach) continue;
      if (c.kind === 'button') return { key: c.key };
      var dead = c.r * 0.22;
      if (d < dead) return { key: c.key, dir: null, vx: 0, vy: 0 };
      var dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      return { key: c.key, dir: dir, vx: clamp(dx / c.r, -1, 1), vy: clamp(dy / c.r, -1, 1) };
    }
    return area ? { key: 'tap', x: x, y: y } : null;
  }
  function disc(ctx, cx, cy, r, round) {
    cx = Math.round(cx); cy = Math.round(cy); r = Math.max(1, Math.round(r));
    if (!round) { ctx.fillRect(cx - r, cy - r, 2 * r + 1, 2 * r + 1); return; }
    for (var dy = -r; dy <= r; dy++) { var half = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.8)); ctx.fillRect(cx - half, cy + dy, 2 * half + 1, 1); }
  }
  function drawTouch(ctx, layout, skin, opts) {
    if (!layout) return;
    skin = skin || {}; opts = opts || {};
    var ent = opts.entries || [], round = skin.shape !== 'square', a = clamp(skin.opacity == null ? 0.55 : Number(skin.opacity), 0.1, 1);
    var col = colOf(skin.color, ent, '#d8d8e0'), ink = colOf(skin.ink, ent, '#202028'), pressed = opts.pressed || {}, font = opts.font ? fontOf(opts.font) : fontOf(null);
    layout.controls.forEach(function (c) {
      if (c.kind === 'area') return;
      var on = pressed[c.key] != null && pressed[c.key] !== false;
      ctx.globalAlpha = a * (on ? 1 : 0.8);
      if (c.kind === 'dpad') {
        var arm = Math.max(3, Math.round(c.r * 0.38));
        ctx.fillStyle = ink; disc(ctx, c.x, c.y, c.r, round);
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(c.x - arm), Math.round(c.y - c.r + 2), 2 * arm, 2 * c.r - 3);
        ctx.fillRect(Math.round(c.x - c.r + 2), Math.round(c.y - arm), 2 * c.r - 3, 2 * arm);
        var dirOn = on ? pressed[c.key] : null;
        if (dirOn && typeof dirOn === 'string') {
          var d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dirOn];
          if (d) { ctx.fillStyle = ink; ctx.globalAlpha = a; ctx.fillRect(Math.round(c.x + d[0] * c.r * 0.6 - arm / 2), Math.round(c.y + d[1] * c.r * 0.6 - arm / 2), arm, arm); }
        }
      } else if (c.kind === 'stick') {
        ctx.fillStyle = ink; disc(ctx, c.x, c.y, c.r, round);
        ctx.fillStyle = col; ctx.globalAlpha = a * 0.5; disc(ctx, c.x, c.y, c.r - 2, round);
        var v = on && typeof pressed[c.key] === 'object' ? pressed[c.key] : { vx: 0, vy: 0 };
        ctx.globalAlpha = a; ctx.fillStyle = col; disc(ctx, c.x + (v.vx || 0) * c.r * 0.5, c.y + (v.vy || 0) * c.r * 0.5, Math.round(c.r * 0.45), round);
      } else {
        ctx.fillStyle = on ? col : ink; disc(ctx, c.x, c.y, c.r, round);
        ctx.fillStyle = on ? ink : col; disc(ctx, c.x, c.y, c.r - 1, round);
        ctx.globalAlpha = 1;
        drawText(ctx, font, c.label || '', c.x, c.y - Math.floor(font.h / 2), { color: on ? col : ink, align: 'center' });
      }
    });
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- title screen
  // ui:title {text (null reads the Charter title), style: outline|shadow|plain, scale, color, shadow, layout:
  // center|upper|lower, bg (bgd_ id), prompt, credit}. Draws the background, the logo, a blinking prompt, and a credit.
  var TITLE_STYLES = ['outline', 'shadow', 'plain'];
  var TITLE_LAYOUTS = ['center', 'upper', 'lower'];
  function drawTitle(ctx, uik, opts) {
    opts = opts || {};
    var t = uik || {}, ent = opts.entries || [], w = opts.w || 256, h = opts.h || 224, u = Math.max(1, Math.round(opts.unit || 1)), tMs = Number(opts.tMs) || 0;
    var font = fontOf(opts.font || null), bgd = opts.bgd || null;
    if (bgd) bgDraw(ctx, bgd, tMs, w, h, { entries: ent }); else { ctx.fillStyle = colOf(t.shadow, ent, '#080810'); ctx.fillRect(0, 0, w, h); }
    var text = String(t.text || opts.text || 'Untitled'), k = clamp(Math.round(Number(t.scale) || 3), 1, 8) * u;
    var lines = wrapText(font, text, w - 16 * u, k);
    while (lines.length > 3 && k > u) { k -= u; lines = wrapText(font, text, w - 16 * u, k); }
    var lh = font.line * k, blockH = lines.length * lh, lay = TITLE_LAYOUTS.indexOf(t.layout) >= 0 ? t.layout : 'center';
    var y0 = lay === 'upper' ? Math.round(h * 0.16) : lay === 'lower' ? Math.round(h * 0.62 - blockH) : Math.round(h * 0.42 - blockH / 2);
    var main = colOf(t.color, ent, '#f0d070'), shade = colOf(t.shadow, ent, '#201008'), style = TITLE_STYLES.indexOf(t.style) >= 0 ? t.style : 'outline';
    lines.forEach(function (ln, i) {
      var o = { color: main, scale: k, align: 'center' };
      if (style === 'outline') { o.outline = shade; o.shadow = shade; } else if (style === 'shadow') o.shadow = shade;
      drawText(ctx, font, ln, w / 2, y0 + i * lh, o);
    });
    var prompt = t.prompt == null ? 'Press Start' : String(t.prompt);
    if (prompt && Math.floor(tMs / 520) % 2 === 0) drawText(ctx, font, prompt, w / 2, Math.round(h * 0.76), { color: colOf(t.light, ent, '#ffffff'), shadow: shade, scale: u, align: 'center' });
    if (t.credit) drawText(ctx, font, String(t.credit), w / 2, h - (font.line + 2) * u, { color: colOf(t.light, ent, '#c0c0c0'), shadow: shade, scale: u, align: 'center' });
    return { lines: lines.length, scale: k };
  }

  // ---------------------------------------------------------------- the battle presenter
  // createPresenter(cfg) turns ENGINE_BATTLE events into timed beats on a logical canvas. cfg:
  //   {art, cache, ctx, w, h, snapshot (the init state, deep copied, read once), pacing: wait|active, cue(kind, id, opts),
  //    layout: {partySide: right|left}, entries, bgd, wov, ui: {window, font, cursor} (uik_ records), seed, speed,
  //    names: {abl id: name}, icons: {sta id: ico id}}
  // Returns {feed(events, state), update(dtMs), draw(), isIdle(), backlog(), targets(), display(), setPacing(mode),
  //   setSpeed(k), setCursor(uid or null), setMessage(text), stats(), beats()}.
  // The presenter's look is a pure function of the snapshot, the fed events and states, and the dt sequence: beat
  // timing never reaches the engine, so a replay renders identically.
  var BACKLOG_MS = 2000;
  var BASE_KEYS = { 'battle.idle': 1, 'battle.kneel': 1, 'battle.ready': 1, 'battle.victory': 1, 'enemy.idle': 1 };
  var BEAT_MS = { ready: 160, command: 120, status: 300, limitReady: 500, revive: 760, message: 700, result: 420, end: 1400 };
  function createPresenter(cfg) {
    cfg = cfg || {};
    var art = cfg.art || { records: {} }, cache = cfg.cache, ctx = cfg.ctx, W = cfg.w || 256, H = cfg.h || 224, ent = cfg.entries || (cache && cache.entries) || [];
    var u = Math.max(1, Math.round((cache && cache.size || 16) / 16)), cue = typeof cfg.cue === 'function' ? cfg.cue : function () {};
    var uiRec = cfg.ui || {}, font = fontOf(uiRec.font || null), side = (cfg.layout && cfg.layout.partySide) === 'left' ? 'left' : 'right';
    var snap = JSON.parse(JSON.stringify(cfg.snapshot || { units: [] })), db = snap.db || {};
    var pacing = cfg.pacing === 'active' ? 'active' : 'wait', speedK = Math.max(0.25, Number(cfg.speed) || 1), seed = (cfg.seed >>> 0) || 1;
    var fieldH = Math.round(H * 0.64), hudY = fieldH, now = 0, queue = [], popups = [], cursor = null, message = null, banner = null, ended = null;
    var weather = cfg.wov ? weatherCreate(cfg.wov, W, fieldH, seed, { entries: ent, unit: u }) : null, pb = null, pbBeat = null, flashScreen = 0;
    var stats = { beats: 0, events: 0, hits: 0, popups: 0, compressed: 0, cues: 0 };
    var A = {}, order = [];

    // ---- sprites and animations from the art namespace
    function findSpr(kind, ref) {
      var all = recs(art, 'spr_'), ks = Object.keys(all);
      for (var i = 0; i < ks.length; i++) { var s = all[ks[i]]; if (s && s.subject && s.subject.kind === kind && s.subject.ref === ref && s.mode === 'battle') return s; }
      return null;
    }
    function bySubject(p, kind, ref) {
      var all = recs(art, p), ks = Object.keys(all);
      for (var i = 0; i < ks.length; i++) { var r = all[ks[i]]; if (r && r.subject && r.subject.kind === kind && r.subject.ref === ref) return r; }
      return null;
    }
    function animKey(a, key) { return a.spr ? animFor(art, a.spr, key) : bySubject('anm_', 'role', 'anim:' + key); }
    function frameOf(a, pose) { return a.spr && cache ? cache.sprite(a.spr.id, pose || 'idle', a.dir) : null; }

    // ---- actors from the snapshot
    (snap.units || []).forEach(function (un) {
      var party = un.side === 'party', spr = party ? findSpr('chr', un.ref) : findSpr('fam', un.fam) || findSpr('fam', un.ref);
      var a = { uid: un.uid, side: party ? 'party' : 'foe', name: String(un.name || un.uid), spr: spr, dir: party ? (side === 'right' ? 'left' : 'right') : (side === 'right' ? 'right' : 'left'),
        row: un.row === 'back' ? 'back' : 'front', boss: !!un.isBoss, hp: Number(un.hp) || 0, maxHp: Math.max(1, Number(un.maxHp) || 1), mp: Number(un.mp) || 0, maxMp: Math.max(0, Number(un.maxMp) || 0),
        shownHp: Number(un.hp) || 0, roll: null, ko: !!un.ko, gone: false, gauge: 0, ready: false, statuses: (un.statuses || []).map(function (s) { return s.sta; }),
        anim: null, animT: 0, off: [0, 0], flash: 0, glow: 0, highlight: 0, death: null, tint: un.palette || null };
      a.base = a.ko ? (party ? 'battle.ko' : null) : party ? 'battle.idle' : 'enemy.idle';
      if (a.ko && !party) a.gone = true;
      A[a.uid] = a; order.push(a.uid);
    });
    function gaugeOf(un) { var gm = Number(snap.gaugeMax) || 65536; return clamp((Number(un.gauge) || 0) / gm, 0, 1); }
    (snap.units || []).forEach(function (un) { if (A[un.uid]) A[un.uid].gauge = gaugeOf(un); });

    // ---- layout: party stacked with a stagger on its side, foes packed in columns by sprite height
    var pos = {};
    function size(a) { var f = frameOf(a, a.side === 'party' ? 'idle' : 'idle'); return f ? { w: f.w, h: f.h, ax: f.ax, ay: f.ay } : { w: 16 * u, h: 24 * u, ax: 8 * u, ay: 23 * u }; }
    function layout() {
      var party = order.filter(function (k) { return A[k].side === 'party'; }), foes = order.filter(function (k) { return A[k].side === 'foe'; });
      var top = 10 * u, bottom = fieldH - 4 * u, avail = bottom - top, right = side === 'right';
      // The party stands on the ground band (below the backdrop's horizon at 56 percent), not up in the sky.
      var pTop = Math.round(fieldH * 0.36), pAvail = bottom - pTop;
      var ph = party.map(function (k) { return size(A[k]).h; }), sumP = ph.reduce(function (s, v) { return s + v; }, 0);
      var gapP = party.length ? Math.max(0, (pAvail - sumP) / (party.length + 1)) : 0, yP = pTop + gapP;
      party.forEach(function (k, i) {
        var a = A[k], sz = size(a), stagger = Math.round(i * 4 * u), back = a.row === 'back' ? 10 * u : 0;
        var x = right ? Math.round(W * 0.8) + stagger + back : Math.round(W * 0.2) - stagger - back;
        var feet = Math.round(yP + sz.h);
        if (sumP > pAvail) feet = Math.round(pTop + pAvail * (i + 1) / party.length);
        pos[k] = { x: x, y: Math.min(bottom, feet) };
        yP += sz.h + gapP;
      });
      function pack(list, x0, dirSign) {
        var cols = [[]], colH = [0], colW = [0];
        list.forEach(function (k) {
          var sz = size(A[k]), c = cols.length - 1;
          if (colH[c] + sz.h > avail && cols[c].length) { cols.push([]); colH.push(0); colW.push(0); c++; }
          cols[c].push(k); colH[c] += sz.h; colW[c] = Math.max(colW[c], sz.w);
        });
        var x = x0;
        cols.forEach(function (col, ci) {
          var gap = Math.max(0, (avail - colH[ci]) / (col.length + 1)), y = top + gap;
          col.forEach(function (k) { var sz = size(A[k]); pos[k] = { x: Math.round(x), y: Math.round(Math.min(bottom, y + sz.h)) }; y += sz.h + gap; });
          x += dirSign * (colW[ci] + 4 * u);
        });
      }
      var front = foes.filter(function (k) { return A[k].row !== 'back'; }), back = foes.filter(function (k) { return A[k].row === 'back'; });
      if (right) { pack(front, Math.round(W * 0.38), -1); pack(back, Math.round(W * 0.16), -1); }
      else { pack(front, Math.round(W * 0.62), 1); pack(back, Math.round(W * 0.84), 1); }
    }
    layout();
    function rectOf(k) {
      var a = A[k], p = pos[k], sz = size(a);
      return p ? { x: p.x - sz.ax + a.off[0], y: p.y - sz.ay + a.off[1], w: sz.w, h: sz.h } : null;
    }
    function center(k) { var r = rectOf(k); return r ? { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h * 0.55) } : { x: W / 2, y: fieldH / 2 }; }
    function front(k) { var r = rectOf(k), a = A[k]; if (!r) return center(k); var lft = a.dir === 'left'; return { x: lft ? r.x : r.x + r.w, y: Math.round(r.y + r.h * 0.45) }; }

    // ---- actor animation helpers
    function play(a, key) { var an = animKey(a, key); a.anim = an; a.animT = 0; a.animKey = key; return an; }
    function baseKey(a) {
      if (a.side === 'foe') return a.ko ? null : 'enemy.idle';
      if (a.ko) return 'battle.ko';
      if (ended === 'win') return 'battle.victory';
      if (a.ready) return 'battle.ready';
      return a.shownHp <= a.maxHp / 4 ? 'battle.kneel' : 'battle.idle';
    }
    function settle(a) { var k = baseKey(a); if (a.animKey !== k || !a.anim) { if (k) play(a, k); else { a.anim = null; a.animKey = null; } } }
    function popup(uid, text, color, extra) {
      var a = A[uid]; if (!a) return;
      var c = center(uid), r = rectOf(uid);
      popups.push({ uid: uid, x: c.x, y: r ? r.y + Math.round(r.h * 0.3) : c.y, text: String(text), color: color, age: 0, dy: (extra && extra.dy) || 0 });
      stats.popups++;
    }
    function setHp(a, v) { v = clamp(Number(v) || 0, 0, a.maxHp); a.roll = { from: a.shownHp, to: v, t: 0 }; a.hp = v; }
    function emit(kind, id, opts) { stats.cues++; try { cue(kind, id, opts || {}); } catch (e) { /* a cue never stops the show */ } }

    // ---- results (damage, heal, miss, status, ko, revive) applied when their hit lands
    function applyResult(e) {
      var t = A[e.target];
      stats.hits++;
      if (!t) return;
      if (e.type === 'damage') {
        setHp(t, t.hp - (Number(e.value) || 0));
        popup(t.uid, String(e.value), e.crit ? '#f8e060' : '#ffffff');
        if (!t.ko) { play(t, t.side === 'party' ? 'battle.hurt' : 'enemy.hurt'); t.flash = 90; }
        emit('sfx', e.crit ? 'crit' : 'hit', { element: e.element || null, target: t.uid });
      } else if (e.type === 'heal') {
        setHp(t, t.hp + (Number(e.value) || 0));
        popup(t.uid, String(e.value), '#70f090');
        t.glow = 300;
        emit('sfx', 'heal', { target: t.uid });
      } else if (e.type === 'miss') {
        popup(t.uid, 'Miss', '#c0c0c8');
        emit('sfx', 'miss', { target: t.uid });
      } else if (e.type === 'status') {
        var v = String(e.value || ''), off = v.charAt(0) === '-', sid = off ? v.slice(1) : v, nm = (db.sta && db.sta[sid] && db.sta[sid].name) || (cfg.names && cfg.names[sid]) || sid;
        if (off) t.statuses = t.statuses.filter(function (s) { return s !== sid; }); else if (t.statuses.indexOf(sid) < 0) t.statuses.push(sid);
        popup(t.uid, off ? (e.name || 'cured') : nm, off ? '#a0c0f0' : '#e0a0f0', { dy: -4 * u });
        emit('sfx', off ? 'status.off' : 'status', { status: sid, target: t.uid });
      } else if (e.type === 'revive') {
        t.ko = false; t.gone = false; t.death = null;
        if (e.value != null && Number(e.value) > 0) setHp(t, Number(e.value));
        play(t, t.side === 'party' ? 'battle.revive' : 'enemy.idle');
        emit('sfx', 'revive', { target: t.uid });
      }
    }
    function applyKo(e) {
      var t = A[e.target];
      if (!t) return 0;
      t.ko = true; t.ready = false;
      setHp(t, 0);
      emit('sfx', t.side === 'party' ? 'ko' : 'death', { target: t.uid });
      if (t.side === 'party') { play(t, 'battle.ko'); return 640; }
      var an = animKey(t, 'enemy.death'), ms = an ? duration(an) : 700;
      t.death = { anm: an || { kind: 'death', method: 'scatter', ms: 700 }, t: 0, ms: ms };
      t.anim = null; t.animKey = null;
      return ms;
    }

    // ---- beats
    function abilityRecord(e) {
      var id = e.abl, an = id ? bySubject('anm_', 'abl', id) : null, info = id && db.abl ? db.abl[id] : null;
      var isItem = e.type === 'item' || (typeof id === 'string' && id.slice(0, 4) === 'itm_');
      if (!an) {
        var def = isItem ? 'item' : info && (info.kind === 'magic' || info.kind === 'heal' || info.kind === 'status' || info.kind === 'summon') ? 'cast' : 'attack';
        an = bySubject('anm_', 'role', 'ability:' + def) || { kind: 'ability', caster: def, travel: { type: def === 'cast' ? 'projectile' : def === 'item' ? 'rise' : 'none', ms: 260 }, impact: { fx: null, ms: 400 }, hits: 1, markers: [] };
      }
      return { anm: an, item: isItem, info: info };
    }
    function actionBeat(e) {
      return { kind: 'action', ev: e, results: [], kos: [], after: [], dur: 0, t: 0 };
    }
    function startAction(b) {
      var e = b.ev, a = A[e.actor], look = abilityRecord(e), anm = look.anm;
      var targets = (e.targets && e.targets.length ? e.targets : b.results.map(function (r) { return r.target; })).filter(function (k) { return A[k]; });
      var tgt = targets.length ? targets : a ? [a.uid] : [];
      var to = tgt.length ? tgt.map(center).reduce(function (s, c) { return { x: s.x + c.x / tgt.length, y: s.y + c.y / tgt.length }; }, { x: 0, y: 0 }) : { x: W / 2, y: fieldH / 2 };
      var casterKey = !a ? null : a.side === 'party' ? 'battle.' + (look.item ? 'item' : EA_CASTER(anm.caster)) : 'enemy.attack';
      var casterAnm = a && casterKey ? animKey(a, casterKey) : null;
      var fx = anm && anm.impact && anm.impact.fx ? rec(art, anm.impact.fx) : null;
      if (!fx && e.element) fx = bySubject('efx_', 'element', e.element);
      pb = abilityCreate({ anm: anm, caster: casterAnm, from: a ? front(a.uid) : to, to: { x: Math.round(to.x), y: Math.round(to.y) }, efx: fx, entries: ent, unit: u, seed: (seed + stats.beats * 31) >>> 0 });
      pbBeat = b;
      if (a && casterKey) { play(a, casterKey); a.ready = false; }
      b.caster = a; b.tl = pb.timeline;
      // Results land on hit markers: the n-th result for a target takes the n-th hit, and every hit past the last
      // marker stacks on it. A single hit area attack hits every target on the first marker.
      var per = {}, nh = pb.timeline.hits.length;
      b.slots = b.results.map(function (r) { var k = r.target || '_', j = per[k] || 0; per[k] = j + 1; return Math.min(j, nh - 1); });
      b.landed = b.results.map(function () { return false; });
      b.dur = pb.timeline.duration + 160;
      var nm = e.name || (look.info && look.info.name) || '';
      if (nm && e.abl !== '_attack') banner = { text: nm, t: 0, ms: b.dur };
      emit('sfx', look.item ? 'item' : 'action', { abl: e.abl || null, element: e.element || null, actor: e.actor });
    }
    function EA_CASTER(c) { return c === 'cast' || c === 'item' || c === 'limit' ? c : 'attack'; }
    function landHit(b, i) {
      b.results.forEach(function (r, k) { if (!b.landed[k] && b.slots[k] === i) { b.landed[k] = true; applyResult(r); } });
    }
    function finishAction(b) {
      b.results.forEach(function (r, k) { if (!b.landed[k]) { b.landed[k] = true; applyResult(r); } });
      if (b.caster) { b.caster.off = [0, 0]; settle(b.caster); }
      pb = null; pbBeat = null; banner = null;
    }
    function beatFor(kind, e, dur) { return { kind: kind, ev: e, dur: dur, t: 0 }; }
    function start(b) {
      b.started = true; stats.beats++;
      var e = b.ev || {}, a = A[e.actor];
      if (b.kind === 'action') startAction(b);
      else if (b.kind === 'ready') { if (a) { a.ready = true; a.highlight = b.dur; settle(a); } emit('ui', 'ready', { actor: e.actor }); }
      else if (b.kind === 'command') { if (a) a.highlight = b.dur; emit('ui', 'confirm', { actor: e.actor }); if (e.value === 'flee') banner = { text: e.name || 'Flee', t: 0, ms: 600 }; }
      else if (b.kind === 'result') applyResult(e);
      else if (b.kind === 'ko') { var ms = 0; b.list.forEach(function (x) { ms = Math.max(ms, applyKo(x)); }); b.dur = Math.max(b.dur, ms + 80); }
      else if (b.kind === 'revive') applyResult(e);
      else if (b.kind === 'limitReady') { var t = A[e.target]; if (t) { t.glow = 500; popup(t.uid, 'LIMIT', '#f8d040', { dy: -8 * u }); } emit('sfx', 'limit', { target: e.target }); }
      else if (b.kind === 'message') { message = { text: b.text, t: 0, ms: b.dur }; emit('ui', b.sound || 'error', {}); }
      else if (b.kind === 'end') {
        ended = e.value || 'end';
        order.forEach(function (k) { var x = A[k]; x.ready = false; if (x.side === 'party' && !x.ko) settle(x); });
        if (ended === 'flee') order.forEach(function (k) { var x = A[k]; if (x.side === 'party' && !x.ko) x.flee = true; });
        message = { text: { win: 'Victory', lose: 'Defeat', flee: 'Escaped', timeout: 'Time out' }[ended] || String(ended), t: 0, ms: 1e9 };
        emit('music', ended === 'win' ? 'victory' : ended === 'lose' ? 'defeat' : 'stop', { outcome: ended });
      }
    }
    function finish(b) {
      if (b.kind === 'action') finishAction(b);
      if (b.kind === 'message') message = null;
      if (b.apply) applyState(b.apply, false);
    }
    // States carry what events do not: ATB gauges, MP, and readiness (contract gaps 1 and 2). A state rides on the last
    // beat of its feed and applies when that beat finishes, so the HUD never runs ahead of the show.
    function applyState(st, early) {
      if (!st || !st.units) return;
      st.units.forEach(function (un) {
        var a = A[un.uid]; if (!a) return;
        a.gauge = gaugeOf(un);
        if (!early) { a.mp = Number(un.mp) || 0; a.maxMp = Math.max(0, Number(un.maxMp) || a.maxMp); }
      });
    }

    // feed(events, state): converts one advance call's events to beats.
    var open = null;
    function close() { if (open) { queue.push(open); open.after.forEach(function (x) { queue.push(x); }); if (open.kos.length) queue.push({ kind: 'ko', list: open.kos, dur: 120, t: 0 }); open = null; } }
    function feed(events, state) {
      var before = queue.length;
      (events || []).forEach(function (e) {
        if (!e || !e.type) return;
        stats.events++;
        var tp = e.type;
        if (tp === 'tick') return;
        var resultish = tp === 'damage' || tp === 'heal' || tp === 'status' || tp === 'revive' || (tp === 'miss' && e.target && (e.value == null || (e.value !== 'mp' && e.value !== 'flee' && e.value !== 'rejected')));
        if (open && resultish) { open.results.push(e); return; }
        if (open && tp === 'ko') { open.kos.push(e); return; }
        if (open && tp === 'limitReady') { open.after.push(beatFor('limitReady', e, BEAT_MS.limitReady)); return; }
        close();
        if (tp === 'action' || tp === 'item') { open = actionBeat(e); return; }
        if (tp === 'ready') queue.push(beatFor('ready', e, BEAT_MS.ready));
        else if (tp === 'command') queue.push(beatFor('command', e, BEAT_MS.command));
        else if (tp === 'damage' || tp === 'heal' || tp === 'miss' && e.target && resultish) queue.push(beatFor('result', e, BEAT_MS.result));
        else if (tp === 'status') queue.push(beatFor('result', e, BEAT_MS.status));
        else if (tp === 'revive') queue.push(beatFor('revive', e, BEAT_MS.revive));
        else if (tp === 'ko') { var last = queue[queue.length - 1]; if (last && last.kind === 'ko' && !last.started) last.list.push(e); else queue.push({ kind: 'ko', list: [e], dur: 120, t: 0 }); }
        else if (tp === 'limitReady') queue.push(beatFor('limitReady', e, BEAT_MS.limitReady));
        else if (tp === 'miss') { if (e.value === 'rejected') return; var mb = beatFor('message', e, BEAT_MS.message); mb.text = e.value === 'mp' ? 'Not enough MP' : e.name || 'Cannot escape'; queue.push(mb); }
        else if (tp === 'end') queue.push(beatFor('end', e, BEAT_MS.end));
      });
      close();
      if (state) {
        if (queue.length > before) queue[queue.length - 1].apply = state;
        else if (!queue.length) applyState(state, false);
        else queue[queue.length - 1].apply = state;
      }
      return queue.length - before;
    }
    // Unstarted action and KO beats learn their length when they start; until then they count at an estimate.
    function estimate(b) {
      if (b.started) return b.dur;
      if (b.kind === 'action') {
        var a = A[b.ev.actor], look = abilityRecord(b.ev), ck = !a ? null : a.side === 'party' ? 'battle.' + (look.item ? 'item' : EA_CASTER(look.anm.caster)) : 'enemy.attack';
        return abilityTimeline(look.anm, a && ck ? animKey(a, ck) : null).duration + 160;
      }
      if (b.kind === 'ko') return 760;
      return b.dur || 0;
    }
    function backlog() { return queue.reduce(function (s, b) { return s + Math.max(0, estimate(b) - (b.t || 0)); }, 0); }
    function rate() {
      var k = speedK;
      if (pacing === 'active') { var bl = backlog(); if (bl > BACKLOG_MS) { k *= bl / BACKLOG_MS; stats.compressed++; } }
      return k;
    }
    function update(dt) {
      dt = Math.max(0, Math.min(100, Number(dt) || 0));
      var k = rate(), vt = dt * k, budget = vt;
      now += vt;
      while (budget > 0 && queue.length) {
        var b = queue[0];
        if (!b.started) start(b);
        var step = Math.min(budget, Math.max(0, b.dur - b.t));
        if (b.kind === 'action' && pb) {
          pb.step(step).forEach(function (m) {
            if (m.type === 'hit') landHit(b, m.arg | 0);
            else if (m.type === 'sfx') emit('sfx', m.arg, { marker: true });
            else if (m.type === 'flash') flashScreen = 1;
          });
          var ca = pb.casterAt(), cst = b.caster;
          if (cst) { cst.animT = ca.t; cst.off = [ca.off[0] * (cst.dir === 'left' ? -1 : 1), 0]; }
        }
        b.t += step; budget -= step;
        if (b.t >= b.dur) { finish(b); queue.shift(); }
        else break;
        if (b.dur === 0 && !queue.length) break;
      }
      order.forEach(function (key) {
        var a = A[key], busy = pbBeat && pbBeat.caster === a;
        if (!busy) a.animT += vt;
        if (a.death) { a.death.t += vt; if (a.death.t >= a.death.ms) { a.gone = true; } }
        if (a.roll) { a.roll.t += vt; var p = Math.min(1, a.roll.t / 400); a.shownHp = Math.round(a.roll.from + (a.roll.to - a.roll.from) * p); if (p >= 1) { a.roll = null; a.shownHp = a.hp; } }
        // Back to the resting pose once a one shot ends, or when the resting pose itself changes (low HP, ready, victory).
        if (!busy && !a.death) {
          var oneShotDone = a.anim && !a.anim.loop && a.animKey !== 'battle.ko' && duration(a.anim) <= a.animT;
          if (!a.anim || oneShotDone || BASE_KEYS[a.animKey]) settle(a);
        }
        a.flash = Math.max(0, a.flash - vt); a.glow = Math.max(0, a.glow - vt); a.highlight = Math.max(0, a.highlight - vt);
        if (a.flee) a.off = [Math.min(W, a.off[0] + vt * 0.18 * (a.dir === 'left' ? -1 : 1) * -1), 0];
      });
      popups.forEach(function (p) { p.age += vt; });
      popups = popups.filter(function (p) { return p.age < POPUP_MS; });
      if (banner) { banner.t += vt; }
      if (message) message.t += vt;
      flashScreen = Math.max(0, flashScreen - vt / 160);
      if (weather) weatherStep(weather, vt);
      return k;
    }
    function isIdle() { return !queue.length; }

    // ---- drawing
    function hudColors() { return { back: '#101018', fill: '#e8c040', light: '#fff0a0' }; }
    function drawActor(k, shake) {
      var a = A[k], p = pos[k];
      if (!p || a.gone) return;
      var x = p.x + a.off[0] + shake[0], y = p.y + a.off[1] + shake[1];
      if (!a.spr || !cache) {
        ctx.fillStyle = a.side === 'party' ? '#c0a040' : '#a04040';
        if (!a.ko || a.side === 'party') ctx.fillRect(Math.round(x - 6 * u), Math.round(y - 20 * u), 12 * u, 20 * u);
        return;
      }
      if (a.death) { drawSprite(ctx, cache, a.spr.id, a.death.anm, a.death.t, x, y, { dir: a.dir, pose: 'idle', seed: hash32(a.uid) }); return; }
      var fl = a.flash > 0 && Math.floor(a.flash / 45) % 2 === 0;
      drawSprite(ctx, cache, a.spr.id, a.anim, a.animT, x, y, { dir: a.dir, pose: 'idle', flash: fl });
      if (a.statuses.length && cfg.icons) {
        var sid = a.statuses[Math.floor(now / 900) % a.statuses.length], ico = cfg.icons[sid], r = rectOf(k);
        var f = ico ? cache.icon(ico) : null;
        if (f && r) { blitFrame(ctx, f, Math.round(r.x + r.w / 2 - f.w / 2 + shake[0]), Math.round(r.y - f.h - 1 + shake[1])); }
      }
    }
    function draw(target) {
      var g = target || ctx;
      if (!g) return;
      var prev = ctx; ctx = g;
      var sc = pb ? pb.screen() : { shake: [0, 0], darken: 0, wave: 0, flash: 0 };
      if (cfg.bgd) bgDraw(ctx, cfg.bgd, now, W, fieldH, { entries: ent });
      else { ctx.fillStyle = '#203048'; ctx.fillRect(0, 0, W, fieldH); ctx.fillStyle = '#304830'; ctx.fillRect(0, Math.round(fieldH * 0.56), W, fieldH - Math.round(fieldH * 0.56)); }
      var foes = order.filter(function (k) { return A[k].side === 'foe'; }).sort(function (a, b) { return (pos[a] || {}).y - (pos[b] || {}).y; });
      var party = order.filter(function (k) { return A[k].side === 'party'; }).sort(function (a, b) { return (pos[a] || {}).y - (pos[b] || {}).y; });
      foes.forEach(function (k) { drawActor(k, sc.shake); });
      party.forEach(function (k) { drawActor(k, sc.shake); });
      order.forEach(function (k) {
        var a = A[k], r = rectOf(k);
        if (!r || a.gone) return;
        if (a.glow > 0) { ctx.globalAlpha = 0.35 * (a.glow / 500); ctx.fillStyle = '#ffffff'; ctx.fillRect(r.x - u, r.y - u, r.w + 2 * u, r.h + 2 * u); ctx.globalAlpha = 1; }
        if (a.highlight > 0 && a.side === 'party') { ctx.fillStyle = '#f8f0a0'; ctx.fillRect(Math.round(r.x + r.w / 2 - u), Math.round(r.y - 3 * u), 2 * u, 2 * u); }
      });
      if (pb) pb.draw(ctx);
      if (sc.wave && ctx.canvas) applyWave(ctx, sc.wave, now, W, fieldH);
      if (weather) weatherDraw(ctx, weather);
      if (sc.darken > 0) { ctx.globalAlpha = sc.darken; ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, W, fieldH); ctx.globalAlpha = 1; }
      var fl = Math.max(sc.flash || 0, flashScreen * 0.6);
      if (fl > 0) { ctx.globalAlpha = fl; ctx.fillStyle = sc.flashColor || '#ffffff'; ctx.fillRect(0, 0, W, fieldH); ctx.globalAlpha = 1; }
      // popups over everything on the field
      popups.forEach(function (p) {
        var fade = p.age > POPUP_MS - 150 ? clamp((POPUP_MS - p.age) / 150, 0, 1) : 1;
        ctx.globalAlpha = fade;
        drawText(ctx, font, p.text, p.x, p.y + p.dy + popupOffset(p.age, u), { color: p.color, shadow: '#000000', scale: u, align: 'center' });
        ctx.globalAlpha = 1;
      });
      if (cursor && pos[cursor] && !A[cursor].gone) { var cr = rectOf(cursor); if (cr) drawCursor(ctx, uiRec.cursor, A[cursor].side === 'party' && side === 'right' ? cr.x : cr.x, cr.y + Math.round(cr.h / 2), now, { entries: ent, unit: u }); }
      // banner (the ability name) and messages at the top
      var lh = font.line * u, pad = 4 * u;
      if (banner && banner.text) {
        var bw = Math.min(W - 8 * u, measure(font, banner.text, u) + 2 * pad + 4 * u), bx = Math.round((W - bw) / 2);
        drawWindow(ctx, uiRec.window, bx, 2 * u, bw, lh + 2 * pad, { entries: ent, unit: u, open: Math.min(1, banner.t / 80) });
        drawText(ctx, font, banner.text, W / 2, 2 * u + pad + u, { color: '#ffffff', shadow: '#000000', scale: u, align: 'center' });
      }
      if (message && message.text) {
        var mw = Math.min(W - 8 * u, measure(font, message.text, u) + 2 * pad + 8 * u), mx = Math.round((W - mw) / 2), my = Math.round(fieldH * 0.36);
        drawWindow(ctx, uiRec.window, mx, my, mw, lh + 2 * pad, { entries: ent, unit: u, open: Math.min(1, message.t / 100) });
        drawText(ctx, font, message.text, W / 2, my + pad + u, { color: '#ffffff', shadow: '#000000', scale: u, align: 'center' });
      }
      drawHud();
      ctx = prev;
    }
    function drawHud() {
      var lh = font.line * u, pad = 4 * u, hh = H - hudY, foeW = Math.round(W * 0.36);
      var foes = order.filter(function (k) { return A[k].side === 'foe'; }), party = order.filter(function (k) { return A[k].side === 'party'; });
      var left = side === 'right' ? 0 : W - foeW, right = side === 'right' ? foeW : 0;
      drawWindow(ctx, uiRec.window, left, hudY, foeW, hh, { entries: ent, unit: u });
      drawWindow(ctx, uiRec.window, right, hudY, W - foeW, hh, { entries: ent, unit: u });
      var rows = Math.max(1, Math.floor((hh - 2 * pad) / lh)), seen = {}, names = [];
      foes.forEach(function (k) { var a = A[k]; if (a.gone || a.ko) return; var base = a.name.replace(/ [A-Z]$/, ''); if (seen[base]) seen[base].n++; else { seen[base] = { n: 1 }; names.push(base); } });
      names.slice(0, rows).forEach(function (nm, i) {
        var n = seen[nm].n, label = nm + (n > 1 ? ' x' + n : ''), maxW = foeW - 2 * pad - 2 * u;
        while (label.length > 3 && measure(font, label, u) > maxW) label = label.slice(0, -1);
        drawText(ctx, font, label, left + pad + u, hudY + pad + u + i * lh, { color: '#ffffff', shadow: '#000000', scale: u });
      });
      var pw = W - foeW - 2 * pad, gaugeW = Math.max(12 * u, Math.round(pw * 0.2)), nameW = Math.round(pw * 0.32);
      var digits = party.reduce(function (m, k) { return Math.max(m, String(A[k].maxHp).length); }, 1), hpW = measure(font, new Array(digits * 2 + 2).join('9'), u);
      var mpW = measure(font, '999', u), gaugeX = right + (W - foeW) - pad - gaugeW - u;
      party.slice(0, rows).forEach(function (k, i) {
        var a = A[k], y = hudY + pad + u + i * lh, x = right + pad + u, low = a.shownHp <= a.maxHp / 4;
        var col = a.ko ? '#d05050' : low ? '#f0c040' : '#ffffff', label = a.name;
        while (label.length > 3 && measure(font, label, u) > nameW - 2 * u) label = label.slice(0, -1);
        if (cursor === k) drawCursor(ctx, uiRec.cursor, x + 2 * u, y + Math.round(font.h * u / 2), now, { entries: ent, unit: u });
        drawText(ctx, font, label, x, y, { color: a.ready ? '#f8f0a0' : col, shadow: '#000000', scale: u });
        var hpRight = x + nameW + hpW, mpRight = hpRight + 3 * u + mpW;
        drawText(ctx, font, a.shownHp + '/' + a.maxHp, hpRight, y, { color: col, shadow: '#000000', scale: u, align: 'right' });
        if (a.maxMp && mpRight + 2 * u <= gaugeX) drawText(ctx, font, String(a.mp), mpRight, y, { color: '#a0c8f8', shadow: '#000000', scale: u, align: 'right' });
        drawGauge(ctx, gaugeX, y + u, gaugeW, Math.max(3, font.h * u - 2 * u), a.ko ? 0 : a.gauge, a.gauge >= 1 ? { back: '#101018', fill: '#f8f0a0', light: '#ffffff' } : hudColors());
      });
    }
    function targets() {
      var out = {};
      order.forEach(function (k) { var r = rectOf(k); if (r && !A[k].gone) out[k] = r; });
      return out;
    }
    function display() {
      var out = {};
      order.forEach(function (k) { var a = A[k]; out[k] = { name: a.name, side: a.side, hp: a.shownHp, hpTarget: a.hp, maxHp: a.maxHp, mp: a.mp, maxMp: a.maxMp, ko: a.ko, gone: a.gone, statuses: a.statuses.slice(), atb: a.gauge, ready: a.ready, anim: a.animKey || (a.death ? 'death' : null) }; });
      return out;
    }
    return {
      feed: feed, update: update, draw: draw, isIdle: isIdle, backlog: backlog, targets: targets, display: display,
      setPacing: function (m) { pacing = m === 'active' ? 'active' : 'wait'; return pacing; },
      setSpeed: function (k) { speedK = Math.max(0.25, Number(k) || 1); return speedK; },
      setCursor: function (uid) { cursor = uid && A[uid] ? uid : null; },
      setMessage: function (text) { message = text ? { text: String(text), t: 1000, ms: 1e9 } : null; },
      pacing: function () { return pacing; }, ended: function () { return ended; },
      stats: function () { return Object.assign({ queued: queue.length, backlog: backlog(), now: Math.round(now), popupsLive: popups.length }, stats); },
      beats: function () { return queue.map(function (b) { return { kind: b.kind, dur: b.dur, t: b.t, results: b.results ? b.results.length : 0 }; }); },
      layout: function () { var o = {}; Object.keys(pos).forEach(function (k) { o[k] = { x: pos[k].x, y: pos[k].y }; }); return o; },
      field: { w: W, h: H, fieldH: fieldH, unit: u }
    };
  }

  R.ui = {
    FONT: DEFAULT_FONT, CORNERS: WIN_CORNERS, OPEN_STYLES: OPEN_STYLES, CURSORS: Object.keys(CURSOR_SHAPES), CURSOR_SHAPES: CURSOR_SHAPES,
    SCHEMES: SCHEMES, TITLE_STYLES: TITLE_STYLES, TITLE_LAYOUTS: TITLE_LAYOUTS, POPUP_MS: POPUP_MS,
    font: fontOf, measure: measure, text: drawText, wrap: wrapText, window: drawWindow, cursor: drawCursor, gauge: drawGauge, color: colOf,
    touch: { layout: touchLayout, hit: touchHit, draw: drawTouch }, title: drawTitle
  };
  R.presenter = { BEAT_MS: BEAT_MS, BACKLOG_MS: BACKLOG_MS };
  R.createPresenter = createPresenter;
