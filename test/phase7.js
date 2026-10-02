// Phase 7 acceptance: Claude drafting and the forward fields. The Claude API is a scripted stand in (win.fetch), so every
// request is inspected (model from getModel, headers, thinking disabled, context, strict JSON shape, no IDs) and every
// drafter's options go through normalize, its own checks, the KIT:CORE review drawer, previews, and accept. Pixel drafts
// are checked against the alphabet, row count, and row length before review, repaired once, and dropped when they still
// do not fit. ART:LINKS fills the eight forward fields Day 146 reserved, and a Final export round trips through Day 146.
'use strict';
const fs = require('fs');
const path = require('path');
const { boot } = require('./boot');
const { in146 } = require('./compat146');
const APP147 = path.join(__dirname, '..', 'index.html');
const URL147 = 'https://augustineiacopelli.github.io/appaday/147/?dev=1';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); }

// ---------------------------------------------------------------- a scripted Claude API
function makeApi() {
  const api = { calls: [], queue: [], config: 0 };
  api.fetch = async function (url, init) {
    if (/config\.json/.test(String(url))) { api.config++; return { ok: false, status: 404, json: async () => null }; }
    if (!/api\.anthropic\.com\/v1\/messages/.test(String(url))) throw new Error('unexpected fetch ' + url);
    const body = JSON.parse(init.body);
    api.calls.push({ url: String(url), headers: init.headers, body });
    const next = api.queue.length ? api.queue.shift() : { options: [] };
    const text = typeof next === 'function' ? next(body) : typeof next === 'string' ? next : JSON.stringify(next);
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }) };
  };
  api.last = () => api.calls[api.calls.length - 1];
  api.context = (call) => { const u = (call || api.last()).body.messages[0].content; return JSON.parse(u.slice(u.indexOf('\n') + 1, u.indexOf('\n\nRequest: '))); };
  return api;
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
  const fences = ['KIT:CORE', 'ART:STORE', 'ART:DEMO', 'ART:CONTRACT', 'ENGINE:RENDER', 'ENGINE:AUDIO', 'ART:PALETTE', 'WS:PALETTE', 'ART:SPRITES', 'ART:PIXED', 'WS:SPRITES', 'WS:INTERFACE', 'ART:MOTION', 'WS:MOTION', 'ART:TILES', 'WS:WORLD', 'WS:PLAYTEST', 'ART:UI', 'ART:BATTLE', 'WS:BATTLE', 'ART:AUDIO', 'WS:SOUND', 'ART:LINKS', 'ART:AI', 'WS:ART147', 'APP:BOOT'];
  const at = fences.map((f) => script.indexOf('// === ' + f + ' BEGIN ==='));
  check('fences present in order: ART:LINKS and ART:AI after WS:SOUND, before WS:ART147', at.every((x, i) => x >= 0 && (i === 0 || x > at[i - 1])), at);
  check('every fence opens and closes once', fences.every((f) => script.split('// === ' + f + ' BEGIN ===').length === 2 && script.split('// === ' + f + ' END ===').length === 2));
  check('ART:AI CSS fence present', html.split('/* === ART:AI CSS BEGIN === */').length === 2 && html.split('/* === ART:AI CSS END === */').length === 2);
  const aiSrc = script.slice(script.indexOf('// === ART:AI BEGIN ==='), script.indexOf('// === ART:AI END ==='));
  check('ART:AI never builds its own fetch or hardcodes a model (it goes through Kit.claude and getModel)', !/fetch\(|claude-(sonnet|opus|haiku|fable)/.test(aiSrc));
  check('no forbidden APIs (roundRect, ellipse, confirm, bare remove)', !/\.roundRect\(|\.ellipse\(|window\.confirm|\bconfirm\(\s*['"]|[^a-zA-Z.]remove\(\)|\)\.remove\(\)/.test(script.replace(/\/\/.*$/gm, '')));

  // 1. Boot with the scripted API.
  const api = makeApi();
  let { win, errors } = boot(APP147, { url: URL147, setup(w) { w.fetch = api.fetch; } });
  await wait(80);
  const Kit = win.Kit, ART = win.ART, AI = ART.ai, d = win.document, ER = win.ENGINE_RENDER;
  check('boots with no page errors', !errors.length, errors.slice(0, 2));
  Kit.bundle.load(win.ART_DEMO.bundle());
  let b = Kit.bundle.current();
  const rep = ART.quickBuild.run(b);
  const toasts = () => d.getElementById('toasts').textContent;
  const drawers = () => d.querySelectorAll('.drawer').length;
  const reviewCards = () => [...d.querySelectorAll('.drawer .review-card')];
  const closeTop = () => { const all = d.querySelectorAll('.drawer, .dialog'); const x = all[all.length - 1]; if (x) x.querySelector('.dlg-head .btn').click(); };
  const acceptCard = (i) => reviewCards()[i].querySelector('.btn-primary').click();

  // 2. Forward fields (ART:LINKS).
  const L = ART.links, rules = (p) => Object.values(b.rules[p] || {});
  check('Quick Build fills the forward fields as its last step', rep.steps.links && rep.steps.links.created > 0 && ART.quickBuild.steps().pop().key === 'links', rep.steps.links);
  const chrOk = rules('chr_').every((c) => c.portrait && win.Kit.ids.prefixOf(c.portrait) === 'por_' && ART.records.get(c.portrait).subject.ref === c.id && c.leitmotif && ART.records.get(c.leitmotif).kind === 'motif');
  const ablOk = rules('abl_').every((a) => a.icon && ART.records.get(a.icon) && (a.kind === 'passive' || (a.animation && ART.records.get(a.animation).kind === 'ability' && a.sfx && ART.records.get(a.sfx))));
  const itmOk = rules('itm_').concat(rules('eqp_')).every((r) => r.icon && ART.records.get(r.icon).subject.ref === r.id);
  const famOk = rules('fam_').every((f) => f.sprite && ART.records.get(f.sprite).mode === 'battle' && ART.records.get(f.sprite).subject.ref === f.id);
  check('characters get their portrait and leitmotif', chrOk);
  check('abilities get animation, sound, and icon (passives get the icon only)', ablOk);
  check('items and equipment get their icons; families get their battle sprites', itmOk && famOk);
  check('every forward field resolves, so a Final export is possible', ART.canOpen(b) && !L.plan(b).length, L.plan(b).slice(0, 3));
  const rep2 = ART.quickBuild.run(b);
  check('a second Quick Build changes no forward field', rep2.steps.links.created === 0 && rep2.steps.links.refreshed === 0, rep2.steps.links);
  const chr0 = rules('chr_')[0], villainPor = ART.records.list('por_').find((p) => p.subject.ref === 'villain');
  chr0.portrait = villainPor.id;
  L.fill(b);
  check('a field pointed at another existing record of the right kind is kept', chr0.portrait === villainPor.id);
  chr0.portrait = 'por_gone_zz99';
  const itm0 = rules('itm_')[0], itmIcon = itm0.icon;
  ART.records.del(itmIcon);
  chr0.leitmotif = 'not an id';
  const plan = L.plan(b);
  check('the plan finds a dangling pointer and a deleted record, and leaves a non art value alone', plan.some((p) => p.recordId === chr0.id && p.field === 'portrait' && /^por_/.test(p.to)) && plan.some((p) => p.recordId === itm0.id && p.to === null) && !plan.some((p) => p.field === 'leitmotif'), plan);
  L.fill(b);
  check('fill relinks the subject\'s record and empties a field whose record is gone', ART.records.get(chr0.portrait).subject.ref === chr0.id && !('icon' in itm0));
  chr0.leitmotif = ART.audio.motifFor(b, 'chr', chr0.id).id;
  ART.quickBuild.run(b);
  check('Quick Build recreates the deleted icon and links it again', itm0.icon && ART.records.get(itm0.icon) && ART.canOpen(b));
  const tbl = L.table(b);
  check('the forward field table covers all eight fields', ['chr_.portrait', 'chr_.leitmotif', 'abl_.animation', 'abl_.sfx', 'abl_.icon', 'itm_.icon', 'eqp_.icon', 'fam_.sprite'].every((k) => tbl.some((r) => r.prefix + '.' + r.field === k)));
  Kit.bundle.touch('test');
  // Phase 8 moved Fill forward fields to the Export tab's References view.
  if (ART.coverage) ART.coverage.exportUi.sub = 'references';
  Kit.go('export'); Kit.rerender();
  const fillBtn = [...d.querySelectorAll('#ws .btn')].find((x) => /Fill forward fields/.test(x.textContent));
  check('the Export tab offers Fill forward fields (disabled when nothing is owed)', fillBtn && fillBtn.disabled && /forward field/i.test(d.getElementById('ws').textContent));

  // 3. No key: AI buttons explain themselves; run refuses quietly.
  check('seventeen drafters are registered, one per editor plus the batch icon drafter', AI.list().length === 17 && ['colorway', 'look', 'enemy', 'portrait', 'icon', 'icons', 'ability', 'effect', 'weather', 'biome', 'background', 'window', 'title', 'motif', 'track', 'sound', 'pixels'].every((k) => AI.has(k)), AI.list());
  check('each drafter has a runtime review type with no prefix', AI.list().every((k) => { const t = Kit.codex.type(AI.def(k).typeName); return t && t.prefix === null && t.section; }));
  const localPal = ART.palette.locals(b).find((p) => p.subject.kind === 'chr');
  let r0 = await AI.run('colorway', localPal.id, {});
  check('without a key, run returns nothing and makes no request', r0 === null && api.calls.length === 0 && /API key/.test(toasts()));
  ART.WS.palette.openEditor(localPal.id);
  const aiBtn = [...d.querySelectorAll('.drawer .btn')].find((x) => /Draft colorways/.test(x.textContent));
  aiBtn.click();
  check('an AI button with no key shows the Settings hint instead', aiBtn.parentNode.querySelector('.ai-hint') && !aiBtn.parentNode.querySelector('.ai-hint').hidden && api.calls.length === 0);
  closeTop();

  // 4. Colorway, through the request dialog.
  Kit.settings.set({ key: 'sk-test-key' });
  ART.WS.palette.openEditor(localPal.id);
  [...d.querySelectorAll('.drawer .btn')].find((x) => /Draft colorways/.test(x.textContent)).click();
  await wait(5);
  const ta = d.getElementById('a7AiPrompt'), cnt = d.getElementById('a7AiCount');
  check('the request dialog asks what to aim for and how many options', ta && cnt && cnt.options.length === 3);
  ta.value = 'more regal, deep purples'; cnt.value = '3';
  api.queue.push({ options: [
    { summary: 'Regal violet', id: 'pal_claude_ab12', skin: '#e8c0a0', hair: '#2a1a14', clothA: '#5a2a8a', clothB: '#d8b050', metal: '#c8ccd8', accent: 'metal' },
    { summary: 'Night court', skin: '#c89070', hair: '#101018', clothA: '#3a1a5a', clothB: '#8a7aa8', metal: '#a0a4b0', accent: 'clothB' },
    { summary: 'Broken', skin: 'peach', hair: '#2a1a14', clothA: '#5a2a8a', clothB: '#d8b050', metal: '#c8ccd8', accent: 'gold' }
  ] });
  [...d.querySelectorAll('.dialog .dlg-foot .btn')].find((x) => /Draft/.test(x.textContent)).click();
  await wait(20);
  const call = api.last();
  check('one request to the Messages API with the key, version, and browser access headers', api.calls.length === 1 && call.headers['x-api-key'] === 'sk-test-key' && call.headers['anthropic-version'] && call.headers['anthropic-dangerous-direct-browser-access'] === 'true', call.headers);
  check('the model comes from getModel (fallback offline) and thinking is disabled', call.body.model === 'claude-sonnet-5-5' && call.body.thinking && call.body.thinking.type === 'disabled' && api.config > 0, { model: call.body.model, thinking: call.body.thinking });
  check('the system prompt asks for strict JSON options and forbids IDs', /\{"options":\[\{\.\.\.\}\]\}/.test(call.body.system) && /exactly 3 option/.test(call.body.system) && /Never include IDs/.test(call.body.system));
  const ctx = api.context(call);
  check('the prompt carries the Charter, specs, the subject, and the field vocabulary', ctx.charter && ctx.specs.tileSize === 16 && ctx.subject && ctx.subject.who && ctx.subject.who.kind === 'party member' && ctx.fields.some((f) => f.key === 'accent' && f.allowedValues.join() === 'clothB,metal') && ctx.current && ctx.current.clothA, ctx.subject && ctx.subject.who);
  check('the request text is the user\'s own', /Request: more regal, deep purples$/.test(call.body.messages[0].content));
  check('no art record ID appears in the prompt', !/\b(pal|spr|por|ico|anm|efx|wov|til|bgd|uik|mus|sfx|ins|prt)_[a-z0-9_]*[a-z0-9]\b/.test(call.body.messages[0].content));
  let cards = reviewCards();
  check('three options open in the shared review drawer', cards.length === 3 && /Review options/.test(d.querySelectorAll('.drawer')[drawers() - 1].textContent));
  check('the broken option shows its issues; the good ones read valid', cards[2].classList.contains('bad') && /Skin must be a #rrggbb/.test(cards[2].textContent) && cards[0].classList.contains('ok') && cards[1].classList.contains('ok'));
  check('every card gets a preview', cards.every((c) => c.querySelector('.a7-ai-prev canvas')));
  const slotsBefore = JSON.stringify(localPal.slots), idBefore = localPal.id;
  acceptCard(0);
  await wait(10);
  check('accepting applies the colorway with origin claude and keeps the record ID', localPal.origin === 'claude' && localPal.id === idBefore && localPal.source.clothA === '#5a2a8a' && localPal.colorway.accent === 'metal' && JSON.stringify(localPal.slots) !== slotsBefore);
  check('a single target review closes after one accept, and the palette drawer repaints', !reviewCards().length && /edited/.test(d.querySelector('.drawer').textContent), { cards: reviewCards().length, drawers: drawers(), text: d.querySelector('.drawer') && d.querySelector('.drawer').textContent.slice(0, 300) });
  closeTop();
  ART.quickBuild.run(b);
  check('Quick Build keeps a Claude colorway', localPal.origin === 'claude' && localPal.source.clothA === '#5a2a8a');

  // A helper for the rest: script one reply, run, return the review.
  async function draft(key, t, options, o) {
    api.queue.push(Array.isArray(options) ? { options } : options);
    const out = await AI.run(key, t, Object.assign({ count: Array.isArray(options) ? options.length : 1 }, o || {}));
    await wait(5);
    return out;
  }
  function v() { return Kit.validate.summary(Kit.validate(b)); }

  // 5. Sprites: look, enemy body, portrait.
  const field = ART.sprites.spriteFor(b, 'chr', chr0.id, 'field'), battle = ART.sprites.spriteFor(b, 'chr', chr0.id, 'battle');
  let out = await draft('look', field.id, [{ summary: 'Armored', body: 'broad', head: 'square', hair: 'spiked', torso: 'plate', legs: 'boots', back: 'cape', front: 'shield', accent: 'metal', height: 1.7, headScale: 1.1 },
    { summary: 'Bad body', body: 'enormous', head: 'round', hair: 'none', torso: 'robe', legs: 'longrobe', back: 'none', front: 'none', accent: 'clothB', height: 9, headScale: 1 }]);
  cards = reviewCards();
  check('look: options validate against the part library (a made up build is an error, height is clamped)', cards.length === 2 && cards[0].classList.contains('ok') && cards[1].classList.contains('bad') && out.drafts[1].height === 2);
  check('look: previews run the real composer in a scratch copy', cards[0].querySelectorAll('.a7-ai-prev canvas').length === 3 && field.recipe.look.torso !== 'plate');
  acceptCard(0); await wait(10);
  check('look: accepting sets the recipe from library parts, and the battle sprite still shares it', field.origin === 'claude' && field.recipe.look.torso === 'plate' && field.recipe.parts.torso === ART.sprites.partByLib(b, 'torso.plate').id && field.recipe.proportions.height === 1.7 && battle.shares === field.id);
  const fam = ART.palette.familyInfo(b).find((x) => x.id === x.baseId), enemy = ART.sprites.spriteFor(b, 'fam', fam.id, 'battle');
  const avKey = Object.keys(ER.sprite.RIG_PARAMS.avian)[0];
  out = await draft('enemy', enemy.id, [{ summary: 'A bird', rig: 'avian', params: [{ key: avKey, value: 99 }, { key: 'tentacles', value: 3 }] }]);
  cards = reviewCards();
  check('enemy: unknown parameters warn, values clamp to the editor ranges', cards.length === 1 && /not a avian parameter/.test(cards[0].textContent) && out.drafts[0].params[0].value <= 6);
  acceptCard(0); await wait(10);
  check('enemy: accepting switches the rig and its body part', enemy.recipe.rig === 'avian' && ART.records.get(enemy.recipe.parts.body).lib === 'enemy.avian' && enemy.origin === 'claude');
  const por = ART.records.list('por_').find((p) => p.subject.ref === chr0.id);
  await draft('portrait', por.id, [{ summary: 'Stern', head: 'long', hair: 'tied', collar: 'plate', mouth: 1.2, expressions: { happy: { brow: -1, eye: 0.5 }, angry: { brow: 1.5, eye: 0.6 } } }]);
  check('portrait: four expression previews', reviewCards()[0].querySelectorAll('.a7-ai-prev canvas').length === 4);
  acceptCard(0); await wait(10);
  check('portrait: the face recipe and expressions apply; untouched expressions keep their defaults', por.recipe.head === 'long' && por.expressions.happy.brow === -1 && por.expressions.neutral.brow === 0 && por.origin === 'claude');

  // 6. Icons, one and many.
  const els = b.charter.ruleset.elements.map((e) => e.key);
  const icoI = ART.records.get(itm0.icon);
  icoI.px = { w: icoI.size, h: icoI.size, d: '.' + 'V'.repeat(0) + 'V' + '.V'.repeat(Math.ceil(icoI.size * icoI.size / 32)) };
  await draft('icon', icoI.id, [{ summary: 'Element gem', glyph: 'gem', tint: els[0] }, { summary: 'Bad', glyph: 'sword', tint: 'plaid' }]);
  cards = reviewCards();
  check('icon: unknown glyphs and tints are errors', cards[1].classList.contains('bad') && /Unknown glyph/.test(cards[1].textContent));
  acceptCard(0); await wait(10);
  check('icon: accepting sets glyph and tint, recomputes the tint ramp, and drops hand drawn pixels', icoI.gen.glyph === 'gem' && icoI.gen.tint === els[0] && icoI.tintRamp.length === 3 && !icoI.px && icoI.origin === 'claude');
  const names = AI.def('icons').target(b).list.map((x) => x.name);
  out = await draft('icons', null, { options: [{ summary: 'a', for: names[1], glyph: 'vial', tint: '#40a0e0' }, { summary: 'b', for: names[2].toUpperCase(), glyph: 'ring', tint: els[1] }, { summary: 'c', for: 'Nothing Here', glyph: 'gem', tint: els[0] }] });
  check('icons: one request asks for one option per listed record', /exactly \d+ option/.test(api.last().body.system) && Number(/exactly (\d+) option/.exec(api.last().body.system)[1]) === names.length && api.context().subject.records.length === names.length);
  cards = reviewCards();
  check('icons: an option for a record not in the list is flagged', cards.length === 3 && cards[2].classList.contains('bad') && /not one of the listed records/.test(cards[2].textContent));
  const allBtn = [...d.querySelectorAll('.drawer .btn')].find((x) => /Accept All Valid \(2\)/.test(x.textContent));
  allBtn.click(); await wait(10);
  const icoOf = (n) => AI.def('icons').target(b).list.find((x) => x.name === n).ico;
  check('icons: Accept All Valid applies each to its own record (names match without case)', icoOf(names[1]).gen.glyph === 'vial' && icoOf(names[2]).gen.glyph === 'ring' && /All drafts handled|1 pending/.test(d.querySelector('.drawer:last-of-type') ? [...d.querySelectorAll('.drawer')].pop().textContent : ''));
  closeTop();

  // 7. Motion: ability, effect, weather.
  const abl = rules('abl_').find((a) => a.kind !== 'passive'), anm = ART.records.get(abl.animation);
  await draft('ability', anm.id, [{ summary: 'Beam', caster: 'cast', travel: 'beam', travelMs: 300, effect: els[1], impactMs: 600, flash: true, shake: 2, hits: 3 }]);
  acceptCard(0); await wait(10);
  check('ability: accepting sets caster, travel, the element\'s effect, impact, and hits', anm.caster === 'cast' && anm.travel.type === 'beam' && anm.impact.fx === ART.bySubject('efx_', 'element', els[1]).id && anm.hits === 3 && anm.origin === 'claude');
  const fx = ART.palette.effects(b)[0];
  await draft('effect', fx.id, [{ summary: 'Rings', shape: 'ring', screen: 'darken', count: 200, life: 800, gravity: -0.5, spread: 1.5, speed: 2, dark: '#102030', mid: '#3060a0', light: '#80c0f0', glow: '#ffffff', flash: '#e0f0ff', tint: '#203050' }]);
  acceptCard(0); await wait(10);
  check('effect: particle and screen apply, colors snap to master indices, counts clamp', fx.particle.shape === 'ring' && fx.particle.count === 60 && fx.screen === 'darken' && fx.palette.length === 4 && fx.palette.every((m) => typeof m === 'number') && fx.origin === 'claude');
  const wov = ART.motion.overlays(b)[0];
  await draft('weather', wov.id, [{ summary: 'Sleet', layers: [{ type: 'flake', density: 0.7, angle: 10, speed: 1, depth: 1, color: '#ffffff' }, { type: 'streak', density: 0.3, angle: 5, speed: 2, depth: 0.5, color: '#a0b0c0' }], tint: '#203040', tintAlpha: 0.2, lightning: true, lightningMin: 9000, lightningMax: 2000 }]);
  acceptCard(0); await wait(10);
  check('weather: layers, tint, and lightning apply (a reversed range is put in order); the overlay is no longer generic', wov.layers.length === 2 && typeof wov.layers[0].m === 'number' && wov.tint.alpha === 0.2 && wov.lightning.every[0] === 2000 && wov.lightning.every[1] === 9000 && !wov.generic && wov.origin === 'claude');

  // 8. World: invent a biome, restyle one, a background.
  const nBiomes = ART.tiles.biomes(b).length;
  await draft('biome', null, [{ summary: 'Glittering waste', name: 'Crystal Barrens', style: 'snow', tempLo: 1, tempHi: 2, moistLo: 0, moistHi: 1, elevLo: 3, elevHi: 4, feature: '', passable: true, encounters: true, swimmable: false, damage: false, anim: 'none', A: '#c8d8f0', B: '#a0b8e0', C: '#7080a0', D: '#e0a0f0', E: '#6090d0', F: '#ffffff' },
    { summary: 'Backwards', name: 'Odd', style: 'grass', tempLo: 3, tempHi: 1, moistLo: 0, moistHi: 4, elevLo: 2, elevHi: 2, anim: 'none', A: '#000000', B: '#000000', C: '#000000', D: '#000000', E: '#000000', F: '#000000' }]);
  cards = reviewCards();
  check('biome: an inverted climate range is an error', cards[1].classList.contains('bad') && /Temperature low is above high/.test(cards[1].textContent));
  check('biome: the prompt lists the existing biomes and every style\'s materials', api.context().subject.existing.length === nBiomes && api.context().subject.styles.snow.materials.A);
  acceptCard(0); await wait(10);
  const nb = ART.tiles.biome(b, 'crystal-barrens');
  check('biome: an invented biome gets its role, palette, priority slot, and battle background', nb && nb.origin === 'claude' && nb.climate.elev.join() === '3,4' && nb.flags === 3 && ART.tiles.palFor(b, nb) && ART.tiles.palFor(b, nb).source.D === '#e0a0f0' && b.art.priority.includes(nb.id) && ART.tiles.bgFor(b, nb) && ART.tiles.biomes(b).length === nBiomes + 1);
  const grass = ART.tiles.biome(b, 'grassland');
  await draft('biome', grass.id, [{ summary: 'Wet meadow', name: 'Meadow', style: 'grass', tempLo: 2, tempHi: 3, moistLo: 2, moistHi: 3, elevLo: 2, elevHi: 3, passable: true, encounters: false, anim: 'foliage', A: '#5aa040', B: '#70b850', C: '#8a6a44', D: '#f0e070', E: '#3a72c0', F: '#eaf2fa' }]);
  acceptCard(0); await wait(10);
  check('biome: restyling keeps the record, changes flags, animation, and material colors', grass.name === 'Meadow' && grass.flags === 1 && grass.anim && grass.anim.type === 'foliage' && ART.tiles.palFor(b, grass).source.A === '#5aa040' && grass.origin === 'claude');
  const bgd = ART.tiles.backgrounds(b)[0];
  await draft('background', bgd.id, [{ summary: 'Starry', layers: [{ kind: 'sky', style: 'stars', dark: '#000010', mid: '#101040', light: '#ffffff', parallax: 0, drift: 0 }, { kind: 'floor', style: 'stone', dark: '#202020', mid: '#505050', light: '#909090', parallax: 1, drift: 0 }] },
    { summary: 'Wrong', layers: [{ kind: 'mid', style: 'stars', dark: '#000000', mid: '#000000', light: '#000000' }] }]);
  cards = reviewCards();
  check('background: a style that does not belong to its layer kind is an error', cards[1].classList.contains('bad') && /mid layer style must be/.test(cards[1].textContent));
  acceptCard(0); await wait(10);
  check('background: layers apply with seeds and master colors', bgd.layers.length === 2 && bgd.layers[0].gen.style === 'stars' && bgd.layers[0].gen.seed > 0 && bgd.layers[1].gen.colors.every((m) => typeof m === 'number') && bgd.origin === 'claude');

  // 9. Interface: window and title.
  const kit = ART.iface.kit(b);
  await draft('window', kit.window.id, [{ summary: 'Crimson', top: '#802020', bottom: '#200808', border: '#000000', light: '#f0e0d0', corner: 'notch', thickness: 2, alpha: 0.9, open: 'fade' }]);
  acceptCard(0); await wait(10);
  check('window: colors, corner, thickness, and opening apply', kit.window.gradient.top.hex === '#802020' && typeof kit.window.gradient.top.m === 'number' && kit.window.corner === 'notch' && kit.window.open.style === 'fade' && kit.window.origin === 'claude');
  await draft('title', kit.title.id, [{ summary: 'Gold', text: 'Ashen Crown', style: 'shadow', layout: 'upper', scale: 4, prompt: 'Press any key', credit: 'A tale', color: '#f0c040', shadow: '#301000', light: '#ffffff' }]);
  acceptCard(0); await wait(10);
  check('title: text, style, layout, and colors apply', kit.title.text === 'Ashen Crown' && kit.title.layout === 'upper' && kit.title.color.hex === '#f0c040' && kit.title.origin === 'claude');

  // 10. Sound: motif, track, sound effect.
  const A = ART.audio, theme = A.motifFor(b, 'role', 'motif:theme'), titleTrack = A.trackFor(b, 'title'), titleBefore = JSON.stringify(titleTrack.patterns);
  await draft('motif', theme.id, [{ summary: 'Rising', degrees: "1 3 5 3 4 2 7, 1", durs: '2 2 2 2 2 2 2 2', meter: 4, mode: 'dorian', key: 'D', tempo: 100 },
    { summary: 'Mismatched', degrees: '1 2 3 4 5', durs: '2 2', meter: 4, mode: 'major', key: 'C', tempo: 120 }]);
  cards = reviewCards();
  check('motif: the notation guide is in the system prompt; mismatched counts are an error', /scale degrees 1 to 9/.test(api.last().body.system) && cards[1].classList.contains('bad') && /must match/.test(cards[1].textContent));
  check('motif: a valid option has a Play button', !!cards[0].querySelector('.a7-ai-prev .btn'));
  acceptCard(0); await wait(10);
  check('motif: the melody applies and generated tracks that follow it re-derive', theme.degrees === "1 3 5 3 4 2 7, 1" && theme.mode === 'dorian' && theme.origin === 'claude' && JSON.stringify(titleTrack.patterns) !== titleBefore && titleTrack.derivedFrom.motif === theme.id && /re-derived/.test(toasts()));
  const bat = A.trackFor(b, 'battle');
  await draft('track', bat.id, [{ summary: 'Driving', tempo: 150, patterns: [{ key: 'A', mml: 'o4 l8 c d e f g a b > c' }, { key: 'B', mml: 'o3 l4 c e g e' }, { key: 'D', mml: '@0 l8 c r c r c r c r' }], order: [{ p1: 'A', p2: '', tri: 'B', noise: 'D' }], loop: 0 },
    { summary: 'Broken', tempo: 150, patterns: [{ key: 'A', mml: 'c4 q4' }], order: [{ p1: 'A', p2: 'Z' }], loop: 0 }]);
  cards = reviewCards();
  check('track: the MML guide is in the system prompt; undefined patterns and parse errors are caught', /MML: notes a to g/.test(api.last().body.system) && cards[0].classList.contains('ok') && cards[1].classList.contains('bad') && /names pattern Z/.test(cards[1].textContent));
  check('track: the request gets a larger token budget', api.last().body.max_tokens >= 6000, api.last().body.max_tokens);
  acceptCard(0); await wait(10);
  check('track: accepting makes it your own track (no longer derived) that compiles cleanly', bat.origin === 'claude' && !bat.derivedFrom && bat.tempo === 150 && bat.order[0][1] === null && bat.loop === 0 && !win.ENGINE_AUDIO.track.compile(bat).errors.length);
  const hit = A.cueSfx(b, 'hit');
  await draft('sound', hit.id, [{ summary: 'Crunch', wave: 'noise', category: 'hit', attack: 0, sustain: 0.1, decay: 0.3, freq: 0.4, slide: -3, volume: 0.6, bogus: 5 }]);
  acceptCard(0); await wait(10);
  check('sound: parameters are normalized to the sfxr ranges and unknown keys dropped', hit.params.wave === 'noise' && hit.params.slide === -1 && !('bogus' in hit.params) && hit.category === 'hit' && hit.origin === 'claude');
  let vs = v();
  check('the bundle validates clean after every accepted draft', !vs.errors && !vs.broken, vs);

  // 11. Pixels in the pixel editor.
  ART.editSpriteFrame(field, 'stand', 'down');
  await wait(5);
  const ed = ART.pixelEditor.last, T = ed.ai;
  check('the pixel editor has a Draft with Claude button', [...d.querySelectorAll('.dialog .btn')].some((x) => /Draft with Claude/.test(x.textContent)) && T.w > 0 && T.maxIndex === 15);
  const ALPHA = ER.codec.ALPHABET;
  const rowsNow = () => { const px = ed.pixels(), out = []; for (let y = 0; y < T.h; y++) { let s = ''; for (let x = 0; x < T.w; x++) s += ALPHA[px[y * T.w + x]]; out.push(s); } return out; };
  const base = rowsNow(), changed = base.slice(); changed[1] = '1'.repeat(T.w);
  api.queue.push({ options: [{ summary: 'Bar', rows: changed }] });
  out = await AI.run('pixels', T, {});
  await wait(5);
  const pctx = api.context();
  check('pixels: the prompt carries the frame size, the slot names and colors, and the current rows', pctx.subject.width === T.w && pctx.subject.height === T.h && pctx.subject.palette.length === 16 && pctx.subject.palette[1].name === 'Outline' && pctx.current.rows.join('\n') === base.join('\n') && /exactly \d+ strings/.test(api.last().body.system));
  check('pixels: a valid draft reaches review with a preview', out.drafts.length === 1 && reviewCards().length === 1 && reviewCards()[0].querySelector('.a7-ai-prev canvas'));
  acceptCard(0); await wait(10);
  check('pixels: accepting loads the draft into the editor only (nothing stored yet), and Undo restores', rowsNow()[1] === '1'.repeat(T.w) && !(field.overrides && field.overrides['stand.down']));
  ed.undo();
  check('pixels: undo brings the previous frame back', rowsNow().join() === base.join());
  const short = base.slice(0, T.h - 1), wide = base.map((r) => r + '0'), badChar = base.slice(); badChar[0] = 'Z'.repeat(T.w);
  api.queue.push({ options: [{ summary: 's', rows: short }, { summary: 'w', rows: wide }] });
  api.queue.push({ options: [{ summary: 'fixed', rows: changed }, { summary: 'still bad', rows: badChar }] });
  const callsBefore = api.calls.length;
  out = await AI.run('pixels', T, { count: 2 });
  await wait(5);
  const fixMsg = api.last().body.messages;
  check('pixels: a draft that does not fit triggers one repair request that names the problems', api.calls.length === callsBefore + 2 && fixMsg.length === 3 && fixMsg[1].role === 'assistant' && /rows; the frame needs exactly/.test(fixMsg[2].content) && /characters; each row needs exactly/.test(fixMsg[2].content));
  check('pixels: whatever still does not fit after the repair is dropped before review', out.drafts.length === 1 && reviewCards().length === 1 && /did not fit/.test(toasts()));
  closeTop();
  api.queue.push({ options: [{ rows: badChar }] }, { options: [{ rows: badChar }] });
  out = await AI.run('pixels', T, {});
  check('pixels: when nothing fits, nothing reaches review', out && out.drafts.length === 0 && !reviewCards().length);
  check('pixels: the alphabet check names the bad character', AI.pixelCheck({ pixels: badChar.join('\n') }, T).some((i) => /"Z"/.test(i.message)));
  check('pixels: the tile editor opens all 32 slots', (() => { ART.pixelEditor.open({ title: 't', w: 8, h: 8, idx: new Uint8Array(64), slots: [], entries: [], labels: ART.tiles.SLOT_NAMES }); return ART.pixelEditor.last.ai.maxIndex === 31; })());
  closeTop();
  ART.pixelEditor.open({ title: 'big', w: 128, h: 96, idx: new Uint8Array(128 * 96), slots: [], entries: [] });
  check('pixels: frames over the size limit get no draft button, and run refuses them', ![...d.querySelectorAll('.dialog')].pop().textContent.includes('Draft with Claude') && (await AI.run('pixels', ART.pixelEditor.last.ai, {})) === null);
  closeTop(); closeTop();

  // 12. Claude never mints IDs; a reply with no options, bad JSON, and an API error.
  const nRec = Object.values(b.art.records).reduce((n, m) => n + Object.keys(m).length, 0);
  const evil = await draft('effect', fx.id, [{ summary: 'x', id: 'efx_evil_aa11', shape: 'spark', screen: 'none', count: 5, life: 300, dark: '#000000', mid: '#333333', light: '#999999', glow: '#ffffff', flash: '#ffffff', tint: '#000000' }]);
  check('an id in a reply is stripped from the draft', evil.drafts.length === 1 && !('id' in evil.drafts[0]) && !reviewCards()[0].textContent.includes('efx_evil'));
  acceptCard(0); await wait(10);
  check('accepting never adds or renames records', Object.values(b.art.records).reduce((n, m) => n + Object.keys(m).length, 0) === nRec && fx.id !== 'efx_evil_aa11' && !ART.records.get('efx_evil_aa11'));
  api.queue.push({ options: [] });
  out = await AI.run('weather', wov.id, {});
  check('an empty reply is reported, not reviewed', out.drafts.length === 0 && /no usable drafts/.test(toasts()));
  api.queue.push('not json at all', '{"options":[{"summary":"ok","layers":[{"type":"mote","density":0.2}]}]}');
  out = await AI.run('weather', wov.id, {});
  check('unparseable JSON gets the shared one time repair', out.drafts.length === 1 && api.last().body.messages.length === 3);
  closeTop();
  const keep = api.fetch;
  win.fetch = async (u, i) => (/anthropic/.test(String(u)) ? { ok: false, status: 529, json: async () => ({ error: { message: 'Overloaded' } }) } : keep(u, i));
  out = await AI.run('weather', wov.id, {});
  check('an API error is shown and nothing changes', out === null && /Overloaded/.test(toasts()));
  win.fetch = keep;
  Kit.settings.set({ tiers: { sonnet: 'claude-sonnet-5' } });
  await draft('window', kit.window.id, [{ summary: 'z', top: '#000000', bottom: '#000000', border: '#000000', light: '#ffffff', corner: 'round', thickness: 1, alpha: 1, open: 'grow' }]);
  check('a model override in Settings reaches every editor through getModel', api.last().body.model === 'claude-sonnet-5');
  closeTop();
  Kit.settings.set({ tiers: { sonnet: '' } });

  // 13. Every editor shows its AI button.
  const has = (re) => [...d.querySelectorAll('.drawer .btn, #ws .btn')].some((x) => re.test(x.textContent));
  const seen = {};
  ART.WS.palette.openEditor(localPal.id); seen.colorway = has(/Draft colorways/); closeTop();
  ART.WS.sprites.openSprite(field.id); seen.look = has(/Draft a look/); closeTop();
  ART.WS.sprites.openSprite(enemy.id); seen.enemy = has(/Draft a body/); closeTop();
  ART.WS.sprites.openPortrait(por.id); seen.portrait = has(/Draft a face/); closeTop();
  ART.WS.interface.openIcon(icoI.id); seen.icon = has(/Draft an icon/); closeTop();
  ART.WS.motion.openAbility(anm.id); seen.ability = has(/Draft an animation/); closeTop();
  ART.WS.motion.openEffect(fx.id); seen.effect = has(/Draft an effect/); closeTop();
  ART.WS.motion.openWeather(wov.id); seen.weather = has(/Draft an overlay/); closeTop();
  ART.WS.world.openTileset(grass.id); seen.biome = has(/Draft a biome/); closeTop();
  ART.WS.world.openBackground(bgd.id); seen.background = has(/Draft a background/); closeTop();
  ART.WS.sound.openSound(hit.id); seen.sound = has(/Draft a sound/); closeTop();
  ART.WS.sound.openMotif(theme.id); seen.motif = has(/Draft a melody/); closeTop();
  ART.WS.sound.openTrack(bat.id); seen.track = has(/Draft a score/); closeTop();
  Kit.go('interface'); ART.WS.interface.ui.sub = 'icons'; Kit.rerender(); seen.icons = has(/Draft icons/);
  ART.WS.interface.ui.sub = 'window'; Kit.rerender(); seen.window = has(/Draft a window/);
  ART.WS.interface.ui.sub = 'title'; Kit.rerender(); seen.title = has(/Draft a title screen/);
  Kit.go('world'); ART.WS.world.ui.sub = 'tilesets'; Kit.rerender(); seen.invent = has(/Invent a biome/);
  check('every editor carries its Claude button', Object.keys(seen).length === 17 && Object.values(seen).every(Boolean), seen);
  check('no page errors through the drafting flows', !errors.length, errors.slice(0, 3));

  // 14. Export: forward fields and the Day 146 round trip.
  ART.links.fill(b); Kit.bundle.touch('test');
  vs = Kit.validate.summary(Kit.refreshValidation());
  const fin = Kit.buildExport('final'), fb = JSON.parse(fin.files[0].text), man = JSON.parse(fin.files[1].text);
  check('a Final export opens art with every forward field resolved', fb.kit.opened.includes('art') && fb.kit.forges['147'].status === 'final' && !man.unresolved.length && man.referenced.length >= tbl.length - rules('abl_').filter((a) => a.kind === 'passive').length * 2, { unresolved: man.unresolved.length, referenced: man.referenced.length });
  const rt = await in146(fin.files[0].text, async (w, K, r) => {
    let blocked = null; try { K.buildExport('final'); } catch (e) { blocked = e.message; }
    const B = K.bundle.current();
    return { broken: r.broken.length, forward: r.forward.length, blocked, artKept: JSON.stringify(B.art) === JSON.stringify(fb.art), portrait: Object.values(B.rules.chr_)[0].portrait };
  });
  check('Day 146 opens it: hash ok, no broken or forward references, its own Final still allowed, art untouched', rt.matches && !rt.broken && !rt.forward && !rt.blocked && rt.artKept && /^por_/.test(rt.portrait), rt);
  const dr = Kit.buildExport('draft');
  const rtd = await in146(dr.files[0].text, (w, K, r) => ({ forward: r.forward.length }));
  check('a Draft export keeps art closed, so Day 146 reads the filled fields as forward', !JSON.parse(dr.files[0].text).kit.opened.includes('art') || rtd.forward === 0, rtd);
  const st = win.ART_DEMO.selfTest();
  check('every fixture links its forward fields in Quick Build and validates clean', st.every((r) => !r.validation.errors && !r.validation.broken), st.map((r) => r.key + ':' + r.validation.errors + '/' + r.validation.broken).join(' '));
  win.close();

  const pass = results.filter((r) => r.ok).length;
  results.forEach((r) => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + String(JSON.stringify(r.detail)).slice(0, 900))));
  console.log('\nRequests made to the scripted API: ' + api.calls.length);
  console.log('\n' + pass + ' of ' + results.length + ' passed');
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'phase7-report.json'), JSON.stringify({ date: new Date().toISOString(), pass, total: results.length, results, requests: api.calls.length }, null, 2));
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
