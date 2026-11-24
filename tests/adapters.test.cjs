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

test('v0.4.1 #33: Gemini adapter returns only inner .code-block for double-nested code-block while flat code-block.code-block returns itself', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('gemini');
  const main = el('main', { id: 'main' });
  const mr = el('model-response');
  const mrText = el('div', { class: 'model-response-text' });

  // Double-nested: <code-block><div class="code-block"><div class="code-block-decoration">...</div><pre>...</pre></div></code-block>
  const outerNested = el('code-block', {}, { style: { display: 'inline', visibility: 'visible', opacity: '1' } });
  const innerNested = el('div', { class: 'code-block' });
  const nestedHdr = el('div', { class: 'code-block-decoration' }, { textContent: 'snippet' });
  const nestedWrap = el('div', { class: 'formatted-code-block-internal-container' });
  const nestedPre = el('pre');
  nestedPre.append(el('code', {}, { textContent: 'const x = 1;' }));
  nestedWrap.append(nestedPre);
  innerNested.append(nestedHdr, nestedWrap);
  outerNested.append(innerNested);

  // Flat: <code-block class="code-block">...</code-block>
  const flatCb = el('code-block', { class: 'code-block' });
  const flatHdr = el('div', { class: 'code-block-decoration' }, { textContent: 'js' });
  const flatPre = el('pre');
  flatPre.append(el('code', {}, { textContent: 'const y = 2;' }));
  flatCb.append(flatHdr, flatPre);

  // Outer code-block with an empty/non-code .code-block descendant falls back to outer code-block
  const decoyOuter = el('code-block');
  const decoyInner = el('div', { class: 'code-block' }, { textContent: 'empty' });
  decoyOuter.append(decoyInner);

  mrText.append(outerNested, flatCb, decoyOuter);
  mr.append(mrText);
  main.append(mr);
  body.append(main);

  const adapter = A.forHost('gemini', doc);
  assert.deepEqual([...adapter.codeSurfaces()], [innerNested, flatCb, decoyOuter]);
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

test('v0.4.1 #34: codeBlocks and estimateTurnTokens exclude owned Formula Preview and fallback pre nodes while counting hidden-source code once', () => {
  const A = adapters();
  const { el, doc, body } = makeDoc('gemini');
  const turn = el('model-response');
  const card = el('div', { class: 'code-block' });
  const sourceWrap = el('div', { class: 'formatted-code-block-internal-container', 'data-op-formula-source-hidden': 'true' });
  const pre = el('pre');
  pre.append(el('code', {}, { textContent: '1234567890123456' }));
  sourceWrap.append(pre);

  const ownedPreview = el('div', { class: 'op-formula-preview', 'data-op-owned': '' });
  const caption = el('p', { class: 'op-formula-caption' }, { textContent: 'Ignored caption text' });
  const fallbackPre = el('pre', { class: 'op-formula-fallback' }, { textContent: 'Ignored fallback pre' });
  ownedPreview.append(caption, fallbackPre);

  card.append(sourceWrap, ownedPreview);
  turn.append(card);
  body.append(turn);

  const adapter = A.forHost('gemini', doc);
  assert.deepEqual([...adapter.codeBlocks()], [pre]);
  assert.deepEqual({ ...A.estimateTurnTokens(turn) }, { prose: 0, code: 5, total: 5 });
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

// v0.4.3 #42 Sidebar active highlight: the adapter returns each active target with its shape.
// Geometry mirrors the 2026-11-24 live measurements (.trellis/research/live-host-dom.md).
const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
function chatgptSidebar() {
  const fake = makeDoc('chatgpt');
  const sidebar = fake.el('div', { id: 'stage-slideover-sidebar' }, { rect: box(0, 0, 278, 900) });
  const nav = fake.el('nav', { 'aria-label': 'Chat history' }, { rect: box(8, 0, 262, 900) });
  sidebar.append(nav);
  fake.body.append(sidebar);
  return { ...fake, sidebar, nav };
}
const activeTargets = adapter => [...adapter.sidebarActiveRows()].map(target => ({ element: target.element, shape: target.shape }));

test('sidebar active state duplicated on the whole row and its inner link highlights the whole row', () => {
  const A = adapters();
  const { doc, el, nav } = chatgptSidebar();
  const row = el('div', { role: 'group', 'aria-current': 'page' }, { rect: box(8, 120, 262, 36) });
  const link = el('a', { href: '/c/synthetic-current', 'aria-current': 'page' }, { rect: box(16, 128, 243, 20), innerText: 'Synthetic current chat', textContent: 'Synthetic current chat' });
  const options = el('button', { 'aria-label': 'Open conversation options' }, { rect: box(242, 126, 24, 24) });
  row.append(link, options);
  const other = el('a', { href: '/c/synthetic-other' }, { rect: box(8, 160, 262, 36), innerText: 'Another chat', textContent: 'Another chat' });
  nav.append(row, other);
  const targets = activeTargets(A.forHost('chatgpt', doc));
  assert.equal(targets.length, 1, 'one highlight per active item');
  assert.equal(targets[0].element, row, 'the outermost active row owns the highlight, not the smaller inner link');
  assert.equal(targets[0].shape, 'row');
});

test('an active project group does not pass its active state to all of its child rows', () => {
  const A = adapters();
  const { doc, el, nav } = chatgptSidebar();
  const chat = (href, top, attrs = {}) => el('a', { href, ...attrs }, { rect: box(24, top, 238, 36), innerText: 'Synthetic project chat', textContent: 'Synthetic project chat' });
  // Group with a header and three conversations; only the current conversation is active.
  const group = el('div', { role: 'group', 'aria-current': 'true' }, { rect: box(8, 200, 262, 144) });
  const header = el('button', { type: 'button' }, { rect: box(8, 200, 262, 36), innerText: 'Synthetic project', textContent: 'Synthetic project' });
  const current = chat('/g/p/c/one', 236, { 'aria-current': 'page' });
  group.append(header, current, chat('/g/p/c/two', 272), chat('/g/p/c/three', 308));
  // Group with a header above a single conversation: still a group, not a single-line row.
  const small = el('div', { role: 'group', 'data-active': 'true' }, { rect: box(8, 360, 262, 72) });
  const smallHeader = el('button', { type: 'button' }, { rect: box(8, 360, 262, 36), innerText: 'Other project', textContent: 'Other project' });
  const only = chat('/g/q/c/only', 396);
  small.append(smallHeader, only);
  nav.append(group, small);
  const targets = activeTargets(A.forHost('chatgpt', doc));
  assert.deepEqual(targets.map(target => target.element), [current, only], 'only the active conversation, never the group or its siblings');
  assert.deepEqual(targets.map(target => target.shape), ['row', 'row']);
  current.removeAttribute('aria-current');
  assert.deepEqual(activeTargets(A.forHost('chatgpt', doc)).map(target => target.element), [only], 'a multi-chat group alone highlights nothing');
});

test('a near-square icon-only sidebar button is an icon tile; geometry decides over host hints', () => {
  const A = adapters();
  const { doc, el, nav } = chatgptSidebar();
  const rail = el('div', {}, { rect: box(8, 8, 262, 36) });
  const icon = () => el('svg', { 'aria-hidden': 'true' }, { rect: box(0, 0, 20, 20) });
  const home = el('button', { type: 'button', 'aria-label': 'Home', 'data-uniform': '', 'data-selected': '', 'aria-current': 'page' }, { rect: box(8, 8, 36, 36) });
  // Screen-reader text clipped to a 1px box is not visible text.
  const srOnly = el('span', { class: 'sr-only' }, { rect: box(20, 20, 1, 1), textContent: 'Home', innerText: 'Home' });
  home.append(icon(), srOnly);
  const library = el('button', { type: 'button', 'aria-label': 'Library', 'data-uniform': '' }, { rect: box(48, 8, 36, 36) });
  library.append(icon());
  rail.append(home, library);
  nav.append(rail);
  let targets = activeTargets(A.forHost('chatgpt', doc));
  assert.equal(targets.length, 1);
  assert.equal(targets[0].element, home);
  assert.equal(targets[0].shape, 'tile', 'a 36×36 icon-only button is an icon tile');

  // Without the host hint, the same geometry is still a tile.
  home.removeAttribute('aria-current');
  const plain = el('button', { type: 'button', 'aria-label': 'Explore', 'aria-selected': 'true' }, { rect: box(88, 8, 34, 36) });
  plain.append(icon());
  rail.append(plain);
  targets = activeTargets(A.forHost('chatgpt', doc));
  assert.deepEqual(targets.map(target => [target.element, target.shape]), [[plain, 'tile']]);

  // A hinted button with a visible label, or a wide one, stays a row.
  plain.removeAttribute('aria-selected');
  const labelled = el('button', { type: 'button', 'data-uniform': '', 'aria-current': 'page' }, { rect: box(8, 60, 36, 36) });
  labelled.append(el('span', {}, { rect: box(12, 70, 26, 16), textContent: 'OP', innerText: 'OP' }));
  const wide = el('button', { type: 'button', 'data-uniform': '', 'aria-current': 'page' }, { rect: box(8, 100, 262, 36) });
  wide.append(icon());
  nav.append(labelled, wide);
  targets = activeTargets(A.forHost('chatgpt', doc));
  assert.deepEqual(targets.map(target => [target.element, target.shape]), [[labelled, 'row'], [wide, 'row']]);
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
  assert.equal(adapter.composerCardSurface(grid), inputArea, 'Gemini composerCardSurface resolves enclosing input-area-v2');
});

test('primaryAction tier priority: Send beats Voice and Microphone even when Send precedes them in DOM order', () => {
  const A = adapters();

  // ChatGPT: [sendBtn, voiceBtn, micBtn] in DOM order -> Send must win over Voice & Microphone.
  {
    const { doc, body, el } = makeDoc('chatgpt');
    const composer = el('div', { 'data-composer-layout': 'single-line' });
    const grid = el('div', {}, { style: { display: 'grid', visibility: 'visible', opacity: '1' } });
    const leading = el('div', {}, { style: { display: 'flex', visibility: 'visible', opacity: '1', gridColumnStart: 'leading' } });
    const primary = el('div', {}, { style: { display: 'block', visibility: 'visible', opacity: '1', gridColumnStart: 'primary' } });
    primary.append(el('div', { id: 'prompt-textarea', contenteditable: 'true', role: 'textbox' }));
    const trailing = el('div', {}, { style: { display: 'flex', visibility: 'visible', opacity: '1', gridColumnStart: 'trailing' } });
    const sendBtn = el('button', { type: 'button', 'data-testid': 'send-button', 'aria-label': 'Send prompt' });
    const voiceBtn = el('button', { type: 'button', 'data-testid': 'composer-speech-button', 'aria-label': 'Start Voice' });
    const micBtn = el('button', { type: 'button', 'aria-label': 'Microphone' });
    trailing.append(sendBtn, voiceBtn, micBtn);
    grid.append(leading, primary, trailing);
    composer.append(grid);
    body.append(composer);

    const adapter = A.forHost('chatgpt', doc);
    assert.equal(adapter.composerCardSurface(composer), composer);
    assert.equal(adapter.composerPrimaryAction(composer), sendBtn, 'ChatGPT Tier 1 Send beats later Tier 2 Voice and Tier 3 Microphone');
    sendBtn.style.display = 'none';
    assert.equal(adapter.composerPrimaryAction(composer), voiceBtn, 'ChatGPT Tier 2 Voice beats later Tier 3 Microphone');
    voiceBtn.style.display = 'none';
    assert.equal(adapter.composerPrimaryAction(composer), micBtn, 'ChatGPT falls back to Tier 3 Microphone when Send/Voice hidden');
  }

  // Gemini: [sendBtn, micBtn] in DOM order -> Send must win over Microphone.
  {
    const { doc, body, el } = makeDoc('gemini');
    const inputArea = el('input-area-v2');
    const grid = el('div', { class: 'text-input-field' }, { style: { display: 'grid', visibility: 'visible', opacity: '1' } });
    const leading = el('div', {}, { style: { display: 'flex', visibility: 'visible', opacity: '1', gridColumnStart: 'leading-actions' } });
    const textWrap = el('div', {}, { style: { display: 'block', visibility: 'visible', opacity: '1', gridColumnStart: 'text-input' } });
    textWrap.append(el('div', { class: 'ql-editor', contenteditable: 'true', role: 'textbox' }));
    const trailing = el('div', {}, { style: { display: 'flex', visibility: 'visible', opacity: '1', gridColumnStart: 'trailing-actions' } });
    const sendBtn = el('button', { type: 'button', 'data-test-id': 'send-button', 'aria-label': 'Send message' });
    const micBtn = el('button', { type: 'button', 'aria-label': 'Microphone' });
    trailing.append(sendBtn, micBtn);
    grid.append(leading, textWrap, trailing);
    inputArea.append(grid);
    body.append(inputArea);

    const adapter = A.forHost('gemini', doc);
    assert.equal(adapter.composerCardSurface(grid), inputArea);
    assert.equal(adapter.composerPrimaryAction(inputArea), sendBtn, 'Gemini Tier 1 Send beats later Tier 3 Microphone');
    sendBtn.style.display = 'none';
    assert.equal(adapter.composerPrimaryAction(inputArea), micBtn, 'Gemini falls back to Tier 3 Microphone when Send hidden');
  }

  assert.deepEqual(JSON.parse(JSON.stringify(A.dockEdgeMargin(1280))), { right: 20, bottom: 18 });
  assert.deepEqual(JSON.parse(JSON.stringify(A.dockEdgeMargin(700))), { right: 10, bottom: 10 });
});

test('ChatGPT live dock detection covers #thread-bottom-container, .content-fade, transcriptContent and .composer-column', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('chatgpt');
  const main = el('main', { id: 'main' });
  const parent = el('div', { class: 'composer-parent' });
  const scroller = el('div', { 'data-prism-test-scroller': '' }, { rect: { left: 0, right: 1280, top: 52, bottom: 720, width: 1280, height: 668 }, style: { display: 'block', visibility: 'visible', opacity: '1', overflowY: 'auto' } });
  const transcript = el('div', { class: 'flex flex-col transcriptContent_q8xz' });
  const turn = el('div', { 'data-turn-key': 't1' });
  turn.append(el('div', { 'data-content-search-unit-key': 'c:1:assistant', 'data-markdown-text-style': 'assistant-message' }, { textContent: 'Hello' }));
  transcript.append(turn);
  scroller.append(transcript);

  const dockOuter = el('div', { id: 'thread-bottom-container', class: 'content-fade_b9xk' }, { rect: { left: 0, right: 1280, top: 720, bottom: 900, width: 1280, height: 180 }, style: { display: 'block', visibility: 'visible', opacity: '1', position: 'relative' } });
  const fadeSibling = el('div', { class: 'content-fade' }, { rect: { left: 0, right: 1280, top: 696, bottom: 720, width: 1280, height: 24 }, style: { display: 'block', visibility: 'visible', opacity: '1', position: 'sticky', pointerEvents: 'auto' } });
  const nonEmptyFade = el('div', { class: 'content-fade' }, { textContent: 'Keep me out', rect: { left: 0, right: 1280, top: 700, bottom: 720, width: 1280, height: 20 } });
  const dockInner = el('div', { id: 'thread-bottom' }, { rect: { left: 0, right: 1280, top: 720, bottom: 900, width: 1280, height: 180 }, style: { display: 'block', visibility: 'visible', opacity: '1', position: 'static' } });
  const col = el('div', { class: 'composer-column' }, { rect: { left: 236, right: 1044, top: 724, bottom: 894, width: 808, height: 170 }, style: { display: 'block', visibility: 'visible', opacity: '1', position: 'static' } });
  const form = el('form', { 'data-chatgpt-composer': '' }, { rect: { left: 256, right: 1024, top: 724, bottom: 834, width: 768, height: 110 }, style: { display: 'block', visibility: 'visible', opacity: '1', position: 'static' } });
  const composer = el('div', { class: 'ComposerLayoutRoot_m3kp', 'data-composer-layout': 'single-line' }, { rect: { left: 256, right: 1024, top: 724, bottom: 834, width: 768, height: 110 } });
  const editor = el('div', { id: 'prompt-textarea', contenteditable: 'true', role: 'textbox' });
  const addBtn = el('button', { type: 'button', 'aria-label': 'Add files and more' });
  composer.append(editor, addBtn);
  form.append(composer);
  col.append(form);
  dockInner.append(col);
  dockOuter.append(fadeSibling, nonEmptyFade, dockInner);
  parent.append(scroller, dockOuter);
  main.append(parent);
  body.append(main);

  const adapter = A.forHost('chatgpt', doc);
  const backdrops = adapter.composerBackdropSurfaces(composer);
  assert.equal(backdrops.includes(dockOuter), true, 'collects #thread-bottom-container');
  assert.equal(backdrops.includes(dockInner), true, 'collects #thread-bottom');
  assert.equal(backdrops.includes(fadeSibling), true, 'collects empty non-interactive .content-fade sibling in dock subtree');
  assert.equal(backdrops.includes(nonEmptyFade), false, 'never collects text-bearing .content-fade sibling');
  assert.equal(adapter.composerScrimSurface(composer), dockOuter);
  assert.deepEqual([...adapter.threadColumns()], [transcript]);
  assert.equal(adapter.composerColumns(composer).includes(col), true);

  // Also test generic unnamed in-flow dock wrapper under .composer-parent without matching class/id.
  dockOuter.setAttribute('id', 'unnamed-dock');
  dockOuter.setAttribute('class', 'plain-box');
  assert.equal(adapter.composerBackdropSurfaces(composer).includes(dockOuter), true, 'nearBottomInFlowDock collects unnamed in-flow dock under .composer-parent');
  assert.equal(adapter.composerScrimSurface(composer), dockOuter);
});

test('isComposerDockOverlaid distinguishes in-flow flex siblings from overlaid and sticky-in-scroller docks', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('chatgpt');
  const view = doc.defaultView;
  assert.equal(A.isComposerDockOverlaid(null, null, view), false);

  const scroller = el('div', {}, { rect: { left: 0, right: 1280, top: 52, bottom: 720, width: 1280, height: 668 } });
  const inFlowDock = el('div', {}, { rect: { left: 0, right: 1280, top: 720, bottom: 900, width: 1280, height: 180 }, style: { position: 'relative' } });
  const stickySiblingDock = el('div', {}, { rect: { left: 0, right: 1280, top: 720, bottom: 900, width: 1280, height: 180 }, style: { position: 'sticky' } });
  const overlaidSiblingDock = el('div', {}, { rect: { left: 0, right: 1280, top: 760, bottom: 900, width: 1280, height: 140 }, style: { position: 'absolute' } });
  body.append(scroller, inFlowDock, stickySiblingDock, overlaidSiblingDock);

  // Headless DOM without getComputedStyle falls back to true for unit test compatibility.
  assert.equal(A.isComposerDockOverlaid(inFlowDock, scroller, {}), true);
  // In-flow sibling docks (even position: sticky when not overlapping scroller) are not overlaid.
  assert.equal(A.isComposerDockOverlaid(inFlowDock, scroller, view), false);
  assert.equal(A.isComposerDockOverlaid(stickySiblingDock, scroller, view), false);
  // Overlaid sibling dock overlaps scroller vertically.
  const overlayScroller = el('div', {}, { rect: { left: 0, right: 1280, top: 52, bottom: 900, width: 1280, height: 848 } });
  body.append(overlayScroller);
  assert.equal(A.isComposerDockOverlaid(overlaidSiblingDock, overlayScroller, view), true);
  // Non-overlapping sibling (even with position: absolute) is not overlaid.
  assert.equal(A.isComposerDockOverlaid(overlaidSiblingDock, scroller, view), false);

  // Dock inside scroller: sticky/fixed/absolute overlays scrolled content, relative does not.
  const stickyChild = el('div', {}, { style: { position: 'sticky' } });
  const relChild = el('div', {}, { style: { position: 'relative' } });
  scroller.append(stickyChild, relChild);
  assert.equal(A.isComposerDockOverlaid(stickyChild, scroller, view), true);
  assert.equal(A.isComposerDockOverlaid(relChild, scroller, view), false);

  // Dock containing scroller is never overlaid.
  assert.equal(A.isComposerDockOverlaid(body, scroller, view), false);

  // Document-level or missing scroller checks sticky/fixed/absolute positioning.
  assert.equal(A.isComposerDockOverlaid(overlaidSiblingDock, doc.documentElement, view), true);
  assert.equal(A.isComposerDockOverlaid(inFlowDock, doc.documentElement, view), false);
  assert.equal(A.isComposerDockOverlaid(overlaidSiblingDock, null, view), true);
  assert.equal(A.isComposerDockOverlaid(inFlowDock, null, view), false);
});

test('composerBelowSiblings separates empty spacers from visible disclaimers below the form inside dock', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('chatgpt');
  const dock = el('div', { id: 'thread-bottom-container' });
  const col = el('div', { class: 'composer-column' });
  const preAttachment = el('div', { class: 'pre-form-attachment' }, { textContent: 'sample.txt', rect: { left: 260, right: 400, top: 700, bottom: 720, width: 140, height: 20 } });
  const form = el('form', { 'data-chatgpt-composer': '' });
  const composer = el('div', { 'data-composer-layout': 'single-line' });
  form.append(composer);

  const emptySpacer = el('div', { class: 'composer-below-spacer' }, { rect: { left: 260, right: 1020, top: 834, bottom: 858, width: 760, height: 24 } });
  const nestedEmpty = el('div', { class: 'empty-wrap' });
  nestedEmpty.append(el('div', {}));
  const disclaimer = el('div', { class: 'disclaimer_v7rk' }, { textContent: 'Offline disclaimer. ', rect: { left: 260, right: 1020, top: 858, bottom: 900, width: 760, height: 42 } });
  disclaimer.append(el('a', { href: '#prefs' }, { textContent: 'Cookie Preferences' }));
  const genericBelow = el('div', { class: 'footer-note-plain' }, { textContent: 'Offline footer terms notice.', rect: { left: 260, right: 1020, top: 858, bottom: 882, width: 760, height: 24 } });
  const hiddenDisclaimer = el('div', { class: 'disclaimer_hidden', hidden: '' }, { textContent: 'Hidden notice', rect: { left: 260, right: 1020, top: 858, bottom: 890, width: 760, height: 32 } });
  const inputSibling = el('div', { class: 'disclaimer_input' }, { textContent: 'Input row', rect: { left: 260, right: 1020, top: 858, bottom: 890, width: 760, height: 32 } });
  inputSibling.append(el('input', { type: 'text' }));
  const tallSibling = el('div', {}, { textContent: 'Tall non-disclaimer panel', rect: { left: 260, right: 1020, top: 858, bottom: 990, width: 760, height: 132 } });

  col.append(preAttachment, form, emptySpacer, nestedEmpty, disclaimer, genericBelow, hiddenDisclaimer, inputSibling, tallSibling);
  const dockLevelDisclaimer = el('div', { class: 'composer-hint' }, { textContent: 'Dock level hint', rect: { left: 260, right: 1020, top: 890, bottom: 900, width: 760, height: 10 } });
  const outsideSibling = el('div', { class: 'outside-after-dock' });
  dock.append(col, dockLevelDisclaimer);
  body.append(dock, outsideSibling);

  const adapter = A.forHost('chatgpt', doc);
  const res = adapter.composerBelowSiblings(composer, dock);
  assert.deepEqual([...res.empty], [emptySpacer, nestedEmpty]);
  assert.deepEqual([...res.disclaimers], [disclaimer, genericBelow, dockLevelDisclaimer]);

  // Once Prism hides below-form disclaimers via CSS (display: none, 0px height), rescans must preserve them.
  disclaimer.setAttribute('data-op-composer-disclaimer', 'true');
  genericBelow.setAttribute('data-op-composer-disclaimer', 'true');
  disclaimer.getBoundingClientRect = () => ({ left: 260, right: 1020, top: 858, bottom: 858, width: 760, height: 0 });
  genericBelow.getBoundingClientRect = () => ({ left: 260, right: 1020, top: 858, bottom: 858, width: 760, height: 0 });
  const origGetStyle = doc.defaultView.getComputedStyle;
  doc.defaultView.getComputedStyle = n => (
    (n === disclaimer || n === genericBelow)
      ? { display: 'none', visibility: 'visible', opacity: '1', contentVisibility: 'visible' }
      : origGetStyle(n)
  );
  const resAfterHide = adapter.composerBelowSiblings(composer, dock);
  assert.deepEqual([...resAfterHide.empty], [emptySpacer, nestedEmpty]);
  assert.equal(resAfterHide.disclaimers.includes(disclaimer), true, 'keeps selector-matched below disclaimer across rescans');
  assert.equal(resAfterHide.disclaimers.includes(genericBelow), true, 'keeps generic below disclaimer across rescans');
});

