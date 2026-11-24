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
      setAttribute(name, val) {
        map.set(String(name), String(val));
        if (name === 'class') this.className = String(val);
      },
      removeAttribute(k) { map.delete(k); },
      hasAttribute(k) { return map.has(k); },
      classList: {
        toggle(name, force) {
          const set = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
          const add = force === undefined ? !set.has(name) : Boolean(force);
          if (add) set.add(name); else set.delete(name);
          el.className = [...set].join(' ');
          return add;
        },
        add(...names) {
          const set = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
          for (const n of names) if (n) set.add(n);
          el.className = [...set].join(' ');
        },
        remove(...names) {
          const set = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
          for (const n of names) set.delete(n);
          el.className = [...set].join(' ');
        },
        contains(name) { return String(el.className || '').split(/\s+/).includes(name); }
      },
      get firstChild() { return this.childNodes[0] || null; },
      get nextElementSibling() {
        const siblings = this.parentElement?.children;
        if (!siblings) return null;
        const idx = siblings.indexOf(this);
        return idx >= 0 && idx + 1 < siblings.length ? siblings[idx + 1] : null;
      },
      insertAdjacentElement(pos, node) {
        if (!this.parentElement || !node) return node;
        if (pos === 'afterend') {
          if (node.parentElement) node.remove();
          node.parentElement = this.parentElement;
          node.isConnected = this.parentElement.isConnected;
          const cIdx = this.parentElement.children.indexOf(this);
          this.parentElement.children.splice(cIdx + 1, 0, node);
          const cnIdx = this.parentElement.childNodes.indexOf(this);
          this.parentElement.childNodes.splice(cnIdx + 1, 0, node);
          return node;
        }
        return node;
      },
      before(...nodes) {
        if (!this.parentElement) return;
        for (const node of nodes) {
          if (!node || typeof node !== 'object') continue;
          if (node.parentElement) node.remove();
          node.parentElement = this.parentElement;
          node.isConnected = this.parentElement.isConnected;
          const cIdx = this.parentElement.children.indexOf(this);
          this.parentElement.children.splice(cIdx, 0, node);
          const cnIdx = this.parentElement.childNodes.indexOf(this);
          this.parentElement.childNodes.splice(cnIdx, 0, node);
        }
      },
      appendChild(node) { this.append(node); return node; },
      append(...nodes) {
        for (const n of nodes) {
          if (n && typeof n === 'object') {
            if (n.tagName === 'FRAGMENT') {
              this.append(...n.children);
            } else {
              n.parentElement = this;
              n.isConnected = this.isConnected;
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
        for (const n of added) { n.parentElement = this; n.isConnected = this.isConnected; }
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

  let currentCodeBlocks = options.codeBlocks || [];
  let streamingNow = Boolean(options.isStreaming);
  const fakeAdapter = {
    host,
    usesOverlayScrim: host === 'gemini',
    usesScrollerAlphaFade: host === 'chatgpt',
    contentWidth: { native: 768, targets: [], composerTargets: [] },
    userTurns: () => (homeMode ? [] : [userTurn]),
    assistantTurns: () => (homeMode ? [] : [assistantTurn]),
    primarySurface: () => primary,
    composerSurface: () => composer,
    composerGrid: () => ({ element: gridEl, slots: null, trailing: trailingEl }),
    composerEmptyHeaders: () => options.emptyHeaders || [],
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
    codeSurfaces: () => options.codeSurfaces ? options.codeSurfaces() : [codeSurface],
    codeHeaders: () => options.codeHeaders ? options.codeHeaders() : [codeHeader],
    codeSurfaceFor: options.codeSurfaceFor || ((pre, surfaces = []) => surfaces.find(s => s === pre || s.contains?.(pre)) || pre),
    codeHeaderFor: options.codeHeaderFor || ((surface, pre, headers = []) => headers.find(h => surface && surface !== pre && surface.contains?.(h)) || null),
    codeWellFor: options.codeWellFor || (pre => (host === 'gemini' && pre.parentElement?.classList?.contains('formatted-code-block-internal-container') ? pre.parentElement : pre)),
    threadTailSpacers: () => [spacer],
    threadColumns: () => [threadCol],
    composerColumns: () => [composerCol],
    visibleAttachments: () => currentAttachments,
    activeModelLabel: () => currentModel,
    sidebarSurfaces: () => [],
    sidebarActiveTargets: () => [],
    codeBlocks: () => [...currentCodeBlocks],
    thoughtBlocks: () => [],
    isAssistantNode: () => false,
    isStreaming: () => streamingNow,
    scrollContainer: () => (options.useCustomScroller ? scrollerEl : body)
  };
  if (options.getComputedStyle) h.context.getComputedStyle = options.getComputedStyle;

  h.context.document = {
    compatMode: 'CSS1Compat',
    documentElement: docEl,
    body,
    hidden: false,
    createElement: tag => makeEl(tag),
    createElementNS: (_ns, tag) => makeEl(tag),
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
  if (options.loadFormula) {
    h.context.globalThis = h.context;
    h.load('vendor/temml/temml.js');
    h.load('src/formula.js');
  }
  h.load('src/adapters.js');
  const realAdapters = h.context.ObsidianPrismAdapters;
  h.context.ObsidianPrismAdapters = {
    ...realAdapters,
    forHost: () => fakeAdapter,
    isOwned: n => Boolean(n && n.getAttribute && n.getAttribute('data-op-owned') !== null),
    textOf: options.textOf || (n => (n && n.textContent) || 'Sample turn text'),
    visibleText: n => (n && n.textContent) || 'Sample turn text',
    cleanTurnText: options.cleanTurnText || ((n, opts) => realAdapters.cleanTurnText(n, opts)),
    estimateTurnTokens: options.estimateTurnTokens || (n => realAdapters.estimateTurnTokens(n))
  };
  h.load('src/content.js');
  return {
    h, elements, body, makeEl,
    runtime: h.context.ObsidianPrismRuntime,
    setModel(label) { currentModel = label; },
    setAttachments(list) { currentAttachments = list; },
    setHome(flag) { homeMode = Boolean(flag); },
    setCodeBlocks(list) { currentCodeBlocks = list; },
    setStreaming(flag) { streamingNow = Boolean(flag); },
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
  assert.equal(e.scrim.getAttribute('data-op-composer-overlaid'), 'true');
  assert.equal(e.scrim.getAttribute('data-op-composer-scrim'), null);
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
  assert.equal(e.scrim.getAttribute('data-op-composer-overlaid'), null);
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

  // Restore prism palette and disable composerRestyle: composer/add/model/toolbar/slot/primary/attachment/chip clear, code/dock marks remain.
  await h.schema.callApi(h.api.storage.local, 'set', { [h.schema.STORAGE_KEY]: { ...h.schema.DEFAULT_CONFIG, enabled: true, palette: 'obsidian', themeMode: 'dark', composerRestyle: false } });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(e.codeSurface.getAttribute('data-op-code-surface'), 'true');
  assert.equal(e.scrim.getAttribute('data-op-composer-overlaid'), 'true');
  assert.equal(e.scrim.getAttribute('data-op-composer-scrim'), null);
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
  assert.equal(e.scrim.getAttribute('data-op-composer-overlaid'), null);
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
  const ctx = createRuntimeDom({ themeMode: 'dark', palette: 'obsidian', composerRestyle: true }, { host: 'gemini', isHome: true });
  await new Promise(resolve => setTimeout(resolve, 20));
  const e = Object.fromEntries(ctx.elements);

  assert.equal(e.docEl.getAttribute('data-op-home'), 'true');
  assert.equal(e.scrim.getAttribute('data-op-composer-backdrop'), 'true');
  assert.equal(e.scrim.getAttribute('data-op-composer-dock'), null);
  assert.equal(e.scrim.getAttribute('data-op-composer-overlaid'), null);
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
  assert.equal(e.scrim.getAttribute('data-op-composer-overlaid'), 'true');
  assert.equal(e.scrim.getAttribute('data-op-composer-scrim'), 'true');
  assert.equal(e.spacer.getAttribute('data-op-thread-spacer'), 'true');

  ctx.setHome(true);
  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', {
    [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'obsidian', themeMode: 'dark', contentWidth: 'standard' }
  });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(e.docEl.getAttribute('data-op-home'), 'true');
  assert.equal(e.scrim.getAttribute('data-op-composer-dock'), null);
  assert.equal(e.scrim.getAttribute('data-op-composer-overlaid'), null);
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

test('v0.4.0 #27: runtime prunes orphan roots, hands over singleton ownership without clobbering new owner, and removes data-op-instance on stop', async () => {
  const ctx = createRuntimeDom({ contentWidth: 'full' });
  const docEl = ctx.elements.get('docEl');
  const body = ctx.elements.get('body');
  const primary = ctx.elements.get('primary');
  reflectInlineStyle(docEl);

  // Track MutationObservers on docEl and window listeners for real handover verification.
  const moInstances = [];
  const docElObservers = new Set();
  const winListeners = new Map();
  ctx.h.context.addEventListener = (type, fn) => {
    if (!winListeners.has(type)) winListeners.set(type, new Set());
    winListeners.get(type).add(fn);
  };
  ctx.h.context.removeEventListener = (type, fn) => { winListeners.get(type)?.delete(fn); };
  ctx.h.context.MutationObserver = class {
    constructor(cb) {
      this.cb = cb;
      this.targets = [];
      this.disconnected = false;
      moInstances.push(this);
    }
    observe(target, opts) {
      this.disconnected = false;
      this.targets.push({ target, opts });
      if (target === docEl) docElObservers.add(this);
    }
    disconnect() {
      this.disconnected = true;
      docElObservers.delete(this);
    }
  };
  const origSetAttr = docEl.setAttribute.bind(docEl);
  docEl.setAttribute = (k, v) => {
    const prev = docEl.getAttribute(k);
    origSetAttr(k, v);
    if (prev !== String(v)) {
      for (const mo of [...docElObservers]) {
        mo.cb([{ type: 'attributes', target: docEl, attributeName: k }]);
      }
    }
  };

  // Pre-seed orphan nodes before a new runtime boots (reset state by loading a fresh runtime below).
  ctx.runtime.stop();
  delete ctx.h.context.ObsidianPrismRuntime;

  const makeOrphan = (tag, id, cls) => {
    const n = ctx.h.context.document.createElement(tag);
    n.id = id;
    n.className = cls;
    n.setAttribute('data-op-owned', '');
    return n;
  };
  const orphanDock1 = makeOrphan('aside', 'op-bottom-dock', 'op-dock');
  const orphanDock2 = makeOrphan('aside', 'op-stale-dock', 'op-dock');
  const orphanRail = makeOrphan('aside', 'op-rail-root', 'op-rail');
  const orphanAmbient = makeOrphan('div', 'op-ambient-stage', 'op-ambient');
  body.append(orphanDock1, orphanDock2, orphanRail);
  primary.append(orphanAmbient);

  // Add document.querySelectorAll so pruneOrphanRoots exercises full selector query path too.
  ctx.h.context.document.querySelectorAll = sel => {
    const out = [];
    for (const part of sel.split(',').map(s => s.trim()).filter(Boolean)) {
      const simple = part.replace(/\[[^\]]+\]/g, '');
      for (const root of [body, primary]) {
        for (const node of root.querySelectorAll(simple)) {
          if (!out.includes(node) && (!part.includes('[data-op-owned]') || node.hasAttribute('data-op-owned'))) out.push(node);
        }
      }
    }
    return out;
  };

  ctx.h.load('src/content.js');
  await new Promise(resolve => setTimeout(resolve, 25));

  const runtime1 = ctx.h.context.ObsidianPrismRuntime;
  const runtime1PageHide = [...(winListeners.get('pagehide') || [])];
  assert.equal(runtime1PageHide.length, 1, 'runtime1 registered one pagehide listener');
  const instance1 = docEl.getAttribute('data-op-instance');
  assert.ok(instance1 && instance1.startsWith('op-'), `activation sets unique data-op-instance, got "${instance1}"`);
  assert.equal(orphanDock1.isConnected, false, 'pre-seeded orphan #op-bottom-dock is pruned');
  assert.equal(orphanDock2.isConnected, false, 'pre-seeded orphan .op-dock[data-op-owned] is pruned');
  assert.equal(orphanRail.isConnected, false, 'pre-seeded orphan #op-rail-root is pruned');
  assert.equal(orphanAmbient.isConnected, false, 'pre-seeded orphan #op-ambient-stage is pruned');
  assert.equal(body.querySelectorAll('#op-bottom-dock').length, 1);
  assert.equal(body.querySelectorAll('#op-rail-root').length, 1);
  assert.equal(primary.querySelectorAll('#op-ambient-stage').length, 1);

  const dock1 = body.querySelector('#op-bottom-dock');
  const rail1 = body.querySelector('#op-rail-root');
  const ambient1 = primary.querySelector('#op-ambient-stage');

  // Inject second runtime instance (simulating extension reload / re-injection).
  delete ctx.h.context.ObsidianPrismRuntime;
  ctx.h.load('src/content.js');
  await new Promise(resolve => setTimeout(resolve, 25));

  const runtime2 = ctx.h.context.ObsidianPrismRuntime;
  const instance2 = docEl.getAttribute('data-op-instance');
  assert.ok(instance2 && instance2 !== instance1, 'second runtime claims a distinct data-op-instance');
  assert.equal(dock1.isConnected, false, 'old dock1 is pruned');
  assert.equal(rail1.isConnected, false, 'old rail1 is pruned');
  assert.equal(ambient1.isConnected, false, 'old ambient1 is pruned');
  assert.equal(body.querySelectorAll('#op-bottom-dock').length, 1, 'strictly 1 dock remains');
  assert.equal(body.querySelectorAll('#op-rail-root').length, 1, 'strictly 1 rail remains');
  assert.equal(primary.querySelectorAll('#op-ambient-stage').length, 1, 'strictly 1 ambient remains');

  // Old runtime yielded cleanly without removing new owner's DOM, root attrs, or CSS vars.
  assert.equal(runtime1.diagnostics().enabled, false);
  assert.equal(runtime1.diagnostics().observing, false);
  assert.equal(runtime1.diagnostics().pending, false);
  assert.equal(winListeners.get('pagehide')?.size, 1, 'yielded runtime1 removed its window pagehide listener');
  assert.equal(winListeners.get('pagehide')?.has(runtime1PageHide[0]), false, 'only runtime2 pagehide listener stays active');
  assert.equal(runtime2.diagnostics().enabled, true);
  assert.equal(runtime2.diagnostics().observing, true);
  assert.equal(docEl.getAttribute('data-op-enabled'), 'true');
  assert.equal(docEl.style.getPropertyValue('--op-reading-width'), '1124px');

  // Zero observer ping-pong after handover.
  const passesBefore = runtime2.diagnostics().passes;
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(runtime2.diagnostics().passes, passesBefore, 'no observer loop after ownership handover');

  // Calling stop() or invoking old runtime1's pagehide handler must NEVER disturb the new owner!
  runtime1.stop();
  runtime1PageHide[0]();
  assert.equal(docEl.getAttribute('data-op-instance'), instance2);
  assert.equal(body.querySelectorAll('#op-bottom-dock').length, 1);
  assert.equal(docEl.getAttribute('data-op-enabled'), 'true');
  assert.equal(docEl.style.getPropertyValue('--op-reading-width'), '1124px');

  // Stopping the active owner removes data-op-instance and root variables without style="" residue.
  runtime2.stop();
  assert.equal(docEl.getAttribute('data-op-instance'), null);
  assert.equal(docEl.style.getPropertyValue('--op-dock-offset-x'), '');
  assert.equal(docEl.style.getPropertyValue('--op-dock-offset-y'), '');
  assert.equal(docEl.getAttribute('style'), null);
});

test('v0.4.0 #27: runtime wires syncDockAvoidance and syncDockPopoverPosition without timers and clears offsets cleanly', async () => {
  const ctx = createRuntimeDom({ contentWidth: 'full' });
  const docEl = ctx.elements.get('docEl');
  const body = ctx.elements.get('body');
  const composer = ctx.elements.get('composer');
  reflectInlineStyle(docEl);

  const realAdapters = ctx.h.context.ObsidianPrismAdapters;
  let fakeCorners = [{ left: 1232, right: 1264, top: 852, bottom: 884, width: 32, height: 32 }];
  const fakeComposerRect = { left: 280, right: 1200, top: 730, bottom: 874, width: 920, height: 144 };
  const fakeRailRect = { left: 1232, right: 1268, top: 288, bottom: 720, width: 36, height: 432 };

  // Customize createElement so newly created dock/rail/popover report realistic sizes.
  const origCreate = ctx.h.context.document.createElement;
  ctx.h.context.document.createElement = tag => {
    const el = origCreate(tag);
    el.getBoundingClientRect = () => {
      if (el.id === 'op-bottom-dock') return { left: 1040, top: 844, right: 1260, bottom: 882, width: 220, height: 38 };
      if (el.id === 'op-rail-root') return fakeRailRect;
      if (el.className === 'op-vial-popover') {
        const dock = body.querySelector('#op-bottom-dock');
        const below = dock?.getAttribute('data-op-popover-side') === 'below';
        const shifted = Boolean(dock?.style?.getPropertyValue('--op-vial-popover-shift-x'));
        if (!below) return { left: shifted ? 8 : -12, right: shifted ? 298 : 278, top: -40, bottom: 200, width: 290, height: 240 };
        return { left: shifted ? 8 : -12, right: shifted ? 298 : 278, top: 60, bottom: 300, width: 290, height: 240 };
      }
      return { left: 0, top: 0, right: 100, bottom: 38, width: 100, height: 38 };
    };
    return el;
  };
  composer.getBoundingClientRect = () => fakeComposerRect;

  // Replace runtime with a fresh one using our cornerFloatingObstacles hook.
  ctx.runtime.stop();
  delete ctx.h.context.ObsidianPrismRuntime;
  const baseAdapter = realAdapters.forHost('chatgpt');
  ctx.h.context.ObsidianPrismAdapters = {
    ...realAdapters,
    forHost: () => ({
      ...baseAdapter,
      cornerFloatingObstacles: () => fakeCorners
    })
  };
  ctx.h.load('src/content.js');
  await new Promise(resolve => setTimeout(resolve, 25));

  // Should lift above composer (882 - (730 - 10) = 162) AND shift left of tall rail (1260 - (1232 - 10) = 38).
  assert.equal(docEl.style.getPropertyValue('--op-dock-offset-x'), '38px');
  assert.equal(docEl.style.getPropertyValue('--op-dock-offset-y'), '162px');

  // Open Context Vial popover: clips at top (-40) and left (-12), so flips below and shifts right (+20px).
  const dock = body.querySelector('#op-bottom-dock');
  const pill = dock.querySelector('.op-vial-pill');
  const popover = dock.querySelector('.op-vial-popover');
  pill.dispatchEvent({ type: 'click', isTrusted: true });
  assert.equal(popover.hidden, false);
  assert.equal(dock.getAttribute('data-op-popover-side'), 'below');
  assert.equal(dock.style.getPropertyValue('--op-vial-popover-shift-x'), '20px');

  // Closing popover clears placement attribute and shift var.
  pill.dispatchEvent({ type: 'click', isTrusted: true });
  assert.equal(popover.hidden, true);
  assert.equal(dock.getAttribute('data-op-popover-side'), null);
  assert.equal(dock.style.getPropertyValue('--op-vial-popover-shift-x'), '');

  // Clearing obstacles removes root offset vars cleanly.
  fakeCorners = [];
  composer.getBoundingClientRect = () => ({ left: 200, right: 900, top: 730, bottom: 874, width: 700, height: 144 });
  ctx.h.context.ObsidianPrismRuntime.refresh();
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(docEl.style.getPropertyValue('--op-dock-offset-x'), '');
  assert.equal(docEl.style.getPropertyValue('--op-dock-offset-y'), '');

  ctx.h.context.ObsidianPrismRuntime.stop();
  assert.equal(docEl.getAttribute('style'), null);
});

test('v0.4.0 handover: same-realm double-injection keeps active marks flicker-free, drops stale marks, preserves host values, and leaves zero residue on disable/Native Palette/stop', async () => {
  const ctx = createRuntimeDom({ contentWidth: 'full' });
  const docEl = ctx.elements.get('docEl');
  const body = ctx.elements.get('body');
  const primary = ctx.elements.get('primary');
  const composer = ctx.elements.get('composer');
  const gridEl = ctx.elements.get('gridEl');
  const trailingEl = ctx.elements.get('trailingEl');
  const scrim = ctx.elements.get('scrim');
  const codeSurface = ctx.elements.get('codeSurface');
  const threadCol = ctx.elements.get('threadCol');
  const addBtn = ctx.elements.get('addBtn');
  const modelBtn = ctx.elements.get('modelBtn');
  const modelSlotEl = ctx.elements.get('modelSlotEl');
  const primaryActionBtn = ctx.elements.get('primaryActionBtn');
  const composerAttachment = ctx.elements.get('composerAttachment');
  const chip = ctx.elements.get('chip');
  reflectInlineStyle(docEl);

  // Connect nodes inside body/primary so document.querySelectorAll scans the real tree.
  const staleNode = ctx.h.context.document.createElement('div');
  staleNode.setAttribute('data-op-code-surface', 'true');
  const hostValueNode = ctx.h.context.document.createElement('div');
  hostValueNode.setAttribute('data-op-composer-surface', 'fixture-original');
  trailingEl.append(addBtn, modelSlotEl, modelBtn, primaryActionBtn);
  gridEl.append(trailingEl);
  composer.append(gridEl, composerAttachment, chip);
  scrim.append(composer);
  primary.append(threadCol, scrim, codeSurface, staleNode, hostValueNode);
  body.append(primary);
  docEl.append(body);

  // Support [attr="val"] queries on document so adoptHandoverSurfaceMarks exercises real querySelectorAll.
  ctx.h.context.document.querySelectorAll = sel => {
    const out = [];
    const matchNode = (node, part) => {
      const attrs = [...part.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)];
      const tag = part.replace(/\[[^\]]+\]/g, '').replace(/[#.].*$/, '').trim();
      if (tag && node.tagName.toLowerCase() !== tag.toLowerCase()) return false;
      if (part.startsWith('#') && node.id !== part.slice(1).replace(/\[.*$/, '')) return false;
      if (part.startsWith('.') && !String(node.className || '').split(/\s+/).includes(part.slice(1).replace(/\[.*$/, ''))) return false;
      return attrs.every(([, name, val]) => val === undefined ? node.hasAttribute(name) : node.getAttribute(name) === val);
    };
    const walk = (node, part) => {
      if (matchNode(node, part) && !out.includes(node)) out.push(node);
      for (const child of node.children || []) walk(child, part);
    };
    for (const part of sel.split(',').map(s => s.trim()).filter(Boolean)) {
      walk(docEl, part);
    }
    return out;
  };

  // Pre-seed runtime1 with an extra dock offset & dock clearance to confirm all 5 runtime root vars adopt cleanly.
  await new Promise(resolve => setTimeout(resolve, 25));
  docEl.style.setProperty('--op-dock-clearance', '24px');
  docEl.style.setProperty('--op-dock-offset-x', '38px');
  docEl.style.setProperty('--op-dock-offset-y', '162px');

  assert.equal(composer.getAttribute('data-op-composer-surface'), 'true');
  assert.equal(gridEl.getAttribute('data-op-composer-grid'), 'true');
  assert.equal(trailingEl.getAttribute('data-op-composer-toolbar'), 'true');
  assert.equal(primaryActionBtn.getAttribute('data-op-composer-primary-action'), 'true');
  assert.equal(primary.getAttribute('data-op-main-surface'), 'true');
  assert.equal(scrim.getAttribute('data-op-composer-dock'), 'true');
  assert.equal(scrim.getAttribute('data-op-composer-overlaid'), 'true');
  assert.equal(scrim.getAttribute('data-op-composer-scrim'), null);

  // Spy on removeAttribute / removeProperty during handover to guarantee zero flicker on active marks/vars.
  const flickerEvents = [];
  const origComposerRemove = composer.removeAttribute.bind(composer);
  composer.removeAttribute = name => { flickerEvents.push(`composer.remove:${name}`); origComposerRemove(name); };
  const origPrimaryRemove = primary.removeAttribute.bind(primary);
  primary.removeAttribute = name => { flickerEvents.push(`primary.remove:${name}`); origPrimaryRemove(name); };
  const origRemoveProp = docEl.style.removeProperty.bind(docEl.style);
  docEl.style.removeProperty = name => {
    if (name === '--op-reading-width' || name === '--op-reading-shift') flickerEvents.push(`style.remove:${name}`);
    origRemoveProp(name);
  };

  // Second instance takes over (same-realm double injection).
  delete ctx.h.context.ObsidianPrismRuntime;
  ctx.h.load('src/content.js');
  await new Promise(resolve => setTimeout(resolve, 25));

  assert.deepEqual(flickerEvents, [], 'active marks and reading-width root vars must never be removed & re-added during handover');
  assert.equal(staleNode.getAttribute('data-op-code-surface'), null, 'stale mark from previous instance is removed immediately');
  assert.equal(hostValueNode.getAttribute('data-op-composer-surface'), 'fixture-original', 'genuine non-true host attribute value is preserved');
  assert.equal(composer.getAttribute('data-op-composer-surface'), 'true');
  assert.equal(docEl.style.getPropertyValue('--op-reading-width'), '1124px');

  // Native Palette ('host') after handover clears all visual marks (must not retain "true" as original!).
  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', { [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'host', themeMode: 'dark' } });
  await new Promise(resolve => setTimeout(resolve, 15));
  for (const [node, attr] of [
    [composer, 'data-op-composer-surface'],
    [gridEl, 'data-op-composer-grid'],
    [trailingEl, 'data-op-composer-toolbar'],
    [primaryActionBtn, 'data-op-composer-primary-action'],
    [scrim, 'data-op-composer-dock'],
    [scrim, 'data-op-composer-scrim'],
    [codeSurface, 'data-op-code-surface']
  ]) {
    assert.equal(node.getAttribute(attr), null, `Native Palette after handover clears ${attr}`);
  }
  assert.equal(hostValueNode.getAttribute('data-op-composer-surface'), 'fixture-original');

  // Re-enable prism palette then disable extension -> ALL runtime surface attrs and root vars clear cleanly!
  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', { [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'obsidian', themeMode: 'dark', contentWidth: 'full' } });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(composer.getAttribute('data-op-composer-surface'), 'true');
  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', { [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: false, palette: 'obsidian', themeMode: 'dark', contentWidth: 'full' } });
  await new Promise(resolve => setTimeout(resolve, 15));

  const SURFACE_ATTRS = [
    'data-op-main-surface', 'data-op-thread-column', 'data-op-composer-column', 'data-op-code-surface',
    'data-op-code-header', 'data-op-code-icon-fill', 'data-op-code-icon-stroke',
    'data-op-composer-dock', 'data-op-composer-overlaid', 'data-op-composer-scrim', 'data-op-thread-scroller', 'data-op-scroller-fade',
    'data-op-composer-empty-sibling', 'data-op-composer-disclaimer', 'data-op-thread-spacer',
    'data-op-composer-surface', 'data-op-composer-grid', 'data-op-composer-header-empty', 'data-op-composer-leading', 'data-op-composer-primary',
    'data-op-composer-trailing', 'data-op-composer-toolbar', 'data-op-composer-add', 'data-op-model-capsule',
    'data-op-model-capsule-item', 'data-op-composer-primary-action', 'data-op-composer-attachment',
    'data-op-composer-chip', 'data-op-composer-backdrop', 'data-op-sidebar-surface', 'data-op-sidebar-active', 'data-op-sidebar-active-tile'
  ];
  for (const attr of SURFACE_ATTRS) {
    assert.equal(ctx.h.context.document.querySelectorAll(`[${attr}="true"]`).length, 0, `disable after handover leaves zero [${attr}="true"]`);
  }
  for (const v of ['--op-reading-width', '--op-reading-shift', '--op-dock-clearance', '--op-scroller-fade-start', '--op-scroller-fade-end', '--op-dock-offset-x', '--op-dock-offset-y']) {
    assert.equal(docEl.style.getPropertyValue(v), '', `disable after handover clears ${v}`);
  }
  assert.equal(docEl.getAttribute('style'), null, 'disable after handover leaves no style="" residue');

  // Re-enable -> double-inject again -> stop() also leaves zero residue.
  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', { [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'obsidian', themeMode: 'dark', contentWidth: 'full' } });
  await new Promise(resolve => setTimeout(resolve, 15));
  delete ctx.h.context.ObsidianPrismRuntime;
  ctx.h.load('src/content.js');
  await new Promise(resolve => setTimeout(resolve, 25));
  ctx.h.context.ObsidianPrismRuntime.stop();
  for (const attr of SURFACE_ATTRS) {
    assert.equal(ctx.h.context.document.querySelectorAll(`[${attr}="true"]`).length, 0, `stop() after handover leaves zero [${attr}="true"]`);
  }
  for (const v of ['--op-reading-width', '--op-reading-shift', '--op-dock-clearance', '--op-scroller-fade-start', '--op-scroller-fade-end', '--op-dock-offset-x', '--op-dock-offset-y']) {
    assert.equal(docEl.style.getPropertyValue(v), '', `stop() after handover clears ${v}`);
  }
  assert.equal(docEl.getAttribute('style'), null, 'stop() after handover leaves no style="" residue');
});

test('v0.4.0 handover: isolated-world reload adopts DOM marks & root vars without shared JS state and clears cleanly', async () => {
  const ctx1 = createRuntimeDom({ contentWidth: 'full' });
  const docEl = ctx1.elements.get('docEl');
  const body = ctx1.elements.get('body');
  const primary = ctx1.elements.get('primary');
  const composer = ctx1.elements.get('composer');
  const scrim = ctx1.elements.get('scrim');
  reflectInlineStyle(docEl);
  scrim.append(composer);
  primary.append(scrim);
  body.append(primary);
  docEl.append(body);
  await new Promise(resolve => setTimeout(resolve, 25));

  assert.equal(composer.getAttribute('data-op-composer-surface'), 'true');
  assert.equal(docEl.style.getPropertyValue('--op-reading-width'), '1124px');

  // Create a completely separate isolated-world VM sharing only the DOM document and storage state.
  const ctx2 = harness({
    storage: { obsidianPrismWebConfig_v1: { enabled: true, themeMode: 'dark', palette: 'obsidian', composerRestyle: true, contentWidth: 'standard' } }
  });
  ctx2.context.document = ctx1.h.context.document;
  ctx2.context.window = ctx2.context;
  ctx2.context.addEventListener = () => {};
  ctx2.context.removeEventListener = () => {};
  ctx2.context.innerWidth = 1280;
  ctx2.context.innerHeight = 900;
  ctx2.context.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  ctx2.context.ResizeObserver = class { observe() {} disconnect() {} };
  ctx2.context.MutationObserver = class { observe() {} disconnect() {} };
  ctx2.context.requestAnimationFrame = () => 1;
  ctx2.context.cancelAnimationFrame = () => {};
  ctx2.context.performance = { now: () => 200 };
  ctx2.load('src/adapters.js');
  const real2 = ctx2.context.ObsidianPrismAdapters;
  ctx2.context.ObsidianPrismAdapters = {
    ...real2,
    forHost: () => ({
      host: 'chatgpt',
      usesOverlayScrim: false,
      usesScrollerAlphaFade: true,
      contentWidth: { native: 768, targets: [], composerTargets: [] },
      userTurns: () => [ctx1.elements.get('userTurn')],
      assistantTurns: () => [ctx1.elements.get('assistantTurn')],
      primarySurface: () => primary,
      composerSurface: () => composer,
      composerCardSurface: comp => comp,
      composerGrid: () => ({ element: ctx1.elements.get('gridEl'), slots: null, trailing: ctx1.elements.get('trailingEl') }),
      composerBackdropSurfaces: () => [scrim],
      composerScrimSurface: () => scrim,
      composerBelowSiblings: () => ({ empty: [], disclaimers: [] }),
      composerAddTrigger: () => ctx1.elements.get('addBtn'),
      modelSelectorTrigger: () => ctx1.elements.get('modelBtn'),
      modelCapsuleSlot: () => ctx1.elements.get('modelSlotEl'),
      composerPrimaryAction: () => ctx1.elements.get('primaryActionBtn'),
      composerAttachments: () => [],
      composerChips: () => [],
      codeSurfaces: () => [],
      codeHeaders: () => [],
      threadTailSpacers: () => [],
      threadColumns: () => [],
      composerColumns: () => [],
      visibleAttachments: () => [],
      activeModelLabel: () => 'ChatGPT 5.2',
      sidebarSurfaces: () => [],
      sidebarActiveTargets: () => [],
      codeBlocks: () => [],
      thoughtBlocks: () => [],
      isAssistantNode: () => false,
      isStreaming: () => false,
      scrollContainer: () => body
    })
  };
  ctx2.load('src/content.js');
  await new Promise(resolve => setTimeout(resolve, 25));

  // Even when incoming world switches directly to standard, adopted --op-reading-width/--op-reading-shift from prior world are cleared!
  assert.equal(docEl.style.getPropertyValue('--op-reading-width'), '');
  assert.equal(docEl.style.getPropertyValue('--op-reading-shift'), '');
  assert.equal(composer.getAttribute('data-op-composer-surface'), 'true');

  ctx2.context.ObsidianPrismRuntime.stop();
  assert.equal(composer.getAttribute('data-op-composer-surface'), null);
  assert.equal(scrim.getAttribute('data-op-composer-dock'), null);
  assert.equal(primary.getAttribute('data-op-main-surface'), null);
  assert.equal(docEl.getAttribute('data-op-instance'), null);
  assert.equal(docEl.getAttribute('data-op-enabled'), null);
  assert.equal(docEl.style.getPropertyValue('--op-reading-width'), '');
  assert.equal(docEl.style.getPropertyValue('--op-dock-offset-x'), '');
  assert.equal(docEl.getAttribute('style'), null);
});

test('v0.4.1 compact composer: marks empty header wrappers reversibly, detects wrapped overlaid dock, and guards sidebar against wrapping composer', async () => {
  const emptyHeaders = [];
  const ctx = createRuntimeDom({}, { host: 'chatgpt', emptyHeaders });
  const gridEl = ctx.elements.get('gridEl');
  const docEl = ctx.elements.get('docEl');
  const primary = ctx.elements.get('primary');
  const composer = ctx.elements.get('composer');

  const emptyHeader = {
    nodeType: 1, tagName: 'DIV', isConnected: true, parentElement: gridEl, children: [], childNodes: [], textContent: '   ',
    attributesMap: new Map(),
    getAttribute(k) { return this.attributesMap.get(k) ?? null; },
    setAttribute(k, v) { this.attributesMap.set(k, String(v)); },
    removeAttribute(k) { this.attributesMap.delete(k); },
    hasAttribute(k) { return this.attributesMap.has(k); },
    matches() { return false; },
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains(t) { return t === this; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 600, bottom: 10, width: 600, height: 10 }; }
  };
  gridEl.children.unshift(emptyHeader);
  emptyHeaders.push(emptyHeader);
  ctx.runtime.refresh();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(emptyHeader.getAttribute('data-op-composer-header-empty'), 'true');

  // Native Palette and stop() both clear data-op-composer-header-empty cleanly.
  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', { [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'host', themeMode: 'dark' } });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(emptyHeader.getAttribute('data-op-composer-header-empty'), null);

  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', { [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'obsidian', themeMode: 'dark' } });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(emptyHeader.getAttribute('data-op-composer-header-empty'), 'true');
  ctx.runtime.stop();
  assert.equal(emptyHeader.getAttribute('data-op-composer-header-empty'), null);

  // Adapter checks: wrapped sticky ancestor inside scroller + findSidebars guard against wrapping primary/composer.
  const adapters = ctx.h.context.ObsidianPrismAdapters;
  const scroller = { nodeType: 1, contains: n => n === stickyWrap || n === dockNode };
  const stickyWrap = { nodeType: 1, parentElement: scroller, ownerDocument: docEl.ownerDocument };
  const dockNode = { nodeType: 1, parentElement: stickyWrap, ownerDocument: docEl.ownerDocument };
  const fakeView = { getComputedStyle: el => ({ position: el === stickyWrap ? 'sticky' : 'relative' }) };
  assert.equal(adapters.isComposerDockOverlaid(dockNode, scroller, fakeView), true, 'detects sticky wrapper ancestor inside scroller');

  const inFlowWrap = { nodeType: 1, parentElement: scroller, ownerDocument: docEl.ownerDocument };
  const inFlowDock = { nodeType: 1, parentElement: inFlowWrap, ownerDocument: docEl.ownerDocument };
  const staticView = { getComputedStyle: () => ({ position: 'relative' }) };
  assert.equal(adapters.isComposerDockOverlaid(inFlowDock, scroller, staticView), false, 'keeps in-flow wrapper false');

  // Sidebar guard: an outer sidebar selector matching an ancestor of primary/composer is excluded.
  const fakeDoc = ctx.h.context.document;
  const oldQsa = fakeDoc.querySelectorAll;
  const outerWrapper = {
    nodeType: 1, isConnected: true, attributesMap: new Map(),
    getAttribute(k) { return this.attributesMap.get(k) ?? null; },
    closest() { return null; },
    querySelectorAll() { return []; },
    contains(n) { return n === primary || n === composer; }
  };
  fakeDoc.querySelectorAll = sel => sel.includes('#stage-slideover-sidebar') ? [outerWrapper] : oldQsa.call(fakeDoc, sel);
  assert.deepEqual(adapters.forHost('chatgpt', fakeDoc).sidebarSurfaces(), [], 'sidebarSurfaces rejects any container wrapping primary or composer');
  fakeDoc.querySelectorAll = oldQsa;
});

test('v0.4.1 #30: ChatGPT skips data-op-composer-scrim, sets safe Alpha fade only on independent scrollers, and clears cleanly', async () => {
  const makeScroller = rect => ({
    nodeType: 1, tagName: 'DIV', isConnected: true, children: [], childNodes: [],
    attributesMap: new Map(),
    getAttribute(k) { return this.attributesMap.get(k) ?? null; },
    setAttribute(k, v) { this.attributesMap.set(k, String(v)); },
    removeAttribute(k) { this.attributesMap.delete(k); },
    hasAttribute(k) { return this.attributesMap.has(k); },
    append(...nodes) { for (const n of nodes) { if (n) { n.parentElement = this; this.children.push(n); } } },
    contains(t) { return t === this || this.children.some(c => c.contains?.(t)); },
    getBoundingClientRect() { return rect; }
  });

  // 1) In-flow independent ChatGPT scroller: gets data-op-scroller-fade, leaves fade vars cleared (CSS 24px/0px defaults).
  {
    const styles = new Map();
    const scroller = makeScroller({ left: 0, top: 52, right: 1280, bottom: 740, width: 1280, height: 688 });
    const ctx = createRuntimeDom({}, {
      host: 'chatgpt',
      useCustomScroller: true,
      scroller,
      getComputedStyle: el => styles.get(el) || { position: 'relative', paddingBottom: '0px' }
    });
    const e = Object.fromEntries(ctx.elements);
    reflectInlineStyle(e.docEl);
    e.scrim.getBoundingClientRect = () => ({ left: 0, top: 740, right: 1280, bottom: 900, width: 1280, height: 160 });
    ctx.runtime.refresh();
    await new Promise(resolve => setTimeout(resolve, 190));

    assert.equal(scroller.getAttribute('data-op-scroller-fade'), 'true');
    assert.equal(e.scrim.getAttribute('data-op-composer-overlaid'), null);
    assert.equal(e.scrim.getAttribute('data-op-composer-scrim'), null);
    assert.equal(e.docEl.style.getPropertyValue('--op-scroller-fade-start'), '');
    assert.equal(e.docEl.style.getPropertyValue('--op-scroller-fade-end'), '');

    // Switching to Native Palette clears data-op-scroller-fade.
    await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', { [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'host', themeMode: 'dark' } });
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(scroller.getAttribute('data-op-scroller-fade'), null);

    await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', { [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'obsidian', themeMode: 'dark' } });
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(scroller.getAttribute('data-op-scroller-fade'), 'true');
    ctx.runtime.stop();
    assert.equal(scroller.getAttribute('data-op-scroller-fade'), null);
    assert.equal(e.docEl.getAttribute('style'), null);
  }

  // 2) Overlaid sibling dock on ChatGPT: sets data-op-composer-overlaid + fade-start/end + clearance, NO data-op-composer-scrim.
  {
    const styles = new Map();
    const scroller = makeScroller({ left: 0, top: 52, right: 1280, bottom: 900, width: 1280, height: 848 });
    const ctx = createRuntimeDom({}, {
      host: 'chatgpt',
      useCustomScroller: true,
      scroller,
      getComputedStyle: el => styles.get(el) || { position: 'absolute', paddingBottom: '24px' }
    });
    const e = Object.fromEntries(ctx.elements);
    reflectInlineStyle(e.docEl);
    e.scrim.getBoundingClientRect = () => ({ left: 0, top: 780, right: 1280, bottom: 900, width: 1280, height: 120 });
    ctx.runtime.refresh();
    await new Promise(resolve => setTimeout(resolve, 190));

    assert.equal(e.scrim.getAttribute('data-op-composer-overlaid'), 'true');
    assert.equal(e.scrim.getAttribute('data-op-composer-scrim'), null, 'ChatGPT overlaid dock never gets data-op-composer-scrim');
    assert.equal(scroller.getAttribute('data-op-thread-scroller'), 'true');
    assert.equal(scroller.getAttribute('data-op-scroller-fade'), 'true');
    assert.equal(e.docEl.style.getPropertyValue('--op-scroller-fade-start'), '120px');
    assert.equal(e.docEl.style.getPropertyValue('--op-scroller-fade-end'), '96px');
    assert.notEqual(e.docEl.style.getPropertyValue('--op-dock-clearance'), '');

    ctx.runtime.stop();
    assert.equal(e.scrim.getAttribute('data-op-composer-overlaid'), null);
    assert.equal(scroller.getAttribute('data-op-scroller-fade'), null);
    assert.equal(e.docEl.style.getPropertyValue('--op-scroller-fade-start'), '');
    assert.equal(e.docEl.style.getPropertyValue('--op-scroller-fade-end'), '');
    assert.equal(e.docEl.style.getPropertyValue('--op-dock-clearance'), '');
    assert.equal(e.docEl.getAttribute('style'), null);
  }

  // 3) ChatGPT sticky-in-scroller: scroller contains composer & dock -> skips data-op-scroller-fade, keeps overlaid clearance!
  {
    const styles = new Map();
    const scroller = makeScroller({ left: 0, top: 52, right: 1280, bottom: 900, width: 1280, height: 848 });
    const ctx = createRuntimeDom({}, {
      host: 'chatgpt',
      useCustomScroller: true,
      scroller,
      getComputedStyle: el => styles.get(el) || { position: 'sticky', paddingBottom: '0px' }
    });
    const e = Object.fromEntries(ctx.elements);
    reflectInlineStyle(e.docEl);
    e.scrim.append(e.composer);
    scroller.append(e.scrim);
    e.scrim.getBoundingClientRect = () => ({ left: 0, top: 770, right: 1280, bottom: 900, width: 1280, height: 130 });
    ctx.runtime.refresh();
    await new Promise(resolve => setTimeout(resolve, 190));

    assert.equal(e.scrim.getAttribute('data-op-composer-overlaid'), 'true');
    assert.equal(e.scrim.getAttribute('data-op-composer-scrim'), null);
    assert.equal(scroller.getAttribute('data-op-scroller-fade'), null, 'sticky-in-scroller must skip data-op-scroller-fade');
    assert.equal(scroller.getAttribute('data-op-thread-scroller'), null, 'sticky dock inside scroller must skip ::after clearance spacer');
    assert.equal(e.docEl.style.getPropertyValue('--op-dock-clearance'), '138px');
    assert.equal(e.docEl.style.getPropertyValue('--op-scroller-fade-start'), '');
    assert.equal(e.docEl.style.getPropertyValue('--op-scroller-fade-end'), '');

    ctx.runtime.stop();
    assert.equal(e.docEl.style.getPropertyValue('--op-dock-clearance'), '');
    assert.equal(e.docEl.getAttribute('style'), null);
  }

  // 4) Gemini overlaid dock: gets BOTH data-op-composer-overlaid and data-op-composer-scrim, never data-op-scroller-fade.
  {
    const styles = new Map();
    const scroller = makeScroller({ left: 0, top: 64, right: 1280, bottom: 900, width: 1280, height: 836 });
    const ctx = createRuntimeDom({}, {
      host: 'gemini',
      useCustomScroller: true,
      scroller,
      getComputedStyle: el => styles.get(el) || { position: 'absolute', paddingBottom: '24px' }
    });
    const e = Object.fromEntries(ctx.elements);
    e.scrim.getBoundingClientRect = () => ({ left: 0, top: 760, right: 1280, bottom: 900, width: 1280, height: 140 });
    ctx.runtime.refresh();
    await new Promise(resolve => setTimeout(resolve, 190));

    assert.equal(e.scrim.getAttribute('data-op-composer-overlaid'), 'true');
    assert.equal(e.scrim.getAttribute('data-op-composer-scrim'), 'true');
    assert.equal(scroller.getAttribute('data-op-scroller-fade'), null, 'Gemini never gets data-op-scroller-fade');
    ctx.runtime.stop();
  }
});

test('v0.4.1 #31: composerRestyle: false clears empty-sibling and disclaimer marks without altering DOM structure, while preserving dock/scrim/fade marks', async () => {
  const styles = new Map();
  const scroller = {
    nodeType: 1, tagName: 'DIV', isConnected: true, children: [], childNodes: [],
    attributesMap: new Map(),
    getAttribute(k) { return this.attributesMap.get(k) ?? null; },
    setAttribute(k, v) { this.attributesMap.set(k, String(v)); },
    removeAttribute(k) { this.attributesMap.delete(k); },
    hasAttribute(k) { return this.attributesMap.has(k); },
    contains(t) { return t === this; },
    getBoundingClientRect() { return { left: 0, top: 52, right: 1280, bottom: 720, width: 1280, height: 668 }; }
  };
  const ctx = createRuntimeDom({}, {
    host: 'chatgpt',
    withBelowSiblings: true,
    useCustomScroller: true,
    scroller,
    getComputedStyle: el => styles.get(el) || { position: 'relative', paddingBottom: '0px' }
  });
  const e = Object.fromEntries(ctx.elements);
  e.scrim.getBoundingClientRect = () => ({ left: 0, top: 720, right: 1280, bottom: 900, width: 1280, height: 180 });
  styles.set(e.scrim, { position: 'relative', paddingBottom: '0px' });
  ctx.runtime.refresh();
  await new Promise(resolve => setTimeout(resolve, 190));

  const snapshotDomOrder = () => ({
    primaryChildren: [...e.primary.children].filter(n => !n.hasAttribute?.('data-op-owned')),
    scrimParent: e.scrim.parentElement,
    scrimChildren: [...e.scrim.children].filter(n => !n.hasAttribute?.('data-op-owned')),
    composerParent: e.composer.parentElement,
    emptySiblingParent: e.emptySibling.parentElement,
    disclaimerParent: e.disclaimerSibling.parentElement
  });
  const initialOrder = snapshotDomOrder();

  assert.equal(e.docEl.getAttribute('data-op-composer'), 'true');
  assert.equal(e.composer.getAttribute('data-op-composer-surface'), 'true');
  assert.equal(e.emptySibling.getAttribute('data-op-composer-empty-sibling'), 'true');
  assert.equal(e.disclaimerSibling.getAttribute('data-op-composer-disclaimer'), 'true');
  assert.equal(e.scrim.getAttribute('data-op-composer-dock'), 'true');
  assert.equal(scroller.getAttribute('data-op-scroller-fade'), 'true');

  // Toggle composerRestyle: false -> clears empty-sibling, disclaimer, and composer surface marks; preserves dock, backdrop, and scroller fade; never mutates DOM tree order.
  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', {
    [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'obsidian', themeMode: 'dark', composerRestyle: false }
  });
  await new Promise(resolve => setTimeout(resolve, 15));

  assert.equal(e.docEl.getAttribute('data-op-composer'), 'false');
  assert.equal(e.composer.getAttribute('data-op-composer-surface'), 'host-orig');
  assert.equal(e.emptySibling.getAttribute('data-op-composer-empty-sibling'), null);
  assert.equal(e.disclaimerSibling.getAttribute('data-op-composer-disclaimer'), null);
  assert.equal(e.scrim.getAttribute('data-op-composer-dock'), 'true');
  assert.equal(e.scrim.getAttribute('data-op-composer-backdrop'), 'true');
  assert.equal(scroller.getAttribute('data-op-scroller-fade'), 'true');
  assert.deepEqual(snapshotDomOrder(), initialOrder, 'ADR-0002: parent/child/sibling order remains intact');

  // Re-enable composerRestyle: true -> restores marks cleanly.
  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', {
    [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'obsidian', themeMode: 'dark', composerRestyle: true }
  });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(e.docEl.getAttribute('data-op-composer'), 'true');
  assert.equal(e.emptySibling.getAttribute('data-op-composer-empty-sibling'), 'true');
  assert.equal(e.disclaimerSibling.getAttribute('data-op-composer-disclaimer'), 'true');

  ctx.runtime.stop();
  assert.deepEqual(snapshotDomOrder(), initialOrder, 'ADR-0002: stop() leaves DOM parent/child/sibling order intact');
});

