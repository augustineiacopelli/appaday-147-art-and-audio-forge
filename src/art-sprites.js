// === ART:SPRITES BEGIN ===
(function () {
  'use strict';
  // Sprites, parts, portraits, and icons as records. The composer lives in ENGINE_RENDER.sprite, .portrait, and .icon;
  // this fence decides what each subject gets and keeps the records in step with the bundle.
  //   prt_  part library: {layer, rig, lib, gen: {shape, params}} or {layer, rig, px: {base, variants}}
  //   spr_  {kind: character|villain|npc|enemy, mode: field|battle, recipe | shares, pal, overrides}
  //   por_  {size, recipe: {head, hair, mouth, collar, accent}, pal, expressions, overrides}
  //   ico_  {size, gen: {glyph, tint}, pal, tintRamp, px}
  var U = Kit.util, ES = ENGINE_RENDER.sprite, EP = ENGINE_RENDER.portrait, EI = ENGINE_RENDER.icon, EC = ENGINE_RENDER.codec;
  var C = ENGINE_RENDER.color, PE = ENGINE_RENDER.palette, H = ENGINE_RENDER.util.hash32, rng = ENGINE_RENDER.util.rng;
  var P = ART.palette, S = ART.sprites = {};
  S.KINDS = ['character', 'villain', 'npc', 'enemy'];
  S.MODES = ['field', 'battle'];
  function cur() { return Kit.bundle.current(); }
  function rulesList(b, p) { var m = b.rules && U.isObj(b.rules[p]) ? b.rules[p] : {}; return Object.keys(m).map(function (k) { return m[k]; }).filter(U.isObj); }
  function bundleSeed(b) { return H((b.kit && b.kit.bundleId) || 'bundle'); }
  function bump(report, k) { report[k] = (report[k] || 0) + 1; }
  S.tileSize = function (b) { b = b || cur(); var n = b && b.charter && b.charter.specs ? Math.round(Number(b.charter.specs.tileSize)) : NaN; return isFinite(n) ? Math.max(4, Math.min(128, n)) : 16; };

  // Defaults the user deleted stay deleted: Quick Build skips any library key or role listed here.
  function retired(b) { ART.ensure(b); var st = b.art.settings; if (!Array.isArray(st.retired)) st.retired = []; return st.retired; }
  S.retire = function (b, key) { var r = retired(b); if (r.indexOf(key) < 0) r.push(key); };
  S.unretire = function (b, key) { var r = retired(b), i = r.indexOf(key); if (i >= 0) r.splice(i, 1); };

  // ---------------------------------------------------------------- parts
  S.parts = function (b) { return ART.records.list('prt_', b || cur()); };
  S.partByLib = function (b, key) { return S.parts(b).filter(function (p) { return p.lib === key; })[0] || null; };
  S.buildParts = function (b, report) {
    var ret = retired(b);
    ES.LIBRARY.forEach(function (d) {
      if (ret.indexOf(d.key) >= 0) return;
      if (S.partByLib(b, d.key)) { bump(report, 'kept'); return; }
      ART.records.put(ART.envelope('prt_', d.label, { kind: 'role', ref: 'part:' + d.key }, 'default', H('prt|' + d.key), { layer: d.layer, rig: d.rig, lib: d.key, gen: U.clone(d.gen) }), b);
      bump(report, 'created');
    });
  };
  // The part a recipe should use for a library key, or the first part on that layer and rig if the default is gone.
  function partId(b, key) {
    var p = S.partByLib(b, key);
    if (p) return p.id;
    var d = ES.LIBRARY.filter(function (x) { return x.key === key; })[0];
    var alt = d ? S.parts(b).filter(function (x) { return x.layer === d.layer && x.rig === d.rig; })[0] : null;
    return alt ? alt.id : null;
  }

  // ---------------------------------------------------------------- recipes from the bundle
  var WEAPON = [
    [/staff|rod|wand|cane|scepter|stave/, 'staff'], [/shield|buckler|aegis/, 'shield'], [/hammer|tool|wrench|axe|pick|mace|club/, 'tool'],
    [/bow|gun|rifle|pistol|sling|crossbow|device|launcher|cannon|dart|thrown|whip/, 'device'], [/claw|fist|glove|knuckle|unarmed|bare|martial/, 'bare'],
    [/blade|sword|knife|dagger|katana|saber|sabre|rapier|spear|lance|scythe/, 'blade']
  ];
  S.frontFor = function (weaponClass) {
    var t = String(weaponClass || '').toLowerCase();
    for (var i = 0; i < WEAPON.length; i++) if (WEAPON[i][0].test(t)) return WEAPON[i][1];
    return t ? 'blade' : 'bare';
  };
  // A character's look from its stats and weapon class, varied by its seed. Same bundle, same look.
  S.characterLook = function (chr, seed) {
    var r = rng(seed), st = chr.baseStats || {}, n = function (k) { return Number(st[k]) || 0; };
    var phys = n('str') + n('def'), mag = n('mag') + n('mdef'), spd = n('spd') * 2;
    var lead = mag > phys && mag >= spd ? 'mag' : spd > phys ? 'spd' : 'phys';
    var tough = n('def') >= n('spd') && n('hp') >= 140;
    var body = tough ? 'broad' : lead === 'mag' ? (r() < 0.6 ? 'slight' : 'tall') : lead === 'spd' ? (r() < 0.7 ? 'average' : 'slight') : (r() < 0.5 ? 'average' : 'tall');
    var torso = lead === 'mag' ? (r() < 0.7 ? 'robe' : 'coat') : tough ? 'plate' : lead === 'spd' ? (r() < 0.5 ? 'vest' : 'bodysuit') : (r() < 0.5 ? 'tunic' : 'coat');
    var legs = torso === 'robe' ? 'longrobe' : torso === 'plate' ? 'boots' : r() < 0.25 ? 'skirt' : r() < 0.5 ? 'boots' : 'trousers';
    var hair = ['short', 'long', 'tied', 'spiked', 'cropped'][Math.floor(r() * 5)];
    var head = ['round', 'round', 'square', 'long'][Math.floor(r() * 4)];
    var back = torso === 'robe' || torso === 'coat' ? (r() < 0.4 ? 'cape' : null) : lead === 'spd' && r() < 0.4 ? 'pack' : null;
    return { body: body, head: head, hair: hair, torso: torso, legs: legs, back: back, front: S.frontFor(chr.weaponClass) };
  };
  S.NPC_LOOKS = {
    elder: { body: 'slight', head: 'long', hair: 'cropped', torso: 'robe', legs: 'longrobe', back: null, front: 'staff' },
    child: { body: 'small', head: 'round', hair: 'tied', torso: 'tunic', legs: 'trousers', back: null, front: 'bare' },
    merchant: { body: 'broad', head: 'round', hair: 'short', torso: 'vest', legs: 'trousers', back: 'pack', front: 'bare' },
    guard: { body: 'broad', head: 'square', hair: 'cropped', torso: 'plate', legs: 'boots', back: null, front: 'blade' },
    worker: { body: 'average', head: 'square', hair: 'short', torso: 'tunic', legs: 'boots', back: null, front: 'tool' },
    scholar: { body: 'slight', head: 'long', hair: 'long', torso: 'robe', legs: 'longrobe', back: null, front: 'bare' },
    healer: { body: 'average', head: 'round', hair: 'covered', torso: 'robe', legs: 'longrobe', back: null, front: 'staff' },
    traveler: { body: 'tall', head: 'long', hair: 'short', torso: 'coat', legs: 'boots', back: 'pack', front: 'bare' },
    noble: { body: 'tall', head: 'long', hair: 'long', torso: 'coat', legs: 'trousers', back: 'cape', front: 'bare' },
    innkeeper: { body: 'broad', head: 'round', hair: 'tied', torso: 'vest', legs: 'skirt', back: null, front: 'bare' }
  };
  S.VILLAIN_LOOK = { body: 'tall', head: 'long', hair: 'long', torso: 'coat', legs: 'boots', back: 'cape', front: 'blade' };
  function recipeFromLook(b, look, pal) {
    var parts = {};
    ['body', 'head', 'hair', 'torso', 'legs', 'back', 'front'].forEach(function (layer) { parts[layer] = look[layer] ? partId(b, layer + '.' + look[layer]) : null; });
    return { rig: 'humanoid', parts: parts, proportions: { height: 1.5, headScale: 1 }, look: U.clone(look), accent: pal && pal.colorway ? pal.colorway.accent : 'clothB' };
  }
  // Enemy rig from the family's name, then its type, then its seed. The keywords are genre neutral shapes.
  var RIG_WORDS = [
    [/slime|ooze|jelly|blob|pudding|goo|sludge|mimic/, 'ooze'], [/wisp|ghost|spirit|phantom|specter|spectre|eye|orb|will|soul|flame|ember/, 'floater'],
    [/wolf|dog|hound|beast|cat|boar|bear|rat|fox|lion|tiger|horse|stag|deer|bull|lizard|drake|hyena|jackal/, 'quadruped'],
    [/bird|hawk|crow|raven|harpy|roc|eagle|owl|bat|griffin|gryphon|wing|moth|wasp|bee/, 'avian'], [/snake|serpent|worm|eel|naga|wyrm|viper|cobra|larva|centipede/, 'serpent'],
    [/golem|robot|construct|armor|armour|machine|gear|sentinel|statue|automaton|drone|mech/, 'construct'], [/plant|flower|vine|tree|fungus|mushroom|treant|root|bloom|thorn|weed/, 'plant'],
    [/goblin|orc|knight|bandit|soldier|man|skeleton|zombie|imp|troll|ogre|cultist|thief|mage|warrior|ghoul|lich|demon/, 'humanoid']
  ];
  var TYPE_RIG = [[/beast|animal|earth|ground/, 'quadruped'], [/water|aqua|ice|frost/, 'ooze'], [/fire|air|wind|holy|light|spirit|lightning|thunder/, 'floater'], [/undead|unholy|dark|shadow|death/, 'humanoid'], [/machine|metal|steel/, 'construct'], [/plant|nature|wood/, 'plant']];
  S.rigFor = function (fam) {
    var n = String(fam && fam.name || '').toLowerCase().replace(/\s+t\d+$/, ''), t = String(fam && fam.type || '').toLowerCase();
    for (var i = 0; i < RIG_WORDS.length; i++) if (RIG_WORDS[i][0].test(n)) return RIG_WORDS[i][1];
    for (var j = 0; j < TYPE_RIG.length; j++) if (TYPE_RIG[j][0].test(t)) return TYPE_RIG[j][1];
    return ES.RIGS[H(fam && fam.id || n) % ES.RIGS.length];
  };
  // Seeded variation of a rig's default parameters, so two families on the same rig still look different.
  S.rigParams = function (rig, seed) {
    var r = rng(seed), base = U.clone(ES.RIG_PARAMS[rig] || {}), out = {};
    Object.keys(base).forEach(function (k) {
      var v = base[k];
      if (k === 'eyes') out[k] = 1 + Math.floor(r() * 2);
      else if (k === 'tails' || k === 'petals' || k === 'coils') out[k] = Math.max(1, Math.round(v + (r() - 0.5) * 2));
      else if (v === 0 || v === 1) out[k] = r() < (v ? 0.8 : 0.3) ? 1 : 0;
      else out[k] = Math.round((v * (0.85 + r() * 0.3)) * 100) / 100;
    });
    return out;
  };

  // ---------------------------------------------------------------- sprites
  S.sprites = function (b) { return ART.records.list('spr_', b || cur()); };
  S.spriteFor = function (b, kind, ref, mode) {
    return S.sprites(b).filter(function (r) { return r.subject && r.subject.kind === kind && r.subject.ref === ref && r.mode === mode; })[0] || null;
  };
  var KEEP = { user: 1, claude: 1 };
  function kept(r) { return !!(r && KEEP[r.origin]); }
  S.isKept = kept;
  // Creates or refreshes one sprite. body is {kind, mode, recipe|shares, pal}. A kept sprite only gets its pal relinked
  // when that palette has vanished, never its recipe.
  function ensureSprite(b, subject, mode, name, body, origin, report) {
    var r = S.spriteFor(b, subject.kind, subject.ref, mode);
    if (r) {
      if (kept(r)) { if (!ART.records.get(r.pal, b) && body.pal) r.pal = body.pal; bump(report, 'kept'); return r; }
      if (r.origin === 'default') { if (!ART.records.get(r.pal, b) && body.pal) r.pal = body.pal; bump(report, 'kept'); return r; }
      var same = U.canonical({ k: r.kind, re: r.recipe || null, sh: r.shares || null, p: r.pal }) === U.canonical({ k: body.kind, re: body.recipe || null, sh: body.shares || null, p: body.pal });
      if (same) { bump(report, 'kept'); return r; }
      r.kind = body.kind; r.pal = body.pal; r.name = name;
      if (body.shares) { r.shares = body.shares; delete r.recipe; } else { r.recipe = body.recipe; delete r.shares; }
      bump(report, 'refreshed');
      return r;
    }
    var rec = ART.envelope('spr_', name, subject, origin, H('spr|' + subject.ref + '|' + mode + '|' + bundleSeed(b)), { kind: body.kind, mode: mode, pal: body.pal, overrides: {} });
    if (body.shares) rec.shares = body.shares; else rec.recipe = body.recipe;
    ART.records.put(rec, b);
    bump(report, 'created');
    return rec;
  }
  S.ensureSprite = ensureSprite;
  function humanSet(b, subject, kind, label, look, palRec, origin, report, battle) {
    var field = ensureSprite(b, subject, 'field', label + ' (field)', { kind: kind, recipe: recipeFromLook(b, look, palRec), pal: palRec && palRec.id }, origin, report);
    if (battle) ensureSprite(b, subject, 'battle', label + ' (battle)', { kind: kind, shares: field.id, pal: palRec && palRec.id }, origin, report);
    return field;
  }
  S.buildSprites = function (b, report) {
    var seed = bundleSeed(b);
    rulesList(b, 'chr_').forEach(function (c) {
      var pal = ART.bySubject('pal_', 'chr', c.id, b);
      humanSet(b, { kind: 'chr', ref: c.id }, 'character', c.name || c.id, S.characterLook(c, H(c.id + '|' + seed)), pal, 'procedural', report, true);
    });
    var vpal = ART.bySubject('pal_', 'role', 'villain', b);
    if (retired(b).indexOf('villain') < 0) humanSet(b, { kind: 'role', ref: 'villain' }, 'villain', villainName(b), S.VILLAIN_LOOK, vpal, 'procedural', report, true);
    ART.NPC_ARCHETYPES.forEach(function (k) {
      if (retired(b).indexOf('npc:' + k) >= 0) return;
      var pal = ART.bySubject('pal_', 'role', 'npc:' + k, b);
      humanSet(b, { kind: 'role', ref: 'npc:' + k }, 'npc', k.charAt(0).toUpperCase() + k.slice(1), S.NPC_LOOKS[k], pal, 'default', report, false);
    });
    // Enemy families: the lowest tier of each family name owns the recipe; Day 146 tier families share it.
    var info = P.familyInfo(b), byId = {};
    info.forEach(function (x) { byId[x.id] = x; });
    info.filter(function (x) { return x.id === x.baseId; }).concat(info.filter(function (x) { return x.id !== x.baseId; })).forEach(function (x) {
      var pal = ART.bySubject('pal_', 'fam', x.id, b);
      if (x.id === x.baseId) {
        var rig = S.rigFor(x.fam), body = partId(b, 'enemy.' + rig);
        var params = {}; params.body = S.rigParams(rig, H('rig|' + x.id + '|' + seed));
        ensureSprite(b, { kind: 'fam', ref: x.id }, 'battle', x.baseName + ' (battle)', { kind: 'enemy', recipe: { rig: rig, parts: { body: body }, params: params }, pal: pal && pal.id }, 'procedural', report);
      } else {
        var base = S.spriteFor(b, 'fam', x.baseId, 'battle');
        ensureSprite(b, { kind: 'fam', ref: x.id }, 'battle', x.name + ' (battle)', { kind: 'enemy', shares: base ? base.id : null, pal: pal && pal.id }, 'procedural', report);
      }
    });
  };
  function villainName(b) {
    var v = b.charter && b.charter.sections && b.charter.sections.villain;
    return v && typeof v.villain === 'string' && v.villain.trim() ? v.villain.split(/[,.]/)[0].trim().slice(0, 40) : 'Villain';
  }
  S.villainName = villainName;
  // Makes a sharing sprite (a tier family, or a battle sprite sharing its field sprite) independent: it copies the
  // resolved recipe and inherited overrides onto itself.
  S.unshare = function (b, spr) {
    if (!spr || !spr.shares) return false;
    var base = ES.base(b.art, spr);
    spr.recipe = U.clone(base.recipe || {});
    spr.overrides = Object.assign(U.clone(base.overrides || {}), spr.overrides || {});
    delete spr.shares;
    spr.origin = 'user';
    return true;
  };

  // ---------------------------------------------------------------- portraits
  S.portraits = function (b) { return ART.records.list('por_', b || cur()); };
  function portraitRecipe(spr, pal) {
    var look = spr && spr.recipe && spr.recipe.look || {};
    return { head: look.head || 'round', hair: look.hair || 'short', mouth: 1, collar: look.torso === 'plate' ? 'plate' : 'cloth', accent: pal && pal.colorway ? pal.colorway.accent : 'clothB' };
  }
  function ensurePortrait(b, subject, name, report) {
    var spr = S.spriteFor(b, subject.kind, subject.ref, 'field'), pal = spr ? ART.records.get(spr.pal, b) : null;
    var r = ART.bySubject('por_', subject.kind, subject.ref, b), recipe = portraitRecipe(spr && ES.base(b.art, spr), pal);
    var size = EP.size(S.tileSize(b));
    if (r) {
      if (kept(r)) { if (!ART.records.get(r.pal, b) && pal) r.pal = pal.id; bump(report, 'kept'); return r; }
      if (U.canonical(r.recipe) === U.canonical(recipe) && r.size === size && r.pal === (pal && pal.id)) { bump(report, 'kept'); return r; }
      r.recipe = recipe; r.size = size; r.pal = pal && pal.id; bump(report, 'refreshed');
      return r;
    }
    r = ART.envelope('por_', name + ' portrait', subject, 'procedural', H('por|' + subject.ref), { size: size, recipe: recipe, pal: pal && pal.id, expressions: {}, overrides: {} });
    ART.records.put(r, b);
    bump(report, 'created');
    return r;
  }
  S.buildPortraits = function (b, report) {
    rulesList(b, 'chr_').forEach(function (c) { ensurePortrait(b, { kind: 'chr', ref: c.id }, c.name || c.id, report); });
    if (retired(b).indexOf('villain') < 0) ensurePortrait(b, { kind: 'role', ref: 'villain' }, villainName(b), report);
  };

  // ---------------------------------------------------------------- icons
  S.ICON_RAMPS = { metal: [2, 3, 4], wood: [5, 6, 7], tint: [8, 9, 10], cloth: [11, 12, 13], light: [14, 15] };
  var ICON_SRC = { metal: '#a3abba', wood: '#8a5e3a', tint: '#c4a04c', cloth: '#e2d4ae', light: '#f4f1ea' };
  S.iconPalette = function (b) { return ART.bySubject('pal_', 'role', 'ui:icons', b || cur()); };
  function ensureIconPalette(b, report) {
    var m = P.entries(b), r = S.iconPalette(b);
    if (!m.length) return null;
    if (r && kept(r)) { bump(report, 'kept'); return r; }
    var mats = {}, taken = {};
    taken[PE.outline(m)] = 1;
    Object.keys(S.ICON_RAMPS).forEach(function (k) { mats[k] = PE.rampFor(m, ICON_SRC[k], S.ICON_RAMPS[k].length, k === 'light' ? 0.07 : 0.12, taken); mats[k].forEach(function (i) { taken[i] = 1; }); });
    var slots = PE.slotsFrom(m, mats, S.ICON_RAMPS);
    if (r) { if (U.canonical(r.slots) === U.canonical(slots)) { bump(report, 'kept'); return r; } r.slots = slots; r.colorway = mats; bump(report, 'refreshed'); return r; }
    r = ART.envelope('pal_', 'Icon palette', { kind: 'role', ref: 'ui:icons' }, 'procedural', H('icons|' + bundleSeed(b)), { kind: 'local', layout: 'icon', slots: slots, ramps: U.clone(S.ICON_RAMPS), colorway: mats });
    ART.records.put(r, b);
    bump(report, 'created');
    return r;
  }
  S.ensureIconPalette = ensureIconPalette;
  // After the master palette is rebuilt: a generated icon palette refits, a kept one moves to the nearest new colors, and
  // every icon's tint ramp is recomputed from its tint.
  P.onRebuild(function (b, map) {
    var r = S.iconPalette(b);
    if (r && kept(r)) r.slots = r.slots.map(function (s) { return s === null ? null : map[s] !== undefined ? map[s] : s; });
    else if (r) ensureIconPalette(b, {});
    S.icons(b).forEach(function (ic) { var t = ic.gen && ic.gen.tint; if (t != null) ic.tintRamp = S.tintRamp(b, t) || ic.tintRamp; else if (Array.isArray(ic.tintRamp)) ic.tintRamp = ic.tintRamp.map(function (i) { return map[i] !== undefined ? map[i] : i; }); });
  });
  var TINTS = [
    [/poison|venom|toxic|antidote|bile/, '#5aa83c'], [/ether|mana|magic|mp|spirit|focus/, '#4a7ad8'], [/tonic|potion|heal|cure|remedy|elixir|life|blood|mend|restore/, '#d04848'],
    [/sleep|slumber|drowse/, '#8a8ad8'], [/stone|petri|stop|freeze|paraly|stun/, '#9a9a9a'], [/gold|key|crown|letter|seal/, '#d8b048'], [/haste|speed|quick/, '#e8d048'],
    [/slow|delay|chill|frost|cold|ice/, '#5ab0c0'], [/berserk|rage|fury/, '#e06030'], [/regen|bloom|growth/, '#60c060'], [/blind|dark|shadow|doom|death|curse/, '#6a4a8a'], [/protect|shell|barrier|guard|ward/, '#5a9ad0']
  ];
  function tintHex(text) { var t = String(text || '').toLowerCase(); for (var i = 0; i < TINTS.length; i++) if (TINTS[i][0].test(t)) return TINTS[i][1]; return null; }
  var STATUS_WORDS = [[/poison|venom|toxic|bleed/, 'drop'], [/death|doom|ko|zombie|curse/, 'skull'], [/sleep|slumber|drowse/, 'sleep'], [/confus|charm|dizz|daze/, 'spiral'],
    [/haste|bless|shine|lucky/, 'star'], [/chill|frost|cold|ice|numb/, 'clock'], [/regen|protect|shell|boost|up|faith|bravery|barrier/, 'up'], [/weak|break|down|slow|frail/, 'down'], [/slow|stop|time|delay|doom/, 'clock'],
    [/regen|love|charm|reraise|life/, 'heart'], [/haste|shock|volt|paraly|stun/, 'bolt'], [/burn|berserk|rage|fury|fire/, 'flame'], [/regen|bloom|leaf|nature/, 'leaf'],
    [/blind|dark|seal|silence|mute/, 'eye'], [/stone|petri|stop|bind|root|freeze|imprison/, 'chain']];
  S.statusShape = function (sta, i) { var t = String(sta && sta.name || '').toLowerCase(); for (var k = 0; k < STATUS_WORDS.length; k++) if (STATUS_WORDS[k][0].test(t)) return STATUS_WORDS[k][1]; return EI.STATUS_SHAPES[(i || 0) % EI.STATUS_SHAPES.length]; };
  var EQ_WORDS = [[/helm|hat|cap|hood|crown|circlet|mask/, 'helm'], [/shield|buckler/, 'shield'], [/ring|band/, 'ring'], [/amulet|charm|gem|pendant|brooch|necklace|earring|jewel/, 'gem']];
  // What each rules record's icon shows: {glyph, tint} with tint an element key or a hex.
  S.iconLook = function (prefix, r, i) {
    var nm = String(r.name || '').toLowerCase();
    if (prefix === 'itm_') {
      if (r.kind === 'key') return { glyph: /letter|scroll|map|note|book|page/.test(nm) ? 'scroll' : 'gem', tint: tintHex(nm) || '#d8b048' };
      if (/seed|nut|bean/.test(nm)) return { glyph: 'seed', tint: tintHex(nm) || '#70b050' };
      if (/scroll|tome|book/.test(nm)) return { glyph: 'scroll', tint: tintHex(nm) || '#c06040' };
      return { glyph: 'vial', tint: tintHex(nm) || '#d04848' };
    }
    if (prefix === 'eqp_') {
      if (r.slot === 'weapon') { var f = S.frontFor(r.weaponClass || nm); return { glyph: f === 'bare' ? 'ring' : f, tint: '#b04a3a' }; }
      if (r.slot === 'armor') { for (var k = 0; k < EQ_WORDS.length - 2; k++) if (EQ_WORDS[k][0].test(nm)) return { glyph: EQ_WORDS[k][1], tint: '#5a7ac0' }; return { glyph: 'body', tint: '#5a7ac0' }; }
      for (var j = 0; j < EQ_WORDS.length; j++) if (EQ_WORDS[j][0].test(nm)) return { glyph: EQ_WORDS[j][1], tint: '#c04a8a' };
      return { glyph: 'ring', tint: '#c04a8a' };
    }
    if (prefix === 'abl_') {
      if (r.element) return { glyph: r.kind === 'magic' ? 'gem' : 'blade', tint: r.element };
      if (r.kind === 'magic') return { glyph: 'staff', tint: tintHex(nm) || '#4a7ad8' };
      if (r.kind === 'heal' || /heal|cure|mend|life|raise|regen/.test(nm)) return { glyph: 'status.heart', tint: tintHex(nm) && !/heal|cure|mend/.test(nm) ? tintHex(nm) : '#5ab85a' };
      if (r.kind === 'limit') return { glyph: 'status.star', tint: '#e0b040' };
      if (r.kind === 'item') return { glyph: 'vial', tint: tintHex(nm) || '#d04848' };
      return { glyph: 'blade', tint: tintHex(nm) || '#b04a3a' };
    }
    if (prefix === 'mat_') return { glyph: 'gem', tint: r.element || tintHex(nm) || '#60c060' };
    if (prefix === 'sta_') return { glyph: 'status.' + S.statusShape(r, i), tint: tintHex(nm) || '#a060c0' };
    return { glyph: 'gem', tint: '#c0c0c0' };
  };
  // A tint (element key, hex, or master index) to three master indices, dark to light.
  S.tintRamp = function (b, tint) {
    var m = P.entries(b);
    if (!m.length) return null;
    if (typeof tint === 'number') return PE.ramp(m, tint, 3);
    var fx = ART.bySubject('efx_', 'element', tint, b);
    if (fx && Array.isArray(fx.palette) && fx.palette.length >= 3) return fx.palette.slice(0, 3);
    var els = b.charter && b.charter.ruleset && Array.isArray(b.charter.ruleset.elements) ? b.charter.ruleset.elements : [];
    var el = els.filter(function (e) { return e && e.key === tint; })[0];
    var hex = C.normHex(el ? el.color : tint) || '#c4a04c';
    return PE.rampFor(m, hex, 3, 0.12);
  };
  S.ICON_SOURCES = ['itm_', 'eqp_', 'abl_', 'sta_', 'mat_'];
  S.icons = function (b) { return ART.records.list('ico_', b || cur()); };
  S.buildIcons = function (b, report) {
    var pal = ensureIconPalette(b, report), size = EI.size(S.tileSize(b));
    if (!pal) return;
    S.ICON_SOURCES.forEach(function (prefix) {
      var usedShapes = {};
      rulesList(b, prefix).forEach(function (rr, i) {
        var kind = prefix.slice(0, 3), look = S.iconLook(prefix, rr, i), r = ART.bySubject('ico_', kind, rr.id, b);
        // Statuses with no keyword match take the next shape no other status in the bundle uses.
        if (prefix === 'sta_') {
          var sh = look.glyph.slice(7), j = 0;
          while (usedShapes[sh] && j < EI.STATUS_SHAPES.length) { sh = EI.STATUS_SHAPES[(EI.STATUS_SHAPES.indexOf(sh) + 1) % EI.STATUS_SHAPES.length]; j++; }
          usedShapes[sh] = 1; look.glyph = 'status.' + sh;
        }
        var ramp = S.tintRamp(b, look.tint);
        if (r) {
          if (kept(r)) { r.tintRamp = S.tintRamp(b, r.gen && r.gen.tint != null ? r.gen.tint : look.tint) || r.tintRamp; if (!ART.records.get(r.pal, b)) r.pal = pal.id; bump(report, 'kept'); return; }
          var same = U.canonical({ g: r.gen, s: r.size, p: r.pal, t: r.tintRamp }) === U.canonical({ g: look, s: size, p: pal.id, t: ramp });
          if (same) { bump(report, 'kept'); return; }
          r.gen = look; r.size = size; r.pal = pal.id; r.tintRamp = ramp; r.name = (rr.name || rr.id) + ' icon';
          bump(report, 'refreshed');
          return;
        }
        ART.records.put(ART.envelope('ico_', (rr.name || rr.id) + ' icon', { kind: kind, ref: rr.id }, 'procedural', H('ico|' + rr.id), { size: size, gen: look, pal: pal.id, tintRamp: ramp }), b);
        bump(report, 'created');
      });
    });
  };
  // ---------------------------------------------------------------- frames and the host cache
  // One engine cache per bundle state. Any bundle change clears it; previews rebake lazily, which is cheap at these sizes.
  var cache = null, cacheFor = null;
  S.cache = function () {
    var b = cur();
    if (!cache || cacheFor !== b) {
      cacheFor = b;
      cache = ENGINE_RENDER.createCache(b.art, { size: S.tileSize(b), entries: P.entries(b), budget: 12e6, makeCanvas: function (w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; } });
    }
    return cache;
  };
  Kit.on('change', function () { if (cache) cache.clear(); cache = null; });
  Kit.on('load', function () { if (cache) cache.clear(); cache = null; });
  S.frame = function (id, a, c) {
    var p = Kit.ids.prefixOf(id), k = S.cache();
    if (p === 'spr_') { var r = ART.records.get(id); return k.sprite(id, a || (r && r.mode === 'battle' ? (r.kind === 'enemy' ? 'idle' : 'idle') : 'stand'), c || (r && r.mode === 'battle' ? (r.kind === 'enemy' ? 'right' : 'left') : 'down')); }
    if (p === 'por_') return k.portrait(id, a || 'neutral');
    if (p === 'ico_') return k.icon(id);
    return null;
  };
  // A frame as a pixel crisp canvas at an integer scale. Works without a 2D context (tests), returning a sized blank.
  S.canvas = function (f, scale, label) {
    var cv = document.createElement('canvas');
    cv.className = 'a7-fig';
    if (!f) { cv.width = cv.height = 1; return cv; }
    cv.width = f.w; cv.height = f.h;
    var sc = scale || 3;
    cv.style.width = f.w * sc + 'px'; cv.style.height = f.h * sc + 'px';
    cv.setAttribute('role', 'img');
    if (label) cv.setAttribute('aria-label', label);
    var ctx = cv.getContext && cv.getContext('2d');
    if (ctx && f.rgba) { var im = ctx.createImageData(f.w, f.h); im.data.set(f.rgba); ctx.putImageData(im, 0, 0); }
    return cv;
  };
  // Picks a preview scale that keeps a frame near a target width in CSS pixels.
  S.fit = function (f, px) { return f ? Math.max(1, Math.min(8, Math.floor((px || 72) / Math.max(f.w, f.h)))) : 1; };

  // ---------------------------------------------------------------- Quick Build
  ART.quickBuild.register({ key: 'sprites', label: 'Sprites, portraits, and icons', order: 20, run: function (b, r) {
    if (!P.master(b)) return;
    S.buildParts(b, r);
    S.buildSprites(b, r);
    S.buildPortraits(b, r);
    S.buildIcons(b, r);
  } });

  // ---------------------------------------------------------------- validation
  Kit.validate.register('art.sprites', function (b, ctx) {
    var recs = b.art && U.isObj(b.art.records) ? b.art.records : {};
    function list(p) { return U.isObj(recs[p]) ? Object.keys(recs[p]).map(function (k) { return recs[p][k]; }).filter(U.isObj) : []; }
    function has(p, id) { return typeof id === 'string' && U.isObj(recs[p]) && !!recs[p][id]; }
    function add(id, path, msg, level) { ctx.add({ recordId: id, fieldPath: path, message: msg, level: level || 'error' }); }
    var T = S.tileSize(b), gens = {};
    ES.GENERATORS.forEach(function (g) { gens[g] = 1; });
    function pxOk(id, path, o, max) {
      if (!U.isObj(o)) { add(id, path, 'Pixel data must be an object with w, h, and d.'); return; }
      var v = EC.validate(o.d, o.w, o.h, max == null ? 15 : max);
      if (!v.ok) add(id, path, v.error);
    }
    function subjectOk(r) {
      var sj = r.subject;
      if (!sj) return;
      var p = sj.kind + '_';
      if (['chr', 'fam', 'itm', 'eqp', 'abl', 'sta', 'mat'].indexOf(sj.kind) >= 0 && !(b.rules && U.isObj(b.rules[p]) && b.rules[p][sj.ref]))
        add(r.id, 'subject.ref', 'This record belongs to ' + sj.ref + ', which no longer exists.', 'warning');
    }
    list('prt_').forEach(function (r) {
      if (ES.LAYERS.indexOf(r.layer) < 0) add(r.id, 'layer', 'Layer must be one of ' + ES.LAYERS.join(', ') + '.');
      var hasPx = r.px && U.isObj(r.px.variants) && Object.keys(r.px.variants).length;
      if (hasPx) Object.keys(r.px.variants).forEach(function (k) { pxOk(r.id, 'px.variants.' + k, r.px.variants[k]); });
      else if (!r.gen || !gens[r.gen.shape]) add(r.id, 'gen.shape', 'Unknown part generator ' + (r.gen && r.gen.shape) + '.');
      if (hasPx && r.px.base && r.px.base !== T) add(r.id, 'px.base', 'Drawn at tile size ' + r.px.base + ' but the Charter uses ' + T + '. It is resampled, which can look rough.', 'warning');
    });
    var sprs = list('spr_');
    sprs.forEach(function (r) {
      if (S.KINDS.indexOf(r.kind) < 0) add(r.id, 'kind', 'Sprite kind must be ' + S.KINDS.join(', ') + '.');
      if (S.MODES.indexOf(r.mode) < 0) add(r.id, 'mode', 'Sprite mode must be field or battle.');
      if (!has('pal_', r.pal)) add(r.id, 'pal', r.pal ? 'Palette ' + r.pal + ' does not exist.' : 'This sprite has no palette.');
      if (r.shares) {
        if (!has('spr_', r.shares)) add(r.id, 'shares', 'Shares ' + r.shares + ', which does not exist.');
        else { var seen = {}, s = r; while (s && s.shares && !seen[s.id]) { seen[s.id] = 1; s = recs.spr_[s.shares]; } if (s && s.shares) add(r.id, 'shares', 'Sharing loops back on itself.'); }
      } else {
        var rc = r.recipe || {};
        if (!U.isObj(rc.parts) || !rc.parts.body) add(r.id, 'recipe.parts.body', 'A sprite needs a body part.');
        Object.keys(rc.parts || {}).forEach(function (layer) {
          var pid = rc.parts[layer];
          if (!pid) return;
          if (!has('prt_', pid)) add(r.id, 'recipe.parts.' + layer, 'Part ' + pid + ' does not exist.');
          else if (recs.prt_[pid].layer !== layer) add(r.id, 'recipe.parts.' + layer, 'Part ' + pid + ' is a ' + recs.prt_[pid].layer + ' part on the ' + layer + ' layer.', 'warning');
        });
      }
      Object.keys(r.overrides || {}).forEach(function (k) { pxOk(r.id, 'overrides.' + k, r.overrides[k]); });
      subjectOk(r);
    });
    list('por_').forEach(function (r) {
      if (!has('pal_', r.pal)) add(r.id, 'pal', 'This portrait has no palette.');
      Object.keys(r.overrides || {}).forEach(function (k) { pxOk(r.id, 'overrides.' + k, r.overrides[k]); });
      subjectOk(r);
    });
    var n = b.art && recs.pal_ ? (P.entries(b).length) : 0;
    list('ico_').forEach(function (r) {
      var g = r.gen && r.gen.glyph;
      if (!r.px && !(EI.GLYPHS.indexOf(g) >= 0 || (/^status\./.test(g || '') && EI.STATUS_SHAPES.indexOf(g.slice(7)) >= 0))) add(r.id, 'gen.glyph', 'Unknown icon glyph ' + g + '.');
      if (!has('pal_', r.pal)) add(r.id, 'pal', 'This icon has no palette.');
      if (r.tintRamp != null && !(Array.isArray(r.tintRamp) && r.tintRamp.length === 3 && r.tintRamp.every(function (v) { return typeof v === 'number' && v >= 0 && v < n; }))) add(r.id, 'tintRamp', 'The tint is three master indices.');
      if (r.px) pxOk(r.id, 'px', r.px);
      subjectOk(r);
    });
  });
  function goSprites(rid) { if (!Kit.go('sprites')) return false; if (ART.WS.sprites && ART.WS.sprites.focus) ART.WS.sprites.focus(rid); return true; }
  Kit.jump.register({
    test: function (rid) { var p = Kit.ids.prefixOf(rid); return p === 'spr_' || p === 'prt_' || p === 'por_'; },
    name: function (rid) { var r = ART.records.get(rid); return r ? r.name : rid; },
    go: goSprites
  });
  Kit.jump.register({
    test: function (rid) { return Kit.ids.prefixOf(rid) === 'ico_'; },
    name: function (rid) { var r = ART.records.get(rid); return r ? r.name : rid; },
    go: function (rid) { if (!Kit.go('interface')) return false; if (ART.WS.interface && ART.WS.interface.focus) ART.WS.interface.focus(rid); return true; }
  });
})();
// === ART:SPRITES END ===
