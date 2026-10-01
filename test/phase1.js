// Phase 1 acceptance: palette pipeline. Engine math, records, Quick Build, dependents, fixtures, UI, and the Day 146 round trip.
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
  // 0. Static checks: non ASCII scan and a syntax check of the script.
  const nonAscii = [];
  html.split('\n').forEach((l, i) => { if (/[^\x00-\x7e]/.test(l)) nonAscii.push(i + 1); });
  check('index.html is pure ASCII', !nonAscii.length, nonAscii.slice(0, 5));
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  let syntaxOk = true; try { new Function(script); } catch (e) { syntaxOk = e.message; }
  check('script parses', syntaxOk === true, syntaxOk);
  const fences = ['KIT:CORE', 'ART:STORE', 'ART:DEMO', 'ART:CONTRACT', 'ENGINE:RENDER', 'ART:PALETTE', 'WS:PALETTE', 'WS:ART147', 'APP:BOOT'];
  const at = fences.map((f) => script.indexOf('// === ' + f + ' BEGIN ==='));
  check('fences present in order', at.every((x, i) => x >= 0 && (i === 0 || x > at[i - 1])), at);
  const eng = script.slice(script.indexOf('// === ENGINE:RENDER BEGIN ==='), script.indexOf('// === ENGINE:RENDER END ==='));
  check('ENGINE:RENDER reads no host globals', !/\b(Kit|ART|window|document|localStorage|ENGINE_AUDIO|ENGINE_BATTLE)\b/.test(eng.replace(/\/\/.*$/gm, '')));

  let { win, errors } = boot(APP147, { url: 'https://augustineiacopelli.github.io/appaday/147/?dev=1' });
  await wait(60);
  const Kit = win.Kit, ART = win.ART, ER = win.ENGINE_RENDER, Cc = ER.color, Pe = ER.palette;
  check('boots with no page errors', !errors.length, errors.slice(0, 2));
  check('ENGINE_RENDER frozen, version 1.0.0', Object.isFrozen(ER) && Object.isFrozen(ER.palette) && ER.version === '1.0.0');

  // 1. Color math.
  let maxErr = 0;
  for (let i = 0; i < 3000; i++) {
    const h = Cc.rgbToHex(Math.random() * 255, Math.random() * 255, Math.random() * 255), l = Cc.hexToLch(h);
    const a = Cc.hexToRgb(h), c = Cc.hexToRgb(Cc.lchToHex(l[0], l[1], l[2]));
    maxErr = Math.max(maxErr, ...a.map((v, j) => Math.abs(v - c[j])));
  }
  check('OKLab round trip is lossless at 8 bits', maxErr === 0, maxErr);
  const w = Cc.hexToLab('#ffffff'), k = Cc.hexToLab('#000000');
  check('OKLab white L=1 and black L=0', Math.abs(w[0] - 1) < 1e-6 && Math.abs(w[1]) < 1e-6 && k[0] === 0);
  check('gamut mapping stays in sRGB', /^#[0-9a-f]{6}$/.test(Cc.lchToHex(0.7, 0.5, 140)) && Cc.lchToHex(0.7, 0.5, 140) === Cc.lchToHex(0.7, 0.9, 140));

  // 2. Master palette across sizes.
  const demo = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'demo-bundle.json'), 'utf8'));
  const sizes = [2, 3, 4, 5, 8, 16, 32, 64, 128, 256], sizeRows = [];
  sizes.forEach((n) => {
    const ch = JSON.parse(JSON.stringify(demo.charter)); ch.specs.paletteSize = n;
    const t = Date.now(), m = Pe.buildMaster(ch, demo.rules, 9), ms = Date.now() - t, m2 = Pe.buildMaster(ch, demo.rules, 9);
    const elErr = Math.max(...ch.ruleset.elements.map((e) => Cc.distHex(e.color, m.entries[Pe.nearest(m.entries, e.color)])));
    sizeRows.push({ n, len: m.entries.length, uniq: new Set(m.entries).size, ms, same: JSON.stringify(m) === JSON.stringify(m2), elErr: +elErr.toFixed(3), valid: m.entries.every((h) => /^#[0-9a-f]{6}$/.test(h)) });
  });
  check('master has exactly paletteSize unique valid colors at every size', sizeRows.every((r) => r.len === r.n && r.uniq === r.n && r.valid), sizeRows);
  check('master is deterministic per seed', sizeRows.every((r) => r.same));
  check('element colors honored exactly from 32 colors up', sizeRows.filter((r) => r.n >= 32).every((r) => r.elErr < 0.005), sizeRows.map((r) => r.n + ':' + r.elErr).join(' '));
  check('master builds in under 60 ms at 256', sizeRows.every((r) => r.ms < 60), sizeRows.map((r) => r.ms));
  const c64 = JSON.parse(JSON.stringify(demo.charter));
  const s1 = Pe.buildMaster(c64, demo.rules, 1).entries.join(), s2 = Pe.buildMaster(c64, demo.rules, 2).entries.join();
  check('a different seed changes the master', s1 !== s2);
  const m64 = Pe.buildMaster(c64, demo.rules, 1).entries;
  const two = Pe.buildMaster(Object.assign({}, c64, { specs: { paletteSize: 2 } }), demo.rules, 1).entries;
  check('two colors means one dark and one light', Cc.hexToLab(two[0])[0] < 0.25 && Cc.hexToLab(two[1])[0] > 0.85, two);

  // 3. nearest, ramp, collapse.
  let nearOk = true;
  for (let i = 0; i < 400; i++) {
    const h = Cc.rgbToHex(Math.random() * 255, Math.random() * 255, Math.random() * 255);
    const n = Pe.nearest(m64, h), d = Cc.distHex(h, m64[n]);
    if (m64.some((x) => Cc.distHex(h, x) < d - 1e-12)) nearOk = false;
  }
  check('nearest matches brute force', nearOk);
  let monoOk = true;
  for (let i = 0; i < m64.length; i++) {
    const r = Pe.ramp(m64, i, 3), L = r.map((x) => Cc.hexToLab(m64[x])[0]);
    if (!(L[0] <= L[1] && L[1] <= L[2])) monoOk = false;
  }
  check('every ramp runs dark to light', monoOk);
  const distinctRamps = m64.filter((_, i) => new Set(Pe.ramp(m64, i, 3)).size === 3).length;
  check('ramps are three distinct colors for most entries at 64', distinctRamps >= 48, distinctRamps);
  const col = Pe.collapse(m64, 2);
  check('collapse to 2 keeps the darkest and lightest', col.entries.length === 2 && col.map.length === 64 && Cc.hexToLab(col.entries[0])[0] < 0.2 && Cc.hexToLab(col.entries[1])[0] > 0.85, col.entries);
  check('collapse to 8 is maximin over the source', Pe.collapse(m64, 8).entries.length === 8 && Pe.collapse(m64, 8).entries.every((h) => m64.includes(h)));

  // 4. Quick Build on the demo.
  Kit.bundle.load(JSON.parse(JSON.stringify(demo)));
  await wait(20);
  let b = Kit.bundle.current();
  const rep = ART.quickBuild.run(b);
  const P = ART.palette;
  check('Quick Build creates master, 14 colorways, 6 tier palettes, 4 element palettes',
    P.master(b) && P.entries(b).length === 64 && P.locals(b).length === 14 && P.tiers(b).length === 6 && P.effects(b).length === 4 && rep.created === 25, { created: rep.created, steps: rep.steps });
  let res = Kit.refreshValidation();
  check('Quick Build leaves 0 errors, 0 broken, 0 warnings', !res.errors.length && !res.broken.length && !res.warnings.length, Kit.validate.summary(res));
  const subj = P.locals(b).map((r) => r.subject.kind + ':' + r.subject.ref);
  check('colorway subjects: every character, villain, ten NPCs', Object.keys(b.rules.chr_).every((id) => subj.includes('chr:' + id)) && subj.includes('role:villain') && ART.NPC_ARCHETYPES.every((k) => subj.includes('role:npc:' + k)));
  const loc = P.locals(b)[0];
  check('local palette: 16 slots, slot 0 clear, slot 1 outline, fixed ramp map',
    loc.slots.length === 16 && loc.slots[0] === null && loc.slots[1] === Pe.outline(P.entries(b)) && JSON.stringify(loc.ramps) === JSON.stringify({ skin: [2, 3, 4], hair: [5, 6, 7], clothA: [8, 9, 10], clothB: [11, 12, 13], metal: [14, 15] }) && ['clothB', 'metal'].includes(loc.colorway.accent), loc);
  const party = P.locals(b).filter((r) => r.subject.kind === 'chr');
  const hues = party.map((r) => Cc.hexToLch(P.entries(b)[r.slots[9]])[2]);
  check('party cloth A colors are distinct', new Set(party.map((r) => r.slots[9])).size === party.length, hues.map(Math.round));
  const tiers = P.tiers(b);
  const byBase = {}; tiers.forEach((t) => { (byBase[t.derivedFrom.base] = byBase[t.derivedFrom.base] || []).push(t.slots.join()); });
  check('tier palettes distinct within each family', Object.values(byBase).every((a) => new Set(a).size === a.length) && tiers.every((t) => !t.collapsed), byBase);
  const t2 = tiers.find((t) => t.derivedFrom.tier === 2);
  check('tier palettes carry derivedFrom {fam, tier, hueShift}', t2 && t2.derivedFrom.fam === t2.subject.ref && typeof t2.derivedFrom.hueShift === 'number' && t2.derivedFrom.hueShift !== 0, t2 && t2.derivedFrom);
  const fx = P.effects(b), fire = fx.find((r) => r.subject.ref === 'fire');
  check('element palettes: four indices dark to light, flash and tint, shape and screen', fx.every((r) => r.palette.length === 4) && fire.particle.shape === 'spark' && fire.screen === 'shake' &&
    fire.palette.map((i) => Cc.hexToLab(P.entries(b)[i])[0]).every((L, i, a) => !i || L >= a[i - 1]) && Cc.distHex(P.entries(b)[fire.tint], '#e4572e') < 0.005, fire);
  check('element shapes distinct in the demo', new Set(fx.map((r) => r.particle.shape)).size === fx.length, fx.map((r) => r.particle.shape));
  const art1 = JSON.stringify(b.art);
  const rep2 = ART.quickBuild.run(b);
  check('Quick Build is idempotent', rep2.created === 0 && JSON.stringify(b.art) === art1, { created: rep2.created, changed: JSON.stringify(b.art) !== art1 });

  // 5. Edits survive; master edits and rebuilds.
  const ed = party[0], before = ed.slots.slice();
  P.setStep(b, ed, 'clothA', 1, 5);
  check('editing a step marks the colorway as user and updates slots', ed.origin === 'user' && ed.slots[9] === 5 && ed.colorway.clothA[1] === 5);
  ART.quickBuild.run(b);
  check('Quick Build keeps edited colorways', ART.records.get(ed.id, b).slots[9] === 5 && ART.records.get(ed.id, b).origin === 'user');
  const entry5 = P.entries(b)[5];
  P.setEntry(b, 5, '#123456');
  check('editing a master entry recolors in place, indices unchanged', P.entries(b)[5] === '#123456' && ed.slots[9] === 5 && P.master(b).origin === 'user');
  P.setEntry(b, 5, entry5);
  const oldHex = P.entries(b)[ed.slots[9]];
  P.buildMaster(b, { force: true, seed: 424242 });
  const nu = P.entries(b);
  check('regenerating the master remaps kept records to the nearest new color', nu[ed.slots[9]] === nu[Pe.nearest(nu, oldHex)] && ed.origin === 'user');
  res = Kit.refreshValidation();
  check('after regenerate every index is in range (0 errors)', !res.errors.length && !res.broken.length, Kit.validate.summary(res));
  check('generated colorways refit, not remapped', party.slice(1).every((r) => r.slots.join() === Pe.local(nu, Pe.colorway(nu, Pe.colorwaySource(r.seed, r.hint))).join()));
  ed.slots[3] = 999; res = Kit.refreshValidation();
  check('validator flags an out of range slot', res.errors.some((e) => e.recordId === ed.id && e.fieldPath === 'slots.3'));
  ed.slots[3] = 2;
  b.charter.specs.paletteSize = 32; res = Kit.refreshValidation();
  check('validator warns when the master no longer matches the Charter size', res.warnings.some((e) => e.recordId === P.master(b).id));
  b.charter.specs.paletteSize = 64;

  // 6. Fixtures through the self test.
  const st = win.ART_DEMO.selfTest();
  const rows = st.map((r) => ({ key: r.key, qb: r.quickBuild, v: r.validation, p: r.palette, size: r.size }));
  check('self test runs Quick Build on every fixture', st.every((r) => r.palette && r.palette.master === r.palette.want), rows.map((r) => r.key + ' ' + JSON.stringify(r.p)));
  check('no fixture has errors or broken refs after Quick Build', st.every((r) => !r.validation.errors && !r.validation.broken), rows.map((r) => r.key + ':' + JSON.stringify(r.v)).join(' '));
  check('no fixture leaves a tier palette identical to a sibling', st.every((r) => !r.palette.collapsed), rows.map((r) => r.key + ':' + r.p.collapsed).join(' '));
  const f2 = st.find((r) => r.key === 'F2');
  check('F2: 256 colors, 19 colorways, 100 tiers, 12 effects, Quick Build under 400 ms', f2.palette.master === 256 && f2.palette.tiers === 100 && f2.palette.effects === 12 && f2.palette.locals === 19 && f2.quickBuildMs < 400, f2);
  const f1 = win.ART_DEMO.fixture('F1a');
  ART.quickBuild.run(f1);
  check('F1a two colors: every slot is index 0 or 1', P.locals(f1).concat(P.tiers(f1)).every((r) => r.slots.every((s) => s === null || s === 0 || s === 1)) && P.entries(f1).length === 2);
  const f2b = win.ART_DEMO.fixture('F2'); ART.quickBuild.run(f2b);
  const groups = {}; P.tiers(f2b).forEach((t) => { (groups[t.derivedFrom.base] = groups[t.derivedFrom.base] || []).push(t); });
  check('F2 tier groups have five tiers each, all distinct', Object.values(groups).length === 20 && Object.values(groups).every((g) => g.length === 5 && new Set(g.map((t) => t.slots.join())).size === 5));
  const small = win.ART_DEMO.fixture('F5d'); small.charter.specs.paletteSize = 4; ART.quickBuild.run(small);
  const wolf = P.tiers(small).filter((t) => /^Wolf/.test(t.name));
  check('4 colors: sibling tiers stay distinct', wolf.length === 2 && wolf[0].slots.join() !== wolf[1].slots.join(), wolf.map((t) => t.derivedFrom));
  const sq = win.ART_DEMO.fixture('F2'); sq.charter.specs.paletteSize = 4; ART.quickBuild.run(sq);
  const sqg = {}; P.tiers(sq).forEach((t) => { (sqg[t.derivedFrom.base] = sqg[t.derivedFrom.base] || []).push(t.slots.join()); });
  const shifted = P.tiers(sq).filter((t) => t.derivedFrom.rampOffset || t.derivedFrom.inverted).length;
  check('F2 cast at 4 colors: the lightness fallback fires and all five tiers per family stay distinct', shifted > 0 && Object.values(sqg).every((g) => new Set(g).size === g.length) && !P.tiers(sq).some((t) => t.collapsed), { shifted });
  const f4 = win.ART_DEMO.fixture('F4'); ART.quickBuild.run(f4);
  check('F4 sparse optionals: Quick Build clean', !Kit.validate(f4).errors.length);
  const f0 = win.ART_DEMO.fixture('F0'); ART.quickBuild.run(f0);
  check('F0 empty rules: master, villain, NPCs, effects; no tiers', P.master(f0) && P.tiers(f0).length === 0 && P.locals(f0).length === 11 && P.effects(f0).length === 4);

  // 7. UI: Palette tab and its sections render.
  Kit.bundle.load(JSON.parse(JSON.stringify(demo)));
  await wait(20);
  check('Palette tab unlocked with a locked Charter', Kit.canEnter('palette').ok);
  Kit.go('palette'); await wait(10);
  let ws = win.document.getElementById('ws');
  check('Palette shows the build prompt before a master exists', /No master palette yet/.test(ws.textContent) && !/Arrives in/.test(ws.textContent));
  ART.quickBuild.run(Kit.bundle.current()); Kit.rerender(); await wait(10);
  ws = win.document.getElementById('ws');
  check('Master view: 64 swatches and anchors', ws.querySelectorAll('.a7-sw-grid .a7-sw').length === 64 && ws.querySelectorAll('.a7-anchor').length > 10);
  const subs = Array.from(ws.querySelectorAll('.a7-sub button'));
  const counts = {};
  for (const s of subs) { s.click(); await wait(5); counts[s.dataset.sub] = ws.querySelectorAll('.a7-row').length; }
  check('every section renders rows', counts.colorways === 14 && counts.tiers === 6 && counts.elements === 4, counts);
  check('no page errors while rendering', !errors.length, errors.slice(0, 3));
  subs[1].click(); await wait(5);
  ws.querySelector('.a7-row .btn').click(); await wait(5);
  const drawer = win.document.querySelector('.drawer');
  check('colorway editor opens with five materials and an accent', drawer && drawer.querySelectorAll('.a7-mat').length === 6 && drawer.querySelectorAll('.a7-steps .a7-sw').length === 14);
  Kit.ui.closeTop(); await wait(5);
  const fxId = P.effects(Kit.bundle.current())[0].id;
  Kit.go('start'); Kit.jump(fxId); await wait(10);
  check('jump to an efx_ record lands on Element palettes', Kit.active() === 'palette' && win.ART.WS.palette.ui.sub === 'elements' && !!win.document.querySelector('.a7-row.a7-hit'));
  Kit.go('start'); await wait(5);
  const qb = Array.from(win.document.querySelectorAll('#ws .btn')).find((x) => /Quick Build/.test(x.textContent));
  check('Start Quick Build button is enabled', qb && !qb.disabled);

  // 8. Day 146 round trip after Quick Build.
  const draft = Kit.buildExport('draft');
  const r146 = await in146(draft.files[0].text, (w2, K, r) => ({ artKept: JSON.stringify(K.bundle.current().art) === JSON.stringify(JSON.parse(draft.files[0].text).art) }));
  check('146 imports the Quick Built draft: hash ok, 0 errors, 0 broken, art untouched', r146.matches && !r146.summary.errors && !r146.summary.broken && r146.artKept, r146);
  const fin = Kit.buildExport('final');
  const rf = await in146(fin.files[0].text, async (w2, K, r) => { let blocked = null; try { K.buildExport('final'); } catch (e) { blocked = e.message; } return { blocked }; });
  check('Final export with palettes opens art and 146 still allows Final', JSON.parse(fin.files[0].text).kit.opened.includes('art') && rf.matches && !rf.summary.errors && !rf.summary.broken && !rf.blocked, rf);
  const sz = ART.size(Kit.bundle.current());
  check('demo bundle with palettes stays small', sz.total < 120000 && sz.ns.art < 40000, { total: sz.total, art: sz.ns.art });

  const pass = results.filter((r) => r.ok).length;
  results.forEach((r) => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail).slice(0, 900))));
  console.log('\nMaster sizes:'); sizeRows.forEach((r) => console.log('  ' + String(r.n).padStart(3), r.ms + 'ms', 'element dE max', r.elErr));
  console.log('\nSelf test:'); st.forEach((r) => console.log('  ' + r.key.padEnd(4), (r.size / 1000).toFixed(1).padStart(6), 'KB', r.quickBuild.padEnd(18), JSON.stringify(r.palette)));
  console.log('\n' + pass + ' of ' + results.length + ' passed');
  fs.writeFileSync(path.join(__dirname, 'out', 'phase1-report.json'), JSON.stringify({ results, sizes: sizeRows, selfTest: st }, null, 2));
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