test('v0.4.1 #33: syncSurfaces marks computed SVG fill/stroke code header icons reversibly and clears on host palette, disable, and stop', async () => {
  const styles = new Map();
  const ctx = createRuntimeDom({}, {
    host: 'gemini',
    getComputedStyle: el => styles.get(el) || { position: 'static', fill: '', stroke: '' }
  });
  const e = Object.fromEntries(ctx.elements);
  const makeIconEl = (tag, attrs = {}, computed = {}) => {
    const node = ctx.h.context.document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    styles.set(node, { position: 'static', ...computed });
    return node;
  };
  const filledSvg = makeIconEl('svg', { viewBox: '0 0 24 24' }, { fill: 'rgb(227, 227, 227)', stroke: 'none' });
  const filledPath = makeIconEl('path', { d: 'M5 5h14v14H5z' }, { fill: 'rgb(227, 227, 227)', stroke: 'none' });
  filledSvg.append(filledPath);

  const strokeSvg = makeIconEl('svg', { viewBox: '0 0 24 24' }, { fill: 'none', stroke: 'rgb(227, 227, 227)' });
  const strokePath = makeIconEl('path', { d: 'M4 12h16' }, { fill: 'none', stroke: 'rgb(227, 227, 227)' });
  strokeSvg.append(strokePath);

  const ownedSvg = makeIconEl('svg', { 'data-op-owned': 'true' }, { fill: 'rgb(227, 227, 227)', stroke: 'none' });
  e.codeHeader.append(filledSvg, strokeSvg, ownedSvg);

  ctx.runtime.refresh();
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(filledSvg.getAttribute('data-op-code-icon-fill'), 'true');
  assert.equal(filledPath.getAttribute('data-op-code-icon-fill'), 'true');
  assert.equal(filledSvg.getAttribute('data-op-code-icon-stroke'), null);
  assert.equal(filledPath.getAttribute('data-op-code-icon-stroke'), null);

  assert.equal(strokeSvg.getAttribute('data-op-code-icon-fill'), null);
  assert.equal(strokePath.getAttribute('data-op-code-icon-fill'), null);
  assert.equal(strokeSvg.getAttribute('data-op-code-icon-stroke'), 'true');
  assert.equal(strokePath.getAttribute('data-op-code-icon-stroke'), 'true');

  assert.equal(ownedSvg.getAttribute('data-op-code-icon-fill'), null);

  // Switch to Native Palette ('host'): icon marks clear cleanly.
  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', {
    [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'host', themeMode: 'dark' }
  });
  await new Promise(resolve => setTimeout(resolve, 15));
  for (const el of [filledSvg, filledPath, strokeSvg, strokePath]) {
    assert.equal(el.getAttribute('data-op-code-icon-fill'), null);
    assert.equal(el.getAttribute('data-op-code-icon-stroke'), null);
  }

  // Re-enable prism palette -> marks return; then disable extension -> marks clear.
  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', {
    [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'obsidian', themeMode: 'dark' }
  });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(filledSvg.getAttribute('data-op-code-icon-fill'), 'true');
  assert.equal(strokeSvg.getAttribute('data-op-code-icon-stroke'), 'true');

  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', {
    [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: false }
  });
  await new Promise(resolve => setTimeout(resolve, 15));
  for (const el of [filledSvg, filledPath, strokeSvg, strokePath]) {
    assert.equal(el.getAttribute('data-op-code-icon-fill'), null);
    assert.equal(el.getAttribute('data-op-code-icon-stroke'), null);
  }

  // Re-enable -> marks return; then stop() -> zero residue.
  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', {
    [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'obsidian', themeMode: 'dark' }
  });
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(filledSvg.getAttribute('data-op-code-icon-fill'), 'true');
  ctx.runtime.stop();
  for (const el of [filledSvg, filledPath, strokeSvg, strokePath]) {
    assert.equal(el.getAttribute('data-op-code-icon-fill'), null);
    assert.equal(el.getAttribute('data-op-code-icon-stroke'), null);
  }
});

