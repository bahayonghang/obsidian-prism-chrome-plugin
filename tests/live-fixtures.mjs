/**
 * Probe-derived ("live") fixtures: native baselines without the extension, and probe privacy.
 * The fixtures reproduce the 2026-11-22 structure probe facts in .trellis/research/live-host-dom.md.
 * Later tickets reuse LIVE_SELECTORS, openLiveFixture and the helpers in measure.mjs.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { LIVE_FIXTURE_URLS, MAIN_SELECTORS, setMainWidth, paragraphWidth, sampleBelow, headingStyles, controlGeometry, regionStats } from './measure.mjs';

/** Real host selectors in the live fixtures (no fixture-only markers). */
export const LIVE_SELECTORS = {
  chatgpt: {
    main: MAIN_SELECTORS.chatgpt,
    scroller: '[data-prism-test-scroller]',
    column: '[class*="transcriptContent"]',
    assistant: '[data-markdown-text-style="assistant-message"]',
    paragraph: '[data-markdown-text-style="assistant-message"] > p',
    userBubble: '[data-user-message-bubble="true"]',
    bottomDock: '#thread-bottom-container',
    composerColumn: '.composer-column',
    composerForm: 'form[data-chatgpt-composer]',
    composer: '[data-composer-layout]',
    composerGrid: '[data-composer-layout] [class*="composerGrid"]',
    editor: '#prompt-textarea',
    add: 'button[aria-label="Add files and more"]',
    model: 'button[aria-label="Select ChatGPT model"]',
    dictate: 'button[aria-label="Dictate"]',
    voice: 'button[aria-label="Start Voice"]',
    attachment: '[class*="composerGrid"] [class*="file-tile"]',
    belowSpacer: '.composer-below-spacer',
    // v0.4.3 #41 / v0.4.4 #46 thread-footer variant: structural selectors (no host hash classes).
    threadFooter: '[data-prism-test-scroller] > :has([data-thread-scroll-footer="true"])',
    threadScrollFooter: '[data-thread-scroll-footer="true"]',
    threadComposerBackdrop: '[data-thread-composer-backdrop="true"]',
    threadFooterDisclaimer: '[data-prism-test-scroller] > :has([data-thread-scroll-footer="true"]) [class*="disclaimer"]',
    threadFooterSpacer: '[data-thread-composer-backdrop="true"] + div:empty',
    outerThreadWrappers: 'main [class*="--thread-content-"]',
    disclaimer: '#thread-bottom [class*="disclaimer"]',
    cornerFloat: '.host-corner-help'
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
    disclaimer: 'hallucination-disclaimer',
    cornerFloat: '.host-corner-help'
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
 * Toggles composable ChatGPT bottom-dock reproduction variants on chatgpt-live.html using realistic
 * host classes and DOM elements (no data-fixture-* hooks). Omitted flags default to false so callers
 * can switch between combinations or pass {} to restore the default native fixture.
 */
export async function applyChatGPTBottomVariants(page, variants = {}) {
  const opts = {
    containerFadeAfter: Boolean(variants.containerFadeAfter),
    overlayHostAfter: Boolean(variants.overlayHostAfter),
    sharpEdgeShadow: Boolean(variants.sharpEdgeShadow),
    outerSpacersAndVtDisclaimer: Boolean(variants.outerSpacersAndVtDisclaimer),
    stickyInScroller: Boolean(variants.stickyInScroller)
  };
  await page.evaluate(v => {
    const parent = document.querySelector('.composer-parent');
    const scroller = document.querySelector('[data-prism-test-scroller]');
    const dock = document.querySelector('#thread-bottom-container');
    if (!parent || !dock) return;

    if (v.stickyInScroller) {
      dock.style.position = 'sticky';
      dock.style.bottom = '0px';
      if (scroller && dock.parentElement !== scroller) scroller.append(dock);
    } else {
      dock.style.removeProperty('position');
      dock.style.removeProperty('bottom');
      if (!dock.getAttribute('style')?.trim()) dock.removeAttribute('style');
      if (scroller && dock.parentElement === scroller) scroller.after(dock);
    }

    let fadeContainer = dock.querySelector(':scope > .content-fade-container.content-fade');
    if (v.containerFadeAfter) {
      if (!fadeContainer) {
        fadeContainer = document.createElement('div');
        fadeContainer.className = 'content-fade-container content-fade';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scroll-to-bottom-btn';
        btn.setAttribute('aria-label', 'Scroll to bottom');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M12 5v14m0 0-6-6m6 6 6-6');
        svg.append(path);
        btn.append(svg);
        fadeContainer.append(btn);
        dock.prepend(fadeContainer);
      }
    } else {
      fadeContainer?.remove();
    }

    dock.classList.toggle('has-host-after', v.overlayHostAfter);
    dock.classList.toggle('has-sharp-edge-shadow', v.sharpEdgeShadow);

    let outerSpacer = parent.querySelector(':scope > .dock-outer-spacer');
    let outerDisclaimer = parent.querySelector(':scope > .disclaimer-outer-wrap');
    if (v.outerSpacersAndVtDisclaimer) {
      if (!outerSpacer) {
        outerSpacer = document.createElement('div');
        outerSpacer.className = 'dock-outer-spacer';
      }
      if (!outerDisclaimer) {
        outerDisclaimer = document.createElement('div');
        outerDisclaimer.className = 'disclaimer-outer-wrap';
        outerDisclaimer.textContent = 'Offline external disclaimer. Synthetic placeholder notice.';
      }
      const anchor = dock.parentElement === parent ? dock : scroller;
      if (anchor) anchor.after(outerSpacer, outerDisclaimer);
      else parent.append(outerSpacer, outerDisclaimer);
    } else {
      outerSpacer?.remove();
      outerDisclaimer?.remove();
    }
  }, opts);
  await settle(page);
}

/** v0.4.3 #41 live thread footer (2026-11-24 facts): ancestors between the composer form and the painted footer. */
export const THREAD_FOOTER_DEPTH = 21;

/**
 * Rebuilds the 2026-11-24 live ChatGPT footer & outer app-shell wrappers on chatgpt-live.html (`enabled: false`
 * restores the default DOM): wraps [data-prism-test-scroller] in three non-scrolling flex app-shell wrappers carrying
 * Tailwind `--thread-content-*` custom-property classes, detaches #thread-bottom-container, and moves
 * form[data-chatgpt-composer] into an absolutely positioned Thread Footer inside the scroll container that paints
 * the band with anchor-positioned ::before/::after. Inside sit [data-thread-scroll-footer="true"] (24px ::after inset),
 * [data-thread-composer-backdrop="true"] (live 808px width limiter), an empty spacer, and an inner disclaimer shell.
 */
export async function applyChatGPTThreadFooter(page, { enabled = true } = {}) {
  await page.evaluate(({ enabled, threadFooter }) => {
    const scroller = document.querySelector('[data-prism-test-scroller]');
    const composerParent = document.querySelector('.composer-parent');
    const form = document.querySelector('form[data-chatgpt-composer]');
    const layout = form.querySelector('[data-composer-layout]');
    const store = window.__prismThreadFooterFixture || (window.__prismThreadFooterFixture = {});
    document.querySelector(threadFooter)?.remove();
    if (store.outerRoot && store.outerRoot.isConnected && composerParent) {
      composerParent.prepend(scroller);
      store.outerRoot.remove();
      store.outerRoot = null;
    }
    if (store.dock && !store.dock.isConnected) {
      store.dock.querySelector('.composer-column').prepend(form);
      scroller.after(store.dock);
    }
    layout.removeAttribute('data-composer-body');
    if (!enabled) return;
    store.dock = document.querySelector('#thread-bottom-container');

    // Wrap scroller in realistic non-scrolling outer app-shell flex wrappers carrying --thread-content-* classes.
    const outer1 = document.createElement('div');
    outer1.className = 'app-shell-main-content [--thread-content-top-inset:0px] thread-outer-shell_v4';
    const outer2 = document.createElement('div');
    outer2.className = '[--thread-content-responsive-max-width:48rem] thread-outer-shell_v4';
    const scrollLayout = document.createElement('div');
    scrollLayout.className = 'group/thread-scroll-layout [--thread-content-x:initial] thread-scroll-layout_v4';
    scroller.replaceWith(outer1);
    outer1.append(outer2);
    outer2.append(scrollLayout);
    scrollLayout.append(scroller);
    store.outerRoot = outer1;

    const wrap = (parent, count) => {
      for (let i = 0; i < count; i++) {
        const next = document.createElement('div');
        next.className = 'thread-footer-contents_k2';
        parent.append(next);
        parent = next;
      }
      return parent;
    };
    const footer = document.createElement('div');
    footer.className = 'thread-footer_A8ZvKV';
    const scrollFooter = document.createElement('div');
    scrollFooter.setAttribute('data-thread-scroll-footer', 'true');
    scrollFooter.className = 'after:block after:h-(--thread-composer-bottom-inset)';
    wrap(footer, 5).append(scrollFooter);
    const backdrop = document.createElement('div');
    backdrop.setAttribute('data-thread-composer-backdrop', 'true');
    backdrop.setAttribute('data-pip-obstacle', 'thread-footer');
    const spacer = document.createElement('div');
    spacer.className = 'thread-footer-spacer_v4';
    const disclaimer = document.createElement('div');
    disclaimer.className = 'disclaimer_v7rk thread-footer-disclaimer_v4';
    disclaimer.textContent = 'Offline layout fixture. Replies here are synthetic placeholders.';
    wrap(scrollFooter, 4).append(backdrop, spacer, disclaimer);
    const shell = document.createElement('div');
    shell.className = 'thread-composer-shell_v4';
    wrap(backdrop, 4).append(shell);
    wrap(shell, 5).append(form);
    layout.setAttribute('data-composer-body', '');
    store.dock.remove();
    scroller.append(footer);
  }, { enabled, threadFooter: LIVE_SELECTORS.chatgpt.threadFooter });
  await settle(page);
}

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
    const composerCol = await page.locator(s.composerColumn).evaluate(node => ({
      width: node.getBoundingClientRect().width,
      hasLiteralToken: [...node.classList].some(token => token.includes('--thread-content-max-width')),
      inheritedVar: getComputedStyle(node).getPropertyValue('--thread-content-max-width').trim()
    }));
    assert.equal(composerCol.hasLiteralToken, false, `${label}: composer column has no literal --thread-content-max-width class token`);
    assert.equal(composerCol.inheritedVar, base.threadVariable, `${label}: composer column inherits ${base.threadVariable}`);
    near(composerCol.width, base.column, 0.5, `${label} composer column`);
    const composerWidth = await page.locator(s.composer).evaluate(node => node.getBoundingClientRect().width);
    near(composerWidth, base.paragraph, 0.5, `${label} composer`);
  } else {
    near(paragraph.box, base.block, 0.5, `${label} paragraph box`);
    const blocks = await page.locator(`${s.assistant} > *`).evaluateAll(nodes => nodes.map(node => {
      const box = getComputedStyle(node).display === 'inline' && node.firstElementChild ? node.firstElementChild : node;
      return { tag: node.localName, width: box.getBoundingClientRect().width };
    }));
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
    const layer = await page.locator(s.inputGradient).evaluate((node, { mainSel, areaSel }) => {
      const style = getComputedStyle(node);
      const before = getComputedStyle(node, '::before');
      const after = getComputedStyle(node, '::after');
      const rect = node.getBoundingClientRect();
      const mainRect = document.querySelector(mainSel).getBoundingClientRect();
      const areaRect = document.querySelector(areaSel).getBoundingClientRect();
      return {
        classes: [...node.classList],
        position: style.position,
        image: style.backgroundImage,
        beforeImage: before.backgroundImage,
        afterBg: after.backgroundColor,
        height: rect.height,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        mainWidth: mainRect.width,
        leftWing: areaRect.left - rect.left,
        rightWing: rect.right - areaRect.right,
        leftSample: { x: Math.round(rect.left + (areaRect.left - rect.left) / 2) - 8, y: Math.round(areaRect.top + areaRect.height / 2) - 4, width: 16, height: 8 },
        rightSample: { x: Math.round(areaRect.right + (rect.right - areaRect.right) / 2) - 8, y: Math.round(areaRect.top + areaRect.height / 2) - 4, width: 16, height: 8 },
        aboveSample: { x: Math.round(rect.left + (areaRect.left - rect.left) / 2) - 8, y: Math.round(rect.top - 28), width: 16, height: 8 }
      };
    }, { mainSel: s.main, areaSel: s.inputAreaContainer });
    assert.ok(
      layer.classes.includes('input-gradient-overlay') && layer.classes.includes('edge-to-edge'),
      `gemini: native input-container reproduces full-width edge-to-edge gradient overlay classes (${layer.classes.join(' ')})`
    );
    assert.equal(layer.position, 'absolute', 'gemini: native input gradient is absolutely positioned');
    assert.match(layer.image, /linear-gradient/, 'gemini: native input layer paints a gradient');
    assert.match(layer.beforeImage, /linear-gradient/, 'gemini: native input layer ::before paints a gradient');
    assert.equal(layer.afterBg, 'rgb(19, 19, 20)', 'gemini: native input layer ::after paints near-black base');
    // ~133px without attachments (probe); the fixture's attachment row makes it taller.
    assert.ok(layer.height >= NATIVE_BASELINES.gemini.gradientHeight - 2, `gemini: native input gradient is at least ~133px tall, got ${layer.height}`);
    near(layer.width, layer.mainWidth, 1, 'gemini: edge-to-edge input-container spans full chat-window width');
    assert.ok(layer.leftWing >= 200 && layer.rightWing >= 200, `gemini: narrow 660px input area leaves wide left/right wings (${layer.leftWing}/${layer.rightWing}px)`);
    const { r, g, b, a } = below.pixel;
    assert.ok(a === 255 && Math.max(r, g, b) <= 32, `gemini: native paint below the composer is opaque near-black, got rgba(${r},${g},${b},${a})`);

    // Prove without extension that the native dark gradient band occludes both left/right wings and below the composer.
    await page.locator(s.main).evaluate((main, top) => {
      const probe = document.createElement('div');
      probe.id = 'prism-native-wing-probe';
      probe.style.cssText = `position:fixed;left:0;right:0;top:${Math.round(top - 48)}px;bottom:0;z-index:0;pointer-events:none;background:#ffffff`;
      main.prepend(probe);
    }, layer.top);
    try {
      await settle(page);
      const aboveMean = (await regionStats(page, layer.aboveSample)).mean;
      const leftMean = (await regionStats(page, layer.leftSample)).mean;
      const rightMean = (await regionStats(page, layer.rightSample)).mean;
      const belowProbe = await sampleBelow(page, s.composer, { offsetX: 6, offsetY: 6 });
      assert.ok(Math.min(aboveMean.r, aboveMean.g, aboveMean.b) >= 245, `gemini native probe above input-container stays unoccluded (${JSON.stringify(aboveMean)})`);
      for (const [wingName, mean] of [['left wing', leftMean], ['right wing', rightMean]]) {
        assert.ok(Math.max(mean.r, mean.g, mean.b) <= 32, `gemini native ${wingName} paints opaque dark gradient band (${JSON.stringify(mean)})`);
      }
      assert.ok(Math.max(belowProbe.pixel.r, belowProbe.pixel.g, belowProbe.pixel.b) <= 32, `gemini native below composer paints opaque dark gradient band (${JSON.stringify(belowProbe.pixel)})`);
    } finally {
      await page.evaluate(() => document.getElementById('prism-native-wing-probe')?.remove());
      await settle(page);
    }
  } else {
    const dock = await page.evaluate(({ bottomDock, scroller, composer, belowSpacer }) => {
      const dockNode = document.querySelector(bottomDock);
      const scrollerNode = document.querySelector(scroller);
      const composerNode = document.querySelector(composer);
      const spacerNode = document.querySelector(belowSpacer);
      const dockStyle = getComputedStyle(dockNode);
      const before = getComputedStyle(dockNode, '::before');
      const dockRect = dockNode.getBoundingClientRect();
      const scrollerRect = scrollerNode.getBoundingClientRect();
      const composerRect = composerNode.getBoundingClientRect();
      const spacerRect = spacerNode?.getBoundingClientRect();
      return {
        position: dockStyle.position,
        backgroundColor: dockStyle.backgroundColor,
        dockTop: dockRect.top,
        scrollerBottom: scrollerRect.bottom,
        beforeContent: before.content,
        beforeImage: before.backgroundImage,
        beforeMask: before.maskImage || 'none',
        beforeWebkitMask: before.webkitMaskImage || 'none',
        bottomGap: window.innerHeight - composerRect.bottom,
        spacerHeight: spacerRect ? spacerRect.height : 0
      };
    }, { bottomDock: s.bottomDock, scroller: s.scroller, composer: s.composer, belowSpacer: s.belowSpacer });
    assert.equal(dock.position, 'relative', 'chatgpt: bottom dock sits in normal flex flow');
    assert.ok(dock.dockTop >= dock.scrollerBottom - 1, `chatgpt: bottom dock (${dock.dockTop}) follows scroller (${dock.scrollerBottom})`);
    assert.ok(dock.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(dock.backgroundColor), `chatgpt: bottom dock paints an opaque backdrop (${dock.backgroundColor})`);
    assert.ok(dock.beforeContent && dock.beforeContent !== 'none', 'chatgpt: bottom dock paints a ::before fade');
    assert.match(dock.beforeImage, /linear-gradient/, 'chatgpt: bottom dock ::before paints a gradient');
    assert.ok(/linear-gradient/.test(dock.beforeMask) || /linear-gradient/.test(dock.beforeWebkitMask), 'chatgpt: bottom dock ::before carries a fade mask');
    assert.ok(dock.bottomGap >= 58, `chatgpt: native bottom gap below ComposerLayoutRoot is >= 58px, got ${dock.bottomGap}`);
    assert.ok(dock.spacerHeight >= 20, `chatgpt: native spacer below composer form is visible (${dock.spacerHeight}px)`);
    const { r, g, b, a } = below.pixel;
    const [er, eg, eb] = dock.backgroundColor.match(/\d+/g).map(Number);
    assert.ok(a === 255 && Math.abs(r - er) <= 2 && Math.abs(g - eg) <= 2 && Math.abs(b - eb) <= 2, `chatgpt: below-composer pixel matches opaque dock surface (${dock.backgroundColor}, got rgba(${r},${g},${b},${a}))`);
  }
  const corner = await page.locator(s.cornerFloat).evaluate(node => {
    const style = getComputedStyle(node);
    const r = node.getBoundingClientRect();
    return {
      position: style.position,
      display: style.display,
      visibility: style.visibility,
      opacity: parseFloat(style.opacity),
      width: r.width,
      height: r.height,
      rightGap: window.innerWidth - r.right,
      bottomGap: window.innerHeight - r.bottom
    };
  });
  assert.equal(corner.position, 'fixed', `${host}: corner float button uses fixed positioning`);
  assert.ok(corner.display !== 'none' && corner.visibility === 'visible' && corner.opacity > 0 && corner.width > 0 && corner.height > 0, `${host}: corner float button is visible`);
  assert.ok(corner.rightGap >= 0 && corner.rightGap <= 64 && corner.bottomGap >= 0 && corner.bottomGap <= 64, `${host}: corner float button sits in bottom-right corner`);
}

