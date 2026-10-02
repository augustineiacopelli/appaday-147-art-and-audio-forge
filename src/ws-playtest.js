// === WS:PLAYTEST BEGIN ===
(function () {
  'use strict';
  // The Playtest tab. Phase 4 brings the test room: a small world generated from the bundle's own tilesets and climate
  // keys, with a town house and a dungeon ruin, walked by a party sprite. Collision, encounters, swimming, damage
  // floors, and the above layer all come from tile flags. Phase 5 adds the touch skin here; WS:BATTLE adds the Battle
  // and Window preview views.
  var U = Kit.util, el = U.el, esc = U.esc, ER = ENGINE_RENDER, ET = ER.tiles;
  var S = ART.sprites, P = ART.palette, M = ART.motion, TL = ART.tiles, W = ART.ui;
  ART.WS = ART.WS || {};
  var SUBS = [['room', 'Test room'], ['battle', 'Battle'], ['window', 'Window preview']];
  var ui = { sub: 'room', seed: 7, sprite: null, weather: '', flags: false, touch: false };
  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  var KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
  var STEP_MS = 190;
  function cur() { return Kit.bundle.current(); }
  function res() { var r = (cur().charter.specs || {}).resolution || {}; return { w: Number(r.w) || 256, h: Number(r.h) || 224 }; }
  function charterScale() { return Math.max(2, Math.min(6, Math.floor(720 / res().w))); }

  // ---------------------------------------------------------------- the walker (pure state, testable without a canvas)
  // createWalker(art, map, start) -> {x, y, dir, moving, step(dt, held), state()}. One cell per step, eased between
  // cells; a step is taken only onto a cell whose flags include passable.
  function createWalker(art, map, start, hooks) {
    hooks = hooks || {};
    var w = { x: start[0], y: start[1], fx: start[0], fy: start[1], dir: 'down', moving: null, steps: 0, blocked: null, walkT: 0 };
    w.canEnter = function (x, y) { return !!(ET.flagsAt(art, map, x, y) & ET.FLAGS.passable); };
    w.step = function (dt, held) {
      if (w.moving) {
        w.moving.t += dt; w.walkT += dt;
        var p = Math.min(1, w.moving.t / STEP_MS);
        w.fx = w.moving.from[0] + (w.x - w.moving.from[0]) * p; w.fy = w.moving.from[1] + (w.y - w.moving.from[1]) * p;
        if (p >= 1) { w.moving = null; w.fx = w.x; w.fy = w.y; w.steps++; if (hooks.arrive) hooks.arrive(w, ET.flagsAt(art, map, w.x, w.y)); }
      }
      if (!w.moving && held) {
        w.dir = held;
        var d = DIRS[held], nx = w.x + d[0], ny = w.y + d[1];
        if (w.canEnter(nx, ny)) { w.moving = { from: [w.x, w.y], t: 0 }; w.x = nx; w.y = ny; w.blocked = null; }
        else { w.blocked = [nx, ny]; }
      }
      if (!w.moving && !held) w.walkT = 0;
      return w;
    };
    return w;
  }

  // ---------------------------------------------------------------- the test room
  var room = null;
  function partySprites(b) { return S.sprites(b).filter(function (s) { return s.mode === 'field' && s.kind !== 'enemy'; }); }
  function sprite(b) { var s = ui.sprite && ART.records.get(ui.sprite, b); return s && s.mode === 'field' ? s : partySprites(b).filter(function (x) { return x.kind === 'character'; })[0] || partySprites(b)[0] || null; }
  function cellName(b, map, x, y) {
    var i = y * map.w + x, d = map.deco[i], g = map.ground[i];
    function nm(ref) { var r = ET.resolve(b.art, ref); return r ? (r.biome ? r.til.name : (r.item.label || r.key) + ' (' + r.til.name + ')') : null; }
    return [nm(d), nm(g)].filter(Boolean).join(' on ') || 'nothing';
  }
  function viewRoom(host, repaint) {
    var b = cur();
    if (!TL.biomes(b).length) {
      var p0 = el('section', 'panel');
      p0.innerHTML = '<h3 class="section-h">Nothing to walk on yet</h3><p class="muted">Quick Build makes the biome and interior tilesets the test room is generated from.</p>';
      p0.appendChild(W.button('Quick Build', 'spark', 'btn-primary', function () { ART.openQuickBuild(); }));
      host.appendChild(p0);
      return;
    }
    var T = S.tileSize(b), R = res(), map = TL.room(b, ui.seed, Math.max(24, Math.ceil(R.w / T) + 16), Math.max(20, Math.ceil(R.h / T) + 12));
    var spr = sprite(b), walkAnm = spr ? M.animFor(spr, 'walk', b) : null, wov = ui.weather ? ART.records.get(ui.weather, b) : null;
    var st = { held: null, keyHeld: null, msg: '', msgT: 0, flash: 0, hp: 10, encounters: 0, wx: null, pressed: {} };
    var EU = ER.ui, tkRec = ART.iface ? ART.iface.get(b, 'touch') : null, tkLayout = EU.touch.layout(ART.iface ? ART.iface.scheme(b, tkRec) : 'dpad', R.w, R.h, tkRec || {});
    var walker = createWalker(b.art, map, map.start, { arrive: function (w, flags) {
      if (flags & ET.FLAGS.damage) { st.flash = 1; st.hp = Math.max(0, st.hp - 1); say(st.hp ? 'Ouch. The floor hurts (' + st.hp + ' HP left).' : 'Down to 0 HP. In the game this would be a game over.'); }
      if (flags & ET.FLAGS.encounter) { var roll = ENGINE_RENDER.util.hash32(ui.seed + ':' + w.steps + ':' + w.x + ':' + w.y) % 18; if (roll === 0) { st.encounters++; st.flash = 0.6; say('An encounter! Battle on the Battle view.'); } }
      hud();
    } });
    room = { map: map, walker: walker, state: st };
    function say(t) { st.msg = t; st.msgT = 1800; hud(); }

    var panel = el('section', 'panel a7-room');
    var ctl = el('div', 'a7-ctl');
    var ps = partySprites(b);
    if (ps.length) ctl.appendChild(W.select('Walker', (spr || {}).id, ps.map(function (s) { return [s.id, s.name.replace(/ \(field\)$/, '')]; }), function (v) { ui.sprite = v; repaint(); }));
    var wovs = M.overlays(b);
    if (wovs.length) ctl.appendChild(W.select('Weather', ui.weather, [['', 'None']].concat(wovs.map(function (o) { return [o.id, o.name.replace(/ overlay$/, '')]; })), function (v) { ui.weather = v; repaint(); }));
    ctl.appendChild(W.toggle('Show flags', ui.flags, function (on) { ui.flags = on; }));
    ctl.appendChild(W.toggle('Touch skin', ui.touch, function (on) { ui.touch = on; st.pressed = {}; }));
    ctl.appendChild(W.button('New world', 'spark', 'btn-ghost', function () { ui.seed = (ui.seed * 7 + 13) % 100000 + 1; repaint(); }));
    panel.appendChild(ctl);

    var stageWrap = el('div', 'a7-room-stage');
    var cv = M.stage(R.w, R.h, charterScale(), function (ctx, t, dt) {
      walker.step(dt, st.held || st.keyHeld);
      if (st.msgT > 0) { st.msgT -= dt; if (st.msgT <= 0) { st.msg = ''; hud(); } }
      var cache = S.cache(), Wpx = map.w * T, Hpx = map.h * T;
      var px = walker.fx * T + T / 2, py = walker.fy * T + T / 2;
      var cx = Wpx <= R.w ? (Wpx - R.w) / 2 : Math.max(0, Math.min(Wpx - R.w, px - R.w / 2)), cy = Hpx <= R.h ? (Hpx - R.h) / 2 : Math.max(0, Math.min(Hpx - R.h, py - R.h / 2));
      cx = Math.round(cx); cy = Math.round(cy);
      var cam = { x: cx, y: cy, w: R.w, h: R.h };
      ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, R.w, R.h);
      ET.drawMap(ctx, cache, map, cam, t);
      if (spr) ER.draw.sprite(ctx, cache, spr.id, walker.moving || (st.held || st.keyHeld) ? walkAnm : null, walker.walkT, Math.round(px - cx), Math.round(walker.fy * T + T - 1 - cy), { dir: walker.dir, pose: 'stand' });
      ET.drawMap(ctx, cache, map, cam, t, { layer: 'above' });
      if (wov) { if (!st.wx) st.wx = ER.weather.create(wov, R.w, R.h, 11, { entries: P.entries(b), unit: Math.max(1, Math.round(T / 16)) }); ER.weather.step(st.wx, dt); ER.weather.draw(ctx, st.wx); }
      if (ui.flags) {
        var x0 = Math.floor(cx / T), y0 = Math.floor(cy / T);
        for (var yy = y0; yy <= y0 + Math.ceil(R.h / T); yy++) for (var xx = x0; xx <= x0 + Math.ceil(R.w / T); xx++) {
          var f = ET.flagsAt(b.art, map, xx, yy);
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = !(f & 1) ? (f & 4 ? '#3a8ad8' : '#d83a3a') : f & 8 ? '#e8a020' : f & 2 ? '#40c060' : '#ffffff';
          if (!(f & 1) || f & 10) ctx.fillRect(xx * T - cx + 1, yy * T - cy + 1, T - 2, T - 2);
          ctx.globalAlpha = 1;
        }
      }
      if (ui.touch) EU.touch.draw(ctx, tkLayout, tkRec || {}, { pressed: st.pressed, entries: P.entries(b), font: ART.iface ? ART.iface.get(b, 'font') : null });
      if (st.flash > 0) { ctx.globalAlpha = Math.min(0.5, st.flash * 0.5); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, R.w, R.h); ctx.globalAlpha = 1; st.flash = Math.max(0, st.flash - dt / 300); }
    }, 'Test room. Use the arrow keys, WASD, the direction pad, or hold a finger on the map to walk.');
    cv.tabIndex = 0;
    cv.classList.add('a7-room-cv');
    stageWrap.appendChild(cv);
    panel.appendChild(stageWrap);

    // Hold on the map: walk toward the finger along its larger axis.
    function aim(e) {
      var r = cv.getBoundingClientRect(), lx = (e.clientX - r.left) / (r.width || 1) * R.w, ly = (e.clientY - r.top) / (r.height || 1) * R.h;
      var Wpx = map.w * T, Hpx = map.h * T, px = walker.fx * T + T / 2, py = walker.fy * T + T / 2;
      var cx = Wpx <= R.w ? (Wpx - R.w) / 2 : Math.max(0, Math.min(Wpx - R.w, px - R.w / 2)), cy = Hpx <= R.h ? (Hpx - R.h) / 2 : Math.max(0, Math.min(Hpx - R.h, py - R.h / 2));
      var dx = lx - (px - cx), dy = ly - (py - cy);
      st.held = Math.abs(dx) < T / 2 && Math.abs(dy) < T / 2 ? null : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    }
    // With the touch skin on, presses go to its controls: the pad or stick walks, A and B and Menu report, and a tap
    // elsewhere (tap and hybrid schemes) walks toward the finger.
    function skin(e) {
      var r = cv.getBoundingClientRect(), lx = (e.clientX - r.left) / (r.width || 1) * R.w, ly = (e.clientY - r.top) / (r.height || 1) * R.h, h = EU.touch.hit(tkLayout, lx, ly);
      st.pressed = {};
      if (!h) { st.held = null; return; }
      if (h.key === 'tap') { aim(e); return; }
      if (h.key === 'dpad' || h.key === 'stick') { st.held = h.dir || null; st.pressed[h.key] = h.key === 'stick' ? { vx: h.vx, vy: h.vy } : (h.dir || true); return; }
      st.held = null; st.pressed[h.key] = true;
      if (st.lastBtn !== h.key) { st.lastBtn = h.key; say(h.key === 'menu' ? 'Menu pressed.' : 'Button ' + h.key.toUpperCase() + ' pressed.'); }
    }
    cv.addEventListener('pointerdown', function (e) { if (cv.setPointerCapture) try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } cv.focus(); if (ui.touch) skin(e); else aim(e); e.preventDefault(); });
    cv.addEventListener('pointermove', function (e) { if (e.buttons || e.pointerType === 'touch') { if (ui.touch) { if (st.held !== null || e.buttons || Object.keys(st.pressed).length) skin(e); } else if (st.held !== null || e.buttons) aim(e); } });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { cv.addEventListener(n, function () { st.held = null; st.pressed = {}; st.lastBtn = null; }); });

    var below = el('div', 'a7-room-below');
    var pad = el('div', 'a7-dpad');
    pad.setAttribute('role', 'group'); pad.setAttribute('aria-label', 'Direction pad');
    [['up', 'Up', '&#9650;'], ['left', 'Left', '&#9664;'], ['right', 'Right', '&#9654;'], ['down', 'Down', '&#9660;']].forEach(function (d) {
      var bt = el('button', 'btn a7-dpad-' + d[0], d[2]); bt.type = 'button'; bt.setAttribute('aria-label', 'Walk ' + d[1].toLowerCase());
      bt.addEventListener('pointerdown', function (e) { st.held = d[0]; if (bt.setPointerCapture) try { bt.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } e.preventDefault(); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { bt.addEventListener(n, function () { if (st.held === d[0]) st.held = null; }); });
      bt.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); walker.step(0, d[0]); } });
      pad.appendChild(bt);
    });
    below.appendChild(pad);
    var info = el('div', 'a7-room-hud a7-grow');
    info.setAttribute('aria-live', 'polite');
    below.appendChild(info);
    panel.appendChild(below);
    host.appendChild(panel);
    function hud() {
      if (!info.isConnected && room && room.walker !== walker) return;
      var f = ET.flagsAt(b.art, map, walker.x, walker.y);
      info.innerHTML = '<div class="a7-name"><strong>' + esc(cellName(b, map, walker.x, walker.y)) + '</strong> <span class="muted a7-small">cell ' + walker.x + ', ' + walker.y + '</span></div>' +
        '<div class="a7-small">' + (TL.FLAG_LIST.filter(function (x) { return f & x[1]; }).map(function (x) { return W.chip(x[2], x[0] === 'damage' ? 'warning' : 'muted'); }).join(' ') || '') + '</div>' +
        '<div class="muted a7-small">' + esc(walker.steps + ' steps, ' + st.encounters + ' encounters, ' + st.hp + ' HP') + (st.msg ? ' &middot; <strong>' + esc(st.msg) + '</strong>' : '') + '</div>';
    }
    hud();
    var lastCell = '';
    var poll = setInterval(function () { if (!cv.isConnected) { clearInterval(poll); return; } var k = walker.x + ',' + walker.y + (walker.blocked ? '!' : ''); if (k !== lastCell) { lastCell = k; hud(); } }, 120);

    var legend = el('p', 'muted a7-small', esc('Map ' + map.w + ' by ' + map.h + ' cells from seed ' + ui.seed + '. Flag colors: red blocked, blue swimmable (blocked on foot), green encounters, amber damage floor. The beam over the house door and the arch over the ruin door are above layer tiles: the walker passes under them.'));
    host.appendChild(legend);
  }
  // Keyboard: one listener for the page, live only while the test room is on screen.
  document.addEventListener('keydown', function (e) {
    if (!room || !document.querySelector('.a7-room-cv')) return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    var d = KEYS[e.key];
    if (!d) return;
    e.preventDefault();
    room.state.keyHeld = d;
  });
  document.addEventListener('keyup', function (e) { if (room && KEYS[e.key] === room.state.keyHeld) room.state.keyHeld = null; });

  // WS:BATTLE fills in battle and window.
  var VIEWS = { room: viewRoom };
  function render(host) {
    var head = el('section', 'panel'), R = res();
    head.innerHTML = '<h2 class="panel-title">Playtest</h2><p class="muted">Try the art the way a player meets it, at ' + R.w + ' by ' + R.h + ' and ' + S.tileSize(cur()) + ' pixel tiles.</p>';
    host.appendChild(head);
    W.subtabs(host, SUBS, ui, VIEWS);
  }
  ART.WS.playtest = { render: render, ui: ui, views: VIEWS, createWalker: createWalker, room: function () { return room; } };
})();
// === WS:PLAYTEST END ===
