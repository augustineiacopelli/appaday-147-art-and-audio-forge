// === ART:AI BEGIN ===
(function () {
  'use strict';
  // Claude drafting for every editor. Nothing here is load bearing: Quick Build and the manual editors already make every
  // record, and each AI button only shows a one line Settings hint when no API key is saved.
  //   ART.ai.register(def)           a drafter: {key, button, title, blurb, single, count, maxCount, tier, fields,
  //                                  target(b, t), context(b, T), current(b, T), normalize(o, b, T), check(d, b, T),
  //                                  apply(d, b, T), preview(d, b, T), guide, request, maxTokens(n), pixel}
  //   ART.ai.button(key, t, after)   an AI button for an editor (t is a record ID, null, or a context object)
  //   ART.ai.ask(key, t, after)      the request dialog, then run
  //   ART.ai.run(key, t, opts)       one Claude call (getModel per tier through Kit.claude), normalize, check, review
  // Every prompt carries the Charter summary, the Charter specs, and the rules records the editor is about, and asks for a
  // strict JSON shape {"options": [...]} with no IDs. Claude never names a record: the forge resolves targets itself, and
  // the KIT:CORE review drawer (shared with Day 146) shows each option with its issues and a preview before anything is
  // written. Pixel drafts are checked against the 32 symbol alphabet, the row count, and the row length, repaired once
  // with Claude, and dropped if they still do not fit, so an invalid frame never reaches review.
  var U = Kit.util, el = U.el, esc = U.esc, ER = ENGINE_RENDER, PE = ER.palette, C = ER.color, EC = ER.codec, ES = ER.sprite, EP = ER.portrait;
  var AI = ART.ai = {};
  var DRAFTERS = {};
  function cur() { return Kit.bundle.current(); }
  function rulesList(b, p) { var m = b.rules && U.isObj(b.rules[p]) ? b.rules[p] : {}; return Object.keys(m).map(function (k) { return m[k]; }).filter(U.isObj); }
  function rulesGet(b, id) { var p = Kit.ids.prefixOf(id), m = p && b.rules && U.isObj(b.rules[p]) ? b.rules[p] : null; return m && U.isObj(m[id]) ? m[id] : null; }
  function elements(b) { var r = b.charter && b.charter.ruleset; return r && Array.isArray(r.elements) ? r.elements.filter(function (e) { return U.isObj(e) && e.key; }) : []; }
  function trim(v, n) { v = v == null ? '' : String(v); return v.length > n ? v.slice(0, n) + '...' : v; }
  function hexOf(v) { return C.normHex(v) || null; }
  function num(v, lo, hi, def, isInt) {
    var n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    if (typeof n !== 'number' || !isFinite(n)) n = def;
    n = Math.max(lo, Math.min(hi, n));
    return isInt ? Math.round(n) : Math.round(n * 1000) / 1000;
  }
  function pick(v, list, def) {
    var s = String(v == null ? '' : v).trim();
    if (list.indexOf(s) >= 0) return s;
    var low = s.toLowerCase();
    for (var i = 0; i < list.length; i++) if (String(list[i]).toLowerCase() === low) return list[i];
    return def;
  }
  function bool(v) { return v === true || v === 'true' || v === 1 || v === 'yes'; }
  function F(key, label, type, extra) { var f = { key: key, label: label, type: type }; if (extra) Object.keys(extra).forEach(function (k) { f[k] = extra[k]; }); return f; }
  function issue(path, message, level) { return { path: path, message: message, level: level || 'error' }; }
  function specs(b) {
    var sp = (b.charter && b.charter.specs) || {}, r = sp.resolution || {};
    return { tileSize: ART.sprites.tileSize(b), paletteSize: ART.palette.size(b), resolution: { w: Number(r.w) || 256, h: Number(r.h) || 224 }, mobileControls: sp.mobileControls || null };
  }
  function kept(r) { return !!(r && (r.origin === 'user' || r.origin === 'claude')); }
  function touch(reason) { Kit.bundle.touch(reason || 'claude'); Kit.refreshValidation(); }
  function entries(b) { return ART.palette.entries(b); }
  function nearest(b, hex) { var e = entries(b); return e.length && hex ? PE.nearest(e, hex) : null; }
  // A short, ID free description of a rules record, for context.
  function brief(rec, keys) {
    var o = { name: rec.name || '' };
    (keys || []).forEach(function (k) {
      var v = rec[k];
      if (v == null || v === '') return;
      if (typeof v === 'string') o[k] = trim(v, 240);
      else if (typeof v === 'number' || typeof v === 'boolean') o[k] = v;
      else if (U.isObj(v)) { var c = {}; Object.keys(v).forEach(function (x) { if (typeof v[x] !== 'object' && !(typeof v[x] === 'string' && Kit.codex.ID_RE.test(v[x]))) c[x] = v[x]; }); o[k] = c; }
    });
    return o;
  }
  function subjectBrief(b, r) {
    var sj = (r && r.subject) || {};
    if (sj.kind === 'chr') { var c = rulesGet(b, sj.ref); return c ? Object.assign({ kind: 'party member' }, brief(c, ['weaponClass', 'statLeanings', 'baseStats', 'bStoryline'])) : { kind: 'party member' }; }
    if (sj.kind === 'fam') { var f = rulesGet(b, sj.ref); return f ? Object.assign({ kind: 'enemy family' }, brief(f, ['type', 'description', 'palette', 'notes'])) : { kind: 'enemy family' }; }
    if (sj.kind === 'role' && sj.ref === 'villain') { var v = b.charter && b.charter.sections && b.charter.sections.villain; return { kind: 'villain', name: ART.sprites.villainName(b), notes: v ? trim(JSON.stringify(v), 500) : '' }; }
    if (sj.kind === 'role' && /^npc:/.test(sj.ref || '')) return { kind: 'NPC archetype', name: sj.ref.slice(4) };
    if (sj.kind === 'element') { var el0 = elements(b).filter(function (e) { return e.key === sj.ref; })[0]; return { kind: 'element', key: sj.ref, label: el0 ? el0.label : sj.ref, color: el0 ? el0.color : null }; }
    if (sj.kind === 'role') return { kind: 'role', role: sj.ref };
    var rr = sj.ref ? rulesGet(b, sj.ref) : null;
    return rr ? Object.assign({ kind: sj.kind }, brief(rr, ['kind', 'element', 'slot', 'weaponClass', 'description', 'targeting', 'power', 'realWorld'])) : { kind: sj.kind || 'record' };
  }
  function swatchStrip(hexes, label) {
    var d = el('div', 'a7-strip a7-ai-strip');
    d.setAttribute('role', 'img');
    d.setAttribute('aria-label', (label || 'Colors') + ': ' + hexes.filter(Boolean).join(', '));
    hexes.forEach(function (h) { var i = document.createElement('i'); if (h) i.style.background = h; else i.className = 'a7-clear'; d.appendChild(i); });
    return d;
  }
  function playButton(label, fn) {
    var b = el('button', 'btn btn-ghost', (ART.audio && ART.audio.icon ? ART.audio.icon('play') : '') + '<span>' + esc(label || 'Play') + '</span>');
    b.type = 'button';
    b.addEventListener('click', function (e) { e.preventDefault(); try { ART.audio.unlock(); fn(); } catch (x) { Kit.ui.toast('Could not play: ' + x.message, 'warn'); } });
    return b;
  }
  // A scratch copy of the art namespace with one record replaced, for previews that run the real composer.
  function scratchCache(b, rec) {
    var art = U.clone(b.art), p = Kit.ids.prefixOf(rec.id);
    art.records[p] = art.records[p] || {};
    art.records[p][rec.id] = rec;
    return ER.createCache(art, { size: ART.sprites.tileSize(b), entries: entries(b), budget: 4e6, makeCanvas: function (w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; } });
  }
  function figs(list) { var d = el('div', 'a7-figs'); list.forEach(function (x) { if (x) d.appendChild(x); }); return d; }
  function fig(f, px, label) { return f ? ART.sprites.canvas(f, ART.sprites.fit(f, px || 72), label) : null; }

  // ---------------------------------------------------------------- registry, checks, and the review hook
  var TYPE_PREFIX = 'ArtDraft_';
  AI.register = function (def) {
    def.typeName = TYPE_PREFIX + def.key.replace(/[^a-z0-9]/gi, '_');
    def.count = def.count || 1;
    def.maxCount = def.maxCount == null ? 3 : def.maxCount;
    def.tier = def.tier || 'sonnet';
    // A runtime only codex type (no prefix, never persisted) so the shared review drawer can validate and edit options.
    Kit.codex.register({ name: def.typeName, prefix: null, label: def.title.replace(/ with Claude$/, ''), ns: 'art', forge: ART.FORGE, group: 'art-draft', section: true, dependsOn: [],
      fields: [F('summary', 'Summary', 'text', { max: 160 })].concat(def.fields) });
    DRAFTERS[def.key] = def;
    return def;
  };
  AI.has = function (key) { return !!DRAFTERS[key]; };
  AI.list = function () { return Object.keys(DRAFTERS); };
  AI.def = function (key) { return DRAFTERS[key] || null; };
  // Kit.validate.record is wrapped once, the same way ART:STORE wraps Kit.store, so the review drawer also shows each
  // drafter's own checks (pixel rows, MML, scale degrees, climate ranges) next to the field checks from the codex type.
  var SESSIONS = {};
  var baseRecord = Kit.validate.record;
  Kit.validate.record = function (typeName, record, opts) {
    var out = baseRecord.apply(this, arguments), s = SESSIONS[typeName];
    if (!s || !U.isObj(record)) return out;
    var extra = [];
    try { extra = s.def.check(record, s.b, s.T) || []; } catch (e) { extra = [issue('', 'Check failed: ' + e.message)]; }
    // A field the drafter already reports is not reported twice by the field type's own check.
    var mine = {};
    extra.forEach(function (it) { if (it.path) mine[it.path] = 1; });
    return extra.map(function (it) { return { recordId: '(draft)', fieldPath: it.path || '', message: it.message, level: it.level || 'error' }; }).concat(out.filter(function (it) { return !mine[it.fieldPath]; }));
  };
  AI.check = function (key, draft, t) {
    var def = DRAFTERS[key], b = cur(), T = def.target(b, t);
    return (def.check(draft, b, T) || []).concat(baseRecord(def.typeName, draft, { draft: true }).map(function (i) { return { path: i.fieldPath, message: i.message, level: i.level }; }));
  };
  function blocking(list) { return list.filter(function (i) { return i.level === 'error' || i.level === 'broken'; }); }

  // ---------------------------------------------------------------- the request dialog and the button
  AI.ask = function (key, t, after, o) {
    var def = DRAFTERS[key];
    o = o || {};
    if (!def) return Promise.resolve(null);
    if (!Kit.ai.hasKey()) { Kit.ui.toast(Kit.ai.NO_KEY, 'warn'); return Promise.resolve(null); }
    var T;
    try { T = def.target(cur(), t); } catch (e) { Kit.ui.toast(e.message, 'warn'); return Promise.resolve(null); }
    return new Promise(function (resolve) {
      var ta, sel;
      Kit.ui.dialog({
        title: def.title, className: 'a7-ai-dlg',
        body: function (body) {
          body.appendChild(el('p', 'muted', esc(typeof def.blurb === 'function' ? def.blurb(cur(), T) : def.blurb)));
          var lab = el('label', 'a7-ai-field'); lab.htmlFor = 'a7AiPrompt';
          lab.innerHTML = '<span>What should Claude aim for? (optional)</span>';
          ta = el('textarea', 'inp'); ta.id = 'a7AiPrompt'; ta.rows = 3; ta.maxLength = 600;
          ta.placeholder = def.placeholder || 'For example: warmer, older, more ornate, or closer to the Charter\'s tone.';
          lab.appendChild(ta); body.appendChild(lab);
          if (def.maxCount > 1) {
            var row = el('label', 'a7-ai-field a7-ai-count'); row.htmlFor = 'a7AiCount';
            row.innerHTML = '<span>Options</span>';
            sel = el('select', 'inp'); sel.id = 'a7AiCount';
            for (var n = 1; n <= def.maxCount; n++) sel.appendChild(el('option', null, String(n)));
            sel.value = String(def.count);
            row.appendChild(sel); body.appendChild(row);
          }
          body.appendChild(el('p', 'muted a7-small', 'Claude sees the Charter summary and the records this editor is about. Drafts open in review; nothing changes until you accept one.'));
        },
        actions: [{ label: 'Cancel', kind: 'ghost', value: null }, { label: 'Draft', kind: 'primary', icon: 'spark', value: 'go' }],
        onResult: function (v) {
          if (v !== 'go') { resolve(null); return; }
          var opts = { prompt: ta ? ta.value.trim() : '', count: sel ? Number(sel.value) : def.count, after: after };
          Object.keys(o).forEach(function (k) { if (opts[k] === undefined) opts[k] = o[k]; });
          resolve(AI.run(key, t, opts));
        }
      });
    });
  };
  AI.button = function (key, t, after, o) {
    o = o || {};
    var def = DRAFTERS[key];
    if (!def) return el('span');
    var w = Kit.ai.button(o.label || def.button || 'Draft with Claude', function () { AI.ask(key, t, after, o); }, { kind: o.kind || 'ghost' });
    w.classList.add('a7-ai-btn');
    return w;
  };

  // ---------------------------------------------------------------- one Claude call
  var SYSTEM = [
    'You draft art and audio settings for Art and Audio Forge, the art stage of a toolkit for classic 16-bit style turn based RPGs.',
    'Stay consistent with the Charter summary: its setting, tone, canon, and glossary.',
    'Return ONLY JSON of the form {"options":[{...}]} with exactly COUNT option(s) and nothing else.',
    'Each option has "summary" (one short sentence under 90 characters naming what makes it distinct) and the keys listed in "fields".',
    'Never include IDs of any kind, and never invent record references; the forge resolves every record itself.',
    'Use only the allowedValues listed for enum fields. Numbers are plain JSON numbers within min and max. Colors are #rrggbb.',
    'When several options are asked for, make them clearly different from each other.'
  ].join(' ');
  function parseOptions(j) {
    var list = Array.isArray(j) ? j : U.isObj(j) && Array.isArray(j.options) ? j.options : U.isObj(j) && Array.isArray(j.drafts) ? j.drafts : [];
    return list.filter(U.isObj);
  }
  function shape(def, b, T, o) {
    var d = def.normalize(o, b, T) || {}, out = { summary: trim(o.summary || o.name || '', 160) };
    Object.keys(d).forEach(function (k) { if (k !== 'summary') out[k] = d[k]; });
    delete out.id; delete out.charterVersion;
    return out;
  }
  AI.run = async function (key, t, o) {
    o = o || {};
    var def = DRAFTERS[key], b = cur();
    if (!def) throw new Error('Unknown drafter ' + key + '.');
    if (!Kit.ai.hasKey()) { Kit.ui.toast(Kit.ai.NO_KEY, 'warn'); return null; }
    var T;
    try { T = def.target(b, t); } catch (e) { Kit.ui.toast(e.message, 'warn'); return null; }
    var count = def.maxCount === 0 ? (def.countFor ? def.countFor(b, T) : 1) : Math.max(1, Math.min(def.maxCount || 1, o.count || def.count));
    var context = {
      charter: Kit.ai.charterSummary(b),
      specs: specs(b),
      editor: def.title.replace(/ with Claude$/, ''),
      subject: def.context ? def.context(b, T) : null,
      current: def.current ? def.current(b, T) : null,
      fields: Kit.ai.describeFields([F('summary', 'Summary', 'text', { max: 90 })].concat(def.fields), b)
    };
    var system = SYSTEM.replace('COUNT', String(count)) + (def.guide ? ' ' + (typeof def.guide === 'function' ? def.guide(b, T) : def.guide) : '');
    var user = 'Context:\n' + JSON.stringify(context) + '\n\nRequest: ' + (o.prompt || (typeof def.request === 'function' ? def.request(b, T, count) : def.request) || ('Draft ' + count + ' option' + (count > 1 ? 's' : '') + '.'));
    var messages = [{ role: 'user', content: user }], maxTokens = def.maxTokens ? def.maxTokens(count, T) : Math.min(8000, 700 + 600 * count);
    var out, drafts, dropped = 0;
    Kit.ui.busy.show(def.busy || 'Drafting with Claude...');
    try {
      out = await Kit.claude({ tier: def.tier, system: system, messages: messages, maxTokens: maxTokens, expectJson: true });
      drafts = parseOptions(out.json).map(function (x) { return shape(def, b, T, x); });
      // Pixel drafts get one repair round, then anything that still does not fit is dropped before review.
      if (def.pixel) {
        var bad = drafts.map(function (d, i) { var e = blocking(def.check(d, b, T)); return e.length ? 'Option ' + (i + 1) + ': ' + e.slice(0, 4).map(function (x) { return x.message; }).join(' ') : null; }).filter(Boolean);
        if (bad.length || !drafts.length) {
          var fix = (drafts.length ? bad.join('\n') : 'No options were found.') + '\nReply again with the complete JSON {"options":[...]}, every option corrected: exactly ' + T.h + ' rows, each exactly ' + T.w + ' characters from the alphabet ' + EC.ALPHABET.slice(0, T.maxIndex + 1) + '.';
          var out2 = await Kit.claude({ tier: def.tier, system: system, messages: messages.concat([{ role: 'assistant', content: out.text }, { role: 'user', content: fix }]), maxTokens: maxTokens, expectJson: true });
          drafts = parseOptions(out2.json).map(function (x) { return shape(def, b, T, x); });
        }
        var n0 = drafts.length;
        drafts = drafts.filter(function (d) { return !blocking(def.check(d, b, T)).length; });
        dropped = n0 - drafts.length;
      }
    } catch (e) {
      console.warn('[ART.ai]', key, e);
      return null;
    } finally { Kit.ui.busy.hide(); }
    if (dropped) Kit.ui.toast(dropped + ' pixel draft' + (dropped === 1 ? '' : 's') + ' did not fit ' + T.w + ' by ' + T.h + ' and ' + (dropped === 1 ? 'was' : 'were') + ' dropped.', 'warn', 6000);
    if (!drafts.length) { Kit.ui.toast('Claude returned no usable drafts.', 'warn'); return { drafts: [], review: null, model: out && out.model }; }
    SESSIONS[def.typeName] = { def: def, b: b, T: T };
    var review = null, applied = false;
    function accept(rec) {
      // A single target takes one option: Accept All Valid applies only the first.
      if (def.single && applied) return;
      var errs = blocking(def.check(rec, b, T));
      if (errs.length) throw new Error(errs[0].message);
      var res = def.apply(rec, b, T) || {};
      applied = true;
      touch('claude-' + key);
      Kit.ui.toast(res.message || 'Draft applied.', 'ok');
      if (o.after) { try { o.after(res); } catch (e) { console.warn(e); } }
      // One option per single target review: close it now (the review drawer repaints its detached body harmlessly).
      if (def.single && review) review.drawer.close();
    }
    review = Kit.review.open(drafts, def.typeName, accept, { section: true, note: def.reviewNote || (def.single ? 'Accepting an option applies it and closes review. Edit an option first to adjust it.' : 'Accept the options you want; each one is applied on its own.') });
    if (review) decorate(review, def, b, T);
    return { drafts: drafts, review: review, model: out && out.model };
  };

  // Previews: the review drawer repaints its cards on every change, so an observer adds a preview under each card's title.
  function decorate(review, def, b, T) {
    if (!def.preview || typeof MutationObserver === 'undefined') return;
    var body = review.drawer.body;
    function paintOne(card, p) {
      var holder = card.querySelector('.a7-ai-prev');
      if (!holder) { holder = el('div', 'a7-ai-prev'); card.insertBefore(holder, card.children[1] || null); }
      U.clear(holder);
      var node = null;
      try { node = def.preview(def.normalize(p.draft, b, T, true) || p.draft, b, T); } catch (e) { node = el('span', 'muted a7-small', 'No preview: ' + esc(e.message)); }
      if (node) holder.appendChild(node);
    }
    function run() {
      var cards = body.querySelectorAll('.review-card');
      Array.prototype.forEach.call(cards, function (card, i) {
        if (card.a7Ai) return;
        var p = review.pending[i];
        if (!p) return;
        card.a7Ai = true;
        paintOne(card, p);
        var soon = U.debounce(function () { paintOne(card, p); }, 200);
        card.addEventListener('input', soon); card.addEventListener('change', soon);
      });
    }
    var mo = new MutationObserver(run);
    mo.observe(body, { childList: true });
    run();
  }

  // ================================================================ drafters
  var LAYERS = ['body', 'head', 'hair', 'torso', 'legs', 'back', 'front'];
  function libStyles(layer) { return ES.LIBRARY.filter(function (d) { return d.layer === layer && d.rig === 'humanoid'; }).map(function (d) { return d.key.split('.')[1]; }); }
  function needRec(b, id, prefix, what) {
    var r = typeof id === 'string' ? ART.records.get(id, b) : null;
    if (!r || Kit.ids.prefixOf(id) !== prefix) throw new Error('That ' + what + ' no longer exists.');
    return r;
  }

  // ---------------------------------------------------------------- colorway
  var MATS = ['skin', 'hair', 'clothA', 'clothB', 'metal'];
  AI.register({
    key: 'colorway', button: 'Draft colorways', title: 'Draft a colorway with Claude', single: true, count: 3,
    blurb: 'Claude proposes source colors for skin, hair, two cloths, and metal. Each one snaps to the master palette and becomes a ramp, exactly like a seeded colorway.',
    fields: MATS.map(function (m) { return F(m, ART.palette.MAT_LABELS[m], 'color', { required: true }); }).concat([F('accent', 'Accent', 'enum', { values: ['clothB', 'metal'], required: true, help: 'Which material the accent alias points at.' })]),
    target: function (b, t) {
      var r = needRec(b, t, 'pal_', 'palette');
      if (r.kind !== 'local' || (r.layout || 'humanoid') !== 'humanoid') throw new Error('Only character, villain, and NPC colorways can be drafted.');
      return { id: r.id, rec: r };
    },
    context: function (b, T) {
      var others = ART.palette.locals(b).filter(function (x) { return x.id !== T.id && x.source; }).slice(0, 14).map(function (x) { var s = {}; MATS.forEach(function (m) { s[m] = x.source[m]; }); return { name: x.name, colors: s }; });
      var e = entries(b);
      return { who: subjectBrief(b, T.rec), otherColorways: others, masterPalette: e.length <= 64 ? e : e.filter(function (_, i) { return i % Math.ceil(e.length / 64) === 0; }),
        note: 'Each source color snaps to the nearest master palette color and becomes a three step ramp (metal two steps). Keep this colorway distinct from the others in the party.' };
    },
    current: function (b, T) { var s = T.rec.source || {}, o = {}; MATS.forEach(function (m) { o[m] = s[m] || null; }); o.accent = (T.rec.colorway && T.rec.colorway.accent) || 'clothB'; return o; },
    normalize: function (o) { var d = {}; MATS.forEach(function (m) { d[m] = hexOf(o[m]) || String(o[m] == null ? '' : o[m]); }); d.accent = pick(o.accent, ['clothB', 'metal'], 'clothB'); return d; },
    check: function (d) { return MATS.filter(function (m) { return !hexOf(d[m]); }).map(function (m) { return issue(m, ART.palette.MAT_LABELS[m] + ' must be a #rrggbb color.'); }); },
    apply: function (d, b, T) {
      var r = T.rec, e = entries(b), src = { accent: d.accent };
      MATS.forEach(function (m) { src[m] = hexOf(d[m]); });
      r.source = src; r.colorway = PE.colorway(e, src); r.slots = PE.local(e, r.colorway); r.ramps = U.clone(PE.RAMPS); r.origin = 'claude';
      return { message: 'Colorway applied to ' + r.name + '.' };
    },
    preview: function (d, b) {
      var e = entries(b), src = { accent: d.accent };
      MATS.forEach(function (m) { src[m] = hexOf(d[m]) || '#808080'; });
      var cw = PE.colorway(e, src), slots = PE.local(e, cw);
      return figs([ART.figure ? ART.figure(ART.PREVIEW.DOLL, slots, e, cw.accent, 4) : null, swatchStrip(MATS.map(function (m) { return src[m]; }), 'Source colors')]);
    }
  });

  // ---------------------------------------------------------------- humanoid look
  var LOOK_FIELDS = LAYERS.map(function (l) {
    var vals = libStyles(l);
    if (l === 'hair' && vals.indexOf('none') < 0) vals = vals.concat(['none']);
    if (l === 'back' || l === 'front') vals = ['none'].concat(vals);
    return F(l, l.charAt(0).toUpperCase() + l.slice(1), 'enum', { values: vals, required: true });
  }).concat([
    F('accent', 'Accent', 'enum', { values: ['clothB', 'metal', 'clothA'], required: true }),
    F('height', 'Height in tiles', 'num', { min: 1.25, max: 2, required: true }),
    F('headScale', 'Head size', 'num', { min: 0.8, max: 1.3, required: true })
  ]);
  function lookOf(d) { var look = {}; LAYERS.forEach(function (l) { look[l] = d[l] === 'none' || !d[l] ? null : d[l]; }); return look; }
  function lookRecipe(b, d, spr) {
    var pal = ART.records.get(spr.pal, b), rc = ART.sprites.recipeFromLook(b, lookOf(d), pal), old = spr.recipe || {};
    rc.accent = d.accent; rc.proportions = { height: d.height, headScale: d.headScale };
    if (old.params) rc.params = U.clone(old.params);
    return rc;
  }
  AI.register({
    key: 'look', button: 'Draft a look', title: 'Draft a look with Claude', single: true, count: 3,
    blurb: 'Claude picks parts from the library (build, head, hair, torso, legs, back gear, front gear) and proportions. Parts redraw natively at any tile size.',
    fields: LOOK_FIELDS,
    target: function (b, t) {
      var r = needRec(b, t, 'spr_', 'sprite');
      if (r.kind === 'enemy' || r.shares) throw new Error('This sprite shares its look or is an enemy; open its own sprite instead.');
      return { id: r.id, rec: r };
    },
    context: function (b, T) {
      var party = ART.sprites.sprites(b).filter(function (s) { return s.kind === 'character' && s.mode === 'field' && s.id !== T.id && s.recipe && s.recipe.look; }).map(function (s) { return { name: s.name, look: s.recipe.look }; });
      return { who: subjectBrief(b, T.rec), spriteKind: T.rec.kind, otherLooks: party.slice(0, 10), note: 'Front gear is what the hands carry (bare is an empty hand). Back gear is drawn behind the body. Accent colors trims and details.' };
    },
    current: function (b, T) { var rc = T.rec.recipe || {}, lk = rc.look || {}, o = {}; LAYERS.forEach(function (l) { o[l] = lk[l] || 'none'; }); o.accent = rc.accent || 'clothB'; o.height = (rc.proportions || {}).height || 1.5; o.headScale = (rc.proportions || {}).headScale || 1; return o; },
    normalize: function (o, b, T) {
      var d = {};
      LOOK_FIELDS.forEach(function (f) {
        if (f.type === 'enum') d[f.key] = pick(o[f.key], f.values, f.key === 'back' || f.key === 'front' || f.key === 'hair' ? 'none' : String(o[f.key] || ''));
        else d[f.key] = num(o[f.key], f.min, f.max, f.key === 'height' ? 1.5 : 1);
      });
      return d;
    },
    check: function (d, b) {
      var out = [];
      LAYERS.forEach(function (l) { if (d[l] && d[l] !== 'none' && !ART.sprites.partByLib(b, l + '.' + d[l])) out.push(issue(l, 'The ' + l + ' part ' + d[l] + ' is not in this bundle\'s library.', l === 'body' ? 'error' : 'warning')); });
      return out;
    },
    apply: function (d, b, T) {
      T.rec.recipe = lookRecipe(b, d, T.rec); T.rec.origin = 'claude';
      ART.sprites.buildPortraits(b, {});
      return { message: 'Look applied to ' + T.rec.name + '.' };
    },
    preview: function (d, b, T) {
      var copy = U.clone(T.rec); copy.recipe = lookRecipe(b, d, T.rec);
      var k = scratchCache(b, copy);
      return figs([fig(k.sprite(copy.id, 'stand', 'down'), 72, 'Facing down'), fig(k.sprite(copy.id, 'stand', 'right'), 72, 'Facing right'), fig(k.sprite(copy.id, 'stand', 'up'), 72, 'Facing up')]);
    }
  });

  // ---------------------------------------------------------------- enemy body
  function paramRange(dv) { return dv === 0 || dv === 1 ? [0, 1, 1] : dv >= 2 ? [0, Math.max(6, dv * 2), 1] : [0.3, 1.6, 0]; }
  AI.register({
    key: 'enemy', button: 'Draft a body', title: 'Draft an enemy body with Claude', single: true, count: 3,
    blurb: 'Claude picks one of the enemy rigs and sets its parameters (size, limbs, eyes, and the rest). Tier families keep sharing this body in their own palettes.',
    fields: [F('rig', 'Rig', 'enum', { values: ES.RIGS.slice(), required: true }),
      F('params', 'Parameters', 'list', { itemLabel: 'Parameter', max: 16, of: [F('key', 'Name', 'text', { required: true, max: 24 }), F('value', 'Value', 'num', { required: true, min: 0, max: 16 })] })],
    target: function (b, t) {
      var r = needRec(b, t, 'spr_', 'sprite');
      if (r.kind !== 'enemy' || r.shares) throw new Error('Open the base family sprite to draft an enemy body.');
      return { id: r.id, rec: r };
    },
    context: function (b, T) {
      var rigs = {};
      ES.RIGS.forEach(function (k) { var p = ES.RIG_PARAMS[k] || {}, o = {}; Object.keys(p).forEach(function (n) { var r = paramRange(p[n]); o[n] = { default: p[n], min: r[0], max: r[1], whole: !!r[2] }; }); rigs[k] = o; });
      return { family: subjectBrief(b, T.rec), rigs: rigs, note: 'Parameters not listed for the chosen rig are ignored. Toggles are 0 or 1.' };
    },
    current: function (b, T) { var rc = T.rec.recipe || {}, p = (rc.params || {}).body || {}; return { rig: rc.rig, params: Object.keys(p).map(function (k) { return { key: k, value: p[k] }; }) }; },
    normalize: function (o) {
      var rig = pick(o.rig, ES.RIGS, String(o.rig || ''));
      var list = Array.isArray(o.params) ? o.params : U.isObj(o.params) ? Object.keys(o.params).map(function (k) { return { key: k, value: o.params[k] }; }) : [];
      var defs = ES.RIG_PARAMS[rig] || {};
      return { rig: rig, params: list.filter(U.isObj).map(function (x) {
        var k = String(x.key || ''), r = paramRange(defs[k]);
        return { key: k, value: defs[k] === undefined ? Number(x.value) || 0 : num(x.value, r[0], r[1], defs[k], !!r[2]) };
      }) };
    },
    check: function (d) {
      var defs = ES.RIG_PARAMS[d.rig];
      if (!defs) return [issue('rig', 'Unknown rig ' + d.rig + '.')];
      return (d.params || []).filter(function (x) { return defs[x.key] === undefined; }).map(function (x) { return issue('params', x.key + ' is not a ' + d.rig + ' parameter; it will be ignored.', 'warning'); });
    },
    apply: function (d, b, T) {
      var rc = T.rec.recipe = T.rec.recipe || {}, defs = ES.RIG_PARAMS[d.rig] || {}, body = {};
      Object.keys(defs).forEach(function (k) { body[k] = defs[k]; });
      (d.params || []).forEach(function (x) { if (defs[x.key] !== undefined) body[x.key] = x.value; });
      var part = ART.sprites.partByLib(b, 'enemy.' + d.rig);
      rc.rig = d.rig; rc.parts = { body: part ? part.id : (rc.parts || {}).body }; rc.params = { body: body };
      T.rec.origin = 'claude';
      return { message: 'Body applied to ' + T.rec.name + '.' };
    },
    preview: function (d, b, T) {
      var copy = U.clone(T.rec), defs = ES.RIG_PARAMS[d.rig] || {}, body = {};
      Object.keys(defs).forEach(function (k) { body[k] = defs[k]; });
      (d.params || []).forEach(function (x) { if (defs[x.key] !== undefined) body[x.key] = x.value; });
      var part = ART.sprites.partByLib(b, 'enemy.' + d.rig);
      copy.recipe = { rig: d.rig, parts: { body: part ? part.id : null }, params: { body: body } };
      var k = scratchCache(b, copy);
      return figs([fig(k.sprite(copy.id, 'idle', 'right'), 96, 'Idle')]);
    }
  });

  // ---------------------------------------------------------------- portrait
  var EXPR = Object.keys(EP.EXPRESSIONS);
  AI.register({
    key: 'portrait', button: 'Draft a face', title: 'Draft a portrait with Claude', single: true, count: 3,
    blurb: 'Claude sets the face recipe (head, hair, collar, mouth) and how each of the six expressions moves the brows and eyes.',
    fields: [F('head', 'Head', 'enum', { values: libStyles('head'), required: true }), F('hair', 'Hair', 'enum', { values: libStyles('hair'), required: true }),
      F('collar', 'Collar', 'enum', { values: ['cloth', 'plate'], required: true }), F('mouth', 'Mouth width', 'num', { min: 0.6, max: 1.5, required: true }),
      F('expressions', 'Expressions', 'object', { of: EXPR.map(function (x) { return F(x, x.charAt(0).toUpperCase() + x.slice(1), 'object', { of: [F('brow', 'Brow', 'num', { min: -2, max: 2 }), F('eye', 'Eyes', 'num', { min: 0.3, max: 1.6 })] }); }) })],
    target: function (b, t) { var r = needRec(b, t, 'por_', 'portrait'); return { id: r.id, rec: r }; },
    context: function (b, T) { return { who: subjectBrief(b, T.rec), note: 'Brow runs -2 (raised) to 2 (lowered); eyes 0.3 (narrow) to 1.6 (wide).', defaults: EP.EXPRESSIONS }; },
    current: function (b, T) { var rc = T.rec.recipe || {}, ex = {}; EXPR.forEach(function (x) { var e = Object.assign({}, EP.EXPRESSIONS[x], (T.rec.expressions || {})[x] || {}); ex[x] = { brow: e.brow, eye: e.eye }; }); return { head: rc.head, hair: rc.hair, collar: rc.collar, mouth: rc.mouth || 1, expressions: ex }; },
    normalize: function (o) {
      var ex = {}, src = U.isObj(o.expressions) ? o.expressions : {};
      EXPR.forEach(function (x) { var e = U.isObj(src[x]) ? src[x] : {}; ex[x] = { brow: num(e.brow, -2, 2, EP.EXPRESSIONS[x].brow), eye: num(e.eye, 0.3, 1.6, EP.EXPRESSIONS[x].eye) }; });
      return { head: pick(o.head, libStyles('head'), 'round'), hair: pick(o.hair, libStyles('hair'), 'short'), collar: pick(o.collar, ['cloth', 'plate'], 'cloth'), mouth: num(o.mouth, 0.6, 1.5, 1), expressions: ex };
    },
    check: function () { return []; },
    apply: function (d, b, T) {
      var r = T.rec, rc = r.recipe = r.recipe || {};
      rc.head = d.head; rc.hair = d.hair; rc.collar = d.collar; rc.mouth = d.mouth;
      r.expressions = r.expressions || {};
      EXPR.forEach(function (x) { r.expressions[x] = Object.assign({}, r.expressions[x] || {}, d.expressions[x]); });
      r.origin = 'claude';
      return { message: 'Face applied to ' + r.name + '.' };
    },
    preview: function (d, b, T) {
      var copy = U.clone(T.rec);
      Object.assign(copy.recipe = copy.recipe || {}, { head: d.head, hair: d.hair, collar: d.collar, mouth: d.mouth });
      copy.expressions = copy.expressions || {};
      EXPR.forEach(function (x) { copy.expressions[x] = Object.assign({}, copy.expressions[x] || {}, d.expressions[x]); });
      var k = scratchCache(b, copy);
      return figs(['neutral', 'happy', 'angry', 'sad'].map(function (x) { return fig(k.portrait(copy.id, x), 64, x); }));
    }
  });

  // ---------------------------------------------------------------- icons
  var EI = ER.icon;
  function glyphs() { return EI.GLYPHS.concat(EI.STATUS_SHAPES.map(function (s) { return 'status.' + s; })); }
  function tintOk(b, t) { return !!hexOf(t) || elements(b).some(function (e) { return e.key === t; }); }
  function iconBrief(b, ico) { return subjectBrief(b, ico); }
  var ICON_FIELDS = [F('glyph', 'Glyph', 'enum', { values: glyphs(), required: true }), F('tint', 'Tint', 'text', { required: true, max: 30, help: 'An element key from the Charter, or a #rrggbb color.' })];
  function iconCheck(d, b) { var out = []; if (glyphs().indexOf(d.glyph) < 0) out.push(issue('glyph', 'Unknown glyph ' + d.glyph + '.')); if (!tintOk(b, d.tint)) out.push(issue('tint', 'Tint must be a Charter element key or a #rrggbb color.')); return out; }
  function iconApply(b, ico, d) { ico.gen = { glyph: d.glyph, tint: hexOf(d.tint) || d.tint }; ico.tintRamp = ART.sprites.tintRamp(b, ico.gen.tint) || ico.tintRamp; delete ico.px; ico.origin = 'claude'; }
  function iconPreview(b, ico, d) { var copy = U.clone(ico); copy.gen = { glyph: d.glyph, tint: hexOf(d.tint) || d.tint }; copy.tintRamp = ART.sprites.tintRamp(b, copy.gen.tint) || copy.tintRamp; delete copy.px; return fig(scratchCache(b, copy).icon(copy.id), 48, 'Icon'); }
  function iconGuide(b) { return 'Glyphs: blade staff shield helm body ring vial scroll gem seed tool device, or status.<shape> for statuses. Element keys: ' + elements(b).map(function (e) { return e.key; }).join(', ') + '.'; }
  AI.register({
    key: 'icon', button: 'Draft an icon', title: 'Draft an icon with Claude', single: true, count: 3,
    blurb: 'Claude picks a glyph and a tint (an element or a color) for this record. Hand drawn pixels on this icon are replaced when you accept.',
    fields: ICON_FIELDS,
    target: function (b, t) { var r = needRec(b, t, 'ico_', 'icon'); return { id: r.id, rec: r }; },
    context: function (b, T) { return { record: iconBrief(b, T.rec), elements: elements(b).map(function (e) { return { key: e.key, label: e.label, color: e.color }; }) }; },
    current: function (b, T) { return { glyph: T.rec.gen && T.rec.gen.glyph, tint: T.rec.gen && T.rec.gen.tint }; },
    guide: iconGuide,
    normalize: function (o, b) { var t = String(o.tint == null ? '' : o.tint).trim(); return { glyph: pick(o.glyph, glyphs(), String(o.glyph || '')), tint: hexOf(t) || pick(t, elements(b).map(function (e) { return e.key; }), t) }; },
    check: function (d, b) { return iconCheck(d, b); },
    apply: function (d, b, T) { iconApply(b, T.rec, d); return { message: 'Icon applied to ' + T.rec.name + '.' }; },
    preview: function (d, b, T) { return figs([iconPreview(b, T.rec, d)]); }
  });
  var ICON_KINDS = { itm: 'item', eqp: 'equipment', abl: 'ability', sta: 'status', mat: 'materia' };
  function iconTargets(b) { return ART.sprites.icons(b).filter(function (i) { return i.subject && rulesGet(b, i.subject.ref); }).slice(0, 30); }
  function iconByName(b, T, name) { var n = String(name || '').trim().toLowerCase(); return T.list.filter(function (x) { return x.name.toLowerCase() === n; })[0] || null; }
  AI.register({
    key: 'icons', button: 'Draft icons', title: 'Draft icons with Claude', single: false, maxCount: 0,
    blurb: function (b, T) { return 'Claude proposes a glyph and tint for each of the ' + T.list.length + ' icons below (up to 30 at a time). Accept the ones you like.'; },
    fields: [F('for', 'For', 'text', { required: true, max: 80, help: 'The record name, exactly as listed.' })].concat(ICON_FIELDS),
    target: function (b) {
      var list = iconTargets(b).map(function (i) { var rr = rulesGet(b, i.subject.ref); return { ico: i, name: rr.name || rr.id, kind: ICON_KINDS[i.subject.kind] || i.subject.kind }; });
      if (!list.length) throw new Error('There are no icons yet. Run Quick Build first.');
      return { id: null, list: list };
    },
    countFor: function (b, T) { return T.list.length; },
    context: function (b, T) { return { records: T.list.map(function (x) { return Object.assign({ kind: x.kind }, iconBrief(b, x.ico), { name: x.name, glyph: x.ico.gen && x.ico.gen.glyph }); }), elements: elements(b).map(function (e) { return { key: e.key, label: e.label, color: e.color }; }) }; },
    request: function (b, T, n) { return 'Draft one option per listed record (' + n + ' options), in the listed order. Put the record name in "for". Make icons in one category read as a family.'; },
    guide: iconGuide,
    maxTokens: function (n) { return Math.min(8000, 600 + 90 * n); },
    normalize: function (o, b) { var t = String(o.tint == null ? '' : o.tint).trim(); return { 'for': String(o['for'] || o.name || ''), glyph: pick(o.glyph, glyphs(), String(o.glyph || '')), tint: hexOf(t) || pick(t, elements(b).map(function (e) { return e.key; }), t) }; },
    check: function (d, b, T) { var out = iconCheck(d, b); if (!iconByName(b, T, d['for'])) out.unshift(issue('for', '"' + d['for'] + '" is not one of the listed records.')); return out; },
    apply: function (d, b, T) { var x = iconByName(b, T, d['for']); iconApply(b, x.ico, d); return { message: 'Icon applied to ' + x.name + '.' }; },
    preview: function (d, b, T) { var x = iconByName(b, T, d['for']); return x ? figs([iconPreview(b, x.ico, d)]) : null; }
  });

  // ---------------------------------------------------------------- ability animation
  var EA = ER.anim;
  AI.register({
    key: 'ability', button: 'Draft an animation', title: 'Draft an ability animation with Claude', single: true, count: 3,
    blurb: 'Claude sets the caster pose, how the effect travels, the element effect at the target, the impact length, flash, shake, and hit count.',
    fields: [F('caster', 'Caster pose', 'enum', { values: EA.CASTERS.slice(), required: true }), F('travel', 'Travel', 'enum', { values: EA.TRAVELS.slice(), required: true }),
      F('travelMs', 'Travel ms', 'int', { min: 0, max: 2000, required: true }), F('effect', 'Element effect', 'text', { max: 30, help: 'An element key, or none.' }),
      F('impactMs', 'Impact ms', 'int', { min: 100, max: 3000, required: true }), F('flash', 'Screen flash', 'bool'), F('shake', 'Shake', 'int', { min: 0, max: 4 }), F('hits', 'Hits', 'int', { min: 1, max: 16, required: true })],
    target: function (b, t) { var r = needRec(b, t, 'anm_', 'animation'); if (r.kind !== 'ability') throw new Error('Only ability animations can be drafted here.'); return { id: r.id, rec: r }; },
    context: function (b, T) { var a = T.rec.subject && T.rec.subject.kind === 'abl' ? rulesGet(b, T.rec.subject.ref) : null; return { ability: a ? brief(a, ['kind', 'element', 'power', 'targeting', 'description']) : { role: T.rec.subject && T.rec.subject.ref }, elements: elements(b).map(function (e) { return e.key; }), note: 'Hits spread the results across that many impact moments. Melee casters run in and back.' }; },
    current: function (b, T) { var r = T.rec, fx = r.impact && r.impact.fx ? ART.records.get(r.impact.fx, b) : null; return { caster: r.caster, travel: r.travel && r.travel.type, travelMs: r.travel && r.travel.ms, effect: fx && fx.subject ? fx.subject.ref : 'none', impactMs: r.impact && r.impact.ms, flash: !!(r.impact && r.impact.flash), shake: (r.impact && r.impact.shake) || 0, hits: r.hits || 1 }; },
    normalize: function (o, b) { var keys = elements(b).map(function (e) { return e.key; }); return { caster: pick(o.caster, EA.CASTERS, 'attack'), travel: pick(o.travel, EA.TRAVELS, 'none'), travelMs: num(o.travelMs, 0, 2000, 260, true), effect: pick(o.effect, ['none'].concat(keys), 'none'), impactMs: num(o.impactMs, 100, 3000, 420, true), flash: bool(o.flash), shake: num(o.shake, 0, 4, 0, true), hits: num(o.hits, 1, 16, 1, true) }; },
    check: function (d, b) { return d.effect !== 'none' && !ART.bySubject('efx_', 'element', d.effect, b) ? [issue('effect', 'There is no effect for element ' + d.effect + ' yet.', 'warning')] : []; },
    apply: function (d, b, T) {
      var r = T.rec, fx = d.effect !== 'none' ? ART.bySubject('efx_', 'element', d.effect, b) : null;
      r.caster = d.caster; r.travel = { type: d.travel, ms: d.travel === 'none' ? 0 : d.travelMs };
      r.impact = { fx: fx ? fx.id : null, ms: d.impactMs, flash: !!d.flash, shake: d.shake };
      r.hits = d.hits; r.origin = 'claude';
      return { message: 'Animation applied to ' + r.name + '.' };
    },
    preview: function (d) { return el('p', 'muted a7-small', esc(d.caster + ' pose, ' + (d.travel === 'none' ? 'no travel' : d.travel + ' for ' + d.travelMs + ' ms') + ', ' + (d.effect === 'none' ? 'no element effect' : d.effect + ' effect') + ', impact ' + d.impactMs + ' ms, ' + d.hits + ' hit' + (d.hits === 1 ? '' : 's') + (d.flash ? ', flash' : '') + (d.shake ? ', shake ' + d.shake : '') + '.')); }
  });

  // ---------------------------------------------------------------- element effect
  var FX = ER.fx, FX_COLORS = ['dark', 'mid', 'light', 'glow'];
  AI.register({
    key: 'effect', button: 'Draft an effect', title: 'Draft an element effect with Claude', single: true, count: 3,
    blurb: 'Claude sets the particle shape and motion, the screen behavior, and four colors plus flash and tint. Shape and screen keep elements apart even in two color palettes.',
    fields: [F('shape', 'Particle shape', 'enum', { values: FX.SHAPES.slice(), required: true }), F('screen', 'Screen', 'enum', { values: FX.SCREENS.slice(), required: true }),
      F('count', 'Particles', 'int', { min: 1, max: 60, required: true }), F('life', 'Life ms', 'int', { min: 120, max: 2000, required: true }),
      F('gravity', 'Gravity', 'num', { min: -1, max: 1 }), F('spread', 'Spread', 'num', { min: 0.2, max: 2 }), F('speed', 'Speed', 'num', { min: 0.2, max: 3 })]
      .concat(FX_COLORS.map(function (c) { return F(c, c.charAt(0).toUpperCase() + c.slice(1), 'color', { required: true }); }), [F('flash', 'Flash', 'color', { required: true }), F('tint', 'Tint', 'color', { required: true })]),
    target: function (b, t) { var r = needRec(b, t, 'efx_', 'effect'); return { id: r.id, rec: r }; },
    context: function (b, T) { var others = ART.palette.effects(b).filter(function (x) { return x.id !== T.id; }).map(function (x) { return { element: x.subject && x.subject.ref, shape: x.particle && x.particle.shape, screen: x.screen }; }); return { element: subjectBrief(b, T.rec), otherElements: others, note: 'Colors snap to the master palette. Gravity below zero rises.' }; },
    current: function (b, T) { var r = T.rec, e = entries(b), p = r.particle || {}, o = { shape: p.shape, screen: r.screen, count: p.count, life: p.life, gravity: p.gravity, spread: p.spread, speed: p.speed }; FX_COLORS.forEach(function (c, i) { o[c] = e[(r.palette || [])[i]] || null; }); o.flash = e[r.flash] || null; o.tint = e[r.tint] || null; return o; },
    normalize: function (o) { var d = { shape: pick(o.shape, FX.SHAPES, 'spark'), screen: pick(o.screen, FX.SCREENS, 'none'), count: num(o.count, 1, 60, 12, true), life: num(o.life, 120, 2000, 420, true), gravity: num(o.gravity, -1, 1, 0), spread: num(o.spread, 0.2, 2, 1), speed: num(o.speed, 0.2, 3, 1) }; FX_COLORS.concat(['flash', 'tint']).forEach(function (c) { d[c] = hexOf(o[c]) || String(o[c] == null ? '' : o[c]); }); return d; },
    check: function (d) { return FX_COLORS.concat(['flash', 'tint']).filter(function (c) { return !hexOf(d[c]); }).map(function (c) { return issue(c, c + ' must be a #rrggbb color.'); }); },
    apply: function (d, b, T) {
      var r = T.rec;
      r.particle = { shape: d.shape, count: d.count, life: d.life, gravity: d.gravity, spread: d.spread, speed: d.speed };
      r.screen = d.screen; r.palette = FX_COLORS.map(function (c) { return nearest(b, d[c]); }); r.flash = nearest(b, d.flash); r.tint = nearest(b, d.tint);
      r.origin = 'claude';
      return { message: 'Effect applied to ' + r.name + '.' };
    },
    preview: function (d) { return figs([swatchStrip(FX_COLORS.concat(['flash', 'tint']).map(function (c) { return hexOf(d[c]); }), 'Effect colors'), el('span', 'muted a7-small', esc(d.count + ' ' + d.shape + ' particles, ' + d.screen + ' screen'))]); }
  });

  // ---------------------------------------------------------------- weather overlay
  var WT = ER.weather;
  AI.register({
    key: 'weather', button: 'Draft an overlay', title: 'Draft a weather overlay with Claude', single: true, count: 3,
    blurb: 'Claude builds the overlay from up to three particle layers, a screen tint, and optional lightning, from the weather state\'s real world description.',
    fields: [F('layers', 'Layers', 'list', { itemLabel: 'Layer', min: 1, max: 3, of: [F('type', 'Type', 'enum', { values: WT.TYPES.slice(), required: true }), F('density', 'Density', 'num', { min: 0, max: 1 }), F('angle', 'Angle', 'num', { min: -90, max: 90 }), F('speed', 'Speed', 'num', { min: 0, max: 4 }), F('depth', 'Depth', 'num', { min: 0, max: 1 }), F('color', 'Color', 'color')] }),
      F('tint', 'Tint', 'color', { help: 'Empty for no tint.' }), F('tintAlpha', 'Tint strength', 'num', { min: 0, max: 0.8 }),
      F('lightning', 'Lightning', 'bool'), F('lightningMin', 'Lightning every (min ms)', 'int', { min: 500, max: 30000 }), F('lightningMax', 'Lightning every (max ms)', 'int', { min: 500, max: 30000 })],
    target: function (b, t) { var r = needRec(b, t, 'wov_', 'overlay'); return { id: r.id, rec: r }; },
    context: function (b, T) { var w = T.rec.subject && rulesGet(b, T.rec.subject.ref); return { weather: w ? brief(w, ['realWorld', 'description', 'effects']) : null, layerTypes: { streak: 'rain like lines', flake: 'falling flakes', mote: 'drifting specks', band: 'fog or haze bands', bolt: 'a lightning layer', leaf: 'blown leaves', none: 'no particles (clear or tint only)' }, note: 'Angle is degrees from vertical; depth scales particles toward the viewer.' }; },
    current: function (b, T) { var r = T.rec, e = entries(b); return { layers: (r.layers || []).map(function (x) { return { type: x.type, density: x.density, angle: x.angle, speed: x.speed, depth: x.depth, color: x.hex || e[x.m] || null }; }), tint: r.tint ? r.tint.hex || e[r.tint.m] : null, tintAlpha: r.tint ? r.tint.alpha : 0, lightning: !!r.lightning, lightningMin: r.lightning ? r.lightning.every[0] : 3000, lightningMax: r.lightning ? r.lightning.every[1] : 8000 }; },
    normalize: function (o) {
      var ls = (Array.isArray(o.layers) ? o.layers : []).filter(U.isObj).slice(0, 3).map(function (x) { return { type: pick(x.type, WT.TYPES, String(x.type || '')), density: num(x.density, 0, 1, 0.5), angle: num(x.angle, -90, 90, 0), speed: num(x.speed, 0, 4, 1), depth: num(x.depth, 0, 1, 1), color: hexOf(x.color) || '' }; });
      var lo = num(o.lightningMin, 500, 30000, 3000, true), hi = num(o.lightningMax, 500, 30000, 8000, true);
      return { layers: ls, tint: hexOf(o.tint) || '', tintAlpha: num(o.tintAlpha, 0, 0.8, 0.15), lightning: bool(o.lightning), lightningMin: Math.min(lo, hi), lightningMax: Math.max(lo, hi) };
    },
    check: function (d) { var out = []; if (!d.layers.length) out.push(issue('layers', 'An overlay needs at least one layer (type none for clear weather).')); d.layers.forEach(function (x, i) { if (WT.TYPES.indexOf(x.type) < 0) out.push(issue('layers.' + i + '.type', 'Unknown layer type ' + x.type + '.')); }); return out; },
    apply: function (d, b, T) {
      var r = T.rec, look = { keyword: r.keyword || null, generic: false,
        layers: d.layers.map(function (x) { return { type: x.type, density: x.density, angle: x.angle, speed: x.speed, depth: x.depth, hex: x.color || null }; }),
        tint: d.tint ? [d.tint, d.tintAlpha] : null, lightning: d.lightning ? [d.lightningMin, d.lightningMax, 160] : null };
      var body = ART.motion.weatherBody(look, entries(b));
      ['layers', 'tint', 'lightning', 'generic'].forEach(function (k) { r[k] = body[k]; });
      r.origin = 'claude';
      return { message: 'Overlay applied to ' + r.name + '.' };
    },
    preview: function (d) { return figs([swatchStrip(d.layers.map(function (x) { return x.color || null; }).concat([d.tint || null]), 'Overlay colors'), el('span', 'muted a7-small', esc(d.layers.map(function (x) { return x.type; }).join(', ') + (d.lightning ? ', lightning' : '')))]); }
  });

  // ---------------------------------------------------------------- biome tileset (edit one, or invent one)
  var ET = ER.tiles, MATL = ['A', 'B', 'C', 'D', 'E', 'F'];
  var CLIM = [['temp', 'Temperature'], ['moist', 'Moisture'], ['elev', 'Elevation']];
  var BIOME_FIELDS = [F('name', 'Name', 'text', { required: true, max: 40 }), F('style', 'Style', 'enum', { values: Object.keys(ET.STYLES), required: true })]
    .concat([].concat.apply([], CLIM.map(function (c) { return [F(c[0] + 'Lo', c[1] + ' low', 'int', { min: 0, max: 4, required: true }), F(c[0] + 'Hi', c[1] + ' high', 'int', { min: 0, max: 4, required: true })]; })))
    .concat([F('feature', 'Feature', 'text', { max: 30, help: 'Set only for biomes no climate produces (volcanic); Day 148 places them by its own rule.' }),
      F('passable', 'Walkable', 'bool'), F('encounters', 'Encounters', 'bool'), F('swimmable', 'Swimmable', 'bool'), F('damage', 'Damage floor', 'bool'),
      F('anim', 'Animation', 'enum', { values: ['none'].concat(Object.keys(ET.ANIM_TYPES)), required: true })])
    .concat(MATL.map(function (m) { return F(m, 'Material ' + m, 'color', { required: true }); }));
  function animTypes(b) { var reg = b.art && U.isObj(b.art.tileAnimTypes) ? b.art.tileAnimTypes : {}; return Object.keys(Object.assign({}, ET.ANIM_TYPES, reg)); }
  function animFor(b, type) { if (!type || type === 'none') return null; var reg = (b.art.tileAnimTypes || {})[type] || ET.ANIM_TYPES[type]; return reg ? { type: type, technique: reg.technique, params: U.clone(reg.params || {}) } : null; }
  function flagsOf(d) { return (d.passable ? 1 : 0) | (d.encounters ? 2 : 0) | (d.swimmable ? 4 : 0) | (d.damage ? 8 : 0); }
  AI.register({
    key: 'biome', button: 'Draft a biome', title: 'Draft a biome with Claude', single: true, count: 3,
    blurb: function (b, T) { return T.rec ? 'Claude restyles this biome: its name, generator style, climate keys, flags, animation, and six material colors.' : 'Claude invents new biomes for this world: name, generator style, climate keys, flags, animation, and six material colors. Day 148 matches biomes by climate keys, so an invented biome joins world generation on its own.'; },
    fields: BIOME_FIELDS,
    target: function (b, t) {
      if (t == null) return { id: null, rec: null };
      var r = needRec(b, t, 'til_', 'tileset');
      if (r.kind !== 'biome') throw new Error('Only biome tilesets can be drafted here.');
      return { id: r.id, rec: r };
    },
    context: function (b, T) {
      var styles = {};
      Object.keys(ET.STYLES).forEach(function (k) { styles[k] = { label: ET.STYLES[k].label, materials: ET.STYLES[k].mats }; });
      return { editing: T.rec ? T.rec.name : null, existing: ART.tiles.biomes(b).map(function (t) { return { name: t.name, style: t.templates && t.templates.gen && t.templates.gen.style, climate: t.climate, priority: t.priority }; }),
        styles: styles, climateBands: { temp: '0 frigid to 4 hot', moist: '0 arid to 4 saturated', elev: '0 deep water, 1 shore, 2 lowland, 3 upland, 4 alpine' },
        note: 'Materials A to F mean what they mean in the chosen style (see each style\'s default colors). Colors snap to the master palette.' };
    },
    current: function (b, T) {
      if (!T.rec) return null;
      var t = T.rec, c = t.climate || {}, pal = ART.tiles.palFor(b, t), src = (pal && pal.source) || {}, o = { name: t.name, style: t.templates && t.templates.gen && t.templates.gen.style, feature: c.feature || '', passable: !!(t.flags & 1), encounters: !!(t.flags & 2), swimmable: !!(t.flags & 4), damage: !!(t.flags & 8), anim: t.anim ? t.anim.type : 'none' };
      CLIM.forEach(function (k) { o[k[0] + 'Lo'] = (c[k[0]] || [0, 4])[0]; o[k[0] + 'Hi'] = (c[k[0]] || [0, 4])[1]; });
      MATL.forEach(function (m) { o[m] = src[m] || null; });
      return o;
    },
    request: function (b, T, n) { return T.rec ? 'Draft ' + n + ' restyles of this biome.' : 'Invent ' + n + ' biome' + (n > 1 ? 's' : '') + ' this world needs that the existing list lacks.'; },
    normalize: function (o, b) {
      var d = { name: trim(o.name || 'Biome', 40), style: pick(o.style, Object.keys(ET.STYLES), String(o.style || '')), feature: trim(o.feature || '', 30), passable: o.passable == null ? true : bool(o.passable), encounters: o.encounters == null ? true : bool(o.encounters), swimmable: bool(o.swimmable), damage: bool(o.damage), anim: pick(o.anim, ['none'].concat(animTypes(b)), 'none') };
      CLIM.forEach(function (k) { d[k[0] + 'Lo'] = num(o[k[0] + 'Lo'], 0, 4, 0, true); d[k[0] + 'Hi'] = num(o[k[0] + 'Hi'], 0, 4, 4, true); });
      MATL.forEach(function (m) { d[m] = hexOf(o[m]) || String(o[m] == null ? '' : o[m]); });
      return d;
    },
    check: function (d) {
      var out = [];
      if (!ET.STYLES[d.style]) out.push(issue('style', 'Unknown style ' + d.style + '.'));
      CLIM.forEach(function (k) { if (d[k[0] + 'Lo'] > d[k[0] + 'Hi']) out.push(issue(k[0] + 'Lo', k[1] + ' low is above high.')); });
      MATL.forEach(function (m) { if (!hexOf(d[m])) out.push(issue(m, 'Material ' + m + ' must be a #rrggbb color.')); });
      return out;
    },
    apply: function (d, b, T) {
      var TL = ART.tiles, climate = { feature: d.feature ? d.feature : null }, src = {};
      CLIM.forEach(function (k) { climate[k[0]] = [d[k[0] + 'Lo'], d[k[0] + 'Hi']]; });
      MATL.forEach(function (m) { src[m] = hexOf(d[m]); });
      var t = T.rec;
      if (t) {
        t.name = d.name; t.climate = climate; t.flags = flagsOf(d); t.anim = animFor(b, d.anim);
        t.templates = t.templates || {}; t.templates.gen = Object.assign({}, t.templates.gen || {}, { style: d.style });
        MATL.forEach(function (m) { TL.setMaterial(b, t, m, src[m]); });
        t.origin = 'claude';
      } else {
        var key = U.slug(d.name) || 'biome', n = 2, base = key;
        while (ART.bySubject('til_', 'role', 'biome:' + key, b)) key = base + '-' + n++;
        var same = TL.biomes(b).filter(function (x) { return x.templates && x.templates.gen && x.templates.gen.style === d.style; })[0];
        var top = TL.biomes(b).reduce(function (mx, x) { return Math.max(mx, Number(x.priority) || 0); }, 0);
        t = ART.envelope('til_', d.name, { kind: 'role', ref: 'biome:' + key }, 'claude', ER.util.hash32('til|' + key + '|' + Date.now()), {
          kind: 'biome', key: key, climate: climate, priority: same ? (Number(same.priority) || 0) + 0.5 : top + 1,
          templates: { gen: { style: d.style, params: {} } }, fillVariants: ET.STYLES[d.style].variants === false ? [] : [{ weight: 0.3, mode: 'reseed' }, { weight: 0.25, mode: 'reseed' }, { weight: 0.06, mode: 'deco' }],
          flags: flagsOf(d), anim: animFor(b, d.anim), pal: null });
        ART.records.put(t, b);
        TL.ensurePal(b, t, src, {});
        TL.syncPriority(b);
      }
      TL.buildBackgrounds(b, {});
      return { id: t.id, message: (T.rec ? 'Biome updated: ' : 'Biome added: ') + d.name + '.' };
    },
    preview: function (d) { return figs([swatchStrip(MATL.map(function (m) { return hexOf(d[m]); }), 'Materials A to F'), el('span', 'muted a7-small', esc((ET.STYLES[d.style] || {}).label || d.style))]); }
  });

  // ---------------------------------------------------------------- battle background
  var BG = ER.bg, BG_ALL = [].concat.apply([], BG.KINDS.map(function (k) { return BG.STYLES[k]; })).filter(function (s, i, a) { return a.indexOf(s) === i; });
  function bgLayers(b, d, old) {
    return d.layers.map(function (L, i) {
      var prev = (old || []).filter(function (x) { return x.kind === L.kind; })[0], hex = [L.dark, L.mid, L.light].map(hexOf);
      return { kind: L.kind, gen: { style: L.style, seed: prev && prev.gen ? prev.gen.seed : ER.util.hash32('bgd|' + L.kind + '|' + i), hex: hex, colors: hex.map(function (h) { return nearest(b, h) || 0; }) }, parallax: L.parallax, drift: L.drift };
    });
  }
  AI.register({
    key: 'background', button: 'Draft a background', title: 'Draft a battle background with Claude', single: true, count: 3,
    blurb: 'Claude composes the layers (sky, far, mid, near, floor), their styles and three colors each, and how they drift.',
    fields: [F('layers', 'Layers', 'list', { itemLabel: 'Layer', min: 1, max: 5, of: [F('kind', 'Kind', 'enum', { values: BG.KINDS.slice(), required: true }), F('style', 'Style', 'enum', { values: BG_ALL, required: true }),
      F('dark', 'Dark', 'color', { required: true }), F('mid', 'Mid', 'color', { required: true }), F('light', 'Light', 'color', { required: true }), F('parallax', 'Parallax', 'num', { min: 0, max: 1 }), F('drift', 'Drift', 'num', { min: -1, max: 1 })] })],
    target: function (b, t) { var r = needRec(b, t, 'bgd_', 'background'); return { id: r.id, rec: r }; },
    context: function (b, T) { return { place: T.rec.subject && T.rec.subject.ref, stylesByKind: BG.STYLES, note: 'One layer per kind, sky first and floor last. Parallax 0 is fixed, 1 moves with the camera. Drift scrolls clouds or water.' }; },
    current: function (b, T) { var e = entries(b); return { layers: (T.rec.layers || []).map(function (L) { var h = (L.gen && L.gen.hex) || ((L.gen && L.gen.colors) || []).map(function (m) { return e[m]; }); return { kind: L.kind, style: L.gen && L.gen.style, dark: h[0], mid: h[1], light: h[2], parallax: L.parallax, drift: L.drift }; }) }; },
    normalize: function (o) { return { layers: (Array.isArray(o.layers) ? o.layers : []).filter(U.isObj).slice(0, 5).map(function (L) { var k = pick(L.kind, BG.KINDS, String(L.kind || '')); return { kind: k, style: pick(L.style, BG.STYLES[k] || BG_ALL, String(L.style || '')), dark: hexOf(L.dark) || '', mid: hexOf(L.mid) || '', light: hexOf(L.light) || '', parallax: num(L.parallax, 0, 1, 0.5), drift: num(L.drift, -1, 1, 0) }; }) }; },
    check: function (d) {
      var out = [];
      if (!d.layers.length) out.push(issue('layers', 'A background needs at least one layer.'));
      d.layers.forEach(function (L, i) {
        if (!BG.STYLES[L.kind]) out.push(issue('layers.' + i + '.kind', 'Unknown layer kind ' + L.kind + '.'));
        else if (BG.STYLES[L.kind].indexOf(L.style) < 0) out.push(issue('layers.' + i + '.style', 'A ' + L.kind + ' layer style must be ' + BG.STYLES[L.kind].join(', ') + '.'));
        ['dark', 'mid', 'light'].forEach(function (c) { if (!hexOf(L[c])) out.push(issue('layers.' + i + '.' + c, 'Layer ' + (i + 1) + ' ' + c + ' must be a #rrggbb color.')); });
      });
      return out;
    },
    apply: function (d, b, T) { T.rec.layers = bgLayers(b, d, T.rec.layers); T.rec.origin = 'claude'; return { message: 'Background applied to ' + T.rec.name + '.' }; },
    preview: function (d, b) {
      var cv = document.createElement('canvas'); cv.width = 128; cv.height = 112; cv.className = 'a7-fig'; cv.style.width = '192px'; cv.style.height = '168px';
      cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Background preview');
      var ctx = cv.getContext && cv.getContext('2d');
      if (ctx) BG.draw(ctx, { layers: bgLayers(b, d, []) }, 0, 128, 112, { entries: entries(b) });
      return figs([cv]);
    }
  });

  // ---------------------------------------------------------------- interface: window frame and title screen
  var EUI = ER.ui;
  function uiColor(b, r, path, hex) { var parts = path.split('.'), o = r; for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]] = U.isObj(o[parts[i]]) ? o[parts[i]] : {}; var k = parts[parts.length - 1]; o[k] = { hex: hex, m: nearest(b, hex) }; }
  AI.register({
    key: 'window', button: 'Draft a window', title: 'Draft a window frame with Claude', single: true, count: 3,
    blurb: 'Claude sets the window gradient, border colors, corner style, thickness, opacity, and opening.',
    fields: [F('top', 'Gradient top', 'color', { required: true }), F('bottom', 'Gradient bottom', 'color', { required: true }), F('border', 'Outer line', 'color', { required: true }), F('light', 'Border', 'color', { required: true }),
      F('corner', 'Corner', 'enum', { values: EUI.CORNERS.slice(), required: true }), F('thickness', 'Thickness', 'int', { min: 1, max: 3, required: true }), F('alpha', 'Opacity', 'num', { min: 0.5, max: 1 }), F('open', 'Opening', 'enum', { values: EUI.OPEN_STYLES.slice() })],
    target: function (b, t) { var r = needRec(b, t, 'uik_', 'window record'); if (ART.iface.keyOf(r) !== 'window') throw new Error('Not the window record.'); return { id: r.id, rec: r }; },
    context: function () { return { note: 'Menus and dialogue sit in these windows; white text must read clearly on the gradient.' }; },
    current: function (b, T) { var r = T.rec, g = r.gradient || {}; return { top: g.top && g.top.hex, bottom: g.bottom && g.bottom.hex, border: r.border && r.border.hex, light: r.light && r.light.hex, corner: r.corner, thickness: r.thickness, alpha: r.alpha, open: r.open && r.open.style }; },
    normalize: function (o) { return { top: hexOf(o.top) || '', bottom: hexOf(o.bottom) || '', border: hexOf(o.border) || '', light: hexOf(o.light) || '', corner: pick(o.corner, EUI.CORNERS, 'round'), thickness: num(o.thickness, 1, 3, 1, true), alpha: num(o.alpha, 0.5, 1, 1), open: pick(o.open, EUI.OPEN_STYLES, 'grow') }; },
    check: function (d) { return ['top', 'bottom', 'border', 'light'].filter(function (k) { return !hexOf(d[k]); }).map(function (k) { return issue(k, k + ' must be a #rrggbb color.'); }); },
    apply: function (d, b, T) {
      var r = T.rec;
      uiColor(b, r, 'gradient.top', d.top); uiColor(b, r, 'gradient.bottom', d.bottom); uiColor(b, r, 'border', d.border); uiColor(b, r, 'light', d.light);
      r.corner = d.corner; r.thickness = d.thickness; r.alpha = d.alpha; r.open = Object.assign({ ms: 140 }, r.open || {}, { style: d.open });
      r.origin = 'claude';
      return { message: 'Window frame applied.' };
    },
    preview: function (d) { return figs([swatchStrip([d.top, d.bottom, d.border, d.light], 'Window colors'), el('span', 'muted a7-small', esc(d.corner + ' corners, thickness ' + d.thickness))]); }
  });
  AI.register({
    key: 'title', button: 'Draft a title screen', title: 'Draft a title screen with Claude', single: true, count: 3,
    blurb: 'Claude sets the logo text, its style, scale, and colors, the layout, the prompt, and a credit line.',
    fields: [F('text', 'Logo text', 'text', { max: 40 }), F('style', 'Logo style', 'enum', { values: EUI.TITLE_STYLES.slice(), required: true }), F('layout', 'Layout', 'enum', { values: EUI.TITLE_LAYOUTS.slice(), required: true }),
      F('scale', 'Logo scale', 'int', { min: 1, max: 8, required: true }), F('prompt', 'Prompt', 'text', { max: 30 }), F('credit', 'Credit line', 'text', { max: 60 }),
      F('color', 'Logo', 'color', { required: true }), F('shadow', 'Logo shadow', 'color', { required: true }), F('light', 'Prompt', 'color', { required: true })],
    target: function (b, t) { var r = needRec(b, t, 'uik_', 'title record'); if (ART.iface.keyOf(r) !== 'title') throw new Error('Not the title record.'); return { id: r.id, rec: r }; },
    context: function (b) { return { gameTitle: ART.iface.titleText(b, null), note: 'The logo is drawn in the 5 by 7 pixel font; long text wraps. Keep it short.' }; },
    current: function (b, T) { var r = T.rec; return { text: r.text || ART.iface.titleText(b, r), style: r.style, layout: r.layout, scale: r.scale, prompt: r.prompt, credit: r.credit || '', color: r.color && r.color.hex, shadow: r.shadow && r.shadow.hex, light: r.light && r.light.hex }; },
    normalize: function (o) { return { text: trim(o.text || '', 40), style: pick(o.style, EUI.TITLE_STYLES, 'outline'), layout: pick(o.layout, EUI.TITLE_LAYOUTS, 'center'), scale: num(o.scale, 1, 8, 3, true), prompt: trim(o.prompt == null ? 'Press Start' : o.prompt, 30), credit: trim(o.credit || '', 60), color: hexOf(o.color) || '', shadow: hexOf(o.shadow) || '', light: hexOf(o.light) || '' }; },
    check: function (d) { return ['color', 'shadow', 'light'].filter(function (k) { return !hexOf(d[k]); }).map(function (k) { return issue(k, k + ' must be a #rrggbb color.'); }); },
    apply: function (d, b, T) {
      var r = T.rec;
      r.text = d.text || null; r.style = d.style; r.layout = d.layout; r.scale = d.scale; r.prompt = d.prompt; r.credit = d.credit || null;
      uiColor(b, r, 'color', d.color); uiColor(b, r, 'shadow', d.shadow); uiColor(b, r, 'light', d.light);
      r.origin = 'claude';
      return { message: 'Title screen applied.' };
    },
    preview: function (d) { return figs([swatchStrip([d.color, d.shadow, d.light], 'Title colors'), el('span', 'muted a7-small', esc((d.text || '(Charter title)') + ' / ' + d.prompt))]); }
  });

  // ---------------------------------------------------------------- music: motif, track, and sound effect
  var EAU = ENGINE_AUDIO, EM = EAU.motif;
  var MOTIF_GUIDE = 'Motif notation: "degrees" is space separated scale degrees 1 to 9 (8 and 9 are the next octave\'s 1 and 2), each optionally prefixed # or b and suffixed \' (octave up) or , (octave down), or r for a rest. ' +
    '"durs" is one duration per degree in eighth notes (1 eighth, 2 quarter, 4 half, 0.5 sixteenth, 2/3 triplet eighth). Bars hold meter times 2 eighths. Write two to four bars that end on 1, with a memorable rhythm.';
  AI.register({
    key: 'motif', button: 'Draft a melody', title: 'Draft a leitmotif with Claude', single: true, count: 3, tier: 'sonnet',
    blurb: 'Claude writes the melody as scale degrees and durations, with its mode, key, meter, and tempo. Field, battle, sorrow, and finale variations, and every track derived from them, follow it.',
    fields: [F('degrees', 'Degrees', 'text', { required: true, max: 240 }), F('durs', 'Durations', 'text', { required: true, max: 240 }), F('meter', 'Beats per bar', 'int', { min: 2, max: 7, required: true }),
      F('mode', 'Mode', 'enum', { values: Object.keys(EM.MODES), required: true }), F('key', 'Key', 'enum', { values: EM.KEYS.slice(), required: true }), F('tempo', 'Tempo', 'int', { min: 40, max: 300, required: true })],
    target: function (b, t) { var r = needRec(b, t, 'mus_', 'motif'); if (r.kind !== 'motif') throw new Error('Only motifs can be drafted here.'); return { id: r.id, rec: r }; },
    context: function (b, T) { var others = ART.audio.motifs(b).filter(function (x) { return x.id !== T.id; }).map(function (x) { return { name: x.name, mode: x.mode, key: x.key, degrees: x.degrees }; }); return { whose: subjectBrief(b, T.rec), themes: (b.charter && b.charter.sections && b.charter.sections.themes) ? trim(JSON.stringify(b.charter.sections.themes), 400) : null, otherMotifs: others.slice(0, 8) }; },
    current: function (b, T) { var r = T.rec; return { degrees: r.degrees, durs: r.durs, meter: r.meter, mode: r.mode, key: typeof r.key === 'number' ? EM.KEYS[r.key] : r.key, tempo: r.tempo }; },
    guide: MOTIF_GUIDE,
    normalize: function (o) { return { degrees: String(o.degrees || '').trim().replace(/\s+/g, ' '), durs: String(o.durs || '').trim().replace(/\s+/g, ' '), meter: num(o.meter, 2, 7, 4, true), mode: pick(o.mode, Object.keys(EM.MODES), 'major'), key: pick(o.key, EM.KEYS, 'C'), tempo: num(o.tempo, 40, 300, 112, true) }; },
    check: function (d) {
      var pd = EM.parseDegrees(d.degrees), pr = EM.parseDurs(d.durs), out = [];
      pd.errors.slice(0, 3).forEach(function (e) { out.push(issue('degrees', e.message)); });
      pr.errors.slice(0, 3).forEach(function (e) { out.push(issue('durs', e.message)); });
      if (pd.tokens.length < 4) out.push(issue('degrees', 'A motif needs at least four notes.'));
      if (pd.tokens.length !== pr.durs.length) out.push(issue('durs', 'There are ' + pd.tokens.length + ' degrees and ' + pr.durs.length + ' durations; they must match.'));
      return out;
    },
    apply: function (d, b, T) {
      var r = T.rec;
      ['degrees', 'durs', 'meter', 'mode', 'key', 'tempo'].forEach(function (k) { r[k] = d[k]; });
      r.origin = 'claude';
      var n = 0;
      ART.audio.tracks(b).forEach(function (t) { if (t.derivedFrom && t.derivedFrom.motif === r.id && !kept(t) && ART.audio.rederive(b, t)) n++; });
      return { message: 'Melody applied to ' + r.name + (n ? '; ' + n + ' track' + (n === 1 ? '' : 's') + ' re-derived.' : '.') };
    },
    preview: function (d, b, T) {
      if (blocking(this.check(d)).length) return el('span', 'muted a7-small', 'Fix the notation to play it.');
      var mo = Object.assign({}, T.rec, d), recipe = Object.assign({}, EM.VARIATIONS.field, (T.rec.variations || {}).field || {});
      return figs([playButton('Play field variation', function () { ART.audio.playTrack(EM.realize(mo, recipe, ART.audio.kit(b))); }), el('code', 'a7-small', esc(d.degrees))]);
    }
  });
  var MML_GUIDE = 'MML: notes a to g with + or # (sharp) or - (flat), an optional length (1 2 3 4 6 8 12 16 24 32 48 64 96 192, dots allowed), r rest, ^ tie, o<n> octave, > up an octave, < down, l<n> default length, v0 to v15 volume, @<n> instrument slot. ' +
    'Each order row names one pattern per channel [pulse 1 melody, pulse 2 harmony, triangle bass, noise drums] or empty for silence; every pattern in a row should last the same number of beats. loop is the row index to repeat from, or -1 to play once.';
  AI.register({
    key: 'track', button: 'Draft a score', title: 'Draft a track with Claude', single: true, count: 1, maxCount: 2,
    blurb: 'Claude writes the track as MML patterns and an order list over the four channels, keeping this track\'s instruments. Accepting turns it into your own track (it stops following its motif).',
    fields: [F('tempo', 'Tempo', 'int', { min: 40, max: 300, required: true }),
      F('patterns', 'Patterns', 'list', { itemLabel: 'Pattern', min: 1, max: 24, of: [F('key', 'Name', 'text', { required: true, max: 8 }), F('mml', 'MML', 'longtext', { required: true, max: 6000 })] }),
      F('order', 'Order', 'list', { itemLabel: 'Row', min: 1, max: 32, of: [F('p1', 'Pulse 1', 'text', { max: 8 }), F('p2', 'Pulse 2', 'text', { max: 8 }), F('tri', 'Triangle', 'text', { max: 8 }), F('noise', 'Noise', 'text', { max: 8 })] }),
      F('loop', 'Loop row', 'int', { min: -1, max: 31 })],
    target: function (b, t) { var r = needRec(b, t, 'mus_', 'track'); if (r.kind !== 'track') throw new Error('Only tracks can be drafted here.'); return { id: r.id, rec: r }; },
    context: function (b, T) {
      var r = T.rec, ins = {};
      ['p1', 'p2', 'tri', 'noise'].forEach(function (c) { var i = r.instruments && r.instruments[c] ? ART.records.get(r.instruments[c], b) : null; ins[c] = i ? i.name : null; });
      return { role: r.subject && r.subject.ref, instruments: ins, slots: (r.slots || []).map(function (id, i) { var x = ART.records.get(id, b); return { slot: i, name: x ? x.name : null }; }), note: 'Noise drums use slots 0 kick, 1 snare, 2 hat when those instruments are present.' };
    },
    current: function (b, T) { var r = T.rec; return { tempo: r.tempo, patterns: Object.keys(r.patterns || {}).map(function (k) { return { key: k, mml: r.patterns[k] }; }), order: (r.order || []).map(function (row) { return { p1: row[0] || '', p2: row[1] || '', tri: row[2] || '', noise: row[3] || '' }; }), loop: r.loop == null ? -1 : r.loop }; },
    guide: MML_GUIDE,
    maxTokens: function (n) { return Math.min(16000, 2500 + 3500 * n); },
    normalize: function (o) {
      var pats = Array.isArray(o.patterns) ? o.patterns : U.isObj(o.patterns) ? Object.keys(o.patterns).map(function (k) { return { key: k, mml: o.patterns[k] }; }) : [];
      var rows = (Array.isArray(o.order) ? o.order : []).map(function (row) { return Array.isArray(row) ? { p1: row[0], p2: row[1], tri: row[2], noise: row[3] } : row; }).filter(U.isObj);
      return { tempo: num(o.tempo, 40, 300, 120, true), patterns: pats.filter(U.isObj).map(function (p) { return { key: String(p.key || '').trim(), mml: String(p.mml || '') }; }),
        order: rows.map(function (r) { var x = {}; ['p1', 'p2', 'tri', 'noise'].forEach(function (c) { x[c] = r[c] == null ? '' : String(r[c]).trim(); }); return x; }), loop: o.loop == null ? -1 : num(o.loop, -1, 31, -1, true) };
    },
    trackOf: function (d, T) {
      var t = U.clone(T.rec), p = {};
      d.patterns.forEach(function (x) { if (x.key) p[x.key] = x.mml; });
      t.tempo = d.tempo; t.patterns = p; t.order = d.order.map(function (r) { return ['p1', 'p2', 'tri', 'noise'].map(function (c) { return r[c] ? r[c] : null; }); });
      t.loop = d.loop < 0 || d.loop >= t.order.length ? null : d.loop;
      delete t.derivedFrom;
      return t;
    },
    check: function (d, b, T) {
      var out = [], keys = {};
      d.patterns.forEach(function (x, i) { if (!x.key) out.push(issue('patterns.' + i + '.key', 'Pattern ' + (i + 1) + ' needs a name.')); else if (keys[x.key]) out.push(issue('patterns.' + i + '.key', 'Two patterns are named ' + x.key + '.')); keys[x.key] = 1; });
      if (!d.order.length) out.push(issue('order', 'The order list needs at least one row.'));
      d.order.forEach(function (r, i) { ['p1', 'p2', 'tri', 'noise'].forEach(function (c) { if (r[c] && !keys[r[c]]) out.push(issue('order.' + i + '.' + c, 'Row ' + (i + 1) + ' names pattern ' + r[c] + ', which is not defined.')); }); });
      if (!out.length) EAU.track.compile(this.trackOf(d, T)).errors.slice(0, 6).forEach(function (e) { out.push(issue('patterns', 'Pattern ' + e.pattern + (e.pos != null ? ' at ' + e.pos : '') + ': ' + e.message)); });
      return out;
    },
    apply: function (d, b, T) { var t = this.trackOf(d, T); ['tempo', 'patterns', 'order', 'loop'].forEach(function (k) { T.rec[k] = t[k]; }); delete T.rec.derivedFrom; T.rec.origin = 'claude'; return { message: 'Score applied to ' + T.rec.name + '.' }; },
    preview: function (d, b, T) { var self = this; if (blocking(self.check(d, b, T)).length) return el('span', 'muted a7-small', 'Fix the patterns to play it.'); return figs([playButton('Play', function () { ART.audio.playTrack(self.trackOf(d, T)); }), el('span', 'muted a7-small', esc(d.patterns.length + ' patterns, ' + d.order.length + ' rows, ' + d.tempo + ' bpm'))]); }
  });
  var SFX = EAU.sfxr;
  AI.register({
    key: 'sound', button: 'Draft a sound', title: 'Draft a sound effect with Claude', single: true, count: 3,
    blurb: 'Claude sets the sfxr parameters: wave, envelope, pitch and slide, vibrato, arpeggio, duty, and filters.',
    fields: [F('wave', 'Wave', 'enum', { values: SFX.WAVES.slice(), required: true }), F('category', 'Category', 'enum', { values: SFX.CATEGORIES.slice(), required: true })]
      .concat(SFX.PARAMS.map(function (p) { return F(p.key, p.label, 'num', { min: p.min, max: p.max }); })),
    target: function (b, t) { var r = needRec(b, t, 'sfx_', 'sound'); return { id: r.id, rec: r }; },
    context: function (b, T) { return { for: subjectBrief(b, T.rec), cue: ART.audio.cueKey(T.rec), params: SFX.PARAMS.map(function (p) { return { key: p.key, label: p.label, min: p.min, max: p.max, default: p.def }; }), note: 'Classic sfxr: freq is the start pitch, slide below 0 falls, decay sets the tail, punch adds a hard attack, noise suits hits and explosions.' }; },
    current: function (b, T) { var o = Object.assign({}, T.rec.params || {}); o.category = T.rec.category; return o; },
    normalize: function (o) { var p = SFX.normalize(o); p.category = pick(o.category, SFX.CATEGORIES, 'special'); return p; },
    check: function () { return []; },
    apply: function (d, b, T) { var p = SFX.normalize(d); T.rec.params = p; T.rec.category = d.category; T.rec.origin = 'claude'; return { message: 'Sound applied to ' + T.rec.name + '.' }; },
    preview: function (d) { return figs([playButton('Play', function () { ART.audio.playSfx(SFX.normalize(d)); }), el('span', 'muted a7-small', esc(d.wave + ', ' + d.category))]); }
  });

  // ---------------------------------------------------------------- pixels (any frame in the pixel editor)
  // t is the editor's own context: {title, note, w, h, maxIndex, labels, slots, entries, get(), load(idx)}.
  var ALPHA = EC.ALPHABET;
  function rowsOf(d) { return String(d.pixels || '').split(/\r?\n/).map(function (r) { return r.replace(/\s+/g, ''); }).filter(function (r) { return r.length; }); }
  function rowsFrom(idx, w, h) { var out = []; for (var y = 0; y < h; y++) { var s = ''; for (var x = 0; x < w; x++) s += ALPHA[idx[y * w + x] | 0]; out.push(s); } return out; }
  AI.PIXEL_LIMIT = 6144;
  AI.pixelCheck = function (d, T) {
    var rows = rowsOf(d), out = [], allowed = ALPHA.slice(0, T.maxIndex + 1);
    if (rows.length !== T.h) out.push(issue('pixels', 'There are ' + rows.length + ' rows; the frame needs exactly ' + T.h + '.'));
    for (var i = 0; i < rows.length && out.length < 6; i++) {
      if (rows[i].length !== T.w) out.push(issue('pixels', 'Row ' + (i + 1) + ' has ' + rows[i].length + ' characters; each row needs exactly ' + T.w + '.'));
      for (var j = 0; j < rows[i].length; j++) if (allowed.indexOf(rows[i][j]) < 0) { out.push(issue('pixels', 'Row ' + (i + 1) + ' uses ' + JSON.stringify(rows[i][j]) + ', which is not in the alphabet ' + allowed + '.')); break; }
    }
    return out;
  };
  AI.pixelDecode = function (d, T) { var rows = rowsOf(d), idx = new Uint8Array(T.w * T.h); rows.forEach(function (r, y) { for (var x = 0; x < T.w; x++) idx[y * T.w + x] = ALPHA.indexOf(r[x]); }); return idx; };
  AI.register({
    key: 'pixels', button: 'Draft with Claude', title: 'Draft pixels with Claude', single: true, count: 1, pixel: true,
    blurb: function (b, T) { return 'Claude redraws this ' + T.w + ' by ' + T.h + ' frame from its current pixels and your request. Every draft is checked against the frame size and the palette slots before you see it; accepting loads it into the editor, where Undo brings back what was there.'; },
    placeholder: 'For example: add a scarf, make the blade longer, give the slime a crown.',
    fields: [F('pixels', 'Pixels', 'longtext', { required: true, max: 40000, help: 'One row per line, one character per pixel.' })],
    target: function (b, t) {
      if (!U.isObj(t) || !(t.w > 0 && t.h > 0) || typeof t.get !== 'function') throw new Error('Open a frame in the pixel editor first.');
      if (t.w * t.h > AI.PIXEL_LIMIT) throw new Error('This frame is ' + t.w + ' by ' + t.h + ', too large to draft (the limit is ' + AI.PIXEL_LIMIT + ' pixels). Draw it by hand.');
      t.maxIndex = Math.max(1, Math.min(31, t.maxIndex || 15));
      return t;
    },
    context: function (b, T) {
      var labels = T.labels || ART.SLOT_NAMES || [], cols = [];
      for (var s = 0; s <= T.maxIndex; s++) { var m = T.slots ? T.slots[s] : null; cols.push({ symbol: ALPHA[s], name: labels[s] || 'Slot ' + s, color: s === 0 ? 'transparent' : (typeof m === 'number' && T.entries ? T.entries[m] : null) }); }
      return { frame: T.title || 'Frame', note: T.note || null, width: T.w, height: T.h, palette: cols };
    },
    current: function (b, T) { return { rows: rowsFrom(T.get(), T.w, T.h) }; },
    guide: function (b, T) { return 'Pixel art: each option has "rows", an array of exactly ' + T.h + ' strings of exactly ' + T.w + ' characters, one character per pixel from the alphabet ' + ALPHA.slice(0, T.maxIndex + 1) + ' (0 is transparent, 1 is the dark outline). Start from the current rows and change only what the request needs; keep the silhouette outlined in 1, light from the top left, and the same framing.'; },
    request: function () { return 'Improve this frame while keeping its subject and framing.'; },
    maxTokens: function (n, T) { return Math.min(16000, 1200 + Math.ceil(T.w * T.h * n * 0.9)); },
    normalize: function (o) {
      if (typeof o.pixels === 'string') return { pixels: o.pixels };
      var rows = Array.isArray(o.rows) ? o.rows : [];
      return { pixels: rows.map(function (r) { return String(r == null ? '' : r).replace(/\s+/g, ''); }).join('\n') };
    },
    check: function (d, b, T) { return AI.pixelCheck(d, T); },
    apply: function (d, b, T) { T.load(AI.pixelDecode(d, T)); return { message: 'Draft loaded into the editor. Save pixels to keep it, or Undo to go back.' }; },
    preview: function (d, b, T) {
      if (blocking(AI.pixelCheck(d, T)).length) return null;
      var idx = AI.pixelDecode(d, T), f = { w: T.w, h: T.h, rgba: ES.rgba(idx, T.slots, T.entries || []) };
      return figs([fig(f, 96, 'Draft pixels')]);
    }
  });
  // The pixel editor's button. The editor touches nothing in the bundle until Save, so accepting a draft only loads it.
  AI.pixelButton = function (t) {
    var w = Kit.ai.button('Draft with Claude', function () { AI.ask('pixels', t, null); }, { kind: 'ghost' });
    w.classList.add('a7-ai-btn');
    return w;
  };
})();
// === ART:AI END ===
