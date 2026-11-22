'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers.cjs');

function adapters() { const h = harness(); h.load('src/adapters.js'); return h.context.ObsidianPrismAdapters; }
function element(parent = null, own = false, hidden = false) {
  return {
    nodeType: 1, parentElement: parent, isConnected: true,
    closest(selector) {
      if (selector === '[data-op-owned]') return own ? this : parent?.closest(selector) || null;
      if (selector === '[hidden], [aria-hidden="true"]') return hidden ? this : parent?.closest(selector) || null;
      return null;
    }
  };
}

test('nested Gemini-style matching nodes produce one turn, excluding extension-owned descendants', () => {
  const A = adapters();
  const user = element(), nested = element(user), inner = element(nested), secondUser = element();
  const ownRoot = element(null, true), ownLabel = element(ownRoot);
  const root = { querySelectorAll() { return [user, nested, inner, secondUser, ownLabel]; } };
  const turns = A.topLevelMatches('synthetic message selectors', root);
  assert.equal(turns.length, 2);
  assert.equal(turns[0], user);
  assert.equal(turns[1], secondUser);
});

test('extension ownership is recognized for nested elements and text-node mutations', () => {
  const A = adapters();
  const root = element(null, true), child = element(root), text = { nodeType: 3, parentElement: child };
  assert.equal(A.isOwned(text), true);
  assert.equal(A.isOwned(child), true);
  assert.equal(A.isOwned(element()), false);
  assert.equal(A.isOwned(null), false);
});

test('hidden or detached thoughts cannot become translation input', () => {
  const A = adapters();
  const hidden = element(null, false, true); hidden.innerText = 'Hidden content';
  assert.equal(A.visibleText(hidden), '');
  const detached = element(); detached.isConnected = false; detached.innerText = 'Detached content';
  assert.equal(A.visibleText(detached), '');
  const shown = element(); shown.innerText = '  Visible text  ';
  assert.equal(A.visibleText(shown), 'Visible text');
});

test('a CSS-hidden ancestor hides a thought block even without a hidden attribute', () => {
  const A = adapters();
  const parent = element(), child = element(parent);
  const doc = { defaultView: { getComputedStyle: node => ({ display: node === parent ? 'none' : 'block', visibility: 'visible' }) } };
  parent.ownerDocument = doc; child.ownerDocument = doc;
  assert.equal(A.isVisible(child), false);
});

test('closed details hide thought text while keeping their summary visible', () => {
  const A = adapters();
  const details = element(), summary = element(details), content = element(details);
  details.tagName = 'DETAILS'; details.open = false; details.children = [summary, content];
  summary.tagName = 'SUMMARY'; summary.contains = node => node === summary;
  content.tagName = 'DIV'; content.innerText = 'Hidden reasoning text';
  const doc = { defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1', contentVisibility: 'visible' }) } };
  for (const node of [details, summary, content]) node.ownerDocument = doc;
  assert.equal(A.isVisible(summary), true);
  assert.equal(A.isVisible(content), false);
  assert.equal(A.visibleText(content), '');
  details.open = true;
  assert.equal(A.isVisible(content), true);
  assert.equal(A.visibleText(content), 'Hidden reasoning text');
});

test('collapsed visibility and zero opacity cannot expose translation source text', () => {
  const A = adapters();
  for (const override of [{ visibility: 'collapse' }, { opacity: '0' }, { contentVisibility: 'hidden' }]) {
    const node = element(); node.innerText = 'Unavailable content';
    node.ownerDocument = { defaultView: { getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1', ...override }) } };
    assert.equal(A.visibleText(node), '');
  }
});

test('fold compensation identifies the nested conversation scroller', () => {
  const A = adapters();
  const nativeRoot = element(), scroller = element(nativeRoot), wrapper = element(scroller), code = element(wrapper);
  scroller.scrollHeight = 3000; scroller.clientHeight = 600;
  wrapper.scrollHeight = wrapper.clientHeight = 400;
  nativeRoot.scrollHeight = nativeRoot.clientHeight = 600;
  const doc = { scrollingElement: nativeRoot, defaultView: { getComputedStyle: node => ({ overflowY: node === scroller ? 'auto' : 'visible' }) } };
  for (const node of [nativeRoot, scroller, wrapper, code]) node.ownerDocument = doc;
  assert.equal(A.scrollContainer(code), scroller);
});

test('token estimation is deterministic for empty, Latin, CJK and surrogate-pair text', () => {
  const A = adapters();
  assert.equal(A.estimateTokens(''), 0);
  assert.equal(A.estimateTokens('abcd'), 2);
  assert.equal(A.estimateTokens('工业'), 3);
  assert.equal(A.estimateTokens('😀😀😀😀'), 2, 'count Unicode code points, not surrogate halves');
  assert.equal(A.forHost('unrelated-host', {}), null);
});
