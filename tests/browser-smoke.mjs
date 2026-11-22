/**
 * Offline browser regression suite. No login, account access, or live service request.
 * Chromium: unpacked extension loading/settings plus injected DOM regressions.
 * Firefox: DOM regressions using a Promise-only WebExtension API test double.
 * Run `npm run build && npm run test:browser`; select PRISM_BROWSER=firefox as needed.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = path.join(ROOT, 'test-artifacts');
await fs.mkdir(ARTIFACTS, { recursive: true });
const engine = process.env.PRISM_BROWSER || 'chromium';
if (!['chromium', 'firefox'].includes(engine)) throw new Error('PRISM_BROWSER must be chromium or firefox');
let playwright;
try { playwright = await import('playwright'); }
catch {
  const modules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
  if (!modules) throw new Error('Install developer dependency playwright before running browser tests.');
  const require = createRequire(import.meta.url);
  playwright = await import(pathToFileURL(require.resolve('playwright', { paths: [modules] })).href);
}
const type = playwright[engine];
const executable = process.env.PRISM_BROWSER_EXECUTABLE || (existsSync(type.executablePath()) ? undefined : engine === 'chromium' && existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const launchOptions = { headless: true, ...(executable ? { executablePath: executable } : {}) };
const source = async relative => fs.readFile(path.join(ROOT, relative), 'utf8');
const fixtures = { chatgpt: await source('tests/fixtures/chatgpt.html'), gemini: await source('tests/fixtures/gemini.html') };
const homeFixtures = { chatgpt: await source('tests/fixtures/chatgpt-home.html'), gemini: await source('tests/fixtures/gemini-home.html') };
const fixtureURLs = { chatgpt: 'https://chatgpt.com/prism-offline-fixture', gemini: 'https://gemini.google.com/prism-offline-fixture' };
const scriptFiles = ['src/config-schema.js', 'src/early-boot.js', 'src/adapters.js', 'src/content.js'];
const scripts = await Promise.all(scriptFiles.map(source));
const styles = await Promise.all(['styles/prism-tokens.css', 'styles/hosts.css'].map(source));

async function interceptFixtures(context) {
  await context.route(/^https?:\/\//, async route => {
    const url = new URL(route.request().url());
    const host = url.hostname === 'chatgpt.com' ? 'chatgpt' : url.hostname === 'gemini.google.com' ? 'gemini' : null;
    if (host && url.pathname === '/prism-offline-fixture') return route.fulfill({ status: 200, contentType: 'text/html', body: fixtures[host] });
    if (host && url.pathname === '/prism-offline-home') return route.fulfill({ status: 200, contentType: 'text/html', body: homeFixtures[host] });
    // Every non-fixture HTTP request is blocked, including translation endpoints.
    return route.abort('blockedbyclient');
  });
}

async function actualChromiumExtension() {
  const extensionDir = path.resolve(ROOT, process.env.PRISM_EXTENSION_DIR || 'dist/chrome');
  const manifest = JSON.parse(await fs.readFile(path.join(extensionDir, 'manifest.json'), 'utf8'));
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prism-extension-test-'));
  let context, options, chat, popup;
  try {
    context = await playwright.chromium.launchPersistentContext(profile, {
      ...launchOptions, channel: executable ? undefined : 'chromium',
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`]
    });
    await interceptFixtures(context);
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 20000 });
    const workerURL = new URL(worker.url());
    const extensionOrigin = workerURL.protocol + '//' + workerURL.host;
    options = await context.newPage();
    const errors = [];
    options.on('pageerror', error => errors.push(error.message));
    await options.goto(extensionOrigin + '/' + manifest.options_ui.page);
    await options.waitForFunction(() => Boolean(document.querySelector('#settings-fields') && !document.querySelector('#settings-fields').disabled));
    assert.equal(await options.locator('#cfg-enabled').isChecked(), true);
    await options.evaluate(async () => {
      await ObsidianPrismSchema.saveConfig({ themeMode: 'dark', palette: 'warm', language: 'en-US' });
    });
    await options.waitForFunction(() => document.documentElement.getAttribute('data-op-scheme') === 'dark');
    await options.screenshot({ path: path.join(ARTIFACTS, 'chromium-options-dark.png'), fullPage: true });
    await options.locator('#tab-motion').click();
    await options.screenshot({ path: path.join(ARTIFACTS, 'chromium-options-motion-dark.png'), fullPage: true });
    await options.evaluate(() => ObsidianPrismSchema.saveConfig({ themeMode: 'light', lightPreset: 'alabaster' }));
    await options.waitForFunction(() => document.documentElement.getAttribute('data-op-scheme') === 'light');
    await options.screenshot({ path: path.join(ARTIFACTS, 'chromium-options-motion-light.png'), fullPage: true });
    await options.locator('#tab-appearance').click();
    await options.screenshot({ path: path.join(ARTIFACTS, 'chromium-options-light.png'), fullPage: true });
    await options.evaluate(() => ObsidianPrismSchema.saveConfig({ themeMode: 'dark' }));
    chat = await context.newPage();
    await chat.goto(fixtureURLs.chatgpt);
    await chat.waitForFunction(() => document.documentElement.getAttribute('data-op-effective-palette') === 'warm');
    await chat.waitForSelector('.op-code-fold-bar');
    assert.equal(await chat.locator('.op-code-fold-bar').count(), 1);
    await options.evaluate(() => ObsidianPrismSchema.saveConfig({ enabled: false }));
    await chat.waitForFunction(() => !document.documentElement.hasAttribute('data-op-enabled'));
    assert.equal(await chat.locator('[data-op-owned]').count(), 0);
    await options.evaluate(() => ObsidianPrismSchema.saveConfig({ enabled: true, palette: 'obsidian' }));
    await chat.waitForFunction(() => document.documentElement.getAttribute('data-op-effective-palette') === 'obsidian');
    await chat.waitForSelector('.op-code-fold-bar');
    assert.equal(await options.locator('[role="tab"]').count(), 5);
    await options.locator('#tab-appearance').focus();
    await options.keyboard.press('ArrowRight');
    assert.equal(await options.locator('#tab-motion').getAttribute('aria-selected'), 'true');
    popup = await context.newPage();
    await popup.setViewportSize({ width: 440, height: 600 });
    popup.on('pageerror', error => errors.push(error.message));
    await popup.goto(extensionOrigin + '/' + manifest.action.default_popup);
    await popup.waitForFunction(() => Boolean(document.querySelector('#settings-fields') && !document.querySelector('#settings-fields').disabled));
    assert.equal(await popup.locator('#cfg-mascot').count(), 0);
    await popup.screenshot({ path: path.join(ARTIFACTS, 'chromium-popup-appearance.png') });
    await popup.locator('#tab-motion').click();
    for (const id of ['cfg-ambientStyle', 'cfg-ambientTexture', 'cfg-motionSpeed', 'cfg-ambientIntensity', 'cfg-composerGlow']) assert.equal(await popup.locator('#' + id).count(), 1, `motion control ${id} must be available`);
    assert.equal(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'popup has no horizontal overflow');
    assert.equal(await popup.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2), true, 'popup scroll stays inside its workspace');
    await popup.screenshot({ path: path.join(ARTIFACTS, 'chromium-popup-motion.png') });
    await popup.locator('[data-choice="ambientStyle"][data-value="spotlight"]').click();
    await popup.waitForFunction(async () => (await ObsidianPrismSchema.loadConfig()).ambientStyle === 'spotlight');
    await popup.locator('#cfg-ambientTexture').selectOption('grid');
    await popup.waitForFunction(async () => (await ObsidianPrismSchema.loadConfig()).ambientTexture === 'grid');
    await popup.setViewportSize({ width: 420, height: 600 });
    assert.equal(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'popup also fits a 420-pixel viewport');
    await popup.screenshot({ path: path.join(ARTIFACTS, 'chromium-popup-420.png') });
    await popup.locator('#file-import').setInputFiles({ name: 'legacy-prism-settings.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'obsidian-prism-web', settings: { mascot: 'cat', palette: 'warm', ambientIntensity: 35, thoughtTranslate: true } })) });
    await popup.waitForFunction(async () => (await ObsidianPrismSchema.loadConfig()).ambientIntensity === 35);
    const imported = await popup.evaluate(() => ObsidianPrismSchema.loadConfig());
    assert.equal(Object.hasOwn(imported, 'mascot'), false, 'legacy backups cannot reintroduce pets');
    assert.equal(imported.thoughtTranslate, false, 'import does not silently enable external translation');
    assert.deepEqual(errors, []);
    console.log('PASS Chromium unpacked extension: service worker, options, serialized settings, live content updates and keyboard tabs');
  } catch (error) {
    const current = popup || chat || options;
    if (current && !current.isClosed()) await current.screenshot({ path: path.join(ARTIFACTS, 'chromium-extension-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    if (context) await context.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
}

async function surfaceSnapshot(page) {
  return page.evaluate(() => {
    const read = selector => {
      const node = document.querySelector(selector), style = getComputedStyle(node);
      const borderWidth = style.borderWidth;
      const hasBorder = borderWidth.split(' ').some(value => parseFloat(value) > 0);
      return { background: style.backgroundColor, backgroundImage: style.backgroundImage, border: hasBorder ? style.borderColor : null, borderWidth, radius: style.borderRadius, shadow: style.boxShadow };
    };
    return { sidebar: read('[data-fixture-sidebar]'), composer: read('[data-fixture-composer]') };
  });
}

async function decorationVisible(page, selector) {
  return page.evaluate(selector => {
    let element = document.querySelector(selector);
    if (!element) return false;
    for (; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    return true;
  }, selector);
}

async function assertDecorationsPaused(page) {
  const moving = await page.evaluate(() => [...document.querySelectorAll('#op-ambient-stage *')].filter(node => {
    const style = getComputedStyle(node);
    return style.animationName !== 'none' && style.animationPlayState.split(',').some(value => value.trim() !== 'paused');
  }).map(node => node.className));
  assert.deepEqual(moving, [], 'ambient animation pauses when motion is disabled or the page is hidden');
}

async function exerciseNativeComposer(page) {
  const editor = page.locator('[data-fixture-composer] [contenteditable="true"]');
  await editor.click();
  await editor.fill('A short composition test');
  const result = await editor.evaluate(node => {
    const seen = [];
    const remember = event => seen.push(event.type);
    node.addEventListener('compositionstart', remember);
    node.addEventListener('compositionend', remember);
    node.dispatchEvent(new CompositionEvent('compositionstart', { data: '运行', bubbles: true }));
    const composingKey = new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, isComposing: true, bubbles: true, cancelable: true });
    node.dispatchEvent(composingKey);
    node.dispatchEvent(new CompositionEvent('compositionend', { data: '运行指标', bubbles: true }));
    node.removeEventListener('compositionstart', remember); node.removeEventListener('compositionend', remember);
    return { text: node.textContent, focused: document.activeElement === node, prevented: composingKey.defaultPrevented, seen };
  });
  assert.equal(result.focused, true);
  assert.equal(result.text, 'A short composition test', 'decorative effects never rewrite typed text');
  assert.equal(result.prevented, false, 'composition keyboard events keep native behavior');
  assert.deepEqual(result.seen, ['compositionstart', 'compositionend']);
  await editor.fill('');
  await editor.evaluate(node => node.blur());
}

function fixtureBridge(input) {
  const kind = typeof input === 'string' ? input : input.kind;
  const listeners = new Set();
  let stored = { enabled: true, themeMode: 'dark', palette: 'obsidian', language: 'en-US', ...(input.initial || {}) };
  let releaseStorage;
  const storageReady = input.holdStorage ? new Promise(resolve => { releaseStorage = resolve; }) : Promise.resolve();
  window.__prismFixture = { translations: [], fetches: [], scrolls: [], config: () => stored, translationMode: 'success' };
  window.__prismFixture.releaseStorage = () => releaseStorage?.();
  const bridge = fn => kind === 'firefox'
    ? (...args) => {
      if (args.some(arg => typeof arg === 'function')) throw new Error('Firefox API callback mismatch');
      return Promise.resolve().then(() => fn(...args));
    }
    : (...args) => {
      const callback = args.pop();
      Promise.resolve().then(() => fn(...args)).then(callback);
    };
  const patch = values => {
    const previous = stored;
    stored = window.ObsidianPrismSchema.sanitizeConfig({ ...stored, ...values });
    for (const listener of listeners) listener({ obsidianPrismWebConfig_v1: { oldValue: previous, newValue: stored } }, 'local');
    return stored;
  };
  window.__prismFixture.patch = patch;
  const api = {
    runtime: {
      id: 'offline-fixture', getURL: value => 'chrome-extension://offline-fixture/' + value,
      openOptionsPage: bridge(() => undefined),
      sendMessage: bridge(message => {
        if (message.type === 'OP_CONFIG_PATCH') return { ok: true, config: patch(message.patch) };
        if (message.type === 'OP_TRANSLATE') {
          window.__prismFixture.translations.push(message.text);
          if (window.__prismFixture.translationMode === 'error') return { ok: false, error: 'TRANSLATION_REQUEST_FAILED' };
          if (window.__prismFixture.translationMode === 'deferred') return new Promise(resolve => { window.__prismFixture.resolveTranslation = resolve; });
          return { ok: true, text: '<b id="prism-test-unsafe">Translated offline</b>' };
        }
        return { ok: true };
      })
    },
    storage: { local: { get: bridge(async () => { await storageReady; return { obsidianPrismWebConfig_v1: stored }; }) }, onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } }
  };
  if (kind === 'firefox') window.browser = api; else window.chrome = api;
  const originalScroll = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (...args) { window.__prismFixture.scrolls.push(this.textContent.slice(0, 80)); return originalScroll.apply(this, args); };
  window.fetch = (...args) => { window.__prismFixture.fetches.push(args[0]); return Promise.reject(new Error('No network allowed in offline fixtures')); };
}

async function savedDisabledStartup(browser) {
  const context = await browser.newContext();
  await interceptFixtures(context);
  await context.addInitScript(fixtureBridge, { kind: engine === 'firefox' ? 'firefox' : 'chrome', initial: { enabled: false }, holdStorage: true });
  const page = await context.newPage();
  try {
    await page.goto(fixtureURLs.chatgpt);
    await page.evaluate(() => {
      window.__enabledTransitions = [];
      new MutationObserver(() => __enabledTransitions.push(document.documentElement.getAttribute('data-op-enabled'))).observe(document.documentElement, { attributes: true, attributeFilter: ['data-op-enabled'] });
    });
    for (const content of styles) await page.addStyleTag({ content });
    for (const content of scripts) await page.addScriptTag({ content });
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => ObsidianPrismRuntime.diagnostics().enabled), false);
    assert.equal(await page.locator('[data-op-owned]').count(), 0);
    await page.evaluate(async () => { __prismFixture.releaseStorage(); await ObsidianPrismReady; });
    await page.waitForTimeout(50);
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
    assert.equal(await page.evaluate(() => ObsidianPrismRuntime.diagnostics().enabled), false);
    assert.equal(await page.evaluate(() => __enabledTransitions.includes('true')), false, 'saved disabled state must never briefly activate defaults');
    assert.equal(await page.locator('[data-op-owned]').count(), 0);
    console.log(`PASS ${engine} saved-disabled startup: pageshow and media events cannot activate default settings`);
  } finally { await context.close(); }
}

async function exerciseHomeEffects(browser, host) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'no-preference' });
  await interceptFixtures(context);
  await context.addInitScript(fixtureBridge, { kind: engine === 'firefox' ? 'firefox' : 'chrome', initial: { mascot: 'cat' } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(fixtureURLs[host].replace('/prism-offline-fixture', '/prism-offline-home'));
    const nativeSurfaces = await surfaceSnapshot(page);
    for (const content of styles) await page.addStyleTag({ content });
    for (const content of scripts) await page.addScriptTag({ content });
    await page.waitForFunction(() => document.documentElement.getAttribute('data-op-home') === 'true');
    await page.waitForSelector('#op-ambient-stage', { state: 'attached' });
    assert.equal(await page.locator('.op-ambient-wash .op-aurora').count(), 3);
    assert.equal(await page.locator('[class*="mascot"],[id*="mascot"]').count(), 0, 'legacy pet settings never create a companion');
    assert.equal(await page.evaluate(() => Object.hasOwn(ObsidianPrismSchema.sanitizeConfig(__prismFixture.config()), 'mascot')), false);
    assert.equal(await decorationVisible(page, '.op-ambient-wash'), true);
    assert.equal(await decorationVisible(page, '.op-ambient-glyphs'), true);
    assert.equal(await page.locator('#op-ambient-stage').evaluate(node => getComputedStyle(node).pointerEvents), 'none');
    const geometry = await page.evaluate(() => {
      const stage = document.querySelector('#op-ambient-stage'), primary = document.querySelector('[data-op-main-surface="true"]');
      const a = stage.getBoundingClientRect(), b = primary.getBoundingClientRect();
      return { left: a.left, width: a.width, primaryLeft: b.left, primaryWidth: b.width, behind: Number(getComputedStyle(stage).zIndex) < 0, parent: stage.parentElement === primary };
    });
    assert.equal(geometry.parent, true, 'ambient stage stays inside the recognized chat surface');
    assert.equal(geometry.behind, true, 'ambient art remains behind native text');
    assert.ok(geometry.left >= geometry.primaryLeft - 1 && geometry.width <= geometry.primaryWidth + 2, 'ambient field does not spill across the sidebar');
    assert.notDeepEqual((await surfaceSnapshot(page)).sidebar, nativeSurfaces.sidebar);
    await page.screenshot({ path: path.join(ARTIFACTS, `${engine}-${host}-home-dark.png`) });

    const editor = page.locator('[data-fixture-composer] [contenteditable="true"]');
    await editor.click();
    const focusedGlow = await page.locator('[data-fixture-composer]').evaluate(node => getComputedStyle(node).boxShadow);
    await page.screenshot({ path: path.join(ARTIFACTS, `${engine}-${host}-home-focused.png`) });
    await page.evaluate(() => __prismFixture.patch({ composerGlow: false }));
    await page.waitForFunction(old => getComputedStyle(document.querySelector('[data-fixture-composer]')).boxShadow !== old, focusedGlow);
    const focusedPlain = await page.locator('[data-fixture-composer]').evaluate(node => getComputedStyle(node).boxShadow);
    assert.notEqual(focusedGlow, focusedPlain, 'composer glow switch changes the actual focused shell shadow');
    await page.evaluate(() => __prismFixture.patch({ composerGlow: true }));
    await exerciseNativeComposer(page);

    const slowDuration = await page.locator('.op-aurora').first().evaluate(node => parseFloat(getComputedStyle(node).animationDuration));
    await page.evaluate(() => __prismFixture.patch({ motionSpeed: 'fast' }));
    const fastDuration = await page.locator('.op-aurora').first().evaluate(node => parseFloat(getComputedStyle(node).animationDuration));
    assert.ok(slowDuration > fastDuration && fastDuration > 0, 'movement speed changes real animation timing');
    await page.evaluate(() => __prismFixture.patch({ ambientTexture: 'grid', motionSpeed: 'slow' }));
    assert.equal(await decorationVisible(page, '.op-ambient-grid'), true);
    assert.equal(await decorationVisible(page, '.op-ambient-glyphs'), false);
    await page.evaluate(() => __prismFixture.patch({ ambientStyle: 'spotlight' }));
    assert.equal(await decorationVisible(page, '.op-aurora-one'), true);
    assert.equal(await decorationVisible(page, '.op-aurora-two'), false, 'spotlight switches to one focused light field');
    await page.evaluate(() => __prismFixture.patch({ ambientStyle: 'aurora' }));
    await page.evaluate(() => __prismFixture.patch({ ambientStyle: 'none', semanticAura: false }));
    assert.equal(await decorationVisible(page, '.op-ambient-wash'), false);
    assert.equal(await decorationVisible(page, '.op-ambient-grid'), true, 'texture stays independent when the light field is off');
    await page.evaluate(() => __prismFixture.patch({ ambientTexture: 'off' }));
    assert.equal(await page.locator('#op-ambient-stage').count(), 0, 'turning off the last active layer removes the ambient stage');
    assert.equal(await decorationVisible(page, '.op-ambient-wash'), false);
    assert.equal(await decorationVisible(page, '.op-ambient-grid'), false);
    assert.equal(await decorationVisible(page, '.op-ambient-glyphs'), false);
    await page.evaluate(() => __prismFixture.patch({ ambientStyle: 'aurora', ambientTexture: 'glyphs', ambientIntensity: 0 }));
    assert.equal(await decorationVisible(page, '.op-ambient-wash'), false, 'zero intensity really removes the field');
    await page.evaluate(() => __prismFixture.patch({ ambientIntensity: 65, semanticAura: true }));
    assert.equal(await decorationVisible(page, '.op-ambient-wash'), true);

    await page.evaluate(() => __prismFixture.patch({ motionLevel: 'off' }));
    await assertDecorationsPaused(page);
    await page.evaluate(() => __prismFixture.patch({ motionLevel: 'ultra' }));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.documentElement.getAttribute('data-op-motion') === 'off');
    await assertDecorationsPaused(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => document.documentElement.getAttribute('data-op-visibility') === 'hidden');
    await assertDecorationsPaused(page);
    await page.evaluate(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => document.documentElement.getAttribute('data-op-visibility') === 'visible');

    await page.evaluate(() => __prismFixture.patch({ sidebarStyle: 'native', composerRestyle: false }));
    assert.equal(await page.locator('[data-op-sidebar-surface="true"],[data-op-composer-surface="true"]').count(), 0);
    const restored = await surfaceSnapshot(page);
    assert.deepEqual(restored.sidebar, nativeSurfaces.sidebar, 'Native sidebar mode preserves the host surface');
    assert.deepEqual(restored.composer, nativeSurfaces.composer, 'composer styling off restores the complete native shell');
    await page.evaluate(() => __prismFixture.patch({ sidebarStyle: 'solid', composerRestyle: true, themeMode: 'light', lightPreset: 'crystal', motionLevel: 'subtle' }));
    await page.waitForFunction(() => document.documentElement.getAttribute('data-op-scheme') === 'light');
    await page.screenshot({ path: path.join(ARTIFACTS, `${engine}-${host}-home-light.png`) });
    await page.evaluate(() => ObsidianPrismRuntime.stop());
    assert.equal(await page.locator('[data-op-owned],[data-op-main-surface="true"],[data-op-sidebar-surface="true"],[data-op-composer-surface="true"]').count(), 0);
    assert.deepEqual(await surfaceSnapshot(page), nativeSurfaces);
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine} ${host} blank home: visible effects, true surface styling, controls, no pets, native input and reversible pauses`);
  } catch (error) {
    if (!page.isClosed()) await page.screenshot({ path: path.join(ARTIFACTS, `${engine}-${host}-home-failure.png`) }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

async function exerciseFixture(browser, host) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
  await interceptFixtures(context);
  await context.addInitScript(fixtureBridge, engine === 'firefox' ? 'firefox' : 'chrome');
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(fixtureURLs[host]);
    const originalText = await page.locator('pre code').textContent();
    const originalBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const originalSurfaces = await surfaceSnapshot(page);
    await page.evaluate(() => {
      window.__nativeCode = document.querySelector('pre code');
      window.__nativeCopy = document.querySelector('[data-native-copy]');
      window.__copyCount = 0;
      window.__nativeCopy.addEventListener('click', () => { window.__copyCount++; });
      window.__nativeComposer = document.querySelector('[data-fixture-composer]');
      window.__nativeEditor = __nativeComposer.querySelector('[contenteditable="true"]');
      __nativeComposer.setAttribute('data-op-composer-surface', 'fixture-original');
    });
    for (const content of styles) await page.addStyleTag({ content });
    for (const content of scripts) await page.addScriptTag({ content });
    await page.waitForFunction(() => window.ObsidianPrismRuntime?.diagnostics().enabled);
    await page.waitForSelector('.op-code-fold-bar');
    await page.waitForFunction(() => document.querySelector('[data-fixture-composer]')?.getAttribute('data-op-composer-surface') === 'true');
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-op-home')), 'false');
    assert.equal(await page.locator('[data-fixture-sidebar][data-op-sidebar-surface="true"]').count(), 1);
    assert.ok(await page.locator('[data-op-main-surface="true"]').count());
    const themedSurfaces = await surfaceSnapshot(page);
    assert.notDeepEqual(themedSurfaces.sidebar, originalSurfaces.sidebar, 'a recognized sidebar must actually receive the theme');
    assert.notDeepEqual(themedSurfaces.composer, originalSurfaces.composer, 'the complete composer shell must actually receive the theme');
    assert.equal(await page.evaluate(() => document.querySelector('[data-fixture-composer] [contenteditable="true"]') === __nativeEditor), true);
    assert.equal(await page.locator('[class*="mascot"],[id*="mascot"]').count(), 0, 'pet UI is removed completely');
    await page.screenshot({ path: path.join(ARTIFACTS, `${engine}-${host}-default.png`), fullPage: true });
    await exerciseNativeComposer(page);

    assert.equal(await page.evaluate(host => ObsidianPrismAdapters.forHost(host).userTurns().length, host), 3, `${host}: no nested duplicate turns`);
    assert.equal(await page.evaluate(host => ObsidianPrismAdapters.forHost(host).assistantTurns().length, host), 3);
    assert.equal(await page.locator('.op-code-fold-bar').count(), 1);
    assert.equal(await page.locator('.op-code-fold-bar').evaluate(node => node.tagName), 'BUTTON');
    await page.locator('.op-code-fold-bar').click();
    assert.equal(await page.locator('pre.op-code-folded').count(), 1);
    assert.equal(await page.locator('pre code').textContent(), originalText);
    await page.evaluate(() => __prismFixture.patch({ longCodeFold: false }));
    await page.waitForFunction(() => !document.querySelector('.op-code-fold-bar'));
    assert.equal(await page.locator('pre.op-code-folded').count(), 0);
    await page.evaluate(() => __prismFixture.patch({ longCodeFold: true }));
    await page.waitForSelector('.op-code-fold-bar');
    assert.equal(await page.locator('.op-code-fold-bar').count(), 1, 're-enable attaches exactly one fold control');
    assert.equal(await page.evaluate(() => document.querySelector('pre code') === __nativeCode), true);
    await page.locator('[data-native-copy]').click();
    assert.equal(await page.evaluate(() => __copyCount), 1, 'native copy control and listeners are preserved');

    await page.locator('.op-rail-toggle').click();
    await page.locator('.op-rail-search').fill('optimization');
    assert.equal(await page.locator('.op-rail-item:visible').count(), 1);
    await page.locator('.op-rail-item:visible').click();
    assert.ok((await page.evaluate(() => __prismFixture.scrolls)).some(text => text.includes('optimization')));
    await page.locator('.op-rail-search').fill('');
    const blockedWhileEditing = await page.evaluate(() => {
      const editor = document.querySelector('[contenteditable="true"]'); editor.focus();
      const event = new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true });
      editor.dispatchEvent(event); return event.defaultPrevented;
    });
    assert.equal(blockedWhileEditing, false, 'typing retains native keyboard behavior');
    assert.equal(await page.evaluate(() => {
      document.activeElement.blur();
      const event = new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event); return event.defaultPrevented;
    }), true, 'shortcut activates outside editable areas');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => __prismFixture.patch({ motionLevel: 'ultra' }));
    await page.waitForFunction(() => document.documentElement.getAttribute('data-op-motion') === 'off');
    await assertDecorationsPaused(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => __prismFixture.patch({ motionLevel: 'subtle' }));

    // Exercise the exact own-mutation regression from the supplied prototype.
    await page.waitForTimeout(1500);
    const beforeIdle = await page.evaluate(() => ObsidianPrismRuntime.diagnostics().passes);
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => ObsidianPrismRuntime.diagnostics().passes), beforeIdle, 'idle runtime must not rescan itself');
    await page.evaluate(() => document.querySelector('[data-op-owned]').appendChild(document.createTextNode('owned test mutation')));
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => ObsidianPrismRuntime.diagnostics().passes), beforeIdle, 'owned nested text mutations are ignored');
    await page.evaluate(() => {
      const text = document.querySelector('[data-stream-fixture]').firstChild;
      text.nodeValue += ' Additional streamed text.';
    });
    await page.waitForTimeout(1600);
    const afterStream = await page.evaluate(() => ObsidianPrismRuntime.diagnostics().passes);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => ObsidianPrismRuntime.diagnostics().passes), afterStream, 'runtime settles after assistant text changes');

    assert.equal(await page.locator('.op-translate-button').count(), 0, 'translation is disabled by default');
    assert.deepEqual(await page.evaluate(() => __prismFixture.translations), []);
    assert.deepEqual(await page.evaluate(() => __prismFixture.fetches), []);
    await page.evaluate(() => __prismFixture.patch({ thoughtTranslate: true, thoughtEndpoint: 'https://translate.example.test/v1/chat/completions', thoughtModel: 'offline-model' }));
    await page.waitForSelector('.op-translate-button');
    assert.equal(await page.locator('.op-translate-button').count(), 1);
    assert.deepEqual(await page.evaluate(() => __prismFixture.translations), [], 'enabling translation does not transmit text');
    await page.evaluate(() => document.querySelector('.op-translate-button').click());
    assert.deepEqual(await page.evaluate(() => __prismFixture.translations), [], 'synthetic page clicks cannot transmit text');
    await page.locator('.op-translate-button').click();
    await page.waitForFunction(() => __prismFixture.translations.length === 1);
    assert.equal(await page.locator('#prism-test-unsafe').count(), 0, 'translated markup must remain inert text');
    assert.ok((await page.evaluate(() => __prismFixture.translations[0])).startsWith('Visible reasoning summary'));
    await page.evaluate(() => __prismFixture.patch({ thoughtTranslate: false }));
    await page.waitForFunction(() => !document.querySelector('.op-translate-button'));
    await page.evaluate(() => __prismFixture.patch({ thoughtTranslate: true }));
    await page.waitForSelector('.op-translate-button');
    assert.equal(await page.locator('.op-translate-button').count(), 1, 'translation re-enable creates exactly one control');

    // Error text is not a translation and must never hide the original source.
    await page.evaluate(() => { __prismFixture.translationMode = 'error'; });
    await page.locator('.op-translate-button').click();
    await page.waitForFunction(() => document.querySelector('.op-thought-result')?.textContent.includes('Translation failed'));
    await page.evaluate(() => __prismFixture.patch({ thoughtView: 'immersive' }));
    assert.equal(await page.locator('[data-thought-fixture]').evaluate(node => node.classList.contains('op-thought-hidden')), false);
    assert.equal(await page.locator('.op-translation-toggle').isHidden(), true);

    // A response for text that has changed while waiting must be discarded.
    await page.evaluate(() => { __prismFixture.translationMode = 'deferred'; });
    await page.locator('.op-translate-button').click();
    await page.waitForFunction(() => typeof __prismFixture.resolveTranslation === 'function');
    await page.evaluate(() => {
      document.querySelector('[data-thought-fixture]').textContent += ' Source changed while waiting.';
      __prismFixture.resolveTranslation({ ok: true, text: 'STALE_RESPONSE_SHOULD_NOT_APPEAR' });
    });
    await page.waitForFunction(() => !document.querySelector('.op-translate-button').disabled);
    assert.equal(await page.locator('.op-thought-result').textContent(), 'The source changed. Translate it again.');
    assert.equal(await page.locator('[data-thought-fixture]').evaluate(node => node.classList.contains('op-thought-hidden')), false);

    await page.evaluate(host => {
      __prismFixture.translationMode = 'success';
      const details = document.createElement('details'); details.id = 'prism-closed-thought-fixture';
      const summary = document.createElement('summary'); summary.textContent = 'Collapsed thoughts';
      const text = document.createElement('div');
      text.setAttribute(host === 'chatgpt' ? 'data-testid' : 'data-test-id', 'thoughts-content');
      text.textContent = 'Only translate this synthetic summary after it is opened.';
      details.append(summary, text); document.querySelector('main').append(details);
    }, host);
    await page.waitForTimeout(220);
    assert.equal(await page.locator('.op-translate-button').count(), 1, 'closed details receive no translation toolbar');
    await page.locator('#prism-closed-thought-fixture summary').click();
    await page.waitForFunction(() => document.querySelectorAll('.op-translate-button').length === 2);
    await page.evaluate(() => document.querySelector('#prism-closed-thought-fixture').remove());
    await page.waitForFunction(() => document.querySelectorAll('.op-translate-button').length === 1);

    await page.evaluate(() => __prismFixture.patch({ enabled: false }));
    await page.waitForFunction(() => !document.documentElement.hasAttribute('data-op-enabled'));
    assert.equal(await page.locator('[data-op-owned]').count(), 0);
    assert.equal(await page.locator('pre.op-code-folded').count(), 0);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), originalBackground);
    assert.deepEqual(await surfaceSnapshot(page), originalSurfaces, 'disable restores native sidebar and composer styles');
    assert.equal(await page.locator('[data-fixture-composer]').getAttribute('data-op-composer-surface'), 'fixture-original');
    assert.equal(await page.locator('[data-op-sidebar-surface="true"],[data-op-main-surface="true"]').count(), 0);
    assert.equal(await page.locator('pre code').textContent(), originalText);
    assert.equal(await page.evaluate(() => ObsidianPrismRuntime.diagnostics().observing), false);
    await page.evaluate(() => __prismFixture.patch({ enabled: true }));
    await page.waitForSelector('.op-code-fold-bar');
    assert.equal(await page.locator('.op-code-fold-bar').count(), 1);

    await page.evaluate(() => {
      document.body.classList.add('light-theme');
      __prismFixture.patch({ palette: 'host' });
    });
    await page.waitForFunction(() => document.documentElement.getAttribute('data-op-scheme') === 'light');
    await page.evaluate(() => document.body.classList.replace('light-theme', 'dark-theme'));
    await page.waitForFunction(() => document.documentElement.getAttribute('data-op-scheme') === 'dark');
    await page.evaluate(() => __prismFixture.patch({ palette: 'obsidian' }));

    // A framework may replace its body; the extension must observe the new one.
    await page.evaluate(html => {
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      document.body.replaceWith(document.importNode(parsed.body, true));
      history.pushState({}, '', location.pathname + '?conversation=next');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, fixtures[host]);
    await page.waitForSelector('.op-code-fold-bar');
    await page.waitForSelector('#op-rail-root');
    await page.waitForSelector('#op-bottom-dock');
    assert.equal(await page.locator('.op-code-fold-bar').count(), 1);
    assert.equal(await page.locator('#op-rail-root').count(), 1);
    assert.equal(await page.locator('pre code').textContent(), originalText);
    await page.waitForFunction(() => document.querySelector('[data-fixture-composer]')?.getAttribute('data-op-composer-surface') === 'true');
    assert.equal(await page.evaluate(() => __nativeComposer.getAttribute('data-op-composer-surface')), 'fixture-original', 'replaced native surfaces are restored before being forgotten');
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      for (const id of ['op-rail-root', 'op-bottom-dock', 'op-ambient-stage']) document.getElementById(id)?.remove();
    });
    await page.waitForSelector('#op-rail-root');
    await page.waitForSelector('#op-bottom-dock');
    await page.waitForSelector('#op-ambient-stage', { state: 'attached' });
    assert.equal(await page.locator('#op-rail-root').count(), 1, 'stripped owned roots recover without duplication');

    await page.evaluate(() => ObsidianPrismRuntime.stop());
    const stopped = await page.evaluate(() => ObsidianPrismRuntime.diagnostics());
    assert.equal(stopped.enabled, false);
    assert.equal(stopped.observing, false);
    assert.equal(stopped.pending, false);
    assert.equal(stopped.codeBlocks, 0);
    assert.equal(stopped.thoughtBlocks, 0);
    assert.equal(await page.locator('[data-op-owned]').count(), 0);
    assert.equal(await page.locator('[data-op-composer-surface="true"],[data-op-sidebar-surface="true"],[data-op-main-surface="true"]').count(), 0);
    assert.equal(await page.locator('pre.op-code-folded').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-op-enabled')), false);
    await page.evaluate(() => { __prismFixture.patch({ enabled: true }); window.dispatchEvent(new Event('pageshow')); document.body.append(document.createElement('div')); });
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => ObsidianPrismRuntime.diagnostics().passes), stopped.passes, 'stop removes observers and event hooks permanently');
    assert.equal(await page.locator('[data-op-owned]').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine} ${host} offline fixture: theme restore, fold lifecycle, outline/search/shortcuts, reduced motion, idle observer, explicit translation, body replacement and permanent stop`);
  } catch (error) {
    if (!page.isClosed()) await page.screenshot({ path: path.join(ARTIFACTS, `${engine}-${host}-failure.png`), fullPage: true }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

if (engine === 'chromium' && process.env.PRISM_SKIP_EXTENSION !== '1') await actualChromiumExtension();
else console.log(`NOTE ${engine}: this run covers injected offline DOM fixtures only, not native extension installation.`);
const browser = await type.launch(launchOptions);
try {
  await savedDisabledStartup(browser);
  for (const host of ['chatgpt', 'gemini']) {
    await exerciseHomeEffects(browser, host);
    await exerciseFixture(browser, host);
  }
}
finally { await browser.close(); }
console.log('Browser suite completed. These are synthetic DOM fixtures, not validation against signed-in production websites.');
