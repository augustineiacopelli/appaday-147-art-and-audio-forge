// Loads an AppADay forge page in jsdom. Shared by every Phase 0 test.
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require(path.join(__dirname, 'node_modules', 'jsdom'));

function boot(file, opts) {
  opts = opts || {};
  const html = fs.readFileSync(file, 'utf8');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => errors.push(a.join(' ')));
  if (opts.verbose) vc.on('log', (...a) => console.log('[page]', ...a));
  const dom = new JSDOM(html, {
    url: opts.url || 'https://augustineiacopelli.github.io/appaday/146/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      win.TextEncoder = win.TextEncoder || require('util').TextEncoder;
      win.TextDecoder = win.TextDecoder || require('util').TextDecoder;
      win.matchMedia = win.matchMedia || function (q) {
        return { matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
      };
      if (opts.storage) Object.keys(opts.storage).forEach((k) => win.localStorage.setItem(k, opts.storage[k]));
      win.fetch = () => Promise.reject(new Error('offline test'));
      win.HTMLCanvasElement.prototype.getContext = function () { return null; };
      if (opts.setup) opts.setup(win);
    }
  });
  return { dom, win: dom.window, errors };
}
module.exports = { boot };
