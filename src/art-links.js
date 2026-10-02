// === ART:LINKS BEGIN ===
(function () {
  'use strict';
  // The eight forward fields Day 146 reserved for this forge, filled from the art records whose subject is that rules
  // record. This is the only place the forge writes outside the art namespace:
  //   chr_.portrait  por_ with subject chr        chr_.leitmotif  mus_ motif with subject chr
  //   abl_.animation anm_ with subject abl        abl_.sfx        sfx_ with subject abl
  //   abl_.icon, itm_.icon, eqp_.icon  ico_ with that subject      fam_.sprite  spr_ battle sprite with subject fam
  // A field that already points at an existing art record of the right kind is kept, even when it is not the subject's
  // own record (a user may point two abilities at one animation). An empty field, or one that points at an art record
  // that no longer exists, takes the subject's record, or becomes empty when there is none. Passive abilities have no
  // animation or sound, so those fields stay as they are unless they dangle.
  var U = Kit.util;
  var L = ART.links = {};
  function cur() { return Kit.bundle.current(); }
  function bump(report, k) { report[k] = (report[k] || 0) + 1; }
  function bySubject(b, prefix, kind, ref, test) {
    return ART.records.list(prefix, b).filter(function (r) { return r.subject && r.subject.kind === kind && r.subject.ref === ref && (!test || test(r)); })[0] || null;
  }
  // What each forward field should point at for one rules record, or null when the art has no such record.
  L.SOURCES = {
    'chr_.portrait': function (b, rec) { return bySubject(b, 'por_', 'chr', rec.id); },
    'chr_.leitmotif': function (b, rec) { return bySubject(b, 'mus_', 'chr', rec.id, function (r) { return r.kind === 'motif'; }); },
    'abl_.animation': function (b, rec) { return bySubject(b, 'anm_', 'abl', rec.id); },
    'abl_.sfx': function (b, rec) { return bySubject(b, 'sfx_', 'abl', rec.id); },
    'abl_.icon': function (b, rec) { return bySubject(b, 'ico_', 'abl', rec.id); },
    'itm_.icon': function (b, rec) { return bySubject(b, 'ico_', 'itm', rec.id); },
    'eqp_.icon': function (b, rec) { return bySubject(b, 'ico_', 'eqp', rec.id); },
    'fam_.sprite': function (b, rec) { return bySubject(b, 'spr_', 'fam', rec.id, function (r) { return r.mode === 'battle'; }); }
  };
  // plan(b) -> [{recordId, prefix, field, from, to}] for every field fill() would change. Pure: nothing is written.
  L.plan = function (b) {
    b = b || cur();
    var out = [];
    ART.FORWARD_FIELDS.forEach(function (f) {
      var m = b && b.rules && U.isObj(b.rules[f.prefix]) ? b.rules[f.prefix] : {}, src = L.SOURCES[f.prefix + '.' + f.field];
      Object.keys(m).forEach(function (id) {
        var rec = m[id];
        if (!U.isObj(rec)) return;
        var v = rec[f.field] == null || rec[f.field] === '' ? null : rec[f.field];
        var ok = typeof v === 'string' && Kit.ids.prefixOf(v) === f.target && !!ART.records.get(v, b);
        if (ok) return;
        // A value that is not an art reference at all (someone typed text) is left for the validator to report.
        if (v !== null && (typeof v !== 'string' || ART.PREFIXES.indexOf(Kit.ids.prefixOf(v)) < 0)) return;
        var want = src ? src(b, rec) : null, to = want ? want.id : null;
        if (to !== v) out.push({ recordId: id, prefix: f.prefix, field: f.field, from: v, to: to });
      });
    });
    return out;
  };
  // fill(b, report) writes the plan. Returns the list of changes. A second run changes nothing.
  L.fill = function (b, report) {
    b = b || cur(); report = report || {};
    var plan = L.plan(b);
    plan.forEach(function (p) {
      var rec = b.rules[p.prefix][p.recordId];
      if (p.to === null) { delete rec[p.field]; bump(report, 'refreshed'); }
      else { rec[p.field] = p.to; bump(report, p.from === null ? 'created' : 'refreshed'); }
    });
    if (!plan.length) bump(report, 'kept');
    else Kit.index.invalidate();
    return plan;
  };
  // Every rules record that could carry a forward field, with what it points at now and what it would point at.
  L.table = function (b) {
    b = b || cur();
    var rows = [];
    ART.FORWARD_FIELDS.forEach(function (f) {
      var m = b && b.rules && U.isObj(b.rules[f.prefix]) ? b.rules[f.prefix] : {}, src = L.SOURCES[f.prefix + '.' + f.field];
      Object.keys(m).forEach(function (id) {
        var rec = m[id];
        if (!U.isObj(rec)) return;
        var v = rec[f.field] || null, have = v ? ART.records.get(v, b) : null, want = src ? src(b, rec) : null;
        rows.push({ recordId: id, name: rec.name || id, prefix: f.prefix, field: f.field, value: v, ok: !!have && Kit.ids.prefixOf(v) === f.target, suggested: want ? want.id : null });
      });
    });
    return rows;
  };
  // Quick Build links last, after every art record exists.
  ART.quickBuild.register({ key: 'links', label: 'Forward fields', order: 90, run: function (b, r) { L.fill(b, r); } });
})();
// === ART:LINKS END ===
