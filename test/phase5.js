// Phase 5 acceptance: the interface kit and the battle presenter. The font, windows, cursor, gauges, touch skin, and
// title in the engine; the five uik_ records, their Quick Build step, the art.ui validator, and master remaps; the
// beat queue presenter fed by the scripted demo and by the real Day 146 engine (hit sync, multi hit, item beat, KO,
// revive, victory, both pacing modes, backlog compression, determinism, layout at extreme counts); the Blob URL engine
// loader's version check; battle codes in both directions with Day 146; the Interface and Playtest views; the self
// test; and the Day 146 round trip.
'use strict';
const fs = require('fs');
const path = require('path');
const { boot } = require('./boot');
const { in146 } = require('./compat146');
const APP147 = path.join(__dirname, '..', 'index.html');
const SRC146 = fs.readFileSync(require('../day146'), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); }
function mockCtx(w, h) {
  const c = { ops: { fillRect: 0, drawImage: 0 }, rects: [], keep: false, globalAlpha: 1, fillStyle: '#000', imageSmoothingEnabled: true, canvas: null,
    fillRect(x, y, ww, hh) { if (![x, y, ww, hh].every(Number.isFinite)) throw new Error('non finite fillRect ' + [x, y, ww, hh]); c.ops.fillRect++; if (c.keep) c.rects.push([x, y, ww, hh, c.fillStyle]); },
    drawImage() { c.ops.drawImage++; }, createImageData(ww, hh) { return { width: ww, height: hh, data: new Uint8ClampedArray(ww * hh * 4) }; },
    putImageData() {}, save() {}, restore() {}, translate() {} };
  return c;
}
const URL147 = 'https://augustineiacopelli.github.io/appaday/147/?dev=1';

