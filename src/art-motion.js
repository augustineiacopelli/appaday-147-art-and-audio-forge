// === ART:MOTION BEGIN ===
(function () {
  'use strict';
  // Motion as records. The player, particles, weather, and ability playback live in ENGINE_RENDER.anim, .fx, .weather,
  // and .ability; this fence decides what each subject gets and keeps the records in step with the bundle.
  //   anm_  library animations (role anim:<key>, origin default), one ability animation per abl_ (procedural), and the
  //         three default ability animations (role ability:attack, ability:cast, ability:item)
  //   wov_  one weather overlay per wth_ (procedural), inferred from its real world description
  //   spr_  gains anims {key: anm_} where a sprite plays something other than the library (enemy deaths by rig)
  var U = Kit.util, EA = ENGINE_RENDER.anim, EW = ENGINE_RENDER.weather, ES = ENGINE_RENDER.sprite, PE = ENGINE_RENDER.palette;
  var C = ENGINE_RENDER.color, H = ENGINE_RENDER.util.hash32;
  var P = ART.palette, S = ART.sprites, M = ART.motion = {};
  function cur() { return Kit.bundle.current(); }
  function rulesList(b, p) { var m = b.rules && U.isObj(b.rules[p]) ? b.rules[p] : {}; return Object.keys(m).map(function (k) { return m[k]; }).filter(U.isObj); }
  function bump(report, k) { report[k] = (report[k] || 0) + 1; }
  var KEEP = { user: 1, claude: 1 };
  function kept(r) { return !!(r && KEEP[r.origin]); }
  M.isKept = kept;

  // ---------------------------------------------------------------- the animation library
  // Each taxonomy group maps its keys to animation keys: field poses all walk; emotes, battle party, and battle enemy
  // poses each get their own animation. Optional poses a user adds follow the same pattern.
  M.GROUPS = [
    { key: 'field', label: 'Field', prefix: null, dir: 'down' },
    { key: 'emote', label: 'Emotes', prefix: 'emote.', dir: 'down' },
    { key: 'battleParty', label: 'Battle, party', prefix: 'battle.', dir: 'left' },
    { key: 'battleEnemy', label: 'Battle, enemy', prefix: 'enemy.', dir: 'right' }
  ];
  M.animKey = function (group, poseKey) {
    if (group === 'field') return 'walk';
    var g = M.GROUPS.filter(function (x) { return x.key === group; })[0];
    return g ? g.prefix + poseKey : poseKey;
  };
  function fr(pose, ms, off, flash) { var f = { pose: pose, ms: ms }; if (off) f.off = off; if (flash) f.flash = true; return f; }
  function mk(f, type, arg) { return { f: f, type: type, arg: arg == null ? null : arg }; }
  // The pose each taxonomy entry shows in the pose library (field entries are written pose.dir).
  M.POSE_OF = {
    emote: { nod: 'nod', shake: 'shakeL', jump: 'jump', sit: 'sit', kneel: 'kneel', faint: 'ko', laugh: 'laugh' },
    battleParty: { idle: 'idle', ready: 'ready', step: 'step', attack: 'attack', cast: 'cast', item: 'item', hurt: 'hurt', kneel: 'kneel', ko: 'ko', revive: 'revive', victory: 'victory', limit: 'limit' },
    battleEnemy: { idle: 'idle', attack: 'attack', hurt: 'hurt', death: 'idle' }
  };
  M.LIBRARY = [
    { key: 'walk', label: 'Walk', group: 'field', body: { kind: 'sprite', loop: true, frames: [fr('stand', 150), fr('stepA', 150), fr('stand', 150), fr('stepB', 150)], markers: [mk(1, 'sfx', 'step'), mk(3, 'sfx', 'step')] } },
    { key: 'emote.nod', label: 'Nod', group: 'emote', body: { kind: 'sprite', loop: false, frames: [fr('stand', 120), fr('nod', 160), fr('stand', 120), fr('nod', 160), fr('stand', 200)], markers: [] } },
    { key: 'emote.shake', label: 'Shake head', group: 'emote', body: { kind: 'sprite', loop: false, frames: [fr('stand', 100), fr('shakeL', 110), fr('shakeR', 110), fr('shakeL', 110), fr('shakeR', 110), fr('stand', 150)], markers: [] } },
    { key: 'emote.jump', label: 'Jump', group: 'emote', body: { kind: 'sprite', loop: false, frames: [fr('crouch', 110), fr('jump', 80, [0, -3]), fr('jump', 120, [0, -6]), fr('jump', 80, [0, -3]), fr('crouch', 90), fr('stand', 150)], markers: [mk(1, 'sfx', 'jump')] } },
    { key: 'emote.sit', label: 'Sit', group: 'emote', body: { kind: 'sprite', loop: false, frames: [fr('stand', 120), fr('crouch', 120), fr('sit', 900)], markers: [] } },
    { key: 'emote.kneel', label: 'Kneel', group: 'emote', body: { kind: 'sprite', loop: false, frames: [fr('stand', 120), fr('crouch', 100), fr('kneel', 900)], markers: [] } },
    { key: 'emote.faint', label: 'Faint', group: 'emote', body: { kind: 'sprite', loop: false, frames: [fr('hurt', 160), fr('kneel', 260), fr('ko', 1200)], markers: [mk(2, 'sfx', 'thud'), mk(2, 'shake', 1)] } },
    { key: 'emote.laugh', label: 'Laugh', group: 'emote', body: { kind: 'sprite', loop: false, frames: [fr('laugh', 140), fr('laughB', 140), fr('laugh', 140), fr('laughB', 140), fr('laugh', 140), fr('stand', 200)], markers: [] } },
    { key: 'battle.idle', label: 'Idle', group: 'battleParty', body: { kind: 'sprite', loop: true, frames: [fr('idle', 480), fr('ready', 360)], markers: [] } },
    { key: 'battle.ready', label: 'Ready', group: 'battleParty', body: { kind: 'sprite', loop: true, frames: [fr('ready', 260), fr('ready', 260, [0, -1])], markers: [] } },
    { key: 'battle.step', label: 'Step forward', group: 'battleParty', body: { kind: 'sprite', loop: false, frames: [fr('step', 100, [2, 0]), fr('step', 100, [5, 0]), fr('ready', 150, [6, 0])], markers: [mk(0, 'sfx', 'step')] } },
    { key: 'battle.attack', label: 'Attack', group: 'battleParty', body: { kind: 'sprite', loop: false, frames: [fr('ready', 80), fr('windup', 140), fr('attack', 60, [2, 0]), fr('attack', 160, [2, 0]), fr('ready', 120)], markers: [mk(1, 'sfx', 'swing'), mk(2, 'hit')] } },
    { key: 'battle.cast', label: 'Cast', group: 'battleParty', body: { kind: 'sprite', loop: false, frames: [fr('ready', 80), fr('cast', 160), fr('cast', 260, [0, -1]), fr('ready', 120)], markers: [mk(1, 'particle', 'gather'), mk(2, 'hit')] } },
    { key: 'battle.item', label: 'Use item', group: 'battleParty', body: { kind: 'sprite', loop: false, frames: [fr('ready', 80), fr('item', 200), fr('item', 160, [0, -1]), fr('ready', 120)], markers: [mk(2, 'hit')] } },
    { key: 'battle.hurt', label: 'Hurt', group: 'battleParty', body: { kind: 'sprite', loop: false, frames: [fr('hurt', 70, [-2, 0], true), fr('hurt', 70, [-3, 0]), fr('hurt', 140, [-2, 0]), fr('idle', 100)], markers: [mk(0, 'sfx', 'hurt')] } },
    { key: 'battle.kneel', label: 'Kneel (low HP)', group: 'battleParty', body: { kind: 'sprite', loop: true, frames: [fr('kneel', 600), fr('kneel', 500, [0, 1])], markers: [] } },
    { key: 'battle.ko', label: 'KO', group: 'battleParty', body: { kind: 'sprite', loop: false, frames: [fr('kneel', 140), fr('ko', 500)], markers: [mk(1, 'sfx', 'ko')] } },
    { key: 'battle.revive', label: 'Revive', group: 'battleParty', body: { kind: 'sprite', loop: false, frames: [fr('ko', 160, null, true), fr('kneel', 220), fr('revive', 200), fr('ready', 200)], markers: [mk(0, 'particle', 'revive')] } },
    { key: 'battle.victory', label: 'Victory', group: 'battleParty', body: { kind: 'sprite', loop: true, frames: [fr('victory', 500), fr('victory', 300, [0, -2]), fr('victory', 200)], markers: [] } },
    { key: 'battle.limit', label: 'Limit', group: 'battleParty', body: { kind: 'sprite', loop: false, frames: [fr('limit', 200), fr('limit', 80, null, true), fr('attack', 80, [4, 0]), fr('attack', 200, [4, 0]), fr('ready', 160)], markers: [mk(1, 'flash'), mk(2, 'hit')] } },
    { key: 'enemy.idle', label: 'Idle', group: 'battleEnemy', body: { kind: 'sprite', loop: true, frames: [fr('idle', 340), fr('idle', 340, [0, -1])], markers: [] } },
    { key: 'enemy.attack', label: 'Attack', group: 'battleEnemy', body: { kind: 'sprite', loop: false, frames: [fr('idle', 120, [-2, 0]), fr('attack', 70, [3, 0]), fr('attack', 90, [6, 0]), fr('attack', 140, [4, 0]), fr('idle', 120)], markers: [mk(2, 'hit')] } },
    { key: 'enemy.hurt', label: 'Hurt', group: 'battleEnemy', body: { kind: 'sprite', loop: false, frames: [fr('hurt', 60, [-2, 0], true), fr('hurt', 60, [-3, 0]), fr('hurt', 60, [-2, 0], true), fr('idle', 120)], markers: [mk(0, 'sfx', 'hit')] } },
    { key: 'enemy.death', label: 'Death (scatter)', group: 'battleEnemy', body: { kind: 'death', method: 'scatter', ms: 700 } },
    { key: 'enemy.death.fade', label: 'Death (fade)', group: 'extra', body: { kind: 'death', method: 'fade', ms: 900 } },
    { key: 'enemy.death.melt', label: 'Death (melt)', group: 'extra', body: { kind: 'death', method: 'melt', ms: 900 } }
  ];
  M.DEFAULT_ABILITIES = [
    { key: 'attack', label: 'Attack', body: { kind: 'ability', caster: 'attack', travel: { type: 'none', ms: 0 }, impact: { fx: null, ms: 360, flash: false, shake: 0 }, hits: 1, markers: [] } },
    { key: 'cast', label: 'Cast', body: { kind: 'ability', caster: 'cast', travel: { type: 'projectile', ms: 260 }, impact: { fx: null, ms: 450, flash: true, shake: 0 }, hits: 1, markers: [] } },
    { key: 'item', label: 'Use item', body: { kind: 'ability', caster: 'item', travel: { type: 'rise', ms: 300 }, impact: { fx: null, ms: 420, flash: false, shake: 0 }, hits: 1, markers: [] } }
  ];
  M.anims = function (b) { return ART.records.list('anm_', b || cur()); };
  M.libAnim = function (b, key) { return ART.bySubject('anm_', 'role', 'anim:' + key, b || cur()); };
  M.defaultAbility = function (b, key) { return ART.bySubject('anm_', 'role', 'ability:' + key, b || cur()); };
  function retired(b) { ART.ensure(b); var st = b.art.settings; if (!Array.isArray(st.retired)) st.retired = []; return st.retired; }
  M.buildLibrary = function (b, report) {
    var ret = retired(b);
    M.LIBRARY.forEach(function (d) {
      if (ret.indexOf('anim:' + d.key) >= 0) return;
      if (M.libAnim(b, d.key)) { bump(report, 'kept'); return; }
      ART.records.put(ART.envelope('anm_', d.label, { kind: 'role', ref: 'anim:' + d.key }, 'default', H('anm|' + d.key), U.clone(d.body)), b);
      bump(report, 'created');
    });
    M.DEFAULT_ABILITIES.forEach(function (d) {
      if (ret.indexOf('ability:' + d.key) >= 0) return;
      if (M.defaultAbility(b, d.key)) { bump(report, 'kept'); return; }
      ART.records.put(ART.envelope('anm_', d.label + ' (default ability)', { kind: 'role', ref: 'ability:' + d.key }, 'default', H('anm|ability|' + d.key), U.clone(d.body)), b);
      bump(report, 'created');
    });
  };
  // The animation a sprite plays for a key, through the engine's lookup (sprite map, shared base, library).
  M.animFor = function (spr, key, b) { b = b || cur(); return EA.forSprite(b.art, spr, key); };

  // Enemy deaths vary by body: oozes and plants melt, floaters fade, everything else scatters.
  var DEATH_BY_RIG = { ooze: 'melt', plant: 'melt', floater: 'fade' };
  M.deathFor = function (rig) { return DEATH_BY_RIG[rig] || 'scatter'; };
  M.buildEnemyAnims = function (b, report) {
    S.sprites(b).filter(function (s) { return s.kind === 'enemy' && !s.shares; }).forEach(function (s) {
      if (kept(s)) { bump(report, 'kept'); return; }
      var m = M.deathFor(s.recipe && s.recipe.rig), lib = M.libAnim(b, m === 'scatter' ? 'enemy.death' : 'enemy.death.' + m) || M.libAnim(b, 'enemy.death');
      var want = lib ? { 'enemy.death': lib.id } : {};
      if (U.canonical(s.anims || {}) === U.canonical(want)) { bump(report, 'kept'); return; }
      s.anims = want; bump(report, 'refreshed');
    });
  };

  // ---------------------------------------------------------------- ability animations
  // What an ability looks like, from its kind, targeting, and element. Genre neutral: a caster pose, how the effect
  // travels, and the element's particles at the target.
  M.abilityLook = function (abl, fx) {
    var kind = abl.kind || 'attack', t = abl.targeting || {}, all = t.scope === 'all' || t.scope === 'row', shape = fx && fx.particle && fx.particle.shape;
    var body = { kind: 'ability', caster: 'attack', travel: { type: 'none', ms: 0 }, impact: { fx: fx ? fx.id : null, ms: 420, flash: false, shake: 0 }, hits: 1, markers: [] };
    if (kind === 'magic' || kind === 'status' || kind === 'summon') {
      body.caster = 'cast'; body.impact.flash = kind !== 'status';
      if (kind === 'summon') { body.travel = { type: 'beam', ms: 420 }; body.impact.ms = 700; body.impact.shake = 2; }
      else if (all || shape === 'bolt' || shape === 'flake') body.travel = { type: 'fall', ms: 360 };
      else if (shape === 'bubble' || shape === 'ring') body.travel = { type: 'rise', ms: 300 };
      else body.travel = { type: 'projectile', ms: 260 };
    } else if (kind === 'heal') { body.caster = 'cast'; body.travel = { type: 'rise', ms: 320 }; body.impact.ms = 520; }
    else if (kind === 'limit') { body.caster = 'limit'; body.travel = { type: 'beam', ms: 300 }; body.impact = { fx: body.impact.fx, ms: 640, flash: true, shake: 2 }; body.hits = 3; }
    else if (kind === 'enemy') { body.caster = 'attack'; body.impact.shake = 1; }
    else if (kind === 'command') { body.caster = 'item'; body.travel = { type: 'projectile', ms: 220 }; }
    if (kind === 'attack' && abl.element) body.impact.flash = true;
    return body;
  };
  M.abilityAnim = function (b, ablId) { return ART.bySubject('anm_', 'abl', ablId, b || cur()); };
  M.buildAbilities = function (b, report) {
    rulesList(b, 'abl_').forEach(function (a) {
      if (a.kind === 'passive') return;
      var fx = a.element ? ART.bySubject('efx_', 'element', a.element, b) : null, look = M.abilityLook(a, fx), r = M.abilityAnim(b, a.id);
      if (r) {
        if (kept(r)) { if (r.impact && r.impact.fx && !ART.records.get(r.impact.fx, b)) r.impact.fx = fx ? fx.id : null; bump(report, 'kept'); return; }
        var body = {}; ['kind', 'caster', 'travel', 'impact', 'hits', 'markers'].forEach(function (k) { body[k] = r[k]; });
        if (U.canonical(body) === U.canonical(look)) { bump(report, 'kept'); return; }
        Object.keys(look).forEach(function (k) { r[k] = look[k]; }); r.name = (a.name || a.id) + ' animation';
        bump(report, 'refreshed');
        return;
      }
      ART.records.put(ART.envelope('anm_', (a.name || a.id) + ' animation', { kind: 'abl', ref: a.id }, 'procedural', H('anm|' + a.id), look), b);
      bump(report, 'created');
    });
  };

  // ---------------------------------------------------------------- weather overlays
  // Inferred from each weather state's real world description (a meteorology keyword) and its name. Rules run most
  // specific first; anything unmatched gets a plainly generic overlay flagged for editing.
  function L(type, density, angle, speed, depth, hex) { return { type: type, density: density, angle: angle, speed: speed, depth: depth, hex: hex }; }
  M.WEATHER_RULES = [
    { key: 'tornado', re: /tornado|waterspout|funnel/, make: function () { return { layers: [L('streak', 0.7, 25, 1.5, 1, '#9aa6b4'), L('leaf', 0.8, 60, 2, 1, '#6a7040')], tint: ['#2a2a26', 0.3], lightning: [3000, 8000, 150] }; } },
    { key: 'thunderstorm', re: /thunder|supercell|lightning|squall line|derecho|t-?storm|cumulonimbus|mesoscale convective|electrical storm/, make: function () { return { layers: [L('streak', 0.8, 12, 1.3, 1, '#a8b8d0')], tint: ['#1c2030', 0.28], lightning: [1800, 5200, 170] }; } },
    { key: 'blizzard', re: /blizzard|whiteout|snow ?squall|ground blizzard/, make: function () { return { layers: [L('flake', 0.95, 45, 2.2, 1, '#f4f6fa'), L('band', 0.6, 0, 1.5, 1, '#e8eef6')], tint: ['#c8d4e4', 0.18] }; } },
    { key: 'freezing rain', re: /freezing rain|freezing drizzle|ice storm|glaze/, make: function () { return { layers: [L('streak', 0.55, 4, 1, 0.8, '#c8e0f0')], tint: ['#9ab0c8', 0.12] }; } },
    { key: 'hail', re: /hail|sleet|ice pellet|graupel/, make: function () { return { layers: [L('streak', 0.6, 3, 1.6, 0.5, '#e8f0f8'), L('flake', 0.3, 3, 1.4, 0.6, '#f4f6fa')], tint: ['#8a98a8', 0.1] }; } },
    { key: 'snow', re: /snow|flurr/, make: function (t) { return { layers: [L('flake', /heavy|squall|intense/.test(t) ? 0.85 : /light|flurr|dusting/.test(t) ? 0.35 : 0.55, 8, 0.9, 1, '#f4f6fa')], tint: ['#dfe6f0', 0.08] }; } },
    { key: 'drizzle', re: /drizzle/, make: function () { return { layers: [L('streak', 0.35, 3, 0.6, 0.4, '#b0c0d4')], tint: ['#8090a0', 0.1] }; } },
    { key: 'rain', re: /rain|shower|downpour|monsoon|torrential|stratiform|precip|deluge|cloudburst/, make: function (t) { var heavy = /heavy|downpour|torrential|monsoon|deluge|cloudburst|intense/.test(t), light = /light|spit|sprinkl/.test(t); return { layers: [L('streak', heavy ? 0.9 : light ? 0.4 : 0.6, 8, heavy ? 1.3 : 1, 1, '#a8bcd4')], tint: ['#404a5a', heavy ? 0.22 : 0.12] }; } },
    { key: 'dust', re: /dust|sand|haboob|sirocco|simoom|harmattan|khamsin/, make: function () { return { layers: [L('mote', 0.9, 80, 3, 1, '#c8a060'), L('band', 0.6, 0, 2, 1, '#b88a50')], tint: ['#a07840', 0.3] }; } },
    { key: 'ash', re: /ash|volcan|cinder|tephra|caldera/, make: function () { return { layers: [L('mote', 0.8, 10, 0.7, 1, '#5a5a5a'), L('mote', 0.2, 0, 0.5, 1, '#e07030')], tint: ['#3a3430', 0.3] }; } },
    { key: 'aurora', re: /aurora|northern lights|southern lights/, make: function () { return { layers: [L('band', 0.45, 0, 0.6, 1, '#60e0a0'), L('mote', 0.3, 0, 0.3, 1, '#e0f0ff')], tint: ['#102030', 0.25] }; } },
    { key: 'fog', re: /fog|mist|haze|smog|marine layer|low cloud|brume|murk/, make: function (t) { var haze = /haze|smog/.test(t), mist = /mist/.test(t) && !/fog/.test(t); return { layers: [L('band', haze ? 0.35 : mist ? 0.4 : 0.7, 0, 0.5, 1, haze ? (/smog/.test(t) ? '#9a9a7a' : '#c8b89a') : '#d8dce0')], tint: [haze ? '#b0a080' : '#c0c4c8', haze ? 0.15 : mist ? 0.14 : 0.25] }; } },
    { key: 'wind', re: /wind|gale|gust|breez|blustery|chinook|foehn|mistral|bora|santa ana/, make: function () { return { layers: [L('leaf', 0.6, 70, 2, 1, '#8a9a3a'), L('mote', 0.3, 80, 3, 1, '#d8d0b0')], tint: null }; } },
    { key: 'static', re: /static|electric|ioniz|magnetic|plasma|st\.? elmo/, make: function () { return { layers: [L('mote', 0.4, 0, 0.4, 1, '#c0e0ff'), L('bolt', 0, 0, 0, 0, '#e0f0ff')], tint: ['#182030', 0.15], lightning: [6000, 12000, 80] }; } },
    { key: 'pollen', re: /pollen|spore|petal|blossom|firefl/, make: function () { return { layers: [L('mote', 0.5, 20, 0.5, 1, '#f0e080')], tint: null }; } },
    { key: 'heat', re: /heat|hot|drought|scorch|swelter|mirage/, make: function () { return { layers: [L('band', 0.3, 0, 0.8, 1, '#f0d8a0')], tint: ['#f0c070', 0.12] }; } },
    { key: 'overcast', re: /overcast|cloudy|gloom|grey|gray|stratus|nimbostratus/, make: function () { return { layers: [L('none', 0, 0, 0, 0, null)], tint: ['#707a88', 0.18] }; } },
    { key: 'night', re: /night|dark|eclipse|starless/, make: function () { return { layers: [L('none', 0, 0, 0, 0, null)], tint: ['#101830', 0.35] }; } },
    { key: 'clear', re: /clear|fair|sunny|calm|high pressure|cloudless|bright/, make: function () { return { layers: [L('none', 0, 0, 0, 0, null)], tint: null }; } }
  ];
  // inferWeather(text) -> {keyword, generic, layers [{type, density, angle, speed, depth, hex}], tint [hex, alpha], lightning}
  M.inferWeather = function (text) {
    var t = String(text || '').toLowerCase();
    for (var i = 0; i < M.WEATHER_RULES.length; i++) {
      var rl = M.WEATHER_RULES[i];
      if (rl.re.test(t)) { var o = rl.make(t); o.keyword = rl.key; o.generic = false; return o; }
    }
    return { keyword: null, generic: true, layers: [L('mote', 0.25, 0, 0.6, 1, '#d0d0d0')], tint: null };
  };
  // Turns an inferred look into wov_ fields fitted to the master palette.
  M.weatherBody = function (look, entries) {
    function m(hex) { return hex && entries.length ? PE.nearest(entries, hex) : null; }
    var body = {
      layers: look.layers.map(function (x) { var o = { type: x.type, density: x.density, angle: x.angle, speed: x.speed, depth: x.depth }; if (x.hex) { o.hex = x.hex; o.m = m(x.hex); } return o; }),
      tint: look.tint ? { hex: look.tint[0], m: m(look.tint[0]), alpha: look.tint[1] } : null,
      lightning: look.lightning ? { every: [look.lightning[0], look.lightning[1]], flashMs: look.lightning[2], hex: '#ffffff', m: m('#ffffff') } : null,
      ambient: null, keyword: look.keyword, generic: !!look.generic
    };
    return body;
  };
  M.weatherText = function (w) { return [w.name, w.realWorld].filter(Boolean).join(' '); };
  M.overlays = function (b) { return ART.records.list('wov_', b || cur()); };
  M.overlayFor = function (b, wthId) { return ART.bySubject('wov_', 'wth', wthId, b || cur()); };
  M.buildWeather = function (b, report) {
    var ent = P.entries(b);
    rulesList(b, 'wth_').forEach(function (w) {
      var r = M.overlayFor(b, w.id), body = M.weatherBody(M.inferWeather(M.weatherText(w)), ent);
      if (r) {
        if (kept(r)) { bump(report, 'kept'); return; }
        var have = {}; Object.keys(body).forEach(function (k) { have[k] = r[k]; });
        if (U.canonical(have) === U.canonical(body)) { bump(report, 'kept'); return; }
        Object.keys(body).forEach(function (k) { r[k] = body[k]; }); r.name = (w.name || w.id) + ' overlay';
        bump(report, 'refreshed');
        return;
      }
      ART.records.put(ART.envelope('wov_', (w.name || w.id) + ' overlay', { kind: 'wth', ref: w.id }, 'procedural', H('wov|' + w.id), body), b);
      bump(report, 'created');
    });
  };
  // Master rebuild: generated overlays refit from their source colors; edited ones move to the nearest new color.
  P.onRebuild(function (b, map) {
    var ent = P.entries(b);
    M.overlays(b).forEach(function (r) {
      var parts = (r.layers || []).concat([r.tint, r.lightning]).filter(Boolean);
      parts.forEach(function (o) { if (kept(r)) { if (typeof o.m === 'number' && map[o.m] !== undefined) o.m = map[o.m]; } else if (o.hex) o.m = PE.nearest(ent, o.hex); });
    });
  });

  // ---------------------------------------------------------------- Quick Build
  ART.quickBuild.register({ key: 'motion', label: 'Animations, abilities, and weather', order: 30, run: function (b, r) {
    if (!P.master(b)) return;
    M.buildLibrary(b, r);
    M.buildEnemyAnims(b, r);
    M.buildAbilities(b, r);
    M.buildWeather(b, r);
  } });

  // ---------------------------------------------------------------- validation
  Kit.validate.register('art.motion', function (b, ctx) {
    var recs = b.art && U.isObj(b.art.records) ? b.art.records : {};
    function list(p) { return U.isObj(recs[p]) ? Object.keys(recs[p]).map(function (k) { return recs[p][k]; }).filter(U.isObj) : []; }
    function has(p, id) { return typeof id === 'string' && U.isObj(recs[p]) && !!recs[p][id]; }
    function add(id, path, msg, level) { ctx.add({ recordId: id, fieldPath: path, message: msg, level: level || 'error' }); }
    var n = P.entries(b).length, poses = Object.assign({}, ES.POSES, ES.artPoses(b.art));
    function idxOk(v) { return typeof v === 'number' && v === Math.floor(v) && v >= 0 && v < n; }
    list('anm_').forEach(function (r) {
      var kind = r.kind || 'sprite';
      if (['sprite', 'death', 'ability'].indexOf(kind) < 0) { add(r.id, 'kind', 'Animation kind must be sprite, death, or ability.'); return; }
      if (kind === 'sprite') {
        var fs = Array.isArray(r.frames) ? r.frames : null;
        if (!fs || !fs.length) { add(r.id, 'frames', 'An animation needs at least one frame.'); return; }
        fs.forEach(function (f, i) {
          if (!U.isObj(f)) { add(r.id, 'frames.' + i, 'Frame ' + (i + 1) + ' is not an object.'); return; }
          if (!poses[f.pose]) add(r.id, 'frames.' + i + '.pose', 'Frame ' + (i + 1) + ' uses an unknown pose ' + f.pose + '.', 'warning');
          if (!(Number(f.ms) > 0 && Number(f.ms) <= 10000)) add(r.id, 'frames.' + i + '.ms', 'Frame ' + (i + 1) + ' needs a duration from 1 to 10000 ms.');
          if (f.off != null && !(Array.isArray(f.off) && f.off.length === 2 && f.off.every(function (v) { return typeof v === 'number' && Math.abs(v) <= 64; }))) add(r.id, 'frames.' + i + '.off', 'An offset is two numbers within 64 pixels.');
        });
        (Array.isArray(r.markers) ? r.markers : []).forEach(function (m, i) {
          if (!U.isObj(m) || EA.MARKER_TYPES.indexOf(m.type) < 0) add(r.id, 'markers.' + i, 'Marker type must be ' + EA.MARKER_TYPES.join(', ') + '.');
          else if (!(m.f >= 0 && m.f < fs.length && m.f === Math.floor(m.f))) add(r.id, 'markers.' + i + '.f', 'Marker ' + (i + 1) + ' points at a frame that does not exist.');
        });
      } else if (kind === 'death') {
        if (EA.DEATH_METHODS.indexOf(r.method) < 0) add(r.id, 'method', 'Death method must be scatter, fade, or melt.');
        if (!(Number(r.ms) > 0 && Number(r.ms) <= 10000)) add(r.id, 'ms', 'A death needs a duration from 1 to 10000 ms.');
      } else {
        if (EA.CASTERS.indexOf(r.caster) < 0) add(r.id, 'caster', 'Caster must be attack, cast, item, or limit.');
        if (!U.isObj(r.travel) || EA.TRAVELS.indexOf(r.travel.type) < 0) add(r.id, 'travel.type', 'Travel must be none, projectile, beam, rise, or fall.');
        var fx = r.impact && r.impact.fx;
        if (fx && !has('efx_', fx)) add(r.id, 'impact.fx', 'Effect ' + fx + ' does not exist.');
        if (r.hits != null && !(r.hits >= 1 && r.hits <= 16)) add(r.id, 'hits', 'Hits run from 1 to 16.');
        (Array.isArray(r.markers) ? r.markers : []).forEach(function (m, i) { if (!U.isObj(m) || EA.MARKER_TYPES.indexOf(m.type) < 0 || !(Number(m.ms) >= 0)) add(r.id, 'markers.' + i, 'An ability marker is {ms, type} with a known type.'); });
      }
      var sj = r.subject;
      if (sj && sj.kind === 'abl' && !(b.rules && U.isObj(b.rules.abl_) && b.rules.abl_[sj.ref])) add(r.id, 'subject.ref', 'This animation belongs to ' + sj.ref + ', which no longer exists.', 'warning');
    });
    list('spr_').forEach(function (s) {
      Object.keys(U.isObj(s.anims) ? s.anims : {}).forEach(function (k) {
        if (!has('anm_', s.anims[k])) add(s.id, 'anims.' + k, 'Animation ' + s.anims[k] + ' does not exist.');
      });
    });
    list('wov_').forEach(function (r) {
      if (!Array.isArray(r.layers)) { add(r.id, 'layers', 'An overlay needs a list of layers (use type none for clear weather).'); return; }
      r.layers.forEach(function (x, i) {
        if (!U.isObj(x) || EW.TYPES.indexOf(x.type) < 0) { add(r.id, 'layers.' + i + '.type', 'Layer type must be ' + EW.TYPES.join(', ') + '.'); return; }
        if (x.type !== 'none' && x.type !== 'bolt' && !(x.density >= 0 && x.density <= 1)) add(r.id, 'layers.' + i + '.density', 'Density runs from 0 to 1.');
        if (x.m != null && n && !idxOk(x.m)) add(r.id, 'layers.' + i + '.m', 'The layer color must be a master palette index.');
      });
      if (r.tint && (!idxOk(r.tint.m) && n || !(r.tint.alpha >= 0 && r.tint.alpha <= 0.8))) add(r.id, 'tint', 'A tint is a master index and an alpha from 0 to 0.8.');
      if (r.lightning && !(Array.isArray(r.lightning.every) && r.lightning.every.length === 2 && r.lightning.every[0] > 0 && r.lightning.every[0] <= r.lightning.every[1])) add(r.id, 'lightning.every', 'Lightning needs a range [min, max] in ms with min no larger than max.');
      if (r.generic) add(r.id, 'layers', 'This overlay is a generic guess because the weather description had no known keyword. Edit it on the Motion tab.', 'warning');
      var sj = r.subject;
      if (sj && sj.kind === 'wth' && !(b.rules && U.isObj(b.rules.wth_) && b.rules.wth_[sj.ref])) add(r.id, 'subject.ref', 'This overlay belongs to ' + sj.ref + ', which no longer exists.', 'warning');
    });
  });
  function goMotion(rid) { if (!Kit.go('motion')) return false; if (ART.WS.motion && ART.WS.motion.focus) ART.WS.motion.focus(rid); return true; }
  Kit.jump.register({
    test: function (rid) { var p = Kit.ids.prefixOf(rid); return p === 'anm_' || p === 'wov_'; },
    name: function (rid) { var r = ART.records.get(rid); return r ? r.name : rid; },
    go: goMotion
  });
})();
// === ART:MOTION END ===
