'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers.cjs');

function createRuntimeDom(initialConfig = {}) {
  const h = harness({
    storage: { obsidianPrismWebConfig_v1: { enabled: true, themeMode: 'dark', palette: 'obsidian', composerRestyle: true, ...initialConfig } }
  });
  const elements = new Map();
  function makeEl(tag, attrs = {}) {
    const map = new Map(Object.entries(attrs).map(([k, v]) => [k, String(v)]));
    const el = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      isConnected: true,
      parentElement: null,
      children: [],
      dataset: {},
      className: attrs.class || '',
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
      replaceChildren(...nodes) { this.children = []; this.append(...nodes); },
      remove() { this.isConnected = false; },
      addEventListener() {},
      removeEventListener() {},
      querySelectorAll(sel) {
        const out = [];
        const walk = cur => {
          for (const c of cur.children || []) {
            if (sel.startsWith('.') && String(c.className || '').split(/\s+/).includes(sel.slice(1))) out.push(c);
            else if (sel === '[data-turn]' && c.dataset && c.dataset.turn !== undefined) out.push(c);
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
  const assistantTurn = makeEl('article', { 'data-turn': 'assistant' });

  for (const [k, v] of Object.entries({ docEl, body, primary, threadCol, composerCol, composer, scrim, addBtn, modelBtn, chip, codeSurface, codeHeader, spacer, userTurn, assistantTurn })) {
    elements.set(k, v);
  }

  const fakeAdapter = {
    host: 'chatgpt',
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
    visibleAttachments: () => [],
    activeModelLabel: () => 'ChatGPT 5.2',
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
  h.context.performance = { now: () => 100 };
  h.context.ObsidianPrismAdapters = {
    forHost: () => fakeAdapter,
    isOwned: n => Boolean(n && n.getAttribute && n.getAttribute('data-op-owned') !== null),
    textOf: () => 'Sample turn text',
    visibleText: () => 'Sample turn text',
    estimateTokens: () => 4
  };
  h.load('src/content.js');
  return { h, elements, runtime: h.context.ObsidianPrismRuntime };
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
