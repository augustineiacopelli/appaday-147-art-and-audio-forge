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
  // buildExport(status, opts): opts.fill fills the forward fields first (the export dialog does this by default; the
  // bare call never does, so a dangling field still blocks Final), opts.engines false leaves the engine files out.
  // Files, in order: bundle, manifest, engine-render.js, engine-audio.js. exportFile restamps kit.contentHash, and the
  // manifest and both engine headers carry that same hash.
  Kit.buildExport = function (status, opts) {
    opts = opts || {};
    var b = cur();
    if (!b) throw new Error('No project is open.');
    ART.ensure(b); ART.registerCodex(b);
    if (opts.fill && ART.links.plan(b).length) { ART.links.fill(b); Kit.bundle.touch('links'); }
    var res = Kit.refreshValidation();
    if (status === 'final') {
      if (res.errors.length || res.broken.length) throw new Error('Final export is blocked by ' + (res.errors.length + res.broken.length) + ' error' + (res.errors.length + res.broken.length === 1 ? '' : 's') + '.');
      if (!ART.canOpen(b)) throw new Error('Final export is blocked: a forward field points at an art record that does not exist.');
      Kit.bundle.open('art');
    } else if (!ART.canOpen(b)) Kit.bundle.close('art');
    b.kit.forges['147'] = { status: status, exportedAt: U.now(), artVersion: b.art.version, charterVersion: b.charter.version || 0 };
    var out = Kit.bundle.exportFile({ download: false });
    var files = [
      { key: 'bundle', name: out.filename, text: out.text, mime: 'application/json' },
      { key: 'manifest', name: Kit.bundle.slug() + '-art-manifest.json', text: JSON.stringify(ART.manifest(cur(), out.hash), null, 2), mime: 'application/json' }
    ];
    if (opts.engines !== false && ART.engines.available()) ART.engines.LIST.forEach(function (e) { files.push(ART.engines.file(e.key, out.hash)); });
    return { hash: out.hash, files: files };
  };
  // Would a Final export be allowed after the forward fields are filled? Tried on a copy; nothing is written.
  function finalState(b, fill) {
    var res = Kit.refreshValidation(), s = Kit.validate.summary(res);
    if (s.errors + s.broken > 0) return { ok: false, why: 'Blocked by ' + (s.errors + s.broken) + ' error' + (s.errors + s.broken === 1 ? '' : 's') + ' or broken reference' + (s.errors + s.broken === 1 ? '' : 's') + '. Open the validation panel to fix them.' };
    if (ART.canOpen(b)) return { ok: true };
    if (fill) { var c = U.clone(b); ART.links.fill(c); if (ART.canOpen(c)) return { ok: true }; }
    return { ok: false, why: 'Blocked: a forward field points at an art record that does not exist. Fill forward fields first.' };
  }
  ART.finalState = finalState;
  function download(files) { files.forEach(function (f, i) { setTimeout(function () { U.download(f.name, f.text, f.mime); }, i * 350); }); }
  ART.exportNow = function (status, opts) {
    try {
      var out = Kit.buildExport(status, opts);
      download(out.files);
      Kit.ui.toast('Exported ' + out.files.length + ' files (' + status + '). Hash ' + out.hash.slice(0, 12) + '.', 'ok', 6000);
      Kit.rerender();
      return out;
    } catch (e) { Kit.ui.toast(e.message, 'error', 7000); return null; }
  };
  // The status cards, the fill and engine toggles, and the coverage line, shared by the dialog and the Downloads view.
  function exportForm(host, st, onChange) {
    var b = cur(), cov = ART.coverage.compute(b), plan = ART.links.plan(b), s = Kit.validate.summary(Kit.refreshValidation());
    host.appendChild(el('div', null, '<dl class="kv"><dt>Project</dt><dd>' + esc(b.kit.title) + '</dd><dt>Art version</dt><dd>' + esc(b.art.version) + '</dd><dt>Art records</dt><dd>' + ART.manifest(b, '').created.length + '</dd>' +
      '<dt>Coverage</dt><dd>' + covChip(cov) + (cov.green ? '' : ' <span class="muted">' + cov.missing + ' required item' + (cov.missing === 1 ? '' : 's') + ' missing</span>') + '</dd>' +
      '<dt>Issues</dt><dd>' + (s.errors + s.broken ? '<span class="chip chip-error">' + s.errors + ' err</span> <span class="chip chip-broken">' + s.broken + ' broken</span>' : '<span class="chip chip-ok">' + Kit.icon('check') + 'none</span>') + '</dd></dl>'));
    var rc = el('div', 'radio-cards');
    host.appendChild(rc);
    var tg = el('div', 'a7-export-opts');
    if (plan.length) tg.appendChild(ART.ui.toggle('Fill ' + plan.length + ' forward field' + (plan.length === 1 ? '' : 's') + ' first', st.fill, function (on) { st.fill = on; paintCards(); if (onChange) onChange(); }));
    tg.appendChild(ART.ui.toggle('Include engine-render.js and engine-audio.js', st.engines, function (on) { st.engines = on; if (onChange) onChange(); }));
    host.appendChild(tg);
    if (!cov.green) host.appendChild(el('p', 'msg msg-warning', 'Coverage is not complete. You can still export; later forges draw what is missing with their own fallbacks. Open the gap list to see what is owed.'));
    function paintCards() {
      var fs = finalState(b, st.fill && plan.length);
      if (!fs.ok && st.status === 'final') st.status = 'draft';
      rc.innerHTML = '<label class="radio-card"><input type="radio" name="a7Status" value="draft"' + (st.status === 'draft' ? ' checked' : '') + '><span><strong>Draft</strong><br><span class="muted">Always allowed. Art stays closed while a forward field is unresolved, so Day 146 keeps reading art fields as forward.</span></span></label>' +
        '<label class="radio-card' + (fs.ok ? '' : ' disabled') + '"><input type="radio" name="a7Status" value="final"' + (fs.ok ? '' : ' disabled') + (st.status === 'final' ? ' checked' : '') + '><span><strong>Final</strong><br><span class="muted">' + esc(fs.ok ? 'Opens the art namespace and marks forge 147 final.' : fs.why) + '</span></span></label>';
      Array.prototype.forEach.call(rc.querySelectorAll('input'), function (r) { r.addEventListener('change', function () { st.status = r.value; if (onChange) onChange(); }); });
    }
    paintCards();
  }
  function exportState() { return { status: 'draft', fill: ART.links.plan(cur()).length > 0, engines: true }; }
  Kit.openExport = function () {
    var st = exportState();
    Kit.ui.dialog({
      title: 'Export forge 147',
      body: function (body) { exportForm(body, st); },
      actions: [
        { label: 'Close', kind: 'ghost', value: null },
        { label: 'Download', kind: 'primary', icon: 'export', onClick: function () { if (!ART.exportNow(st.status, { fill: st.fill, engines: st.engines })) return false; } }
      ]
    });
  };

  // ---------------------------------------------------------------- coverage (header chip and gap list)
  function covChip(cov) {
    var cls = cov.green ? 'chip-ok' : cov.percent >= 90 ? 'chip-warning' : 'chip-error';
    return '<span class="chip ' + cls + '">' + (cov.green ? Kit.icon('check') : '') + esc(cov.covered + '/' + cov.required) + '</span>';
  }
  function paintCoverage() {
    var btn = document.getElementById('btnCoverage');
    if (!btn) return;
    var b = cur();
    if (!b || ready(b) !== true) { btn.hidden = true; return; }
    btn.hidden = false;
    var cov = ART.coverage.compute(b);
    btn.innerHTML = '<span class="a7-cov-l">Coverage</span>' + covChip(cov);
    btn.setAttribute('aria-label', 'Coverage ' + cov.covered + ' of ' + cov.required + ' required art items' + (cov.green ? ', complete' : ', ' + cov.missing + ' missing') + '. Open the gap list.');
    btn.title = cov.green ? 'Every required art item exists' : cov.missing + ' required art item' + (cov.missing === 1 ? '' : 's') + ' missing';
  }
  var coverageSoon = U.debounce(paintCoverage, 300);
  ART.paintCoverage = paintCoverage;
  function gapRow(it, after) {
    var row = el('div', 'a7-gap' + (it.ok ? ' a7-gap-ok' : ''));
    row.appendChild(el('div', 'a7-gap-t', '<strong>' + esc(it.label) + '</strong>' + (it.detail ? '<small>' + esc(it.detail) + '</small>' : '')));
    var acts = el('div', 'a7-gap-a');
    if (it.restore) acts.appendChild(ART.ui.button('Restore', 'spark', '', function () {
      ART.coverage.restore(cur(), it.restore); Kit.refreshValidation(); paintCoverage(); Kit.ui.toast('Restored ' + it.restore + '.', 'ok'); if (after) after(true);
    }));
    var open = ART.ui.button(it.ok ? 'Open' : 'Fix', 'edit', it.ok ? 'btn-ghost' : '', function () { if (after) after(false); ART.coverage.go(it); });
    open.setAttribute('aria-label', (it.ok ? 'Open ' : 'Fix ') + it.label);
    acts.appendChild(open);
    row.appendChild(acts);
    return row;
  }
  // The gap list. o.all also lists covered items; o.after(changed) runs after a fix or restore (the drawer closes).
  function coverageBody(host, o) {
    o = o || {};
    var b = cur(), cov = ART.coverage.compute(b);
    host.appendChild(el('div', 'a7-meter a7-' + (cov.green ? 'ok' : cov.percent >= 90 ? 'amber' : 'red'), '<i style="width:' + Math.round(cov.percent) + '%"></i>'));
    host.appendChild(el('p', 'muted', esc(cov.green ? 'Every required item exists: ' + cov.covered + ' of ' + cov.required + '. Coverage is computed from the bundle each time, so a new character or ability shows up here at once.' :
      cov.covered + ' of ' + cov.required + ' required items exist (' + cov.percent + ' percent). Quick Build fills every missing item without Claude; each Fix button opens the editor for that item.')));
    var row = el('div', 'btn-row');
    if (!cov.green) row.appendChild(ART.ui.button('Quick Build', 'spark', 'btn-primary', function () { if (o.after) o.after(false); ART.openQuickBuild(); }));
    if (ART.links.plan(b).length) row.appendChild(ART.ui.button('Fill forward fields', 'check', '', function () { ART.links.fill(cur()); Kit.bundle.touch('links'); Kit.refreshValidation(); paintCoverage(); if (o.after) o.after(true); }));
    if (row.children.length) host.appendChild(row);
    var chips = el('div', 'a7-prefixes');
    chips.innerHTML = ART.coverage.GROUPS.map(function (g) {
      var n = cov.byGroup[g.key];
      if (!n.required && !n.advisory) return '';
      return '<span class="chip ' + (n.covered === n.required ? 'chip-ok' : 'chip-warning') + '">' + esc(g.label + ' ' + n.covered + '/' + n.required) + '</span>';
    }).join('');
    host.appendChild(chips);
    var list = o.all ? cov.items.filter(function (i) { return i.need === 'required'; }) : cov.gaps;
    ART.coverage.GROUPS.forEach(function (g) {
      var its = list.filter(function (i) { return i.group === g.key; });
      if (!its.length) return;
      host.appendChild(el('h3', 'section-h', esc(g.label) + (o.all ? '' : ' (' + its.length + ' missing)')));
      var box = el('div', 'a7-gaps');
      its.forEach(function (it) { box.appendChild(gapRow(it, o.after)); });
      host.appendChild(box);
    });
    if (!o.all && !cov.gaps.length) host.appendChild(el('div', 'empty-line', 'No gaps.'));
    var adv = cov.items.filter(function (i) { return i.need === 'advisory'; });
    if (adv.length) {
      host.appendChild(el('h3', 'section-h', 'Advice and deleted defaults'));
      var ab = el('div', 'a7-gaps');
      adv.forEach(function (it) { ab.appendChild(gapRow(it, o.after)); });
      host.appendChild(ab);
    }
  }
  ART.openCoverage = function () {
    var h = Kit.ui.drawer({ title: 'Coverage', body: function (body, hd) { coverageBody(body, { after: function (changed) { hd.close(); if (changed) { Kit.rerender(); ART.openCoverage(); } } }); } });
    return h;
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
      paintMeter(); paintCoverage();
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
      roles.map(function (x) { var has = ART.audio && ART.audio.trackFor(b, x.key); return '<span class="chip ' + (has ? 'chip-ok' : x.kind === 'generated' ? 'chip-accent' : 'chip-muted') + '" title="' + (has ? 'Scored: ' + esc(has.name) : 'No track yet') + '">' + esc(x.key) + '</span>'; }).join('') + '</div>';
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
    ['playtest', 'Playtest', 'sword', 'Dressed battles, the test room, and the window preview.', 'Phase 4 and 5']
  ];

  // Export: Coverage, References, Size, Downloads (the plan's four sub tabs).
  var exportUi = ART.coverage.exportUi = { sub: 'coverage', all: false };
  var EXPORT_SUBS = [['coverage', 'Coverage'], ['references', 'References'], ['size', 'Size'], ['downloads', 'Downloads']];
  function refsView(host) {
    var b = cur(), scan = ART.refs.scan(b), fw = ART.forwardRefs(b), plan = ART.links.plan(b), un = ART.refs.uncovered(b, scan);
    var art = scan.refs.filter(function (r) { return r.kind === 'art'; }), dang = scan.dangling;
    var p = el('section', 'panel');
    p.appendChild(el('h3', 'section-h', 'Reference check'));
    p.appendChild(el('p', 'muted', esc(art.length + ' links between art records, ' + scan.refs.filter(function (r) { return r.kind === 'subject'; }).length + ' subjects that name a rules record or element, and ' + fw.length + ' forward field' + (fw.length === 1 ? '' : 's') + '. ' +
      (dang.length ? dang.length + ' point at nothing.' : 'Every one resolves.') + ' A Final export is blocked while an art link or a forward field points at nothing.')));
    if (dang.length) {
      var t = el('table', 'tbl');
      t.innerHTML = '<thead><tr><th scope="col">Record</th><th scope="col">Field</th><th scope="col">Points at</th><th scope="col">Kind</th><th scope="col"><span class="sr-only">Open</span></th></tr></thead><tbody></tbody>';
      var tb = t.querySelector('tbody');
      dang.forEach(function (r) {
        var tr = el('tr');
        var rec = ART.records.get(r.from);
        tr.innerHTML = '<td>' + esc(rec ? rec.name : r.from) + ' <code class="id">' + esc(r.from) + '</code></td><td>' + esc(r.path) + '</td><td><code>' + esc(r.id + (r.key ? ':' + r.key : '')) + '</code></td><td>' +
          (r.kind === 'art' ? '<span class="chip chip-broken">' + (un.indexOf(r) >= 0 ? 'broken' : 'error') + '</span>' : r.kind === 'subject' ? '<span class="chip chip-warning">orphan subject</span>' : '<span class="chip chip-warning">' + esc(r.kind) + '</span>') + '</td>';
        var td = el('td');
        if (rec) td.appendChild(ART.ui.button('Open', 'edit', 'btn-ghost', function () { Kit.jump(r.from); }));
        tr.appendChild(td); tb.appendChild(tr);
      });
      var w0 = el('div', 'tbl-wrap'); w0.appendChild(t); p.appendChild(w0);
    } else p.appendChild(el('div', 'empty-line', 'No dangling references.'));
    host.appendChild(p);

    var f = el('section', 'panel');
    f.appendChild(el('h3', 'section-h', 'Forward fields'));
    f.appendChild(el('p', 'muted', 'Day 146 reserved eight fields for this forge: a character\'s portrait and leitmotif, an ability\'s animation, sound, and icon, item and equipment icons, and an enemy family\'s sprite. Quick Build fills them from the art made for each record; fields you pointed elsewhere are kept. ' +
      (plan.length ? plan.length + ' field' + (plan.length === 1 ? ' is' : 's are') + ' empty or point at a deleted record.' : 'Every field that can be filled is filled.')));
    var lrow = el('div', 'btn-row');
    var lb = ART.ui.button('Fill forward fields', 'check', plan.length ? 'btn-primary' : '', function () { var ch = ART.links.fill(cur()); Kit.bundle.touch('links'); Kit.refreshValidation(); Kit.rerender(); Kit.ui.toast(ch.length + ' forward field' + (ch.length === 1 ? '' : 's') + ' updated.', 'ok'); });
    lb.disabled = !plan.length;
    lrow.appendChild(lb); f.appendChild(lrow);
    if (!fw.length) f.appendChild(el('div', 'empty-line', 'No forward field is filled yet. Run Quick Build, or Fill forward fields once the art exists.'));
    else {
      var t2 = el('table', 'tbl');
      t2.innerHTML = '<thead><tr><th scope="col">Record</th><th scope="col">Field</th><th scope="col">Points at</th><th scope="col">State</th></tr></thead><tbody>' +
        fw.map(function (x) { return '<tr><td><code>' + esc(x.recordId) + '</code></td><td>' + esc(x.field) + '</td><td><code>' + esc(x.id) + '</code></td><td>' + (x.ok ? '<span class="chip chip-ok">resolves</span>' : '<span class="chip chip-broken">missing</span>') + '</td></tr>'; }).join('') + '</tbody>';
      var w = el('div', 'tbl-wrap'); w.appendChild(t2); f.appendChild(w);
    }
    host.appendChild(f);

    var m = el('section', 'panel'), man = ART.manifest(b, '');
    m.appendChild(el('h3', 'section-h', 'Manifest preview'));
    m.appendChild(el('p', 'muted', 'The manifest exported next to the bundle lists every art ID this forge created, every ID the art refers to, and everything unresolved, so Days 148 to 150 can check what they receive.'));
    m.appendChild(el('div', null, kv([['Created', man.created.length + ' art IDs'], ['Referenced', man.referenced.length + ' IDs'], ['Unresolved', man.unresolved.length ? '<span class="chip chip-broken">' + man.unresolved.length + '</span>' : '<span class="chip chip-ok">0</span>'],
      ['Coverage', esc(man.coverage.covered + ' of ' + man.coverage.required)], ['Engines', esc(man.engines.map(function (e) { return e.file + ' ' + e.version; }).join(', '))]])));
    host.appendChild(m);
  }
  function downloadsView(host) {
    var st = exportUi.dl = exportUi.dl || exportState();
    var p = el('section', 'panel');
    p.appendChild(el('h3', 'section-h', 'Export the bundle'));
    p.appendChild(el('p', 'muted', 'Exports four files: the bundle with the art namespace, the forge 147 manifest, and the two engines. Day 146 opens the bundle unchanged. A Final export opens the art namespace for Days 148 to 150.'));
    exportForm(p, st);
    p.appendChild(ART.ui.button('Download', 'export', 'btn-primary', function () { ART.exportNow(st.status, { fill: st.fill, engines: st.engines }); }));
    host.appendChild(p);
    var e = el('section', 'panel');
    e.appendChild(el('h3', 'section-h', 'Engines'));
    e.appendChild(el('p', 'muted', 'ENGINE_RENDER draws sprites, portraits, icons, tiles, effects, weather, windows, text, and battles from the art namespace. ENGINE_AUDIO plays the score and the sound effects. Each is one file with no dependencies that reads no host global, the same code this page runs.'));
    var row = el('div', 'btn-row');
    ART.engines.LIST.forEach(function (en) {
      var bt = ART.ui.button(en.file + ' (' + ART.engines.version(en.key) + ')', 'export', '', function () { var f = ART.engines.file(en.key, ''); U.download(f.name, f.text, f.mime); });
      if (!ART.engines.source(en.key)) { bt.disabled = true; bt.title = 'This page cannot read its own engine source.'; }
      row.appendChild(bt);
    });
    e.appendChild(row);
    if (!ART.engines.available()) e.appendChild(el('p', 'msg msg-warning', 'This page cannot read its own engine source, so the engine files are unavailable.'));
    host.appendChild(e);
  }
  function renderExport(host) {
    var head = el('section', 'panel');
    head.innerHTML = '<h2 class="panel-title">Export</h2><p class="muted">Check coverage and references, see what the bundle weighs, and export the bundle, its manifest, and both engines.</p>';
    host.appendChild(head);
    var tabs = el('div', 'a7-sub'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Export sections');
    var panel = el('div', 'a7-subpanel'); panel.setAttribute('role', 'tabpanel');
    EXPORT_SUBS.forEach(function (s) {
      var t = el('button', null, esc(s[1])); t.type = 'button'; t.setAttribute('role', 'tab'); t.dataset.sub = s[0];
      t.addEventListener('click', function () { exportUi.sub = s[0]; paint(); });
      tabs.appendChild(t);
    });
    host.appendChild(tabs); host.appendChild(panel);
    function paint() {
      Array.prototype.forEach.call(tabs.children, function (t) { t.setAttribute('aria-selected', t.dataset.sub === exportUi.sub ? 'true' : 'false'); });
      U.clear(panel);
      if (exportUi.sub === 'coverage') {
        var c = el('section', 'panel');
        var tg = ART.ui.toggle('Show covered items too', exportUi.all, function (on) { exportUi.all = on; paint(); });
        c.appendChild(tg);
        coverageBody(c, { all: exportUi.all, after: function (changed) { if (changed) Kit.rerender(); } });
        panel.appendChild(c);
      } else if (exportUi.sub === 'references') refsView(panel);
      else if (exportUi.sub === 'size') { var z = el('section', 'panel'); z.appendChild(el('h3', 'section-h', 'Size')); sizeBody(z); panel.appendChild(z); }
      else downloadsView(panel);
    }
    paint();
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
      t.innerHTML = '<thead><tr><th scope="col">Fixture</th><th scope="col">Hash</th><th scope="col" class="num">Records</th><th scope="col">Validation</th><th scope="col" class="num">Roles</th><th scope="col" class="num">Size</th><th scope="col" class="num">Build ms</th><th scope="col">Quick Build</th><th scope="col">Motion</th><th scope="col">Tiles</th><th scope="col">Battle</th><th scope="col">Audio</th><th scope="col">Coverage</th><th scope="col">References</th><th scope="col">Bake</th></tr></thead><tbody>' +
        rows.map(function (r) { var v = r.validation; return '<tr><th scope="row">' + esc(r.key) + '</th><td>' + (r.hashOk ? '<span class="chip chip-ok">ok</span>' : '<span class="chip chip-error">bad</span>') + '</td><td class="num">' + r.records + '</td><td>' + v.errors + ' err, ' + v.broken + ' broken, ' + v.forward + ' fwd</td><td class="num">' + r.roles + '</td><td class="num">' + esc(U.fmtSize(r.size)) + '</td><td class="num">' + r.buildMs + '</td><td class="muted">' + esc(r.quickBuild + (r.palette ? '; master ' + r.palette.master + '/' + r.palette.want + ', ' + r.palette.locals + ' colorways, ' + r.palette.tiers + ' tiers (' + r.palette.offset + ' shifted, ' + r.palette.collapsed + ' same), ' + r.palette.effects + ' effects' : '')) + '</td><td class="muted">' + esc(r.motion ? r.motion.anims + ' animations, ' + r.motion.abilities + ' ability, ' + r.motion.overlays + ' weather' + (r.motion.generic ? ' (' + r.motion.generic + ' generic)' : '') + '; ' + r.motion.steps + ' steps in ' + r.motion.ms + ' ms' : 'none') + '</td><td class="muted">' + esc(r.tiles ? r.tiles.biomes + ' biomes, ' + r.tiles.interiors + ' interiors, ' + r.tiles.backgrounds + ' backgrounds; ' + r.tiles.tiles + ' tiles in ' + r.tiles.ms + ' ms, ' + U.fmtSize(r.tiles.bytes) + ' if all kept; room ' + r.tiles.walkable + '/' + r.tiles.cells + ' walkable' : 'none') + '</td><td class="muted">' + esc(r.battle ? r.battle.beats + ' beats, ' + r.battle.hits + ' hits in ' + r.battle.ms + ' ms, ' + (r.battle.ended || 'open') + (r.battle.real ? '; engine: ' + r.battle.real.outcome + ', ' + r.battle.real.beats + ' beats' : '; engine not loaded') : 'none') + '</td><td class="muted">' + esc(r.audio ? r.audio.roles + '/' + r.audio.required + ' roles scored, ' + r.audio.tracks + ' tracks (' + r.audio.notes + ' notes, ' + r.audio.seconds + ' s' + (r.audio.errors ? ', ' + r.audio.errors + ' MML errors' : '') + '), ' + r.audio.sounds + ' sounds rendered in ' + r.audio.renderMs + ' ms, ' + r.audio.instruments + ' instruments, ' + r.audio.motifs + ' motifs' : 'none') + '</td><td class="muted">' + esc(typeof r.coverage === 'string' ? r.coverage : r.coverage.covered + '/' + r.coverage.required + (r.coverage.green ? ' complete' : ' (' + r.coverage.gaps.slice(0, 3).join(', ') + ')') + (r.coverage.advisories.length ? '; ' + r.coverage.advisories.length + ' advisory' : '')) + '</td><td class="muted">' + esc(r.refs ? r.refs.refs + ' refs, ' + r.refs.dangling + ' dangling in ' + r.refs.ms + ' ms' + (r.canFinal ? '; Final ok' : '; Final blocked') : 'none') + '</td><td class="muted">' + esc(r.bakeMs + (r.bake ? ', ' + U.fmtSize(r.bake.bytes) : '')) + '</td></tr>'; }).join('') + '</tbody>';
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
  Kit.on('change', coverageSoon);
  Kit.on('load', function () { paintMeter(); paintCoverage(); });
})();
// === WS:ART147 END ===
