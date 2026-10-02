// === WS:BATTLE BEGIN ===
(function () {
  'use strict';
  // Playtest: Battle and Window preview. Battle plays the presenter three ways: a scripted demo built from the bundle
  // (no engine needed), a real battle run by ENGINE_BATTLE from Day 146, and Day 146 battle codes played back tick for
  // tick. Window preview shows the interface kit at the Charter's resolution with a cursor that moves.
  var U = Kit.util, el = U.el, esc = U.esc, ER = ENGINE_RENDER, EU = ER.ui;
  var S = ART.sprites, P = ART.palette, M = ART.motion, W = ART.ui, B = ART.battle, I = ART.iface;
  var PT = ART.WS.playtest;
  var ui = { mode: 'demo', troopId: null, weatherId: '', source: 'custom', chars: null, level: 10, gearTier: 1, seed: 7, pacing: 'wait', speed: 1, auto: false, bg: '', code: '' };
  var live = null;
  function cur() { return Kit.bundle.current(); }
  function res() { var r = (cur().charter.specs || {}).resolution || {}; return { w: Number(r.w) || 256, h: Number(r.h) || 224 }; }
  function scale() { return Math.max(2, Math.min(6, Math.floor(720 / res().w))); }
  function rulesList(b, p) { var m = b.rules && U.isObj(b.rules[p]) ? b.rules[p] : {}; return Object.keys(m).map(function (k) { return m[k]; }).filter(function (r) { return U.isObj(r) && r.id; }); }
  function chapters(b) { return (b.charter && b.charter.sections && Array.isArray(b.charter.sections.chapters)) ? b.charter.sections.chapters : []; }
  var cueLog = [];
  function cue(kind, id) { cueLog.push(kind + ':' + id); if (cueLog.length > 10) cueLog.shift(); }

  // ---------------------------------------------------------------- the engine panel
  function enginePanel(host, repaint) {
    var st = B.status(), p = el('section', 'panel');
    var row = el('div', 'a7-engine');
    var info = el('div', 'a7-grow');
    info.innerHTML = st.loaded
      ? '<strong>Battle engine ' + esc(st.version) + '</strong> <span class="chip chip-ok">ready</span><div class="muted a7-small">From ' + esc(st.name || st.via) + (st.bytes ? ', ' + esc(U.fmtSize(st.bytes)) : '') + '. Kept in this browser for next time.</div>'
      : '<strong>Battle engine</strong> <span class="chip chip-muted">not loaded</span><div class="muted a7-small">Real battles run Day 146\'s ENGINE_BATTLE. Load the engine-battle.js that Saga Forge exports, or fetch it from the live Saga Forge page. The scripted demo needs neither.</div>' +
        (st.error ? '<div class="msg msg-error">' + esc(st.error) + '</div>' : '');
    row.appendChild(info);
    var file = el('input'); file.type = 'file'; file.accept = '.js,.html,text/javascript,text/html'; file.hidden = true;
    file.addEventListener('change', function () {
      var f = file.files && file.files[0]; if (!f) return;
      B.fromFile(f).then(function (s) { Kit.ui.toast('Battle engine ' + s.version + ' loaded.', 'ok'); repaint(); }, function (e) { Kit.ui.toast(e.message || 'The engine could not load.', 'error', 6000); repaint(); });
    });
    row.appendChild(file);
    if (!st.loaded) {
      row.appendChild(W.button('Load engine-battle.js', 'import', 'btn-primary', function () { file.click(); }));
      row.appendChild(W.button('Fetch from Saga Forge', 'arena', '', function () {
        Kit.ui.toast('Fetching the engine from Saga Forge...', 'info');
        B.fromSaga().then(function (s) { Kit.ui.toast('Battle engine ' + s.version + ' loaded from Saga Forge.', 'ok'); repaint(); }, function (e) { Kit.ui.toast((e && e.message) || 'Saga Forge could not be reached.', 'error', 6000); repaint(); });
      }));
    } else {
      row.appendChild(W.button('Load another', 'import', 'btn-ghost', function () { file.click(); }));
      row.appendChild(W.button('Forget', 'x', 'btn-ghost', function () { B.forget(); live = null; repaint(); }));
    }
    p.appendChild(row);
    host.appendChild(p);
  }

  // ---------------------------------------------------------------- the command menu (real battles)
  function menuFor(host, sess) {
    var m = el('div', 'a7-menu'); m.hidden = true; m.setAttribute('aria-label', 'Battle commands');
    host.appendChild(m);
    var st = { key: '', level: 'root', cmd: null, abl: null };
    function names() { return sess.P.display(); }
    function paint() {
      var aw = sess.awaiting();
      U.clear(m);
      if (!aw || !sess.menuOpen()) { m.hidden = true; sess.P.setCursor(null); return; }
      m.hidden = false;
      var cmd = st.cmd ? aw.commands.filter(function (c) { return c.key === st.cmd; })[0] : null;
      if (st.level !== 'root' && !cmd) st.level = 'root';
      var nm = names(), head = el('div', 'a7-menu-head');
      head.appendChild(el('span', 'who', esc((nm[aw.actor] || {}).name || aw.actor) + (cmd && st.level !== 'root' ? ' &middot; ' + esc(cmd.label) : '')));
      if (st.level !== 'root') head.appendChild(W.button('Back', 'up', 'btn-ghost', function () { st.level = st.level === 'targets' && cmd.abls.length > 1 ? 'abls' : 'root'; st.abl = null; paint(); }));
      m.appendChild(head);
      var grid = el('div', 'a7-menu-grid');
      m.appendChild(grid);
      function b(label, sub, fn, o) {
        var x = el('button', 'btn', '<span>' + esc(label) + '</span>' + (sub ? '<small>' + esc(sub) + '</small>' : ''));
        x.type = 'button'; if (o && o.disabled) x.disabled = true;
        x.addEventListener('click', fn);
        if (o && o.uid) { x.dataset.uid = o.uid; ['focus', 'pointerenter'].forEach(function (n) { x.addEventListener(n, function () { sess.P.setCursor(o.uid); }); }); }
        grid.appendChild(x); return x;
      }
      function fire(x, uid) { var tgt = uid || (x.side === 'ally' ? aw.targets.party[0] : aw.targets.foe[0]); if (!sess.give({ type: 'command', actor: aw.actor, abl: x.id, target: tgt })) Kit.ui.toast(sess.lastReject || 'That command was rejected.', 'warn'); st.level = 'root'; st.cmd = null; sess.P.setCursor(null); paint(); }
      if (st.level === 'root') {
        sess.P.setCursor(aw.actor);
        aw.commands.forEach(function (c) {
          if (c.key === 'flee') { b('Flee', '', function () { sess.give({ type: 'flee', actor: aw.actor }); paint(); }); return; }
          b(c.label, c.abls.length > 1 ? c.abls.length + ' abilities' : (c.abls[0] && c.abls[0].mp ? c.abls[0].mp + ' MP' : ''), function () {
            st.cmd = c.key;
            if (c.abls.length === 1) { st.abl = c.abls[0].id; st.level = 'targets'; if (c.abls[0].side === 'self') { fire(c.abls[0], null); return; } } else st.level = 'abls';
            paint();
          }, { disabled: !c.abls.some(function (x) { return x.ok; }) });
        });
      } else if (st.level === 'abls') {
        cmd.abls.forEach(function (x) {
          b(x.name, (x.mp ? x.mp + ' MP' : 'Free') + (x.scope === 'all' ? ' | all' : '') + (x.element ? ' | ' + x.element : ''), function () { st.abl = x.id; if (x.side === 'self') { fire(x, null); return; } st.level = 'targets'; paint(); }, { disabled: !x.ok });
        });
      } else {
        var ab = cmd.abls.filter(function (x) { return x.id === st.abl; })[0];
        if (!ab) { st.level = 'root'; paint(); return; }
        var order = ab.side === 'ally' ? ['party', 'foe'] : ['foe', 'party'];
        if (ab.scope === 'all') {
          order.forEach(function (side) { if (aw.targets[side].length) b(side === 'foe' ? 'All foes' : 'All allies', aw.targets[side].length + ' targets', function () { fire(ab, aw.targets[side][0]); }); });
          return;
        }
        order.forEach(function (side) { aw.targets[side].forEach(function (uid) { var d = nm[uid] || {}; b(d.name || uid, d.hpTarget + ' / ' + d.maxHp + ' HP', function () { fire(ab, uid); }, { uid: uid }); }); });
      }
    }
    return {
      poll: function () {
        var aw = sess.awaiting(), open = !!aw && sess.menuOpen();
        var key = open ? aw.actor + '|' + aw.commands.map(function (c) { return c.key + ':' + c.abls.map(function (x) { return x.id + (x.ok ? 1 : 0); }).join(','); }).join(';') + '|' + aw.targets.foe.join(',') + '|' + aw.targets.party.join(',') : '';
        if (key === st.key) return;
        if (!open || (st.key.split('|')[0] !== key.split('|')[0])) { st.level = 'root'; st.cmd = null; st.abl = null; }
        st.key = key; paint();
      },
      el: m
    };
  }

  // ---------------------------------------------------------------- the battle view
  function setupDefaults(b) {
    var troops = rulesList(b, 'trp_');
    if (!ui.troopId || !troops.some(function (t) { return t.id === ui.troopId; })) ui.troopId = troops[0] ? troops[0].id : null;
    var chars = rulesList(b, 'chr_');
    if (!ui.chars) ui.chars = chars.slice(0, 4).map(function (c) { return c.id; });
    ui.chars = ui.chars.filter(function (id) { return chars.some(function (c) { return c.id === id; }); });
  }
  function seg(host, items, value, fn) {
    var g = el('div', 'a7-seg'); g.setAttribute('role', 'group');
    items.forEach(function (it) {
      var bt = el('button', 'btn', '<span>' + esc(it[1]) + '</span>'); bt.type = 'button'; bt.setAttribute('aria-pressed', it[0] === value ? 'true' : 'false');
      if (it[2]) bt.disabled = true;
      bt.addEventListener('click', function () { fn(it[0]); });
      g.appendChild(bt);
    });
    host.appendChild(g);
    return g;
  }
  function viewBattle(host, repaint) {
    var b = cur(), R = res();
    setupDefaults(b);
    enginePanel(host, repaint);
    var hasEngine = !!B.engine(), troops = rulesList(b, 'trp_');
    var panel = el('section', 'panel');
    seg(panel, [['demo', 'Scripted demo'], ['battle', 'Battle', !hasEngine || !troops.length], ['code', 'Battle code', !hasEngine]], ui.mode, function (v) { ui.mode = v; live = null; repaint(); });
    if (ui.mode !== 'demo' && !hasEngine) ui.mode = 'demo';
    var ctl = el('div', 'a7-ctl');
    var bgs = ART.tiles ? ART.tiles.backgrounds(b) : [];
    if (ui.mode === 'battle') {
      ctl.appendChild(W.select('Troop', ui.troopId, troops.map(function (t) { return [t.id, t.name || t.id]; }), function (v) { ui.troopId = v; live = null; repaint(); }));
      var wths = rulesList(b, 'wth_');
      ctl.appendChild(W.select('Weather', ui.weatherId, [['', 'None']].concat(wths.map(function (w) { return [w.id, w.name || w.id]; })), function (v) { ui.weatherId = v; live = null; repaint(); }));
      var chs = chapters(b).filter(function (c) { return rulesList(b, 'eps_').some(function (e) { return e.chapter === c.id; }); });
      ctl.appendChild(W.select('Party', ui.source, [['custom', 'Custom']].concat(chs.map(function (c) { return [c.id, 'Expected: ' + (c.title || c.name || c.id)]; })), function (v) { ui.source = v; live = null; repaint(); }));
      if (ui.source === 'custom') {
        ctl.appendChild(W.slider('Level', ui.level, 1, 99, 1, function (v) { ui.level = v; live = null; repaint(); }));
        ctl.appendChild(W.slider('Gear tier', ui.gearTier, 1, 5, 1, function (v) { ui.gearTier = v; live = null; repaint(); }));
      }
    }
    if (ui.mode !== 'code') {
      ctl.appendChild(W.select('Pacing', ui.pacing, [['wait', 'Wait'], ['active', 'Active']], function (v) { ui.pacing = v; if (live && live.sess) live.sess.setPacing(v); else if (live && live.P) live.P.setPacing(v); if (ui.mode === 'battle') { live = null; repaint(); } }));
    }
    ctl.appendChild(W.select('Speed', String(ui.speed), [['1', '1x'], ['2', '2x'], ['4', '4x']], function (v) { ui.speed = Number(v); if (live && live.P) live.P.setSpeed(ui.speed); }));
    if (bgs.length) ctl.appendChild(W.select('Background', ui.bg, [['', 'Automatic']].concat(bgs.map(function (g) { return [g.id, g.name]; })), function (v) { ui.bg = v; live = null; repaint(); }));
    panel.appendChild(ctl);
    if (ui.mode === 'battle') {
      var cs = el('div', 'a7-chars'), chars = rulesList(b, 'chr_');
      if (ui.source === 'custom') {
        chars.forEach(function (c) {
          cs.appendChild(W.toggle(c.name || c.id, ui.chars.indexOf(c.id) >= 0, function (on) {
            var i = ui.chars.indexOf(c.id);
            if (on && i < 0) { if (ui.chars.length >= 4) { Kit.ui.toast('A party holds four at most.', 'warn'); repaint(); return; } ui.chars.push(c.id); }
            if (!on && i >= 0) ui.chars.splice(i, 1);
            live = null; repaint();
          }));
        });
        panel.appendChild(cs);
      }
      var row2 = el('div', 'a7-ctl');
      var seedL = el('label', 'a7-num'); seedL.innerHTML = '<span>Seed</span>';
      var seedI = el('input', 'inp'); seedI.type = 'number'; seedI.min = 1; seedI.value = ui.seed; seedI.addEventListener('change', function () { ui.seed = Math.max(1, Math.round(Number(seedI.value) || 1)); live = null; repaint(); });
      seedL.appendChild(seedI); row2.appendChild(seedL);
      row2.appendChild(W.button('Random seed', 'spark', 'btn-ghost', function () { ui.seed = Math.floor(Math.random() * 2147483646) + 1; live = null; repaint(); }));
      row2.appendChild(W.toggle('Auto battle', ui.auto, function (on) { ui.auto = on; if (live && live.sess) live.sess.auto = on; }));
      panel.appendChild(row2);
    }
    if (ui.mode === 'code') {
      var ta = el('textarea', 'inp a7-code'); ta.placeholder = 'Paste a Saga Forge battle code'; ta.value = ui.code; ta.setAttribute('aria-label', 'Battle code');
      ta.addEventListener('change', function () { ui.code = ta.value.trim(); });
      panel.appendChild(ta);
      panel.appendChild(W.button('Play battle code', 'arena', 'btn-primary', function () { ui.code = ta.value.trim(); live = null; repaint(); }));
    }
    host.appendChild(panel);

    // build what plays
    if (!live) {
      try { live = start(b); } catch (e) { live = { error: e.message || String(e) }; }
    }
    if (live.error) { host.appendChild(el('div', 'msg msg-warning', esc(live.error))); return; }
    var stagePanel = el('section', 'panel');
    var wrap = el('div', 'a7-bt-stage');
    var menu = live.sess ? menuFor(stagePanel, live.sess) : null;
    var cv = M.stage(R.w, R.h, scale(), function (ctx, t, dt) {
      if (!live || live.cv !== cv) return;
      live.step(dt);
      live.P.draw(ctx);
    }, 'Battle preview');
    cv.classList.add('a7-bt-cv'); cv.tabIndex = 0;
    live.cv = cv;
    wrap.appendChild(cv);
    stagePanel.insertBefore(wrap, stagePanel.firstChild);
    var bar = el('div', 'btn-row');
    bar.appendChild(W.button(ui.mode === 'demo' ? 'Replay demo' : ui.mode === 'code' ? 'Replay code' : 'New battle', 'spark', '', function () { live = null; repaint(); }));
    if (ui.mode === 'battle') bar.appendChild(W.button('Same seed again', 'check', 'btn-ghost', function () { live = null; repaint(); }));
    stagePanel.appendChild(bar);
    var info = el('div', 'a7-room-hud'); info.setAttribute('aria-live', 'polite');
    stagePanel.appendChild(info);
    var cues = el('div', 'a7-cues'); cues.setAttribute('aria-label', 'Sound cues (Phase 6 plays them)');
    stagePanel.appendChild(cues);
    host.appendChild(stagePanel);
    var lastInfo = '', lastCues = '';
    var poll = setInterval(function () {
      if (!cv.isConnected || !live || live.cv !== cv) { clearInterval(poll); return; }
      if (menu) menu.poll();
      var txt = live.describe();
      if (txt !== lastInfo) { lastInfo = txt; info.innerHTML = txt; }
      var cl = cueLog.join(' ');
      if (cl !== lastCues) { lastCues = cl; cues.innerHTML = cueLog.map(function (c) { return W.chip(c, 'muted'); }).join(' '); }
    }, 120);
  }
  // start(b) -> {P, step(dt), describe(), sess?}
  function start(b) {
    cueLog = [];
    if (ui.mode === 'demo') {
      var sc = B.script(b), pc = B.presenterConfig(b, sc.snapshot, { pacing: ui.pacing, speed: ui.speed, cue: cue, bg: ui.bg, seed: 3 }), P0 = ER.createPresenter(pc);
      var player = B.playScript(P0, sc), rest = 0, o = { P: P0, script: sc };
      o.step = function (dt) {
        player.step(dt);
        if (player.done()) { rest += dt; if (rest > 1800) { cueLog = []; var P1 = ER.createPresenter(B.presenterConfig(cur(), sc.snapshot, { pacing: ui.pacing, speed: ui.speed, cue: cue, bg: ui.bg, seed: 3 })); o.P = P1; player = B.playScript(P1, sc); rest = 0; } }
      };
      o.describe = function () { var s = o.P.stats(); return '<span class="muted a7-small">Scripted demo, ' + player.fed + ' of ' + sc.feeds.length + ' advances shown, ' + s.beats + ' beats. It loops. No engine is involved: the events are written in ENGINE_BATTLE\'s shapes from your own records.</span>'; };
      return o;
    }
    var E = B.engine();
    if (!E) throw new Error('Load the battle engine first.');
    var cfg = { E: E, cue: cue, speed: ui.speed, bg: ui.bg };
    if (ui.mode === 'code') {
      if (!ui.code) throw new Error('Paste a battle code above, then play it.');
      cfg.code = B.decodeCode(ui.code);
    } else {
      cfg.troopId = ui.troopId; cfg.weatherId = ui.weatherId || null; cfg.seed = ui.seed; cfg.pacing = ui.pacing; cfg.auto = ui.auto;
      cfg.party = B.buildParty(b, { chars: ui.chars, source: ui.source, level: ui.level, gearTier: ui.gearTier });
    }
    var sess = B.session(b, cfg), out = { sess: sess, P: sess.P };
    out.step = function (dt) { sess.step(dt); };
    out.describe = function () {
      var S0 = sess.S, r = S0.result, tr = S0.db && S0.db.troop ? S0.db.troop.name : '';
      var head = '<div class="a7-name"><strong>' + esc(tr) + '</strong> <span class="muted a7-small">seed ' + sess.seed + ', ' + esc(S0.sched) + (S0.sched === 'atb' ? (S0.waitMode ? ' wait' : ' active') : '') + ', tick ' + S0.t + (sess.playback ? ', playing back ' + sess.playback.i + ' of ' + sess.playback.inputs.length + ' inputs' : '') + '</span></div>';
      if (!sess.ended) return head + (sess.warnings.length ? '<div class="msg msg-warning">' + esc(sess.warnings[0]) + '</div>' : '');
      var label = { win: 'Victory', lose: 'Defeat', flee: 'Escaped', timeout: 'Time out' }[r.outcome] || r.outcome;
      var match = sess.match == null ? '' : sess.match ? '<p class="msg msg-forward">Playback matched the original battle exactly.</p>' : '<p class="msg msg-error">Playback diverged from the original. The records may have changed since the code was made.</p>';
      return head + '<div class="btn-row"><span class="chip ' + ({ win: 'chip-ok', lose: 'chip-error' }[r.outcome] || 'chip-muted') + '">' + esc(label) + '</span> <span class="muted a7-small">' + r.ticks + ' ticks, ' + r.turns + ' turns, ' + sess.inputs.length + ' inputs</span> <button class="btn btn-ghost" type="button" data-copy="1">' + Kit.icon('export') + '<span>Copy battle code</span></button></div>' + match;
    };
    return out;
  }
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-copy]') : null;
    if (!t || !live || !live.sess || !live.sess.code) return;
    var code = live.sess.code;
    function shown() { Kit.ui.dialog({ title: 'Battle code', body: function (bd) { var ta = el('textarea', 'inp a7-code'); ta.readOnly = true; ta.value = code; bd.appendChild(el('p', 'muted', 'Paste it into Saga Forge or this forge with the same records to replay the fight tick for tick.')); bd.appendChild(ta); }, actions: [{ label: 'Done', kind: 'primary' }] }); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(function () { Kit.ui.toast('Battle code copied.', 'ok'); }, shown); else shown();
  });

  // ---------------------------------------------------------------- window preview
  var wp = { cursor: 0, openT: 0 };
  function viewWindow(host) {
    var b = cur(), R = res(), kit = I.kit(b), ent = P.entries(b), T = S.tileSize(b), u = Math.max(1, Math.round(T / 16)), font = EU.font(kit.font);
    var party = S.sprites(b).filter(function (s) { return s.kind === 'character' && s.mode === 'field'; }).slice(0, 3);
    var pors = S.portraits(b);
    var items = ['Items', 'Magic', 'Equip', 'Status', 'Save'], prem = (b.charter.sections && b.charter.sections.premise) || {};
    var lineText = prem.premise || 'A small company of travelers sets out at dawn.';
    var panel = el('section', 'panel');
    panel.appendChild(el('p', 'muted', esc('The window frame, font, and cursor at ' + R.w + ' by ' + R.h + '. Arrow keys or a tap on the menu move the cursor. Edit them on the Interface tab.')));
    var wrap = el('div', 'a7-bt-stage');
    var cv = M.stage(R.w, R.h, scale(), function (ctx, t, dt) {
      wp.openT += dt;
      var op = kit.window && kit.window.open ? Math.max(1, Number(kit.window.open.ms) || 1) : 140, o = kit.window && kit.window.open && kit.window.open.style === 'none' ? 1 : Math.min(1, wp.openT / op);
      ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, R.w, R.h);
      var bgd = I.titleBg(b, kit.title);
      if (bgd) ER.bg.draw(ctx, bgd, t, R.w, R.h, { entries: ent });
      var lh = font.line * u, pad = 5 * u, menuW = EU.measure(font, 'Status', u) + 2 * pad + 14 * u;
      // menu window at the right with the cursor
      var mx = R.w - menuW - 4 * u, my = 4 * u, mh = items.length * lh + 2 * pad;
      var mw = EU.window(ctx, kit.window, mx, my, menuW, mh, { entries: ent, unit: u, open: o });
      if (o >= 1) items.forEach(function (it, i) { EU.text(ctx, font, it, mx + pad + 10 * u, my + pad + i * lh, { color: '#ffffff', shadow: '#000000', scale: u }); });
      if (o >= 1) EU.cursor(ctx, kit.cursor, mx + pad + 9 * u, my + pad + wp.cursor * lh + Math.floor(font.h * u / 2), t, { entries: ent, unit: u });
      // party window at the left
      var pw = mx - 8 * u, ph = Math.max(lh * 3 + 2 * pad, party.length * (T + 6 * u) + 2 * pad);
      EU.window(ctx, kit.window, 4 * u, my, pw, ph, { entries: ent, unit: u, open: o });
      if (o >= 1) party.forEach(function (s, i) {
        var y = my + pad + i * (T + 6 * u), f = S.cache().sprite(s.id, 'stand', 'down');
        if (f) ER.draw.frame(ctx, f, 4 * u + pad, y);
        EU.text(ctx, font, s.name.replace(/ \(field\)$/, ''), 4 * u + pad + T + 6 * u, y + 2 * u, { color: '#ffffff', shadow: '#000000', scale: u });
        EU.gauge(ctx, 4 * u + pad + T + 6 * u, y + lh, Math.min(60 * u, pw - T - 2 * pad - 12 * u), 4 * u, 0.4 + 0.2 * i, { back: '#101018', fill: '#60d080', light: '#c0f0c8' });
      });
      // dialogue window along the bottom, with a portrait
      var dh = Math.round(R.h * 0.3), dy = R.h - dh - 4 * u, por = pors[0] ? S.cache().portrait(pors[0].id, 'neutral') : null;
      EU.window(ctx, kit.window, 4 * u, dy, R.w - 8 * u, dh, { entries: ent, unit: u, open: o });
      if (o >= 1) {
        var tx = 4 * u + pad;
        if (por && por.h <= dh - 2 * pad) { ER.draw.frame(ctx, por, tx, dy + pad); tx += por.w + 6 * u; }
        var lines = EU.wrap(font, lineText, R.w - tx - 4 * u - pad, u), shown = Math.floor(t / 40);
        var maxLines = Math.max(1, Math.floor((dh - 2 * pad) / lh));
        lines.slice(0, maxLines).forEach(function (ln, i) {
          var before = lines.slice(0, i).join('').length, vis = Math.max(0, Math.min(ln.length, shown - before));
          EU.text(ctx, font, ln.slice(0, vis), tx, dy + pad + i * lh, { color: '#ffffff', shadow: '#000000', scale: u });
        });
      }
    }, 'Window preview: a menu with a cursor, a party window, and a dialogue window.');
    cv.classList.add('a7-bt-cv'); cv.tabIndex = 0;
    function move(d) { wp.cursor = (wp.cursor + d + items.length) % items.length; }
    cv.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown' || e.key === 's') { move(1); e.preventDefault(); } else if (e.key === 'ArrowUp' || e.key === 'w') { move(-1); e.preventDefault(); } });
    cv.addEventListener('pointerdown', function (e) { var r = cv.getBoundingClientRect(), ly = (e.clientY - r.top) / (r.height || 1) * R.h; move(ly < R.h / 2 ? -1 : 1); cv.focus(); });
    wrap.appendChild(cv); panel.appendChild(wrap);
    var row = el('div', 'btn-row');
    row.appendChild(W.button('Up', 'up', '', function () { move(-1); }));
    row.appendChild(W.button('Down', 'down', '', function () { move(1); }));
    row.appendChild(W.button('Replay opening', 'spark', 'btn-ghost', function () { wp.openT = 0; cv.restart(); }));
    panel.appendChild(row);
    host.appendChild(panel);
    wp.openT = 0;
  }

  PT.views.battle = viewBattle;
  PT.views.window = viewWindow;
  ART.WS.battle = { ui: ui, live: function () { return live; }, reset: function () { live = null; }, start: start, cues: function () { return cueLog.slice(); } };
})();
// === WS:BATTLE END ===