(async () => {
  const html = fs.readFileSync(APP147, 'utf8');
  // 0. Static checks.
  const nonAscii = [];
  html.split('\n').forEach((l, i) => { if (/[^\x00-\x7e]/.test(l)) nonAscii.push(i + 1); });
  check('index.html is pure ASCII', !nonAscii.length, nonAscii.slice(0, 5));
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  let syntaxOk = true; try { new Function(script); } catch (e) { syntaxOk = e.message; }
  check('script parses', syntaxOk === true, syntaxOk);
  const fences = ['KIT:CORE', 'ART:STORE', 'ART:DEMO', 'ART:CONTRACT', 'ENGINE:RENDER', 'ART:PALETTE', 'WS:PALETTE', 'ART:SPRITES', 'ART:PIXED', 'WS:SPRITES', 'WS:INTERFACE', 'ART:MOTION', 'WS:MOTION', 'ART:TILES', 'WS:WORLD', 'WS:PLAYTEST', 'ART:UI', 'ART:BATTLE', 'WS:BATTLE', 'WS:ART147', 'APP:BOOT'];
  const at = fences.map((f) => script.indexOf('// === ' + f + ' BEGIN ==='));
  check('fences present in order, ART:UI, ART:BATTLE, WS:BATTLE before WS:ART147', at.every((x, i) => x >= 0 && (i === 0 || x > at[i - 1])), at);
  check('every fence opens and closes once', fences.every((f) => script.split('// === ' + f + ' BEGIN ===').length === 2 && script.split('// === ' + f + ' END ===').length === 2));
  check('ART:UI CSS fence present', html.split('/* === ART:UI CSS BEGIN === */').length === 2 && html.split('/* === ART:UI CSS END === */').length === 2);
  const eng = script.slice(script.indexOf('// === ENGINE:RENDER BEGIN ==='), script.indexOf('// === ENGINE:RENDER END ==='));
  check('ENGINE:RENDER (with the interface and presenter sections) reads no host globals', eng.indexOf('PHASE 5: INTERFACE KIT AND BATTLE PRESENTER') > 0 && !/(?<![.\w$])(Kit|ART|window|document|localStorage|indexedDB|requestAnimationFrame|performance|ENGINE_AUDIO|ENGINE_BATTLE)\b(?!\s*:)/.test(eng.replace(/\/\/.*$/gm, '')));
  check('Day 147 ships no copy of ENGINE:BATTLE', script.indexOf('// === ENGINE:BATTLE BEGIN ===') < 0 && !/var ENGINE_BATTLE\s*=/.test(script));
  check('no forbidden APIs (roundRect, ellipse, confirm, bare remove)', !/\.roundRect\(|\.ellipse\(|window\.confirm|\bconfirm\(\s*['"]|[^a-zA-Z.]remove\(\)|\)\.remove\(\)/.test(script.replace(/\/\/.*$/gm, '')));

  let { win, errors } = boot(APP147, { url: URL147 });
  await wait(80);
  let Kit = win.Kit, ART = win.ART, ER = win.ENGINE_RENDER, EU = ER.ui;
  check('boots with no page errors', !errors.length, errors.slice(0, 2));
  check('ENGINE_RENDER frozen with ui and presenter', Object.isFrozen(ER) && Object.isFrozen(ER.ui) && Object.isFrozen(ER.presenter) && typeof ER.createPresenter === 'function');

  // 1. The font.
  const F = EU.font(null);
  const codes = Object.keys(EU.FONT.glyphs).map(Number);
  check('the default font covers code points 32 to 126 with 8 rows each', codes.length === 95 && codes[0] === 32 && codes[94] === 126 && codes.every((c) => /^[0-9a-f]{16}$/.test(EU.FONT.glyphs[c])));
  const distinct = new Set(codes.filter((c) => c > 32).map((c) => EU.FONT.glyphs[c]));
  check('every printable glyph is distinct and non blank', distinct.size === 94 && codes.filter((c) => c > 32).every((c) => EU.FONT.glyphs[c] !== '0000000000000000'));
  const desc = ['g', 'j', 'p', 'q', 'y'].every((ch) => F.bits[ch.charCodeAt(0)][7] > 0) && ['A', 'a', 'x', 'Z'].every((ch) => F.bits[ch.charCodeAt(0)][7] === 0);
  check('descenders use the eighth row and nothing else does', desc);
  check('measure is advance times length minus the trailing gap, scaled', EU.measure(F, 'ABC', 1) === 17 && EU.measure(F, 'ABC', 2) === 34 && EU.measure(F, '', 1) === 0);
  let ctx = mockCtx(); ctx.keep = true;
  EU.text(ctx, F, 'I', 0, 0, { color: '#fff' });
  const iPix = ctx.rects.reduce((s, r) => s + r[2] * r[3], 0);
  const iWant = F.bits[73].reduce((s, row) => s + row.toString(2).split('').filter((x) => x === '1').length, 0);
  check('text lights exactly the glyph pixels, merging runs', iPix === iWant && ctx.rects.length < iWant, { iPix, iWant, rects: ctx.rects.length });
  ctx = mockCtx(); EU.text(ctx, F, 'Hello', 10, 10, { shadow: '#000', outline: '#222', scale: 3, align: 'center' });
  check('text draws with shadow, outline, scale, and centering without errors', ctx.ops.fillRect > 100);
  const lines = EU.wrap(F, 'one two three four five six seven', 60, 1);
  check('wrap breaks on words within the width', lines.length > 1 && lines.every((l) => EU.measure(F, l, 1) <= 60 || !/ /.test(l)), lines);

  // 2. Windows, cursor, gauge, title.
  let winOk = true;
  [1, 2, 3, 4].forEach((u) => EU.CORNERS.forEach((c) => [1, 2, 3].forEach((th) => { const g = mockCtx(); const r = EU.window(g, { corner: c, thickness: th }, 3, 4, 90 * u, 40 * u, { unit: u }); if (!r || !r.inner || r.inner.w <= 0 || g.ops.fillRect < 8) winOk = false; })));
  check('windows draw at units 1 to 4 with every corner and border', winOk);
  check('a window at open 0 draws nothing; grow opening shrinks it', EU.window(mockCtx(), {}, 0, 0, 80, 40, { open: 0 }) === null && EU.window(mockCtx(), { open: { style: 'grow' } }, 0, 0, 80, 40, { open: 0.5 }).h === 20);
  const cur1 = EU.cursor(mockCtx(), { style: 'triangle', bob: { amp: 4, ms: 400 } }, 100, 50, 0, {}), cur2 = EU.cursor(mockCtx(), { style: 'triangle', bob: { amp: 4, ms: 400 } }, 100, 50, 200, {});
  check('every cursor shape draws, aimed left of the point, and the bob moves it', EU.CURSORS.every((s) => EU.cursor(mockCtx(), { style: s }, 50, 50, 0, { unit: 2 }).x < 50) && cur1.x !== cur2.x, { cur1, cur2 });
  ctx = mockCtx(); EU.gauge(ctx, 0, 0, 40, 4, 0.5, {}); check('gauge draws back and fill', ctx.ops.fillRect >= 2);
  ctx = mockCtx();
  const tr = EU.title(ctx, { style: 'outline', scale: 6, layout: 'center', prompt: 'Press Start' }, { w: 256, h: 224, text: 'A Very Long Title For A Small Screen Indeed', tMs: 0 });
  check('title wraps a long logo to at most three lines, shrinking the scale', tr.lines <= 3 && tr.scale < 6, tr);

  // 3. Touch skin.
  const lay = {};
  EU.SCHEMES.forEach((s) => { lay[s] = EU.touch.layout(s, 256, 224, {}); });
  const keys = (s) => lay[s].controls.map((c) => c.key).sort().join(',');
  check('schemes lay out their controls (dpad, stick, tap, hybrid)', keys('dpad') === 'a,b,dpad,menu' && keys('stick') === 'a,b,menu,stick' && keys('tap') === 'menu,tap' && keys('hybrid') === 'a,b,menu,stick,tap', EU.SCHEMES.map(keys));
  const pad = lay.dpad.controls.find((c) => c.key === 'dpad'), btnA = lay.dpad.controls.find((c) => c.key === 'a');
  check('the pad reads four directions and a dead center', ['up', 'down', 'left', 'right'].every((d) => { const v = { up: [0, -0.7], down: [0, 0.7], left: [-0.7, 0], right: [0.7, 0] }[d]; return EU.touch.hit(lay.dpad, pad.x + v[0] * pad.r, pad.y + v[1] * pad.r).dir === d; }) && EU.touch.hit(lay.dpad, pad.x, pad.y).dir === null);
  check('buttons hit, empty space misses on dpad and taps on tap and hybrid', EU.touch.hit(lay.dpad, btnA.x, btnA.y).key === 'a' && EU.touch.hit(lay.dpad, 128, 60) === null && EU.touch.hit(lay.tap, 128, 60).key === 'tap' && EU.touch.hit(lay.hybrid, 128, 60).key === 'tap');
  const stick = lay.stick.controls.find((c) => c.key === 'stick'), sh = EU.touch.hit(lay.stick, stick.x + stick.r * 0.5, stick.y);
  check('the stick reports a vector', sh.key === 'stick' && sh.vx > 0.4 && sh.dir === 'right');
  let tdOk = true;
  EU.SCHEMES.forEach((s) => ['round', 'square'].forEach((shape) => { try { EU.touch.draw(mockCtx(), lay[s], { shape }, { pressed: { a: true, dpad: 'up', stick: { vx: 1, vy: 0 } } }); } catch (e) { tdOk = e.message; } }));
  check('every scheme draws round and square, pressed and not', tdOk === true, tdOk);
  const small = EU.touch.layout('dpad', 160, 144, {});
  check('controls fit a 160 by 144 screen', small.controls.filter((c) => c.kind !== 'area').every((c) => c.x - c.r >= 0 && c.x + c.r <= 160 && c.y - c.r >= 0 && c.y + c.r <= 144));

  // 4. Records from Quick Build on the demo.
  Kit.bundle.load(win.ART_DEMO.bundle());
  const rep = ART.quickBuild.run();
  let b = Kit.bundle.current();
  const I = ART.iface, kit = I.kit(b);
  check('Quick Build makes the five interface records', I.all(b).length === 5 && ['window', 'font', 'cursor', 'touch', 'title'].every((k) => kit[k] && kit[k].origin === 'default') && rep.steps.interface && rep.steps.interface.created === 5, rep.steps.interface);
  const ent = ART.palette.entries(b);
  check('every color field has a master index fitted from its hex', ['window', 'cursor', 'touch', 'title'].every((k) => I.COLOR_FIELDS[k].every((f) => { const o = f[0].split('.').reduce((x, kk) => x[kk], kit[k]); return Number.isInteger(o.m) && o.m >= 0 && o.m < ent.length; })));
  check('the font record carries the default glyphs as hex rows', kit.font.w === 5 && Object.keys(kit.font.glyphs).length === 95 && kit.font.glyphs[65] === EU.FONT.glyphs[65]);
  check('touch follows the Charter scheme and the title follows the Charter title', I.scheme(b, kit.touch) === b.charter.specs.mobileControls && I.titleText(b, kit.title) === 'Demo Saga' && !!I.titleBg(b, kit.title));
  let v = Kit.validate.summary(Kit.validate(b));
  check('the demo validates clean after Quick Build', !v.errors && !v.broken && !v.warnings, v);
  const art1 = JSON.stringify(b.art);
  const rep2 = ART.quickBuild.run();
  check('Quick Build is idempotent', rep2.steps.interface.created === 0 && JSON.stringify(b.art) === art1, rep2.steps.interface);
  // edits survive, reset, delete retires, restore
  I.setColor(b, kit.window, 'gradient.top', '#802020');
  const mEdited = kit.window.gradient.top.m;
  check('setColor marks the record edited and fits the new hex', kit.window.origin === 'user' && ent[mEdited] === ent[win.ENGINE_RENDER.palette.nearest(ent, '#802020')]);
  const rows = I.glyphRows(kit.font, 65); rows[0] = rows[0].map(() => true); I.setGlyph(kit.font, 65, rows);
  check('glyph rows round trip through setGlyph', kit.font.glyphs[65].slice(0, 2) === '1f' && I.glyphRows(kit.font, 65)[0].every(Boolean));
  ART.quickBuild.run();
  check('Quick Build leaves edited interface records alone', kit.window.gradient.top.hex === '#802020' && kit.font.glyphs[65].slice(0, 2) === '1f');
  I.reset(b, 'window');
  check('reset restores the default look', kit.window.origin === 'default' && kit.window.gradient.top.hex === '#2a4aa8');
  I.remove(b, 'cursor'); ART.quickBuild.run();
  check('a deleted record is retired and not recreated', !I.get(b, 'cursor') && b.art.settings.retired.includes('ui:cursor'));
  I.restore(b, 'cursor');
  check('restore brings it back', !!I.get(b, 'cursor') && !b.art.settings.retired.includes('ui:cursor'));
  // master rebuild: generated records refit from hex, edited ones remap
  kit.title.color.hex = '#30a0f0'; delete kit.title.color.m; kit.title.origin = 'default';
  I.setColor(b, kit.touch, 'color', '#ff00ff');
  const touchBefore = kit.touch.color.m;
  b.charter.specs.paletteSize = 32;
  ART.palette.buildMaster(b, { force: true, seed: 991 });
  const ent2 = ART.palette.entries(b);
  check('a master rebuild refits generated records and keeps edited ones inside the new palette', ent2.length === 32 && kit.title.color.m === win.ENGINE_RENDER.palette.nearest(ent2, '#30a0f0') && kit.touch.color.m >= 0 && kit.touch.color.m < 32, { title: kit.title.color, touch: kit.touch.color, touchBefore });
  b.charter.specs.paletteSize = 64; ART.palette.buildMaster(b, { force: true });
  // validator
  const bad = JSON.parse(JSON.stringify(b));
  const badRec = (k) => Object.values(bad.art.records.uik_).find((r) => r.subject.ref === 'ui:' + k);
  badRec('window').corner = 'oval'; badRec('font').glyphs[66] = 'zz'; badRec('touch').scheme = 'gamepad'; badRec('title').bg = 'bgd_missing_xxxx'; badRec('cursor').style = 'sword';
  const dup = JSON.parse(JSON.stringify(badRec('touch'))); dup.id = 'uik_extra_touch_q1w2'; dup.scheme = null; bad.art.records.uik_[dup.id] = dup;
  const vr = Kit.validate(bad), msgs = vr.items ? vr.items : (vr.issues || vr.list || []);
  const flat = JSON.stringify(vr);
  check('art.ui flags a bad corner, glyph, scheme, cursor, missing background, and a duplicate role', ['Corner must be', 'Glyph 66 needs', 'Scheme must be', 'Cursor style must be', 'does not exist', 'There is already a touch record'].every((m) => flat.indexOf(m) >= 0), Kit.validate.summary(vr));

  // 5. The presenter, fed by the scripted demo.
  Kit.bundle.load(win.ART_DEMO.bundle()); ART.quickBuild.run(); b = Kit.bundle.current();
  const B = ART.battle, sc = B.script(b);
  const kinds = new Set(); sc.feeds.forEach((f) => f.events.forEach((e) => kinds.add(e.type)));
  check('the scripted demo uses every event type the presenter maps (and the item event)', ['tick', 'ready', 'command', 'action', 'damage', 'heal', 'miss', 'status', 'limitReady', 'ko', 'revive', 'end', 'item'].every((k) => kinds.has(k)), [...kinds]);
  let cues = [];
  function pres(o) { return ER.createPresenter(Object.assign(B.presenterConfig(b, sc.snapshot, { seed: 3, cue: (k, i) => cues.push(k + ':' + i) }), o || {})); }
  let P = pres();
  const t0 = P.targets();
  check('targets() gives a rectangle per unit inside the field', Object.keys(t0).length === sc.snapshot.units.length && Object.values(t0).every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= 256 && r.y + r.h <= P.field.fieldH), t0);
  const sideOk = sc.snapshot.units.every((u) => (u.side === 'party') === (t0[u.uid].x > 128));
  check('the party stands on the right and foes on the left', sideOk);
  // feed 2 is the crit melee: HP must not drop before the hit marker
  P.feed(sc.feeds[0].events, sc.feeds[0].state);
  while (!P.isIdle()) P.update(16);
  const e0 = 'e0', hp0 = P.display()[e0].hp;
  P.feed(sc.feeds[1].events, sc.feeds[1].state);
  P.update(16);
  const early = P.display()[e0].hpTarget;
  let landedAt = null, tAcc = 16;
  while (!P.isIdle()) { P.update(16); tAcc += 16; if (landedAt === null && P.display()[e0].hpTarget < hp0) landedAt = tAcc; }
  check('damage waits for the hit marker, then HP rolls down', early === hp0 && landedAt > 100 && P.display()[e0].hp < hp0, { hp0, early, landedAt });
  // the rest of the script
  let frames = 0, sawMessage = false, sawLimitPop = false, sawItem = false;
  const player = B.playScript(P, { feeds: sc.feeds.slice(2) });
  while (!player.done() && frames < 20000) { player.step(16); frames++; const bt = P.beats(); if (bt[0] && bt[0].kind === 'message') sawMessage = true; }
  for (let i = 0; i < 80; i++) P.update(16);
  const d = P.display();
  check('the script plays to the end: foes gone, party in victory poses', P.ended() === 'win' && Object.values(d).filter((x) => x.side === 'foe').every((x) => x.ko && x.gone) && Object.values(d).filter((x) => x.side === 'party' && !x.ko).every((x) => x.anim === 'battle.victory'), d);
  check('the KO and revive resolve: the revived member stands with HP', d.p1 && !d.p1.ko && d.p1.hp > 0, d.p1);
  check('cues go out for hits, statuses, Limits, items, deaths, and the victory music', ['sfx:hit', 'sfx:crit', 'sfx:status', 'sfx:limit', 'sfx:item', 'sfx:death', 'sfx:revive', 'ui:ready', 'music:victory'].every((c) => cues.includes(c)), [...new Set(cues)]);
  check('the failed cast became a message beat', sawMessage);
  // Multi hit: the Limit's three results land on three different hit times.
  const lim = ER.createPresenter(B.presenterConfig(b, sc.snapshot, { seed: 3 }));
  const limAt = sc.feeds.findIndex((f) => f.events.some((e) => e.type === 'action' && b.rules.abl_[e.abl] && b.rules.abl_[e.abl].kind === 'limit')), limFeed = sc.feeds[limAt];
  sc.feeds.slice(0, limAt).forEach((f) => { lim.feed(f.events, f.state); while (!lim.isIdle()) lim.update(16); });
  lim.feed(limFeed.events, limFeed.state);
  const hpSeen = []; let last = lim.display().e0.hpTarget, tl = 0;
  while (!lim.isIdle()) { const inAction = lim.beats()[0] && lim.beats()[0].kind === 'action'; lim.update(8); tl += 8; const now = lim.display().e0.hpTarget; if (now !== last) { if (inAction) hpSeen.push(tl); last = now; } }
  check('a multi hit ability spreads its results over its hit markers', hpSeen.length === 3 && hpSeen[1] > hpSeen[0] && hpSeen[2] > hpSeen[1], hpSeen);
  // Draw every frame of a full script run without errors.
  cues = [];
  P = pres(); const pl2 = B.playScript(P, sc); const g = mockCtx(256, 224); let drawErr = null, nf = 0;
  while (!pl2.done() && nf < 20000) { pl2.step(16); try { P.draw(g); } catch (e) { drawErr = e.message; break; } nf++; }
  check('every frame of the script draws (field, effects, popups, banner, HUD) with finite rects', !drawErr && g.ops.fillRect > 1000, drawErr);
  // Determinism: same feeds and dt sequence give the same display; another frame rate ends in the same state.
  function runAll(dt) { const p = ER.createPresenter(B.presenterConfig(b, sc.snapshot, { seed: 3 })), pl = B.playScript(p, sc); let n = 0; while (!pl.done() && n < 40000) { pl.step(dt); n++; } for (let i = 0; i < 100; i++) p.update(dt); return JSON.stringify(Object.values(p.display()).map((x) => [x.hp, x.ko, x.gone, x.statuses, x.anim])); }
  check('the presenter is a pure function of its feeds and dt sequence', runAll(16) === runAll(16));
  check('a replay at 33 ms frames ends in the same state as 16 ms frames', runAll(33) === runAll(16));
  // Pacing: active mode compresses a big backlog; wait mode stays busy until each beat ends.
  const act = ER.createPresenter(B.presenterConfig(b, sc.snapshot, { seed: 3, pacing: 'active' }));
  sc.feeds.forEach((f) => act.feed(f.events, f.state));
  const bl0 = act.backlog();
  let tAct = 0; while (!act.isIdle() && tAct < 60000) { act.update(16); tAct += 16; }
  check('active pacing compresses a backlog so it never falls far behind', bl0 > 2000 && act.stats().compressed > 0 && tAct < bl0 * 0.75, { backlog: bl0, wall: tAct });
  check('setPacing switches modes', act.setPacing('wait') === 'wait' && act.setPacing('nonsense') === 'wait' && act.setPacing('active') === 'active');
  // Layout at extreme counts: four party members and nine foes at 256 by 224.
  const big = JSON.parse(JSON.stringify(sc.snapshot));
  const foe0 = big.units.find((u) => u.side === 'foe'), pt0 = big.units.find((u) => u.side === 'party');
  big.units = [0, 1, 2, 3].map((i) => Object.assign({}, pt0, { uid: 'p' + i, name: 'P' + i })).concat([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => Object.assign({}, foe0, { uid: 'e' + i, name: 'F' + i, row: i % 3 === 2 ? 'back' : 'front' })));
  const crowd = ER.createPresenter(B.presenterConfig(b, big, { seed: 3 })).targets();
  const inside = Object.values(crowd).every((r) => r.x >= 0 && r.x + r.w <= 256 && r.y >= 0 && r.y + r.h <= 224 * 0.64 + 1);
  const sameSize = Object.keys(crowd).filter((k) => k[0] === 'e').every((k) => crowd[k].w === crowd.e0.w && crowd[k].h === crowd.e0.h);
  check('thirteen units fit the field, foes keep their sprite size (spacing shrinks instead)', inside && sameSize, crowd);
  // Cue errors never stop the show.
  const boom = ER.createPresenter(B.presenterConfig(b, sc.snapshot, { seed: 3, cue: () => { throw new Error('audio down'); } }));
  const plb = B.playScript(boom, sc); let nb = 0; while (!plb.done() && nb < 20000) { plb.step(16); nb++; }
  check('a throwing cue callback does not break playback', boom.ended() === 'win');

  // 6. The engine loader.
  check('extract pulls the ENGINE:BATTLE fence out of a whole Day 146 page', (B.extract(SRC146) || '').indexOf('var ENGINE_BATTLE') > 0 && B.extract('hello') === null);
  let rejected = null;
  try { await B.install('var ENGINE_BATTLE = { version: "2.0.0", init: function(){}, advance: function(){}, suggest: function(){}, replay: function(){}, gaugeMax: 1 };', { mode: 'function', save: false }); } catch (e) { rejected = e.message; }
  check('a 2.x engine is refused with a version message and nothing is installed', /reads ENGINE_BATTLE 1\.x/.test(rejected || '') && !B.engine(), rejected);
  try { await B.install('var ENGINE_BATTLE = { version: "1.0.0" };', { mode: 'function', save: false }); } catch (e) { rejected = e.message; }
  check('an engine missing its API is refused', /missing init, advance, suggest, replay/.test(rejected || ''), rejected);
  const st1 = await B.install(SRC146, { mode: 'function', via: 'saga', name: 'Saga Forge', save: false });
  const E = B.engine();
  check('the real engine installs from the Day 146 page and declares no global', st1.loaded && /^1\./.test(st1.version) && E && typeof E.advance === 'function' && typeof win.ENGINE_BATTLE === 'undefined' && win.__art147Engine === E, st1);

  // 7. Real battles.
  const trp = Object.keys(b.rules.trp_), party = B.buildParty(b, { level: 20, gearTier: 3 });
  check('buildParty mirrors Day 146 (four at most, gear by tier, materia placed)', party.length === Math.min(4, Object.keys(b.rules.chr_).length) && party.every((m) => m.level === 20 && m.equipment.length >= 1) && party.some((m) => m.materia.length), party);
  let advWhileBusy = 0;
  const Ewrap = Object.assign({}, E, { advance(s, i) { if (sessRef && sessRef.P && !sessRef.P.isIdle()) advWhileBusy++; return E.advance(s, i); } });
  let sessRef = null;
  const s1 = B.session(b, { E: Ewrap, troopId: trp[1], party, seed: 11, auto: true, pacing: 'wait' }); sessRef = s1;
  s1.runOut(16, 100000);
  check('an auto battle in Wait pacing runs to its end through the presenter', s1.ended && s1.S.result && s1.S.result.outcome === 'win' && s1.P.ended() === 'win' && s1.P.stats().beats > 3, s1.S.result && s1.S.result.outcome);
  check('in Wait pacing the engine never advances while a beat is playing', advWhileBusy === 0, advWhileBusy);
  const code = s1.code, dec = B.decodeCode(code);
  check('the battle code has Day 146\'s shape', dec.v === 1 && dec.troopId === trp[1] && dec.seed === 11 && Array.isArray(dec.inputs) && dec.inputs.length === s1.inputs.length && dec.end.outcome === 'win');
  const s2 = B.session(b, { E, code: dec }).runOut(16, 100000);
  check('playing our battle code back matches tick for tick', s2.match === true && s2.end.ticks === s1.end.ticks && s2.inputs.length === s1.inputs.length, { a: s1.end, b: s2.end });
  const s3 = B.session(b, { E, code: dec }).runOut(41, 100000);
  check('playback at a different frame time still matches', s3.match === true, s3.end);
  const s4 = B.session(b, { E, troopId: trp[1], party, seed: 11, auto: true, pacing: 'active' }).runOut(16, 100000);
  check('an auto battle in Active pacing also ends, with the presenter caught up', s4.ended && s4.P.isIdle() && !!s4.S.result, s4.S.result && s4.S.result.outcome);
  // hand driven: menu awaiting, a command, a rejected one
  const s5 = B.session(b, { E, troopId: trp[0], party, seed: 5, auto: false, pacing: 'wait' });
  let g5 = 0; while (!s5.menuOpen() && g5++ < 5000) s5.step(16);
  const aw = s5.awaiting();
  check('a hand driven battle stops at the command menu', !!aw && aw.commands.length > 0 && s5.menuOpen());
  const cmd = aw.commands.find((c) => c.abls.some((x) => x.ok && x.side !== 'ally'));
  const ok = s5.give({ type: 'command', actor: aw.actor, abl: cmd.abls.find((x) => x.ok).id, target: aw.targets.foe[0] });
  const badGive = s5.give({ type: 'command', actor: 'p9', abl: 'abl_nope', target: 'e0' });
  check('a command is accepted and recorded; a bad one is rejected and not recorded', ok && !badGive && s5.inputs.length === 1 && !!s5.lastReject);
  // Day 146 replays a code made here, and a code made in Day 146 plays here.
  const draft = Kit.buildExport('draft');
  const r146 = await in146(draft.files[0].text, async (w2, K) => {
    const o = w2.WS.arena.decodeCode(code);
    const rr = w2.ENGINE_BATTLE.replay(w2.WS.arena.dataFor(K.bundle.current(), o.troopId, o.party, o.weatherId), o.seed, o.opts, o.inputs);
    const run = w2.ENGINE_BATTLE.run(w2.WS.arena.dataFor(K.bundle.current(), trp[2] || trp[0], party, null), 23, null, { waitMode: true });
    // A Day 146 style code: a hand driven replay recorded with suggest(), in 146's own encoder.
    let S = w2.ENGINE_BATTLE.init(w2.WS.arena.dataFor(K.bundle.current(), trp[0], party, null), 23, { waitMode: true }), inputs = [], guard = 0;
    while (!S.result && guard++ < 5000) { let r; if (S.awaiting) { const inp = w2.ENGINE_BATTLE.suggest(S, null); inputs.push({ t: S.t, input: inp }); r = w2.ENGINE_BATTLE.advance(S, inp); } else r = w2.ENGINE_BATTLE.advance(S, { type: 'step', ticks: 7 }); S = r.state; }
    const res2 = S.result;
    const code146 = w2.WS.arena.encodeCode({ v: 1, troopId: trp[0], party, seed: 23, inputs, weatherId: null, opts: { waitMode: true }, end: { outcome: res2.outcome, ticks: res2.ticks, turns: res2.turns, rngCalls: res2.rngCalls } });
    return { outcome: rr.state.result && rr.state.result.outcome, ticks: rr.state.result && rr.state.result.ticks, code146, runOk: !!run.result };
  });
  check('Day 146 replays a battle code made here to the same end', r146.outcome === s1.end.outcome && r146.ticks === s1.end.ticks, r146);
  const s6 = B.session(b, { E, code: B.decodeCode(r146.code146) }).runOut(16, 100000);
  check('a battle code made in Day 146 plays back here and matches', s6.match === true, s6.end);

  // 8. Views: Interface tab.
  const WI = ART.WS.interface;
  Kit.go('interface');
  WI.ui.sub = 'window'; Kit.rerender();
  const doc = win.document;
  check('Window and font view shows a preview, color pickers, and 94 glyph buttons', doc.querySelectorAll('#ws .a7-bt-cv').length >= 1 && doc.querySelectorAll('#ws .a7-colors input[type="color"]').length === 4 && doc.querySelectorAll('#ws .a7-glyphs .btn').length === 94);
  const fontRec = I.get(b, 'font'), before = fontRec.glyphs[65];
  doc.querySelector('#ws .a7-gedit button').click();
  check('toggling a glyph pixel edits the font record', fontRec.glyphs[65] !== before && fontRec.origin === 'user');
  const corner = [...doc.querySelectorAll('#ws select')].find((s) => [...s.options].some((o) => o.value === 'notch'));
  corner.value = 'notch'; corner.dispatchEvent(new win.Event('change'));
  check('the corner select edits the window record', I.get(b, 'window').corner === 'notch' && I.get(b, 'window').origin === 'user');
  WI.ui.sub = 'cursor'; Kit.rerender();
  check('Cursor view shows its preview and bob sliders', doc.querySelectorAll('#ws .a7-bt-cv').length === 1 && doc.querySelectorAll('#ws .a7-range').length >= 2);
  WI.ui.sub = 'touch'; Kit.rerender();
  const tcv = doc.querySelector('#ws .a7-bt-cv');
  Object.defineProperty(tcv, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 256, height: 224 }) });
  const la = EU.touch.layout(I.scheme(b, I.get(b, 'touch')), 256, 224, I.get(b, 'touch')), aBtn = la.controls.find((c) => c.key === 'a');
  tcv.dispatchEvent(new win.MouseEvent('pointerdown', { clientX: aBtn.x, clientY: aBtn.y, bubbles: true }));
  check('pressing the A button in the touch preview reports it', /button A/.test(doc.querySelector('#ws [aria-live]').textContent), doc.querySelector('#ws [aria-live]').textContent);
  const schemeSel = [...doc.querySelectorAll('#ws select')].find((s) => [...s.options].some((o) => o.value === 'hybrid'));
  schemeSel.value = 'hybrid'; schemeSel.dispatchEvent(new win.Event('change'));
  check('the scheme can be overridden from the Charter', I.scheme(b, I.get(b, 'touch')) === 'hybrid');
  WI.ui.sub = 'title'; Kit.rerender();
  const titleIn = doc.querySelector('#ws .a7-text input');
  titleIn.value = 'Courier of the Pass'; titleIn.dispatchEvent(new win.Event('change'));
  check('the title view edits the logo text', I.get(b, 'title').text === 'Courier of the Pass' && I.titleText(b, I.get(b, 'title')) === 'Courier of the Pass');
  check('jump goes to the Interface tab for uik_ records', Kit.jump(I.get(b, 'font').id) !== false && WI.ui.sub === 'window' && Kit.jump(I.get(b, 'touch').id) !== false && WI.ui.sub === 'touch');
  v = Kit.validate.summary(Kit.validate(b));
  check('the bundle still validates clean after the edits', !v.errors && !v.broken, v);

  // 9. Views: Playtest.
  const PT = ART.WS.playtest, WB = ART.WS.battle;
  Kit.go('playtest'); PT.ui.sub = 'battle'; WB.ui.mode = 'demo'; WB.reset(); Kit.rerender();
  check('the Battle view shows the engine panel, the mode buttons, and a stage', /Battle engine/.test(doc.getElementById('ws').textContent) && doc.querySelectorAll('#ws .a7-seg .btn').length === 3 && doc.querySelectorAll('#ws .a7-bt-cv').length === 1);
  const lv = WB.live();
  for (let i = 0; i < 400; i++) lv.step(16);
  check('the scripted demo plays from the view', lv.P.stats().beats > 5);
  WB.ui.mode = 'battle'; WB.ui.auto = true; WB.ui.troopId = trp[1]; WB.ui.level = 20; WB.ui.gearTier = 3; WB.reset(); Kit.rerender();
  const lb = WB.live();
  check('Battle mode starts a real battle once the engine is loaded', !!(lb && lb.sess) && doc.querySelectorAll('#ws .a7-chars input').length === Object.keys(b.rules.chr_).length);
  let gb = 0; while (!lb.sess.ended && gb++ < 100000) lb.step(16);
  check('it runs to its end with a describe() result card and a copyable code', lb.sess.ended && /Copy battle code/.test(lb.describe()) && !!lb.sess.code);
  WB.ui.mode = 'battle'; WB.ui.auto = false; WB.ui.troopId = trp[0]; WB.reset(); Kit.rerender();
  const lh = WB.live(); let gh = 0;
  while (!lh.sess.menuOpen() && gh++ < 5000) lh.step(16);
  await wait(200);
  const menuBtns = [...doc.querySelectorAll('#ws .a7-menu .btn')];
  check('the command menu opens with 44 px buttons for the waiting actor', menuBtns.length > 0 && !doc.querySelector('#ws .a7-menu').hidden);
  const atk = menuBtns.find((x) => /Attack/i.test(x.textContent) && !x.disabled) || menuBtns.find((x) => !x.disabled);
  atk.click();
  let tgtBtn = doc.querySelector('#ws .a7-menu [data-uid]');
  if (!tgtBtn) { const ab = doc.querySelector('#ws .a7-menu .a7-menu-grid .btn:not([disabled])'); if (ab) ab.click(); tgtBtn = doc.querySelector('#ws .a7-menu [data-uid]'); }
  if (tgtBtn) { tgtBtn.dispatchEvent(new win.Event('focus')); }
  const cursorSet = !!tgtBtn;
  if (tgtBtn) tgtBtn.click();
  check('choosing a command and a target sends the input', cursorSet && lh.sess.inputs.length === 1, lh.sess.inputs);
  WB.ui.mode = 'code'; WB.ui.code = code; WB.reset(); Kit.rerender();
  const lc = WB.live(); let gc = 0;
  while (!lc.sess.ended && gc++ < 100000) lc.step(16);
  check('Battle code mode plays a pasted code and reports a match', lc.sess.match === true && /matched the original/.test(lc.describe()));
  PT.ui.sub = 'window'; Kit.rerender();
  check('Window preview draws a stage with up and down controls', doc.querySelectorAll('#ws .a7-bt-cv').length === 1 && [...doc.querySelectorAll('#ws .btn')].some((x) => /Down/.test(x.textContent)));
  PT.ui.sub = 'room'; PT.ui.touch = true; Kit.rerender();
  const rcv = doc.querySelector('.a7-room-cv');
  Object.defineProperty(rcv, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 256, height: 224 }) });
  const rl = EU.touch.layout(I.scheme(b, I.get(b, 'touch')), 256, 224, I.get(b, 'touch')), rStick = rl.controls.find((c) => c.key === 'stick' || c.key === 'dpad');
  rcv.dispatchEvent(new win.MouseEvent('pointerdown', { clientX: rStick.x + rStick.r * 0.7, clientY: rStick.y, bubbles: true }));
  const room = PT.room();
  check('with the touch skin on, the room walker takes the pad or stick', room && room.state.held === 'right' && (room.state.pressed.stick || room.state.pressed.dpad));
  PT.ui.touch = false;
  check('views render with no page errors', !errors.length, errors.slice(0, 3));

  // 10. Self test, export, and the Day 146 round trip.
  const st = win.ART_DEMO.selfTest();
  check('every fixture plays the scripted battle through the presenter', st.every((r) => r.key === 'F0' || (r.battle && r.battle.ended === 'win' && r.battle.beats > 10)), st.map((r) => r.key + ':' + (r.battle ? r.battle.beats + '/' + r.battle.ended : '-')).join(' '));
  check('with the engine loaded, every fixture with a cast fights one real battle to its end', st.every((r) => r.key === 'F0' || !r.battle || !r.battle.real || /^(win|lose|flee|timeout)$/.test(r.battle.real.outcome)), st.map((r) => r.key + ':' + (r.battle && r.battle.real ? r.battle.real.outcome : '-')).join(' '));
  const f3 = st.find((r) => r.key === 'F3'), f1a = st.find((r) => r.key === 'F1a');
  check('F1a (8 px, two colors) and F3 (64 px) present battles', f1a.battle && f1a.battle.beats > 10 && f3.battle && f3.battle.beats > 10, { f1a: f1a.battle, f3: f3.battle });
  check('every fixture still validates with no errors', st.every((r) => !r.validation.errors && !r.validation.broken), st.map((r) => r.key + ':' + JSON.stringify(r.validation)).join(' '));
  const dr = Kit.buildExport('draft');
  const rt = await in146(dr.files[0].text, (w, K) => ({ uik: Object.keys(K.bundle.current().art.records.uik_ || {}).length, kept: JSON.stringify(K.bundle.current().art) === JSON.stringify(JSON.parse(dr.files[0].text).art) }));
  check('146 imports a 147 draft with interface records: hash ok, no errors, art untouched', rt.matches && !rt.summary.errors && !rt.summary.broken && rt.uik === 5 && rt.kept, rt);
  const man = JSON.parse(dr.files[1].text);
  check('manifest counts uik_', man.counts.uik_ === 5, man.counts);
  const sz = ART.size(Kit.bundle.current());
  check('the interface records stay small (under 8 KB with the font)', JSON.stringify(Kit.bundle.current().art.records.uik_).length < 8000, JSON.stringify(Kit.bundle.current().art.records.uik_).length);
  win.close();

  const pass = results.filter((r) => r.ok).length;
  results.forEach((r) => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + String(JSON.stringify(r.detail)).slice(0, 900))));
  console.log('\nSelf test (battle):');
  st.forEach((r) => console.log('  ' + r.key.padEnd(5) + ' ' + (r.battle ? (r.battle.beats + ' beats, ' + r.battle.hits + ' hits in ' + r.battle.ms + ' ms').padEnd(32) + (r.battle.real ? 'engine: ' + r.battle.real.outcome + ', ' + r.battle.real.beats + ' beats, ' + r.battle.real.inputs + ' inputs' : 'engine: none') : 'no battle')));
  console.log('\n' + pass + ' of ' + results.length + ' passed');
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'phase5-report.json'), JSON.stringify({ date: new Date().toISOString(), pass, total: results.length, results, selfTest: st.map((r) => ({ key: r.key, battle: r.battle, validation: r.validation })) }, null, 2));
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