test('composerBelowSiblings detects above-form and deep post-thread AI disclaimers while ignoring turns and icon buttons', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('chatgpt');
  const main = el('main');
  const scroller = el('div', { class: 'scroller' });
  const threadWrap = el('div', {});
  let nestedHost = threadWrap;
  for (let i = 0; i < 8; i++) {
    const layer = el('div', {});
    nestedHost.append(layer);
    nestedHost = layer;
  }
  const assistantTurn = el('div', { 'data-message-author-role': 'assistant' }, { textContent: 'ChatGPT is AI and can make mistakes.' });
  nestedHost.append(assistantTurn);
  const postThreadInner = el('span', {}, { textContent: 'ChatGPT is AI and can make mistakes. Check important info.' });
  const postThreadWrap = el('div', {}, { textContent: 'ChatGPT is AI and can make mistakes. Check important info.', rect: { left: 260, right: 1020, top: 700, bottom: 720, width: 760, height: 20 } });
  postThreadWrap.append(postThreadInner);
  scroller.append(threadWrap, postThreadWrap);

  const dock = el('div', { id: 'thread-bottom-container' });
  const col = el('div', { class: 'composer-column' });
  const scrollBtn = el('button', { type: 'button', 'aria-label': 'Scroll down' }, { textContent: 'ChatGPT is AI and can make mistakes.' });
  scrollBtn.append(el('svg', {}));
  const aboveInner = el('div', {}, { textContent: 'ChatGPT is AI and can make mistakes. Check important info.' });
  const aboveOuter = el('div', {}, { textContent: 'ChatGPT is AI and can make mistakes. Check important info.', rect: { left: 260, right: 1020, top: 740, bottom: 760, width: 760, height: 20 } });
  aboveOuter.append(aboveInner);
  const form = el('form', { 'data-chatgpt-composer': '' });
  const composer = el('div', { 'data-composer-layout': 'single-line' });
  form.append(composer);
  col.append(scrollBtn, aboveOuter, form);
  dock.append(col);
  main.append(scroller, dock);
  body.append(main);

  const adapter = A.forHost('chatgpt', doc);
  const res = adapter.composerBelowSiblings(composer, dock);
  assert.deepEqual([...res.disclaimers], [aboveOuter, postThreadWrap]);

  // Once Prism hides a marked disclaimer via CSS (computed display: none), a subsequent scan must keep it marked.
  aboveOuter.setAttribute('data-op-composer-disclaimer', 'true');
  const origGetStyle = doc.defaultView.getComputedStyle;
  doc.defaultView.getComputedStyle = n => (n === aboveOuter ? { display: 'none', visibility: 'visible', opacity: '1', contentVisibility: 'visible' } : origGetStyle(n));
  const resAfterHide = adapter.composerBelowSiblings(composer, dock);
  assert.equal(resAfterHide.disclaimers.includes(aboveOuter), true, 'keeps CSS-hidden self-marked disclaimer across rescans');
});

