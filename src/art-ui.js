// === ART:UI BEGIN ===
(function () {
  'use strict';
  // The interface kit as records. Five uik_ records, one per role subject, made once by Quick Build with origin default
  // and edited on the Interface tab like anything else:
  //   ui:window  {gradient {top, bottom}, border, light, corner, thickness, alpha, open {ms, style}}
  //   ui:font    {w, h, rows, advance, line, glyphs {code: hex rows}} (codes 32 to 126, two hex digits per row)
  //   ui:cursor  {style, fill, light, outline, bob {amp, ms}}
  //   ui:touch   {scheme (null follows the Charter), shape, opacity, size (logical px, null for automatic), color, ink,
  //               labels {a, b, menu}, sfx {move, confirm, cancel, error} (sfx_ ids, linked in Phase 6)}
  //   ui:title   {text (null reads the Charter title), style, scale, color, shadow, light, layout, bg (bgd_ id), prompt, credit}
  // A color field is {hex, m}: hex is the source, m its nearest master index. Master rebuilds refit generated records
  // from hex and move edited ones to the nearest new color, the same rule every other art record follows.
  var U = Kit.util, ER = ENGINE_RENDER, EU = ER.ui, PE = ER.palette, H = ER.util.hash32;
  var P = ART.palette, S = ART.sprites, I = ART.iface = {};
  function cur() { return Kit.bundle.current(); }
  function bump(report, k) { report[k] = (report[k] || 0) + 1; }
  var KEEP = { user: 1, claude: 1 };
  function kept(r) { return !!(r && KEEP[r.origin]); }
  I.isKept = kept;
  I.ROLES = [
    { key: 'window', label: 'Window', name: 'Window frame' },
    { key: 'font', label: 'Font', name: 'Pixel font' },
    { key: 'cursor', label: 'Cursor', name: 'Menu cursor' },
    { key: 'touch', label: 'Touch skin', name: 'Touch skin' },
    { key: 'title', label: 'Title', name: 'Title screen' }
  ];
  I.SCHEMES = [['dpad', 'D pad and buttons'], ['stick', 'Virtual stick and buttons'], ['tap', 'Tap to move'], ['hybrid', 'Hybrid: stick, tap, and buttons']];
  function c(hex) { return { hex: hex }; }
  I.DEFAULTS = {
    window: function () { return { gradient: { top: c('#2a4aa8'), bottom: c('#0c1450') }, border: c('#000000'), light: c('#e8e8f0'), corner: 'round', thickness: 1, alpha: 1, open: { ms: 140, style: 'grow' } }; },
    font: function () { var f = EU.FONT; return { w: f.w, h: f.h, rows: f.rows, advance: f.advance, line: f.line, glyphs: U.clone(f.glyphs) }; },
    cursor: function () { return { style: 'triangle', fill: c('#f0f0f0'), light: c('#ffffff'), outline: c('#101010'), bob: { amp: 2, ms: 600 } }; },
    touch: function () { return { scheme: null, shape: 'round', opacity: 0.55, size: null, color: c('#d8d8e0'), ink: c('#202028'), labels: { a: 'A', b: 'B', menu: '=' }, sfx: { move: null, confirm: null, cancel: null, error: null } }; },
    title: function () { return { text: null, style: 'outline', scale: 3, color: c('#f0d070'), shadow: c('#201008'), light: c('#ffffff'), layout: 'center', bg: null, prompt: 'Press Start', credit: null }; }
  };
  I.COLOR_FIELDS = {
    window: [['gradient.top', 'Top of the gradient'], ['gradient.bottom', 'Bottom of the gradient'], ['border', 'Outer line'], ['light', 'Border']],
    cursor: [['fill', 'Fill'], ['light', 'Highlight'], ['outline', 'Outline']],
    touch: [['color', 'Controls'], ['ink', 'Ink']],
    title: [['color', 'Logo'], ['shadow', 'Logo shadow'], ['light', 'Prompt']],
    font: []
  };
  function getPath(o, p) { return p.split('.').reduce(function (x, k) { return x && typeof x === 'object' ? x[k] : undefined; }, o); }
  function colorObjs(r) { var key = I.keyOf(r); return (I.COLOR_FIELDS[key] || []).map(function (f) { return getPath(r, f[0]); }).filter(U.isObj); }
  I.keyOf = function (r) { var ref = r && r.subject && r.subject.ref; return typeof ref === 'string' && ref.indexOf('ui:') === 0 ? ref.slice(3) : null; };
  I.all = function (b) { return ART.records.list('uik_', b || cur()); };
  I.get = function (b, key) { return ART.bySubject('uik_', 'role', 'ui:' + key, b || cur()); };
  I.kit = function (b) { b = b || cur(); return { window: I.get(b, 'window'), font: I.get(b, 'font'), cursor: I.get(b, 'cursor'), touch: I.get(b, 'touch'), title: I.get(b, 'title') }; };
  I.fit = function (b, r) { var ent = P.entries(b); colorObjs(r).forEach(function (o) { if (o.hex && ent.length) o.m = PE.nearest(ent, o.hex); }); };
  I.setColor = function (b, r, path, hex) {
    var o = getPath(r, path), h = ER.color && ER.color.normHex ? ER.color.normHex(hex) : String(hex).toLowerCase();
    if (!U.isObj(o) || !h) return false;
    o.hex = h; var ent = P.entries(b); if (ent.length) o.m = PE.nearest(ent, h);
    r.origin = 'user';
    return true;
  };
  I.scheme = function (b, rec) { b = b || cur(); var own = rec && rec.scheme, ch = b.charter && b.charter.specs && b.charter.specs.mobileControls; return EU.SCHEMES.indexOf(own) >= 0 ? own : EU.SCHEMES.indexOf(ch) >= 0 ? ch : 'dpad'; };
  I.titleText = function (b, rec) { b = b || cur(); var sec = b.charter && b.charter.sections && b.charter.sections.premise; return (rec && rec.text) || (sec && sec.title) || (b.kit && b.kit.title) || 'Untitled Saga'; };
  // The title background: the record's own, else the grassland battle background, else any background.
  I.titleBg = function (b, rec) {
    b = b || cur();
    var own = rec && rec.bg ? ART.records.get(rec.bg, b) : null;
    if (own) return own;
    var g = ART.tiles && ART.tiles.biome(b, 'grassland');
    return (g && ART.tiles.bgFor(b, g)) || (ART.tiles ? ART.tiles.backgrounds(b)[0] : null) || null;
  };
  function retired(b) { ART.ensure(b); var st = b.art.settings; if (!Array.isArray(st.retired)) st.retired = []; return st.retired; }
  I.build = function (b, report) {
    var ret = retired(b);
    I.ROLES.forEach(function (d) {
      if (ret.indexOf('ui:' + d.key) >= 0) return;
      var r = I.get(b, d.key);
      if (r) {
        // Fill a missing master index without touching anything the user chose.
        var before = U.canonical(r);
        colorObjs(r).forEach(function (o) { if (o.hex && typeof o.m !== 'number' && P.entries(b).length) o.m = PE.nearest(P.entries(b), o.hex); });
        bump(report, U.canonical(r) === before ? 'kept' : 'refreshed');
        return;
      }
      var body = I.DEFAULTS[d.key]();
      r = ART.envelope('uik_', d.name, { kind: 'role', ref: 'ui:' + d.key }, 'default', H('uik|' + d.key), body);
      I.fit(b, r);
      ART.records.put(r, b);
      bump(report, 'created');
    });
  };
  I.reset = function (b, key) {
    var r = I.get(b, key);
    if (!r) return null;
    var body = I.DEFAULTS[key]();
    Object.keys(body).forEach(function (k) { r[k] = body[k]; });
    r.origin = 'default';
    I.fit(b, r);
    return r;
  };
  I.remove = function (b, key) { var r = I.get(b, key); if (!r) return false; ART.records.del(r.id, b); var ret = retired(b); if (ret.indexOf('ui:' + key) < 0) ret.push('ui:' + key); return true; };
  I.restore = function (b, key) { var ret = retired(b), i = ret.indexOf('ui:' + key); if (i >= 0) ret.splice(i, 1); I.build(b, {}); return I.get(b, key); };
  // Glyph helpers for the font editor: rows as arrays of booleans and back.
  I.glyphRows = function (font, code) {
    var f = EU.font(font), bits = f.bits[code] || [], out = [];
    for (var r = 0; r < f.rows; r++) { var row = []; for (var x = 0; x < f.w; x++) row.push(!!((bits[r] || 0) & (1 << (f.w - 1 - x)))); out.push(row); }
    return out;
  };
  I.setGlyph = function (font, code, rows) {
    var w = font.w, hex = rows.map(function (row) { var v = 0; row.forEach(function (on, x) { if (on) v |= 1 << (w - 1 - x); }); return (v < 16 ? '0' : '') + v.toString(16); }).join('');
    font.glyphs = font.glyphs || {}; font.glyphs[code] = hex;
    return hex;
  };
  P.onRebuild(function (b, map) {
    I.all(b).forEach(function (r) {
      colorObjs(r).forEach(function (o) { if (kept(r)) { if (typeof o.m === 'number' && map[o.m] !== undefined) o.m = map[o.m]; } else if (o.hex) o.m = PE.nearest(P.entries(b), o.hex); });
    });
  });

  // ---------------------------------------------------------------- Quick Build
  ART.quickBuild.register({ key: 'interface', label: 'Window, font, cursor, touch skin, and title', order: 50, run: function (b, r) {
    if (!P.master(b)) return;
    I.build(b, r);
  } });

  // ---------------------------------------------------------------- validation
  var HEXROW = /^[0-9a-f]*$/i;
  Kit.validate.register('art.ui', function (b, ctx) {
    var recs = b.art && U.isObj(b.art.records) && U.isObj(b.art.records.uik_) ? b.art.records.uik_ : {};
    var n = P.entries(b).length, seen = {};
    function add(id, path, msg, level) { ctx.add({ recordId: id, fieldPath: path, message: msg, level: level || 'error' }); }
    function color(r, path) {
      var o = getPath(r, path);
      if (o == null) return;
      if (!U.isObj(o) || (o.m != null && !(typeof o.m === 'number' && o.m >= 0 && o.m < n && o.m === Math.floor(o.m))) || (o.hex != null && !/^#[0-9a-f]{6}$/i.test(String(o.hex)))) add(r.id, path, 'A color is {hex, m} with a six digit hex and a master palette index.');
    }
    Object.keys(recs).forEach(function (id) {
      var r = recs[id];
      if (!U.isObj(r)) return;
      var key = I.keyOf(r);
      if (!key || !I.DEFAULTS[key]) { add(r.id, 'subject.ref', 'An interface record needs a role of ui:window, ui:font, ui:cursor, ui:touch, or ui:title.'); return; }
      if (seen[key]) add(r.id, 'subject.ref', 'There is already a ' + key + ' record (' + seen[key] + '). Only the first one is used.', 'warning');
      else seen[key] = r.id;
      (I.COLOR_FIELDS[key] || []).forEach(function (f) { color(r, f[0]); });
      if (key === 'window') {
        if (EU.CORNERS.indexOf(r.corner) < 0) add(r.id, 'corner', 'Corner must be square, round, or notch.');
        if (!(r.thickness >= 1 && r.thickness <= 3)) add(r.id, 'thickness', 'Border thickness runs from 1 to 3.');
        if (r.alpha != null && !(r.alpha >= 0.2 && r.alpha <= 1)) add(r.id, 'alpha', 'Window opacity runs from 0.2 to 1.');
        if (r.open && (EU.OPEN_STYLES.indexOf(r.open.style) < 0 || !(r.open.ms >= 0 && r.open.ms <= 2000))) add(r.id, 'open', 'Opening is {style: grow, fade, or none, ms 0 to 2000}.');
      } else if (key === 'font') {
        if (!(r.w >= 1 && r.w <= 8)) add(r.id, 'w', 'Glyph width runs from 1 to 8.');
        if (!(r.rows >= 1 && r.rows <= 16)) add(r.id, 'rows', 'Glyph rows run from 1 to 16.');
        var g = U.isObj(r.glyphs) ? r.glyphs : {}, missing = 0;
        for (var code = 32; code <= 126; code++) if (g[code] == null) missing++;
        if (missing) add(r.id, 'glyphs', missing + ' of the 95 printable characters have no glyph; they draw as a question mark.', 'warning');
        Object.keys(g).forEach(function (k) { var v = String(g[k]); if (!HEXROW.test(v) || v.length !== (r.rows || 8) * 2) add(r.id, 'glyphs.' + k, 'Glyph ' + k + ' needs ' + (r.rows || 8) + ' rows of two hex digits.'); });
      } else if (key === 'cursor') {
        if (EU.CURSORS.indexOf(r.style) < 0) add(r.id, 'style', 'Cursor style must be ' + EU.CURSORS.join(', ') + '.');
        if (r.bob && !(r.bob.amp >= 0 && r.bob.amp <= 8 && r.bob.ms >= 100 && r.bob.ms <= 4000)) add(r.id, 'bob', 'The bob is {amp 0 to 8, ms 100 to 4000}.');
      } else if (key === 'touch') {
        if (r.scheme != null && EU.SCHEMES.indexOf(r.scheme) < 0) add(r.id, 'scheme', 'Scheme must be dpad, stick, tap, hybrid, or empty to follow the Charter.');
        if (['round', 'square'].indexOf(r.shape) < 0) add(r.id, 'shape', 'Control shape must be round or square.');
        if (!(r.opacity >= 0.1 && r.opacity <= 1)) add(r.id, 'opacity', 'Opacity runs from 0.1 to 1.');
        if (r.size != null && !(r.size >= 12 && r.size <= 200)) add(r.id, 'size', 'Control size runs from 12 to 200 logical pixels.');
        Object.keys(U.isObj(r.sfx) ? r.sfx : {}).forEach(function (k) { var s = r.sfx[k]; if (s && !(b.art.records.sfx_ && b.art.records.sfx_[s])) add(r.id, 'sfx.' + k, 'Sound ' + s + ' does not exist.'); });
      } else if (key === 'title') {
        if (EU.TITLE_STYLES.indexOf(r.style) < 0) add(r.id, 'style', 'Logo style must be outline, shadow, or plain.');
        if (EU.TITLE_LAYOUTS.indexOf(r.layout) < 0) add(r.id, 'layout', 'Layout must be center, upper, or lower.');
        if (!(r.scale >= 1 && r.scale <= 8)) add(r.id, 'scale', 'Logo scale runs from 1 to 8.');
        if (r.bg && !(b.art.records.bgd_ && b.art.records.bgd_[r.bg])) add(r.id, 'bg', 'Background ' + r.bg + ' does not exist.');
      }
    });
  });
  function goInterface(rid) { if (!Kit.go('interface')) return false; if (ART.WS.interface && ART.WS.interface.focus) ART.WS.interface.focus(rid); return true; }
  Kit.jump.register({
    test: function (rid) { return Kit.ids.prefixOf(rid) === 'uik_'; },
    name: function (rid) { var r = ART.records.get(rid); return r ? r.name : rid; },
    go: goInterface
  });
})();
// === ART:UI END ===