test('v0.4.1 #34: runtime Formula Preview renders MathML, toggles losslessly, skips 48-line folding in preview, debounces streaming, keeps Native Palette & Context Vial, and leaves zero residue on stop', async () => {
  let codeBlocksRef = [];
  let surfacesRef = [];
  let headersRef = [];
  const ctx = createRuntimeDom({ language: 'zh-CN' }, {
    host: 'gemini',
    loadFormula: true,
    codeSurfaces: () => surfacesRef,
    codeHeaders: () => headersRef,
    textOf: node => node?.textContent || '',
    estimateTurnTokens: turn => {
      const text = turn.children.map(c => c.textContent || '').join('');
      return { prose: 10, code: text.length, total: 10 + text.length };
    }
  });
  const e = Object.fromEntries(ctx.elements);
  const makeNode = ctx.makeEl;

  // 1) Long 50-line LaTeX block inside Gemini wrapper
  const surface = makeNode('div', { class: 'code-block' });
  const header = makeNode('div', { class: 'code-block-decoration' });
  const label = makeNode('span'); label.textContent = 'Code snippet';
  const actions = makeNode('div');
  const copyBtn = makeNode('button', { 'aria-label': 'Copy' }); copyBtn.textContent = 'Copy';
  actions.append(copyBtn);
  header.append(label, actions);
  const internalWrap = makeNode('div', { class: 'formatted-code-block-internal-container' });
  const pre = makeNode('pre');
  const code = makeNode('code', { class: 'code-container formatted' });
  const latexLines = ['% 1. 目标函数', '\\mathcal{L}(\\theta) = \\frac{1}{N} \\sum_{i=1}^N (y_i - \\hat{y}_i)^2', ''];
  for (let i = 1; i <= 47; i++) latexLines.push(`x_{${i}} = ${i}`);
  const originalLatex = latexLines.join('\n');
  code.textContent = originalLatex;
  pre.append(code);
  internalWrap.append(pre);
  surface.append(header, internalWrap);
  e.assistantTurn.append(surface);

  // 2) Ordinary JS block
  const jsSurface = makeNode('div', { class: 'code-block' });
  const jsHeader = makeNode('div', { class: 'code-block-decoration' });
  const jsLabel = makeNode('span'); jsLabel.textContent = 'Code snippet';
  jsHeader.append(jsLabel);
  const jsPre = makeNode('pre');
  const jsCode = makeNode('code', { class: 'language-js' });
  jsCode.textContent = 'const a = 1;\nconsole.log(a);';
  jsPre.append(jsCode);
  jsSurface.append(jsHeader, jsPre);
  e.assistantTurn.append(jsSurface);

  surfacesRef = [surface, jsSurface];
  headersRef = [header, jsHeader];
  ctx.setCodeBlocks([pre, jsPre]);

  ctx.runtime.refresh();
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(ctx.runtime.diagnostics().formulaBlocks, 1);
  assert.equal(internalWrap.getAttribute('data-op-formula-source-hidden'), 'true');
  assert.equal(internalWrap.getAttribute('hidden'), null);
  assert.equal(internalWrap.getAttribute('aria-hidden'), null);
  assert.equal(pre.getAttribute('hidden'), null);
  assert.equal(pre.getAttribute('aria-hidden'), null);
  assert.equal(code.textContent, originalLatex);

  const preview = surface.querySelector('.op-formula-preview');
  assert.ok(preview, 'Formula Preview element should be rendered');
  assert.equal(preview.getAttribute('data-op-owned'), '');
  assert.ok(preview.querySelector('math'), 'Preview contains native <math>');
  assert.equal(preview.querySelector('.op-formula-caption').textContent, '1. 目标函数');
  assert.equal(jsSurface.querySelector('.op-formula-preview'), null, 'JS block must remain untouched');

  // Formula view skips 48-line folding
  assert.equal(surface.querySelector('.op-code-fold-bar'), null);
  assert.equal(pre.classList.contains('op-code-folded'), false);

  // Toggle button mounted inside header actions
  const toggleBtn = actions.querySelector('.op-formula-toggle');
  assert.ok(toggleBtn);
  assert.equal(toggleBtn.textContent, '源码');

  // Toggle to Source -> fold bar attaches; fold it -> toggle back to Formula -> unclipped; toggle back to Source -> fold state restored
  toggleBtn.dispatchEvent({ type: 'click' });
  assert.equal(internalWrap.getAttribute('data-op-formula-source-hidden'), null);
  assert.equal(preview.hidden, true);
  assert.equal(toggleBtn.textContent, '公式');

  const foldBar = surface.querySelector('.op-code-fold-bar');
  assert.ok(foldBar, 'Source view attaches 48-line fold bar');
  foldBar.dispatchEvent({ type: 'click' });
  assert.equal(pre.classList.contains('op-code-folded'), true);

  toggleBtn.dispatchEvent({ type: 'click' });
  assert.equal(pre.classList.contains('op-code-folded'), false, 'Formula view clears fold class');
  assert.equal(surface.querySelector('.op-code-fold-bar'), null, 'Formula view removes fold bar');

  toggleBtn.dispatchEvent({ type: 'click' });
  assert.equal(pre.classList.contains('op-code-folded'), true, 'Returning to Source restores prior fold state');

  // Toggle back to Formula, then test streaming debounce (~280ms)
  toggleBtn.dispatchEvent({ type: 'click' });
  ctx.setStreaming(true);
  code.textContent = '% 更新标题\n\\alpha + \\beta = \\gamma';
  ctx.runtime.refresh();
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(preview.querySelector('.op-formula-caption').textContent, '1. 目标函数', 'Streaming update debounces before re-rendering');
  await new Promise(resolve => setTimeout(resolve, 480));
  assert.equal(preview.querySelector('.op-formula-caption').textContent, '更新标题', 'Streaming update settles after debounce');
  ctx.setStreaming(false);

  // Native Palette ('host') keeps Formula Preview active
  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', {
    [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, palette: 'host', themeMode: 'dark' }
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(ctx.runtime.diagnostics().formulaBlocks, 1);
  assert.equal(internalWrap.getAttribute('data-op-formula-source-hidden'), 'true');

  // stop() cleans up everything with zero residue
  ctx.runtime.stop();
  assert.equal(ctx.runtime.diagnostics().formulaBlocks, 0);
  assert.equal(surface.querySelector('.op-formula-preview'), null);
  assert.equal(actions.querySelector('.op-formula-toggle'), null);
  assert.equal(internalWrap.getAttribute('data-op-formula-source-hidden'), null);
  assert.equal(code.textContent, '% 更新标题\n\\alpha + \\beta = \\gamma');
});

