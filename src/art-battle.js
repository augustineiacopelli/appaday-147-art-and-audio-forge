// === ART:BATTLE BEGIN ===
(function () {
  'use strict';
  // Everything between the bundle, ENGINE_BATTLE, and the presenter. Day 147 does not carry the battle engine: the
  // engine arrives at run time from Day 146 (the engine-battle.js it exports, or the live Saga Forge page), is loaded
  // through a Blob URL inside a wrapper so it declares no global, and is accepted only when its version is 1.x and its
  // API matches the contract in ART:CONTRACT. The scripted demo needs no engine at all.
  var U = Kit.util, ER = ENGINE_RENDER, H = ER.util.hash32;
  var B = ART.battle = {};
  function cur() { return Kit.bundle.current(); }
  function recs(b, p) { var o = b && b.rules && U.isObj(b.rules[p]) ? b.rules[p] : {}; return Object.keys(o).map(function (k) { return o[k]; }).filter(function (r) { return U.isObj(r) && r.id; }); }
  function recOf(b, id) { var p = Kit.ids.prefixOf(id); return p && b.rules && U.isObj(b.rules[p]) && b.rules[p][id] ? b.rules[p][id] : null; }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : (d === undefined ? 0 : d); }

  // ---------------------------------------------------------------- the engine loader
  B.SAGA_URL = 'https://augustineiacopelli.github.io/appaday-146-saga-forge/';
  B.SAVE_KEY = 'art147:engine';
  // Built from parts so this page never contains Day 146's fence markers itself.
  B.FENCE = ['// === ENGINE:' + 'BATTLE BEGIN ===', '// === ENGINE:' + 'BATTLE END ==='];
  var engine = null, status = { loaded: false, version: null, via: null, name: null, error: null, bytes: 0, loading: false };
  B.engine = function () { return engine; };
  B.status = function () { return Object.assign({}, status); };
  // check(E) -> null when the object honors the contract, else the reason it does not.
  B.check = function (E) {
    if (!E || typeof E !== 'object') return 'The file did not define ENGINE_BATTLE.';
    if (typeof E.version !== 'string' || !/^1\./.test(E.version)) return 'This forge reads ENGINE_BATTLE 1.x; the file is version ' + (E.version || 'unknown') + '.';
    var need = ['init', 'advance', 'suggest', 'replay'].filter(function (k) { return typeof E[k] !== 'function'; });
    if (need.length) return 'ENGINE_BATTLE is missing ' + need.join(', ') + '.';
    if (!(E.gaugeMax > 0)) return 'ENGINE_BATTLE has no gaugeMax.';
    return null;
  };
  // Pulls the ENGINE:BATTLE fence out of a whole Day 146 page; a bare engine-battle.js passes through unchanged.
  B.extract = function (text) {
    text = String(text || '');
    var a = text.indexOf(B.FENCE[0]), z = text.indexOf(B.FENCE[1]);
    if (a >= 0 && z > a) return text.slice(a, z + B.FENCE[1].length);
    return /var\s+ENGINE_BATTLE\s*=/.test(text) ? text : null;
  };
  function wrap(src) { return '(function () {\n' + src + '\n;window.__art147Engine = (typeof ENGINE_BATTLE !== "undefined") ? ENGINE_BATTLE : null;\n})();\n'; }
  // Evaluates the wrapped source. mode 'blob' (the default) loads it as a script from a Blob URL; mode 'function'
  // evaluates it with the Function constructor (tests and hosts without script loading).
  function evaluate(src, mode) {
    return new Promise(function (resolve, reject) {
      try { delete window.__art147Engine; } catch (e) { window.__art147Engine = undefined; }
      if (mode === 'function') {
        try { (new Function(wrap(src)))(); resolve(window.__art147Engine || null); } catch (e) { reject(e); }
        return;
      }
      var url = null, done = false, s = document.createElement('script');
      function end(err) {
        if (done) return; done = true;
        if (url && typeof URL !== 'undefined' && URL.revokeObjectURL) URL.revokeObjectURL(url);
        if (s.parentNode) s.parentNode.removeChild(s);
        if (err) reject(err); else resolve(window.__art147Engine || null);
      }
      try { url = URL.createObjectURL(new Blob([wrap(src)], { type: 'text/javascript' })); } catch (e) { reject(e); return; }
      s.src = url; s.async = true;
      s.onload = function () { end(null); };
      s.onerror = function () { end(new Error('The engine file could not run.')); };
      document.head.appendChild(s);
      setTimeout(function () { end(new Error('The engine did not load in time.')); }, 8000);
    });
  }
  // install(src, {via: file|saga|saved, name, mode, save}) -> Promise of the status.
  B.install = function (text, o) {
    o = o || {};
    var src = B.extract(text);
    if (!src) return Promise.reject(new Error('That file does not contain ENGINE_BATTLE.'));
    status.loading = true;
    return evaluate(src, o.mode).then(function (E) {
      var why = B.check(E);
      status.loading = false;
      if (why) { status.error = why; throw new Error(why); }
      engine = E;
      status = { loaded: true, version: E.version, via: o.via || 'file', name: o.name || 'engine-battle.js', error: null, bytes: src.length, loading: false };
      if (o.save !== false) { try { localStorage.setItem(B.SAVE_KEY, JSON.stringify({ src: src, via: status.via, name: status.name, at: new Date().toISOString() })); } catch (e) { /* quota: the engine just reloads next visit */ } }
      Kit.emit && Kit.emit('art:engine', B.status());
      return B.status();
    }, function (e) { status.loading = false; status.error = e.message || String(e); throw e; });
  };
  B.fromFile = function (file) {
    return (file.text ? file.text() : new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result)); }; r.onerror = rej; r.readAsText(file); }))
      .then(function (t) { return B.install(t, { via: 'file', name: file.name }); });
  };
  B.fromSaga = function () {
    return fetch(B.SAGA_URL, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('Saga Forge answered ' + r.status + '.'); return r.text(); })
      .then(function (t) { return B.install(t, { via: 'saga', name: 'Saga Forge (live)' }); });
  };
  B.restore = function (mode) {
    var raw = null;
    try { raw = localStorage.getItem(B.SAVE_KEY); } catch (e) { raw = null; }
    if (!raw) return Promise.resolve(null);
    var o; try { o = JSON.parse(raw); } catch (e) { return Promise.resolve(null); }
    return B.install(o.src, { via: o.via || 'saved', name: o.name, mode: mode, save: false }).catch(function () { return null; });
  };
  B.forget = function () { engine = null; status = { loaded: false, version: null, via: null, name: null, error: null, bytes: 0, loading: false }; try { localStorage.removeItem(B.SAVE_KEY); } catch (e) { /* ok */ } };
  B.use = function (E, via) { var why = B.check(E); if (why) throw new Error(why); engine = E; status = { loaded: true, version: E.version, via: via || 'host', name: 'ENGINE_BATTLE', error: null, bytes: 0, loading: false }; return B.status(); };

  // ---------------------------------------------------------------- party building (mirrors Day 146 WS.arena.buildParty)
  var PARTY_MAX = 4;
  function rs(b) { return (b && b.charter && b.charter.ruleset) || {}; }
  function epsFor(b, chId) { var l = recs(b, 'eps_'); for (var i = 0; i < l.length; i++) if (l[i].chapter === chId) return l[i]; return null; }
  function bestGear(b, slot, weaponClass, tier) {
    var best = null;
    recs(b, 'eqp_').forEach(function (e) {
      if (e.slot !== slot) return;
      if (slot === 'weapon' && e.weaponClass && weaponClass && String(e.weaponClass).toLowerCase() !== String(weaponClass).toLowerCase()) return;
      var t = num(e.tier, 1);
      if (t > tier) return;
      if (!best || t > num(best.tier, 1) || (t === num(best.tier, 1) && num(e.price) > num(best.price))) best = e;
    });
    return best;
  }
  function placeMateria(b, members, matIds) {
    var slots = [];
    members.forEach(function (m, mi) {
      (m.equipment || []).forEach(function (eid) {
        var e = recOf(b, eid), lay = e && U.isObj(e.slotLayout) ? e.slotLayout : null, n = lay ? Math.max(0, Math.min(8, num(lay.count))) : 0;
        for (var i = 0; i < n; i++) slots.push({ mi: mi, eqp: eid, slot: i, links: (lay.links || []).filter(function (l) { return Array.isArray(l) && (l[0] === i || l[1] === i); }), used: false });
      });
    });
    var mats = (matIds || []).map(function (id) { return recOf(b, id); }).filter(Boolean);
    var supports = mats.filter(function (m) { return m.kind === 'support'; }), others = mats.filter(function (m) { return m.kind !== 'support'; });
    function free(eqp, mi, s) { for (var i = 0; i < slots.length; i++) if (slots[i].mi === mi && slots[i].eqp === eqp && slots[i].slot === s && !slots[i].used) return slots[i]; return null; }
    function put(sl, m) { sl.used = true; members[sl.mi].materia.push({ eqp: sl.eqp, slot: sl.slot, mat: m.id, ap: 0 }); }
    supports.forEach(function (sm) {
      var partner = others[0], done = false;
      slots.forEach(function (sl) {
        if (done || sl.used) return;
        sl.links.forEach(function (l) {
          if (done) return;
          var o = l[0] === sl.slot ? l[1] : l[0], os = free(sl.eqp, sl.mi, o);
          if (!os) return;
          put(sl, sm); done = true;
          if (partner) { put(os, partner); others.shift(); }
        });
      });
      if (!done) others.push(sm);
    });
    var mi = 0;
    others.forEach(function (m) {
      var tries = 0, sl = null;
      while (!sl && tries < members.length) {
        for (var i = 0; i < slots.length; i++) if (!slots[i].used && slots[i].mi === (mi + tries) % members.length) { sl = slots[i]; break; }
        tries++;
      }
      if (!sl) for (var j = 0; j < slots.length; j++) if (!slots[j].used) { sl = slots[j]; break; }
      if (sl) { put(sl, m); mi = (sl.mi + 1) % Math.max(1, members.length); }
    });
    return members;
  }
  // cfg = {chars, source: 'custom' | chp id, level, gearTier, materia, rows}
  B.buildParty = function (b, cfg) {
    b = b || cur(); cfg = cfg || {};
    var prog = rs(b).progression, eps = cfg.source && cfg.source !== 'custom' ? epsFor(b, cfg.source) : null;
    var level = eps ? num(eps.targetLevel, 1) : num(cfg.level, 10), tier = eps ? num(eps.gearTier, 1) : num(cfg.gearTier, 1);
    var chars = (cfg.chars && cfg.chars.length ? cfg.chars : recs(b, 'chr_').slice(0, PARTY_MAX).map(function (c) { return c.id; })).map(function (id) { return recOf(b, id); }).filter(Boolean).slice(0, PARTY_MAX);
    var members = chars.map(function (c, i) {
      var eq = ['weapon', 'armor', 'accessory'].map(function (s) { return bestGear(b, s, c.weaponClass, tier); }).filter(Boolean).map(function (e) { return e.id; });
      var m = { chr: c.id, level: Math.max(1, Math.min(99, Math.round(level))), equipment: eq, materia: [], abilities: eps && Array.isArray(eps.abilities) ? eps.abilities.slice() : [], row: (cfg.rows && cfg.rows[c.id]) || 'front' };
      if (prog === 'jobs') { var js = eps && Array.isArray(eps.jobSet) && eps.jobSet.length ? eps.jobSet : null; m.job = js ? js[i % js.length] : null; m.jobLevel = m.level; }
      if (prog === 'classes') { var cs = eps && Array.isArray(eps.classSet) && eps.classSet.length ? eps.classSet : null; m.cls = cs ? cs[i % cs.length] : null; }
      return m;
    });
    if (prog === 'materia') placeMateria(b, members, eps ? (eps.materiaSet || []) : (cfg.materia || recs(b, 'mat_').map(function (m) { return m.id; })));
    return members;
  };
  B.dataFor = function (b, troopId, party, weatherId) { b = b || cur(); return { ruleset: rs(b), records: b.rules || {}, party: party, troopId: troopId, weatherId: weatherId || null }; };
  // Battle codes are Day 146's: base64 JSON {v, troopId, party, seed, inputs [{t, input}], weatherId, opts, end}.
  B.encodeCode = function (o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))); };
  B.decodeCode = function (code) {
    var o = JSON.parse(decodeURIComponent(escape(atob(String(code).replace(/\s+/g, '')))));
    if (!U.isObj(o) || !o.troopId || !Array.isArray(o.party) || typeof o.seed !== 'number' || !Array.isArray(o.inputs)) throw new Error('That is not a Saga Forge battle code.');
    return o;
  };

  // ---------------------------------------------------------------- what the presenter is given
  // Background: the troop's chapter biome when the Charter names one, else grassland, else the first background.
  B.backgroundFor = function (b, troopId, pick) {
    b = b || cur();
    if (pick) { var p = ART.records.get(pick, b); if (p) return p; }
    var TL = ART.tiles; if (!TL) return null;
    var g = TL.biome(b, 'grassland');
    return (g && TL.bgFor(b, g)) || TL.backgrounds(b)[0] || null;
  };
  B.statusIcons = function (b) { var out = {}; (ART.sprites ? ART.sprites.icons(b) : []).forEach(function (i) { if (i.subject && i.subject.kind === 'sta') out[i.subject.ref] = i.id; }); return out; };
  B.presenterConfig = function (b, snapshot, o) {
    o = o || {};
    var R = (b.charter.specs || {}).resolution || {}, w = Number(R.w) || 256, h = Number(R.h) || 224, kit = ART.iface ? ART.iface.kit(b) : {};
    var wov = o.weatherId && ART.motion ? ART.motion.overlayFor(b, o.weatherId) : null;
    var cache = o.cache || (b === cur() ? ART.sprites.cache() : ER.createCache(b.art, { size: ART.sprites.tileSize(b), entries: ART.palette.entries(b), budget: 12e6 }));
    return { art: b.art, cache: cache, w: w, h: h, snapshot: snapshot, pacing: o.pacing || 'wait', speed: o.speed || 1, cue: o.cue,
      layout: { partySide: 'right' }, entries: ART.palette.entries(b), bgd: B.backgroundFor(b, o.troopId, o.bg), wov: wov, ui: { window: kit.window, font: kit.font, cursor: kit.cursor },
      seed: o.seed || 1, icons: B.statusIcons(b) };
  };

  // ---------------------------------------------------------------- the scripted event demo (no engine needed)
  // script(b) -> {snapshot, feeds: [{events, state}]}: a short battle written in ENGINE_BATTLE's event shapes from the
  // bundle's own party, enemies, abilities, and statuses. It walks every beat the presenter knows: ready, command,
  // a melee crit, an area spell with a status, an enemy attack, a Limit filling, a heal, a failed cast, the item beat
  // (behind its feature check, since engine 1.0.0 has no item event), a multi hit Limit, a KO and a revive, a status
  // wearing off, deaths, and victory.
  B.script = function (b) {
    b = b || cur();
    var chars = recs(b, 'chr_').slice(0, 3), abl = recs(b, 'abl_'), sta = recs(b, 'sta_'), itm = recs(b, 'itm_');
    var foesFrom = [], tr = recs(b, 'trp_')[0];
    if (tr && Array.isArray(tr.members)) tr.members.slice(0, 3).forEach(function (m) { var e = recOf(b, m.enm); if (e) foesFrom.push({ e: e, row: m.row }); });
    if (!foesFrom.length) recs(b, 'enm_').slice(0, 2).forEach(function (e) { foesFrom.push({ e: e, row: 'front' }); });
    var units = [], db = { abl: {}, sta: {} }, L = 5;
    chars.forEach(function (c, i) {
      var bs = c.baseStats || {}, gr = c.growth || {}, hp = Math.max(60, Math.round(num(bs.hp, 100) + num(gr.hp, 15) * L)), mp = Math.max(0, Math.round(num(bs.mp, 20) + num(gr.mp, 3) * L));
      units.push({ uid: 'p' + i, side: 'party', ref: c.id, name: c.name || c.id, hp: hp, maxHp: hp, mp: mp, maxMp: mp, row: 'front', gauge: 0, statuses: [], ko: false });
    });
    if (!units.length) [['Hero', 180], ['Mage', 130], ['Knight', 220]].forEach(function (x, i) { units.push({ uid: 'p' + i, side: 'party', ref: null, name: x[0], hp: x[1], maxHp: x[1], mp: 30, maxMp: 30, row: 'front', gauge: 0, statuses: [], ko: false }); });
    var seen = {};
    foesFrom.forEach(function (f, i) {
      var nm = f.e.name || f.e.id; seen[nm] = (seen[nm] || 0) + 1;
      var hp = Math.max(30, num(f.e.stats && f.e.stats.hp, 60));
      units.push({ uid: 'e' + i, side: 'foe', ref: f.e.id, fam: f.e.family || null, name: nm, hp: hp, maxHp: hp, mp: 0, maxMp: 0, row: f.row === 'back' ? 'back' : 'front', gauge: 0, statuses: [], ko: false, isBoss: !!f.e.isBoss });
    });
    if (!units.some(function (u) { return u.side === 'foe'; })) units.push({ uid: 'e0', side: 'foe', ref: null, fam: null, name: 'Shade', hp: 90, maxHp: 90, mp: 0, maxMp: 0, row: 'front', gauge: 0, statuses: [], ko: false });
    var counts = {}, tally = {};
    units.forEach(function (u) { if (u.side === 'foe') counts[u.name] = (counts[u.name] || 0) + 1; });
    units.forEach(function (u) { if (u.side === 'foe' && counts[u.name] > 1) { tally[u.name] = (tally[u.name] || 0) + 1; u.name = u.name + ' ' + String.fromCharCode(64 + tally[u.name]); } });
    abl.forEach(function (a) { db.abl[a.id] = { id: a.id, name: a.name || a.id, kind: a.kind, element: a.element || null }; });
    sta.forEach(function (s) { db.sta[s.id] = { name: s.name || s.id }; });
    db.abl._attack = { id: '_attack', name: 'Attack', kind: 'attack' };
    function pick(pred) { for (var i = 0; i < abl.length; i++) if (pred(abl[i])) return abl[i]; return null; }
    var area = pick(function (a) { return a.kind === 'magic' && a.targeting && a.targeting.scope === 'all'; }) || pick(function (a) { return a.kind === 'magic'; });
    var heal = pick(function (a) { return a.kind === 'heal'; }), limit = pick(function (a) { return a.kind === 'limit'; }), foeAbl = pick(function (a) { return a.kind === 'enemy'; });
    var st0 = sta[0] || null, item = itm[0] || null;
    var party = units.filter(function (u) { return u.side === 'party'; }), foes = units.filter(function (u) { return u.side === 'foe'; });
    var P0 = party[0].uid, P1 = (party[1] || party[0]).uid, P2 = (party[2] || party[party.length - 1]).uid, E0 = foes[0].uid, E1 = (foes[1] || foes[0]).uid;
    var hp = {}, gauge = {}, mp = {}, ko = {};
    units.forEach(function (u) { hp[u.uid] = u.hp; gauge[u.uid] = 0; mp[u.uid] = u.mp; });
    var t = 0, feeds = [];
    function ev(type, o) { var e = Object.assign({ type: type, t: t, actor: null, target: null, value: null, element: null, crit: false }, o || {}); return e; }
    function dmg(actor, target, v, o) { v = Math.min(hp[target], v); hp[target] -= v; return ev('damage', Object.assign({ actor: actor, target: target, value: v }, o || {})); }
    function healEv(actor, target, v, abl0) { var mx = units.filter(function (u) { return u.uid === target; })[0].maxHp; v = Math.min(mx - hp[target], v); hp[target] += v; return ev('heal', { actor: actor, target: target, value: v, abl: abl0 }); }
    function state(acted, spent) {
      t += 40;
      units.forEach(function (u) { gauge[u.uid] = ko[u.uid] ? 0 : u.uid === acted ? 0 : Math.min(65536, gauge[u.uid] + 21000 + (H(u.uid + t) % 6000)); });
      if (acted && spent) mp[acted] = Math.max(0, mp[acted] - spent);
      return { t: t, gaugeMax: 65536, units: units.map(function (u) { return { uid: u.uid, hp: hp[u.uid], maxHp: u.maxHp, mp: mp[u.uid], maxMp: u.maxMp, gauge: gauge[u.uid], ko: !!ko[u.uid] }; }) };
    }
    function feed(events, acted, spent) { feeds.push({ events: [ev('tick', { value: 40 })].concat(events), state: state(acted, spent) }); }
    var bigFoe = Math.max(1, Math.round(foes[0].maxHp * 0.3));
    feed([ev('ready', { actor: P0 })]);
    feed([ev('command', { actor: P0, abl: '_attack', name: 'Attack', targets: [E0] }), ev('action', { actor: P0, abl: '_attack', name: 'Attack', targets: [E0] }), dmg(P0, E0, bigFoe, { abl: '_attack', crit: true })], P0);
    if (area) {
      var tg = area.targeting && area.targeting.scope === 'all' ? foes.map(function (f) { return f.uid; }) : [E1];
      var evs = [ev('ready', { actor: P1 }), ev('command', { actor: P1, abl: area.id, name: area.name, targets: tg }), ev('action', { actor: P1, abl: area.id, name: area.name, element: area.element || null, targets: tg })];
      tg.forEach(function (k) { evs.push(dmg(P1, k, Math.max(1, Math.round(units.filter(function (u) { return u.uid === k; })[0].maxHp * 0.2)), { abl: area.id, element: area.element || null })); });
      if (st0) evs.push(ev('status', { target: tg[tg.length - 1], value: st0.id }));
      feed(evs, P1, 6);
    }
    var hitP2 = Math.round(party[party.length - 1].maxHp * 0.55);
    feed([ev('action', { actor: E0, abl: foeAbl ? foeAbl.id : '_attack', name: foeAbl ? foeAbl.name : 'Attack', targets: [P2] }), dmg(E0, P2, hitP2, { abl: foeAbl ? foeAbl.id : '_attack' }), ev('limitReady', { target: P2, value: 'full' })], E0);
    if (heal) feed([ev('ready', { actor: P1 }), ev('command', { actor: P1, abl: heal.id, name: heal.name, targets: [P2] }), ev('action', { actor: P1, abl: heal.id, name: heal.name, targets: [P2] }), healEv(P1, P2, Math.round(hitP2 * 0.6), heal.id)], P1, 5);
    feed([ev('ready', { actor: P1 }), ev('miss', { actor: P1, value: 'mp', name: 'Not enough MP' })], P1);
    if (item) feed([ev('ready', { actor: P0 }), ev('item', { actor: P0, abl: item.id, name: item.name, targets: [P2] }), healEv(P0, P2, 40, item.id)], P0);
    if (limit && foes.length) {
      var share = Math.max(1, Math.ceil(hp[E0] / 3)), le = [ev('ready', { actor: P2 }), ev('command', { actor: P2, abl: limit.id, name: limit.name, targets: [E0] }), ev('action', { actor: P2, abl: limit.id, name: limit.name, targets: [E0] })];
      for (var k = 0; k < 3; k++) le.push(dmg(P2, E0, share, { abl: limit.id }));
      if (hp[E0] <= 0) { le.push(ev('ko', { actor: P2, target: E0 })); ko[E0] = true; }
      feed(le, P2);
    }
    if (E1 !== E0 || !ko[E0]) {
      var foeNow = ko[E0] ? E1 : E0;
      feed([ev('action', { actor: foeNow, abl: '_attack', name: 'Attack', targets: [P1] }), dmg(foeNow, P1, hp[P1], { abl: '_attack' }), ev('ko', { actor: foeNow, target: P1 })], foeNow);
      ko[P1] = true;
      if (heal) { feed([ev('ready', { actor: P0 }), ev('action', { actor: P0, abl: heal.id, name: heal.name, targets: [P1] }), ev('revive', { actor: P0, target: P1, abl: heal.id, value: Math.round(units.filter(function (u) { return u.uid === P1; })[0].maxHp * 0.3) })], P0, 5); ko[P1] = false; hp[P1] = Math.round(units.filter(function (u) { return u.uid === P1; })[0].maxHp * 0.3); }
      if (st0) feed([ev('status', { target: E1, value: '-' + st0.id, name: 'wore off' }), ev('action', { actor: foeNow, abl: '_attack', name: 'Attack', targets: [P0] }), ev('miss', { actor: foeNow, target: P0, abl: '_attack' })], foeNow);
    }
    var finale = [];
    foes.forEach(function (f) { if (ko[f.uid]) return; finale.push(ev('action', { actor: P0, abl: '_attack', name: 'Attack', targets: [f.uid] })); finale.push(dmg(P0, f.uid, hp[f.uid], { abl: '_attack' })); finale.push(ev('ko', { actor: P0, target: f.uid })); ko[f.uid] = true; });
    finale.push(ev('end', { value: 'win' }));
    feed(finale, P0);
    return { snapshot: { v: 1, seed: 1, t: 0, gaugeMax: 65536, db: db, units: units }, feeds: feeds };
  };

  // ---------------------------------------------------------------- the scripted player (Wait pacing)
  // playScript(presenter, script) -> {step(dt), done(), fed}. Feeds the next scripted advance whenever the presenter
  // is idle, exactly as a Wait mode host does with the real engine.
  B.playScript = function (presenter, sc) {
    var i = 0, p = { fed: 0 };
    p.step = function (dt) {
      presenter.update(dt);
      if (presenter.isIdle() && i < sc.feeds.length) { presenter.feed(sc.feeds[i].events, sc.feeds[i].state); i++; p.fed = i; }
      return p.done();
    };
    p.done = function () { return i >= sc.feeds.length && presenter.isIdle(); };
    return p;
  };

  // ---------------------------------------------------------------- a real battle
  // session(b, cfg) runs ENGINE_BATTLE against the presenter. cfg: {E, troopId, party, weatherId, seed, pacing,
  // speed, auto, code (a decoded battle code to replay), cue, bg, ctx}. step(dt) is the host loop; give(input) sends a
  // command; awaiting() is what the menu shows. In Wait pacing the engine advances only while the presenter is idle.
  B.session = function (b, cfg) {
    b = b || cur(); cfg = cfg || {};
    var E = cfg.E || engine;
    if (!E) throw new Error('Load the battle engine first.');
    var code = cfg.code || null, pacing = code ? (code.opts && code.opts.waitMode === false ? 'active' : 'wait') : (cfg.pacing === 'active' ? 'active' : 'wait');
    var troopId = code ? code.troopId : cfg.troopId, party = code ? code.party : cfg.party, weatherId = code ? code.weatherId || null : cfg.weatherId || null;
    var seed = code ? code.seed : (num(cfg.seed, 0) || 1), opts = code ? (code.opts || {}) : { waitMode: pacing === 'wait' };
    if (!recOf(b, troopId)) throw new Error('Choose a troop first.');
    if (!party || !party.length) throw new Error('Pick at least one character for the party.');
    var data = B.dataFor(b, troopId, party, weatherId), S = E.init(data, seed, opts);
    var pc = B.presenterConfig(b, S, { pacing: pacing, speed: cfg.speed, cue: cfg.cue, weatherId: weatherId, troopId: troopId, bg: cfg.bg, seed: seed });
    pc.ctx = cfg.ctx || null;
    var P = ER.createPresenter(pc);
    var s = { S: S, P: P, data: data, seed: seed, opts: opts, troopId: troopId, party: party, weatherId: weatherId, inputs: [], auto: !!cfg.auto && !code, pacing: pacing, acc: 0, ended: false, warnings: (S.db.warnings || []).slice(),
      playback: code ? { inputs: code.inputs.slice(), i: 0, expect: code.end || null } : null, match: null, events: 0 };
    var tickRate = num((rs(b).battle || {}).tickRate, 30);
    function feedR(r) { s.S = r.state; s.events += (r.events || []).length; P.feed(r.events || [], r.state); }
    s.give = function (input) {
      if (s.S.result) return false;
      var t = s.S.t, r = E.advance(s.S, input);
      var rej = (r.events || []).filter(function (e) { return e.type === 'miss' && e.value === 'rejected'; })[0];
      if (rej) { s.lastReject = rej.name || 'That command was rejected.'; return false; }
      s.inputs.push({ t: t, input: input });
      feedR(r);
      return true;
    };
    s.awaiting = function () { return s.S.result || s.playback ? null : s.S.awaiting; };
    s.menuOpen = function () { return !!s.awaiting() && !s.auto && (pacing === 'active' || P.isIdle()); };
    s.setPacing = function (m) { pacing = s.pacing = P.setPacing(m); };
    s.step = function (dt) {
      dt = Math.max(0, Math.min(100, Number(dt) || 0));
      P.update(dt);
      var S0 = s.S, pb = s.playback;
      if (S0.result) { if (!s.ended && P.isIdle()) end(); return s; }
      if (pacing === 'wait' && !P.isIdle()) return s;
      if (pb && pb.i < pb.inputs.length && S0.t >= pb.inputs[pb.i].t) { var rec = pb.inputs[pb.i++]; s.inputs.push(rec); feedR(E.advance(S0, rec.input)); return s; }
      if (S0.awaiting && !pb) {
        if (s.auto) { var sug = E.suggest(S0, null); if (sug && s.give(sug)) return s; }
        if (S0.waitMode || S0.sched !== 'atb') return s;
      }
      if (S0.sched === 'atb') {
        s.acc += dt * num(cfg.speed, 1) * tickRate / 1000;
        var n = Math.floor(s.acc);
        if (n < 1) return s;
        s.acc -= n;
        if (pb && pb.i < pb.inputs.length) n = Math.min(n, pb.inputs[pb.i].t - S0.t);
        if (n < 1) return s;
        feedR(E.advance(S0, { type: 'step', ticks: n }));
      } else {
        s.acc += dt * num(cfg.speed, 1);
        if (s.acc < 380) return s;
        s.acc = 0;
        if (pb && pb.i < pb.inputs.length && S0.t >= pb.inputs[pb.i].t) return s;
        feedR(E.advance(S0, { type: 'step', ticks: 1 }));
      }
      return s;
    };
    function end() {
      s.ended = true;
      var r = s.S.result;
      s.end = { outcome: r.outcome, ticks: r.ticks, turns: r.turns, rngCalls: r.rngCalls };
      if (s.playback && s.playback.expect) { var x = s.playback.expect; s.match = x.outcome === r.outcome && x.ticks === r.ticks && x.turns === r.turns && (x.rngCalls == null || x.rngCalls === r.rngCalls); }
      s.code = B.encodeCode({ v: 1, troopId: troopId, party: party, seed: seed, inputs: s.inputs.slice(), weatherId: weatherId, opts: opts, end: s.end });
    }
    // Runs the whole battle headless at a fixed frame time (tests and the self test). Auto plays the party.
    s.runOut = function (frameMs, cap) { var g = 0; while (!s.ended && g++ < (cap || 200000)) s.step(frameMs || 16); return s; };
    return s;
  };

  // Load the saved engine on boot, quietly. A failure only means the Battle view offers to load it again.
  if (typeof document !== 'undefined' && document.readyState) setTimeout(function () { B.restore('blob'); }, 0);
})();
// === ART:BATTLE END ===
