/**
 * Probe-derived ("live") fixtures: native baselines without the extension, and probe privacy.
 * The fixtures reproduce the 2026-11-22 structure probe facts in .trellis/research/live-host-dom.md.
 * Later tickets reuse LIVE_SELECTORS, openLiveFixture and the helpers in measure.mjs.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { LIVE_FIXTURE_URLS, MAIN_SELECTORS, setMainWidth, paragraphWidth, sampleBelow, headingStyles, controlGeometry } from './measure.mjs';

/** Real host selectors in the live fixtures (no fixture-only markers). */
export const LIVE_SELECTORS = {
  chatgpt: {
    main: MAIN_SELECTORS.chatgpt,
    scroller: '[data-prism-test-scroller]',
    column: '[class*="transcriptContent"]',
    assistant: '[data-markdown-text-style="assistant-message"]',
    paragraph: '[data-markdown-text-style="assistant-message"] > p',
    userBubble: '[data-user-message-bubble="true"]',
    composerForm: 'form[data-chatgpt-composer]',
    composer: '[data-composer-layout]',
    composerGrid: '[data-composer-layout] [class*="composerGrid"]',
    editor: '#prompt-textarea',
    add: 'button[aria-label="Add files and more"]',
    model: 'button[aria-label="Select ChatGPT model"]',
    dictate: 'button[aria-label="Dictate"]',
    voice: 'button[aria-label="Start Voice"]',
    attachment: '[class*="composerGrid"] [class*="file-tile"]',
    disclaimer: '#thread-bottom [class*="disclaimer"]'
  },
  gemini: {
    main: MAIN_SELECTORS.gemini,
    scroller: '[data-prism-test-scroller]',
    column: 'user-query',
    assistant: 'model-response .md-content',
    paragraph: 'model-response .md-content > p',
    userBubble: '.user-query-bubble-with-background',
    inputGradient: 'input-container.input-gradient',
    inputAreaContainer: '.input-area-container',
    composer: 'input-area-v2',
    composerGrid: '.text-input-field',
    editor: '.ql-editor',
    add: 'button[aria-label="Open upload file menu"]',
    model: 'button[aria-label^="Open mode picker"]',
    mic: 'button[aria-label="Microphone"]',
    attachment: '.text-input-field .file-preview-chip',
    footer: 'model-response message-actions',
    disclaimer: 'hallucination-disclaimer'
  }
};

/** Native values recorded by the structure probe (2026-11-22). */
export const NATIVE_BASELINES = {
  chatgpt: { column: 808, paragraph: 768, threadVariable: '48rem', gridFirstColumn: '36px', h2: { fontSize: 18, fontWeight: 600 }, h3: { fontSize: 16, fontWeight: 600 } },
  gemini: { block: 708, userQuery: 708, inputArea: 660, gridAreas: '"file-preview file-preview file-preview" "leading-actions text-input trailing-actions"', gradientHeight: 133, h2: { fontSize: 24, fontWeight: 380 }, h3: { fontSize: 20, fontWeight: 470 } }
};

/** Opens a live fixture in a fresh context at the requested main-area width (default 1280). */
export async function openLiveFixture(browser, host, { interceptFixtures, mainWidth = 1280, colorScheme = 'dark', initScript } = {}) {
  const context = await browser.newContext({ viewport: { width: mainWidth + 400, height: 900 }, deviceScaleFactor: 1, colorScheme, reducedMotion: 'reduce' });
  await interceptFixtures(context);
  if (initScript) await context.addInitScript(...initScript);
  const page = await context.newPage();
  await page.goto(LIVE_FIXTURE_URLS[host]);
  await setMainWidth(page, MAIN_SELECTORS[host], mainWidth);
  return { context, page };
}

/** Waits two animation frames so style and layout changes are painted. */
export const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