test('v0.4.1 #35: toggling formulaPreview false clears previews, toggles, bars, and streaming debounces while restoring Code Surface and 48-line fold bar; re-enabling restores Formula Preview', async () => {
  let surfacesRef = [];
  let headersRef = [];
  const ctx = createRuntimeDom({ language: 'zh-CN', formulaPreview: true }, {
    host: 'chatgpt',
    loadFormula: true,
    codeSurfaces: () => surfacesRef,
    codeHeaders: () => headersRef,
    textOf: node => node?.textContent || ''
  });
  const e = Object.fromEntries(ctx.elements);
  const makeNode = ctx.makeEl;

  // 1) Headerless bare <pre> LaTeX block (mounts .op-formula-bar)
  const bareWrap = makeNode('div', {});
  const barePre = makeNode('pre');
  const bareCode = makeNode('code', { class: 'language-latex' });
  bareCode.textContent = '% Bare formula\nE = mc^2';
  barePre.append(bareCode);
  bareWrap.append(barePre);
  e.assistantTurn.append(bareWrap);

  // 2) 50-line LaTeX block inside a headered code surface
  const surface = makeNode('div', { class: 'code-shell' });
  const header = makeNode('div', { class: 'code-shell-header' });
  header.append(makeNode('span'));
  header.firstChild.textContent = 'LaTeX';
  const actions = makeNode('div');
  const copyBtn = makeNode('button', { 'aria-label': 'Copy' }); copyBtn.textContent = 'Copy';
  actions.append(copyBtn);
  header.append(actions);
  const pre = makeNode('pre');
  const code = makeNode('code', { class: 'language-latex' });
  const lines = ['% 1. 长公式', 'a_0 = 1'];
  for (let i = 1; i <= 48; i++) lines.push(`a_{${i}} = \\frac{1}{${i}}`);
  code.textContent = lines.join('\n');
  pre.append(code);
  surface.append(header, pre);
  e.assistantTurn.append(surface);

  surfacesRef = [barePre, surface];
  headersRef = [header];
  ctx.setCodeBlocks([barePre, pre]);

  ctx.runtime.refresh();
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(ctx.h.context.document.documentElement.getAttribute('data-op-formula-preview'), 'true');
  assert.equal(ctx.runtime.diagnostics().formulaBlocks, 2);
  assert.ok(bareWrap.querySelector('.op-formula-bar'), 'headerless formula block creates .op-formula-bar');
  assert.equal(bareWrap.querySelector('.op-formula-bar').getAttribute('data-op-formula-bare'), 'true');
  assert.ok(bareWrap.querySelector('.op-formula-preview'), 'headerless formula block renders preview');
  assert.equal(bareWrap.querySelector('.op-formula-preview').getAttribute('data-op-formula-bare'), 'true');
  assert.ok(surface.querySelector('.op-formula-preview'), '50-line block renders preview');
  assert.equal(surface.querySelector('.op-formula-preview').getAttribute('data-op-formula-bare'), null);
  assert.equal(surface.querySelector('.op-code-fold-bar'), null, '50-line block skips fold bar in preview');

  // Start a streaming debounce on barePre, then turn formulaPreview off mid-debounce
  ctx.setStreaming(true);
  bareCode.textContent = '% Updated mid-stream\na^2 + b^2 = c^2';
  ctx.runtime.refresh();
  await new Promise(resolve => setTimeout(resolve, 40));

  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', {
    [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, formulaPreview: false }
  });
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(ctx.h.context.document.documentElement.getAttribute('data-op-formula-preview'), 'false');
  assert.equal(ctx.runtime.diagnostics().formulaBlocks, 0);
  assert.equal(bareWrap.querySelector('.op-formula-preview'), null);
  assert.equal(bareWrap.querySelector('.op-formula-toggle'), null);
  assert.equal(bareWrap.querySelector('.op-formula-bar'), null);
  assert.equal(barePre.getAttribute('data-op-formula-source-hidden'), null);
  assert.equal(surface.querySelector('.op-formula-preview'), null);
  assert.equal(actions.querySelector('.op-formula-toggle'), null);
  assert.equal(pre.getAttribute('data-op-formula-source-hidden'), null);

  const foldBar = surface.querySelector('.op-code-fold-bar');
  assert.ok(foldBar, 'turning formulaPreview off restores .op-code-fold-bar on 50-line block');
  assert.equal(pre.classList.contains('op-code-folded'), false);

  // Waiting past debounce window must NOT resurrect any cancelled streaming preview
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(ctx.runtime.diagnostics().formulaBlocks, 0);
  assert.equal(bareWrap.querySelector('.op-formula-preview'), null);
  ctx.setStreaming(false);

  // Fold while formulaPreview is false, then re-enable formulaPreview -> clears fold bar & restores Formula Preview
  foldBar.dispatchEvent({ type: 'click' });
  assert.equal(pre.classList.contains('op-code-folded'), true);

  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', {
    [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, formulaPreview: true }
  });
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(ctx.h.context.document.documentElement.getAttribute('data-op-formula-preview'), 'true');
  assert.equal(ctx.runtime.diagnostics().formulaBlocks, 2);
  assert.ok(bareWrap.querySelector('.op-formula-preview').querySelector('math'));
  assert.ok(surface.querySelector('.op-formula-preview').querySelector('math'));
  assert.equal(surface.querySelector('.op-code-fold-bar'), null, 're-enabling formulaPreview removes fold bar');
  assert.equal(pre.classList.contains('op-code-folded'), false, 're-enabling formulaPreview clears folded clip class');

  // Toggle to Source -> verify remembered fold state is preserved, unfold it, then toggle formulaPreview false -> stays unfolded
  const toggleBtn = actions.querySelector('.op-formula-toggle');
  toggleBtn.dispatchEvent({ type: 'click' });
  assert.equal(pre.classList.contains('op-code-folded'), true);
  surface.querySelector('.op-code-fold-bar').dispatchEvent({ type: 'click' });
  assert.equal(pre.classList.contains('op-code-folded'), false);
  toggleBtn.dispatchEvent({ type: 'click' });

  await ctx.h.schema.callApi(ctx.h.api.storage.local, 'set', {
    [ctx.h.schema.STORAGE_KEY]: { ...ctx.h.schema.DEFAULT_CONFIG, enabled: true, formulaPreview: false }
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(surface.querySelector('.op-code-fold-bar'));
  assert.equal(pre.classList.contains('op-code-folded'), false, 'no stale fold state after unfolding');

  ctx.runtime.stop();
});