test('v0.4.0 #27: computeDockAvoidance computes idempotent zero-overlap shifts across corner floats, composer, tall rail, and tiny viewports', () => {
  const A = adapters();
  const plain = value => JSON.parse(JSON.stringify(value));
  const avoid = args => plain(A.computeDockAvoidance(args));
  const dockSize = { width: 220, height: 38 };
  const viewport = { width: 1707, height: 900 };

  // 1. Default clear: zero offset.
  const clear = avoid({
    viewport,
    dockSize,
    baseRight: 20,
    baseBottom: 18,
    composerRect: { left: 400, right: 1300, top: 730, bottom: 870, width: 900, height: 140 },
    railRect: { left: 1659, right: 1695, top: 288, bottom: 420, width: 36, height: 132 },
    cornerObstacles: []
  });
  assert.deepEqual(clear, { offsetX: 0, offsetY: 0 });

  // 2. Corner floating button at right:16 bottom:16 (32x32) shifts dock left when space permits.
  const cornerBtn = { left: 1659, right: 1691, top: 852, bottom: 884, width: 32, height: 32 };
  const cornerLeft = avoid({
    viewport,
    dockSize,
    baseRight: 20,
    baseBottom: 18,
    composerRect: { left: 500, right: 1300, top: 730, bottom: 870, width: 800, height: 140 },
    railRect: null,
    cornerObstacles: [cornerBtn]
  });
  // baseBox.right = 1687; cornerBtn.left - 10 = 1649 -> offsetX = 38, offsetY = 0
  assert.deepEqual(cornerLeft, { offsetX: 38, offsetY: 0 });

  // 3. If left-shift collides with composer, dock moves above composer/corner safely.
  const blockedLeft = avoid({
    viewport,
    dockSize,
    baseRight: 20,
    baseBottom: 18,
    composerRect: { left: 1200, right: 1460, top: 840, bottom: 890, width: 260, height: 50 },
    railRect: null,
    cornerObstacles: [cornerBtn]
  });
  assert.equal(blockedLeft.offsetX, 0);
  assert.ok(882 - blockedLeft.offsetY <= 840 - 10, 'dock sits at least 10px above composer');

  // When only corner blocks left-shift (wide corner bar) while above-corner is clear of composer:
  const cornerUp = avoid({
    viewport,
    dockSize,
    baseRight: 20,
    baseBottom: 18,
    composerRect: { left: 400, right: 1300, top: 730, bottom: 870, width: 900, height: 140 },
    railRect: null,
    cornerObstacles: [{ left: 1450, right: 1691, top: 852, bottom: 884, width: 241, height: 32 }]
  });
  assert.deepEqual(cornerUp, { offsetX: 0, offsetY: 40 });

  // 4. Wide/full composer collision at bottom-right moves dock cleanly above composerRect.
  const aboveComposer = avoid({
    viewport,
    dockSize,
    baseRight: 20,
    baseBottom: 18,
    composerRect: { left: 280, right: 1651, top: 740, bottom: 874, width: 1371, height: 134 },
    railRect: { left: 1659, right: 1695, top: 288, bottom: 420, width: 36, height: 132 },
    cornerObstacles: [cornerBtn]
  });
  assert.equal(aboveComposer.offsetX, 0);
  // baseBox.bottom = 882; composer.top - 10 = 730 -> offsetY = 152
  assert.equal(aboveComposer.offsetY, 152);

  // 5. Composer + tall rail simultaneous avoidance: shifts up above composer AND left of rail.
  const tallRail = { left: 1659, right: 1695, top: 288, bottom: 720, width: 36, height: 432 };
  const clearBoth = avoid({
    viewport,
    dockSize,
    baseRight: 20,
    baseBottom: 18,
    composerRect: { left: 280, right: 1651, top: 730, bottom: 874, width: 1371, height: 144 },
    railRect: tallRail,
    cornerObstacles: [cornerBtn]
  });
  // baseBox.right = 1687; rail.left - 10 = 1649 -> offsetX = 38; baseBox.bottom = 882; composer.top - 10 = 720 -> offsetY = 162
  assert.deepEqual(clearBoth, { offsetX: 38, offsetY: 162 });

  // 6. Narrow 820px viewport clamping: dock stays inside [8..812, 8..892] and clears composer + tall rail.
  const narrow = avoid({
    viewport: { width: 820, height: 900 },
    dockSize,
    baseRight: 20,
    baseBottom: 18,
    composerRect: { left: 280, right: 800, top: 725, bottom: 874, width: 520, height: 149 },
    railRect: { left: 772, right: 808, top: 288, bottom: 720, width: 36, height: 432 },
    cornerObstacles: [{ left: 772, right: 804, top: 852, bottom: 884, width: 32, height: 32 }]
  });
  const narrowBox = {
    left: 820 - 20 - dockSize.width - narrow.offsetX,
    right: 820 - 20 - narrow.offsetX,
    top: 900 - 18 - dockSize.height - narrow.offsetY,
    bottom: 900 - 18 - narrow.offsetY
  };
  assert.ok(narrowBox.left >= 8 && narrowBox.right <= 812 && narrowBox.top >= 8 && narrowBox.bottom <= 892, 'stays within 8px viewport margin');
  assert.ok(narrowBox.bottom <= 725 - 10, 'clears composer top by 10px');
  assert.ok(narrowBox.right <= 772 - 10, 'clears rail left by 10px');

  // 7. Tiny viewport fallback minimizes weighted overlap area (composer & corner 10x, rail 4x) within [0..maxX, 0..maxY].
  const tiny = avoid({
    viewport: { width: 320, height: 220 },
    dockSize: { width: 220, height: 38 },
    baseRight: 10,
    baseBottom: 10,
    composerRect: { left: 20, right: 300, top: 90, bottom: 205, width: 280, height: 115 },
    railRect: { left: 278, right: 314, top: 60, bottom: 160, width: 36, height: 100 },
    cornerObstacles: [{ left: 272, right: 304, top: 172, bottom: 204, width: 32, height: 32 }]
  });
  const tinyBox = {
    left: 320 - 10 - 220 - tiny.offsetX,
    right: 320 - 10 - tiny.offsetX,
    top: 220 - 10 - 38 - tiny.offsetY,
    bottom: 220 - 10 - tiny.offsetY
  };
  assert.ok(tinyBox.left >= 8 && tinyBox.top >= 8 && tinyBox.bottom <= 90, 'tiny fallback picks unobstructed region above composer');
  assert.ok(tinyBox.right <= 278, 'tiny fallback clears rail rather than overlapping composer');

  // 8. Idempotency: repeated evaluations with fixed inputs always yield identical offsets.
  const first = avoid({
    viewport: { width: 1280, height: 900 },
    dockSize,
    baseRight: 20,
    baseBottom: 18,
    composerRect: { left: 320, right: 1150, top: 735, bottom: 874, width: 830, height: 139 },
    railRect: { left: 1232, right: 1268, top: 288, bottom: 710, width: 36, height: 422 },
    cornerObstacles: [{ left: 1232, right: 1264, top: 852, bottom: 884, width: 32, height: 32 }]
  });
  const second = avoid({
    viewport: { width: 1280, height: 900 },
    dockSize,
    baseRight: 20,
    baseBottom: 18,
    composerRect: { left: 320, right: 1150, top: 735, bottom: 874, width: 830, height: 139 },
    railRect: { left: 1232, right: 1268, top: 288, bottom: 710, width: 36, height: 422 },
    cornerObstacles: [{ left: 1232, right: 1264, top: 852, bottom: 884, width: 32, height: 32 }]
  });
  assert.deepEqual(second, first);
});

