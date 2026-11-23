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

test('token estimation is calibrated for empty, whitespace, Latin, CJK, code and surrogate-pair text', () => {
  const A = adapters();
  assert.equal(A.estimateTokens(''), 0);
  assert.equal(A.estimateTokens('   \n\t '), 0);
  assert.equal(A.estimateTokens('abcd'), 1);
  assert.equal(A.estimateTokens('abcdefgh'), 2);
  assert.equal(A.estimateTokens('一二三四五六七八九十'), 7);
  assert.equal(A.estimateTokens('😀😀😀😀'), 1, 'count Unicode code points, not surrogate halves');
  assert.equal(A.estimateTokens('const x = 1;', { mode: 'code' }), 4);
  assert.equal(A.estimateTokens('const x = 1;'), 3);
  assert.equal(A.forHost('unrelated-host', {}), null);
});

function domNode(tagName, attrs = {}, options = {}) {
  const node = {
    nodeType: 1,
    tagName: String(tagName || 'DIV').toUpperCase(),
    attributesMap: new Map(Object.entries(attrs).map(([k, v]) => [k, String(v)])),
    children: [],
    parentElement: null,
    isConnected: true,
    textContent: options.textContent || '',
    innerText: options.innerText ?? options.textContent ?? '',
    rect: options.rect || { left: 100, right: 860, top: 100, bottom: 200, width: 760, height: 100 },
    style: options.style || { display: 'block', visibility: 'visible', opacity: '1', contentVisibility: 'visible', position: 'static', backgroundColor: 'transparent' },
    get classList() {
      const cls = (this.attributesMap.get('class') || '').split(/\s+/).filter(Boolean);
      return { contains: name => cls.includes(name) };
    },
    getAttribute(name) { return this.attributesMap.get(name) ?? null; },
    setAttribute(name, value) { this.attributesMap.set(name, String(value)); },
    removeAttribute(name) { this.attributesMap.delete(name); },
    hasAttribute(name) { return this.attributesMap.has(name); },
    getBoundingClientRect() { return this.rect; },
    append(...kids) {
      for (const kid of kids) {
        kid.parentElement = this;
        kid.ownerDocument = this.ownerDocument;
        this.children.push(kid);
      }
      return this;
    },
    contains(other) {
      for (let cur = other; cur; cur = cur.parentElement) if (cur === this) return true;
      return false;
    },
    matches(selectorList) { return matchesAny(this, selectorList); },
    closest(selectorList) {
      for (let cur = this; cur; cur = cur.parentElement) if (matchesAny(cur, selectorList)) return cur;
      return null;
    },
    querySelectorAll(selectorList) {
      const out = [];
      const walk = cur => {
        for (const child of cur.children) {
          if (matchesAny(child, selectorList)) out.push(child);
          walk(child);
        }
      };
      walk(this);
      return out;
    },
    querySelector(selectorList) { return this.querySelectorAll(selectorList)[0] || null; }
  };
  return node;
}

