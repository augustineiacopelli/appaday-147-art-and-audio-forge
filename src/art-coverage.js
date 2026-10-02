// === ART:COVERAGE BEGIN ===
(function () {
  'use strict';
  // Phase 8: coverage, reference validation, the export manifest, and the engine files.
  //   ART.coverage  what the bundle owes (computed from the bundle every time, never stored) and whether the art exists
  //   ART.refs      every ID an art record mentions, and which of them dangle; the art.refs validator reports the ones
  //                 no phase validator already covers
  //   ART.manifest  the forge 147 manifest {created, referenced, unresolved, forward, coverage, engines, counts}
  //   ART.engines   ENGINE:RENDER and ENGINE:AUDIO read back from this page's own script, as engine-render.js and
  //                 engine-audio.js. build.js writes the same files to the repository with the same function.
  var U = Kit.util;
  function cur() { return Kit.bundle.current(); }
  function rulesList(b, p) { var m = b && b.rules && U.isObj(b.rules[p]) ? b.rules[p] : {}; return Object.keys(m).map(function (k) { return m[k]; }).filter(U.isObj); }
  function elements(b) { var r = b && b.charter && b.charter.ruleset; return r && Array.isArray(r.elements) ? r.elements.filter(function (e) { return U.isObj(e) && e.key; }) : []; }
  function retired(b) { var st = b && b.art && b.art.settings; return st && Array.isArray(st.retired) ? st.retired : []; }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  // ================================================================ coverage
  // Each item: {key, group, label, need 'required'|'advisory', ok, detail, fix {tab, sub, id}, restore (a retired key)}.
  // Required items count toward the percentage. Advisory items are shown but never block anything: things the user
  // retired on purpose (a deleted default biome stays deleted), and the climate check Day 148 can live without.
  var COV = ART.coverage = {};
  COV.GROUPS = [
    { key: 'palette', label: 'Palettes', tab: 'palette' },
    { key: 'sprites', label: 'Sprites', tab: 'sprites' },
    { key: 'portraits', label: 'Portraits', tab: 'sprites' },
    { key: 'icons', label: 'Icons', tab: 'interface' },
    { key: 'motion', label: 'Motion', tab: 'motion' },
    { key: 'world', label: 'World art', tab: 'world' },
    { key: 'interface', label: 'Interface', tab: 'interface' },
    { key: 'sound', label: 'Sound', tab: 'sound' },
    { key: 'links', label: 'Forward fields', tab: 'export' }
  ];
  var GROUP_OF = {};
  COV.GROUPS.forEach(function (g) { GROUP_OF[g.key] = g; });
  function nameOf(rec) { return (rec && (rec.name || rec.id)) || ''; }

  COV.compute = function (b) {
    b = b || cur();
    var items = [];
    if (!b || !b.art) return summarize(items);
    var ret = retired(b);
    function add(group, key, label, rec, fix, o) {
      o = o || {};
      var it = { key: group + ':' + key, group: group, label: label, need: o.need || 'required', ok: o.ok != null ? !!o.ok : !!rec, detail: o.detail || '', fix: fix || { tab: GROUP_OF[group].tab } };
      if (rec && rec.id && !it.fix.id) it.fix.id = rec.id;
      if (o.restore) it.restore = o.restore;
      items.push(it);
      return it;
    }
    function isRetired(k) { return ret.indexOf(k) >= 0; }
    // A default the user deleted is advisory: listed with a Restore button, never counted as a gap.
    function retiredNeed(k, has) { return isRetired(k) && !has ? { need: 'advisory', restore: k, detail: 'Deleted by you. Restore brings the default back.' } : {}; }
    var P = ART.palette, S = ART.sprites, M = ART.motion, TL = ART.tiles, I = ART.iface, A = ART.audio;
    var chrs = rulesList(b, 'chr_'), fams = rulesList(b, 'fam_');

    // ---- palettes
    var master = P.master(b);
    add('palette', 'master', 'Master palette', master, { tab: 'palette', sub: 'master' }, { detail: master ? (P.entries(b).length + ' of ' + P.size(b) + ' colors') : 'Run Quick Build to build it from the Charter.' });
    chrs.forEach(function (c) { add('palette', 'chr:' + c.id, 'Colorway: ' + nameOf(c), ART.bySubject('pal_', 'chr', c.id, b), { tab: 'palette', sub: 'colorways' }); });
    var vPal = ART.bySubject('pal_', 'role', 'villain', b);
    add('palette', 'villain', 'Colorway: villain', vPal, { tab: 'palette', sub: 'colorways' }, retiredNeed('villain', vPal));
    ART.NPC_ARCHETYPES.forEach(function (k) { var r = ART.bySubject('pal_', 'role', 'npc:' + k, b); add('palette', 'npc:' + k, 'Colorway: ' + k, r, { tab: 'palette', sub: 'colorways' }, retiredNeed('npc:' + k, r)); });
    fams.forEach(function (f) { add('palette', 'fam:' + f.id, 'Tier palette: ' + nameOf(f), ART.bySubject('pal_', 'fam', f.id, b), { tab: 'palette', sub: 'tiers' }); });
    elements(b).forEach(function (e) { add('palette', 'element:' + e.key, 'Element effect: ' + (e.label || e.key), ART.bySubject('efx_', 'element', e.key, b), { tab: 'palette', sub: 'elements' }); });

    // ---- sprites and portraits
    chrs.forEach(function (c) {
      ['field', 'battle'].forEach(function (m) { add('sprites', 'chr:' + c.id + ':' + m, cap(m) + ' sprite: ' + nameOf(c), S.spriteFor(b, 'chr', c.id, m), { tab: 'sprites', sub: 'characters' }); });
      var por = ART.bySubject('por_', 'chr', c.id, b);
      add('portraits', 'chr:' + c.id, 'Portrait: ' + nameOf(c), por, { tab: 'sprites', sub: 'portraits' });
    });
    ['field', 'battle'].forEach(function (m) { var r = S.spriteFor(b, 'role', 'villain', m); add('sprites', 'villain:' + m, cap(m) + ' sprite: villain', r, { tab: 'sprites', sub: 'cast' }, retiredNeed('villain', r)); });
    var vPor = ART.bySubject('por_', 'role', 'villain', b);
    add('portraits', 'villain', 'Portrait: villain', vPor, { tab: 'sprites', sub: 'portraits' }, retiredNeed('villain', vPor));
    ART.NPC_ARCHETYPES.forEach(function (k) { var r = S.spriteFor(b, 'role', 'npc:' + k, 'field'); add('sprites', 'npc:' + k, 'NPC sprite: ' + k, r, { tab: 'sprites', sub: 'cast' }, retiredNeed('npc:' + k, r)); });
    fams.forEach(function (f) { add('sprites', 'fam:' + f.id, 'Battle sprite: ' + nameOf(f), S.spriteFor(b, 'fam', f.id, 'battle'), { tab: 'sprites', sub: 'bestiary' }); });

    // ---- icons
    S.ICON_SOURCES.forEach(function (p) {
      var kind = p.slice(0, 3);
      rulesList(b, p).forEach(function (r) { add('icons', kind + ':' + r.id, 'Icon: ' + nameOf(r), ART.bySubject('ico_', kind, r.id, b), { tab: 'interface', sub: 'icons' }); });
    });

    // ---- motion: required poses (each needs its library animation), ability animations, weather overlays
    var tax = b.art.poseTaxonomy || {}, seenAnim = {};
    M.GROUPS.forEach(function (g) {
      (Array.isArray(tax[g.key]) ? tax[g.key] : []).forEach(function (e) {
        if (!U.isObj(e) || !e.required) return;
        var ak = M.animKey(g.key, e.key);
        if (seenAnim[ak]) return;
        seenAnim[ak] = 1;
        var r = M.libAnim(b, ak);
        add('motion', 'pose:' + ak, 'Pose animation: ' + (g.key === 'field' ? 'walk' : g.label.toLowerCase() + ' ' + (e.label || e.key)), r, { tab: 'motion', sub: 'anims' },
          r ? {} : { restore: isRetired('anim:' + ak) ? 'anim:' + ak : null, detail: 'Required by the pose taxonomy.' });
      });
    });
    rulesList(b, 'abl_').forEach(function (a) {
      if (a.kind === 'passive') return;
      add('motion', 'abl:' + a.id, 'Ability animation: ' + nameOf(a), ART.bySubject('anm_', 'abl', a.id, b), { tab: 'motion', sub: 'abilities' });
    });
    rulesList(b, 'wth_').forEach(function (w) {
      var o = M.overlayFor(b, w.id);
      add('motion', 'wth:' + w.id, 'Weather overlay: ' + nameOf(w), o, { tab: 'motion', sub: 'weather' }, o && o.generic ? { detail: 'Generic overlay: the weather text matched no known kind. Edit it to make it yours.' } : {});
    });

    // ---- world art
    var biomes = TL.biomes(b), interiors = TL.interiors(b);
    add('world', 'biomes', 'At least one biome tileset', biomes[0] || null, { tab: 'world', sub: 'tilesets' }, { ok: biomes.length > 0, detail: biomes.length + ' biome' + (biomes.length === 1 ? '' : 's') });
    add('world', 'interiors', 'At least one interior set', interiors[0] || null, { tab: 'world', sub: 'interiors' }, { ok: interiors.length > 0, detail: interiors.length + ' interior set' + (interiors.length === 1 ? '' : 's') });
    TL.tilesets(b).forEach(function (t) {
      var role = t.subject && t.subject.ref, bg = TL.bgFor(b, t);
      add('world', 'bg:' + t.id, 'Battle background: ' + nameOf(t), bg, { tab: 'world', sub: 'backgrounds', id: bg ? bg.id : t.id }, retiredNeed('bg:' + role, bg));
      if (!TL.palFor(b, t)) add('world', 'pal:' + t.id, 'Tile palette: ' + nameOf(t), null, { tab: 'world', sub: t.kind === 'interior' ? 'interiors' : 'tilesets', id: t.id });
    });
    (TL.BIOMES || []).forEach(function (d) { if (isRetired('biome:' + d.key) && !TL.biome(b, d.key)) add('world', 'biome:' + d.key, 'Biome: ' + d.key, null, { tab: 'world', sub: 'tilesets' }, retiredNeed('biome:' + d.key, null)); });
    (TL.INTERIORS || []).forEach(function (d) { if (isRetired('interior:' + d.key) && !TL.interior(b, d.key)) add('world', 'interior:' + d.key, 'Interior: ' + d.key, null, { tab: 'world', sub: 'interiors' }, retiredNeed('interior:' + d.key, null)); });
    // Climate: Day 148 places a biome per cell from temperature, moisture, and elevation (five steps each). A cell no
    // biome claims falls back to the nearest, so this is advice, not a gap.
    if (biomes.length) {
      var miss = COV.climateGaps(b);
      add('world', 'climate', 'Climate cells with a matching biome', null, { tab: 'world', sub: 'tilesets' }, { need: 'advisory', ok: !miss.length,
        detail: miss.length ? (125 - miss.length) + ' of 125 cells match a biome. Unmatched, for example: ' + miss.slice(0, 3).map(function (c) { return 'temperature ' + c[0] + ', moisture ' + c[1] + ', elevation ' + c[2]; }).join('; ') + '. Day 148 uses the nearest biome there.' : 'Every combination of temperature, moisture, and elevation matches a biome.' });
    }

    // ---- interface
    I.ROLES.forEach(function (r) { var rec = I.get(b, r.key); add('interface', r.key, 'UI: ' + r.label, rec, { tab: 'interface', sub: r.key === 'font' ? 'window' : r.key }, retiredNeed('ui:' + r.key, rec)); });

    // ---- sound
    ART.musicRoles(b).filter(function (r) { return r.required; }).forEach(function (r) {
      add('sound', 'music:' + r.key, 'Music: ' + r.label, A.trackFor(b, r.key), { tab: 'sound', sub: 'score' }, isRetired('music:' + r.key) && !A.trackFor(b, r.key) ? { restore: 'music:' + r.key, detail: 'Deleted by you. A required role needs a track.' } : {});
    });
    chrs.forEach(function (c) { add('sound', 'motif:' + c.id, 'Leitmotif: ' + nameOf(c), A.motifFor(b, 'chr', c.id), { tab: 'sound', sub: 'motifs' }); });
    rulesList(b, 'abl_').forEach(function (a) { if (a.kind !== 'passive') add('sound', 'abl:' + a.id, 'Ability sound: ' + nameOf(a), A.abilitySfx(b, a.id), { tab: 'sound', sub: 'effects' }); });
    elements(b).forEach(function (e) { add('sound', 'element:' + e.key, 'Element sound: ' + (e.label || e.key), A.elementSfx(b, e.key), { tab: 'sound', sub: 'effects' }); });
    A.CUES.forEach(function (c) { var r = A.cueSfx(b, c.key); add('sound', 'cue:' + c.key, 'Cue sound: ' + c.key, r, { tab: 'sound', sub: 'effects' }, retiredNeed('sfx:' + c.key, r)); });

    // ---- forward fields: every field Quick Build would fill is still owed
    ART.links.plan(b).forEach(function (p) {
      add('links', p.recordId + '.' + p.field, 'Forward field: ' + p.recordId + ' ' + p.field, null, { tab: 'export', sub: 'references', id: p.recordId },
        { ok: false, detail: p.from ? 'Points at ' + p.from + ', which no longer exists.' : 'Empty, and ' + p.to + ' is ready to fill it.' });
    });
    return summarize(items);
  };
  function summarize(items) {
    var req = items.filter(function (i) { return i.need === 'required'; }), ok = req.filter(function (i) { return i.ok; }).length;
    var byGroup = {};
    COV.GROUPS.forEach(function (g) { byGroup[g.key] = { required: 0, covered: 0, advisory: 0 }; });
    items.forEach(function (i) { var g = byGroup[i.group]; if (i.need === 'required') { g.required++; if (i.ok) g.covered++; } else g.advisory++; });
    return {
      items: items, required: req.length, covered: ok, missing: req.length - ok,
      percent: req.length ? Math.floor(ok / req.length * 1000) / 10 : 100,
      gaps: req.filter(function (i) { return !i.ok; }), advisories: items.filter(function (i) { return i.need === 'advisory' && !i.ok; }),
      byGroup: byGroup, green: ok === req.length
    };
  }
  COV.climateGaps = function (b) {
    var bs = ART.tiles.biomes(b).filter(function (t) { return t.climate && !t.climate.feature; }), out = [];
    function inR(r, v) { return Array.isArray(r) && v >= r[0] && v <= r[1]; }
    for (var t = 0; t < 5; t++) for (var m = 0; m < 5; m++) for (var e = 0; e < 5; e++) {
      if (!bs.some(function (x) { return inR(x.climate.temp, t) && inR(x.climate.moist, m) && inR(x.climate.elev, e); })) out.push([t, m, e]);
    }
    return out;
  };
  // Opens the editor that fixes an item: the record itself when it exists, else the right sub tab of the right tab.
  COV.go = function (it) {
    var f = it && it.fix || {};
    if (f.id && (ART.records.get(f.id) || Kit.records.get(f.id)) && f.tab !== 'export') { Kit.jump(f.id); return true; }
    var ws = ART.WS && ART.WS[f.tab];
    if (ws && ws.ui && f.sub) { ws.ui.sub = f.sub; ws.ui.focus = f.id && ART.records.get(f.id) ? f.id : null; }
    if (f.tab === 'export' && COV.exportUi) { COV.exportUi.sub = f.sub || 'coverage'; }
    return Kit.go(f.tab);
  };
  // Brings a retired default back: the key leaves art.settings.retired and Quick Build recreates it.
  COV.restore = function (b, key) {
    b = b || cur();
    var r = retired(b), i = r.indexOf(key);
    if (i >= 0) r.splice(i, 1);
    var rep = ART.quickBuild.run(b);
    Kit.bundle.touch('restore');
    return rep;
  };

  // ================================================================ references
  var REFS = ART.refs = {};
  // Paths a phase validator already reports when the target is missing (proved in test/phase8.js); art.refs skips them
  // so nothing is reported twice. Anything else that dangles is broken, and blocks a Final export.
  REFS.COVERED = {
    'anm_': /^impact\.fx$/, 'ico_': /^pal$/, 'por_': /^pal$/, 'til_': /^pal$/,
    'mus_': /^(derivedFrom\.motif|instruments\.(p1|p2|tri|noise)|slots\[\d+\])$/,
    'spr_': /^(anims\..+|pal|recipe\.parts\.\w+|shares)$/,
    'uik_': /^(sfx\.\w+|bg)$/
  };
  var SKIP_TOP = { id: 1, name: 1, notes: 1, tags: 1, subject: 1 };
  var INTERIOR_REF = /^([a-z]{3}_[a-z0-9_]*[a-z0-9]):([a-z0-9_.-]+)$/;
  // scan(b) -> {refs [{from, path, id, kind 'art'|'rules'|'subject'|'priority', ok, key}], dangling, ids}
  REFS.scan = function (b) {
    b = b || cur();
    var out = [], ids = {};
    if (!b || !b.art) return { refs: out, dangling: [], ids: [] };
    var idx = Kit.index(b), els = {};
    elements(b).forEach(function (e) { els[e.key] = 1; });
    function exists(id) { return ART.PREFIXES.indexOf(Kit.ids.prefixOf(id)) >= 0 ? !!ART.records.get(id, b) : !!idx.byId[id]; }
    function note(from, path, id, kind, ok, key) { ids[id] = 1; out.push({ from: from, path: path, id: id, kind: kind, ok: ok, key: key || null }); }
    function walk(node, rec, path) {
      if (typeof node === 'string') {
        if (Kit.ids.isValid(node)) { if (node !== rec.id) note(rec.id, path, node, ART.PREFIXES.indexOf(Kit.ids.prefixOf(node)) >= 0 ? 'art' : 'rules', exists(node)); return; }
        var m = INTERIOR_REF.exec(node);
        if (m && Kit.ids.isValid(m[1]) && Kit.ids.prefixOf(m[1]) === 'til_') {
          var t = ART.records.get(m[1], b);
          note(rec.id, path, m[1], 'art', !!t && (t.tiles || []).some(function (x) { return x && x.key === m[2]; }), m[2]);
        }
        return;
      }
      if (Array.isArray(node)) { for (var i = 0; i < node.length; i++) walk(node[i], rec, path + '[' + i + ']'); return; }
      if (U.isObj(node)) Object.keys(node).forEach(function (k) { walk(node[k], rec, path ? path + '.' + k : k); });
    }
    var recs = b.art.records || {};
    Object.keys(recs).forEach(function (p) {
      Object.keys(recs[p] || {}).forEach(function (id) {
        var r = recs[p][id];
        if (!U.isObj(r)) return;
        Object.keys(r).forEach(function (k) { if (!SKIP_TOP[k]) walk(r[k], r, k); });
        var s = r.subject;
        if (U.isObj(s) && typeof s.ref === 'string' && s.ref) {
          if (s.kind === 'element') note(id, 'subject.ref', s.ref, 'subject', !!els[s.ref]);
          else if (s.kind !== 'role') note(id, 'subject.ref', s.ref, 'subject', Kit.ids.isValid(s.ref) && !!idx.byId[s.ref] && Kit.ids.prefixOf(s.ref) === s.kind + '_');
        }
      });
    });
    (Array.isArray(b.art.priority) ? b.art.priority : []).forEach(function (tid, i) { if (typeof tid === 'string') note('art', 'priority[' + i + ']', tid, 'priority', !!ART.records.get(tid, b)); });
    out.forEach(function (r) { if (r.kind === 'subject' && !Kit.ids.isValid(r.id)) delete ids[r.id]; });
    return { refs: out, dangling: out.filter(function (r) { return !r.ok; }), ids: Object.keys(ids).sort() };
  };
  // What the art.refs validator reports: dangling art IDs at paths no phase validator owns (broken), and rules IDs
  // inside an art record that no longer exist, other than the record's own subject (warning; its validator warns).
  REFS.uncovered = function (b, scan) {
    scan = scan || REFS.scan(b);
    return scan.dangling.filter(function (r) {
      if (r.kind === 'subject' || r.kind === 'priority') return false;
      var p = Kit.ids.prefixOf(r.from), re = REFS.COVERED[p];
      if (r.kind === 'art') return !(re && re.test(r.path));
      var rec = ART.records.get(r.from, b);
      return !(rec && rec.subject && rec.subject.ref === r.id);
    });
  };
  Kit.validate.register('art.refs', function (b, ctx) {
    if (!b || !b.art) return;
    REFS.uncovered(b).forEach(function (r) {
      if (r.kind === 'art') ctx.add({ recordId: r.from, fieldPath: r.path, message: 'Broken reference: ' + r.id + (r.key ? ' has no tile ' + r.key : ' does not exist') + '.', level: 'broken', id: r.id });
      else ctx.add({ recordId: r.from, fieldPath: r.path, message: r.id + ' is no longer in the rules. The art still works; this link is stale.', level: 'warning', id: r.id });
    });
  });

  // ================================================================ engines
  // The exact fence text, read from this page's script. The marker strings are built from parts so this code never
  // finds itself.
  var ENG = ART.engines = {};
  ENG.LIST = [
    { key: 'render', fence: 'RENDER', global: 'ENGINE_RENDER', file: 'engine-render.js', label: 'Render engine' },
    { key: 'audio', fence: 'AUDIO', global: 'ENGINE_AUDIO', file: 'engine-audio.js', label: 'Audio engine' }
  ];
  ENG.markers = function (fence) { return ['// === ENGINE:' + fence + ' BEGIN ===', '// === ENGINE:' + fence + ' END ===']; };
  // The fence from open marker to close marker inclusive, out of any text ('' when absent or doubled).
  ENG.cut = function (text, fence) {
    var mk = ENG.markers(fence), a = text.indexOf(mk[0]), z = text.indexOf(mk[1]);
    if (a < 0 || z < a || text.indexOf(mk[0], a + 1) >= 0) return '';
    return text.slice(a, z + mk[1].length) + '\n';
  };
  var srcCache = {};
  function pageScript() {
    if (typeof document === 'undefined') return '';
    var list = document.getElementsByTagName('script');
    for (var i = 0; i < list.length; i++) { var t = list[i].textContent || ''; if (t.indexOf(ENG.markers('RENDER')[0]) >= 0) return t; }
    return '';
  }
  ENG.source = function (key) {
    var e = ENG.LIST.filter(function (x) { return x.key === key; })[0];
    if (!e) return '';
    if (srcCache[key]) return srcCache[key];
    var s = ENG.cut(pageScript(), e.fence);
    if (s) srcCache[key] = s;
    return s;
  };
  ENG.version = function (key) {
    try { var g = key === 'render' ? ENGINE_RENDER : ENGINE_AUDIO; return g && g.version ? String(g.version) : 'unknown'; } catch (e) { return 'unknown'; }
  };
  // header(e, version, hash) is shared with build.js through the text it produces; keep the two in step.
  ENG.header = function (e, version, hash) {
    return '/* Art and Audio Forge ENGINE:' + e.fence + ', engine version ' + version + '\n' +
      (hash ? ' * Bundle hash: ' + hash + '\n' : '') +
      ' * Forge 147 (AppADay 147). Declares one global, ' + e.global + '. No dependencies; reads no host global. */\n';
  };
  ENG.file = function (key, hash) {
    var e = ENG.LIST.filter(function (x) { return x.key === key; })[0], src = ENG.source(key);
    if (!e || !src) throw new Error('The ' + key + ' engine could not be read from this page.');
    return { key: 'engine-' + key, name: e.file, text: ENG.header(e, ENG.version(key), hash) + src, mime: 'text/javascript' };
  };
  ENG.available = function () { return ENG.LIST.every(function (e) { return !!ENG.source(e.key); }); };

  // ================================================================ manifest
  ART.manifest = function (b, hash) {
    b = b || cur();
    var created = [], counts = {}, r = b.art && b.art.records || {};
    Object.keys(r).sort().forEach(function (p) { var ids = Object.keys(r[p] || {}); if (ids.length) counts[p] = ids.length; created = created.concat(ids); });
    var fw = ART.forwardRefs(b), scan = REFS.scan(b), cov = COV.compute(b), refd = {};
    scan.refs.forEach(function (x) { if (x.kind !== 'subject' || Kit.ids.isValid(x.id)) refd[x.id] = 1; });
    fw.forEach(function (f) { refd[f.id] = 1; });
    var unresolved = fw.filter(function (f) { return !f.ok; }).map(function (f) { return { id: f.id, recordId: f.recordId, field: f.field }; })
      .concat(scan.dangling.filter(function (x) { return x.kind === 'art' || x.kind === 'priority'; }).map(function (x) { return { id: x.id, recordId: x.from, field: x.path }; }));
    return {
      forge: 147, bundleHash: hash, artVersion: b.art.version, charterVersion: b.charter ? (b.charter.version || 0) : 0,
      exportedAt: (b.kit.forges && b.kit.forges['147'] && b.kit.forges['147'].exportedAt) || U.now(),
      created: created.sort(), referenced: Object.keys(refd).sort(), unresolved: unresolved,
      forward: fw.map(function (f) { return { recordId: f.recordId, field: f.field, id: f.id, ok: f.ok }; }),
      artOpened: Kit.codex.isOpened('art', b), counts: counts,
      coverage: { required: cov.required, covered: cov.covered, percent: cov.percent, gaps: cov.gaps.map(function (g) { return g.key; }), advisories: cov.advisories.map(function (g) { return g.key; }) },
      engines: ENG.LIST.map(function (e) { return { key: e.key, global: e.global, file: e.file, version: ENG.version(e.key) }; })
    };
  };
})();
// === ART:COVERAGE END ===
