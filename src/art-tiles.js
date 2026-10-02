// === ART:TILES BEGIN ===
(function () {
  'use strict';
  // Tiles as records. The blob set, generators, animation, map drawing, and backgrounds live in ENGINE_RENDER.tiles and
  // ENGINE_RENDER.bg; this fence owns the records and keeps them in step with the bundle.
  //   til_  one biome tileset per default biome (role biome:<key>, origin default) plus any a user invents, and two
  //         interior sets (role interior:town, interior:dungeon) with floors, walls, doors, stairs, counters, furnishings
  //   pal_  one 32 slot tile palette per tileset (layout tile, role tiles:<subject>), fitted from material colors
  //   bgd_  one battle background per tileset (same subject role as its tileset), procedural until edited
  //   art.priority      biome tileset IDs, lowest first; higher biomes draw over lower ones at a border
  //   art.tileAnimTypes the animation type registry (liquid, flame, flow, foliage, mechanism)
  var U = Kit.util, ET = ENGINE_RENDER.tiles, PE = ENGINE_RENDER.palette, H = ENGINE_RENDER.util.hash32;
  var P = ART.palette, S = ART.sprites, TL = ART.tiles = {};
  function cur() { return Kit.bundle.current(); }
  function bump(report, k) { report[k] = (report[k] || 0) + 1; }
  var KEEP = { user: 1, claude: 1 };
  function kept(r) { return !!(r && KEEP[r.origin]); }
  TL.isKept = kept;
  TL.FLAG_LIST = [['passable', 1, 'Passable'], ['encounter', 2, 'Encounters'], ['swim', 4, 'Swimmable'], ['damage', 8, 'Damage floor'], ['counter', 16, 'Counter'], ['above', 32, 'Above layer']];
  TL.CLIMATE = {
    temp: ['frigid', 'cold', 'mild', 'warm', 'hot'],
    moist: ['arid', 'dry', 'moderate', 'wet', 'saturated'],
    elev: ['deep water', 'shore', 'lowland', 'upland', 'alpine']
  };

  // ---------------------------------------------------------------- defaults (data, copied into records once)
  function bg(sky, far, mid, near, floor) {
    // Each layer: [kind, style, [dark, mid, light] hexes, parallax, drift]
    return [['sky'].concat(sky), ['far'].concat(far), ['mid'].concat(mid), ['near'].concat(near), ['floor'].concat(floor)];
  }
  var SKY_DAY = ['#3a62a8', '#9ac4ec', '#ffffff'];
  TL.BIOMES = [
    { key: 'ocean', label: 'Ocean', style: 'water', climate: [[0, 4], [0, 4], [0, 0]], priority: 0, flags: 4, anim: { type: 'liquid', technique: 'cycle', params: { mat: 'E', ms: 260 } },
      bg: bg(['clouds', SKY_DAY, 0.1, 0.4], ['sea', ['#1e3e6a', '#2a5a9a', '#cfe6f8'], 0.2, 0.2], ['waves', ['#1e3e6a', '#3a72c0', '#e8f4ff'], 0.5, 0], ['none', [], 0, 0], ['water', ['#1e3e6a', '#2a5a9a', '#7ab8e8'], 1, 0]) },
    { key: 'coast', label: 'Coast', style: 'beach', climate: [[1, 4], [0, 4], [1, 1]], priority: 1, flags: 3, anim: { type: 'liquid', technique: 'cycle', params: { mat: 'F', ms: 320 } },
      bg: bg(['clouds', SKY_DAY, 0.1, 0.3], ['sea', ['#1e3e6a', '#3a72c0', '#e8f4ff'], 0.2, 0.15], ['rocks', ['#4a4440', '#7e746a', '#b8ac9a'], 0.5, 0], ['stones', ['#5a5048', '#9a8a7a', '#d8ccb8'], 0.9, 0], ['sand', ['#b89a6a', '#ead6a0', '#fff4dc'], 1, 0]) },
    { key: 'swamp', label: 'Swamp', style: 'marsh', climate: [[2, 4], [4, 4], [2, 2]], priority: 2, flags: 3, anim: { type: 'liquid', technique: 'cycle', params: { mat: 'E', ms: 420 } },
      bg: bg(['gradient', ['#3a4a3a', '#8a9a7a', '#c8d0b0'], 0, 0], ['canopy', ['#1e2e22', '#2e4a30', '#4a6a40'], 0.2, 0], ['reeds', ['#3a4a2a', '#6a7a3a', '#c8c070'], 0.5, 0], ['tufts', ['#2a3a24', '#5a7040', '#8a9a5a'], 0.9, 0], ['mud', ['#3a3a2a', '#5a5a3a', '#7a8a5a'], 1, 0]) },
    { key: 'grassland', label: 'Grassland', style: 'grass', climate: [[2, 3], [1, 2], [2, 3]], priority: 3, flags: 3, anim: null,
      bg: bg(['clouds', SKY_DAY, 0.1, 0.3], ['hills', ['#2d5a32', '#4f8a42', '#8ac060'], 0.2, 0], ['trees', ['#3a2a1a', '#3e7a38', '#8ac060'], 0.5, 0], ['tufts', ['#2d5a32', '#4f9a3e', '#a8d070'], 0.9, 0], ['grass', ['#2d5a32', '#4f9a3e', '#8ac060'], 1, 0]) },
    { key: 'steppe', label: 'Steppe', style: 'steppe', climate: [[1, 3], [0, 1], [2, 3]], priority: 4, flags: 3, anim: null,
      bg: bg(['gradient', ['#5a7ab8', '#d8e0e8', '#ffffff'], 0, 0], ['hills', ['#6a6a3a', '#9a9454', '#c8b86a'], 0.2, 0], ['rocks', ['#5a4a3a', '#8a7a5a', '#b8a888'], 0.5, 0], ['tufts', ['#6a6a3a', '#a8a454', '#d8c880'], 0.9, 0], ['grass', ['#7a7040', '#a8a454', '#d8c880'], 1, 0]) },
    { key: 'desert', label: 'Desert', style: 'sand', climate: [[3, 4], [0, 0], [2, 3]], priority: 5, flags: 3, anim: null,
      bg: bg(['gradient', ['#4a7ac8', '#f0dca0', '#fff8e0'], 0, 0], ['dunes', ['#b8905a', '#d8b070', '#f0d8a0'], 0.2, 0], ['mounds', ['#a87a4a', '#d8b070', '#f0d8a0'], 0.5, 0], ['none', [], 0, 0], ['sand', ['#c09a60', '#e2c27e', '#f8e6b8'], 1, 0]) },
    { key: 'forest', label: 'Forest', style: 'forest', climate: [[1, 3], [2, 3], [2, 3]], priority: 6, flags: 3, anim: { type: 'foliage', technique: 'phase', params: { ms: 620, frames: 2 } },
      bg: bg(['gradient', ['#3a6aa8', '#a8c8d8', '#ffffff'], 0, 0], ['canopy', ['#1e3a22', '#2d5a32', '#4f8a42'], 0.2, 0], ['trees', ['#3a2a1a', '#3e7a38', '#7ab050'], 0.5, 0], ['tufts', ['#1e3a22', '#3e6a34', '#6a9a4a'], 0.9, 0], ['grass', ['#2a4a2a', '#3e6a34', '#6a9a4a'], 1, 0]) },
    { key: 'rainforest', label: 'Rainforest', style: 'jungle', climate: [[3, 4], [4, 4], [2, 2]], priority: 7, flags: 3, anim: { type: 'foliage', technique: 'phase', params: { ms: 560, frames: 2 } },
      bg: bg(['clouds', ['#4a7a8a', '#b8d8c8', '#ffffff'], 0.1, 0.2], ['canopy', ['#12261a', '#1e3a24', '#2e6a34'], 0.2, 0], ['trees', ['#2a1e14', '#2e6a34', '#b8e060'], 0.5, 0], ['tufts', ['#12261a', '#2e6a34', '#8ac050'], 0.9, 0], ['mud', ['#2a2a1a', '#3a4a2a', '#5a6a3a'], 1, 0]) },
    { key: 'tundra', label: 'Tundra', style: 'tundra', climate: [[0, 1], [0, 2], [2, 2]], priority: 8, flags: 3, anim: null,
      bg: bg(['gradient', ['#6a7a98', '#d0dce8', '#ffffff'], 0, 0], ['peaks', ['#5a6070', '#8a94a4', '#eef4fa'], 0.2, 0], ['rocks', ['#4a4e54', '#7e848e', '#b8c0c8'], 0.5, 0], ['none', [], 0, 0], ['snow', ['#7a8a6a', '#a8b4a0', '#eef4fa'], 1, 0]) },
    { key: 'snow', label: 'Snowfield', style: 'snow', climate: [[0, 0], [0, 4], [2, 4]], priority: 9, flags: 3, anim: null,
      bg: bg(['clouds', ['#7a8ab8', '#d8e4f0', '#ffffff'], 0.1, 0.3], ['peaks', ['#6a7a98', '#a0b8d8', '#ffffff'], 0.2, 0], ['pines', ['#1e2e2a', '#2e4a40', '#e8f0f8'], 0.5, 0], ['none', [], 0, 0], ['snow', ['#a0b4c8', '#d8e4f0', '#ffffff'], 1, 0]) },
    { key: 'mountain', label: 'Mountains', style: 'mountain', climate: [[0, 4], [0, 4], [4, 4]], priority: 10, flags: 0, anim: null,
      bg: bg(['gradient', ['#3a5a98', '#b8c8e0', '#ffffff'], 0, 0], ['peaks', ['#4a4e5a', '#7a7e8a', '#f4f8fc'], 0.15, 0], ['rocks', ['#3a342e', '#7a6e62', '#b0a494'], 0.5, 0], ['stones', ['#3a342e', '#6a6058', '#a09484'], 0.9, 0], ['stone', ['#4a443e', '#7a6e62', '#a09484'], 1, 0]) },
    { key: 'volcanic', label: 'Volcanic', style: 'lava', climate: [[2, 4], [0, 4], [3, 4]], feature: 'volcanic', priority: 11, flags: 11, anim: { type: 'flame', technique: 'cycle', params: { mat: 'E', ms: 190 } },
      bg: bg(['storm', ['#2a1414', '#8a3a24', '#f0a040'], 0.1, 0.25], ['peaks', ['#1e1418', '#3a2a2a', '#f06a20'], 0.2, 0], ['rocks', ['#1e1418', '#4a3a3a', '#8a5a4a'], 0.5, 0], ['stones', ['#1e1418', '#3a3034', '#f06a20'], 0.9, 0], ['ash', ['#1e1418', '#3a3034', '#f06a20'], 1, 0]) }
  ];
  function T(key, label, style, flags, extra) { var o = { key: key, label: label, gen: { style: style, params: {} }, flags: flags, autotile: false, anim: null }; return Object.assign(o, extra || {}); }
  TL.INTERIORS = [
    { key: 'town', label: 'Town interior', mats: { A: '#9a6a3e', B: '#c8b8a0', C: '#5a3a24', D: '#a83c3c', E: '#5a9a5a', F: '#e8c860' },
      tiles: [T('floor', 'Floor', 'planks', 1), T('wall', 'Wall', 'wall.brick', 0, { autotile: true }), T('door', 'Door', 'door.wood', 1), T('stairs', 'Stairs', 'stairs.up', 1),
        T('counter', 'Counter', 'counter', 16), T('table', 'Table', 'table', 0), T('barrel', 'Barrel', 'barrel', 0), T('bed', 'Bed', 'bed', 0), T('shelf', 'Bookshelf', 'shelf', 0),
        T('rug', 'Rug', 'rug', 1, { autotile: true }), T('plant', 'Potted plant', 'plant', 0), T('lintel', 'Beam over the door', 'lintel', 33)],
      bg: bg(['gradient', ['#2a1e18', '#4a3628', '#6a5038'], 0, 0], ['wall', ['#5a4a3a', '#8a7a62', '#c8b8a0'], 0, 0], ['pillars', ['#3a2a1e', '#5a3a24', '#8a6a44'], 0.4, 0], ['none', [], 0, 0], ['planks', ['#5a3a24', '#9a6a3e', '#c89a5e'], 1, 0]) },
    { key: 'dungeon', label: 'Dungeon', mats: { A: '#5e5a66', B: '#4a4456', C: '#7a7f8a', D: '#4a7a3a', E: '#3a70a8', F: '#f0a040' },
      tiles: [T('floor', 'Floor', 'flagstone', 3), T('wall', 'Wall', 'wall.block', 0, { autotile: true }), T('door', 'Door', 'door.iron', 1), T('stairs', 'Stairs down', 'stairs.down', 1),
        T('counter', 'Altar', 'altar', 16), T('pillar', 'Pillar', 'pillar', 0), T('torch', 'Torch', 'torch', 0, { anim: { type: 'flame', technique: 'phase', params: { ms: 130, frames: 4 } } }),
        T('chest', 'Chest', 'chest', 0), T('channel', 'Water channel', 'channel', 4, { autotile: true, anim: { type: 'flow', technique: 'scroll', params: { ms: 150, frames: 4, dx: 0, dy: 1 } } }),
        T('spikes', 'Spike floor', 'spikes', 9, { under: true }), T('arch', 'Archway', 'arch', 33)],
      bg: bg(['cave', ['#141018', '#2a2430', '#4a4456'], 0, 0], ['wall', ['#2a2430', '#4a4456', '#6a6478'], 0, 0], ['pillars', ['#1e1a24', '#4a4456', '#7a7488'], 0.4, 0], ['stones', ['#1e1a24', '#4a4456', '#7a7f8a'], 0.9, 0], ['stone', ['#2a2430', '#5e5a66', '#8a8694'], 1, 0]) }
  ];
  // A battle background recipe for an invented biome, from its style.
  var STYLE_BG = { water: 'ocean', beach: 'coast', marsh: 'swamp', grass: 'grassland', steppe: 'steppe', sand: 'desert', forest: 'forest', jungle: 'rainforest', tundra: 'tundra', snow: 'snow', mountain: 'mountain', lava: 'volcanic' };
  TL.SLOT_NAMES = (function () {
    var out = ['Clear', 'Outline'], M = { A: 'Ground', B: 'Second', C: 'Stone or wood', D: 'Flora or accent', E: 'Liquid or glow', F: 'Foam or light' };
    Object.keys(ET.RAMPS).forEach(function (k) { ET.RAMPS[k].forEach(function (_, i) { out.push(M[k] + ' ' + (i + 1)); }); });
    while (out.length < ET.SLOTS) out.push('Spare (outline)');
    return out;
  })();
  TL.MAT_LABELS = { A: 'Ground', B: 'Second ground or canopy', C: 'Stone or wood', D: 'Flora or accent', E: 'Liquid or glow', F: 'Foam, snow, or light' };

  // ---------------------------------------------------------------- lookups
  TL.tilesets = function (b) { return ART.records.list('til_', b || cur()); };
  TL.biomes = function (b) { return TL.tilesets(b).filter(function (t) { return t.kind === 'biome'; }); };
  TL.interiors = function (b) { return TL.tilesets(b).filter(function (t) { return t.kind === 'interior'; }); };
  TL.backgrounds = function (b) { return ART.records.list('bgd_', b || cur()); };
  TL.biome = function (b, key) { return ART.bySubject('til_', 'role', 'biome:' + key, b || cur()); };
  TL.interior = function (b, key) { return ART.bySubject('til_', 'role', 'interior:' + key, b || cur()); };
  TL.bgFor = function (b, til) { return til && til.subject ? ART.bySubject('bgd_', 'role', til.subject.ref, b || cur()) : null; };
  TL.palFor = function (b, til) { var p = til && til.pal ? ART.records.get(til.pal, b || cur()) : null; return p && p.kind === 'local' && p.layout === 'tile' ? p : null; };
  TL.ordered = function (b) { b = b || cur(); var m = {}; TL.biomes(b).forEach(function (t) { m[t.id] = t; }); return ET.prioList(b.art).map(function (id) { return m[id]; }).filter(Boolean); };
  TL.defaultBiome = function (key) { return TL.BIOMES.filter(function (x) { return x.key === key; })[0] || null; };
  function retired(b) { ART.ensure(b); var st = b.art.settings; if (!Array.isArray(st.retired)) st.retired = []; return st.retired; }
  function bundleSeed(b) { return H((b.kit && b.kit.bundleId) || 'bundle'); }

  // ---------------------------------------------------------------- palettes
  // Each tileset has its own 32 slot palette fitted from six material colors. A generated palette refits whenever the
  // master changes; one whose slots were edited by hand keeps its indices and moves to the nearest new colors.
  function fitPal(b, source) { var m = P.entries(b), cw = ET.colorway(m, source); return { colorway: cw, slots: ET.slots(m, cw) }; }
  TL.ensurePal = function (b, til, source, report) {
    report = report || {};
    var pal = TL.palFor(b, til);
    if (pal && kept(pal)) { bump(report, 'kept'); return pal; }
    var src = U.clone((pal && pal.source) || source || {}), fit = fitPal(b, src);
    if (pal) {
      if (U.canonical(pal.slots) === U.canonical(fit.slots)) { bump(report, 'kept'); return pal; }
      pal.slots = fit.slots; pal.colorway = fit.colorway; bump(report, 'refreshed'); return pal;
    }
    pal = ART.envelope('pal_', (til.name || til.id) + ' palette', { kind: 'role', ref: 'tiles:' + (til.subject ? til.subject.ref : til.id) }, 'procedural', H('tilpal|' + til.id),
      { kind: 'local', layout: 'tile', source: src, colorway: fit.colorway, slots: fit.slots, ramps: U.clone(ET.RAMPS) });
    ART.records.put(pal, b);
    til.pal = pal.id;
    bump(report, 'created');
    return pal;
  };
  // Changing one material color refits that palette from its sources (the tileset becomes yours, the palette stays
  // generated so it keeps following the master).
  TL.setMaterial = function (b, til, mat, hex) {
    var pal = TL.palFor(b, til);
    if (!pal) pal = TL.ensurePal(b, til, styleMats(til), {});
    pal.source = pal.source || {};
    pal.source[mat] = hex;
    var fit = fitPal(b, pal.source);
    pal.slots = fit.slots; pal.colorway = fit.colorway;
    if (kept(pal)) pal.origin = 'procedural';
    til.origin = 'user';
  };
  function styleMats(til) {
    if (til.kind === 'interior') { var d = TL.INTERIORS.filter(function (x) { return til.subject && x.key === String(til.subject.ref).replace(/^interior:/, ''); })[0]; return U.clone(d ? d.mats : TL.INTERIORS[0].mats); }
    var st = ET.STYLES[til.templates && til.templates.gen && til.templates.gen.style] || ET.STYLES.grass;
    return U.clone(st.mats || ET.STYLES.grass.mats);
  }
  TL.styleMats = styleMats;
  P.onRebuild(function (b, map) {
    TL.tilesets(b).forEach(function (t) {
      var pal = TL.palFor(b, t);
      if (!pal) return;
      if (kept(pal)) pal.slots = pal.slots.map(function (s) { return s === null ? null : map[s] !== undefined ? map[s] : s; });
      else { var fit = fitPal(b, pal.source || styleMats(t)); pal.slots = fit.slots; pal.colorway = fit.colorway; }
    });
    TL.backgrounds(b).forEach(function (r) { refitBg(b, r, map); });
  });

  // ---------------------------------------------------------------- tilesets
  function biomeBody(d) {
    var c = d.climate;
    return {
      kind: 'biome', key: d.key, climate: { temp: c[0].slice(), moist: c[1].slice(), elev: c[2].slice(), feature: d.feature || null },
      priority: d.priority, templates: { gen: { style: d.style, params: {} } }, fillVariants: ET.STYLES[d.style].variants === false ? [] : [{ weight: 0.3, mode: 'reseed' }, { weight: 0.25, mode: 'reseed' }, { weight: 0.06, mode: 'deco' }],
      flags: d.flags, anim: d.anim ? U.clone(d.anim) : null, pal: null
    };
  }
  function interiorBody(d) { return { kind: 'interior', key: d.key, tiles: U.clone(d.tiles), pal: null }; }
  TL.buildTilesets = function (b, report) {
    var ret = retired(b);
    TL.BIOMES.forEach(function (d) {
      if (ret.indexOf('biome:' + d.key) >= 0) return;
      var t = TL.biome(b, d.key);
      if (t) { bump(report, 'kept'); return; }
      t = ART.envelope('til_', d.label, { kind: 'role', ref: 'biome:' + d.key }, 'default', H('til|' + d.key), biomeBody(d));
      ART.records.put(t, b);
      TL.ensurePal(b, t, ET.STYLES[d.style].mats, {});
      bump(report, 'created');
    });
    TL.INTERIORS.forEach(function (d) {
      if (ret.indexOf('interior:' + d.key) >= 0) return;
      var t = TL.interior(b, d.key);
      if (t) { bump(report, 'kept'); return; }
      t = ART.envelope('til_', d.label, { kind: 'role', ref: 'interior:' + d.key }, 'default', H('til|interior|' + d.key), interiorBody(d));
      ART.records.put(t, b);
      TL.ensurePal(b, t, d.mats, {});
      bump(report, 'created');
    });
    // Every tileset (yours too) keeps a valid palette.
    TL.tilesets(b).forEach(function (t) { TL.ensurePal(b, t, styleMats(t), {}); });
  };
  // art.priority lists every biome tileset, lowest first. Kept order wins; new tilesets slot in by their priority number.
  TL.syncPriority = function (b, report) {
    ART.ensure(b);
    var before = U.canonical(b.art.priority), ids = TL.biomes(b).map(function (t) { return t.id; });
    var list = (Array.isArray(b.art.priority) ? b.art.priority : []).filter(function (id, i, a) { return ids.indexOf(id) >= 0 && a.indexOf(id) === i; });
    ids.filter(function (id) { return list.indexOf(id) < 0; }).sort(function (x, y) { return (Number(ART.records.get(x, b).priority) || 0) - (Number(ART.records.get(y, b).priority) || 0); }).forEach(function (id) {
      var pr = Number(ART.records.get(id, b).priority) || 0, at = list.length;
      for (var i = 0; i < list.length; i++) if ((Number(ART.records.get(list[i], b).priority) || 0) > pr) { at = i; break; }
      list.splice(at, 0, id);
    });
    b.art.priority = list;
    if (report) bump(report, before === U.canonical(list) ? 'kept' : 'refreshed');
    return list;
  };
  // Renumbers priorities to match the list order (the Priority view's reorder).
  TL.setOrder = function (b, ids) {
    b.art.priority = ids.slice();
    ids.forEach(function (id, i) { var t = ART.records.get(id, b); if (t && t.priority !== i) { t.priority = i; if (!kept(t)) t.origin = 'user'; } });
  };
  TL.syncAnimTypes = function (b, report) {
    ART.ensure(b);
    var reg = b.art.tileAnimTypes, n = 0;
    if (!U.isObj(reg)) reg = b.art.tileAnimTypes = {};
    Object.keys(ET.ANIM_TYPES).forEach(function (k) { if (!U.isObj(reg[k])) { reg[k] = U.clone(ET.ANIM_TYPES[k]); n++; } });
    bump(report, n ? 'created' : 'kept');
  };
  // Duplicating a biome makes an invented one: its own role, palette, and background, ready to edit.
  TL.duplicate = function (b, til) {
    var copy = U.clone(til), base = til.kind === 'biome' ? 'biome:' : 'interior:', name = (til.name || 'Tileset') + ' copy';
    var key = U.slug(name) || 'custom', n = 2;
    while (ART.bySubject('til_', 'role', base + key, b)) key = U.slug(name) + '-' + n++;
    ['id', 'name', 'subject', 'origin', 'seed', 'pal'].forEach(function (k) { delete copy[k]; });
    copy.key = key;
    if (copy.kind === 'biome') copy.priority = (Number(til.priority) || 0) + 0.5;
    var t = ART.envelope('til_', name, { kind: 'role', ref: base + key }, 'user', H('til|' + key + '|' + Date.now()), copy);
    ART.records.put(t, b);
    var src = TL.palFor(b, til);
    TL.ensurePal(b, t, src && src.source || styleMats(til), {});
    if (t.kind === 'biome') TL.syncPriority(b);
    TL.buildBackgrounds(b, {});
    return t;
  };
  TL.remove = function (b, til) {
    var role = til.subject && til.subject.ref;
    if (til.origin === 'default' && role) { var ret = retired(b); if (ret.indexOf(role) < 0) ret.push(role); }
    var pal = TL.palFor(b, til), bgr = TL.bgFor(b, til);
    if (pal) ART.records.del(pal.id, b);
    if (bgr) { if (bgr.origin === 'default' || bgr.origin === 'procedural') { var r2 = retired(b); if (r2.indexOf('bg:' + role) < 0) r2.push('bg:' + role); } ART.records.del(bgr.id, b); }
    ART.records.del(til.id, b);
    TL.syncPriority(b);
  };

  // ---------------------------------------------------------------- backgrounds
  function recipeFor(til) {
    var ref = til.subject && til.subject.ref || '', key = ref.replace(/^(biome|interior):/, '');
    var d = ref.indexOf('interior:') === 0 ? TL.INTERIORS.filter(function (x) { return x.key === key; })[0] : TL.defaultBiome(key);
    if (!d && til.kind === 'biome') d = TL.defaultBiome(STYLE_BG[til.templates && til.templates.gen && til.templates.gen.style] || 'grassland');
    if (!d && til.kind === 'interior') d = TL.INTERIORS[0];
    return d ? d.bg : TL.BIOMES[3].bg;
  }
  function bgBody(b, til) {
    var ent = P.entries(b), seed = H('bgd|' + (til.subject && til.subject.ref));
    return {
      layers: recipeFor(til).map(function (L, i) {
        return { kind: L[0], gen: { style: L[1], seed: (seed + i * 977) >>> 0, hex: L[2].slice(), colors: L[2].map(function (h) { return ent.length ? PE.nearest(ent, h) : 0; }) }, parallax: L[3], drift: L[4] };
      }).filter(function (L) { return L.gen.style !== 'none'; })
    };
  }
  function refitBg(b, r, map) {
    var ent = P.entries(b);
    (r.layers || []).forEach(function (L) {
      var g = L.gen || {};
      if (!kept(r) && Array.isArray(g.hex) && ent.length) g.colors = g.hex.map(function (h) { return PE.nearest(ent, h); });
      else if (map && Array.isArray(g.colors)) g.colors = g.colors.map(function (m) { return map[m] !== undefined ? map[m] : m; });
    });
  }
  TL.buildBackgrounds = function (b, report) {
    var ret = retired(b);
    TL.tilesets(b).forEach(function (t) {
      var role = t.subject && t.subject.kind === 'role' ? t.subject.ref : null;
      if (!role || ret.indexOf('bg:' + role) >= 0) return;
      var r = TL.bgFor(b, t), body = bgBody(b, t);
      if (r) {
        if (kept(r)) { bump(report, 'kept'); return; }
        if (U.canonical(r.layers) === U.canonical(body.layers)) { bump(report, 'kept'); return; }
        r.layers = body.layers; r.name = (t.name || t.id) + ' battle background'; bump(report, 'refreshed');
        return;
      }
      ART.records.put(ART.envelope('bgd_', (t.name || t.id) + ' battle background', { kind: 'role', ref: role }, 'procedural', H('bgd|' + role), body), b);
      bump(report, 'created');
    });
  };

  // ---------------------------------------------------------------- the test room
  // A small world made the way Day 148 will make one: temperature, moisture, and elevation fields matched to biome
  // climate keys, a volcanic feature on the highest ground, a town house, and a dungeon ruin, all from the bundle's
  // own tilesets. room(b, seed, w, h) -> {w, h, ground, deco, start: [x, y], town: rect, ruin: rect}
  function vnoise(x, y, seed) {
    var x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    function r(i, j) { return H(seed + ':' + i + ':' + j) / 4294967296; }
    var sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    var a = r(x0, y0), c = r(x0 + 1, y0), d = r(x0, y0 + 1), e = r(x0 + 1, y0 + 1);
    return a + (c - a) * sx + (d - a) * sy + (a - c - d + e) * sx * sy;
  }
  function fbm(x, y, seed) { return vnoise(x, y, seed) * 0.62 + vnoise(x * 2.1, y * 2.1, seed + 1) * 0.28 + vnoise(x * 4.3, y * 4.3, seed + 2) * 0.1; }
  TL.room = function (b, seed, w, h) {
    b = b || cur(); seed = seed >>> 0 || 1; w = w || 40; h = h || 30;
    var biomes = TL.biomes(b), ground = new Array(w * h), deco = new Array(w * h), fields = [];
    for (var i = 0; i < w * h; i++) deco[i] = null;
    var hiE = -1, hiAt = 0;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var dx = (x - (w - 1) / 2) / (w / 2), dy = (y - (h - 1) / 2) / (h / 2), dist = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      var e01 = fbm(x / w * 3.2, y / h * 3.2, seed) * 0.58 + (1 - Math.pow(dist, 1.8)) * 0.5;
      var elev = e01 < 0.36 ? 0 : e01 < 0.42 ? 1 : e01 < 0.64 ? 2 : e01 < 0.78 ? 3 : 4;
      var temp = Math.max(0, Math.min(4, Math.round(y / (h - 1) * 4 + (fbm(x / w * 2, y / h * 2, seed + 7) - 0.5) * 3.2)));
      var moist = Math.max(0, Math.min(4, Math.floor((fbm(x / w * 2.6, y / h * 2.6, seed + 13) - 0.5) * 10 + 2.5)));
      fields.push([temp, moist, elev]);
      if (e01 > hiE) { hiE = e01; hiAt = y * w + x; }
      var m = ET.matchClimate(biomes, temp, moist, elev);
      ground[y * w + x] = m ? m.id : null;
    }
    // Feature biomes go on the highest ground.
    biomes.filter(function (t) { return t.climate && t.climate.feature; }).forEach(function (t, k) {
      var cx = hiAt % w, cy = Math.floor(hiAt / w);
      for (var yy = -2; yy <= 2; yy++) for (var xx = -2; xx <= 2; xx++) {
        var px = cx + xx + k * 5, py = cy + yy;
        if (px < 0 || py < 0 || px >= w || py >= h || xx * xx + yy * yy > 5) continue;
        if (fields[py * w + px][2] >= 3) ground[py * w + px] = t.id;
      }
    });
    var town = TL.interior(b, 'town'), ruin = TL.interior(b, 'dungeon'), res = { w: w, h: h, ground: ground, deco: deco, seed: seed };
    function walkable(id) { var t = id && ART.records.get(id, b); return !!(t && (Number(t.flags) & 1)); }
    function spot(rw, rh, avoid) {
      var best = null, bd = Infinity;
      for (var y2 = 1; y2 + rh + 2 < h; y2++) for (var x2 = 1; x2 + rw + 1 < w; x2++) {
        if (avoid && x2 < avoid.x + avoid.w + 2 && x2 + rw + 2 > avoid.x && y2 < avoid.y + avoid.h + 3 && y2 + rh + 3 > avoid.y) continue;
        var bad = 0, wet = 0;
        for (var a = -1; a <= rh + 1; a++) for (var c = -1; c <= rw; c++) { var gid = ground[(y2 + a) * w + x2 + c]; if (!walkable(gid)) { bad++; if (!gid || (Number((ART.records.get(gid, b) || {}).flags) & 4)) wet++; } }
        if (wet || bad > (rw + 2) * (rh + 3) * 0.25) continue;
        var d = bad * 4 + Math.abs(x2 + rw / 2 - w / 2) + Math.abs(y2 + rh / 2 - h / 2);
        if (d < bd) { bd = d; best = { x: x2, y: y2, w: rw, h: rh }; }
      }
      return best || (avoid ? null : { x: Math.floor(w / 2 - rw / 2), y: Math.floor(h / 2 - rh / 2), w: rw, h: rh });
    }
    function room(set, r, build) {
      if (!set || !r) return;
      var lawn = ground[(r.y + r.h + 1) * w + r.x + Math.floor(r.w / 2)];
      for (var yy = r.y; yy < r.y + r.h; yy++) for (var xx = r.x; xx < r.x + r.w; xx++) {
        var edge = yy === r.y || xx === r.x || xx === r.x + r.w - 1 || yy === r.y + r.h - 1;
        ground[yy * w + xx] = set.id + ':' + (edge ? 'wall' : 'floor');
      }
      for (var xx2 = r.x - 1; xx2 <= r.x + r.w; xx2++) for (var yy2 = r.y - 1; yy2 <= r.y + r.h + 1; yy2++) {
        if (xx2 < 0 || yy2 < 0 || xx2 >= w || yy2 >= h) continue;
        var inside = xx2 >= r.x && xx2 < r.x + r.w && yy2 >= r.y && yy2 < r.y + r.h;
        if (!inside && !walkable(ground[yy2 * w + xx2]) && lawn) ground[yy2 * w + xx2] = lawn;
      }
      build(function (dx, dy, key, layer) { var at = (r.y + dy) * w + r.x + dx; if (!ET.item(set, key)) return; if (layer === 'ground') ground[at] = set.id + ':' + key; else deco[at] = set.id + ':' + key; });
    }
    var tr = town ? spot(9, 7) : null;
    room(town, tr, function (put) {
      put(4, 6, 'door', 'ground'); put(4, 6, 'lintel');
      put(1, 1, 'shelf'); put(2, 1, 'shelf'); put(6, 1, 'bed'); put(7, 1, 'plant');
      put(1, 3, 'counter'); put(2, 3, 'counter'); put(3, 3, 'counter'); put(1, 4, 'barrel');
      put(5, 3, 'rug'); put(6, 3, 'rug'); put(5, 4, 'rug'); put(6, 4, 'rug'); put(7, 4, 'table'); put(7, 2, 'stairs', 'ground');
    });
    var rr = ruin ? spot(8, 6, tr) : null;
    room(ruin, rr, function (put) {
      put(3, 5, 'door', 'ground'); put(3, 5, 'arch');
      put(2, 1, 'pillar'); put(5, 1, 'pillar'); put(1, 0, 'torch'); put(6, 0, 'torch');
      put(1, 2, 'channel', 'ground'); put(2, 2, 'channel', 'ground'); put(1, 3, 'channel', 'ground'); put(2, 3, 'channel', 'ground');
      put(6, 3, 'chest'); put(4, 2, 'spikes'); put(5, 2, 'spikes'); put(6, 1, 'stairs', 'ground'); put(4, 4, 'counter');
    });
    res.town = tr; res.ruin = rr;
    var sx = tr ? tr.x + 4 : Math.floor(w / 2), sy = tr ? tr.y + 7 : Math.floor(h / 2);
    if (!(ET.flagsAt(b.art, res, sx, sy) & 1)) {
      // Nearest walkable cell to the middle.
      var bd2 = Infinity;
      for (var k2 = 0; k2 < w * h; k2++) if (ET.flagsAt(b.art, res, k2 % w, Math.floor(k2 / w)) & 1) { var dd = Math.abs(k2 % w - sx) + Math.abs(Math.floor(k2 / w) - sy); if (dd < bd2) { bd2 = dd; res.start = [k2 % w, Math.floor(k2 / w)]; } }
    } else res.start = [sx, sy];
    if (!res.start) res.start = [sx, sy];
    return res;
  };
  // A small patch for previews: this tileset as an island over the next lower biome (a biome) or a little room (an
  // interior set).
  TL.patch = function (b, til, w, h) {
    w = w || 6; h = h || 4;
    var ground = new Array(w * h), deco = new Array(w * h);
    for (var i = 0; i < w * h; i++) deco[i] = null;
    if (til.kind === 'biome') {
      var order = ET.prioList(b.art), at = order.indexOf(til.id), lower = at > 0 ? order[at - 1] : til.id;
      var shape = w === 6 && h === 4 ? [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0] : null;
      for (var j = 0; j < w * h; j++) { var x = j % w, y = Math.floor(j / w); var inn = shape ? shape[j] : (x > 0 && y > 0 && x < w - 1 && y < h - 1 && !(x === w - 2 && y === 1)); ground[j] = inn || lower === til.id ? til.id : lower; }
    } else {
      for (var k = 0; k < w * h; k++) { var x2 = k % w, y2 = Math.floor(k / w); ground[k] = til.id + ':' + (y2 === 0 || x2 === 0 || x2 === w - 1 ? 'wall' : 'floor'); }
      var items = (til.tiles || []).filter(function (t) { return t.key !== 'floor' && t.key !== 'wall'; });
      for (var n = 0; n < Math.min(items.length, (w - 2) * (h - 1)); n++) deco[(1 + Math.floor(n / (w - 2))) * w + 1 + n % (w - 2)] = til.id + ':' + items[n].key;
    }
    return { w: w, h: h, ground: ground, deco: deco };
  };

  // ---------------------------------------------------------------- Quick Build
  ART.quickBuild.register({ key: 'tiles', label: 'Tilesets, priority, and backgrounds', order: 40, run: function (b, r) {
    if (!P.master(b)) return;
    TL.syncAnimTypes(b, r);
    TL.buildTilesets(b, r);
    TL.syncPriority(b, r);
    TL.buildBackgrounds(b, r);
  } });

  // ---------------------------------------------------------------- validation
  Kit.validate.register('art.tiles', function (b, ctx) {
    var recs = b.art && U.isObj(b.art.records) ? b.art.records : {};
    function list(p) { return U.isObj(recs[p]) ? Object.keys(recs[p]).map(function (k) { return recs[p][k]; }).filter(U.isObj) : []; }
    function add(id, path, msg, level) { ctx.add({ recordId: id, fieldPath: path, message: msg, level: level || 'error' }); }
    var n = P.entries(b).length, T0 = S.tileSize(b), reg = b.art && U.isObj(b.art.tileAnimTypes) ? b.art.tileAnimTypes : {};
    function idxOk(v) { return typeof v === 'number' && v === Math.floor(v) && v >= 0 && v < n; }
    function flagsOk(v) { return typeof v === 'number' && v === Math.floor(v) && v >= 0 && v <= 63; }
    function checkAnim(id, path, a) {
      if (a == null) return;
      if (!U.isObj(a)) { add(id, path, 'An animation is {type, technique, params} or null.'); return; }
      if (!reg[a.type] && !ET.ANIM_TYPES[a.type]) add(id, path + '.type', 'Animation type ' + a.type + ' is not in the tile animation registry.');
      if (a.technique && ET.TECHNIQUES.indexOf(a.technique) < 0) add(id, path + '.technique', 'Technique must be ' + ET.TECHNIQUES.join(', ') + '.');
      if (a.params && a.params.mat && !ET.RAMPS[a.params.mat]) add(id, path + '.params.mat', 'The cycled material must be A to F.');
    }
    function checkPx(id, path, px, w, h) {
      if (!px) return;
      var v = ENGINE_RENDER.codec.validate(px.d, px.w || w, px.h || h, 31);
      if (!v.ok) add(id, path, 'Hand drawn pixels do not decode: ' + v.error);
      else if ((px.w && px.w !== w) || (px.h && px.h !== h)) add(id, path, 'Hand drawn pixels were made at another tile size and are resampled to ' + w + ' by ' + h + '.', 'warning');
    }
    var biomeIds = {};
    list('til_').forEach(function (t) {
      if (t.kind !== 'biome' && t.kind !== 'interior') { add(t.id, 'kind', 'Tileset kind must be biome or interior.'); return; }
      var pal = t.pal && U.isObj(recs.pal_) ? recs.pal_[t.pal] : null;
      if (!pal) add(t.id, 'pal', 'Palette ' + (t.pal || '(none)') + ' does not exist. Run Quick Build.');
      else if (pal.layout !== 'tile' || !Array.isArray(pal.slots) || pal.slots.length !== ET.SLOTS) add(t.id, 'pal', 'A tileset palette has the tile layout and 32 slots.');
      if (t.kind === 'biome') {
        biomeIds[t.id] = 1;
        var c = t.climate;
        if (!U.isObj(c)) add(t.id, 'climate', 'A biome needs climate keys.');
        else ['temp', 'moist', 'elev'].forEach(function (k) {
          var v = c[k];
          if (!(Array.isArray(v) && v.length === 2 && v.every(function (x) { return x === Math.floor(x) && x >= 0 && x <= 4; }) && v[0] <= v[1])) add(t.id, 'climate.' + k, 'Climate ' + k + ' is a range [low, high] of whole steps from 0 to 4.');
        });
        if (typeof t.priority !== 'number' || !isFinite(t.priority)) add(t.id, 'priority', 'Priority is a number (higher biomes draw over lower ones).');
        var g = t.templates && t.templates.gen;
        if (!(t.templates && (t.templates.px || g))) add(t.id, 'templates', 'A biome needs a generator or hand drawn template.');
        else if (g && !ET.STYLES[g.style]) add(t.id, 'templates.gen.style', 'Unknown tile style ' + g.style + '.');
        if (t.templates) checkPx(t.id, 'templates.px', t.templates.px, 2 * T0, 3 * T0);
        if (!flagsOk(t.flags)) add(t.id, 'flags', 'Flags are a bit field from 0 to 63.');
        (Array.isArray(t.fillVariants) ? t.fillVariants : []).forEach(function (v, i) { if (!U.isObj(v) || !(v.weight >= 0 && v.weight <= 1) || (v.mode && v.mode !== 'reseed' && v.mode !== 'deco')) add(t.id, 'fillVariants.' + i, 'A fill variant is {weight from 0 to 1, mode reseed or deco}.'); });
        if ((Array.isArray(t.fillVariants) ? t.fillVariants : []).reduce(function (s2, v) { return s2 + (Number(v && v.weight) || 0); }, 0) > 1) add(t.id, 'fillVariants', 'Fill variant weights add up to more than 1.', 'warning');
        checkAnim(t.id, 'anim', t.anim);
      } else {
        var seen = {};
        if (!Array.isArray(t.tiles) || !t.tiles.length) { add(t.id, 'tiles', 'An interior set needs tiles.'); return; }
        t.tiles.forEach(function (it, i) {
          if (!U.isObj(it) || !it.key) { add(t.id, 'tiles.' + i, 'Each tile has a key.'); return; }
          if (seen[it.key]) add(t.id, 'tiles.' + i + '.key', 'Tile key ' + it.key + ' appears twice.');
          seen[it.key] = 1;
          var st = it.gen && it.gen.style;
          if (!it.px && !(it.autotile ? ET.STYLES[st] : ET.ISTYLES[st])) add(t.id, 'tiles.' + i + '.gen.style', 'Unknown ' + (it.autotile ? 'autotile' : 'tile') + ' style ' + st + '.');
          checkPx(t.id, 'tiles.' + i + '.px', it.px, it.autotile ? 2 * T0 : T0, it.autotile ? 3 * T0 : T0);
          if (!flagsOk(it.flags)) add(t.id, 'tiles.' + i + '.flags', 'Flags are a bit field from 0 to 63.');
          checkAnim(t.id, 'tiles.' + i + '.anim', it.anim);
        });
        if (!seen.floor) add(t.id, 'tiles', 'An interior set should have a floor tile (walls draw over it).', 'warning');
      }
      var sj = t.subject;
      if (!sj || sj.kind !== 'role' || !/^(biome|interior):./.test(sj.ref)) add(t.id, 'subject', 'A tileset subject is a role biome:<key> or interior:<key>.', 'warning');
    });
    var pri = b.art && Array.isArray(b.art.priority) ? b.art.priority : [];
    pri.forEach(function (id, i) { if (!biomeIds[id]) add(id, 'art.priority.' + i, 'The priority list names ' + id + ', which is not a biome tileset.'); });
    Object.keys(biomeIds).forEach(function (id) { if (pri.indexOf(id) < 0) add(id, 'priority', 'This biome is missing from the priority list. Run Quick Build or reorder it on the World Art tab.', 'warning'); });
    var anyTil = (list('til_')[0] || {}).id || null;
    Object.keys(reg).forEach(function (k) { var a = reg[k]; if (anyTil && (!U.isObj(a) || ET.TECHNIQUES.indexOf(a.technique) < 0)) ctx.add({ recordId: anyTil, fieldPath: 'art.tileAnimTypes.' + k, message: 'Animation type ' + k + ' needs a technique of ' + ET.TECHNIQUES.join(', ') + '.', level: 'error' }); });
    var roles = {};
    list('til_').forEach(function (t) { if (t.subject) roles[t.subject.ref] = 1; });
    list('bgd_').forEach(function (r) {
      if (!Array.isArray(r.layers) || !r.layers.length) { add(r.id, 'layers', 'A background needs at least one layer.'); return; }
      r.layers.forEach(function (L, i) {
        if (!U.isObj(L) || ENGINE_RENDER.bg.KINDS.indexOf(L.kind) < 0) { add(r.id, 'layers.' + i + '.kind', 'Layer kind must be ' + ENGINE_RENDER.bg.KINDS.join(', ') + '.'); return; }
        var st = L.gen && L.gen.style;
        if (ENGINE_RENDER.bg.STYLES[L.kind].indexOf(st) < 0) add(r.id, 'layers.' + i + '.gen.style', 'A ' + L.kind + ' layer style must be ' + ENGINE_RENDER.bg.STYLES[L.kind].join(', ') + '.');
        if (!(L.parallax >= 0 && L.parallax <= 1)) add(r.id, 'layers.' + i + '.parallax', 'Parallax runs from 0 to 1.');
        if (L.gen && Array.isArray(L.gen.colors) && n && !L.gen.colors.every(idxOk)) add(r.id, 'layers.' + i + '.gen.colors', 'Layer colors must be master palette indices.');
      });
      if (r.subject && r.subject.kind === 'role' && !roles[r.subject.ref]) add(r.id, 'subject.ref', 'This background belongs to ' + r.subject.ref + ', which has no tileset.', 'warning');
    });
  });
  function goWorld(rid) { if (!Kit.go('world')) return false; if (ART.WS.world && ART.WS.world.focus) ART.WS.world.focus(rid); return true; }
  Kit.jump.register({
    test: function (rid) { var p = Kit.ids.prefixOf(rid); return p === 'til_' || p === 'bgd_'; },
    name: function (rid) { var r = ART.records.get(rid); return r ? r.name : rid; },
    go: goWorld
  });
})();
// === ART:TILES END ===