test('v0.4.0 #27: cornerFloatingObstacles finds small corner buttons/wrappers and excludes main, composer, dialogs, nav, and owned nodes', () => {
  const A = adapters();
  const plain = value => JSON.parse(JSON.stringify(value));
  const { doc, body, el } = makeDoc('chatgpt');
  const main = el('main', {}, { rect: { left: 260, right: 1280, top: 0, bottom: 900, width: 1020, height: 900 } });
  const backdrop = el('div', { 'data-op-composer-backdrop': 'true' }, { rect: { left: 260, right: 1280, top: 720, bottom: 900, width: 1020, height: 180 } });
  const composer = el('div', { 'data-composer-layout': 'single-line' }, { rect: { left: 320, right: 1220, top: 740, bottom: 860, width: 900, height: 120 } });
  const sendBtn = el('button', { type: 'button', 'aria-label': 'Send' }, { rect: { left: 1170, right: 1206, top: 810, bottom: 846, width: 36, height: 36 }, style: { display: 'inline-flex', visibility: 'visible', opacity: '1', position: 'fixed' } });
  const backdropBtn = el('button', { type: 'button', 'aria-label': 'Scroll down' }, { rect: { left: 1180, right: 1212, top: 850, bottom: 882, width: 32, height: 32 }, style: { display: 'inline-flex', visibility: 'visible', opacity: '1', position: 'fixed' } });
  composer.append(sendBtn);
  backdrop.append(composer, backdropBtn);
  main.append(backdrop);

  const nav = el('nav', {}, { rect: { left: 0, right: 260, top: 0, bottom: 900, width: 260, height: 900 } });
  const navFixed = el('a', { href: '#help' }, { rect: { left: 1100, right: 1140, top: 850, bottom: 882, width: 40, height: 32 }, style: { display: 'block', visibility: 'visible', opacity: '1', position: 'fixed' } });
  nav.append(navFixed);

  const dialog = el('div', { role: 'dialog' }, { rect: { left: 950, right: 1260, top: 700, bottom: 880, width: 310, height: 180 } });
  const dialogBtn = el('button', { type: 'button' }, { rect: { left: 1200, right: 1240, top: 840, bottom: 872, width: 40, height: 32 }, style: { display: 'block', visibility: 'visible', opacity: '1', position: 'fixed' } });
  dialog.append(dialogBtn);

  const owned = el('aside', { id: 'op-bottom-dock', 'data-op-owned': '' }, { rect: { left: 1000, right: 1260, top: 844, bottom: 882, width: 260, height: 38 }, style: { display: 'flex', visibility: 'visible', opacity: '1', position: 'fixed' } });
  owned.append(el('button', { type: 'button' }, { rect: { left: 1150, right: 1260, top: 844, bottom: 882, width: 110, height: 38 }, style: { display: 'flex', visibility: 'visible', opacity: '1', position: 'fixed' } }));

  // Valid fixed corner help button + a nested button inside an absolute wrapper (deduped) + an oversized container containing main.
  const helpBtn = el('button', { type: 'button', class: 'host-corner-help' }, { rect: { left: 1232, right: 1264, top: 852, bottom: 884, width: 32, height: 32 }, style: { display: 'inline-flex', visibility: 'visible', opacity: '1', position: 'fixed' } });
  const feedbackWrap = el('div', { class: 'corner-wrap' }, { rect: { left: 1180, right: 1220, top: 852, bottom: 884, width: 40, height: 32 }, style: { display: 'flex', visibility: 'visible', opacity: '1', position: 'absolute' } });
  feedbackWrap.append(
    el('button', { type: 'button' }, { rect: { left: 1182, right: 1200, top: 854, bottom: 882, width: 18, height: 28 }, style: { display: 'inline-flex', visibility: 'visible', opacity: '1', position: 'static' } }),
    el('a', { href: '#info' }, { rect: { left: 1202, right: 1218, top: 854, bottom: 882, width: 16, height: 28 }, style: { display: 'inline-flex', visibility: 'visible', opacity: '1', position: 'static' } })
  );
  // Outside bottom-right zone (top-left) should be ignored.
  const topLeftBtn = el('button', { type: 'button' }, { rect: { left: 20, right: 52, top: 20, bottom: 52, width: 32, height: 32 }, style: { display: 'inline-flex', visibility: 'visible', opacity: '1', position: 'fixed' } });

  body.append(nav, main, dialog, owned, helpBtn, feedbackWrap, topLeftBtn);

  const adapter = A.forHost('chatgpt', doc);
  const found = plain(adapter.cornerFloatingObstacles(composer));
  assert.equal(found.length, 2, 'detects the fixed help button and deduplicated absolute feedback wrapper');
  assert.deepEqual(found[0], { left: 1232, right: 1264, top: 852, bottom: 884, width: 32, height: 32 });
  assert.deepEqual(found[1], { left: 1180, right: 1220, top: 852, bottom: 884, width: 40, height: 32 });
});

