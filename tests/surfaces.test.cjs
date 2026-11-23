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
      childNodes: [],
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
              this.childNodes.push(n);
              if (n.nodeType !== 3) this.children.push(n);
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
        this.childNodes.unshift(...added);
        this.children.unshift(...added.filter(n => n.nodeType !== 3));
      },
      replaceChildren(...nodes) { this.children = []; this.childNodes = []; this.append(...nodes); },
      remove() {
        this.isConnected = false;
        if (this.parentElement && Array.isArray(this.parentElement.children)) {
          const idx = this.parentElement.children.indexOf(this);
          if (idx >= 0) this.parentElement.children.splice(idx, 1);
          if (Array.isArray(this.parentElement.childNodes)) {
            const cnIdx = this.parentElement.childNodes.indexOf(this);
            if (cnIdx >= 0) this.parentElement.childNodes.splice(cnIdx, 1);
          }
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
  const gridEl = makeEl('div');
  const trailingEl = makeEl('div', { 'data-op-composer-toolbar': 'host-toolbar' });
  const scrim = makeEl('div');
  const addBtn = makeEl('button');
  const modelSlotEl = makeEl('bard-mode-switcher');
  const modelBtn = makeEl('button');
  const primaryActionBtn = makeEl('button');
  const composerAttachment = makeEl('div');
  const chip = makeEl('button');
  const codeSurface = makeEl('div');
  const codeHeader = makeEl('div');
  const spacer = makeEl('div');
  const userTurn = makeEl('article', { 'data-turn': 'user' });
  userTurn.textContent = 'Sample user question';
  const assistantTurn = makeEl('article', { 'data-turn': 'assistant' });
  assistantTurn.textContent = 'Sample assistant answer';

  const emptySibling = makeEl('div');
  const disclaimerSibling = makeEl('div');
  const scrollerEl = options.scroller || makeEl('div');
  for (const [k, v] of Object.entries({ docEl, body, primary, threadCol, composerCol, composer, gridEl, trailingEl, scrim, addBtn, modelSlotEl, modelBtn, primaryActionBtn, composerAttachment, chip, codeSurface, codeHeader, spacer, userTurn, assistantTurn, emptySibling, disclaimerSibling, scrollerEl })) {
    elements.set(k, v);
  }

  let currentModel = options.modelLabel ?? (host === 'gemini' ? 'Gemini 2.5 Pro' : 'ChatGPT 5.2');
  let currentAttachments = options.attachments ?? [];
  let homeMode = Boolean(options.isHome);

  const fakeAdapter = {
    host,
    contentWidth: { native: 768, targets: [], composerTargets: [] },
    userTurns: () => (homeMode ? [] : [userTurn]),
    assistantTurns: () => (homeMode ? [] : [assistantTurn]),
    primarySurface: () => primary,
    composerSurface: () => composer,
    composerGrid: () => ({ element: gridEl, slots: null, trailing: trailingEl }),
    composerBackdropSurfaces: () => [scrim],
    composerScrimSurface: () => scrim,
    composerBelowSiblings: () => ({
      empty: options.withBelowSiblings ? [emptySibling] : [],
      disclaimers: options.withBelowSiblings ? [disclaimerSibling] : []
    }),
    composerAddTrigger: () => addBtn,
    modelSelectorTrigger: () => modelBtn,
    modelCapsuleSlot: () => modelSlotEl,
    composerPrimaryAction: () => primaryActionBtn,
    composerAttachments: () => [composerAttachment],
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
    scrollContainer: () => (options.useCustomScroller ? scrollerEl : body)
  };
  if (options.getComputedStyle) h.context.getComputedStyle = options.getComputedStyle;

  h.context.document = {
    documentElement: docEl,
    body,
    hidden: false,
    createElement: tag => makeEl(tag),
    createTextNode: text => ({ nodeType: 3, nodeValue: String(text), textContent: String(text), parentElement: null }),
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
    setHome(flag) { homeMode = Boolean(flag); },
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
  assert.equal(e.gridEl.getAttribute('data-op-composer-grid'), 'true');
  assert.equal(e.trailingEl.getAttribute('data-op-composer-toolbar'), 'true');
  assert.equal(e.trailingEl.getAttribute('data-op-composer-trailing'), null);
  assert.equal(e.modelSlotEl.getAttribute('data-op-model-capsule-item'), 'true');
  assert.equal(e.primaryActionBtn.getAttribute('data-op-composer-primary-action'), 'true');
  assert.equal(e.composerAttachment.getAttribute('data-op-composer-attachment'), 'true');
  assert.equal(e.chip.getAttribute('data-op-composer-chip'), 'true');
  assert.equal(e.spacer.getAttribute('data-op-thread-spacer'), 'true');
  assert.equal(e.threadCol.getAttribute('data-op-thread-column'), 'true');
  assert.equal(e.composerCol.getAttribute('data-op-composer-column'), 'true');
  assert.equal(e.composer.getAttribute('data-op-composer-surface'), 'true');

  // Switch to Native Palette ('host'): visual marks clear while column marks remain, original composer/toolbar attrs restore.
  await h.schema.callApi(h.api.storage.local, 'set', { [h.schema.STORAGE_KEY]: { ...h.schema.DEFAULT_CONFIG, enabled: true, palette: 'host', themeMode: 'dark' } });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(e.codeSurface.getAttribute('data-op-code-surface'), null);
  assert.equal(e.codeHeader.getAttribute('data-op-code-header'), null);
  assert.equal(e.scrim.getAttribute('data-op-composer-scrim'), null);
  assert.equal(e.addBtn.getAttribute('data-op-composer-add'), null);
  assert.equal(e.modelBtn.getAttribute('data-op-model-capsule'), null);
  assert.equal(e.gridEl.getAttribute('data-op-composer-grid'), null);
  assert.equal(e.trailingEl.getAttribute('data-op-composer-toolbar'), 'host-toolbar');
  assert.equal(e.modelSlotEl.getAttribute('data-op-model-capsule-item'), null);
  assert.equal(e.primaryActionBtn.getAttribute('data-op-composer-primary-action'), null);
  assert.equal(e.composerAttachment.getAttribute('data-op-composer-attachment'), null);
  assert.equal(e.chip.getAttribute('data-op-composer-chip'), null);
  assert.equal(e.spacer.getAttribute('data-op-thread-spacer'), null);
  assert.equal(e.composer.getAttribute('data-op-composer-surface'), 'host-orig');

  // Restore prism palette and disable composerRestyle: composer/add/model/toolbar/slot/primary/attachment/chip clear, code/scrim remain.
  await h.schema.callApi(h.api.storage.local, 'set', { [h.schema.STORAGE_KEY]: { ...h.schema.DEFAULT_CONFIG, enabled: true, palette: 'obsidian', themeMode: 'dark', composerRestyle: false } });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(e.codeSurface.getAttribute('data-op-code-surface'), 'true');
  assert.equal(e.scrim.getAttribute('data-op-composer-scrim'), 'true');
  assert.equal(e.addBtn.getAttribute('data-op-composer-add'), null);
  assert.equal(e.modelBtn.getAttribute('data-op-model-capsule'), null);
  assert.equal(e.gridEl.getAttribute('data-op-composer-grid'), null);
  assert.equal(e.trailingEl.getAttribute('data-op-composer-toolbar'), 'host-toolbar');
  assert.equal(e.modelSlotEl.getAttribute('data-op-model-capsule-item'), null);
  assert.equal(e.primaryActionBtn.getAttribute('data-op-composer-primary-action'), null);
  assert.equal(e.composerAttachment.getAttribute('data-op-composer-attachment'), null);
  assert.equal(e.chip.getAttribute('data-op-composer-chip'), null);
  assert.equal(e.composer.getAttribute('data-op-composer-surface'), 'host-orig');

  // Disable site toggle cleanly: all marks clear without residue.
  await h.schema.callApi(h.api.storage.local, 'set', { [h.schema.STORAGE_KEY]: { ...h.schema.DEFAULT_CONFIG, enabled: true, enableChatGPT: false } });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(e.docEl.getAttribute('data-op-home'), null);
  assert.equal(e.codeSurface.getAttribute('data-op-code-surface'), null);
  assert.equal(e.trailingEl.getAttribute('data-op-composer-toolbar'), 'host-toolbar');
  assert.equal(e.composer.getAttribute('data-op-composer-surface'), 'host-orig');

  // Re-enable then stop runtime: every mark and root flag restores cleanly.
  await h.schema.callApi(h.api.storage.local, 'set', { [h.schema.STORAGE_KEY]: { ...h.schema.DEFAULT_CONFIG, enabled: true, palette: 'obsidian', themeMode: 'dark', enableChatGPT: true } });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(e.codeSurface.getAttribute('data-op-code-surface'), 'true');
  assert.equal(e.trailingEl.getAttribute('data-op-composer-toolbar'), 'true');
  runtime.stop();
  assert.equal(e.docEl.getAttribute('data-op-home'), null);
  assert.equal(e.codeSurface.getAttribute('data-op-code-surface'), null);
  assert.equal(e.scrim.getAttribute('data-op-composer-scrim'), null);
  assert.equal(e.threadCol.getAttribute('data-op-thread-column'), null);
  assert.equal(e.composerCol.getAttribute('data-op-composer-column'), null);
  assert.equal(e.trailingEl.getAttribute('data-op-composer-toolbar'), 'host-toolbar');
  assert.equal(e.modelSlotEl.getAttribute('data-op-model-capsule-item'), null);
  assert.equal(e.primaryActionBtn.getAttribute('data-op-composer-primary-action'), null);
  assert.equal(e.composerAttachment.getAttribute('data-op-composer-attachment'), null);
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

test('Context Vial flags an unrecognized ChatGPT tier with ? and a bilingual hint until a manual capacity is set', async () => {
  const ctx = createRuntimeDom({ language: 'zh-CN', contextWindowTokens: 'auto' }, { host: 'chatgpt', modelLabel: 'Auto', attachments: [] });
  await new Promise(resolve => setTimeout(resolve, 20));
  const summary = ctx.body.querySelector('.op-vial-summary');
  const details = ctx.body.querySelector('.op-vial-details');
  const detailsText = () => details.children.map(n => n.textContent).join(' | ');
  assert.match(summary.textContent, /^≈ \d+ \/ 128\.0K\?$/);
  assert.equal(detailsText().includes('未识别型号，可在设置中指定'), true, detailsText());

  ctx.setModel('Thinking');
  ctx.runtime.refresh();
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.match(summary.textContent, /^≈ \d+ \/ 400\.0K$/);
  assert.equal(detailsText().includes('未识别'), false);

  ctx.setModel('Instant');
  ctx.runtime.refresh();
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.match(summary.textContent, /^≈ \d+ \/ 128\.0K$/);

  ctx.setModel('Mystery tier');
  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', {
    [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, language: 'en-US', contextWindowTokens: 'auto' }
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.match(summary.textContent, /^≈ \d+ \/ 128\.0K\?$/);
  assert.equal(detailsText().includes('Unrecognized model; choose a capacity in settings'), true, detailsText());

  // A manual capacity overrides auto and removes the flag.
  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', {
    [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, language: 'en-US', contextWindowTokens: 200000 }
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.match(summary.textContent, /^≈ \d+ \/ 200\.0K$/);
  assert.equal(detailsText().includes('Unrecognized'), false);
  assert.equal(detailsText().includes('Manual'), true);
  ctx.runtime.stop();

  // Gemini custom mode: 1M auto fallback, labelled as such, never flagged.
  const gem = createRuntimeDom({ language: 'zh-CN', contextWindowTokens: 'auto' }, { host: 'gemini', modelLabel: 'Neon High', attachments: [] });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.match(gem.body.querySelector('.op-vial-summary').textContent, /^≈ \d+ \/ 1\.0M$/);
  const gemDetails = gem.body.querySelector('.op-vial-details').children.map(n => n.textContent).join(' | ');
  assert.equal(gemDetails.includes('自动兜底 · Neon High'), true, gemDetails);
  gem.runtime.stop();
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

test('ADR-0002: runtime never reparents composer/model controls, never mutates native text nodes, and creates zero fake repo/branch capsules', async () => {
  for (const host of ['chatgpt', 'gemini']) {
    const ctx = createRuntimeDom({ themeMode: 'dark', palette: 'obsidian', composerRestyle: true }, { host });
    const e = Object.fromEntries(ctx.elements);
    const doc = ctx.h.context.document;
    const topbar = doc.createElement('header');
    const editor = doc.createElement('div');
    const toolsRow = doc.createElement('div');
    const modelNameSpan = doc.createElement('span');
    const modelTierSpan = doc.createElement('span');
    modelTierSpan.className = host === 'chatgpt' ? 'model-tier' : 'mode-tier';

    const editorText = doc.createTextNode('Draft prompt text');
    const modelNameText = doc.createTextNode(host === 'chatgpt' ? 'ChatGPT' : 'Gemini 2.5');
    const modelTierText = doc.createTextNode(host === 'chatgpt' ? '5.2' : 'Pro');
    const chipText = doc.createTextNode(host === 'chatgpt' ? 'Search' : 'Deep Research');

    editor.append(editorText);
    modelNameSpan.append(modelNameText);
    modelTierSpan.append(modelTierText);
    e.modelBtn.append(modelNameSpan, modelTierSpan);
    e.chip.append(chipText);

    toolsRow.append(e.addBtn, e.chip);
    if (host === 'chatgpt') {
      topbar.append(e.modelBtn);
    } else {
      toolsRow.append(e.modelBtn);
    }
    e.composer.append(editor, toolsRow);
    e.composerCol.append(e.composer);
    e.primary.append(topbar, e.composerCol);
    e.body.append(e.primary);

    const modelParent = host === 'chatgpt' ? topbar : toolsRow;
    const composerChildCount = e.composer.children.length;
    const toolsChildCount = toolsRow.children.length;
    const modelChildCount = e.modelBtn.children.length;
    const topbarChildCount = topbar.children.length;

    const assertAdrInvariants = phase => {
      assert.equal(e.composer.parentElement, e.composerCol, `${host} (${phase}): composer parentElement must never change`);
      assert.equal(e.addBtn.parentElement, toolsRow, `${host} (${phase}): addBtn parentElement must never change`);
      assert.equal(e.modelBtn.parentElement, modelParent, `${host} (${phase}): modelBtn parentElement must never change`);
      assert.equal(e.chip.parentElement, toolsRow, `${host} (${phase}): chip parentElement must never change`);

      assert.equal(editor.childNodes[0], editorText, `${host} (${phase}): editor text node reference must remain intact`);
      assert.equal(editorText.nodeValue, 'Draft prompt text');
      assert.equal(editorText.textContent, 'Draft prompt text');
      assert.equal(modelNameSpan.childNodes[0], modelNameText, `${host} (${phase}): model name text node reference must remain intact`);
      assert.equal(modelNameText.nodeValue, host === 'chatgpt' ? 'ChatGPT' : 'Gemini 2.5');
      assert.equal(modelTierSpan.childNodes[0], modelTierText, `${host} (${phase}): model tier text node reference must remain intact`);
      assert.equal(modelTierText.nodeValue, host === 'chatgpt' ? '5.2' : 'Pro');
      assert.equal(e.chip.childNodes[0], chipText, `${host} (${phase}): chip text node reference must remain intact`);
      assert.equal(chipText.nodeValue, host === 'chatgpt' ? 'Search' : 'Deep Research');

      assert.equal(e.composer.children.length, composerChildCount, `${host} (${phase}): no extra DOM nodes injected into composer`);
      assert.equal(toolsRow.children.length, toolsChildCount, `${host} (${phase}): no fake repo/branch capsule injected into composer tools`);
      assert.equal(e.modelBtn.children.length, modelChildCount, `${host} (${phase}): no DOM dot node injected into modelBtn`);
      assert.equal(topbar.children.length, topbarChildCount, `${host} (${phase}): no extra DOM nodes injected into topbar`);
      assert.equal(e.composer.querySelector('[data-op-owned]'), null, `${host} (${phase}): no owned wrapper inside composer`);
      assert.equal(
        e.body.querySelector('.op-repo-capsule, .op-branch-capsule, [data-op-repo-capsule], [data-op-branch-capsule]'),
        null,
        `${host} (${phase}): never fabricate fake repo/branch capsules`
      );
    };

    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(e.composer.getAttribute('data-op-composer-surface'), 'true');
    assert.equal(e.addBtn.getAttribute('data-op-composer-add'), 'true');
    assert.equal(e.modelBtn.getAttribute('data-op-model-capsule'), 'true');
    assert.equal(e.chip.getAttribute('data-op-composer-chip'), 'true');
    assertAdrInvariants('dark-obsidian');

    const transitions = [
      ['light-crystal', { themeMode: 'light', lightPreset: 'crystal', palette: 'obsidian', composerRestyle: true }],
      ['host-palette', { themeMode: 'dark', palette: 'host', composerRestyle: true }],
      ['composer-restyle-off', { themeMode: 'dark', palette: 'obsidian', composerRestyle: false }],
      ['composer-restyle-on', { themeMode: 'dark', palette: 'obsidian', composerRestyle: true }],
      ['disabled', { enabled: false }],
      ['re-enabled', { enabled: true, themeMode: 'dark', palette: 'obsidian', composerRestyle: true }]
    ];
    for (const [label, patch] of transitions) {
      await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', {
        [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, ...patch }
      });
      await new Promise(resolve => setTimeout(resolve, 15));
      assertAdrInvariants(label);
    }

    ctx.runtime.stop();
    assertAdrInvariants('stopped');
  }
});

test('runtime suppresses composer scrim and tail spacer in Home State and clears them when returning home', async () => {
  const ctx = createRuntimeDom({ themeMode: 'dark', palette: 'obsidian', composerRestyle: true }, { isHome: true });
  await new Promise(resolve => setTimeout(resolve, 20));
  const e = Object.fromEntries(ctx.elements);

  assert.equal(e.docEl.getAttribute('data-op-home'), 'true');
  assert.equal(e.scrim.getAttribute('data-op-composer-backdrop'), 'true');
  assert.equal(e.scrim.getAttribute('data-op-composer-dock'), null);
  assert.equal(e.scrim.getAttribute('data-op-composer-scrim'), null);
  assert.equal(e.spacer.getAttribute('data-op-thread-spacer'), null);
  assert.equal(e.composer.getAttribute('data-op-composer-surface'), 'true');

  ctx.setHome(false);
  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', {
    [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'obsidian', themeMode: 'dark', contentWidth: 'wide' }
  });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(e.docEl.getAttribute('data-op-home'), 'false');
  assert.equal(e.scrim.getAttribute('data-op-composer-dock'), 'true');
  assert.equal(e.scrim.getAttribute('data-op-composer-scrim'), 'true');
  assert.equal(e.spacer.getAttribute('data-op-thread-spacer'), 'true');

  ctx.setHome(true);
  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', {
    [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'obsidian', themeMode: 'dark', contentWidth: 'standard' }
  });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(e.docEl.getAttribute('data-op-home'), 'true');
  assert.equal(e.scrim.getAttribute('data-op-composer-dock'), null);
  assert.equal(e.scrim.getAttribute('data-op-composer-scrim'), null);
  assert.equal(e.spacer.getAttribute('data-op-thread-spacer'), null);

  ctx.runtime.stop();
});

