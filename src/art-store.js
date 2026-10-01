// === ART:STORE BEGIN ===
(function () {
  'use strict';
  // Art namespace storage, record envelope, prefix registration, and the size meter model. Everything here sits on top of
  // the verbatim KIT:CORE fence and changes nothing inside it: new prefixes go into Kit.codex.PREFIXES (the same object
  // KIT:CORE reads), art types go through Kit.codex.register, and art records live at bundle.art.records[prefix][id],
  // the same keyed map shape KIT:CORE uses for rules (rules['chr_'][id]).
  var U = Kit.util;
  var ART = window.ART = {};
  ART.VERSION = '1.0.0';
  ART.FORGE = 147;

  // ---------------------------------------------------------------- prefixes
  // Six prefixes were reserved by Day 146 (forge 147, namespace art). Eight are new. The plan's fx_ is renamed efx_
  // because KIT:CORE's ID_RE needs exactly three letters before the underscore; an fx_ ID is invalid and never indexed.
  ART.RESERVED = ['spr_', 'por_', 'anm_', 'sfx_', 'ico_', 'mus_'];
  ART.NEW = ['til_', 'pal_', 'bgd_', 'uik_', 'efx_', 'wov_', 'ins_', 'prt_'];
  ART.PREFIXES = ART.RESERVED.concat(ART.NEW);
  ART.TYPES = {
    'spr_': { name: 'ArtSprite', label: 'Sprite' }, 'por_': { name: 'ArtPortrait', label: 'Portrait' },
    'anm_': { name: 'ArtAnimation', label: 'Animation' }, 'sfx_': { name: 'ArtSound', label: 'Sound effect' },
    'ico_': { name: 'ArtIcon', label: 'Icon' }, 'mus_': { name: 'ArtMusic', label: 'Music' },
    'til_': { name: 'ArtTileset', label: 'Tileset' }, 'pal_': { name: 'ArtPalette', label: 'Palette' },
    'bgd_': { name: 'ArtBackground', label: 'Battle background' }, 'uik_': { name: 'ArtUiKit', label: 'UI kit part' },
    'efx_': { name: 'ArtEffect', label: 'Element effect' }, 'wov_': { name: 'ArtWeather', label: 'Weather overlay' },
    'ins_': { name: 'ArtInstrument', label: 'Instrument' }, 'prt_': { name: 'ArtPart', label: 'Sprite part' }
  };
  ART.SUBJECT_KINDS = ['chr', 'fam', 'sta', 'wth', 'abl', 'itm', 'eqp', 'mat', 'element', 'role'];
  ART.ORIGINS = ['default', 'procedural', 'user', 'claude'];
  // The eight forward fields Day 146 reserved for this forge (Phase 7 fills them; nothing else outside art is written).
  ART.FORWARD_FIELDS = [
    { prefix: 'chr_', field: 'portrait', target: 'por_' }, { prefix: 'chr_', field: 'leitmotif', target: 'mus_' },
    { prefix: 'abl_', field: 'animation', target: 'anm_' }, { prefix: 'abl_', field: 'sfx', target: 'sfx_' },
    { prefix: 'abl_', field: 'icon', target: 'ico_' }, { prefix: 'itm_', field: 'icon', target: 'ico_' },
    { prefix: 'eqp_', field: 'icon', target: 'ico_' }, { prefix: 'fam_', field: 'sprite', target: 'spr_' }
  ];

  var ENVELOPE_FIELDS = [
    { key: 'subject', label: 'Subject', type: 'object', of: [
      { key: 'kind', label: 'Kind', type: 'enum', values: ART.SUBJECT_KINDS },
      { key: 'ref', label: 'Reference', type: 'text', max: 120, help: 'A record ID, an element key, or a role key such as npc:merchant.' }
    ] },
    { key: 'origin', label: 'Origin', type: 'enum', values: ART.ORIGINS },
    { key: 'seed', label: 'Seed', type: 'int', min: 0, max: 4294967295 },
    { key: 'tags', label: 'Tags', type: 'list', of: { type: 'text', max: 40 }, itemLabel: 'Tag' }
  ];
  ART.PREFIXES.forEach(function (p) {
    Kit.codex.PREFIXES[p] = { prefix: p, ns: 'art', forge: ART.FORGE, module: 'art' };
    var t = ART.TYPES[p];
    Kit.codex.register({ name: t.name, prefix: p, label: t.label, ns: 'art', forge: ART.FORGE, group: 'art', dependsOn: [], fields: U.clone(ENVELOPE_FIELDS) });
  });
  ART.typeName = function (prefix) { var t = ART.TYPES[Kit.codex.normPrefix(prefix)]; return t ? t.name : null; };

  // ---------------------------------------------------------------- defaults that are data, not records
  ART.POSES = {
    field: ['stand.down', 'stepA.down', 'stepB.down', 'stand.up', 'stepA.up', 'stepB.up', 'stand.right', 'stepA.right', 'stepB.right', 'stand.left', 'stepA.left', 'stepB.left'],
    emote: ['nod', 'shake', 'jump', 'sit', 'kneel', 'faint', 'laugh'],
    battleParty: ['idle', 'ready', 'step', 'attack', 'cast', 'item', 'hurt', 'kneel', 'ko', 'revive', 'victory', 'limit'],
    battleEnemy: ['idle', 'attack', 'hurt', 'death']
  };
  ART.STATIC_ROLES = [
    { key: 'title', label: 'Title' }, { key: 'town', label: 'Town' }, { key: 'dungeon', label: 'Dungeon' },
    { key: 'battle', label: 'Battle' }, { key: 'boss', label: 'Boss' }, { key: 'victory', label: 'Victory' },
    { key: 'defeat', label: 'Defeat' }, { key: 'ending', label: 'Ending' }
  ];
  function skeleton() {
    var tax = {};
    Object.keys(ART.POSES).forEach(function (g) { tax[g] = ART.POSES[g].map(function (k) { return { key: k, label: k, required: true }; }); });
    return {
      version: ART.VERSION,
      settings: { baseSize: 16, pacing: 'wait', lookaheadMs: { desktop: 100, mobile: 175 } },
      poseTaxonomy: tax,
      musicRoles: ART.STATIC_ROLES.map(function (r) { return { key: r.key, label: r.label, kind: 'static' }; }),
      priority: [],
      tileAnimTypes: {},
      records: {}
    };
  }

  // Fills a missing art namespace without ever overwriting what is there. Returns true when it changed the bundle.
  ART.ensure = function (b) {
    b = b || Kit.bundle.current();
    if (!b) return false;
    var changed = false;
    if (!U.isObj(b.art)) { b.art = {}; changed = true; }
    var sk = skeleton();
    Object.keys(sk).forEach(function (k) { if (b.art[k] === undefined) { b.art[k] = sk[k]; changed = true; } });
    if (!U.isObj(b.art.records)) { b.art.records = {}; changed = true; }
    return changed;
  };
  ART.isEmpty = function (b) {
    b = b || Kit.bundle.current();
    var r = b && b.art && U.isObj(b.art.records) ? b.art.records : {};
    return !Object.keys(r).some(function (p) { return U.isObj(r[p]) && Object.keys(r[p]).length; });
  };

  // Generated music roles: field:<slug> per unique continent label (or field:default), ending:<n> per Charter ending.
  // When the Charter names endings, ending:<n> replaces the static ending role as the required one.
  ART.musicRoles = function (b) {
    b = b || Kit.bundle.current();
    var S = (b && b.charter && b.charter.sections) || {};
    var chs = Array.isArray(S.chapters) ? S.chapters : [];
    var ends = S.endings && Array.isArray(S.endings.endings) ? S.endings.endings.filter(U.isObj) : [];
    var user = b && b.art && Array.isArray(b.art.musicRoles) ? b.art.musicRoles.filter(function (r) { return U.isObj(r) && r.kind === 'user'; }) : [];
    var out = ART.STATIC_ROLES.map(function (r) { return { key: r.key, label: r.label, kind: 'static', required: !(r.key === 'ending' && ends.length) }; });
    var seen = {}, fields = [];
    chs.forEach(function (c) {
      var l = U.isObj(c) && typeof c.continentLabel === 'string' ? c.continentLabel.trim() : '';
      var s = U.slug(l);
      if (l && s && !seen[s]) { seen[s] = 1; fields.push({ key: 'field:' + s, label: 'Field: ' + l, kind: 'generated', required: true }); }
    });
    if (!fields.length) fields.push({ key: 'field:default', label: 'Field', kind: 'generated', required: true });
    ends.forEach(function (e, i) { fields.push({ key: 'ending:' + (i + 1), label: 'Ending: ' + (e.name || i + 1), kind: 'generated', required: true }); });
    return out.concat(fields, user.map(function (r) { return { key: r.key, label: r.label || r.key, kind: 'user', required: false }; }));
  };

  // ---------------------------------------------------------------- records
  function store(b) { ART.ensure(b); return b.art.records; }
  ART.records = {
    list: function (prefix, b) {
      b = b || Kit.bundle.current();
      var m = store(b)[Kit.codex.normPrefix(prefix)];
      return U.isObj(m) ? Object.keys(m).map(function (k) { return m[k]; }).filter(U.isObj) : [];
    },
    get: function (id, b) {
      b = b || Kit.bundle.current();
      var m = store(b)[Kit.ids.prefixOf(id)];
      return U.isObj(m) && U.isObj(m[id]) ? m[id] : null;
    },
    put: function (rec, b) {
      b = b || Kit.bundle.current();
      var p = Kit.ids.prefixOf(rec && rec.id);
      if (!p || ART.PREFIXES.indexOf(p) < 0) throw new Error('ART.records.put stores art records only (' + ART.PREFIXES.join(' ') + ').');
      if (!Kit.ids.isValid(rec.id)) throw new Error('Invalid art ID ' + rec.id + '.');
      var r = store(b);
      r[p] = r[p] || {};
      r[p][rec.id] = rec;
      // Kit.index covers the current bundle only. Writes to another bundle, or inside a Quick Build batch, skip the
      // invalidation (the batch invalidates once at the end); Kit.ids.mint still never repeats an ID within a session.
      if (b === Kit.bundle.current() && !ART.batching) Kit.index.invalidate();
      return rec;
    },
    del: function (id, b) {
      b = b || Kit.bundle.current();
      var p = Kit.ids.prefixOf(id), r = store(b);
      if (!r[p] || !r[p][id]) return false;
      delete r[p][id];
      if (!Object.keys(r[p]).length) delete r[p];
      Kit.index.invalidate();
      return true;
    }
  };
  // The shared envelope every art record carries. IDs come from Kit.ids.mint, never from Claude.
  ART.envelope = function (prefix, name, subject, origin, seed, body) {
    var p = Kit.codex.normPrefix(prefix);
    if (ART.PREFIXES.indexOf(p) < 0) throw new Error('Not an art prefix: ' + prefix);
    var rec = {
      id: Kit.ids.mint(p, name), name: String(name || p), notes: '', tags: [],
      subject: U.isObj(subject) ? { kind: subject.kind, ref: subject.ref } : null,
      origin: ART.ORIGINS.indexOf(origin) >= 0 ? origin : 'user',
      seed: (Number(seed) >>> 0) || ((Math.random() * 4294967295) >>> 0)
    };
    if (U.isObj(body)) Object.keys(body).forEach(function (k) { if (rec[k] === undefined || k === 'notes' || k === 'tags') rec[k] = body[k]; });
    return rec;
  };

  // ---------------------------------------------------------------- codex registration
  // Day 146's WS.codex.generate rebuilds codex.prefixes from its own static table, dropping these entries, so this runs on
  // every load and is never trusted from a stored bundle. type stays null so Day 146 never looks up a type it lacks.
  ART.registerCodex = function (b) {
    b = b || Kit.bundle.current();
    if (!b) return false;
    if (!U.isObj(b.codex)) b.codex = {};
    if (!U.isObj(b.codex.prefixes)) b.codex.prefixes = {};
    var changed = false;
    ART.PREFIXES.forEach(function (p) {
      var want = { type: null, ns: 'art', forge: ART.FORGE, module: 'art', active: true, label: ART.TYPES[p].label };
      if (U.canonical(b.codex.prefixes[p]) !== U.canonical(want)) { b.codex.prefixes[p] = want; changed = true; }
    });
    return changed;
  };

  // ---------------------------------------------------------------- forward fields and the open policy
  // Day 146 treats a forward ID as FORWARD while 'art' is absent from kit.opened and as BROKEN once it is present but the
  // record is missing (round trip C2 and C3). So this forge never opens art while drafting; it opens art only on a Final
  // export whose forward fields all resolve, which keeps Day 146 Final exports possible at every stage.
  ART.forwardRefs = function (b) {
    b = b || Kit.bundle.current();
    var out = [];
    ART.FORWARD_FIELDS.forEach(function (f) {
      var m = b && b.rules && U.isObj(b.rules[f.prefix]) ? b.rules[f.prefix] : {};
      Object.keys(m).forEach(function (id) {
        var v = U.isObj(m[id]) ? m[id][f.field] : null;
        if (!v) return;
        out.push({ recordId: id, field: f.field, id: v, ok: !!ART.records.get(v, b) && Kit.ids.prefixOf(v) === f.target });
      });
    });
    return out;
  };
  ART.canOpen = function (b) { return ART.forwardRefs(b).every(function (r) { return r.ok; }); };

  // ---------------------------------------------------------------- size meter model
  ART.LIMIT = 4.5e6;
  ART.AMBER = 1.5e6;
  ART.size = function (b) {
    b = b || Kit.bundle.current();
    if (!b) return { total: 0, ns: {}, top: [], level: 'ok', room: ART.LIMIT };
    var ns = {};
    Object.keys(b).forEach(function (k) { ns[k] = JSON.stringify(b[k] === undefined ? null : b[k]).length; });
    var total = JSON.stringify(b).length, top = [];
    var r = b.art && U.isObj(b.art.records) ? b.art.records : {};
    Object.keys(r).forEach(function (p) {
      Object.keys(r[p] || {}).forEach(function (id) { top.push({ id: id, name: (r[p][id] && r[p][id].name) || id, size: JSON.stringify(r[p][id]).length }); });
    });
    top.sort(function (x, y) { return y.size - x.size; });
    // Room under the 4.5 MB budget after everything else this origin keeps in localStorage (other drafts, slots).
    // A draft that has moved to IndexedDB is no longer squeezed by localStorage, so its room is the full budget.
    var draft = 0, where = ART.storage.where('kit:draft');
    try { draft = (localStorage.getItem('art147:draft') || '').length; } catch (e) {}
    var other = where === 'idb' ? 0 : Math.max(0, Kit.store.usage() - draft);
    var room = Math.max(0, ART.LIMIT - other);
    var level = total >= room * 0.9 ? 'red' : total >= ART.AMBER ? 'amber' : 'ok';
    return { total: total, ns: ns, top: top.slice(0, 25), other: other, room: room, level: level, where: where };
  };

  // ---------------------------------------------------------------- storage (decision of 2026-10-01, before Phase 2)
  // Every AppADay app shares one origin and one localStorage quota, and Day 146 uses the same kit: keys. This forge keeps
  // its draft, slots, suspend record, and UI state under its own art147: keys, so a Day 146 tab can never overwrite a Day
  // 147 draft. The API key setting (kit:settings) stays shared on purpose. KIT:CORE reads and writes only through the
  // public Kit.store methods, so wrapping them remaps every key without touching the fence.
  // When localStorage refuses a write for a remapped key, the value goes to IndexedDB instead, a tiny marker in
  // localStorage records where it lives, and an in-memory mirror keeps Kit.store.get synchronous. The banner prompting an
  // export appears only when IndexedDB also refuses (or does not exist). APP:BOOT awaits ART.storage.ready() first.
  var KEYMAP = { 'kit:draft': 'art147:draft', 'kit:slots': 'art147:slots', 'kit:suspend': 'art147:suspend', 'kit:ui': 'art147:ui' };
  var WHERE = 'art147:where:', IDB_NAME = 'appaday-147', IDB_STORE = 'kv';
  var raw = { get: Kit.store.get, set: Kit.store.set, del: Kit.store.del };
  var mem = {}, idbKeys = {}, dbp = null;
  function hasIdb() { try { return typeof indexedDB !== 'undefined' && !!indexedDB; } catch (e) { return false; } }
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      var rq = indexedDB.open(IDB_NAME, 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore(IDB_STORE); };
      rq.onsuccess = function () { resolve(rq.result); };
      rq.onerror = function () { reject(rq.error); };
    });
    dbp.catch(function () { dbp = null; });
    return dbp;
  }
  function idb(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx = d.transaction(IDB_STORE, mode), st = tx.objectStore(IDB_STORE), out;
        var rq = fn(st);
        if (rq) rq.onsuccess = function () { out = rq.result; };
        tx.oncomplete = function () { resolve(out); };
        tx.onerror = tx.onabort = function () { reject(tx.error); };
      });
    });
  }
  function lsSet(k, s) { try { localStorage.setItem(k, s); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  ART.storage = {
    KEYMAP: KEYMAP,
    // Where a remapped key lives right now: 'local', 'idb', or 'none'.
    where: function (key) { var k = KEYMAP[key] || key; if (idbKeys[k]) return 'idb'; try { return localStorage.getItem(k) != null ? 'local' : 'none'; } catch (e) { return 'none'; } },
    hasIdb: hasIdb,
    // Loads every key whose marker says IndexedDB into the mirror. Always resolves.
    ready: function () {
      var ks = [];
      try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(WHERE) === 0) ks.push(k.slice(WHERE.length)); } } catch (e) {}
      if (!ks.length) return Promise.resolve();
      if (!hasIdb()) { ks.forEach(function (k) { lsDel(WHERE + k); }); return Promise.resolve(); }
      return Promise.all(ks.map(function (k) {
        return idb('readonly', function (st) { return st.get(k); }).then(function (v) {
          if (typeof v === 'string') { mem[k] = v; idbKeys[k] = 1; } else lsDel(WHERE + k);
        }, function () {});
      })).then(function () {});
    },
    // The draft Day 146 left in this browser, if any (read only; this forge never writes kit:draft).
    day146Draft: function () { return raw.get.call(Kit.store, 'kit:draft', null); }
  };
  Kit.store.get = function (key, fallback) {
    var k = KEYMAP[key];
    if (!k) return raw.get.apply(Kit.store, arguments);
    if (idbKeys[k]) { try { return JSON.parse(mem[k]); } catch (e) { return fallback; } }
    return raw.get.call(Kit.store, k, fallback);
  };
  Kit.store.del = function (key) {
    var k = KEYMAP[key];
    if (!k) return raw.del.apply(Kit.store, arguments);
    if (idbKeys[k]) { delete idbKeys[k]; delete mem[k]; lsDel(WHERE + k); idb('readwrite', function (st) { return st.delete(k); }).catch(function () {}); }
    return raw.del.call(Kit.store, k);
  };
  Kit.store.set = function (key, value) {
    var k = KEYMAP[key];
    if (!k) return raw.set.apply(Kit.store, arguments);
    var s;
    try { s = JSON.stringify(value); } catch (e) { return false; }
    if (lsSet(k, s)) {
      if (idbKeys[k]) { delete idbKeys[k]; delete mem[k]; lsDel(WHERE + k); idb('readwrite', function (st) { return st.delete(k); }).catch(function () {}); }
      if (key === 'kit:draft') ART.storageFailed(false);
      return true;
    }
    // localStorage refused (quota). Free the stale copy so it is never read back, then fall back to IndexedDB.
    lsDel(k);
    if (!hasIdb() || !lsSet(WHERE + k, '1')) {
      if (key === 'kit:draft') ART.storageFailed(true);
      if (Kit.ui && Kit.ui.toast) Kit.ui.toast('Could not save to browser storage. Export your bundle now to keep your work.', 'error', 8000);
      return false;
    }
    var first = !idbKeys[k];
    mem[k] = s; idbKeys[k] = 1;
    idb('readwrite', function (st) { return st.put(s, k); }).then(function () {
      if (key === 'kit:draft') ART.storageFailed(false);
      if (first && Kit.ui && Kit.ui.toast && key === 'kit:draft') Kit.ui.toast('This draft is now saved in IndexedDB, the browser\'s larger store, because localStorage is full.', 'warn', 7000);
    }, function () {
      delete idbKeys[k]; delete mem[k]; lsDel(WHERE + k);
      if (key === 'kit:draft') ART.storageFailed(true);
    });
    return true;
  };
  // One time adoption: Phase 0 and 1 builds saved this forge's work under the shared kit:draft. When there is no Day 147
  // draft yet and that shared draft already carries art records, it is copied into art147:draft (never moved or deleted).
  (function adopt() {
    try {
      if (localStorage.getItem('art147:draft') != null || localStorage.getItem(WHERE + 'art147:draft') != null) return;
      var d = raw.get.call(Kit.store, 'kit:draft', null);
      if (d && d.art && U.isObj(d.art.records) && Object.keys(d.art.records).length) lsSet('art147:draft', JSON.stringify(d));
    } catch (e) {}
  })();
  ART.storageFailed = function (failed) {
    var el = typeof document !== 'undefined' && document.getElementById('storeBanner');
    if (!el) return;
    el.hidden = !failed;
  };

  // ---------------------------------------------------------------- validation
  Kit.validate.register('art.envelope', function (b, ctx) {
    var r = b.art && U.isObj(b.art.records) ? b.art.records : {};
    Object.keys(r).forEach(function (p) {
      if (ART.PREFIXES.indexOf(p) < 0) { ctx.add({ recordId: 'art', fieldPath: 'records.' + p, message: 'Unknown art prefix ' + p + '. Records here are invisible to every forge.', level: 'error' }); return; }
      Object.keys(r[p] || {}).forEach(function (id) {
        var rec = r[p][id];
        if (!U.isObj(rec) || rec.id !== id) ctx.add({ recordId: id, fieldPath: 'id', message: 'Art record key and id do not match.', level: 'error' });
        else if (Kit.ids.prefixOf(id) !== p) ctx.add({ recordId: id, fieldPath: 'id', message: 'Art record ' + id + ' is filed under ' + p + '.', level: 'error' });
      });
    });
  });
  Kit.jump.register({ test: function (rid) { return rid === 'art'; }, name: function () { return 'Art namespace'; }, go: function () { return Kit.go('start'); } });

  // Keep every loaded bundle shaped for this forge.
  Kit.on('load', function (b) {
    var a = ART.ensure(b), c = ART.registerCodex(b);
    if (a || c) Kit.bundle.touch('art-ensure');
  });
})();
// === ART:STORE END ===
