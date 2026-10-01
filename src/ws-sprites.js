// === WS:SPRITES BEGIN ===
(function () {
  'use strict';
  // The Sprites tab: Characters, Villain and NPCs, Bestiary, Portraits, and Parts, plus the drawers that edit them.
  var U = Kit.util, el = U.el, esc = U.esc, ES = ENGINE_RENDER.sprite, EP = ENGINE_RENDER.portrait, EC = ENGINE_RENDER.codec;
  var S = ART.sprites, P = ART.palette;
  ART.WS = ART.WS || {};
  var SUBS = [['characters', 'Characters'], ['cast', 'Villain and NPCs'], ['bestiary', 'Bestiary'], ['portraits', 'Portraits'], ['parts', 'Parts']];
  var ui = { sub: 'characters', focus: null };
  var ENEMY_LABELS = ['Clear', 'Outline', 'Body dark', 'Body', 'Body light', 'Shade dark', 'Shade', 'Shade light', 'Accent dark', 'Accent', 'Accent light', 'Eye dark', 'Eye', 'Eye light', 'Metal dark', 'Metal light'];
  var LAYER_LABELS = { shadow: 'Shadow', back: 'Back gear', body: 'Body', legs: 'Legs', torso: 'Torso', head: 'Head', hair: 'Hair', front: 'Front gear' };
  var POSE_LABELS = { stand: 'Stand', stepA: 'Step A', stepB: 'Step B', idle: 'Battle idle' };
  function cur() { return Kit.bundle.current(); }
  function touch(reason) { Kit.bundle.touch(reason || 'sprites'); Kit.refreshValidation(); }
  // Shared small widgets (WS:INTERFACE uses them too).
  var W = ART.ui = ART.ui || {};
  W.button = function (label, icon, cls, fn) {
    var b = el('button', 'btn' + (cls ? ' ' + cls : ''), (icon ? Kit.icon(icon) : '') + '<span>' + esc(label) + '</span>');
    b.type = 'button'; if (fn) b.addEventListener('click', fn); return b;
  };
  W.chip = function (text, kind) { return '<span class="chip chip-' + (kind || 'muted') + '">' + esc(text) + '</span>'; };
  W.origin = function (r) { return S.isKept(r) ? W.chip('edited', 'accent') : W.chip(r.origin === 'default' ? 'default' : 'generated', 'muted'); };
  W.select = function (label, value, options, onChange) {
    var id = 'a7s' + U.rand36(6), w = el('label', 'a7-sel'); w.htmlFor = id; w.innerHTML = '<span>' + esc(label) + '</span>';
    var s = el('select', 'inp'); s.id = id;
    s.innerHTML = options.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join('');
    s.value = value == null ? '' : value;
    s.addEventListener('change', function () { onChange(s.value); });
    w.appendChild(s); return w;
  };
  W.slider = function (label, value, min, max, step, onChange) {
    var id = 'a7r' + U.rand36(6), w = el('label', 'a7-range'); w.htmlFor = id;
    var out = el('output', null, esc(String(value)));
    w.innerHTML = '<span>' + esc(label) + '</span>';
    var r = el('input'); r.type = 'range'; r.id = id; r.min = min; r.max = max; r.step = step; r.value = value;
    r.addEventListener('input', function () { out.textContent = r.value; });
    r.addEventListener('change', function () { onChange(Number(r.value)); });
    w.appendChild(r); w.appendChild(out); return w;
  };
  W.toggle = function (label, on, onChange) {
    var id = 'a7t' + U.rand36(6), w = el('label', 'a7-check'); w.htmlFor = id;
    var c = el('input'); c.type = 'checkbox'; c.id = id; c.checked = !!on;
    c.addEventListener('change', function () { onChange(c.checked); });
    w.appendChild(c); w.appendChild(el('span', null, esc(label))); return w;
  };
  W.figure = function (f, px, label) { return S.canvas(f, S.fit(f, px), label); };
  function rowFor(r) { var d = el('div', 'a7-row'); d.dataset.rid = r.id; if (ui.focus === r.id) d.classList.add('a7-hit'); return d; }
  function nameOf(id) { var b = cur(), p = Kit.ids.prefixOf(id), m = p && b.rules && U.isObj(b.rules[p]) ? b.rules[p] : null; return m && m[id] && m[id].name ? m[id].name : String(id); }
  function needQuick(host, what) {
    var p = el('section', 'panel');
    p.innerHTML = '<h3 class="section-h">No ' + esc(what) + ' yet</h3><p class="muted">Quick Build creates the master palette, colorways, the part library, and a sprite for every character, the villain, each NPC archetype, and every enemy family, all without an API key.</p>';
    p.appendChild(W.button('Quick Build', 'spark', 'btn-primary', function () { ART.openQuickBuild(); }));
    host.appendChild(p);
  }
  function frameOf(spr, pose, dir) { return S.cache().sprite(spr.id, pose, dir); }
  function previews(spr, px) {
    var d = el('div', 'a7-figs'), dirs = spr.mode === 'battle' ? [['idle', spr.kind === 'enemy' ? 'right' : 'left']] : [['stand', 'down'], ['stand', 'right'], ['stand', 'up']];
    dirs.forEach(function (pd) { d.appendChild(W.figure(frameOf(spr, pd[0], pd[1]), px || 64, spr.name + ', ' + POSE_LABELS[pd[0]] + ' ' + pd[1])); });
    return d;
  }

  // ---------------------------------------------------------------- pixel editing of one frame
  function editFrame(spr, pose, dir, after) {
    var b = cur(), f = frameOf(spr, pose, dir), pal = ART.records.get(spr.pal);
    if (!f) return;
    var base = ES.base(b.art, spr), gen = ES.compose(ES.spec(b.art, spr, S.tileSize(b)), pose, dir);
    var key = pose + '.' + dir, own = spr.overrides && spr.overrides[key];
    var note = spr.shares ? 'This sprite shares its look with ' + (base.name || base.id) + '. Pixels you save here apply to this sprite only.' : 'Saved pixels replace the generated frame for this pose and direction. Other frames still follow the recipe.';
    ART.pixelEditor.open({ title: spr.name + ': ' + (POSE_LABELS[pose] || pose) + ', ' + dir, w: f.w, h: f.h, idx: f.idx, slots: pal && pal.slots, entries: P.entries(b),
      labels: spr.kind === 'enemy' ? ENEMY_LABELS : null, note: note, canRevert: !!own }).then(function (res) {
      if (!res) return;
      spr.overrides = U.isObj(spr.overrides) ? spr.overrides : {};
      if (res.action === 'revert') { delete spr.overrides[key]; touch('sprite-revert'); Kit.ui.toast('Frame reverted to the generated pixels.', 'ok'); }
      else {
        var enc = ART.pixelEditor.encode(res.idx, f.w, f.h, gen.idx);
        if (!enc) delete spr.overrides[key]; else { spr.overrides[key] = enc; spr.origin = 'user'; }
        touch('sprite-pixels');
        Kit.ui.toast(enc ? 'Pixels saved for ' + (POSE_LABELS[pose] || pose) + ', ' + dir + '.' : 'No change from the generated frame, so nothing was stored.', 'ok');
      }
      if (after) after();
    });
  }
  ART.editSpriteFrame = editFrame;

  // ---------------------------------------------------------------- the sprite drawer
  function partOptions(layer, rig, allowNone) {
    var opts = S.parts().filter(function (p) { return p.layer === layer && (p.rig || 'humanoid') === rig; }).map(function (p) { return [p.id, p.name]; });
    return allowNone ? [['', 'None']].concat(opts) : opts;
  }
  function openSprite(id) {
    Kit.ui.drawer({
      title: 'Sprite',
      body: function (body, h) {
        function paint() {
          var b = cur(), spr = ART.records.get(id);
          U.clear(body);
          if (!spr) { body.appendChild(el('div', 'empty-line', 'This sprite no longer exists.')); return; }
          h.setTitle(spr.name);
          var base = ES.base(b.art, spr), rc = base.recipe || {}, pal = ART.records.get(spr.pal);
          var head = el('div', 'a7-edhead');
          head.appendChild(previews(spr, 96));
          var meta = el('div', 'a7-grow');
          meta.innerHTML = '<dl class="kv"><dt>Record</dt><dd><code class="id">' + esc(spr.id) + '</code></dd><dt>Kind</dt><dd>' + esc(spr.kind + ', ' + spr.mode) + '</dd><dt>Origin</dt><dd>' + W.origin(spr) + '</dd><dt>Palette</dt><dd>' + esc(pal ? pal.name : 'missing') + '</dd></dl>';
          if (pal) meta.appendChild(W.button('Edit colorway', 'chart', 'btn-ghost', function () { if (ART.WS.palette && ART.WS.palette.openEditor) ART.WS.palette.openEditor(pal.id, paint); }));
          head.appendChild(meta);
          body.appendChild(head);
          if (spr.shares) {
            var sh = el('div', 'a7-note');
            sh.innerHTML = 'Shares its recipe with <strong>' + esc(base.name) + '</strong>, so changes there show up here too, in this sprite\'s own palette.';
            body.appendChild(sh);
            var row = el('div', 'btn-row');
            row.appendChild(W.button('Edit ' + base.name, 'edit', '', function () { h.close(); openSprite(base.id); }));
            row.appendChild(W.button('Give it its own look', 'spark', 'btn-ghost', function () { S.unshare(b, spr); touch('sprite-unshare'); paint(); }));
            body.appendChild(row);
          } else if (spr.kind !== 'enemy') {
            body.appendChild(el('h3', 'section-h', 'Look'));
            var ctl = el('div', 'a7-ctl');
            ['body', 'head', 'hair', 'torso', 'legs', 'back', 'front'].forEach(function (layer) {
              ctl.appendChild(W.select(LAYER_LABELS[layer], (rc.parts || {})[layer] || '', partOptions(layer, 'humanoid', layer === 'back' || layer === 'front' || layer === 'hair'), function (v) {
                rc.parts = rc.parts || {}; rc.parts[layer] = v || null;
                var p = v && ART.records.get(v); rc.look = rc.look || {}; rc.look[layer] = p && p.lib ? p.lib.split('.')[1] : null;
                spr.origin = 'user'; touch('sprite-part'); paint();
              }));
            });
            ctl.appendChild(W.select('Accent', rc.accent || 'clothB', [['clothB', 'Cloth B'], ['metal', 'Metal'], ['clothA', 'Cloth A']], function (v) { rc.accent = v; spr.origin = 'user'; touch('sprite-accent'); paint(); }));
            body.appendChild(ctl);
            var pr = rc.proportions = rc.proportions || { height: 1.5, headScale: 1 };
            var ctl2 = el('div', 'a7-ctl');
            ctl2.appendChild(W.slider('Height (tiles)', pr.height || 1.5, 1.25, 2, 0.05, function (v) { pr.height = v; spr.origin = 'user'; touch('sprite-prop'); paint(); }));
            ctl2.appendChild(W.slider('Head size', pr.headScale || 1, 0.8, 1.3, 0.05, function (v) { pr.headScale = v; spr.origin = 'user'; touch('sprite-prop'); paint(); }));
            body.appendChild(ctl2);
          } else {
            body.appendChild(el('h3', 'section-h', 'Body'));
            var ctl3 = el('div', 'a7-ctl');
            ctl3.appendChild(W.select('Rig', rc.rig, ES.RIGS.map(function (k) { return [k, k.charAt(0).toUpperCase() + k.slice(1)]; }), function (v) {
              rc.rig = v; var pid = S.partByLib(b, 'enemy.' + v); rc.parts = { body: pid ? pid.id : (rc.parts || {}).body };
              rc.params = { body: S.rigParams(v, spr.seed) }; spr.origin = 'user'; touch('sprite-rig'); paint();
            }));
            body.appendChild(ctl3);
            var prm = (rc.params = rc.params || {}).body = (rc.params.body || {}), defs = ES.RIG_PARAMS[rc.rig] || {};
            var ctl4 = el('div', 'a7-ctl');
            Object.keys(defs).forEach(function (k) {
              var dv = defs[k], v = prm[k] != null ? prm[k] : dv;
              if (dv === 0 || dv === 1) ctl4.appendChild(W.toggle(k, !!v, function (on) { prm[k] = on ? 1 : 0; spr.origin = 'user'; touch('sprite-param'); paint(); }));
              else if (dv >= 2) ctl4.appendChild(W.slider(k, v, 0, Math.max(6, dv * 2), 1, function (n) { prm[k] = n; spr.origin = 'user'; touch('sprite-param'); paint(); }));
              else ctl4.appendChild(W.slider(k, v, 0.3, 1.6, 0.05, function (n) { prm[k] = n; spr.origin = 'user'; touch('sprite-param'); paint(); }));
            });
            body.appendChild(ctl4);
          }
          body.appendChild(el('h3', 'section-h', 'Frames'));
          body.appendChild(el('p', 'muted a7-small', 'Tap a frame to draw on it. A hand edited frame is stored as an override; the rest keep following the recipe. Left facing frames mirror right facing ones unless you edit them.'));
          var grid = el('div', 'a7-frames');
          var set = spr.mode === 'battle' ? ES.BATTLE_POSES.map(function (p) { return [p, spr.kind === 'enemy' ? 'right' : 'left']; }) : [];
          if (spr.mode !== 'battle') ES.FIELD_POSES.forEach(function (p) { ES.DIRS.forEach(function (d) { set.push([p, d]); }); });
          var ov = Object.assign({}, base.overrides || {}, spr.overrides || {});
          set.forEach(function (pd) {
            var f = frameOf(spr, pd[0], pd[1]), k = pd[0] + '.' + pd[1];
            var t = el('button', 'a7-frame');
            t.type = 'button';
            t.setAttribute('aria-label', 'Edit pixels: ' + (POSE_LABELS[pd[0]] || pd[0]) + ', ' + pd[1] + (ov[k] ? ', hand edited' : ''));
            t.appendChild(W.figure(f, 48));
            t.appendChild(el('span', 'a7-frame-l', esc((POSE_LABELS[pd[0]] || pd[0]) + ' ' + pd[1]) + (ov[k] ? ' <span class="chip chip-accent">edited</span>' : '')));
            t.addEventListener('click', function () { editFrame(spr, pd[0], pd[1], paint); });
            grid.appendChild(t);
          });
          body.appendChild(grid);
          var row2 = el('div', 'btn-row');
          if (!spr.shares) row2.appendChild(W.button('Reroll look', 'spark', '', function () { reroll(b, spr); touch('sprite-reroll'); paint(); }));
          row2.appendChild(W.button('Reset to generated', 'check', 'btn-ghost', function () {
            Kit.ui.confirm({ title: 'Reset this sprite?', message: 'The recipe goes back to what Quick Build makes from the bundle, and hand edited frames on this sprite are removed.', okLabel: 'Reset' }).then(function (ok) {
              if (!ok) return;
              resetSprite(b, spr); touch('sprite-reset'); paint();
            });
          }));
          body.appendChild(row2);
        }
        paint();
      }
    });
  }
  function reroll(b, spr) {
    var rc = spr.recipe;
    if (!rc) return;
    spr.seed = (Math.random() * 4294967295) >>> 0;
    if (spr.kind === 'enemy') { rc.params = { body: S.rigParams(rc.rig, spr.seed) }; }
    else {
      var chr = spr.subject && spr.subject.kind === 'chr' ? (b.rules.chr_ || {})[spr.subject.ref] : null;
      var look = chr ? S.characterLook(chr, spr.seed) : S.characterLook({ weaponClass: (rc.look || {}).front === 'bare' ? '' : 'blade', baseStats: {} }, spr.seed);
      if (!chr && rc.look) look.front = rc.look.front;
      Object.keys(look).forEach(function (layer) { (rc.parts = rc.parts || {})[layer] = look[layer] ? (S.partByLib(b, layer + '.' + look[layer]) || {}).id || null : null; });
      rc.look = look;
    }
    spr.origin = 'user';
  }
  function resetSprite(b, spr) {
    spr.overrides = {};
    spr.origin = spr.kind === 'npc' ? 'default' : 'procedural';
    if (spr.kind === 'npc') {
      var k = (spr.subject.ref || '').replace(/^npc:/, ''), look = S.NPC_LOOKS[k];
      if (look) {
        Object.keys(look).forEach(function (layer) { (spr.recipe.parts = spr.recipe.parts || {})[layer] = look[layer] ? (S.partByLib(b, layer + '.' + look[layer]) || {}).id || null : null; });
        spr.recipe.look = U.clone(look); spr.recipe.proportions = { height: 1.5, headScale: 1 };
      }
      return;
    }
    // A generated sprite rebuilds from the bundle on the next Quick Build pass; run the sprite step now.
    var rep = {};
    S.buildSprites(b, rep);
  }

  // ---------------------------------------------------------------- lists
  function spriteRow(spr, host, extra) {
    var row = rowFor(spr);
    var figs = previews(spr, 56), battle = spr.mode === 'field' ? S.spriteFor(cur(), spr.subject.kind, spr.subject.ref, 'battle') : null;
    if (battle) Array.prototype.slice.call(previews(battle, 56).children).forEach(function (c) { figs.appendChild(c); });
    row.appendChild(figs);
    var mid = el('div', 'a7-grow');
    var look = (ES.base(cur().art, spr).recipe || {}).look || {};
    mid.innerHTML = '<div class="a7-name"><strong>' + esc(spr.name.replace(/ \((field|battle)\)$/, '')) + '</strong> ' + W.origin(spr) + (spr.shares ? ' ' + W.chip('shares a look', 'muted') : '') + '</div>' +
      '<div class="muted a7-small">' + esc(['body', 'torso', 'hair', 'front'].map(function (k) { return look[k]; }).filter(Boolean).join(', ')) + '</div>';
    row.appendChild(mid);
    var acts = el('div', 'a7-acts');
    acts.appendChild(W.button(battle ? 'Field' : 'Edit', 'edit', '', function () { openSprite(spr.id); }));
    if (battle) acts.appendChild(W.button('Battle', 'sword', 'btn-ghost', function () { openSprite(battle.id); }));
    if (extra) extra(acts);
    row.appendChild(acts);
    host.appendChild(row);
  }
  function viewCharacters(host) {
    var b = cur(), chrs = (b.rules && b.rules.chr_) || {}, list = S.sprites(b).filter(function (s) { return s.kind === 'character' && s.mode === 'field'; });
    var p = el('section', 'panel');
    p.innerHTML = '<h3 class="section-h">Party</h3><p class="muted">Each character has a field sprite (four directions, three walking frames) and a battle sprite that shares its look. Looks come from each character\'s stats and weapon class and are dressed in their colorway.</p>';
    if (!Object.keys(chrs).length) p.appendChild(el('div', 'empty-line', 'The bundle has no characters.'));
    else if (!list.length) { host.appendChild(p); needQuick(host, 'character sprites'); return; }
    list.forEach(function (s) { spriteRow(s, p); });
    host.appendChild(p);
  }
  function viewCast(host, repaint) {
    var b = cur(), all = S.sprites(b);
    var vil = all.filter(function (s) { return s.kind === 'villain' && s.mode === 'field'; }), npcs = all.filter(function (s) { return s.kind === 'npc'; });
    if (!vil.length && !npcs.length) { needQuick(host, 'villain or NPC sprites'); return; }
    var p = el('section', 'panel');
    p.innerHTML = '<h3 class="section-h">Villain</h3>';
    vil.forEach(function (s) { spriteRow(s, p); });
    if (!vil.length) p.appendChild(el('div', 'empty-line', 'No villain sprite.'));
    host.appendChild(p);
    var q = el('section', 'panel');
    q.innerHTML = '<h3 class="section-h">NPC archetypes</h3><p class="muted">World Forge places these on Day 148. Duplicate one to add an archetype; delete the ones your world does not need.</p>';
    npcs.forEach(function (s) {
      spriteRow(s, q, function (acts) {
        acts.appendChild(W.button('Duplicate', 'plus', 'btn-ghost', function () { duplicateNpc(s, repaint); }));
        var del = W.button('Delete', 'trash', 'btn-ghost', function () { deleteNpc(s, repaint); });
        del.setAttribute('aria-label', 'Delete ' + s.name);
        acts.appendChild(del);
      });
    });
    host.appendChild(q);
  }
  function duplicateNpc(spr, repaint) {
    Kit.ui.prompt({ title: 'New NPC archetype', label: 'Archetype name', value: '', placeholder: 'for example ferryman', validate: function (v) {
      var k = U.slug(v); if (!k) return 'Enter a name.';
      if (S.spriteFor(cur(), 'role', 'npc:' + k, 'field')) return 'That archetype already exists.';
      return null;
    } }).then(function (v) {
      if (!v) return;
      var b = cur(), k = U.slug(v), label = v.trim(), opal = ART.records.get(spr.pal);
      var pal = ART.envelope('pal_', label + ' colorway', { kind: 'role', ref: 'npc:' + k }, 'user', 0, { kind: 'local', layout: 'humanoid', hint: { hue: (Math.random() * 360) | 0 } });
      if (opal && opal.colorway) { pal.colorway = U.clone(opal.colorway); pal.slots = opal.slots.slice(); pal.ramps = U.clone(opal.ramps); pal.source = U.clone(opal.source); }
      else P.refitLocal(b, pal);
      ART.records.put(pal, b);
      var rec = ART.envelope('spr_', label + ' (field)', { kind: 'role', ref: 'npc:' + k }, 'user', 0, { kind: 'npc', mode: 'field', pal: pal.id, recipe: U.clone(ES.base(b.art, spr).recipe), overrides: {} });
      ART.records.put(rec, b);
      touch('npc-add'); repaint();
      Kit.ui.toast('Added the ' + label + ' archetype.', 'ok');
      openSprite(rec.id);
    });
  }
  function deleteNpc(spr, repaint) {
    Kit.ui.confirm({ title: 'Delete ' + spr.name + '?', message: 'The sprite and its colorway are removed. Quick Build will not bring a default archetype back.', okLabel: 'Delete', danger: true }).then(function (ok) {
      if (!ok) return;
      var b = cur(), ref = spr.subject.ref;
      S.retire(b, ref);
      var pal = ART.bySubject('pal_', 'role', ref, b);
      ART.records.del(spr.id);
      if (pal) ART.records.del(pal.id);
      touch('npc-delete'); repaint();
    });
  }
  function viewBestiary(host) {
    var b = cur(), all = S.sprites(b).filter(function (s) { return s.kind === 'enemy'; }), info = P.familyInfo(b);
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Bestiary</h3><p class="muted">One battle sprite per enemy family. A family\'s body rig comes from its name, then its type. Day 146 tier families (T2 and up) share the base family\'s look in their own tier palette.</p>';
    host.appendChild(intro);
    if (!info.length) { intro.appendChild(el('div', 'empty-line', 'The bundle has no enemy families.')); return; }
    if (!all.length) { needQuick(host, 'enemy sprites'); return; }
    var groups = {}, order = [];
    info.forEach(function (x) { if (!groups[x.baseId]) { groups[x.baseId] = []; order.push(x.baseId); } groups[x.baseId].push(x); });
    order.forEach(function (bid) {
      var p = el('section', 'panel');
      var base = groups[bid][0];
      p.appendChild(el('h3', 'section-h', esc(base.baseName)));
      var strip = el('div', 'a7-tiers');
      groups[bid].forEach(function (x) {
        var spr = S.spriteFor(b, 'fam', x.id, 'battle');
        if (!spr) return;
        var t = el('div', 'a7-tier'); t.dataset.rid = spr.id; if (ui.focus === spr.id) t.classList.add('a7-hit');
        t.appendChild(W.figure(frameOf(spr, 'idle', 'right'), 112, spr.name));
        var lab = el('div', 'a7-name', '<strong>' + esc(x.name) + '</strong> ' + W.chip('Tier ' + x.tier, 'accent') + ' ' + W.origin(spr) + (spr.shares ? ' ' + W.chip('shares', 'muted') : ''));
        t.appendChild(lab);
        var rig = (ES.base(b.art, spr).recipe || {}).rig;
        t.appendChild(el('div', 'muted a7-small', esc((rig || '') + ' rig, ' + (x.fam.type || 'no type'))));
        t.appendChild(W.button('Edit', 'edit', '', function () { openSprite(spr.id); }));
        strip.appendChild(t);
      });
      p.appendChild(strip);
      host.appendChild(p);
    });
  }

  // ---------------------------------------------------------------- portraits
  function openPortrait(id) {
    Kit.ui.drawer({
      title: 'Portrait',
      body: function (body, h) {
        function paint() {
          var b = cur(), por = ART.records.get(id);
          U.clear(body);
          if (!por) { body.appendChild(el('div', 'empty-line', 'This portrait no longer exists.')); return; }
          h.setTitle(por.name);
          var rc = por.recipe = por.recipe || {};
          body.appendChild(el('p', 'muted a7-small', 'Neutral is required; the other expressions are for dialogue scenes on Day 149. Portraits use the character\'s colorway.'));
          var ctl = el('div', 'a7-ctl');
          ctl.appendChild(W.select('Head', rc.head || 'round', [['round', 'Round'], ['square', 'Square'], ['long', 'Long']], function (v) { rc.head = v; por.origin = 'user'; touch('portrait'); paint(); }));
          ctl.appendChild(W.select('Hair', rc.hair || 'short', ['short', 'long', 'tied', 'spiked', 'cropped', 'covered', 'none'].map(function (k) { return [k, k === 'covered' ? 'Hood' : k.charAt(0).toUpperCase() + k.slice(1)]; }), function (v) { rc.hair = v; por.origin = 'user'; touch('portrait'); paint(); }));
          ctl.appendChild(W.select('Collar', rc.collar || 'cloth', [['cloth', 'Cloth'], ['plate', 'Plate']], function (v) { rc.collar = v; por.origin = 'user'; touch('portrait'); paint(); }));
          ctl.appendChild(W.slider('Mouth width', rc.mouth || 1, 0.6, 1.5, 0.05, function (v) { rc.mouth = v; por.origin = 'user'; touch('portrait'); paint(); }));
          body.appendChild(ctl);
          var grid = el('div', 'a7-frames a7-frames-l');
          Object.keys(EP.EXPRESSIONS).forEach(function (ex) {
            var f = S.cache().portrait(por.id, ex), edited = por.overrides && por.overrides[ex];
            var cell = el('div', 'a7-expr');
            var t = el('button', 'a7-frame'); t.type = 'button';
            t.setAttribute('aria-label', 'Edit pixels: ' + ex + (edited ? ', hand edited' : ''));
            t.appendChild(W.figure(f, 96));
            t.appendChild(el('span', 'a7-frame-l', esc(ex) + (edited ? ' <span class="chip chip-accent">edited</span>' : '') + (ex === 'neutral' ? ' <span class="chip chip-muted">required</span>' : '')));
            t.addEventListener('click', function () { editPortrait(por, ex, paint); });
            cell.appendChild(t);
            var e = (por.expressions = por.expressions || {})[ex] = por.expressions[ex] || {}, d = EP.EXPRESSIONS[ex];
            var tw = el('div', 'a7-ctl a7-ctl-s');
            tw.appendChild(W.slider('Brow', e.brow != null ? e.brow : d.brow, -2, 2, 0.1, function (v) { e.brow = v; por.origin = 'user'; touch('portrait'); paint(); }));
            tw.appendChild(W.slider('Eyes', e.eye != null ? e.eye : d.eye, 0.3, 1.6, 0.05, function (v) { e.eye = v; por.origin = 'user'; touch('portrait'); paint(); }));
            cell.appendChild(tw);
            grid.appendChild(cell);
          });
          body.appendChild(grid);
          var row = el('div', 'btn-row');
          row.appendChild(W.button('Reset to generated', 'check', 'btn-ghost', function () {
            por.origin = 'procedural'; por.expressions = {}; por.overrides = {}; S.buildPortraits(b, {}); touch('portrait-reset'); paint();
          }));
          body.appendChild(row);
        }
        paint();
      }
    });
  }
  function editPortrait(por, ex, after) {
    var b = cur(), f = S.cache().portrait(por.id, ex), pal = ART.records.get(por.pal);
    var gen = EP.compose(por.recipe, Object.assign({}, EP.EXPRESSIONS[ex], (por.expressions || {})[ex] || {}), f.w);
    ART.pixelEditor.open({ title: por.name + ': ' + ex, w: f.w, h: f.h, idx: f.idx, slots: pal && pal.slots, entries: P.entries(b), canRevert: !!(por.overrides && por.overrides[ex]),
      note: 'Saved pixels replace this expression. The recipe and sliders no longer change it until you revert.' }).then(function (res) {
      if (!res) return;
      por.overrides = U.isObj(por.overrides) ? por.overrides : {};
      if (res.action === 'revert') delete por.overrides[ex];
      else { var enc = ART.pixelEditor.encode(res.idx, f.w, f.h, gen.idx); if (enc) { por.overrides[ex] = enc; por.origin = 'user'; } else delete por.overrides[ex]; }
      touch('portrait-pixels');
      if (after) after();
    });
  }
  function viewPortraits(host) {
    var b = cur(), list = S.portraits(b);
    if (!list.length) { needQuick(host, 'portraits'); return; }
    var p = el('section', 'panel');
    p.innerHTML = '<h3 class="section-h">Portraits</h3><p class="muted">Three tiles square (up to 96 pixels), built from the same face parts and colorway as each character\'s sprite.</p>';
    list.forEach(function (por) {
      var row = rowFor(por), figs = el('div', 'a7-figs');
      Object.keys(EP.EXPRESSIONS).forEach(function (ex) { figs.appendChild(W.figure(S.cache().portrait(por.id, ex), 56, por.name + ', ' + ex)); });
      row.appendChild(figs);
      var mid = el('div', 'a7-grow');
      mid.innerHTML = '<div class="a7-name"><strong>' + esc(por.name) + '</strong> ' + W.origin(por) + '</div><div class="muted a7-small">' + esc(por.size + ' by ' + por.size) + '</div>';
      row.appendChild(mid);
      row.appendChild(W.button('Edit', 'edit', '', function () { openPortrait(por.id); }));
      p.appendChild(row);
    });
    host.appendChild(p);
  }

  // ---------------------------------------------------------------- parts
  // A part is previewed alone on a mannequin: the body part plus this layer, in the first colorway.
  function previewPal(b, rig) {
    if (rig && rig !== 'humanoid') { var t = P.tiers(b)[0]; return t || null; }
    return P.locals(b)[0] || null;
  }
  function partPreview(b, part, pose, dir) {
    var T = S.tileSize(b), rig = part.rig || 'humanoid', spec;
    if (rig !== 'humanoid') spec = { layout: 'enemy', rig: rig, size: T, seed: 7, layers: [part.px ? { layer: 'body', px: part.px } : { layer: 'body', gen: part.gen }] };
    else {
      var body = part.layer === 'body' ? part : S.partByLib(b, 'body.average') || S.parts(b).filter(function (p) { return p.layer === 'body' && (p.rig || 'humanoid') === 'humanoid'; })[0];
      var layers = [];
      if (body) layers.push(body.px ? { layer: 'body', px: body.px } : { layer: 'body', gen: body.gen });
      if (part.layer !== 'body') layers.push(part.px ? { layer: part.layer, px: part.px } : { layer: part.layer, gen: part.gen });
      spec = { layout: 'humanoid', rig: 'humanoid', size: T, layers: layers, shadow: false };
    }
    var f = ES.compose(spec, pose || (rig === 'humanoid' ? 'stand' : 'idle'), dir || (rig === 'humanoid' ? 'down' : 'right'));
    var pal = previewPal(b, rig);
    f.rgba = ES.rgba(f.idx, pal && pal.slots, P.entries(b));
    return f;
  }
  // Converts a generated part into hand drawn pixels: one variant per pose and direction, rasterized alone.
  function toPixels(b, part) {
    var T = S.tileSize(b), rig = part.rig || 'humanoid', variants = {};
    if (rig !== 'humanoid') {
      var f = ES.compose({ layout: 'enemy', rig: rig, size: T, seed: 7, layers: [{ layer: 'body', gen: part.gen }] }, 'idle', 'right');
      variants['idle.right'] = { w: f.w, h: f.h, d: EC.encode(f.idx) };
    } else {
      var body = S.partByLib(b, 'body.average');
      var spec = { layout: 'humanoid', size: T, layers: (part.layer === 'body' ? [] : body ? [{ layer: 'body', gen: body.gen }] : []).concat([{ layer: part.layer, gen: part.gen }]) };
      ES.FIELD_POSES.concat(ES.BATTLE_POSES).forEach(function (pose) {
        ['down', 'up', 'right'].forEach(function (dir) {
          if (pose === 'idle' && dir !== 'right') return;
          var fr = ES.partFrame(spec, part.layer, pose, dir);
          variants[pose + '.' + dir] = { w: fr.w, h: fr.h, d: EC.encode(fr.idx) };
        });
      });
    }
    return { base: T, variants: variants };
  }
  function openPart(id) {
    Kit.ui.drawer({
      title: 'Part',
      body: function (body, h) {
        function paint() {
          var b = cur(), part = ART.records.get(id);
          U.clear(body);
          if (!part) { body.appendChild(el('div', 'empty-line', 'This part no longer exists.')); return; }
          h.setTitle(part.name);
          var humanoid = (part.rig || 'humanoid') === 'humanoid', isPx = !!(part.px && part.px.variants && Object.keys(part.px.variants).length);
          var figs = el('div', 'a7-figs');
          (humanoid ? [['stand', 'down'], ['stand', 'right'], ['stand', 'up'], ['idle', 'left']] : [['idle', 'right']]).forEach(function (pd) { figs.appendChild(W.figure(partPreview(b, part, pd[0], pd[1]), 96, part.name + ' ' + pd.join(' '))); });
          body.appendChild(figs);
          var users = S.sprites(b).filter(function (s) { return s.recipe && s.recipe.parts && Object.keys(s.recipe.parts).some(function (k) { return s.recipe.parts[k] === id; }); });
          body.appendChild(el('div', null, '<dl class="kv"><dt>Record</dt><dd><code class="id">' + esc(id) + '</code></dd><dt>Layer</dt><dd>' + esc(LAYER_LABELS[part.layer] || part.layer) + '</dd><dt>Rig</dt><dd>' + esc(part.rig || 'humanoid') + '</dd><dt>Kind</dt><dd>' + (isPx ? 'Hand drawn at tile size ' + esc(part.px.base) : 'Generator ' + esc(part.gen && part.gen.shape)) + '</dd><dt>Used by</dt><dd>' + (users.length ? users.length + ' sprite' + (users.length === 1 ? '' : 's') : 'no sprite') + '</dd></dl>'));
          if (isPx && part.px.base !== S.tileSize(b)) body.appendChild(el('p', 'msg msg-warning', 'Drawn at tile size ' + esc(part.px.base) + '; the Charter uses ' + S.tileSize(b) + ', so it is resampled and may look rough. Generator parts redraw natively at any size.'));
          if (!isPx && part.gen) {
            var prm = part.gen.params = part.gen.params || {}, ctl = el('div', 'a7-ctl');
            Object.keys(prm).forEach(function (k) {
              var v = prm[k];
              if (typeof v === 'number') ctl.appendChild(v === 0 || v === 1 ? W.toggle(k, !!v, function (on) { prm[k] = on ? 1 : 0; part.origin = 'user'; touch('part'); paint(); }) : W.slider(k, v, 0, Math.max(2, v * 2), v >= 2 ? 1 : 0.05, function (n) { prm[k] = n; part.origin = 'user'; touch('part'); paint(); }));
            });
            if (ctl.children.length) { body.appendChild(el('h3', 'section-h', 'Parameters')); body.appendChild(ctl); }
            else body.appendChild(el('p', 'muted a7-small', 'A style part: duplicate it to make a variant, or draw it by hand.'));
          }
          if (isPx) {
            body.appendChild(el('h3', 'section-h', 'Hand drawn frames'));
            var grid = el('div', 'a7-frames');
            Object.keys(part.px.variants).sort().forEach(function (k) {
              var v = part.px.variants[k], t = el('button', 'a7-frame'); t.type = 'button';
              var idx; try { idx = EC.decode(v.d, v.w, v.h); } catch (e) { idx = new Uint8Array(v.w * v.h); }
              var pal = previewPal(b, part.rig), f = { w: v.w, h: v.h, rgba: ES.rgba(idx, pal && pal.slots, P.entries(b)) };
              t.appendChild(W.figure(f, 48)); t.appendChild(el('span', 'a7-frame-l', esc(k)));
              t.setAttribute('aria-label', 'Edit pixels: ' + k);
              t.addEventListener('click', function () {
                ART.pixelEditor.open({ title: part.name + ': ' + k, w: v.w, h: v.h, idx: idx, slots: pal && pal.slots, entries: P.entries(b), labels: humanoid ? null : ENEMY_LABELS,
                  note: 'Only this layer is drawn here. Use the ramp colors of the layer\'s material; the sprite\'s colorway recolors them.' }).then(function (res) {
                  if (!res || res.action !== 'save') return;
                  part.px.variants[k] = { w: v.w, h: v.h, d: EC.encode(res.idx) }; part.origin = 'user'; touch('part-pixels'); paint();
                });
              });
              grid.appendChild(t);
            });
            body.appendChild(grid);
          }
          var row = el('div', 'btn-row');
          row.appendChild(W.button('Duplicate', 'plus', '', function () {
            var copy = ART.envelope('prt_', 'Copy of ' + part.name, { kind: 'role', ref: 'part:custom' }, 'user', 0, { layer: part.layer, rig: part.rig, gen: part.gen ? U.clone(part.gen) : undefined, px: part.px ? U.clone(part.px) : undefined });
            ART.records.put(copy, b); touch('part-copy'); id = copy.id; paint();
            Kit.ui.toast('Duplicated. Pick it on any sprite\'s ' + (LAYER_LABELS[part.layer] || part.layer) + ' list.', 'ok');
          }));
          if (!isPx && part.gen) row.appendChild(W.button('Draw by hand', 'edit', 'btn-ghost', function () {
            Kit.ui.confirm({ title: 'Draw this part by hand?', message: 'A copy of this part is turned into pixels at the current tile size, one frame per pose and direction, ready for the pixel editor. The original generator part stays as it is.', okLabel: 'Make a hand drawn copy' }).then(function (ok) {
              if (!ok) return;
              var copy = ART.envelope('prt_', part.name + ' (drawn)', { kind: 'role', ref: 'part:custom' }, 'user', 0, { layer: part.layer, rig: part.rig, px: toPixels(b, part) });
              ART.records.put(copy, b); touch('part-draw'); id = copy.id; paint();
            });
          }));
          row.appendChild(W.button('Delete', 'trash', 'btn-ghost', function () {
            if (users.length) { Kit.ui.toast('Used by ' + users.length + ' sprite' + (users.length === 1 ? '' : 's') + '. Pick another part on them first.', 'warn', 6000); return; }
            Kit.ui.confirm({ title: 'Delete ' + part.name + '?', message: part.lib ? 'This is a default part. Quick Build will not bring it back.' : 'The part is removed.', okLabel: 'Delete', danger: true }).then(function (ok) {
              if (!ok) return;
              if (part.lib) S.retire(b, part.lib);
              ART.records.del(part.id); touch('part-delete'); h.close();
            });
          }));
          body.appendChild(row);
        }
        paint();
      },
      onClose: function () { Kit.rerender(); }
    });
  }
  function viewParts(host) {
    var b = cur(), parts = S.parts(b);
    if (!parts.length) { needQuick(host, 'parts'); return; }
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Part library</h3><p class="muted">Genre neutral generator parts that redraw natively at any tile size. Colorways and parameters alone make them read as medieval, steampunk, or science fiction. Duplicate a part to vary it, or draw one by hand.</p>';
    host.appendChild(intro);
    var groups = [];
    ES.LAYERS.forEach(function (layer) { groups.push(['humanoid', layer]); });
    ES.RIGS.forEach(function (rig) { if (rig !== 'humanoid') groups.push([rig, 'body']); });
    var shown = {};
    [['Humanoid parts', function (g) { return g[0] === 'humanoid'; }], ['Enemy bodies', function (g) { return g[0] !== 'humanoid'; }]].forEach(function (sec) {
      var p = el('section', 'panel');
      p.appendChild(el('h3', 'section-h', esc(sec[0])));
      groups.filter(sec[1]).forEach(function (g) {
        var ps = parts.filter(function (x) { return (x.rig || 'humanoid') === g[0] && x.layer === g[1]; });
        if (!ps.length) return;
        p.appendChild(el('div', 'a7-sublabel', esc(g[0] === 'humanoid' ? LAYER_LABELS[g[1]] : g[0].charAt(0).toUpperCase() + g[0].slice(1))));
        var grid = el('div', 'a7-parts');
        ps.forEach(function (part) {
          shown[part.id] = 1;
          var t = el('button', 'a7-frame' + (ui.focus === part.id ? ' a7-hit' : '')); t.type = 'button'; t.dataset.rid = part.id;
          t.setAttribute('aria-label', 'Open part ' + part.name);
          t.appendChild(W.figure(partPreview(b, part), 56));
          t.appendChild(el('span', 'a7-frame-l', esc(part.name) + (S.isKept(part) ? ' <span class="chip chip-accent">edited</span>' : '') + (part.px ? ' <span class="chip chip-muted">drawn</span>' : '')));
          t.addEventListener('click', function () { openPart(part.id); });
          grid.appendChild(t);
        });
        p.appendChild(grid);
      });
      host.appendChild(p);
    });
    var rest = parts.filter(function (x) { return !shown[x.id]; });
    if (rest.length) {
      var q = el('section', 'panel');
      q.appendChild(el('h3', 'section-h', 'Other parts'));
      rest.forEach(function (x) { var r = rowFor(x); r.appendChild(el('div', 'a7-grow', esc(x.name))); r.appendChild(W.button('Open', 'edit', '', function () { openPart(x.id); })); q.appendChild(r); });
      host.appendChild(q);
    }
  }

  var VIEWS = { characters: viewCharacters, cast: viewCast, bestiary: viewBestiary, portraits: viewPortraits, parts: viewParts };
  function subtabs(host, subs, state, views, after) {
    var tabs = el('div', 'a7-sub'); tabs.setAttribute('role', 'tablist');
    var panel = el('div', 'a7-subpanel'); panel.setAttribute('role', 'tabpanel');
    subs.forEach(function (s) {
      var t = el('button', null, esc(s[1])); t.type = 'button'; t.setAttribute('role', 'tab'); t.dataset.sub = s[0];
      t.addEventListener('click', function () { state.sub = s[0]; state.focus = null; paint(); });
      tabs.appendChild(t);
    });
    host.appendChild(tabs); host.appendChild(panel);
    function paint() {
      Array.prototype.forEach.call(tabs.children, function (t) { t.setAttribute('aria-selected', t.dataset.sub === state.sub ? 'true' : 'false'); });
      U.clear(panel);
      if (!P.master()) {
        var p = el('section', 'panel');
        p.innerHTML = '<h3 class="section-h">No palette yet</h3><p class="muted">Sprites are drawn from the master palette. Run Quick Build to make the palettes and every sprite at once.</p>';
        p.appendChild(W.button('Quick Build', 'spark', 'btn-primary', function () { ART.openQuickBuild(); }));
        panel.appendChild(p);
      } else views[state.sub](panel, paint);
      if (state.focus) {
        var hit = panel.querySelector('[data-rid="' + state.focus + '"]');
        if (hit && hit.scrollIntoView) setTimeout(function () { try { hit.scrollIntoView({ block: 'center' }); } catch (e) {} }, 0);
      }
      if (after) after();
    }
    paint();
    return paint;
  }
  W.subtabs = subtabs;
  function render(host) {
    var head = el('section', 'panel');
    head.innerHTML = '<h2 class="panel-title">Sprites</h2><p class="muted">Every sprite is a recipe of parts dressed in a palette, composed back to front (shadow, back gear, body, legs, torso, head, hair, front gear), outlined from its silhouette, and shaded from its ramps. Only hand edited frames are stored as pixels.</p>';
    host.appendChild(head);
    subtabs(host, SUBS, ui, VIEWS);
  }
  function focus(rid) {
    var r = ART.records.get(rid);
    if (!r) return;
    ui.focus = rid;
    var p = Kit.ids.prefixOf(rid);
    ui.sub = p === 'prt_' ? 'parts' : p === 'por_' ? 'portraits' : r.kind === 'enemy' ? 'bestiary' : r.kind === 'character' ? 'characters' : 'cast';
    Kit.rerender();
  }
  ART.WS.sprites = { render: render, focus: focus, ui: ui, views: VIEWS, openSprite: openSprite, openPortrait: openPortrait, openPart: openPart, toPixels: toPixels, partPreview: partPreview };
})();
// === WS:SPRITES END ===
