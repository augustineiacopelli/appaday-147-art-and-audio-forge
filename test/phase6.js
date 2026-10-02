// Phase 6 acceptance: ENGINE_AUDIO (MML, instruments, voices, the order list player and its scheduler, sfxr, leitmotif
// realization, unlock and lifecycle) driven through a recording fake AudioContext; the ins_, sfx_, and mus_ records,
// their Quick Build step, the role table, the art.audio validator, edit survival, and cue resolution; the Sound tab and
// its drawers; presenter cues reaching the player; the header sound button; the self test; and the Day 146 round trip.
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

// ---------------------------------------------------------------- a recording AudioContext
function makeFake() {
  const log = { sources: [], buffers: 0, waves: 0, gains: [] };
  class Param {
    constructor(v) { this.value = v; this.events = []; }
    setValueAtTime(v, t) { this.events.push(['set', v, t]); this.value = v; return this; }
    linearRampToValueAtTime(v, t) { this.events.push(['ramp', v, t]); return this; }
    cancelScheduledValues(t) { this.events.push(['cancel', t]); return this; }
  }
  class Node { connect(d) { this.out = d; return d; } disconnect() { this.out = null; } }
  class Ctx {
    constructor() { this.currentTime = 0; this.sampleRate = 48000; this.state = 'running'; this.destination = new Node(); this.log = log; this.resumed = 0; this.suspended = 0; }
    createGain() { const g = new Node(); g.gain = new Param(1); log.gains.push(g); return g; }
    createOscillator() { const o = new Node(); o.kind = 'osc'; o.frequency = new Param(440); o.setPeriodicWave = (w) => { o.wave = w; }; o.start = (t) => { o.t0 = t; }; o.stop = (t) => { o.t1 = t; }; log.sources.push(o); return o; }
    createBufferSource() { const s = new Node(); s.kind = 'buf'; s.playbackRate = new Param(1); s.start = (t) => { s.t0 = t; }; s.stop = (t) => { s.t1 = t; s.stopped = true; }; log.sources.push(s); return s; }
    createBuffer(ch, len, sr) { log.buffers++; const d = new Float32Array(len); return { length: len, sampleRate: sr, numberOfChannels: ch, getChannelData: () => d }; }
    createPeriodicWave(re, im) { log.waves++; return { re, im, n: log.waves }; }
    resume() { this.state = 'running'; this.resumed++; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; this.suspended++; return Promise.resolve(); }
  }
  return { Ctx, log };
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
  const fences = ['KIT:CORE', 'ART:STORE', 'ART:DEMO', 'ART:CONTRACT', 'ENGINE:RENDER', 'ENGINE:AUDIO', 'ART:PALETTE', 'WS:PALETTE', 'ART:SPRITES', 'ART:PIXED', 'WS:SPRITES', 'WS:INTERFACE', 'ART:MOTION', 'WS:MOTION', 'ART:TILES', 'WS:WORLD', 'WS:PLAYTEST', 'ART:UI', 'ART:BATTLE', 'WS:BATTLE', 'ART:AUDIO', 'WS:SOUND', 'WS:ART147', 'APP:BOOT'];
  const at = fences.map((f) => script.indexOf('// === ' + f + ' BEGIN ==='));
  check('fences present in order: ENGINE:AUDIO after ENGINE:RENDER, ART:AUDIO and WS:SOUND before WS:ART147', at.every((x, i) => x >= 0 && (i === 0 || x > at[i - 1])), at);
  check('every fence opens and closes once', fences.every((f) => script.split('// === ' + f + ' BEGIN ===').length === 2 && script.split('// === ' + f + ' END ===').length === 2));
  check('ART:SOUND CSS fence present', html.split('/* === ART:SOUND CSS BEGIN === */').length === 2 && html.split('/* === ART:SOUND CSS END === */').length === 2);
  const engA = script.slice(script.indexOf('// === ENGINE:AUDIO BEGIN ==='), script.indexOf('// === ENGINE:AUDIO END ==='));
  check('ENGINE:AUDIO reads no host globals', engA.length > 20000 && !/(?<![.\w$])(Kit|ART|window|document|navigator|localStorage|indexedDB|AudioContext|webkitAudioContext|Audio|ENGINE_RENDER|ENGINE_BATTLE|requestAnimationFrame|performance|btoa)\b(?!\s*:)/.test(engA.replace(/\/\/.*$/gm, '')));
  check('no forbidden APIs (roundRect, ellipse, confirm, bare remove)', !/\.roundRect\(|\.ellipse\(|window\.confirm|\bconfirm\(\s*['"]|[^a-zA-Z.]remove\(\)|\)\.remove\(\)/.test(script.replace(/\/\/.*$/gm, '')));
  check('the header carries a sound button', /id="btnSound"/.test(html));

  // The engine on its own, outside any page.
  const EA = new Function(engA + '\nreturn ENGINE_AUDIO;')();
  // Browsers throw Illegal invocation when a host timer runs as a method of another object; strict stand ins that
  // refuse any this prove the default timers are called bare.
  const strictTimers = [];
  const EAs = new Function('setInterval', 'clearInterval', 'setTimeout', engA + '\nreturn ENGINE_AUDIO;')(
    function (f, ms) { 'use strict'; if (this !== undefined) throw new TypeError('Illegal invocation'); strictTimers.push(ms); return 1; },
    function () { 'use strict'; if (this !== undefined) throw new TypeError('Illegal invocation'); strictTimers.push('clear'); },
    function () { 'use strict'; if (this !== undefined) throw new TypeError('Illegal invocation'); return 1; });
  check('ENGINE_AUDIO 1.0.0 is frozen to the bottom', EA.version === '1.0.0' && Object.isFrozen(EA) && ['mml', 'instrument', 'waves', 'sfxr', 'motif', 'track', 'util'].every((k) => Object.isFrozen(EA[k])));

  {
    const Fx = makeFake(), ax = EAs.create(new Fx.Ctx(), {});
    let threw = null; try { ax.unlock(); ax.dispose(); } catch (e) { threw = e.message; }
    check('the default timers run bare, as browsers require (no Illegal invocation)', !threw && strictTimers[0] === 25 && strictTimers[1] === 'clear', threw || strictTimers);
  }
  // 1. MML.
  const p1 = EA.mml.parse('o4 a4 c8 d8. r16 e2^4 > c4 << c4 l16 c v9 @3 c+ d- r8 r8');
  const ns = p1.events.map((e) => e.n);
  check('notes, octaves, and accidentals map to MIDI (o4 a is 69)', JSON.stringify(ns) === JSON.stringify([69, 60, 62, null, 64, 72, 48, 48, 49, 49, null]), ns);
  check('lengths, dots, and ties come out in ticks (whole 192)', JSON.stringify(p1.events.slice(0, 5).map((e) => e.d)) === JSON.stringify([48, 24, 36, 12, 144]) && p1.events[7].d === 12, p1.events.map((e) => e.d));
  check('v and @ carry onto the following notes; back to back rests merge', p1.events[8].v === 9 && p1.events[8].i === 3 && p1.events[10].d === 48 && p1.ticks === p1.events.reduce((s, e) => s + e.d, 0));
  const bad = EA.mml.parse('c5 x d^ ^4 o12 v20 @99');
  check('bad tokens and lengths are reported with positions, and parsing continues', bad.errors.length >= 4 && bad.errors.every((e) => typeof e.pos === 'number') && bad.events.length === 2, bad.errors);
  check('a tie with nothing before it is an error', EA.mml.parse('^4 c').errors.length === 1);
  let rtOk = true, rtFail = null;
  const R = EA.util.rng(99);
  for (let k = 0; k < 300 && rtOk; k++) {
    const ev = []; let t = 0, prevRest = false;
    const n = 1 + Math.floor(R() * 20);
    for (let i = 0; i < n; i++) {
      const d = [6, 8, 12, 16, 18, 24, 32, 36, 48, 64, 72, 96, 144, 192, 30, 54, 120][Math.floor(R() * 17)];
      const rest = R() < 0.2 && !prevRest;
      ev.push({ t, d, n: rest ? null : 24 + Math.floor(R() * 80), v: rest ? 12 : 4 + Math.floor(R() * 12), i: null });
      if (rest) ev[ev.length - 1].v = ev.length > 1 ? ev[ev.length - 2].v : 12;
      prevRest = rest; t += d;
    }
    // Rests carry the running volume, as the parser does.
    let vol = 12; ev.forEach((e) => { if (e.n == null) e.v = vol; else vol = e.v; });
    if (ev[0].n == null) ev[0].v = 12;
    const s = EA.mml.serialize(ev), back = EA.mml.parse(s);
    const want = ev.map((e) => [e.t, e.d, e.n]).join('|'), got = back.events.map((e) => [e.t, e.d, e.n]).join('|');
    if (want !== got || back.errors.length) { rtOk = false; rtFail = { s, want, got, err: back.errors }; }
  }
  check('serialize then parse returns the same notes for 300 random voices', rtOk, rtFail);
  check('length decomposition writes 120 ticks as a tie and sums exactly', EA.mml.lengths(120).length >= 2 && EA.mml.lengths(120).reduce((s, x) => s + 192 / parseInt(x, 10) * (x.endsWith('..') ? 1.75 : x.endsWith('.') ? 1.5 : 1), 0) === 120, EA.mml.lengths(120));

  // 2. Instruments, plans, and waves.
  const ni = EA.instrument.normalize({ wave: 'pulse', duty: [9, -1, 2], vol: [20, 3], volLoop: 7, release: 999, arp: [100], pitch: [], vibrato: { delay: -4, depth: 5, rate: 99 } }, 'p1');
  check('normalize clamps tables and drops an out of range loop point', JSON.stringify(ni.duty) === '[3,0,2]' && JSON.stringify(ni.vol) === '[15,3]' && ni.volLoop === null && ni.release === 240 && ni.arp[0] === 48 && ni.vibrato.depth === 2 && ni.vibrato.rate === 20 && ni.vibrato.delay === 0);
  const ins1 = EA.instrument.normalize({ wave: 'pulse', duty: [2], vol: [15, 10, 6], volLoop: 1, release: 4 }, 'p1');
  const pl = EA.instrument.plan(ins1, 69, 15, 1, 0.2);
  const g = (t) => { let v = 0; pl.gain.forEach((x) => { if (x[0] <= t + 1e-9) v = x[1]; }); return v; };
  check('the volume table loops from its loop point while the note holds', g(1) === 1 && Math.abs(g(1 + 1 / 60) - 10 / 15) < 1e-3 && Math.abs(g(1 + 3 / 60) - 10 / 15) < 1e-3 && Math.abs(g(1 + 4 / 60) - 6 / 15) < 1e-3);
  check('the release ramps down over its frames and the plan ends silent', pl.gain[pl.gain.length - 1][1] === 0 && Math.abs(pl.end - (1 + (12 + 4) / 60)) < 1e-9 && g(pl.noteEnd + 1 / 60) < g(pl.noteEnd - 1 / 60));
  const insA = EA.instrument.normalize({ wave: 'pulse', vol: [15], arp: [0, 4, 7], pitch: [-100, 0] }, 'p1');
  const pa = EA.instrument.plan(insA, 60, 15, 0, 0.1);
  const fr = pa.freq.map((x) => Math.round(12 * Math.log2(x[1] / 440) + 69));
  check('the arpeggio loops every frame and the pitch table holds its last value', JSON.stringify(fr.slice(0, 6)) === JSON.stringify([59, 64, 67, 60, 64, 67]), fr);
  const insV = EA.instrument.normalize({ wave: 'pulse', vol: [15], vibrato: { delay: 10, depth: 0.5, rate: 6 } }, 'p1');
  const pv = EA.instrument.plan(insV, 69, 15, 0, 0.5);
  check('vibrato waits for its delay, then bends the pitch both ways', pv.freq.filter((x) => x[0] < 10 / 60).length === 1 && Math.max(...pv.freq.map((x) => x[1])) > 450 && Math.min(...pv.freq.map((x) => x[1])) < 430);
  const pd = EA.instrument.plan(EA.instrument.normalize({ wave: 'pulse', duty: [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3], vol: [15] }, 'p1'), 60, 15, 0, 0.5);
  check('a duty sequence becomes back to back source segments (at most eight)', pd.segments.length === 8 && pd.segments.every((s, i) => i === 0 || Math.abs(s.t0 - pd.segments[i - 1].t1) < 1e-9) && pd.segments[7].t1 === pd.end);
  const c25 = EA.waves.pulse(0.25, 16), c75 = EA.waves.pulse(0.75, 16);
  const mag = (c, k) => Math.hypot(c.real[k], c.imag[k]);
  check('25 and 75 percent pulses share a spectrum (one is the other inverted)', [1, 2, 3, 5].every((k) => Math.abs(mag(c25, k) - mag(c75, k)) < 1e-6));
  const tc = EA.waves.tri(16);
  check('the quantized triangle carries odd harmonics with steps (small even ones)', mag(tc, 1) > 0.5 && mag(tc, 3) > 0.05 && mag(tc, 2) < 0.01);
  const sh = EA.waves.lfsr('short', 186), ln = EA.waves.lfsr('long', 32767 * 2);
  check('short mode noise repeats every 93 steps; long mode every 32767', [...sh.slice(0, 93)].join() === [...sh.slice(93, 186)].join() && [...ln.slice(0, 200)].join() === [...ln.slice(32767, 32967)].join() && [...ln.slice(0, 200)].join() !== [...ln.slice(93, 293)].join());

  // 3. sfxr.
  const SX = EA.sfxr;
  check('every preset category gives valid, deterministic parameters', SX.CATEGORIES.every((c) => { const a = SX.preset(c, 5), b2 = SX.preset(c, 5); return JSON.stringify(a) === JSON.stringify(b2) && SX.PARAMS.every((d) => a[d.key] >= d.min && a[d.key] <= d.max) && SX.WAVES.includes(a.wave); }));
  const r1 = SX.render(SX.preset('hit', 3), 44100, 3), r2 = SX.render(SX.preset('hit', 3), 44100, 3), r3 = SX.render({ wave: 'noise', sustain: 0.2, decay: 0.2 }, 44100, 4), r4 = SX.render({ wave: 'noise', sustain: 0.2, decay: 0.2 }, 44100, 5);
  check('render is deterministic per seed, noise differs by seed, samples stay in range', r1.length > 1000 && [...r1].join() === [...r2].join() && [...r3.slice(0, 500)].join() !== [...r4.slice(0, 500)].join() && [...r1].every((x) => x >= -1 && x <= 1));
  const half = SX.render(SX.preset('ui', 9), 22050, 9), full = SX.render(SX.preset('ui', 9), 44100, 9);
  check('rendering at 22050 Hz gives half the samples', Math.abs(half.length - full.length / 2) <= 1);
  const floor = SX.render({ wave: 'square', freq: 0.5, minFreq: 0.45, slide: -0.6, sustain: 0.9, decay: 0.9 }, 44100, 1), noFloor = SX.render({ wave: 'square', freq: 0.5, slide: -0.6, sustain: 0.9, decay: 0.9 }, 44100, 1);
  check('a frequency floor cuts a falling slide short', floor.length < noFloor.length / 4, [floor.length, noFloor.length]);
  const nm = SX.normalize({ wave: 'bogus', attack: 5, slide: -9, volume: 'x' });
  check('normalize clamps parameters and falls back to square', nm.wave === 'square' && nm.attack === 1 && nm.slide === -1 && nm.volume === 0.5);
  const mu = SX.mutate(SX.preset('magic', 2), 0.3, 11);
  check('mutate stays in range, changes something, and keeps volume', JSON.stringify(mu) !== JSON.stringify(SX.preset('magic', 2)) && SX.PARAMS.every((d) => mu[d.key] >= d.min && mu[d.key] <= d.max) && mu.volume === SX.preset('magic', 2).volume);

  // 4. Motifs.
  const EM = EA.motif;
  const dg = EM.parseDegrees("1 #4 b7, 3'' r 9");
  check('degree tokens read accidentals, octaves, rests, and 8 or 9', !dg.errors.length && JSON.stringify(dg.tokens) === JSON.stringify([{ deg: 0, acc: 0 }, { deg: 3, acc: 1 }, { deg: -1, acc: -1 }, { deg: 16, acc: 0 }, null, { deg: 8, acc: 0 }]), dg.tokens);
  check('bad degree tokens are reported', EM.parseDegrees('1 x 0 #').errors.length === 3);
  const du = EM.parseDurs('2 1 0.5 2/3 3/2');
  check('durations accept decimals and fractions in whole ticks, and reject the rest', !du.errors.length && JSON.stringify(du.durs) === JSON.stringify([2, 1, 0.5, 2 / 3, 1.5]) && EM.parseDurs('1/5 -1 abc').errors.length === 3);
  const mo = { degrees: '1 2 3 4 5 4 3 2 1 r', durs: '2 1 1 2 2 1 1 2 3 1', meter: 4, mode: 'major', key: 'C', tempo: 120 };
  const t1 = EM.realize(mo, { rhythm: 'straight', accomp: 'arp', bass: 'root', drums: 'battle', octave: 5 }, { lead: 'ins_l', harmony: 'ins_h', bass: 'ins_b', kick: 'ins_k', snare: 'ins_s', hat: 'ins_t' });
  const pp = ['A', 'B', 'C', 'D'].map((k) => EA.mml.parse(t1.patterns[k]));
  check('a realized track has four clean patterns of the same whole bar length', pp.every((x) => !x.errors.length && x.ticks === pp[0].ticks) && pp[0].ticks % 192 === 0 && t1.order.length === 1 && t1.loop === 0, pp.map((x) => x.ticks + '/' + x.errors.length));
  check('the melody follows the scale in its key and octave (C major, o5)', JSON.stringify(pp[0].events.filter((e) => e.n != null).map((e) => e.n).slice(0, 5)) === JSON.stringify([72, 74, 76, 77, 79]), pp[0].events.map((e) => e.n));
  const tMin = EM.realize(mo, { mode: 'minor', accomp: 'none', bass: 'none', drums: 'none' }, {}), pMin = EA.mml.parse(tMin.patterns.A).events.filter((e) => e.n != null).map((e) => e.n);
  check('a variation mode re-voices the same degrees (minor third)', pMin[2] === 75 && EA.mml.parse(tMin.patterns.B).events.every((e) => e.n == null) && EA.mml.parse(tMin.patterns.D).events.every((e) => e.n == null));
  check('the tempo scale multiplies the motif tempo', EM.realize(mo, { tempoScale: 1.5 }, {}).tempo === 180 && EM.realize(mo, { tempoScale: 0.5 }, {}).tempo === 60);
  const half2 = EA.mml.parse(EM.realize(mo, { rhythm: 'half', accomp: 'none' }, {}).patterns.A), dot = EA.mml.parse(EM.realize(mo, { rhythm: 'dotted', accomp: 'none' }, {}).patterns.A), sw = EA.mml.parse(EM.realize({ degrees: '1 2 3 4', durs: '1 1 1 1', meter: 4, mode: 'major', key: 'C', tempo: 120 }, { rhythm: 'swing' }, {}).patterns.A);
  check('rhythm transforms: half doubles, dotted pairs go 3 to 1, swing pairs go 2 to 1', half2.events.filter((e) => e.n != null).map((e) => e.d).slice(0, 3).join() === '96,48,48' && dot.events.filter((e) => e.n != null).map((e) => e.d).slice(1, 3).join() === '36,12' && sw.events.filter((e) => e.n != null).map((e) => e.d).slice(0, 2).join() === '32,16', { half: half2.events.map((e) => e.d), dot: dot.events.map((e) => e.d), sw: sw.events.map((e) => e.d) });
  const fragT = EA.mml.parse(EM.realize(mo, { fragment: { start: 0, len: 3, repeat: 3 }, accomp: 'none' }, {}).patterns.A);
  check('a fragment repeats the chosen notes', fragT.events.filter((e) => e.n != null).length === 9 && fragT.events.filter((e) => e.n != null).map((e) => e.n).join() === '72,74,76,72,74,76,72,74,76');
  check('drums use slots 0 to 2 and the slots list names kick, snare, hat', pp[3].events.filter((e) => e.n != null).every((e) => [0, 1, 2].includes(e.i)) && JSON.stringify(t1.slots) === JSON.stringify(['ins_k', 'ins_s', 'ins_t']) && t1.instruments.p1 === 'ins_l');
  check('the last bar resolves to the tonic chord', t1.info.chords[t1.info.chords.length - 1] === 0, t1.info.chords);
  const gm = EM.generate(77), gm2 = EM.generate(77), gt = EM.parseDegrees(gm.degrees).tokens;
  check('generated motifs are deterministic, eight bars of eighths, and end on the tonic', JSON.stringify(gm) === JSON.stringify(gm2) && EM.parseDurs(gm.durs).durs.reduce((s, x) => s + x, 0) === 32 && ((gt[gt.length - 1].deg % 7) + 7) % 7 === 0 && gt.length === EM.parseDurs(gm.durs).durs.length);
  const waltz = EM.realize({ degrees: '1 2 3', durs: '2 2 2', meter: 3, mode: 'major', key: 'D', tempo: 120 }, { accomp: 'waltz', bass: 'walking', drums: 'march' }, {});
  check('a three beat waltz realizes with clean patterns', ['A', 'B', 'C', 'D'].every((k) => !EA.mml.parse(waltz.patterns[k]).errors.length && EA.mml.parse(waltz.patterns[k]).ticks === 144));

  // 5. Tracks and the player on a fake context.
  const comp = EA.track.compile({ tempo: 120, patterns: { A: 'c4 d4' }, order: [['A', 'Z', null, null]], loop: 0 });
  check('compile reports a row that names a missing pattern', comp.errors.length === 1 && /Z/.test(comp.errors[0].message) && comp.rows[0].len === 96);
  const dur = EA.track.duration({ tempo: 120, patterns: { A: 'c1', B: 'c2' }, order: [['A', null, null, null], ['B', null, null, null]], loop: 1 });
  check('duration counts every row once and the loop from its row', Math.abs(dur.once - 3) < 1e-9 && Math.abs(dur.loop - 1) < 1e-9 && dur.loops);
  const F = makeFake(), ctx = new F.Ctx();
  const timers = { set: 0, clear: 0 };
  const au = EA.create(ctx, { manual: true, timers: { setInterval: () => { timers.set++; return 1; }, clearInterval: () => { timers.clear++; }, setTimeout: () => 0 }, lookaheadMs: { desktop: 100, mobile: 175 } });
  const art = { settings: { lookaheadMs: { desktop: 100, mobile: 175 } }, records: { ins_: { ins_lead_t001: { id: 'ins_lead_t001', wave: 'pulse', duty: [1], vol: [15], release: 0 }, ins_bass_t002: { id: 'ins_bass_t002', wave: 'tri', vol: [15], release: 0 } },
    mus_: { mus_trk_t003: { id: 'mus_trk_t003', name: 'Test', kind: 'track', subject: { kind: 'role', ref: 'music:battle' }, tempo: 120, instruments: { p1: 'ins_lead_t001', tri: 'ins_bass_t002' }, slots: [], patterns: { A: 'l4 o4 c d e f', B: 'l2 o2 c g', N: 'l8 o5 c c c c c c c c' }, order: [['A', null, 'B', 'N']], loop: 0 } } } };
  au.load(art);
  check('the player builds a master, a music bus, and an effects bus', F.log.gains.length === 3 && au.state().lookaheadMs === 100);
  check('playRole finds the track by its music role and schedules only inside the lookahead', au.playRole('battle') && F.log.sources.length === 3 && F.log.sources.every((s) => s.t0 < 0.06 + 0.1 + 1e-9), F.log.sources.map((s) => s.t0));
  const p1s = F.log.sources.find((s) => s.kind === 'osc' && Math.abs(s.frequency.events[0][1] - 261.626) < 0.01), trs = F.log.sources.find((s) => s.kind === 'osc' && Math.abs(s.frequency.events[0][1] - 65.406) < 0.01), nzs = F.log.sources.find((s) => s.kind === 'buf');
  check('pulse 1 plays its duty wave, the triangle the triangle wave, noise a looping LFSR buffer', p1s && p1s.wave && p1s.wave.n === 2 && trs && trs.wave && trs.wave.n === 5 && nzs && nzs.loop === true && nzs.buffer.length === 32767 && nzs.playbackRate.events[0][1] === 0.125, { p1: p1s && p1s.wave, tri: trs && trs.wave, nz: nzs && nzs.playbackRate.events });
  let steps = 0; while (ctx.currentTime < 4.5) { ctx.currentTime += 0.025; au.tick(); steps++; }
  const st1 = au.state();
  check('the scheduler keeps ahead as time moves, and the order list loops', st1.playing && st1.position.passes >= 2 && F.log.sources.filter((s) => s.kind === 'osc' && s.frequency.events[0][1] > 200).length >= 8 && F.log.sources.every((s) => s.t0 <= ctx.currentTime + 0.1 + 1e-6), st1.position);
  check('state() reports the notes sounding now on each channel', st1.channels.p1 && st1.channels.tri && st1.channels.p1.n >= 60 && st1.channels.p2 === null);
  // A one shot track ends and calls onEnd.
  let ended = 0;
  au.playTrack({ kind: 'track', tempo: 240, patterns: { A: 'c4 d4' }, order: [['A', null, null, null]], loop: null }, { onEnd: () => { ended++; } });
  check('starting a track fades the previous one out', F.log.gains.some((x) => x.gain.events.some((e) => e[0] === 'ramp' && e[1] === 0)));
  for (let k = 0; k < 80; k++) { ctx.currentTime += 0.025; au.tick(); }
  check('a track with no loop ends and calls onEnd once', ended === 1 && au.state().playing === null);
  // Monophonic cut: a note starting inside the previous note's release cancels it.
  const relArt = { records: { ins_: { ins_r_t9: { id: 'ins_r_t9', wave: 'pulse', vol: [15], release: 60 } } } };
  au.load(relArt);
  const before = F.log.gains.length;
  au.playTrack({ kind: 'track', tempo: 120, instruments: { p1: 'ins_r_t9' }, patterns: { A: 'c8 d8' }, order: [['A', null, null, null]], loop: null });
  for (let k = 0; k < 10; k++) { ctx.currentTime += 0.025; au.tick(); }
  const noteGains = F.log.gains.slice(before + 1);
  check('a note that starts in the previous note\'s release cuts it', noteGains.length >= 2 && noteGains[0].gain.events.some((e) => e[0] === 'cancel'), noteGains.map((x) => x.gain.events.filter((e) => e[0] === 'cancel').length));
  // Effects: cached buffers and a voice cap.
  au.load({ records: { sfx_: { sfx_a_t1: { id: 'sfx_a_t1', seed: 3, params: SX.preset('hit', 3), category: 'hit' } } } });
  const b0 = F.log.buffers;
  au.playSfx('sfx_a_t1'); au.playSfx('sfx_a_t1');
  check('an effect renders once and replays from its cached buffer', F.log.buffers === b0 + 1 && au.state().stats.sfx === 2);
  for (let k = 0; k < 12; k++) au.playSfx({ wave: 'square', freq: 0.2 + k * 0.05, sustain: 0.5, decay: 0.5 });
  check('effects are capped at eight voices (the oldest stops)', F.log.sources.filter((s) => s.kind === 'buf' && s.buffer && s.buffer.length > 1000 && s.stopped).length >= 6);
  au.setVolume({ music: 0.25, sfx: 0.5, muted: true });
  const mg = F.log.gains[0].gain.events, last = mg[mg.length - 1];
  check('setVolume mutes through the master and sets the buses', last[1] === 0 && F.log.gains[1].gain.value === 0.25 && Math.abs(F.log.gains[2].gain.value - 0.5 * 0.55) < 1e-9);
  // Unlock, lifecycle, dispose.
  const F2 = makeFake(), c2 = new F2.Ctx(); c2.state = 'suspended';
  const nav = { audioSession: { type: 'auto' } };
  const a2 = EA.create(c2, { manual: true, navigator: nav });
  a2.unlock();
  check('unlock resumes a suspended context, plays a silent buffer, and sets the iOS audio session to playback', c2.resumed === 1 && nav.audioSession.type === 'playback' && F2.log.sources.some((s) => s.kind === 'buf' && s.buffer.length === 1));
  const F3 = makeFake(), c3 = new F3.Ctx(), made = [];
  const a3 = EA.create(c3, { manual: true, navigator: {}, createAudioElement: () => { const e = { played: 0, play() { this.played++; return Promise.resolve(); }, pause() { this.paused = true; } }; made.push(e); return e; } });
  a3.unlock(); a3.unlock();
  check('without audioSession, unlock starts one looping silent element from a generated WAV', made.length === 1 && made[0].loop === true && made[0].played === 1 && /^data:audio\/wav;base64,UklGR/.test(made[0].src));
  const wav = Buffer.from(EA.silentSrc().split(',')[1], 'base64');
  check('the silent WAV header is well formed', wav.toString('ascii', 0, 4) === 'RIFF' && wav.toString('ascii', 8, 12) === 'WAVE' && wav.readUInt32LE(4) === wav.length - 8 && wav.readUInt32LE(40) === wav.length - 44);
  const doc = { hidden: false, l: {}, addEventListener(n, f) { this.l[n] = f; } };
  a3.attachLifecycle(doc); doc.hidden = true; doc.l.visibilitychange(); doc.hidden = false; doc.l.visibilitychange();
  check('visibilitychange suspends and resumes the context', c3.suspended === 1 && c3.resumed >= 1);
  const a4 = EA.create(new (makeFake().Ctx)(), { coarse: true, lookaheadMs: { desktop: 100, mobile: 175 }, timers: { setInterval: () => { timers.set++; return 7; }, clearInterval: () => { timers.clear++; }, setTimeout: () => 0 } });
  a4.unlock();
  check('touch screens get the mobile lookahead; unlock starts the 25 ms timer and dispose clears it', a4.state().lookaheadMs === 175 && a4.state().timer && (a4.dispose(), timers.clear === 1) && a4.state().timer === false);
  a3.dispose();
  check('dispose pauses the silent element', made[0].paused === true);

  // 6. The forge.
  const fake = makeFake();
  let { win, errors } = boot(APP147, { url: URL147, setup(w) { w.AudioContext = fake.Ctx; w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; w.HTMLMediaElement.prototype.pause = function () {}; } });
  await wait(80);
  const Kit = win.Kit, ART = win.ART, A = ART.audio, d = win.document;
  check('boots with no page errors', !errors.length, errors.slice(0, 2));
  Kit.bundle.load(win.ART_DEMO.bundle());
  let b = Kit.bundle.current();
  const rep = ART.quickBuild.run(b), au6 = rep.steps.audio;
  const els = b.charter.ruleset.elements.length, abls = Object.values(b.rules.abl_).filter((a) => a.kind !== 'passive').length, chars = Object.keys(b.rules.chr_).length;
  const need = ART.musicRoles(b).filter((r) => r.required);
  check('Quick Build makes 12 instruments, 23 cue sounds, one per element and ability, three kinds of motif, and a track per required role', A.instruments(b).length === 12 && A.sounds(b).filter((r) => r.subject.kind === 'role').length === 23 && A.sounds(b).filter((r) => r.subject.kind === 'element').length === els && A.sounds(b).filter((r) => r.subject.kind === 'abl').length === abls && A.motifs(b).length === chars + 2 && need.every((r) => A.trackFor(b, r.key)), { au6, els, abls, chars, tracks: A.tracks(b).length, need: need.length });
  const rep2 = ART.quickBuild.run(b);
  check('a second Quick Build changes nothing in audio', rep2.steps.audio.created === 0 && rep2.steps.audio.refreshed === 0, rep2.steps.audio);
  const allIds = [].concat(A.instruments(b), A.sounds(b), A.music(b)).map((r) => r.id);
  check('every audio record has a valid minted ID and an envelope', allIds.every((id) => Kit.ids.isValid(id)) && [].concat(A.instruments(b), A.sounds(b), A.music(b)).every((r) => r.subject && ['default', 'procedural'].includes(r.origin) && typeof r.seed === 'number'));
  let v = Kit.validate(b), audioIssues = v.issues ? v.issues : null;
  const vsum = Kit.validate.summary(v);
  check('the demo validates clean with audio', !vsum.errors && !vsum.broken, vsum);
  const victory = A.trackFor(b, 'victory'), defeat = A.trackFor(b, 'defeat');
  check('victory opens with a fanfare row and loops into its body; defeat plays once', victory.order.length === 2 && victory.loop === 1 && defeat.loop === null && !ENGINE_AUDIO_ERR(win, victory) && !ENGINE_AUDIO_ERR(win, defeat));
  const fields = ART.musicRoles(b).filter((r) => r.key.indexOf('field:') === 0).map((r) => A.trackFor(b, r.key));
  check('each continent gets its own field track', fields.length >= 2 && fields.every(Boolean) && new Set(fields.map((t) => t.patterns.A)).size === fields.length);
  const bat = A.trackFor(b, 'battle'), hero = A.motifFor(b, 'chr', Object.keys(b.rules.chr_).sort()[0]);
  check('battle is the lead character\'s motif in its battle variation; tracks name the default kit', bat.derivedFrom.motif === hero.id && bat.derivedFrom.variation === 'battle' && bat.instruments.p1 === A.insFor(b, 'lead').id && bat.slots[1] === A.insFor(b, 'snare').id);
  // Validator.
  function issues(bb) { const res = Kit.validate(bb), out = []; ['errors', 'warnings', 'broken'].forEach((k) => (res[k] || []).forEach((x) => out.push(x))); return out; }
  const bad6 = JSON.parse(JSON.stringify(b)), R6 = bad6.art.records;
  const i0 = Object.values(R6.ins_)[0]; i0.wave = 'square'; i0.vol = [99]; i0.volLoop = 5;
  const s0 = Object.values(R6.sfx_)[0]; s0.params.freq = 4; s0.category = 'boom';
  const m0 = Object.values(R6.mus_).find((r) => r.kind === 'motif'); m0.degrees = '1 2 x'; m0.durs = '1';
  const tAll = Object.values(R6.mus_).filter((r) => r.kind === 'track');
  tAll[0].order.push(['ZZ', null, null, null]); tAll[0].loop = 9; tAll[1].subject.ref = 'music:nowhere'; tAll[2].subject.ref = tAll[3].subject.ref;
  tAll[4].instruments.tri = A.insFor(b, 'harmony').id;
  const msgs = issues(bad6).filter((x) => /^(ins|sfx|mus)_/.test(x.recordId)).map((x) => (x.level || '') + ':' + x.fieldPath + ':' + x.message);
  const has = (re) => msgs.some((m) => re.test(m));
  check('art.audio catches instrument, sound, motif, and track errors', has(/wave:Wave must be/) && has(/vol:The volume table/) && has(/volLoop:/) && has(/params.freq:/) && has(/category:/) && has(/degrees:Token x/) && has(/durs:There are 3 degrees/) && has(/patterns.ZZ:.*ZZ/) && has(/loop:The loop point/), msgs);
  check('and warns about unknown roles, doubled roles, and wrong wave instruments', has(/subject.ref:No music role is named nowhere/) && has(/already has a track/) && has(/instruments.tri:This pulse instrument plays as tri/), msgs);
  // Edits survive, motifs re-derive their tracks.
  const hit = A.cueSfx(b, 'hit'); hit.params.freq = 0.9; hit.origin = 'user';
  const title = A.trackFor(b, 'title'); title.tempo = 77; title.origin = 'user';
  const theme = A.motifFor(b, 'role', 'motif:theme'), townBefore = A.trackFor(b, 'town').patterns.A;
  theme.degrees = '1 3 5 3 1 r'; theme.durs = '2 2 2 2 4 4'; theme.origin = 'user';
  ART.quickBuild.run(b);
  check('edited sounds, tracks, and motifs survive Quick Build', A.cueSfx(b, 'hit').params.freq === 0.9 && A.trackFor(b, 'title').tempo === 77 && A.motifFor(b, 'role', 'motif:theme').degrees === '1 3 5 3 1 r');
  check('generated tracks re-derive from an edited motif', A.trackFor(b, 'town').patterns.A !== townBefore && A.trackFor(b, 'town').derivedFrom.motif === theme.id);
  // Retire and restore.
  const step = A.cueSfx(b, 'step'); A.retire(b, step); ART.quickBuild.run(b);
  check('a deleted default stays deleted through Quick Build and comes back on restore', !A.cueSfx(b, 'step') && b.art.settings.retired.includes('sfx:step') && (A.restore(b, 'sfx:step'), !!A.cueSfx(b, 'step')));
  // Cue resolution.
  const ablIds = Object.keys(b.rules.abl_), spell = Object.values(b.rules.abl_).find((a) => a.element), phys = Object.values(b.rules.abl_).find((a) => !A.magicKind(a) && !a.element);
  const memo = {};
  A.resolve('sfx', 'action', { abl: spell.id, element: spell.element }, memo, b);
  const cCast = A.resolve('sfx', 'cast', { marker: true }, memo, b), cRel = A.resolve('sfx', 'release', { marker: true }, memo, b);
  check('a spell\'s cast marker plays the cast cue and its release the ability\'s own sound', cCast.sfx === A.cueSfx(b, 'cast').id && cRel.sfx === A.abilitySfx(b, spell.id).id);
  const memo2 = {};
  A.resolve('sfx', 'action', { abl: phys ? phys.id : '_attack' }, memo2, b);
  check('a physical attack swings on cast and is silent on release', A.resolve('sfx', 'cast', {}, memo2, b).sfx === A.cueSfx(b, 'swing').id && A.resolve('sfx', 'release', {}, memo2, b) === null);
  const memo3 = {};
  check('an item plays the item cue and skips the cast markers', A.resolve('sfx', 'item', {}, memo3, b).sfx === A.cueSfx(b, 'item').id && A.resolve('sfx', 'cast', {}, memo3, b) === null);
  check('hit, crit, miss, death, ko map to their cues; music cues pass through; stop fades', A.resolve('sfx', 'crit', {}, {}, b).sfx === A.cueSfx(b, 'crit').id && A.resolve('sfx', 'death', {}, {}, b).sfx === A.cueSfx(b, 'death').id && A.resolve('music', 'victory', {}, {}, b).music === 'victory' && A.resolve('music', 'stop', {}, {}, b).stop === 400);
  const touchRec = ART.iface.get(b, 'touch'); touchRec.sfx.confirm = A.cueSfx(b, 'jump').id;
  check('the touch skin\'s linked confirm sound wins over the default cue', A.resolve('ui', 'confirm', {}, {}, b).sfx === A.cueSfx(b, 'jump').id && A.resolve('ui', 'move', {}, {}, b).sfx === A.cueSfx(b, 'ui.move').id);
  touchRec.sfx.confirm = null;

  // 7. The player in the page: unlock on a gesture, cues, battle music.
  A.manual = true;
  check('nothing plays before the first gesture', A.player() === null && A.cue('sfx', 'hit', {}) && A.player() === null);
  d.dispatchEvent(new win.Event('pointerup', { bubbles: true }));
  const P = A.player();
  check('the first pointerup creates the context and the player', !!P && P.state().unlocked && fake.log.gains.length >= 3);
  const nb = fake.log.buffers;
  A.cue('sfx', 'hit', {});
  check('a presenter cue plays its sound', fake.log.buffers > nb && P.state().stats.sfx >= 1 && /sfx:hit=sfx_/.test(A.log().join(' ')));
  A.cue('music', 'victory', {});
  check('a music cue starts the role\'s track', P.state().playing && P.state().playing.role === 'victory');
  const PT = ART.WS.playtest, WB = ART.WS.battle;
  Kit.go('playtest'); PT.ui.sub = 'battle'; WB.ui.mode = 'demo'; WB.reset(); Kit.rerender();
  const lv = WB.live();
  check('the battle view starts the battle role', P.state().playing && P.state().playing.role === 'battle');
  const s0x = P.state().stats.sfx;
  for (let i = 0; i < 1600 && !lv.P.ended(); i++) lv.step(16);
  check('the scripted demo plays sounds through the presenter and ends on the victory music', P.state().stats.sfx > s0x + 5 && P.state().playing && P.state().playing.role === 'victory', { sfx: P.state().stats.sfx - s0x, playing: P.state().playing, log: A.log() });
  PT.ui.sub = 'window'; Kit.rerender();
  const wcv = d.querySelector('#ws .a7-bt-cv');
  wcv.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  wcv.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  check('the window preview plays move and confirm', A.log().slice(-2).join(' ').indexOf('ui:move') >= 0 && A.log().slice(-1)[0].indexOf('ui:confirm') === 0, A.log());

  // 8. The Sound tab.
  Kit.go('sound');
  const WS = ART.WS.sound;
  let viewsOk = true;
  for (const sub of ['instruments', 'effects', 'motifs', 'score', 'jukebox']) {
    WS.ui.sub = sub; Kit.rerender();
    if (!d.querySelector('#ws .a7-subpanel').children.length) viewsOk = false;
  }
  check('every Sound view renders', viewsOk && !errors.length, errors.slice(0, 2));
  WS.ui.sub = 'score'; Kit.rerender();
  const rows = d.querySelectorAll('#ws .a7-score tbody tr');
  check('Score by role lists every role with a play button for each track', rows.length === ART.musicRoles(b).length && d.querySelectorAll('#ws .a7-score .btn-icon').length >= need.length * 2);
  const playBtn = d.querySelector('#ws .a7-score tbody tr .btn-icon');
  playBtn.click();
  check('a role\'s play button plays its track', P.state().playing && P.state().playing.role === ART.musicRoles(b)[0].key);
  WS.openTrack(A.trackFor(b, 'dungeon').id);
  const tempo = [...d.querySelectorAll('.drawer input[type="range"]')][0];
  tempo.value = '99'; tempo.dispatchEvent(new win.Event('change'));
  check('the track drawer edits tempo and marks the track edited', A.trackFor(b, 'dungeon').tempo === 99 && A.trackFor(b, 'dungeon').origin === 'user');
  const patArea = d.querySelector('.drawer textarea');
  patArea.value = 'c4 q4'; patArea.dispatchEvent(new win.Event('input'));
  check('pattern text shows its parse problems as you type', /problem/.test(d.querySelector('.drawer').textContent));
  d.querySelector('.drawer .dlg-head .btn').click();
  WS.openSound(A.cueSfx(b, 'heal').id);
  const sb = fake.log.buffers;
  [...d.querySelectorAll('.drawer .btn')].find((x) => /Mutate/.test(x.textContent)).click();
  check('Mutate changes the sound, stores how, marks it edited, and plays it', A.cueSfx(b, 'heal').origin === 'user' && A.cueSfx(b, 'heal').lastMutate && fake.log.buffers > sb && d.querySelector('.drawer canvas'));
  [...d.querySelectorAll('.drawer .btn')].find((x) => /Reset to default/.test(x.textContent)).click();
  check('Reset to default restores the cue', A.cueSfx(b, 'heal').origin === 'default' && JSON.stringify(A.cueSfx(b, 'heal').params) === JSON.stringify(ENGINE_SFX_NORM(win, A.CUES.find((c) => c.key === 'heal').p)));
  d.querySelector('.drawer .dlg-head .btn').click();
  WS.openInstrument(A.insFor(b, 'lead').id);
  const volIn = [...d.querySelectorAll('.drawer input[type="text"]')].find((x) => x.value === '15 14 13 12 12 11');
  volIn.value = '15 12 9 6'; volIn.dispatchEvent(new win.Event('change'));
  check('the instrument drawer edits the volume table', JSON.stringify(A.insFor(b, 'lead').vol) === '[15,12,9,6]' && A.insFor(b, 'lead').origin === 'user');
  const nKeys = d.querySelectorAll('.drawer .a7-keys .btn').length, srcs = fake.log.sources.length;
  d.querySelector('.drawer .a7-keys .btn').click();
  check('its keyboard plays notes on the instrument', nKeys === 8 && fake.log.sources.length > srcs);
  const volBad = [...d.querySelectorAll('.drawer input[type="text"]')].find((x) => x.value === '15 12 9 6');
  volBad.value = '15 99'; volBad.dispatchEvent(new win.Event('change'));
  check('a bad table is refused and the record is unchanged', JSON.stringify(A.insFor(b, 'lead').vol) === '[15,12,9,6]');
  d.querySelector('.drawer .dlg-head .btn').click();
  const chrMotif = A.motifFor(b, 'chr', Object.keys(b.rules.chr_).sort()[1]);
  WS.openMotif(chrMotif.id);
  const drums = [...d.querySelectorAll('.drawer select')].find((s) => [...s.options].some((o) => o.value === 'ballad') && s.closest('label').textContent.indexOf('Drums') === 0);
  drums.value = 'march'; drums.dispatchEvent(new win.Event('change'));
  check('the motif drawer edits a variation recipe', chrMotif.variations.field.drums === 'march' && chrMotif.origin === 'user');
  [...d.querySelectorAll('.drawer .btn')].find((x) => /Play field/.test(x.textContent)).click();
  check('and plays the variation', P.state().playing && !P.state().playing.ended);
  d.querySelector('.drawer .dlg-head .btn').click();
  check('jump goes to the Sound tab for ins_, sfx_, and mus_', Kit.jump(A.insFor(b, 'bass').id) !== false && WS.ui.sub === 'instruments' && Kit.jump(A.cueSfx(b, 'miss').id) !== false && WS.ui.sub === 'effects' && Kit.jump(theme.id) !== false && WS.ui.sub === 'motifs' && Kit.jump(bat.id) !== false && WS.ui.sub === 'score');
  // Your own role.
  WS.ui.sub = 'score'; Kit.rerender();
  const lab = [...d.querySelectorAll('#ws .a7-text input')].pop();
  lab.value = 'Mystery'; lab.dispatchEvent(new win.Event('change'));
  [...d.querySelectorAll('#ws .btn')].find((x) => /Add role/.test(x.textContent)).click();
  const myRow = [...d.querySelectorAll('#ws .a7-score tbody tr')].find((tr) => /user:mystery/.test(tr.textContent)), mk = myRow && [...myRow.querySelectorAll('.btn')].find((x) => /Make track/.test(x.textContent));
  if (mk) mk.click();
  else console.log('no make track button', ART.musicRoles(b).map((r) => r.key).join(' '));
  check('a role of your own can be added, is optional, and gets a track on request', ART.musicRoles(b).some((r) => r.key === 'user:mystery' && !r.required) && !!A.trackFor(b, 'user:mystery'));
  // Header button.
  const sbtn = d.getElementById('btnSound');
  sbtn.click();
  check('the header button mutes, persists the choice, and shows it', A.prefs().muted && JSON.parse(win.localStorage.getItem('art147:audio')).muted === true && sbtn.getAttribute('aria-pressed') === 'true');
  sbtn.click();
  check('and turns sound back on', !A.prefs().muted && sbtn.getAttribute('aria-pressed') === 'false');
  // Interface touch skin links.
  Kit.go('interface'); ART.WS.interface.ui.sub = 'touch'; Kit.rerender();
  check('the touch skin view links menu sounds', [...d.querySelectorAll('#ws .a7-sel span')].filter((s) => /sound$/.test(s.textContent)).length === 4);
  v = Kit.validate.summary(Kit.validate(b));
  check('the bundle still validates clean after the edits', !v.errors && !v.broken, v);
  check('no page errors through the views', !errors.length, errors.slice(0, 3));

  // 9. Self test, size, export, and the Day 146 round trip.
  const st = win.ART_DEMO.selfTest();
  check('every fixture with a Charter scores every required role with clean MML', st.every((r) => r.key === 'F0' || (r.audio && r.audio.roles === r.audio.required && !r.audio.errors && r.audio.tracks >= r.audio.required)), st.map((r) => r.key + ':' + (r.audio ? r.audio.roles + '/' + r.audio.required + ' e' + r.audio.errors : '-')).join(' '));
  check('every fixture still validates with no errors', st.every((r) => !r.validation.errors && !r.validation.broken), st.map((r) => r.key + ':' + JSON.stringify(r.validation)).join(' '));
  const f2 = st.find((r) => r.key === 'F2');
  check('F2 (eight characters, twelve elements, six continents, three endings) builds and renders its sounds in reasonable time', f2.audio.motifs === 10 && f2.audio.renderMs < 4000 && f2.quickBuildMs < 6000, f2.audio);
  const audioBytes = ['ins_', 'sfx_', 'mus_'].reduce((s, p) => s + JSON.stringify(Kit.bundle.current().art.records[p] || {}).length, 0);
  check('the audio records stay small (under 90 KB for the demo)', audioBytes < 90000, audioBytes);
  const dr = Kit.buildExport('draft');
  const rt = await in146(dr.files[0].text, (w, K) => ({ mus: Object.keys(K.bundle.current().art.records.mus_ || {}).length, kept: JSON.stringify(K.bundle.current().art) === JSON.stringify(JSON.parse(dr.files[0].text).art) }));
  check('146 imports a 147 draft with audio records: hash ok, no errors, art untouched', rt.matches && !rt.summary.errors && !rt.summary.broken && rt.mus === A.music(Kit.bundle.current()).length && rt.kept, rt);
  const man = JSON.parse(dr.files[1].text);
  check('the manifest counts ins_, sfx_, and mus_', man.counts.ins_ === A.instruments(Kit.bundle.current()).length && man.counts.sfx_ > 23 && man.counts.mus_ > 10, man.counts);
  win.close();

  const pass = results.filter((r) => r.ok).length;
  results.forEach((r) => console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '  ' + String(JSON.stringify(r.detail)).slice(0, 900))));
  console.log('\nSelf test (audio):');
  st.forEach((r) => console.log('  ' + r.key.padEnd(5) + ' ' + (r.audio ? r.audio.roles + '/' + r.audio.required + ' roles, ' + r.audio.tracks + ' tracks, ' + r.audio.notes + ' notes, ' + r.audio.seconds + ' s, ' + r.audio.sounds + ' sounds (' + r.audio.sfxSeconds + ' s) rendered in ' + r.audio.renderMs + ' ms' : 'no audio')));
  console.log('Audio records in the demo: ' + audioBytes + ' bytes');
  console.log('\n' + pass + ' of ' + results.length + ' passed');
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'phase6-report.json'), JSON.stringify({ date: new Date().toISOString(), pass, total: results.length, results, audioBytes, selfTest: st.map((r) => ({ key: r.key, audio: r.audio, validation: r.validation })) }, null, 2));
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

function ENGINE_AUDIO_ERR(win, track) { return win.ENGINE_AUDIO.track.compile(track).errors.length; }
function ENGINE_SFX_NORM(win, p) { return win.ENGINE_AUDIO.sfxr.normalize(p); }
