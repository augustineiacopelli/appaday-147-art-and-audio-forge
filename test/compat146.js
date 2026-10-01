// Day 146 compatibility probes. Each scenario boots a fresh Day 146 page, imports a bundle, and reports what 146 makes of it.
'use strict';
const fs = require('fs');
const path = require('path');
const { boot } = require('./boot');

const APP146 = require('../day146');

async function in146(bundleText, fn) {
  const { win, errors } = boot(APP146);
  await new Promise((r) => setTimeout(r, 30));
  const Kit = win.Kit;
  let r;
  try { r = Kit.bundle.importText(bundleText); } catch (e) { return { rejected: e.message }; }
  const res = Kit.refreshValidation();
  const out = { matches: r.matches, summary: Kit.validate.summary(res), pageErrors: errors.slice(0, 3) };
  if (fn) Object.assign(out, await fn(win, Kit, res));
  return out;
}
// Restamps the content hash with Day 146's own algorithm (KIT:CORE verbatim is what Day 147 ships).
async function stamp(bundle) {
  const { win } = boot(APP146);
  await new Promise((r) => setTimeout(r, 30));
  bundle.kit.contentHash = win.Kit.bundle.hash(bundle);
  return JSON.stringify(bundle, null, 2);
}

module.exports = { in146, stamp };

if (require.main === module) (async () => {
  const demoText = fs.readFileSync(path.join(__dirname, 'out', 'demo-bundle.json'), 'utf8');
  const demo = () => JSON.parse(demoText);
  const report = {};
  const chrId = Object.keys(demo().rules.chr_)[0];
  const famId = Object.keys(demo().rules.fam_)[0];

  report.A_baseline = await in146(demoText);

  // B: populated art with old and new prefixes, art NOT opened.
  const artRecords = {
    spr_: { spr_courier_field_a1b2: { id: 'spr_courier_field_a1b2', name: 'Courier field', subject: { kind: 'chr', ref: chrId }, origin: 'procedural', seed: 1 } },
    por_: { por_courier_a1b2: { id: 'por_courier_a1b2', name: 'Courier portrait', subject: { kind: 'chr', ref: chrId } } },
    til_: { til_forest_a1b2: { id: 'til_forest_a1b2', name: 'Forest', subject: { kind: 'role', ref: 'biome:forest' } } },
    pal_: { pal_master_a1b2: { id: 'pal_master_a1b2', name: 'Master', kind: 'master', entries: ['#000000', '#ffffff'] } },
    fx_: { fx_fire_a1b2: { id: 'fx_fire_a1b2', name: 'Fire effect' } }
  };
  let b = demo();
  b.art = { version: '1.0.0', settings: { baseSize: 16 }, records: JSON.parse(JSON.stringify(artRecords)) };
  b.kit.forges['147'] = { status: 'draft', exportedAt: '2026-10-01T00:00:00.000Z', artVersion: '1.0.0' };
  const bText = await stamp(b);
  report.B_artClosed = await in146(bText, (win, Kit) => {
    const idx = Kit.index();
    return {
      indexed: Object.keys(artRecords).map((p) => Object.keys(artRecords[p])[0]).map((id) => id + ':' + (idx.byId[id] ? 'yes' : 'no')).join(' '),
      fxIdValid: Kit.ids.isValid('fx_fire_a1b2'), efxRegex: Kit.codex.ID_RE.test('efx_fire_a1b2'),
      artKept: JSON.stringify(Kit.bundle.current().art) === JSON.stringify(b.art),
      forge147Kept: !!Kit.bundle.current().kit.forges['147']
    };
  });

  // C: forward fields filled (portrait exists, sprite does not), art closed vs opened.
  b = demo();
  b.art = { version: '1.0.0', records: JSON.parse(JSON.stringify(artRecords)) };
  b.rules.chr_[chrId].portrait = 'por_courier_a1b2';
  b.rules.fam_[famId].sprite = 'spr_missing_zz99';
  const cClosed = await stamp(JSON.parse(JSON.stringify(b)));
  report.C1_forwardArtClosed = await in146(cClosed, (win, Kit, res) => ({ forward: res.forward.map((f) => f.id) }));
  b.kit.opened.push('art');
  const cOpen = await stamp(b);
  report.C2_forwardArtOpened = await in146(cOpen, (win, Kit, res) => {
    let finalBlocked = false;
    try { Kit.buildExport('final'); } catch (e) { finalBlocked = e.message; }
    return { broken: res.broken.map((x) => x.id), forward: res.forward.map((x) => x.id), finalBlocked };
  });
  // C3: art opened and EMPTY (the Phase 0 step 4 shape) with one forward field filled.
  b = demo();
  b.kit.opened.push('art');
  b.art = { version: '1.0.0', records: {} };
  b.rules.chr_[chrId].portrait = 'por_courier_a1b2';
  report.C3_emptyArtOpenedWithForward = await in146(await stamp(b), (win, Kit, res) => ({ broken: res.broken.map((x) => x.id) }));
  b.rules.chr_[chrId].portrait = undefined; delete b.rules.chr_[chrId].portrait;
  report.C4_emptyArtOpenedNoForward = await in146(await stamp(b));

  // D: codex.prefixes extension survives Day 146 regeneration?
  b = demo();
  b.codex.prefixes.til_ = { type: null, ns: 'art', forge: 147, module: null, active: true };
  b.codex.prefixes.spr_.registeredBy = 147;
  report.D_codexRegenerate = await in146(await stamp(b), (win, Kit) => {
    const before = Object.keys(Kit.bundle.current().codex.prefixes).length;
    win.WS.codex.generate({ quiet: true });
    const p = Kit.bundle.current().codex.prefixes;
    return { before, after: Object.keys(p).length, tilKept: !!p.til_, sprExtraKept: !!(p.spr_ && p.spr_.registeredBy) };
  });

  // E: schema version bump.
  b = demo(); b.kit.schemaVersion = 2;
  report.E_schema2 = await in146(JSON.stringify(b));

  // F: Day 146 re-export keeps art byte-identical, and the new hash covers art.
  report.F_reexport = await in146(bText, (win, Kit) => {
    const before = JSON.stringify(Kit.bundle.current().art);
    const h1 = Kit.bundle.hash();
    Kit.bundle.current().art.records.til_.til_forest_a1b2.name = 'Forest edited';
    const h2 = Kit.bundle.hash();
    Kit.bundle.current().art.records.til_.til_forest_a1b2.name = 'Forest';
    const out = Kit.buildExport('draft');
    const after = JSON.stringify(JSON.parse(out.files[0].text).art);
    return { artIdentical: before === after, hashCoversArt: h1 !== h2, exportForges: Object.keys(JSON.parse(out.files[0].text).kit.forges) };
  });

  // G: tampered art is caught by the hash check.
  b = JSON.parse(bText); b.art.records.til_.til_forest_a1b2.name = 'tampered';
  report.G_tamper = await in146(JSON.stringify(b));

  console.log(JSON.stringify(report, null, 1));
  fs.writeFileSync(path.join(__dirname, 'out', 'compat146-report.json'), JSON.stringify(report, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
