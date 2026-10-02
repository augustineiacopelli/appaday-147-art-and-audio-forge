// === WS:MOTION BEGIN ===
(function () {
  'use strict';
  // The Motion tab: Poses, Animations, Ability animations, Effects, and Weather. Every preview plays at true speed on a
  // logical canvas at the Charter's own pixel size, scaled up by a whole number with smoothing off, the way the game
  // will draw it. One animation loop drives every visible stage and stops when none is on screen.
  var U = Kit.util, el = U.el, esc = U.esc, ER = ENGINE_RENDER, ES = ER.sprite, EA = ER.anim;
  var S = ART.sprites, P = ART.palette, M = ART.motion, W = ART.ui;
  ART.WS = ART.WS || {};
  var SUBS = [['poses', 'Poses'], ['anims', 'Animations'], ['abilities', 'Ability animations'], ['effects', 'Effects'], ['weather', 'Weather']];
  var ui = { sub: 'poses', focus: null, sample: null, enemy: null, paused: false };
  var POSE_LABELS = { stand: 'Stand', stepA: 'Step A', stepB: 'Step B', idle: 'Idle', ready: 'Ready', step: 'Step', windup: 'Wind up', attack: 'Attack', cast: 'Cast', item: 'Item', hurt: 'Hurt', kneel: 'Kneel', ko: 'KO', revive: 'Revive', victory: 'Victory', limit: 'Limit', nod: 'Nod', shakeL: 'Shake left', shakeR: 'Shake right', crouch: 'Crouch', jump: 'Jump', sit: 'Sit', laugh: 'Laugh', laughB: 'Laugh B' };
  function cur() { return Kit.bundle.current(); }
  function touch(reason) { Kit.bundle.touch(reason || 'motion'); Kit.refreshValidation(); }
  function rowFor(r) { var d = el('div', 'a7-row'); d.dataset.rid = r.id; if (ui.focus === r.id) d.classList.add('a7-hit'); return d; }
  function poseLabel(k) { return POSE_LABELS[k] || k; }
  // Taxonomy entries are stored with label equal to key until someone renames them; show those in plain words.
  var DIR_LABELS = { down: 'down', up: 'up', right: 'right', left: 'left' };
  var TAX_LABELS = { shake: 'Shake head', faint: 'Faint', death: 'Death', ko: 'KO' };
  function taxLabel(e) {
    if (e.label && e.label !== e.key) return e.label;
    var p = String(e.key).split('.');
    if (p.length === 2 && DIR_LABELS[p[1]]) return poseLabel(p[0]) + ', ' + DIR_LABELS[p[1]];
    return TAX_LABELS[e.key] || poseLabel(e.key).charAt(0).toUpperCase() + poseLabel(e.key).slice(1);
  }
  M.taxLabel = taxLabel;
  function T() { return S.tileSize(cur()); }
  function res() { var r = (cur().charter.specs || {}).resolution || {}; return { w: Number(r.w) || 256, h: Number(r.h) || 224 }; }
  // The Charter scale: the whole number factor a 720 pixel wide screen would use for this resolution.
  function charterScale() { return Math.max(2, Math.min(6, Math.floor(720 / res().w))); }
  function num(label, value, min, max, step, onChange) {
    var id = 'a7n' + U.rand36(6), w = el('label', 'a7-num'); w.htmlFor = id;
    w.innerHTML = '<span>' + esc(label) + '</span>';
    var i = el('input', 'inp'); i.type = 'number'; i.id = id; i.min = min; i.max = max; i.step = step; i.value = value;
    i.addEventListener('change', function () { var v = Number(i.value); if (!isFinite(v)) return; onChange(Math.max(min, Math.min(max, v))); });
    w.appendChild(i); return w;
  }
  function text(label, value, onChange) {
    var id = 'a7x' + U.rand36(6), w = el('label', 'a7-num'); w.htmlFor = id;
    w.innerHTML = '<span>' + esc(label) + '</span>';
    var i = el('input', 'inp'); i.type = 'text'; i.id = id; i.value = value == null ? '' : value; i.maxLength = 40;
    i.addEventListener('change', function () { onChange(i.value.trim() || null); });
    w.appendChild(i); return w;
  }
  function needMaster(host) {
    var p = el('section', 'panel');
    p.innerHTML = '<h3 class="section-h">Nothing to animate yet</h3><p class="muted">Animations play on sprites drawn from the master palette. Quick Build makes the palettes, the sprites, the animation library, an animation for every ability, and an overlay for every weather state, all without an API key.</p>';
    p.appendChild(W.button('Quick Build', 'spark', 'btn-primary', function () { ART.openQuickBuild(); }));
    host.appendChild(p);
  }

  // ---------------------------------------------------------------- the stage loop
  var stages = [], raf = 0, last = 0;
  function loop(ts) {
    raf = 0;
    var dt = last ? Math.min(100, ts - last) : 16;
    last = ts;
    stages = stages.filter(function (s) { return s.cv.isConnected; });
    if (!stages.length) { last = 0; return; }
    if (!ui.paused && !document.hidden) stages.forEach(function (s) { s.t += dt; try { s.paint(dt); } catch (e) { s.cv.dataset.err = e.message; } });
    raf = requestAnimationFrame(loop);
  }
  // stage(w, h, k, tick(ctx, t, dt), label) -> canvas. w and h are logical pixels; k is the whole number scale.
  function stage(w, h, k, tick, label) {
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h; cv.className = 'a7-stage';
    cv.style.width = w * k + 'px'; cv.style.aspectRatio = w + ' / ' + h;
    cv.setAttribute('role', 'img');
    if (label) cv.setAttribute('aria-label', label);
    var ctx = cv.getContext && cv.getContext('2d');
    var st = { cv: cv, t: 0, paint: function (dt) { if (!ctx) return; ctx.imageSmoothingEnabled = false; ctx.globalAlpha = 1; tick(ctx, st.t, dt); } };
    stages.push(st);
    st.paint(0);
    if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(loop);
    cv.restart = function () { st.t = 0; };
    return cv;
  }
  M.stage = stage;
  M.stageCount = function () { return stages.filter(function (s) { return s.cv.isConnected; }).length; };
  // A backdrop from the master palette: sky above, ground below, a horizon line.
  function backdrop(ctx, w, h, horizon) {
    var e = P.entries(), sky = e.length ? e[ER.palette.nearest(e, '#4a6a9a')] : '#4a6a9a', gr = e.length ? e[ER.palette.nearest(e, '#4a6a3a')] : '#4a6a3a', ln = e.length ? e[ER.palette.nearest(e, '#2a3a24')] : '#2a3a24';
    var hy = Math.round(h * (horizon == null ? 0.66 : horizon));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, hy);
    ctx.fillStyle = gr; ctx.fillRect(0, hy, w, h - hy);
    ctx.fillStyle = ln; ctx.fillRect(0, hy, w, 1);
    return hy;
  }

  // ---------------------------------------------------------------- samples
  function partySprites(b) { return S.sprites(b).filter(function (s) { return s.mode === 'field' && s.kind !== 'enemy'; }); }
  function enemySprites(b) { return S.sprites(b).filter(function (s) { return s.kind === 'enemy'; }); }
  function sample(b) {
    var list = partySprites(b), s = ui.sample && ART.records.get(ui.sample, b);
    return s && s.mode === 'field' ? s : list.filter(function (x) { return x.kind === 'character'; })[0] || list[0] || null;
  }
  function battleOf(b, field) { return field ? S.spriteFor(b, field.subject.kind, field.subject.ref, 'battle') || field : null; }
  function sampleEnemy(b) { var s = ui.enemy && ART.records.get(ui.enemy, b); return s || enemySprites(b)[0] || null; }
  function samplePicker(b, after) {
    var row = el('div', 'a7-ctl');
    var ps = partySprites(b), es = enemySprites(b);
    if (ps.length) row.appendChild(W.select('Preview on', (sample(b) || {}).id, ps.map(function (s) { return [s.id, s.name.replace(/ \(field\)$/, '')]; }), function (v) { ui.sample = v; after(); }));
    if (es.length) row.appendChild(W.select('Enemy', (sampleEnemy(b) || {}).id, es.map(function (s) { return [s.id, s.name.replace(/ \(battle\)$/, '')]; }), function (v) { ui.enemy = v; after(); }));
    row.appendChild(W.toggle('Pause previews', ui.paused, function (on) { ui.paused = on; }));
    return row;
  }
  // A stage playing one sprite animation on one sprite. The sprite stands on the stage's ground line.
  function animStage(spr, anm, dir, label) {
    var t = T(), wide = spr && spr.mode === 'battle' && spr.kind !== 'enemy', enemy = spr && spr.kind === 'enemy';
    var w = (wide ? 4 : enemy ? 4 : 3) * t, h = Math.round((enemy ? 3 : 2.5) * t), k = charterScale(), seed = 7;
    var hold = anm && !anm.loop ? 700 : 0, D = anm ? EA.duration(anm) : 0;
    return stage(w, h, k, function (ctx, tm) {
      var gy = backdrop(ctx, w, h, 0.84);
      if (!spr) return;
      var tt = D ? tm % (D + hold) : 0;
      ER.draw.sprite(ctx, S.cache(), spr.id, anm, tt, Math.round(w / 2 + (enemy ? -4 : 0)), gy, { dir: dir, seed: seed });
    }, label);
  }

  // ---------------------------------------------------------------- Poses
  function taxonomy(b) { ART.ensure(b); return b.art.poseTaxonomy; }
  function poseDir(group, key) {
    if (group === 'field') { var p = key.split('.'); return { pose: p[0], dir: p[1] || 'down' }; }
    var known = M.POSE_OF[group] && M.POSE_OF[group][key];
    return { pose: known || key, dir: group === 'battleParty' ? 'left' : group === 'battleEnemy' ? 'right' : 'down' };
  }
  function viewPoses(host, repaint) {
    var b = cur(), f = sample(b), en = sampleEnemy(b), tax = taxonomy(b);
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Pose library</h3><p class="muted">The poses every sprite can strike, grouped the way the game uses them. Required poses can be relabeled but not removed, because coverage counts them; optional poses you add are yours to change or delete. Tap a pose to adjust it for the sprite you are previewing; only the changes are stored on that sprite.</p>';
    intro.appendChild(samplePicker(b, repaint));
    host.appendChild(intro);
    if (!f && !en) { needMaster(host); return; }
    M.GROUPS.forEach(function (g) {
      var p = el('section', 'panel');
      var head = el('div', 'a7-name');
      head.innerHTML = '<h3 class="section-h">' + esc(g.label) + '</h3>';
      p.appendChild(head);
      var spr = g.key === 'battleEnemy' ? en : g.key === 'battleParty' ? battleOf(b, f) : f;
      if (!spr) { p.appendChild(el('div', 'empty-line', 'No sprite to preview this group on.')); host.appendChild(p); return; }
      var grid = el('div', 'a7-frames');
      (tax[g.key] || []).forEach(function (e, i) {
        var pd = poseDir(g.key, e.key), fr = S.cache().sprite(spr.id, pd.pose, pd.dir);
        var t = el('button', 'a7-frame'); t.type = 'button';
        t.setAttribute('aria-label', 'Pose ' + taxLabel(e) + (e.required ? ', required' : ', optional'));
        // Battle party frames are two tiles wide, so they get a larger box to show at the same pixel scale.
        t.appendChild(W.figure(fr, g.key === 'battleParty' ? 72 : 48));
        t.appendChild(el('span', 'a7-frame-l', esc(taxLabel(e)) + (e.required ? '' : ' ' + W.chip('optional', 'accent'))));
        t.addEventListener('click', function () { openPose(g, i, spr.id, repaint); });
        grid.appendChild(t);
      });
      p.appendChild(grid);
      if (g.key !== 'field') p.appendChild(W.button('Add an optional pose', 'spark', 'btn-ghost', function () { addPose(g, repaint); }));
      host.appendChild(p);
    });
  }
  var PARAMS = [['lean', 'Lean', -1, 1, 0.05], ['crouch', 'Crouch', 0, 2.5, 0.1], ['bob', 'Bob', 0, 1, 0.1], ['hdx', 'Head forward', -1, 1, 0.05], ['hdy', 'Head down', -1, 1, 0.05], ['wpn', 'Weapon angle', -180, 180, 5]];
  function openPose(g, i, sprId, repaintList) {
    Kit.ui.drawer({
      title: 'Pose',
      body: function (body, h) {
        function paint() {
          var b = cur(), tax = taxonomy(b), e = (tax[g.key] || [])[i], spr = ART.records.get(sprId, b);
          U.clear(body);
          if (!e || !spr) { body.appendChild(el('div', 'empty-line', 'This pose no longer exists.')); return; }
          h.setTitle(taxLabel(e) + ' (' + g.label + ')');
          var pd = poseDir(g.key, e.key), base = ES.base(b.art, spr);
          var head = el('div', 'a7-edhead');
          head.appendChild(W.figure(S.cache().sprite(spr.id, pd.pose, pd.dir), 128, taxLabel(e) + ' on ' + spr.name));
          var meta = el('div', 'a7-grow');
          meta.innerHTML = '<dl class="kv"><dt>Key</dt><dd><code>' + esc(e.key) + '</code></dd><dt>Pose</dt><dd>' + esc(poseLabel(pd.pose)) + '</dd><dt>Status</dt><dd>' + (e.required ? W.chip('required', 'muted') : W.chip('optional', 'accent')) + '</dd><dt>Sprite</dt><dd>' + esc(spr.name) + '</dd></dl>';
          head.appendChild(meta);
          body.appendChild(head);
          var ctl = el('div', 'a7-ctl');
          ctl.appendChild(text('Label', taxLabel(e), function (v) { e.label = v || e.key; touch('pose-label'); paint(); if (repaintList) repaintList(); }));
          body.appendChild(ctl);
          if (g.key === 'battleEnemy') {
            body.appendChild(el('p', 'muted', 'Enemy poses move the whole body (offsets, flashes, and the generated death) rather than redrawing it. To give an enemy a distinct attack or hurt frame, draw it from the Bestiary.'));
            body.appendChild(W.button('Open in the Bestiary', 'edit', '', function () { h.close(); ART.WS.sprites.openSprite(base.id); }));
          } else {
            body.appendChild(el('h3', 'section-h', 'Adjust for this sprite'));
            body.appendChild(el('p', 'muted a7-small', 'Changes apply to ' + esc(base.name) + (base !== spr ? ' and every sprite that shares its look' : '') + '. Other sprites keep the library pose.'));
            var own = (base.poses = U.isObj(base.poses) ? base.poses : {}), cur0 = Object.assign({}, ES.poseOf({ poses: Object.assign({}, ES.artPoses(b.art), own) }, pd.pose));
            var ctl2 = el('div', 'a7-ctl');
            PARAMS.forEach(function (pp) {
              var v = cur0[pp[0]];
              ctl2.appendChild(W.slider(pp[1], v == null ? 0 : v, pp[2], pp[3], pp[4], function (n) {
                own[pd.pose] = Object.assign({}, own[pd.pose] || {}, (function () { var o = {}; o[pp[0]] = n; return o; })());
                base.origin = 'user'; touch('pose-adjust'); paint();
              }));
            });
            body.appendChild(ctl2);
            var row = el('div', 'btn-row');
            if (own[pd.pose]) row.appendChild(W.button('Back to the library pose', 'check', 'btn-ghost', function () { delete own[pd.pose]; touch('pose-reset'); paint(); }));
            row.appendChild(W.button('Draw this frame by hand', 'edit', '', function () { ART.editSpriteFrame(spr, pd.pose, pd.dir, paint); }));
            body.appendChild(row);
          }
          if (!e.required) {
            body.appendChild(W.button('Delete this optional pose', 'x', 'btn-ghost', function () {
              Kit.ui.confirm({ title: 'Delete this pose?', message: 'The pose leaves the library. Its animation stays until you delete it on the Animations tab.', okLabel: 'Delete', danger: true }).then(function (ok) {
                if (!ok) return;
                tax[g.key].splice(i, 1); touch('pose-delete'); h.close(); if (repaintList) repaintList();
              });
            }));
          }
        }
        paint();
      }
    });
  }
  function addPose(g, repaint) {
    var b = cur(), tax = taxonomy(b), bases = Object.keys(ES.POSES).filter(function (k) { return !ES.POSES[k].lie; });
    var state = { key: '', base: g.key === 'battleEnemy' ? 'idle' : g.key === 'emote' ? 'stand' : 'attack' };
    Kit.ui.dialog({
      title: 'Add an optional pose to ' + g.label,
      body: function (body) {
        body.appendChild(el('p', 'muted', 'An optional pose starts from a library pose and gets its own animation. Coverage ignores optional poses.'));
        var c = el('div', 'a7-ctl');
        c.appendChild(text('Name', '', function (v) { state.key = v || ''; }));
        c.appendChild(W.select('Starts from', state.base, bases.map(function (k) { return [k, poseLabel(k)]; }), function (v) { state.base = v; }));
        body.appendChild(c);
      },
      actions: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Add pose', kind: 'primary', onClick: function () {
        var key = U.slug(state.key || '').replace(/-/g, '_');
        if (!key) { Kit.ui.toast('Give the pose a name.', 'warn'); return false; }
        if ((tax[g.key] || []).some(function (e) { return e.key === key; }) || ES.POSES[key]) { Kit.ui.toast('That name is taken.', 'warn'); return false; }
        tax[g.key] = tax[g.key] || [];
        tax[g.key].push({ key: key, label: state.key, required: false, pose: { base: state.base } });
        var ak = M.animKey(g.key, key);
        ART.records.put(ART.envelope('anm_', state.key, { kind: 'role', ref: 'anim:' + ak }, 'user', null, { kind: 'sprite', loop: g.key !== 'emote', frames: [{ pose: key, ms: 400 }], markers: [] }));
        touch('pose-add'); repaint();
        Kit.ui.toast('Added the pose ' + state.key + ' and its animation.', 'ok');
      } }]
    });
  }

  // ---------------------------------------------------------------- Animations
  function libKeyOf(a) { return a.subject && a.subject.kind === 'role' && /^anim:/.test(a.subject.ref) ? a.subject.ref.slice(5) : null; }
  function groupOf(key) { if (!key) return 'other'; if (key === 'walk') return 'field'; if (/^emote\./.test(key)) return 'emote'; if (/^battle\./.test(key)) return 'battleParty'; if (/^enemy\./.test(key)) return 'battleEnemy'; return 'other'; }
  function previewFor(b, a) {
    var key = libKeyOf(a), g = groupOf(key), f = sample(b);
    if (g === 'battleEnemy' || a.kind === 'death') return { spr: sampleEnemy(b), dir: 'right' };
    if (g === 'battleParty') return { spr: battleOf(b, f), dir: 'left' };
    return { spr: f, dir: g === 'field' ? 'right' : 'down' };
  }
  function animSummary(a) {
    if (a.kind === 'death') return 'Death, ' + a.method + ', ' + a.ms + ' ms';
    var fs = Array.isArray(a.frames) ? a.frames.length : 0;
    return fs + ' frame' + (fs === 1 ? '' : 's') + ', ' + EA.duration(a) + ' ms' + (a.loop ? ', loops' : '') + ((a.markers || []).length ? ', ' + a.markers.length + ' marker' + (a.markers.length === 1 ? '' : 's') : '');
  }
  function viewAnims(host, repaint) {
    var b = cur(), all = M.anims(b).filter(function (a) { return a.kind !== 'ability'; });
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Animations</h3><p class="muted">Each animation is a list of poses with durations, offsets, and flashes, plus markers that tell the battle presenter when a hit lands and the sound engine when to play. Sprites play the library animation unless one is mapped to them.</p>';
    intro.appendChild(samplePicker(b, repaint));
    host.appendChild(intro);
    if (!all.length) { needMaster(host); return; }
    M.GROUPS.concat([{ key: 'other', label: 'Other and extra' }]).forEach(function (g) {
      var list = all.filter(function (a) { var k = groupOf(libKeyOf(a)); return k === g.key || (g.key === 'battleEnemy' && a.kind === 'death' && k === 'other'); });
      if (g.key === 'other') list = all.filter(function (a) { return groupOf(libKeyOf(a)) === 'other' && a.kind !== 'death'; });
      if (!list.length) return;
      var p = el('section', 'panel');
      p.appendChild(el('h3', 'section-h', esc(g.label)));
      list.forEach(function (a) {
        var row = rowFor(a), pv = previewFor(b, a);
        row.appendChild(animStage(pv.spr, a, pv.dir, a.name + ' preview'));
        var mid = el('div', 'a7-grow');
        mid.innerHTML = '<div class="a7-name"><strong>' + esc(a.name) + '</strong> ' + W.origin(a) + '</div><div class="muted a7-small">' + esc(animSummary(a)) + '</div>';
        row.appendChild(mid);
        var acts = el('div', 'a7-acts');
        acts.appendChild(W.button('Edit', 'edit', '', function () { openAnim(a.id, repaint); }));
        row.appendChild(acts);
        p.appendChild(row);
      });
      host.appendChild(p);
    });
  }
  function poseOptions(b) {
    var keys = Object.keys(ES.POSES).concat(Object.keys(ES.artPoses(b.art)));
    return keys.filter(function (k, i) { return keys.indexOf(k) === i; }).map(function (k) { return [k, poseLabel(k)]; });
  }
  function openAnim(id, repaintList) {
    Kit.ui.drawer({
      title: 'Animation',
      body: function (body, h) {
        function done(reason) { var a = ART.records.get(id); if (a && a.origin === 'default') a.origin = 'user'; touch(reason); paint(); if (repaintList) repaintList(); }
        function paint() {
          var b = cur(), a = ART.records.get(id);
          U.clear(body);
          if (!a) { body.appendChild(el('div', 'empty-line', 'This animation no longer exists.')); return; }
          h.setTitle(a.name);
          var pv = previewFor(b, a), key = libKeyOf(a), libDef = M.LIBRARY.filter(function (d) { return d.key === key; })[0];
          var head = el('div', 'a7-edhead');
          head.appendChild(animStage(pv.spr, a, pv.dir, a.name + ' preview'));
          var meta = el('div', 'a7-grow');
          meta.innerHTML = '<dl class="kv"><dt>Record</dt><dd><code class="id">' + esc(a.id) + '</code></dd><dt>Plays as</dt><dd>' + esc(key || 'unmapped') + '</dd><dt>Origin</dt><dd>' + W.origin(a) + '</dd><dt>Length</dt><dd>' + esc(animSummary(a)) + '</dd></dl>';
          head.appendChild(meta);
          body.appendChild(head);
          body.appendChild(samplePicker(b, paint));
          if (a.kind === 'death') {
            var dc = el('div', 'a7-ctl');
            dc.appendChild(W.select('Method', a.method, EA.DEATH_METHODS.map(function (m) { return [m, m.charAt(0).toUpperCase() + m.slice(1)]; }), function (v) { a.method = v; done('anim-death'); }));
            dc.appendChild(num('Length (ms)', a.ms, 100, 5000, 50, function (v) { a.ms = v; done('anim-death'); }));
            body.appendChild(dc);
            body.appendChild(el('p', 'muted a7-small', 'Deaths are generated from the enemy\'s own pixels each time they play, so they cost nothing to store.'));
          } else {
            var tc = el('div', 'a7-ctl');
            tc.appendChild(W.toggle('Loops', !!a.loop, function (on) { a.loop = on; done('anim-loop'); }));
            body.appendChild(tc);
            body.appendChild(el('h3', 'section-h', 'Frames'));
            var tbl = el('div', 'a7-ftable');
            var opts = poseOptions(b);
            (a.frames || []).forEach(function (f, i) {
              var r = el('div', 'a7-frow');
              r.appendChild(el('span', 'a7-fnum', String(i + 1)));
              r.appendChild(W.select('Pose', f.pose, opts, function (v) { f.pose = v; done('anim-frame'); }));
              r.appendChild(num('ms', f.ms, 10, 10000, 10, function (v) { f.ms = v; done('anim-frame'); }));
              var off = Array.isArray(f.off) ? f.off : [0, 0];
              r.appendChild(num('Forward', off[0], -32, 32, 1, function (v) { f.off = [v, off[1]]; done('anim-frame'); }));
              r.appendChild(num('Down', off[1], -32, 32, 1, function (v) { f.off = [off[0], v]; done('anim-frame'); }));
              r.appendChild(W.toggle('Flash', !!f.flash, function (on) { if (on) f.flash = true; else delete f.flash; done('anim-frame'); }));
              var mv = el('div', 'a7-acts');
              if (i) mv.appendChild(W.button('Up', null, 'btn-ghost', function () { a.frames.splice(i - 1, 0, a.frames.splice(i, 1)[0]); (a.markers || []).forEach(function (m) { if (m.f === i) m.f = i - 1; else if (m.f === i - 1) m.f = i; }); done('anim-order'); }));
              if (a.frames.length > 1) mv.appendChild(W.button('Remove', 'x', 'btn-ghost', function () { a.frames.splice(i, 1); a.markers = (a.markers || []).filter(function (m) { return m.f !== i; }).map(function (m) { if (m.f > i) m.f--; return m; }); done('anim-frame'); }));
              r.appendChild(mv);
              tbl.appendChild(r);
            });
            body.appendChild(tbl);
            body.appendChild(W.button('Add a frame', 'spark', 'btn-ghost', function () { var lastF = a.frames[a.frames.length - 1] || { pose: 'stand', ms: 150 }; a.frames.push({ pose: lastF.pose, ms: lastF.ms }); done('anim-frame'); }));
            body.appendChild(el('h3', 'section-h', 'Markers'));
            body.appendChild(el('p', 'muted a7-small', 'A hit marker is when damage numbers pop and the target reacts. Sound markers name a cue the Sound tab plays in Phase 6. Particle, flash, and shake markers trigger effects.'));
            var mt = el('div', 'a7-ftable');
            (a.markers = Array.isArray(a.markers) ? a.markers : []).forEach(function (m, i) {
              var r = el('div', 'a7-frow');
              r.appendChild(W.select('Frame', String(m.f), a.frames.map(function (_, j) { return [String(j), String(j + 1)]; }), function (v) { m.f = Number(v); done('anim-marker'); }));
              r.appendChild(W.select('Type', m.type, EA.MARKER_TYPES.map(function (t) { return [t, t]; }), function (v) { m.type = v; done('anim-marker'); }));
              r.appendChild(text('Cue', m.arg, function (v) { m.arg = v; done('anim-marker'); }));
              r.appendChild(W.button('Remove', 'x', 'btn-ghost', function () { a.markers.splice(i, 1); done('anim-marker'); }));
              mt.appendChild(r);
            });
            body.appendChild(mt);
            body.appendChild(W.button('Add a marker', 'spark', 'btn-ghost', function () { a.markers.push({ f: 0, type: 'hit', arg: null }); done('anim-marker'); }));
          }
          var row = el('div', 'btn-row');
          row.appendChild(W.button('Duplicate', 'slots', '', function () {
            var copy = ART.envelope('anm_', a.name + ' copy', null, 'user', null, U.clone({ kind: a.kind, loop: a.loop, frames: a.frames, markers: a.markers, method: a.method, ms: a.ms }));
            Object.keys(copy).forEach(function (k) { if (copy[k] === undefined) delete copy[k]; });
            ART.records.put(copy); touch('anim-duplicate'); h.close(); if (repaintList) repaintList(); openAnim(copy.id, repaintList);
          }));
          if (libDef) row.appendChild(W.button('Reset to the library default', 'check', 'btn-ghost', function () {
            Kit.ui.confirm({ title: 'Reset this animation?', message: 'Frames and markers go back to the library default.', okLabel: 'Reset' }).then(function (ok) {
              if (!ok) return;
              ['frames', 'markers', 'loop', 'method', 'ms'].forEach(function (k) { delete a[k]; });
              Object.keys(libDef.body).forEach(function (k) { a[k] = U.clone(libDef.body[k]); });
              a.origin = 'default'; touch('anim-reset'); paint(); if (repaintList) repaintList();
            });
          }));
          if (!key || !libDef) row.appendChild(W.button('Delete', 'x', 'btn-ghost', function () {
            Kit.ui.confirm({ title: 'Delete this animation?', message: 'Sprites mapped to it fall back to the library animation.', okLabel: 'Delete', danger: true }).then(function (ok) {
              if (!ok) return;
              S.sprites().forEach(function (s) { Object.keys(s.anims || {}).forEach(function (k) { if (s.anims[k] === a.id) delete s.anims[k]; }); });
              ART.records.del(a.id); touch('anim-delete'); h.close(); if (repaintList) repaintList();
            });
          }));
          body.appendChild(row);
        }
        paint();
      }
    });
  }

  // ---------------------------------------------------------------- Ability animations
  // A small battle: the enemy on the left facing right, the caster on the right facing left (the party side).
  function abilityStage(b, anm, label) {
    var t = T(), w = 10 * t, h = Math.round(4 * t), k = charterScale(), u = EA.unit(t);
    var caster = battleOf(b, sample(b)), foe = sampleEnemy(b), fx = anm.impact && anm.impact.fx ? ART.records.get(anm.impact.fx, b) : null;
    var cAnm = caster ? M.animFor(caster, 'battle.' + (anm.caster || 'attack'), b) : null, idle = caster ? M.animFor(caster, 'battle.idle', b) : null;
    var fIdle = foe ? M.animFor(foe, 'enemy.idle', b) : null, fHurt = foe ? M.animFor(foe, 'enemy.hurt', b) : null;
    var gy = Math.round(h * 0.84), from = { x: Math.round(w * 0.74) - 3 * u, y: gy - Math.round(t * 0.9) }, to = { x: Math.round(w * 0.26), y: gy - t };
    var pb = null, hurtAt = -1, gap = 600, t0 = 0;
    function reset(tm) { pb = ER.ability.create({ anm: anm, caster: cAnm, from: from, to: to, efx: fx, entries: P.entries(b), unit: u, seed: 13 }); hurtAt = -1; t0 = tm; }
    return stage(w, h, k, function (ctx, tm, dt) {
      if (!pb || (pb.done() && tm - t0 > pb.timeline.duration + gap)) reset(tm);
      var fired = pb.step(dt);
      fired.forEach(function (m) { if (m.type === 'hit') hurtAt = tm; });
      var sc = pb.screen();
      var shook = (sc.shake[0] || sc.shake[1]) && ctx.translate;
      if (shook) { ctx.save(); ctx.translate(sc.shake[0], sc.shake[1]); }
      backdrop(ctx, w, h, 0.84);
      if (foe) ER.draw.sprite(ctx, S.cache(), foe.id, hurtAt >= 0 && tm - hurtAt < EA.duration(fHurt) ? fHurt : fIdle, hurtAt >= 0 && tm - hurtAt < EA.duration(fHurt) ? tm - hurtAt : tm, to.x, gy, { dir: 'right' });
      if (caster) { var ca = pb.casterAt(), playing = pb.t < pb.timeline.casterMs; ER.draw.sprite(ctx, S.cache(), caster.id, playing ? cAnm : idle, playing ? ca.t : tm, Math.round(w * 0.74) - ca.off[0], gy, { dir: 'left' }); }
      pb.draw(ctx);
      if (sc.darken) { ctx.globalAlpha = sc.darken; ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
      if (sc.flash) { ctx.globalAlpha = sc.flash; ctx.fillStyle = sc.flashColor; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
      if (shook) ctx.restore();
      if (sc.wave) ER.fx.wave(ctx, sc.wave, tm, w, h);
    }, label);
  }
  function abilityRows(b) {
    var rows = [], abls = b.rules && U.isObj(b.rules.abl_) ? b.rules.abl_ : {};
    M.DEFAULT_ABILITIES.forEach(function (d) { var r = M.defaultAbility(b, d.key); if (r) rows.push({ anm: r, label: d.label + ' (default)', note: 'Used when an ability has no animation of its own.' }); });
    Object.keys(abls).forEach(function (id) { var r = M.abilityAnim(b, id); if (r) rows.push({ anm: r, label: abls[id].name || id, note: (abls[id].kind || '') + (abls[id].element ? ', ' + abls[id].element : '') }); });
    M.anims(b).filter(function (a) { return a.kind === 'ability' && rows.every(function (x) { return x.anm !== a; }); }).forEach(function (a) { rows.push({ anm: a, label: a.name, note: 'Not linked to an ability' }); });
    return rows;
  }
  function abilitySummary(a) { return (a.caster || 'attack') + ' pose, ' + ((a.travel || {}).type || 'none') + (a.travel && a.travel.type !== 'none' ? ' ' + a.travel.ms + ' ms' : '') + ', ' + (a.hits || 1) + ' hit' + ((a.hits || 1) > 1 ? 's' : '') + (a.impact && a.impact.shake ? ', shake' : '') + (a.impact && a.impact.flash ? ', flash' : ''); }
  function viewAbilities(host, repaint) {
    var b = cur(), rows = abilityRows(b);
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Ability animations</h3><p class="muted">The caster strikes its battle pose, the effect travels (thrown, beamed, rising, or falling), and the element\'s particles burst on the target, with hits timed to the markers. Each ability\'s look comes from its kind, targeting, and element.</p>';
    intro.appendChild(samplePicker(b, repaint));
    host.appendChild(intro);
    if (!rows.length) { needMaster(host); return; }
    var p = el('section', 'panel');
    rows.forEach(function (x) {
      var row = rowFor(x.anm);
      row.appendChild(abilityStage(b, x.anm, x.label + ' preview'));
      var mid = el('div', 'a7-grow');
      mid.innerHTML = '<div class="a7-name"><strong>' + esc(x.label) + '</strong> ' + W.origin(x.anm) + '</div><div class="muted a7-small">' + esc(x.note) + '</div><div class="muted a7-small">' + esc(abilitySummary(x.anm)) + '</div>';
      row.appendChild(mid);
      var acts = el('div', 'a7-acts');
      acts.appendChild(W.button('Edit', 'edit', '', function () { openAbility(x.anm.id, repaint); }));
      row.appendChild(acts);
      p.appendChild(row);
    });
    host.appendChild(p);
  }
  function openAbility(id, repaintList) {
    Kit.ui.drawer({
      title: 'Ability animation',
      body: function (body, h) {
        function done(reason) { var a = ART.records.get(id); if (a) a.origin = 'user'; touch(reason); paint(); if (repaintList) repaintList(); }
        function paint() {
          var b = cur(), a = ART.records.get(id);
          U.clear(body);
          if (!a) { body.appendChild(el('div', 'empty-line', 'This animation no longer exists.')); return; }
          h.setTitle(a.name);
          body.appendChild(abilityStage(b, a, a.name + ' preview'));
          body.appendChild(samplePicker(b, paint));
          a.travel = U.isObj(a.travel) ? a.travel : { type: 'none', ms: 0 };
          a.impact = U.isObj(a.impact) ? a.impact : { fx: null, ms: 420 };
          var c1 = el('div', 'a7-ctl');
          c1.appendChild(W.select('Caster pose', a.caster, EA.CASTERS.map(function (k) { return [k, poseLabel(k)]; }), function (v) { a.caster = v; done('ability-caster'); }));
          c1.appendChild(W.select('Travel', a.travel.type, EA.TRAVELS.map(function (k) { return [k, k === 'none' ? 'None (melee)' : k.charAt(0).toUpperCase() + k.slice(1)]; }), function (v) { a.travel.type = v; if (v !== 'none' && !a.travel.ms) a.travel.ms = 260; done('ability-travel'); }));
          if (a.travel.type !== 'none') c1.appendChild(num('Travel (ms)', a.travel.ms || 260, 40, 3000, 20, function (v) { a.travel.ms = v; done('ability-travel'); }));
          body.appendChild(c1);
          var fxs = P.effects(b), c2 = el('div', 'a7-ctl');
          c2.appendChild(W.select('Effect', a.impact.fx || '', [['', 'Plain sparks']].concat(fxs.map(function (f) { return [f.id, f.name]; })), function (v) { a.impact.fx = v || null; done('ability-fx'); }));
          c2.appendChild(num('Impact (ms)', a.impact.ms || 420, 60, 3000, 20, function (v) { a.impact.ms = v; done('ability-impact'); }));
          c2.appendChild(W.toggle('Flash', !!a.impact.flash, function (on) { a.impact.flash = on; done('ability-flash'); }));
          c2.appendChild(W.slider('Shake', a.impact.shake || 0, 0, 3, 1, function (v) { a.impact.shake = v; done('ability-shake'); }));
          c2.appendChild(W.slider('Hits', a.hits || 1, 1, 8, 1, function (v) { a.hits = v; done('ability-hits'); }));
          body.appendChild(c2);
          var tl = ER.ability.timeline(a, M.animFor(battleOf(b, sample(b)), 'battle.' + (a.caster || 'attack'), b));
          body.appendChild(el('p', 'muted a7-small', esc('Release at ' + tl.release + ' ms, hits at ' + tl.hits.join(', ') + ' ms, done at ' + tl.duration + ' ms. The release is the caster animation\'s first hit marker.')));
          var row = el('div', 'btn-row');
          var abl = a.subject && a.subject.kind === 'abl' && b.rules && b.rules.abl_ ? b.rules.abl_[a.subject.ref] : null;
          if (abl) row.appendChild(W.button('Reset to generated', 'check', 'btn-ghost', function () {
            var look = M.abilityLook(abl, abl.element ? ART.bySubject('efx_', 'element', abl.element, b) : null);
            Object.keys(look).forEach(function (k) { a[k] = look[k]; }); a.origin = 'procedural'; touch('ability-reset'); paint(); if (repaintList) repaintList();
          }));
          body.appendChild(row);
        }
        paint();
      }
    });
  }

  // ---------------------------------------------------------------- Effects
  function effectStage(b, r, label) {
    var t = T(), w = 4 * t, h = 3 * t, k = charterScale(), u = EA.unit(t), sys = null, t0 = 0, ent = P.entries(b);
    var cols = (r.palette || []).map(function (m) { return ent[m] || '#ffffff'; });
    return stage(w, h, k, function (ctx, tm, dt) {
      if (!sys || tm - t0 > Math.max(900, (r.particle && r.particle.life || 420) * 1.5)) { sys = ER.fx.create({ x: w / 2, y: h * 0.6, to: { x: w / 2 + 2 * u, y: 2 * u }, colors: cols, particle: r.particle || {}, unit: u }, ((tm / 100) | 0) + 3); t0 = tm; }
      ER.fx.step(sys, dt);
      var p = Math.min(1, (tm - t0) / 600), sc = ER.fx.screen(r.screen || 'none', p, u, 5);
      var shook = (sc.shake[0] || sc.shake[1]) && ctx.translate;
      if (shook) { ctx.save(); ctx.translate(sc.shake[0], sc.shake[1]); }
      backdrop(ctx, w, h, 0.8);
      ER.fx.draw(ctx, sys);
      if (sc.darken) { ctx.globalAlpha = sc.darken; ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
      if (shook) ctx.restore();
      if (sc.wave) ER.fx.wave(ctx, sc.wave, tm, w, h);
    }, label);
  }
  function viewEffects(host, repaint) {
    var b = cur(), fx = P.effects(b);
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Element effects</h3><p class="muted">Each element bursts in its own particle shape and moves the screen its own way, so elements stay distinct even in a two color palette. Colors come from the element palette on the Palette tab.</p>';
    host.appendChild(intro);
    if (!fx.length) { needMaster(host); return; }
    var p = el('section', 'panel');
    fx.forEach(function (r) {
      var row = rowFor(r);
      row.appendChild(effectStage(b, r, r.name + ' preview'));
      var pt = r.particle || {};
      var mid = el('div', 'a7-grow');
      mid.innerHTML = '<div class="a7-name"><strong>' + esc(r.name) + '</strong> ' + W.origin(r) + '</div><div class="muted a7-small">' + esc((pt.shape || 'spark') + ', ' + (pt.count || 12) + ' particles, screen ' + (r.screen || 'none')) + '</div>';
      row.appendChild(mid);
      var acts = el('div', 'a7-acts');
      acts.appendChild(W.button('Edit', 'edit', '', function () { openEffect(r.id, repaint); }));
      row.appendChild(acts);
      p.appendChild(row);
    });
    host.appendChild(p);
  }
  function openEffect(id, repaintList) {
    Kit.ui.drawer({
      title: 'Effect',
      body: function (body, h) {
        function done(reason) { var r = ART.records.get(id); if (r) r.origin = 'user'; touch(reason); paint(); if (repaintList) repaintList(); }
        function paint() {
          var b = cur(), r = ART.records.get(id);
          U.clear(body);
          if (!r) { body.appendChild(el('div', 'empty-line', 'This effect no longer exists.')); return; }
          h.setTitle(r.name);
          body.appendChild(effectStage(b, r, r.name + ' preview'));
          var pt = r.particle = U.isObj(r.particle) ? r.particle : { shape: 'spark', count: 12, life: 420, gravity: 0, spread: 1, speed: 1 };
          var c = el('div', 'a7-ctl');
          c.appendChild(W.select('Particle', pt.shape || 'spark', ER.fx.SHAPES.map(function (s) { return [s, s]; }), function (v) { pt.shape = v; done('fx-shape'); }));
          c.appendChild(W.select('Screen', r.screen || 'none', ER.fx.SCREENS.map(function (s) { return [s, s]; }), function (v) { r.screen = v; done('fx-screen'); }));
          body.appendChild(c);
          var c2 = el('div', 'a7-ctl');
          c2.appendChild(W.slider('Count', pt.count || 12, 1, 60, 1, function (v) { pt.count = v; done('fx-count'); }));
          c2.appendChild(W.slider('Life (ms)', pt.life || 420, 120, 2000, 20, function (v) { pt.life = v; done('fx-life'); }));
          c2.appendChild(W.slider('Gravity', pt.gravity || 0, -1, 1, 0.05, function (v) { pt.gravity = v; done('fx-gravity'); }));
          c2.appendChild(W.slider('Spread', pt.spread == null ? 1 : pt.spread, 0.2, 2, 0.05, function (v) { pt.spread = v; done('fx-spread'); }));
          c2.appendChild(W.slider('Speed', pt.speed == null ? 1 : pt.speed, 0.2, 3, 0.05, function (v) { pt.speed = v; done('fx-speed'); }));
          body.appendChild(c2);
          body.appendChild(W.button('Edit colors on the Palette tab', 'chart', 'btn-ghost', function () { h.close(); Kit.jump(r.id); }));
        }
        paint();
      }
    });
  }

  // ---------------------------------------------------------------- Weather
  // The overlay plays over the full Charter resolution, so densities read the way the game will show them.
  // Rows show it at 1x, the drawer at the Charter scale; either way a whole number, so one pixel streaks survive.
  function weatherStage(b, r, label, big) {
    var R = res(), u = EA.unit(T()), k = big ? charterScale() : 1, st = null, ent = P.entries(b);
    var cv = stage(R.w, R.h, k, function (ctx, tm, dt) {
      if (!st) st = ER.weather.create(r, R.w, R.h, 9, { entries: ent, unit: u });
      ER.weather.step(st, dt);
      backdrop(ctx, R.w, R.h, 0.62);
      ER.weather.draw(ctx, st);
    }, label);
    return cv;
  }
  function viewWeather(host, repaint) {
    var b = cur(), wths = b.rules && U.isObj(b.rules.wth_) ? b.rules.wth_ : {}, ids = Object.keys(wths);
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Weather overlays</h3><p class="muted">Each weather state gets an overlay inferred from its real world description: rain streaks, snowflakes, motes of dust or ash, fog bands, blowing leaves, and lightning, with a tint. Clear weather is an overlay of type none, which still counts as covered. A description with no known keyword gets a plainly generic overlay to edit.</p>';
    host.appendChild(intro);
    if (!ids.length) { intro.appendChild(el('div', 'empty-line', 'The bundle has no weather states.')); return; }
    var p = el('section', 'panel');
    var any = false;
    ids.forEach(function (id) {
      var w = wths[id], r = M.overlayFor(b, id);
      if (!r) return;
      any = true;
      var row = rowFor(r);
      row.appendChild(weatherStage(b, r, (w.name || id) + ' overlay preview', false));
      var mid = el('div', 'a7-grow');
      mid.innerHTML = '<div class="a7-name"><strong>' + esc(w.name || id) + '</strong> ' + W.origin(r) + (r.generic ? ' ' + W.chip('generic, edit me', 'warning') : r.keyword ? ' ' + W.chip(r.keyword, 'muted') : '') + '</div><div class="muted a7-small">' + esc(w.realWorld || 'No real world description') + '</div><div class="muted a7-small">' + esc((r.layers || []).map(function (x) { return x.type; }).join(', ') + (r.lightning ? ', lightning' : '') + (r.tint ? ', tint' : '')) + '</div>';
      row.appendChild(mid);
      var acts = el('div', 'a7-acts');
      acts.appendChild(W.button('Edit', 'edit', '', function () { openWeather(r.id, repaint); }));
      row.appendChild(acts);
      p.appendChild(row);
    });
    if (!any) { host.appendChild(p); needMaster(host); return; }
    host.appendChild(p);
  }
  function colorBtn(label, m, onPick) {
    var ent = P.entries(), hex = typeof m === 'number' ? ent[m] : null;
    var sw = ART.WS.palette.swatch(hex || '#000000', m, { label: label, onClick: function () { ART.WS.palette.pickMaster(label, m).then(function (v) { if (v !== null) onPick(v); }); } });
    var w = el('span', 'a7-colorbtn'); w.appendChild(sw); w.appendChild(el('span', null, esc(label))); return w;
  }
  function openWeather(id, repaintList) {
    Kit.ui.drawer({
      title: 'Weather overlay',
      body: function (body, h) {
        function done(reason) { var r = ART.records.get(id); if (r) { r.origin = 'user'; r.generic = false; } touch(reason); paint(); if (repaintList) repaintList(); }
        function paint() {
          var b = cur(), r = ART.records.get(id);
          U.clear(body);
          if (!r) { body.appendChild(el('div', 'empty-line', 'This overlay no longer exists.')); return; }
          h.setTitle(r.name);
          var w = r.subject && b.rules && b.rules.wth_ ? b.rules.wth_[r.subject.ref] : null;
          body.appendChild(weatherStage(b, r, r.name + ' preview', true));
          body.appendChild(el('p', 'muted a7-small', esc((w && w.realWorld ? 'Described as: ' + w.realWorld + '. ' : '') + (r.generic ? 'No keyword matched, so this is a generic overlay.' : r.keyword ? 'Matched the keyword ' + r.keyword + '.' : ''))));
          r.layers = Array.isArray(r.layers) ? r.layers : [];
          body.appendChild(el('h3', 'section-h', 'Layers'));
          r.layers.forEach(function (x, i) {
            var box = el('div', 'a7-layer');
            var c = el('div', 'a7-ctl');
            c.appendChild(W.select('Type', x.type, ER.weather.TYPES.map(function (t) { return [t, t]; }), function (v) { x.type = v; if (x.density == null) x.density = 0.5; done('wov-type'); }));
            if (x.type !== 'none' && x.type !== 'bolt') {
              c.appendChild(colorBtn('Color', x.m, function (v) { x.m = v; delete x.hex; done('wov-color'); }));
              c.appendChild(W.slider('Density', x.density == null ? 0.5 : x.density, 0, 1, 0.05, function (v) { x.density = v; done('wov-density'); }));
              c.appendChild(W.slider('Angle', x.angle || 0, -80, 80, 1, function (v) { x.angle = v; done('wov-angle'); }));
              c.appendChild(W.slider('Speed', x.speed == null ? 1 : x.speed, 0, 4, 0.1, function (v) { x.speed = v; done('wov-speed'); }));
              c.appendChild(W.slider('Depth', x.depth == null ? 1 : x.depth, 0, 1, 0.05, function (v) { x.depth = v; done('wov-depth'); }));
            }
            c.appendChild(W.button('Remove layer', 'x', 'btn-ghost', function () { r.layers.splice(i, 1); if (!r.layers.length) r.layers.push({ type: 'none' }); done('wov-layer'); }));
            box.appendChild(c);
            body.appendChild(box);
          });
          body.appendChild(W.button('Add a layer', 'spark', 'btn-ghost', function () { r.layers = r.layers.filter(function (x) { return x.type !== 'none'; }); r.layers.push({ type: 'mote', density: 0.4, angle: 0, speed: 1, depth: 1, m: P.entries().length - 1 }); done('wov-layer'); }));
          body.appendChild(el('h3', 'section-h', 'Tint and lightning'));
          var c2 = el('div', 'a7-ctl');
          c2.appendChild(W.toggle('Tint', !!r.tint, function (on) { r.tint = on ? { m: ER.palette.outline(P.entries()), alpha: 0.15 } : null; done('wov-tint'); }));
          if (r.tint) {
            c2.appendChild(colorBtn('Tint color', r.tint.m, function (v) { r.tint.m = v; delete r.tint.hex; done('wov-tint'); }));
            c2.appendChild(W.slider('Strength', r.tint.alpha || 0, 0, 0.8, 0.02, function (v) { r.tint.alpha = v; done('wov-tint'); }));
          }
          body.appendChild(c2);
          var c3 = el('div', 'a7-ctl');
          c3.appendChild(W.toggle('Lightning', !!r.lightning, function (on) { r.lightning = on ? { every: [2000, 6000], flashMs: 160, m: ER.palette.nearest(P.entries(), '#ffffff') } : null; done('wov-lightning'); }));
          if (r.lightning) {
            var ev = r.lightning.every;
            c3.appendChild(num('Every, from (ms)', ev[0], 300, 30000, 100, function (v) { ev[0] = v; if (ev[1] < v) ev[1] = v; done('wov-lightning'); }));
            c3.appendChild(num('to (ms)', ev[1], 300, 60000, 100, function (v) { ev[1] = Math.max(v, ev[0]); done('wov-lightning'); }));
            c3.appendChild(num('Flash (ms)', r.lightning.flashMs || 160, 40, 1200, 10, function (v) { r.lightning.flashMs = v; done('wov-lightning'); }));
          }
          body.appendChild(c3);
          var row = el('div', 'btn-row');
          if (w) row.appendChild(W.button('Infer again from the description', 'spark', 'btn-ghost', function () {
            var nb = M.weatherBody(M.inferWeather(M.weatherText(w)), P.entries(b));
            Object.keys(nb).forEach(function (k) { r[k] = nb[k]; }); r.origin = 'procedural'; touch('wov-infer'); paint(); if (repaintList) repaintList();
          }));
          body.appendChild(row);
        }
        paint();
      }
    });
  }

  // ---------------------------------------------------------------- mount
  var VIEWS = { poses: viewPoses, anims: viewAnims, abilities: viewAbilities, effects: viewEffects, weather: viewWeather };
  function render(host) {
    var head = el('section', 'panel');
    head.innerHTML = '<h2 class="panel-title">Motion</h2><p class="muted">Poses, animations, ability effects, element particles, and weather. Previews play at true speed and at the Charter\'s pixel scale (' + res().w + ' by ' + res().h + ', shown ' + charterScale() + 'x).</p>';
    host.appendChild(head);
    W.subtabs(host, SUBS, ui, VIEWS);
  }
  function focus(rid) {
    var r = ART.records.get(rid);
    if (!r) return;
    ui.focus = rid;
    var p = Kit.ids.prefixOf(rid);
    ui.sub = p === 'wov_' ? 'weather' : p === 'efx_' ? 'effects' : r.kind === 'ability' ? 'abilities' : 'anims';
    Kit.rerender();
  }
  ART.WS.motion = { render: render, focus: focus, ui: ui, views: VIEWS, openAnim: openAnim, openAbility: openAbility, openEffect: openEffect, openWeather: openWeather, openPose: openPose };
})();
// === WS:MOTION END ===
