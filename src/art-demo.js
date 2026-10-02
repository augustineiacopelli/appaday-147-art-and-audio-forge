// === ART:DEMO BEGIN ===
(function () {
  'use strict';
  // The demo bundle is a real Day 146 Final export (authored through Day 146's own APIs by test/make-demo.js, then exported
  // by Day 146's exporter). Fixtures are generated from it in code and are never shipped as files.
  var U = Kit.util;
  var DEMO = window.ART_DEMO = {};
  var DEMO_JSON = /*DEMO_JSON*/null;
  DEMO.bundle = function () { return U.clone(DEMO_JSON); };

  // ---------------------------------------------------------------- deterministic helpers
  function rng(seed) { var a = seed | 0; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    function hx(v) { var t = Math.round((v + m) * 255).toString(16); return t.length < 2 ? '0' + t : t; }
    return '#' + hx(r) + hx(g) + hx(b);
  }
  var ELEMENT_WORDS = ['fire', 'water', 'earth', 'air', 'light', 'shade', 'frost', 'storm', 'stone', 'bloom', 'tide', 'ember'];
  var NAMES = ['Ari', 'Bex', 'Cato', 'Dara', 'Enzo', 'Fia', 'Gale', 'Hob'];
  var FAMILIES = ['Slime', 'Wisp', 'Wolf', 'Crab', 'Moth', 'Golem', 'Bat', 'Toad', 'Hawk', 'Eel', 'Imp', 'Boar', 'Newt', 'Owl', 'Ram', 'Asp', 'Mole', 'Lynx', 'Wasp', 'Yak'];
  var SCHEMES = ['dpad', 'stick', 'tap', 'hybrid'];

  // Builds a Day 146 shaped, locked, Codex generated bundle from a spec, reusing the demo's Codex types.
  // spec: {key, title, tileSize, paletteSize, controls, res, chars, elements, families, tiers, weather:[{name, realWorld}],
  //        chapters:[label or ''], endings, emptyRules}
  DEMO.build = function (spec) {
    var b = DEMO.bundle(), R = rng(spec.seed || 147), k = spec.key.toLowerCase().replace(/[^a-z0-9]/g, '');
    var n = 0;
    function id(prefix, name) { n++; return prefix + U.slug(name, '_').slice(0, 18).replace(/_+$/, '') + '_' + k + ('000' + n.toString(36)).slice(-3); }
    b.kit.bundleId = 'bnd_fixture' + k;
    b.kit.title = spec.title;
    b.kit.forges = { '146': { status: 'final', exportedAt: b.kit.forges['146'].exportedAt, charterVersion: 1 } };
    var C = b.charter, S = C.sections;
    delete C.lockFingerprint;
    S.premise.title = spec.title;
    S.party = { members: NAMES.slice(0, spec.chars).map(function (nm) { return { name: nm, past: 'A traveler named ' + nm + '.' }; }) };
    S.chapters = spec.chapters.map(function (label, i) {
      var c = { id: id('chp_', 'chapter ' + (i + 1)), name: 'Chapter ' + (i + 1), summary: 'Chapter ' + (i + 1) + ' of the fixture.', targetMinutes: 60, charterVersion: 1 };
      if (label) c.continentLabel = label;
      return c;
    });
    S.endings = { endings: Array.apply(null, Array(spec.endings)).map(function (_, i) { return { name: 'Ending ' + (i + 1), concept: 'Fixture ending ' + (i + 1) + '.' }; }) };
    C.specs = { tileSize: spec.tileSize, resolution: spec.res || { w: 256, h: 224 }, paletteSize: spec.paletteSize, mobileControls: spec.controls };
    C.quotas.enemyFamilies = spec.families;
    var rs = C.ruleset, ek = ELEMENT_WORDS.slice(0, spec.elements);
    rs.elements = ek.map(function (key, i) { return { key: key, label: key.charAt(0).toUpperCase() + key.slice(1), color: hsl(i * 360 / Math.max(1, ek.length), 65, 52) }; });
    rs.elementRelations = [];
    for (var i = 0; i + 1 < ek.length; i += 2) rs.elementRelations.push({ a: ek[i], b: ek[i + 1], kind: 'opposed' });
    rs.taxonomy = { label: 'Type', values: ek.concat(['beast']), inverts: [] };
    b.codex.rulesetHash = U.sha256(U.canonical(rs)).slice(0, 16);
    b.codex.generatedFromCharter = C.version;
    if (spec.emptyRules) {
      b.rules = {};
      b.codex = { version: 0, generatedFromCharter: null, prefixes: {}, types: {}, modules: [] };
      b.kit.opened = ['charter'];
      b.kit.contentHash = Kit.bundle.hash(b);
      return b;
    }
    var rules = b.rules = {};
    function put(prefix, name, body) { var r = Object.assign({ id: id(prefix, name), name: name, charterVersion: 1 }, body); (rules[prefix] = rules[prefix] || {})[r.id] = r; return r; }
    var stat = function (hp, mp, s1, s2, d1, d2, sp, lu) { return { hp: hp, mp: mp, str: s1, mag: s2, def: d1, mdef: d2, spd: sp, luck: lu }; };
    var poison = put('sta_', 'Poison', { gauge: 'normal', tickEffect: { kind: 'damage', percent: 5 }, duration: 4, cure: { battleEnd: false, onHit: false, curedBy: [] } });
    put('sta_', 'Sleep', { gauge: 'freeze', tickEffect: { kind: 'none', percent: 0 }, duration: 3, cure: { battleEnd: true, onHit: true, curedBy: [] } });
    var spells = ek.map(function (e) { return put('abl_', e + ' bolt', { kind: 'magic', element: e, power: 20, cost: { mp: 4 }, targeting: { side: 'foe', scope: 'single' }, chargeTicks: 0, statusEffects: [] }); });
    var mend = put('abl_', 'Mend', { kind: 'heal', power: 30, cost: { mp: 5 }, targeting: { side: 'ally', scope: 'single' }, chargeTicks: 0, statusEffects: [] });
    put('abl_', 'Bite', { kind: 'enemy', power: 12, cost: { mp: 0 }, targeting: { side: 'foe', scope: 'single' }, chargeTicks: 0, statusEffects: [{ sta: poison.id, chance: 0.3 }] });
    put('itm_', 'Tonic', { kind: 'consumable', price: 30, effect: mend.id });
    put('itm_', 'Antidote', { kind: 'consumable', price: 20 });
    var blade = put('eqp_', 'Blade', { slot: 'weapon', weaponClass: 'blade', tier: 1, price: 100, stats: { str: 6 }, slotLayout: { count: 2, links: [[0, 1]] } });
    put('eqp_', 'Coat', { slot: 'armor', tier: 1, price: 80, stats: { def: 6 }, slotLayout: { count: 1, links: [] } });
    put('eqp_', 'Ring', { slot: 'accessory', tier: 1, price: 60, stats: { luck: 3 }, slotLayout: { count: 0, links: [] } });
    var mat = put('mat_', 'Bolt Stone', { kind: 'magic', element: ek[0], apThresholds: [100, 300], grants: [{ level: 1, abl: spells[0].id }], price: 200 });
    NAMES.slice(0, spec.chars).forEach(function (nm) {
      put('chr_', nm, { weaponClass: 'blade', baseStats: stat(100 + Math.floor(R() * 50), 20, 10, 10, 9, 9, 10, 8), growth: stat(16, 3, 1, 1, 1, 1, 1, 1), limitTree: [], relationshipHooks: [] });
    });
    var troops = [], fi;
    for (fi = 0; fi < spec.families; fi++) {
      var fname = FAMILIES[fi % FAMILIES.length] + (fi >= FAMILIES.length ? ' ' + (Math.floor(fi / FAMILIES.length) + 1) : '');
      var type = (fi % 3 === 2 || !ek.length) ? 'beast' : ek[fi % ek.length];
      var baseHue = Math.floor(R() * 360);
      for (var t = 1; t <= spec.tiers; t++) {
        var fam = put('fam_', fname + (t > 1 ? ' T' + t : ''), { type: type, palette: { base: hsl(baseHue + (t - 1) * 40, 45, 45), accent: hsl(baseHue + 180 + (t - 1) * 40, 60, 70) }, absorbsOwnType: false });
        var s = Math.pow(1.6, t - 1);
        var en = put('enm_', fname + (t > 1 ? ' T' + t : ''), { family: fam.id, tier: t, level: 2 + 6 * (t - 1), stats: stat(Math.round(40 * s), 0, Math.round(8 * s), Math.round(6 * s), Math.round(4 * s), Math.round(4 * s), 8, 4), drops: [], steal: [], gil: Math.round(8 * s), exp: Math.round(6 * s), ap: 1, isBoss: false });
        if (t === 1) troops.push(en.id);
      }
    }
    S.chapters.forEach(function (c, ci) {
      put('eps_', c.name + ' state', { chapter: c.id, targetLevel: 4 + ci * 6, gearTier: 1, gil: 200, materiaSet: [mat.id], abilities: [], targetWinRate: 80 });
    });
    troops.forEach(function (eid, ti) { put('trp_', 'Troop ' + (ti + 1), { members: [{ enm: eid, row: 'front' }], chapter: S.chapters.length ? S.chapters[ti % S.chapters.length].id : undefined, flags: { noEscape: false, preemptiveChance: 0 } }); });
    put('shp_', 'Store', { inventory: [{ item: blade.id }], chapterAvailable: S.chapters.length ? S.chapters[0].id : undefined });
    (spec.weather || []).forEach(function (w) {
      var mult = {}; ek.forEach(function (e) { mult[e] = 1; });
      put('wth_', w.name, { realWorld: w.realWorld, elementMultipliers: mult, encounterModifiers: { rate: 1, familyWeights: [] } });
    });
    b.kit.contentHash = Kit.bundle.hash(b);
    return b;
  };

  DEMO.FIXTURES = [
    { key: 'F0', purpose: 'Empty and sparse', spec: { title: 'F0 Empty', tileSize: 16, paletteSize: 64, controls: 'dpad', chars: 1, elements: 4, families: 0, tiers: 1, chapters: ['Westland'], endings: 1, emptyRules: true } },
    { key: 'F1a', purpose: 'Tiny, two colors', spec: { title: 'F1 Tiny (2 colors)', tileSize: 8, paletteSize: 2, controls: 'tap', res: { w: 160, h: 144 }, chars: 1, elements: 1, families: 1, tiers: 1, chapters: ['Isle'], endings: 1, weather: [] } },
    { key: 'F1b', purpose: 'Tiny, four colors', spec: { title: 'F1 Tiny (4 colors)', tileSize: 8, paletteSize: 4, controls: 'tap', res: { w: 160, h: 144 }, chars: 1, elements: 1, families: 1, tiers: 1, chapters: ['Isle'], endings: 1, weather: [] } },
    { key: 'F2', purpose: 'Large', spec: { title: 'F2 Large', tileSize: 32, paletteSize: 256, controls: 'stick', res: { w: 512, h: 448 }, chars: 8, elements: 12, families: 20, tiers: 5, chapters: ['North', 'South', 'East', 'West', 'Isles', 'Sky'], endings: 3, weather: [{ name: 'Clear', realWorld: 'clear sky' }, { name: 'Rain', realWorld: 'steady rain' }, { name: 'Snow', realWorld: 'light snow' }, { name: 'Storm', realWorld: 'supercell thunderstorm' }, { name: 'Fog', realWorld: 'radiation fog' }] } },
    { key: 'F3', purpose: 'Budget stress', spec: { title: 'F3 Budget stress', tileSize: 64, paletteSize: 256, controls: 'stick', res: { w: 1024, h: 896 }, chars: 8, elements: 12, families: 20, tiers: 5, chapters: ['North', 'South', 'East', 'West', 'Isles', 'Sky'], endings: 3, weather: [{ name: 'Clear', realWorld: 'clear sky' }, { name: 'Rain', realWorld: 'steady rain' }] } },
    { key: 'F4', purpose: 'Optional fields missing', spec: { title: 'F4 Sparse optionals', tileSize: 16, paletteSize: 64, controls: 'hybrid', chars: 3, elements: 4, families: 3, tiers: 2, chapters: ['', ''], endings: 0, weather: [{ name: 'Ashfall', realWorld: 'ashfall from a distant caldera' }, { name: 'Static', realWorld: 'aurora static' }, { name: 'Mana Tide', realWorld: 'the seventh moon rises' }] } }
  ].concat(SCHEMES.map(function (sc) {
    return { key: 'F5' + sc.charAt(0), purpose: 'Typical, ' + sc + ' controls', demo: true, scheme: sc };
  }));
  DEMO.fixture = function (key) {
    var f = DEMO.FIXTURES.filter(function (x) { return x.key === key; })[0];
    if (!f) throw new Error('Unknown fixture ' + key);
    if (f.demo) {
      var b = DEMO.bundle();
      b.kit.bundleId = 'bnd_fixture' + key.toLowerCase();
      b.kit.title = 'F5 Typical (' + f.scheme + ')';
      b.charter.specs.mobileControls = f.scheme;
      b.kit.contentHash = Kit.bundle.hash(b);
      return b;
    }
    return DEMO.build(Object.assign({ key: key, seed: 147 + key.length }, f.spec));
  };

  // Self test. Phase 0 runs the checks that exist today and marks the rest pending with the phase that adds them.
  DEMO.selfTest = function () {
    return DEMO.FIXTURES.map(function (f) {
      var t0 = performance.now(), b = DEMO.fixture(f.key), built = performance.now() - t0;
      var copy = U.clone(b);
      ART.ensure(copy); ART.registerCodex(copy);
      var qb = 'not run', qbMs = null, pal = null;
      if (ART.quickBuild && copy.charter && copy.charter.locked) {
        var rep = ART.quickBuild.run(copy);
        qbMs = rep.ms; qb = rep.created + ' new in ' + rep.ms + ' ms';
        var tiers = ART.palette.tiers(copy);
        pal = { master: ART.palette.entries(copy).length, want: ART.palette.size(copy), locals: ART.palette.locals(copy).length, tiers: tiers.length,
          collapsed: tiers.filter(function (t) { return t.collapsed; }).length, offset: tiers.filter(function (t) { return t.derivedFrom && (t.derivedFrom.rampOffset || t.derivedFrom.inverted); }).length,
          effects: ART.palette.effects(copy).length };
      }
      // Bake every frame the forge owns (field poses in four directions and emotes facing down, every battle pose for
      // the party, idle, attack, and hurt for enemies, every portrait expression, every icon) through the engine
      // cache, without canvases, and report time and cache memory.
      var bake = null;
      if (ART.sprites && ART.palette.master(copy)) {
        var tb = performance.now(), ER = ENGINE_RENDER, n = 0;
        var k = ER.createCache(copy.art, { size: ART.sprites.tileSize(copy), entries: ART.palette.entries(copy), budget: 64e6 });
        ART.sprites.sprites(copy).forEach(function (s) {
          if (s.mode === 'battle') (s.kind === 'enemy' ? ER.sprite.ENEMY_POSES : ER.sprite.BATTLE_POSES).forEach(function (pz) { k.sprite(s.id, pz, s.kind === 'enemy' ? 'right' : 'left'); n++; });
          else {
            ER.sprite.FIELD_POSES.forEach(function (pz) { ER.sprite.DIRS.forEach(function (d) { k.sprite(s.id, pz, d); n++; }); });
            ER.sprite.EMOTE_POSES.forEach(function (pz) { k.sprite(s.id, pz, 'down'); n++; });
          }
        });
        ART.sprites.portraits(copy).forEach(function (p) { Object.keys(ER.portrait.EXPRESSIONS).forEach(function (e) { k.portrait(p.id, e); n++; }); });
        ART.sprites.icons(copy).forEach(function (i) { k.icon(i.id); n++; });
        bake = { ms: Math.round(performance.now() - tb), frames: n, bytes: k.stats().bytes };
      }
      // Phase 3: animation library, ability animations, and weather overlays, plus a full play through of every
      // animation and overlay (frames, markers, particles) without drawing.
      var motion = null;
      if (ART.motion && ART.palette.master(copy)) {
        var tm = performance.now(), anms = ART.motion.anims(copy), ER2 = ENGINE_RENDER, steps = 0;
        anms.forEach(function (a) {
          if (a.kind === 'ability') { var pb = ER2.ability.create({ anm: a, entries: ART.palette.entries(copy), unit: 1, seed: 3 }); for (var i = 0; i < 80 && !pb.done(); i++) { pb.step(33); steps++; } }
          else { var D = ER2.anim.duration(a); for (var t2 = 0; t2 <= D; t2 += 50) { ER2.anim.frameAt(a, t2); steps++; } }
        });
        ART.motion.overlays(copy).forEach(function (o) { var st = ER2.weather.create(o, 256, 224, 5, { entries: ART.palette.entries(copy) }); for (var j = 0; j < 30; j++) { ER2.weather.step(st, 33); steps++; } });
        motion = { anims: anms.filter(function (a) { return a.kind !== 'ability'; }).length, abilities: anms.filter(function (a) { return a.kind === 'ability'; }).length,
          overlays: ART.motion.overlays(copy).length, generic: ART.motion.overlays(copy).filter(function (o) { return o.generic; }).length, steps: steps, ms: Math.round(performance.now() - tm) };
      }
      var res = Kit.validate(copy), sz = ART.size(copy);
      return {
        key: f.key, purpose: f.purpose, buildMs: Math.round(built), hashOk: Kit.bundle.hash(b) === b.kit.contentHash,
        quickBuild: qb, quickBuildMs: qbMs, palette: pal, motion: motion, coverage: 'pending (Phase 8)',
        validation: Kit.validate.summary(res), roles: ART.musicRoles(copy).filter(function (r) { return r.required; }).length,
        size: sz.total, records: Object.keys(copy.rules || {}).reduce(function (s, p) { return s + Object.keys(copy.rules[p]).length; }, 0),
        bakeMs: bake ? bake.frames + ' frames in ' + bake.ms + ' ms' : 'no master palette', cacheBytes: bake ? bake.bytes : 0, bake: bake
      };
    });
  };
})();
// === ART:DEMO END ===
