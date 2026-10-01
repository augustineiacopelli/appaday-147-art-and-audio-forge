// === WS:INTERFACE BEGIN ===
(function () {
  'use strict';
  // The Interface tab. Phase 2 delivers Icons; Window and font, Cursor, Touch skin, and Title arrive in Phase 5.
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
  function later(title, lead) { return function (host) { host.appendChild(Kit.ui.stub({ title: title, lead: lead, status: 'Arrives in Phase 5.', icon: 'slots' })); }; }
  var VIEWS = {
    icons: viewIcons,
    window: later('Window and font', 'Classic window frames, the gradient, and the original 5 by 7 pixel font.'),
    cursor: later('Cursor', 'The menu cursor and its bob animation.'),
    touch: later('Touch skin', 'The on screen controls for the Charter\'s mobileControls scheme.'),
    title: later('Title', 'The title screen: logo text, background, layout, and prompt.')
  };
  function render(host) {
    var head = el('section', 'panel');
    head.innerHTML = '<h2 class="panel-title">Interface</h2><p class="muted">Icons now; the window, font, cursor, touch skin, and title screen arrive with the battle presenter in Phase 5.</p>';
    host.appendChild(head);
    W.subtabs(host, SUBS, ui, VIEWS);
  }
  function focus(rid) { ui.focus = rid; ui.sub = 'icons'; Kit.rerender(); }
  ART.WS.interface = { render: render, focus: focus, ui: ui, views: VIEWS, openIcon: openIcon };
})();
// === WS:INTERFACE END ===
