// Phase 3 acceptance: motion. The full pose sets, the anm_ player and markers, generated enemy deaths, the hurt flash,
// particle systems, screen effects, weather overlays, ability playback, the motion records and their Quick Build step,
// the art.motion validator, the Motion tab, the self test, and the Day 146 round trip.
'use strict';
const fs = require('fs');
const path = require('path');
const { boot } = require('./boot');
const { in146 } = require('./compat146');
const APP147 = path.join(__dirname, '..', 'index.html');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); }

// A 2D context that records what it is asked to draw. Enough of the API for every engine drawing path.
function mockCtx(w, h) {
  const c = { ops: { fillRect: 0, drawImage: 0, putImageData: 0 }, alphas: new Set(), styles: new Set(), stack: [], tx: 0, ty: 0,
    globalAlpha: 1, fillStyle: '#000', imageSmoothingEnabled: true, canvas: null,
    fillRect(x, y, ww, hh) { if (![x, y, ww, hh].every(Number.isFinite)) throw new Error('non finite fillRect'); c.ops.fillRect++; c.alphas.add(c.globalAlpha); c.styles.add(c.fillStyle); },
    drawImage() { c.ops.drawImage++; },
    createImageData(ww, hh) { return { width: ww, height: hh, data: new Uint8ClampedArray(ww * hh * 4) }; },
    putImageData() { c.ops.putImageData++; },
    save() { c.stack.push([c.tx, c.ty, c.globalAlpha]); }, restore() { const s = c.stack.pop() || [0, 0, 1]; c.tx = s[0]; c.ty = s[1]; c.globalAlpha = s[2]; },
    translate(x, y) { c.tx += x; c.ty += y; }
  };
  c.canvas = { width: w || 256, height: h || 224 };
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
  const fences = ['KIT:CORE', 'ART:STORE', 'ART:DEMO', 'ART:CONTRACT', 'ENGINE:RENDER', 'ART:PALETTE', 'WS:PALETTE', 'ART:SPRITES', 'ART:PIXED', 'WS:SPRITES', 'WS:INTERFACE', 'ART:MOTION', 'WS:MOTION', 'WS:ART147', 'APP:BOOT'];
  const at = fences.map((f) => script.indexOf('// === ' + f + ' BEGIN ==='));
  check('fences present in order, ART:MOTION and WS:MOTION before WS:ART147', at.every((x, i) => x >= 0 && (i === 0 || x > at[i - 1])), at);
  check('every fence opens and closes once', fences.every((f) => script.split('// === ' + f + ' BEGIN ===').length === 2 && script.split('// === ' + f + ' END ===').length === 2));
  check('ART:MOTION CSS fence present', html.split('/* === ART:MOTION CSS BEGIN === */').length === 2 && html.split('/* === ART:MOTION CSS END === */').length === 2);
  const eng = script.slice(script.indexOf('// === ENGINE:RENDER BEGIN ==='), script.indexOf('// === ENGINE:RENDER END ==='));
  check('ENGINE:RENDER (with the motion sections) reads no host globals', eng.indexOf('PHASE 3: MOTION') > 0 && !/\b(Kit|ART|window|document|localStorage|indexedDB|requestAnimationFrame|performance|ENGINE_AUDIO|ENGINE_BATTLE)\b/.test(eng.replace(/\/\/.*$/gm, '')));
  check('no forbidden APIs (roundRect, ellipse, confirm, bare remove)', !/\.roundRect\(|\.ellipse\(|window\.confirm|\bconfirm\(\s*['"]|[^a-zA-Z.]remove\(\)|\)\.remove\(\)/.test(script.replace(/\/\/.*$/gm, '')));

  let { win, errors } = boot(APP147, { url: 'https://augustineiacopelli.github.io/appaday/147/?dev=1' });
  await wait(80);
  const Kit = win.Kit, ART = win.ART, ER = win.ENGINE_RENDER, S = ER.sprite, EA = ER.anim;
  check('boots with no page errors', !errors.length, errors.slice(0, 2));
  check('ENGINE_RENDER frozen with anim, draw, fx, weather, ability', Object.isFrozen(ER) && ['anim', 'draw', 'fx', 'weather', 'ability'].every((k) => ER[k] && Object.isFrozen(ER[k])));

  // 1. The player.
  const walk = { kind: 'sprite', loop: true, frames: [{ pose: 'stand', ms: 100 }, { pose: 'stepA', ms: 50 }, { pose: 'stand', ms: 100 }], markers: [{ f: 0, type: 'sfx', arg: 'a' }, { f: 1, type: 'hit' }] };
  const once = { kind: 'sprite', loop: false, frames: [{ pose: 'ready', ms: 80 }, { pose: 'attack', ms: 120, off: [3, -1], flash: true }], markers: [{ f: 1, type: 'hit' }] };
  check('duration sums frame times', EA.duration(walk) === 250 && EA.duration(once) === 200);
  const fa = [0, 99, 100, 149, 150, 249, 250, 260].map((t) => EA.frameAt(walk, t).index + ':' + EA.frameAt(walk, t).cycle);
  check('a loop wraps at its length and counts cycles', fa.join(' ') === '0:0 0:0 1:0 1:0 2:0 2:0 0:1 0:1', fa);
  const oe = EA.frameAt(once, 500);
  check('a one shot holds its last frame and reports done, with offset and flash', oe.index === 1 && oe.done && oe.flash && oe.off[0] === 3 && oe.off[1] === -1 && !EA.frameAt(once, 10).done);
  check('an empty animation is a safe still stand', EA.frameAt({ frames: [] }, 50).pose === 'stand' && EA.duration(null) === 0);
  const mb = EA.markersBetween(walk, -1, 1000).map((m) => m.type + '@' + m.t).join(' ');
  check('markers fire from frame zero and across loops', mb === 'sfx@0 hit@100 sfx@250 hit@350 sfx@500 hit@600 sfx@750 hit@850 sfx@1000', mb);
  let stepped = [], t0 = -1;
  for (let t = 0; t <= 1000; t += 7) { stepped = stepped.concat(EA.markersBetween(walk, t0, t)); t0 = t; }
  check('small steps fire each marker exactly once', stepped.length === EA.markersBetween(walk, -1, t0).length, stepped.length);
  check('firstMarker finds the hit time', EA.firstMarker(once, 'hit') === 80 && EA.firstMarker(walk, 'flash') === null);

  // 2. Full pose sets compose at every size.
  const lib = S.LIBRARY, byKey = (k) => lib.find((x) => x.key === k);
  const layers = ['body.average', 'head.round', 'hair.long', 'torso.coat', 'legs.boots', 'back.cape', 'front.blade'].map((k) => ({ layer: byKey(k).layer, gen: byKey(k).gen }));
  let poseErr = null, frames = 0;
  function outlined(f) {
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      if (f.idx[y * f.w + x] < 2) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= f.w || Y >= f.h || f.idx[Y * f.w + X] === 0) return false; }
    }
    return true;
  }
  [8, 16, 24, 32, 64].forEach((T) => {
    S.BATTLE_POSES.forEach((p) => {
      const f = S.compose({ layout: 'humanoid', size: T, layers, wide: true, shadow: false }, p, 'right'); frames++;
      const lie = S.POSES[p].lie;
      const okSize = lie ? f.w > f.h : f.w === T * 2 && f.h === Math.round(T * 1.5);
      if (!poseErr && (!okSize || !outlined(f) || f.idx.filter((v) => v > 1).length < T)) poseErr = { T, p, w: f.w, h: f.h };
    });
    S.EMOTE_POSES.forEach((p) => { ['down', 'right', 'left', 'up'].forEach((d) => {
      const f = S.compose({ layout: 'humanoid', size: T, layers }, p, d); frames++;
      if (!poseErr && (!outlined(f) || f.idx.filter((v) => v > 1).length < T)) poseErr = { T, p, d };
    }); });
  });
  check('every battle and emote pose composes outlined at 8 to 64 px (' + frames + ' frames)', !poseErr, poseErr);
  const ko = S.compose({ layout: 'humanoid', size: 16, layers }, 'ko', 'right');
  check('KO lies down on the ground line', ko.w > ko.h && ko.idx.slice((ko.h - 1) * ko.w).some((v) => v > 0) && ko.ay === ko.h - 1);
  const atk = S.compose({ layout: 'humanoid', size: 16, layers, wide: true }, 'attack', 'right'), wnd = S.compose({ layout: 'humanoid', size: 16, layers, wide: true }, 'windup', 'right');
  const reach = (f) => { let mx = 0; for (let i = 0; i < f.idx.length; i++) if (f.idx[i] > 1) mx = Math.max(mx, i % f.w); return mx; };
  check('the attack swing reaches further forward than the wind up', reach(atk) > reach(wnd) + 2, [reach(atk), reach(wnd)]);
  const own = S.poseOf({ poses: { attack: { lean: -1 }, wave: { base: 'victory', hdy: 0.5 } } }, 'attack');
  check('sprite pose overrides layer over the library pose', own.lean === -1 && own.wpn === S.POSES.attack.wpn && S.poseOf({ poses: { wave: { base: 'victory', hdy: 0.5 } } }, 'wave').wpn === S.POSES.victory.wpn && S.poseOf({}, 'nope') === S.POSES.stand);

  // 3. Records and Quick Build.
  Kit.bundle.load(win.ART_DEMO.bundle());
  const rep = ART.quickBuild.run(), b = Kit.bundle.current(), M = ART.motion;
  const ablIds = Object.keys(b.rules.abl_).filter((id) => b.rules.abl_[id].kind !== 'passive');
  const anms = M.anims(b), lib3 = anms.filter((a) => a.subject.kind === 'role' && /^anim:/.test(a.subject.ref));
  check('Quick Build makes the animation library, three default ability animations, and one per ability',
    lib3.length === M.LIBRARY.length && M.DEFAULT_ABILITIES.every((d) => M.defaultAbility(b, d.key)) && ablIds.every((id) => M.abilityAnim(b, id)), { lib: lib3.length, steps: rep.steps.motion });
  check('every weather state has an overlay', Object.keys(b.rules.wth_).every((id) => M.overlayFor(b, id)) && M.overlays(b).length === Object.keys(b.rules.wth_).length);
  check('the demo validates clean after Quick Build', (() => { const s = Kit.validate.summary(Kit.validate(b)); return !s.errors && !s.broken && !s.warnings; })(), Kit.validate.summary(Kit.validate(b)));
  const rep2 = ART.quickBuild.run();
  check('a second Quick Build changes nothing in motion', rep2.steps.motion.created === 0 && rep2.steps.motion.refreshed === 0, rep2.steps.motion);
  const tax = b.art.poseTaxonomy;
  check('pose taxonomy defaults are exactly the brief\'s lists, all required', tax.field.length === 12 && tax.emote.map((e) => e.key).join() === 'nod,shake,jump,sit,kneel,faint,laugh' && tax.battleParty.length === 12 && tax.battleEnemy.map((e) => e.key).join() === 'idle,attack,hurt,death' && Object.keys(tax).every((g) => tax[g].every((e) => e.required)));
  check('every required taxonomy entry has a library animation', ['emote', 'battleParty', 'battleEnemy'].every((g) => tax[g].every((e) => M.libAnim(b, M.animKey(g, e.key)))) && !!M.libAnim(b, 'walk'));
  const libPoses = Object.keys(S.POSES);
  check('library animations use only known poses and in range markers', lib3.filter((a) => a.kind === 'sprite').every((a) => a.frames.every((f) => libPoses.includes(f.pose)) && a.markers.every((m) => m.f < a.frames.length)));
  const enemies = ART.sprites.sprites(b).filter((s) => s.kind === 'enemy' && !s.shares);
  check('enemy deaths follow the rig (ooze and plant melt, floater fades)', enemies.every((s) => { const d = EA.forSprite(b.art, s, 'enemy.death'); return d && d.kind === 'death' && d.method === M.deathFor(s.recipe.rig); }) && M.deathFor('ooze') === 'melt' && M.deathFor('floater') === 'fade' && M.deathFor('quadruped') === 'scatter', enemies.map((s) => s.recipe.rig));
  const tierSprite = ART.sprites.sprites(b).find((s) => s.kind === 'enemy' && s.shares);
  check('tier sprites inherit their base family\'s death', !tierSprite || EA.forSprite(b.art, tierSprite, 'enemy.death').kind === 'death');
  const look = (kind, extra) => M.abilityLook(Object.assign({ kind, targeting: { side: 'foe', scope: 'single' } }, extra || {}), { id: 'efx_x', particle: { shape: 'spark' } });
  check('ability looks follow kind and targeting', look('magic').caster === 'cast' && look('magic').travel.type === 'projectile' && look('magic', { targeting: { scope: 'all' } }).travel.type === 'fall' &&
    look('heal').travel.type === 'rise' && look('limit').hits === 3 && look('limit').caster === 'limit' && look('summon').travel.type === 'beam' && look('attack').travel.type === 'none' && look('magic').impact.fx === 'efx_x');

  // 4. Weather inference.
  const inf = (t) => M.inferWeather(t);
  const cases = [['severe thunderstorm with hail', 'thunderstorm'], ['freezing rain', 'freezing rain'], ['ground blizzard', 'blizzard'], ['light drizzle', 'drizzle'], ['haboob', 'dust'], ['marine layer fog', 'fog'], ['clear sky', 'clear'], ['steady stratiform rain', 'rain'], ['volcanic ashfall', 'ash'], ['aurora over the tundra', 'aurora'], ['tornado', 'tornado'], ['heavy snow', 'snow'], ['gale force wind', 'wind']];
  const got = cases.map((c) => inf(c[0]).keyword);
  check('weather keywords map to the right overlay, most specific first', got.every((k, i) => k === cases[i][1]), got);
  check('heavy rain is denser than light rain', inf('heavy rain').layers[0].density > inf('light rain').layers[0].density);
  check('an unknown description is a plainly generic overlay', inf('mana tide of the seventh moon').generic && inf('mana tide of the seventh moon').keyword === null);
  check('clear weather is a none layer with no tint', inf('clear').layers[0].type === 'none' && !inf('clear').tint);
  const wb = M.weatherBody(inf('thunderstorm'), ART.palette.entries(b));
  check('overlay colors are master indices and lightning has a range', wb.layers.every((l) => Number.isInteger(l.m) && l.m < ART.palette.entries(b).length) && Number.isInteger(wb.tint.m) && wb.lightning.every[0] < wb.lightning.every[1]);

  // 5. Weather, particles, and screen effects in the engine.
  const ent = ART.palette.entries(b);
  const rain = M.overlays(b).find((o) => o.keyword === 'rain'), clear = M.overlays(b).find((o) => o.keyword === 'clear');
  const wSmall = ER.weather.create(rain, 256, 224, 5, { entries: ent }), wBig = ER.weather.create(rain, 512, 448, 5, { entries: ent });
  check('weather particle counts scale with logical area', wBig.layers[0].parts.length === 4 * wSmall.layers[0].parts.length || Math.abs(wBig.layers[0].parts.length - 4 * wSmall.layers[0].parts.length) <= 2, [wSmall.layers[0].parts.length, wBig.layers[0].parts.length]);
  check('clear weather makes no particles', ER.weather.create(clear, 256, 224, 5, { entries: ent }).layers.length === 0);
  const storm = ER.weather.create(Object.assign({}, wb, { layers: wb.layers }), 256, 224, 9, { entries: ent });
  for (let i = 0; i < 400; i++) ER.weather.step(storm, 50);
  check('lightning strikes within its range over 20 s', storm.strikes >= Math.floor(20000 / wb.lightning.every[1]) && storm.strikes <= Math.ceil(20000 / wb.lightning.every[0]) + 1, storm.strikes);
  const inBounds = storm.layers.every((L) => L.parts.every((q) => q.x > -20 && q.x < 280 && q.y > -40 && q.y < 240));
  check('weather particles wrap and stay near the screen', inBounds);
  const wc = mockCtx(); ER.weather.draw(wc, storm);
  check('weather draws with fillRect only and resets alpha', wc.ops.fillRect > 50 && wc.globalAlpha === 1);
  const allTypes = ER.weather.create({ layers: ER.weather.TYPES.map((t) => ({ type: t, density: 0.6, angle: 20, speed: 1, depth: 1 })), tint: { m: 0, alpha: 0.2 }, lightning: { every: [100, 200], flashMs: 80 } }, 256, 224, 3, { entries: ent });
  for (let i = 0; i < 20; i++) ER.weather.step(allTypes, 33);
  let wErr = null; try { ER.weather.draw(mockCtx(), allTypes); } catch (e) { wErr = e.message; }
  check('every weather layer type steps and draws', !wErr, wErr);
  const det = (s) => { const a = ER.weather.create(rain, 256, 224, s, { entries: ent }); ER.weather.step(a, 100); return a.layers[0].parts.slice(0, 5).map((q) => q.x.toFixed(3)).join(); };
  check('weather is deterministic per seed', det(4) === det(4) && det(4) !== det(5));

  let fxErr = null, fxDone = true;
  ER.fx.SHAPES.forEach((shape) => {
    const sys = ER.fx.create({ x: 50, y: 50, to: { x: 80, y: 10 }, colors: ent.slice(0, 4), particle: { shape, count: 20, life: 400, gravity: 0.3, spread: 1, speed: 1 }, unit: 2 }, 7);
    try { for (let i = 0; i < 40; i++) { ER.fx.step(sys, 33); ER.fx.draw(mockCtx(), sys); } } catch (e) { fxErr = shape + ': ' + e.message; }
    if (!ER.fx.done(sys)) fxDone = false;
  });
  check('every particle shape steps, draws, and finishes', !fxErr && fxDone, fxErr);
  check('particle counts clamp (rings and bolts are few)', ER.fx.create({ particle: { count: 500 } }, 1).parts.length === 120 && ER.fx.create({ particle: { shape: 'ring', count: 20 } }, 1).parts.length === 4 && ER.fx.create({ particle: { shape: 'bolt', count: 20 } }, 1).parts.length <= 3);
  const sc0 = ER.fx.screen('shake', 0, 2, 3), sc1 = ER.fx.screen('shake', 1, 2, 3), dk = ER.fx.screen('darken', 0.5, 1, 1);
  check('shake decays to rest, darken peaks mid effect, wave scales with unit', sc1.shake[0] === 0 && sc1.shake[1] === 0 && (sc0.shake[0] || sc0.shake[1]) !== undefined && dk.darken > 0.4 && ER.fx.screen('wave', 0, 3, 1).wave === 6);

  // 6. Deaths and the hurt flash.
  const k = ER.createCache(b.art, { size: 16, entries: ent, budget: 32e6 });
  const foe = enemies[0], base = k.sprite(foe.id, 'idle', 'right');
  const vis = base.idx.filter((v) => v).length;
  const dp = (m, p) => EA.deathPixels(base, m, p, 7);
  check('every death starts with the whole sprite', ['scatter', 'fade', 'melt'].every((m) => dp(m, 0).length === vis), vis);
  check('fade empties, scatter fades out, melt sinks', dp('fade', 1).length === 0 && dp('scatter', 1).every((q) => q.a === 0) && dp('melt', 0.8).length < vis * 0.6 && dp('fade', 0.5).length > vis * 0.3 && dp('fade', 0.5).length < vis * 0.7);
  check('deaths are deterministic', JSON.stringify(dp('scatter', 0.4)) === JSON.stringify(dp('scatter', 0.4)));
  const fl = k.sprite(foe.id, 'idle', 'right', null, 'flash');
  const lightest = (() => { let bi = 0, bl = -1; ent.forEach((h, i) => { const l = ER.color.hexToLab ? ER.color.hexToLab(h)[0] : i; if (l > bl) { bl = l; bi = i; } }); return ent[bi]; })();
  const flHex = '#' + [0, 1, 2].map((i) => fl.rgba[fl.idx.findIndex((v) => v) * 4 + i].toString(16).padStart(2, '0')).join('');
  check('the hurt flash is a separate cache entry in the lightest master color', fl !== base && fl.idx.every((v, i) => (v > 0) === (base.idx[i] > 0)) && flHex === lightest, [flHex, lightest]);
  const dc = mockCtx();
  const dr = ER.draw.sprite(dc, k, foe.id, M.libAnim(b, 'enemy.death'), 350, 60, 60, { dir: 'right' });
  check('draw.sprite plays a generated death', dr && dr.death && dr.p > 0.4 && dr.p < 0.6 && dc.ops.fillRect > 10 && dc.globalAlpha === 1);
  const party = ART.sprites.sprites(b).find((s) => s.kind === 'character' && s.mode === 'battle');
  const step = M.libAnim(b, 'battle.step');
  const posR = ER.draw.sprite(mockCtx(), k, party.id, step, 300, 60, 60, { dir: 'right' }), posL = ER.draw.sprite(mockCtx(), k, party.id, step, 300, 60, 60, { dir: 'left' });
  check('draw.sprite returns the frame used, and forward offsets mirror facing left', posR.pose === 'ready' && posR.off[0] === 6 && posL.off[0] === 6 && posR.w === 32);
  const fl2 = ER.draw.sprite(mockCtx(), k, party.id, M.libAnim(b, 'battle.hurt'), 10, 60, 60, { dir: 'left' });
  check('the hurt animation flashes on its first frame', fl2.flash === true);

  // 7. Ability playback.
  const cast = M.libAnim(b, 'battle.cast'), atkA = M.libAnim(b, 'battle.attack');
  const flame = M.abilityAnim(b, ablIds.find((id) => b.rules.abl_[id].element === 'fire'));
  const tl = ER.ability.timeline(flame, cast);
  check('the release is the caster animation\'s first hit marker', tl.release === EA.firstMarker(cast, 'hit') && tl.travelEnd === tl.release + flame.travel.ms && tl.hits[0] === tl.travelEnd, tl);
  const limitA = M.abilityAnim(b, ablIds.find((id) => b.rules.abl_[id].kind === 'limit'));
  const tlL = ER.ability.timeline(limitA, M.libAnim(b, 'battle.limit'));
  check('multi hit abilities spread hits across the impact', tlL.hits.length === 3 && tlL.hits[2] > tlL.hits[0] && tlL.hits[2] < tlL.impactEnd);
  function play(anm, caster, dt) {
    const pb = ER.ability.create({ anm, caster, from: { x: 180, y: 100 }, to: { x: 60, y: 100 }, efx: ART.records.get(anm.impact.fx) || null, entries: ent, unit: 1, seed: 3 });
    const got2 = []; let n = 0; const c = mockCtx();
    while (!pb.done() && n++ < 2000) { got2.push(...pb.step(dt)); pb.draw(c); pb.screen(); }
    return { pb, got: got2, c };
  }
  const a1 = play(flame, cast, 16), a2 = play(flame, cast, 100);
  const sig = (g) => g.map((m) => m.type + '@' + m.t).join(' ');
  check('ability markers fire once each, the same at any frame rate', sig(a1.got) === sig(a2.got) && a1.got.filter((m) => m.type === 'hit').length === 1, sig(a1.got));
  check('ability playback finishes and draws its projectile and burst', a1.pb.done() && a1.c.ops.fillRect > 20);
  const mel = ER.ability.create({ anm: M.defaultAbility(b, 'attack'), caster: atkA, from: { x: 180, y: 100 }, to: { x: 60, y: 100 }, entries: ent, unit: 1 });
  const offs = []; for (let i = 0; i < 80; i++) { mel.step(20); offs.push(mel.casterAt().off[0]); }
  check('a melee caster runs in, holds, and comes back', Math.max(...offs) > 80 && offs[0] < Math.max(...offs) / 3 && offs[offs.length - 1] === 0, [offs[0], Math.max(...offs), offs[offs.length - 1]]);
  const shaker = play(limitA, M.libAnim(b, 'battle.limit'), 16);
  check('limit abilities shake and flash the screen', shaker.got.some((m) => m.type === 'shake') && shaker.got.some((m) => m.type === 'flash'));

  // 8. Edits survive, rebuilds remap, and the validator catches mistakes.
  const snow = M.overlays(b).find((o) => o.keyword === 'snow');
  snow.layers[0].density = 0.99; snow.origin = 'user';
  const flameAnm = flame; flameAnm.hits = 5; flameAnm.origin = 'user';
  const walkA = M.libAnim(b, 'walk'); walkA.frames[0].ms = 222; walkA.origin = 'user';
  ART.quickBuild.run();
  check('user edits to overlays, abilities, and library animations survive Quick Build', snow.layers[0].density === 0.99 && flameAnm.hits === 5 && M.libAnim(b, 'walk').frames[0].ms === 222);
  const master = ART.palette.master(b), oldN = ent.length;
  master.entries = master.entries.slice().reverse();
  ART.palette.regenerate ? ART.palette.regenerate(b) : null;
  const n2 = ART.palette.entries(b).length;
  check('overlay colors stay valid master indices after a master change', M.overlays(b).every((o) => (o.layers || []).concat([o.tint, o.lightning]).filter(Boolean).every((x) => x.m == null || (Number.isInteger(x.m) && x.m < n2))) && oldN === n2);
  const bad = win.JSON.parse(win.JSON.stringify(b));
  const recs = bad.art.records, firstId = (p, f) => Object.keys(recs[p]).find((id) => !f || f(recs[p][id]));
  recs.anm_[firstId('anm_', (a) => a.kind === 'sprite')].frames[0].ms = 0;
  recs.anm_[firstId('anm_', (a) => a.kind === 'sprite' && a.markers.length)].markers[0].f = 99;
  recs.anm_[firstId('anm_', (a) => a.kind === 'death')].method = 'explode';
  const abId = firstId('anm_', (a) => a.kind === 'ability' && a.subject.kind === 'abl');
  recs.anm_[abId].travel.type = 'teleport'; recs.anm_[abId].impact.fx = 'efx_missing_zzzz';
  recs.wov_[firstId('wov_')].layers[0].type = 'confetti';
  recs.spr_[firstId('spr_', (s) => s.anims)].anims['enemy.death'] = 'anm_missing_zzzz';
  const vr = Kit.validate(bad), msgs = [];
  Object.keys(vr.byRecord || {}).forEach((id) => (vr.byRecord[id] || []).forEach((x) => msgs.push(x.fieldPath + ': ' + x.message)));
  const want = ['frames.0.ms', 'markers.0.f', 'method', 'travel.type', 'impact.fx', 'layers.0.type', 'anims.enemy.death'];
  check('the art.motion validator catches each broken field', want.every((w) => msgs.some((m) => m.indexOf(w + ':') === 0)), want.filter((w) => !msgs.some((m) => m.indexOf(w + ':') === 0)));
  const gen = win.JSON.parse(win.JSON.stringify(b));
  gen.art.records.wov_[firstId('wov_')].generic = true;
  check('a generic overlay is a warning, not an error', (() => { const s = Kit.validate.summary(Kit.validate(gen)); return s.warnings >= 1 && !s.errors; })());

  // 9. The Motion tab.
  const WS = ART.WS.motion;
  const counts = {};
  for (const sub of ['poses', 'anims', 'abilities', 'effects', 'weather']) {
    WS.ui.sub = sub; Kit.go('motion'); Kit.rerender();
    counts[sub] = win.document.querySelectorAll('#ws .a7-row, #ws .a7-frame').length;
  }
  check('every Motion view renders its rows', counts.poses === 35 && counts.anims === M.anims(b).filter((a) => a.kind !== 'ability').length && counts.abilities === M.anims(b).filter((a) => a.kind === 'ability').length && counts.effects === ART.palette.effects(b).length && counts.weather === M.overlays(b).length, counts);
  WS.ui.sub = 'poses'; Kit.rerender();
  const labels = Array.from(win.document.querySelectorAll('#ws .a7-frame-l')).map((x) => x.textContent);
  check('pose labels read in plain words', labels.includes('Stand, down') && labels.includes('Shake head') && labels.includes('KO') && !labels.some((l) => /\./.test(l)), labels.slice(0, 14));
  ['openAnim', 'openAbility', 'openEffect', 'openWeather'].forEach((fn, i) => {
    const id = [M.libAnim(b, 'battle.attack').id, flame.id, ART.palette.effects(b)[0].id, snow.id][i];
    WS[fn](id);
    check(fn + ' opens a drawer with a live preview', win.document.querySelectorAll('.drawer .a7-stage').length >= 1 && !win.document.querySelector('.drawer .empty-line'));
    Kit.ui.closeTop();
  });
  const sprBefore = ART.sprites.sprites(b).find((s) => s.kind === 'character' && s.mode === 'field');
  WS.ui.sample = sprBefore.id;
  WS.openPose(M.GROUPS[2], 3, ART.sprites.spriteFor(b, 'chr', sprBefore.subject.ref, 'battle').id);
  const slider = win.document.querySelector('.drawer input[type="range"]');
  slider.value = '0.5'; slider.dispatchEvent(new win.Event('input', { bubbles: true })); slider.dispatchEvent(new win.Event('change', { bubbles: true }));
  Kit.ui.closeTop();
  check('adjusting a pose stores only the change on the base sprite', (() => { const base = ES().base(b.art, sprBefore); const p = base.poses && base.poses.attack; return p && Object.keys(p).length === 1 && base.origin === 'user'; })(), sprBefore.poses);
  function ES() { return S; }
  const taxN = b.art.poseTaxonomy.battleParty.length, anmN = M.anims(b).length;
  tax.battleParty.push({ key: 'second_attack', label: 'Second attack', required: false, pose: { base: 'attack', lean: 1 } });
  ART.records.put(ART.envelope('anm_', 'Second attack', { kind: 'role', ref: 'anim:battle.second_attack' }, 'user', null, { kind: 'sprite', loop: false, frames: [{ pose: 'second_attack', ms: 300 }], markers: [{ f: 0, type: 'hit' }] }));
  check('an optional pose and its animation validate clean and compose', (() => { const s = Kit.validate.summary(Kit.validate(b)); const f = ER.createCache(b.art, { size: 16, entries: ent }).sprite(party.id, 'second_attack', 'left'); return !s.errors && f && f.w === 32 && M.anims(b).length === anmN + 1 && tax.battleParty.length === taxN + 1; })(), Kit.validate.summary(Kit.validate(b)));
  check('jump goes to the Motion tab for anm_ and wov_', Kit.jump(snow.id) !== false && WS.ui.sub === 'weather' && Kit.jump(flame.id) !== false && WS.ui.sub === 'abilities' && Kit.jump(walkA.id) !== false && WS.ui.sub === 'anims');

  // 10. Stages paint through the real loop with a 2D context.
  ({ win, errors } = boot(APP147, { url: 'https://augustineiacopelli.github.io/appaday/147/?dev=1', setup: (w) => { w.HTMLCanvasElement.prototype.getContext = function () { const c = mockCtx(this.width, this.height); c.canvas = this; return c; }; } }));
  await wait(80);
  win.Kit.bundle.load(win.ART_DEMO.bundle()); win.ART.quickBuild.run();
  for (const sub of ['anims', 'abilities', 'effects', 'weather']) { win.ART.WS.motion.ui.sub = sub; win.Kit.go('motion'); win.Kit.rerender(); await wait(250); }
  const stErr = Array.from(win.document.querySelectorAll('canvas[data-err]')).map((c) => c.dataset.err);
  check('preview stages run through requestAnimationFrame with no drawing errors', win.ART.motion.stageCount() > 0 && !stErr.length && !errors.length, { stages: win.ART.motion.stageCount(), stErr: stErr.slice(0, 2), errors: errors.slice(0, 2) });
  const scales = Array.from(win.document.querySelectorAll('#ws .a7-stage')).map((c) => parseFloat(c.style.width) / c.width);
  win.ART.WS.motion.ui.sub = 'anims'; win.Kit.rerender();
  const animScales = Array.from(win.document.querySelectorAll('#ws .a7-stage')).map((c) => parseFloat(c.style.width) / c.width);
  check('stages draw at logical size and scale up by a whole number', scales.length && animScales.length && scales.concat(animScales).every(Number.isInteger) && animScales.every((s) => s >= 2), { scales: scales.slice(0, 3), animScales: animScales.slice(0, 3) });
  win.Kit.go('start'); await wait(100);
  check('the loop stops when no stage is on screen', win.ART.motion.stageCount() === 0);
  win.close();

  // 11. Day 146 round trip and the manifest.
  ({ win, errors } = boot(APP147, { url: 'https://augustineiacopelli.github.io/appaday/147/?dev=1' }));
  await wait(80);
  win.Kit.bundle.load(win.ART_DEMO.bundle()); win.ART.quickBuild.run();
  const draft = win.Kit.buildExport('draft');
  const r146 = await in146(draft.files[0].text, (w, K) => ({ anm: Object.keys((K.bundle.current().art.records || {}).anm_ || {}).length, wov: Object.keys((K.bundle.current().art.records || {}).wov_ || {}).length }));
  check('146 imports a 147 draft with motion records: hash ok, no errors', r146.matches && !r146.summary.errors && !r146.summary.broken && r146.anm > 30 && r146.wov === 3, r146);
  const man = JSON.parse(draft.files[1].text);
  check('manifest counts anm_ and wov_', man.counts.anm_ === win.ART.motion.anims().length && man.counts.wov_ === 3, man.counts);

  // 12. Fixtures self test.
  const st = win.ART_DEMO.selfTest();
  check('every fixture builds motion with no validation errors', st.every((r) => !r.validation.errors && !r.validation.broken && (r.key === 'F0' || (r.motion && r.motion.anims === win.ART.motion.LIBRARY.length))), st.map((r) => r.key + ':' + JSON.stringify(r.validation) + ':' + (r.motion ? r.motion.anims : '-')).join(' | '));
  check('the self test bakes every battle and emote pose', st.find((r) => r.key === 'F5d').bake.frames > 220, st.find((r) => r.key === 'F5d').bake);
  check('F2 (32 px, eight characters, twenty families) bakes in under 3 s', st.find((r) => r.key === 'F2').bake.ms < 3000, st.find((r) => r.key === 'F2').bake);
  check('F4 unknown weather types get generic overlays', st.find((r) => r.key === 'F4').motion && st.find((r) => r.key === 'F4').motion.overlays === 3 && st.find((r) => r.key === 'F4').motion.generic === 1, st.find((r) => r.key === 'F4').motion);
  win.close();

  const pass = results.filter((r) => r.ok).length;
  results.forEach((r) => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail))));
  console.log('\nSelf test:');
  st.forEach((r) => console.log('  ' + r.key.padEnd(5) + ' ' + String(r.quickBuild).padEnd(20) + ' ' + r.bakeMs.padEnd(24) + ' ' + Math.round(r.cacheBytes / 1024) + ' KB cache  ' + (r.motion ? r.motion.anims + ' anims, ' + r.motion.abilities + ' ability, ' + r.motion.overlays + ' weather (' + r.motion.generic + ' generic), ' + r.motion.steps + ' steps ' + r.motion.ms + ' ms' : 'no motion')));
  console.log('\n' + pass + ' of ' + results.length + ' passed');
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'phase3-report.json'), JSON.stringify({ date: new Date().toISOString(), pass, total: results.length, results, selfTest: st }, null, 2));
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