function splitSelectors(selectorList) {
  const parts = [];
  let current = '', depth = 0, quote = '';
  for (const ch of String(selectorList || '')) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function matchCompound(node, compound) {
  if (!node || node.nodeType !== 1) return false;
  let rest = compound.trim();
  if (!rest) return false;
  if (rest.startsWith(':not(') && rest.endsWith(')')) return !matchesAny(node, rest.slice(5, -1));
  const tagMatch = rest.match(/^([a-zA-Z0-9_-]+)/);
  if (tagMatch) {
    if (node.tagName !== tagMatch[1].toUpperCase()) return false;
    rest = rest.slice(tagMatch[0].length);
  }
  while (rest.length) {
    if (rest.startsWith('#')) {
      const m = rest.match(/^#([a-zA-Z0-9_-]+)/);
      if (!m || node.getAttribute('id') !== m[1]) return false;
      rest = rest.slice(m[0].length);
    } else if (rest.startsWith('.')) {
      const m = rest.match(/^\.([a-zA-Z0-9_-]+)/);
      if (!m || !node.classList.contains(m[1])) return false;
      rest = rest.slice(m[0].length);
    } else if (rest.startsWith('[')) {
      const m = rest.match(/^\[([a-zA-Z0-9_:-]+)(?:(\^=|\*=|\$=|=)"([^"]*)")?(?:\s+([iIsS]))?\]/);
      if (!m) return false;
      let val = node.getAttribute(m[1]);
      let target = m[3];
      if (m[4] && m[4].toLowerCase() === 'i') {
        if (val !== null) val = val.toLowerCase();
        if (target !== undefined) target = target.toLowerCase();
      }
      if (m[2] === '=' && val !== target) return false;
      if (m[2] === '^=' && (!val || !val.startsWith(target))) return false;
      if (m[2] === '$=' && (!val || !val.endsWith(target))) return false;
      if (m[2] === '*=' && (!val || !val.includes(target))) return false;
      if (!m[2] && val === null) return false;
      rest = rest.slice(m[0].length);
    } else {
      return false;
    }
  }
  return true;
}

function splitCombinators(sel) {
  const tokens = [];
  let current = '', depth = 0, quote = '';
  for (const ch of String(sel || '').trim()) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (/\s/.test(ch) && depth === 0) {
      if (current) { tokens.push(current); current = ''; }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function matchesAny(node, selectorList) {
  for (const sel of splitSelectors(selectorList)) {
    const tokens = splitCombinators(sel);
    if (tokens.length === 1) {
      if (matchCompound(node, tokens[0])) return true;
    } else if (tokens.length === 2 && tokens[1] && matchCompound(node, tokens[1])) {
      for (let anc = node.parentElement; anc; anc = anc.parentElement) {
        if (matchCompound(anc, tokens[0])) return true;
      }
    } else if (tokens.length === 3 && tokens[1] === '>' && matchCompound(node, tokens[2])) {
      if (node.parentElement && matchCompound(node.parentElement, tokens[0])) return true;
    }
  }
  return false;
}

function makeDoc(host = 'chatgpt') {
  const doc = {
    body: null,
    documentElement: null,
    defaultView: {
      innerWidth: 1280,
      innerHeight: 900,
      getComputedStyle: node => node.style || { display: 'block', visibility: 'visible', opacity: '1', contentVisibility: 'visible' }
    }
  };
  const body = domNode('body', { class: host });
  body.ownerDocument = doc;
  doc.body = body;
  doc.documentElement = domNode('html');
  doc.documentElement.ownerDocument = doc;
  doc.querySelectorAll = sel => body.querySelectorAll(sel);
  doc.querySelector = sel => body.querySelector(sel);
  return { doc, body, el: (tag, attrs, opts) => { const n = domNode(tag, attrs, opts); n.ownerDocument = doc; return n; } };
}

test('ChatGPT 2026 turns with data-turn or structural fallbacks are recognized without duplicates', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('chatgpt');
  const main = el('main', { id: 'main' });
  const thread = el('div', { class: 'thread' });

  // Turn 0: modern data-turn without data-message-author-role
  const t0 = el('article', { 'data-testid': 'conversation-turn-0', 'data-turn': 'user' });
  const b0 = el('div', { class: 'user-message-bubble-color' }, { textContent: 'First synthetic question' });
  t0.append(b0);

  // Turn 1: modern assistant turn without data-message-author-role, with code wrapper
  const t1 = el('article', { 'data-testid': 'conversation-turn-1', 'data-turn': 'assistant' });
  const md1 = el('div', { class: 'markdown' }, { textContent: 'Use a calibrated pipeline.' });
  const cb = el('div', { 'data-testid': 'code-block', class: 'code-block-wrapper' });
  const hdr = el('div', { class: 'code-header' }, { textContent: 'JavaScript' });
  const pre = el('pre');
  pre.append(el('code', {}, { textContent: 'const x = 1;' }));
  cb.append(hdr, pre);
  md1.append(cb);
  t1.append(md1);

  // Turn 2 & 3: structural fallback only (.sr-only heading + .agent-turn)
  const t2 = el('article', { 'data-testid': 'conversation-turn-2' });
  t2.append(el('h5', { class: 'sr-only' }, { textContent: 'You said:' }), el('div', {}, { textContent: 'Second synthetic question' }));
  const t3 = el('article', { 'data-testid': 'conversation-turn-3' });
  t3.append(el('h6', { class: 'sr-only' }, { textContent: 'ChatGPT said:' }), el('div', { class: 'agent-turn' }, { textContent: 'Second reply' }));

  const spacer = el('div', { 'data-testid': 'conversation-turn-spacer', class: 'thread-bottom-spacer', 'aria-hidden': 'true' }, { textContent: '', rect: { left: 100, right: 860, top: 600, bottom: 820, width: 760, height: 220 } });
  thread.append(t0, t1, t2, t3, spacer);

  const dock = el('div', { id: 'thread-bottom', class: 'native-composer-dock' }, { rect: { left: 0, right: 1280, top: 760, bottom: 900, width: 1280, height: 140 }, style: { display: 'block', visibility: 'visible', opacity: '1', position: 'sticky', backgroundColor: '#ffffff' } });
  const composerCol = el('div', { class: 'composer-container' });
  const composer = el('div', { id: 'composer-background', 'data-testid': 'composer' }, { rect: { left: 260, right: 1020, top: 775, bottom: 870, width: 760, height: 95 } });
  const editor = el('div', { id: 'prompt-textarea', contenteditable: 'true', role: 'textbox' });
  const addBtn = el('button', { type: 'button', 'data-testid': 'composer-plus-btn', 'aria-label': 'Add files' }, { rect: { left: 274, right: 306, top: 828, bottom: 860, width: 32, height: 32 } });
  const modeChip = el('button', { type: 'button', 'data-testid': 'composer-mode-pill' }, { textContent: 'Search' });
  const modelBtn = el('button', { type: 'button', 'data-testid': 'model-switcher-dropdown-button', 'aria-haspopup': 'menu' }, { textContent: 'ChatGPT 5.2 ⌄' });
  const attCard = el('div', { 'data-testid': 'attachment-card' }, { textContent: 'report.pdf', rect: { left: 274, right: 410, top: 780, bottom: 816, width: 136, height: 36 } });
  composer.append(attCard, editor, addBtn, modeChip, modelBtn);
  composerCol.append(composer);
  dock.append(composerCol);
  main.append(thread, dock);
  body.append(main);

  const adapter = A.forHost('chatgpt', doc);
  assert.equal(adapter.userTurns().length, 2);
  assert.equal(adapter.assistantTurns().length, 2);
  assert.deepEqual([...adapter.codeSurfaces()], [cb]);
  assert.deepEqual([...adapter.codeHeaders()], [hdr]);
  assert.equal(adapter.modelSelectorTrigger(), modelBtn);
  assert.equal(adapter.activeModelLabel(), 'ChatGPT 5.2');
  assert.deepEqual([...adapter.visibleAttachments()], [attCard]);
  assert.equal(adapter.composerAddTrigger(composer), addBtn);
  assert.deepEqual([...adapter.composerChips(composer)], [modeChip]);
  assert.equal(adapter.composerScrimSurface(composer), dock);
  assert.deepEqual([...adapter.threadTailSpacers()], [spacer]);
  assert.equal(adapter.threadColumns().includes(thread), true);
  assert.equal(adapter.composerColumns(composer).includes(composerCol), true);
});

test('Gemini 2026 adapter exposes code-block shell, mode switcher, add trigger, chips and attachments', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('gemini');
  const chatWindow = el('chat-window');
  const main = el('main', { id: 'main' });
  const thread = el('div', { class: 'thread' });

  const uq = el('user-query');
  const uqInner = el('div', { 'data-test-id': 'user-query' }, { textContent: 'Inspect Gemini block' });
  uq.append(uqInner);

  const mr = el('model-response');
  const mrText = el('div', { class: 'model-response-text' });
  const cb = el('code-block', { class: 'code-block' });
  const hdr = el('div', { class: 'code-block-decoration' }, { textContent: 'Python' });
  const pre = el('pre');
  pre.append(el('code', {}, { textContent: 'print(1)' }));
  cb.append(hdr, pre);
  const att = el('div', { 'data-test-id': 'file-preview-chip' }, { textContent: 'spec.pdf', rect: { left: 100, right: 240, top: 300, bottom: 340, width: 140, height: 40 } });
  mrText.append(cb, att);
  mr.append(mrText);
  thread.append(uq, mr);

  const dock = el('div', { id: 'thread-bottom', class: 'input-area-wrapper' }, { rect: { left: 0, right: 1280, top: 760, bottom: 900, width: 1280, height: 140 }, style: { display: 'block', visibility: 'visible', opacity: '1', position: 'sticky', backgroundColor: '#ffffff' } });
  const composerCol = el('div', { class: 'composer-container' });
  const inputArea = el('input-area-v2');
  const composer = el('div', { class: 'text-input-field input-area-container' }, { rect: { left: 260, right: 1020, top: 775, bottom: 870, width: 760, height: 95 } });
  const editor = el('div', { class: 'ql-editor', contenteditable: 'true', role: 'textbox' });
  const addBtn = el('button', { type: 'button', 'data-test-id': 'upload-file-button', 'aria-label': 'Add files' }, { rect: { left: 274, right: 306, top: 828, bottom: 860, width: 32, height: 32 } });
  const chip = el('button', { type: 'button', class: 'toolbox-drawer-item-button' }, { textContent: 'Deep Research' });
  const modeWrap = el('bard-mode-switcher');
  const modelBtn = el('button', { type: 'button', 'data-test-id': 'bard-mode-menu-button', class: 'input-area-switch', 'aria-haspopup': 'menu' }, { textContent: 'Gemini 2.5 Pro ⌄' });
  modeWrap.append(modelBtn);
  composer.append(editor, addBtn, chip, modeWrap);
  inputArea.append(composer);
  composerCol.append(inputArea);
  dock.append(composerCol);
  main.append(thread, dock);
  chatWindow.append(main);
  body.append(chatWindow);

  const adapter = A.forHost('gemini', doc);
  assert.equal(adapter.userTurns().length, 1);
  assert.equal(adapter.assistantTurns().length, 1);
  assert.deepEqual([...adapter.codeSurfaces()], [cb]);
  assert.deepEqual([...adapter.codeHeaders()], [hdr]);
  assert.equal(adapter.modelSelectorTrigger(), modelBtn);
  assert.equal(adapter.activeModelLabel(), 'Gemini 2.5 Pro');
  assert.deepEqual([...adapter.visibleAttachments()], [att]);
  assert.equal(adapter.composerAddTrigger(composer), addBtn);
  assert.deepEqual([...adapter.composerChips(composer)], [chip]);
  assert.equal(adapter.composerScrimSurface(composer), dock);
  assert.equal(adapter.threadColumns().includes(thread), true);
  assert.equal(adapter.composerColumns(composer).includes(composerCol), true);
});

test('cleanTurnText strips UI chrome and optionally excludes code blocks', () => {
  const A = adapters();
  const { el } = makeDoc('chatgpt');
  const turn = el('article', { 'data-testid': 'conversation-turn-5', 'data-turn': 'assistant' });
  turn.append(
    el('h6', { class: 'sr-only' }, { textContent: 'ChatGPT said:' }),
    el('div', { 'data-op-owned': '' }, { textContent: 'Translate thoughts' }),
    el('script', {}, { textContent: 'var secret = 1;' }),
    el('style', {}, { textContent: '.x { color: red; }' }),
    el('svg', {}, { textContent: 'icon' }),
    el('div', { hidden: '' }, { textContent: 'Hidden text' }),
    el('div', { 'aria-hidden': 'true' }, { textContent: 'Aria hidden' }),
    el('button', {}, { textContent: 'Copy' }),
    el('span', { role: 'button' }, { textContent: 'Retry' }),
    el('div', { class: 'turn-actions' }, { textContent: 'Like Dislike' }),
    el('div', { 'data-testid': 'turn-actions' }, { textContent: 'Share' }),
    el('div', { 'data-testid': 'citation-pill' }, { textContent: 'Source 1' }),
    el('span', { class: 'citation-chip' }, { textContent: 'Ref A' }),
    el('message-actions', {}, { textContent: 'More' }),
    el('p', {}, { textContent: 'Main prose answer.' })
  );
  const cb = el('div', { 'data-testid': 'code-block' });
  cb.append(
    el('div', { class: 'code-header' }, { textContent: 'JavaScript' }),
    el('div', { class: 'code-block-decoration' }, { textContent: 'Decor' }),
    el('div', { 'data-testid': 'code-block-header' }, { textContent: 'Copy' }),
    el('div', { 'data-test-id': 'code-block-header' }, { textContent: 'Run' })
  );
  const pre = el('pre');
  pre.append(el('code', {}, { textContent: 'const x = 1;' }));
  cb.append(pre);
  turn.append(cb);

  assert.equal(A.cleanTurnText(turn, { excludeCode: true }), 'Main prose answer.');
  const withCode = A.cleanTurnText(turn);
  assert.equal(withCode.includes('Main prose answer.'), true);
  assert.equal(withCode.includes('const x = 1;'), true);
  assert.equal(withCode.includes('ChatGPT said'), false);
  assert.equal(withCode.includes('JavaScript'), false);
  assert.equal(withCode.includes('Source 1'), false);
});

test('estimateTurnTokens separates prose and code without double counting', () => {
  const A = adapters();
  const { el } = makeDoc('chatgpt');
  const turn = el('article', { 'data-turn': 'assistant' });
  turn.append(
    el('h6', { class: 'sr-only' }, { textContent: 'ChatGPT said:' }),
    el('p', {}, { textContent: '12345678' }), // 8 chars -> 2 prose tokens
    el('div', { class: 'code-header' }, { textContent: 'JavaScript' })
  );
  const pre = el('pre');
  pre.append(
    el('button', {}, { textContent: 'Copy' }),
    el('code', {}, { textContent: '1234567890123456' }) // 16 chars -> 5 code tokens (16 / 3.2 = 5)
  );
  turn.append(pre);

  const result = A.estimateTurnTokens(turn);
  assert.deepEqual({ ...result }, { prose: 2, code: 5, total: 7 });
  assert.deepEqual({ ...A.estimateTurnTokens(null) }, { prose: 0, code: 0, total: 0 });
});

test('resolveReferenceCapacity maps ChatGPT and Gemini models, falls back cleanly, and honors manual overrides', () => {
  const A = adapters();
  assert.deepEqual({ ...A.resolveReferenceCapacity('chatgpt', 'ChatGPT 5.2', 128000) }, {
    tokens: 128000, source: 'manual', modelLabel: 'ChatGPT 5.2'
  });

  // Gemini auto mappings
  assert.deepEqual({ ...A.resolveReferenceCapacity('gemini', 'Gemini 1.5 Pro', 'auto') }, {
    tokens: 2000000, source: 'matched', modelLabel: 'Gemini 1.5 Pro'
  });
  for (const label of ['Gemini 2.5 Pro', 'Gemini 2.0 Flash', 'Gemini 3', '2.5 Flash', 'Thinking', 'Gemini Ultra']) {
    const res = A.resolveReferenceCapacity('gemini', label, 'auto');
    assert.equal(res.tokens, 1000000, label);
    assert.equal(res.source, 'matched', label);
  }
  for (const label of ['Gemini', '', 'Unknown']) {
    const res = A.resolveReferenceCapacity('gemini', label, 'auto');
    assert.equal(res.tokens, 1000000, label);
    assert.equal(res.source, 'fallback', label);
  }

  // ChatGPT auto mappings
  assert.deepEqual({ ...A.resolveReferenceCapacity('chatgpt', 'GPT-4.1', 'auto') }, {
    tokens: 1000000, source: 'matched', modelLabel: 'GPT-4.1'
  });
  for (const label of ['ChatGPT 5.2', 'ChatGPT 5.1', 'GPT-5', 'ChatGPT 5']) {
    const res = A.resolveReferenceCapacity('chatgpt', label, 'auto');
    assert.equal(res.tokens, 400000, label);
    assert.equal(res.source, 'matched', label);
  }
  for (const label of ['o1', 'o3-mini', 'o4-mini']) {
    const res = A.resolveReferenceCapacity('chatgpt', label, 'auto');
    assert.equal(res.tokens, 200000, label);
    assert.equal(res.source, 'matched', label);
  }
  for (const label of ['GPT-4o', 'GPT-4']) {
    const res = A.resolveReferenceCapacity('chatgpt', label, 'auto');
    assert.equal(res.tokens, 128000, label);
    assert.equal(res.source, 'matched', label);
  }
  assert.equal(A.resolveReferenceCapacity('chatgpt', 'GPT-3.5', 'auto').tokens, 32000);
  assert.equal(A.resolveReferenceCapacity('chatgpt', 'GPT-3.5', 'auto').source, 'matched');
  for (const label of ['ChatGPT', '', 'Plus']) {
    const res = A.resolveReferenceCapacity('chatgpt', label, 'auto');
    assert.equal(res.tokens, 128000, label);
    assert.equal(res.source, 'unrecognized', label);
  }
  // An unknown host is an unflagged auto fallback.
  assert.deepEqual({ ...A.resolveReferenceCapacity('other', 'x', 'auto') }, { tokens: 128000, source: 'fallback', modelLabel: 'x' });
});

function withDocumentOrder(body) {
  const preorder = [];
  const walk = node => { preorder.push(node); for (const child of node.children || []) walk(child); };
  walk(body);
  for (const node of preorder) {
    node.compareDocumentPosition = other => {
      const a = preorder.indexOf(node), b = preorder.indexOf(other);
      if (a < 0 || b < 0 || a === b) return 0;
      return a < b ? 4 : 2;
    };
  }
}

// Mirrors tests/fixtures/chatgpt-live.html (2026-11-22 probe): turn-key containers, role in the
// content-search-unit-key suffix, and virtualized placeholders that carry no search-unit key.
function liveChatGPTThread(el) {
  const transcript = el('div', { class: 'flex flex-col transcriptContent_q8xz' });
  const placeholder = () => {
    const turn = el('div', { 'data-turn-key': 'placeholder' });
    const virtual = el('div', { 'data-virtualized-turn': '' });
    virtual.append(el('div', { class: 'turn-placeholder' }));
    turn.append(virtual);
    return turn;
  };
  const unit = (index, role, body) => {
    const turn = el('div', { 'data-turn-key': `turn-${index}` });
    const virtual = el('div', { 'data-virtualized-turn': '' });
    const node = el('div', { 'data-content-search-unit-key': `conv:${index}:${role}` });
    node.append(el(role === 'user' ? 'h5' : 'h6', { class: 'sr-only' }, { textContent: role === 'user' ? 'You said:' : 'ChatGPT said:' }), body);
    virtual.append(node);
    turn.append(virtual);
    return { turn, node };
  };
  const u2 = unit(2, 'user', el('div', { 'data-user-message-bubble': 'true', class: 'user-message-bubble-color' }, { textContent: 'First synthetic question' }));
  const a3 = unit(3, 'assistant', el('div', { 'data-markdown-text-style': 'assistant-message', class: 'markdown' }, { textContent: 'First synthetic reply' }));
  const u4 = unit(4, 'user', el('div', { 'data-user-message-bubble': 'true' }, { textContent: 'Follow-up' }));
  const a5 = unit(5, 'assistant', el('div', { 'data-markdown-text-style': 'assistant-message' }, { textContent: 'Second reply' }));
  transcript.append(placeholder(), placeholder(), u2.turn, a3.turn, u4.turn, a5.turn);
  return { transcript, users: [u2.node, u4.node], assistants: [a3.node, a5.node] };
}

test('ChatGPT live markers: role suffix turns are recognized in document order and virtualized placeholders are not counted', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('chatgpt');
  const main = el('main', { id: 'main' });
  const { transcript, users, assistants } = liveChatGPTThread(el);
  main.append(transcript);
  body.append(main);
  withDocumentOrder(body);

  const adapter = A.forHost('chatgpt', doc);
  assert.deepEqual([...adapter.userTurns()], users);
  assert.deepEqual([...adapter.assistantTurns()], assistants);
  assert.equal(adapter.isAssistantNode(assistants[0].children[1]), true);
  assert.equal(adapter.isAssistantNode(users[0].children[1]), false);
});

test('ChatGPT live markers: a bubble or assistant markdown without a search-unit key still counts once', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('chatgpt');
  const main = el('main', { id: 'main' });
  const turnA = el('div', { 'data-turn-key': 'a' });
  const bubble = el('div', { 'data-user-message-bubble': 'true' }, { textContent: 'Question only marked by its bubble' });
  turnA.append(bubble);
  const turnB = el('div', { 'data-turn-key': 'b' });
  const markdown = el('div', { 'data-markdown-text-style': 'assistant-message' }, { textContent: 'Reply only marked by its markdown style' });
  turnB.append(markdown);
  const emptyTurn = el('div', { 'data-turn-key': 'c' });
  emptyTurn.append(el('div', { 'data-virtualized-turn': '' }));
  main.append(turnA, turnB, emptyTurn);
  body.append(main);
  withDocumentOrder(body);

  const adapter = A.forHost('chatgpt', doc);
  assert.deepEqual([...adapter.userTurns()], [bubble]);
  assert.deepEqual([...adapter.assistantTurns()], [markdown]);
});

test('ChatGPT empty thread with only virtualized placeholders has no turns (Home State signal)', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('chatgpt');
  const main = el('main', { id: 'main' });
  for (const key of ['p1', 'p2']) {
    const turn = el('div', { 'data-turn-key': key });
    turn.append(el('div', { 'data-virtualized-turn': '' }));
    main.append(turn);
  }
  body.append(main);
  const adapter = A.forHost('chatgpt', doc);
  assert.equal(adapter.userTurns().length, 0);
  assert.equal(adapter.assistantTurns().length, 0);
});

