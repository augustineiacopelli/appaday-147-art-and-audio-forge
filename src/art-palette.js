// === ART:PALETTE BEGIN ===
(function () {
  'use strict';
  // The palette pipeline as records. One master pal_ (kind master), one local pal_ per character, the villain, and each NPC
  // archetype (kind local, 16 slots, colorway), one tier pal_ per fam_ record (kind tier, derived from the family's own
  // colors), and one efx_ per Charter element. Engine math lives in ENGINE_RENDER.palette; this fence owns the records.
  var U = Kit.util, E = ENGINE_RENDER.palette, C = ENGINE_RENDER.color, H = ENGINE_RENDER.util.hash32;
  var P = ART.palette = {};
  ART.NPC_ARCHETYPES = ['elder', 'child', 'merchant', 'guard', 'worker', 'scholar', 'healer', 'traveler', 'noble', 'innkeeper'];
  ART.LOCAL_RAMPS = E.RAMPS;
  ART.ENEMY_RAMPS = E.ENEMY_RAMPS;
  var MAT_LABELS = { skin: 'Skin', hair: 'Hair', clothA: 'Cloth A', clothB: 'Cloth B', metal: 'Metal', body: 'Body', shade: 'Shade', accent: 'Accent', eye: 'Eye' };
  P.MAT_LABELS = MAT_LABELS;
  var KEEP = { user: 1, claude: 1 };
  P.isKept = function (rec) { return !!(rec && KEEP[rec.origin]); };

  // Particle shape and screen behavior carry element identity when color cannot (two color palettes make every element
  // palette identical). Keyword defaults; anything unmatched cycles through the shapes so no two elements share a default.
  var SHAPES = ['spark', 'flake', 'bubble', 'shard', 'ring', 'wisp', 'bolt'];
  var STYLE_WORDS = [
    [/fire|flame|ember|heat|sun|lava|burn/, 'spark', 'shake'], [/frost|ice|snow|cold|winter/, 'flake', 'none'],
    [/water|tide|sea|rain|wave|aqua/, 'bubble', 'wave'], [/earth|stone|rock|metal|iron|sand|ground/, 'shard', 'shake'],
    [/light|holy|star|radian|sol/, 'ring', 'none'], [/shade|dark|shadow|void|night|death|umbra/, 'wisp', 'darken'],
    [/air|wind|gale|sky/, 'wisp', 'wave'], [/storm|thunder|bolt|lightning|spark|volt/, 'bolt', 'shake'],
    [/bloom|plant|wood|leaf|nature|life|poison/, 'ring', 'wave']
  ];
  P.elementStyle = function (el, i) {
    var t = ((el && el.key) || '') + ' ' + ((el && el.label) || '');
    t = t.toLowerCase();
    for (var j = 0; j < STYLE_WORDS.length; j++) if (STYLE_WORDS[j][0].test(t)) return { shape: STYLE_WORDS[j][1], screen: STYLE_WORDS[j][2] };
    return { shape: SHAPES[(i || 0) % SHAPES.length], screen: 'none' };
  };

  // ---------------------------------------------------------------- lookups
  function cur() { return Kit.bundle.current(); }
  ART.bySubject = function (prefix, kind, ref, b) {
    return ART.records.list(prefix, b || cur()).filter(function (r) { return r.subject && r.subject.kind === kind && r.subject.ref === ref; })[0] || null;
  };
  P.master = function (b) {
    b = b || cur();
    return ART.records.list('pal_', b).filter(function (r) { return r.kind === 'master'; })[0] || null;
  };
  P.entries = function (b) { var m = P.master(b); return m && Array.isArray(m.entries) ? m.entries : []; };
  P.size = function (b) { b = b || cur(); return E.size(b && b.charter); };
  P.locals = function (b) { return ART.records.list('pal_', b || cur()).filter(function (r) { return r.kind === 'local'; }); };
  P.tiers = function (b) { return ART.records.list('pal_', b || cur()).filter(function (r) { return r.kind === 'tier'; }); };
  P.effects = function (b) { return ART.records.list('efx_', b || cur()); };
  function bundleSeed(b) { return H((b.kit && b.kit.bundleId) || 'bundle'); }
  function rulesList(b, p) { var m = b.rules && U.isObj(b.rules[p]) ? b.rules[p] : {}; return Object.keys(m).map(function (k) { return m[k]; }).filter(U.isObj); }
  function elements(b) { var r = b.charter && b.charter.ruleset; return r && Array.isArray(r.elements) ? r.elements.filter(function (e) { return U.isObj(e) && e.key; }) : []; }

  // Family tiers. Day 146 stores each tier as its own fam_ record ("Slime T2"); tier comes from its enemies, then the name.
  P.familyInfo = function (b) {
    b = b || cur();
    var fams = rulesList(b, 'fam_'), enm = rulesList(b, 'enm_'), byName = {};
    var info = fams.map(function (f) {
      var t = null;
      enm.forEach(function (e) { if (e.family === f.id && typeof e.tier === 'number') t = t === null ? e.tier : Math.min(t, e.tier); });
      var m = /\s+T(\d+)$/i.exec(f.name || '');
      if (t === null) t = m ? Number(m[1]) : 1;
      var baseName = (f.name || f.id).replace(/\s+T\d+$/i, '');
      return { id: f.id, name: f.name || f.id, baseName: baseName, tier: t, fam: f };
    });
    info.forEach(function (x) { if (!byName[x.baseName] || x.tier < byName[x.baseName].tier) byName[x.baseName] = x; });
    info.forEach(function (x) {
      var base = byName[x.baseName];
      x.baseId = base.id;
      var a = C.hexToLch((x.fam.palette || {}).base || '#808080'), z = C.hexToLch((base.fam.palette || {}).base || '#808080');
      x.hueShift = a && z ? Math.round(C.hueDelta(z[2], a[2])) : 0;
    });
    info.sort(function (a, b) { return a.baseName < b.baseName ? -1 : a.baseName > b.baseName ? 1 : a.tier - b.tier; });
    return info;
  };

  // ---------------------------------------------------------------- master
  // buildMaster(b, {seed, force}). With an existing master and force, the master is rebuilt and every dependent is remapped.
  P.buildMaster = function (b, opts, report) {
    b = b || cur(); opts = opts || {}; report = report || {};
    var m = P.master(b);
    if (m && !opts.force && P.isKept(m)) { report.kept = (report.kept || 0) + 1; return m; }
    var seed = opts.seed != null ? opts.seed >>> 0 : m ? m.seed : bundleSeed(b);
    var out = E.buildMaster(b.charter, b.rules, seed);
    // A generated master is rebuilt from the bundle on every Quick Build; when nothing changed it stays put.
    if (m && !opts.force && U.canonical(m.entries) === U.canonical(out.entries)) { report.kept = (report.kept || 0) + 1; return m; }
    if (m) {
      var old = (m.entries || []).slice();
      m.entries = out.entries; m.anchors = out.anchors; m.size = out.size; m.seed = seed; m.origin = 'procedural';
      P.afterRebuild(b, old);
      report.refreshed = (report.refreshed || 0) + 1;
      return m;
    }
    var rec = ART.envelope('pal_', 'Master palette', { kind: 'role', ref: 'palette:master' }, 'procedural', seed,
      { kind: 'master', size: out.size, entries: out.entries, anchors: out.anchors });
    ART.records.put(rec, b);
    report.created = (report.created || 0) + 1;
    return rec;
  };
  // Editing one entry recolors everything that uses that index. Nothing is remapped.
  P.setEntry = function (b, i, hex) {
    var m = P.master(b), h = C.normHex(hex);
    if (!m || !h || i < 0 || i >= m.entries.length) return false;
    if (m.entries[i] === h) return true;
    m.entries[i] = h; m.origin = 'user';
    return true;
  };
  // After a whole master rebuild, generated records are refitted from their sources and kept records have every index
  // moved to the nearest new color.
  P.afterRebuild = function (b, oldEntries) {
    var nu = P.entries(b), map = oldEntries.map(function (h) { return E.nearest(nu, h); });
    function mv(i) { return typeof i === 'number' && map[i] !== undefined ? map[i] : (typeof i === 'number' ? Math.min(i, nu.length - 1) : i); }
    P.locals(b).forEach(function (r) {
      if (P.isKept(r)) {
        Object.keys(E.RAMPS).forEach(function (k) { if (Array.isArray(r.colorway[k])) r.colorway[k] = r.colorway[k].map(mv); });
        r.slots = E.local(nu, r.colorway);
      } else refitLocal(b, r);
    });
    var tierRep = {};
    P.tiers(b).forEach(function (r) { if (P.isKept(r)) r.slots = r.slots.map(function (s) { return s === null ? null : mv(s); }); });
    P.buildTiers(b, tierRep, { refit: true });
    P.effects(b).forEach(function (r) {
      if (P.isKept(r)) { r.palette = (r.palette || []).map(mv); r.flash = mv(r.flash); r.tint = mv(r.tint); }
    });
    P.buildElements(b, {}, { refit: true });
  };

  // ---------------------------------------------------------------- local palettes (colorways)
  function refitLocal(b, r) {
    var nu = P.entries(b);
    r.source = E.colorwaySource(r.seed, r.hint);
    r.colorway = E.colorway(nu, r.source);
    r.slots = E.local(nu, r.colorway);
    r.ramps = U.clone(E.RAMPS);
    return r;
  }
  P.refitLocal = refitLocal;
  P.reroll = function (b, r, seed) { r.seed = (seed >>> 0) || ((Math.random() * 4294967295) >>> 0); r.origin = 'procedural'; return refitLocal(b, r); };
  P.setStep = function (b, r, mat, step, idx) {
    if (!r.colorway || !Array.isArray(r.colorway[mat]) || step < 0 || step >= r.colorway[mat].length) return false;
    r.colorway[mat][step] = idx;
    r.slots = E.local(P.entries(b), r.colorway);
    r.origin = 'user';
    return true;
  };
  P.setAccent = function (b, r, alias) {
    if (!r.colorway) return false;
    r.colorway.accent = alias === 'metal' ? 'metal' : 'clothB';
    if (r.source) r.source.accent = r.colorway.accent;
    return true;
  };
  function ensureLocal(b, subject, name, hint, origin, report) {
    var r = ART.bySubject('pal_', subject.kind, subject.ref, b);
    if (r && r.kind === 'local') {
      if (P.isKept(r)) { report.kept++; return r; }
      r.hint = hint; refitLocal(b, r); report.refreshed++;
      return r;
    }
    r = ART.envelope('pal_', name, subject, origin, H(subject.ref + '|' + bundleSeed(b)), { kind: 'local', layout: 'humanoid', hint: hint });
    refitLocal(b, r);
    ART.records.put(r, b);
    report.created++;
    return r;
  }
  P.buildLocals = function (b, report) {
    b = b || cur(); report = report || { created: 0, refreshed: 0, kept: 0 };
    var turn = bundleSeed(b) % 360;
    rulesList(b, 'chr_').forEach(function (c, i) {
      ensureLocal(b, { kind: 'chr', ref: c.id }, (c.name || c.id) + ' colorway', { hue: Math.round((turn + i * 137.508) % 360) }, 'procedural', report);
    });
    var v = b.charter && b.charter.sections && b.charter.sections.villain;
    var vname = v && typeof v.villain === 'string' && v.villain.trim() ? v.villain.split(/[,.]/)[0].trim().slice(0, 40) : 'Villain';
    var vs = H('villain|' + bundleSeed(b));
    ensureLocal(b, { kind: 'role', ref: 'villain' }, vname + ' colorway', { hue: vs % 2 ? 290 : 5, dark: true }, 'procedural', report);
    ART.NPC_ARCHETYPES.forEach(function (k, i) {
      ensureLocal(b, { kind: 'role', ref: 'npc:' + k }, k.charAt(0).toUpperCase() + k.slice(1) + ' colorway', { hue: Math.round((turn + 60 + i * 97) % 360) }, 'default', report);
    });
    return report;
  };

  // ---------------------------------------------------------------- tier palettes
  P.buildTiers = function (b, report, opts) {
    b = b || cur(); report = report || {}; opts = opts || {};
    ['created', 'refreshed', 'kept'].forEach(function (k) { report[k] = report[k] || 0; });
    var nu = P.entries(b), groups = {};
    if (!nu.length) return report;
    P.familyInfo(b).forEach(function (x) {
      var avoid = groups[x.baseId] = groups[x.baseId] || [];
      var r = ART.bySubject('pal_', 'fam', x.id, b);
      if (r && r.kind === 'tier' && P.isKept(r)) { avoid.push(r.slots); report.kept++; return; }
      var t = E.tier(x.fam, x.tier, nu, avoid);
      avoid.push(t.slots);
      var body = { kind: 'tier', layout: 'enemy', slots: t.slots, ramps: U.clone(t.ramps),
        derivedFrom: { fam: x.id, base: x.baseId, tier: x.tier, hueShift: x.hueShift, rampOffset: t.rampOffset, inverted: t.inverted }, collapsed: t.collapsed };
      if (r && r.kind === 'tier') { Object.keys(body).forEach(function (k) { r[k] = body[k]; }); r.name = x.name + ' palette'; report.refreshed++; }
      else { ART.records.put(ART.envelope('pal_', x.name + ' palette', { kind: 'fam', ref: x.id }, 'procedural', H(x.id), body), b); report.created++; }
    });
    return report;
  };

  // ---------------------------------------------------------------- element effect palettes
  P.buildElements = function (b, report, opts) {
    b = b || cur(); report = report || {}; opts = opts || {};
    ['created', 'refreshed', 'kept'].forEach(function (k) { report[k] = report[k] || 0; });
    var nu = P.entries(b);
    if (!nu.length) return report;
    elements(b).forEach(function (el, i) {
      var r = ART.bySubject('efx_', 'element', el.key, b);
      if (r && P.isKept(r)) { report.kept++; return; }
      var pe = E.element(el.color, nu), st = P.elementStyle(el, i);
      if (r) { r.palette = pe.palette; r.flash = pe.flash; r.tint = pe.tint; report.refreshed++; return; }
      r = ART.envelope('efx_', (el.label || el.key) + ' effect', { kind: 'element', ref: el.key }, 'procedural', H('efx|' + el.key), {
        palette: pe.palette, flash: pe.flash, tint: pe.tint,
        particle: { shape: st.shape, count: 12, life: 420, gravity: st.shape === 'flake' || st.shape === 'shard' ? 0.4 : st.shape === 'spark' ? -0.2 : 0, spread: 1, speed: 1 },
        screen: st.screen
      });
      ART.records.put(r, b);
      report.created++;
    });
    return report;
  };
  P.SHAPES = SHAPES;
  P.SCREENS = ['none', 'wave', 'shake', 'darken'];

  // Which records use each master index (for the editor and for safe edits).
  P.usage = function (b) {
    b = b || cur();
    var n = P.entries(b).length, out = [];
    for (var i = 0; i < n; i++) out.push([]);
    function hit(i, id) { if (typeof i === 'number' && out[i] && out[i].indexOf(id) < 0) out[i].push(id); }
    P.locals(b).concat(P.tiers(b)).forEach(function (r) { (r.slots || []).forEach(function (s) { hit(s, r.id); }); });
    P.effects(b).forEach(function (r) { (r.palette || []).forEach(function (s) { hit(s, r.id); }); hit(r.flash, r.id); hit(r.tint, r.id); });
    return out;
  };

  // ---------------------------------------------------------------- Quick Build
  // Every phase registers a step. Quick Build creates what is missing and refreshes generated records; records with origin
  // user or claude are never touched. It needs no API key.
  var steps = [];
  ART.quickBuild = {
    register: function (s) { steps.push(s); steps.sort(function (a, b) { return a.order - b.order; }); },
    steps: function () { return steps.map(function (s) { return { key: s.key, label: s.label, order: s.order }; }); },
    run: function (b, opts) {
      b = b || cur(); opts = opts || {};
      var t0 = performance.now(), rep = { created: 0, refreshed: 0, kept: 0, steps: {} };
      ART.ensure(b); ART.registerCodex(b);
      ART.batching = true;
      try {
        steps.forEach(function (s) {
          var r = { created: 0, refreshed: 0, kept: 0 }, t = performance.now();
          s.run(b, r, opts);
          r.ms = Math.round(performance.now() - t);
          rep.steps[s.key] = r;
          rep.created += r.created; rep.refreshed += r.refreshed; rep.kept += r.kept;
        });
      } finally { ART.batching = false; }
      rep.ms = Math.round(performance.now() - t0);
      Kit.index.invalidate();
      if (b === cur()) Kit.bundle.touch('quick-build');
      return rep;
    }
  };
  ART.quickBuild.register({ key: 'palette', label: 'Palettes', order: 10, run: function (b, r) {
    P.buildMaster(b, {}, r);
    P.buildLocals(b, r);
    P.buildTiers(b, r);
    P.buildElements(b, r);
  } });

  // ---------------------------------------------------------------- validation
  Kit.validate.register('art.palette', function (b, ctx) {
    var recs = b.art && U.isObj(b.art.records) ? b.art.records : {};
    var pals = U.isObj(recs.pal_) ? Object.keys(recs.pal_).map(function (k) { return recs.pal_[k]; }).filter(U.isObj) : [];
    var masters = pals.filter(function (r) { return r.kind === 'master'; });
    var m = masters[0], n = m && Array.isArray(m.entries) ? m.entries.length : 0, want = E.size(b.charter);
    if (masters.length > 1) masters.slice(1).forEach(function (r) { ctx.add({ recordId: r.id, fieldPath: 'kind', message: 'A second master palette. Only ' + masters[0].id + ' is used.', level: 'warning' }); });
    if (!m && pals.length) ctx.add({ recordId: pals[0].id, fieldPath: 'kind', message: 'Palettes exist but there is no master palette. Run Quick Build.', level: 'error' });
    if (m) {
      if (!Array.isArray(m.entries)) ctx.add({ recordId: m.id, fieldPath: 'entries', message: 'The master palette has no entries.', level: 'error' });
      else {
        m.entries.forEach(function (h, i) { if (!C.normHex(h) || C.normHex(h) !== h) ctx.add({ recordId: m.id, fieldPath: 'entries.' + i, message: 'Entry ' + i + ' is not a #rrggbb color.', level: 'error' }); });
        if (n !== want) ctx.add({ recordId: m.id, fieldPath: 'entries', message: 'The master palette has ' + n + ' colors but the Charter asks for ' + want + '. Regenerate it on the Palette tab.', level: 'warning' });
      }
    }
    function idxOk(v) { return typeof v === 'number' && v === Math.floor(v) && v >= 0 && v < n; }
    pals.forEach(function (r) {
      if (r.kind === 'local' || r.kind === 'tier') {
        var s = r.slots;
        if (!Array.isArray(s) || s.length < 2 || s.length > 32) { ctx.add({ recordId: r.id, fieldPath: 'slots', message: 'Slots must be a list of 2 to 32 master indices.', level: 'error' }); return; }
        if (s[0] !== null) ctx.add({ recordId: r.id, fieldPath: 'slots.0', message: 'Slot 0 is transparent and must be empty.', level: 'error' });
        s.forEach(function (v, i) { if (i && !idxOk(v)) ctx.add({ recordId: r.id, fieldPath: 'slots.' + i, message: 'Slot ' + i + ' points outside the master palette.', level: 'error' }); });
        if (r.kind === 'tier' && r.collapsed) ctx.add({ recordId: r.id, fieldPath: 'slots', message: 'This tier palette is identical to a sibling tier at this palette size.', level: 'warning' });
      } else if (r.kind !== 'master') ctx.add({ recordId: r.id, fieldPath: 'kind', message: 'Palette kind must be master, local, or tier.', level: 'error' });
      var sj = r.subject;
      if (sj && (sj.kind === 'chr' || sj.kind === 'fam')) {
        var p = sj.kind + '_';
        if (!(b.rules && U.isObj(b.rules[p]) && b.rules[p][sj.ref])) ctx.add({ recordId: r.id, fieldPath: 'subject.ref', message: 'This palette belongs to ' + sj.ref + ', which no longer exists.', level: 'warning' });
      }
    });
    var keys = {};
    elements(b).forEach(function (e) { keys[e.key] = 1; });
    var fx = U.isObj(recs.efx_) ? Object.keys(recs.efx_).map(function (k) { return recs.efx_[k]; }).filter(U.isObj) : [];
    fx.forEach(function (r) {
      if (r.subject && r.subject.kind === 'element' && !keys[r.subject.ref]) ctx.add({ recordId: r.id, fieldPath: 'subject.ref', message: 'Element ' + r.subject.ref + ' is not in the Charter.', level: 'warning' });
      if (m) {
        if (!Array.isArray(r.palette) || r.palette.length !== 4 || !r.palette.every(idxOk)) ctx.add({ recordId: r.id, fieldPath: 'palette', message: 'An effect palette is four master indices.', level: 'error' });
        if (!idxOk(r.flash) || !idxOk(r.tint)) ctx.add({ recordId: r.id, fieldPath: 'flash', message: 'Flash and tint must be master indices.', level: 'error' });
      }
    });
  });
  Kit.jump.register({
    test: function (rid) { var p = Kit.ids.prefixOf(rid); return p === 'pal_' || p === 'efx_'; },
    name: function (rid) { var r = ART.records.get(rid); return r ? r.name : rid; },
    go: function (rid) { if (!Kit.go('palette')) return false; if (ART.WS.palette && ART.WS.palette.focus) ART.WS.palette.focus(rid); return true; }
  });
})();
// === ART:PALETTE END ===
