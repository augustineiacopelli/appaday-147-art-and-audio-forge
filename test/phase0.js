// Phase 0 acceptance: boot Day 147, exercise ART:STORE, run the fixture self test, export, and round trip into Day 146.
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
  const demoText = fs.readFileSync(path.join(__dirname, 'out', 'demo-bundle.json'), 'utf8');
  // 1. Boot clean, with ?dev=1.
  let { win, errors } = boot(APP147, { url: 'https://augustineiacopelli.github.io/appaday/147/?dev=1' });
  await wait(60);
  let Kit = win.Kit, ART = win.ART;
  const tabs = Array.from(win.document.querySelectorAll('#tabs .tab')).map((t) => t.dataset.ws + (t.classList.contains('locked') ? '(locked)' : ''));
  check('boots with no page errors', !errors.length, errors.slice(0, 2));
  check('tabs mounted', tabs.length === 10, tabs.join(' '));
  check('active tab is start', Kit.active() === 'start');
  check('fresh bundle gets an art skeleton', Kit.bundle.current().art.version === '1.0.0' && ART.isEmpty());
  check('14 art prefixes valid in ID_RE and PREFIXES', ART.PREFIXES.every((p) => Kit.ids.isValid(p + 'x_ab12') && Kit.codex.prefixInfo(p).forge === 147));
  check('fx_ would be invalid', !Kit.ids.isValid('fx_fire_ab12'));
  // 2. Load demo, mint art records, validate.
  Kit.bundle.load(JSON.parse(demoText));
  await wait(20);
  let b = Kit.bundle.current();
  check('demo load keeps 146 hash semantics', Kit.bundle.hash(JSON.parse(demoText)) === JSON.parse(demoText).kit.contentHash);
  check('codex.prefixes registered on load', ART.PREFIXES.every((p) => b.codex.prefixes[p] && b.codex.prefixes[p].ns === 'art' && b.codex.prefixes[p].forge === 147));
  const chrId = Object.keys(b.rules.chr_)[0];
  const por = ART.records.put(ART.envelope('por_', 'Courier portrait', { kind: 'chr', ref: chrId }, 'procedural', 42));
  const til = ART.records.put(ART.envelope('til_', 'Forest', { kind: 'role', ref: 'biome:forest' }, 'default', 7, { kind: 'biome' }));
  const efx = ART.records.put(ART.envelope('efx_', 'Fire effect', { kind: 'element', ref: 'fire' }, 'default', 9));
  Kit.bundle.touch('test');
  const idx = Kit.index();
  check('art records indexed', [por.id, til.id, efx.id].every((id) => idx.byId[id]), [por.id, til.id, efx.id]);
  let res = Kit.refreshValidation();
  check('art records validate with the envelope types', !res.errors.length && !res.broken.length, Kit.validate.summary(res));
  let bad = false; try { ART.records.put({ id: 'chr_nope_ab12', name: 'x' }); } catch (e) { bad = true; }
  check('ART.records.put refuses non art prefixes', bad);
  const roles = ART.musicRoles(b).filter((r) => r.required).map((r) => r.key);
  check('music roles generated', roles.includes('field:westland') && roles.includes('field:eastland') && roles.includes('ending:1') && roles.includes('ending:2') && !roles.includes('ending'), roles.join(' '));
  const sz = ART.size(b);
  check('size meter model', sz.total > 40000 && sz.level === 'ok' && sz.top.length === 3, { total: sz.total, level: sz.level, room: sz.room });
  check('header size chip painted', /KB|MB/.test(win.document.getElementById('btnSize').textContent), win.document.getElementById('btnSize').textContent);
  // 3. Self test across fixtures.
  const st = win.ART_DEMO.selfTest();
  check('self test runs every fixture', st.length === 10, st.map((r) => r.key).join(' '));
  check('every fixture hash verifies', st.every((r) => r.hashOk));
  check('no fixture has blocking errors in 147', st.every((r) => !r.validation.errors && !r.validation.broken), st.map((r) => r.key + ':' + r.validation.errors + '/' + r.validation.broken).join(' '));
  // 4. Draft export with a filled but unresolved forward field: art must stay closed.
  b.rules.fam_[Object.keys(b.rules.fam_)[0]].sprite = 'spr_missing_zz99';
  b.rules.chr_[chrId].portrait = por.id;
  Kit.bundle.touch('test');
  let draft = Kit.buildExport('draft');
  let finalErr = null; try { Kit.buildExport('final'); } catch (e) { finalErr = e.message; }
  check('draft export leaves art closed', !JSON.parse(draft.files[0].text).kit.opened.includes('art'));
  check('final blocked by unresolved forward field', /forward field/.test(finalErr || ''), finalErr);
  const draftIn146 = await in146(draft.files[0].text, (w, K, r) => ({ forward: r.forward.map((x) => x.id), opened: K.bundle.current().kit.opened }));
  check('146 imports 147 draft: hash ok, 0 broken, both refs forward', draftIn146.matches && !draftIn146.summary.errors && !draftIn146.summary.broken && draftIn146.summary.forward === 2, draftIn146);
  // 5. Final export once the forward field resolves.
  const spr = ART.records.put(ART.envelope('spr_', 'Slime sprite', { kind: 'fam', ref: Object.keys(b.rules.fam_)[0] }, 'procedural', 3));
  b.rules.fam_[Object.keys(b.rules.fam_)[0]].sprite = spr.id;
  Kit.bundle.touch('test');
  const fin = Kit.buildExport('final');
  const fb = JSON.parse(fin.files[0].text), man = JSON.parse(fin.files[1].text);
  check('final export opens art and stamps forge 147', fb.kit.opened.includes('art') && fb.kit.forges['147'].status === 'final' && fb.kit.forges['146'].status === 'final', fb.kit.forges);
  check('manifest hash equals bundle hash', man.bundleHash === fb.kit.contentHash && man.unresolved.length === 0 && man.created.length === 4, man);
  const finIn146 = await in146(fin.files[0].text, async (w, K, r) => {
    let blocked = null; try { K.buildExport('final'); } catch (e) { blocked = e.message; }
    return { broken: r.broken.length, forward: r.forward.length, blocked, artKept: JSON.stringify(K.bundle.current().art) === JSON.stringify(fb.art) };
  });
  check('146 imports 147 final: hash ok, refs resolve, 146 Final still allowed, art untouched', finIn146.matches && !finIn146.broken && !finIn146.forward && !finIn146.blocked && finIn146.artKept, finIn146);
  // 6. Every fixture opens cleanly in Day 146.
  const fx = [];
  for (const f of win.ART_DEMO.FIXTURES) {
    const r = await in146(JSON.stringify(win.ART_DEMO.fixture(f.key)));
    fx.push(f.key + ':' + (r.rejected ? 'REJECTED' : (r.matches ? 'hash' : 'HASHBAD') + ' e' + r.summary.errors + ' b' + r.summary.broken + ' w' + r.summary.warnings));
  }
  check('all fixtures import into 146 with verified hashes', fx.every((s) => /:hash/.test(s)), fx.join(' | '));
  // 7. Shared storage: a Day 146 draft on the same origin is what Day 147 opens.
  ({ win, errors } = boot(APP147, { url: 'https://augustineiacopelli.github.io/appaday/147/', storage: { 'kit:draft': demoText, 'kit:ui': JSON.stringify({ tab: 'rules' }) } }));
  await wait(60);
  check('147 restores the shared 146 draft and falls back to Start', win.Kit.bundle.current().kit.title === 'Demo Saga' && win.Kit.active() === 'start' && !errors.length, { title: win.Kit.bundle.current().kit.title, active: win.Kit.active(), errors: errors.slice(0, 2) });
  // 8. Storage banner on a refused write.
  const SP = win.Storage.prototype, orig = SP.setItem;
  SP.setItem = function (k, v) { if (k === 'kit:draft') throw new Error('QuotaExceededError'); return orig.call(this, k, v); };
  win.Kit.bundle.save();
  const shown = !win.document.getElementById('storeBanner').hidden;
  SP.setItem = orig; win.Kit.bundle.save();
  check('storage banner shows on refused save and clears on success', shown && win.document.getElementById('storeBanner').hidden);
  // 9. Stub tabs locked without a locked Charter.
  win.Kit.bundle.create('Blank');
  await wait(20);
  const locked = Array.from(win.document.querySelectorAll('#tabs .tab.locked')).length;
  check('later tabs lock until a locked Charter is loaded', locked === 8, locked);

  const pass = results.filter((r) => r.ok).length;
  results.forEach((r) => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + JSON.stringify(r.detail))));
  console.log('\nFixtures in 146:', fx.join(' | '));
  console.log('\nSelf test:'); st.forEach((r) => console.log('  ' + r.key.padEnd(4), String(r.records).padStart(4), 'records', (r.size / 1000).toFixed(1).padStart(6), 'KB', r.buildMs + 'ms', 'roles', r.roles, 'v', JSON.stringify(r.validation)));
  console.log('\n' + pass + ' of ' + results.length + ' passed');
  fs.writeFileSync(path.join(__dirname, 'out', 'phase0-report.json'), JSON.stringify({ results, fixtures146: fx, selfTest: st }, null, 2));
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