// v0.3.1 #21: the runtime publishes one root reading width from the main area's width; no per-node marks.
test('runtime publishes the Content Width Preset as a root reading width and removes it for standard, a disabled site and stop', async () => {
  const ctx = createRuntimeDom({ contentWidth: 'full' });
  await new Promise(resolve => setTimeout(resolve, 20));
  const docEl = ctx.elements.get('docEl');
  const write = patch => ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', { [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'obsidian', themeMode: 'dark', ...patch } });
  const settle = () => new Promise(resolve => setTimeout(resolve, 15));
  const vars = () => [docEl.style.getPropertyValue('--op-reading-width'), docEl.style.getPropertyValue('--op-reading-shift')];
  // The fake main area is 1200px wide at a 1280px viewport: full = 1200 - 20 - 56.
  assert.deepEqual(vars(), ['1124px', '-18px']);
  await write({ contentWidth: 'wide' }); await settle();
  assert.deepEqual(vars(), ['946px', '0px'], 'wide is the midpoint of native 768 and full 1124');
  await write({ contentWidth: 'standard' }); await settle();
  assert.deepEqual(vars(), ['', ''], 'standard leaves the native width untouched');
  await write({ contentWidth: 'full' }); await settle();
  assert.deepEqual(vars(), ['1124px', '-18px']);
  await write({ contentWidth: 'full', enableChatGPT: false }); await settle();
  assert.deepEqual(vars(), ['', ''], 'a disabled site restores the native width');
  await write({ contentWidth: 'full' }); await settle();
  assert.deepEqual(vars(), ['1124px', '-18px']);
  ctx.runtime.stop();
  assert.deepEqual(vars(), ['', ''], 'stop restores the native width');
});

