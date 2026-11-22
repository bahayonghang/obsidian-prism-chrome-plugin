/** Action-popup sizing regressions. All pages and settings are synthetic. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

function assertUsableLayout(layout, label) {
  assert.ok(layout.width >= 439 && layout.width <= 441, `${label}: natural width should be 440 px, got ${layout.width}`);
  assert.ok(layout.height >= 599 && layout.height <= 601, `${label}: natural height should be 600 px, got ${layout.height}`);
  assert.ok(layout.bodyWidth >= 439 && layout.bodyHeight >= 599, `${label}: body must supply its own usable size`);
  assert.ok(layout.scrollWidth <= layout.width + 1 && layout.scrollHeight <= layout.height + 2, `${label}: outer document must not scroll`);
  for (const [name, box] of Object.entries(layout.controls)) {
    assert.ok(box && box.width > 0 && box.height > 0 && box.top >= -1 && box.bottom <= layout.height + 1, `${label}: ${name} must be visible inside the natural popup`);
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
      return { width: r.width, height: r.height, top: r.top, bottom: r.bottom };
    };
    return { width: win.innerWidth, height: win.innerHeight, bodyWidth: doc.body.getBoundingClientRect().width, bodyHeight: doc.body.getBoundingClientRect().height,
      scrollWidth: doc.documentElement.scrollWidth, scrollHeight: doc.documentElement.scrollHeight, activeTab: doc.body.dataset.activeTab,
      controls: { header: box('.brand'), tabs: box('.tabs'), workspace: box('#settings-scroll'), footer: box('footer') } };
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
      await options.evaluate(scheme => ObsidianPrismSchema.saveConfig({ themeMode: scheme }), scheme);
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
      const initial = await actionLayout(options);
      measurements.push({ scheme, contextTypes: contexts.map(value => value.contextType), initial });
      capture = await popupCapture(cdp, popupURL);
      measurements.at(-1).targetType = capture.targetType;
      await capture.screenshot(path.join(artifacts, `chromium-action-popup-${scheme}.png`));
      assertUsableLayout(initial, `${scheme} action popup`);
      await options.evaluate(() => chrome.extension.getViews({ type: 'popup' })[0].document.getElementById('tab-motion').click());
      await options.waitForFunction(() => chrome.extension.getViews({ type: 'popup' })[0]?.document.body.dataset.activeTab === 'motion');
      const motion = await actionLayout(options);
      measurements.at(-1).motion = motion;
      assertUsableLayout(motion, `${scheme} action popup motion panel`);
      if (scheme === 'dark') {
        await options.evaluate(() => chrome.extension.getViews({ type: 'popup' })[0].document.querySelector('[data-choice="ambientStyle"][data-value="spotlight"]').click());
        await options.waitForFunction(async () => (await ObsidianPrismSchema.loadConfig()).ambientStyle === 'spotlight' && chrome.extension.getViews({ type: 'popup' })[0].document.getElementById('cfg-ambientStyle').value === 'spotlight');
      } else {
        const reopenedStyle = await options.evaluate(async () => ({ saved: (await ObsidianPrismSchema.loadConfig()).ambientStyle, control: chrome.extension.getViews({ type: 'popup' })[0].document.getElementById('cfg-ambientStyle').value }));
        assert.deepEqual(reopenedStyle, { saved: 'spotlight', control: 'spotlight' }, 'a setting saved from the real action popup survives closing and reopening');
        measurements.at(-1).persistedAmbientStyle = reopenedStyle;
      }
      await capture.screenshot(path.join(artifacts, `chromium-action-popup-motion-${scheme}.png`));
      await capture.dispose(); capture = null;
      await options.evaluate(() => chrome.extension.getViews({ type: 'popup' })[0].close());
      await options.waitForFunction(() => chrome.extension.getViews({ type: 'popup' }).length === 0);
    }
    console.log('PASS Chromium real toolbar action popup: natural size, visible controls, settings persistence, close and reopen (no viewport override)');
  } catch (error) {
    if (capture) await capture.screenshot(path.join(artifacts, 'chromium-action-popup-failure.png')).catch(() => {});
    throw error;
  } finally {
    await fs.writeFile(path.join(artifacts, 'chromium-action-popup-metrics.json'), JSON.stringify(measurements, null, 2));
    if (capture) await capture.dispose();
    await options.evaluate(() => chrome.extension.getViews({ type: 'popup' }).forEach(win => win.close())).catch(() => {});
    await cdp.detach();
    await options.evaluate(config => ObsidianPrismSchema.saveConfig({ themeMode: config.themeMode, ambientStyle: config.ambientStyle }), original).catch(() => {});
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
    await frame.locator('#tab-motion').click();
    assert.equal(await frame.locator('#tab-motion').getAttribute('aria-selected'), 'true');
    assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.locator('#popup-sizer').screenshot({ path: path.join(artifacts, `${engine}-popup-intrinsic-motion.png`) });
    console.log(`PASS ${engine} popup intrinsic sizing from a 25×25 iframe; this check does not install an action popup`);
  } finally { await context.close(); }
}
