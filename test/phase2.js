// Phase 2 acceptance: the composer. Codec, generators, compositing, outline, mirroring, cache, records, Quick Build,
// overrides, the pixel editor, the Sprites and Interface tabs, storage on its own keys with the IndexedDB fallback, and
// the Day 146 round trip.
'use strict';
const fs = require('fs');
const path = require('path');
const { boot } = require('./boot');
const { in146 } = require('./compat146');
const APP147 = path.join(__dirname, '..', 'index.html');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); }

(async () => {
  const html = fs.readFileSync(APP147, 'utf8');
  // 0. Static checks.
  const nonAscii = [];
  html.split('\n').forEach((l, i) => { if (/[^\x00-\x7e]/.test(l)) nonAscii.push(i + 1); });
  check('index.html is pure ASCII', !nonAscii.length, nonAscii.slice(0, 5));
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  let syntaxOk = true; try { new Function(script); } catch (e) { syntaxOk = e.message; }
  check('script parses', syntaxOk === true, syntaxOk);
  const fences = ['KIT:CORE', 'ART:STORE', 'ART:DEMO', 'ART:CONTRACT', 'ENGINE:RENDER', 'ART:PALETTE', 'WS:PALETTE', 'ART:SPRITES', 'ART:PIXED', 'WS:SPRITES', 'WS:INTERFACE', 'WS:ART147', 'APP:BOOT'];
  const at = fences.map((f) => script.indexOf('// === ' + f + ' BEGIN ==='));
  check('fences present in order', at.every((x, i) => x >= 0 && (i === 0 || x > at[i - 1])), at);
  check('every fence opens and closes once', fences.every((f) => script.split('// === ' + f + ' BEGIN ===').length === 2 && script.split('// === ' + f + ' END ===').length === 2));
  const eng = script.slice(script.indexOf('// === ENGINE:RENDER BEGIN ==='), script.indexOf('// === ENGINE:RENDER END ==='));
  check('ENGINE:RENDER reads no host globals', !/(?<![.\w$])(Kit|ART|window|document|localStorage|indexedDB|ENGINE_AUDIO|ENGINE_BATTLE)\b(?!\s*:)/.test(eng.replace(/\/\/.*$/gm, '')));
  check('no forbidden APIs (roundRect, ellipse, confirm, bare remove)', !/\.roundRect\(|\.ellipse\(|window\.confirm|\bconfirm\(\s*['"]|[^a-zA-Z.]remove\(\)|\)\.remove\(\)/.test(script.replace(/\/\/.*$/gm, '')));

  const fake = require(path.join(__dirname, 'node_modules', 'fake-indexeddb'));
  let { win, errors } = boot(APP147, { url: 'https://augustineiacopelli.github.io/appaday/147/?dev=1', setup: (w) => { w.indexedDB = fake.indexedDB; } });
  await wait(80);
  let Kit = win.Kit, ART = win.ART, ER = win.ENGINE_RENDER;
  const S = ER.sprite, EC = ER.codec, EP = ER.portrait, EI = ER.icon;
  check('boots with no page errors', !errors.length, errors.slice(0, 2));
  check('ENGINE_RENDER frozen with the composer sections', Object.isFrozen(ER) && ['codec', 'sprite', 'portrait', 'icon'].every((k) => Object.isFrozen(ER[k])) && typeof ER.createCache === 'function');

  // 1. Codec.
  let rt = true;
  for (let t = 0; t < 400; t++) {
    const w = 1 + Math.floor(Math.random() * 40), h = 1 + Math.floor(Math.random() * 40), a = new Uint8Array(w * h);
    for (let i = 0; i < a.length; i++) a[i] = Math.random() < 0.55 ? 0 : Math.floor(Math.random() * 32);
    const s = EC.encode(a), b = EC.decode(s, w, h);
    if (b.length !== a.length || b.some((v, i) => v !== a[i]) || !/^[0-9A-V.]*$/.test(s)) { rt = false; break; }
  }
  check('codec round trips random frames', rt);
  const runs = [1, 2, 31, 32, 33, 64, 65, 100].map((n) => { const a = new Uint8Array(n + 1); a[n] = 5; const s = EC.encode(a); return EC.decode(s, n + 1, 1)[n] === 5 && s.length <= Math.ceil(n / 32) * 2 + 2; });
  check('transparent runs chain correctly at every length', runs.every(Boolean), runs);
  check('codec rejects bad characters, short and long data, and high indices',
    !EC.validate('0x0', 3, 1).ok && !EC.validate('00', 3, 1).ok && !EC.validate('0000', 3, 1).ok && !EC.validate('.', 1, 1).ok && !EC.validate('0V0', 3, 1, 15).ok && EC.validate('.2', 3, 1).ok);
  check('encoding shrinks a sprite well', (() => { const f = S.compose({ layout: 'humanoid', size: 16, layers: S.LIBRARY.filter((x) => ['body.average', 'head.round', 'hair.short', 'torso.tunic', 'legs.trousers'].includes(x.key)).map((x) => ({ layer: x.layer, gen: x.gen })) }, 'stand', 'down'); return EC.encode(f.idx).length < f.idx.length * 0.85; })());

  // 2. Generators and compositing across sizes and every default part.
  const lib = S.LIBRARY, byKey = (k) => lib.find((x) => x.key === k);
  const humanLayers = ['body', 'head', 'hair', 'torso', 'legs', 'back', 'front'];
  function outlined(f) {
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const v = f.idx[y * f.w + x];
      if (v < 2) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= f.w || Y >= f.h) return 'edge ' + x + ',' + y;
        if (f.idx[Y * f.w + X] === 0) return 'gap ' + x + ',' + y;
      }
    }
    return true;
  }
  const sizeRows = [];
  let shapeErr = null;
  [8, 12, 16, 24, 32, 48, 64].forEach((T) => {
    let n = 0, t0 = Date.now();
    humanLayers.forEach((layer) => {
      lib.filter((x) => x.layer === layer && x.rig === 'humanoid').forEach((part) => {
        const others = humanLayers.filter((l) => l !== layer).map((l) => byKey(l + '.' + { body: 'average', head: 'round', hair: 'short', torso: 'tunic', legs: 'trousers', back: 'cape', front: 'blade' }[l]));
        const spec = { layout: 'humanoid', size: T, accent: 'clothB', layers: others.concat([part]).map((x) => ({ layer: x.layer, gen: x.gen })) };
        S.FIELD_POSES.concat(S.BATTLE_POSES).forEach((pose) => S.DIRS.forEach((dir) => {
          const f = S.compose(spec, pose, dir); n++;
          const o = outlined(f), max = Math.max(...f.idx), filled = f.idx.filter((v) => v > 1).length;
          const lie = S.POSES[pose] && S.POSES[pose].lie; if (!shapeErr && (lie ? (f.w !== Math.round(T * 1.5) || f.h !== T) : (f.w !== T || f.h !== Math.round(T * 1.5)) || o !== true || max > 15 || filled < T)) shapeErr = { T, part: part.key, pose, dir, w: f.w, h: f.h, o, max, filled };
        }));
      });
    });
    sizeRows.push(T + ':' + n + ' in ' + (Date.now() - t0) + 'ms');
  });
  check('every humanoid part composes at sizes 8 to 64, outlined, slots 0 to 15', !shapeErr, shapeErr || sizeRows.join(' '));
  const spec16 = { layout: 'humanoid', size: 16, accent: 'clothB', layers: ['body.average', 'head.round', 'hair.long', 'torso.coat', 'legs.boots', 'back.cape', 'front.blade'].map((k) => ({ layer: byKey(k).layer, gen: byKey(k).gen })) };
  const R = S.compose(spec16, 'stand', 'right'), L = S.compose(spec16, 'stand', 'left');
  check('left mirrors right exactly', L.w === R.w && L.idx.every((v, i) => v === R.idx[Math.floor(i / R.w) * R.w + (R.w - 1 - (i % R.w))]) && L.ax === R.w - 1 - R.ax);
  check('compose is deterministic', JSON.stringify(Array.from(S.compose(spec16, 'stepA', 'down').idx)) === JSON.stringify(Array.from(S.compose(spec16, 'stepA', 'down').idx)));
  const stepDiff = ['stepA', 'stepB'].map((p) => S.compose(spec16, p, 'down').idx.filter((v, i) => v !== S.compose(spec16, 'stand', 'down').idx[i]).length);
  check('walking frames differ from standing', stepDiff.every((d) => d > 3), stepDiff);
  const dirsDiffer = new Set(['down', 'up', 'right'].map((d) => EC.encode(S.compose(spec16, 'stand', d).idx))).size === 3;
  check('down, up, and right frames are distinct', dirsDiffer);
  const accentDiff = S.compose(Object.assign({}, spec16, { accent: 'metal' }), 'stand', 'down').idx.some((v, i) => v !== S.compose(spec16, 'stand', 'down').idx[i]);
  check('the accent alias changes which ramp gear uses', accentDiff);
  let rigErr = null;
  S.RIGS.forEach((rig) => [8, 16, 32, 64].forEach((T) => {
    const f = S.compose({ layout: 'enemy', size: T, seed: 5, layers: [{ layer: 'body', gen: byKey('enemy.' + rig).gen }] }, 'idle', 'right');
    const o = outlined(f), filled = f.idx.filter((v) => v > 1).length;
    if (!rigErr && (f.w !== T * 2 || f.h !== T * 2 || o !== true || filled < T * 2)) rigErr = { rig, T, o, filled };
  }));
  check('all eight enemy rigs compose at 2 by 2 tiles, outlined', !rigErr, rigErr);
  const tall = S.compose(Object.assign({}, spec16, { proportions: { height: 2 } }), 'stand', 'down');
  check('proportions change the frame height', tall.h === 32);

  // 3. Portraits and icons.
  const exprs = Object.keys(EP.EXPRESSIONS), neutral = EP.compose({ head: 'round', hair: 'short' }, 'neutral', 48);
  check('six expressions, each different from neutral', exprs.length === 6 && exprs.filter((e) => e !== 'neutral').every((e) => EP.compose({ head: 'round', hair: 'short' }, e, 48).idx.some((v, i) => v !== neutral.idx[i])));
  check('portrait size is three tiles, clamped 24 to 96', EP.size(8) === 24 && EP.size(16) === 48 && EP.size(32) === 96 && EP.size(64) === 96);
  const glyphs = EI.GLYPHS.concat(EI.STATUS_SHAPES.map((s) => 'status.' + s));
  const icoSet = new Set(glyphs.map((g) => EC.encode(EI.compose(g, 16).idx)));
  check('every glyph and status shape draws a distinct, outlined icon', icoSet.size === glyphs.length && glyphs.every((g) => { const f = EI.compose(g, 16); return f.idx.filter((v) => v > 1).length > 10 && outlined(f) === true; }));
  check('icon size follows the tile size', EI.size(8) === 8 && EI.size(16) === 16 && EI.size(32) === 16 && EI.size(64) === 32);

  // 4. Quick Build on the demo.
  Kit.bundle.load(win.ART_DEMO.bundle());
  let b = Kit.bundle.current();
  const rep = ART.quickBuild.run(b);
  const SP = ART.sprites, n = (p) => ART.records.list(p, b).length;
  check('Quick Build makes parts, sprites, portraits, icons', n('prt_') === 42 && n('spr_') === 24 && n('por_') === 4 && n('ico_') === 18 && SP.iconPalette(b), { prt: n('prt_'), spr: n('spr_'), por: n('por_'), ico: n('ico_'), steps: rep.steps.sprites });
  const sub = (k, r, m) => SP.spriteFor(b, k, r, m);
  const chrs = Object.keys(b.rules.chr_);
  check('every character has a field and a battle sprite; battle shares field', chrs.every((c) => sub('chr', c, 'field') && sub('chr', c, 'battle') && sub('chr', c, 'battle').shares === sub('chr', c, 'field').id));
  check('villain has both modes; ten NPC archetypes have field sprites', sub('role', 'villain', 'field') && sub('role', 'villain', 'battle') && win.ART.NPC_ARCHETYPES.every((k) => sub('role', 'npc:' + k, 'field')));
  const info = ART.palette.familyInfo(b);
  check('every family has a battle sprite; tier families share their base', info.every((x) => { const s = sub('fam', x.id, 'battle'); return s && (x.id === x.baseId ? !!s.recipe : s.shares === sub('fam', x.baseId, 'battle').id); }));
  check('every sprite points at its own palette', SP.sprites(b).every((s) => { const p = ART.records.get(s.pal, b); return p && p.subject && p.subject.ref === s.subject.ref; }));
  check('rigs come from family names', ['Slime', 'Wisp', 'Wolf'].map((nm) => SP.rigFor({ name: nm })).join() === 'ooze,floater,quadruped');
  check('weapon classes map to front gear', ['blade', 'staff', 'bow', 'claw', 'hammer', ''].map(SP.frontFor).join() === 'blade,staff,device,bare,tool,bare');
  let res = Kit.refreshValidation();
  check('demo validates clean after Quick Build', !res.errors.length && !res.broken.length && !(res.warnings || []).length, Kit.validate.summary(res));
  const rep2 = ART.quickBuild.run(b);
  check('Quick Build is idempotent', rep2.steps.sprites.created === 0 && rep2.steps.sprites.refreshed === 0, rep2.steps.sprites);
  check('demo with sprites stays small', ART.size(b).total < 200000, ART.size(b).total);

  // 5. Edits survive; generated records follow the bundle.
  const c0 = chrs[0], f0 = sub('chr', c0, 'field'), c1 = chrs[1], f1 = sub('chr', c1, 'field');
  f0.recipe.parts.hair = SP.partByLib(b, 'hair.spiked').id; f0.origin = 'user';
  b.rules.chr_[c1].weaponClass = 'bow';
  const rep3 = ART.quickBuild.run(b);
  check('a kept sprite keeps its recipe through Quick Build', sub('chr', c0, 'field').recipe.parts.hair === SP.partByLib(b, 'hair.spiked').id);
  check('a generated sprite follows a rules change', sub('chr', c1, 'field').recipe.parts.front === SP.partByLib(b, 'front.device').id && rep3.steps.sprites.refreshed >= 1, rep3.steps.sprites);

  // 6. Frames, overrides, sharing, cache.
  const art = b.art;
  const base = sub('fam', info.find((x) => x.id === x.baseId && info.some((y) => y.baseId === x.id && y.id !== x.id)).id, 'battle');
  const tierS = SP.sprites(b).find((s) => s.shares === base.id);
  const fb = S.frame(art, base, 'idle', 'right', 16), ft = S.frame(art, tierS, 'idle', 'right', 16);
  const k1 = ER.createCache(art, { size: 16, entries: ART.palette.entries(b) });
  const rb = k1.sprite(base.id, 'idle', 'right'), rt2 = k1.sprite(tierS.id, 'idle', 'right');
  check('a tier shares pixels and differs only by palette', EC.encode(fb.idx) === EC.encode(ft.idx) && Buffer.from(rb.rgba).compare(Buffer.from(rt2.rgba)) !== 0);
  const ed = new Uint8Array(f1.idx ? 0 : 0);
  const fr = S.frame(art, f1, 'stand', 'right', 16), mod = new Uint8Array(fr.idx); mod[0] = 1; mod[1] = 2;
  f1.overrides['stand.right'] = { w: fr.w, h: fr.h, d: EC.encode(mod) };
  const got = S.frame(art, f1, 'stand', 'right', 16), gotL = S.frame(art, f1, 'stand', 'left', 16);
  check('an override replaces its frame', got.override && got.idx[0] === 1 && got.idx[1] === 2);
  check('left falls back to the mirrored right override', gotL.override && gotL.idx[fr.w - 1] === 1 && gotL.idx[fr.w - 2] === 2);
  const battle1 = sub('chr', c1, 'battle');
  check('a sharing battle sprite inherits field overrides keyed by its own poses only', S.frame(art, battle1, 'stand', 'right', 16).override && !S.frame(art, battle1, 'idle', 'left', 16).override);
  f1.overrides['stand.up'] = { w: 3, h: 3, d: 'ZZ' };
  res = Kit.refreshValidation();
  check('a corrupt override is a validation error', res.errors.some((e) => e.recordId === f1.id && /overrides\.stand\.up/.test(e.fieldPath)), Kit.validate.summary(res));
  delete f1.overrides['stand.up'];
  SP.unshare(b, tierS);
  check('unshare copies the recipe and keeps the palette', !tierS.shares && tierS.recipe && tierS.recipe.rig === base.recipe.rig && tierS.pal !== base.pal);
  const k2 = ER.createCache(art, { size: 16, entries: ART.palette.entries(b), budget: 20000 });
  SP.sprites(b).forEach((s) => S.FIELD_POSES.forEach((p) => k2.sprite(s.id, p, 'down')));
  const st2 = k2.stats();
  k2.sprite(SP.sprites(b)[SP.sprites(b).length - 1].id, 'stepB', 'down');
  check('the cache evicts least recently used frames under its budget', st2.bytes <= 20000 && st2.evictions > 0 && k2.stats().hits >= 1, st2);
  const k3 = ER.createCache(art, { size: 16, entries: ART.palette.entries(b), makeCanvas: (w, h) => ({ width: w, height: h, getContext: () => ({ createImageData: (W, H) => ({ data: new Uint8ClampedArray(W * H * 4) }), putImageData: () => {} }) }) });
  check('the cache bakes to a host canvas when one is given', !!k3.icon(SP.icons(b)[0].id).canvas && k3.stats().bytes > 0);

  // 7. Parts by hand.
  const WS = ART.WS.sprites, coat = SP.partByLib(b, 'torso.coat'), px = WS.toPixels(b, coat);
  check('drawing a part by hand makes a frame per pose and direction', Object.keys(px.variants).length === S.handPoses().length && px.base === 16 && !!px.variants['stand.down'] && !!px.variants['attack.right'] && !!px.variants['nod.down'], Object.keys(px.variants));
  const drawn = ART.records.put(ART.envelope('prt_', 'Coat drawn', { kind: 'role', ref: 'part:custom' }, 'user', 1, { layer: 'torso', rig: 'humanoid', px: px }), b);
  const withGen = S.compose({ layout: 'humanoid', size: 16, layers: [{ layer: 'body', gen: byKey('body.average').gen }, { layer: 'torso', gen: coat.gen }] }, 'stand', 'down');
  const withPx = S.compose({ layout: 'humanoid', size: 16, layers: [{ layer: 'body', gen: byKey('body.average').gen }, { layer: 'torso', px: px }] }, 'stand', 'down');
  const same = withGen.idx.filter((v, i) => v === withPx.idx[i]).length / withGen.idx.length;
  check('a hand drawn copy composes like its generator', same > 0.95, same.toFixed(3));
  const sz32 = S.compose({ layout: 'humanoid', size: 32, layers: [{ layer: 'body', gen: byKey('body.average').gen }, { layer: 'torso', px: px }] }, 'stand', 'down');
  check('a hand drawn part resamples to another tile size', sz32.w === 32 && sz32.h === 48);
  b.charter.specs.tileSize = 24; res = Kit.refreshValidation();
  check('a resampled hand drawn part warns', (res.warnings || []).some((w) => w.recordId === drawn.id), Kit.validate.summary(res));
  b.charter.specs.tileSize = 16; ART.records.del(drawn.id);

  // 8. Retired defaults stay deleted.
  const elder = sub('role', 'npc:elder', 'field');
  SP.retire(b, 'npc:elder'); ART.records.del(elder.id);
  ART.quickBuild.run(b);
  check('a deleted NPC archetype is not recreated', !sub('role', 'npc:elder', 'field'));
  SP.unretire(b, 'npc:elder'); ART.quickBuild.run(b);
  check('restoring it brings it back', !!sub('role', 'npc:elder', 'field'));

  // 9. A master rebuild keeps icons and sprites valid.
  ART.palette.buildMaster(b, { force: true, seed: 12345 });
  res = Kit.refreshValidation();
  const n2 = ART.palette.entries(b).length;
  check('master rebuild: icon tints and icon palette stay valid', !res.errors.length && SP.icons(b).every((i) => i.tintRamp.every((v) => v < n2)) && SP.iconPalette(b).slots.slice(1).every((v) => v < n2), Kit.validate.summary(res));

  // 10. The pixel editor.
  const ico = SP.icons(b)[0], icf = k1.icon(ico.id);
  const pe = ART.pixelEditor.open({ title: 't', w: icf.w, h: icf.h, idx: icf.idx, slots: SP.iconPalette(b).slots, entries: ART.palette.entries(b) });
  const h = ART.pixelEditor.last;
  h.paintAt(0, 0, 9); h.paintAt(1, 0, 9); h.undo(); h.redo();
  h.fillAt(15, 15, 3);
  const corner = h.pixels()[0], filledCorner = h.pixels()[15 * 16 + 15];
  Array.from(win.document.querySelectorAll('.dlg-foot button')).find((x) => /Save pixels/.test(x.textContent)).click();
  const out = await pe;
  check('the pixel editor paints, undoes, redoes, fills, and saves', out && out.action === 'save' && corner === 9 && filledCorner === 3 && out.idx[1] === 9);
  check('an unchanged frame encodes to nothing', ART.pixelEditor.encode(icf.idx, icf.w, icf.h, icf.idx) === null && ART.pixelEditor.encode(out.idx, 16, 16, icf.idx).d.length > 0);
  check('the editor canvas blocks touch scrolling', /\.a7-pxcanvas \{[^}]*touch-action: none/.test(html));

  // 11. Tabs and jumps.
  errors.length = 0;
  let views = [];
  for (const ws of ['sprites', 'interface']) {
    Kit.go(ws);
    for (const s of Object.keys(ART.WS[ws].views)) { ART.WS[ws].ui.sub = s; Kit.rerender(); views.push(ws + '.' + s + ':' + win.document.querySelectorAll('#ws canvas, #ws .stub').length); }
  }
  check('every Sprites and Interface view renders', !errors.length && views.every((v) => !/:0$/.test(v)), views.concat(errors.slice(0, 2)));
  const jumps = [[sub('fam', base.subject.ref, 'battle').id, 'sprites', 'bestiary'], [SP.portraits(b)[0].id, 'sprites', 'portraits'], [SP.parts(b)[0].id, 'sprites', 'parts'], [SP.icons(b)[0].id, 'interface', 'icons']];
  check('jumps open the right tab and section', jumps.every((j) => { Kit.jump(j[0]); return Kit.active() === j[1] && ART.WS[j[1]].ui.sub === j[2]; }), jumps.map((j) => j[0]));
  ART.WS.sprites.openSprite(f1.id);
  const frameBtns = win.document.querySelectorAll('.drawer .a7-frame').length;
  Kit.ui.closeTop();
  check('the sprite drawer lists every field and emote frame', frameBtns === S.FIELD_POSES.length * S.DIRS.length + S.EMOTE_POSES.length, frameBtns);
  Kit.go('start');
  check('Start offers the Day 146 draft only when one exists', !Array.from(win.document.querySelectorAll('#ws button')).some((x) => /Day 146 draft/.test(x.textContent)));

  // 12. Day 146 round trip with populated sprites.
  const draft = Kit.buildExport('draft');
  const r146 = await in146(draft.files[0].text, (w, K) => ({ art: Object.keys(K.bundle.current().art.records || {}).length }));
  check('146 imports a 147 draft with sprites: hash ok, no errors', r146.matches && !r146.summary.errors && !r146.summary.broken && r146.art >= 6, r146);
  const man = JSON.parse(draft.files[1].text);
  check('manifest counts the new records', man.counts.spr_ === SP.sprites(b).length && man.counts.prt_ === SP.parts(b).length && man.counts.ico_ === SP.icons(b).length);

  // 13. Fixtures self test.
  const st = win.ART_DEMO.selfTest();
  check('every fixture bakes with no validation errors', st.every((r) => r.bake && r.bake.frames > 0 && !r.validation.errors && !r.validation.broken), st.map((r) => r.key + ':' + r.bakeMs).join(' | '));
  check('F2 (32 px, 256 colors, eight characters) bakes every frame in under 2 s', st.find((r) => r.key === 'F2').bake.ms < 2000, st.find((r) => r.key === 'F2').bake);

  // 14. Storage: own keys and the IndexedDB fallback.
  check('the draft lives under art147:draft, not kit:draft', win.localStorage.getItem('art147:draft') && win.localStorage.getItem('kit:draft') === null);
  const SPr = win.Storage.prototype, orig = SPr.setItem;
  SPr.setItem = function (k, v) { if (k === 'art147:draft') throw new Error('QuotaExceededError'); return orig.call(this, k, v); };
  const ok = Kit.bundle.save();
  await wait(200);
  SPr.setItem = orig;
  check('a refused save falls back to IndexedDB without the banner', ok && ART.storage.where('kit:draft') === 'idb' && win.localStorage.getItem('art147:where:art147:draft') === '1' && win.document.getElementById('storeBanner').hidden && !win.localStorage.getItem('art147:draft'));
  const title = Kit.bundle.current().kit.title, lsCopy = {};
  for (let i = 0; i < win.localStorage.length; i++) lsCopy[win.localStorage.key(i)] = win.localStorage.getItem(win.localStorage.key(i));
  ({ win, errors } = boot(APP147, { url: 'https://augustineiacopelli.github.io/appaday/147/', storage: lsCopy, setup: (w) => { w.indexedDB = fake.indexedDB; } }));
  await wait(250);
  check('a reload restores the draft from IndexedDB', win.Kit.bundle.current().kit.title === title && win.ART.sprites.sprites().length > 0 && !errors.length, { title: win.Kit.bundle.current().kit.title, errors: errors.slice(0, 2) });
  win.Kit.bundle.save();
  check('once localStorage has room again the draft moves back', win.ART.storage.where('kit:draft') === 'local' && !win.localStorage.getItem('art147:where:art147:draft'));
  const withArt = JSON.parse(lsCopy['art147:where:art147:draft'] ? JSON.stringify(Object.assign(JSON.parse(win.localStorage.getItem('art147:draft')), { kit: Object.assign(JSON.parse(win.localStorage.getItem('art147:draft')).kit, { title: 'Adopted' }) })) : '{}');
  ({ win, errors } = boot(APP147, { url: 'https://augustineiacopelli.github.io/appaday/147/', storage: { 'kit:draft': JSON.stringify(withArt) } }));
  await wait(120);
  check('an older Day 147 draft under kit:draft is adopted once', win.Kit.bundle.current().kit.title === 'Adopted' && win.localStorage.getItem('kit:draft') === JSON.stringify(withArt));

  const pass = results.filter((r) => r.ok).length;
  results.forEach((r) => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail))));
  console.log('\nComposer sizes: ' + sizeRows.join(', '));
  console.log('\nSelf test:');
  st.forEach((r) => console.log('  ' + r.key.padEnd(5) + ' ' + String(r.quickBuild).padEnd(20) + ' ' + r.bakeMs.padEnd(22) + ' ' + Math.round(r.cacheBytes / 1024) + ' KB cache'));
  console.log('\n' + pass + ' of ' + results.length + ' passed');
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'phase2-report.json'), JSON.stringify({ date: new Date().toISOString(), pass, total: results.length, results, selfTest: st, sizes: sizeRows }, null, 2));
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
