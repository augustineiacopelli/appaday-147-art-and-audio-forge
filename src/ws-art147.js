// === WS:ART147 BEGIN ===
(function () {
  'use strict';
  var U = Kit.util, el = U.el, esc = U.esc;
  var DEV = /[?&]dev=1(&|$)/.test(location.search);
  function cur() { return Kit.bundle.current(); }
  function count(b, p) { return b && b.rules && U.isObj(b.rules[p]) ? Object.keys(b.rules[p]).length : 0; }
  function ready(b) {
    if (!b || !b.charter || !b.charter.locked) return 'Load a Day 146 bundle with a locked Charter, or the demo, from Start.';
    return true;
  }

  // ---------------------------------------------------------------- size meter (header)
  function paintMeter() {
    var btn = document.getElementById('btnSize');
    if (!btn || !cur()) return;
    var s = ART.size();
    var cls = s.level === 'red' ? 'chip-error' : s.level === 'amber' ? 'chip-warning' : 'chip-ok';
    btn.innerHTML = '<span class="chip ' + cls + '">' + esc(U.fmtSize(s.total)) + '</span>';
    btn.setAttribute('aria-label', 'Bundle size ' + U.fmtSize(s.total) + ', ' + (s.level === 'ok' ? 'within budget' : s.level === 'amber' ? 'getting large' : 'near the storage limit') + '. Open size details.');
    btn.title = 'Bundle size ' + U.fmtSize(s.total) + ' of about ' + U.fmtSize(s.room) + ' available';
  }
  var meterSoon = U.debounce(paintMeter, 250);
  function sizeBody(host) {
    var s = ART.size();
    var pct = Math.min(100, Math.round(s.total / Math.max(1, s.room) * 100));
    host.appendChild(el('div', 'a7-meter a7-' + s.level, '<i style="width:' + pct + '%"></i>'));
    host.appendChild(el('p', 'muted', esc(U.fmtSize(s.total) + ' of about ' + U.fmtSize(s.room) + ' available in this browser. Amber from 1.5 MB, red within 10 percent of the room left under 4.5 MB.')));
    host.appendChild(el('p', 'muted', esc(s.where === 'idb' ? 'The draft is saved in IndexedDB, the browser\'s larger store, because localStorage filled up. Exports are still the safe copy.' :
      'The draft is saved in localStorage under this forge\'s own keys, so Day 146 in another tab never overwrites it. If localStorage fills, the draft moves to IndexedDB on its own.')));
    var t = el('table', 'tbl');
    t.innerHTML = '<thead><tr><th scope="col">Namespace</th><th scope="col" class="num">Size</th></tr></thead><tbody>' +
      Object.keys(s.ns).map(function (k) { return '<tr><th scope="row">' + esc(k) + '</th><td class="num">' + esc(U.fmtSize(s.ns[k])) + '</td></tr>'; }).join('') + '</tbody>';
    var w = el('div', 'tbl-wrap'); w.appendChild(t); host.appendChild(w);
    host.appendChild(el('h3', 'section-h', 'Largest art records'));
    if (!s.top.length) host.appendChild(el('div', 'empty-line', 'No art records yet.'));
    else {
      var t2 = el('table', 'tbl');
      t2.innerHTML = '<thead><tr><th scope="col">Record</th><th scope="col" class="num">Size</th></tr></thead><tbody>' +
        s.top.map(function (r) { return '<tr><th scope="row">' + esc(r.name) + ' <code class="id">' + esc(r.id) + '</code></th><td class="num">' + esc(U.fmtSize(r.size)) + '</td></tr>'; }).join('') + '</tbody>';
      var w2 = el('div', 'tbl-wrap'); w2.appendChild(t2); host.appendChild(w2);
    }
  }
  ART.openSize = function () { Kit.ui.drawer({ title: 'Bundle size', body: function (b) { sizeBody(b); } }); };

  // ---------------------------------------------------------------- export (forge 147)
  // Overrides the Day 146 export dialog, which belongs to forge 146. KIT:CORE text is unchanged; these are reassignments.
  function manifest(b, hash) {
    var created = [], counts = {}, r = b.art && b.art.records || {};
    Object.keys(r).sort().forEach(function (p) { var ids = Object.keys(r[p] || {}); if (ids.length) counts[p] = ids.length; created = created.concat(ids); });
    var fw = ART.forwardRefs(b);
    return {
      forge: 147, bundleHash: hash, artVersion: b.art.version, charterVersion: b.charter.version || 0,
      created: created.sort(), referenced: fw.map(function (f) { return f.id; }).sort(),
      unresolved: fw.filter(function (f) { return !f.ok; }).map(function (f) { return { id: f.id, recordId: f.recordId, field: f.field }; }),
      artOpened: Kit.codex.isOpened('art', b), counts: counts
    };
  }
  Kit.buildExport = function (status) {
    var b = cur();
    if (!b) throw new Error('No project is open.');
    ART.ensure(b); ART.registerCodex(b);
    var res = Kit.refreshValidation();
    if (status === 'final') {
      if (res.errors.length || res.broken.length) throw new Error('Final export is blocked by ' + (res.errors.length + res.broken.length) + ' error' + (res.errors.length + res.broken.length === 1 ? '' : 's') + '.');
      if (!ART.canOpen(b)) throw new Error('Final export is blocked: a forward field points at an art record that does not exist.');
      Kit.bundle.open('art');
    } else if (!ART.canOpen(b)) Kit.bundle.close('art');
    b.kit.forges['147'] = { status: status, exportedAt: U.now(), artVersion: b.art.version, charterVersion: b.charter.version || 0 };
    var out = Kit.bundle.exportFile({ download: false });
    return { hash: out.hash, files: [
      { key: 'bundle', name: out.filename, text: out.text, mime: 'application/json' },
      { key: 'manifest', name: Kit.bundle.slug() + '-art-manifest.json', text: JSON.stringify(manifest(cur(), out.hash), null, 2), mime: 'application/json' }
    ] };
  };
  Kit.openExport = function () {
    var res = Kit.refreshValidation(), s = Kit.validate.summary(res), b = cur(), status = 'draft';
    var blocked = s.errors + s.broken > 0 || !ART.canOpen(b);
    Kit.ui.dialog({
      title: 'Export forge 147',
      body: function (body) {
        body.innerHTML = '<dl class="kv"><dt>Project</dt><dd>' + esc(b.kit.title) + '</dd><dt>Art version</dt><dd>' + esc(b.art.version) + '</dd><dt>Art records</dt><dd>' + manifest(b, '').created.length + '</dd><dt>Issues</dt><dd><span class="chip chip-error">' + s.errors + ' err</span> <span class="chip chip-broken">' + s.broken + ' broken</span></dd></dl>';
        var rc = el('div', 'radio-cards');
        rc.innerHTML = '<label class="radio-card"><input type="radio" name="a7Status" value="draft" checked><span><strong>Draft</strong><br><span class="muted">Always allowed. Art stays closed, so Day 146 keeps reading art fields as forward.</span></span></label>' +
          '<label class="radio-card' + (blocked ? ' disabled' : '') + '"><input type="radio" name="a7Status" value="final"' + (blocked ? ' disabled' : '') + '><span><strong>Final</strong><br><span class="muted">' + (blocked ? 'Blocked until errors are fixed and every forward field resolves.' : 'Opens the art namespace and marks forge 147 final.') + '</span></span></label>';
        body.appendChild(rc);
        Array.prototype.forEach.call(rc.querySelectorAll('input'), function (r) { r.addEventListener('change', function () { status = r.value; }); });
      },
      actions: [
        { label: 'Close', kind: 'ghost', value: null },
        { label: 'Download bundle and manifest', kind: 'primary', icon: 'export', onClick: function () {
          try {
            var out = Kit.buildExport(status);
            out.files.forEach(function (f, i) { setTimeout(function () { U.download(f.name, f.text, f.mime); }, i * 350); });
            Kit.ui.toast('Exported (' + status + '). Hash ' + out.hash.slice(0, 12) + '.', 'ok', 6000);
          } catch (e) { Kit.ui.toast(e.message, 'error', 7000); return false; }
        } }
      ]
    });
  };

  // ---------------------------------------------------------------- Quick Build
  function qbSummary(rep) {
    return Object.keys(rep.steps).map(function (k) { var s = rep.steps[k]; return k + ' ' + s.created + ' new, ' + s.refreshed + ' refreshed, ' + s.kept + ' kept'; }).join('; ');
  }
  ART.qbSummary = qbSummary;
  ART.openQuickBuild = function () {
    var b = cur();
    if (ready(b) !== true) { Kit.ui.toast(ready(b), 'warn'); return; }
    var go = ART.isEmpty(b) ? Promise.resolve(true) : Kit.ui.confirm({ title: 'Run Quick Build?', message: 'Quick Build fills every missing art record from the bundle and refreshes the generated ones. Records you edited, or accepted from Claude, are kept exactly as they are.', okLabel: 'Run Quick Build' });
    go.then(function (ok) {
      if (!ok) return;
      var rep;
      try { rep = ART.quickBuild.run(b); } catch (e) { console.error(e); Kit.ui.toast('Quick Build failed: ' + e.message, 'error', 8000); return; }
      Kit.refreshValidation();
      Kit.rerender();
      Kit.ui.toast('Quick Build done in ' + rep.ms + ' ms: ' + rep.created + ' new, ' + rep.refreshed + ' refreshed, ' + rep.kept + ' kept.', 'ok', 6000);
    });
  };

  // ---------------------------------------------------------------- Start
  function kv(pairs) { return '<dl class="kv">' + pairs.map(function (p) { return '<dt>' + esc(p[0]) + '</dt><dd>' + p[1] + '</dd>'; }).join('') + '</dl>'; }
  function loadDemo() {
    var go = ART.isEmpty() && !(cur().charter && cur().charter.locked) ? Promise.resolve(true) :
      Kit.ui.confirm({ title: 'Load the demo bundle?', message: 'The current working draft will be replaced by the demo. Save it to a slot or export it first if you want to keep it.', okLabel: 'Load demo' });
    go.then(function (ok) { if (!ok) return; Kit.bundle.load(ART_DEMO.bundle()); Kit.ui.toast('Demo bundle loaded.', 'ok'); });
  }
  // Copies Day 146's working draft into this forge. Day 146's copy is never written or removed.
  function openDay146Draft() {
    var d = ART.storage.day146Draft();
    if (!d) { Kit.ui.toast('Day 146 has no draft in this browser.', 'warn'); return; }
    var go = ART.isEmpty() && !(cur().charter && cur().charter.locked) ? Promise.resolve(true) :
      Kit.ui.confirm({ title: 'Open the Day 146 draft?', message: 'This forge\'s current draft will be replaced by a copy of ' + ((d.kit && d.kit.title) || 'the Day 146 draft') + '. Save it to a slot or export it first if you want to keep it.', okLabel: 'Open Day 146 draft' });
    go.then(function (ok) {
      if (!ok) return;
      try { Kit.bundle.load(d); Kit.ui.toast('Opened a copy of the Day 146 draft.', 'ok'); } catch (e) { Kit.ui.toast(e.message, 'error', 7000); }
    });
  }
  ART.openDay146Draft = openDay146Draft;
  function renderStart(host) {
    var b = cur(), C = b.charter || {}, S = C.sections || {}, sp = C.specs || {};
    var head = el('section', 'panel a7-hero');
    head.innerHTML = '<h2 class="panel-title">Start</h2><p class="muted">Load a Day 146 bundle or the demo. Art and Audio Forge reads the Charter and Rules, writes only the art namespace and eight reserved forward fields, and exports a bundle Day 146 still opens.</p>';
    var row = el('div', 'btn-row');
    var imp = el('button', 'btn btn-primary', Kit.icon('import') + '<span>Load a Day 146 bundle</span>'); imp.type = 'button';
    imp.addEventListener('click', function () { var f = document.getElementById('fileImport'); f.value = ''; f.click(); });
    var demo = el('button', 'btn', Kit.icon('spark') + '<span>Load the demo</span>'); demo.type = 'button'; demo.addEventListener('click', loadDemo);
    var qb = el('button', 'btn', Kit.icon('spark') + '<span>Quick Build</span>'); qb.type = 'button';
    if (ready(b) !== true) { qb.disabled = true; qb.title = ready(b); } else qb.addEventListener('click', ART.openQuickBuild);
    var st = el('button', 'btn btn-ghost', Kit.icon('gear') + '<span>Settings</span>'); st.type = 'button'; st.addEventListener('click', Kit.settings.open);
    row.appendChild(imp); row.appendChild(demo); row.appendChild(qb);
    var d146 = ART.storage.day146Draft();
    if (d146 && d146.kit && d146.kit.bundleId !== b.kit.bundleId) {
      var od = el('button', 'btn', Kit.icon('book') + '<span>Open the Day 146 draft</span>'); od.type = 'button';
      od.title = 'Copy the draft Saga Forge left in this browser (' + ((d146.kit && d146.kit.title) || 'untitled') + ') into this forge';
      od.addEventListener('click', openDay146Draft);
      row.appendChild(od);
    }
    row.appendChild(st);
    head.appendChild(row);
    host.appendChild(head);

    var grid = el('div', 'grid-cards a7-grid');
    host.appendChild(grid);
    var proj = el('section', 'card');
    var ok = ready(b) === true;
    var res = sp.resolution || {};
    proj.innerHTML = '<h3 class="section-h">Project</h3>' + (ok ? '' : '<p class="msg msg-warning">' + esc(ready(b)) + '</p>') + kv([
      ['Title', esc(b.kit.title)],
      ['Charter', C.locked ? '<span class="chip chip-ok">Locked v' + esc(C.version) + '</span>' : '<span class="chip chip-muted">Not locked</span>'],
      ['Codex', b.codex && b.codex.version ? 'v' + esc(b.codex.version) : '<span class="chip chip-muted">Not generated</span>'],
      ['Tile size', sp.tileSize ? esc(sp.tileSize) + ' px' : '-'],
      ['Resolution', res.w ? esc(res.w + ' by ' + res.h) : '-'],
      ['Palette', sp.paletteSize ? esc(sp.paletteSize) + ' colors' : '-'],
      ['Controls', esc(sp.mobileControls || '-')],
      ['Forges', esc(Object.keys(b.kit.forges || {}).map(function (f) { return f + ' ' + ((b.kit.forges[f] || {}).status || ''); }).join(', '))],
      ['Opened', esc((b.kit.opened || []).join(', ') || 'none')]
    ]);
    grid.appendChild(proj);

    var cast = el('section', 'card');
    var chs = Array.isArray(S.chapters) ? S.chapters : [];
    cast.innerHTML = '<h3 class="section-h">What art is owed</h3>' + kv([
      ['Characters', count(b, 'chr_')], ['Enemy families', count(b, 'fam_')], ['Abilities', count(b, 'abl_')],
      ['Items', count(b, 'itm_')], ['Equipment', count(b, 'eqp_')], ['Statuses', count(b, 'sta_')],
      ['Weather states', count(b, 'wth_')], ['Elements', ((C.ruleset || {}).elements || []).length],
      ['Chapters', chs.length], ['Endings', S.endings && Array.isArray(S.endings.endings) ? S.endings.endings.length : 0]
    ]);
    grid.appendChild(cast);

    var art = el('section', 'card');
    var r = b.art && b.art.records || {};
    var fw = ART.forwardRefs(b);
    art.innerHTML = '<h3 class="section-h">Art namespace</h3>' + kv([
      ['Version', esc(b.art.version)],
      ['Records', ART.PREFIXES.reduce(function (n, p) { return n + (r[p] ? Object.keys(r[p]).length : 0); }, 0)],
      ['Art opened', Kit.codex.isOpened('art') ? '<span class="chip chip-ok">yes</span>' : '<span class="chip chip-muted">no, until a Final export</span>'],
      ['Forward fields filled', fw.length + (fw.length ? ' (' + fw.filter(function (f) { return !f.ok; }).length + ' unresolved)' : '')],
      ['Master palette', ART.palette.master(b) ? ART.palette.entries(b).length + ' colors' : '<span class="chip chip-muted">not built</span>']
    ]) + '<div class="a7-prefixes">' + ART.PREFIXES.map(function (p) {
      var n = r[p] ? Object.keys(r[p]).length : 0;
      return '<span class="chip ' + (n ? 'chip-accent' : 'chip-muted') + '" title="' + esc(ART.TYPES[p].label) + '">' + esc(p) + ' ' + n + '</span>';
    }).join('') + '</div>';
    grid.appendChild(art);

    var mus = el('section', 'card');
    var roles = ART.musicRoles(b).filter(function (x) { return x.required; });
    mus.innerHTML = '<h3 class="section-h">Music roles (' + roles.length + ' required)</h3><div class="a7-prefixes">' +
      roles.map(function (x) { return '<span class="chip ' + (x.kind === 'generated' ? 'chip-accent' : 'chip-muted') + '">' + esc(x.key) + '</span>'; }).join('') + '</div>';
    grid.appendChild(mus);

    var size = el('section', 'panel');
    size.appendChild(el('h3', 'section-h', 'Size'));
    sizeBody(size);
    host.appendChild(size);
  }

  // ---------------------------------------------------------------- tabs that arrive in later phases
  var LATER = [
    ['palette', 'Palette', 'chart', 'Master palette, colorways, tier palettes, and element palettes.', 'Phase 1'],
    ['sprites', 'Sprites', 'edit', 'Parts, characters, villain and NPCs, bestiary, portraits, and the pixel editor.', 'Phase 2'],
    ['motion', 'Motion', 'spark', 'Pose library, animations, ability animations, effects, and weather overlays.', 'Phase 3'],
    ['world', 'World Art', 'arena', 'Tilesets, interiors, priority, tile animations, and backgrounds.', 'Phase 4'],
    ['interface', 'Interface', 'slots', 'Icons, window and font, cursor, touch skin, and title.', 'Phase 2 and 5'],
    ['sound', 'Sound', 'book', 'Instruments, effects, motifs, score by role, and the jukebox.', 'Phase 6'],
    ['playtest', 'Playtest', 'sword', 'Dressed battles, the test room, and the window preview.', 'Phase 5']
  ];

  function renderExport(host) {
    var b = cur(), fw = ART.forwardRefs(b);
    var p = el('section', 'panel');
    p.innerHTML = '<h2 class="panel-title">Export</h2><p class="muted">Coverage and reference checks arrive in Phase 8. Today this exports the bundle with the art namespace and a forge 147 manifest. A Draft export keeps art closed so Day 146 still reads art fields as forward references; a Final export opens art and is allowed only when every forward field resolves.</p>';
    var bt = el('button', 'btn btn-primary', Kit.icon('export') + '<span>Export</span>'); bt.type = 'button'; bt.addEventListener('click', Kit.openExport);
    p.appendChild(bt);
    host.appendChild(p);
    var f = el('section', 'panel');
    f.appendChild(el('h3', 'section-h', 'Forward fields'));
    if (!fw.length) f.appendChild(el('div', 'empty-line', 'No forward field is filled yet. Phase 7 fills portrait, leitmotif, animation, sfx, icon, and sprite fields.'));
    else {
      var t = el('table', 'tbl');
      t.innerHTML = '<thead><tr><th scope="col">Record</th><th scope="col">Field</th><th scope="col">Points at</th><th scope="col">State</th></tr></thead><tbody>' +
        fw.map(function (x) { return '<tr><td><code>' + esc(x.recordId) + '</code></td><td>' + esc(x.field) + '</td><td><code>' + esc(x.id) + '</code></td><td>' + (x.ok ? '<span class="chip chip-ok">resolves</span>' : '<span class="chip chip-broken">missing</span>') + '</td></tr>'; }).join('') + '</tbody>';
      var w = el('div', 'tbl-wrap'); w.appendChild(t); f.appendChild(w);
    }
    host.appendChild(f);
  }

  function renderDev(host) {
    var p = el('section', 'panel');
    p.innerHTML = '<h2 class="panel-title">Developer</h2><p class="muted">Fixtures are generated in code. Loading one replaces the working draft.</p>';
    var list = el('div', 'a7-fixtures');
    ART_DEMO.FIXTURES.forEach(function (fx) {
      var row = el('div', 'slot-row');
      row.appendChild(el('div', 'slot-info', '<strong>' + esc(fx.key) + '</strong><small>' + esc(fx.purpose) + '</small>'));
      var go = el('button', 'btn', '<span>Load</span>'); go.type = 'button';
      go.addEventListener('click', function () { Kit.bundle.load(ART_DEMO.fixture(fx.key)); Kit.ui.toast('Loaded fixture ' + fx.key + '.', 'ok'); });
      row.appendChild(go);
      list.appendChild(row);
    });
    p.appendChild(list);
    var out = el('div');
    var run = el('button', 'btn btn-primary', Kit.icon('check') + '<span>Run self test</span>'); run.type = 'button';
    run.addEventListener('click', function () {
      U.clear(out);
      var rows = ART_DEMO.selfTest();
      window.ART_LAST_SELFTEST = rows;
      var t = el('table', 'tbl');
      t.innerHTML = '<thead><tr><th scope="col">Fixture</th><th scope="col">Hash</th><th scope="col" class="num">Records</th><th scope="col">Validation</th><th scope="col" class="num">Roles</th><th scope="col" class="num">Size</th><th scope="col" class="num">Build ms</th><th scope="col">Quick Build</th><th scope="col">Motion</th><th scope="col">Coverage</th><th scope="col">Bake</th></tr></thead><tbody>' +
        rows.map(function (r) { var v = r.validation; return '<tr><th scope="row">' + esc(r.key) + '</th><td>' + (r.hashOk ? '<span class="chip chip-ok">ok</span>' : '<span class="chip chip-error">bad</span>') + '</td><td class="num">' + r.records + '</td><td>' + v.errors + ' err, ' + v.broken + ' broken, ' + v.forward + ' fwd</td><td class="num">' + r.roles + '</td><td class="num">' + esc(U.fmtSize(r.size)) + '</td><td class="num">' + r.buildMs + '</td><td class="muted">' + esc(r.quickBuild + (r.palette ? '; master ' + r.palette.master + '/' + r.palette.want + ', ' + r.palette.locals + ' colorways, ' + r.palette.tiers + ' tiers (' + r.palette.offset + ' shifted, ' + r.palette.collapsed + ' same), ' + r.palette.effects + ' effects' : '')) + '</td><td class="muted">' + esc(r.motion ? r.motion.anims + ' animations, ' + r.motion.abilities + ' ability, ' + r.motion.overlays + ' weather' + (r.motion.generic ? ' (' + r.motion.generic + ' generic)' : '') + '; ' + r.motion.steps + ' steps in ' + r.motion.ms + ' ms' : 'none') + '</td><td class="muted">' + esc(r.coverage) + '</td><td class="muted">' + esc(r.bakeMs + (r.bake ? ', ' + U.fmtSize(r.bake.bytes) : '')) + '</td></tr>'; }).join('') + '</tbody>';
      var w = el('div', 'tbl-wrap'); w.appendChild(t); out.appendChild(w);
    });
    p.appendChild(run); p.appendChild(out);
    host.appendChild(p);
  }

  // ---------------------------------------------------------------- mount
  Kit.mount('start', { title: 'Start', icon: 'scroll', canEnter: function () { return true; }, render: renderStart });
  // A workspace fence that has arrived registers ART.WS[key] = {render, focus}; the rest stay stubs until their phase.
  LATER.forEach(function (t) {
    var real = ART.WS && ART.WS[t[0]];
    Kit.mount(t[0], { title: t[1], icon: t[2], canEnter: ready, focus: real && real.focus,
      render: real ? real.render : function (host) { host.appendChild(Kit.ui.stub({ title: t[1], lead: t[3], status: 'Arrives in ' + t[4] + '.', icon: t[2] })); } });
  });
  Kit.mount('export', { title: 'Export', icon: 'export', canEnter: ready, render: renderExport });
  if (DEV) Kit.mount('dev', { title: 'Dev', icon: 'gear', canEnter: function () { return true; }, render: renderDev });
  ART.paintMeter = paintMeter;
  Kit.on('change', meterSoon);
  Kit.on('load', function () { paintMeter(); });
})();
// === WS:ART147 END ===