test('ChatGPT tier labels resolve the Reference Capacity; unknown labels fall back to 128K flagged as unrecognized', () => {
  const A = adapters();
  for (const label of ['Pro', 'Thinking', 'High', 'xHigh', 'Extra High', 'GPT-5 Thinking']) {
    const res = A.resolveReferenceCapacity('chatgpt', label, 'auto');
    assert.deepEqual([res.tokens, res.source], [400000, 'matched'], label);
  }
  const instant = A.resolveReferenceCapacity('chatgpt', 'Instant', 'auto');
  assert.deepEqual([instant.tokens, instant.source], [128000, 'matched']);
  for (const label of ['Auto', 'Highlight', 'Select ChatGPT model', '']) {
    const res = A.resolveReferenceCapacity('chatgpt', label, 'auto');
    assert.deepEqual([res.tokens, res.source], [128000, 'unrecognized'], label);
  }
  // A manual capacity always wins and is never flagged.
  const manual = A.resolveReferenceCapacity('chatgpt', 'Mystery tier', 200000);
  assert.deepEqual([manual.tokens, manual.source], [200000, 'manual']);
  assert.equal(A.resolveReferenceCapacity('chatgpt', 'Instant', 400000).tokens, 400000);
});

test('Gemini custom mode names keep the 1M auto fallback without the unrecognized flag', () => {
  const A = adapters();
  const res = A.resolveReferenceCapacity('gemini', 'Neon High', 'auto');
  assert.deepEqual([res.tokens, res.source], [1000000, 'fallback']);
});

