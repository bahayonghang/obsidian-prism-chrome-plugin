'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, plain, rootElement } = require('./helpers.cjs');

test('configuration admits only known own fields with strict value types', () => {
  const { schema: S } = harness();
  const raw = Object.assign(Object.create({ enabled: false }), {
    enableGemini: 'false', palette: 'warm', ambientIntensity: 101.4, contextWindowTokens: '128000',
    thoughtApiKey: 'FAKE_SECRET', malicious: '<script>', thoughtEndpoint: 'javascript:alert(1)', thoughtModel: 'test\ninjected'
  });
  const result = plain(S.sanitizeConfig(raw));
  assert.equal(result.enabled, true, 'inherited properties must not be accepted');
  assert.equal(result.enableGemini, true, 'string false must not become a boolean');
  assert.equal(result.palette, 'warm');
  assert.equal(result.ambientIntensity, 100);
  assert.equal(result.contextWindowTokens, S.DEFAULT_CONFIG.contextWindowTokens);
  assert.equal(result.thoughtEndpoint, '');
  assert.equal(result.thoughtModel, '');
  assert.equal(Object.hasOwn(result, 'thoughtApiKey'), false);
  assert.equal(Object.hasOwn(result, 'malicious'), false);
  assert.deepEqual(plain(S.sanitizePatch([])), {});
  assert.deepEqual(plain(S.sanitizePatch({ enabled: false, ambientIntensity: NaN })), { enabled: false });
});

test('light-field controls accept supported choices and reject accidental string booleans', () => {
  const { schema: S } = harness();
  const configured = plain(S.sanitizeConfig({ ambientStyle: 'spotlight', ambientTexture: 'grid', motionSpeed: 'fast', composerGlow: false, sidebarStyle: 'solid' }));
  assert.equal(configured.ambientStyle, 'spotlight');
  assert.equal(configured.ambientTexture, 'grid');
  assert.equal(configured.motionSpeed, 'fast');
  assert.equal(configured.composerGlow, false);
  assert.equal(configured.sidebarStyle, 'solid');
  const invalid = plain(S.sanitizePatch({ ambientStyle: 'rainbow', ambientTexture: true, motionSpeed: 1, composerGlow: 'false', sidebarStyle: 'transparent' }));
  assert.deepEqual(invalid, {});
});

test('ambient intensity reaches the root without the prototype low-opacity multiplier', () => {
  const { schema: S } = harness();
  const root = rootElement();
  S.applyConfigToRoot({ ...S.DEFAULT_CONFIG, ambientIntensity: 65, ambientStyle: 'aurora', ambientTexture: 'glyphs', motionSpeed: 'slow', composerGlow: true, sidebarStyle: 'glass' }, root);
  assert.equal(Number(root.style.getPropertyValue('--op-ambient-alpha')), 0.65);
  assert.equal(root.getAttribute('data-op-ambient-style'), 'aurora');
  assert.equal(root.getAttribute('data-op-texture'), 'glyphs');
  assert.equal(root.getAttribute('data-op-motion-speed'), 'slow');
  assert.equal(root.getAttribute('data-op-composer-glow'), 'true');
  assert.equal(root.getAttribute('data-op-sidebar-style'), 'glass');
});

test('old stored pet settings cannot reappear through loading, presets or a later save', async () => {
  const h = harness({ background: true });
  h.state.storage[h.schema.STORAGE_KEY] = { mascot: 'cat', palette: 'warm', enabled: true };
  const loaded = await h.schema.loadConfig();
  assert.equal(Object.hasOwn(loaded, 'mascot'), false);
  assert.equal(loaded.palette, 'warm');
  for (const preset of Object.values(h.schema.SCENE_PRESETS)) assert.equal(Object.hasOwn(preset, 'mascot'), false);
  await h.schema.saveConfig({ mascot: 'tower', ambientTexture: 'grid' });
  assert.equal(Object.hasOwn(h.state.storage[h.schema.STORAGE_KEY], 'mascot'), false);
  assert.equal(h.state.storage[h.schema.STORAGE_KEY].ambientTexture, 'grid');
});

