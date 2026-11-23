'use strict';
/* v0.3.1 #21 Content Width Presets: per-site width-limiter declarations, the midpoint target math,
 * and the hosts.css rules that apply the root reading width only to the declared limiters. */
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

const hostsCss = fs.readFileSync(path.join(ROOT, 'styles/hosts.css'), 'utf8');
const MARKER = '/* === Content Width Presets (v0.3.1 #21) === */';
function section() {
  const start = hostsCss.indexOf(MARKER);
  assert.notEqual(start, -1, `hosts.css has the ${MARKER} block`);
  const end = hostsCss.indexOf('/* === ', start + MARKER.length);
  return (end === -1 ? hostsCss.slice(start) : hostsCss.slice(start, end)).replace(/\/\*[\s\S]*?\*\//g, '');
}

test('hosts.css applies the reading width only to the declared limiters, gated per site and preset', () => {
  const A = adapters();
  const css = section();
  assert.doesNotMatch(css, /data-op-(?:thread|composer)-column/, 'width rules use no per-node marks');
  assert.doesNotMatch(hostsCss, /Content Width Presets \(v0\.3\.0\)/, 'the v0.3.0 fixed-pixel tiers are gone');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({ selector: match[1].replace(/\s+/g, ' ').trim(), body: match[2] }));
  for (const host of ['chatgpt', 'gemini']) {
    const spec = A.forHost(host, {}).contentWidth;
    const hostRules = rules.filter(rule => rule.selector.includes(`[data-op-host="${host}"]`));
    for (const selector of [...spec.targets, ...spec.composerTargets]) {
      const rule = hostRules.find(candidate => candidate.selector.includes(selector) && /--op-reading-width/.test(candidate.body));
      assert.ok(rule, `${host}: a rule sizes ${selector} from --op-reading-width`);
      assert.match(rule.selector, /html\[data-op-enabled="true"\]/);
      assert.match(rule.selector, /\[data-op-content-width="wide"\]/);
      assert.match(rule.selector, /\[data-op-content-width="full"\]/);
      assert.doesNotMatch(rule.selector, /\[data-op-content-width="standard"\]/);
    }
  }
  assert.match(css, /\[data-user-message-bubble="true"\][^{]*\{[^}]*max-width:\s*min\(78%,\s*820px\)/, 'the live ChatGPT bubble keeps the min(78%, 820px) cap');
  assert.match(css, /user-query \.user-query-bubble-with-background[^{]*\{[^}]*max-width:\s*min\(78%,\s*820px\)/, 'the Gemini bubble keeps the min(78%, 820px) cap');
});