/** Replaces an element's inline style with one that serializes into its `style` attribute like a browser:
 * removing the last declaration leaves `style=""`, and removing an absent property changes nothing. */
function reflectInlineStyle(element, declarations = []) {
  const values = new Map(declarations.map(([name, value, priority = '']) => [name, [value, priority]]));
  const write = () => element.setAttribute('style', [...values].map(([name, [value, priority]]) => `${name}: ${value}${priority ? ' !important' : ''};`).join(' '));
  if (values.size) write();
  element.style = {
    getPropertyValue: name => values.get(name)?.[0] || '',
    getPropertyPriority: name => values.get(name)?.[1] || '',
    setProperty(name, value, priority = '') { values.set(name, [String(value), priority]); write(); },
    removeProperty(name) { if (values.delete(name)) write(); }
  };
}

// Review fix S2: root reading-width variables follow the --op-ambient-alpha pattern (save and restore the
// original value and priority) and leave no empty style attribute behind when there was none.
test('root reading width restores the original inline value and priority, and leaves no style="" residue', async () => {
  const fresh = createRuntimeDom({ contentWidth: 'full' });
  const freshRoot = fresh.elements.get('docEl');
  reflectInlineStyle(freshRoot);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(freshRoot.style.getPropertyValue('--op-reading-width'), '1124px');
  fresh.runtime.stop();
  assert.equal(freshRoot.getAttribute('style'), null, 'a root that had no style attribute gets none back');

  const owned = createRuntimeDom({ contentWidth: 'full' });
  const ownedRoot = owned.elements.get('docEl');
  reflectInlineStyle(ownedRoot, [['--op-reading-width', '640px', 'important'], ['--host-gap', '4px']]);
  const original = ownedRoot.getAttribute('style');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(ownedRoot.style.getPropertyValue('--op-reading-width'), '1124px');
  await owned.h.schema.callApi(owned.h.api.storage.local, 'set', { [owned.h.schema.STORAGE_KEY]: { ...owned.h.schema.DEFAULT_CONFIG, enabled: true, contentWidth: 'standard' } });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.deepEqual([ownedRoot.style.getPropertyValue('--op-reading-width'), ownedRoot.style.getPropertyPriority('--op-reading-width')], ['640px', 'important'], 'standard restores the original value and priority');
  assert.equal(ownedRoot.style.getPropertyValue('--op-reading-shift'), '', 'a variable that was absent stays absent');
  owned.runtime.stop();
  assert.equal(ownedRoot.style.getPropertyValue('--host-gap'), '4px');
  assert.deepEqual([ownedRoot.style.getPropertyValue('--op-reading-width'), ownedRoot.style.getPropertyPriority('--op-reading-width')], ['640px', 'important']);
  assert.equal(ownedRoot.style.getPropertyValue('--op-ambient-alpha'), '', 'stop also removes the ambient alpha');
  assert.ok(ownedRoot.getAttribute('style').includes('--host-gap: 4px'), `the host's own declarations survive (${ownedRoot.getAttribute('style')} vs ${original})`);
});

