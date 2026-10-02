// === WS:WORLD BEGIN ===
(function () {
  'use strict';
  // The World Art tab: Tilesets, Interiors, Priority, Tile animations, and Backgrounds. Previews draw the way the game
  // will: a small map through ENGINE_RENDER.tiles.drawMap at logical size, scaled up by a whole number, animated by the
  // same stage loop the Motion tab uses.
  var U = Kit.util, el = U.el, esc = U.esc, ER = ENGINE_RENDER, ET = ER.tiles;
  var S = ART.sprites, P = ART.palette, M = ART.motion, TL = ART.tiles, W = ART.ui;
  ART.WS = ART.WS || {};
  var SUBS = [['tilesets', 'Tilesets'], ['interiors', 'Interiors'], ['priority', 'Priority'], ['anims', 'Tile animations'], ['backgrounds', 'Backgrounds']];
  var ui = { sub: 'tilesets', focus: null };
  function cur() { return Kit.bundle.current(); }
  function touch(reason) { Kit.bundle.touch(reason || 'world'); Kit.refreshValidation(); }
  function Tsz() { return S.tileSize(cur()); }
  function res() { var r = (cur().charter.specs || {}).resolution || {}; return { w: Number(r.w) || 256, h: Number(r.h) || 224 }; }
  function rowFor(r) { var d = el('div', 'a7-row'); d.dataset.rid = r.id; if (ui.focus === r.id) d.classList.add('a7-hit'); return d; }
  function needQuick(host, what) {
    var p = el('section', 'panel');
    p.innerHTML = '<h3 class="section-h">No ' + esc(what) + ' yet</h3><p class="muted">Quick Build makes twelve biome tilesets with climate keys, a town and a dungeon interior set, their palettes, the priority order, and a battle background for each, all without an API key.</p>';
    p.appendChild(W.button('Quick Build', 'spark', 'btn-primary', function () { ART.openQuickBuild(); }));
    host.appendChild(p);
  }
  function scaleFor(px) { return Math.max(1, Math.min(4, Math.floor(px / Tsz()))); }
  // A stage drawing a whole small map (below layer, then above layer).
  function mapStage(map, k, label) {
    var T = Tsz(), w = map.w * T, h = map.h * T;
    return M.stage(w, h, k, function (ctx, t) {
      ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, h);
      var cache = S.cache(), cam = { x: 0, y: 0, w: w, h: h };
      ET.drawMap(ctx, cache, map, cam, t);
      ET.drawMap(ctx, cache, map, cam, t, { layer: 'above' });
    }, label);
  }
  TL.mapStage = mapStage;
  // Every tile of a blob set (or one frame of an interior set) as one image, eight across.
  function sheetFrame(til, key, cols) {
    var T = Tsz(), k = S.cache(), n = 47, rows = Math.ceil(n / cols), gap = 1, w = cols * (T + gap) - gap, h = rows * (T + gap) - gap, rgba = new Uint8ClampedArray(w * h * 4);
    for (var i = 0; i < n; i++) {
      var f = k.tile(til.id, i, 0, key);
      if (!f) continue;
      var ox = (i % cols) * (T + gap), oy = Math.floor(i / cols) * (T + gap);
      for (var y = 0; y < T; y++) rgba.set(f.rgba.subarray(y * T * 4, (y + 1) * T * 4), ((oy + y) * w + ox) * 4);
    }
    return { w: w, h: h, rgba: rgba };
  }
  function flagChips(flags) { return TL.FLAG_LIST.filter(function (f) { return flags & f[1]; }).map(function (f) { return W.chip(f[2], f[0] === 'damage' ? 'warning' : 'muted'); }).join(' ') || W.chip('Blocked', 'muted'); }
  function band(c, k) { var v = c && c[k]; return Array.isArray(v) ? (v[0] === v[1] ? TL.CLIMATE[k][v[0]] : TL.CLIMATE[k][v[0]] + ' to ' + TL.CLIMATE[k][v[1]]) : '?'; }
  function num(label, value, min, max, step, onChange) {
    var id = 'a7w' + U.rand36(6), w = el('label', 'a7-num'); w.htmlFor = id;
    w.innerHTML = '<span>' + esc(label) + '</span>';
    var i = el('input', 'inp'); i.type = 'number'; i.id = id; i.min = min; i.max = max; i.step = step; i.value = value;
    i.addEventListener('change', function () { var v = Number(i.value); if (!isFinite(v)) return; onChange(Math.max(min, Math.min(max, v))); });
    w.appendChild(i); return w;
  }
  function text(label, value, onChange, max) {
    var id = 'a7w' + U.rand36(6), w = el('label', 'a7-num'); w.htmlFor = id;
    w.innerHTML = '<span>' + esc(label) + '</span>';
    var i = el('input', 'inp'); i.type = 'text'; i.id = id; i.value = value == null ? '' : value; i.maxLength = max || 60;
    i.addEventListener('change', function () { onChange(i.value.trim()); });
    w.appendChild(i); return w;
  }
  function colorBtn(label, hex, onPick) {
    var ent = P.entries(), m = hex ? ER.palette.nearest(ent, hex) : 0;
    var sw = ART.WS.palette.swatch(ent[m] || '#000000', m, { label: label, onClick: function () { ART.WS.palette.pickMaster(label, m).then(function (v) { if (v !== null && v !== undefined) onPick(v); }); } });
    var w = el('span', 'a7-colorbtn'); w.appendChild(sw); w.appendChild(el('span', null, esc(label))); return w;
  }
  function animControls(b, holder, key, done) {
    var a = holder[key], reg = b.art.tileAnimTypes || {}, types = Object.keys(reg).length ? Object.keys(reg) : Object.keys(ET.ANIM_TYPES);
    var c = el('div', 'a7-ctl');
    c.appendChild(W.select('Animation', a ? a.type : 'none', [['none', 'None']].concat(types.map(function (t) { return [t, (reg[t] && reg[t].label) || t]; })), function (v) {
      if (v === 'none') holder[key] = null;
      else { var d = reg[v] || ET.ANIM_TYPES[v] || {}; holder[key] = { type: v, technique: d.technique || 'cycle', params: U.clone(d.params || {}) }; }
      done('tile-anim');
    }));
    if (a) {
      a.params = a.params || {};
      c.appendChild(W.select('Technique', a.technique || 'cycle', ET.TECHNIQUES.map(function (t) { return [t, t === 'cycle' ? 'Palette cycle' : t === 'scroll' ? 'Scroll' : 'Redraw by phase']; }), function (v) { a.technique = v; done('tile-anim'); }));
      c.appendChild(W.slider('Frame (ms)', a.params.ms || 200, 40, 1500, 10, function (v) { a.params.ms = v; done('tile-anim'); }));
      if ((a.technique || 'cycle') === 'cycle') c.appendChild(W.select('Cycled material', a.params.mat || 'E', Object.keys(ET.RAMPS).map(function (m) { return [m, TL.MAT_LABELS[m]]; }), function (v) { a.params.mat = v; done('tile-anim'); }));
      else c.appendChild(W.slider('Frames', a.params.frames || 4, 2, 4, 1, function (v) { a.params.frames = v; done('tile-anim'); }));
    }
    return c;
  }
  function flagControls(holder, done) {
    var c = el('div', 'a7-ctl');
    TL.FLAG_LIST.forEach(function (f) { c.appendChild(W.toggle(f[2], !!(holder.flags & f[1]), function (on) { holder.flags = on ? (holder.flags | f[1]) : (holder.flags & ~f[1]); done('tile-flags'); })); });
    return c;
  }
  function materialControls(b, til, done) {
    var pal = TL.palFor(b, til), src = pal && pal.source || TL.styleMats(til), c = el('div', 'a7-ctl');
    Object.keys(ET.RAMPS).forEach(function (m) { c.appendChild(colorBtn(TL.MAT_LABELS[m], src[m], function (v) { TL.setMaterial(cur(), til, m, P.entries()[v]); done('tile-color'); })); });
    return c;
  }
  // Hand drawing: a template (2 by 3 tiles) or one interior tile, with the tileset's 32 slots.
  function drawByHand(b, til, item, done) {
    var T = Tsz(), auto = !item || item.autotile, w = auto ? 2 * T : T, h = auto ? 3 * T : T, idx;
    if (auto) idx = ET.template(b.art, til, T, 0, item ? item.key : null).idx;
    else idx = ET.tile(b.art, til, 0, 0, item.key, 0, T, null);
    var holder = item || til.templates;
    ART.pixelEditor.open({
      title: 'Draw ' + (item ? item.label || item.key : til.name) + (auto ? ' template' : ''), w: w, h: h, idx: idx, slots: (TL.palFor(b, til) || {}).slots, entries: P.entries(b),
      labels: TL.SLOT_NAMES, canRevert: !!(holder && holder.px),
      note: auto ? 'Top left is the preview, top right the four inner corners, the bottom two by two the outer corners, edges, and fill. Every one of the 47 tiles is assembled from these quarters.' : null
    }).then(function (r) {
      if (!r) return;
      if (r.action === 'revert') delete holder.px;
      else { var o = ART.pixelEditor.encode(r.idx, w, h, null); holder.px = o; }
      done('tile-draw');
    });
  }

  // ---------------------------------------------------------------- Tilesets
  function viewTilesets(host, repaint) {
    var b = cur(), list = TL.ordered(b);
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Biome tilesets</h3><p class="muted">Each biome is one 2 by 3 template that composes all 47 blob tiles, so any shape of terrain joins cleanly. Climate keys (temperature, moisture, elevation, each 0 to 4) are how a world generator picks the biome for a cell; invent a biome by duplicating one and changing its keys. Previews show each biome over the one below it in priority.</p>';
    host.appendChild(intro);
    if (!list.length) { needQuick(host, 'tilesets'); return; }
    var p = el('section', 'panel'), k = scaleFor(48);
    list.forEach(function (t) {
      var row = rowFor(t);
      row.appendChild(mapStage(TL.patch(b, t), k, t.name + ' preview'));
      var mid = el('div', 'a7-grow'), c = t.climate || {};
      mid.innerHTML = '<div class="a7-name"><strong>' + esc(t.name) + '</strong> ' + W.origin(t) + ' ' + W.chip((ET.STYLES[t.templates && t.templates.gen && t.templates.gen.style] || {}).label || (t.templates && t.templates.px ? 'hand drawn' : '?'), 'muted') + (c.feature ? ' ' + W.chip('feature: ' + c.feature, 'accent') : '') + (t.anim ? ' ' + W.chip(t.anim.type, 'accent') : '') + '</div>' +
        '<div class="muted a7-small">' + esc(band(c, 'temp') + ', ' + band(c, 'moist') + ', ' + band(c, 'elev')) + '</div><div class="a7-small">' + flagChips(t.flags) + '</div>';
      row.appendChild(mid);
      var acts = el('div', 'a7-acts');
      acts.appendChild(W.button('Edit', 'edit', '', function () { openTileset(t.id, repaint); }));
      acts.appendChild(W.button('Duplicate', 'slots', 'btn-ghost', function () { var n = TL.duplicate(cur(), t); touch('tile-dup'); ui.focus = n.id; repaint(); Kit.ui.toast('Made ' + n.name + '. Change its climate keys to place it.', 'ok'); }));
      acts.appendChild(W.button('Delete', 'trash', 'btn-ghost', function () {
        Kit.ui.confirm({ title: 'Delete ' + t.name + '?', message: 'Its palette and battle background go too.' + (t.origin === 'default' ? ' Quick Build will not bring this default back.' : ''), okLabel: 'Delete' }).then(function (ok) { if (!ok) return; TL.remove(cur(), t); touch('tile-del'); repaint(); });
      }));
      row.appendChild(acts);
      p.appendChild(row);
    });
    host.appendChild(p);
  }
  function openTileset(id, repaintList) {
    Kit.ui.drawer({
      title: 'Tileset',
      body: function (body, h) {
        function done(reason) { var r = ART.records.get(id); if (r) r.origin = 'user'; touch(reason); paint(); if (repaintList) repaintList(); }
        function paint() {
          var b = cur(), t = ART.records.get(id);
          U.clear(body);
          if (!t) { body.appendChild(el('div', 'empty-line', 'This tileset no longer exists.')); return; }
          h.setTitle(t.name);
          var T = Tsz(), figs = el('div', 'a7-figs');
          figs.appendChild(mapStage(TL.patch(b, t, 8, 5), scaleFor(40), t.name + ' preview'));
          body.appendChild(figs);
          var sh = el('div', 'a7-figs');
          sh.appendChild(S.canvas(sheetFrame(t, null, 8), Math.max(1, Math.min(3, Math.floor(260 / (8 * T)))), 'All 47 tiles of ' + t.name));
          var tp = ET.template(b.art, t, T, 0, null);
          sh.appendChild(S.canvas({ w: tp.w, h: tp.h, rgba: ER.sprite.rgba(tp.idx, (TL.palFor(b, t) || {}).slots, P.entries(b)) }, Math.max(1, Math.min(4, Math.floor(96 / (2 * T)))), 'Template of ' + t.name));
          body.appendChild(sh);
          body.appendChild(el('p', 'muted a7-small', esc('Left: the 47 blob tiles. Right: the template they are assembled from' + (t.templates && t.templates.px ? ' (hand drawn' + (tp.resampled ? ', resampled from another tile size' : '') + ').' : ', drawn by the ' + ((ET.STYLES[t.templates.gen.style] || {}).label || t.templates.gen.style) + ' generator.'))));
          var c1 = el('div', 'a7-ctl');
          c1.appendChild(text('Name', t.name, function (v) { if (v) { t.name = v; done('tile-name'); } }));
          if (t.templates && t.templates.gen) {
            var g = t.templates.gen; g.params = g.params || {};
            c1.appendChild(W.select('Style', g.style, Object.keys(ET.STYLES).filter(function (k) { return !ET.STYLES[k].interior; }).map(function (k) { return [k, ET.STYLES[k].label]; }), function (v) { g.style = v; done('tile-style'); }));
            c1.appendChild(W.slider('Detail', g.params.detail == null ? 0.5 : g.params.detail, 0, 1, 0.05, function (v) { g.params.detail = v; done('tile-detail'); }));
            c1.appendChild(W.slider('Rough edge', g.params.rough == null ? 1 : g.params.rough, 0, 2, 0.1, function (v) { g.params.rough = v; done('tile-rough'); }));
          }
          c1.appendChild(W.button('New seed', 'spark', 'btn-ghost', function () { t.seed = (Math.random() * 4294967295) >>> 0; done('tile-seed'); }));
          body.appendChild(c1);
          body.appendChild(el('h3', 'section-h', 'Climate keys'));
          var c = t.climate = U.isObj(t.climate) ? t.climate : { temp: [0, 4], moist: [0, 4], elev: [2, 2], feature: null };
          var c2 = el('div', 'a7-ctl');
          ['temp', 'moist', 'elev'].forEach(function (k) {
            var v = c[k] = Array.isArray(c[k]) ? c[k] : [0, 4];
            c2.appendChild(num((k === 'temp' ? 'Temperature' : k === 'moist' ? 'Moisture' : 'Elevation') + ' from', v[0], 0, 4, 1, function (x) { v[0] = x; if (v[1] < x) v[1] = x; done('tile-climate'); }));
            c2.appendChild(num('to', v[1], 0, 4, 1, function (x) { v[1] = Math.max(x, v[0]); done('tile-climate'); }));
          });
          c2.appendChild(text('Feature', c.feature || '', function (v) { c.feature = v || null; done('tile-feature'); }, 30));
          body.appendChild(c2);
          body.appendChild(el('p', 'muted a7-small', esc('Temperature 0 frigid to 4 hot; moisture 0 arid to 4 saturated; elevation 0 deep water, 1 shore, 2 lowland, 3 upland, 4 alpine. A feature biome (volcanic) is never matched by climate; the world generator places it by its own rule.')));
          body.appendChild(el('h3', 'section-h', 'Flags and animation'));
          body.appendChild(flagControls(t, done));
          body.appendChild(animControls(b, t, 'anim', done));
          if (t.templates && t.templates.px && t.anim && t.anim.technique && t.anim.technique !== 'cycle') body.appendChild(el('p', 'msg msg-warning', 'A hand drawn template animates by palette cycle only; scroll and phase need the generator.'));
          body.appendChild(el('h3', 'section-h', 'Fill variants'));
          var fv = t.fillVariants = Array.isArray(t.fillVariants) ? t.fillVariants : [];
          var c3 = el('div', 'a7-ctl');
          fv.forEach(function (v, i) { c3.appendChild(W.slider((v.mode === 'deco' ? 'Decorated' : 'Reseeded') + ' fill ' + (i + 1), v.weight || 0, 0, 0.5, 0.01, function (x) { v.weight = x; done('tile-variant'); })); });
          c3.appendChild(W.button('Add a variant', 'spark', 'btn-ghost', function () { fv.push({ weight: 0.1, mode: fv.length % 2 ? 'deco' : 'reseed' }); done('tile-variant'); }));
          if (fv.length) c3.appendChild(W.button('Remove the last', 'x', 'btn-ghost', function () { fv.pop(); done('tile-variant'); }));
          body.appendChild(c3);
          body.appendChild(el('p', 'muted a7-small', esc('Every tile of a texture repeats exactly. Variants replace a share of full fill cells with a reseeded middle or a small decoration, so wide areas stop looking like a grid.')));
          body.appendChild(el('h3', 'section-h', 'Colors'));
          body.appendChild(materialControls(b, t, done));
          var row = el('div', 'btn-row');
          row.appendChild(W.button(t.templates && t.templates.px ? 'Redraw the template' : 'Draw the template by hand', 'edit', '', function () { drawByHand(cur(), t, null, done); }));
          body.appendChild(row);
        }
        paint();
      }
    });
  }

  // ---------------------------------------------------------------- Interiors
  function viewInteriors(host, repaint) {
    var b = cur(), sets = TL.interiors(b);
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Interior sets</h3><p class="muted">Floors, walls, doors, stairs, counters, and furnishings for towns and dungeons. Walls, rugs, and channels are autotiles that join like terrain. Flags decide what the party can walk on; the above flag draws a tile over the party, like a beam over a doorway.</p>';
    host.appendChild(intro);
    if (!sets.length) { needQuick(host, 'interior sets'); return; }
    var T = Tsz();
    sets.forEach(function (t) {
      var p = el('section', 'panel');
      if (ui.focus === t.id) p.classList.add('a7-hit');
      p.dataset.rid = t.id;
      var head = el('div', 'a7-row');
      head.appendChild(mapStage(TL.patch(b, t, 7, 5), scaleFor(40), t.name + ' preview'));
      var mid = el('div', 'a7-grow');
      mid.innerHTML = '<div class="a7-name"><strong>' + esc(t.name) + '</strong> ' + W.origin(t) + ' ' + W.chip((t.tiles || []).length + ' tiles', 'muted') + '</div>';
      mid.appendChild(materialControls(b, t, function (reason) { touch(reason); repaint(); }));
      head.appendChild(mid);
      var acts = el('div', 'a7-acts');
      acts.appendChild(W.button('Duplicate', 'slots', 'btn-ghost', function () { var n = TL.duplicate(cur(), t); touch('tile-dup'); ui.focus = n.id; repaint(); }));
      acts.appendChild(W.button('Delete', 'trash', 'btn-ghost', function () { Kit.ui.confirm({ title: 'Delete ' + t.name + '?', message: 'Its palette and battle background go too.', okLabel: 'Delete' }).then(function (ok) { if (!ok) return; TL.remove(cur(), t); touch('tile-del'); repaint(); }); }));
      head.appendChild(acts);
      p.appendChild(head);
      var grid = el('div', 'a7-tilegrid');
      (t.tiles || []).forEach(function (it) {
        var f = S.cache().tile(t.id, it.autotile ? ET.BLOB_FULL : 0, 0, it.key), cell = el('button', 'a7-tilecell');
        cell.type = 'button';
        cell.appendChild(S.canvas(f, Math.max(2, Math.floor(48 / T)), it.label || it.key));
        cell.appendChild(el('span', null, esc(it.label || it.key)));
        cell.title = (it.label || it.key) + (it.autotile ? ' (autotile)' : '');
        cell.addEventListener('click', function () { openItem(t.id, it.key, repaint); });
        grid.appendChild(cell);
      });
      p.appendChild(grid);
      host.appendChild(p);
    });
  }
  function openItem(tilId, key, repaintList) {
    Kit.ui.drawer({
      title: 'Interior tile',
      body: function (body, h) {
        function done(reason) { var t = ART.records.get(tilId); if (t) t.origin = 'user'; touch(reason); paint(); if (repaintList) repaintList(); }
        function paint() {
          var b = cur(), t = ART.records.get(tilId), it = t && ET.item(t, key);
          U.clear(body);
          if (!it) { body.appendChild(el('div', 'empty-line', 'This tile no longer exists.')); return; }
          h.setTitle((it.label || it.key) + ' (' + t.name + ')');
          var T = Tsz(), figs = el('div', 'a7-figs');
          if (it.autotile) figs.appendChild(S.canvas(sheetFrame(t, key, 8), Math.max(1, Math.min(3, Math.floor(260 / (8 * T)))), 'All 47 tiles'));
          else figs.appendChild(M.stage(T, T, Math.max(3, Math.floor(96 / T)), function (ctx, tm) { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, T, T); if (it.under || it.autotile) { var fl = S.cache().tile(t.id, 0, 0, 'floor'); if (fl) ER.draw.frame(ctx, fl, 0, 0); } var f = S.cache().tile(t.id, it.autotile ? ET.BLOB_FULL : 0, ET.frameAt(b.art, it.anim, tm), key); if (f) ER.draw.frame(ctx, f, 0, 0); }, it.label || it.key));
          body.appendChild(figs);
          var c1 = el('div', 'a7-ctl');
          c1.appendChild(text('Label', it.label || '', function (v) { it.label = v || it.key; done('tile-label'); }));
          c1.appendChild(el('span', null, W.chip(it.autotile ? 'autotile' : 'single tile', 'muted')));
          body.appendChild(c1);
          body.appendChild(el('h3', 'section-h', 'Flags and animation'));
          body.appendChild(flagControls(it, done));
          body.appendChild(animControls(b, it, 'anim', done));
          var row = el('div', 'btn-row');
          row.appendChild(W.button(it.px ? 'Redraw by hand' : 'Draw by hand', 'edit', '', function () { drawByHand(cur(), t, it, done); }));
          body.appendChild(row);
        }
        paint();
      }
    });
  }

  // ---------------------------------------------------------------- Priority
  function viewPriority(host, repaint) {
    var b = cur(), list = TL.ordered(b);
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Stacking priority</h3><p class="muted">Where two biomes meet, the higher one draws its rounded edge over the lower one, which shows through. Lowest first. Moving a biome renumbers every priority to match this order, which is the order Day 148 stacks terrain in.</p>';
    host.appendChild(intro);
    if (!list.length) { needQuick(host, 'tilesets'); return; }
    var p = el('section', 'panel');
    function move(i, d) { var ids = list.map(function (t) { return t.id; }), j = i + d; if (j < 0 || j >= ids.length) return; var x = ids[i]; ids[i] = ids[j]; ids[j] = x; TL.setOrder(cur(), ids); touch('tile-order'); repaint(); }
    list.forEach(function (t, i) {
      var row = rowFor(t);
      row.appendChild(el('span', 'a7-fnum', String(i)));
      row.appendChild(mapStage(TL.patch(b, t), 1, t.name + ' over the biome below'));
      var mid = el('div', 'a7-grow');
      mid.innerHTML = '<div class="a7-name"><strong>' + esc(t.name) + '</strong></div><div class="muted a7-small">' + esc(i ? 'Draws over ' + list[i - 1].name + '.' : 'The base layer: everything draws over it.') + '</div>';
      row.appendChild(mid);
      var acts = el('div', 'a7-acts');
      var up = W.button('Lower', 'down', 'btn-ghost', function () { move(i, -1); }); up.disabled = i === 0; up.setAttribute('aria-label', 'Move ' + t.name + ' lower');
      var dn = W.button('Higher', 'up', 'btn-ghost', function () { move(i, 1); }); dn.disabled = i === list.length - 1; dn.setAttribute('aria-label', 'Move ' + t.name + ' higher');
      acts.appendChild(up); acts.appendChild(dn);
      row.appendChild(acts);
      p.appendChild(row);
    });
    host.appendChild(p);
  }

  // ---------------------------------------------------------------- Tile animations
  function viewAnims(host, repaint) {
    var b = cur(), reg = b.art.tileAnimTypes || {};
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Tile animation types</h3><p class="muted">Three techniques, at most four frames each. Palette cycle rotates one material\'s colors (any template, even a hand drawn one, can shimmer). Scroll slides the texture through the shape, for flowing water. Redraw by phase draws the generator at successive moments, for swaying canopy or a flickering torch. Each type sets defaults a tileset can override.</p>';
    host.appendChild(intro);
    var keys = Object.keys(reg);
    if (!keys.length) { needQuick(host, 'animation types'); return; }
    var users = {};
    TL.tilesets(b).forEach(function (t) {
      if (t.anim) (users[t.anim.type] = users[t.anim.type] || []).push({ til: t, key: null });
      (t.tiles || []).forEach(function (it) { if (it.anim) (users[it.anim.type] = users[it.anim.type] || []).push({ til: t, key: it.key, label: it.label }); });
    });
    var p = el('section', 'panel');
    keys.forEach(function (k) {
      var d = reg[k], row = el('div', 'a7-row');
      var mid = el('div', 'a7-grow');
      mid.innerHTML = '<div class="a7-name"><strong>' + esc(d.label || k) + '</strong> ' + W.chip(k, 'muted') + '</div>';
      d.params = d.params || {};
      var c = el('div', 'a7-ctl');
      c.appendChild(W.select('Technique', d.technique || 'cycle', ET.TECHNIQUES.map(function (t) { return [t, t]; }), function (v) { d.technique = v; touch('tile-type'); repaint(); }));
      c.appendChild(W.slider('Frame (ms)', d.params.ms || 200, 40, 1500, 10, function (v) { d.params.ms = v; touch('tile-type'); repaint(); }));
      mid.appendChild(c);
      var figs = el('div', 'a7-figs');
      (users[k] || []).slice(0, 6).forEach(function (u) {
        var T = Tsz(), sz = 3;
        if (u.key) figs.appendChild(M.stage(T, T, Math.max(2, Math.floor(40 / T)), function (ctx, tm) { var it = ET.item(u.til, u.key); var f = S.cache().tile(u.til.id, it && it.autotile ? ET.BLOB_FULL : 0, ET.frameAt(cur().art, it && it.anim, tm), u.key); ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, T, T); if (f) ER.draw.frame(ctx, f, 0, 0); }, u.label || u.key));
        else figs.appendChild(mapStage({ w: sz, h: sz, ground: Array(sz * sz).fill(u.til.id), deco: Array(sz * sz).fill(null) }, Math.max(1, Math.floor(40 / T)), u.til.name));
      });
      if (!(users[k] || []).length) figs.appendChild(el('span', 'muted a7-small', 'No tileset uses this type.'));
      mid.appendChild(figs);
      row.appendChild(mid);
      p.appendChild(row);
    });
    host.appendChild(p);
  }

  // ---------------------------------------------------------------- Backgrounds
  function bgStage(b, r, k, label) {
    var R = res();
    return M.stage(R.w, R.h, k, function (ctx, tm) { ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, R.w, R.h); ER.bg.draw(ctx, r, tm, R.w, R.h, { entries: P.entries(b) }); }, label);
  }
  function viewBackgrounds(host, repaint) {
    var b = cur(), list = TL.backgrounds(b);
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Battle backgrounds</h3><p class="muted">One per tileset, layered sky, far, mid, near, and floor. Parallax and drift scroll a layer, so clouds and waves move while the battle plays. Colors come from the master palette.</p>';
    host.appendChild(intro);
    if (!list.length) { needQuick(host, 'backgrounds'); return; }
    var p = el('section', 'panel');
    list.forEach(function (r) {
      var row = rowFor(r);
      row.appendChild(bgStage(b, r, 1, r.name));
      var mid = el('div', 'a7-grow');
      mid.innerHTML = '<div class="a7-name"><strong>' + esc(r.name) + '</strong> ' + W.origin(r) + '</div><div class="muted a7-small">' + esc((r.layers || []).map(function (L) { return L.kind + ': ' + (L.gen && L.gen.style); }).join(', ')) + '</div>';
      row.appendChild(mid);
      var acts = el('div', 'a7-acts');
      acts.appendChild(W.button('Edit', 'edit', '', function () { openBackground(r.id, repaint); }));
      row.appendChild(acts);
      p.appendChild(row);
    });
    host.appendChild(p);
  }
  function openBackground(id, repaintList) {
    Kit.ui.drawer({
      title: 'Battle background',
      body: function (body, h) {
        function done(reason) { var r = ART.records.get(id); if (r) r.origin = 'user'; touch(reason); paint(); if (repaintList) repaintList(); }
        function paint() {
          var b = cur(), r = ART.records.get(id);
          U.clear(body);
          if (!r) { body.appendChild(el('div', 'empty-line', 'This background no longer exists.')); return; }
          h.setTitle(r.name);
          body.appendChild(bgStage(b, r, Math.max(1, Math.min(3, Math.floor(560 / res().w))), r.name + ' preview'));
          r.layers = Array.isArray(r.layers) ? r.layers : [];
          r.layers.forEach(function (L, i) {
            var box = el('div', 'a7-layer'), g = L.gen = L.gen || { style: 'none', colors: [] };
            box.appendChild(el('div', 'a7-name', '<strong>' + esc(L.kind) + '</strong>'));
            var c = el('div', 'a7-ctl');
            c.appendChild(W.select('Style', g.style, (ER.bg.STYLES[L.kind] || []).map(function (s) { return [s, s]; }), function (v) { g.style = v; done('bg-style'); }));
            c.appendChild(W.slider('Parallax', L.parallax || 0, 0, 1, 0.05, function (v) { L.parallax = v; done('bg-parallax'); }));
            c.appendChild(W.slider('Drift', L.drift || 0, -1, 1, 0.05, function (v) { L.drift = v; done('bg-drift'); }));
            ['Dark', 'Middle', 'Light'].forEach(function (lab, j) {
              var ent = P.entries();
              c.appendChild(colorBtn(lab, ent[(g.colors || [])[j]] || null, function (v) { g.colors = g.colors || []; g.colors[j] = v; delete g.hex; done('bg-color'); }));
            });
            c.appendChild(W.button('New seed', 'spark', 'btn-ghost', function () { g.seed = (Math.random() * 4294967295) >>> 0; done('bg-seed'); }));
            c.appendChild(W.button('Remove layer', 'x', 'btn-ghost', function () { r.layers.splice(i, 1); done('bg-layer'); }));
            box.appendChild(c);
            body.appendChild(box);
          });
          var have = r.layers.map(function (L) { return L.kind; }), missing = ER.bg.KINDS.filter(function (k) { return have.indexOf(k) < 0; });
          if (missing.length) {
            var add = el('div', 'a7-ctl');
            add.appendChild(W.select('Add a layer', '', [['', 'Choose']].concat(missing.map(function (k) { return [k, k]; })), function (v) {
              if (!v) return;
              var ent = P.entries();
              r.layers.push({ kind: v, gen: { style: ER.bg.STYLES[v][0], seed: (Math.random() * 4294967295) >>> 0, colors: [ER.palette.outline(ent), Math.floor(ent.length / 2), ER.palette.nearest(ent, '#ffffff')] }, parallax: v === 'floor' ? 1 : 0.3, drift: 0 });
              done('bg-layer');
            }));
            body.appendChild(add);
          }
        }
        paint();
      }
    });
  }

  // ---------------------------------------------------------------- mount
  var VIEWS = { tilesets: viewTilesets, interiors: viewInteriors, priority: viewPriority, anims: viewAnims, backgrounds: viewBackgrounds };
  function render(host) {
    var head = el('section', 'panel');
    head.innerHTML = '<h2 class="panel-title">World Art</h2><p class="muted">Terrain tilesets with climate keys, interior sets, stacking priority, tile animation, and battle backgrounds. Tiles are ' + Tsz() + ' pixels, from the Charter, and every preview draws at that size. Walk them all in the Playtest tab\'s test room.</p>';
    head.appendChild(W.button('Open the test room', 'sword', 'btn-ghost', function () { if (ART.WS.playtest) ART.WS.playtest.ui.sub = 'room'; Kit.go('playtest'); }));
    host.appendChild(head);
    W.subtabs(host, SUBS, ui, VIEWS);

  }
  function focus(rid) {
    var r = ART.records.get(rid);
    if (!r) return;
    ui.focus = rid;
    ui.sub = Kit.ids.prefixOf(rid) === 'bgd_' ? 'backgrounds' : r.kind === 'interior' ? 'interiors' : 'tilesets';
    Kit.rerender();
  }
  ART.WS.world = { render: render, focus: focus, ui: ui, views: VIEWS, openTileset: openTileset, openItem: openItem, openBackground: openBackground, sheetFrame: sheetFrame };
})();
// === WS:WORLD END ===
