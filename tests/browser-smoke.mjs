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
const fixtureURLs = { chatgpt: 'https://chatgpt.com/prism-offline-fixture', gemini: 'https://gemini.google.com/prism-offline-fixture' };
const scriptFiles = ['src/config-schema.js', 'src/early-boot.js', 'src/adapters.js', 'src/content.js'];
const scripts = await Promise.all(scriptFiles.map(source));
const styles = await Promise.all(['styles/prism-tokens.css', 'styles/hosts.css'].map(source));

async function interceptFixtures(context) {
  await context.route(/^https?:\/\//, async route => {
    const url = new URL(route.request().url());
    const host = url.hostname === 'chatgpt.com' ? 'chatgpt' : url.hostname === 'gemini.google.com' ? 'gemini' : null;
    if (host && url.pathname === '/prism-offline-fixture') return route.fulfill({ status: 200, contentType: 'text/html', body: fixtures[host] });
    // Every non-fixture HTTP request is blocked, including translation endpoints.
    return route.abort('blockedbyclient');
  });
}

async function actualChromiumExtension() {
  const extensionDir = path.resolve(ROOT, process.env.PRISM_EXTENSION_DIR || 'dist/chrome');
  const manifest = JSON.parse(await fs.readFile(path.join(extensionDir, 'manifest.json'), 'utf8'));
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'prism-extension-test-'));
  let context, options, chat;
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
    await options.evaluate(() => ObsidianPrismSchema.saveConfig({ themeMode: 'light', lightPreset: 'alabaster' }));
    await options.waitForFunction(() => document.documentElement.getAttribute('data-op-scheme') === 'light');
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
    assert.equal(await options.locator('#tab-reading').getAttribute('aria-selected'), 'true');
    assert.deepEqual(errors, []);
    console.log('PASS Chromium unpacked extension: service worker, options, serialized settings, live content updates and keyboard tabs');
  } catch (error) {
    const current = chat || options;
    if (current && !current.isClosed()) await current.screenshot({ path: path.join(ARTIFACTS, 'chromium-extension-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    if (context) await context.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
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
    await page.evaluate(() => {
      window.__nativeCode = document.querySelector('pre code');
      window.__nativeCopy = document.querySelector('[data-native-copy]');
      window.__copyCount = 0;
      window.__nativeCopy.addEventListener('click', () => { window.__copyCount++; });
    });
    for (const content of styles) await page.addStyleTag({ content });
    for (const content of scripts) await page.addScriptTag({ content });
    await page.waitForFunction(() => window.ObsidianPrismRuntime?.diagnostics().enabled);
    await page.waitForSelector('.op-code-fold-bar');
    await page.screenshot({ path: path.join(ARTIFACTS, `${engine}-${host}-default.png`), fullPage: true });

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
    }, fixtures[host]);
    await page.waitForSelector('.op-code-fold-bar');
    await page.waitForSelector('#op-rail-root');
    await page.waitForSelector('#op-bottom-dock');
    assert.equal(await page.locator('.op-code-fold-bar').count(), 1);
    assert.equal(await page.locator('#op-rail-root').count(), 1);
    assert.equal(await page.locator('pre code').textContent(), originalText);
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
  for (const host of ['chatgpt', 'gemini']) await exerciseFixture(browser, host);
}
finally { await browser.close(); }
console.log('Browser suite completed. These are synthetic DOM fixtures, not validation against signed-in production websites.');
