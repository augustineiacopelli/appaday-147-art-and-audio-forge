// === ART:AUDIO BEGIN ===
(function () {
  'use strict';
  // Sound as records, and the one audio player this forge owns.
  //   ins_  instruments for the four voices {wave, duty, vol, volLoop, release, vibrato, arp, pitch, noiseMode}, role
  //         ins:<key> for the default library.
  //   sfx_  sound effects {params (sfxr), category, lastMutate}. Role sfx:<cue> for the cue library the presenter and
  //         the menus fire, subject element <key> for each Charter element's spell sound, subject abl <id> for each ability.
  //   mus_  motifs {kind motif, degrees, durs, meter, mode, key, tempo, variations} with subject chr <id> or role
  //         motif:theme and motif:villain; tracks {kind track, tempo, instruments, slots, patterns, order, loop,
  //         derivedFrom {motif, variation, recipe}} with role music:<role key>, one per music role.
  // ENGINE_AUDIO plays them; this fence makes them (Quick Build), checks them (art.audio), resolves presenter cues to
  // sounds, and keeps one AudioContext that is created inside the first tap or key press.
  var U = Kit.util, EA = ENGINE_AUDIO, EM = EA.motif, H = ENGINE_RENDER.util.hash32;
  var A = ART.audio = {};
  function cur() { return Kit.bundle.current(); }
  function bump(report, k) { report[k] = (report[k] || 0) + 1; }
  var KEEP = { user: 1, claude: 1 };
  function kept(r) { return !!(r && KEEP[r.origin]); }
  A.isKept = kept;
  function retired(b) { ART.ensure(b); var st = b.art.settings; if (!Array.isArray(st.retired)) st.retired = []; return st.retired; }
  function rulesList(b, p) { var m = b.rules && U.isObj(b.rules[p]) ? b.rules[p] : {}; return Object.keys(m).sort().map(function (k) { return m[k]; }).filter(function (r) { return U.isObj(r) && r.id; }); }
  function elements(b) { var r = b.charter && b.charter.ruleset; return r && Array.isArray(r.elements) ? r.elements.filter(function (e) { return U.isObj(e) && e.key; }) : []; }
  function bundleSeed(b) { return H((b.kit && b.kit.bundleId) || 'bundle'); }
  function same(a, b) { return U.canonical(a) === U.canonical(b); }

  // ---------------------------------------------------------------- lookups
  A.instruments = function (b) { return ART.records.list('ins_', b || cur()); };
  A.sounds = function (b) { return ART.records.list('sfx_', b || cur()); };
  A.music = function (b) { return ART.records.list('mus_', b || cur()); };
  A.motifs = function (b) { return A.music(b).filter(function (r) { return r.kind === 'motif'; }); };
  A.tracks = function (b) { return A.music(b).filter(function (r) { return r.kind === 'track'; }); };
  A.insFor = function (b, key) { return ART.bySubject('ins_', 'role', 'ins:' + key, b || cur()); };
  A.cueSfx = function (b, cue) { return ART.bySubject('sfx_', 'role', 'sfx:' + cue, b || cur()); };
  A.elementSfx = function (b, key) { return ART.bySubject('sfx_', 'element', key, b || cur()); };
  A.abilitySfx = function (b, id) { return ART.bySubject('sfx_', 'abl', id, b || cur()); };
  A.motifFor = function (b, kind, ref) { return A.motifs(b || cur()).filter(function (r) { return r.subject && r.subject.kind === kind && r.subject.ref === ref; })[0] || null; };
  // The first track for a role, in ID order (the same rule ENGINE_AUDIO's playRole follows).
  A.trackFor = function (b, roleKey) {
    var list = A.tracks(b || cur()).filter(function (r) { return r.subject && r.subject.ref === 'music:' + roleKey; });
    list.sort(function (x, y) { return x.id < y.id ? -1 : x.id > y.id ? 1 : 0; });
    return list[0] || null;
  };

  // ---------------------------------------------------------------- the default instrument library
  function ins(wave, duty, vol, release, extra) { var o = { wave: wave, duty: duty, vol: vol, volLoop: null, release: release, vibrato: null, arp: [], pitch: [], noiseMode: 'long' }; return Object.assign(o, extra || {}); }
  A.INSTRUMENTS = [
    { key: 'lead', label: 'Lead', body: function () { return ins('pulse', [2], [15, 14, 13, 12, 12, 11], 8, { vibrato: { delay: 20, depth: 0.18, rate: 5.5 } }); } },
    { key: 'lead2', label: 'Thin lead', body: function () { return ins('pulse', [1], [14, 13, 12, 11, 10], 6, { vibrato: { delay: 24, depth: 0.12, rate: 6 } }); } },
    { key: 'soft', label: 'Soft pulse', body: function () { return ins('pulse', [0], [10, 9, 8, 8, 7], 10); } },
    { key: 'pluck', label: 'Pluck', body: function () { return ins('pulse', [1], [15, 12, 10, 8, 6, 5, 4, 3, 2, 1, 0], 0); } },
    { key: 'bell', label: 'Bell', body: function () { return ins('pulse', [2, 2, 1, 1, 0], [15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0], 0); } },
    { key: 'strings', label: 'Strings', body: function () { return ins('pulse', [1], [3, 5, 7, 9, 10, 11], 14, { vibrato: { delay: 30, depth: 0.1, rate: 4 } }); } },
    { key: 'brass', label: 'Brass', body: function () { return ins('pulse', [0, 1, 2], [12, 15, 14, 13, 12], 6, { pitch: [-80, -40, -15, 0] }); } },
    { key: 'harmony', label: 'Harmony', body: function () { return ins('pulse', [1], [11, 10, 9, 8, 8, 7], 4); } },
    { key: 'bass', label: 'Bass', body: function () { return ins('tri', [], [15], 2); } },
    { key: 'kick', label: 'Kick', body: function () { return ins('noise', [], [15, 13, 10, 7, 4, 2, 0], 0, { pitch: [0, -500, -900, -1200, -1400] }); } },
    { key: 'snare', label: 'Snare', body: function () { return ins('noise', [], [13, 12, 10, 8, 6, 5, 4, 3, 2, 1, 0], 0); } },
    { key: 'hat', label: 'Hat', body: function () { return ins('noise', [], [8, 5, 2, 0], 0, { noiseMode: 'short' }); } }
  ];
  function insKey(r) { var ref = r && r.subject && r.subject.ref; return typeof ref === 'string' && ref.indexOf('ins:') === 0 ? ref.slice(4) : null; }
  A.insKey = insKey;
  function buildInstruments(b, report) {
    var ret = retired(b);
    A.INSTRUMENTS.forEach(function (d) {
      if (ret.indexOf('ins:' + d.key) >= 0) return;
      if (A.insFor(b, d.key)) { bump(report, 'kept'); return; }
      ART.records.put(ART.envelope('ins_', d.label, { kind: 'role', ref: 'ins:' + d.key }, 'default', H('ins|' + d.key), d.body()), b);
      bump(report, 'created');
    });
  }
  // The ids a realized track uses, falling back past retired instruments to nothing (the engine then uses its own).
  function kit(b) { var o = {}; ['lead', 'harmony', 'bass', 'kick', 'snare', 'hat'].forEach(function (k) { var r = A.insFor(b, k); o[k] = r ? r.id : null; }); return o; }
  A.kit = kit;

  // ---------------------------------------------------------------- the sound effect library
  // Cue sounds are tuned by hand; elements and abilities derive from them.
  A.CUES = [
    { key: 'hit', label: 'Hit', cat: 'hit', p: { wave: 'noise', freq: 0.38, slide: -0.25, sustain: 0.05, decay: 0.18, punch: 0.4 } },
    { key: 'crit', label: 'Critical hit', cat: 'hit', p: { wave: 'noise', freq: 0.3, slide: -0.1, sustain: 0.12, decay: 0.35, punch: 0.7 } },
    { key: 'miss', label: 'Miss', cat: 'hit', p: { wave: 'noise', freq: 0.6, slide: -0.35, sustain: 0.02, decay: 0.12, hpf: 0.35, volume: 0.35 } },
    { key: 'swing', label: 'Swing', cat: 'hit', p: { wave: 'noise', freq: 0.7, slide: -0.3, attack: 0.05, sustain: 0.03, decay: 0.12, hpf: 0.45, volume: 0.35 } },
    { key: 'hurt', label: 'Hurt', cat: 'hit', p: { wave: 'square', freq: 0.32, slide: -0.35, sustain: 0.04, decay: 0.15, duty: 0.4 } },
    { key: 'thud', label: 'Thud', cat: 'hit', p: { wave: 'noise', freq: 0.12, sustain: 0.05, decay: 0.25, lpf: 0.5 } },
    { key: 'death', label: 'Enemy defeated', cat: 'hit', p: { wave: 'noise', freq: 0.2, slide: -0.05, sustain: 0.25, decay: 0.5, punch: 0.5, lpf: 0.7 } },
    { key: 'ko', label: 'Ally falls', cat: 'hit', p: { wave: 'square', freq: 0.4, slide: -0.3, sustain: 0.1, decay: 0.45, duty: 0.4 } },
    { key: 'cast', label: 'Cast', cat: 'magic', p: { wave: 'sine', freq: 0.25, slide: 0.12, vibDepth: 0.4, vibSpeed: 0.7, attack: 0.15, sustain: 0.2, decay: 0.25, volume: 0.4 } },
    { key: 'release', label: 'Spell release', cat: 'magic', p: { wave: 'saw', freq: 0.7, minFreq: 0.25, slide: -0.25, sustain: 0.12, decay: 0.25, duty: 0.3 } },
    { key: 'heal', label: 'Heal', cat: 'magic', p: { wave: 'square', freq: 0.35, slide: 0.18, sustain: 0.15, decay: 0.35, arpMod: 0.45, arpSpeed: 0.6, duty: 0.3 } },
    { key: 'status', label: 'Status', cat: 'magic', p: { wave: 'saw', freq: 0.3, vibDepth: 0.5, vibSpeed: 0.55, sustain: 0.25, decay: 0.3, lpf: 0.6 } },
    { key: 'status.off', label: 'Status cured', cat: 'magic', p: { wave: 'square', freq: 0.45, slide: 0.2, sustain: 0.06, decay: 0.2, duty: 0.3 } },
    { key: 'revive', label: 'Revive', cat: 'special', p: { wave: 'sine', freq: 0.3, slide: 0.2, vibDepth: 0.2, vibSpeed: 0.5, attack: 0.1, sustain: 0.3, decay: 0.4, arpMod: 0.3, arpSpeed: 0.55 } },
    { key: 'limit', label: 'Limit ready', cat: 'special', p: { wave: 'square', freq: 0.3, slide: 0.22, vibDepth: 0.3, vibSpeed: 0.6, sustain: 0.3, decay: 0.4, punch: 0.3, arpMod: 0.5, arpSpeed: 0.7 } },
    { key: 'item', label: 'Item', cat: 'item', p: { wave: 'square', freq: 0.55, sustain: 0.06, decay: 0.3, punch: 0.45, arpMod: 0.35, arpSpeed: 0.6 } },
    { key: 'step', label: 'Step', cat: 'ambient', p: { wave: 'noise', freq: 0.25, sustain: 0, decay: 0.05, lpf: 0.4, volume: 0.25 } },
    { key: 'jump', label: 'Jump', cat: 'ui', p: { wave: 'square', freq: 0.35, slide: 0.25, sustain: 0.1, decay: 0.15, duty: 0.4 } },
    { key: 'ui.move', label: 'Cursor move', cat: 'ui', p: { wave: 'square', freq: 0.55, sustain: 0.02, decay: 0.06, duty: 0.5, volume: 0.3 } },
    { key: 'ui.confirm', label: 'Confirm', cat: 'ui', p: { wave: 'square', freq: 0.5, sustain: 0.05, decay: 0.12, arpMod: 0.4, arpSpeed: 0.75, duty: 0.5, volume: 0.35 } },
    { key: 'ui.cancel', label: 'Cancel', cat: 'ui', p: { wave: 'square', freq: 0.4, slide: -0.2, sustain: 0.04, decay: 0.12, duty: 0.5, volume: 0.3 } },
    { key: 'ui.error', label: 'Error', cat: 'ui', p: { wave: 'square', freq: 0.16, sustain: 0.12, decay: 0.1, duty: 0.2, volume: 0.35 } },
    { key: 'ui.ready', label: 'Turn ready', cat: 'ui', p: { wave: 'square', freq: 0.62, sustain: 0.03, decay: 0.1, duty: 0.5, volume: 0.25 } }
  ];
  // Element spell sounds follow the element's particle shape, so two elements that share a palette still sound apart.
  var SHAPE_SOUND = {
    spark: { wave: 'noise', freq: 0.45, slide: -0.05, sustain: 0.2, decay: 0.35, punch: 0.4 },
    flake: { wave: 'sine', freq: 0.75, vibDepth: 0.3, vibSpeed: 0.8, sustain: 0.18, decay: 0.4, arpMod: 0.2, arpSpeed: 0.5 },
    bubble: { wave: 'sine', freq: 0.3, slide: 0.3, sustain: 0.1, decay: 0.2, arpMod: -0.3, arpSpeed: 0.7 },
    shard: { wave: 'square', freq: 0.5, slide: -0.4, sustain: 0.08, decay: 0.3, duty: 0.2, punch: 0.5 },
    ring: { wave: 'square', freq: 0.5, sustain: 0.12, decay: 0.45, arpMod: 0.5, arpSpeed: 0.65, duty: 0.5 },
    wisp: { wave: 'saw', freq: 0.28, vibDepth: 0.45, vibSpeed: 0.35, attack: 0.12, sustain: 0.2, decay: 0.4, lpf: 0.45 },
    bolt: { wave: 'noise', freq: 0.8, slide: -0.2, sustain: 0.06, decay: 0.3, punch: 0.8, hpf: 0.2 }
  };
  A.cueKey = function (r) { var ref = r && r.subject && r.subject.ref; return r && r.subject && r.subject.kind === 'role' && typeof ref === 'string' && ref.indexOf('sfx:') === 0 ? ref.slice(4) : null; };
  // Writes a generated sound: created when missing, refreshed when its recipe moved, kept when edited or unchanged.
  function putSound(b, report, subject, name, category, params, seed) {
    var have = ART.bySubject('sfx_', subject.kind, subject.ref, b), body = { params: EA.sfxr.normalize(params), category: category, lastMutate: null };
    if (have) {
      if (kept(have)) { bump(report, 'kept'); return have; }
      if (same(have.params, body.params) && have.category === category) { bump(report, 'kept'); return have; }
      have.params = body.params; have.category = category; bump(report, 'refreshed'); return have;
    }
    var r = ART.envelope('sfx_', name, subject, subject.kind === 'role' ? 'default' : 'procedural', seed, body);
    ART.records.put(r, b); bump(report, 'created');
    return r;
  }
  function magicKind(a) { return a && (a.kind === 'magic' || a.kind === 'heal' || a.kind === 'status' || a.kind === 'summon'); }
  A.magicKind = magicKind;
  function buildSounds(b, report) {
    var ret = retired(b);
    A.CUES.forEach(function (c) {
      if (ret.indexOf('sfx:' + c.key) >= 0) return;
      var have = A.cueSfx(b, c.key);
      if (have) { bump(report, 'kept'); return; }
      putSound(b, report, { kind: 'role', ref: 'sfx:' + c.key }, c.label, c.cat, c.p, H('sfx|' + c.key));
    });
    elements(b).forEach(function (e, i) {
      var st = ART.palette.elementStyle(e, i), base = SHAPE_SOUND[st.shape] || SHAPE_SOUND.spark;
      putSound(b, report, { kind: 'element', ref: e.key }, (e.label || e.key) + ' spell', 'magic', EA.sfxr.mutate(base, 0.12, H('el|' + e.key)), H('el|' + e.key));
    });
    rulesList(b, 'abl_').forEach(function (a) {
      if (a.kind === 'passive') return;
      var src, cat;
      if (a.element && A.elementSfx(b, a.element)) { src = A.elementSfx(b, a.element).params; cat = 'magic'; }
      else if (a.kind === 'heal') { src = A.CUES.filter(function (c) { return c.key === 'heal'; })[0].p; cat = 'magic'; }
      else if (magicKind(a)) { src = A.CUES.filter(function (c) { return c.key === 'release'; })[0].p; cat = 'magic'; }
      else { src = A.CUES.filter(function (c) { return c.key === 'swing'; })[0].p; cat = 'hit'; }
      putSound(b, report, { kind: 'abl', ref: a.id }, (a.name || a.id) + ' sound', cat, EA.sfxr.mutate(src, 0.08, H('abl|' + a.id)), H('abl|' + a.id));
    });
  }

  // ---------------------------------------------------------------- motifs
  var CHAR_MODES = ['major', 'mixolydian', 'dorian', 'lydian', 'minor'];
  var VILLAIN_MODES = ['minor', 'phrygian', 'harmonic'];
  function variations() { var o = {}; Object.keys(EM.VARIATIONS).forEach(function (k) { o[k] = U.clone(EM.VARIATIONS[k]); }); return o; }
  A.motifBody = function (seed, opts) { var m = EM.generate(seed, opts); m.kind = 'motif'; m.variations = variations(); return m; };
  function putMotif(b, report, subject, name, seed, opts) {
    var have = A.motifFor(b, subject.kind, subject.ref), body = A.motifBody(seed, opts);
    if (have) {
      if (kept(have)) { bump(report, 'kept'); return have; }
      var keys = ['degrees', 'durs', 'meter', 'mode', 'key', 'tempo'], changed = keys.some(function (k) { return have[k] !== body[k]; });
      if (!U.isObj(have.variations)) { have.variations = body.variations; changed = true; }
      keys.forEach(function (k) { have[k] = body[k]; });
      bump(report, changed ? 'refreshed' : 'kept');
      return have;
    }
    var r = ART.envelope('mus_', name, subject, 'procedural', seed, body);
    ART.records.put(r, b); bump(report, 'created');
    return r;
  }
  function buildMotifs(b, report) {
    var s = bundleSeed(b);
    putMotif(b, report, { kind: 'role', ref: 'motif:theme' }, 'Main theme', H('theme|' + s), { mode: 'major' });
    putMotif(b, report, { kind: 'role', ref: 'motif:villain' }, 'Villain theme', H('villain|' + s), { mode: VILLAIN_MODES[s % VILLAIN_MODES.length], tempo: 92 + s % 16 });
    rulesList(b, 'chr_').forEach(function (c, i) {
      var sd = H('chr|' + c.id);
      putMotif(b, report, { kind: 'chr', ref: c.id }, (c.name || c.id) + ' theme', sd, { mode: i === 0 ? 'major' : CHAR_MODES[sd % CHAR_MODES.length] });
    });
  }

  // ---------------------------------------------------------------- the role table
  // Which motif and variation scores each role. Field roles rotate through the party and move the key around the circle
  // of fourths per continent; endings cycle finale, field, sorrow.
  A.rolePlan = function (b, key) {
    var chars = rulesList(b, 'chr_'), theme = A.motifFor(b, 'role', 'motif:theme'), villain = A.motifFor(b, 'role', 'motif:villain') || theme;
    var hero = (chars[0] && A.motifFor(b, 'chr', chars[0].id)) || theme;
    if (key === 'title') return { motif: theme, variation: 'finale', recipe: { drums: 'none', tempoScale: 0.8 } };
    if (key === 'town') return { motif: theme, variation: 'field', recipe: { drums: 'none', tempoScale: 0.85, accomp: 'march', bass: 'root' } };
    if (key === 'dungeon') return { motif: villain, variation: 'sorrow', recipe: { mode: 'phrygian', accomp: 'arp', drums: 'none' } };
    if (key === 'battle') return { motif: hero, variation: 'battle', recipe: {} };
    if (key === 'boss') return { motif: villain, variation: 'battle', recipe: { mode: 'harmonic', tempoScale: 1.55, accomp: 'ostinato' } };
    if (key === 'victory') return { motif: theme, variation: 'field', recipe: { tempoScale: 1.1, drums: 'march', bass: 'walking' }, fanfare: true };
    if (key === 'defeat') return { motif: theme, variation: 'sorrow', recipe: { tempoScale: 0.55 }, loop: false };
    if (key === 'ending') return { motif: theme, variation: 'finale', recipe: {} };
    var m = /^field:(.+)$/.exec(key);
    if (m) {
      var roles = ART.musicRoles(b).filter(function (r) { return r.key.indexOf('field:') === 0; }), idx = Math.max(0, roles.map(function (r) { return r.key; }).indexOf(key));
      var who = chars.length ? A.motifFor(b, 'chr', chars[idx % chars.length].id) : null;
      var mo = who || theme;
      return { motif: mo, variation: 'field', recipe: { key: mo ? (EM.keyOf(mo.key) + idx * 5) % 12 : null } };
    }
    var e = /^ending:(\d+)$/.exec(key);
    if (e) { var n = Number(e[1]); return { motif: theme, variation: ['finale', 'field', 'sorrow'][(n - 1) % 3], recipe: { tempoScale: [0.9, 0.75, 0.6][(n - 1) % 3] } }; }
    return null;
  };
  // A four row victory: a fanfare built on the theme's key, then the theme's field variation that loops.
  var FANFARE = { degrees: "1' 1' 1' 1' 6 7 1' 7 1'", durs: '2/3 2/3 2/3 2 2 2 4/3 2/3 6', meter: 4 };
  function combine(first, then) {
    var out = U.clone(then), ren = {};
    Object.keys(first.patterns).forEach(function (k) { ren[k] = 'F' + k; out.patterns['F' + k] = first.patterns[k]; });
    out.order = first.order.map(function (row) { return row.map(function (k) { return k == null ? null : ren[k]; }); }).concat(then.order);
    out.loop = first.order.length;
    return out;
  }
  // realizeRole(b, key) -> track body or null. The same bundle always realizes the same notes.
  A.realizeRole = function (b, key) {
    var plan = A.rolePlan(b, key);
    if (!plan || !plan.motif) return null;
    var mo = plan.motif, vars = U.isObj(mo.variations) ? mo.variations : {}, recipe = Object.assign({}, EM.VARIATIONS[plan.variation] || {}, vars[plan.variation] || {}, plan.recipe || {});
    var ki = kit(b), t = EM.realize(mo, recipe, ki);
    if (plan.fanfare) {
      var fan = EM.realize(Object.assign({}, FANFARE, { key: mo.key, tempo: mo.tempo, mode: 'major' }), { rhythm: 'straight', accomp: 'pad', bass: 'root', drums: 'march', octave: 5, lead: A.insFor(b, 'brass') ? A.insFor(b, 'brass').id : null }, ki);
      t = combine(fan, t);
    }
    if (plan.loop === false) t.loop = null;
    delete t.info;
    t.derivedFrom = { motif: mo.id, variation: plan.variation, recipe: U.clone(plan.recipe || {}) };
    return t;
  };
  var TRACK_KEYS = ['tempo', 'instruments', 'slots', 'patterns', 'order', 'loop', 'derivedFrom'];
  function buildTracks(b, report) {
    var ret = retired(b);
    ART.musicRoles(b).forEach(function (role) {
      if (role.kind === 'user' || ret.indexOf('music:' + role.key) >= 0) return;
      if (!role.required && role.key === 'ending') return;
      var have = A.trackFor(b, role.key);
      if (have && kept(have)) { bump(report, 'kept'); return; }
      var body = A.realizeRole(b, role.key);
      if (!body) return;
      if (have) {
        var changed = TRACK_KEYS.some(function (k) { return !same(have[k], body[k]); });
        TRACK_KEYS.forEach(function (k) { have[k] = body[k]; });
        bump(report, changed ? 'refreshed' : 'kept');
        return;
      }
      ART.records.put(ART.envelope('mus_', role.label + ' music', { kind: 'role', ref: 'music:' + role.key }, 'procedural', H('mus|' + role.key), body), b);
      bump(report, 'created');
    });
  }
  // Re-derives one track from its motif (used by the Score view after a motif or variation edit).
  A.rederive = function (b, track) {
    var key = track && track.subject && typeof track.subject.ref === 'string' ? track.subject.ref.replace(/^music:/, '') : null, body = key ? A.realizeRole(b, key) : null;
    if (!body) return false;
    TRACK_KEYS.forEach(function (k) { track[k] = body[k]; });
    track.origin = 'procedural';
    return true;
  };
  A.build = function (b, report) { buildInstruments(b, report); buildSounds(b, report); buildMotifs(b, report); buildTracks(b, report); };
  A.retire = function (b, rec) {
    var ref = rec && rec.subject && rec.subject.kind === 'role' ? rec.subject.ref : null;
    ART.records.del(rec.id, b);
    if (ref && /^(ins|sfx|music):/.test(ref)) { var ret = retired(b); if (ret.indexOf(ref) < 0) ret.push(ref); }
  };
  A.restore = function (b, ref) { var ret = retired(b), i = ret.indexOf(ref); if (i >= 0) ret.splice(i, 1); A.build(b, {}); };

  ART.quickBuild.register({ key: 'audio', label: 'Instruments, sound effects, motifs, and a track for every music role', order: 60, run: function (b, r) { A.build(b, r); } });

  // ---------------------------------------------------------------- cues from the presenter and the menus
  // resolve(kind, id, opts, memo, b) -> {sfx: id} | {music: role} | {stop: ms} | null. memo carries the last action so a
  // spell's cast and release markers sound like the spell, and a sword's sound like a sword.
  A.resolve = function (kind, id, opts, memo, b) {
    b = b || cur(); opts = opts || {}; memo = memo || {};
    function cue(k) { var r = A.cueSfx(b, k); return r ? { sfx: r.id } : null; }
    var touchKit = ART.iface ? ART.iface.get(b, 'touch') : null, link = touchKit && U.isObj(touchKit.sfx) ? touchKit.sfx : {};
    function ui(k) { var l = link[k] && ART.records.get(link[k], b); return l ? { sfx: l.id } : cue('ui.' + k); }
    if (kind === 'music') {
      if (id === 'stop') return { stop: 400 };
      return { music: id === 'victory' || id === 'defeat' ? id : String(id) };
    }
    if (kind === 'ui') {
      if (id === 'confirm' || id === 'move' || id === 'cancel' || id === 'error') return ui(id);
      return cue('ui.' + id);
    }
    if (kind !== 'sfx') return null;
    var abl = memo.abl && b.rules && b.rules.abl_ ? b.rules.abl_[memo.abl] : null;
    if (id === 'action') { memo.abl = opts.abl || null; memo.element = opts.element || null; memo.item = false; return null; }
    if (id === 'item') { memo.abl = opts.abl || null; memo.element = null; memo.item = true; return cue('item'); }
    if (id === 'cast') { if (memo.item) return null; return magicKind(abl) || memo.element ? cue('cast') : cue('swing'); }
    if (id === 'release') {
      if (memo.item) return null;
      if (!(magicKind(abl) || memo.element)) return null;
      var own = abl ? A.abilitySfx(b, abl.id) : null, el = memo.element ? A.elementSfx(b, memo.element) : null;
      return own ? { sfx: own.id } : el ? { sfx: el.id } : cue('release');
    }
    return cue(id);
  };

  // ---------------------------------------------------------------- the player (one AudioContext, made on a gesture)
  var host = { audio: null, ctx: null, error: null, memo: {}, prefs: null, log: [] };
  var PREF_KEY = 'art147:audio';
  A.prefs = function () {
    if (host.prefs) return host.prefs;
    var p = { music: 0.7, sfx: 0.8, muted: false };
    try { var s = JSON.parse(localStorage.getItem(PREF_KEY) || 'null'); if (U.isObj(s)) { if (typeof s.music === 'number') p.music = s.music; if (typeof s.sfx === 'number') p.sfx = s.sfx; p.muted = !!s.muted; } } catch (e) { /* defaults */ }
    return (host.prefs = p);
  };
  A.setPrefs = function (o) {
    var p = A.prefs();
    Object.keys(o || {}).forEach(function (k) { if (k in p) p[k] = k === 'muted' ? !!o[k] : Math.max(0, Math.min(1, Number(o[k]) || 0)); });
    try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* the setting still applies this session */ }
    if (host.audio) host.audio.setVolume(p);
    if (A.paintButton) A.paintButton();
    return p;
  };
  A.supported = function () { return typeof window.AudioContext === 'function' || typeof window.webkitAudioContext === 'function'; };
  function coarse() { try { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; } }
  // Call from inside a pointerup, click, or keydown handler. Creates the context the first time.
  A.unlock = function () {
    if (host.audio) { host.audio.unlock(); return host.audio; }
    if (!A.supported()) { host.error = 'This browser has no Web Audio.'; return null; }
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      host.ctx = A.makeContext ? A.makeContext() : new C();
      var b = cur();
      host.audio = EA.create(host.ctx, {
        coarse: coarse(), navigator: window.navigator,
        createAudioElement: function () { return document.createElement('audio'); },
        lookaheadMs: b && b.art && b.art.settings && b.art.settings.lookaheadMs, manual: !!A.manual
      });
      host.audio.attachLifecycle(document);
      host.audio.load(b && b.art);
      host.audio.setVolume(A.prefs());
      host.audio.unlock();
      if (A.paintButton) A.paintButton();
      return host.audio;
    } catch (e) { host.error = e.message; host.audio = null; return null; }
  };
  A.player = function () { return host.audio; };
  A.error = function () { return host.error; };
  A.reload = function () { var b = cur(); if (host.audio && b) host.audio.load(b.art); };
  function note(s) { host.log.push(s); if (host.log.length > 12) host.log.shift(); }
  A.log = function () { return host.log.slice(); };
  // cue(kind, id, opts): the presenter's callback. Plays nothing until the context exists.
  A.cue = function (kind, id, opts) {
    var r = A.resolve(kind, id, opts, host.memo);
    if (!r) return null;
    note(kind + ':' + id + (r.sfx ? '=' + r.sfx : r.music ? '>' + r.music : r.stop != null ? ' stop' : ''));
    var au = host.audio;
    if (!au) return r;
    if (r.sfx) au.playSfx(r.sfx);
    else if (r.music) au.playRole(r.music, { restart: true });
    else if (r.stop != null) au.stop(r.stop);
    return r;
  };
  A.playRole = function (key, o) { var au = host.audio || A.unlock(); return au ? au.playRole(key, o) : false; };
  A.playTrack = function (idOrTrack, o) { var au = host.audio || A.unlock(); return au ? au.playTrack(idOrTrack, o) : false; };
  A.playSfx = function (idOrParams, o) { var au = host.audio || A.unlock(); return au ? au.playSfx(idOrParams, o) : false; };
  A.stop = function (ms) { if (host.audio) host.audio.stop(ms == null ? 300 : ms); };
  A.state = function () { return host.audio ? host.audio.state() : null; };
  // A single note on an instrument, through a one row track (the instrument editor's keyboard).
  A.playNote = function (insRec, midi, chan) {
    var au = host.audio || A.unlock();
    if (!au || !insRec) return false;
    var ch = chan || (insRec.wave === 'tri' ? 'tri' : insRec.wave === 'noise' ? 'noise' : 'p1');
    var t = { kind: 'track', tempo: 120, instruments: {}, slots: [], patterns: { N: EA.mml.serialize([{ t: 0, d: 48, n: midi, v: 13, i: null }]) }, order: [[null, null, null, null]], loop: null };
    t.order[0][EA.CHANNELS.indexOf(ch)] = 'N';
    t.instruments[ch] = insRec.id;
    return au.playTrack(t, { crossfadeMs: 30 });
  };
  // Unlock on the first gesture anywhere, so the first cue already has a context.
  function firstGesture() { A.unlock(); document.removeEventListener('pointerup', firstGesture, true); document.removeEventListener('keydown', firstGesture, true); }
  if (typeof document !== 'undefined') { document.addEventListener('pointerup', firstGesture, true); document.addEventListener('keydown', firstGesture, true); }
  Kit.on('load', function () { host.memo = {}; if (host.audio) { host.audio.stop(0); A.reload(); } });
  Kit.on('change', U.debounce(A.reload, 300));

  // ---------------------------------------------------------------- icons (KIT:CORE has none for sound)
  var ICONS = {
    play: '<path d="M7 5v14l12-7z"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
    note: '<path d="M9 18V5l10-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="15" r="1.2"/><circle cx="15" cy="9" r="1.2"/><circle cx="9" cy="15" r="1.2"/>'
  };
  A.icon = function (name) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>'; };

  // ---------------------------------------------------------------- validation
  var CUE_KEYS = A.CUES.map(function (c) { return c.key; });
  Kit.validate.register('art.audio', function (b, ctx) {
    var R = b.art && U.isObj(b.art.records) ? b.art.records : {};
    function add(id, path, msg, level) { ctx.add({ recordId: id, fieldPath: path, message: msg, level: level || 'error' }); }
    function intArr(r, key, lo, hi, label) {
      var a = r[key];
      if (a == null) return;
      if (!Array.isArray(a) || a.length > 256 || a.some(function (x) { return typeof x !== 'number' || x !== Math.floor(x) || x < lo || x > hi; })) add(r.id, key, label + ' is a list of up to 256 whole numbers from ' + lo + ' to ' + hi + '.');
    }
    var insM = U.isObj(R.ins_) ? R.ins_ : {}, seenIns = {};
    Object.keys(insM).forEach(function (id) {
      var r = insM[id];
      if (!U.isObj(r)) return;
      if (EA.WAVES.indexOf(r.wave) < 0) add(r.id, 'wave', 'Wave must be pulse, tri, or noise.');
      intArr(r, 'duty', 0, 3, 'The duty sequence'); intArr(r, 'vol', 0, 15, 'The volume table'); intArr(r, 'arp', -48, 48, 'The arpeggio table'); intArr(r, 'pitch', -4800, 4800, 'The pitch table');
      if (Array.isArray(r.vol) && !r.vol.length) add(r.id, 'vol', 'The volume table needs at least one step.');
      if (r.volLoop != null && !(Array.isArray(r.vol) && r.volLoop >= 0 && r.volLoop < r.vol.length && r.volLoop === Math.floor(r.volLoop))) add(r.id, 'volLoop', 'The loop point must be a step of the volume table, or empty.');
      if (!(r.release >= 0 && r.release <= 240)) add(r.id, 'release', 'Release runs from 0 to 240 frames.');
      if (r.vibrato != null && !(U.isObj(r.vibrato) && r.vibrato.delay >= 0 && r.vibrato.delay <= 600 && r.vibrato.depth >= 0 && r.vibrato.depth <= 2 && r.vibrato.rate > 0 && r.vibrato.rate <= 20)) add(r.id, 'vibrato', 'Vibrato is {delay 0 to 600 frames, depth 0 to 2 semitones, rate up to 20 Hz}.');
      if (r.noiseMode != null && ['long', 'short'].indexOf(r.noiseMode) < 0) add(r.id, 'noiseMode', 'Noise mode is long or short.');
      var k = insKey(r); if (k) { if (seenIns[k]) add(r.id, 'subject.ref', 'There is already an instrument for ins:' + k + ' (' + seenIns[k] + ').', 'warning'); else seenIns[k] = r.id; }
    });
    var sfxM = U.isObj(R.sfx_) ? R.sfx_ : {};
    Object.keys(sfxM).forEach(function (id) {
      var r = sfxM[id];
      if (!U.isObj(r)) return;
      if (EA.sfxr.CATEGORIES.indexOf(r.category) < 0) add(r.id, 'category', 'Category must be ' + EA.sfxr.CATEGORIES.join(', ') + '.');
      if (!U.isObj(r.params)) { add(r.id, 'params', 'A sound needs its sfxr parameters.'); return; }
      if (EA.sfxr.WAVES.indexOf(r.params.wave) < 0) add(r.id, 'params.wave', 'Wave must be square, saw, sine, or noise.');
      EA.sfxr.PARAMS.forEach(function (d) { var v = r.params[d.key]; if (v != null && !(typeof v === 'number' && v >= d.min && v <= d.max)) add(r.id, 'params.' + d.key, d.label + ' runs from ' + d.min + ' to ' + d.max + '.'); });
      var sj = r.subject || {};
      if (sj.kind === 'abl' && !(b.rules && b.rules.abl_ && b.rules.abl_[sj.ref])) add(r.id, 'subject.ref', 'Ability ' + sj.ref + ' no longer exists.', 'warning');
      if (sj.kind === 'element' && !elements(b).some(function (e) { return e.key === sj.ref; })) add(r.id, 'subject.ref', 'Element ' + sj.ref + ' is not in the Charter.', 'warning');
      var ck = A.cueKey(r); if (ck && CUE_KEYS.indexOf(ck) < 0) add(r.id, 'subject.ref', 'No cue is named ' + ck + '; nothing plays this sound.', 'warning');
    });
    var musM = U.isObj(R.mus_) ? R.mus_ : {}, roleKeys = ART.musicRoles(b).map(function (r) { return r.key; }), seenRole = {};
    Object.keys(musM).forEach(function (id) {
      var r = musM[id];
      if (!U.isObj(r)) return;
      if (r.kind === 'motif') {
        var pd = EM.parseDegrees(r.degrees), pr = EM.parseDurs(r.durs);
        if (!pd.tokens.length) add(r.id, 'degrees', 'A motif needs at least one scale degree.');
        pd.errors.slice(0, 3).forEach(function (e) { add(r.id, 'degrees', e.message); });
        pr.errors.slice(0, 3).forEach(function (e) { add(r.id, 'durs', e.message); });
        if (pd.tokens.length !== pr.durs.length) add(r.id, 'durs', 'There are ' + pd.tokens.length + ' degrees and ' + pr.durs.length + ' durations; the extra ones are ignored.', 'warning');
        if (!(r.meter >= 2 && r.meter <= 7)) add(r.id, 'meter', 'Meter runs from 2 to 7 beats.');
        if (!EM.MODES[r.mode]) add(r.id, 'mode', 'Mode must be ' + Object.keys(EM.MODES).join(', ') + '.');
        if (!(r.tempo >= 40 && r.tempo <= 300)) add(r.id, 'tempo', 'Tempo runs from 40 to 300.');
        Object.keys(U.isObj(r.variations) ? r.variations : {}).forEach(function (vk) {
          var v = r.variations[vk];
          if (!U.isObj(v)) { add(r.id, 'variations.' + vk, 'A variation is a recipe object.'); return; }
          if (v.mode != null && !EM.MODES[v.mode]) add(r.id, 'variations.' + vk + '.mode', 'Unknown mode ' + v.mode + '.');
          if (v.rhythm != null && EM.RHYTHMS.indexOf(v.rhythm) < 0) add(r.id, 'variations.' + vk + '.rhythm', 'Rhythm must be ' + EM.RHYTHMS.join(', ') + '.');
          if (v.accomp != null && EM.ACCOMP.indexOf(v.accomp) < 0) add(r.id, 'variations.' + vk + '.accomp', 'Accompaniment must be ' + EM.ACCOMP.join(', ') + '.');
          if (v.bass != null && EM.BASS.indexOf(v.bass) < 0) add(r.id, 'variations.' + vk + '.bass', 'Bass must be ' + EM.BASS.join(', ') + '.');
          if (v.drums != null && EM.DRUMS.indexOf(v.drums) < 0) add(r.id, 'variations.' + vk + '.drums', 'Drums must be ' + EM.DRUMS.join(', ') + '.');
          if (v.tempoScale != null && !(v.tempoScale >= 0.25 && v.tempoScale <= 4)) add(r.id, 'variations.' + vk + '.tempoScale', 'Tempo scale runs from 0.25 to 4.');
          if (v.lead && !insM[v.lead]) add(r.id, 'variations.' + vk + '.lead', 'Instrument ' + v.lead + ' does not exist.');
        });
        var sj2 = r.subject || {};
        if (sj2.kind === 'chr' && !(b.rules && b.rules.chr_ && b.rules.chr_[sj2.ref])) add(r.id, 'subject.ref', 'Character ' + sj2.ref + ' no longer exists.', 'warning');
      } else if (r.kind === 'track') {
        if (!(r.tempo >= 40 && r.tempo <= 300)) add(r.id, 'tempo', 'Tempo runs from 40 to 300.');
        var c = EA.track.compile(r);
        c.errors.slice(0, 5).forEach(function (e) { add(r.id, 'patterns.' + e.pattern, (e.pos ? 'At ' + e.pos + ': ' : '') + e.message); });
        if (!Array.isArray(r.order) || !r.order.length) add(r.id, 'order', 'The order list needs at least one row.');
        else r.order.forEach(function (row, i) { if (!Array.isArray(row) || row.length !== 4) add(r.id, 'order.' + i, 'Each row names four patterns (pulse 1, pulse 2, triangle, noise); use empty for silence.'); });
        if (r.loop != null && !(Array.isArray(r.order) && r.loop >= 0 && r.loop < r.order.length && r.loop === Math.floor(r.loop))) add(r.id, 'loop', 'The loop point must be a row of the order list, or empty for no loop.');
        EA.CHANNELS.forEach(function (ch) {
          var iid = U.isObj(r.instruments) ? r.instruments[ch] : null;
          if (!iid) return;
          if (!insM[iid]) add(r.id, 'instruments.' + ch, 'Instrument ' + iid + ' does not exist.');
          else { var want = ch === 'tri' ? 'tri' : ch === 'noise' ? 'noise' : 'pulse'; if (insM[iid].wave !== want) add(r.id, 'instruments.' + ch, 'This ' + insM[iid].wave + ' instrument plays as ' + want + ' on this channel.', 'warning'); }
        });
        (Array.isArray(r.slots) ? r.slots : []).forEach(function (sid, i) { if (sid && !insM[sid]) add(r.id, 'slots.' + i, 'Instrument ' + sid + ' does not exist.'); });
        var ref = r.subject && r.subject.ref, rk = typeof ref === 'string' && ref.indexOf('music:') === 0 ? ref.slice(6) : null;
        if (!rk) add(r.id, 'subject.ref', 'A track needs a role such as music:battle.', 'warning');
        else {
          if (roleKeys.indexOf(rk) < 0) add(r.id, 'subject.ref', 'No music role is named ' + rk + '; add it in Score by role or pick another.', 'warning');
          if (seenRole[rk]) add(r.id, 'subject.ref', 'Role ' + rk + ' already has a track; the one with the lower ID plays.', 'warning'); else seenRole[rk] = r.id;
        }
        if (r.derivedFrom && r.derivedFrom.motif && !musM[r.derivedFrom.motif]) add(r.id, 'derivedFrom.motif', 'Motif ' + r.derivedFrom.motif + ' no longer exists.', 'warning');
      } else add(r.id, 'kind', 'Music is kind motif or track.');
    });
  });
  function goSound(rid) { if (!Kit.go('sound')) return false; if (ART.WS.sound && ART.WS.sound.focus) ART.WS.sound.focus(rid); return true; }
  Kit.jump.register({
    test: function (rid) { var p = Kit.ids.prefixOf(rid); return p === 'ins_' || p === 'sfx_' || p === 'mus_'; },
    name: function (rid) { var r = ART.records.get(rid); return r ? r.name : rid; },
    go: goSound
  });
})();
// === ART:AUDIO END ===
