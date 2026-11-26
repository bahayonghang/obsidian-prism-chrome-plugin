'use strict';
/* v0.3.1 #21 Content Width Presets: per-site width-limiter declarations, the midpoint target math,
 * and a static guard that keeps the styles/host-*.css width rules in sync with those declarations. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { harness, ROOT } = require('./helpers.cjs');

function adapters() { const h = harness(); h.load('src/adapters.js'); return h.context.ObsidianPrismAdapters; }
const plain = value => JSON.parse(JSON.stringify(value));

test('each site declares its native reading width and the elements that actually limit it', () => {
  const A = adapters();
  const rawChatgpt = A.forHost('chatgpt', {}).contentWidth;
  const rawGemini = A.forHost('gemini', {}).contentWidth;
  for (const [host, cw] of [['chatgpt', rawChatgpt], ['gemini', rawGemini]]) {
    assert.equal(Object.isFrozen(cw), true, `${host}: contentWidth object is frozen`);
    for (const key of ['targets', 'userTurnTargets', 'composerTargets']) {
      assert.ok(Array.isArray(cw[key]), `${host}: contentWidth.${key} is an array`);
      assert.equal(Object.isFrozen(cw[key]), true, `${host}: contentWidth.${key} is frozen`);
    }
  }
  const chatgpt = plain(rawChatgpt);
  const gemini = plain(rawGemini);
  // Probe 2026-11-22: ChatGPT text column 48rem (808px transcript = 48rem + 2 × 20px); Gemini blocks 708px.
  assert.equal(chatgpt.native, 768);
  assert.equal(gemini.native, 708);
  assert.deepEqual(chatgpt.targets, ['main', '[class*="transcriptContent"]'], 'ChatGPT: bridges --thread-content-max-width on main and sizes transcriptContent');
  assert.deepEqual(chatgpt.userTurnTargets, [
    '[data-content-search-unit-key$=":user"] :has([data-user-message-bubble="true"])',
    '[data-message-author-role="user"] :has(.bg-token-message-surface,.user-message-bubble-color,[data-testid="user-message-bubble"],[data-user-message-bubble="true"])',
    '[data-user-message-bubble="true"]',
    '[data-message-author-role="user"] :where(.bg-token-message-surface,.user-message-bubble-color,[data-testid="user-message-bubble"])',
    '[data-message-author-role="user"] > div:not(:has(.bg-token-message-surface,.user-message-bubble-color,[data-testid="user-message-bubble"],[data-user-message-bubble="true"]))',
    '[data-testid="user-message"]',
    '[data-turn="user"] .user-message-bubble-color',
    '[data-turn="user"] > div > div'
  ], 'ChatGPT: uncapped user turn wrappers and proportional bubble targets');
  assert.deepEqual(chatgpt.composerTargets, [
    '#thread-bottom-container',
    '#thread-bottom',
    '#thread-bottom [class*="--thread-content-max-width"]',
    '#thread-bottom :has(form[data-chatgpt-composer]):not(:has(> form[data-chatgpt-composer]))',
    '#thread-bottom :has(> form[data-chatgpt-composer])',
    '#thread-bottom > form[data-chatgpt-composer]',
    '[data-thread-composer-backdrop="true"]',
    '[data-thread-composer-backdrop="true"] :has(form[data-chatgpt-composer])',
    '[data-thread-composer-backdrop="true"] form[data-chatgpt-composer]'
  ], 'ChatGPT: dock containers and Thread Footer [data-thread-composer-backdrop] bridge reading width onto composer wrappers');
  assert.deepEqual(gemini.targets, [
    'chat-window',
    '.md-content > *',
    'user-query',
    '.response-footer',
    'hallucination-disclaimer'
  ], 'Gemini: bridges chat-window vars and sizes blocks, user-query, footer, and disclaimer');
  assert.deepEqual(gemini.userTurnTargets, [
    'user-query > user-query-content',
    'user-query .user-query-container',
    'user-query :has(.user-query-bubble-with-background)',
    'user-query .user-query-bubble-with-background',
    'user-query-content.user-query-bubble-with-background',
    'user-query .user-query-bubble-with-background :is(.query-text, .query-text-line)',
    'user-query .user-query-bubble-with-background > *'
  ], 'Gemini: uncapped user-query hierarchy, text wrappers, and proportional bubble targets');
  assert.deepEqual(gemini.composerTargets, [
    'input-container :has(.input-area-container)',
    '.input-area-container',
    '.input-area-container :has(input-area-v2)',
    '.input-area-container input-area-v2'
  ], 'Gemini: uncapped input wrappers and synchronized input area');
  for (const spec of [chatgpt, gemini]) {
    for (const selector of [...spec.targets, ...spec.userTurnTargets, ...spec.composerTargets]) {
      assert.doesNotMatch(selector, /data-op-/, 'declared limiters are host selectors, never extension markers');
    }
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

/* Static guard (declaration <-> CSS sync), not a rendering check: styles/host-*.css cannot read the adapter, so their
 * width rules repeat the selectors declared in src/adapters.js (contentWidth.targets / composerTargets), which
 * own them. This guard fails when the two lists drift apart in either direction. What the reader sees (widths,
 * midpoint, bubble cap, native restore) is measured in tests/live-width.mjs. */
