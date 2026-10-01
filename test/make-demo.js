// Authors the Day 147 demo saga through Day 146's own APIs, then exports it with Day 146's exporter.
// Output: test/out/demo-bundle.json (a real Day 146 export) and a summary on stdout.
'use strict';
const fs = require('fs');
const path = require('path');
const { boot } = require('./boot');

async function main() {
  const { win, errors } = boot(require('../day146'));
  await new Promise((r) => setTimeout(r, 50));
  const Kit = win.Kit, WS = win.WS;
  if (!Kit || !WS.charter) throw new Error('Day 146 did not boot: ' + errors.join('\n'));
  Kit.bundle.create('Demo Saga');
  const b = Kit.bundle.current();
  const S = b.charter.sections;
  S.premise = { title: 'Demo Saga', premise: 'A small company of travelers carries a sealed message across two lands to the one person who can read it.', setting: 'Two neighboring lands joined by a single mountain pass.', tone: 'Earnest and warm', techLevel: 'Unspecified; reads as any era' };
  S.magic = { magicSystem: 'Four elements answer anyone who studies them, at the cost of stamina.', weatherTie: 'Rain strengthens water, snow weakens fire.' };
  S.villain = { villain: 'The Warden, keeper of the pass.', motive: 'Believes the message will start a war.' };
  S.protagonist = { protagonist: 'The Courier, who promised to deliver the message.' };
  S.party = { members: [
    { name: 'Courier', past: 'Ran messages between villages for ten years.' },
    { name: 'Scholar', past: 'Studied the elements at a quiet school.' },
    { name: 'Guard', past: 'Served a town watch until it disbanded.' }
  ] };
  S.chapters = [
    { id: Kit.ids.mint('chp_', 'The Lowlands'), name: 'The Lowlands', continentLabel: 'Westland', summary: 'The message is handed over and the journey begins.', targetMinutes: 60, charterVersion: 0 },
    { id: Kit.ids.mint('chp_', 'The Far Shore'), name: 'The Far Shore', continentLabel: 'Eastland', summary: 'Across the pass, the message finds its reader.', targetMinutes: 60, charterVersion: 0 }
  ];
  S.endings = { endings: [{ name: 'Delivered', concept: 'The message is read aloud.' }, { name: 'Kept', concept: 'The Courier keeps the message sealed.' }] };
  S.themes = { themes: ['keeping promises', 'trust between strangers'] };
  b.charter.canon = [{ statement: 'Only one mountain pass joins the two lands.' }];
  b.charter.glossary = [{ term: 'Warden', category: 'person', definition: 'Keeper of the pass.' }];
  b.charter.specs = { tileSize: 16, resolution: { w: 256, h: 224 }, paletteSize: 64, mobileControls: 'dpad' };
  b.charter.quotas = { towns: 2, dungeons: 2, enemyFamilies: 3, bosses: 1, targetPlayHours: 2 };
  WS.charter.applyPreset('saga', { silent: true });
  const rs = b.charter.ruleset;
  rs.elements = [
    { key: 'fire', label: 'Fire', color: '#e4572e' }, { key: 'water', label: 'Water', color: '#3a86c8' },
    { key: 'earth', label: 'Earth', color: '#8a6a3d' }, { key: 'air', label: 'Air', color: '#9ad1d4' }
  ];
  rs.elementRelations = [{ a: 'fire', b: 'water', kind: 'opposed' }, { a: 'earth', b: 'air', kind: 'opposed' }];
  rs.taxonomy = { label: 'Type', values: ['fire', 'water', 'earth', 'air', 'beast'], inverts: [] };
  Kit.bundle.touch('demo');
  const lock = await WS.charter.lock({ quiet: true, note: '' });
  if (!lock.ok) throw new Error('Lock refused: ' + JSON.stringify(lock.items, null, 1));
  const gen = WS.codex.generate({ quiet: true });
  if (!gen.ok) throw new Error('Codex refused: ' + gen.reason);

  const V = b.charter.version;
  const ids = {};
  function put(prefix, name, body) {
    const rec = Object.assign({ id: Kit.ids.mint(prefix, name), name: name, charterVersion: V }, body);
    Kit.records.put(rec); ids[name] = rec.id; return rec;
  }
  const ch1 = S.chapters[0].id, ch2 = S.chapters[1].id;
  // statuses
  put('sta_', 'Poison', { gauge: 'normal', tickEffect: { kind: 'damage', percent: 5 }, duration: 4, cure: { battleEnd: false, onHit: false, curedBy: [] } });
  put('sta_', 'Sleep', { gauge: 'freeze', tickEffect: { kind: 'none', percent: 0 }, duration: 3, cure: { battleEnd: true, onHit: true, curedBy: [] } });
  put('sta_', 'Chill', { gauge: 'normal', tickEffect: { kind: 'none', percent: 0 }, duration: 2, cure: { battleEnd: true, onHit: false, curedBy: [] } });
  // abilities
  put('abl_', 'Flame', { kind: 'magic', element: 'fire', power: 22, cost: { mp: 4 }, targeting: { side: 'foe', scope: 'single' }, chargeTicks: 0, statusEffects: [] });
  put('abl_', 'Wave', { kind: 'magic', element: 'water', power: 22, cost: { mp: 4 }, targeting: { side: 'foe', scope: 'single' }, chargeTicks: 0, statusEffects: [] });
  put('abl_', 'Gust', { kind: 'magic', element: 'air', power: 18, cost: { mp: 6 }, targeting: { side: 'foe', scope: 'all' }, chargeTicks: 0, statusEffects: [] });
  put('abl_', 'Mend', { kind: 'heal', power: 30, cost: { mp: 5 }, targeting: { side: 'ally', scope: 'single' }, chargeTicks: 0, statusEffects: [] });
  put('abl_', 'Venom Bite', { kind: 'enemy', power: 14, cost: { mp: 0 }, targeting: { side: 'foe', scope: 'single' }, chargeTicks: 0, statusEffects: [{ sta: ids['Poison'], chance: 0.4 }] });
  put('abl_', 'Rally Strike', { kind: 'limit', power: 60, cost: { mp: 0 }, targeting: { side: 'foe', scope: 'single' }, chargeTicks: 0, statusEffects: [] });
  // items
  put('itm_', 'Tonic', { kind: 'consumable', price: 30, effect: ids['Mend'] });
  put('itm_', 'Ether', { kind: 'consumable', price: 120 });
  put('itm_', 'Antidote', { kind: 'consumable', price: 20 });
  put('itm_', 'Sealed Letter', { kind: 'key', price: 0 });
  // equipment
  put('eqp_', 'Short Blade', { slot: 'weapon', weaponClass: 'blade', tier: 1, price: 100, stats: { str: 6 }, slotLayout: { count: 2, links: [[0, 1]] } });
  put('eqp_', 'Quilted Coat', { slot: 'armor', tier: 1, price: 80, stats: { def: 6, mdef: 4 }, slotLayout: { count: 1, links: [] } });
  put('eqp_', 'Plain Ring', { slot: 'accessory', tier: 1, price: 60, stats: { luck: 3 }, slotLayout: { count: 0, links: [] } });
  // materia
  put('mat_', 'Fire Stone', { kind: 'magic', element: 'fire', apThresholds: [100, 300], grants: [{ level: 1, abl: ids['Flame'] }], price: 200 });
  put('mat_', 'Life Stone', { kind: 'magic', apThresholds: [100, 300], grants: [{ level: 1, abl: ids['Mend'] }], price: 200 });
  // limits and characters
  put('lim_', 'Rally', { level: 1, unlock: { uses: 0 }, action: ids['Rally Strike'] });
  const base = (hp, mp, str, mag, def, mdef, spd, luck) => ({ hp, mp, str, mag, def, mdef, spd, luck });
  put('chr_', 'Courier', { weaponClass: 'blade', baseStats: base(120, 20, 12, 8, 10, 8, 14, 10), growth: base(18, 3, 1, 1, 1, 1, 1, 1), limitTree: [ids['Rally']], relationshipHooks: [] });
  put('chr_', 'Scholar', { weaponClass: 'staff', baseStats: base(90, 40, 7, 14, 7, 12, 11, 9), growth: base(13, 5, 1, 2, 1, 1, 1, 1), limitTree: [], relationshipHooks: [] });
  put('chr_', 'Guard', { weaponClass: 'blade', baseStats: base(150, 10, 14, 5, 13, 6, 9, 7), growth: base(22, 1, 2, 1, 2, 1, 1, 1), limitTree: [], relationshipHooks: [] });
  // families, enemies, tiers
  ids.famSlime = put('fam_', 'Slime', { type: 'water', palette: { base: '#4f9ad6', accent: '#d8f0ff' }, absorbsOwnType: false }).id;
  ids.famWisp = put('fam_', 'Wisp', { type: 'fire', palette: { base: '#e4752e', accent: '#ffe08a' }, absorbsOwnType: true }).id;
  ids.famWolf = put('fam_', 'Wolf', { type: 'beast', palette: { base: '#7a6f6a', accent: '#d9c8a0' }, absorbsOwnType: false }).id;
  put('gmb_', 'Biter', { rules: [{ condition: { kind: 'chance', param: '0.4' }, target: { selector: 'randomFoe' }, action: { abl: ids['Venom Bite'] } }], counters: [] });
  const est = (hp, mp, str, mag, def, mdef, spd, luck) => base(hp, mp, str, mag, def, mdef, spd, luck);
  put('enm_', 'Slime', { family: ids.famSlime, tier: 1, level: 2, stats: est(40, 0, 8, 4, 4, 6, 6, 3), drops: [{ item: ids['Tonic'], chance: 0.2 }], steal: [], gil: 8, exp: 6, ap: 1, isBoss: false });
  put('enm_', 'Wisp', { family: ids.famWisp, tier: 1, level: 3, stats: est(30, 20, 5, 10, 3, 10, 10, 5), drops: [], steal: [], gil: 10, exp: 8, ap: 2, isBoss: false });
  put('enm_', 'Wolf', { family: ids.famWolf, tier: 1, level: 3, stats: est(55, 0, 11, 2, 5, 3, 12, 6), gambits: ids['Biter'], drops: [], steal: [], gil: 12, exp: 10, ap: 2, isBoss: false });
  [ids.famSlime, ids.famWisp, ids.famWolf].forEach((f) => WS.rules.content.generateTiers(f, { tiers: 2, scale: 1.6, levelStep: 6, rewardScale: 1.5, shift: 40 }));
  const enm = Kit.records.list('enm_');
  const byName = (n) => enm.filter((e) => e.name === n)[0].id;
  put('enm_', 'Warden', { family: ids.famWolf, tier: 1, level: 10, stats: est(900, 80, 22, 18, 14, 14, 13, 10), gambits: ids['Biter'], drops: [], steal: [], gil: 300, exp: 200, ap: 20, isBoss: true });
  put('trp_', 'Lowland Slimes', { members: [{ enm: byName('Slime'), row: 'front' }, { enm: byName('Slime'), row: 'back' }], chapter: ch1, flags: { noEscape: false, preemptiveChance: 0 } });
  put('trp_', 'Lowland Pack', { members: [{ enm: byName('Wolf'), row: 'front' }, { enm: byName('Wisp'), row: 'back' }], chapter: ch1, flags: { noEscape: false, preemptiveChance: 0.1 } });
  put('trp_', 'Shore Pack', { members: [{ enm: byName('Wolf T2'), row: 'front' }, { enm: byName('Slime T2'), row: 'front' }, { enm: byName('Wisp T2'), row: 'back' }], chapter: ch2, flags: { noEscape: false, preemptiveChance: 0 } });
  put('trp_', 'The Warden', { members: [{ enm: ids['Warden'], row: 'front' }], chapter: ch2, flags: { noEscape: true, preemptiveChance: 0 } });
  put('shp_', 'Village Store', { inventory: [{ item: ids['Tonic'] }, { item: ids['Antidote'] }, { item: ids['Short Blade'] }, { item: ids['Quilted Coat'] }, { item: ids['Plain Ring'] }, { item: ids['Fire Stone'] }], chapterAvailable: ch1 });
  put('eps_', 'Lowlands state', { chapter: ch1, targetLevel: 4, gearTier: 1, gil: 200, materiaSet: [ids['Fire Stone'], ids['Life Stone']], abilities: [], targetWinRate: 85 });
  put('eps_', 'Far Shore state', { chapter: ch2, targetLevel: 12, gearTier: 1, gil: 600, materiaSet: [ids['Fire Stone'], ids['Life Stone']], abilities: [], targetWinRate: 70 });
  put('wth_', 'Clear', { realWorld: 'clear sky', elementMultipliers: { fire: 1, water: 1, earth: 1, air: 1 }, encounterModifiers: { rate: 1, familyWeights: [] } });
  put('wth_', 'Rain', { realWorld: 'steady stratiform rain', elementMultipliers: { fire: 0.75, water: 1.25, earth: 1, air: 1 }, encounterModifiers: { rate: 1.1, familyWeights: [] } });
  put('wth_', 'Snow', { realWorld: 'light snow', elementMultipliers: { fire: 0.8, water: 1, earth: 1, air: 1.1 }, encounterModifiers: { rate: 0.9, familyWeights: [] } });
  Kit.bundle.touch('demo-records');

  const res = Kit.refreshValidation();
  const sum = Kit.validate.summary(res);
  const out = Kit.buildExport('final');
  const dir = path.join(__dirname, 'out'); fs.mkdirSync(dir, { recursive: true });
  out.files.forEach((f) => fs.writeFileSync(path.join(dir, f.key === 'bundle' ? 'demo-bundle.json' : f.key === 'engine' ? 'engine-battle.js' : 'demo-manifest.json'), f.text));
  // a quick battle so the engine shapes in the contract comment come from a real run
  const party = win.WS.arena.expectedParty(b, ch1);
  const data = win.WS.arena.dataFor(b, Kit.records.list('trp_')[1].id, party, null);
  const r = win.ENGINE_BATTLE.run(data, 7, null, {});
  const types = {}; r.events.forEach((e) => { types[e.type] = (types[e.type] || 0) + 1; });
  console.log(JSON.stringify({ summary: sum, errors: res.errors.slice(0, 5), warnings: res.warnings.slice(0, 8).map((w) => w.message), hash: out.hash, counts: Object.keys(b.rules).map((p) => p + ':' + Object.keys(b.rules[p]).length).join(' '), opened: b.kit.opened, battle: r.result.outcome, turns: r.result.turns, eventTypes: types, pageErrors: errors.slice(0, 3) }, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
