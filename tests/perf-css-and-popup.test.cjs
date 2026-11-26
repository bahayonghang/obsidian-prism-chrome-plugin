'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { harness, rootElement, ROOT } = require('./helpers.cjs');

test('v0.4.5 #53: stylesheets split cleanly by host, ban root :has() and universal math/ambient * key selectors, optimize Ambient Stage, and manifests pin temml.min.js', () => {
  const commonPath = path.join(ROOT, 'styles/common.css');
  const chatgptPath = path.join(ROOT, 'styles/host-chatgpt.css');
  const geminiPath = path.join(ROOT, 'styles/host-gemini.css');
  const legacyPath = path.join(ROOT, 'styles/hosts.css');

  assert.equal(fs.existsSync(commonPath), true, 'styles/common.css must exist');
  assert.equal(fs.existsSync(chatgptPath), true, 'styles/host-chatgpt.css must exist');
  assert.equal(fs.existsSync(geminiPath), true, 'styles/host-gemini.css must exist');
  assert.equal(fs.existsSync(legacyPath), false, 'legacy monolithic styles/hosts.css should be removed after split');

  const common = fs.readFileSync(commonPath, 'utf8');
  const chatgpt = fs.readFileSync(chatgptPath, 'utf8');
  const gemini = fs.readFileSync(geminiPath, 'utf8');
  const allCss = [common, chatgpt, gemini].join('\n');

  // Strict per-host stylesheet isolation
  assert.equal(/data-op-host="/.test(common), false, 'styles/common.css must not contain host-specific data-op-host rules');
  assert.equal(/data-op-host="gemini"/.test(chatgpt), false, 'styles/host-chatgpt.css must not contain Gemini rules');
  assert.equal(/data-op-host="chatgpt"/.test(gemini), false, 'styles/host-gemini.css must not contain ChatGPT rules');

  // Zero root-level :has(...) selectors anywhere
  const stripped = allCss.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/html[^\s{]*:has\(/i.test(stripped), false, 'stylesheets must never attach :has(...) to html root');

  // Zero universal * key selector in Native Math Surface or #op-ambient-stage *
  assert.equal(/#op-ambient-stage\s+\*/.test(stripped), false, '#op-ambient-stage must not use universal * descendant selector');
  const mathMarker = '/* === Native Math Surface Readability & Overflow (v0.4.1 #33) === */';
  const mathIdx = common.indexOf(mathMarker);
  assert.notEqual(mathIdx, -1, 'styles/common.css must contain Native Math Surface section');
  const mathEnd = common.indexOf('/* === ', mathIdx + mathMarker.length);
  const mathSection = (mathEnd === -1 ? common.slice(mathIdx) : common.slice(mathIdx, mathEnd)).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/\)\s*\*(?::|\s|\{)/.test(mathSection), false, 'Native Math Surface must not use universal * key selector');

  // Ambient Stage containment, SVG glyph tile, and aura scoped to #op-ambient-stage
  assert.match(common, /#op-ambient-stage\s*\{[\s\S]*?contain\s*:\s*strict\s*;/, '#op-ambient-stage must use contain: strict');
  assert.match(common, /\.op-ambient-glyphs\s*\{[\s\S]*?data:image\/svg\+xml/, '.op-ambient-glyphs must render via inline SVG data URI tile');
  assert.equal(/html\[data-op-aura=/.test(stripped), false, 'data-op-aura must be scoped on #op-ambient-stage rather than html root');
  assert.match(common, /#op-ambient-stage\[data-op-aura="streaming"\]\s+\.op-ambient-rim/, '#op-ambient-stage must drive .op-ambient-rim aura state');

  // Manifests: 4 content_scripts groups, host-split CSS, temml.min.js, minimal permissions
  for (const manifestRel of ['manifest.json', 'manifests/firefox.json']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, manifestRel), 'utf8'));
    assert.deepEqual(manifest.permissions, ['storage']);
    assert.equal(manifest.web_accessible_resources, undefined);
    assert.equal(manifest.content_scripts.length, 4, `${manifestRel}: expected 4 host-split content_scripts groups`);
    for (const group of manifest.content_scripts) {
      assert.equal(group.all_frames, false, `${manifestRel}: all_frames must stay false`);
    }
    assert.deepEqual(manifest.content_scripts[0].css, ['styles/prism-tokens.css', 'styles/common.css']);
    assert.deepEqual(manifest.content_scripts[1].matches, ['https://chatgpt.com/*', 'https://chat.openai.com/*']);
    assert.deepEqual(manifest.content_scripts[1].css, ['styles/host-chatgpt.css']);
    assert.deepEqual(manifest.content_scripts[2].matches, ['https://gemini.google.com/*']);
    assert.deepEqual(manifest.content_scripts[2].css, ['styles/host-gemini.css']);
    assert.ok(manifest.content_scripts[3].js.includes('vendor/temml/temml.min.js'), `${manifestRel}: must load vendor/temml/temml.min.js`);
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'vendor/temml/temml.min.js')), true, 'vendor/temml/temml.min.js must exist');
});

test('v0.4.5 #53: content runtime reuses ObsidianPrismReady without a duplicate Schema.loadConfig call', async () => {
  const h = harness();
  let loadConfigCalls = 0;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const root = rootElement();
  h.context.document = { documentElement: root, body: {}, hidden: false };
  h.context.window = h.context;
  h.context.addEventListener = () => {};
  h.context.removeEventListener = () => {};
  h.context.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  h.context.ObsidianPrismAdapters = { forHost: () => ({}) };
  h.context.ObsidianPrismReady = ready;
  h.context.ObsidianPrismSchema = {
    ...h.schema,
    loadConfig: () => { loadConfigCalls++; return Promise.resolve({ ...h.schema.DEFAULT_CONFIG, enabled: false }); }
  };
  h.load('src/content.js');
  assert.equal(loadConfigCalls, 0, 'content.js must reuse global.ObsidianPrismReady instead of calling Schema.loadConfig() again');
  resolveReady({ ...h.schema.DEFAULT_CONFIG, enabled: false });
  await ready;
  await Promise.resolve();
  assert.equal(loadConfigCalls, 0);
  h.context.ObsidianPrismRuntime.stop();
});

test('v0.4.5 #53: popup skips redundant i18n DOM walks and off-tab permission checks when language and tab are unchanged', async () => {
  const h = harness();
  await h.schema.callApi(h.api.storage.local, 'set', {
    [h.schema.STORAGE_KEY]: { ...h.schema.DEFAULT_CONFIG, enabled: true, language: 'zh-CN', thoughtEndpoint: 'http://localhost:11434/v1/chat/completions' }
  });
  let i18nQueries = 0;
  let permissionChecks = 0;
  let secretsStatusCalls = 0;

  h.api.permissions = {
    contains: (req, cb) => { permissionChecks++; if (cb) cb(false); return Promise.resolve(false); },
    request: (req, cb) => { if (cb) cb(true); return Promise.resolve(true); },
    remove: (req, cb) => { if (cb) cb(true); return Promise.resolve(true); }
  };
  const origSend = h.api.runtime.sendMessage;
  h.api.runtime.sendMessage = (msg, cb) => {
    if (msg?.type === 'OP_SECRETS_STATUS') {
      secretsStatusCalls++;
      const res = { ok: true, configured: false };
      if (cb) cb(res);
      return Promise.resolve(res);
    }
    return origSend(msg, cb);
  };

  const listeners = new Map();
  const makeStub = (tag = 'div', id = '', extra = {}) => {
    const el = {
      tagName: tag.toUpperCase(),
      id,
      type: extra.type || '',
      value: extra.value ?? '',
      checked: false,
      disabled: false,
      hidden: false,
      title: '',
      textContent: '',
      innerHTML: '',
      tabIndex: 0,
      dataset: { ...(extra.dataset || {}) },
      options: extra.options || [],
      files: [],
      scrollTop: 0,
      style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; }, getPropertyPriority() { return ''; } },
      classList: { toggle() {}, contains() { return false; } },
      setAttribute() {},
      getAttribute() { return null; },
      closest() { return { dataset: {} }; },
      focus() {},
      click() {},
      addEventListener(type, fn) {
        const key = `${id || tag}:${type}`;
        if (!listeners.has(key)) listeners.set(key, []);
        listeners.get(key).push(fn);
      }
    };
    return el;
  };

  const byId = new Map();
  const getEl = id => {
    if (!byId.has(id)) {
      if (id === 'cfg-language') {
        byId.set(id, makeStub('select', id, { options: [{ value: 'zh-CN', textContent: '' }, { value: 'en-US', textContent: '' }] }));
      } else if (id === 'cfg-codeFont' || id === 'cfg-contextWindowTokens') {
        byId.set(id, makeStub('select', id, { options: [] }));
      } else if (id === 'cfg-composerGlow' || id === 'cfg-enabled') {
        byId.set(id, makeStub('input', id, { type: 'checkbox' }));
      } else {
        byId.set(id, makeStub('div', id));
      }
    }
    return byId.get(id);
  };

  const tabAppearance = makeStub('button', 'tab-appearance', { dataset: { tab: 'appearance' } });
  const tabTranslation = makeStub('button', 'tab-translation', { dataset: { tab: 'translation' } });
  const panelAppearance = makeStub('section', 'panel-appearance');
  const panelTranslation = makeStub('section', 'panel-translation');
  byId.set('panel-appearance', panelAppearance);
  byId.set('panel-translation', panelTranslation);

  const i18nNodes = [makeStub('span', 'lbl1', { dataset: { i18n: 'appTitle' } })];
  const tabsNav = makeStub('nav', 'tabs-nav');
  const presetRow = makeStub('div', 'preset-row');
  const previewSites = makeStub('div', 'preview-sites');

  h.context.location = { search: '' };
  h.context.URLSearchParams = URLSearchParams;
  h.context.window = h.context;
  h.context.matchMedia = () => ({ matches: false, addEventListener() {} });
  h.context.document = {
    hidden: false,
    activeElement: null,
    documentElement: makeStub('html', 'root'),
    body: makeStub('body', 'body'),
    getElementById: getEl,
    querySelector: sel => {
      if (sel === '.tabs') return tabsNav;
      if (sel === '.preset-row') return presetRow;
      if (sel === '.preview-sites') return previewSites;
      return makeStub('div');
    },
    querySelectorAll: sel => {
      if (sel === '[data-i18n]') { i18nQueries++; return i18nNodes; }
      if (sel === '[data-tab]') return [tabAppearance, tabTranslation];
      if (sel === '[role=tabpanel]') return [panelAppearance, panelTranslation];
      return [];
    },
    addEventListener() {}
  };

  h.load('popup/popup.js');
  await new Promise(resolve => setTimeout(resolve, 30));

  assert.equal(permissionChecks, 0, 'opening popup on appearance tab must not call api.permissions.contains');
  assert.ok(secretsStatusCalls <= 1, `boot should query OP_SECRETS_STATUS at most once (got ${secretsStatusCalls})`);

  // Toggle composerGlow on appearance tab (language unchanged)
  i18nQueries = 0;
  permissionChecks = 0;
  const glowInput = getEl('cfg-composerGlow');
  glowInput.checked = false;
  for (const fn of listeners.get('cfg-composerGlow:change') || []) fn();
  await new Promise(resolve => setTimeout(resolve, 30));

  assert.equal(i18nQueries, 0, 'toggling a non-language setting must not re-query and rewrite all [data-i18n] nodes');
  assert.equal(permissionChecks, 0, 'toggling an appearance setting must not call api.permissions.contains');

  // Switch language to en-US -> MUST re-translate [data-i18n] nodes
  const langSelect = getEl('cfg-language');
  langSelect.value = 'en-US';
  for (const fn of listeners.get('cfg-language:change') || []) fn();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.ok(i18nQueries >= 1, 'changing language must re-translate [data-i18n] nodes');

  // Switch to translation tab -> MUST check permission
  for (const fn of listeners.get('tab-translation:click') || []) fn();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(permissionChecks >= 1, 'switching to translation tab must check endpoint permission');
});

