// === WS:PALETTE BEGIN ===
(function () {
  'use strict';
  // The Palette tab: master palette, colorways, tier palettes, and element palettes. WS:ART147 mounts it from ART.WS.
  var U = Kit.util, el = U.el, esc = U.esc, E = ENGINE_RENDER.palette, C = ENGINE_RENDER.color, P = ART.palette;
  ART.WS = ART.WS || {};
  var SUBS = [['master', 'Master'], ['colorways', 'Colorways'], ['tiers', 'Tier palettes'], ['elements', 'Element palettes']];
  var ui = { sub: 'master', sel: 0, focus: null };
  function cur() { return Kit.bundle.current(); }
  function touch(reason) { Kit.bundle.touch(reason || 'palette'); Kit.refreshValidation(); }
  function button(label, icon, cls, fn) {
    var b = el('button', 'btn' + (cls ? ' ' + cls : ''), (icon ? Kit.icon(icon) : '') + '<span>' + esc(label) + '</span>');
    b.type = 'button'; b.addEventListener('click', fn); return b;
  }
  function chip(text, kind) { return '<span class="chip chip-' + (kind || 'muted') + '">' + esc(text) + '</span>'; }
  function originChip(r) { return P.isKept(r) ? chip('edited', 'accent') : chip(r.origin || 'generated', 'muted'); }
  function newSeed() { return (Math.random() * 4294967295) >>> 0; }

  // ---------------------------------------------------------------- preview figures
  // Twelve pixel wide stand ins, drawn from slots so a palette reads as a character or a creature before Phase 2's
  // composer exists. Characters are slot indices in hex; X is the accent alias.
  var DOLL = ['000011110000', '000156651000', '001566665100', '015666666510', '015633336510', '015313313510', '001333333100',
    '000123321000', '000012210000', '001899998100', '018999999810', '138BCCCCB831', '13899XX99831', '012EEFFEE210',
    '001899998100', '001888888100', '001881188100', '001BB11BB100', '001CC11CC100', '001111111100'];
  var BLOB = ['000011110000', '000134431000', '001344443100', '013444444310', '013BD33BD310', '133BB33BB331', '133333333331',
    '123899A98321', '122333333221', '125555555521', '011111111110'];
  ART.PREVIEW = { DOLL: DOLL, BLOB: BLOB };
  function figure(tmpl, slots, entries, accent, scale) {
    var cv = document.createElement('canvas');
    cv.width = tmpl[0].length; cv.height = tmpl.length;
    cv.className = 'a7-fig';
    cv.style.width = (cv.width * (scale || 4)) + 'px'; cv.style.height = (cv.height * (scale || 4)) + 'px';
    cv.setAttribute('role', 'img');
    var ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) return cv;
    var acc = accent === 'metal' ? 'F' : 'C';
    tmpl.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var ch = row[x] === 'X' ? acc : row[x], s = parseInt(ch, 16);
        if (!s) continue;
        var m = slots[s];
        if (typeof m !== 'number' || !entries[m]) continue;
        ctx.fillStyle = entries[m]; ctx.fillRect(x, y, 1, 1);
      }
    });
    return cv;
  }
  ART.figure = figure;

  // ---------------------------------------------------------------- small widgets
  function swatch(hex, i, o) {
    o = o || {};
    var b = el('button', 'a7-sw');
    b.type = 'button';
    b.style.background = hex;
    b.setAttribute('aria-label', (o.label || 'Color ' + i) + ', ' + hex);
    b.title = (o.label || '#' + i) + ' ' + hex;
    if (o.num) b.innerHTML = '<span class="n" style="color:' + C.contrastInk(hex) + '">' + i + '</span>';
    if (o.pressed != null) b.setAttribute('aria-pressed', o.pressed ? 'true' : 'false');
    if (o.onClick) b.addEventListener('click', o.onClick);
    return b;
  }
  function strip(slots, entries, label) {
    var d = el('div', 'a7-strip');
    d.setAttribute('role', 'img');
    d.setAttribute('aria-label', (label || 'Palette') + ': ' + slots.map(function (s) { return s === null ? 'clear' : entries[s] || '?'; }).join(', '));
    slots.forEach(function (s) {
      var i = document.createElement('i');
      if (s === null) i.className = 'a7-clear';
      else i.style.background = entries[s] || '#000';
      d.appendChild(i);
    });
    return d;
  }
  function pickMaster(title, current) {
    return new Promise(function (resolve) {
      var entries = P.entries();
      Kit.ui.dialog({
        title: title || 'Choose a color', wide: true,
        body: function (body, h) {
          body.appendChild(el('p', 'muted', 'Choose a color from the master palette.'));
          var g = el('div', 'a7-sw-grid');
          entries.forEach(function (hex, i) { g.appendChild(swatch(hex, i, { num: true, pressed: i === current, onClick: function () { h.close(i); } })); });
          body.appendChild(g);
        },
        actions: [{ label: 'Cancel', kind: 'ghost', value: null }],
        onResult: function (v) { resolve(typeof v === 'number' ? v : null); }
      });
    });
  }
  function needMaster(host) {
    var p = el('section', 'panel');
    p.innerHTML = '<h3 class="section-h">No master palette yet</h3><p class="muted">Every other palette is fitted to the master. Build it from the bundle, or run Quick Build to fill every palette at once.</p>';
    var row = el('div', 'btn-row');
    row.appendChild(button('Build master palette', 'spark', 'btn-primary', function () { P.buildMaster(cur(), {}); touch('palette-master'); Kit.rerender(); }));
    row.appendChild(button('Quick Build', 'spark', '', function () { ART.openQuickBuild(); }));
    p.appendChild(row);
    host.appendChild(p);
  }
  function rowFor(r) { var d = el('div', 'a7-row'); d.dataset.rid = r.id; if (ui.focus === r.id) d.classList.add('a7-hit'); return d; }

  // ---------------------------------------------------------------- master
  function viewMaster(host, repaint) {
    var b = cur(), m = P.master(b), want = P.size(b);
    if (!m) { needMaster(host); return; }
    var entries = m.entries, use = P.usage(b);
    if (ui.sel >= entries.length) ui.sel = 0;
    var top = el('section', 'panel');
    top.innerHTML = '<h3 class="section-h">Master palette</h3><dl class="kv"><dt>Colors</dt><dd>' + entries.length + ' of ' + want + ' (Charter)</dd><dt>Seed</dt><dd><code>' + esc(m.seed) + '</code></dd><dt>Origin</dt><dd>' + originChip(m) + '</dd></dl>' +
      (entries.length !== want ? '<p class="msg msg-warning">The Charter asks for ' + want + ' colors. Regenerate to match it.</p>' : '') +
      '<p class="muted">Built in OKLab from the Charter\'s element colors and every enemy family\'s colors, plus skin, hair, terrain, and metal anchors, then filled with hue shifted ramps. Editing one color recolors everything that uses it. Regenerating refits every palette to the new colors.</p>';
    var row = el('div', 'btn-row');
    row.appendChild(button('Regenerate', 'spark', '', function () {
      Kit.ui.confirm({ title: 'Regenerate the master palette?', message: 'A new seed builds a new palette. Generated colorways, tier palettes, and element palettes refit to it. Palettes you edited keep their colors as closely as the new palette allows.', okLabel: 'Regenerate' }).then(function (ok) {
        if (!ok) return;
        P.buildMaster(b, { force: true, seed: newSeed() }); touch('palette-regenerate'); repaint();
        Kit.ui.toast('Master palette regenerated.', 'ok');
      });
    }));
    row.appendChild(button('Rebuild from bundle', 'check', 'btn-ghost', function () {
      P.buildMaster(b, { force: true, seed: m.seed }); touch('palette-rebuild'); repaint();
      Kit.ui.toast('Master palette rebuilt from the bundle with the same seed.', 'ok');
    }));
    top.appendChild(row);
    host.appendChild(top);

    var i = ui.sel, hex = entries[i], lch = C.hexToLch(hex) || [0, 0, 0], users = use[i] || [];
    var det = el('section', 'panel a7-detail');
    var big = el('div', 'a7-big'); big.style.background = hex; big.setAttribute('role', 'img'); big.setAttribute('aria-label', 'Selected color ' + hex);
    det.appendChild(big);
    var info = el('div');
    info.innerHTML = '<h3 class="section-h">Color ' + i + '</h3><dl class="kv"><dt>Hex</dt><dd><code>' + esc(hex) + '</code></dd><dt>OKLCH</dt><dd>L ' + lch[0].toFixed(2) + ', C ' + lch[1].toFixed(3) + ', h ' + Math.round(lch[2]) + '</dd><dt>Used by</dt><dd>' +
      (users.length ? users.length + ' palette' + (users.length === 1 ? '' : 's') + ': ' + users.slice(0, 5).map(function (id) { var r = ART.records.get(id); return esc(r ? r.name : id); }).join(', ') + (users.length > 5 ? ', and more' : '') : 'nothing yet') + '</dd></dl>';
    var edit = el('div', 'color-row');
    var ci = el('input'); ci.type = 'color'; ci.value = hex; ci.id = 'a7ColorPick'; ci.setAttribute('aria-label', 'Pick a new color for entry ' + i);
    var ti = el('input', 'inp a7-hex'); ti.type = 'text'; ti.value = hex; ti.maxLength = 7; ti.setAttribute('aria-label', 'Hex value for entry ' + i); ti.spellcheck = false;
    ci.addEventListener('input', function () { ti.value = ci.value; big.style.background = ci.value; });
    ti.addEventListener('input', function () { var h = C.normHex(ti.value); if (h) { ci.value = h; big.style.background = h; } });
    var ap = button('Apply', 'check', 'btn-primary', function () {
      var h = C.normHex(ti.value);
      if (!h) { Kit.ui.toast('Enter a color as #rrggbb.', 'warn'); return; }
      if (P.setEntry(b, i, h)) { touch('palette-entry'); repaint(); }
    });
    edit.appendChild(ci); edit.appendChild(ti); edit.appendChild(ap);
    info.appendChild(edit);
    det.appendChild(info);
    host.appendChild(det);

    var gp = el('section', 'panel');
    gp.appendChild(el('h3', 'section-h', 'All ' + entries.length + ' colors'));
    var g = el('div', 'a7-sw-grid');
    entries.forEach(function (h, j) { g.appendChild(swatch(h, j, { num: true, pressed: j === i, onClick: function () { ui.sel = j; repaint(); } })); });
    gp.appendChild(g);
    host.appendChild(gp);

    var ap2 = el('section', 'panel');
    ap2.appendChild(el('h3', 'section-h', 'Anchors'));
    ap2.appendChild(el('p', 'muted', 'The colors the palette was built to honor, and how close the master comes to each. A distance under 0.02 is a visual match.'));
    var list = el('div', 'a7-anchors');
    (m.anchors || []).forEach(function (a) {
      var n = E.nearest(entries, a.hex), d = C.distHex(a.hex, entries[n]);
      var src = a.src ? nameOf(a.src) : '';
      var r = el('div', 'a7-anchor');
      r.innerHTML = '<span class="a7-dot" style="background:' + esc(a.hex) + '"></span><span class="a7-dot" style="background:' + esc(entries[n]) + '"></span><span>' + esc(a.role + (src ? ': ' + src : '')) + '</span><span class="muted">#' + n + ', ' + (d < 0.02 ? 'match' : 'distance ' + d.toFixed(2)) + '</span>';
      list.appendChild(r);
    });
    ap2.appendChild(list);
    host.appendChild(ap2);
  }

  // ---------------------------------------------------------------- shared palette editor (local and tier)
  function openEditor(rid, repaintList) {
    var b = cur();
    Kit.ui.drawer({
      title: 'Edit palette',
      onClose: function () { if (repaintList) repaintList(); },
      body: function (body, h) {
        function paint() {
          var r = ART.records.get(rid, b), entries = P.entries(b);
          U.clear(body);
          if (!r) { body.appendChild(el('div', 'empty-line', 'This palette no longer exists.')); return; }
          h.setTitle(r.name);
          var tier = r.kind === 'tier', ramps = tier ? E.ENEMY_RAMPS : E.RAMPS;
          var head = el('div', 'a7-edhead');
          head.appendChild(figure(tier ? BLOB : DOLL, r.slots, entries, r.colorway && r.colorway.accent, 6));
          var meta = el('div', 'a7-grow');
          meta.innerHTML = '<dl class="kv"><dt>Record</dt><dd><code class="id">' + esc(r.id) + '</code></dd><dt>For</dt><dd>' + esc(subjectLabel(r)) + '</dd><dt>Origin</dt><dd>' + originChip(r) + '</dd></dl>';
          meta.appendChild(strip(r.slots, entries, r.name));
          head.appendChild(meta);
          body.appendChild(head);
          Object.keys(ramps).forEach(function (mat) {
            var row = el('div', 'a7-mat');
            row.appendChild(el('div', 'a7-mat-l', esc(P.MAT_LABELS[mat] || mat)));
            var st = el('div', 'a7-steps');
            ramps[mat].forEach(function (slot, k) {
              var idx = r.slots[slot];
              st.appendChild(swatch(entries[idx] || '#000000', idx, { label: (P.MAT_LABELS[mat] || mat) + ' step ' + (k + 1), onClick: function () {
                pickMaster((P.MAT_LABELS[mat] || mat) + ' step ' + (k + 1), idx).then(function (v) {
                  if (v === null) return;
                  if (tier) { r.slots[slot] = v; r.origin = 'user'; } else P.setStep(b, r, mat, k, v);
                  touch('palette-step'); paint();
                });
              } }));
            });
            row.appendChild(st);
            body.appendChild(row);
          });
          if (!tier) {
            var ar = el('div', 'a7-mat');
            var lab = el('label', 'a7-mat-l', 'Accent'); lab.htmlFor = 'a7Accent';
            var sel = el('select', 'inp'); sel.id = 'a7Accent';
            sel.innerHTML = '<option value="clothB">Cloth B</option><option value="metal">Metal</option>';
            sel.value = r.colorway && r.colorway.accent === 'metal' ? 'metal' : 'clothB';
            sel.addEventListener('change', function () { P.setAccent(b, r, sel.value); touch('palette-accent'); paint(); });
            ar.appendChild(lab); ar.appendChild(sel);
            body.appendChild(ar);
          } else if (r.derivedFrom) {
            body.appendChild(el('p', 'muted', 'Derived from ' + esc(subjectLabel(r)) + ', tier ' + r.derivedFrom.tier + ', hue shift ' + r.derivedFrom.hueShift + ' degrees' + (r.derivedFrom.rampOffset ? ', lightness offset ' + r.derivedFrom.rampOffset : '') + (r.derivedFrom.inverted ? ', inverted' : '') + '.'));
          }
          var row2 = el('div', 'btn-row');
          if (!tier) row2.appendChild(button('Reroll', 'spark', '', function () { P.reroll(b, r); touch('palette-reroll'); paint(); }));
          if (!tier && ART.ai) row2.appendChild(ART.ai.button('colorway', r.id, paint));
          row2.appendChild(button('Reset to generated', 'check', 'btn-ghost', function () {
            r.origin = 'procedural';
            if (tier) P.buildTiers(b, {}); else P.refitLocal(b, r);
            touch('palette-reset'); paint();
          }));
          body.appendChild(row2);
        }
        paint();
      }
    });
  }
  function nameOf(id) {
    var b = cur(), p = Kit.ids.prefixOf(id), m = p && b.rules && U.isObj(b.rules[p]) ? b.rules[p] : null;
    return m && m[id] && m[id].name ? m[id].name : String(id);
  }
  function subjectLabel(r) {
    var s = r.subject || {};
    if (s.kind === 'chr' || s.kind === 'fam') return nameOf(s.ref);
    if (s.kind === 'role' && /^npc:/.test(s.ref)) return 'NPC ' + s.ref.slice(4);
    if (s.kind === 'role' && s.ref === 'villain') return 'The villain';
    if (s.kind === 'element') return 'Element ' + s.ref;
    return s.ref || '';
  }

  // ---------------------------------------------------------------- colorways
  function viewColorways(host, repaint) {
    var b = cur(), entries = P.entries(b), locals = P.locals(b);
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Colorways</h3><p class="muted">Each character, the villain, and each NPC archetype gets a 16 slot local palette: slot 0 clear, 1 outline, then skin, hair, cloth A, cloth B (three steps each), and a two step metal ramp. Accent points at cloth B or metal. Colors come from each record\'s seed, and party members are spread around the hue wheel.</p>';
    host.appendChild(intro);
    if (!locals.length) { intro.appendChild(el('div', 'empty-line', 'No colorways yet. Run Quick Build.')); return; }
    var groups = [['Party', function (r) { return r.subject && r.subject.kind === 'chr'; }], ['Villain', function (r) { return r.subject && r.subject.ref === 'villain'; }],
      ['NPC archetypes', function (r) { return r.subject && /^npc:/.test(r.subject.ref); }]];
    var placed = {};
    groups.push(['Other', function (r) { return !placed[r.id]; }]);
    groups.forEach(function (g) {
      var rs = locals.filter(function (r) { return !placed[r.id] && g[1](r); });
      if (!rs.length) return;
      var p = el('section', 'panel');
      p.appendChild(el('h3', 'section-h', esc(g[0])));
      rs.forEach(function (r) {
        placed[r.id] = 1;
        var row = rowFor(r);
        var fig = figure(DOLL, r.slots, entries, r.colorway && r.colorway.accent, 3);
        fig.setAttribute('aria-label', r.name + ' preview');
        row.appendChild(fig);
        var mid = el('div', 'a7-grow');
        mid.innerHTML = '<div class="a7-name"><strong>' + esc(r.name) + '</strong> ' + originChip(r) + '</div><div class="muted a7-small">' + esc(subjectLabel(r)) + '</div>';
        mid.appendChild(strip(r.slots, entries, r.name));
        row.appendChild(mid);
        row.appendChild(button('Edit', 'edit', '', function () { openEditor(r.id, repaint); }));
        p.appendChild(row);
      });
      host.appendChild(p);
    });
  }

  // ---------------------------------------------------------------- tiers
  function viewTiers(host, repaint) {
    var b = cur(), entries = P.entries(b), tiers = P.tiers(b);
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Tier palettes</h3><p class="muted">One palette per enemy family record. Day 146 stores each tier as its own family with shifted colors; each palette is fitted from those colors. When a shift lands on the same master colors as a sibling tier, which happens at small palette sizes, the ramps move in lightness and then invert so every tier stays distinct.</p>';
    var row = el('div', 'btn-row');
    row.appendChild(button('Regenerate tier palettes', 'spark', '', function () { var r = P.buildTiers(b, {}); touch('palette-tiers'); repaint(); Kit.ui.toast('Tier palettes: ' + r.created + ' new, ' + r.refreshed + ' refreshed, ' + r.kept + ' kept.', 'ok'); }));
    intro.appendChild(row);
    host.appendChild(intro);
    if (!tiers.length) { intro.appendChild(el('div', 'empty-line', 'No tier palettes yet. The bundle needs enemy families, then Quick Build.')); return; }
    var groups = {}, order = [];
    tiers.forEach(function (r) { var k = (r.derivedFrom && r.derivedFrom.base) || r.id; if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(r); });
    order.forEach(function (k) {
      var rs = groups[k].sort(function (a, z) { return ((a.derivedFrom || {}).tier || 0) - ((z.derivedFrom || {}).tier || 0); });
      var base = cur().rules.fam_ && cur().rules.fam_[k];
      var p = el('section', 'panel');
      p.appendChild(el('h3', 'section-h', esc(base ? base.name : k)));
      rs.forEach(function (r) {
        var d = r.derivedFrom || {}, row2 = rowFor(r);
        var fig = figure(BLOB, r.slots, entries, null, 4);
        fig.setAttribute('aria-label', r.name + ' preview');
        row2.appendChild(fig);
        var mid = el('div', 'a7-grow');
        mid.innerHTML = '<div class="a7-name"><strong>' + esc(subjectLabel(r)) + '</strong> ' + chip('Tier ' + (d.tier || 1), 'accent') + ' ' + originChip(r) +
          (d.hueShift ? ' ' + chip('hue ' + (d.hueShift > 0 ? '+' : '') + d.hueShift) : '') + (d.rampOffset ? ' ' + chip('lightness ' + (d.rampOffset > 0 ? '+' : '') + d.rampOffset, 'warning') : '') +
          (d.inverted ? ' ' + chip('inverted', 'warning') : '') + (r.collapsed ? ' ' + chip('same as a sibling', 'error') : '') + '</div>';
        mid.appendChild(strip(r.slots, entries, r.name));
        row2.appendChild(mid);
        row2.appendChild(button('Edit', 'edit', '', function () { openEditor(r.id, repaint); }));
        p.appendChild(row2);
      });
      host.appendChild(p);
    });
  }

  // ---------------------------------------------------------------- elements
  function viewElements(host, repaint) {
    var b = cur(), entries = P.entries(b), fx = P.effects(b);
    var els = (b.charter.ruleset && b.charter.ruleset.elements) || [];
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Element palettes</h3><p class="muted">Four steps per element (dark, base, light, hot), plus a flash and a tint, fitted from the Charter\'s element color. Particle shape and screen behavior give each element its identity even when the palette cannot.</p>' +
      (entries.length <= 2 ? '<p class="msg msg-warning">At two colors every element palette is identical. Shape and screen carry the difference.</p>' : '');
    host.appendChild(intro);
    if (!fx.length) { intro.appendChild(el('div', 'empty-line', els.length ? 'No element palettes yet. Run Quick Build.' : 'The Charter defines no elements.')); return; }
    var p = el('section', 'panel');
    fx.forEach(function (r) {
      var e = els.filter(function (x) { return x.key === (r.subject || {}).ref; })[0];
      var row = rowFor(r);
      var dot = el('span', 'a7-big a7-big-s'); dot.style.background = (e && e.color) || '#888'; dot.setAttribute('role', 'img'); dot.setAttribute('aria-label', 'Charter color ' + ((e && e.color) || 'none'));
      row.appendChild(dot);
      var mid = el('div', 'a7-grow');
      mid.innerHTML = '<div class="a7-name"><strong>' + esc(r.name) + '</strong> ' + originChip(r) + '</div>';
      var sw = el('div', 'a7-steps');
      function slotBtn(label, get, set) {
        var idx = get();
        sw.appendChild(swatch(entries[idx] || '#000', idx, { label: r.name + ' ' + label, onClick: function () {
          pickMaster(r.name + ': ' + label, idx).then(function (v) { if (v === null) return; set(v); r.origin = 'user'; touch('palette-efx'); repaint(); });
        } }));
      }
      ['dark', 'base', 'light', 'hot'].forEach(function (lab, k) { slotBtn(lab, function () { return r.palette[k]; }, function (v) { r.palette[k] = v; }); });
      sw.appendChild(el('span', 'a7-sep', ''));
      slotBtn('flash', function () { return r.flash; }, function (v) { r.flash = v; });
      slotBtn('tint', function () { return r.tint; }, function (v) { r.tint = v; });
      mid.appendChild(sw);
      var ctl = el('div', 'a7-ctl');
      function sel(label, val, opts, set) {
        var id = 'a7s' + U.rand36(5), w = el('label', 'a7-sel');
        w.htmlFor = id; w.innerHTML = '<span>' + esc(label) + '</span>';
        var s = el('select', 'inp'); s.id = id;
        s.innerHTML = opts.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('');
        s.value = val;
        s.addEventListener('change', function () { set(s.value); touch('palette-efx'); });
        w.appendChild(s); ctl.appendChild(w);
      }
      r.particle = U.isObj(r.particle) ? r.particle : { shape: 'spark' };
      sel('Particle', r.particle.shape, P.SHAPES, function (v) { r.particle.shape = v; });
      sel('Screen', r.screen || 'none', P.SCREENS, function (v) { r.screen = v; });
      mid.appendChild(ctl);
      row.appendChild(mid);
      p.appendChild(row);
    });
    host.appendChild(p);
  }

  var VIEWS = { master: viewMaster, colorways: viewColorways, tiers: viewTiers, elements: viewElements };
  function render(host) {
    var head = el('section', 'panel');
    head.innerHTML = '<h2 class="panel-title">Palette</h2><p class="muted">The master palette every sprite, tile, and effect is drawn from, with the colorways, tier palettes, and element palettes fitted to it.</p>';
    host.appendChild(head);
    var tabs = el('div', 'a7-sub'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Palette sections');
    var panel = el('div', 'a7-subpanel'); panel.setAttribute('role', 'tabpanel');
    SUBS.forEach(function (s) {
      var t = el('button', null, esc(s[1])); t.type = 'button'; t.setAttribute('role', 'tab'); t.dataset.sub = s[0];
      t.addEventListener('click', function () { ui.sub = s[0]; ui.focus = null; paint(); });
      tabs.appendChild(t);
    });
    host.appendChild(tabs); host.appendChild(panel);
    function paint() {
      Array.prototype.forEach.call(tabs.children, function (t) { t.setAttribute('aria-selected', t.dataset.sub === ui.sub ? 'true' : 'false'); });
      U.clear(panel);
      if (ui.sub !== 'master' && !P.master()) needMaster(panel);
      else VIEWS[ui.sub](panel, paint);
      if (ui.focus) {
        var hit = panel.querySelector('[data-rid="' + ui.focus + '"]');
        if (hit && hit.scrollIntoView) setTimeout(function () { try { hit.scrollIntoView({ block: 'center' }); } catch (e) {} }, 0);
      }
    }
    paint();
  }
  function focus(rid) {
    var r = ART.records.get(rid);
    if (!r) return;
    ui.focus = rid;
    ui.sub = Kit.ids.prefixOf(rid) === 'efx_' ? 'elements' : r.kind === 'tier' ? 'tiers' : r.kind === 'local' ? 'colorways' : 'master';
    Kit.rerender();
  }
  ART.WS.palette = { render: render, focus: focus, ui: ui, views: VIEWS, openEditor: openEditor, pickMaster: pickMaster, swatch: swatch };
})();
// === WS:PALETTE END ===
