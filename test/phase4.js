// Phase 4 acceptance: tiles. The blob mask and the 47 tile table, compose47 at every size, biome and interior
// generators, flags, priority transitions, the three tile animation techniques, battle backgrounds, the test room
// and its walker, the tile records and their Quick Build step, the art.tiles validator, the World Art and Playtest
// tabs, the self test, and the Day 146 round trip.
'use strict';
const fs = require('fs');
const path = require('path');
const { boot } = require('./boot');
const { in146 } = require('./compat146');
const APP147 = path.join(__dirname, '..', 'index.html');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); }
function mockCtx(w, h) {
  const c = { ops: { fillRect: 0, drawImage: 0 }, globalAlpha: 1, fillStyle: '#000', imageSmoothingEnabled: true, canvas: { width: w || 256, height: h || 224 },
    fillRect(x, y, ww, hh) { if (![x, y, ww, hh].every(Number.isFinite)) throw new Error('non finite fillRect'); c.ops.fillRect++; },
    drawImage() { c.ops.drawImage++; }, createImageData(ww, hh) { return { width: ww, height: hh, data: new Uint8ClampedArray(ww * hh * 4) }; },
    putImageData() {}, save() {}, restore() {}, translate() {} };
  return c;
}

(async () => {
  const html = fs.readFileSync(APP147, 'utf8');
  // 0. Static checks.
  const nonAscii = [];
  html.split('\n').forEach((l, i) => { if (/[^\x00-\x7e]/.test(l)) nonAscii.push(i + 1); });
  check('index.html is pure ASCII', !nonAscii.length, nonAscii.slice(0, 5));
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  let syntaxOk = true; try { new Function(script); } catch (e) { syntaxOk = e.message; }
  check('script parses', syntaxOk === true, syntaxOk);
  const fences = ['KIT:CORE', 'ART:STORE', 'ART:DEMO', 'ART:CONTRACT', 'ENGINE:RENDER', 'ART:PALETTE', 'WS:PALETTE', 'ART:SPRITES', 'ART:PIXED', 'WS:SPRITES', 'WS:INTERFACE', 'ART:MOTION', 'WS:MOTION', 'ART:TILES', 'WS:WORLD', 'WS:PLAYTEST', 'WS:ART147', 'APP:BOOT'];
  const at = fences.map((f) => script.indexOf('// === ' + f + ' BEGIN ==='));
  check('fences present in order, ART:TILES, WS:WORLD, WS:PLAYTEST before WS:ART147', at.every((x, i) => x >= 0 && (i === 0 || x > at[i - 1])), at);
  check('every fence opens and closes once', fences.every((f) => script.split('// === ' + f + ' BEGIN ===').length === 2 && script.split('// === ' + f + ' END ===').length === 2));
  check('ART:WORLD CSS fence present', html.split('/* === ART:WORLD CSS BEGIN === */').length === 2 && html.split('/* === ART:WORLD CSS END === */').length === 2);
  const eng = script.slice(script.indexOf('// === ENGINE:RENDER BEGIN ==='), script.indexOf('// === ENGINE:RENDER END ==='));
  check('ENGINE:RENDER (with the tile sections) reads no host globals', eng.indexOf('PHASE 4: TILES') > 0 && !/(?<![.\w$])(Kit|ART|window|document|localStorage|indexedDB|requestAnimationFrame|performance|ENGINE_AUDIO|ENGINE_BATTLE)\b(?!\s*:)/.test(eng.replace(/\/\/.*$/gm, '')));
  check('no forbidden APIs (roundRect, ellipse, confirm, bare remove)', !/\.roundRect\(|\.ellipse\(|window\.confirm|\bconfirm\(\s*['"]|[^a-zA-Z.]remove\(\)|\)\.remove\(\)/.test(script.replace(/\/\/.*$/gm, '')));

  let { win, errors } = boot(APP147, { url: 'https://augustineiacopelli.github.io/appaday/147/?dev=1' });
  await wait(80);
  let Kit = win.Kit, ART = win.ART, ER = win.ENGINE_RENDER, ET = ER.tiles;
  check('boots with no page errors', !errors.length, errors.slice(0, 2));
  check('ENGINE_RENDER frozen with tiles and bg', Object.isFrozen(ER) && Object.isFrozen(ER.tiles) && Object.isFrozen(ER.bg));

  // 1. The blob table.
  check('47 distinct tiles, isolated first and full last', ET.BLOB.length === 47 && ET.BLOB[0] === 0 && ET.BLOB[46] === 255 && ET.BLOB_FULL === 46);
  let allMap = true;
  for (let m = 0; m < 256; m++) { const i = ET.blobIndex(m); if (i < 0 || i > 46 || ET.BLOB[i] !== ET.reduce(m)) allMap = false; }
  check('every one of 256 masks maps through the corner rule', allMap);
  check('a diagonal counts only with both edges', ET.reduce(2) === 0 && ET.reduce(1 | 2 | 4) === 7 && ET.reduce(1 | 2) === 1 && ET.reduce(255) === 255);
  const quarters = new Set();
  let parity = true;
  ET.BLOB.forEach((rm) => [0, 1, 2, 3].forEach((k) => { const q = ET.quarterFor(rm, k); quarters.add(q.join(',')); if ((q[0] & 1) !== (k & 1) || (q[1] & 1) !== (k >> 1)) parity = false; }));
  check('compose uses exactly 20 template quarters (4 inner, 16 in the 2 by 2 block), parity kept', quarters.size === 20 && parity, [...quarters].sort().join(' '));
  // compose47 with a labeled template: each quarter carries its own value.
  const sizes = [8, 9, 16, 24, 32, 64];
  let composeOk = true;
  sizes.forEach((T) => {
    const W = 2 * T, H = 3 * T, q0 = T >> 1, tm = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const qx = Math.floor(x / T) * 2 + ((x % T) >= q0 ? 1 : 0), qy = Math.floor(y / T) * 2 + ((y % T) >= q0 ? 1 : 0); tm[y * W + x] = 1 + qy * 4 + qx; }
    ET.BLOB.forEach((rm) => {
      const t = ET.compose(tm, T, rm);
      [[0, 0], [T - 1, 0], [0, T - 1], [T - 1, T - 1]].forEach((p, k) => { const q = ET.quarterFor(rm, k); if (t[p[1] * T + p[0]] !== 1 + q[1] * 4 + q[0]) composeOk = false; });
    });
  });
  check('compose picks the right quarter at every corner at 8, 9 (odd), 16, 24, 32, and 64 px', composeOk);
  const grid = { w: 3, h: 3, cells: [1, 1, 0, 1, 1, 0, 0, 0, 0] };
  check('mask8 reads neighbors and repeats edge cells off the map', ET.mask8(grid, 0, 0, (a, b) => a === b) === 255, ET.mask8(grid, 0, 0, (a, b) => a === b));
  check('mask8 sees a missing neighbor', ET.mask8(grid, 1, 1, (a, b) => a === b) === (1 | 64 | 128));

  // 2. Records from Quick Build on the demo.
  Kit.bundle.load(win.ART_DEMO.bundle());
  const rep = ART.quickBuild.run();
  const b = Kit.bundle.current(), TL = ART.tiles, ent = ART.palette.entries(b);
  const biomes = TL.biomes(b), ints = TL.interiors(b), bgs = TL.backgrounds(b);
  check('Quick Build makes 12 biomes, 2 interiors, and 14 backgrounds', biomes.length === 12 && ints.length === 2 && bgs.length === 14 && rep.steps.tiles, { biomes: biomes.length, ints: ints.length, bgs: bgs.length, step: rep.steps.tiles });
  check('every tileset has a 32 slot tile palette', TL.tilesets(b).every((t) => { const p = TL.palFor(b, t); return p && p.slots.length === 32 && p.slots[0] === null && p.slots.slice(1).every((s) => s >= 0 && s < ent.length); }));
  const pri = b.art.priority.map((id) => ART.records.get(id).key);
  check('priority list holds every biome, lowest first', pri.join(' ') === 'ocean coast swamp grassland steppe desert forest rainforest tundra snow mountain volcanic', pri.join(' '));
  check('animation registry has five types with techniques', ['liquid', 'flame', 'flow', 'foliage', 'mechanism'].every((k) => b.art.tileAnimTypes[k] && ET.TECHNIQUES.includes(b.art.tileAnimTypes[k].technique)));
  check('climate keys and flags follow the plan table', TL.biome(b, 'desert').climate.temp.join() === '3,4' && TL.biome(b, 'mountain').flags === 0 && TL.biome(b, 'ocean').flags === 4 && TL.biome(b, 'volcanic').climate.feature === 'volcanic' && TL.biome(b, 'volcanic').flags === 11);
  check('interior sets carry floors, walls, doors, stairs, counters, and furnishings', ints.every((t) => ['floor', 'wall', 'door', 'stairs', 'counter'].every((k) => ET.item(t, k))) && ints.every((t) => t.tiles.length >= 10));
  let v = Kit.validate.summary(Kit.validate(b));
  check('the demo validates clean after Quick Build', !v.errors && !v.broken && !v.warnings, v);
  const art1 = JSON.stringify(b.art);
  const rep2 = ART.quickBuild.run();
  check('Quick Build is idempotent', rep2.steps.tiles.created === 0 && JSON.stringify(b.art) === art1, rep2.steps.tiles);

  // 3. Climate matching.
  const want = { '2,1,2': 'grassland', '4,0,3': 'desert', '0,1,2': 'tundra', '0,3,3': 'snow', '2,4,2': 'swamp', '4,4,2': 'rainforest', '3,2,0': 'ocean', '2,2,1': 'coast', '1,2,4': 'mountain', '2,2,2': 'grassland', '2,3,3': 'forest', '2,0,3': 'steppe' };
  const got = Object.keys(want).map((k) => { const p = k.split(',').map(Number); const t = ET.matchClimate(biomes, p[0], p[1], p[2]); return k + '=' + (t && t.key); });
  check('matchClimate picks the tightest box', got.every((g) => want[g.split('=')[0]] === g.split('=')[1]), got.join(' '));
  check('feature biomes never match by climate; gaps fall back to the nearest box', ![[3, 2, 4], [4, 1, 3]].some((p) => (ET.matchClimate(biomes, p[0], p[1], p[2]) || {}).key === 'volcanic') && !!ET.matchClimate(biomes, 4, 2, 2));

  // 4. Generators: every style at every size; full tiles are opaque, isolated tiles have clear corners; variants keep
  // the border so neighbors still match.
  let genOk = true, genWhy = [];
  const timeT = {};
  [8, 16, 24, 32, 64].forEach((T) => {
    const t0 = Date.now();
    TL.tilesets(b).forEach((t) => {
      if (t.kind === 'biome') {
        const all = ET.compose47(b.art, t, T, null), full = all[46], iso = all[0];
        if (all.length !== 47 || full.some((x) => x === 0)) { genOk = false; genWhy.push(t.key + '@' + T + ' full'); }
        if (iso[0] !== 0 || iso[T * T - 1] !== 0) { genOk = false; genWhy.push(t.key + '@' + T + ' iso'); }
        (t.fillVariants || []).forEach((fv, vi) => {
          const vt = ET.tile(b.art, t, 46, 0, null, vi + 1, T, null), band = Math.max(1, ET.detailCell(T) * 2);
          for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if ((x < band || y < band || x >= T - band || y >= T - band) && vt[y * T + x] !== full[y * T + x]) { if (genOk) genWhy.push(t.key + '@' + T + ' variant ' + (vi + 1) + ' border'); genOk = false; return; }
        });
      } else t.tiles.forEach((it) => { const ti = ET.tile(b.art, t, it.autotile ? 46 : 0, 0, it.key, 0, T, null); if (ti.length !== T * T || ti.every((x) => x === 0)) { genOk = false; genWhy.push(t.key + ':' + it.key + '@' + T); } });
    });
    timeT[T] = Date.now() - t0;
  });
  check('every biome and interior tile generates at 8, 16, 24, 32, and 64 px; variants keep their border', genOk, genWhy.slice(0, 5));
  check('generating every tileset at 64 px takes under 4 s', timeT[64] < 4000, timeT);
  const fullFill = ET.compose47(b.art, TL.biome(b, 'grassland'), 16, null)[46];
  check('a full fill repeats without a seam (its texture is periodic)', (() => { const t = ET.template(b.art, TL.biome(b, 'grassland'), 16, 0, null); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (t.idx[(16 + 8 + y % 8) * 32 + 8 + x % 8] !== fullFill[(8 + y % 8) * 16 + 8 + x % 8]) return false; return true; })());

  // 5. Animation techniques.
  const ocean = TL.biome(b, 'ocean'), forest = TL.biome(b, 'forest'), dungeon = TL.interior(b, 'dungeon');
  const ao = ET.anim(b.art, ocean.anim), af = ET.anim(b.art, forest.anim), ach = ET.anim(b.art, ET.item(dungeon, 'channel').anim), ato = ET.anim(b.art, ET.item(dungeon, 'torch').anim);
  check('animOf resolves technique, frames (at most 4), and ms', ao.technique === 'cycle' && ao.frames === 4 && af.technique === 'phase' && af.frames === 2 && ach.technique === 'scroll' && ach.frames === 4 && ato.frames === 4);
  check('frameAt steps by ms and wraps', ET.frameAt(b.art, ocean.anim, 0) === 0 && ET.frameAt(b.art, ocean.anim, ao.ms) === 1 && ET.frameAt(b.art, ocean.anim, ao.ms * 4) === 0 && ET.frameAt(b.art, null, 999) === 0);
  const sl = TL.palFor(b, ocean).slots, s1 = ET.cycleSlots(sl, ao, 1), E = ET.RAMPS.E;
  check('palette cycle rotates only the cycled material', s1[E[0]] === sl[E[1]] && s1[E[3]] === sl[E[0]] && s1[ET.RAMPS.A[0]] === sl[ET.RAMPS.A[0]] && ET.cycleSlots(sl, ao, 0) === sl);
  const ch0 = ET.tile(b.art, dungeon, 46, 0, 'channel', 0, 16, null), ch1 = ET.tile(b.art, dungeon, 46, 1, 'channel', 0, 16, null);
  const f0 = ET.tile(b.art, forest, 46, 0, null, 0, 16, null), f1 = ET.tile(b.art, forest, 46, 1, null, 0, 16, null);
  const o0 = ET.tile(b.art, ocean, 46, 0, null, 0, 16, null), o1 = ET.tile(b.art, ocean, 46, 1, null, 0, 16, null);
  const diff = (a, c) => a.some((x, i) => x !== c[i]);
  check('scroll and phase change the pixels; cycle keeps them', diff(ch0, ch1) && diff(f0, f1) && !diff(o0, o1));
  const k16 = ER.createCache(b.art, { size: 16, entries: ent, budget: 64e6 });
  const c0 = k16.tile(ocean.id, 46, 0), c1 = k16.tile(ocean.id, 46, 1);
  check('the cache bakes cycle frames as different colors over the same pixels', c0 && c1 && c0.rgba.some((x, i) => x !== c1.rgba[i]) && !diff(c0.idx, c1.idx));

  // 6. Cache: lazy, keyed, capped.
  const kc = ER.createCache(b.art, { size: 32, entries: ent, budget: 200000 });
  for (let i = 0; i < 47; i++) kc.tile(forest.id, i, 0);
  const stc = kc.stats();
  check('the tile cache bakes lazily and evicts to its budget', stc.bytes <= 200000 + 32 * 32 * 5 && stc.evictions > 0 && stc.templates >= 1, stc);
  kc.invalidate(forest.id);
  check('invalidate drops a tileset\'s tiles and templates', kc.stats().templates === 0);
  check('a missing tileset bakes nothing', kc.tile('til_nope_zzzz', 0, 0) === null);

  // 7. Maps: flags, priority transitions, the above layer.
  const room = TL.room(b, 7, 40, 30);
  check('the test room places a town house and a dungeon ruin and starts on a walkable cell', room.town && room.ruin && (ET.flagsAt(b.art, room, room.start[0], room.start[1]) & 1), { town: room.town, ruin: room.ruin, start: room.start });
  check('the test room is deterministic per seed', JSON.stringify(TL.room(b, 7, 40, 30).ground) === JSON.stringify(room.ground) && JSON.stringify(TL.room(b, 8, 40, 30).ground) !== JSON.stringify(room.ground));
  const keysUsed = new Set(room.ground.filter((g) => g && g.indexOf(':') < 0).map((id) => ART.records.get(id).key));
  check('the default seed shows at least seven biomes', keysUsed.size >= 7, [...keysUsed].join(' '));
  const town = TL.interior(b, 'town'), tr = room.town;
  const fl = (dx, dy) => ET.flagsAt(b.art, room, tr.x + dx, tr.y + dy);
  check('flags: wall blocks, door and floor pass, counter blocks, beam over the door passes', !(fl(0, 0) & 1) && (fl(4, 6) & 1) && (fl(4, 6) & 32) && (fl(4, 3) & 1) && !(fl(1, 3) & 1) && (fl(1, 3) & 16));
  check('flags: ocean swims but does not pass on foot; off the map is 0', (ET.flagsAt(b.art, room, 0, 0) & 4) && !(ET.flagsAt(b.art, room, 0, 0) & 1) && ET.flagsAt(b.art, room, -1, 0) === 0);
  const mc = mockCtx(), kd = ER.createCache(b.art, { size: 16, entries: ent, makeCanvas: () => ({ getContext: () => null }), budget: 64e6 });
  // A 3 by 3 patch: forest in the middle of grassland draws two layers in the middle, one at the edges.
  const g = TL.biome(b, 'grassland').id, fo = forest.id;
  const patch = { w: 3, h: 3, ground: [g, g, g, g, fo, g, g, g, g], deco: Array(9).fill(null) };
  const pst = ET.drawMap(mc, kd, patch, { x: 0, y: 0, w: 48, h: 48 }, 0);
  check('a higher biome draws over the lower one, which shows through', pst.cells === 9 && pst.blits === 10, pst);
  const flip = { w: 3, h: 3, ground: [fo, fo, fo, fo, g, fo, fo, fo, fo], deco: Array(9).fill(null) };
  const fst = ET.drawMap(mc, kd, flip, { x: 0, y: 0, w: 48, h: 48 }, 0);
  check('a lower biome hole in a higher one: neighbors stack, the hole draws once', fst.blits === 9 + 8, fst);
  const ab = ET.drawMap(mockCtx(), kd, room, { x: 0, y: 0, w: room.w * 16, h: room.h * 16 }, 0, { layer: 'above' });
  check('the above pass draws only above layer tiles (the beam and the arch)', ab.blits === 2, ab);
  const camSt = ET.drawMap(mockCtx(), kd, room, { x: 64, y: 32, w: 256, h: 224 }, 0);
  check('drawMap draws only the cells the camera sees', camSt.cells === 16 * 14, camSt);

  // 8. The walker.
  const PT = ART.WS.playtest;
  const wk = PT.createWalker(b.art, room, [tr.x + 4, tr.y + 5]);
  for (let i = 0; i < 80; i++) wk.step(20, 'up');
  check('the walker stops at a wall', wk.y === tr.y + 1 && wk.blocked && wk.blocked[1] === tr.y, { y: wk.y, top: tr.y, blocked: wk.blocked });
  let hurt = 0;
  const rr = room.ruin, wk2 = PT.createWalker(b.art, room, [rr.x + 3, rr.y + 2], { arrive: (w, f) => { if (f & 8) hurt++; } });
  for (let i = 0; i < 20; i++) wk2.step(20, 'right');
  check('stepping onto spikes reports a damage floor', hurt >= 1 && wk2.steps >= 1, { hurt, steps: wk2.steps, x: wk2.x - rr.x });

  // 9. Backgrounds.
  let bgOk = true;
  bgs.forEach((r) => { const c = mockCtx(256, 224); try { const out = ER.bg.draw(c, r, 1234, 256, 224, { entries: ent }); if (!(out.horizon > 0) || c.ops.fillRect < 50) bgOk = false; } catch (e) { bgOk = e.message; } });
  check('every background draws with finite rectangles', bgOk === true, bgOk);
  check('background layers use known kinds and styles with palette colors', bgs.every((r) => r.layers.every((L) => ER.bg.KINDS.includes(L.kind) && ER.bg.STYLES[L.kind].includes(L.gen.style) && L.gen.colors.every((m) => m >= 0 && m < ent.length))));

  // 10. Edits survive, duplicates join, deletes stick, the master rebuild refits.
  const des = TL.biome(b, 'desert');
  des.flags = 3 | 8; des.origin = 'user';
  const dup = TL.duplicate(b, TL.biome(b, 'forest'));
  dup.climate = { temp: [2, 2], moist: [3, 3], elev: [3, 3], feature: null };
  ART.quickBuild.run();
  check('an edited tileset survives Quick Build', TL.biome(b, 'desert').flags === 11);
  check('a duplicate is a new biome with its own palette, background, and priority slot', dup.subject.ref !== 'biome:forest' && TL.palFor(b, dup) && TL.bgFor(b, dup) && b.art.priority.includes(dup.id) && b.art.priority.indexOf(dup.id) === b.art.priority.indexOf(TL.biome(b, 'forest').id) + 1);
  check('an invented biome takes the cells its tighter box describes', ET.matchClimate(TL.biomes(b), 2, 3, 3).id === dup.id);
  const sw = TL.biome(b, 'swamp');
  TL.remove(b, sw);
  ART.quickBuild.run();
  check('a deleted default stays deleted and leaves the priority list', !TL.biome(b, 'swamp') && !b.art.priority.includes(sw.id) && b.art.settings.retired.includes('biome:swamp'));
  const ids = b.art.priority.slice(); const x = ids[1]; ids[1] = ids[2]; ids[2] = x;
  TL.setOrder(b, ids);
  check('reordering renumbers priorities to match', b.art.priority.every((id, i) => ART.records.get(id).priority === i));
  const coastPal = TL.palFor(b, TL.biome(b, 'coast'));
  coastPal.origin = 'user';
  ART.palette.buildMaster(b, { force: true, seed: 991 });
  const ent2 = ART.palette.entries(b);
  check('a master rebuild refits tile palettes and backgrounds to valid indices', TL.tilesets(b).every((t) => TL.palFor(b, t).slots.slice(1).every((s) => s >= 0 && s < ent2.length)) && TL.backgrounds(b).every((r) => r.layers.every((L) => L.gen.colors.every((m) => m >= 0 && m < ent2.length))));
  v = Kit.validate.summary(Kit.validate(b));
  check('still validates clean after edits, a duplicate, a delete, a reorder, and a rebuild', !v.errors && !v.broken, v);

  // 11. Hand drawn templates.
  const gr = TL.biome(b, 'grassland'), tmpl = ET.template(b.art, gr, 16, 0, null);
  tmpl.idx[16 * 32] = 1;
  gr.templates.px = { w: 32, h: 48, d: ER.codec.encode(tmpl.idx) };
  check('a hand drawn template composes all 47 tiles', ET.template(b.art, gr, 16, 0, null).px && ET.compose47(b.art, gr, 16, null)[0][0] === 1 && !Kit.validate(b).warnings.some((w) => w.fieldPath === 'templates.px'));
  gr.templates.px = { w: 64, h: 96, d: ER.codec.encode(ET.template(b.art, Object.assign({}, gr, { templates: { gen: gr.templates.gen } }), 32, 0, null).idx) };
  check('a hand drawn template made at another size resamples (with a warning)', ET.template(b.art, gr, 16, 0, null).resampled && Kit.validate(b).warnings.some((w) => w.fieldPath === 'templates.px'));
  delete gr.templates.px;

  // 12. The validator catches each broken field.
  const bad = win.JSON.parse(win.JSON.stringify(b));
  const recs = bad.art.records, tid = (k) => Object.keys(recs.til_).find((id) => recs.til_[id].key === k);
  recs.til_[tid('forest')].climate.temp = [3, 1];
  recs.til_[tid('desert')].templates.gen.style = 'plaid';
  recs.til_[tid('ocean')].flags = 99;
  recs.til_[tid('coast')].anim = { type: 'wobble' };
  recs.til_[tid('town')].tiles.push({ key: 'floor', gen: { style: 'planks' }, flags: 1 });
  recs.bgd_[Object.keys(recs.bgd_)[0]].layers[0].parallax = 3;
  recs.bgd_[Object.keys(recs.bgd_)[1]].layers[1].gen.style = 'volcano';
  bad.art.priority.push('til_ghost_zzzz');
  const vr = Kit.validate(bad), msgs = [];
  Object.keys(vr.byRecord || {}).forEach((id) => (vr.byRecord[id] || []).forEach((m) => msgs.push(m.fieldPath + ': ' + m.message)));
  const wantFields = ['climate.temp', 'templates.gen.style', 'flags', 'anim.type', 'key', 'parallax', 'gen.style', 'art.priority'];
  check('the art.tiles validator catches each broken field', wantFields.every((w) => msgs.some((m) => m.split(':')[0].indexOf(w) >= 0)), wantFields.filter((w) => !msgs.some((m) => m.split(':')[0].indexOf(w) >= 0)));

  // 13. The World Art tab and the Playtest tab.
  Kit.bundle.load(win.ART_DEMO.bundle()); ART.quickBuild.run();
  const b2 = Kit.bundle.current(), WS = ART.WS.world, counts = {};
  for (const sub of ['tilesets', 'interiors', 'priority', 'anims', 'backgrounds']) {
    WS.ui.sub = sub; Kit.go('world'); Kit.rerender();
    counts[sub] = win.document.querySelectorAll('#ws .a7-row, #ws .a7-tilecell').length;
  }
  check('every World Art view renders its rows', counts.tilesets === 12 && counts.interiors === 2 + TL.interiors(b2).reduce((s, t) => s + t.tiles.length, 0) && counts.priority === 12 && counts.anims === 5 && counts.backgrounds === 14, counts);
  WS.openTileset(TL.biome(b2, 'forest').id);
  check('the tileset drawer shows a live patch, the 47 sheet, and the template', win.document.querySelectorAll('.drawer .a7-stage').length >= 1 && win.document.querySelectorAll('.drawer canvas').length >= 3);
  const flagBox = Array.from(win.document.querySelectorAll('.drawer input[type="checkbox"]'))[3];
  flagBox.checked = true; flagBox.dispatchEvent(new win.Event('change', { bubbles: true }));
  check('a flag toggle in the drawer edits the tileset and marks it yours', (TL.biome(b2, 'forest').flags & 8) && TL.biome(b2, 'forest').origin === 'user');
  Kit.ui.closeTop();
  WS.openItem(TL.interior(b2, 'dungeon').id, 'torch');
  check('the interior tile drawer opens with an animated preview', win.document.querySelectorAll('.drawer .a7-stage').length >= 1);
  Kit.ui.closeTop();
  WS.openBackground(TL.backgrounds(b2)[0].id);
  check('the background drawer opens with a preview and layer controls', win.document.querySelectorAll('.drawer .a7-stage').length >= 1 && win.document.querySelectorAll('.drawer .a7-layer').length >= 3);
  Kit.ui.closeTop();
  WS.ui.sub = 'priority'; Kit.go('world'); Kit.rerender();
  const before = b2.art.priority.slice();
  win.document.querySelectorAll('#ws .a7-row .a7-acts .btn')[1].click();
  check('the Priority view moves a biome up one place', b2.art.priority[0] === before[1] && b2.art.priority[1] === before[0]);
  check('jump goes to the World Art tab for til_ and bgd_', Kit.jump(TL.interior(b2, 'town').id) !== false && WS.ui.sub === 'interiors' && Kit.jump(TL.backgrounds(b2)[0].id) !== false && WS.ui.sub === 'backgrounds');
  PT.ui.sub = 'room'; Kit.go('playtest'); Kit.rerender();
  check('the Playtest tab mounts the test room with a canvas, a direction pad, and a readout', win.document.querySelectorAll('.a7-room-cv').length === 1 && win.document.querySelectorAll('.a7-dpad .btn').length === 4 && /cell/.test(win.document.querySelector('.a7-room-hud').textContent));
  // Phase 5 filled the Battle and Window preview views that were stubs here; phase5.js tests them in depth.
  const filled = ['battle', 'window'].map((s) => { PT.ui.sub = s; Kit.rerender(); return !win.document.querySelector('#ws .stub, #ws [class*="stub"]') && !!win.document.querySelector('#ws canvas'); });
  check('Battle and Window preview are live (filled by Phase 5)', filled.every(Boolean));
  win.close();

  // 14. Live: the stage loop walks the room with the keyboard and the direction pad, with a 2D context.
  ({ win, errors } = boot(APP147, { url: 'https://augustineiacopelli.github.io/appaday/147/?dev=1', setup: (w) => { w.HTMLCanvasElement.prototype.getContext = function () { const c = mockCtx(this.width, this.height); c.canvas = this; return c; }; } }));
  await wait(80);
  win.Kit.bundle.load(win.ART_DEMO.bundle()); win.ART.quickBuild.run();
  for (const sub of ['tilesets', 'interiors', 'anims', 'backgrounds']) { win.ART.WS.world.ui.sub = sub; win.Kit.go('world'); win.Kit.rerender(); await wait(150); }
  let stErr = Array.from(win.document.querySelectorAll('canvas[data-err]')).map((c) => c.dataset.err);
  check('World Art stages run through requestAnimationFrame with no drawing errors', win.ART.motion.stageCount() > 0 && !stErr.length && !errors.length, { stErr: stErr.slice(0, 2), errors: errors.slice(0, 2) });
  win.ART.WS.playtest.ui.sub = 'room'; win.Kit.go('playtest'); win.Kit.rerender(); await wait(60);
  const rm = win.ART.WS.playtest.room(), x0 = rm.walker.x, y0 = rm.walker.y;
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  await wait(700);
  win.document.dispatchEvent(new win.KeyboardEvent('keyup', { key: 'ArrowDown', bubbles: true }));
  const moved = rm.walker.y !== y0 || rm.walker.blocked;
  check('arrow keys walk the room through the live loop', moved && rm.walker.dir === 'down', { from: [x0, y0], to: [rm.walker.x, rm.walker.y], blocked: rm.walker.blocked });
  const padUp = win.document.querySelector('.a7-dpad-up');
  const ev = (t) => { const e = new win.Event(t, { bubbles: true }); e.pointerId = 1; return e; };
  padUp.dispatchEvent(ev('pointerdown')); await wait(450); padUp.dispatchEvent(ev('pointerup'));
  check('the direction pad walks too', rm.walker.dir === 'up', rm.walker.dir);
  stErr = Array.from(win.document.querySelectorAll('canvas[data-err]')).map((c) => c.dataset.err);
  check('the test room draws with no errors', !stErr.length && !errors.length, { stErr: stErr.slice(0, 2), errors: errors.slice(0, 2) });
  win.Kit.go('start'); await wait(100);
  check('the loop stops when the room leaves the screen', win.ART.motion.stageCount() === 0);
  win.close();

  // 15. Day 146 round trip and the manifest.
  ({ win, errors } = boot(APP147, { url: 'https://augustineiacopelli.github.io/appaday/147/?dev=1' }));
  await wait(80);
  win.Kit.bundle.load(win.ART_DEMO.bundle()); win.ART.quickBuild.run();
  const draft = win.Kit.buildExport('draft');
  const r146 = await in146(draft.files[0].text, (w, K) => { const a = K.bundle.current().art; return { til: Object.keys(a.records.til_ || {}).length, bgd: Object.keys(a.records.bgd_ || {}).length, priority: (a.priority || []).length }; });
  check('146 imports a 147 draft with tile records: hash ok, no errors', r146.matches && !r146.summary.errors && !r146.summary.broken && r146.til === 14 && r146.bgd === 14 && r146.priority === 12, r146);
  const man = JSON.parse(draft.files[1].text);
  check('manifest counts til_ and bgd_', man.counts.til_ === 14 && man.counts.bgd_ === 14, man.counts);

  // 16. Fixtures self test.
  const st = win.ART_DEMO.selfTest();
  check('every fixture builds tiles with no validation errors', st.every((r) => !r.validation.errors && !r.validation.broken && (r.key === 'F0' || (r.tiles && r.tiles.biomes === 12 && r.tiles.interiors === 2 && r.tiles.town))), st.map((r) => r.key + ':' + JSON.stringify(r.validation) + ':' + (r.tiles ? r.tiles.biomes + '/' + r.tiles.town + '/' + r.tiles.ruin : '-')).join(' | '));
  const f3 = st.find((r) => r.key === 'F3'), f1a = st.find((r) => r.key === 'F1a');
  check('F1a (8 px, two colors) bakes every tile', f1a.tiles && f1a.tiles.tiles > 700, f1a.tiles);
  check('F3 (64 px) bakes every tile in under 15 s', f3.tiles && f3.tiles.ms < 15000, f3.tiles);
  win.close();

  const pass = results.filter((r) => r.ok).length;
  results.forEach((r) => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail))));
  console.log('\nSelf test (tiles):');
  st.forEach((r) => console.log('  ' + r.key.padEnd(5) + ' ' + (r.tiles ? (r.tiles.tiles + ' tiles in ' + r.tiles.ms + ' ms').padEnd(26) + (Math.round(r.tiles.bytes / 1024) + ' KB if all kept').padEnd(20) + ' room ' + r.tiles.roomMs + ' ms, ' + r.tiles.walkable + '/' + r.tiles.cells + ' walkable' : 'no tiles')));
  console.log('\n' + pass + ' of ' + results.length + ' passed');
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'phase4-report.json'), JSON.stringify({ date: new Date().toISOString(), pass, total: results.length, results, selfTest: st }, null, 2));
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