async function assertNativeHeadings(page, host) {
  const styles = await headingStyles(page, LIVE_SELECTORS[host].assistant);
  for (const tag of ['h1', 'h2', 'h3', 'h4']) assert.ok(styles[tag], `${host}: fixture has an ${tag}`);
  for (const tag of ['h2', 'h3']) {
    assert.equal(styles[tag].fontSize, NATIVE_BASELINES[host][tag].fontSize, `${host} native ${tag} size`);
    assert.equal(styles[tag].fontWeight, NATIVE_BASELINES[host][tag].fontWeight, `${host} native ${tag} weight`);
  }
}

/** Text (>= 6 chars, typed draft included) and session/message ids on the page that the probe must never emit. */
function probeSecrets(page) {
  return page.evaluate(() => {
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
}

async function assertProbePrivacy(page, host, probeSource) {
  const s = LIVE_SELECTORS[host];
  const canary = 'PRISM-CANARY-DRAFT-7351';
  await page.locator(s.editor).click();
  await page.keyboard.type(canary);
  const secrets = await probeSecrets(page);
  assert.ok(secrets.texts.some(text => text.includes(canary)), 'canary draft was typed into the native editor');
  assert.ok(secrets.texts.includes('Help and shortcuts'), `${host}: corner float aria-label is included in privacy checks`);
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
    assert.ok(result.targets.composerAncestors.samples.length >= 8, `chatgpt: composerAncestors captures deep ancestor chain (got ${result.targets.composerAncestors.samples.length})`);
    assert.ok(result.targets.composerAncestors.samples.some(sample => sample.classes.includes('page')), 'chatgpt: composerAncestors captures .page');
    assert.ok(result.targets.composerAncestors.samples.some(sample => sample.tag === 'body'), 'chatgpt: composerAncestors captures body');
    const dockSample = result.targets.composerAncestors.samples.find(sample => sample.classes.includes('content-fade_b9xk'));
    assert.ok(dockSample, 'chatgpt: composerAncestors captures #thread-bottom-container');
    assert.equal(dockSample.style.position, 'relative');
    assert.ok(!/rgba\(0, 0, 0, 0\)|transparent/.test(dockSample.style.backgroundColor), 'chatgpt: bottom dock reports opaque background');
    assert.equal(dockSample.pseudos?.before?.hasContent, true, 'chatgpt: bottom dock ::before pseudo is captured');
    assert.match(dockSample.pseudos.before.backgroundImage, /linear-gradient/);
    assert.ok(/linear-gradient/.test(dockSample.pseudos.before.maskImage || '') || /linear-gradient/.test(dockSample.pseudos.before.webkitMaskImage || ''), 'chatgpt: bottom dock ::before mask is captured');
    const colSample = result.targets.composerAncestors.samples.find(sample => sample.classes.includes('composer-column'));
    assert.ok(colSample, 'chatgpt: composerAncestors captures .composer-column');
    assert.equal(colSample.classes.some(token => token.includes('--thread-content-max-width')), false);
    assert.equal(colSample.style['--thread-content-max-width'], '48rem');
    const mainSample = result.targets.composerAncestors.samples.find(sample => sample.tag === 'main');
    assert.equal(mainSample?.style['--thread-content-max-width'], '48rem', 'chatgpt: main ancestor defines --thread-content-max-width');
    assert.equal(result.targets.composerSiblings.count, 2, 'chatgpt: composerSiblings captures spacer and disclaimer');
    const [spacer, disclaimer] = result.targets.composerSiblings.samples;
    assert.ok(spacer.classes.includes('composer-below-spacer') && spacer.childCount === 0 && spacer.hasInteractive === false && spacer.rect.height >= 20, 'chatgpt: empty below-composer spacer captured');
    assert.ok(disclaimer.classes.includes('disclaimer_v7rk') && disclaimer.hasInteractive === false && disclaimer.style.minHeight === '44px' && disclaimer.rect.height >= 44, 'chatgpt: disclaimer sibling captured');
    assert.equal(result.targets.cornerFloats.count, 1, 'chatgpt: cornerFloats captures the host corner help button');
    assert.ok(result.targets.cornerFloats.samples[0].classes.includes('host-corner-help') && result.targets.cornerFloats.samples[0].style.position === 'fixed' && result.targets.cornerFloats.samples[0].hasAriaLabel === true);
    assert.ok(result.targets.userBubbleAncestors.samples.length >= 4, `chatgpt: userBubbleAncestors captures ancestor chain (got ${result.targets.userBubbleAncestors.samples.length})`);
    assert.ok(result.targets.userBubbleAncestors.samples.some(sample => sample.classes.includes('user-turn')), 'chatgpt: userBubbleAncestors captures .user-turn');
    assert.ok(result.targets.userBubbleAncestors.samples.some(sample => sample.data['data-turn-key'] === '[id]'), 'chatgpt: userBubbleAncestors captures [data-turn-key]');
    const bubbleTranscript = result.targets.userBubbleAncestors.samples.find(sample => sample.classes.some(token => token.startsWith('transcriptContent')));
    assert.ok(bubbleTranscript, 'chatgpt: userBubbleAncestors captures transcriptContent');
    assert.equal(bubbleTranscript.style['--thread-content-max-width'], '48rem');
    assert.equal(bubbleTranscript.style['--user-chat-width'], '70%');
  } else {
    assert.equal(first('markdownBlocks').style.maxWidth, '708px');
    assert.equal(normalize(first('textInputField').style.gridTemplateAreas), NATIVE_BASELINES.gemini.gridAreas);
    assert.equal(first('inputContainer').style.position, 'absolute');
    assert.equal(first('inputContainer').style.minHeight, '133px');
    assert.ok(result.targets.inputAncestors.samples.length >= 5, `gemini: inputAncestors captures deep ancestor chain (got ${result.targets.inputAncestors.samples.length})`);
    assert.ok(result.targets.userBubbleAncestors.samples.length >= 4, `gemini: userBubbleAncestors captures ancestor chain (got ${result.targets.userBubbleAncestors.samples.length})`);
    assert.ok(result.targets.userBubbleAncestors.samples.some(sample => sample.tag === 'user-query'), 'gemini: userBubbleAncestors captures user-query');
    assert.ok(result.targets.userBubbleAncestors.samples.some(sample => sample.classes.includes('user-query-container')), 'gemini: userBubbleAncestors captures .user-query-container');
    assert.ok(result.targets.userBubbleAncestors.samples.some(sample => sample.tag === 'chat-window' && sample.style['--bard-chat-window-content-width-default'] === '744px' && sample.style['--bard-chat-window-content-width'] === '708px'), 'gemini: userBubbleAncestors captures chat-window width vars');
    assert.ok(result.targets.userQueryText.count >= 2, 'gemini: userQueryText captures query text containers');
    assert.ok(result.targets.userQueryText.samples.some(sample => sample.classes.includes('query-text')), 'gemini: userQueryText captures .query-text');
    assert.ok(result.targets.userQueryText.samples.some(sample => sample.classes.includes('query-text-line')), 'gemini: userQueryText captures .query-text-line');
    assert.ok(result.targets.inputAreaChildren.count >= 2, 'gemini: inputAreaChildren captures input-area children');
    assert.ok(result.targets.inputAreaChildren.samples.some(sample => sample.tag === 'input-area-v2'), 'gemini: inputAreaChildren captures input-area-v2');
    assert.ok(result.targets.inputAreaChildren.samples.some(sample => sample.classes.includes('text-input-field')), 'gemini: inputAreaChildren captures .text-input-field');
    const weights = Object.fromEntries(result.targets.headings.samples.map(sample => [sample.tag, Number(sample.style.fontWeight)]));
    assert.equal(weights.h2, 380);
    assert.equal(weights.h3, 470);
    assert.equal(result.targets.inputSiblings.count, 1, 'gemini: inputSiblings captures disclaimer');
    assert.equal(result.targets.inputSiblings.samples[0].tag, 'hallucination-disclaimer');
    assert.equal(result.targets.inputSiblings.samples[0].hasInteractive, false);
    assert.equal(result.targets.cornerFloats.count, 1, 'gemini: cornerFloats captures the host corner help button');
    assert.ok(result.targets.cornerFloats.samples[0].classes.includes('host-corner-help') && result.targets.cornerFloats.samples[0].style.position === 'fixed' && result.targets.cornerFloats.samples[0].hasAriaLabel === true);
  }
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.press('Backspace');
  return result;
}

const nearRgb = (pixel, target, tolerance, label) => {
  assert.equal(pixel.a, 255, `${label}: expected opaque pixel, got alpha=${pixel.a}`);
  assert.ok(
    Math.abs(pixel.r - target[0]) <= tolerance && Math.abs(pixel.g - target[1]) <= tolerance && Math.abs(pixel.b - target[2]) <= tolerance,
    `${label}: expected rgb(${target.join(',')})±${tolerance}, got rgba(${pixel.r},${pixel.g},${pixel.b},${pixel.a})`
  );
};

async function checkChatGPTBottomVariantBaselines(suite) {
  const { engine, probeSource } = suite;
  await onLiveFixture({ ...suite, fixtureBridge: undefined }, 'chatgpt', { failure: 'chatgpt-bottom-variant-failure' }, async ({ page, errors }) => {
    await applyChatGPTBottomVariants(page, {
      containerFadeAfter: true,
      overlayHostAfter: true,
      sharpEdgeShadow: true,
      outerSpacersAndVtDisclaimer: true
    });
    await page.locator(LIVE_SELECTORS.chatgpt.scroller).evaluate(node => { node.scrollTop = node.scrollHeight; });
    await settle(page);

    const result = await assertProbePrivacy(page, 'chatgpt', probeSource);

    const fadeContainer = result.targets.contentFades.samples.find(s => s.classes.includes('content-fade-container'));
    assert.ok(fadeContainer, 'chatgpt variant: contentFades captures .content-fade-container');
    assert.ok(fadeContainer.children.includes('button.scroll-to-bottom-btn'), 'chatgpt variant: .content-fade-container is non-empty');
    assert.equal(fadeContainer.pseudos?.after?.hasContent, true, 'chatgpt variant: .content-fade-container::after captured');
    assert.match(fadeContainer.pseudos.after.backgroundImage, /linear-gradient/);
    assert.ok(/linear-gradient/.test(fadeContainer.pseudos.after.maskImage || '') || /linear-gradient/.test(fadeContainer.pseudos.after.webkitMaskImage || ''), 'chatgpt variant: .content-fade-container::after mask captured');

    const dockSample = result.targets.composerAncestors.samples.find(s => s.classes.includes('content-fade_b9xk'));
    assert.equal(dockSample.pseudos?.after?.hasContent, true, 'chatgpt variant: host dock ::after captured');
    assert.match(dockSample.pseudos.after.backgroundImage, /linear-gradient/);
    assert.match(dockSample.pseudos.after.boxShadow, /43, 39, 56/);
    assert.match(dockSample.style.boxShadow, /43, 39, 56/);
    assert.match(dockSample.style['--sharp-edge-bottom-shadow'], /#2b2738/i);
    assert.equal(dockSample.style['--sharp-edge-bottom-shadow-placeholder-content'], '[text]');
    assert.equal(dockSample.style['--sharp-edge-top-shadow'], '0 2px 0 0 #2b2738');
    assert.ok(dockSample.style['--composer-surface-primary'], 'chatgpt variant: --composer-surface-primary collected');
    assert.ok(dockSample.rect.viewportBottomOffset >= 50, `chatgpt variant: dock lifted above viewport bottom (${dockSample.rect.viewportBottomOffset}px)`);

    assert.equal(result.targets.dockSiblings.count, 2, 'chatgpt variant: dockSiblings captures external spacer and disclaimer');
    const [outerSpacer, outerDisclaimer] = result.targets.dockSiblings.samples;
    assert.ok(outerSpacer.classes.includes('dock-outer-spacer') && outerSpacer.childCount === 0 && outerSpacer.rect.height >= 24, 'chatgpt variant: external empty spacer captured');
    assert.ok(outerDisclaimer.classes.includes('disclaimer-outer-wrap') && parseFloat(outerDisclaimer.style.marginTop) < 0 && outerDisclaimer.rect.height >= 36, 'chatgpt variant: external negative-margin disclaimer captured');
    const supportsVt = await page.evaluate(() => typeof CSS !== 'undefined' && CSS.supports('view-transition-name', 'disclaimer-shell'));
    if (supportsVt) assert.equal(outerDisclaimer.style.viewTransitionName, 'disclaimer-shell', 'chatgpt variant: viewTransitionName captured');
    assert.ok(result.targets.disclaimerShells.samples.some(s => s.classes.includes('disclaimer-outer-wrap')), 'chatgpt variant: disclaimerShells captures .disclaimer-outer-wrap');

    assert.ok(result.bottomOffsets.dockBottomOffset >= 50, `chatgpt variant: dockBottomOffset >= 50 (got ${result.bottomOffsets.dockBottomOffset})`);
    assert.ok(result.bottomOffsets.composerBottomOffset >= 115, `chatgpt variant: composerBottomOffset >= 115 (got ${result.bottomOffsets.composerBottomOffset})`);

    const belowComposer = await sampleBelow(page, LIVE_SELECTORS.chatgpt.composer, { offsetX: 6, offsetY: 6 });
    nearRgb(belowComposer.pixel, [45, 42, 58], 4, `${engine} chatgpt variant below composer band`);

    const belowDock = await sampleBelow(page, LIVE_SELECTORS.chatgpt.bottomDock, { offsetX: 6, offsetY: 6 });
    nearRgb(belowDock.pixel, [43, 39, 56], 3, `${engine} chatgpt variant sharp-edge bottom shadow`);

    // Verify containerFadeAfter and sharpEdgeShadow also reproduce independently when overlayHostAfter is off.
    await applyChatGPTBottomVariants(page, { containerFadeAfter: true, outerSpacersAndVtDisclaimer: true });
    const belowFadeOnly = await sampleBelow(page, LIVE_SELECTORS.chatgpt.composer, { offsetX: 6, offsetY: 6 });
    nearRgb(belowFadeOnly.pixel, [45, 42, 58], 4, `${engine} chatgpt containerFadeAfter-only band`);

    await applyChatGPTBottomVariants(page, { sharpEdgeShadow: true, outerSpacersAndVtDisclaimer: true });
    const belowShadowOnly = await sampleBelow(page, LIVE_SELECTORS.chatgpt.composer, { offsetX: 6, offsetY: 6 });
    nearRgb(belowShadowOnly.pixel, [43, 39, 56], 3, `${engine} chatgpt sharpEdgeShadow-only band`);

    await applyChatGPTBottomVariants(page, { stickyInScroller: true, overlayHostAfter: true });
    const stickyState = await page.locator(LIVE_SELECTORS.chatgpt.bottomDock).evaluate(node => ({
      inScroller: Boolean(node.closest('[data-prism-test-scroller]')),
      position: getComputedStyle(node).position
    }));
    assert.deepEqual(stickyState, { inScroller: true, position: 'sticky' }, 'chatgpt variant: stickyInScroller moves dock into scroller');

    await applyChatGPTBottomVariants(page, {});
    const resetState = await page.locator(LIVE_SELECTORS.chatgpt.bottomDock).evaluate(node => ({
      inScroller: Boolean(node.closest('[data-prism-test-scroller]')),
      position: getComputedStyle(node).position,
      extraCount: document.querySelectorAll('.content-fade-container, .dock-outer-spacer, .disclaimer-outer-wrap').length
    }));
    assert.deepEqual(resetState, { inScroller: false, position: 'relative', extraCount: 0 }, 'chatgpt variant: {} restores default native DOM');

    assert.deepEqual(errors, []);
    console.log(`PASS ${engine} chatgpt bottom reproduction-variant baselines and probe privacy`);
  });
}

/**
 * v0.4.3 #41 sample areas around the Composer Surface on the live thread-footer variant (CSS px, viewport space):
 * `left` is a strip 16–40px left of the composer just above its bottom edge (the ::before gradient is nearly opaque
 * there), `below` the same columns under the composer's bottom edge inside the ::after slab, and `above` the same columns
 * above the footer, which show the page background behind the conversation. The columns stay clear of the Composer
 * Surface's own shadow.
 */
export async function threadFooterRegions(page) {
  return page.evaluate(threadFooter => {
    const box = node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
    const composer = box(document.querySelector('[data-composer-layout]'));
    const footer = box(document.querySelector(threadFooter));
    const main = box(document.querySelector('main'));
    const dock = document.querySelector('#op-bottom-dock');
    const dockTop = dock ? dock.getBoundingClientRect().top : Infinity;
    let x = Math.max(main.left + 20, composer.left - 40);
    let width = Math.min(24, composer.left - 4 - x);
    if (width < 8) {
      // Full-width preset shifts the column left to reserve space for the Conversation Rail on the right;
      // sample the right wing inside the footer's 16px inset (below the corner help button).
      x = composer.right + 12;
      width = Math.min(24, main.right - 20 - x);
    }
    const gap = footer.bottom - composer.bottom;
    const belowPad = gap >= 16 ? 4 : 1;
    const belowHeight = Math.min(16, Math.max(1, Math.floor(gap - belowPad * 2)));
    return {
      composer, footer,
      left: { x, y: composer.bottom - 5, width, height: 4 },
      below: { x, y: composer.bottom + belowPad, width, height: belowHeight },
      above: { x, y: Math.min(composer.top, footer.top, dockTop) - 32, width, height: 8 }
    };
  }, LIVE_SELECTORS.chatgpt.threadFooter);
}

/** The 2026-11-24 ChatGPT thread footer reproduces the opaque band & >= 64px native bottom gap; the probe reports its depth privately. */
async function checkChatGPTThreadFooterBaseline(suite) {
  const { engine, probeSource } = suite;
  await onLiveFixture({ ...suite, fixtureBridge: undefined }, 'chatgpt', { failure: 'chatgpt-thread-footer-baseline-failure' }, async ({ page, errors }) => {
    const original = await page.locator(LIVE_SELECTORS.chatgpt.composer).evaluate(node => node.getBoundingClientRect().toJSON());
    await applyChatGPTThreadFooter(page);
    await page.locator(LIVE_SELECTORS.chatgpt.scroller).evaluate(node => { node.scrollTop = node.scrollHeight; });
    await settle(page);
    const shape = await page.evaluate(({ threadFooter, threadScrollFooter, threadComposerBackdrop, outerThreadWrappers, threadFooterDisclaimer, threadFooterSpacer }) => {
      const footer = document.querySelector(threadFooter);
      const scrollFooter = document.querySelector(threadScrollFooter);
      const backdrop = document.querySelector(threadComposerBackdrop);
      const form = document.querySelector('form[data-chatgpt-composer]');
      const composer = document.querySelector('[data-composer-layout]');
      const outerWrappers = [...document.querySelectorAll(outerThreadWrappers)];
      const disclaimer = document.querySelector(threadFooterDisclaimer);
      const spacer = document.querySelector(threadFooterSpacer);
      let depth = 0, noBox = 0;
      for (let node = form.parentElement; node !== footer; node = node.parentElement) {
        depth++;
        if (getComputedStyle(node).display === 'contents') noBox++;
      }
      const style = getComputedStyle(footer);
      return {
        depth, noBox, position: style.position, zIndex: style.zIndex,
        inScroller: footer.parentElement.matches('[data-prism-test-scroller]'),
        legacyDock: document.querySelectorAll('#thread-bottom-container,#thread-bottom').length,
        outerWrapperCount: outerWrappers.length,
        outerWrapperPaddings: outerWrappers.map(el => getComputedStyle(el).paddingBottom),
        scrollFooterAfterHeight: Math.round(parseFloat(getComputedStyle(scrollFooter, '::after').height) || 0),
        backdropWidth: Math.round(backdrop.getBoundingClientRect().width),
        disclaimerHeight: disclaimer ? Math.round(disclaimer.getBoundingClientRect().height) : 0,
        spacerHeight: spacer ? Math.round(spacer.getBoundingClientRect().height) : 0,
        viewportBottomGap: Math.round((window.innerHeight - composer.getBoundingClientRect().bottom) * 10) / 10
      };
    }, LIVE_SELECTORS.chatgpt);
    assert.deepEqual(
      { depth: shape.depth, noBox: shape.noBox, position: shape.position, zIndex: shape.zIndex, inScroller: shape.inScroller, legacyDock: shape.legacyDock },
      { depth: THREAD_FOOTER_DEPTH, noBox: 18, position: 'absolute', zIndex: '20', inScroller: true, legacyDock: 0 },
      'chatgpt thread footer: absolutely positioned child of the scroll container, 21 ancestors above the form, 18 without a box'
    );
    assert.equal(shape.outerWrapperCount, 3, 'chatgpt thread footer: three outer non-scrolling flex wrappers carry --thread-content-* classes');
    assert.deepEqual(shape.outerWrapperPaddings, ['0px', '0px', '0px'], 'chatgpt thread footer: outer wrappers natively have 0px bottom padding');
    assert.equal(shape.scrollFooterAfterHeight, 24, 'chatgpt thread footer: [data-thread-scroll-footer]::after inset is 24px');
    assert.equal(shape.backdropWidth, 808, 'chatgpt thread footer: [data-thread-composer-backdrop] is the 808px live width limiter');
    assert.ok(shape.disclaimerHeight >= 32 && shape.spacerHeight >= 10, `chatgpt thread footer: inner disclaimer (${shape.disclaimerHeight}px) and spacer (${shape.spacerHeight}px) exist natively`);
    assert.ok(shape.viewportBottomGap >= 64, `${engine} chatgpt thread footer native: Composer Surface bottom gap >= 64px (got ${shape.viewportBottomGap}px)`);

    const regions = await threadFooterRegions(page);
    assert.ok(regions.left.width >= 8 && regions.below.height >= 4, `chatgpt thread footer: sample areas exist (${JSON.stringify(regions)})`);
    for (const name of ['left', 'below']) {
      const { mean } = await regionStats(page, regions[name]);
      for (const channel of ['r', 'g', 'b']) near(mean[channel], 14, 3, `${engine} chatgpt thread footer native ${name} of composer is the opaque footer surface #0e0e0e (${channel})`);
    }
    const above = (await regionStats(page, regions.above)).mean;
    for (const channel of ['r', 'g', 'b']) near(above[channel], 33, 3, `${engine} chatgpt thread footer native background above the composer is #212121 (${channel})`);

    await page.locator(LIVE_SELECTORS.chatgpt.editor).click();
    await page.keyboard.type('PRISM-CANARY-DRAFT-7351');
    const secrets = await probeSecrets(page);
    assert.ok(secrets.ids.length >= 3, 'chatgpt thread footer: fixture carries session/message ids to redact');
    const result = await page.evaluate(source => (0, eval)(source), probeSource);
    const json = JSON.stringify(result);
    for (const text of secrets.texts) assert.equal(json.includes(text), false, `chatgpt thread footer: probe output leaked text "${text.slice(0, 40)}"`);
    for (const id of secrets.ids) assert.equal(json.includes(id), false, `chatgpt thread footer: probe output leaked id "${id}"`);
    assert.equal(json.includes('prism-live-fixture'), false, 'chatgpt thread footer: probe output omits the page path');
    assert.equal(result.bottomOffsets.dockBottomOffset, 0, 'chatgpt thread footer: bottomOffsets.dockBottomOffset resolves from Thread Footer');
    assert.equal(result.bottomOffsets.threadFooterBottomOffset, 0, 'chatgpt thread footer: bottomOffsets.threadFooterBottomOffset resolves from Thread Footer');
    assert.ok(result.bottomOffsets.composerBottomOffset >= 64, `chatgpt thread footer: bottomOffsets.composerBottomOffset >= 64 (got ${result.bottomOffsets.composerBottomOffset})`);
    assert.ok(result.targets.outerWrappers.count >= 3, 'chatgpt thread footer: probe captures outer --thread-content-* wrappers');
    assert.equal(result.targets.scrollerOverlap.found, true, 'chatgpt thread footer: probe captures scrollerOverlap');
    assert.equal(result.targets.scrollerOverlap.scroller.containsFooter, true);
    const footer = result.targets.composerFooter;
    assert.equal(footer.count, 1, 'chatgpt thread footer: probe finds the painted footer');
    assert.deepEqual(footer.chains.form, { ancestors: THREAD_FOOTER_DEPTH + 1, noBox: 18 }, 'chatgpt thread footer: probe counts the form chain and its boxless wrappers');
    assert.ok(footer.chains.editor.ancestors > footer.chains.composerLayout.ancestors && footer.chains.composerLayout.ancestors > footer.chains.form.ancestors, 'chatgpt thread footer: editor > Composer Surface > form depth');
    assert.ok(footer.markers.scrollFooter > footer.markers.composerBackdrop, 'chatgpt thread footer: probe locates both host markers');
    assert.equal(footer.scrollFooter?.pseudos?.after?.height, '24px', 'chatgpt thread footer: probe captures 24px ::after inset on [data-thread-scroll-footer]');
    assert.equal(footer.composerBackdrop?.style['--thread-content-max-width'], '48rem', 'chatgpt thread footer: probe captures --thread-content-max-width on [data-thread-composer-backdrop]');
    assert.ok(footer.internalDisclaimers.length >= 1, 'chatgpt thread footer: probe captures internal footer disclaimer');
    const [sample] = footer.samples;
    assert.equal(sample.anchor.anchorScope, '--thread-composer');
    assert.equal(footer.formAnchor.anchorName, '--thread-composer');
    assert.match(sample.pseudos.before.backgroundImage, /linear-gradient/);
    assert.equal(sample.pseudos.after.backgroundColor, 'rgb(14, 14, 14)');
    assert.equal(sample.pseudos.before.insetInlineStart, '16px');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.press('Backspace');

    await applyChatGPTThreadFooter(page, { enabled: false });
    const restored = await page.evaluate(({ threadFooter, outerThreadWrappers }) => ({
      footers: document.querySelectorAll(`${threadFooter},[data-composer-body]`).length,
      outerWrappers: document.querySelectorAll(outerThreadWrappers).length,
      dockHasForm: Boolean(document.querySelector('#thread-bottom-container .composer-column > form[data-chatgpt-composer]'))
    }), LIVE_SELECTORS.chatgpt);
    assert.deepEqual(restored, { footers: 0, outerWrappers: 0, dockHasForm: true }, 'chatgpt thread footer: { enabled: false } restores the default fixture');
    const back = await page.locator(LIVE_SELECTORS.chatgpt.composer).evaluate(node => node.getBoundingClientRect().toJSON());
    assert.deepEqual(back, original, 'chatgpt thread footer: the default composer geometry returns');
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine} chatgpt thread-footer variant baseline: opaque band, ${shape.viewportBottomGap}px native gap, ${THREAD_FOOTER_DEPTH}-ancestor chain, outer wrappers & private probe report`);
  });
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
  await checkChatGPTBottomVariantBaselines(suite);
  await checkChatGPTThreadFooterBaseline(suite);
}