test('v0.4.1 compact composer: composerEmptyHeaders identifies empty wrapper headers while keeping attachments, leading, primary, and trailing intact', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('chatgpt');
  const main = el('main');
  const composer = el('div', { 'data-composer-layout': 'single-line' });
  const grid = el('div', { class: 'composerGrid_test' }, { style: { display: 'grid' } });
  const emptyHeader = el('div', { class: 'composer-header' });
  emptyHeader.append(el('div', {}, { textContent: '   ' }));
  const filledHeader = el('div', { class: 'composer-header-extra' });
  filledHeader.append(el('button', { type: 'button' }, { textContent: 'chip' }));
  const leading = el('div', { class: 'composer-leading' }, { style: { gridColumnStart: 'leading', gridRowStart: 'leading' } });
  const addBtn = el('button', { type: 'button', 'aria-label': 'Add files and more' });
  leading.append(addBtn);
  const primary = el('div', { class: 'composer-primary' }, { style: { gridColumnStart: 'primary', gridRowStart: 'primary' } });
  const editor = el('div', { id: 'prompt-textarea', contenteditable: 'true', role: 'textbox' });
  primary.append(editor);
  const trailing = el('div', { class: 'composer-trailing' }, { style: { gridColumnStart: 'trailing', gridRowStart: 'trailing' } });
  const modelBtn = el('button', { type: 'button', 'aria-label': 'Select ChatGPT model' });
  trailing.append(modelBtn);
  grid.append(emptyHeader, filledHeader, leading, primary, trailing);
  composer.append(grid);
  main.append(composer);
  body.append(main);

  const adapter = A.forHost('chatgpt', doc);
  assert.deepEqual([...adapter.composerEmptyHeaders(composer)], [emptyHeader]);
  emptyHeader.textContent = 'attachment.pdf';
  assert.deepEqual([...adapter.composerEmptyHeaders(composer)], []);
  emptyHeader.textContent = '';
  emptyHeader.append(el('button', { type: 'button' }));
  assert.deepEqual([...adapter.composerEmptyHeaders(composer)], []);
});

