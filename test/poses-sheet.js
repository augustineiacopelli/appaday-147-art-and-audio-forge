// Contact sheet of every battle and emote pose for the demo party (eyeballing only).
'use strict';
const path = require('path');
const { boot } = require('./boot');
const { sheet } = require('./png');
(async () => {
  const { win } = boot(path.join(__dirname, '..', 'index.html'), { url: 'https://augustineiacopelli.github.io/appaday/147/' });
  await new Promise((r) => setTimeout(r, 80));
  const Kit = win.Kit, ART = win.ART, ER = win.ENGINE_RENDER;
  Kit.bundle.load(win.ART_DEMO.bundle()); ART.quickBuild.run();
  const b = Kit.bundle.current(), T = +(process.argv[2] || 16);
  const k = ER.createCache(b.art, { size: T, entries: ART.palette.entries(b), budget: 64e6 });
  const cells = [];
  ART.sprites.sprites(b).filter((s) => s.kind === 'character' && s.mode === 'battle').forEach((s) => {
    ER.sprite.BATTLE_POSES.forEach((p) => cells.push(k.sprite(s.id, p, 'left')));
  });
  const fld = ART.sprites.sprites(b).filter((s) => s.mode === 'field').slice(0, 3);
  fld.forEach((s) => ER.sprite.EMOTE_POSES.concat(['stand']).forEach((p) => { cells.push(k.sprite(s.id, p, 'down')); }));
  fld.forEach((s) => ER.sprite.EMOTE_POSES.concat(['stand']).forEach((p) => { cells.push(k.sprite(s.id, p, 'right')); }));
  const out = path.join(__dirname, 'out', 'poses-' + T + '.png');
  sheet(out, cells, { cols: 13, scale: T <= 16 ? 5 : 3 });
  console.log(out);
})();
