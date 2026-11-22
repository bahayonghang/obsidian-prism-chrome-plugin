'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers.cjs');

function createRuntimeDom(initialConfig = {}, options = {}) {
  const host = options.host || 'chatgpt';
  const h = harness({
    background: Boolean(options.background),
    storage: { obsidianPrismWebConfig_v1: { enabled: true, themeMode: 'dark', palette: 'obsidian', composerRestyle: true, ...initialConfig } }
  });
  if (host === 'gemini') h.context.location.hostname = 'gemini.google.com';
  const elements = new Map();
  function makeEl(tag, attrs = {}) {
    const map = new Map(Object.entries(attrs).map(([k, v]) => [k, String(v)]));
    const listeners = new Map();
    const el = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      isConnected: true,
      parentElement: null,
      children: [],
      dataset: {},
      className: attrs.class || '',
      type: attrs.type || '',
      id: attrs.id || '',
      value: '',
      hidden: false,
      style: {
        values: new Map(),
        getPropertyValue(k) { return this.values.get(k)?.[0] || ''; },
        getPropertyPriority(k) { return this.values.get(k)?.[1] || ''; },
        setProperty(k, v, p = '') { this.values.set(k, [String(v), p]); },
        removeProperty(k) { this.values.delete(k); }
      },
      attributesList: map,
      get attributes() { return [...map].map(([name, value]) => ({ name, value })); },
      getAttribute(k) { return map.get(k) ?? null; },
      setAttribute(k, v) { map.set(k, String(v)); },
      removeAttribute(k) { map.delete(k); },
      hasAttribute(k) { return map.has(k); },
      classList: {
        toggle() {},
        add() {},
        remove() {},
        contains(name) { return String(el.className || '').split(/\s+/).includes(name); }
      },
      append(...nodes) {
        for (const n of nodes) {
          if (n && typeof n === 'object') {
            if (n.tagName === 'FRAGMENT') {
              this.append(...n.children);
            } else {
              n.parentElement = this;
              this.children.push(n);
            }
          }
        }
      },
      prepend(...nodes) {
        const added = [];
        for (const n of nodes) {
          if (n && typeof n === 'object') {
            if (n.tagName === 'FRAGMENT') added.push(...n.children);
            else added.push(n);
          }
        }
        for (const n of added) n.parentElement = this;
        this.children.unshift(...added);
      },
      replaceChildren(...nodes) { this.children = []; this.append(...nodes); },
      remove() {
        this.isConnected = false;
        if (this.parentElement && Array.isArray(this.parentElement.children)) {
          const idx = this.parentElement.children.indexOf(this);
          if (idx >= 0) this.parentElement.children.splice(idx, 1);
          this.parentElement = null;
        }
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      removeEventListener(type, fn) {
        const list = listeners.get(type);
        if (!list) return;
        const idx = list.indexOf(fn);
        if (idx >= 0) list.splice(idx, 1);
      },
      dispatchEvent(event) {
        for (const fn of [...(listeners.get(event.type) || [])]) fn(event);
      },
      contains(target) {
        if (target === this) return true;
        return this.children.some(c => c && typeof c.contains === 'function' && c.contains(target));
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = cur => {
          for (const c of cur.children || []) {
            if (sel.startsWith('.') && String(c.className || '').split(/\s+/).includes(sel.slice(1))) out.push(c);
            else if (sel.startsWith('#') && c.id === sel.slice(1)) out.push(c);
            else if (sel === '[data-turn]' && c.dataset && c.dataset.turn !== undefined) out.push(c);
            else if (sel === c.tagName.toLowerCase()) out.push(c);
            walk(c);
          }
        };
        walk(this);
        return out;
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      closest() { return null; },
      matches() { return false; },
      getBoundingClientRect() { return { left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 }; }
    };
    return el;
  }

  const docEl = makeEl('html');
  const body = makeEl('body');
  const primary = makeEl('main');
  const threadCol = makeEl('div');
  const composerCol = makeEl('div');
  const composer = makeEl('div', { 'data-op-composer-surface': 'host-orig' });
  const scrim = makeEl('div');
  const addBtn = makeEl('button');
  const modelBtn = makeEl('button');
  const chip = makeEl('button');
  const codeSurface = makeEl('div');
  const codeHeader = makeEl('div');
  const spacer = makeEl('div');
  const userTurn = makeEl('article', { 'data-turn': 'user' });
  userTurn.textContent = 'Sample user question';
  const assistantTurn = makeEl('article', { 'data-turn': 'assistant' });
  assistantTurn.textContent = 'Sample assistant answer';

  for (const [k, v] of Object.entries({ docEl, body, primary, threadCol, composerCol, composer, scrim, addBtn, modelBtn, chip, codeSurface, codeHeader, spacer, userTurn, assistantTurn })) {
    elements.set(k, v);
  }

  let currentModel = options.modelLabel ?? (host === 'gemini' ? 'Gemini 2.5 Pro' : 'ChatGPT 5.2');
  let currentAttachments = options.attachments ?? [];

  const fakeAdapter = {
    host,
    userTurns: () => [userTurn],
    assistantTurns: () => [assistantTurn],
    primarySurface: () => primary,
    composerSurface: () => composer,
    composerBackdropSurfaces: () => [scrim],
    composerScrimSurface: () => scrim,
    composerAddTrigger: () => addBtn,
    modelSelectorTrigger: () => modelBtn,
    composerChips: () => [chip],
    codeSurfaces: () => [codeSurface],
    codeHeaders: () => [codeHeader],
    threadTailSpacers: () => [spacer],
    threadColumns: () => [threadCol],
    composerColumns: () => [composerCol],
    visibleAttachments: () => currentAttachments,
    activeModelLabel: () => currentModel,
    sidebarSurfaces: () => [],
    sidebarActiveRows: () => [],
    codeBlocks: () => [],
    thoughtBlocks: () => [],
    isAssistantNode: () => false,
    isStreaming: () => false,
    scrollContainer: () => body
  };

  h.context.document = {
    documentElement: docEl,
    body,
    hidden: false,
    createElement: tag => makeEl(tag),
    createDocumentFragment: () => {
      const frag = makeEl('fragment');
      Object.defineProperty(frag, 'childNodes', { get() { return frag.children; } });
      return frag;
    },
    addEventListener() {},
    removeEventListener() {}
  };
  h.context.window = h.context;
  h.context.addEventListener = () => {};
  h.context.removeEventListener = () => {};
  h.context.innerWidth = 1280;
  h.context.innerHeight = 900;
  h.context.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  h.context.ResizeObserver = class { observe() {} disconnect() {} };
  h.context.MutationObserver = class { observe() {} disconnect() {} };
  h.context.requestAnimationFrame = () => 1;
  h.context.cancelAnimationFrame = () => {};
  let nowMs = 100;
  h.context.performance = { now: () => nowMs };
  h.load('src/adapters.js');
  const realAdapters = h.context.ObsidianPrismAdapters;
  h.context.ObsidianPrismAdapters = {
    ...realAdapters,
    forHost: () => fakeAdapter,
    isOwned: n => Boolean(n && n.getAttribute && n.getAttribute('data-op-owned') !== null),
    textOf: n => (n && n.textContent) || 'Sample turn text',
    visibleText: n => (n && n.textContent) || 'Sample turn text',
    cleanTurnText: options.cleanTurnText || ((n, opts) => realAdapters.cleanTurnText(n, opts)),
    estimateTurnTokens: options.estimateTurnTokens || (n => realAdapters.estimateTurnTokens(n))
  };
  h.load('src/content.js');
  return {
    h, elements, body,
    runtime: h.context.ObsidianPrismRuntime,
    setModel(label) { currentModel = label; },
    setAttachments(list) { currentAttachments = list; },
    advanceTime(ms) { nowMs += ms; }
  };
}

test('runtime marks all v0.3.0 surfaces reversibly, respects host palette and composer toggle, and leaves zero residue on stop', async () => {
  const { h, elements, runtime } = createRuntimeDom();
  await new Promise(resolve => setTimeout(resolve, 20));
  const e = Object.fromEntries(elements);

  assert.equal(e.docEl.getAttribute('data-op-home'), 'false');
  assert.equal(e.codeSurface.getAttribute('data-op-code-surface'), 'true');
  assert.equal(e.codeHeader.getAttribute('data-op-code-header'), 'true');
  assert.equal(e.scrim.getAttribute('data-op-composer-scrim'), 'true');
  assert.equal(e.addBtn.getAttribute('data-op-composer-add'), 'true');
  assert.equal(e.modelBtn.getAttribute('data-op-model-capsule'), 'true');
  assert.equal(e.chip.getAttribute('data-op-composer-chip'), 'true');
  assert.equal(e.spacer.getAttribute('data-op-thread-spacer'), 'true');
  assert.equal(e.threadCol.getAttribute('data-op-thread-column'), 'true');
  assert.equal(e.composerCol.getAttribute('data-op-composer-column'), 'true');
  assert.equal(e.composer.getAttribute('data-op-composer-surface'), 'true');

  // Switch to Native Palette ('host'): visual marks clear while column marks remain, original composer attr restores.
  await h.schema.callApi(h.api.storage.local, 'set', { [h.schema.STORAGE_KEY]: { ...h.schema.DEFAULT_CONFIG, enabled: true, palette: 'host', themeMode: 'dark' } });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(e.codeSurface.getAttribute('data-op-code-surface'), null);
  assert.equal(e.codeHeader.getAttribute('data-op-code-header'), null);
  assert.equal(e.scrim.getAttribute('data-op-composer-scrim'), null);
  assert.equal(e.addBtn.getAttribute('data-op-composer-add'), null);
  assert.equal(e.modelBtn.getAttribute('data-op-model-capsule'), null);
  assert.equal(e.chip.getAttribute('data-op-composer-chip'), null);
  assert.equal(e.spacer.getAttribute('data-op-thread-spacer'), null);
  assert.equal(e.composer.getAttribute('data-op-composer-surface'), 'host-orig');

  // Restore prism palette and disable composerRestyle: composer/add/model/chip clear, code/scrim remain.
  await h.schema.callApi(h.api.storage.local, 'set', { [h.schema.STORAGE_KEY]: { ...h.schema.DEFAULT_CONFIG, enabled: true, palette: 'obsidian', themeMode: 'dark', composerRestyle: false } });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(e.codeSurface.getAttribute('data-op-code-surface'), 'true');
  assert.equal(e.scrim.getAttribute('data-op-composer-scrim'), 'true');
  assert.equal(e.addBtn.getAttribute('data-op-composer-add'), null);
  assert.equal(e.modelBtn.getAttribute('data-op-model-capsule'), null);
  assert.equal(e.chip.getAttribute('data-op-composer-chip'), null);
  assert.equal(e.composer.getAttribute('data-op-composer-surface'), 'host-orig');

  // Disable site toggle cleanly: all marks clear without residue.
  await h.schema.callApi(h.api.storage.local, 'set', { [h.schema.STORAGE_KEY]: { ...h.schema.DEFAULT_CONFIG, enabled: true, enableChatGPT: false } });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(e.docEl.getAttribute('data-op-home'), null);
  assert.equal(e.codeSurface.getAttribute('data-op-code-surface'), null);
  assert.equal(e.composer.getAttribute('data-op-composer-surface'), 'host-orig');

  // Re-enable then stop runtime: every mark and root flag restores cleanly.
  await h.schema.callApi(h.api.storage.local, 'set', { [h.schema.STORAGE_KEY]: { ...h.schema.DEFAULT_CONFIG, enabled: true, palette: 'obsidian', themeMode: 'dark', enableChatGPT: true } });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(e.codeSurface.getAttribute('data-op-code-surface'), 'true');
  runtime.stop();
  assert.equal(e.docEl.getAttribute('data-op-home'), null);
  assert.equal(e.codeSurface.getAttribute('data-op-code-surface'), null);
  assert.equal(e.scrim.getAttribute('data-op-composer-scrim'), null);
  assert.equal(e.threadCol.getAttribute('data-op-thread-column'), null);
  assert.equal(e.composerCol.getAttribute('data-op-composer-column'), null);
  assert.equal(e.composer.getAttribute('data-op-composer-surface'), 'host-orig');
});

test('bottom dock decouples .op-width-toggle from contextVial and cycles contentWidth presets on trusted clicks', async () => {
  const { h, elements, runtime } = createRuntimeDom({ contextVial: false }, { background: true });
  // Route content script runtime messages as trusted top-frame chat sender
  const sendBridge = message => h.dispatch(message, h.chatSender);
  h.api.runtime.sendMessage = (message, callback) => {
    Promise.resolve().then(() => sendBridge(message)).then(callback);
  };
  await new Promise(resolve => setTimeout(resolve, 25));
  const body = elements.get('body');
  const docEl = elements.get('docEl');

  const dock = body.querySelector('#op-bottom-dock');
  assert.ok(dock, 'bottom dock renders even when contextVial is false');
  assert.equal(dock.querySelector('.op-vial-pill'), null, 'vial pill stays absent when contextVial is false');
  assert.equal(dock.querySelector('.op-vial-popover'), null, 'vial popover stays absent when contextVial is false');

  const widthBtn = dock.querySelector('.op-width-toggle');
  assert.ok(widthBtn, '.op-width-toggle renders inside #op-bottom-dock');
  assert.equal(widthBtn.tagName, 'BUTTON');
  assert.equal(widthBtn.type, 'button');
  assert.equal(widthBtn.getAttribute('data-width-preset'), 'standard');
  assert.equal(docEl.getAttribute('data-op-content-width'), 'standard');

  // Untrusted synthetic click is ignored
  widthBtn.dispatchEvent({ type: 'click', isTrusted: false });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(docEl.getAttribute('data-op-content-width'), 'standard');

  // Trusted clicks cycle standard -> wide -> full -> standard and persist
  widthBtn.dispatchEvent({ type: 'click', isTrusted: true });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(docEl.getAttribute('data-op-content-width'), 'wide');
  assert.equal(widthBtn.getAttribute('data-width-preset'), 'wide');
  assert.equal(h.state.storage[h.schema.STORAGE_KEY].contentWidth, 'wide');

  widthBtn.dispatchEvent({ type: 'click', isTrusted: true });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(docEl.getAttribute('data-op-content-width'), 'full');
  assert.equal(widthBtn.getAttribute('data-width-preset'), 'full');

  widthBtn.dispatchEvent({ type: 'click', isTrusted: true });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(docEl.getAttribute('data-op-content-width'), 'standard');
  assert.equal(widthBtn.getAttribute('data-width-preset'), 'standard');

  // Enabling contextVial adds vial pill alongside .op-width-toggle, and disabling removes only vial
  await h.schema.callApi(h.api.storage.local, 'set', { [h.schema.STORAGE_KEY]: { ...h.schema.DEFAULT_CONFIG, enabled: true, contextVial: true } });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(dock.querySelector('.op-vial-pill'));
  assert.ok(dock.querySelector('.op-width-toggle'));

  await h.schema.callApi(h.api.storage.local, 'set', { [h.schema.STORAGE_KEY]: { ...h.schema.DEFAULT_CONFIG, enabled: true, contextVial: false } });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(dock.querySelector('.op-vial-pill'), null);
  assert.equal(dock.querySelector('.op-vial-popover'), null);
  assert.ok(dock.querySelector('.op-width-toggle'));

  runtime.stop();
});

test('syncDock resolves auto/manual reference capacity, renders attachment indicator, and refreshes immediately on model change', async () => {
  const ctx = createRuntimeDom(
    { language: 'en-US', contextWindowTokens: 'auto' },
    { host: 'chatgpt', modelLabel: 'ChatGPT 5.2', attachments: [{ id: 'a1' }, { id: 'a2' }] }
  );
  await new Promise(resolve => setTimeout(resolve, 20));
  const summary = ctx.body.querySelector('.op-vial-summary');
  const details = ctx.body.querySelector('.op-vial-details');
  const note = ctx.body.querySelector('.op-vial-note');
  const detailsText = () => details.children.map(n => n.textContent).join(' | ');

  assert.match(summary.textContent, /^≈ \d+\+ \/ 400\.0K$/);
  assert.equal(detailsText().includes('Reference capacity'), true);
  assert.equal(detailsText().includes('400,000'), true);
  assert.equal(detailsText().includes('Auto-matched'), true);
  assert.equal(detailsText().includes('ChatGPT 5.2'), true);
  assert.equal(detailsText().includes('Uncounted attachments'), true);
  assert.equal(detailsText().includes('2 files'), true);
  assert.equal(note.textContent.includes('Visible attachments detected; their contents are not counted above.'), true);

  // Changing model label refreshes immediately even without advancing 750ms
  ctx.setModel('GPT-4o');
  ctx.setAttachments([]);
  ctx.runtime.refresh();
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.match(summary.textContent, /^≈ \d+ \/ 128\.0K$/);
  assert.equal(detailsText().includes('128,000'), true);
  assert.equal(detailsText().includes('GPT-4o'), true);
  assert.equal(detailsText().includes('Uncounted attachments'), false);
  assert.equal(note.textContent.includes('Visible attachments detected'), false);

  // Manual override supersedes auto model match
  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', {
    [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, language: 'en-US', contextWindowTokens: 200000 }
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.match(summary.textContent, /^≈ \d+ \/ 200\.0K$/);
  assert.equal(detailsText().includes('Manual'), true);

  // Gemini 2.5 Pro resolves to 1.0M in auto mode
  const gem = createRuntimeDom(
    { language: 'zh-CN', contextWindowTokens: 'auto' },
    { host: 'gemini', modelLabel: 'Gemini 2.5 Pro', attachments: [] }
  );
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.match(gem.body.querySelector('.op-vial-summary').textContent, /^≈ \d+ \/ 1\.0M$/);
  const gemDetails = gem.body.querySelector('.op-vial-details').children.map(n => n.textContent).join(' | ');
  assert.equal(gemDetails.includes('自动匹配'), true);
  assert.equal(gemDetails.includes('Gemini 2.5 Pro'), true);
  gem.runtime.stop();
  ctx.runtime.stop();
});

test('syncRail uses cleanTurnText to strip sr-only and button chrome from outline labels', async () => {
  const seen = [];
  const ctx = createRuntimeDom(
    { language: 'en-US' },
    {
      cleanTurnText: node => {
        seen.push(node);
        return 'Clean question text';
      }
    }
  );
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(seen.length >= 1, true);
  const itemText = ctx.body.querySelector('.op-rail-text').textContent;
  assert.equal(itemText, 'Clean question text');
  assert.equal(ctx.body.querySelector('.op-rail-tick').title, 'Clean question text');
  ctx.runtime.stop();
});