test('ChatGPT adapter sorts mixed turns in DOM order, recognizes zh .sr-only fallbacks, filters pre-tail spacers, and prefers icon add trigger', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('chatgpt');
  const main = el('main', { id: 'main' });
  const thread = el('div', { class: 'thread' });

  const t0 = el('article', { 'data-testid': 'conversation-turn-0' });
  t0.append(el('h5', { class: 'sr-only' }, { textContent: '你说：' }), el('div', {}, { textContent: '第一问' }));

  const t1Wrap = el('article', { 'data-testid': 'conversation-turn-1' });
  const t1 = el('div', { 'data-message-author-role': 'user' }, { textContent: 'Second question' });
  t1Wrap.append(t1);

  const preSpacer = el('div', { 'data-testid': 'conversation-turn-spacer' }, { textContent: '' });

  const t2 = el('article', { 'data-testid': 'conversation-turn-2' });
  t2.append(el('h6', { class: 'sr-only' }, { textContent: 'ChatGPT 说：' }), el('div', {}, { textContent: '第一答' }));

  const t3 = el('article', { 'data-testid': 'conversation-turn-3', 'data-turn': 'assistant' }, { textContent: 'Second answer' });
  const tailSpacer = el('div', { 'data-testid': 'conversation-turn-spacer' }, { textContent: '' });

  thread.append(t0, t1Wrap, preSpacer, t2, t3, tailSpacer);

  const composer = el('div', { id: 'composer-background' });
  const textAddBtn = el('button', { type: 'button', 'aria-label': '上传' }, { textContent: '上传文件' });
  const iconAddBtn = el('button', { type: 'button', 'aria-label': '添加' }, { textContent: '+' });
  composer.append(textAddBtn, iconAddBtn);

  main.append(thread, composer);
  body.append(main);

  const preorder = [];
  const walk = node => {
    preorder.push(node);
    for (const child of node.children || []) walk(child);
  };
  walk(body);
  for (const node of preorder) {
    node.compareDocumentPosition = other => {
      const a = preorder.indexOf(node);
      const b = preorder.indexOf(other);
      if (a < 0 || b < 0 || a === b) return 0;
      return a < b ? 4 : 2;
    };
  }

  const adapter = A.forHost('chatgpt', doc);
  assert.deepEqual([...adapter.userTurns()], [t0, t1]);
  assert.deepEqual([...adapter.assistantTurns()], [t2, t3]);
  assert.deepEqual([...adapter.threadTailSpacers()], [tailSpacer]);
  assert.equal(adapter.composerAddTrigger(composer), iconAddBtn);
});