/**
 * Runs `body({ page, context, errors })` on a live fixture and always closes the context. `suite` is the shared
 * live-fixture bundle from browser-smoke.mjs ({ browser, engine, interceptFixtures, fixtureBridge, styles,
 * scripts, artifacts }); without a fixtureBridge the page runs bare (native baselines). Page errors collect
 * in `errors`; a failure saves `<engine>-<failure>.png` before rethrowing.
 */
export async function onLiveFixture(suite, host, { failure, initial, colorScheme, mainWidth } = {}, body) {
  const { browser, engine, interceptFixtures, fixtureBridge, artifacts } = suite;
  const initScript = fixtureBridge ? [fixtureBridge, { kind: engine === 'firefox' ? 'firefox' : 'chrome', initial }] : undefined;
  const { context, page } = await openLiveFixture(browser, host, { interceptFixtures, colorScheme, mainWidth, initScript });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    return await body({ page, context, errors });
  } catch (error) {
    if (!page.isClosed()) await page.screenshot({ path: path.join(artifacts, `${engine}-${failure}.png`) }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

/** Injects the extension styles and scripts (as the content script would) and waits for the runtime. */
export async function injectExtension(page, { styles, scripts }, { waitFor } = {}) {
  for (const content of styles) await page.addStyleTag({ content });
  for (const content of scripts) await page.addScriptTag({ content });
  await page.waitForFunction(() => window.ObsidianPrismRuntime?.diagnostics().enabled);
  if (waitFor) await page.waitForSelector(waitFor);
}

/** Patches the stored config through the fixture bridge; with `ready`, waits for it and for a painted frame. */
export async function patchConfig(page, values, ready) {
  await page.evaluate(patch => __prismFixture.patch(patch), values);
  if (ready) {
    await page.waitForFunction(ready);
    await settle(page);
  }
}

const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}±${tolerance}, got ${actual}`);
const normalize = value => String(value).replace(/\s+/g, ' ').trim();

async function assertNativeWidths(page, host, mainWidth) {
  const s = LIVE_SELECTORS[host], base = NATIVE_BASELINES[host];
  const label = `${host} native @main ${mainWidth}`;
  const paragraph = await paragraphWidth(page, s.paragraph);
  if (host === 'chatgpt') {
    const column = await page.locator(s.column).evaluate(node => node.getBoundingClientRect().width);
    near(column, base.column, 0.5, `${label} transcript column`);
    near(paragraph.box, base.paragraph, 0.5, `${label} paragraph box`);
  } else {
    near(paragraph.box, base.block, 0.5, `${label} paragraph box`);
    const blocks = await page.locator(`${s.assistant} > *`).evaluateAll(nodes => nodes.map(node => ({ tag: node.localName, width: node.getBoundingClientRect().width })));
    assert.ok(blocks.length >= 8, `${label}: markdown has headings, lists, quote, table and code blocks`);
    for (const block of blocks) assert.ok(block.width <= base.block + 0.5, `${label}: ${block.tag} block (${block.width}) is capped at ${base.block}px`);
    near(await page.locator(s.column).first().evaluate(node => node.getBoundingClientRect().width), base.userQuery, 0.5, `${label} user-query`);
    near(await page.locator(s.inputAreaContainer).evaluate(node => node.getBoundingClientRect().width), base.inputArea, 0.5, `${label} input area`);
  }
  assert.ok(paragraph.text > paragraph.box * 0.8 && paragraph.text <= paragraph.box + 0.5, `${label}: long paragraph wraps across its rendered width (${paragraph.text}/${paragraph.box})`);
  return paragraph.box;
}

async function assertNativeComposer(page, host) {
  const s = LIVE_SELECTORS[host], base = NATIVE_BASELINES[host];
  const grid = await page.locator(s.composerGrid).evaluate(node => {
    const style = getComputedStyle(node);
    return { display: style.display, columns: style.gridTemplateColumns, areas: style.gridTemplateAreas };
  });
  assert.equal(grid.display, 'grid', `${host}: native composer row is a grid`);
  if (host === 'chatgpt') {
    const tracks = grid.columns.split(' ');
    assert.equal(tracks.length, 3, `chatgpt: composer grid has three columns, got "${grid.columns}"`);
    assert.equal(tracks[0], base.gridFirstColumn, 'chatgpt: leading column is 36px');
  } else {
    assert.equal(normalize(grid.areas), base.gridAreas, 'gemini: composer grid areas');
  }
  const geometry = await controlGeometry(page, s.composerGrid, { editor: s.editor, add: s.add, model: s.model });
  const { editor, add, model } = geometry.controls;
  assert.ok(editor && add && model, `${host}: editor, add and model controls exist`);
  near(add.centerY, editor.centerY, 10, `${host}: native single-row add button shares the editor row`);
  near(model.centerY, editor.centerY, 10, `${host}: native single-row model button shares the editor row`);
  assert.ok(add.right <= editor.left + 0.5 && editor.right <= model.left + 0.5, `${host}: native order is add | editor | model`);
  assert.equal(await page.locator(s.attachment).count(), 1, `${host}: attachment preview chip inside the composer grid`);
}

async function assertNativeBelowComposer(page, host) {
  const s = LIVE_SELECTORS[host];
  const below = await sampleBelow(page, s.composer, { offsetX: 6, offsetY: 6 });
  if (host === 'gemini') {
    const layer = await page.locator(s.inputGradient).evaluate(node => {
      const style = getComputedStyle(node);
      return { position: style.position, image: style.backgroundImage, height: node.getBoundingClientRect().height };
    });
    assert.equal(layer.position, 'absolute', 'gemini: native input gradient is absolutely positioned');
    assert.match(layer.image, /linear-gradient/, 'gemini: native input layer paints a gradient');
    // ~133px without attachments (probe); the fixture's attachment row makes it taller.
    assert.ok(layer.height >= NATIVE_BASELINES.gemini.gradientHeight - 2, `gemini: native input gradient is at least ~133px tall, got ${layer.height}`);
    const { r, g, b, a } = below.pixel;
    assert.ok(a === 255 && Math.max(r, g, b) <= 32, `gemini: native paint below the composer is opaque near-black, got rgba(${r},${g},${b},${a})`);
  } else {
    const page_bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = page_bg.match(/\d+/g).map(Number);
    const pixel = below.pixel;
    assert.ok(Math.abs(pixel.r - r) <= 2 && Math.abs(pixel.g - g) <= 2 && Math.abs(pixel.b - b) <= 2, `chatgpt: native composer wrappers are transparent (page ${page_bg}, sampled rgb(${pixel.r},${pixel.g},${pixel.b}))`);
  }
}

async function assertNativeHeadings(page, host) {
  const styles = await headingStyles(page, LIVE_SELECTORS[host].assistant);
  for (const tag of ['h1', 'h2', 'h3', 'h4']) assert.ok(styles[tag], `${host}: fixture has an ${tag}`);
  for (const tag of ['h2', 'h3']) {
    assert.equal(styles[tag].fontSize, NATIVE_BASELINES[host][tag].fontSize, `${host} native ${tag} size`);
    assert.equal(styles[tag].fontWeight, NATIVE_BASELINES[host][tag].fontWeight, `${host} native ${tag} weight`);
  }
}

async function assertProbePrivacy(page, host, probeSource) {
  const s = LIVE_SELECTORS[host];
  const canary = 'PRISM-CANARY-DRAFT-7351';
  await page.locator(s.editor).click();
  await page.keyboard.type(canary);
  const secrets = await page.evaluate(() => {
    const texts = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue.trim();
      if (text.length >= 6 && !node.parentElement.closest('style,script')) texts.add(text);
    }
    const ids = new Set();
    for (const element of document.querySelectorAll('*')) {
      for (const name of element.getAttributeNames()) {
        const value = element.getAttribute(name);
        if (name === 'id' && /\d{3,}/.test(value)) ids.add(value);
        for (const match of value.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b[rc]_[0-9a-f]{8,}\b/gi)) ids.add(match[0]);
      }
      for (const name of ['aria-label', 'title', 'placeholder', 'data-placeholder', 'alt']) if (element.getAttribute(name)?.length >= 6) texts.add(element.getAttribute(name));
    }
    return { texts: [...texts], ids: [...ids] };
  });
  assert.ok(secrets.texts.some(text => text.includes(canary)), 'canary draft was typed into the native editor');
  assert.ok(secrets.ids.length >= 3, `${host}: fixture carries session/message ids to redact`);
  const result = await page.evaluate(source => (0, eval)(source), probeSource);
  const json = JSON.stringify(result);
  assert.equal(result.site, host);
  for (const text of secrets.texts) assert.equal(json.includes(text), false, `${host}: probe output leaked text "${text.slice(0, 40)}"`);
  for (const id of secrets.ids) assert.equal(json.includes(id), false, `${host}: probe output leaked id "${id}"`);
  assert.equal(json.includes('prism-live-fixture'), false, `${host}: probe output omits the page path`);
  // The probe reproduces the recorded live facts on the fixture.
  const first = name => result.targets[name]?.samples?.[0];
  if (host === 'chatgpt') {
    const keys = result.targets.searchUnits.samples.map(sample => sample.data['data-content-search-unit-key']);
    assert.ok(keys.some(key => /^\[id\]:\d+:user$/.test(key)) && keys.some(key => /^\[id\]:\d+:assistant$/.test(key)), `chatgpt: ids are redacted while the role suffix survives (${keys})`);
    assert.equal(first('turns').data['data-turn-key'], '[id]', 'chatgpt: turn keys are redacted');
    assert.equal(first('transcript').style['--thread-content-max-width'], '48rem');
    assert.ok(result.targets.composerGrids.samples.some(sample => sample.style.gridTemplateColumns.startsWith('36px ')), 'chatgpt: probe sees the 36px composer grid');
    assert.equal(first('composerLayout').data['data-composer-layout'], 'single-line');
    assert.equal(result.targets.legacyTurns.count, 0, 'chatgpt: no legacy turn markers in the live fixture');
  } else {
    assert.equal(first('markdownBlocks').style.maxWidth, '708px');
    assert.equal(normalize(first('textInputField').style.gridTemplateAreas), NATIVE_BASELINES.gemini.gridAreas);
    assert.equal(first('inputContainer').style.position, 'absolute');
    const weights = Object.fromEntries(result.targets.headings.samples.map(sample => [sample.tag, Number(sample.style.fontWeight)]));
    assert.equal(weights.h2, 380);
    assert.equal(weights.h3, 470);
  }
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.press('Backspace');
}

/** Native baselines on the probe-derived fixtures, measured without the extension, plus probe privacy. */
export async function checkLiveFixtureBaselines(suite) {
  const { engine, probeSource, artifacts } = suite;
  for (const host of ['chatgpt', 'gemini']) {
    // Native baselines run without the fixture bridge.
    await onLiveFixture({ ...suite, fixtureBridge: undefined }, host, { failure: `${host}-live-failure` }, async ({ page, errors }) => {
      const widths = [];
      for (const mainWidth of [1280, 1100]) {
        await setMainWidth(page, MAIN_SELECTORS[host], mainWidth);
        widths.push(await assertNativeWidths(page, host, mainWidth));
      }
      assert.equal(widths[0], widths[1], `${host}: native reading width does not depend on main width above the cap`);
      await assertNativeComposer(page, host);
      await page.locator(LIVE_SELECTORS[host].scroller).evaluate(node => { node.scrollTop = node.scrollHeight; });
      await assertNativeBelowComposer(page, host);
      await assertNativeHeadings(page, host);
      await page.screenshot({ path: path.join(artifacts, `${engine}-${host}-live-native.png`) });
      await assertProbePrivacy(page, host, probeSource);
      assert.deepEqual(errors, []);
      console.log(`PASS ${engine} ${host} live fixture native baselines (main 1280/1100) and read-only probe privacy`);
    });
  }
}
