// === ART:PIXED BEGIN ===
(function () {
  'use strict';
  // The touch pixel editor. It edits local slot indices (0 clear, 1 outline, 2 to 15 the ramps) for any frame: a sprite
  // pose, a portrait expression, an icon, or a hand drawn part. Pointer events cover mouse, pen, and touch alike; the
  // canvas sets touch-action none so drawing never scrolls the page.
  //   ART.pixelEditor.open({title, w, h, idx, slots, entries, labels, note, canRevert}) -> Promise of
  //   {action: 'save', idx} | {action: 'revert'} | null
  var U = Kit.util, el = U.el, esc = U.esc, C = ENGINE_RENDER.color;
  var TOOLS = [['pen', 'Pencil', 'B'], ['fill', 'Fill', 'G'], ['pick', 'Pick color', 'I'], ['erase', 'Eraser', 'E']];
  var SLOT_NAMES = ['Clear', 'Outline', 'Skin dark', 'Skin', 'Skin light', 'Hair dark', 'Hair', 'Hair light', 'Cloth A dark', 'Cloth A', 'Cloth A light', 'Cloth B dark', 'Cloth B', 'Cloth B light', 'Metal dark', 'Metal light'];
  ART.SLOT_NAMES = SLOT_NAMES;
  function btn(label, cls, html) { var b = el('button', 'btn' + (cls ? ' ' + cls : ''), html || esc(label)); b.type = 'button'; return b; }

  function open(o) {
    return new Promise(function (resolve) {
      var w = o.w, h = o.h, px = new Uint8Array(o.idx), names = o.labels || SLOT_NAMES;
      var undo = [], redo = [], tool = 'pen', color = 1, mirror = false, grid = true, done = false;
      var zoom = Math.max(4, Math.min(24, Math.floor(Math.min(560, (typeof window !== 'undefined' ? window.innerWidth : 560) - 64) / w)));
      var cv, ctx, wrap, status, swatches = [], toolBtns = {}, dirty = false;
      // Tile palettes have 32 slots: a 32 entry label list (TL.SLOT_NAMES) opens every slot, not only the first 16.
      var maxIdx = o.maxIndex || (names.length > 16 ? Math.min(31, names.length - 1) : 15);
      var aiTarget = { title: o.title, note: o.note, w: w, h: h, maxIndex: maxIdx, labels: names, slots: o.slots, entries: o.entries,
        get: function () { return px; }, load: function (idx) { snapshot(); px = new Uint8Array(idx); paint(); setStatus('Loaded a Claude draft. Undo brings back the previous pixels.'); } };
      function colorOf(s) { var m = o.slots && s ? o.slots[s] : null; return typeof m === 'number' && o.entries[m] ? o.entries[m] : null; }
      function paint() {
        if (!ctx) return;
        cv.width = w * zoom; cv.height = h * zoom;
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
          var c = colorOf(px[y * w + x]);
          if (c) { ctx.fillStyle = c; ctx.fillRect(x * zoom, y * zoom, zoom, zoom); }
          else { ctx.fillStyle = (x + y) & 1 ? '#8a8a8a' : '#b8b8b8'; ctx.fillRect(x * zoom, y * zoom, zoom, zoom); }
        }
        if (grid && zoom >= 6) {
          ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 1; ctx.beginPath();
          for (var gx = 1; gx < w; gx++) { ctx.moveTo(gx * zoom + 0.5, 0); ctx.lineTo(gx * zoom + 0.5, h * zoom); }
          for (var gy = 1; gy < h; gy++) { ctx.moveTo(0, gy * zoom + 0.5); ctx.lineTo(w * zoom, gy * zoom + 0.5); }
          ctx.stroke();
          if (mirror) { ctx.strokeStyle = 'rgba(255,80,80,.7)'; ctx.beginPath(); ctx.moveTo(w * zoom / 2 + 0.5, 0); ctx.lineTo(w * zoom / 2 + 0.5, h * zoom); ctx.stroke(); }
        }
      }
      function setStatus(t) { if (status) status.textContent = t; }
      function snapshot() { undo.push(new Uint8Array(px)); if (undo.length > 80) undo.shift(); redo.length = 0; dirty = true; }
      function set(x, y, v) {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        px[y * w + x] = v;
        if (mirror) px[y * w + (w - 1 - x)] = v;
      }
      function flood(x, y, v) {
        var t = px[y * w + x];
        if (t === v) return;
        var stack = [[x, y]];
        while (stack.length) {
          var p = stack.pop(), X = p[0], Y = p[1];
          if (X < 0 || Y < 0 || X >= w || Y >= h || px[Y * w + X] !== t) continue;
          px[Y * w + X] = v;
          stack.push([X + 1, Y], [X - 1, Y], [X, Y + 1], [X, Y - 1]);
        }
      }
      function line(x0, y0, x1, y1, v) {
        var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy;
        for (var n = 0; n < 4096; n++) {
          set(x0, y0, v);
          if (x0 === x1 && y0 === y1) break;
          var e2 = 2 * e;
          if (e2 >= dy) { e += dy; x0 += sx; }
          if (e2 <= dx) { e += dx; y0 += sy; }
        }
      }
      function cell(ev) {
        var r = cv.getBoundingClientRect();
        var sx = r.width ? cv.width / r.width : 1, sy = r.height ? cv.height / r.height : 1;
        return [Math.floor((ev.clientX - r.left) * sx / zoom), Math.floor((ev.clientY - r.top) * sy / zoom)];
      }
      function pickSlot(s) {
        color = s;
        swatches.forEach(function (b, i) { b.setAttribute('aria-pressed', i === s ? 'true' : 'false'); });
        setStatus('Color: ' + names[s] + (colorOf(s) ? ' ' + colorOf(s) : ''));
      }
      function setTool(t) {
        tool = t;
        Object.keys(toolBtns).forEach(function (k) { toolBtns[k].setAttribute('aria-pressed', k === t ? 'true' : 'false'); });
      }
      var down = false, last = null;
      function apply(c, first) {
        var x = c[0], y = c[1];
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        if (tool === 'pick') { pickSlot(px[y * w + x]); setTool(px[y * w + x] ? 'pen' : 'erase'); return; }
        if (first) snapshot();
        var v = tool === 'erase' ? 0 : color;
        if (tool === 'fill') { if (first) flood(x, y, v); }
        else if (last && !first) line(last[0], last[1], x, y, v);
        else set(x, y, v);
        last = c;
        paint();
      }
      function undoStep() { if (!undo.length) return; redo.push(new Uint8Array(px)); px = undo.pop(); paint(); }
      function redoStep() { if (!redo.length) return; undo.push(new Uint8Array(px)); px = redo.pop(); paint(); }

      var handle = Kit.ui.dialog({
        title: o.title || 'Edit pixels', wide: true, className: 'a7-pxdlg', dismissable: false,
        body: function (body) {
          if (o.note) body.appendChild(el('p', 'muted a7-small', esc(o.note)));
          var bar = el('div', 'a7-pxbar');
          bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Pixel tools');
          TOOLS.forEach(function (t) {
            var b = btn(t[1], 'a7-tool', '<span>' + esc(t[1]) + '</span>');
            b.title = t[1] + ' (' + t[2] + ')';
            b.addEventListener('click', function () { setTool(t[0]); });
            toolBtns[t[0]] = b; bar.appendChild(b);
          });
          var sep = el('span', 'a7-sep'); bar.appendChild(sep);
          var bu = btn('Undo'); bu.title = 'Undo (Ctrl+Z)'; bu.addEventListener('click', undoStep); bar.appendChild(bu);
          var br = btn('Redo'); br.title = 'Redo (Ctrl+Y)'; br.addEventListener('click', redoStep); bar.appendChild(br);
          var bm = btn('Mirror', 'a7-tool'); bm.setAttribute('aria-pressed', 'false'); bm.title = 'Draw on both halves at once';
          bm.addEventListener('click', function () { mirror = !mirror; bm.setAttribute('aria-pressed', mirror ? 'true' : 'false'); paint(); }); bar.appendChild(bm);
          var bg = btn('Grid', 'a7-tool'); bg.setAttribute('aria-pressed', 'true');
          bg.addEventListener('click', function () { grid = !grid; bg.setAttribute('aria-pressed', grid ? 'true' : 'false'); paint(); }); bar.appendChild(bg);
          var zo = btn('Zoom out'); zo.setAttribute('aria-label', 'Zoom out'); zo.innerHTML = '<span aria-hidden="true">-</span>';
          zo.addEventListener('click', function () { zoom = Math.max(2, zoom - 2); paint(); }); bar.appendChild(zo);
          var zi = btn('Zoom in'); zi.setAttribute('aria-label', 'Zoom in'); zi.innerHTML = '<span aria-hidden="true">+</span>';
          zi.addEventListener('click', function () { zoom = Math.min(40, zoom + 2); paint(); }); bar.appendChild(zi);
          // Claude drafting (ART:AI). A draft only loads into this canvas; nothing is stored until Save pixels.
          if (ART.ai && ART.ai.pixelButton && w * h <= ART.ai.PIXEL_LIMIT) bar.appendChild(ART.ai.pixelButton(aiTarget));
          body.appendChild(bar);
          wrap = el('div', 'a7-pxwrap');
          cv = document.createElement('canvas');
          cv.className = 'a7-pxcanvas';
          cv.setAttribute('role', 'img');
          cv.setAttribute('aria-label', 'Pixel canvas, ' + w + ' by ' + h);
          cv.tabIndex = 0;
          ctx = cv.getContext && cv.getContext('2d');
          wrap.appendChild(cv);
          body.appendChild(wrap);
          cv.addEventListener('pointerdown', function (e) { e.preventDefault(); down = true; last = null; try { cv.setPointerCapture(e.pointerId); } catch (x) {} apply(cell(e), true); });
          cv.addEventListener('pointermove', function (e) { if (!down) return; e.preventDefault(); apply(cell(e), false); });
          ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { cv.addEventListener(ev, function () { down = false; last = null; }); });
          var pal = el('div', 'a7-pxpal');
          pal.setAttribute('role', 'group'); pal.setAttribute('aria-label', 'Colors');
          for (var s = 0; s <= maxIdx; s++) {
            (function (s) {
              var c = colorOf(s), b = el('button', 'a7-sw' + (c ? '' : ' a7-clear'));
              b.type = 'button';
              if (c) b.style.background = c;
              b.setAttribute('aria-label', names[s] + (c ? ', ' + c : ''));
              b.title = s + ' ' + names[s];
              b.innerHTML = '<span class="n" style="color:' + (c ? C.contrastInk(c) : '#111') + '">' + s + '</span>';
              b.addEventListener('click', function () { pickSlot(s); if (tool === 'erase' || tool === 'pick') setTool('pen'); });
              swatches.push(b); pal.appendChild(b);
            })(s);
          }
          body.appendChild(pal);
          status = el('div', 'muted a7-small a7-pxstatus'); status.setAttribute('aria-live', 'polite');
          body.appendChild(status);
          body.addEventListener('keydown', function (e) {
            if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
            var k = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) redoStep(); else undoStep(); return; }
            if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redoStep(); return; }
            TOOLS.forEach(function (t) { if (k === t[2].toLowerCase() && !e.ctrlKey && !e.metaKey) setTool(t[0]); });
          });
          setTool('pen'); pickSlot(1); paint();
        },
        actions: [
          { label: 'Cancel', kind: 'ghost', value: null }
        ].concat(o.canRevert ? [{ label: 'Revert to generated', kind: 'ghost', icon: 'x', value: 'revert' }] : []).concat([
          { label: 'Save pixels', kind: 'primary', icon: 'check', value: 'save' }
        ]),
        onResult: function (v) {
          if (done) return; done = true;
          if (v === 'save') resolve({ action: 'save', idx: px, dirty: dirty });
          else if (v === 'revert') resolve({ action: 'revert' });
          else resolve(null);
        }
      });
      // Test hooks: the jsdom harness has no layout, so it drives the editor through these.
      handle.pixels = function () { return px; };
      handle.paintAt = function (x, y, slot) { snapshot(); set(x, y, slot); paint(); };
      handle.fillAt = function (x, y, slot) { snapshot(); flood(x, y, slot); paint(); };
      handle.undo = undoStep; handle.redo = redoStep; handle.ai = aiTarget;
      ART.pixelEditor.last = handle;
    });
  }
  // Encodes an edited frame for storage, or null when it equals the generated frame (so nothing is stored).
  function encodeOverride(idx, w, h, generated) {
    if (generated && generated.length === idx.length) {
      var same = true;
      for (var i = 0; i < idx.length; i++) if (idx[i] !== generated[i]) { same = false; break; }
      if (same) return null;
    }
    return { w: w, h: h, d: ENGINE_RENDER.codec.encode(idx) };
  }
  ART.pixelEditor = { open: open, encode: encodeOverride, SLOT_NAMES: SLOT_NAMES };
})();
// === ART:PIXED END ===
