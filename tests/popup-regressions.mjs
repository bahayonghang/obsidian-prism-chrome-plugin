/** Action-popup sizing regressions. All pages and settings are synthetic. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { waitUntil } from './measure.mjs';

function assertUsableLayout(layout, label) {
  assert.ok(layout.width >= 439 && layout.width <= 441, `${label}: natural width should be 440 px, got ${layout.width}`);
  assert.ok(layout.height >= 599 && layout.height <= 601, `${label}: natural height should be 600 px, got ${layout.height}`);
  assert.ok(layout.bodyWidth >= 439 && layout.bodyHeight >= 599, `${label}: body must supply its own usable size`);
  assert.ok(layout.scrollWidth <= layout.width + 1 && layout.scrollHeight <= layout.height + 2, `${label}: outer document must not scroll`);
  for (const [name, box] of Object.entries(layout.controls)) {
    assert.ok(box && box.width > 0 && box.height > 0 && box.top >= -1 && box.bottom <= layout.height + 1 && box.left >= -1 && box.right <= layout.width + 1, `${label}: ${name} must be visible inside the natural popup`);
  }
  assert.ok(layout.controls.workspace.height >= 250, `${label}: settings workspace must have usable space`);
}

async function actionLayout(options) {
  return options.evaluate(() => {
    const win = chrome.extension.getViews({ type: 'popup' })[0];
    if (!win) return null;
    const doc = win.document;
    const box = selector => {
      const el = doc.querySelector(selector);
      if (!el || win.getComputedStyle(el).display === 'none') return null;
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    };
    return { width: win.innerWidth, height: win.innerHeight, bodyWidth: doc.body.getBoundingClientRect().width, bodyHeight: doc.body.getBoundingClientRect().height,
      scrollWidth: doc.documentElement.scrollWidth, scrollHeight: doc.documentElement.scrollHeight, activeTab: doc.body.dataset.activeTab,
      controls: { header: box('.brand'), uiThemeButton: box('#btn-ui-theme'), tabs: box('.tabs'), workspace: box('#settings-scroll'), footer: box('footer') } };
  });
}

// Playwright does not expose Chromium's extension "other" target as a Page.
// Attach only to capture its actual surface; never override device metrics.
async function popupCapture(cdp, url) {
  let target;
  const deadline = Date.now() + 5000;
  while (!target && Date.now() < deadline) {
    target = (await cdp.send('Target.getTargets')).targetInfos.find(info => info.url === url && ['other', 'page'].includes(info.type));
    if (!target) await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(target, 'chrome.action.openPopup must create a real popup CDP target');
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  const pending = new Map();
  let sequence = 0;
  const onMessage = event => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message), request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id); clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  };
  cdp.on('Target.receivedMessageFromTarget', onMessage);
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Popup CDP ${method} timed out`)); }, 5000);
    pending.set(id, { resolve, reject, timer });
    cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(error => {
      pending.delete(id); clearTimeout(timer); reject(error);
    });
  });
  return {
    targetType: target.type,
    async screenshot(filename) {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await fs.writeFile(filename, Buffer.from(shot.data, 'base64'));
    },
    async dispose() {
      cdp.off('Target.receivedMessageFromTarget', onMessage);
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Popup capture disposed')); }
      pending.clear();
      await cdp.send('Target.detachFromTarget', { sessionId }).catch(() => {});
    }
  };
}

export async function checkRealActionPopup({ context, worker, options, popupURL, artifacts }) {
  const cdp = await context.browser().newBrowserCDPSession();
  const original = await options.evaluate(() => ObsidianPrismSchema.loadConfig());
  const measurements = [];
  let capture;
  try {
    // Each opening creates a fresh action document, as a toolbar click does.
    for (const scheme of ['dark', 'light']) {
      await options.evaluate(scheme => ObsidianPrismSchema.saveConfig({ uiThemeMode: scheme }), scheme);
      await worker.evaluate(async () => {
        const win = await chrome.windows.getLastFocused();
        await chrome.windows.update(win.id, { focused: true });
        await chrome.action.openPopup({ windowId: win.id });
      });
      await options.waitForFunction(() => {
        const win = chrome.extension.getViews({ type: 'popup' })[0];
        return win && win.document.querySelector('#settings-fields')?.disabled === false;
      });
      await options.evaluate(async () => {
        const win = chrome.extension.getViews({ type: 'popup' })[0];
        let timer;
        try {
          await Promise.race([
            win.document.fonts.ready.then(() => new Promise(resolve => win.requestAnimationFrame(() => win.requestAnimationFrame(resolve)))),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Visible action popup did not render within 4 seconds')), 4000); })
          ]);
        } finally { clearTimeout(timer); }
      });
      const contexts = await worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['POPUP'] }));
      assert.ok(contexts.some(value => value.documentUrl === popupURL), 'Chrome must report a POPUP context, not an ordinary tab');
      const uiState = await options.evaluate(() => {
        const win = chrome.extension.getViews({ type: 'popup' })[0];
        const doc = win.document;
        return {
          rootScheme: doc.documentElement.getAttribute('data-op-scheme'),
          computedColorScheme: win.getComputedStyle(doc.documentElement).colorScheme,
          buttonTheme: doc.getElementById('btn-ui-theme')?.dataset.uiTheme,
          selectTheme: doc.getElementById('cfg-uiThemeMode')?.value
        };
      });
      assert.deepEqual(uiState, { rootScheme: scheme, computedColorScheme: scheme, buttonTheme: scheme, selectTheme: scheme }, `real action popup UI theme must lock to ${scheme}`);
      const initial = await actionLayout(options);
      measurements.push({ scheme, contextTypes: contexts.map(value => value.contextType), initial });
      capture = await popupCapture(cdp, popupURL);
      measurements.at(-1).targetType = capture.targetType;
      await capture.screenshot(path.join(artifacts, `chromium-action-popup-${scheme}.png`));
      assertUsableLayout(initial, `${scheme} action popup`);
      if (scheme === 'dark') {
        await options.evaluate(() => {
          const doc = chrome.extension.getViews({ type: 'popup' })[0].document;
          const select = doc.getElementById('cfg-language');
          select.value = 'zh-CN';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await options.waitForFunction(() => chrome.extension.getViews({ type: 'popup' })[0]?.document.documentElement.lang === 'zh-CN');
        const zhLayout = await actionLayout(options);
        assertUsableLayout(zhLayout, `${scheme} action popup zh-CN`);
        await options.evaluate(() => {
          const doc = chrome.extension.getViews({ type: 'popup' })[0].document;
          const select = doc.getElementById('cfg-language');
          select.value = 'en-US';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await options.waitForFunction(() => chrome.extension.getViews({ type: 'popup' })[0]?.document.documentElement.lang === 'en-US');
      }
      await options.evaluate(() => chrome.extension.getViews({ type: 'popup' })[0].document.getElementById('tab-motion').click());
      await options.waitForFunction(() => chrome.extension.getViews({ type: 'popup' })[0]?.document.body.dataset.activeTab === 'motion');
      const motion = await actionLayout(options);
      measurements.at(-1).motion = motion;
      assertUsableLayout(motion, `${scheme} action popup motion panel`);
      if (scheme === 'dark') {
        await options.evaluate(() => chrome.extension.getViews({ type: 'popup' })[0].document.querySelector('[data-choice="ambientStyle"][data-value="spotlight"]').click());
        await waitUntil(() => options.evaluate(async () => (await ObsidianPrismSchema.loadConfig()).ambientStyle === 'spotlight' && chrome.extension.getViews({ type: 'popup' })[0].document.getElementById('cfg-ambientStyle').value === 'spotlight'), 'action popup ambientStyle=spotlight');
      } else {
        const reopenedStyle = await options.evaluate(async () => ({ saved: (await ObsidianPrismSchema.loadConfig()).ambientStyle, control: chrome.extension.getViews({ type: 'popup' })[0].document.getElementById('cfg-ambientStyle').value }));
        assert.deepEqual(reopenedStyle, { saved: 'spotlight', control: 'spotlight' }, 'a setting saved from the real action popup survives closing and reopening');
        measurements.at(-1).persistedAmbientStyle = reopenedStyle;
      }
      await capture.screenshot(path.join(artifacts, `chromium-action-popup-motion-${scheme}.png`));
      await options.evaluate(() => chrome.extension.getViews({ type: 'popup' })[0].document.getElementById('tab-reading').click());
      await options.waitForFunction(() => chrome.extension.getViews({ type: 'popup' })[0]?.document.body.dataset.activeTab === 'reading');
      const reading = await actionLayout(options);
      measurements.at(-1).reading = reading;
      assertUsableLayout(reading, `${scheme} action popup reading panel`);
      if (scheme === 'dark') {
        const initialFormula = await options.evaluate(() => {
          const doc = chrome.extension.getViews({ type: 'popup' })[0].document;
          const input = doc.getElementById('cfg-formulaPreview');
          return {
            exists: Boolean(input),
            checked: input?.checked,
            label: doc.querySelector('label[for="cfg-formulaPreview"]')?.textContent || ''
          };
        });
        assert.equal(initialFormula.exists, true, 'real action popup Reading tab must expose #cfg-formulaPreview');
        assert.equal(initialFormula.checked, true, 'real action popup #cfg-formulaPreview must default to checked');
        assert.ok(initialFormula.label.includes('Formula preview'), `expected Formula preview label, got "${initialFormula.label}"`);
        await options.evaluate(() => chrome.extension.getViews({ type: 'popup' })[0].document.getElementById('cfg-formulaPreview').click());
        await waitUntil(() => options.evaluate(async () => (await ObsidianPrismSchema.loadConfig()).formulaPreview === false && chrome.extension.getViews({ type: 'popup' })[0].document.getElementById('cfg-formulaPreview').checked === false), 'action popup formulaPreview=false');
      } else {
        const reopenedFormula = await options.evaluate(async () => {
          const doc = chrome.extension.getViews({ type: 'popup' })[0].document;
          const input = doc.getElementById('cfg-formulaPreview');
          return {
            saved: (await ObsidianPrismSchema.loadConfig()).formulaPreview,
            checked: input?.checked
          };
        });
        assert.deepEqual(reopenedFormula, { saved: false, checked: false }, 'formulaPreview saved from the real action popup survives closing and reopening');
        measurements.at(-1).persistedFormulaPreview = reopenedFormula;
        await options.evaluate(() => chrome.extension.getViews({ type: 'popup' })[0].document.getElementById('cfg-formulaPreview').click());
        await waitUntil(() => options.evaluate(async () => (await ObsidianPrismSchema.loadConfig()).formulaPreview === true && chrome.extension.getViews({ type: 'popup' })[0].document.getElementById('cfg-formulaPreview').checked === true), 'action popup formulaPreview=true');
        // Verify palette card clicks under themeMode: 'auto' (including already-checked defaults) + #btn-ui-theme sync & reopen persistence.
        await options.evaluate(() => ObsidianPrismSchema.saveConfig({ themeMode: 'auto', palette: 'obsidian', lightPreset: 'crystal' }));
        await options.evaluate(() => chrome.extension.getViews({ type: 'popup' })[0].document.getElementById('tab-appearance').click());
        await options.waitForFunction(() => chrome.extension.getViews({ type: 'popup' })[0]?.document.body.dataset.activeTab === 'appearance');
        await options.evaluate(() => chrome.extension.getViews({ type: 'popup' })[0].document.querySelector('input[data-palette-key="lightPreset"][value="crystal"]').closest('.palette').click());
        await options.waitForFunction(() => chrome.extension.getViews({ type: 'popup' })[0]?.document.getElementById('chat-preview').dataset.previewPalette === 'crystal');
        assert.equal(await options.evaluate(async () => (await ObsidianPrismSchema.loadConfig()).themeMode), 'auto', 'clicking checked light palette card must preserve themeMode auto');
        await options.evaluate(() => chrome.extension.getViews({ type: 'popup' })[0].document.querySelector('input[data-palette-key="palette"][value="obsidian"]').closest('.palette').click());
        await options.waitForFunction(() => chrome.extension.getViews({ type: 'popup' })[0]?.document.getElementById('chat-preview').dataset.previewPalette === 'obsidian');
        assert.equal(await options.evaluate(async () => (await ObsidianPrismSchema.loadConfig()).themeMode), 'auto', 'clicking checked dark palette card must preserve themeMode auto');
        await options.evaluate(() => chrome.extension.getViews({ type: 'popup' })[0].document.querySelector('input[data-palette-key="lightPreset"][value="alabaster"]').closest('.palette').click());
        await waitUntil(() => options.evaluate(async () => (await ObsidianPrismSchema.loadConfig()).lightPreset === 'alabaster' && chrome.extension.getViews({ type: 'popup' })[0]?.document.getElementById('chat-preview').dataset.previewPalette === 'alabaster'), 'action popup lightPreset=alabaster');
        assert.equal(await options.evaluate(async () => (await ObsidianPrismSchema.loadConfig()).themeMode), 'auto');
        await options.evaluate(() => chrome.extension.getViews({ type: 'popup' })[0].document.getElementById('btn-ui-theme').click());
        await waitUntil(() => options.evaluate(async () => {
          const popupDoc = chrome.extension.getViews({ type: 'popup' })[0]?.document;
          const saved = await ObsidianPrismSchema.loadConfig();
          return saved.uiThemeMode === 'dark'
            && popupDoc?.documentElement.getAttribute('data-op-scheme') === 'dark'
            && popupDoc?.getElementById('cfg-uiThemeMode')?.value === 'dark'
            && document.documentElement.getAttribute('data-op-scheme') === 'dark'
            && document.getElementById('cfg-uiThemeMode')?.value === 'dark';
        }), 'action popup btn-ui-theme sync uiThemeMode=dark');
      }
      await capture.dispose(); capture = null;
      await options.evaluate(() => chrome.extension.getViews({ type: 'popup' })[0].close());
      await options.waitForFunction(() => chrome.extension.getViews({ type: 'popup' }).length === 0);
    }
    // Reopen real action popup once more to verify uiThemeMode saved via header toggle survives close/reopen.
    await worker.evaluate(async () => {
      const win = await chrome.windows.getLastFocused();
      await chrome.windows.update(win.id, { focused: true });
      await chrome.action.openPopup({ windowId: win.id });
    });
    await options.waitForFunction(() => chrome.extension.getViews({ type: 'popup' })[0]?.document.querySelector('#settings-fields')?.disabled === false);
    const reopenedUi = await options.evaluate(async () => {
      const win = chrome.extension.getViews({ type: 'popup' })[0];
      const doc = win.document;
      return {
        saved: (await ObsidianPrismSchema.loadConfig()).uiThemeMode,
        rootScheme: doc.documentElement.getAttribute('data-op-scheme'),
        computedColorScheme: win.getComputedStyle(doc.documentElement).colorScheme,
        buttonTheme: doc.getElementById('btn-ui-theme')?.dataset.uiTheme,
        selectTheme: doc.getElementById('cfg-uiThemeMode')?.value
      };
    });
    assert.deepEqual(reopenedUi, { saved: 'dark', rootScheme: 'dark', computedColorScheme: 'dark', buttonTheme: 'dark', selectTheme: 'dark' }, 'uiThemeMode toggled in real action popup survives close/reopen');
    await options.evaluate(() => chrome.extension.getViews({ type: 'popup' })[0].close());
    await options.waitForFunction(() => chrome.extension.getViews({ type: 'popup' }).length === 0);
    console.log('PASS Chromium real toolbar action popup: natural size, visible controls, uiThemeMode sync, palette clicks, settings persistence, close and reopen (no viewport override)');
  } catch (error) {
    if (capture) await capture.screenshot(path.join(artifacts, 'chromium-action-popup-failure.png')).catch(() => {});
    throw error;
  } finally {
    await fs.writeFile(path.join(artifacts, 'chromium-action-popup-metrics.json'), JSON.stringify(measurements, null, 2));
    if (capture) await capture.dispose();
    await options.evaluate(() => chrome.extension.getViews({ type: 'popup' }).forEach(win => win.close())).catch(() => {});
    await cdp.detach();
    await options.evaluate(config => ObsidianPrismSchema.saveConfig({ themeMode: config.themeMode, uiThemeMode: config.uiThemeMode, palette: config.palette, lightPreset: config.lightPreset, ambientStyle: config.ambientStyle, formulaPreview: config.formulaPreview, language: config.language }), original).catch(() => {});
  }
}

export async function checkPopupIntrinsicSize({ browser, root, engine, fixtureBridge, artifacts }) {
  const context = await browser.newContext();
  const origin = 'https://prism-popup-fixture.invalid';
  const assets = new Map(await Promise.all(['popup/popup.html', 'popup/popup.css', 'popup/popup.js', 'src/config-schema.js', 'styles/prism-tokens.css', 'icons/icon-48.png'].map(async file => ['/' + file, await fs.readFile(path.join(root, file))])));
  await context.route(/^https?:\/\//, route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort('blockedbyclient');
    if (url.pathname === '/intrinsic') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>Popup intrinsic sizing regression</title><iframe id="popup-sizer" title="Synthetic popup sizing probe" src="/popup/popup.html" style="display:block;width:25px;height:25px;border:0"></iframe>' });
    const body = assets.get(url.pathname);
    if (!body) return route.abort('blockedbyclient');
    const type = url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.png') ? 'image/png' : 'text/html';
    return route.fulfill({ contentType: type, body });
  });
  await context.addInitScript(fixtureBridge, engine === 'firefox' ? 'firefox' : 'chrome');
  const page = await context.newPage();
  try {
    await page.goto(origin + '/intrinsic');
    await page.waitForFunction(() => document.querySelector('#popup-sizer')?.contentDocument?.querySelector('#settings-fields')?.disabled === false);
    const frame = page.frames().find(value => value.url() === origin + '/popup/popup.html');
    assert.ok(frame);
    const intrinsic = await frame.evaluate(() => ({ viewportWidth: innerWidth, viewportHeight: innerHeight, width: document.body.getBoundingClientRect().width, height: document.body.getBoundingClientRect().height }));
    assert.equal(intrinsic.viewportWidth, 25);
    assert.equal(intrinsic.viewportHeight, 25);
    assert.ok(intrinsic.width >= 439 && intrinsic.width <= 441 && intrinsic.height >= 599 && intrinsic.height <= 601, `${engine}: popup must retain its intrinsic 440×600 layout before the browser expands a tiny initial viewport: ${JSON.stringify(intrinsic)}`);
    // Only after checking the tiny initial layout, emulate the browser sizing
    // the iframe from that measured content size. This is not an installed add-on.
    await page.locator('#popup-sizer').evaluate((node, size) => { node.style.width = Math.ceil(size.width) + 'px'; node.style.height = Math.ceil(size.height) + 'px'; }, intrinsic);
    await frame.waitForFunction(() => innerWidth >= 439 && innerHeight >= 599);
    // Verify uiThemeMode: 'auto' reacts live to system color-scheme changes while preserving Host Surface preview.
    await page.emulateMedia({ colorScheme: 'light' });
    await frame.waitForFunction(() => document.documentElement.getAttribute('data-op-scheme') === 'light' && getComputedStyle(document.documentElement).colorScheme === 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await frame.waitForFunction(() => document.documentElement.getAttribute('data-op-scheme') === 'dark' && getComputedStyle(document.documentElement).colorScheme === 'dark');
    // Header toggle cycles auto -> light without altering Host Surface preview (dark/obsidian).
    await frame.locator('#btn-ui-theme').click();
    await frame.waitForFunction(() => document.documentElement.getAttribute('data-op-scheme') === 'light' && getComputedStyle(document.documentElement).colorScheme === 'light');
    assert.equal(await frame.locator('#btn-ui-theme').getAttribute('data-ui-theme'), 'light');
    assert.equal(await frame.locator('#cfg-uiThemeMode').inputValue(), 'light');
    assert.equal(await frame.locator('#chat-preview').getAttribute('data-preview-scheme'), 'dark');
    assert.equal(await frame.locator('#chat-preview').getAttribute('data-preview-palette'), 'obsidian');
    // Dropdown locks explicit dark even when media emulates light.
    await frame.locator('#cfg-uiThemeMode').selectOption('dark');
    await frame.waitForFunction(() => document.documentElement.getAttribute('data-op-scheme') === 'dark' && document.getElementById('btn-ui-theme').dataset.uiTheme === 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await frame.waitForTimeout(50);
    assert.equal(await frame.evaluate(() => document.documentElement.getAttribute('data-op-scheme')), 'dark');
    assert.equal(await frame.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'dark');
    await page.emulateMedia({ colorScheme: null });
    // Palette card clicks under themeMode: 'auto' must preserve 'auto' and update preview even for already-checked defaults.
    await frame.locator('#cfg-themeMode').selectOption('auto');
    await frame.waitForFunction(() => window.__prismFixture.config().themeMode === 'auto');
    await frame.locator('.palette:has(input[value="crystal"])').click();
    await frame.waitForFunction(() => document.getElementById('chat-preview').dataset.previewScheme === 'light' && document.getElementById('chat-preview').dataset.previewPalette === 'crystal');
    assert.equal(await frame.evaluate(() => window.__prismFixture.config().themeMode), 'auto', `${engine}: clicking checked crystal card preserves themeMode auto`);
    await frame.locator('.palette:has(input[value="obsidian"])').click();
    await frame.waitForFunction(() => document.getElementById('chat-preview').dataset.previewScheme === 'dark' && document.getElementById('chat-preview').dataset.previewPalette === 'obsidian');
    assert.equal(await frame.evaluate(() => window.__prismFixture.config().themeMode), 'auto', `${engine}: clicking checked obsidian card preserves themeMode auto`);
    const syncRenderMutations = await frame.evaluate(() => {
      const preview = document.getElementById('chat-preview');
      const observer = new MutationObserver(() => {});
      observer.observe(preview, { attributes: true, attributeFilter: ['data-preview-palette'] });
      document.querySelector('.palette:has(input[value="alabaster"])').click();
      const count = observer.takeRecords().length;
      observer.disconnect();
      return count;
    });
    assert.equal(syncRenderMutations, 1, `${engine}: clicking unchecked palette card renders once synchronously`);
    await frame.waitForFunction(() => document.getElementById('chat-preview').dataset.previewPalette === 'alabaster' && window.__prismFixture.config().lightPreset === 'alabaster');
    assert.equal(await frame.evaluate(() => window.__prismFixture.config().themeMode), 'auto');
    await frame.locator('.palette:has(input[value="warm"])').click();
    await frame.waitForFunction(() => document.getElementById('chat-preview').dataset.previewPalette === 'warm' && window.__prismFixture.config().palette === 'warm');
    assert.equal(await frame.evaluate(() => window.__prismFixture.config().themeMode), 'auto');
    await frame.locator('input[data-palette-key="palette"][value="warm"]').evaluate(el => el.focus());
    await page.keyboard.press('ArrowLeft');
    await frame.waitForFunction(() => document.getElementById('chat-preview').dataset.previewPalette === 'obsidian' && window.__prismFixture.config().palette === 'obsidian');
    assert.equal(await frame.evaluate(() => window.__prismFixture.config().themeMode), 'auto');
    // Bilingual 440x600 overflow & header button visibility check.
    await frame.locator('#cfg-language').selectOption('zh-CN');
    await frame.waitForFunction(() => document.documentElement.lang === 'zh-CN');
    assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${engine}: zh-CN popup keeps zero horizontal overflow at 440×600`);
    assert.equal(await frame.locator('#btn-ui-theme').isVisible(), true);
    assert.equal(await frame.locator('#cfg-uiThemeMode').isVisible(), true);
    await frame.locator('#cfg-language').selectOption('en-US');
    await frame.waitForFunction(() => document.documentElement.lang === 'en-US');
    assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${engine}: en-US popup keeps zero horizontal overflow at 440×600`);
    await frame.locator('#tab-motion').click();
    assert.equal(await frame.locator('#tab-motion').getAttribute('aria-selected'), 'true');
    assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.locator('#popup-sizer').screenshot({ path: path.join(artifacts, `${engine}-popup-intrinsic-motion.png`) });
    await frame.locator('#tab-reading').click();
    await frame.waitForFunction(() => document.body.dataset.activeTab === 'reading');
    assert.equal(await frame.locator('#tab-reading').getAttribute('aria-selected'), 'true');
    assert.equal(await frame.locator('#panel-reading').isVisible(), true);
    assert.equal(await frame.locator('#cfg-formulaPreview').isVisible(), true);
    assert.equal(await frame.locator('#cfg-formulaPreview').isChecked(), true);
    const formulaLabel = await frame.locator('label[for="cfg-formulaPreview"]').textContent();
    assert.ok(formulaLabel && formulaLabel.trim().length > 0, `${engine}: Reading tab formulaPreview switch must have non-empty label`);
    assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${engine}: Reading tab keeps zero horizontal overflow at 440×600`);
    console.log(`PASS ${engine} popup intrinsic sizing from a 25×25 iframe; this check does not install an action popup`);
  } finally { await context.close(); }
}