const HOST_CSS_FILES = {
  chatgpt: fs.readFileSync(path.join(ROOT, 'styles/host-chatgpt.css'), 'utf8'),
  gemini: fs.readFileSync(path.join(ROOT, 'styles/host-gemini.css'), 'utf8')
};
const MARKER = '/* === Content Width Presets (v0.3.1 #21) === */';
function splitTopLevel(text) {
  const parts = [];
  let depth = 0, start = 0, quote = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote && text[i - 1] !== '\\') quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if ('(['.includes(ch)) depth++;
    else if (')]'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}
function contentWidthBlockCss(host) {
  const css = HOST_CSS_FILES[host];
  const start = css.indexOf(MARKER);
  assert.notEqual(start, -1, `styles/host-${host}.css has the ${MARKER} block`);
  const end = css.indexOf('/* === ', start + MARKER.length);
  return (end === -1 ? css.slice(start) : css.slice(start, end)).replace(/\/\*[\s\S]*?\*\//g, '');
}
/** Element selectors of all host-scoped width rules in the Content Width Presets block (including uncap rules). */
function cssWidthLimiters(host) {
  const css = contentWidthBlockCss(host);
  const out = [];
  for (const [, selectorText] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of splitTopLevel(selectorText.replace(/\s+/g, ' ').trim())) {
      const hostMatch = selector.match(/^html\[data-op-enabled="true"\]\[data-op-host="(chatgpt|gemini)"\]/);
      assert.ok(hostMatch, `Content Width Presets rule must be host-scoped (no unguarded host-agnostic rule): "${selector}"`);
      assert.equal(hostMatch[1], host, `styles/host-${host}.css must only declare ${host} width rules`);
      // Drop the root gate (the first compound); what remains is the limiter, or an :is() list of limiters.
      const limiter = selector.slice(selector.indexOf(' ') + 1);
      const list = limiter.match(/^:is\((.*)\)$/);
      out.push(...(list ? splitTopLevel(list[1]) : [limiter]));
    }
  }
  return out;
}

test('static guard: styles/host-*.css width rules size exactly the limiters each adapter declares without 820px ceiling or host-agnostic rules', () => {
  const A = adapters();
  for (const host of ['chatgpt', 'gemini']) {
    const block = contentWidthBlockCss(host);
    assert.equal(/820px/.test(block), false, `styles/host-${host}.css Content Width Presets must not hardcode an 820px ceiling`);
    const spec = plain(A.forHost(host, {}).contentWidth);
    assert.deepEqual(
      cssWidthLimiters(host).sort(),
      [...spec.targets, ...spec.userTurnTargets, ...spec.composerTargets].sort(),
      `${host}: host-${host}.css and src/adapters.js list the same width limiters`
    );
  }
});
