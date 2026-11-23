/**
 * v0.3.1 #22: blur Composer Scrim on the probe-derived live fixtures.
 * Everything is measured in rendered pixels and hit tests: the glow showing through below and beside the
 * Composer Surface, the occlusion opacity of the scrim over a flat probe backdrop, blurred text behind it,
 * crisp/clickable controls on top of it, the no-backdrop-filter fallback, and full restoration.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { openLiveFixture, LIVE_SELECTORS } from './live-fixtures.mjs';
import { capturePixels, regionStats, sampleBelow } from './measure.mjs';

/** The @supports condition that switches the scrim from the fallback gradient to the blur. */
export const SCRIM_BLUR_SUPPORTS = '@supports ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px)))';

const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const rgb = value => { const [r, g, b] = value.match(/[\d.]+/g).map(Number); return { r, g, b }; };
const distance = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
// Every horizon tone (blue, violet, cyan) is bluer than its red/green mix; glow raises this on any canvas.
const blueness = p => p.b - (p.r + p.g) / 2;
const fmt = p => `rgb(${Math.round(p.r)},${Math.round(p.g)},${Math.round(p.b)})`;

async function injectExtension(page, styles, scripts) {
  for (const content of styles) await page.addStyleTag({ content });
  for (const content of scripts) await page.addScriptTag({ content });
  await page.waitForFunction(() => window.ObsidianPrismRuntime?.diagnostics().enabled);
  await page.waitForSelector('.op-vial-pill');
  await frames(page);
}

async function patchConfig(page, values, ready) {
  await page.evaluate(patch => __prismFixture.patch(patch), values);
  await page.waitForFunction(ready);
  await frames(page);
}

async function scrollToEnd(page, host) {
  await page.locator(LIVE_SELECTORS[host].scroller).evaluate(node => { node.scrollTop = node.scrollHeight; });
  await frames(page);
}

/** The colour the page paints as its canvas: the Prism canvas token, or the host body background natively. */
async function canvasColor(page) {
  return rgb(await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;width:1px;height:1px;background:var(--op-canvas,transparent)';
    document.body.append(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return /rgba\(0, 0, 0, 0\)|transparent/.test(value) ? getComputedStyle(document.body).backgroundColor : value;
  }));
}

async function composerBox(page, host) {
  return page.locator(LIVE_SELECTORS[host].composer).first().evaluate(node => {
    const r = node.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, centerY: r.top + r.height / 2 };
  });
}

/** Sample points the user sees around the Composer Surface: right below it, and the empty sides at its middle. */
async function glowPoints(page, host) {
  const box = await composerBox(page, host);
  const below = (await sampleBelow(page, LIVE_SELECTORS[host].composer, { offsetY: 6 })).point;
  return { below, left: { x: box.left - 40, y: box.centerY }, right: { x: box.right + 40, y: box.centerY } };
}
async function pixelsAt(page, points) {
  const out = {};
  for (const [name, point] of Object.entries(points)) out[name] = (await capturePixels(page, { x: point.x, y: point.y, width: 1, height: 1 })).at(0, 0);
  return out;
}

/**
 * Inserts a flat block that paints behind the composer dock (inside the scroller, before the dock in tree and
 * z order) and estimates how opaque the canvas paint over it is: alpha = (P - B)·(C - B) / |C - B|².
 * Samples a column in the empty side area from above the composer to the viewport bottom.
 */