test('v0.4.1 #30: findComposerBackdrops covers depth<=14, fade-mask, container fade layers, adjacent disclaimer wrappers, and strict protection filter', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('chatgpt');
  const main = el('main', { id: 'main' });
  const parent = el('div', { class: 'composer-parent' }, { rect: { left: 0, right: 1280, top: 52, bottom: 900, width: 1280, height: 848 } });
  const scroller = el('div', { 'data-prism-test-scroller': '' }, { rect: { left: 0, right: 1280, top: 52, bottom: 720, width: 1280, height: 668 } });
  const turn = el('div', { 'data-turn-key': 't1' });
  turn.append(el('div', { 'data-content-search-unit-key': 'c:1:assistant', 'data-markdown-text-style': 'assistant-message' }, { textContent: 'Reply' }));
  scroller.append(turn);

  // Depth 11 ancestor chain from composer up to #thread-bottom-container.
  const dockOuter = el('div', { id: 'thread-bottom-container', class: 'content-fade_b9xk' }, { rect: { left: 0, right: 1280, top: 720, bottom: 900, width: 1280, height: 180 }, style: { display: 'block', visibility: 'visible', opacity: '1', position: 'relative' } });
  const fadeBtnContainer = el('div', { class: 'content-fade-container content-fade' }, { rect: { left: 0, right: 1280, top: 804, bottom: 900, width: 1280, height: 96 } });
  fadeBtnContainer.append(el('button', { type: 'button', class: 'scroll-to-bottom-btn', 'aria-label': 'Scroll to bottom' }));
  const fadeMask = el('div', { class: 'bottom-fade-mask' }, { rect: { left: 0, right: 1280, top: 804, bottom: 900, width: 1280, height: 96 } });
  fadeMask.append(el('span', { class: 'fade-inner' }));
  const textOnlyNonDisclaimer = el('div', { class: 'content-fade' }, { textContent: 'Keep me out', rect: { left: 0, right: 1280, top: 700, bottom: 720, width: 1280, height: 20 } });
  const excludedMenuFade = el('div', { class: 'content-fade', role: 'menu' }, { rect: { left: 100, right: 300, top: 650, bottom: 720, width: 200, height: 70 } });
  const excludedPopper = el('div', { 'data-radix-popper-content-wrapper': '' }, { rect: { left: 100, right: 300, top: 650, bottom: 720, width: 200, height: 70 } });
  const nestedMenuFade = el('div', { class: 'content-fade' }, { rect: { left: 100, right: 300, top: 650, bottom: 720, width: 200, height: 70 } });
  excludedPopper.append(nestedMenuFade);
  const ownedFade = el('div', { class: 'content-fade', 'data-op-owned': '' }, { rect: { left: 0, right: 1280, top: 720, bottom: 760, width: 1280, height: 40 } });

  let chain = dockOuter;
  for (let i = 0; i < 9; i++) {
    const next = el('div', { class: `dock-wrap-${i}` }, { rect: { left: 0, right: 1280, top: 720, bottom: 900, width: 1280, height: 180 } });
    chain.append(next);
    chain = next;
  }
  const composer = el('div', { class: 'ComposerLayoutRoot_m3kp', 'data-composer-layout': 'single-line' }, { rect: { left: 256, right: 1024, top: 724, bottom: 834, width: 768, height: 110 } });
  const innerFadeInsideComposer = el('div', { class: 'content-fade' }, { rect: { left: 256, right: 1024, top: 724, bottom: 750, width: 768, height: 26 } });
  const att = el('div', { class: 'file-tile_p4wt' }, { rect: { left: 260, right: 360, top: 730, bottom: 770, width: 100, height: 40 } });
  const editor = el('div', { id: 'prompt-textarea', contenteditable: 'true', role: 'textbox' });
  composer.append(innerFadeInsideComposer, att, editor);
  chain.append(composer);
  dockOuter.append(fadeBtnContainer, fadeMask, textOnlyNonDisclaimer, excludedMenuFade, excludedPopper, ownedFade);

  // Siblings in outerDock.parentElement (.composer-parent)
  const siblingFadeWrapper = el('div', { class: 'content-fade-outer content-fade' }, { rect: { left: 0, right: 1280, top: 840, bottom: 900, width: 1280, height: 60 } });
  siblingFadeWrapper.append(el('span', { class: 'utility-dot' }));
  const vtDisclaimer = el('div', { class: 'notice-shell', style: 'view-transition-name: disclaimer-shell' }, { textContent: 'Offline layout notice.', rect: { left: 0, right: 1280, top: 864, bottom: 900, width: 1280, height: 36 }, style: { display: 'block', visibility: 'visible', opacity: '1', viewTransitionName: 'disclaimer-shell' } });
  const outerAtt = el('div', { class: 'native-footer-attachment' }, { rect: { left: 260, right: 360, top: 700, bottom: 720, width: 100, height: 20 } });
  const outerDialog = el('div', { role: 'dialog', class: 'content-fade' }, { rect: { left: 400, right: 800, top: 300, bottom: 500, width: 400, height: 200 } });

  parent.append(scroller, dockOuter, siblingFadeWrapper, vtDisclaimer, outerAtt, outerDialog);
  main.append(parent);
  body.append(main);

  const chatgptAdapter = A.forHost('chatgpt', doc);
  const found = chatgptAdapter.composerBackdropSurfaces(composer);
  assert.equal(found.includes(dockOuter), true, 'depth>8 ancestor traversal reaches #thread-bottom-container');
  assert.equal(found.includes(fadeBtnContainer), true, 'collects container .content-fade wrapping scroll-to-bottom button');
  assert.equal(found.includes(fadeMask), true, 'collects [class*="fade-mask"] container layer');
  assert.equal(found.includes(siblingFadeWrapper), true, 'collects container .content-fade sibling in outerDock.parentElement');
  assert.equal(found.includes(vtDisclaimer), true, 'collects view-transition-name disclaimer shell sibling in outerDock.parentElement');
  assert.equal(found.includes(textOnlyNonDisclaimer), false, 'still excludes text-only non-disclaimer .content-fade with children.length === 0');
  assert.equal(found.includes(composer), false, 'never collects composer');
  assert.equal(found.includes(innerFadeInsideComposer), false, 'never collects descendants of composer');
  assert.equal(found.includes(att), false, 'never collects attachments inside composer');
  assert.equal(found.includes(outerAtt), false, 'never collects spec.attachments sibling');
  assert.equal(found.includes(excludedMenuFade), false, 'never collects OVERLAY_EXCLUDED [role="menu"]');
  assert.equal(found.includes(nestedMenuFade), false, 'never collects nodes inside OVERLAY_EXCLUDED popper');
  assert.equal(found.includes(outerDialog), false, 'never collects OVERLAY_EXCLUDED [role="dialog"]');
  assert.equal(found.includes(ownedFade), false, 'never collects extension-owned nodes');

  // Gemini composerCard protection: input-area-v2 wraps .text-input-field and must never be returned as backdrop.
  {
    const g = makeDoc('gemini');
    const gMain = g.el('chat-window');
    const inputContainer = g.el('input-container', { class: 'input-gradient' }, { rect: { left: 0, right: 1280, top: 760, bottom: 900, width: 1280, height: 140 }, style: { display: 'block', visibility: 'visible', opacity: '1', position: 'absolute' } });
    const areaContainer = g.el('div', { class: 'input-area-container' }, { rect: { left: 310, right: 970, top: 780, bottom: 880, width: 660, height: 100 } });
    const inputAreaCard = g.el('input-area-v2', {}, { rect: { left: 310, right: 970, top: 780, bottom: 880, width: 660, height: 100 } });
    const textInputField = g.el('div', { class: 'text-input-field' }, { rect: { left: 322, right: 958, top: 788, bottom: 872, width: 636, height: 84 } });
    textInputField.append(g.el('div', { class: 'ql-editor', contenteditable: 'true', role: 'textbox' }), g.el('button', { type: 'button' }));
    inputAreaCard.append(textInputField);
    areaContainer.append(inputAreaCard);
    inputContainer.append(areaContainer);
    gMain.append(inputContainer);
    g.body.append(gMain);

    const gemAdapter = A.forHost('gemini', g.doc);
    const gemBackdrops = gemAdapter.composerBackdropSurfaces(textInputField);
    assert.equal(gemBackdrops.includes(inputAreaCard), false, 'never returns composerCard (input-area-v2) as backdrop');
    assert.equal(gemBackdrops.includes(textInputField), false, 'never returns composer (.text-input-field) as backdrop');
    assert.equal(gemBackdrops.includes(inputContainer), true, 'still collects outer input-container');
    assert.equal(gemAdapter.composerScrimSurface(textInputField), inputContainer, 'composerScrimSurface still resolves outer input-container');
  }
});

test('v0.4.1 #30: isIndependentMessageScroller distinguishes independent sibling scrollers from sticky/root/owned scrollers', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('chatgpt');
  const parent = el('div', { class: 'composer-parent' });
  const scroller = el('div', { 'data-prism-test-scroller': '' });
  const dock = el('div', { id: 'thread-bottom-container' });
  const composer = el('div', { 'data-composer-layout': 'single-line' });
  dock.append(composer);
  parent.append(scroller, dock);
  body.append(parent);

  assert.equal(A.isIndependentMessageScroller(null, composer, dock), false);
  assert.equal(A.isIndependentMessageScroller(scroller, null, dock), false);
  assert.equal(A.isIndependentMessageScroller(scroller, composer, dock), true, 'independent sibling scroller returns true');
  assert.equal(A.isIndependentMessageScroller(scroller, composer, null), true, 'independent scroller without dock arg returns true');
  assert.equal(A.isIndependentMessageScroller(doc.body, composer, dock), false, 'body cannot be independent scroller');
  assert.equal(A.isIndependentMessageScroller(doc.documentElement, composer, dock), false, 'documentElement cannot be independent scroller');

  const ownedScroller = el('div', { 'data-op-owned': '' });
  assert.equal(A.isIndependentMessageScroller(ownedScroller, composer, dock), false, 'owned node cannot be scroller');

  // Sticky-in-scroller: dock & composer sit inside scroller.
  scroller.append(dock);
  assert.equal(A.isIndependentMessageScroller(scroller, composer, dock), false, 'sticky-in-scroller returns false');
  assert.equal(A.isIndependentMessageScroller(scroller, composer, null), false, 'scroller containing composer returns false even without dock');

  // Dock containing scroller or equal to scroller returns false.
  const outerDock = el('div', { id: 'outer-dock' });
  const innerScroller = el('div');
  const comp2 = el('div');
  outerDock.append(innerScroller);
  assert.equal(A.isIndependentMessageScroller(outerDock, comp2, outerDock), false);
  assert.equal(A.isIndependentMessageScroller(innerScroller, comp2, outerDock), false);

  // Composer containing scroller returns false.
  const compWrap = el('div');
  const innerEdScroller = el('div');
  compWrap.append(innerEdScroller);
  assert.equal(A.isIndependentMessageScroller(innerEdScroller, compWrap, null), false);
});