test('host detection rejects lookalike domains and unrelated subdomains', () => {
  const { schema: S } = harness();
  for (const host of ['chatgpt.com', 'chat.openai.com']) assert.equal(S.detectHost(host), 'chatgpt');
  assert.equal(S.detectHost('gemini.google.com'), 'gemini');
  for (const host of ['evilchatgpt.com', 'chatgpt.com.evil.example', 'www.chatgpt.com', 'gemini.google.com.evil.example', 'localhost']) assert.equal(S.detectHost(host), 'unknown');
});

test('endpoint validation rejects insecure external and credential-bearing URLs', () => {
  const { schema: S } = harness();
  for (const endpoint of ['http://api.example.test/v1/chat/completions', 'http://[::1]:11434/v1/chat/completions', 'https://user:pass@api.example.test/v1', 'https://api.example.test/v1#fragment', 'file:///tmp/key', 'javascript:alert(1)', 'https://']) assert.equal(S.validEndpoint(endpoint), '', endpoint);
  for (const endpoint of ['https://api.example.test/v1/chat/completions', 'http://localhost:11434/v1/chat/completions', 'http://127.0.0.1:11434/v1/chat/completions']) assert.equal(S.validEndpoint(endpoint), endpoint);
});

test('theme disable restores native root attributes and inline properties', () => {
  const { schema: S } = harness();
  const root = rootElement();
  root.style.setProperty('--op-ambient-alpha', '0.9', 'important');
  const before = JSON.stringify(root.attributes);
  assert.equal(S.applyConfigToRoot({ ...S.DEFAULT_CONFIG, themeMode: 'dark', palette: 'warm' }, root), true);
  assert.equal(root.getAttribute('data-op-effective-palette'), 'warm');
  assert.equal(root.getAttribute('class'), 'native-site-theme');
  assert.equal(S.applyConfigToRoot({ ...S.DEFAULT_CONFIG, enabled: false }, root), false);
  assert.equal(JSON.stringify(root.attributes), before);
  assert.equal(root.style.getPropertyValue('--op-ambient-alpha'), '0.9');
  assert.equal(root.style.getPropertyPriority('--op-ambient-alpha'), 'important');
  assert.equal(root.style.getPropertyValue('--native-color'), '#123456');
});

test('reduced motion overrides full motion and per-site disable restores native state', () => {
  const { schema: S } = harness({ reducedMotion: true });
  const root = rootElement();
  S.applyConfigToRoot({ ...S.DEFAULT_CONFIG, motionLevel: 'ultra' }, root);
  assert.equal(root.getAttribute('data-op-motion'), 'off');
  S.applyConfigToRoot({ ...S.DEFAULT_CONFIG, enableChatGPT: false }, root);
  assert.equal(root.getAttribute('data-op-enabled'), null);
});

test('appearance application and settings operations never touch host localStorage', async () => {
  const h = harness({ background: true });
  const root = rootElement();
  h.schema.applyConfigToRoot(h.schema.DEFAULT_CONFIG, root);
  await h.schema.loadConfig();
  await h.schema.saveConfig({ palette: 'warm' });
  assert.equal(h.state.localStorageTouches, 0);
});

test('locale dictionaries cover identical visible setting keys', () => {
  const { schema: S } = harness();
  assert.deepEqual(Object.keys(S.I18N['zh-CN']).sort(), Object.keys(S.I18N['en-US']).sort());
  for (const lang of ['zh-CN', 'en-US']) for (const [key, value] of Object.entries(S.I18N[lang])) assert.equal(typeof value === 'string' && value.length > 0, true, `${lang}.${key}`);
});