async function occlusionColumn(page, host, canvas) {
  const box = await composerBox(page, host);
  const backdrop = (canvas.r + canvas.g + canvas.b) / 3 > 128 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  const top = box.top - 70;
  await page.locator(LIVE_SELECTORS[host].scroller).evaluate((scroller, { top, color }) => {
    const block = document.createElement('div');
    block.id = 'prism-test-occlusion-block';
    block.style.cssText = `position:fixed;left:0;right:0;top:${top}px;bottom:0;z-index:0;pointer-events:none;background:${color}`;
    scroller.append(block);
  }, { top, color: fmt(backdrop) });
  await frames(page);
  const x = Math.round(box.left - 40);
  const height = page.viewportSize().height;
  const image = await capturePixels(page, { x, y: top + 20, width: 1, height: height - (top + 20) - 2 });
  await page.evaluate(() => document.getElementById('prism-test-occlusion-block')?.remove());
  await frames(page);
  const span = { r: canvas.r - backdrop.r, g: canvas.g - backdrop.g, b: canvas.b - backdrop.b };
  const norm = span.r ** 2 + span.g ** 2 + span.b ** 2;
  const alphas = [];
  for (let y = 0; y < image.height; y++) {
    const p = image.at(0, y);
    alphas.push(Math.max(0, Math.min(1, ((p.r - backdrop.r) * span.r + (p.g - backdrop.g) * span.g + (p.b - backdrop.b) * span.b) / norm)));
  }
  const atCenter = alphas[Math.round(box.centerY - (top + 20))];
  let maxStep = 0;
  for (let i = 2; i < alphas.length; i += 2) maxStep = Math.max(maxStep, Math.abs(alphas[i] - alphas[i - 2]));
  return { alphas, max: Math.max(...alphas), atCenter, maxStep };
}

/** Edge contrast of a region: the steepest neighbouring luminance step relative to its luminance range. */
async function sharpness(page, clip) {
  const image = await capturePixels(page, clip);
  const lum = (x, y) => { const p = image.at(x, y); return 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b; };
  let min = 255, max = 0, step = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const v = lum(x, y);
      min = Math.min(min, v); max = Math.max(max, v);
      if (x) step = Math.max(step, Math.abs(v - lum(x - 1, y)));
      if (y) step = Math.max(step, Math.abs(v - lum(x, y - 1)));
    }
  }
  return { ratio: max - min > 0 ? step / (max - min) : 0, range: max - min };
}

/**
 * Whether this engine actually paints backdrop-filter blur in screenshots: a calibration box blurs a word.
 * (Playwright's Firefox reports support but composites no backdrop blur.)
 */
async function rendersBackdropBlur(page) {
  await page.evaluate(() => {
    const word = document.createElement('div');
    word.id = 'prism-test-blur-calibration';
    word.style.cssText = 'position:fixed;left:0;top:0;width:160px;height:40px;z-index:2147483646;background:#000;color:#fff;font:700 18px/40px Arial,sans-serif';
    word.textContent = 'MWMW WMWM MWMW';
    const glass = document.createElement('div');
    glass.style.cssText = 'position:absolute;inset:0;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)';
    word.append(glass);
    document.body.append(word);
  });
  await frames(page);
  const edge = await sharpness(page, { x: 4, y: 4, width: 150, height: 32 });
  await page.evaluate(() => document.getElementById('prism-test-blur-calibration')?.remove());
  await frames(page);
  return edge.ratio < 0.5;
}

/** A high-contrast text block placed in the side area either behind the scrim (composer middle) or in the open thread. */
async function textBlockStats(page, host, where) {
  const box = await composerBox(page, host);
  const clip = { x: Math.round(box.left - 180), y: Math.round(where === 'behind' ? box.centerY - 22 : box.top - 260), width: 150, height: 44 };
  // The palette foreground (or the host text colour natively): the colour real thread text has on this canvas.
  const color = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--op-fg').trim() || getComputedStyle(document.body).color);
  await page.locator(LIVE_SELECTORS[host].scroller).evaluate((scroller, { clip, color }) => {
    const block = document.createElement('div');
    block.id = 'prism-test-text-block';
    block.textContent = 'MWMW WMWM MWMW WMWM MWMW WMWM MWMW WMWM';
    block.style.cssText = `position:fixed;left:${clip.x}px;top:${clip.y}px;width:${clip.width}px;height:${clip.height}px;z-index:0;overflow:hidden;pointer-events:none;font:700 15px/22px Arial,sans-serif;letter-spacing:1px;color:${color};background:transparent`;
    scroller.append(block);
  }, { clip, color });
  await frames(page);
  const stats = await regionStats(page, clip);
  const edge = await sharpness(page, clip);
  await page.evaluate(() => document.getElementById('prism-test-text-block')?.remove());
  await frames(page);
  return { variance: stats.variance, sharpness: edge.ratio };
}

