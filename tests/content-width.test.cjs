'use strict';
/* v0.3.1 #21 Content Width Presets: per-site width-limiter declarations, the midpoint target math,
 * and a static guard that keeps the hosts.css width rules in sync with those declarations. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { harness, ROOT } = require('./helpers.cjs');

function adapters() { const h = harness(); h.load('src/adapters.js'); return h.context.ObsidianPrismAdapters; }
const plain = value => JSON.parse(JSON.stringify(value));

test('each site declares its native reading width and the elements that actually limit it', () => {
  const A = adapters();
  const chatgpt = plain(A.forHost('chatgpt', {}).contentWidth);
  const gemini = plain(A.forHost('gemini', {}).contentWidth);
  // Probe 2026-11-22: ChatGPT text column 48rem (808px transcript = 48rem + 2 × 20px); Gemini blocks 708px.
  assert.equal(chatgpt.native, 768);
  assert.equal(gemini.native, 708);
  assert.ok(chatgpt.targets.includes('[class*="transcriptContent"]'), 'ChatGPT: the transcript container carrying --thread-content-max-width');
  assert.ok(chatgpt.composerTargets.length >= 1, 'ChatGPT: the composer column follows the reading width');
  for (const selector of ['.md-content > *', 'user-query', '.response-footer', 'hallucination-disclaimer']) {
    assert.ok(gemini.targets.includes(selector), `Gemini declares ${selector}`);
  }
  assert.deepEqual(gemini.composerTargets, ['.input-area-container']);
  for (const spec of [chatgpt, gemini]) {
    for (const selector of [...spec.targets, ...spec.composerTargets]) assert.doesNotMatch(selector, /data-op-/, 'declared limiters are host selectors, never extension markers');
  }
});

test('standard adds no override; full reserves a left edge and the Conversation Rail; wide is the midpoint', () => {
  const A = adapters();
  const target = (...args) => plain(A.contentWidthTarget(...args));
  assert.equal(A.contentWidthTarget(768, 'standard', 1100, 1360), null);
  assert.equal(A.contentWidthTarget(768, 'unknown', 1100, 1360), null);
  // ChatGPT (sidebar 260px) at main 1100 and 1280.
  assert.deepEqual(target(768, 'full', 1100, 1360), { width: 1024, shift: -18 });
  assert.deepEqual(target(768, 'wide', 1100, 1360), { width: 896, shift: 0 });
  assert.deepEqual(target(768, 'full', 1280, 1540), { width: 1204, shift: -18 });
  assert.deepEqual(target(768, 'wide', 1280, 1540), { width: 986, shift: 0 });
  // Gemini (sidebar 312px) at main 1100.
  assert.deepEqual(target(708, 'full', 1100, 1412), { width: 1024, shift: -18 });
  assert.deepEqual(target(708, 'wide', 1100, 1412), { width: 866, shift: 0 });
  // Wide never exceeds 1200px.
  assert.deepEqual(target(768, 'wide', 2000, 2260), { width: 1200, shift: 0 });
  // A main area too narrow for distinct presets never shrinks below native and never exceeds the edges.
  assert.deepEqual(target(768, 'full', 800, 1060), { width: 768, shift: 0 });
  assert.deepEqual(target(768, 'wide', 800, 1060), { width: 768, shift: 0 });
  // Below a 900px viewport both fall back to the main width minus 16px edges.
  assert.deepEqual(target(768, 'full', 600, 860), { width: 568, shift: 0 });
  assert.deepEqual(target(708, 'wide', 548, 860), { width: 516, shift: 0 });
  assert.equal(A.contentWidthTarget(768, 'full', 0, 860), null, 'no main area, no override');
});

/* Static guard (declaration <-> CSS sync), not a rendering check: hosts.css cannot read the adapter, so its
 * width rules repeat the selectors declared in src/adapters.js (contentWidth.targets / composerTargets), which
 * own them. This guard fails when the two lists drift apart in either direction. What the reader sees (widths,
 * midpoint, bubble cap, native restore) is measured in tests/live-width.mjs. */
const hostsCss = fs.readFileSync(path.join(ROOT, 'styles/hosts.css'), 'utf8');
const MARKER = '/* === Content Width Presets (v0.3.1 #21) === */';
function splitTopLevel(text) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    if ('(['.includes(text[i])) depth++;
    else if (')]'.includes(text[i])) depth--;
    else if (text[i] === ',' && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}
/** Element selectors of the hosts.css rules that size something from --op-reading-width for one host. */
function cssWidthLimiters(host) {
  const start = hostsCss.indexOf(MARKER);
  assert.notEqual(start, -1, `hosts.css has the ${MARKER} block`);
  const end = hostsCss.indexOf('/* === ', start + MARKER.length);
  const css = (end === -1 ? hostsCss.slice(start) : hostsCss.slice(start, end)).replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  for (const [, selectorText, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/--op-reading-width/.test(body)) continue;
    for (const selector of splitTopLevel(selectorText.replace(/\s+/g, ' ').trim())) {
      if (!selector.startsWith(`html[data-op-enabled="true"][data-op-host="${host}"]`)) continue;
      // Drop the root gate (the first compound); what remains is the limiter, or an :is() list of limiters.
      const limiter = selector.slice(selector.indexOf(' ') + 1);
      const list = limiter.match(/^:is\((.*)\)$/);
      out.push(...(list ? splitTopLevel(list[1]) : [limiter]));
    }
  }
  return out;
}

test('static guard: hosts.css width rules size exactly the limiters each adapter declares', () => {
  const A = adapters();
  for (const host of ['chatgpt', 'gemini']) {
    const spec = plain(A.forHost(host, {}).contentWidth);
    assert.deepEqual(cssWidthLimiters(host).sort(), [...spec.targets, ...spec.composerTargets].sort(), `${host}: hosts.css and src/adapters.js list the same width limiters`);
  }
});