test('v0.4.5 #53: isVisible handles boxless display:contents wrappers accurately when checkVisibility returns false', () => {
  const h = harness();
  h.load('src/adapters.js');
  const Adapters = h.context.ObsidianPrismAdapters;
  const styles = new Map();
  const doc = {
    defaultView: {
      getComputedStyle: el => styles.get(el) || { display: 'block', visibility: 'visible', opacity: '1' }
    }
  };
  const makeNode = (display, checkVis) => {
    const node = {
      nodeType: 1,
      isConnected: true,
      parentElement: null,
      ownerDocument: doc,
      style: {},
      hasAttribute: () => false,
      getAttribute: () => null,
      checkVisibility: () => checkVis
    };
    styles.set(node, { display, visibility: 'visible', opacity: '1' });
    return node;
  };
  const ancestor = makeNode('block', true);
  const contentsWrap = makeNode('contents', false);
  contentsWrap.parentElement = ancestor;
  assert.equal(Adapters.isVisible(contentsWrap), true, 'visible display:contents wrapper must return true even when checkVisibility returns false');

  styles.set(ancestor, { display: 'none', visibility: 'visible', opacity: '1' });
  assert.equal(Adapters.isVisible(contentsWrap), false, 'display:contents wrapper under display:none ancestor must return false');

  const hiddenBox = makeNode('none', false);
  hiddenBox.parentElement = makeNode('block', true);
  assert.equal(Adapters.isVisible(hiddenBox), false, 'display:none node must stay false');

  // Stylesheet-set content-visibility: hidden (not inline style) must still return false even when checkVisibility returns true
  const cvHidden = makeNode('block', true);
  cvHidden.parentElement = ancestor;
  styles.set(ancestor, { display: 'block', visibility: 'visible', opacity: '1' });
  styles.set(cvHidden, { display: 'block', visibility: 'visible', opacity: '1', contentVisibility: 'hidden' });
  assert.equal(Adapters.isVisible(cvHidden), false, 'stylesheet-set content-visibility:hidden must return false');
});

test('v0.4.5 #53: Formula Preview scopes content-visibility:auto via data-op-formula-deferred only on long threads (>12 formulas, excluding last 2)', () => {
  const common = fs.readFileSync(path.join(ROOT, 'styles/common.css'), 'utf8');
  assert.match(common, /\.op-formula-preview\[data-op-owned\]\[data-op-formula-deferred="true"\]\s*\{[\s\S]*?content-visibility\s*:\s*auto\s*;/,
    'content-visibility: auto must be scoped strictly to [data-op-formula-deferred="true"]');
  assert.doesNotMatch(common, /\.op-formula-preview\[data-op-owned\]\s*\{[^}]*content-visibility\s*:\s*auto/,
    'unconditional .op-formula-preview must not set content-visibility: auto');
});