test('a Chrome Promise namespace does not request Firefox data collection permissions', () => {
  const h = harness({ kind: 'firefox' });
  delete h.api.runtime.getBrowserInfo;
  const request = plain(h.schema.permissionRequest('https://api.example.test/v1/chat/completions'));
  assert.deepEqual(request, { origins: ['https://api.example.test/*'] });
});

test('native palette preserves its selection while matching the host light/dark mode', () => {
  const h = harness();
  const root = rootElement(); root.setAttribute('data-theme', 'light');
  h.context.document = { documentElement: root, body: rootElement() };
  const config = { ...h.schema.DEFAULT_CONFIG, themeMode: 'dark', palette: 'host' };
  assert.equal(h.schema.resolveScheme(config), 'light');
  assert.equal(h.schema.resolvePalette(config), 'host');
  h.schema.applyConfigToRoot(config, root);
  assert.equal(root.getAttribute('data-op-scheme'), 'light');
  assert.equal(root.getAttribute('data-op-effective-palette'), 'host');
  assert.equal(root.getAttribute('data-theme'), 'light');
});

for (const kind of ['chrome', 'firefox']) {
  test(`${kind}: storage reads and change subscriptions use the correct API contract`, async () => {
    const h = harness({ kind });
    const S = h.schema;
    h.state.storage[S.STORAGE_KEY] = { enabled: false, palette: 'warm', thoughtApiKey: 'FAKE_OLD_SECRET' };
    const config = await S.loadConfig();
    assert.equal(config.enabled, false);
    assert.equal(config.palette, 'warm');
    assert.equal(Object.hasOwn(config, 'thoughtApiKey'), false);
    const updates = [];
    const stop = S.subscribe(value => updates.push(value));
    await S.callApi(h.api.storage.local, 'set', { [S.STORAGE_KEY]: { palette: 'obsidian' } });
    assert.equal(updates.length, 1);
    assert.equal(updates[0].palette, 'obsidian');
    stop();
    await S.callApi(h.api.storage.local, 'set', { [S.STORAGE_KEY]: { palette: 'warm' } });
    assert.equal(updates.length, 1);
  });

  test(`${kind}: storage failures are rejected instead of being reported as success`, async () => {
    const h = harness({ kind, background: true });
    h.state.getError = 'OFFLINE_STORAGE_FAILURE';
    await assert.rejects(h.schema.loadConfig(), /OFFLINE_STORAGE_FAILURE/);
    h.state.getError = null;
    h.state.setError = 'OFFLINE_STORAGE_FAILURE';
    await assert.rejects(h.schema.saveConfig({ palette: 'warm' }), /OFFLINE_STORAGE_FAILURE/);
    assert.equal(h.state.writes, 0);
  });

  test(`${kind}: concurrent setting patches preserve each independent edit`, async () => {
    const h = harness({ kind, background: true });
    await Promise.all([
      h.schema.saveConfig({ palette: 'warm' }),
      h.schema.saveConfig({ accentTone: 'amber' }),
      h.schema.saveConfig({ sidebarCompact: true })
    ]);
    const config = await h.schema.loadConfig();
    assert.equal(config.palette, 'warm');
    assert.equal(config.accentTone, 'amber');
    assert.equal(config.sidebarCompact, true);
  });

  test(`${kind}: optional translation permission is limited to the configured origin`, () => {
    const { schema: S } = harness({ kind });
    const request = plain(S.permissionRequest('https://api.example.test/v1/chat/completions'));
    assert.deepEqual(request.origins, ['https://api.example.test/*']);
    assert.deepEqual(plain(S.permissionRequest('http://localhost:11434/v1/chat/completions')).origins, ['http://localhost/*']);
    if (kind === 'firefox') assert.deepEqual(request.data_collection, ['websiteContent', 'personalCommunications', 'authenticationInfo']);
    else assert.equal(Object.hasOwn(request, 'data_collection'), false);
    assert.throws(() => S.permissionRequest('http://api.example.test/v1'), /INVALID_ENDPOINT/);
  });
}