test('runtime distinguishes in-flow composer dock from overlaid composer scrim, marks below-form siblings, and restores cleanly', async () => {
  const styles = new Map();
  const rects = new Map();
  const scroller = {
    nodeType: 1, tagName: 'DIV', isConnected: true, children: [], childNodes: [],
    attributesMap: new Map(),
    getAttribute(k) { return this.attributesMap.get(k) ?? null; },
    setAttribute(k, v) { this.attributesMap.set(k, String(v)); },
    removeAttribute(k) { this.attributesMap.delete(k); },
    hasAttribute(k) { return this.attributesMap.has(k); },
    contains(t) { return t === this; },
    getBoundingClientRect() { return rects.get(this) || { left: 0, top: 52, right: 1280, bottom: 720, width: 1280, height: 668 }; }
  };
  const inFlow = createRuntimeDom({}, {
    host: 'chatgpt',
    withBelowSiblings: true,
    useCustomScroller: true,
    scroller,
    getComputedStyle: el => styles.get(el) || { position: 'relative', paddingBottom: '0px' }
  });
  const e = Object.fromEntries(inFlow.elements);
  e.scrim.getBoundingClientRect = () => ({ left: 0, top: 720, right: 1280, bottom: 900, width: 1280, height: 180 });
  styles.set(e.scrim, { position: 'relative', paddingBottom: '0px' });
  inFlow.runtime.refresh();
  await new Promise(resolve => setTimeout(resolve, 190));

  assert.equal(e.scrim.getAttribute('data-op-composer-dock'), 'true', 'in-flow dock receives data-op-composer-dock');
  assert.equal(e.scrim.getAttribute('data-op-composer-backdrop'), 'true', 'in-flow dock receives data-op-composer-backdrop');
  assert.equal(e.scrim.getAttribute('data-op-composer-scrim'), null, 'in-flow dock must NOT receive data-op-composer-scrim');
  assert.equal(scroller.getAttribute('data-op-thread-scroller'), null, 'in-flow scroller must NOT receive data-op-thread-scroller');
  assert.equal(e.docEl.style.getPropertyValue('--op-dock-clearance'), '', 'in-flow dock must NOT set --op-dock-clearance');
  assert.equal(e.emptySibling.getAttribute('data-op-composer-empty-sibling'), 'true');
  assert.equal(e.disclaimerSibling.getAttribute('data-op-composer-disclaimer'), 'true');

  // Native Palette and stop restore all dock/sibling marks cleanly.
  await inFlow.h.schema.callApi(inFlow.h.api.storage.local, 'set', { [inFlow.h.schema.STORAGE_KEY]: { ...inFlow.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'host', themeMode: 'dark' } });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(e.scrim.getAttribute('data-op-composer-dock'), null);
  assert.equal(e.emptySibling.getAttribute('data-op-composer-empty-sibling'), null);
  assert.equal(e.disclaimerSibling.getAttribute('data-op-composer-disclaimer'), null);

  await inFlow.h.schema.callApi(inFlow.h.api.storage.local, 'set', { [inFlow.h.schema.STORAGE_KEY]: { ...inFlow.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'obsidian', themeMode: 'dark' } });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(e.scrim.getAttribute('data-op-composer-dock'), 'true');
  inFlow.runtime.stop();
  assert.equal(e.scrim.getAttribute('data-op-composer-dock'), null);
  assert.equal(e.emptySibling.getAttribute('data-op-composer-empty-sibling'), null);
  assert.equal(e.disclaimerSibling.getAttribute('data-op-composer-disclaimer'), null);

  // Overlaid dock (Gemini style): receives both data-op-composer-dock and data-op-composer-scrim + clearance.
  const overlaidStyles = new Map();
  const overlaidScroller = {
    ...scroller,
    attributesMap: new Map(),
    getBoundingClientRect: () => ({ left: 0, top: 64, right: 1280, bottom: 900, width: 1280, height: 836 })
  };
  const overlaid = createRuntimeDom({}, {
    host: 'gemini',
    useCustomScroller: true,
    scroller: overlaidScroller,
    getComputedStyle: el => overlaidStyles.get(el) || { position: 'absolute', paddingBottom: '24px' }
  });
  const oe = Object.fromEntries(overlaid.elements);
  oe.scrim.getBoundingClientRect = () => ({ left: 0, top: 760, right: 1280, bottom: 900, width: 1280, height: 140 });
  overlaidStyles.set(oe.scrim, { position: 'absolute', paddingBottom: '0px' });
  overlaid.runtime.refresh();
  await new Promise(resolve => setTimeout(resolve, 190));

  assert.equal(oe.scrim.getAttribute('data-op-composer-dock'), 'true');
  assert.equal(oe.scrim.getAttribute('data-op-composer-scrim'), 'true');
  assert.equal(overlaidScroller.getAttribute('data-op-thread-scroller'), 'true');
  assert.notEqual(oe.docEl.style.getPropertyValue('--op-dock-clearance'), '');
  overlaid.runtime.stop();
  assert.equal(oe.scrim.getAttribute('data-op-composer-dock'), null);
  assert.equal(oe.scrim.getAttribute('data-op-composer-scrim'), null);
  assert.equal(overlaidScroller.getAttribute('data-op-thread-scroller'), null);
  assert.equal(oe.docEl.style.getPropertyValue('--op-dock-clearance'), '');
});