test('v0.4.1 #31: composerBelowSiblings detects external trailing empty spacers, negative-margin & view-transition shells up to 2 levels above dock without oscillation', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('chatgpt');
  const main = el('main', { id: 'main' });
  const parent = el('div', { class: 'composer-parent' });
  const scroller = el('div', { 'data-prism-test-scroller': '' });
  const turn = el('div', { 'data-message-author-role': 'assistant' }, { textContent: 'Assistant turn' });
  scroller.append(turn);

  const dockOuter = el('div', { class: 'dock-outer' });
  const dockInner = el('div', { class: 'dock-inner' });
  const dock = el('div', { id: 'thread-bottom-container' });
  const form = el('form', { 'data-chatgpt-composer': '' });
  const composer = el('div', { 'data-composer-layout': 'single-line' });
  form.append(composer);
  dock.append(form);

  const innerTrailingEmpty = el('div', { class: 'inner-trailing-empty' });
  const midTrailingEmpty = el('div', { class: 'mid-trailing-empty' });
  dockInner.append(dock, innerTrailingEmpty);
  dockOuter.append(dockInner, midTrailingEmpty);

  const outerEmpty = el('div', { class: 'dock-outer-spacer' }, { rect: { left: 0, right: 1280, top: 830, bottom: 858, width: 1280, height: 28 } });
  const preMarkedEmpty = el('div', { class: 'pre-marked-empty', 'data-op-composer-empty-sibling': 'true' }, { rect: { left: 0, right: 1280, top: 858, bottom: 858, width: 1280, height: 0 } });
  const negMarginWrap = el('div', { style: 'margin-top: -8px' }, { textContent: 'Synthetic negative margin footer.', rect: { left: 260, right: 1020, top: 850, bottom: 886, width: 760, height: 36 }, style: { display: 'block', visibility: 'visible', opacity: '1', contentVisibility: 'visible', position: 'relative', marginTop: '-8px' } });
  const vtAttrShell = el('div', { style: 'view-transition-name: footer-shell' }, { textContent: 'View transition attr notice.', rect: { left: 260, right: 1020, top: 858, bottom: 900, width: 760, height: 42 } });
  const vtComputedInner = el('span', {}, { textContent: 'View transition computed notice.' });
  const vtComputedShell = el('div', { class: 'vt-computed-outer' }, { textContent: 'View transition computed notice.', rect: { left: 260, right: 1020, top: 858, bottom: 900, width: 760, height: 42 }, style: { display: 'block', visibility: 'visible', opacity: '1', contentVisibility: 'visible', position: 'relative', viewTransitionName: 'disclaimer-shell' } });
  vtComputedShell.append(vtComputedInner);

  const wrappedMarkedOuter = el('div', { class: 'wrapped-marked-outer' }, { textContent: 'Already marked inner generic notice.', rect: { left: 260, right: 1020, top: 858, bottom: 894, width: 760, height: 36 } });
  const wrappedMarkedInner = el('div', { 'data-op-composer-disclaimer': 'true' }, { textContent: 'Already marked inner generic notice.', rect: { left: 260, right: 1020, top: 858, bottom: 858, width: 760, height: 0 } });
  wrappedMarkedOuter.append(wrappedMarkedInner);

  const explicitOuterDisclaimer = el('div', { class: 'disclaimer_outer' }, { textContent: 'External explicit disclaimer.', rect: { left: 260, right: 1020, top: 858, bottom: 894, width: 760, height: 36 } });
  const textOuterDisclaimer = el('div', { class: 'outer-ai-note' }, { textContent: 'ChatGPT can make mistakes. Check important info.', rect: { left: 260, right: 1020, top: 858, bottom: 894, width: 760, height: 36 } });
  const genericOuter = el('div', { class: 'outer-plain-note' }, { textContent: 'Plain trailing external note.', rect: { left: 260, right: 1020, top: 860, bottom: 896, width: 760, height: 36 } });

  // Strictly excluded siblings after dock:
  const dialogAfter = el('div', { role: 'dialog', style: 'view-transition-name: dlg-shell; margin-top: -8px' }, { textContent: 'Dialog must stay visible', rect: { left: 400, right: 800, top: 300, bottom: 380, width: 400, height: 80 } });
  const menuAfter = el('div', { role: 'menu' }, { textContent: 'Menu must stay visible', rect: { left: 400, right: 600, top: 300, bottom: 380, width: 200, height: 80 } });
  const threeButtonsAfter = el('div', {}, { textContent: 'Choose action', rect: { left: 260, right: 1020, top: 850, bottom: 890, width: 760, height: 40 } });
  threeButtonsAfter.append(el('button', {}, { textContent: 'A' }), el('button', {}, { textContent: 'B' }), el('button', {}, { textContent: 'C' }));
  const svgAfter = el('div', {}, { textContent: 'Icon bar', rect: { left: 260, right: 1020, top: 850, bottom: 890, width: 760, height: 40 } });
  svgAfter.append(el('svg', {}));
  const formAfter = el('div', {}, { textContent: 'Input bar', rect: { left: 260, right: 1020, top: 850, bottom: 890, width: 760, height: 40 } });
  formAfter.append(el('input', { type: 'text' }));
  const msgAfter = el('div', {}, { textContent: 'ChatGPT is AI and can make mistakes.', rect: { left: 260, right: 1020, top: 850, bottom: 890, width: 760, height: 40 } });
  msgAfter.append(el('div', { 'data-message-author-role': 'assistant' }, { textContent: 'ChatGPT is AI and can make mistakes.' }));
  const detailsAfter = el('details', { id: 'closed-thought-fixture' }, { textContent: 'Collapsed thoughts', rect: { left: 260, right: 1020, top: 860, bottom: 882, width: 760, height: 22 } });
  const detailsSummary = el('summary', {}, { textContent: 'Collapsed thoughts' });
  const detailsBody = el('div', { 'data-testid': 'thoughts-content' }, { textContent: 'Only translate after opening.' });
  detailsAfter.append(detailsSummary, detailsBody);
  const ownedAfter = el('div', { 'data-op-owned': '' });

  parent.append(
    scroller,
    dockOuter,
    outerEmpty,
    preMarkedEmpty,
    negMarginWrap,
    vtAttrShell,
    vtComputedShell,
    wrappedMarkedOuter,
    explicitOuterDisclaimer,
    textOuterDisclaimer,
    genericOuter,
    dialogAfter,
    menuAfter,
    threeButtonsAfter,
    svgAfter,
    formAfter,
    msgAfter,
    detailsAfter,
    ownedAfter
  );
  main.append(parent);
  const afterMainEmpty = el('div', { class: 'after-main-empty' });
  body.append(main, afterMainEmpty);

  const adapter = A.forHost('chatgpt', doc);
  const res = adapter.composerBelowSiblings(composer, dock);
  assert.deepEqual([...res.empty], [innerTrailingEmpty, midTrailingEmpty, outerEmpty, preMarkedEmpty]);
  assert.deepEqual([...res.disclaimers], [negMarginWrap, vtAttrShell, vtComputedShell, wrappedMarkedOuter, explicitOuterDisclaimer, textOuterDisclaimer]);
  assert.equal(res.disclaimers.includes(genericOuter), false, 'plain non-disclaimer external widget outside dock must stay visible');
  assert.equal(res.empty.includes(genericOuter), false);
  assert.equal(res.empty.includes(afterMainEmpty), false, 'stops before main and never touches siblings outside main');

  // Simulate CSS collapsing empty spacers and hiding disclaimers (display: none, 0px height).
  for (const node of res.empty) {
    node.setAttribute('data-op-composer-empty-sibling', 'true');
    node.rect = { left: 0, right: 1280, top: 900, bottom: 900, width: 1280, height: 0 };
  }
  for (const node of res.disclaimers) {
    node.setAttribute('data-op-composer-disclaimer', 'true');
    node.rect = { left: 260, right: 1020, top: 900, bottom: 900, width: 760, height: 0 };
  }
  const origGetStyle = doc.defaultView.getComputedStyle;
  doc.defaultView.getComputedStyle = n => {
    const base = origGetStyle(n);
    if (res.disclaimers.includes(n) || n === wrappedMarkedInner) {
      return { ...base, display: 'none', visibility: 'visible', opacity: '1', contentVisibility: 'visible' };
    }
    return base;
  };

  // Repeated rescans must keep all empty spacers and disclaimers identically without bounce-back.
  for (let i = 0; i < 3; i++) {
    const rescan = adapter.composerBelowSiblings(composer, dock);
    assert.deepEqual([...rescan.empty], [...res.empty], `rescan #${i + 1} keeps external empty spacers`);
    assert.deepEqual([...rescan.disclaimers], [...res.disclaimers], `rescan #${i + 1} keeps external disclaimers`);
  }

  // If a previously empty spacer receives text/interactive content, it drops out cleanly.
  outerEmpty.textContent = 'Dynamic attachment bar';
  const afterContent = adapter.composerBelowSiblings(composer, dock);
  assert.equal(afterContent.empty.includes(outerEmpty), false, 'non-empty spacer is no longer marked empty');
});

test('v0.4.1 #31: composerBelowSiblings scans dock.parentElement when dock sits directly inside chat-window/main without escaping it', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('gemini');
  const chatWindow = el('chat-window');
  const scroller = el('infinite-scroller');
  const dock = el('input-container', { class: 'input-gradient' });
  const composer = el('div', { class: 'text-input-field' });
  dock.append(composer);
  const trailingEmpty = el('div', { class: 'gemini-outer-spacer' });
  const vtNotice = el('div', { style: 'view-transition-name: gemini-footer-shell' }, { textContent: 'Gemini custom footer notice.', rect: { left: 260, right: 1020, top: 860, bottom: 896, width: 760, height: 36 } });
  const outsideChatWindow = el('div', { class: 'outside-chat-window' });
  chatWindow.append(scroller, dock, trailingEmpty, vtNotice);
  body.append(chatWindow, outsideChatWindow);

  const adapter = A.forHost('gemini', doc);
  const res = adapter.composerBelowSiblings(composer, dock);
  assert.deepEqual([...res.empty], [trailingEmpty]);
  assert.deepEqual([...res.disclaimers], [vtNotice]);
  assert.equal(res.empty.includes(outsideChatWindow), false);
});