test('v0.4.1 review: user source mode survives transient incomplete-brace streaming updates without snapping back to formula', async () => {
  let surfacesRef = [];
  let headersRef = [];
  const ctx = createRuntimeDom({ language: 'zh-CN', formulaPreview: true }, {
    host: 'chatgpt',
    loadFormula: true,
    codeSurfaces: () => surfacesRef,
    codeHeaders: () => headersRef,
    textOf: node => node?.textContent || ''
  });
  const e = Object.fromEntries(ctx.elements);
  const makeNode = ctx.makeEl;

  const surface = makeNode('div', { class: 'code-shell' });
  const header = makeNode('div', { class: 'code-shell-header' });
  const label = makeNode('span'); label.textContent = 'LaTeX';
  const actions = makeNode('div');
  const copyBtn = makeNode('button', { 'aria-label': 'Copy' }); copyBtn.textContent = 'Copy';
  actions.append(copyBtn);
  header.append(label, actions);
  const pre = makeNode('pre');
  const code = makeNode('code', { class: 'language-latex' });
  code.textContent = '\\frac{1}{2}';
  pre.append(code);
  surface.append(header, pre);
  e.assistantTurn.append(surface);

  surfacesRef = [surface];
  headersRef = [header];
  ctx.setCodeBlocks([pre]);
  ctx.runtime.refresh();
  await new Promise(resolve => setTimeout(resolve, 20));

  const toggleBtn = actions.querySelector('.op-formula-toggle');
  assert.ok(toggleBtn);
  toggleBtn.dispatchEvent({ type: 'click' });
  assert.equal(pre.getAttribute('data-op-formula-source-hidden'), null);
  assert.equal(toggleBtn.getAttribute('data-formula-mode'), 'source');

  // Stream a transient syntax error past debounce window
  ctx.setStreaming(true);
  code.textContent = '\\frac{1}{2} + \\frac{3}{';
  ctx.runtime.refresh();
  await new Promise(resolve => setTimeout(resolve, 340));
  assert.equal(pre.getAttribute('data-op-formula-source-hidden'), null, 'source stays visible during transient syntax error');

  // Complete the closing brace past debounce window -> must stay in source mode!
  code.textContent = '\\frac{1}{2} + \\frac{3}{4}';
  ctx.runtime.refresh();
  await new Promise(resolve => setTimeout(resolve, 340));
  ctx.setStreaming(false);

  const recoveredToggle = actions.querySelector('.op-formula-toggle');
  const recoveredPreview = surface.querySelector('.op-formula-preview');
  assert.ok(recoveredToggle, 'toggle button re-attaches after valid syntax recovers');
  assert.equal(recoveredToggle.getAttribute('data-formula-mode'), 'source', 'user source mode must not snap back to preview');
  assert.equal(recoveredToggle.textContent, '公式');
  assert.equal(pre.getAttribute('data-op-formula-source-hidden'), null, 'source remains visible after recovery');
  assert.ok(recoveredPreview, 'preview remains mounted (hidden) for instant toggle back');
  assert.equal(recoveredPreview.hidden, true);
  assert.ok(recoveredPreview.querySelector('math'), 'recovered preview contains updated MathML');

  // Clicking toggle now switches back to updated Formula Preview cleanly
  recoveredToggle.dispatchEvent({ type: 'click' });
  assert.equal(recoveredToggle.getAttribute('data-formula-mode'), 'preview');
  assert.equal(pre.getAttribute('data-op-formula-source-hidden'), 'true');
  assert.equal(recoveredPreview.hidden, false);

  ctx.runtime.stop();
});