/** Text-bearing controls on top of the scrim: the editor (placeholder), the disclaimer and the last reply's action row. */
function crispTargets(host) {
  const s = LIVE_SELECTORS[host];
  return host === 'chatgpt'
    ? { editor: s.editor, disclaimer: s.disclaimer, actions: '[data-turn-key]:last-of-type .turn-actions' }
    : { editor: s.editor, disclaimer: s.disclaimer, actions: 'model-response:last-of-type message-actions' };
}
async function assertCrispAndClickable(page, host, label, { actions = true } = {}) {
  const s = LIVE_SELECTORS[host];
  const targets = crispTargets(host);
  if (!actions) delete targets.actions;
  for (const [name, selector] of Object.entries(targets)) {
    const rect = await page.locator(selector).first().evaluate(node => {
      const r = node.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
    const clip = { x: rect.x + 2, y: rect.y + 2, width: Math.min(rect.width - 4, 220), height: Math.max(6, Math.min(rect.height - 4, 26)) };
    if (name === 'disclaimer') { clip.x = rect.x + rect.width / 2 - 110; clip.width = 220; }
    const edge = await sharpness(page, clip);
    assert.ok(edge.range >= 40 && edge.ratio >= 0.3, `${label}: ${name} stays crisp above the scrim (edge ${edge.ratio.toFixed(2)}, range ${edge.range.toFixed(0)})`);
  }
  const hits = await page.evaluate(selectors => Object.fromEntries(Object.entries(selectors).map(([name, selector]) => {
    const node = document.querySelector(selector);
    if (!node) return [name, 'missing'];
    const r = node.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + Math.min(r.width / 2, 14), r.top + r.height / 2);
    return [name, Boolean(hit && (node === hit || node.contains(hit)))];
  })), { editor: s.editor, add: s.add, model: s.model, disclaimer: s.disclaimer, ...(actions ? { action: `${crispTargets(host).actions} button` } : {}) });
  for (const [name, ok] of Object.entries(hits)) assert.equal(ok, true, `${label}: ${name} is hit-testable on top of the scrim`);
  await page.locator(s.add).click({ trial: true });
  await page.locator(s.model).click({ trial: true });
  if (actions) await page.locator(`${crispTargets(host).actions} button`).first().click({ trial: true });
}

/** Every attribute of every element in the conversation area (DOM restoration after disable). An emptied inline
 * `style=""` renders identically to no style attribute, so it is not a difference the user can see. */
async function attributeSnapshot(page, host) {
  return page.locator(LIVE_SELECTORS[host].main).evaluate(root => [root, ...root.querySelectorAll('*')]
    .filter(node => !node.closest('[data-op-owned]'))
    .map(node => `${node.localName}${node.getAttributeNames().filter(name => !(name === 'style' && !node.getAttribute(name).trim())).sort().map(name => ` ${name}="${node.getAttribute(name)}"`).join('')}`));
}

/** Paint-related computed styles along the composer's ancestor chain (and their ::before), up to the main area. */
async function dockPaint(page, host) {
  return page.locator(LIVE_SELECTORS[host].composer).first().evaluate((composer, mainSelector) => {
    const out = [];
    for (let node = composer.parentElement; node && !node.matches(mainSelector); node = node.parentElement) {
      const style = getComputedStyle(node), before = getComputedStyle(node, '::before');
      out.push({ tag: node.localName, background: style.backgroundColor, image: style.backgroundImage, backdrop: style.backdropFilter || 'none', mask: style.maskImage || 'none', isolation: style.isolation, position: style.position,
        before: { content: before.content, background: before.backgroundColor, image: before.backgroundImage, backdrop: before.backdropFilter || 'none' } });
    }
    return out;
  }, LIVE_SELECTORS[host].main);
}

async function gemiInputLayout(page) {
  return page.locator(LIVE_SELECTORS.gemini.inputGradient).evaluate(node => {
    const style = getComputedStyle(node);
    return { position: style.position, left: style.left, right: style.right, bottom: style.bottom, minHeight: style.minHeight, paddingTop: style.paddingTop };
  });
}

const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}±${tolerance}, got ${actual}`);

async function checkHostScheme({ browser, engine, interceptFixtures, fixtureBridge, styles, scripts, artifacts }, host, scheme) {
  const label = `${engine} ${host} ${scheme}`;
  const kind = engine === 'firefox' ? 'firefox' : 'chrome';
  const initial = { themeMode: scheme, ambientStyle: 'aurora', ambientTexture: 'off', motionLevel: 'off' };
  const { context, page } = await openLiveFixture(browser, host, { interceptFixtures, colorScheme: scheme, initScript: [fixtureBridge, { kind, initial }] });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await scrollToEnd(page, host);
    const native = { canvas: await canvasColor(page), attributes: await attributeSnapshot(page, host), paint: await dockPaint(page, host) };
    native.occlusion = await occlusionColumn(page, host, native.canvas);
    if (host === 'gemini') {
      native.layout = await gemiInputLayout(page);
      assert.ok(native.occlusion.max >= 0.95, `${label}: native Gemini input gradient is an opaque band (alpha ${native.occlusion.max.toFixed(2)})`);
    } else {
      assert.ok(native.occlusion.max <= 0.05, `${label}: native ChatGPT dock wrappers are transparent (alpha ${native.occlusion.max.toFixed(2)})`);
    }

    await injectExtension(page, styles, scripts);
    await scrollToEnd(page, host);
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-op-home')), 'false', `${label}: active conversation`);
    const canvas = await canvasColor(page);

    // 1. The glow shows through below the composer and in the empty sides; nothing paints the solid canvas.
    const points = await glowPoints(page, host);
    const glow = await pixelsAt(page, points);
    await patchConfig(page, { ambientStyle: 'none' }, () => document.documentElement.getAttribute('data-op-ambient-style') === 'none');
    const flat = await pixelsAt(page, points);
    for (const name of Object.keys(points)) {
      assert.ok(distance(glow[name], canvas) >= 4, `${label}: ${name} the composer is not the solid canvas ${fmt(canvas)} (got ${fmt(glow[name])})`);
      assert.ok(blueness(glow[name]) - blueness(flat[name]) >= 2.5, `${label}: ${name} the composer carries the horizon glow hue (glow ${fmt(glow[name])} vs no glow ${fmt(flat[name])})`);
    }

    // 2. The scrim occludes partially (about 45% canvas), feathers in without a hard edge and never goes solid.
    const occlusion = await occlusionColumn(page, host, canvas);
    assert.ok(occlusion.max <= 0.6, `${label}: scrim never paints more than ~60% canvas (max alpha ${occlusion.max.toFixed(2)})`);
    assert.ok(occlusion.atCenter >= 0.3 && occlusion.atCenter <= 0.6, `${label}: scrim is about 45% canvas beside the composer (alpha ${occlusion.atCenter.toFixed(2)})`);
    assert.ok(occlusion.maxStep <= 0.12, `${label}: scrim top is feathered, not a hard edge (max step ${occlusion.maxStep.toFixed(2)})`);

    // 3. Text scrolled behind the scrim is blurred; the controls on top stay crisp and clickable.
    const open = await textBlockStats(page, host, 'open');
    const behind = await textBlockStats(page, host, 'behind');
    const blurs = await rendersBackdropBlur(page);
    // With a real backdrop blur detail nearly vanishes; without one the ~45% canvas alone still mutes it.
    assert.ok(behind.variance <= open.variance * (blurs ? 0.15 : 0.35), `${label}: text behind the scrim loses detail (variance ${behind.variance.toFixed(0)} vs ${open.variance.toFixed(0)} in the open thread)`);
    if (blurs) {
      assert.ok(behind.sharpness < open.sharpness * 0.6, `${label}: text behind the scrim is blurred (edge ${behind.sharpness.toFixed(2)} vs ${open.sharpness.toFixed(2)})`);
    } else console.log(`NOTE ${label}: this engine paints no backdrop-filter blur in screenshots; blur sharpness not verified (variance ${behind.variance.toFixed(0)} vs ${open.variance.toFixed(0)})`);
    if (host === 'gemini') {
      // The two-row Composer Surface (#19) makes Gemini's absolute input-container taller than the fixture's fixed
      // 150px scroller bottom padding, so the card itself overlaps the last reply's action row with or without any
      // scrim paint. Check the editor/disclaimer as is, and isolate the action row from that layout interaction.
      await assertCrispAndClickable(page, host, label, { actions: false });
      await patchConfig(page, { composerRestyle: false }, () => document.documentElement.getAttribute('data-op-composer') !== 'true');
      await scrollToEnd(page, host);
      await assertCrispAndClickable(page, host, `${label} (single-row composer)`);
      await patchConfig(page, { composerRestyle: true }, () => document.documentElement.getAttribute('data-op-composer') === 'true');
      await scrollToEnd(page, host);
    } else await assertCrispAndClickable(page, host, label);
    await patchConfig(page, { ambientStyle: 'aurora' }, () => document.documentElement.getAttribute('data-op-ambient-style') === 'aurora');
    await page.screenshot({ path: path.join(artifacts, `${engine}-${host}-${scheme}-live-scrim.png`) });

    if (host === 'gemini') {
      assert.deepEqual(await gemiInputLayout(page), native.layout, `${label}: the native input gradient layer keeps its layout`);
      assert.ok(await page.locator(LIVE_SELECTORS.gemini.attachment).isVisible(), `${label}: attachment preview stays visible`);
      await page.locator(`${LIVE_SELECTORS.gemini.attachment} button`).click({ trial: true });
    }

    if (scheme === 'dark') {
      // 4. Native Palette: the scrim is inactive and the native paint returns exactly.
      await patchConfig(page, { palette: 'host' }, () => document.documentElement.getAttribute('data-op-effective-palette') === 'host');
      await scrollToEnd(page, host);
      assert.deepEqual(await dockPaint(page, host), native.paint, `${label}: Native Palette restores the dock paint`);
      const hostOcclusion = await occlusionColumn(page, host, native.canvas);
      near(hostOcclusion.max, native.occlusion.max, 0.05, `${label}: Native Palette restores native occlusion`);
      await patchConfig(page, { palette: 'obsidian' }, () => document.documentElement.getAttribute('data-op-effective-palette') === 'obsidian');

      // 5. Disabled extension: every attribute and the native paint are restored.
      await patchConfig(page, { enabled: false }, () => !document.documentElement.hasAttribute('data-op-enabled'));
      await scrollToEnd(page, host);
      assert.deepEqual(await attributeSnapshot(page, host), native.attributes, `${label}: disabling restores every attribute in the conversation area`);
      assert.deepEqual(await dockPaint(page, host), native.paint, `${label}: disabling restores the dock paint`);
      near((await occlusionColumn(page, host, native.canvas)).max, native.occlusion.max, 0.05, `${label}: disabling restores native occlusion`);
      await patchConfig(page, { enabled: true }, () => document.documentElement.getAttribute('data-op-enabled') === 'true');

      // 6. Home State: no scrim, no blur.
      await page.evaluate(selector => { for (const node of document.querySelectorAll(selector)) node.remove(); }, host === 'chatgpt' ? '[data-turn-key]' : 'user-query,model-response');
      await page.waitForFunction(() => document.documentElement.getAttribute('data-op-home') === 'true');
      await patchConfig(page, { ambientStyle: 'none' }, () => document.documentElement.getAttribute('data-op-ambient-style') === 'none');
      const homeOcclusion = await occlusionColumn(page, host, await canvasColor(page));
      assert.ok(homeOcclusion.max <= 0.05, `${label}: Home State paints no scrim (alpha ${homeOcclusion.max.toFixed(2)})`);
      const homeText = await textBlockStats(page, host, 'behind');
      assert.ok(homeText.sharpness >= open.sharpness * 0.8, `${label}: Home State does not blur the area beside the composer (edge ${homeText.sharpness.toFixed(2)} vs ${open.sharpness.toFixed(2)})`);
      assert.ok((await dockPaint(page, host)).every(layer => layer.backdrop === 'none' && layer.before.backdrop === 'none'), `${label}: Home State applies no backdrop blur`);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${label} live fixture: blur Composer Scrim lets the glow through (alpha ${occlusion.atCenter.toFixed(2)}), cuts text variance to ${(behind.variance / open.variance * 100).toFixed(0)}%, keeps controls crisp${scheme === 'dark' ? ', and restores under Native Palette, disable and Home State' : ''}`);
  } catch (error) {
    if (!page.isClosed()) await page.screenshot({ path: path.join(artifacts, `${engine}-${host}-${scheme}-live-scrim-failure.png`) }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

/** No backdrop-filter support: the @supports block is disabled and the fallback gradient must stay translucent. */
async function checkFallback({ browser, engine, interceptFixtures, fixtureBridge, styles, scripts, artifacts }, host) {
  const label = `${engine} ${host} no-backdrop-filter`;
  const patched = styles.map(css => css.split(SCRIM_BLUR_SUPPORTS).join('@supports (prism-unsupported-property: none)'));
  assert.notDeepEqual(patched, styles, 'the scrim blur is gated by the expected @supports condition');
  const kind = engine === 'firefox' ? 'firefox' : 'chrome';
  const { context, page } = await openLiveFixture(browser, host, { interceptFixtures, initScript: [fixtureBridge, { kind, initial: { themeMode: 'dark', ambientStyle: 'none', ambientTexture: 'off', motionLevel: 'off' } }] });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await injectExtension(page, patched, scripts);
    await scrollToEnd(page, host);
    assert.equal(await page.locator(LIVE_SELECTORS[host].composer).first().evaluate(node => {
      for (let el = node; el; el = el.parentElement) if ((getComputedStyle(el, '::before').backdropFilter || 'none') !== 'none' || (getComputedStyle(el).backdropFilter || 'none') !== 'none') return true;
      return false;
    }), false, `${label}: the simulated browser applies no backdrop blur`);
    const occlusion = await occlusionColumn(page, host, await canvasColor(page));
    assert.ok(occlusion.max <= 0.6, `${label}: fallback gradient stays at or below ~60% canvas (max alpha ${occlusion.max.toFixed(2)})`);
    assert.ok(occlusion.atCenter >= 0.2, `${label}: fallback still softens the area beside the composer (alpha ${occlusion.atCenter.toFixed(2)})`);
    assert.ok(occlusion.maxStep <= 0.12, `${label}: fallback has no hard edge (max step ${occlusion.maxStep.toFixed(2)})`);
    await assertCrispAndClickable(page, host, label, { actions: host !== 'gemini' });
    assert.deepEqual(errors, []);
    console.log(`PASS ${label}: fallback gradient peaks at ${(occlusion.max * 100).toFixed(0)}% canvas with no solid block`);
  } catch (error) {
    if (!page.isClosed()) await page.screenshot({ path: path.join(artifacts, `${engine}-${host}-scrim-fallback-failure.png`) }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

export async function checkLiveComposerScrim(options) {
  for (const host of ['chatgpt', 'gemini']) {
    for (const scheme of ['dark', 'light']) await checkHostScheme(options, host, scheme);
    await checkFallback(options, host);
  }
}