test('v0.4.1 #28: composerBelowSiblings collapses hidden-content shells (hidden attrs, display:none, visibility:hidden) while respecting exclusions', () => {
  const A = adapters();
  const { doc, body, el } = makeDoc('chatgpt');
  const main = el('main', { id: 'main' });
  const parent = el('div', { class: 'composer-parent' });
  const dock = el('div', { id: 'thread-bottom-container' });
  const form = el('form', { 'data-chatgpt-composer': '' });
  const composer = el('div', { 'data-composer-layout': 'single-line' });
  const hiddenInsideDock = el('div', { class: 'inner-hidden-shell' }, { rect: { left: 260, right: 1020, top: 858, bottom: 882, width: 760, height: 24 } });
  hiddenInsideDock.append(
    el('svg', { 'aria-hidden': 'true' }),
    el('a', { href: '#hidden-inner' }, { textContent: 'Hidden inner', style: { display: 'none', visibility: 'visible', opacity: '1', contentVisibility: 'visible' } })
  );
  hiddenInsideDock.childNodes = hiddenInsideDock.children;
  form.append(composer);
  dock.append(form, hiddenInsideDock);

  const hiddenAttrShell = el('div', { class: 'hidden-attr-shell' }, { textContent: 'Hidden attr text Hidden link', rect: { left: 0, right: 1280, top: 858, bottom: 886, width: 1280, height: 28 } });
  hiddenAttrShell.append(
    el('span', { hidden: '' }, { textContent: 'Hidden attr text' }),
    el('a', { href: '#terms', hidden: '' }, { textContent: 'Hidden link' }),
    el('svg', { 'aria-hidden': 'true' })
  );
  hiddenAttrShell.childNodes = hiddenAttrShell.children;

  const cssHiddenShell = el('div', { class: 'css-hidden-shell' }, { textContent: 'CSS hidden text CSS hidden link', rect: { left: 0, right: 1280, top: 858, bottom: 886, width: 1280, height: 28 } });
  const hideStyle = { display: 'none', visibility: 'visible', opacity: '1', contentVisibility: 'visible' };
  cssHiddenShell.append(
    el('span', {}, { textContent: 'CSS hidden text', style: hideStyle }),
    el('a', { href: '#css-hidden' }, { textContent: 'CSS hidden link', style: hideStyle }),
    el('button', {}, { textContent: 'Hidden btn', style: hideStyle }),
    el('svg', {}, { style: hideStyle })
  );
  cssHiddenShell.childNodes = cssHiddenShell.children;

  const visHiddenShell = el('div', { class: 'vis-hidden-shell' }, { textContent: 'Invisible height shell', rect: { left: 0, right: 1280, top: 858, bottom: 886, width: 1280, height: 28 }, style: { display: 'block', visibility: 'hidden', opacity: '1', contentVisibility: 'visible', position: 'static' } });

  // Shells that must NEVER collapse into empty:
  const visibleLinkShell = el('div', { class: 'visible-link-shell' }, { rect: { left: 0, right: 1280, top: 858, bottom: 886, width: 1280, height: 28 } });
  visibleLinkShell.append(el('a', { href: '#live' }, { textContent: '' }));
  const hiddenInputShell = el('div', { class: 'hidden-input-shell' }, { rect: { left: 0, right: 1280, top: 858, bottom: 886, width: 1280, height: 28 } });
  hiddenInputShell.append(el('input', { type: 'file', hidden: '' }));
  const hiddenDetailsShell = el('div', { class: 'hidden-details-shell' }, { rect: { left: 0, right: 1280, top: 858, bottom: 886, width: 1280, height: 28 } });
  const closedDetails = el('details', {});
  closedDetails.append(el('summary', { hidden: '' }, { textContent: 'Hidden summary' }));
  hiddenDetailsShell.append(closedDetails);
  const hiddenMsgShell = el('div', { class: 'hidden-msg-shell' }, { rect: { left: 0, right: 1280, top: 858, bottom: 886, width: 1280, height: 28 } });
  hiddenMsgShell.append(el('div', { 'data-message-author-role': 'assistant', hidden: '' }));
  const hiddenThoughtShell = el('div', { class: 'hidden-thought-shell' }, { rect: { left: 0, right: 1280, top: 858, bottom: 886, width: 1280, height: 28 } });
  hiddenThoughtShell.append(el('div', { 'data-testid': 'thoughts-content', hidden: '' }));
  const hiddenDialogShell = el('div', { class: 'hidden-dialog-shell' }, { rect: { left: 0, right: 1280, top: 858, bottom: 886, width: 1280, height: 28 } });
  hiddenDialogShell.append(el('div', { role: 'dialog', hidden: '' }));

  parent.append(
    dock,
    hiddenAttrShell,
    cssHiddenShell,
    visHiddenShell,
    visibleLinkShell,
    hiddenInputShell,
    hiddenDetailsShell,
    hiddenMsgShell,
    hiddenThoughtShell,
    hiddenDialogShell
  );
  main.append(parent);
  body.append(main);

  const adapter = A.forHost('chatgpt', doc);
  const res = adapter.composerBelowSiblings(composer, dock);
  assert.deepEqual([...res.empty], [hiddenInsideDock, hiddenAttrShell, cssHiddenShell, visHiddenShell]);
  assert.deepEqual([...res.disclaimers], []);
});

test('v0.4.1 review: adapters expose per-host scrim and scroller Alpha fade capability flags', () => {
  const A = adapters();
  const chatgpt = A.forHost('chatgpt', {});
  const gemini = A.forHost('gemini', {});
  assert.equal(chatgpt.usesOverlayScrim, false);
  assert.equal(chatgpt.usesScrollerAlphaFade, true);
  assert.equal(gemini.usesOverlayScrim, true);
  assert.equal(gemini.usesScrollerAlphaFade, false);
});

test('v0.4.1 review: adapters own ChatGPT .code-shell and Gemini well/header/surface resolution without sibling leakage', () => {
  const A = adapters();

  // ChatGPT: .code-shell + .code-shell-header + bare <pre>
  const cg = makeDoc('chatgpt');
  const cgMain = cg.el('main', { id: 'main' });
  const cgTurn = cg.el('article', { 'data-turn': 'assistant' });
  const cgMd = cg.el('div', { class: 'markdown' });
  const shell = cg.el('div', { class: 'code-shell' });
  const shellHeader = cg.el('div', { class: 'code-shell-header' }, { textContent: 'Python' });
  const shellPre = cg.el('pre');
  shellPre.append(cg.el('code', {}, { textContent: 'print(1)' }));
  shell.append(shellHeader, shellPre);
  const barePre = cg.el('pre');
  barePre.append(cg.el('code', {}, { textContent: '\\alpha + \\beta' }));
  cgMd.append(shell, barePre);
  cgTurn.append(cgMd);
  cgMain.append(cgTurn);
  cg.body.append(cgMain);

  const cgAdapter = A.forHost('chatgpt', cg.doc);
  assert.deepEqual([...cgAdapter.codeSurfaces()], [shell, barePre]);
  assert.deepEqual([...cgAdapter.codeHeaders()], [shellHeader]);
  assert.equal(cgAdapter.codeSurfaceFor(shellPre), shell);
  assert.equal(cgAdapter.codeHeaderFor(shell, shellPre), shellHeader);
  assert.equal(cgAdapter.codeWellFor(shellPre, shell), shellPre);
  assert.equal(cgAdapter.codeSurfaceFor(barePre), barePre);
  assert.equal(cgAdapter.codeHeaderFor(barePre, barePre), null);
  assert.equal(cgAdapter.codeWellFor(barePre, barePre), barePre);
  assert.equal(A.cleanTurnText(cgTurn, { excludeCode: true }), '');

  // Gemini: double-nested <code-block> + .formatted-code-block-internal-container + bare <pre>
  const gm = makeDoc('gemini');
  const gmMain = gm.el('main', { id: 'main' });
  const gmTurn = gm.el('model-response');
  const gmMd = gm.el('div', { class: 'markdown' });
  const outer = gm.el('code-block');
  const inner = gm.el('div', { class: 'code-block' });
  const dec = gm.el('div', { class: 'code-block-decoration' }, { textContent: '代码段' });
  const well = gm.el('div', { class: 'formatted-code-block-internal-container' });
  const gmPre = gm.el('pre');
  gmPre.append(gm.el('code', {}, { textContent: 'E = mc^2' }));
  well.append(gmPre);
  inner.append(dec, well);
  outer.append(inner);
  const gmBarePre = gm.el('pre');
  gmBarePre.append(gm.el('code', {}, { textContent: '\\frac{1}{2}' }));
  gmMd.append(outer, gmBarePre);
  gmTurn.append(gmMd);
  gmMain.append(gmTurn);
  gm.body.append(gmMain);

  const gmAdapter = A.forHost('gemini', gm.doc);
  assert.equal(gmAdapter.codeSurfaceFor(gmPre), inner);
  assert.equal(gmAdapter.codeHeaderFor(inner, gmPre), dec);
  assert.equal(gmAdapter.codeWellFor(gmPre, inner), well);
  assert.equal(gmAdapter.codeSurfaceFor(gmBarePre), gmBarePre);
  assert.equal(gmAdapter.codeHeaderFor(gmBarePre, gmBarePre), null);
  assert.equal(gmAdapter.codeWellFor(gmBarePre, gmBarePre), gmBarePre);
});
