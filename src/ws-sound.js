// === WS:SOUND BEGIN ===
(function () {
  'use strict';
  // The Sound tab: Instruments, Effects, Motifs, Score by role, and the Jukebox. Every list plays what it shows; every
  // drawer edits one record and marks it edited, so Quick Build keeps it.
  var U = Kit.util, el = U.el, esc = U.esc, EA = ENGINE_AUDIO, EM = EA.motif, A = ART.audio, W = ART.ui;
  ART.WS = ART.WS || {};
  var SUBS = [['instruments', 'Instruments'], ['effects', 'Effects'], ['motifs', 'Motifs'], ['score', 'Score by role'], ['jukebox', 'Jukebox']];
  var ui = { sub: 'score', focus: null, cat: '', variation: {}, octave: 4 };
  var CH_LABEL = { p1: 'Pulse 1', p2: 'Pulse 2', tri: 'Triangle', noise: 'Noise' };
  var VAR_LABEL = { field: 'Field', sorrow: 'Sorrow', battle: 'Battle', finale: 'Finale' };
  function cur() { return Kit.bundle.current(); }
  function touch(reason) { Kit.bundle.touch(reason || 'sound'); Kit.refreshValidation(); }
  function nameOf(id) { var b = cur(), p = Kit.ids.prefixOf(id), m = p && b.rules && U.isObj(b.rules[p]) ? b.rules[p] : null; return m && m[id] && m[id].name ? m[id].name : String(id || ''); }
  function ibtn(label, icon, cls, fn, aria) {
    var b = el('button', 'btn' + (cls ? ' ' + cls : ''), A.icon(icon) + (label ? '<span>' + esc(label) + '</span>' : '')); b.type = 'button';
    if (aria || !label) b.setAttribute('aria-label', aria || label);
    if (fn) b.addEventListener('click', fn);
    return b;
  }
  function origin(r) { return A.isKept(r) ? W.chip('edited', 'accent') : W.chip(r.origin === 'default' ? 'default' : 'generated', 'muted'); }
  function textField(label, value, onChange, opts) {
    opts = opts || {};
    var id = 'a7x' + U.rand36(6), w = el('label', 'a7-text' + (opts.wide ? ' a7-wide' : '')); w.htmlFor = id; w.innerHTML = '<span>' + esc(label) + '</span>';
    var inp = el(opts.area ? 'textarea' : 'input', 'inp' + (opts.mono ? ' a7-mono' : '')); if (!opts.area) inp.type = 'text'; inp.id = id; inp.value = value == null ? '' : value;
    if (opts.placeholder) inp.placeholder = opts.placeholder; if (opts.max) inp.maxLength = opts.max; if (opts.rows) inp.rows = opts.rows;
    inp.spellcheck = false;
    inp.addEventListener('change', function () { onChange(inp.value, inp); });
    if (opts.onInput) inp.addEventListener('input', function () { opts.onInput(inp.value, inp); });
    w.appendChild(inp); return w;
  }
  function ints(s, lo, hi) {
    var parts = String(s || '').trim().split(/[\s,]+/).filter(Boolean), out = [];
    for (var i = 0; i < parts.length; i++) { var v = Number(parts[i]); if (!isFinite(v) || v !== Math.floor(v) || v < lo || v > hi) return null; out.push(v); }
    return out;
  }
  function soundNotice(host) {
    if (!A.supported()) { host.appendChild(el('p', 'msg msg-warning', 'This browser has no Web Audio, so nothing can play here. Records still edit and export normally.')); return; }
    if (!A.player()) host.appendChild(el('p', 'muted a7-small', 'Sound starts with your first tap or key press on the page, as browsers require.'));
    else if (A.prefs().muted) host.appendChild(el('p', 'msg msg-warning', 'Sound is muted. Use the speaker button at the top to turn it back on.'));
  }
  function needBuild(host, what) {
    var p = el('section', 'panel');
    p.innerHTML = '<h3 class="section-h">No ' + esc(what) + ' yet</h3><p class="muted">Quick Build makes the instruments, the sound effects for every battle and menu cue, a sound for each element and ability, a motif for the main theme, the villain, and every character, and a track for every music role, all without an API key.</p>';
    p.appendChild(W.button('Quick Build', 'spark', 'btn-primary', function () { ART.openQuickBuild(); }));
    host.appendChild(p);
  }
  function confirmDelete(r, msg, after) {
    Kit.ui.dialog({ title: 'Delete ' + r.name + '?', body: msg, actions: [{ label: 'Cancel' }, { label: 'Delete', kind: 'danger', onClick: function () { A.retire(cur(), r); touch('sound-delete'); if (after) after(); Kit.rerender(); } }] });
  }

  // ---------------------------------------------------------------- small canvases
  function canvas(w, h, label) { var c = el('canvas', 'a7-snd-cv'); c.width = w; c.height = h; c.setAttribute('role', 'img'); if (label) c.setAttribute('aria-label', label); return c; }
  function ink() { var s = getComputedStyle(document.documentElement); return { ink: (s.getPropertyValue('--ink') || '#e8e8f0').trim() || '#e8e8f0', acc: (s.getPropertyValue('--accent') || '#d8b048').trim() || '#d8b048', line: (s.getPropertyValue('--line2') || '#444').trim() || '#444' }; }
  function drawEnvelope(cv, insRec) {
    var g = cv.getContext && cv.getContext('2d'); if (!g) return;
    var n = EA.instrument.normalize(insRec, insRec.wave === 'tri' ? 'tri' : insRec.wave === 'noise' ? 'noise' : 'p1'), col = ink(), W0 = cv.width, H0 = cv.height;
    g.clearRect(0, 0, W0, H0);
    var frames = Math.max(24, n.vol.length + 12) + n.release, bw = W0 / frames;
    var pl = EA.instrument.plan(n, 60, 15, 0, (frames - n.release) / 60);
    g.fillStyle = col.line; g.fillRect(0, H0 - 1, W0, 1);
    for (var f = 0; f < frames; f++) {
      var t = f / 60, v = 0;
      pl.gain.forEach(function (x) { if (x[0] <= t + 1e-9) v = x[1]; });
      g.fillStyle = f >= frames - n.release ? col.acc : col.ink;
      var h = Math.round(v * (H0 - 4));
      g.fillRect(Math.floor(f * bw), H0 - 1 - h, Math.max(1, Math.ceil(bw) - 1), h);
    }
  }
  function drawWave(cv, data) {
    var g = cv.getContext && cv.getContext('2d'); if (!g) return;
    var col = ink(), W0 = cv.width, H0 = cv.height, mid = H0 / 2;
    g.clearRect(0, 0, W0, H0);
    g.fillStyle = col.line; g.fillRect(0, Math.round(mid), W0, 1);
    g.fillStyle = col.acc;
    var per = Math.max(1, Math.floor(data.length / W0));
    for (var x = 0; x < W0; x++) {
      var lo = 0, hi = 0;
      for (var i = x * per; i < Math.min(data.length, (x + 1) * per); i++) { if (data[i] < lo) lo = data[i]; if (data[i] > hi) hi = data[i]; }
      g.fillRect(x, Math.round(mid - hi * mid), 1, Math.max(1, Math.round((hi - lo) * mid)));
    }
  }
  // A four lane piano roll of one order row (or a motif's melody).
  function drawRoll(cv, lanes, ticks) {
    var g = cv.getContext && cv.getContext('2d'); if (!g) return;
    var col = ink(), W0 = cv.width, H0 = cv.height, n = lanes.length, lh = H0 / n;
    g.clearRect(0, 0, W0, H0);
    lanes.forEach(function (evs, li) {
      var ns = evs.filter(function (e) { return e.n != null; }).map(function (e) { return e.n; }), lo = ns.length ? Math.min.apply(null, ns) : 60, hi = ns.length ? Math.max.apply(null, ns) : 72, span = Math.max(12, hi - lo + 1);
      g.fillStyle = col.line; g.fillRect(0, Math.round((li + 1) * lh) - 1, W0, 1);
      g.fillStyle = li === 0 ? col.acc : col.ink;
      evs.forEach(function (e) {
        if (e.n == null) return;
        var x = Math.floor(e.t / ticks * W0), w = Math.max(1, Math.floor(e.d / ticks * W0) - 1), y = li * lh + 2 + (1 - (e.n - lo + 0.5) / span) * (lh - 6);
        g.fillRect(x, Math.round(y), w, 2);
      });
    });
  }

  // ---------------------------------------------------------------- instruments
  function waveChip(r) { return W.chip(r.wave === 'tri' ? 'triangle' : r.wave, r.wave === 'noise' ? 'muted' : 'accent'); }
  function viewInstruments(host) {
    var b = cur(), list = A.instruments(b);
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Instruments</h3><p class="muted">Each instrument is a set of tables stepped 60 times a second: duty (the pulse width), volume with an optional loop point, arpeggio, and pitch, plus vibrato and a release. Pulse instruments play on pulse 1 and 2, triangle on the triangle voice, noise on the noise voice.</p>';
    soundNotice(intro);
    host.appendChild(intro);
    if (!list.length) { needBuild(host, 'instruments'); return; }
    var p = el('section', 'panel'), grid = el('div', 'a7-snd-list');
    list.forEach(function (r) {
      var card = el('div', 'a7-snd-card' + (ui.focus === r.id ? ' a7-hit' : '')); card.dataset.rid = r.id;
      card.appendChild(el('div', 'a7-snd-name', '<strong>' + esc(r.name) + '</strong> ' + waveChip(r) + ' ' + origin(r)));
      var cv = canvas(160, 40, 'Volume envelope of ' + r.name); card.appendChild(cv); drawEnvelope(cv, r);
      var row = el('div', 'btn-row');
      row.appendChild(ibtn('Play', 'play', '', function () { A.playNote(r, r.wave === 'tri' ? 48 : r.wave === 'noise' ? (A.insKey(r) === 'hat' ? 106 : A.insKey(r) === 'snare' ? 96 : 62) : 69); }, 'Play ' + r.name));
      row.appendChild(W.button('Edit', 'edit', 'btn-ghost', function () { openInstrument(r.id); }));
      card.appendChild(row);
      grid.appendChild(card);
    });
    p.appendChild(grid);
    var add = el('div', 'btn-row');
    add.appendChild(W.button('New instrument', 'plus', '', function () {
      var r = ART.envelope('ins_', 'New instrument', null, 'user', 0, EA.instrument.normalize(null, 'p1'));
      ART.records.put(r); touch('ins-new'); openInstrument(r.id);
    }));
    p.appendChild(add);
    host.appendChild(p);
  }
  var KEYS = [['C', 0], ['D', 2], ['E', 4], ['F', 5], ['G', 7], ['A', 9], ['B', 11], ['C+', 12]];
  function openInstrument(id) {
    Kit.ui.drawer({
      title: 'Instrument',
      body: function (body, h) {
        function paint() {
          var b = cur(), r = ART.records.get(id);
          U.clear(body);
          if (!r) { body.appendChild(el('div', 'empty-line', 'This instrument no longer exists.')); return; }
          h.setTitle(r.name);
          function set(fn, again) { fn(); r.origin = 'user'; touch('ins-edit'); if (again !== false) paint(); }
          var head = el('div', 'a7-edhead'), cv = canvas(320, 80, 'Volume envelope'); head.appendChild(cv); drawEnvelope(cv, r);
          var meta = el('div', 'a7-grow');
          meta.innerHTML = '<dl class="kv"><dt>Record</dt><dd><code class="id">' + esc(r.id) + '</code></dd><dt>Library</dt><dd>' + esc(A.insKey(r) || 'your own') + '</dd><dt>Origin</dt><dd>' + origin(r) + '</dd></dl>';
          head.appendChild(meta); body.appendChild(head);
          var keys = el('div', 'a7-keys'); keys.setAttribute('role', 'group'); keys.setAttribute('aria-label', 'Play a note');
          var base = r.wave === 'tri' ? 36 + 12 * (ui.octave - 3) : r.wave === 'noise' ? 84 : 12 * (ui.octave + 1);
          KEYS.forEach(function (k) { var bt = el('button', 'btn', esc(k[0])); bt.type = 'button'; bt.setAttribute('aria-label', 'Play ' + k[0]); bt.addEventListener('click', function () { A.playNote(r, base + k[1]); }); keys.appendChild(bt); });
          body.appendChild(keys);
          var ctl = el('div', 'a7-ctl');
          ctl.appendChild(textField('Name', r.name, function (v) { set(function () { r.name = String(v).trim().slice(0, 60) || r.name; }); }, { max: 60 }));
          ctl.appendChild(W.select('Wave', r.wave, [['pulse', 'Pulse'], ['tri', 'Triangle'], ['noise', 'Noise']], function (v) { set(function () { r.wave = v; }); }));
          if (r.wave === 'noise') ctl.appendChild(W.select('Noise mode', r.noiseMode || 'long', [['long', 'Long (hiss)'], ['short', 'Short (metallic)']], function (v) { set(function () { r.noiseMode = v; }); }));
          if (r.wave !== 'noise') ctl.appendChild(W.select('Keyboard octave', String(ui.octave), [['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6']], function (v) { ui.octave = Number(v); paint(); }));
          body.appendChild(ctl);
          var tab = el('div', 'a7-ctl');
          function table(label, key, lo, hi, help) {
            return textField(label, (r[key] || []).join(' '), function (v, inp) {
              var a = ints(v, lo, hi);
              if (!a || (key === 'vol' && !a.length)) { Kit.ui.toast(label + ' takes whole numbers from ' + lo + ' to ' + hi + ', separated by spaces.', 'error'); inp.value = (r[key] || []).join(' '); return; }
              set(function () { r[key] = a; if (key === 'vol' && r.volLoop != null && r.volLoop >= a.length) r.volLoop = null; });
            }, { wide: true, mono: true, placeholder: help });
          }
          if (r.wave === 'pulse') tab.appendChild(table('Duty steps (0 is 12.5%, 1 is 25%, 2 is 50%, 3 is 75%)', 'duty', 0, 3, '2'));
          tab.appendChild(table('Volume steps (0 to 15)', 'vol', 0, 15, '15 14 13 12'));
          tab.appendChild(table('Arpeggio (semitones, loops)', 'arp', -48, 48, 'empty for none'));
          tab.appendChild(table('Pitch (cents, holds the last)', 'pitch', -4800, 4800, 'empty for none'));
          body.appendChild(tab);
          var ctl2 = el('div', 'a7-ctl');
          ctl2.appendChild(W.select('Volume loop', r.volLoop == null ? '' : String(r.volLoop), [['', 'Hold the last step']].concat((r.vol || []).map(function (v, i) { return [String(i), 'Loop from step ' + (i + 1) + ' (' + v + ')']; })), function (v) { set(function () { r.volLoop = v === '' ? null : Number(v); }); }));
          ctl2.appendChild(W.slider('Release frames', r.release || 0, 0, 60, 1, function (v) { set(function () { r.release = v; }); }));
          ctl2.appendChild(W.toggle('Vibrato', !!r.vibrato, function (on) { set(function () { r.vibrato = on ? { delay: 18, depth: 0.15, rate: 5.5 } : null; }); }));
          body.appendChild(ctl2);
          if (r.vibrato) {
            var vb = el('div', 'a7-ctl');
            vb.appendChild(W.slider('Vibrato delay (frames)', r.vibrato.delay, 0, 120, 1, function (v) { set(function () { r.vibrato.delay = v; }); }));
            vb.appendChild(W.slider('Vibrato depth (semitones)', r.vibrato.depth, 0.02, 1, 0.01, function (v) { set(function () { r.vibrato.depth = v; }); }));
            vb.appendChild(W.slider('Vibrato rate (Hz)', r.vibrato.rate, 1, 12, 0.5, function (v) { set(function () { r.vibrato.rate = v; }); }));
            body.appendChild(vb);
          }
          var row = el('div', 'btn-row');
          row.appendChild(W.button('Duplicate', 'plus', '', function () { var c = ART.envelope('ins_', r.name + ' copy', null, 'user', 0, U.clone(EA.instrument.normalize(r, 'p1'))); c.wave = r.wave; ART.records.put(c); touch('ins-dup'); id = c.id; paint(); }));
          var lib = A.INSTRUMENTS.filter(function (d) { return d.key === A.insKey(r); })[0];
          if (lib) row.appendChild(W.button('Reset to default', 'check', 'btn-ghost', function () { var d = lib.body(); Object.keys(d).forEach(function (k) { r[k] = d[k]; }); r.origin = 'default'; touch('ins-reset'); paint(); }));
          row.appendChild(W.button('Delete', 'trash', 'btn-ghost', function () { confirmDelete(r, 'Tracks that use it fall back to the voice\'s built in sound.' + (lib ? ' Quick Build will not recreate it.' : ''), function () { h.close(); }); }));
          body.appendChild(row);
        }
        paint();
      },
      onClose: function () { Kit.rerender(); }
    });
  }

  // ---------------------------------------------------------------- effects
  function soundGroups(b) {
    var all = A.sounds(b);
    return [
      ['Battle and menu cues', all.filter(function (r) { return r.subject && r.subject.kind === 'role'; })],
      ['Element spells', all.filter(function (r) { return r.subject && r.subject.kind === 'element'; })],
      ['Abilities', all.filter(function (r) { return r.subject && r.subject.kind === 'abl'; })],
      ['Your own', all.filter(function (r) { return !r.subject || ['role', 'element', 'abl'].indexOf(r.subject.kind) < 0; })]
    ];
  }
  function soundLabel(r) {
    var sj = r.subject || {};
    if (sj.kind === 'abl') return nameOf(sj.ref);
    if (sj.kind === 'element') { var e = ((cur().charter.ruleset || {}).elements || []).filter(function (x) { return x.key === sj.ref; })[0]; return e ? (e.label || e.key) : sj.ref; }
    return r.name;
  }
  function viewEffects(host) {
    var b = cur();
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Sound effects</h3><p class="muted">Every effect is a set of sfxr parameters rendered once into a buffer and played on its own bus, so effects never steal a music voice. Battle cues, menu sounds, each element\'s spell, and each ability have their own. Mutate nudges a sound into a cousin of itself.</p>';
    soundNotice(intro);
    var cats = el('div', 'a7-seg'); cats.setAttribute('role', 'group'); cats.setAttribute('aria-label', 'Category');
    [['', 'All']].concat(EA.sfxr.CATEGORIES.map(function (c) { return [c, c.charAt(0).toUpperCase() + c.slice(1)]; })).forEach(function (c) {
      var bt = el('button', 'btn', esc(c[1])); bt.type = 'button'; bt.setAttribute('aria-pressed', ui.cat === c[0] ? 'true' : 'false');
      bt.addEventListener('click', function () { ui.cat = c[0]; Kit.rerender(); });
      cats.appendChild(bt);
    });
    intro.appendChild(cats);
    host.appendChild(intro);
    if (!A.sounds(b).length) { needBuild(host, 'sound effects'); return; }
    soundGroups(b).forEach(function (g) {
      var list = g[1].filter(function (r) { return !ui.cat || r.category === ui.cat; });
      if (!list.length) return;
      var p = el('section', 'panel'); p.appendChild(el('h3', 'section-h', esc(g[0]) + ' <span class="muted a7-small">' + list.length + '</span>'));
      var grid = el('div', 'a7-sfx-grid');
      list.forEach(function (r) {
        var row = el('div', 'a7-sfx' + (ui.focus === r.id ? ' a7-hit' : '')); row.dataset.rid = r.id;
        row.appendChild(ibtn('', 'play', 'btn-icon', function () { A.playSfx(r.id); }, 'Play ' + soundLabel(r)));
        var nm = el('button', 'a7-sfx-name'); nm.type = 'button'; nm.innerHTML = '<strong>' + esc(soundLabel(r)) + '</strong><small>' + esc(r.category) + (A.cueKey(r) ? ' &middot; cue ' + esc(A.cueKey(r)) : '') + '</small>';
        nm.setAttribute('aria-label', 'Edit ' + soundLabel(r)); nm.addEventListener('click', function () { openSound(r.id); });
        row.appendChild(nm);
        if (A.isKept(r)) row.appendChild(el('span', null, W.chip('edited', 'accent')));
        grid.appendChild(row);
      });
      p.appendChild(grid);
      host.appendChild(p);
    });
    var add = el('section', 'panel'), row = el('div', 'a7-ctl');
    var pick = { cat: 'hit' };
    row.appendChild(W.select('New sound from a preset', pick.cat, EA.sfxr.CATEGORIES.map(function (c) { return [c, c.charAt(0).toUpperCase() + c.slice(1)]; }), function (v) { pick.cat = v; }));
    row.appendChild(W.button('Create', 'plus', '', function () {
      var seed = (Math.random() * 4294967295) >>> 0, r = ART.envelope('sfx_', 'New ' + pick.cat + ' sound', null, 'user', seed, { params: EA.sfxr.preset(pick.cat, seed), category: pick.cat, lastMutate: null });
      ART.records.put(r); touch('sfx-new'); A.playSfx(r.id); openSound(r.id);
    }));
    add.appendChild(row); host.appendChild(add);
  }
  function openSound(id) {
    Kit.ui.drawer({
      title: 'Sound effect',
      body: function (body, h) {
        var mut = { amount: 0.15 };
        function paint() {
          var r = ART.records.get(id);
          U.clear(body);
          if (!r) { body.appendChild(el('div', 'empty-line', 'This sound no longer exists.')); return; }
          h.setTitle(soundLabel(r));
          function set(fn, play) { fn(); r.params = EA.sfxr.normalize(r.params); r.origin = 'user'; touch('sfx-edit'); paint(); if (play) A.playSfx(r.id); }
          var data = EA.sfxr.render(r.params, 11025, r.seed >>> 0 || 1);
          var head = el('div', 'a7-edhead'), cv = canvas(320, 80, 'Waveform of ' + soundLabel(r)); head.appendChild(cv); drawWave(cv, data);
          var meta = el('div', 'a7-grow'), sj = r.subject || {};
          meta.innerHTML = '<dl class="kv"><dt>Record</dt><dd><code class="id">' + esc(r.id) + '</code></dd><dt>For</dt><dd>' + esc(sj.kind === 'role' ? 'cue ' + (A.cueKey(r) || sj.ref) : sj.kind ? sj.kind + ' ' + soundLabel(r) : 'nothing yet') + '</dd><dt>Length</dt><dd>' + (data.length / 11025).toFixed(2) + ' s</dd><dt>Origin</dt><dd>' + origin(r) + '</dd></dl>';
          head.appendChild(meta); body.appendChild(head);
          var row = el('div', 'btn-row');
          row.appendChild(ibtn('Play', 'play', 'btn-primary', function () { A.playSfx(r.id); }));
          row.appendChild(ibtn('Mutate', 'dice', '', function () { var seed = (Math.random() * 4294967295) >>> 0; set(function () { r.params = EA.sfxr.mutate(r.params, mut.amount, seed); r.lastMutate = { amount: mut.amount, seed: seed }; }, true); }));
          row.appendChild(ibtn('New from preset', 'spark', 'btn-ghost', function () { var seed = (Math.random() * 4294967295) >>> 0; set(function () { r.params = EA.sfxr.preset(r.category, seed); r.seed = seed; r.lastMutate = null; }, true); }));
          body.appendChild(row);
          var top = el('div', 'a7-ctl');
          top.appendChild(W.slider('Mutate amount', mut.amount, 0.05, 0.5, 0.05, function (v) { mut.amount = v; }));
          if (!sj.kind || sj.kind !== 'role') top.appendChild(textField('Name', r.name, function (v) { set(function () { r.name = String(v).trim().slice(0, 60) || r.name; }); }, { max: 60 }));
          top.appendChild(W.select('Category', r.category, EA.sfxr.CATEGORIES.map(function (c) { return [c, c.charAt(0).toUpperCase() + c.slice(1)]; }), function (v) { set(function () { r.category = v; }); }));
          top.appendChild(W.select('Wave', r.params.wave, EA.sfxr.WAVES.map(function (w) { return [w, w.charAt(0).toUpperCase() + w.slice(1)]; }), function (v) { set(function () { r.params.wave = v; }, true); }));
          body.appendChild(top);
          var grid = el('div', 'a7-ctl a7-params');
          EA.sfxr.PARAMS.forEach(function (d) {
            grid.appendChild(W.slider(d.label, r.params[d.key], d.min, d.max, 0.01, function (v) { set(function () { r.params[d.key] = v; }, true); }));
          });
          body.appendChild(grid);
          var tail = el('div', 'btn-row');
          var cue = A.CUES.filter(function (c) { return c.key === A.cueKey(r); })[0];
          if (cue) tail.appendChild(W.button('Reset to default', 'check', 'btn-ghost', function () { r.params = EA.sfxr.normalize(cue.p); r.category = cue.cat; r.origin = 'default'; r.lastMutate = null; touch('sfx-reset'); paint(); }));
          else if (sj.kind === 'element' || sj.kind === 'abl') tail.appendChild(W.button('Reset to generated', 'check', 'btn-ghost', function () { r.origin = 'procedural'; A.build(cur(), {}); touch('sfx-reset'); paint(); }));
          tail.appendChild(W.button('Duplicate', 'plus', 'btn-ghost', function () { var c = ART.envelope('sfx_', soundLabel(r) + ' copy', null, 'user', r.seed, { params: U.clone(r.params), category: r.category, lastMutate: null }); ART.records.put(c); touch('sfx-dup'); id = c.id; paint(); }));
          tail.appendChild(W.button('Delete', 'trash', 'btn-ghost', function () { confirmDelete(r, cue ? 'This cue falls silent until you restore it from Score by role or make another sound for it.' : 'Nothing plays it any more.', function () { h.close(); }); }));
          body.appendChild(tail);
        }
        paint();
      },
      onClose: function () { Kit.rerender(); }
    });
  }

  // ---------------------------------------------------------------- motifs
  function motifLabel(r) {
    var sj = r.subject || {};
    if (sj.kind === 'chr') return nameOf(sj.ref) + ' (leitmotif)';
    return r.name;
  }
  function melodyLane(r, recipe) {
    var t = EM.realize(r, recipe || { rhythm: 'straight', accomp: 'none', bass: 'none', drums: 'none' }, {}), p = EA.mml.parse(t.patterns.A);
    return { events: p.events, ticks: Math.max(1, p.ticks), track: t };
  }
  function playVariation(r, vk) {
    var vars = U.isObj(r.variations) ? r.variations : {}, recipe = Object.assign({}, EM.VARIATIONS[vk] || {}, vars[vk] || {});
    var t = EM.realize(r, recipe, A.kit(cur()));
    delete t.info;
    return A.playTrack(t, { loop: false, crossfadeMs: 120 });
  }
  function viewMotifs(host) {
    var b = cur(), list = A.motifs(b);
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Motifs</h3><p class="muted">A motif is a short melody in scale degrees. The main theme, the villain, and every character have one. Each carries four variations (field, sorrow, battle, finale) that re-voice the same notes with a mode, tempo, rhythm, accompaniment, bass, and drums, so a character\'s theme can return in a battle or a lament and still be recognized.</p>';
    soundNotice(intro);
    host.appendChild(intro);
    if (!list.length) { needBuild(host, 'motifs'); return; }
    var order = { role: 0, chr: 1 };
    list.sort(function (x, y) { return (order[(x.subject || {}).kind] || 2) - (order[(y.subject || {}).kind] || 2) || (x.id < y.id ? -1 : 1); });
    var p = el('section', 'panel'), grid = el('div', 'a7-snd-list');
    list.forEach(function (r) {
      var card = el('div', 'a7-snd-card' + (ui.focus === r.id ? ' a7-hit' : '')); card.dataset.rid = r.id;
      card.appendChild(el('div', 'a7-snd-name', '<strong>' + esc(motifLabel(r)) + '</strong> ' + origin(r)));
      card.appendChild(el('div', 'muted a7-small', esc(r.mode + ' in ' + (typeof r.key === 'number' ? EM.KEYS[r.key] : r.key) + ', ' + r.meter + ' beats, ' + r.tempo + ' bpm')));
      var lane = melodyLane(r), cv = canvas(240, 44, 'Melody of ' + motifLabel(r)); card.appendChild(cv); drawRoll(cv, [lane.events], lane.ticks);
      var row = el('div', 'a7-seg');
      Object.keys(VAR_LABEL).forEach(function (vk) { row.appendChild(ibtn(VAR_LABEL[vk], 'play', '', function () { playVariation(r, vk); }, 'Play the ' + VAR_LABEL[vk].toLowerCase() + ' variation of ' + motifLabel(r))); });
      card.appendChild(row);
      var row2 = el('div', 'btn-row');
      row2.appendChild(W.button('Edit', 'edit', 'btn-ghost', function () { openMotif(r.id); }));
      row2.appendChild(ibtn('Stop', 'stop', 'btn-ghost', function () { A.stop(150); }));
      card.appendChild(row2);
      grid.appendChild(card);
    });
    p.appendChild(grid);
    host.appendChild(p);
  }
  function retrackFrom(motifId) {
    var b = cur(), n = 0;
    A.tracks(b).forEach(function (t) { if (!A.isKept(t) && t.derivedFrom && t.derivedFrom.motif === motifId && A.rederive(b, t)) n++; });
    return n;
  }
  function openMotif(id) {
    Kit.ui.drawer({
      title: 'Motif',
      body: function (body, h) {
        function paint() {
          var r = ART.records.get(id), b = cur();
          U.clear(body);
          if (!r) { body.appendChild(el('div', 'empty-line', 'This motif no longer exists.')); return; }
          h.setTitle(motifLabel(r));
          function set(fn) { fn(); r.origin = 'user'; var n = retrackFrom(r.id); touch('motif-edit'); paint(); if (n) Kit.ui.toast(n + ' track' + (n === 1 ? '' : 's') + ' re-derived from this motif.', 'ok'); }
          var vk = ui.variation[id] || 'field';
          var lane = melodyLane(r), cv = canvas(480, 80, 'Melody of ' + motifLabel(r));
          body.appendChild(cv); drawRoll(cv, [lane.events], lane.ticks);
          var pd = EM.parseDegrees(r.degrees), pr = EM.parseDurs(r.durs);
          var probs = pd.errors.concat(pr.errors).map(function (e) { return e.message; });
          if (pd.tokens.length !== pr.durs.length) probs.push(pd.tokens.length + ' degrees and ' + pr.durs.length + ' durations: the extras are ignored.');
          if (probs.length) body.appendChild(el('p', 'msg msg-warning', esc(probs.slice(0, 3).join(' '))));
          var tx = el('div', 'a7-ctl');
          tx.appendChild(textField('Scale degrees (1 to 9, # or b before, \' up or , down after, r rest)', r.degrees, function (v) { set(function () { r.degrees = String(v).trim().replace(/\s+/g, ' '); }); }, { wide: true, mono: true, area: true, rows: 2 }));
          tx.appendChild(textField('Durations in eighths (2 is a quarter, 2/3 a triplet eighth)', r.durs, function (v) { set(function () { r.durs = String(v).trim().replace(/\s+/g, ' '); }); }, { wide: true, mono: true, area: true, rows: 2 }));
          body.appendChild(tx);
          var ctl = el('div', 'a7-ctl');
          ctl.appendChild(W.select('Mode', r.mode, Object.keys(EM.MODES).map(function (m) { return [m, m.charAt(0).toUpperCase() + m.slice(1)]; }), function (v) { set(function () { r.mode = v; }); }));
          ctl.appendChild(W.select('Key', typeof r.key === 'number' ? EM.KEYS[r.key] : r.key, EM.KEYS.map(function (k) { return [k, k]; }), function (v) { set(function () { r.key = v; }); }));
          ctl.appendChild(W.select('Meter', String(r.meter), ['2', '3', '4', '5', '6', '7'].map(function (m) { return [m, m + ' beats']; }), function (v) { set(function () { r.meter = Number(v); }); }));
          ctl.appendChild(W.slider('Tempo', r.tempo, 40, 240, 1, function (v) { set(function () { r.tempo = v; }); }));
          body.appendChild(ctl);
          var row = el('div', 'btn-row');
          row.appendChild(ibtn('New melody', 'dice', '', function () { var seed = (Math.random() * 4294967295) >>> 0, m = EM.generate(seed, { mode: r.mode, key: r.key, tempo: r.tempo, meter: r.meter }); set(function () { r.degrees = m.degrees; r.durs = m.durs; r.seed = seed; }); }));
          if (A.isKept(r) && r.subject) row.appendChild(W.button('Reset to generated', 'check', 'btn-ghost', function () { r.origin = 'procedural'; A.build(cur(), {}); touch('motif-reset'); paint(); }));
          body.appendChild(row);
          // Variations
          body.appendChild(el('h3', 'section-h', 'Variations'));
          var seg = el('div', 'a7-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Variation');
          var vars = U.isObj(r.variations) ? r.variations : (r.variations = {});
          Object.keys(EM.VARIATIONS).concat(Object.keys(vars).filter(function (k) { return !EM.VARIATIONS[k]; })).forEach(function (k) {
            var bt = el('button', 'btn', esc(VAR_LABEL[k] || k)); bt.type = 'button'; bt.setAttribute('aria-pressed', k === vk ? 'true' : 'false');
            bt.addEventListener('click', function () { ui.variation[id] = k; paint(); });
            seg.appendChild(bt);
          });
          body.appendChild(seg);
          var v = vars[vk] = vars[vk] || U.clone(EM.VARIATIONS[vk] || EM.VARIATIONS.field);
          function setV(fn) { set(fn); }
          var vc = el('div', 'a7-ctl');
          vc.appendChild(W.select('Mode', v.mode || '', [['', 'Same as the motif']].concat(Object.keys(EM.MODES).map(function (m) { return [m, m.charAt(0).toUpperCase() + m.slice(1)]; })), function (x) { setV(function () { v.mode = x || null; }); }));
          vc.appendChild(W.select('Key', v.key == null ? '' : (typeof v.key === 'number' ? EM.KEYS[v.key] : v.key), [['', 'Same as the motif']].concat(EM.KEYS.map(function (k) { return [k, k]; })), function (x) { setV(function () { v.key = x || null; }); }));
          vc.appendChild(W.slider('Tempo scale', v.tempoScale == null ? 1 : v.tempoScale, 0.25, 2.5, 0.05, function (x) { setV(function () { v.tempoScale = x; }); }));
          vc.appendChild(W.select('Rhythm', v.rhythm || 'straight', EM.RHYTHMS.map(function (x) { return [x, x.charAt(0).toUpperCase() + x.slice(1)]; }), function (x) { setV(function () { v.rhythm = x; }); }));
          vc.appendChild(W.select('Octave', String(v.octave || 5), ['3', '4', '5', '6', '7'].map(function (x) { return [x, x]; }), function (x) { setV(function () { v.octave = Number(x); }); }));
          var leads = A.instruments(b).filter(function (x) { return x.wave === 'pulse'; });
          vc.appendChild(W.select('Lead', v.lead || '', [['', 'Default lead']].concat(leads.map(function (x) { return [x.id, x.name]; })), function (x) { setV(function () { v.lead = x || null; }); }));
          vc.appendChild(W.select('Accompaniment', v.accomp || 'arp', EM.ACCOMP.map(function (x) { return [x, x.charAt(0).toUpperCase() + x.slice(1)]; }), function (x) { setV(function () { v.accomp = x; }); }));
          vc.appendChild(W.select('Bass', v.bass || 'root', EM.BASS.map(function (x) { return [x, x.charAt(0).toUpperCase() + x.slice(1)]; }), function (x) { setV(function () { v.bass = x; }); }));
          vc.appendChild(W.select('Drums', v.drums || 'none', EM.DRUMS.map(function (x) { return [x, x.charAt(0).toUpperCase() + x.slice(1)]; }), function (x) { setV(function () { v.drums = x; }); }));
          vc.appendChild(W.toggle('Use a fragment', !!v.fragment, function (on) { setV(function () { v.fragment = on ? { start: 0, len: Math.max(1, Math.floor(pd.tokens.length / 2)), repeat: 2 } : null; }); }));
          body.appendChild(vc);
          if (v.fragment) {
            var fc = el('div', 'a7-ctl'), nTok = Math.max(1, pd.tokens.length);
            fc.appendChild(W.slider('Fragment start', v.fragment.start, 0, nTok - 1, 1, function (x) { setV(function () { v.fragment.start = x; }); }));
            fc.appendChild(W.slider('Fragment notes', v.fragment.len, 1, nTok, 1, function (x) { setV(function () { v.fragment.len = x; }); }));
            fc.appendChild(W.slider('Repeats', v.fragment.repeat, 1, 8, 1, function (x) { setV(function () { v.fragment.repeat = x; }); }));
            body.appendChild(fc);
          }
          var pr2 = el('div', 'btn-row');
          pr2.appendChild(ibtn('Play ' + (VAR_LABEL[vk] || vk).toLowerCase(), 'play', 'btn-primary', function () { playVariation(r, vk); }));
          pr2.appendChild(ibtn('Stop', 'stop', 'btn-ghost', function () { A.stop(150); }));
          body.appendChild(pr2);
          var uses = A.tracks(b).filter(function (t) { return t.derivedFrom && t.derivedFrom.motif === r.id; });
          body.appendChild(el('p', 'muted a7-small', uses.length ? esc('Scores ' + uses.map(function (t) { return t.name; }).join(', ') + '. Generated tracks re-derive when you edit this motif; edited tracks keep their notes.') : 'No track is derived from this motif yet.'));
        }
        paint();
      },
      onClose: function () { Kit.rerender(); }
    });
  }

  // ---------------------------------------------------------------- score by role
  function viewScore(host) {
    var b = cur(), roles = ART.musicRoles(b);
    var intro = el('section', 'panel');
    intro.innerHTML = '<h3 class="section-h">Score by role</h3><p class="muted">Every place the game plays music is a role: the eight static ones, one field role per continent the Charter names, and one per ending. Quick Build derives each track from a motif. Battles call battle (or boss), victory, and defeat on their own.</p>';
    soundNotice(intro);
    host.appendChild(intro);
    var p = el('section', 'panel'), t = el('table', 'tbl a7-score');
    t.innerHTML = '<thead><tr><th scope="col">Role</th><th scope="col">Track</th><th scope="col">Length</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>';
    var tb = el('tbody');
    var ret = (b.art.settings.retired || []);
    roles.forEach(function (role) {
      var tr = el('tr'), trk = A.trackFor(b, role.key);
      if (trk && ui.focus === trk.id) tr.classList.add('a7-hit');
      if (trk) tr.dataset.rid = trk.id;
      tr.innerHTML = '<th scope="row">' + esc(role.label) + '<div class="muted a7-small"><code>' + esc(role.key) + '</code> ' + (role.required ? W.chip('required', 'muted') : W.chip(role.kind === 'user' ? 'your own' : 'optional', 'muted')) + '</div></th>';
      var td = el('td');
      if (trk) {
        var src = trk.derivedFrom && ART.records.get(trk.derivedFrom.motif);
        td.innerHTML = esc(trk.name) + ' ' + origin(trk) + (src ? '<div class="muted a7-small">' + esc(motifLabel(src) + ', ' + (VAR_LABEL[trk.derivedFrom.variation] || trk.derivedFrom.variation)) + '</div>' : '');
      } else td.innerHTML = role.required ? W.chip('missing', 'warning') : '<span class="muted">none</span>';
      tr.appendChild(td);
      var tdl = el('td', 'num');
      if (trk) { var d = EA.track.duration(trk); tdl.textContent = d.once.toFixed(1) + ' s' + (d.loops ? ', loops' : ''); }
      tr.appendChild(tdl);
      var act = el('td'), row = el('div', 'btn-row a7-tight');
      if (trk) {
        row.appendChild(ibtn('', 'play', 'btn-icon', function () { A.playTrack(trk.id, { role: role.key }); }, 'Play ' + role.label));
        row.appendChild(ibtn('', 'stop', 'btn-icon btn-ghost', function () { A.stop(300); }, 'Stop'));
        row.appendChild(W.button('Edit', 'edit', 'btn-ghost', function () { openTrack(trk.id); }));
      } else {
        row.appendChild(W.button('Make track', 'plus', '', function () {
          var bb = cur(), i = ret.indexOf('music:' + role.key);
          if (i >= 0) ret.splice(i, 1);
          var body = A.realizeRole(bb, role.key) || A.realizeRole(bb, 'field:default') || A.realizeRole(bb, 'title');
          if (!body) { Kit.ui.toast('Run Quick Build first: tracks are derived from motifs.', 'warn'); return; }
          ART.records.put(ART.envelope('mus_', role.label + ' music', { kind: 'role', ref: 'music:' + role.key }, role.kind === 'user' ? 'user' : 'procedural', ENGINE_RENDER.util.hash32('mus|' + role.key), body));
          touch('track-new'); Kit.rerender();
        }));
      }
      act.appendChild(row); tr.appendChild(act);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    var wrap = el('div', 'tbl-wrap'); wrap.appendChild(t); p.appendChild(wrap);
    host.appendChild(p);
    // Your own roles.
    var add = el('section', 'panel');
    add.appendChild(el('h3', 'section-h', 'Add a role'));
    add.appendChild(el('p', 'muted a7-small', 'For music the game calls by name, such as a villain reveal or a mystery. Your roles are optional, so coverage never asks for them.'));
    var form = { key: '', label: '' }, row2 = el('div', 'a7-ctl');
    row2.appendChild(textField('Label', '', function (v) { form.label = v; }, { max: 40, placeholder: 'Mystery' }));
    row2.appendChild(W.button('Add role', 'plus', '', function () {
      var label = String(form.label || '').trim(), key = 'user:' + U.slug(label);
      if (!label || key === 'user:') { Kit.ui.toast('Give the role a label first.', 'warn'); return; }
      var bb = cur();
      if (ART.musicRoles(bb).some(function (r) { return r.key === key; })) { Kit.ui.toast('There is already a role named ' + label + '.', 'warn'); return; }
      bb.art.musicRoles.push({ key: key, label: label, kind: 'user' });
      touch('role-add'); Kit.rerender();
    }));
    add.appendChild(row2);
    var mine = (b.art.musicRoles || []).filter(function (r) { return r && r.kind === 'user'; });
    if (mine.length) {
      var lst = el('div', 'btn-row');
      mine.forEach(function (r) { lst.appendChild(W.button('Remove ' + r.label, 'x', 'btn-ghost', function () { var bb = cur(); bb.art.musicRoles = bb.art.musicRoles.filter(function (x) { return x !== r; }); touch('role-remove'); Kit.rerender(); })); });
      add.appendChild(lst);
    }
    host.appendChild(add);
  }
  function openTrack(id) {
    Kit.ui.drawer({
      title: 'Track',
      body: function (body, h) {
        function paint() {
          var r = ART.records.get(id), b = cur();
          U.clear(body);
          if (!r) { body.appendChild(el('div', 'empty-line', 'This track no longer exists.')); return; }
          h.setTitle(r.name);
          function set(fn) { fn(); r.origin = 'user'; touch('track-edit'); paint(); }
          var c = EA.track.compile(r), d = EA.track.duration(r);
          if (c.rows.length) {
            var row0 = c.rows[0], cv = canvas(480, 120, 'First row of ' + r.name + ' as a piano roll');
            body.appendChild(cv); drawRoll(cv, EA.CHANNELS.map(function (ch) { return row0.ch[ch]; }), row0.len);
          }
          body.appendChild(el('p', 'muted a7-small', esc(c.rows.length + ' row' + (c.rows.length === 1 ? '' : 's') + ', ' + d.once.toFixed(1) + ' s' + (d.loops ? ', then loops ' + d.loop.toFixed(1) + ' s from row ' + (r.loop + 1) : ', no loop') + '.')));
          if (c.errors.length) body.appendChild(el('p', 'msg msg-error', esc(c.errors.slice(0, 3).map(function (e) { return 'Pattern ' + e.pattern + (e.pos ? ' at ' + e.pos : '') + ': ' + e.message; }).join(' '))));
          var row = el('div', 'btn-row');
          row.appendChild(ibtn('Play', 'play', 'btn-primary', function () { A.playTrack(r.id); }));
          row.appendChild(ibtn('Stop', 'stop', 'btn-ghost', function () { A.stop(200); }));
          if (r.derivedFrom && r.derivedFrom.motif) row.appendChild(W.button('Re-derive from its motif', 'spark', 'btn-ghost', function () { if (A.rederive(cur(), r)) { touch('track-rederive'); paint(); } else Kit.ui.toast('This role has no motif plan.', 'warn'); }));
          body.appendChild(row);
          var ctl = el('div', 'a7-ctl');
          ctl.appendChild(textField('Name', r.name, function (v) { set(function () { r.name = String(v).trim().slice(0, 60) || r.name; }); }, { max: 60 }));
          var roles = ART.musicRoles(b), ref = r.subject && r.subject.ref ? r.subject.ref.replace(/^music:/, '') : '';
          ctl.appendChild(W.select('Role', ref, roles.map(function (x) { return [x.key, x.label]; }).concat(roles.some(function (x) { return x.key === ref; }) ? [] : [[ref, ref || 'none']]), function (v) { set(function () { r.subject = { kind: 'role', ref: 'music:' + v }; }); }));
          ctl.appendChild(W.slider('Tempo', r.tempo, 40, 300, 1, function (v) { set(function () { r.tempo = v; }); }));
          ctl.appendChild(W.select('Loop from', r.loop == null ? '' : String(r.loop), [['', 'No loop (plays once)']].concat((r.order || []).map(function (_, i) { return [String(i), 'Row ' + (i + 1)]; })), function (v) { set(function () { r.loop = v === '' ? null : Number(v); }); }));
          body.appendChild(ctl);
          var ins = A.instruments(b), ic = el('div', 'a7-ctl');
          r.instruments = U.isObj(r.instruments) ? r.instruments : {};
          EA.CHANNELS.forEach(function (ch) {
            var want = ch === 'tri' ? 'tri' : ch === 'noise' ? 'noise' : 'pulse';
            ic.appendChild(W.select(CH_LABEL[ch], r.instruments[ch] || '', [['', 'Built in']].concat(ins.filter(function (x) { return x.wave === want; }).map(function (x) { return [x.id, x.name]; })), function (v) { set(function () { r.instruments[ch] = v || null; }); }));
          });
          body.appendChild(ic);
          var sc = el('div', 'a7-ctl'); r.slots = Array.isArray(r.slots) ? r.slots : [];
          r.slots.forEach(function (sid, i) { sc.appendChild(W.select('Slot @' + i, sid || '', [['', 'Channel default']].concat(ins.map(function (x) { return [x.id, x.name]; })), function (v) { set(function () { r.slots[i] = v || null; }); })); });
          if (r.slots.length < 16) sc.appendChild(W.button('Add slot', 'plus', 'btn-ghost', function () { set(function () { r.slots.push(null); }); }));
          body.appendChild(sc);
          body.appendChild(el('h3', 'section-h', 'Patterns'));
          body.appendChild(el('p', 'muted a7-small', 'MML: a to g with + or - for sharps and flats, a length (4 is a quarter, 8 an eighth) with dots, r rest, ^ tie, o octave, > up, < down, l default length, v volume 0 to 15, @n instrument slot.'));
          r.patterns = U.isObj(r.patterns) ? r.patterns : {};
          Object.keys(r.patterns).sort().forEach(function (k) {
            var pr = EA.mml.parse(r.patterns[k]), note = el('span', 'muted a7-small');
            function status(res) { note.innerHTML = res.errors.length ? W.chip(res.errors.length + ' problem' + (res.errors.length === 1 ? '' : 's'), 'error') + ' ' + esc(res.errors[0].message) : W.chip('ok', 'ok') + ' ' + (res.ticks / 48).toFixed(1) + ' beats'; }
            status(pr);
            var f = textField('Pattern ' + k, r.patterns[k], function (v) { set(function () { r.patterns[k] = String(v); }); }, { wide: true, mono: true, area: true, rows: 3, onInput: function (v) { status(EA.mml.parse(v)); } });
            body.appendChild(f); body.appendChild(note);
          });
          var pr3 = el('div', 'btn-row');
          pr3.appendChild(W.button('Add pattern', 'plus', 'btn-ghost', function () { var k = 'P' + (Object.keys(r.patterns).length + 1); while (r.patterns[k]) k += 'x'; set(function () { r.patterns[k] = 'l8 o4 c d e f g4 r4'; }); }));
          body.appendChild(pr3);
          body.appendChild(el('h3', 'section-h', 'Order'));
          body.appendChild(el('p', 'muted a7-small', 'Each row names the patterns for pulse 1, pulse 2, triangle, and noise, separated by spaces. A dash is silence.'));
          r.order = Array.isArray(r.order) ? r.order : [];
          r.order.forEach(function (row3, i) {
            body.appendChild(textField('Row ' + (i + 1), (row3 || []).map(function (k) { return k == null ? '-' : k; }).join(' '), function (v, inp) {
              var parts = String(v).trim().split(/\s+/);
              if (parts.length !== 4) { Kit.ui.toast('A row names exactly four patterns or dashes.', 'error'); inp.value = (row3 || []).map(function (k) { return k == null ? '-' : k; }).join(' '); return; }
              set(function () { r.order[i] = parts.map(function (x) { return x === '-' ? null : x; }); });
            }, { mono: true }));
          });
          var or = el('div', 'btn-row');
          or.appendChild(W.button('Add row', 'plus', 'btn-ghost', function () { set(function () { r.order.push(r.order.length ? r.order[r.order.length - 1].slice() : [null, null, null, null]); }); }));
          if (r.order.length > 1) or.appendChild(W.button('Remove last row', 'x', 'btn-ghost', function () { set(function () { r.order.pop(); if (r.loop != null && r.loop >= r.order.length) r.loop = r.order.length - 1; }); }));
          or.appendChild(W.button('Delete track', 'trash', 'btn-ghost', function () { confirmDelete(r, 'The role falls silent until you make another track for it. Quick Build will not recreate it.', function () { h.close(); }); }));
          body.appendChild(or);
        }
        paint();
      },
      onClose: function () { Kit.rerender(); }
    });
  }

  // ---------------------------------------------------------------- jukebox
  var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function viewJukebox(host) {
    var b = cur();
    var p = el('section', 'panel');
    p.innerHTML = '<h3 class="section-h">Jukebox</h3><p class="muted">Every track and every cue, with the mixer. The four meters show what each voice plays right now.</p>';
    soundNotice(p);
    var vol = el('div', 'a7-ctl'), pf = A.prefs();
    vol.appendChild(W.slider('Music volume', Math.round(pf.music * 100), 0, 100, 5, function (v) { A.setPrefs({ music: v / 100 }); }));
    vol.appendChild(W.slider('Effects volume', Math.round(pf.sfx * 100), 0, 100, 5, function (v) { A.setPrefs({ sfx: v / 100 }); }));
    vol.appendChild(W.toggle('Mute', pf.muted, function (on) { A.setPrefs({ muted: on }); }));
    p.appendChild(vol);
    var now = el('div', 'a7-now'); now.setAttribute('aria-live', 'polite');
    var meters = el('div', 'a7-meters');
    var bars = {};
    EA.CHANNELS.forEach(function (ch) { var m = el('div', 'a7-meter-ch', '<span>' + esc(CH_LABEL[ch]) + '</span><i></i><b>-</b>'); bars[ch] = m; meters.appendChild(m); });
    p.appendChild(now); p.appendChild(meters);
    p.appendChild(ibtn('Stop', 'stop', '', function () { A.stop(300); }));
    host.appendChild(p);
    var poll = setInterval(function () {
      if (!meters.isConnected) { clearInterval(poll); return; }
      var s = A.state();
      now.innerHTML = s && s.playing && !s.playing.ended ? '<strong>' + esc(s.playing.name || 'Preview') + '</strong> <span class="muted a7-small">row ' + (s.position.row + 1) + (s.position.passes ? ', looped ' + s.position.passes + 'x' : '') + ', ' + s.position.seconds.toFixed(1) + ' s</span>' : '<span class="muted">Nothing playing.</span>';
      EA.CHANNELS.forEach(function (ch) {
        var c = s && s.channels[ch], m = bars[ch];
        m.querySelector('i').style.width = c ? Math.round((c.v || 0) / 15 * 100) + '%' : '0%';
        m.querySelector('b').textContent = c ? (ch === 'noise' ? 'hit' : NOTE_NAMES[c.n % 12] + (Math.floor(c.n / 12) - 1)) : '-';
      });
    }, 100);
    var tracks = A.tracks(b);
    if (!tracks.length) { needBuild(host, 'tracks'); return; }
    var tp = el('section', 'panel'); tp.appendChild(el('h3', 'section-h', 'Tracks'));
    var grid = el('div', 'a7-sfx-grid');
    tracks.forEach(function (t) {
      var row = el('div', 'a7-sfx');
      row.appendChild(ibtn('', 'play', 'btn-icon', function () { A.playTrack(t.id); }, 'Play ' + t.name));
      var nm = el('button', 'a7-sfx-name'); nm.type = 'button'; nm.innerHTML = '<strong>' + esc(t.name) + '</strong><small>' + esc((t.subject && t.subject.ref || '').replace(/^music:/, '') + ', ' + t.tempo + ' bpm') + '</small>';
      nm.addEventListener('click', function () { openTrack(t.id); }); nm.setAttribute('aria-label', 'Edit ' + t.name);
      row.appendChild(nm);
      grid.appendChild(row);
    });
    tp.appendChild(grid); host.appendChild(tp);
    var sp = el('section', 'panel'); sp.appendChild(el('h3', 'section-h', 'Cue board'));
    var board = el('div', 'a7-seg');
    A.CUES.forEach(function (c) { var r = A.cueSfx(b, c.key); if (!r) return; board.appendChild(ibtn(c.label, 'play', '', function () { A.playSfx(r.id); })); });
    sp.appendChild(board); host.appendChild(sp);
  }

  var VIEWS = { instruments: viewInstruments, effects: viewEffects, motifs: viewMotifs, score: viewScore, jukebox: viewJukebox };
  function render(host) {
    var head = el('section', 'panel');
    head.innerHTML = '<h2 class="panel-title">Sound</h2><p class="muted">Four voice chiptune music (two pulses, a triangle, and noise), sfxr effects, and leitmotifs that follow characters from the field into battle. Everything plays in the browser and works without Claude.</p>';
    host.appendChild(head);
    W.subtabs(host, SUBS, ui, VIEWS);
  }
  function focus(rid) {
    var r = ART.records.get(rid), p = Kit.ids.prefixOf(rid);
    ui.focus = rid;
    ui.sub = p === 'ins_' ? 'instruments' : p === 'sfx_' ? 'effects' : r && r.kind === 'motif' ? 'motifs' : 'score';
    Kit.rerender();
  }
  ART.WS.sound = { render: render, focus: focus, ui: ui, views: VIEWS, openInstrument: openInstrument, openSound: openSound, openMotif: openMotif, openTrack: openTrack };

  // ---------------------------------------------------------------- the header sound button
  A.paintButton = function () {
    var bt = document.getElementById('btnSound'); if (!bt) return;
    var m = A.prefs().muted;
    bt.innerHTML = A.icon(m ? 'mute' : 'sound');
    bt.setAttribute('aria-pressed', m ? 'true' : 'false');
    bt.setAttribute('aria-label', m ? 'Sound is off. Turn sound on' : 'Sound is on. Mute');
    bt.title = m ? 'Sound off' : 'Sound on';
  };
  (function () {
    var bt = document.getElementById('btnSound');
    if (!bt) return;
    bt.addEventListener('click', function () { A.unlock(); A.setPrefs({ muted: !A.prefs().muted }); });
    A.paintButton();
  })();
})();
// === WS:SOUND END ===
