// Phase 8 acceptance: coverage, reference validation, the manifest, the engine files, the full fixture pass, and the Day
// 146 round trip. Coverage is computed from the bundle each time, so the tests change the bundle and watch it react.
// The engine files are run in a bare vm context (no window, no document) and must match the page's own engines output
// for output. Every fixture is Quick Built, checked for coverage and references, exported Final, and opened in Day 146.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { boot } = require('./boot');
const { in146 } = require('./compat146');
const ROOT = path.join(__dirname, '..');
const APP147 = path.join(ROOT, 'index.html');
const URL147 = 'https://augustineiacopelli.github.io/appaday/147/?dev=1';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); }
// A 2D context that accepts every call and counts them.
function fakeCtx() {
  const calls = { n: 0 };
  const target = { canvas: { width: 256, height: 224 }, calls };
  return new Proxy(target, {
    get(t, k) { if (k in t) return t[k]; return function () { calls.n++; return { data: new Uint8ClampedArray(4), width: 1, height: 1 }; }; },
    set(t, k, v) { t[k] = v; return true; }
  });
}
function digest(a) { let h = 0x811c9dc5; for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16) + ':' + a.length; }

(async () => {
  const html = fs.readFileSync(APP147, 'utf8');
  // 0. Static checks.
  const nonAscii = [];
  html.split('\n').forEach((l, i) => { if (/[^\x00-\x7e]/.test(l)) nonAscii.push(i + 1); });
  check('index.html is pure ASCII', !nonAscii.length, nonAscii.slice(0, 5));
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  let syntaxOk = true; try { new Function(script); } catch (e) { syntaxOk = e.message; }
  check('script parses', syntaxOk === true, syntaxOk);
  const fences = ['KIT:CORE', 'ART:STORE', 'ART:DEMO', 'ART:CONTRACT', 'ENGINE:RENDER', 'ENGINE:AUDIO', 'ART:PALETTE', 'WS:PALETTE', 'ART:SPRITES', 'ART:PIXED', 'WS:SPRITES', 'WS:INTERFACE', 'ART:MOTION', 'WS:MOTION', 'ART:TILES', 'WS:WORLD', 'WS:PLAYTEST', 'ART:UI', 'ART:BATTLE', 'WS:BATTLE', 'ART:AUDIO', 'WS:SOUND', 'ART:LINKS', 'ART:AI', 'ART:COVERAGE', 'WS:ART147', 'APP:BOOT'];
  const at = fences.map((f) => script.indexOf('// === ' + f + ' BEGIN ==='));
  check('fences present in order: ART:COVERAGE after ART:AI, before WS:ART147', at.every((x, i) => x >= 0 && (i === 0 || x > at[i - 1])), at);
  check('every fence opens and closes once', fences.every((f) => script.split('// === ' + f + ' BEGIN ===').length === 2 && script.split('// === ' + f + ' END ===').length === 2));
  check('ART:COVERAGE CSS fence present', html.split('/* === ART:COVERAGE CSS BEGIN === */').length === 2 && html.split('/* === ART:COVERAGE CSS END === */').length === 2);
  check('no forbidden APIs (roundRect, ellipse, confirm, bare remove)', !/\.roundRect\(|\.ellipse\(|window\.confirm|\bconfirm\(\s*['"]|[^a-zA-Z.]remove\(\)|\)\.remove\(\)/.test(script.replace(/\/\/.*$/gm, '')));
  const covSrc = script.slice(script.indexOf('// === ART:COVERAGE BEGIN ==='), script.indexOf('// === ART:COVERAGE END ==='));
  check('ART:COVERAGE builds the engine markers from parts (it never finds itself)', !/=== ENGINE:(RENDER|AUDIO) (BEGIN|END) ===/.test(covSrc));
  check('backlink appears in header and footer', html.split('href="https://augustineiacopelli.github.io/appaday/"').length === 3);

  // 1. Engine files: repository copies match the fences, run alone, and match the page.
  const files = { render: fs.readFileSync(path.join(ROOT, 'engine-render.js'), 'utf8'), audio: fs.readFileSync(path.join(ROOT, 'engine-audio.js'), 'utf8') };
  ['RENDER', 'AUDIO'].forEach((F) => {
    const k = F.toLowerCase(), o = '// === ENGINE:' + F + ' BEGIN ===', c = '// === ENGINE:' + F + ' END ===';
    const fenceText = script.slice(script.indexOf(o), script.indexOf(c) + c.length) + '\n';
    check('engine-' + k + '.js is the ENGINE:' + F + ' fence byte for byte under its header', files[k].endsWith(fenceText) && files[k].indexOf(o) === files[k].length - fenceText.length && /^\/\* Art and Audio Forge ENGINE:/.test(files[k]));
    check('engine-' + k + '.js is ASCII', !/[^\x00-\x7e]/.test(files[k]));
  });
  const box = vm.createContext({});
  let vmErr = null;
  try { vm.runInContext(files.render, box, { filename: 'engine-render.js' }); vm.runInContext(files.audio, box, { filename: 'engine-audio.js' }); } catch (e) { vmErr = e.message; }
  check('both engines load in a bare context with no window or document', !vmErr, vmErr);
  check('each declares exactly one global, frozen, version 1.0.0', Object.keys(box).sort().join() === 'ENGINE_AUDIO,ENGINE_RENDER' && Object.isFrozen(box.ENGINE_RENDER) && Object.isFrozen(box.ENGINE_AUDIO) && box.ENGINE_RENDER.version === '1.0.0' && box.ENGINE_AUDIO.version === '1.0.0', Object.keys(box));
  const box2 = vm.createContext({});
  vm.runInContext(files.audio, box2);
  check('engine-audio.js loads alone, without the render engine', !!box2.ENGINE_AUDIO && !box2.ENGINE_RENDER);

  // 2. Boot, Quick Build, coverage.
  let { win, errors } = boot(APP147, { url: URL147 });
  await wait(80);
  let Kit = win.Kit, ART = win.ART, d = win.document;
  check('boots with no page errors', !errors.length, errors.slice(0, 2));
  check('header has a coverage chip, hidden until a Charter is locked', !!d.getElementById('btnCoverage') && d.getElementById('btnCoverage').hidden);
  Kit.bundle.load(win.ART_DEMO.bundle());
  let b = Kit.bundle.current();
  const COV = ART.coverage;
  let cov = COV.compute(b);
  check('before Quick Build every required item is a gap', cov.covered === 0 && cov.gaps.length === cov.required && cov.required > 100, cov.covered + '/' + cov.required);
  ART.quickBuild.run(b);
  Kit.refreshValidation();
  cov = COV.compute(b);
  check('after Quick Build coverage is green with no Claude', cov.green && cov.percent === 100 && !cov.gaps.length, cov.gaps.map((g) => g.key));
  const groups = Object.keys(cov.byGroup).filter((g) => cov.byGroup[g].required);
  check('coverage spans palettes, sprites, portraits, icons, motion, world, interface, and sound', ['palette', 'sprites', 'portraits', 'icons', 'motion', 'world', 'interface', 'sound'].every((g) => groups.includes(g)), groups);
  const rules = (p) => Object.values(b.rules[p] || {});
  const reqKeys = cov.items.filter((i) => i.need === 'required').map((i) => i.key);
  check('every character owes a colorway, two sprites, and a portrait', rules('chr_').every((c) => ['palette:chr:', 'sprites:chr:', 'portraits:chr:'].every((k) => reqKeys.some((x) => x.indexOf(k + c.id) === 0))) && rules('chr_').every((c) => reqKeys.includes('sprites:chr:' + c.id + ':battle')));
  check('every family, element, weather state, and non passive ability is owed its art', rules('fam_').every((f) => reqKeys.includes('sprites:fam:' + f.id) && reqKeys.includes('palette:fam:' + f.id)) &&
    (b.charter.ruleset.elements || []).every((e) => reqKeys.includes('palette:element:' + e.key) && reqKeys.includes('sound:element:' + e.key)) &&
    rules('wth_').every((w) => reqKeys.includes('motion:wth:' + w.id)) && rules('abl_').filter((a) => a.kind !== 'passive').every((a) => reqKeys.includes('motion:abl:' + a.id) && reqKeys.includes('sound:abl:' + a.id)));
  check('required poses are owed through their library animations', ['motion:pose:walk', 'motion:pose:emote.faint', 'motion:pose:battle.limit', 'motion:pose:enemy.death'].every((k) => reqKeys.includes(k)) && reqKeys.filter((k) => k.indexOf('motion:pose:') === 0).length === 1 + 7 + 12 + 4);
  check('every required music role and the five UI parts are owed', ART.musicRoles(b).filter((r) => r.required).every((r) => reqKeys.includes('sound:music:' + r.key)) && ['window', 'font', 'cursor', 'touch', 'title'].every((k) => reqKeys.includes('interface:' + k)));
  const clim = cov.items.find((i) => i.key === 'world:climate');
  check('climate check is advisory and names unmatched cells', clim && clim.need === 'advisory' && !clim.ok && /of 125 cells/.test(clim.detail), clim && clim.detail);
  check('coverage of the demo takes under 50 ms', (() => { const t = Date.now(); COV.compute(b); return Date.now() - t < 50; })());

  // 3. Coverage reacts: deletes, new rules records, retirement and restore, forward fields.
  const chr0 = rules('chr_')[0];
  const fieldSpr = ART.sprites.spriteFor(b, 'chr', chr0.id, 'field');
  const battleSpr = ART.sprites.spriteFor(b, 'chr', chr0.id, 'battle');
  ART.records.del(battleSpr.id, b);
  cov = COV.compute(b);
  const gapB = cov.gaps.find((g) => g.key === 'sprites:chr:' + chr0.id + ':battle');
  check('deleting a battle sprite opens exactly that gap', cov.gaps.length === 1 && gapB && gapB.fix.tab === 'sprites' && gapB.fix.sub === 'characters', cov.gaps.map((g) => g.key));
  Kit.go('start');
  COV.go(gapB);
  check('Fix opens the Sprites tab on Characters', Kit.active() === 'sprites' && ART.WS.sprites.ui.sub === 'characters');
  const okItem = COV.compute(b).items.find((i) => i.key === 'sprites:chr:' + chr0.id + ':field');
  COV.go(okItem);
  check('Open on an existing record jumps to that record', Kit.active() === 'sprites' && ART.WS.sprites.ui.focus === fieldSpr.id);
  ART.quickBuild.run(b);
  check('Quick Build closes the gap again', COV.compute(b).green);
  const newChr = Object.assign(JSON.parse(JSON.stringify(chr0)), { id: 'chr_newcomer_p8aa', name: 'Newcomer' });
  ['portrait', 'leitmotif'].forEach((k) => delete newChr[k]);
  b.rules.chr_[newChr.id] = newChr; Kit.index.invalidate();
  cov = COV.compute(b);
  check('a new character shows up as owed at once (computed, not stored)', cov.gaps.filter((g) => g.key.indexOf(newChr.id) >= 0).length >= 5 && !b.art.coverage, cov.gaps.map((g) => g.key));
  ART.quickBuild.run(b);
  check('Quick Build dresses the newcomer and fills its forward fields', COV.compute(b).green && b.rules.chr_[newChr.id].portrait && b.rules.chr_[newChr.id].leitmotif);
  const forest = ART.tiles.biome(b, 'forest');
  ART.tiles.remove(b, forest);
  cov = COV.compute(b);
  const advF = cov.items.find((i) => i.key === 'world:biome:forest');
  check('deleting a default biome is advisory with Restore, never a gap', cov.green && advF && advF.need === 'advisory' && advF.restore === 'biome:forest', cov.gaps.map((g) => g.key));
  COV.restore(b, 'biome:forest');
  check('Restore brings the forest back', !!ART.tiles.biome(b, 'forest') && !COV.compute(b).items.find((i) => i.key === 'world:biome:forest'));
  const walk = ART.motion.libAnim(b, 'walk');
  ART.records.del(walk.id, b); b.art.settings.retired.push('anim:walk');
  cov = COV.compute(b);
  const gW = cov.gaps.find((g) => g.key === 'motion:pose:walk');
  check('a required pose animation stays required even when deleted, and offers Restore', gW && gW.restore === 'anim:walk', cov.gaps.map((g) => g.key));
  COV.restore(b, 'anim:walk');
  check('Restore rebuilds the walk animation', !!ART.motion.libAnim(b, 'walk') && COV.compute(b).green);
  const por0 = ART.records.get(chr0.portrait, b);
  ART.records.del(por0.id, b);
  cov = COV.compute(b);
  check('a deleted portrait owes both the portrait and the forward field', cov.gaps.some((g) => g.key === 'portraits:chr:' + chr0.id) && cov.gaps.some((g) => g.group === 'links' && g.fix.tab === 'export'), cov.gaps.map((g) => g.key));
  ART.quickBuild.run(b);
  check('Quick Build heals both', COV.compute(b).green);

  // 4. References.
  const R = ART.refs;
  let scan = R.scan(b);
  check('a clean bundle has no dangling reference', scan.refs.length > 200 && !scan.dangling.length && !R.uncovered(b, scan).length, scan.dangling.slice(0, 3));
  check('the scan sees art links, subjects, and the biome priority list', ['art', 'subject', 'priority'].every((k) => scan.refs.some((r) => r.kind === k)));
  // Every path in COVERED is reported by its phase validator when the target goes missing, and art.refs stays quiet.
  const inst = {};
  scan.refs.filter((r) => r.kind === 'art').forEach((r) => { const k = Kit.ids.prefixOf(r.from) + '.' + r.path.replace(/\[\d+\]/g, '[]').replace(/^anims\..*$/, 'anims.*'); if (!inst[k]) inst[k] = r; });
  const snap = JSON.parse(JSON.stringify(b));
  const covered = [];
  for (const k of Object.keys(inst)) {
    const r = inst[k];
    const c = JSON.parse(JSON.stringify(snap)); Kit.bundle.load(c);
    const cb = Kit.bundle.current(); delete cb.art.records[Kit.ids.prefixOf(r.id)][r.id]; Kit.index.invalidate();
    const res = Kit.validate(cb), mine = res.errors.concat(res.warnings).filter((i) => i.recordId === r.from), dup = res.broken.filter((i) => i.recordId === r.from);
    covered.push({ k, phase: mine.length > 0, dup: dup.length });
  }
  check('every link path is reported once: by its phase validator, never twice', covered.every((x) => x.phase && !x.dup), covered.filter((x) => !x.phase || x.dup));
  Kit.bundle.load(JSON.parse(JSON.stringify(snap))); b = Kit.bundle.current();
  const wov = ART.motion.overlays(b)[0];
  wov.ambient = 'sfx_gone_p8zz'; Kit.index.invalidate();
  let res = Kit.refreshValidation();
  const brk = res.broken.filter((i) => i.recordId === wov.id);
  check('a dangling art link at an unowned path is broken (art.refs)', brk.length === 1 && brk[0].fieldPath === 'ambient' && brk[0].id === 'sfx_gone_p8zz', res.broken.slice(0, 2));
  let finalErr = null; try { Kit.buildExport('final', { fill: true }); } catch (e) { finalErr = e.message; }
  check('a broken art link blocks Final, even with fill', /blocked/.test(finalErr || ''), finalErr);
  const draft = Kit.buildExport('draft');
  const dman = JSON.parse(draft.files[1].text);
  check('Draft still exports and its manifest lists the link as unresolved', dman.unresolved.some((u) => u.id === 'sfx_gone_p8zz' && u.recordId === wov.id && u.field === 'ambient'), dman.unresolved);
  wov.ambient = null;
  const inter = ART.tiles.interiors(b)[0];
  wov.ambient = inter.id + ':no_such_tile'; Kit.index.invalidate();
  check('an interior tile reference to a missing tile key is found', R.scan(b).dangling.some((x) => x.id === inter.id && x.key === 'no_such_tile'));
  wov.ambient = null;
  const famRec = rules('fam_')[0];
  const tierPal = ART.bySubject('pal_', 'fam', famRec.id, b);
  tierPal.subject.ref = 'fam_ghost_p8xx'; tierPal.derivedFrom.fam = 'fam_ghost_p8xx'; Kit.index.invalidate();
  res = Kit.refreshValidation();
  check('an orphaned subject is a warning from its own validator, not broken', !res.broken.length && res.warnings.some((w) => w.recordId === tierPal.id) && !res.warnings.some((w) => w.recordId === tierPal.id && /no longer in the rules/.test(w.message)), res.broken.slice(0, 2));
  Kit.bundle.load(JSON.parse(JSON.stringify(snap))); b = Kit.bundle.current();
  res = Kit.refreshValidation();
  check('restored bundle validates clean', !res.errors.length && !res.broken.length, Kit.validate.summary(res));

  // 5. Export: fill toggle, four files, one hash everywhere, manifest contents.
  const chrA = rules('chr_')[1];
  delete chrA.portrait; Kit.index.invalidate();
  check('an emptied forward field is owed but does not block a filled Final', ART.links.plan(b).length === 1 && ART.finalState(b, true).ok && ART.finalState(b, false).ok);
  Kit.go('start');
  Kit.openExport();
  const dlg = d.querySelector('.dialog');
  const toggles = [...dlg.querySelectorAll('.a7-check input')];
  check('export dialog offers fill (on, because a field is owed) and engines (on)', toggles.length === 2 && toggles[0].checked && toggles[1].checked && /Fill 1 forward field/.test(dlg.textContent));
  check('export dialog shows coverage, with the owed field as the one gap', /Coverage/.test(dlg.textContent) && /1 required item missing/.test(dlg.textContent), dlg.textContent.slice(0, 200));
  dlg.querySelector('input[value="final"]').checked = true;
  dlg.querySelector('input[value="final"]').dispatchEvent(new win.Event('change'));
  const dl = []; Kit.util.download = (name, text) => dl.push({ name, text });
  [...dlg.querySelectorAll('.dlg-foot .btn')].find((x) => /Download/.test(x.textContent)).click();
  await wait(1600);
  check('Download writes bundle, manifest, and both engines', dl.map((f) => f.name).join() === 'demo-saga-bundle.json,demo-saga-art-manifest.json,engine-render.js,engine-audio.js', dl.map((f) => f.name));
  const fb = JSON.parse(dl[0].text), man = JSON.parse(dl[1].text);
  check('the export filled the owed field first', fb.rules.chr_[chrA.id].portrait && ART.records.get(fb.rules.chr_[chrA.id].portrait));
  check('Final opened art and stamped forge 147', fb.kit.opened.includes('art') && fb.kit.forges['147'].status === 'final' && fb.kit.forges['146'].status === 'final');
  check('content hash is recomputed: Day 147 hash of the file equals the stamp', Kit.bundle.hash(fb) === fb.kit.contentHash);
  check('manifest and both engine headers carry the same hash', man.bundleHash === fb.kit.contentHash && dl[2].text.indexOf(' * Bundle hash: ' + fb.kit.contentHash + '\n') > 0 && dl[3].text.indexOf(' * Bundle hash: ' + fb.kit.contentHash + '\n') > 0);
  const allArt = Object.keys(fb.art.records).reduce((n, p) => n + Object.keys(fb.art.records[p]).length, 0);
  check('manifest lists every art ID created', man.created.length === allArt && man.created.every((id) => fb.art.records[Kit.ids.prefixOf(id)][id]));
  const fwVals = []; [['chr_', 'portrait'], ['chr_', 'leitmotif'], ['abl_', 'animation'], ['abl_', 'sfx'], ['abl_', 'icon'], ['itm_', 'icon'], ['eqp_', 'icon'], ['fam_', 'sprite']].forEach(([p, f]) => Object.values(fb.rules[p] || {}).forEach((r) => { if (r[f]) fwVals.push(r[f]); }));
  check('manifest referenced covers every forward value and every rules subject', fwVals.every((v) => man.referenced.includes(v)) && Object.keys(fb.rules.chr_).every((id) => man.referenced.includes(id)), fwVals.filter((v) => !man.referenced.includes(v)).slice(0, 3));
  check('manifest: nothing unresolved, coverage complete, engines listed', !man.unresolved.length && man.coverage.percent === 100 && man.coverage.required === man.coverage.covered && man.engines.map((e) => e.file + e.version).join() === 'engine-render.js1.0.0,engine-audio.js1.0.0' && man.forward.every((f) => f.ok) && man.artOpened);
  check('page engine files equal the repository files apart from the hash line', ART.engines.file('render', '').text === files.render && ART.engines.file('audio', '').text === files.audio);
  check('buildExport without opts never fills (a dangling field still blocks Final)', (() => { const c = rules('chr_')[2]; const keep = c.portrait; c.portrait = 'por_missing_p8qq'; Kit.index.invalidate(); let e = null; try { Kit.buildExport('final'); } catch (x) { e = x.message; } c.portrait = keep; Kit.index.invalidate(); return /blocked/.test(e || ''); })());

  // 6. Engines from the files reproduce the page: frames, tiles, a presented battle, a compiled track, a sound.
  b = Kit.bundle.current();
  const ER = win.ENGINE_RENDER, EA = win.ENGINE_AUDIO, VR = box.ENGINE_RENDER, VA = box.ENGINE_AUDIO;
  const artCopy = JSON.parse(JSON.stringify(b.art)), ent = ART.palette.entries(b), T = ART.sprites.tileSize(b);
  const kp = ER.createCache(b.art, { size: T, entries: ent, budget: 64e6 }), kv = VR.createCache(artCopy, { size: T, entries: ent, budget: 64e6 });
  const sprIds = ART.sprites.sprites(b).map((s) => s.id);
  let same = 0, total = 0;
  sprIds.forEach((id) => ['stand', 'idle', 'attack'].forEach((pz) => { const a = kp.sprite(id, pz, 'right'), c = kv.sprite(id, pz, 'right'); total++; if (a && c && digest(a.rgba) === digest(c.rgba)) same++; }));
  ART.sprites.portraits(b).forEach((p) => { const a = kp.portrait(p.id, 'neutral'), c = kv.portrait(p.id, 'neutral'); total++; if (a && c && digest(a.rgba) === digest(c.rgba)) same++; });
  ART.sprites.icons(b).forEach((i) => { const a = kp.icon(i.id), c = kv.icon(i.id); total++; if (a && c && digest(a.rgba) === digest(c.rgba)) same++; });
  ART.tiles.tilesets(b).forEach((t) => [0, 23, 46].forEach((bl) => { const a = kp.tile(t.id, bl, 0, t.kind === 'interior' ? t.tiles[0].key : null), c = kv.tile(t.id, bl, 0, t.kind === 'interior' ? t.tiles[0].key : null); total++; if (a && c && digest(a.rgba) === digest(c.rgba)) same++; }));
  check('engine-render.js bakes every sprite, portrait, icon, and tile pixel for pixel like the page', same === total && total > 100, same + '/' + total);
  const sc = ART.battle.script(b);
  function present(E, cache, art) {
    const cues = [], cfg = ART.battle.presenterConfig(b, JSON.parse(JSON.stringify(sc.snapshot)), { seed: 3, cache, cue: (k, id) => cues.push(k + ':' + id) });
    cfg.art = art;
    const P = E.createPresenter(cfg), ctx = fakeCtx();
    const pl = ART.battle.playScript(P, JSON.parse(JSON.stringify(sc)));
    let fr = 0; while (!pl.done() && fr < 20000) { pl.step(16); if (fr % 5 === 0) P.draw(ctx); fr++; }
    return { stats: JSON.stringify(P.stats()), cues: cues.join(','), ended: P.ended(), fr, draws: ctx.calls.n };
  }
  const pp = present(ER, ER.createCache(b.art, { size: T, entries: ent }), b.art), pv = present(VR, VR.createCache(artCopy, { size: T, entries: ent }), artCopy);
  check('engine-render.js presents the scripted battle beat for beat and cue for cue like the page', pp.stats === pv.stats && pp.cues === pv.cues && pp.ended === pv.ended && pp.fr === pv.fr && pv.draws > 1000, { page: pp.stats, file: pv.stats });
  const trk = ART.audio.tracks(b), snd = ART.audio.sounds(b);
  const tSame = trk.every((t) => JSON.stringify(EA.track.compile(t)) === JSON.stringify(VA.track.compile(JSON.parse(JSON.stringify(t)))));
  const sSame = snd.slice(0, 12).every((s) => digest(new Uint8Array(new Float32Array(EA.sfxr.render(s.params, 22050, s.seed >>> 0 || 1)).buffer)) === digest(new Uint8Array(new Float32Array(VA.sfxr.render(JSON.parse(JSON.stringify(s.params)), 22050, s.seed >>> 0 || 1)).buffer)));
  const mot = ART.audio.motifs(b)[0];
  const mSame = JSON.stringify(EA.motif.realize(mot, mot.variations.battle, {})) === JSON.stringify(VA.motif.realize(JSON.parse(JSON.stringify(mot)), JSON.parse(JSON.stringify(mot.variations.battle)), {}));
  check('engine-audio.js compiles every track, renders sounds, and realizes motifs like the page', tSame && sSame && mSame, { tSame, sSame, mSame });

  // 7. Day 146 round trip: 147 Final -> 146 -> 146 Draft -> 147.
  const finalText = dl[0].text;
  const r146 = await in146(finalText, async (w, K, r) => {
    let blocked = null; try { K.buildExport('final'); } catch (e) { blocked = e.message; }
    const out = K.buildExport('draft');
    const m146 = JSON.parse(out.files[2].text);
    return { blocked, back: out.files[0].text, refsArt: m146.referenced.filter((id) => /^(por|mus|anm|sfx|ico|spr)_/.test(id)).length, opened: K.bundle.current().kit.opened, forward: r.forward.length };
  });
  check('Day 146 opens the Final export: hash matches, no errors, nothing broken or forward', r146.matches && !r146.summary.errors && !r146.summary.broken && !r146.forward && !r146.blocked, r146);
  check('Day 146 sees the art IDs in the forward fields as resolved references', r146.refsArt > 20 && r146.opened.includes('art'), r146.refsArt);
  ({ win, errors } = boot(APP147, { url: URL147 }));
  await wait(80);
  Kit = win.Kit; ART = win.ART;
  const imp = Kit.bundle.importText(r146.back);
  const back = Kit.bundle.current();
  check('Day 147 reopens the bundle Day 146 saved: hash matches, art unchanged', imp.matches && Kit.util.canonical(back.art) === Kit.util.canonical(fb.art));
  check('codex prefixes are registered again on load (Day 146 drops them)', ART.PREFIXES.every((p) => back.codex.prefixes[p] && back.codex.prefixes[p].ns === 'art' && back.codex.prefixes[p].forge === 147));
  const cv2 = ART.coverage.compute(back), sc2 = ART.refs.scan(back), rv2 = Kit.refreshValidation();
  check('round tripped bundle: coverage green, no dangling reference, validation clean', cv2.green && !sc2.dangling.length && !rv2.errors.length && !rv2.broken.length, { gaps: cv2.gaps.length, dang: sc2.dangling.length, v: Kit.validate.summary(rv2) });
  const rep = ART.quickBuild.run(back);
  check('Quick Build after the round trip creates nothing (nothing was lost)', rep.created === 0, rep.steps);
  const fin2 = Kit.buildExport('final');
  const r2 = await in146(fin2.files[0].text);
  check('second Final export from the round tripped bundle opens in Day 146 clean', r2.matches && !r2.summary.errors && !r2.summary.broken, r2.summary);

  // 8. The full fixture pass: self test, then every fixture exported Final and opened in Day 146.
  const t8 = Date.now();
  const rows = win.ART_DEMO.selfTest();
  const st = Date.now() - t8;
  const bad = rows.filter((r) => !r.coverage.green || r.refs.dangling || r.validation.errors || r.validation.broken || !r.canFinal);
  check('self test: every fixture green, no dangling reference, no error, Final allowed', !bad.length && rows.length === 10, bad.map((r) => ({ k: r.key, gaps: r.coverage.gaps, refs: r.refs, v: r.validation })));
  check('self test reports coverage and references per fixture', rows.every((r) => r.coverage.required > 0 && r.refs.refs >= 0 && typeof r.refs.ms === 'number'));
  const fxReport = [];
  for (const f of win.ART_DEMO.FIXTURES) {
    Kit.bundle.load(win.ART_DEMO.fixture(f.key));
    const fbn = Kit.bundle.current();
    ART.quickBuild.run(fbn);
    let out = null, err = null;
    try { out = Kit.buildExport('final', { fill: true }); } catch (e) { err = e.message; }
    if (!out) { fxReport.push({ key: f.key, err }); continue; }
    const m = JSON.parse(out.files[1].text);
    const r = await in146(out.files[0].text);
    const base = await in146(JSON.stringify(win.ART_DEMO.fixture(f.key)));
    fxReport.push({ key: f.key, matches: r.matches, base: base.summary.errors, errors: r.summary.errors - base.summary.errors, broken: r.summary.broken, forward: r.summary.forward, unresolved: m.unresolved.length, cov: m.coverage.percent, files: out.files.length, kb: Math.round(out.files[0].text.length / 1024) });
  }
  check('every fixture exports Final and opens in Day 146 with matching hash, no new error, zero broken (F4 keeps its two Charter errors)', fxReport.every((r) => !r.err && r.matches && !r.errors && !r.broken && !r.forward && !r.unresolved && r.cov === 100 && r.files === 4), fxReport);
  check('every exported fixture stays under the 1.5 MB amber line', fxReport.every((r) => r.kb < 1500), fxReport.map((r) => r.key + ' ' + r.kb + ' KB'));

  // 9. UI: Export tab and its four views, the coverage chip and drawer, the Dev self test table.
  d = win.document;
  Kit.bundle.load(win.ART_DEMO.bundle());
  ART.quickBuild.run(Kit.bundle.current());
  ART.paintCoverage();
  const chip = d.getElementById('btnCoverage');
  check('coverage chip shows the count and reads complete', !chip.hidden && /Coverage/.test(chip.textContent) && !!chip.querySelector('.chip-ok') && /complete/.test(chip.getAttribute('aria-label')), chip.getAttribute('aria-label'));
  Kit.go('export');
  const subs = [...d.querySelectorAll('#ws .a7-sub button')].map((x) => x.textContent);
  check('Export has Coverage, References, Size, Downloads', subs.join() === 'Coverage,References,Size,Downloads', subs);
  const views = {};
  for (const name of subs) { [...d.querySelectorAll('#ws .a7-sub button')].find((x) => x.textContent === name).click(); views[name] = d.querySelector('#ws .a7-subpanel').textContent; }
  check('Coverage view says complete', /Every required item exists/.test(views.Coverage), views.Coverage.slice(0, 120));
  check('References view lists the check, the forward fields, and the manifest preview', /Reference check/.test(views.References) && /Forward fields/.test(views.References) && /Manifest preview/.test(views.References) && /Every one resolves/.test(views.References));
  check('Size view shows the meter', /available in this browser/.test(views.Size));
  check('Downloads view offers the export and both engine files', /Export the bundle/.test(views.Downloads) && /engine-render\.js \(1\.0\.0\)/.test(views.Downloads) && /engine-audio\.js \(1\.0\.0\)/.test(views.Downloads));
  const dl2 = []; Kit.util.download = (name, text) => dl2.push({ name, text });
  [...d.querySelectorAll('#ws .btn')].find((x) => /engine-render\.js/.test(x.textContent)).click();
  check('engine download button gives engine-render.js', dl2.length === 1 && dl2[0].name === 'engine-render.js' && dl2[0].text === files.render);
  const bb = Kit.bundle.current(), sp = ART.sprites.spriteFor(bb, 'role', 'npc:merchant', 'field');
  ART.records.del(sp.id, bb); Kit.bundle.touch('test');
  ART.paintCoverage();
  check('chip turns to a gap count when something is missing', !chip.querySelector('.chip-ok') && /1 missing/.test(chip.getAttribute('aria-label')), chip.getAttribute('aria-label'));
  chip.click();
  const gaps = [...d.querySelectorAll('.drawer .a7-gap')];
  check('chip opens the gap list with the missing NPC and Fix and Quick Build buttons', gaps.length >= 2 && gaps.some((g) => /NPC sprite: merchant/.test(g.textContent)) && /Quick Build/.test(d.querySelector('.drawer').textContent));
  const fix = gaps.find((g) => /NPC sprite: merchant/.test(g.textContent)).querySelector('.btn');
  fix.click();
  check('Fix closes the drawer and opens Sprites, Villain and NPCs', !d.querySelector('.drawer') && Kit.active() === 'sprites' && ART.WS.sprites.ui.sub === 'cast');
  Kit.go('dev');
  [...d.querySelectorAll('#ws .btn')].find((x) => /Run self test/.test(x.textContent)).click();
  const th = [...d.querySelectorAll('#ws thead th')].map((x) => x.textContent);
  check('Dev self test table has Coverage and References columns', th.includes('Coverage') && th.includes('References') && /complete/.test(d.querySelector('#ws tbody').textContent));
  check('no page errors through the whole run', !errors.length, errors.slice(0, 3));

  // Report.
  const failed = results.filter((r) => !r.ok);
  results.forEach((r) => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : ' :: ' + JSON.stringify(r.detail))));
  console.log('\n' + (results.length - failed.length) + ' of ' + results.length + ' passed. Self test ' + st + ' ms.');
  fs.writeFileSync(path.join(__dirname, 'out', 'phase8-report.json'), JSON.stringify({ passed: results.length - failed.length, total: results.length, selfTestMs: st, fixtures: fxReport, selfTest: rows.map((r) => ({ key: r.key, coverage: r.coverage, refs: r.refs, size: r.size, validation: r.validation })), results }, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
