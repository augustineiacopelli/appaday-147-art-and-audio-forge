// === WS:INTERFACE BEGIN ===
(function () {
  'use strict';
  // The Interface tab. Phase 2 delivered Icons; Phase 5 adds Window and font, Cursor, Touch skin, and Title.
  var U = Kit.util, el = U.el, esc = U.esc, EI = ENGINE_RENDER.icon, S = ART.sprites, P = ART.palette, W = ART.ui;
  ART.WS = ART.WS || {};
  var SUBS = [['icons', 'Icons'], ['window', 'Window and font'], ['cursor', 'Cursor'], ['touch', 'Touch skin'], ['title', 'Title']];
  var ui = { sub: 'icons', focus: null };
  var ICON_LABELS = ['Clear', 'Outline', 'Metal dark', 'Metal', 'Metal light', 'Wood dark', 'Wood', 'Wood light', 'Tint dark', 'Tint', 'Tint light', 'Cloth dark', 'Cloth', 'Cloth light', 'Light dark', 'Light'];
  var GROUPS = [['itm_', 'Items'], ['eqp_', 'Equipment'], ['abl_', 'Abilities'], ['sta_', 'Statuses'], ['mat_', 'Materia']];
  function cur() { return Kit.bundle.current(); }
  function touch(reason) { Kit.bundle.touch(reason || 'icons'); Kit.refreshValidation(); }
  function glyphOptions() {
    return EI.GLYPHS.map(function (g) { return [g, g.charAt(0).toUpperCase() + g.slice(1)]; })
      .concat(EI.STATUS_SHAPES.map(function (s) { return ['status.' + s, 'Status: ' + s]; }));
  }
  function tintOptions(b) {
    var els = (b.charter.ruleset && b.charter.ruleset.elements) || [];
    return els.map(function (e) { return [e.key, 'Element: ' + (e.label || e.key)]; }).concat([['#d04848', 'Red'], ['#e09040', 'Orange'], ['#d8b048', 'Gold'], ['#5ab85a', 'Green'], ['#5ab0c0', 'Teal'], ['#4a7ad8', 'Blue'], ['#8a6ad8', 'Violet'], ['#c04a8a', 'Rose'], ['#9a9a9a', 'Grey']]);
  }
  function editPixels(ico, after) {
    var b = cur(), f = S.cache().icon(ico.id), slots = ENGINE_RENDER.sprite.slotsFor(b.art, ico.pal, ico.tintRamp);
    var gen = EI.compose(ico.gen && ico.gen.glyph, f.w);
    ART.pixelEditor.open({ title: ico.name, w: f.w, h: f.h, idx: f.idx, slots: slots, entries: P.entries(b), labels: ICON_LABELS, canRevert: !!ico.px,
      note: 'Tint colors follow the icon\'s tint, so recoloring the tint later still works on hand drawn pixels.' }).then(function (res) {
      if (!res) return;
      if (res.action === 'revert') delete ico.px;
      else { var enc = ART.pixelEditor.encode(res.idx, f.w, f.h, gen.idx); if (enc) { ico.px = enc; ico.origin = 'user'; } else delete ico.px; }
      touch('icon-pixels');
      if (after) after();
    });
  }
  function openIcon(id) {
    Kit.ui.drawer({
      title: 'Icon',
      body: function (body, h) {
        function paint() {
          var b = cur(), ico = ART.records.get(id);
          U.clear(body);
          if (!ico) { body.appendChild(el('div', 'empty-line', 'This icon no longer exists.')); return; }
          h.setTitle(ico.name);
          var f = S.cache().icon(id), head = el('div', 'a7-edhead');
          var big = el('button', 'a7-frame'); big.type = 'button'; big.setAttribute('aria-label', 'Edit pixels for ' + ico.name);
          big.appendChild(W.figure(f, 128)); big.appendChild(el('span', 'a7-frame-l', ico.px ? 'Hand drawn <span class="chip chip-accent">edited</span>' : 'Tap to draw'));
          big.addEventListener('click', function () { editPixels(ico, paint); });
          head.appendChild(big);
          var meta = el('div', 'a7-grow');
          var sj = ico.subject || {};
          meta.innerHTML = '<dl class="kv"><dt>Record</dt><dd><code class="id">' + esc(ico.id) + '</code></dd><dt>For</dt><dd>' + esc(nameOf(sj.ref)) + '</dd><dt>Size</dt><dd>' + esc(ico.size + ' by ' + ico.size) + '</dd><dt>Origin</dt><dd>' + W.origin(ico) + '</dd></dl>';
          head.appendChild(meta);
          body.appendChild(head);
          var ctl = el('div', 'a7-ctl');
          ctl.appendChild(W.select('Glyph', ico.gen && ico.gen.glyph, glyphOptions(), function (v) { ico.gen = ico.gen || {}; ico.gen.glyph = v; ico.origin = 'user'; touch('icon-glyph'); paint(); }));
          var tint = ico.gen && ico.gen.tint, opts = tintOptions(b);
          if (tint != null && !opts.some(function (o) { return o[0] === tint; })) opts.unshift([String(tint), 'Current: ' + tint]);
          ctl.appendChild(W.select('Tint', tint, opts, function (v) { ico.gen = ico.gen || {}; ico.gen.tint = v; ico.tintRamp = S.tintRamp(b, v); ico.origin = 'user'; touch('icon-tint'); paint(); }));
          body.appendChild(ctl);
          if (ico.px) body.appendChild(el('p', 'muted a7-small', 'Hand drawn pixels replace the glyph. Changing the glyph has no effect until you revert the pixels.'));
          var row = el('div', 'btn-row');
          row.appendChild(W.button('Edit pixels', 'edit', '', function () { editPixels(ico, paint); }));
          row.appendChild(W.button('Reset to generated', 'check', 'btn-ghost', function () { delete ico.px; ico.origin = 'procedural'; S.buildIcons(b, {}); touch('icon-reset'); paint(); }));
          if (ART.ai) row.appendChild(ART.ai.button('icon', ico.id, paint));
          body.appendChild(row);
        }
        paint();
      },
      onClose: function () { Kit.rerender(); }
    });
  }
  function nameOf(id) { var b = cur(), p = Kit.ids.prefixOf(id), m = p && b.rules && U.isObj(b.rules[p]) ? b.rules[p] : null; return m && m[id] && m[id].name ? m[id].name : String(id || ''); }
  function viewIcons(host) {
    var b = cur(), icons = S.icons(b);
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Icons</h3><p class="muted">One icon for every item, piece of equipment, ability, status, and materia, drawn from its category and tinted by its element or name. ' +
      esc(EI.size(S.tileSize(b)) + ' by ' + EI.size(S.tileSize(b))) + ' pixels at this tile size.</p>';
    host.appendChild(intro);
    if (!icons.length) {
      intro.appendChild(el('div', 'empty-line', 'No icons yet. Quick Build makes one for every rules record.'));
      intro.appendChild(W.button('Quick Build', 'spark', 'btn-primary', function () { ART.openQuickBuild(); }));
      return;
    }
    if (ART.ai) { var air = el('div', 'btn-row'); air.appendChild(ART.ai.button('icons', null, function () { Kit.rerender(); })); intro.appendChild(air); }
    GROUPS.forEach(function (g) {
      var kind = g[0].slice(0, 3), list = icons.filter(function (i) { return i.subject && i.subject.kind === kind; });
      if (!list.length) return;
      var p = el('section', 'panel');
      p.appendChild(el('h3', 'section-h', esc(g[1])));
      var grid = el('div', 'a7-icons');
      list.forEach(function (ico) {
        var t = el('button', 'a7-frame' + (ui.focus === ico.id ? ' a7-hit' : '')); t.type = 'button'; t.dataset.rid = ico.id;
        t.setAttribute('aria-label', 'Open icon for ' + nameOf(ico.subject.ref));
        t.appendChild(W.figure(S.cache().icon(ico.id), 48));
        t.appendChild(el('span', 'a7-frame-l', esc(nameOf(ico.subject.ref)) + (S.isKept(ico) ? ' <span class="chip chip-accent">edited</span>' : '')));
        t.addEventListener('click', function () { openIcon(ico.id); });
        grid.appendChild(t);
      });
      p.appendChild(grid);
      host.appendChild(p);
    });
  }
  // ---------------------------------------------------------------- Phase 5: the interface kit
  // ART:UI and WS:MOTION load after this fence, so the kit and the stage helper are picked up when a view first paints.
  var ER = ENGINE_RENDER, EU = ER.ui, I = null, M = null;
  function late() { I = ART.iface; M = ART.motion; }
  function res() { var r = (cur().charter.specs || {}).resolution || {}; return { w: Number(r.w) || 256, h: Number(r.h) || 224 }; }
  function kScale() { return Math.max(2, Math.min(6, Math.floor(720 / res().w))); }
  function unit() { return Math.max(1, Math.round(S.tileSize(cur()) / 16)); }
  function needKit(host, key) {
    var r = I.get(cur(), key);
    if (r) return r;
    var p = el('section', 'panel');
    var retired = (cur().art.settings.retired || []).indexOf('ui:' + key) >= 0;
    p.innerHTML = '<h3 class="section-h">No ' + esc(key) + ' record</h3><p class="muted">' + (retired ? 'This record was deleted. Restore it to bring back the default.' : 'Quick Build makes the window, font, cursor, touch skin, and title records.') + '</p>';
    p.appendChild(retired ? W.button('Restore default', 'check', 'btn-primary', function () { I.restore(cur(), key); touch('ui-restore'); Kit.rerender(); }) : W.button('Quick Build', 'spark', 'btn-primary', function () { ART.openQuickBuild(); }));
    host.appendChild(p);
    return null;
  }
  function recHead(host, r, key, lead) {
    var p = el('section', 'panel' + (ui.focus === r.id ? ' a7-hit' : ''));
    p.dataset.rid = r.id;
    p.innerHTML = '<h3 class="section-h">' + esc(r.name) + ' ' + W.origin(r) + '</h3><p class="muted">' + esc(lead) + '</p><p class="muted a7-small"><code class="id">' + esc(r.id) + '</code></p>';
    var row = el('div', 'btn-row');
    row.appendChild(W.button('Reset to default', 'check', 'btn-ghost', function () { I.reset(cur(), key); touch('ui-reset'); Kit.rerender(); }));
    if (ART.ai && ART.ai.has(key)) row.appendChild(ART.ai.button(key, r.id, function () { Kit.rerender(); }));
    row.appendChild(W.button('Delete', 'trash', 'btn-ghost', function () {
      Kit.ui.dialog({ title: 'Delete ' + r.name + '?', body: 'Interface previews fall back to the built in look until you restore it. Quick Build will not recreate it.', actions: [{ label: 'Cancel' }, { label: 'Delete', kind: 'danger', onClick: function () { I.remove(cur(), key); touch('ui-delete'); Kit.rerender(); } }] });
    }));
    p.appendChild(row);
    host.appendChild(p);
    return p;
  }
  function colorRow(r, key, after) {
    var box = el('div', 'a7-colors');
    (I.COLOR_FIELDS[key] || []).forEach(function (f) {
      var o = f[0].split('.').reduce(function (x, k) { return x && x[k]; }, r) || {}, now = EU.color(o, P.entries(cur()), '#ffffff');
      var id = 'a7c' + U.rand36(6), lab = el('label'); lab.htmlFor = id;
      var inp = el('input'); inp.type = 'color'; inp.id = id; inp.value = now;
      inp.addEventListener('change', function () { if (I.setColor(cur(), r, f[0], inp.value)) { touch('ui-color'); if (after) after(); } });
      lab.appendChild(inp); lab.appendChild(el('span', null, esc(f[1])));
      box.appendChild(lab);
    });
    return box;
  }
  function textField(label, value, placeholder, onChange) {
    var id = 'a7x' + U.rand36(6), w = el('label', 'a7-text'); w.htmlFor = id; w.innerHTML = '<span>' + esc(label) + '</span>';
    var inp = el('input', 'inp'); inp.type = 'text'; inp.id = id; inp.value = value == null ? '' : value; if (placeholder) inp.placeholder = placeholder; inp.maxLength = 80;
    inp.addEventListener('change', function () { onChange(inp.value); });
    w.appendChild(inp); return w;
  }
  function stage(paint, label) {
    var R = res(), wrap = el('div', 'a7-bt-stage'), cv = M.stage(R.w, R.h, kScale(), paint, label);
    cv.classList.add('a7-bt-cv'); wrap.appendChild(cv);
    return { wrap: wrap, cv: cv };
  }
  function backdrop(ctx, t) {
    var b = cur(), R = res(), bg = I.titleBg(b, I.get(b, 'title'));
    if (bg) ER.bg.draw(ctx, bg, t, R.w, R.h, { entries: P.entries(b) }); else { ctx.fillStyle = '#203048'; ctx.fillRect(0, 0, R.w, R.h); }
  }
  var specimen = ['The quick brown fox jumps', 'over the lazy dog. 0123456789', 'HP 120/240  MP 18  Lv 12', '!?.,:;()[]{}+-*/=<>@#$%&_~'];
  var fontUi = { code: 65 };
  function viewWindowFont(host) {
    late();
    var b = cur(), win = needKit(host, 'window');
    if (win) {
      var p = recHead(host, win, 'window', 'The frame every menu, message, and battle window uses: a gradient body, an outer line, a border, and a corner. Opening plays as it appears.');
      var R = res(), st = stage(function (ctx, t) {
        backdrop(ctx, t);
        var u = unit(), kit = I.kit(cur()), font = EU.font(kit.font), lh = font.line * u, pad = 5 * u, ms = win.open ? Math.max(1, win.open.ms) : 1;
        var o = win.open && win.open.style === 'none' ? 1 : Math.min(1, (t % 2600) / ms);
        var w = Math.round(R.w * 0.8), h = specimen.length * lh + 2 * pad, x = Math.round((R.w - w) / 2), y = Math.round((R.h - h) / 2);
        EU.window(ctx, win, x, y, w, h, { entries: P.entries(cur()), unit: u, open: o });
        if (o >= 1) specimen.forEach(function (ln, i) { EU.text(ctx, font, ln, x + pad + u, y + pad + u + i * lh, { color: '#ffffff', shadow: '#000000', scale: u }); });
      }, 'Window preview with the font specimen');
      p.appendChild(st.wrap);
      p.appendChild(colorRow(win, 'window'));
      var ctl = el('div', 'a7-ctl');
      ctl.appendChild(W.select('Corner', win.corner, EU.CORNERS.map(function (c) { return [c, c.charAt(0).toUpperCase() + c.slice(1)]; }), function (v) { win.corner = v; win.origin = 'user'; touch('ui-window'); }));
      ctl.appendChild(W.select('Border', String(win.thickness), [['1', 'Thin'], ['2', 'Medium'], ['3', 'Thick']], function (v) { win.thickness = Number(v); win.origin = 'user'; touch('ui-window'); }));
      ctl.appendChild(W.slider('Opacity', win.alpha == null ? 1 : win.alpha, 0.2, 1, 0.05, function (v) { win.alpha = v; win.origin = 'user'; touch('ui-window'); }));
      win.open = win.open || { ms: 140, style: 'grow' };
      ctl.appendChild(W.select('Opening', win.open.style, EU.OPEN_STYLES.map(function (c) { return [c, c.charAt(0).toUpperCase() + c.slice(1)]; }), function (v) { win.open.style = v; win.origin = 'user'; touch('ui-window'); }));
      ctl.appendChild(W.slider('Opening ms', win.open.ms, 0, 600, 10, function (v) { win.open.ms = v; win.origin = 'user'; touch('ui-window'); }));
      p.appendChild(ctl);
    }
    var font = needKit(host, 'font');
    if (!font) return;
    var fp = recHead(host, font, 'font', 'An original 5 by 7 pixel font with one descender row, for every printable character. Pick a character and toggle its pixels; the dashed row is the descender.');
    var grid = el('div', 'a7-glyphs'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'Characters');
    for (var code = 33; code <= 126; code++) (function (cc) {
      var bt = el('button', 'btn', esc(String.fromCharCode(cc))); bt.type = 'button'; bt.setAttribute('aria-pressed', cc === fontUi.code ? 'true' : 'false'); bt.setAttribute('aria-label', 'Edit glyph ' + String.fromCharCode(cc));
      bt.addEventListener('click', function () { fontUi.code = cc; Kit.rerender(); });
      grid.appendChild(bt);
    })(code);
    fp.appendChild(grid);
    var row = el('div', 'a7-room-below');
    var ed = el('div', 'a7-gedit'); ed.style.gridTemplateColumns = 'repeat(' + font.w + ', auto)';
    var rows = I.glyphRows(font, fontUi.code);
    rows.forEach(function (r, y) { r.forEach(function (on, x) {
      var px = el('button', y >= font.h ? 'a7-desc' : null); px.type = 'button'; px.setAttribute('aria-pressed', on ? 'true' : 'false'); px.setAttribute('aria-label', 'Pixel ' + (x + 1) + ', row ' + (y + 1));
      px.addEventListener('click', function () { rows[y][x] = !rows[y][x]; px.setAttribute('aria-pressed', rows[y][x] ? 'true' : 'false'); I.setGlyph(font, fontUi.code, rows); font.origin = 'user'; touch('ui-glyph'); });
      ed.appendChild(px);
    }); });
    row.appendChild(ed);
    var big = el('div', 'a7-grow');
    big.innerHTML = '<p><strong>' + esc(String.fromCharCode(fontUi.code)) + '</strong> <span class="muted a7-small">code ' + fontUi.code + '</span></p>';
    big.appendChild(W.button('Reset this glyph', 'check', 'btn-ghost', function () { var d = EU.FONT.glyphs[fontUi.code]; if (d) { font.glyphs[fontUi.code] = d; font.origin = 'user'; touch('ui-glyph'); Kit.rerender(); } }));
    row.appendChild(big);
    fp.appendChild(row);
  }
  function viewCursor(host) {
    late();
    var cr = needKit(host, 'cursor');
    if (!cr) return;
    var p = recHead(host, cr, 'cursor', 'The pointer that marks the chosen menu item or target. It bobs toward what it points at.');
    var items = ['Fight', 'Magic', 'Item', 'Defend'];
    var st = stage(function (ctx, t) {
      backdrop(ctx, t);
      var R = res(), u = unit(), kit = I.kit(cur()), font = EU.font(kit.font), lh = font.line * u, pad = 5 * u, w = EU.measure(font, 'Defend', u) + 2 * pad + 16 * u, h = items.length * lh + 2 * pad;
      var x = Math.round((R.w - w) / 2), y = Math.round((R.h - h) / 2), sel = Math.floor(t / 1200) % items.length;
      EU.window(ctx, kit.window, x, y, w, h, { entries: P.entries(cur()), unit: u });
      items.forEach(function (it, i) { EU.text(ctx, font, it, x + pad + 12 * u, y + pad + i * lh, { color: '#ffffff', shadow: '#000000', scale: u }); });
      EU.cursor(ctx, cr, x + pad + 11 * u, y + pad + sel * lh + Math.floor(font.h * u / 2), t, { entries: P.entries(cur()), unit: u });
    }, 'Cursor preview on a battle menu');
    p.appendChild(st.wrap);
    p.appendChild(colorRow(cr, 'cursor'));
    var ctl = el('div', 'a7-ctl');
    ctl.appendChild(W.select('Shape', cr.style, EU.CURSORS.map(function (c) { return [c, c.charAt(0).toUpperCase() + c.slice(1)]; }), function (v) { cr.style = v; cr.origin = 'user'; touch('ui-cursor'); }));
    cr.bob = cr.bob || { amp: 2, ms: 600 };
    ctl.appendChild(W.slider('Bob pixels', cr.bob.amp, 0, 8, 1, function (v) { cr.bob.amp = v; cr.origin = 'user'; touch('ui-cursor'); }));
    ctl.appendChild(W.slider('Bob ms', cr.bob.ms, 100, 2000, 50, function (v) { cr.bob.ms = v; cr.origin = 'user'; touch('ui-cursor'); }));
    p.appendChild(ctl);
  }
  var touchUi = { pressed: {}, last: 'nothing yet' };
  function viewTouch(host) {
    late();
    var b = cur(), tk = needKit(host, 'touch');
    if (!tk) return;
    var ch = b.charter.specs && b.charter.specs.mobileControls, scheme = I.scheme(b, tk);
    var p = recHead(host, tk, 'touch', 'The on screen controls a phone player sees. The Charter names the scheme (' + (ch || 'dpad') + '); you can override it here. Press the controls in the preview to try them.');
    var R = res();
    var st = stage(function (ctx, t) {
      backdrop(ctx, t);
      var kit = I.kit(cur()), lay = EU.touch.layout(I.scheme(cur(), tk), R.w, R.h, tk);
      EU.touch.draw(ctx, lay, tk, { pressed: touchUi.pressed, entries: P.entries(cur()), font: kit.font });
      if (touchUi.tap) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.6; ctx.fillRect(touchUi.tap[0] - 2, touchUi.tap[1] - 2, 5, 5); ctx.globalAlpha = 1; }
    }, 'Touch skin preview. Press the controls to try them.');
    st.cv.style.touchAction = 'none';
    var out = el('p', 'muted a7-small'); out.setAttribute('aria-live', 'polite'); out.textContent = 'Last input: ' + touchUi.last;
    function at(e) { var r = st.cv.getBoundingClientRect(); return [(e.clientX - r.left) / (r.width || 1) * R.w, (e.clientY - r.top) / (r.height || 1) * R.h]; }
    function press(e) {
      var xy = at(e), h = EU.touch.hit(EU.touch.layout(I.scheme(cur(), tk), R.w, R.h, tk), xy[0], xy[1]);
      touchUi.pressed = {}; touchUi.tap = null;
      if (!h) return;
      if (h.key === 'tap') { touchUi.tap = [Math.round(xy[0]), Math.round(xy[1])]; touchUi.last = 'tap at ' + touchUi.tap.join(', '); }
      else if (h.key === 'stick') { touchUi.pressed.stick = { vx: h.vx, vy: h.vy }; touchUi.last = 'stick ' + (h.dir || 'center'); }
      else if (h.key === 'dpad') { touchUi.pressed.dpad = h.dir || true; touchUi.last = 'pad ' + (h.dir || 'center'); }
      else { touchUi.pressed[h.key] = true; touchUi.last = 'button ' + h.key.toUpperCase(); }
      out.textContent = 'Last input: ' + touchUi.last;
      if (ART.audio && touchUi.last !== touchUi.sounded) { touchUi.sounded = touchUi.last; ART.audio.cue('ui', h.key === 'a' ? 'confirm' : h.key === 'b' ? 'cancel' : h.key === 'menu' ? 'confirm' : 'move'); }
    }
    st.cv.addEventListener('pointerdown', function (e) { if (st.cv.setPointerCapture) try { st.cv.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } press(e); e.preventDefault(); });
    st.cv.addEventListener('pointermove', function (e) { if (e.buttons || e.pointerType === 'touch') press(e); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { st.cv.addEventListener(n, function () { touchUi.pressed = {}; touchUi.sounded = null; }); });
    p.appendChild(st.wrap); p.appendChild(out);
    p.appendChild(colorRow(tk, 'touch'));
    var ctl = el('div', 'a7-ctl');
    ctl.appendChild(W.select('Scheme', tk.scheme || '', [['', 'Follow the Charter (' + (ch || 'dpad') + ')']].concat(I.SCHEMES), function (v) { tk.scheme = v || null; tk.origin = 'user'; touch('ui-touch'); Kit.rerender(); }));
    ctl.appendChild(W.select('Shape', tk.shape, [['round', 'Round'], ['square', 'Square']], function (v) { tk.shape = v; tk.origin = 'user'; touch('ui-touch'); }));
    ctl.appendChild(W.slider('Opacity', tk.opacity, 0.1, 1, 0.05, function (v) { tk.opacity = v; tk.origin = 'user'; touch('ui-touch'); }));
    var auto = Math.round(Math.min(R.w, R.h) * 0.2);
    ctl.appendChild(W.slider('Size', tk.size || auto, 12, Math.round(Math.min(R.w, R.h) * 0.45), 1, function (v) { tk.size = v === auto ? null : v; tk.origin = 'user'; touch('ui-touch'); }));
    p.appendChild(ctl);
    var labs = el('div', 'a7-ctl');
    tk.labels = tk.labels || {};
    [['a', 'A button'], ['b', 'B button'], ['menu', 'Menu button']].forEach(function (x) {
      labs.appendChild(textField(x[1] + ' label', tk.labels[x[0]], x[0] === 'menu' ? '=' : x[0].toUpperCase(), function (v) { tk.labels[x[0]] = String(v).slice(0, 2) || null; tk.origin = 'user'; touch('ui-touch'); }));
    });
    p.appendChild(labs);
    // Menu sounds: each links an sfx_ record; empty plays the cue library's sound of the same name.
    var snd = el('div', 'a7-ctl'), sounds = ART.audio ? ART.audio.sounds(b) : [];
    tk.sfx = tk.sfx || {};
    [['move', 'Move sound'], ['confirm', 'Confirm sound'], ['cancel', 'Cancel sound'], ['error', 'Error sound']].forEach(function (x) {
      snd.appendChild(W.select(x[1], tk.sfx[x[0]] || '', [['', 'Default (' + x[0] + ' cue)']].concat(sounds.map(function (r) { return [r.id, r.name]; })), function (v) { tk.sfx[x[0]] = v || null; tk.origin = 'user'; touch('ui-touch'); if (ART.audio) ART.audio.cue('ui', x[0]); }));
    });
    p.appendChild(snd);
    p.appendChild(el('p', 'muted a7-small', 'Pressing the controls in the preview plays these sounds. Turn the skin on in Playtest, Test room, to walk with it.'));
  }
  function viewTitle(host) {
    late();
    var b = cur(), tt = needKit(host, 'title');
    if (!tt) return;
    var p = recHead(host, tt, 'title', 'The first screen a player sees: the logo, a background, and a blinking prompt. The text follows the Charter title unless you type your own.');
    var R = res();
    var st = stage(function (ctx, t) {
      var bb = cur(), kit = I.kit(bb);
      EU.title(ctx, tt, { entries: P.entries(bb), font: kit.font, bgd: I.titleBg(bb, tt), tMs: t, w: R.w, h: R.h, unit: unit(), text: I.titleText(bb, tt) });
    }, 'Title screen preview');
    p.appendChild(st.wrap);
    var ctl = el('div', 'a7-ctl');
    ctl.appendChild(textField('Logo text', tt.text, I.titleText(b, null), function (v) { tt.text = String(v).trim() || null; tt.origin = 'user'; touch('ui-title'); }));
    ctl.appendChild(textField('Prompt', tt.prompt, 'Press Start', function (v) { tt.prompt = String(v); tt.origin = 'user'; touch('ui-title'); }));
    ctl.appendChild(textField('Credit line', tt.credit, 'Optional', function (v) { tt.credit = String(v).trim() || null; tt.origin = 'user'; touch('ui-title'); }));
    p.appendChild(ctl);
    var ctl2 = el('div', 'a7-ctl');
    ctl2.appendChild(W.select('Logo style', tt.style, EU.TITLE_STYLES.map(function (c) { return [c, c.charAt(0).toUpperCase() + c.slice(1)]; }), function (v) { tt.style = v; tt.origin = 'user'; touch('ui-title'); }));
    ctl2.appendChild(W.select('Layout', tt.layout, EU.TITLE_LAYOUTS.map(function (c) { return [c, c.charAt(0).toUpperCase() + c.slice(1)]; }), function (v) { tt.layout = v; tt.origin = 'user'; touch('ui-title'); }));
    ctl2.appendChild(W.slider('Logo scale', tt.scale, 1, 8, 1, function (v) { tt.scale = v; tt.origin = 'user'; touch('ui-title'); }));
    var bgs = ART.tiles ? ART.tiles.backgrounds(b) : [];
    ctl2.appendChild(W.select('Background', tt.bg || '', [['', 'Automatic (grassland)']].concat(bgs.map(function (g) { return [g.id, g.name]; })), function (v) { tt.bg = v || null; tt.origin = 'user'; touch('ui-title'); }));
    p.appendChild(ctl2);
    p.appendChild(colorRow(tt, 'title'));
  }
  var VIEWS = {
    icons: viewIcons,
    window: viewWindowFont,
    cursor: viewCursor,
    touch: viewTouch,
    title: viewTitle
  };
  function render(host) {
    var head = el('section', 'panel');
    head.innerHTML = '<h2 class="panel-title">Interface</h2><p class="muted">Icons, the window frame and pixel font, the cursor, the touch controls, and the title screen. Every preview draws at the Charter\'s resolution.</p>';
    host.appendChild(head);
    W.subtabs(host, SUBS, ui, VIEWS);
  }
  function focus(rid) {
    late();
    ui.focus = rid;
    var r = ART.records.get(rid), key = r && Kit.ids.prefixOf(rid) === 'uik_' ? I.keyOf(r) : null;
    ui.sub = key === 'font' ? 'window' : key || 'icons';
    Kit.rerender();
  }
  ART.WS.interface = { render: render, focus: focus, ui: ui, views: VIEWS, openIcon: openIcon };
})();
// === WS:INTERFACE END ===