test('v0.4.0 #26: ChatGPT adapter resolves composerGrid.trailing, modelCapsuleSlot, composerPrimaryAction, and composerAttachments across named and positional grids', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('chatgpt');
  const main = el('main', { id: 'main' });
  const composer = el('div', { 'data-composer-layout': 'single-line' });
  const grid = el('div', { class: 'composerGrid_h2vs' }, { style: { display: 'grid', visibility: 'visible', opacity: '1', contentVisibility: 'visible' } });
  const header = el('div', { class: 'composer-header' }, { style: { display: 'flex', visibility: 'visible', opacity: '1', gridRowStart: 'header', gridColumnStart: 'header' } });
  const tile = el('div', { class: 'file-tile_p4wt' }, { textContent: 'notes.pdf', rect: { left: 20, right: 160, top: 10, bottom: 44, width: 140, height: 34 } });
  const removeBtn = el('button', { type: 'button', 'aria-label': 'Remove file' }, { textContent: '×' });
  tile.append(removeBtn);
  header.append(tile);

  const leading = el('div', { class: 'composer-leading' }, { style: { display: 'flex', visibility: 'visible', opacity: '1', gridRowStart: 'leading', gridColumnStart: 'leading' } });
  const addBtn = el('button', { type: 'button', 'aria-label': 'Add files and more' }, { textContent: '+' });
  leading.append(addBtn);

  const primary = el('div', { class: 'composer-primary' }, { style: { display: 'block', visibility: 'visible', opacity: '1', gridRowStart: 'primary', gridColumnStart: 'primary' } });
  const editor = el('div', { id: 'prompt-textarea', contenteditable: 'true', role: 'textbox' });
  primary.append(editor);

  const trailing = el('div', { class: 'composer-trailing' }, { style: { display: 'flex', visibility: 'visible', opacity: '1', gridRowStart: 'trailing', gridColumnStart: 'trailing' } });
  const modelBtn = el('button', { type: 'button', 'aria-label': 'Select ChatGPT model', 'data-selected-reasoning-effort': 'high' }, { textContent: 'High' });
  const dictateBtn = el('button', { type: 'button', 'aria-label': 'Dictate' });
  const voiceBtn = el('button', { type: 'button', 'aria-label': 'Start Voice' });
  trailing.append(modelBtn, dictateBtn, voiceBtn);

  grid.append(header, leading, primary, trailing);
  composer.append(grid);
  const turnAttachment = el('div', { class: 'file-tile_p4wt' }, { textContent: 'turn-only.pdf', rect: { left: 20, right: 160, top: 10, bottom: 44, width: 140, height: 34 } });
  main.append(turnAttachment, composer);
  body.append(main);

  const adapter = A.forHost('chatgpt', doc);
  const resolvedGrid = adapter.composerGrid(composer);
  assert.equal(resolvedGrid.element, grid);
  assert.equal(resolvedGrid.slots, null);
  assert.equal(resolvedGrid.trailing, trailing);
  assert.equal(adapter.modelCapsuleSlot(resolvedGrid.trailing, modelBtn), modelBtn);
  assert.deepEqual([...adapter.composerAttachments(composer)], [tile]);
  assert.equal(adapter.composerPrimaryAction(composer), voiceBtn);

  // Exclude dictate (English & Chinese) and prefer send button over voice button when both exist.
  const sendBtn = el('button', { type: 'button', 'data-testid': 'send-button', 'aria-label': 'Send prompt' });
  trailing.append(sendBtn);
  assert.equal(adapter.composerPrimaryAction(composer), sendBtn);

  sendBtn.style.display = 'none';
  voiceBtn.style.display = 'none';
  const zhDictate = el('button', { type: 'button', 'aria-label': '听写' });
  trailing.append(zhDictate);
  assert.equal(adapter.composerPrimaryAction(composer), null, 'never falls back to dictate, model, add, or attachment remove buttons');

  // Positional grid (unnamed children) returns trailing === slots.trailing.
  for (const child of [header, leading, primary, trailing]) {
    child.style.gridRowStart = 'auto';
    child.style.gridColumnStart = 'auto';
  }
  const positional = adapter.composerGrid(composer);
  assert.equal(positional.element, grid);
  assert.equal(positional.slots.trailing, trailing);
  assert.equal(positional.trailing, trailing);

  // Outside modelTrigger returns null slot.
  const externalModel = el('button', { type: 'button', 'aria-label': 'Select ChatGPT model' });
  main.append(externalModel);
  assert.equal(adapter.modelCapsuleSlot(trailing, externalModel), null);
});

test('v0.4.0 #26: Gemini adapter resolves bard-mode-switcher capsule slot, trailing microphone fallback, and uploader-file-preview attachments', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('gemini');
  const chatWindow = el('chat-window');
  const inputArea = el('input-area-v2');
  const grid = el('div', { class: 'text-input-field' }, { style: { display: 'grid', visibility: 'visible', opacity: '1', contentVisibility: 'visible' } });

  const fileRow = el('div', { class: 'file-preview-container' }, { style: { display: 'flex', visibility: 'visible', opacity: '1', gridRowStart: 'file-preview', gridColumnStart: 'file-preview' } });
  const preview = el('uploader-file-preview', { class: 'file-preview-chip' }, { textContent: 'brief.pdf', rect: { left: 20, right: 160, top: 10, bottom: 44, width: 140, height: 34 } });
  preview.append(el('button', { type: 'button', 'aria-label': 'Remove file' }, { textContent: '×' }));
  fileRow.append(preview);

  const leading = el('div', { class: 'leading-actions-wrapper' }, { style: { display: 'flex', visibility: 'visible', opacity: '1', gridRowStart: 'leading-actions', gridColumnStart: 'leading-actions' } });
  const addBtn = el('button', { type: 'button', 'data-test-id': 'upload-file-button', 'aria-label': 'Open upload file menu' });
  leading.append(addBtn);

  const textWrap = el('div', { class: 'text-input-field_textarea-wrapper' }, { style: { display: 'block', visibility: 'visible', opacity: '1', gridRowStart: 'text-input', gridColumnStart: 'text-input' } });
  const editor = el('div', { class: 'ql-editor', contenteditable: 'true', role: 'textbox' });
  textWrap.append(editor);

  const trailing = el('div', { class: 'trailing-actions-wrapper' }, { style: { display: 'flex', visibility: 'visible', opacity: '1', gridRowStart: 'trailing-actions', gridColumnStart: 'trailing-actions' } });
  const switcher = el('bard-mode-switcher');
  const modelBtn = el('button', { type: 'button', 'aria-label': 'Open mode picker, currently Neon High' }, { textContent: 'Neon High' });
  switcher.append(modelBtn);
  const chip = el('button', { type: 'button', class: 'toolbox-drawer-item-button' }, { textContent: 'Deep Research' });
  // Unlabeled / localized fallback button inside trailing still resolves as primary action when not model/chip/dictate.
  const idleMicFallback = el('button', { type: 'button', 'aria-label': 'Use audio input' });
  trailing.append(switcher, chip, idleMicFallback);

  grid.append(fileRow, leading, textWrap, trailing);
  inputArea.append(grid);
  chatWindow.append(inputArea);
  body.append(chatWindow);

  const adapter = A.forHost('gemini', doc);
  const resolvedGrid = adapter.composerGrid(inputArea);
  assert.equal(resolvedGrid.element, grid);
  assert.equal(resolvedGrid.slots, null);
  assert.equal(resolvedGrid.trailing, trailing);
  assert.equal(adapter.modelCapsuleSlot(resolvedGrid.trailing, modelBtn), switcher);
  assert.deepEqual([...adapter.composerAttachments(inputArea)], [preview]);
  assert.equal(adapter.composerPrimaryAction(inputArea), idleMicFallback);

  const sendBtn = el('button', { type: 'button', 'data-test-id': 'send-button', 'aria-label': 'Send message' });
  trailing.append(sendBtn);
  assert.equal(adapter.composerPrimaryAction(inputArea), sendBtn);
});
