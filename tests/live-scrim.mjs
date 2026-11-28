/**
 * v0.4.0 #25 / v0.4.4 #45: Unified transparent bottom dock & scroll-end clearance checks on probe-derived live fixtures.
 * Measured in rendered pixels, hit tests and bounding boxes:
 * - ChatGPT in-flow across all 4 palettes (obsidian, warm, crystal, alabaster): continuous glow from above
 *   composer down to innerHeight - 6, zero occlusion/blur, collapsed empty spacer, tight bottom gap,
 *   clickable crisp disclaimer, and exact native restoration.
 * - ChatGPT sticky-overlay variant: moving #thread-bottom-container inside the scroller with sticky
 *   positioning keeps zero scrim/blur, opaque Composer Surface, and preserved scroll clearance.
 * - Gemini overlay across all 4 palettes × all 3 Content Width Presets (standard, wide, full): pure
 *   transparent bottom bar matching Ambient Stage/canvas seamlessly on left/right wings and below the
 *   composer with zero dark rectangular luminance step and zero backdrop-filter blur, opaque Composer
 *   Surface, clickable last Assistant Turn message-actions scrolled above composer, and 100% clean
 *   native restoration on composerRestyle: false, Native Palette, Home State, site/extension disable, and stop().
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { onLiveFixture, injectExtension as injectRuntime, patchConfig, settle as frames, applyChatGPTBottomVariants, LIVE_SELECTORS } from './live-fixtures.mjs';
import { capturePixels, regionStats, channelGap } from './measure.mjs';
import { checkChatGPTThreadFooter } from './live-footer.mjs';

const WIDTHS = ['standard', 'wide', 'full'];

const PALETTES = [
  { name: 'obsidian', scheme: 'dark', patch: { themeMode: 'dark', palette: 'obsidian' }, hostPatch: { palette: 'host' } },
  { name: 'warm', scheme: 'dark', patch: { themeMode: 'dark', palette: 'warm' }, hostPatch: { palette: 'host' } },
  { name: 'crystal', scheme: 'light', patch: { themeMode: 'light', lightPreset: 'crystal' }, hostPatch: { lightPreset: 'host' } },
  { name: 'alabaster', scheme: 'light', patch: { themeMode: 'light', lightPreset: 'alabaster' }, hostPatch: { lightPreset: 'host' } }
];

const rgb = value => { const [r, g, b] = value.match(/[\d.]+/g).map(Number); return { r, g, b }; };
const distance = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
// Every horizon tone (blue, violet, cyan) is bluer than its red/green mix; glow raises this on any canvas.
const blueness = p => p.b - (p.r + p.g) / 2;
const fmt = p => `rgb(${Math.round(p.r)},${Math.round(p.g)},${Math.round(p.b)})`;
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}±${tolerance}, got ${actual}`);

async function injectExtension(page, suite) {
  await injectRuntime(page, suite, { waitFor: '.op-vial-pill' });
  await frames(page);
}

async function applyPalette(page, pal, extraSelector = '', extraPatch = {}) {
  const ambientStyle = extraPatch.ambientStyle ?? 'aurora';
  await patchConfig(page, { ...pal.patch, ambientStyle, ...extraPatch });
  await page.waitForFunction(([name, scheme, sel, tex, amb, width]) =>
    document.documentElement.getAttribute('data-op-effective-palette') === name &&
    document.documentElement.getAttribute('data-op-scheme') === scheme &&
    document.documentElement.getAttribute('data-op-ambient-style') === amb &&
    (!tex || document.documentElement.getAttribute('data-op-texture') === tex) &&
    (!width || document.documentElement.getAttribute('data-op-content-width') === width) &&
    (!sel || Boolean(document.querySelector(sel))),
    [pal.name, pal.scheme, extraSelector, extraPatch.ambientTexture || '', ambientStyle, extraPatch.contentWidth || '']
  );
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

/** Sample points around the Composer Surface (clamped inside main surface across standard/wide/full widths). */
async function glowPoints(page, host, { includeInFlowBands = false } = {}) {
  const box = await composerBox(page, host);
  const vh = page.viewportSize().height;
  const { mainRect, dockRect, helpRect, railRect, scrollBtnRect } = await page.evaluate(mainSel => {
    const pick = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    return {
      mainRect: pick(document.querySelector(mainSel)),
      dockRect: pick(document.querySelector('#op-bottom-dock')),
      helpRect: pick(document.querySelector('.host-corner-help')),
      railRect: pick(document.querySelector('#op-rail-root')),
      scrollBtnRect: pick(document.querySelector('.scroll-to-bottom-btn'))
    };
  }, LIVE_SELECTORS[host].main);
  const leftGap = box.left - mainRect.left;
  const rightGap = mainRect.right - box.right;
  const leftX = leftGap >= 56 ? Math.round(box.left - 40) : Math.round(mainRect.left + Math.max(4, leftGap / 2));
  let right = {
    x: rightGap >= 56 ? Math.round(box.right + 40) : Math.round(box.right + Math.max(4, rightGap / 2)),
    y: box.centerY
  };
  const obstacles = [dockRect, helpRect, railRect].filter(Boolean);
  const hits = (pt, obs) => obs && pt.x >= obs.left - 12 && pt.x <= obs.right + 12 && pt.y >= obs.top - 12 && pt.y <= obs.bottom + 12;
  if (obstacles.some(obs => hits(right, obs))) {
    const blocking = obstacles.find(obs => hits(right, obs));
    if (blocking && blocking.left - box.right >= 20) right.x = Math.round((box.right + blocking.left) / 2);
    else if (blocking && blocking.bottom < box.bottom - 14) right.y = Math.round(Math.min(box.bottom - 8, Math.max(box.centerY, blocking.bottom + 16)));
    else if (blocking) right.y = Math.max(box.top + 8, blocking.top - 14);
  }
  const belowY = Math.min(vh - 2, Math.ceil(box.bottom) + 2);
  const points = {
    below: { x: box.left + 8, y: belowY },
    left: { x: leftX, y: box.centerY },
    right
  };
  if (includeInFlowBands) {
    let aboveCenter = { x: box.left + box.width / 2, y: box.top - 12 };
    if (scrollBtnRect && aboveCenter.x >= scrollBtnRect.left - 4 && aboveCenter.x <= scrollBtnRect.right + 4 && aboveCenter.y >= scrollBtnRect.top - 4 && aboveCenter.y <= scrollBtnRect.bottom + 4) {
      aboveCenter = { x: Math.max(box.left + 32, Math.round(scrollBtnRect.left - 24)), y: box.top - 12 };
    }
    points.above = { x: leftX, y: box.top - 24 };
    points.aboveCenter = aboveCenter;
    points.viewportBottomSide = { x: leftX, y: vh - 6 };
    points.viewportBottom = { x: box.left + 8, y: Math.min(vh - 1, Math.max(belowY, vh - 2)) };
  }
  return points;
}

async function pixelsAt(page, points) {
  const out = {};
  for (const [name, point] of Object.entries(points)) {
    out[name] = (await capturePixels(page, { x: point.x, y: point.y, width: 1, height: 1 })).at(0, 0);
  }
  return out;
}

async function assertGlowContinuous(page, host, label, canvas, options = {}) {
  const points = await glowPoints(page, host, options);
  const glow = await pixelsAt(page, points);
  await patchConfig(page, { ambientStyle: 'none' }, () => document.documentElement.getAttribute('data-op-ambient-style') === 'none');
  const flat = await pixelsAt(page, points);
  for (const name of Object.keys(points)) {
    assert.ok(distance(glow[name], canvas) >= 4, `${label}: ${name} is not the solid canvas ${fmt(canvas)} (got ${fmt(glow[name])})`);
    assert.ok(blueness(glow[name]) - blueness(flat[name]) >= 2.0, `${label}: ${name} carries horizon glow hue (glow ${fmt(glow[name])} vs flat ${fmt(flat[name])})`);
  }
}

/**
 * Inserts a flat block behind the composer dock (prepended to main outside the masked scroller, z-index:0)
 * and estimates how opaque the canvas paint over it is across a column from above the composer to the viewport bottom.
 */
async function occlusionColumn(page, host, canvas, { side = 'left' } = {}) {
  const box = await composerBox(page, host);
  const geom = await page.evaluate(({ mainSel, boxLeft, boxRight, side }) => {
    const main = document.querySelector(mainSel).getBoundingClientRect();
    const obstacles = ['#op-bottom-dock', '.host-corner-help', '#op-rail-root']
      .map(sel => document.querySelector(sel)?.getBoundingClientRect())
      .filter(Boolean)
      .map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }));
    let x;
    if (side === 'right') {
      const rightGap = main.right - boxRight;
      x = rightGap >= 56 ? Math.round(boxRight + 40) : Math.round(boxRight + Math.max(4, rightGap / 2));
      const blocking = obstacles.find(obs => x >= obs.left - 14 && x <= obs.right + 14);
      if (blocking && blocking.left - boxRight >= 24) {
        x = Math.round((boxRight + blocking.left) / 2);
      }
    } else {
      const leftGap = boxLeft - main.left;
      x = leftGap >= 56 ? Math.round(boxLeft - 40) : Math.round(main.left + Math.max(4, leftGap / 2));
    }
    const skipRanges = obstacles
      .filter(obs => x >= obs.left - 14 && x <= obs.right + 14)
      .map(obs => [Math.floor(obs.top - 14), Math.ceil(obs.bottom + 14)]);
    return { x, height: window.innerHeight, skipRanges };
  }, { mainSel: LIVE_SELECTORS[host].main, boxLeft: box.left, boxRight: box.right, side });
  const backdrop = (canvas.r + canvas.g + canvas.b) / 3 > 128 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
  const top = box.top - 70;
  await page.locator(LIVE_SELECTORS[host].main).evaluate((main, { top, color }) => {
    const block = document.createElement('div');
    block.id = 'prism-test-occlusion-block';
    block.style.cssText = `position:fixed;left:0;right:0;top:${top}px;bottom:0;z-index:0;pointer-events:none;background:${color}`;
    main.prepend(block);
  }, { top, color: fmt(backdrop) });
  let image;
  const clipY = Math.round(top + 20);
  try {
    await frames(page);
    const clipHeight = Math.max(20, geom.height - clipY - 2);
    image = await capturePixels(page, { x: geom.x, y: clipY, width: 1, height: clipHeight });
  } finally {
    await page.evaluate(() => document.getElementById('prism-test-occlusion-block')?.remove());
    await frames(page);
  }
  const span = { r: canvas.r - backdrop.r, g: canvas.g - backdrop.g, b: canvas.b - backdrop.b };
  const norm = span.r ** 2 + span.g ** 2 + span.b ** 2;
  const isSkipped = y => geom.skipRanges.some(([lo, hi]) => y >= lo && y <= hi);
  const alphas = [];
  const validRows = [];
  for (let y = 0; y < image.height; y++) {
    const pageY = clipY + y;
    const p = image.at(0, y);
    const alpha = Math.max(0, Math.min(1, ((p.r - backdrop.r) * span.r + (p.g - backdrop.g) * span.g + (p.b - backdrop.b) * span.b) / norm));
    alphas.push(alpha);
    if (!isSkipped(pageY)) validRows.push({ y, alpha });
  }
  const sampled = validRows.length ? validRows : alphas.map((alpha, y) => ({ y, alpha }));
  const centerIdx = Math.min(alphas.length - 1, Math.max(0, Math.round(box.centerY - clipY)));
  const atCenter = !isSkipped(clipY + centerIdx) ? alphas[centerIdx] : sampled[sampled.length - 1].alpha;
  let maxStep = 0;
  for (let i = 1; i < sampled.length; i++) {
    if (sampled[i].y - sampled[i - 1].y <= 2) {
      maxStep = Math.max(maxStep, Math.abs(sampled[i].alpha - sampled[i - 1].alpha));
    }
  }
  return { alphas: sampled.map(r => r.alpha), max: Math.max(...sampled.map(r => r.alpha)), atCenter, maxStep };
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

async function scrimBackdropFilter(page, host) {
  return page.locator(LIVE_SELECTORS[host].composer).first().evaluate(node => {
    const supported = CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
    for (let el = node.parentElement; el; el = el.parentElement) {
      for (const style of [getComputedStyle(el, '::before'), getComputedStyle(el)]) {
        const value = [style.backdropFilter, style.webkitBackdropFilter].find(v => v && v !== 'none');
        if (value) return { supported, value };
      }
    }
    return { supported, value: 'none' };
  });
}

async function textBlockStats(page, host, where) {
  const box = await composerBox(page, host);
  const clip = { x: Math.round(box.left - 180), y: Math.round(where === 'behind' ? box.centerY - 22 : box.top - 260), width: 150, height: 44 };
  const color = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--op-fg').trim() || getComputedStyle(document.body).color);
  await page.locator(LIVE_SELECTORS[host].main).evaluate((main, { clip, color }) => {
    const block = document.createElement('div');
    block.id = 'prism-test-text-block';
    block.textContent = 'MWMW WMWM MWMW WMWM MWMW WMWM MWMW WMWM';
    block.style.cssText = `position:fixed;left:${clip.x}px;top:${clip.y}px;width:${clip.width}px;height:${clip.height}px;z-index:0;overflow:hidden;pointer-events:none;font:700 15px/22px Arial,sans-serif;letter-spacing:1px;color:${color};background:transparent`;
    main.prepend(block);
  }, { clip, color });
  let stats, edge;
  try {
    await frames(page);
    stats = await regionStats(page, clip);
    edge = await sharpness(page, clip);
  } finally {
    await page.evaluate(() => document.getElementById('prism-test-text-block')?.remove());
    await frames(page);
  }
  return { variance: stats.variance, sharpness: edge.ratio };
}

function crispTargets(host) {
  const s = LIVE_SELECTORS[host];
  return host === 'chatgpt'
    ? { editor: s.editor, body: '[data-turn-key]:last-of-type [data-markdown-text-style="assistant-message"]', actions: '[data-turn-key]:last-of-type .turn-actions' }
    : { editor: s.editor, body: 'model-response:last-of-type .md-content', actions: 'model-response:last-of-type message-actions' };
}

async function composerBottomGap(page, host) {
  return page.evaluate(sel => {
    const c = document.querySelector(sel);
    return c ? Math.round((window.innerHeight - c.getBoundingClientRect().bottom) * 10) / 10 : null;
  }, LIVE_SELECTORS[host].composer);
}

async function assertCardUnclippedAndCompactGap(page, host, label) {
  const s = LIVE_SELECTORS[host];
  const metrics = await page.evaluate(composerSel => {
    const card = document.querySelector(composerSel);
    const surface = document.querySelector('[data-op-composer-surface="true"]') || card;
    const cardRect = card.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const style = getComputedStyle(surface);
    return {
      vh: window.innerHeight,
      cardBottom: Math.round(cardRect.bottom * 10) / 10,
      cardGap: Math.round((window.innerHeight - cardRect.bottom) * 10) / 10,
      surfaceGap: Math.round((window.innerHeight - surfaceRect.bottom) * 10) / 10,
      radiusLeft: parseFloat(style.borderBottomLeftRadius) || 0,
      radiusRight: parseFloat(style.borderBottomRightRadius) || 0,
      borderBottom: parseFloat(style.borderBottomWidth) || 0
    };
  }, s.composer);
  assert.ok(metrics.cardGap >= 3.5 && metrics.cardGap <= 6.5, `${label}: composer bottomGap sits in 4-6px range (±0.5px, got ${metrics.cardGap}px)`);
  assert.ok(metrics.surfaceGap >= 3.5 && metrics.surfaceGap <= 6.5, `${label}: composer surface bottomGap sits in 4-6px range (±0.5px, got ${metrics.surfaceGap}px)`);
  assert.ok(metrics.cardBottom <= metrics.vh - 3.5, `${label}: composer card bottom (${metrics.cardBottom}) is unclipped above viewport bottom (${metrics.vh})`);
  assert.ok(metrics.radiusLeft >= 8 && metrics.radiusRight >= 8 && metrics.borderBottom >= 1, `${label}: rounded bottom corners (${metrics.radiusLeft}/${metrics.radiusRight}px) and bottom border (${metrics.borderBottom}px) stay intact`);
  return metrics;
}

async function assertCrispAndClickable(page, host, label) {
  const s = LIVE_SELECTORS[host];
  const targets = crispTargets(host);
  for (const [name, selector] of Object.entries({ editor: targets.editor, actions: targets.actions })) {
    const rect = await page.locator(selector).first().evaluate(node => {
      const r = node.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
    const clip = { x: rect.x + 2, y: rect.y + 2, width: Math.min(rect.width - 4, 220), height: Math.max(6, Math.min(rect.height - 4, 26)) };
    const edge = await sharpness(page, clip);
    assert.ok(edge.range >= 40 && edge.ratio >= 0.3, `${label}: ${name} stays crisp (edge ${edge.ratio.toFixed(2)}, range ${edge.range.toFixed(0)})`);
  }
  const hiddenDisclaimer = await page.locator(s.disclaimer).evaluate(node => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return { display: style.display, height: Math.round(rect.height * 10) / 10 };
  });
  assert.equal(hiddenDisclaimer.display, 'none', `${label}: disclaimer is hidden when Prism is active`);
  assert.equal(hiddenDisclaimer.height, 0, `${label}: hidden disclaimer takes 0px height`);

  const hits = await page.evaluate(selectors => Object.fromEntries(Object.entries(selectors).map(([name, selector]) => {
    const node = document.querySelector(selector);
    if (!node) return [name, 'missing'];
    const r = node.getBoundingClientRect();
    const x = r.left + Math.min(r.width / 2, 14);
    const hit = document.elementFromPoint(x, r.top + r.height / 2);
    return [name, Boolean(hit && (node === hit || node.contains(hit)))];
  })), { editor: s.editor, add: s.add, model: s.model, action: `${targets.actions} button` });
  for (const [name, ok] of Object.entries(hits)) assert.equal(ok, true, `${label}: ${name} is hit-testable`);

  const row = await page.evaluate(([bodySel, actions, composer, scrollerSel]) => {
    const bodyEl = document.querySelector(bodySel);
    const bodyRect = bodyEl.getBoundingClientRect();
    const scrollerRect = document.querySelector(scrollerSel).getBoundingClientRect();
    const box = document.querySelector(actions).getBoundingClientRect();
    const card = document.querySelector(composer).getBoundingClientRect();
    const buttons = [...document.querySelectorAll(`${actions} button`)].map(button => {
      const r = button.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { label: button.getAttribute('aria-label'), hit: Boolean(hit && (hit === button || button.contains(hit))) };
    });
    return { bodyTop: bodyRect.top, bodyBottom: bodyRect.bottom, scrollerTop: scrollerRect.top, top: box.top, bottom: box.bottom, cardTop: card.top, buttons };
  }, [targets.body, targets.actions, s.composer, s.scroller]);
  assert.ok(row.bodyTop >= row.scrollerTop - 1 && row.bodyBottom <= row.cardTop + 0.5, `${label}: last reply body (${row.bodyTop}-${row.bodyBottom}) sits above Composer Surface (${row.cardTop})`);
  assert.ok(row.top >= 0 && row.bottom <= row.cardTop + 0.5, `${label}: last reply action row (${row.top}-${row.bottom}) sits above Composer Surface (${row.cardTop})`);
  for (const button of row.buttons) assert.equal(button.hit, true, `${label}: "${button.label}" action is hit at its centre`);
  await page.locator(s.add).click({ trial: true });
  await page.locator(s.model).click({ trial: true });
  await page.locator(`${targets.actions} button`).first().click({ trial: true });
}

async function attributeSnapshot(page, host) {
  return page.locator(LIVE_SELECTORS[host].main).evaluate(root => [root, ...root.querySelectorAll('*')]
    .filter(node => !node.closest('[data-op-owned]'))
    .map(node => `${node.localName}${node.getAttributeNames().filter(name => !(name === 'style' && !node.getAttribute(name).trim())).sort().map(name => ` ${name}="${node.getAttribute(name)}"`).join('')}`));
}

async function domOrderSnapshot(page, host) {
  return page.locator(LIVE_SELECTORS[host].main).evaluate(root => [root, ...root.querySelectorAll('*')]
    .filter(node => !node.closest('[data-op-owned]'))
    .map(node => {
      const parent = node.parentElement;
      const nonOwnedSiblings = parent ? [...parent.children].filter(c => !c.hasAttribute('data-op-owned')) : [];
      return {
        tag: node.localName,
        parentTag: parent ? parent.localName : '',
        index: nonOwnedSiblings.indexOf(node),
        children: [...node.children].filter(c => !c.hasAttribute('data-op-owned')).map(c => c.localName)
      };
    }));
}

async function dockPaint(page, host) {
  return page.locator(LIVE_SELECTORS[host].composer).first().evaluate((composer, mainSelector) => {
    const out = [];
    for (let node = composer.parentElement; node && !node.matches(mainSelector); node = node.parentElement) {
      const style = getComputedStyle(node), before = getComputedStyle(node, '::before'), after = getComputedStyle(node, '::after');
      out.push({
        tag: node.localName, background: style.backgroundColor, image: style.backgroundImage, boxShadow: style.boxShadow,
        backdrop: style.backdropFilter || 'none', mask: style.maskImage || 'none', isolation: style.isolation, position: style.position,
        before: { content: before.content, background: before.backgroundColor, image: before.backgroundImage, backdrop: before.backdropFilter || 'none', mask: before.maskImage || 'none' },
        after: { content: after.content, background: after.backgroundColor, image: after.backgroundImage, backdrop: after.backdropFilter || 'none', mask: after.maskImage || 'none', boxShadow: after.boxShadow }
      });
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

async function chatgptSpacingMetrics(page) {
  return page.evaluate(s => {
    const spacer = document.querySelector(s.belowSpacer);
    const outerSpacer = document.querySelector('.dock-outer-spacer');
    const outerDisc = document.querySelector('.disclaimer-outer-wrap');
    const composer = document.querySelector(s.composer);
    const disclaimer = document.querySelector(s.disclaimer);
    const col = document.querySelector(s.column);
    return {
      spacerHeight: spacer ? Math.round(spacer.getBoundingClientRect().height * 10) / 10 : null,
      outerSpacerHeight: outerSpacer ? Math.round(outerSpacer.getBoundingClientRect().height * 10) / 10 : null,
      outerDiscHeight: outerDisc ? Math.round(outerDisc.getBoundingClientRect().height * 10) / 10 : null,
      bottomGap: composer ? Math.round((window.innerHeight - composer.getBoundingClientRect().bottom) * 10) / 10 : null,
      disclaimerHeight: disclaimer ? Math.round(disclaimer.getBoundingClientRect().height * 10) / 10 : null,
      threadPaddingBottom: col ? parseFloat(getComputedStyle(col).paddingBottom) : null
    };
  }, LIVE_SELECTORS.chatgpt);
}

async function assertRestoredState(page, host, label, native, hostPatch, restorePatch) {
  // Verify composerRestyle: false restores native positioning/spacers/disclaimers & DOM order while preserving scrim/fade.
  await patchConfig(page, { composerRestyle: false }, () => document.documentElement.getAttribute('data-op-composer') === 'false');
  await scrollToEnd(page, host);
  assert.equal(await page.locator('[data-op-composer-empty-sibling="true"],[data-op-composer-disclaimer="true"],[data-op-composer-surface="true"]').count(), 0, `${label}: composerRestyle: false clears surface/sibling/disclaimer marks`);
  assert.deepEqual(await domOrderSnapshot(page, host), native.domOrder, `${label}: composerRestyle: false preserves native DOM parent/child/sibling order`);
  const unstyledDisclaimer = await page.locator(LIVE_SELECTORS[host].disclaimer).evaluate(node => ({
    display: getComputedStyle(node).display,
    height: Math.round(node.getBoundingClientRect().height * 10) / 10
  }));
  assert.notEqual(unstyledDisclaimer.display, 'none', `${label}: composerRestyle: false restores disclaimer visibility`);
  assert.ok(unstyledDisclaimer.height > 0, `${label}: composerRestyle: false restores disclaimer height`);
  if (host === 'chatgpt') {
    const unstyledSpacing = await chatgptSpacingMetrics(page);
    near(unstyledSpacing.spacerHeight, native.spacing.spacerHeight, 0.5, `${label}: composerRestyle: false restores spacer height`);
    near(unstyledSpacing.bottomGap, native.spacing.bottomGap, 0.5, `${label}: composerRestyle: false restores bottom gap`);
    assert.equal(await page.locator('[data-op-scroller-fade="true"]').count() >= 1, true, `${label}: composerRestyle: false preserves scroller fade`);
  } else if (native.layout) {
    near(await composerBottomGap(page, host), native.bottomGap, 0.5, `${label}: composerRestyle: false restores Gemini bottom gap`);
    assert.deepEqual(await gemiInputLayout(page), native.layout, `${label}: composerRestyle: false restores Gemini input layout`);
    assert.equal(await page.locator('[data-op-composer-backdrop="true"]').count() >= 1, true, `${label}: composerRestyle: false keeps Gemini backdrop cleared`);
    assert.equal(await page.locator('[data-op-composer-overlaid="true"]').count(), 1, `${label}: composerRestyle: false keeps Gemini overlaid clearance`);
    assert.equal(await page.locator('[data-op-composer-scrim="true"]').count(), 0, `${label}: composerRestyle: false never mounts Gemini scrim`);
  }
  await patchConfig(page, { composerRestyle: true }, () => document.documentElement.getAttribute('data-op-composer') === 'true');

  // Verify Native Palette restores everything.
  await patchConfig(page, hostPatch, () => document.documentElement.getAttribute('data-op-effective-palette') === 'host');
  await scrollToEnd(page, host);
  assert.deepEqual(await domOrderSnapshot(page, host), native.domOrder, `${label}: Native Palette preserves native DOM parent/child/sibling order`);
  assert.deepEqual(await dockPaint(page, host), native.paint, `${label}: Native Palette restores dock paint`);
  near((await occlusionColumn(page, host, native.canvas)).max, native.occlusion.max, 0.05, `${label}: Native Palette restores native occlusion`);
  const restoredDisclaimer = await page.locator(LIVE_SELECTORS[host].disclaimer).evaluate(node => ({
    display: getComputedStyle(node).display,
    height: Math.round(node.getBoundingClientRect().height * 10) / 10
  }));
  assert.notEqual(restoredDisclaimer.display, 'none', `${label}: Native Palette restores disclaimer visibility`);
  assert.ok(restoredDisclaimer.height > 0, `${label}: Native Palette restores disclaimer height`);
  if (host === 'chatgpt') {
    const hostSpacing = await chatgptSpacingMetrics(page);
    near(hostSpacing.spacerHeight, native.spacing.spacerHeight, 0.5, `${label}: Native Palette restores spacer height`);
    near(hostSpacing.bottomGap, native.spacing.bottomGap, 0.5, `${label}: Native Palette restores bottom gap`);
  } else if (native.layout) {
    near(await composerBottomGap(page, host), native.bottomGap, 0.5, `${label}: Native Palette restores Gemini bottom gap`);
    assert.deepEqual(await gemiInputLayout(page), native.layout, `${label}: Native Palette restores Gemini input layout`);
    assert.equal(await page.locator('[data-op-composer-backdrop="true"],[data-op-composer-dock="true"],[data-op-composer-overlaid="true"],[data-op-composer-scrim="true"],[data-op-thread-scroller="true"]').count(), 0, `${label}: Native Palette leaves zero Gemini dock/backdrop/scroller marks`);
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--op-dock-clearance')), '', `${label}: Native Palette clears --op-dock-clearance`);
  }
  await patchConfig(page, restorePatch, () => document.documentElement.getAttribute('data-op-effective-palette') !== 'host');
}

async function assertDisabledAndHomeRestore(page, host, label, native, restorePatch) {
  await patchConfig(page, { enabled: false }, () => !document.documentElement.hasAttribute('data-op-enabled'));
  await scrollToEnd(page, host);
  assert.deepEqual(await attributeSnapshot(page, host), native.attributes, `${label}: disabling restores every attribute`);
  assert.deepEqual(await domOrderSnapshot(page, host), native.domOrder, `${label}: disabling preserves native DOM parent/child/sibling order`);
  assert.deepEqual(await dockPaint(page, host), native.paint, `${label}: disabling restores dock paint`);
  near((await occlusionColumn(page, host, native.canvas)).max, native.occlusion.max, 0.05, `${label}: disabling restores native occlusion`);
  const disabledDisclaimer = await page.locator(LIVE_SELECTORS[host].disclaimer).evaluate(node => ({
    display: getComputedStyle(node).display,
    height: Math.round(node.getBoundingClientRect().height * 10) / 10
  }));
  assert.notEqual(disabledDisclaimer.display, 'none', `${label}: disabling restores disclaimer visibility`);
  assert.ok(disabledDisclaimer.height > 0, `${label}: disabling restores disclaimer height`);
  if (host === 'chatgpt') {
    const disSpacing = await chatgptSpacingMetrics(page);
    near(disSpacing.spacerHeight, native.spacing.spacerHeight, 0.5, `${label}: disabling restores spacer height`);
    near(disSpacing.bottomGap, native.spacing.bottomGap, 0.5, `${label}: disabling restores bottom gap`);
  } else if (native.layout) {
    near(await composerBottomGap(page, host), native.bottomGap, 0.5, `${label}: disabling restores Gemini bottom gap`);
    assert.deepEqual(await gemiInputLayout(page), native.layout, `${label}: disabling restores Gemini input layout`);
  }
  await patchConfig(page, { enabled: true, ...restorePatch }, () => document.documentElement.getAttribute('data-op-enabled') === 'true');

  if (host === 'chatgpt') {
    await page.evaluate(sel => document.querySelector(sel)?.remove(), LIVE_SELECTORS.chatgpt.disclaimer);
    await frames(page);
    const noDisclaimer = await chatgptSpacingMetrics(page);
    assert.ok(noDisclaimer.bottomGap >= 3.5 && noDisclaimer.bottomGap <= 6.5, `${label}: no-disclaimer dock preserves 4-6px bottom breathing room (got ${noDisclaimer.bottomGap})`);
  }

  const open = await textBlockStats(page, host, 'open');
  await page.evaluate(selector => { for (const node of document.querySelectorAll(selector)) node.remove(); }, host === 'chatgpt' ? '[data-turn-key]' : 'user-query,model-response');
  await page.waitForFunction(() => document.documentElement.getAttribute('data-op-home') === 'true');
  await patchConfig(page, { ambientStyle: 'none' }, () => document.documentElement.getAttribute('data-op-ambient-style') === 'none');
  const homeOcclusion = await occlusionColumn(page, host, await canvasColor(page));
  assert.ok(homeOcclusion.max <= 0.08, `${label}: Home State paints no scrim/slab (alpha ${homeOcclusion.max.toFixed(2)})`);
  const homeText = await textBlockStats(page, host, 'behind');
  assert.ok(homeText.sharpness >= open.sharpness * 0.8, `${label}: Home State does not blur beside composer`);
  assert.ok((await dockPaint(page, host)).every(layer => layer.backdrop === 'none' && layer.before.backdrop === 'none'), `${label}: Home State applies no backdrop blur`);
  assert.equal(await page.locator('[data-op-composer-dock="true"],[data-op-composer-overlaid="true"],[data-op-composer-scrim="true"],[data-op-scroller-fade="true"],[data-op-composer-empty-sibling="true"],[data-op-composer-disclaimer="true"]').count(), 0, `${label}: Home State clears dock/scrim/fade/sibling marks`);
}

/** ChatGPT in-flow dock across all 4 palettes: seamless horizon glow, zero veil/blur, compact bottom spacing. */
async function checkChatGPTInFlow(suite) {
  const { engine, artifacts } = suite;
  const host = 'chatgpt';
  const initial = { ...PALETTES[0].patch, ambientStyle: 'aurora', ambientTexture: 'off', motionLevel: 'off' };
  await onLiveFixture(suite, host, { failure: 'chatgpt-inflow-live-scrim-failure', colorScheme: 'dark', initial }, async ({ page, errors }) => {
    await scrollToEnd(page, host);
    const native = {
      canvas: await canvasColor(page),
      attributes: await attributeSnapshot(page, host),
      domOrder: await domOrderSnapshot(page, host),
      paint: await dockPaint(page, host),
      spacing: await chatgptSpacingMetrics(page)
    };
    native.occlusion = await occlusionColumn(page, host, native.canvas);
    assert.ok(native.occlusion.max >= 0.95, `${engine} chatgpt native: #thread-bottom-container paints an opaque slab (alpha ${native.occlusion.max.toFixed(2)})`);
    assert.ok(native.spacing.spacerHeight >= 20 && native.spacing.bottomGap >= 58, `${engine} chatgpt native: has redundant spacer (${native.spacing.spacerHeight}) & bottom gap (${native.spacing.bottomGap})`);

    await injectExtension(page, suite);
    for (const pal of PALETTES) {
      const label = `${engine} chatgpt in-flow ${pal.name}`;
      await applyPalette(page, pal);
      await scrollToEnd(page, host);
      assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-op-home')), 'false', `${label}: active conversation`);

      const canvas = await canvasColor(page);
      await assertGlowContinuous(page, host, label, canvas, { includeInFlowBands: true });
      const occlusion = await occlusionColumn(page, host, canvas);
      assert.ok(occlusion.max <= 0.08, `${label}: zero opaque canvas band or canvas veil (max alpha ${occlusion.max.toFixed(2)})`);
      assert.ok(occlusion.maxStep <= 0.08, `${label}: zero horizontal alpha step (max step ${occlusion.maxStep.toFixed(2)})`);

      const declared = await scrimBackdropFilter(page, host);
      assert.equal(declared.value, 'none', `${label}: in-flow dock applies no backdrop blur`);
      assert.ok((await dockPaint(page, host)).every(layer => layer.backdrop === 'none' && layer.before.backdrop === 'none'), `${label}: computed dock paint has no blur`);
      const open = await textBlockStats(page, host, 'open');
      const behind = await textBlockStats(page, host, 'behind');
      assert.ok(behind.sharpness >= open.sharpness * 0.8, `${label}: beside-composer area is unblurred (${behind.sharpness.toFixed(2)} vs ${open.sharpness.toFixed(2)})`);

      const spacing = await chatgptSpacingMetrics(page);
      assert.equal(spacing.spacerHeight, 0, `${label}: empty sibling collapsed to 0px`);
      assert.equal(spacing.disclaimerHeight, 0, `${label}: disclaimer is hidden (0px)`);
      await assertCardUnclippedAndCompactGap(page, host, label);
      assert.ok(spacing.bottomGap <= native.spacing.bottomGap - 45, `${label}: bottom gap tightened from native ${native.spacing.bottomGap}px to ${spacing.bottomGap}px`);
      assert.equal(spacing.threadPaddingBottom, 24, `${label}: transcript bottom padding tightened to 24px`);
      assert.deepEqual(await domOrderSnapshot(page, host), native.domOrder, `${label}: active DOM parent/child/sibling order intact`);

      await assertCrispAndClickable(page, host, label);
      if (pal.name === 'obsidian') {
        await page.evaluate(() => {
          const form = document.querySelector('form[data-chatgpt-composer]');
          const above = document.createElement('div');
          above.id = 'prism-above-disclaimer';
          above.textContent = 'ChatGPT is AI and can make mistakes. Check important info.';
          form.before(above);
          ObsidianPrismRuntime.refresh();
        });
        await page.waitForFunction(() => document.getElementById('prism-above-disclaimer')?.getAttribute('data-op-composer-disclaimer') === 'true');
        await frames(page);
        const aboveMetrics = await page.evaluate(() => {
          const el = document.getElementById('prism-above-disclaimer');
          return { display: getComputedStyle(el).display, height: el.getBoundingClientRect().height };
        });
        assert.equal(aboveMetrics.display, 'none', `${label}: above-composer disclaimer text is hidden`);
        assert.equal(aboveMetrics.height, 0, `${label}: above-composer disclaimer takes 0px height`);
        await page.evaluate(() => {
          document.getElementById('prism-above-disclaimer')?.remove();
          const dock = document.getElementById('thread-bottom-container');
          const shell = document.createElement('div');
          shell.id = 'prism-hidden-shell';
          shell.style.height = '28px';
          const hiddenText = document.createElement('span');
          hiddenText.hidden = true;
          hiddenText.textContent = 'Hidden text';
          const cssHiddenText = document.createElement('span');
          cssHiddenText.style.display = 'none';
          cssHiddenText.textContent = 'Display none text';
          const hiddenLink = document.createElement('a');
          hiddenLink.href = '#hidden';
          hiddenLink.style.display = 'none';
          hiddenLink.textContent = 'Hidden link';
          const hiddenSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          hiddenSvg.setAttribute('aria-hidden', 'true');
          shell.append(hiddenText, cssHiddenText, hiddenLink, hiddenSvg);
          dock.after(shell);
          ObsidianPrismRuntime.refresh();
        });
        await page.waitForFunction(() => document.getElementById('prism-hidden-shell')?.getAttribute('data-op-composer-empty-sibling') === 'true');
        await frames(page);
        const hiddenShellHeight = await page.evaluate(() => Math.round(document.getElementById('prism-hidden-shell').getBoundingClientRect().height * 10) / 10);
        assert.equal(hiddenShellHeight, 0, `${label}: hidden-content outer shell collapses to 0px`);
        await page.evaluate(() => {
          document.getElementById('prism-hidden-shell')?.remove();
          ObsidianPrismRuntime.refresh();
        });
        await frames(page);
      }
      await patchConfig(page, { ambientStyle: 'aurora' }, () => document.documentElement.getAttribute('data-op-ambient-style') === 'aurora');
      if (pal.name === 'obsidian' || pal.name === 'crystal') {
        await page.screenshot({ path: path.join(artifacts, `${engine}-chatgpt-${pal.name}-live-scrim.png`) });
        await assertRestoredState(page, host, label, native, pal.hostPatch, pal.patch);
      }
      console.log(`PASS ${label}: continuous glow (max occlusion ${occlusion.max.toFixed(2)}), spacer 0px, disclaimer 0px, gap ${spacing.bottomGap}px (was ${native.spacing.bottomGap}px)`);
    }

    await patchConfig(page, { ...PALETTES[0].patch, ambientStyle: 'aurora' }, () => document.documentElement.getAttribute('data-op-effective-palette') === 'obsidian');
    await assertDisabledAndHomeRestore(page, host, `${engine} chatgpt in-flow`, native, PALETTES[0].patch);
    assert.deepEqual(errors, []);
  });
}

/** Gemini wing & interior regions for flat-canvas continuity and composer opacity checks across all Content Width Presets. */
async function geminiWingRegions(page) {
  return page.evaluate(({ mainSel, inputSel, composerSel, editorSel }) => {
    const main = document.querySelector(mainSel).getBoundingClientRect();
    const dock = document.querySelector(inputSel).getBoundingClientRect();
    const card = document.querySelector(composerSel).getBoundingClientRect();
    const editor = document.querySelector(editorSel).getBoundingClientRect();
    const obstacles = ['#op-bottom-dock', '.host-corner-help', '#op-rail-root']
      .map(sel => document.querySelector(sel)?.getBoundingClientRect())
      .filter(Boolean);
    const leftGap = card.left - main.left;
    const rightGap = main.right - card.right;
    const leftW = Math.max(4, Math.min(16, Math.floor(leftGap - 8)));
    const leftX = leftGap >= 56 ? Math.round(card.left - 44) : Math.round(main.left + Math.max(2, (leftGap - leftW) / 2));
    const rightW = Math.max(4, Math.min(16, Math.floor(rightGap - 8)));
    let rightX = rightGap >= 56 ? Math.round(card.right + 36) : Math.round(card.right + Math.max(2, (rightGap - rightW) / 2));
    let rightY = Math.round(card.top + card.height / 2 - 4);
    const hits = (x, y, w, h, obs) => obs && x < obs.right + 6 && x + w > obs.left - 6 && y < obs.bottom + 6 && y + h > obs.top - 6;
    const hitsAny = (x, y, w, h) => obstacles.some(obs => hits(x, y, w, h, obs));
    if (hitsAny(rightX, rightY, rightW, 8)) {
      const blocking = obstacles.find(obs => hits(rightX, rightY, rightW, 8, obs));
      if (blocking && blocking.left - card.right >= 16) rightX = Math.round(card.right + Math.max(4, (blocking.left - card.right - rightW) / 2));
      else if (blocking) rightY = Math.round(Math.max(dock.top + 8, Math.min(card.top + 8, blocking.top - 16)));
    }
    const clearAboveY = (x, w) => {
      for (let y = Math.round(dock.top - 28); y >= Math.round(main.top + 80); y -= 16) {
        if (hitsAny(x, y, w, 8)) continue;
        const el = document.elementFromPoint(x + w / 2, y + 4);
        if (el && el.closest('#op-bottom-dock,#op-rail-root,.host-corner-help,code-block,.code-block,user-query,.user-query-bubble-with-background,.math-block,.katex,table,blockquote,message-actions')) continue;
        return y;
      }
      return Math.round(dock.top - 28);
    };
    return {
      left: { x: leftX, y: Math.round(card.top + card.height / 2 - 4), width: leftW, height: 8 },
      aboveLeft: { x: leftX, y: clearAboveY(leftX, leftW), width: leftW, height: 8 },
      right: { x: rightX, y: rightY, width: rightW, height: 8 },
      aboveRight: { x: rightX, y: clearAboveY(rightX, rightW), width: rightW, height: 8 },
      interior: { x: Math.round(card.left + card.width * 0.7), y: Math.round(editor.top + editor.height / 2 - 2), width: 8, height: 4 }
    };
  }, { mainSel: LIVE_SELECTORS.gemini.main, inputSel: LIVE_SELECTORS.gemini.inputGradient, composerSel: LIVE_SELECTORS.gemini.composer, editorSel: LIVE_SELECTORS.gemini.editor });
}

/**
 * Verifies ChatGPT independent-scroller Alpha bottom fade inside [data-prism-test-scroller]:
 * an in-flow strip near the scroller bottom stays opaque above the 24px fade zone and fades
 * smoothly to 0 across the bottom 24px, while Ambient Stage glyphs + aurora and Composer Surface stay untouched.
 */
async function assertScrollerAlphaFade(page, label, canvas) {
  const sRect = await page.locator(LIVE_SELECTORS.chatgpt.scroller).evaluate(scroller => {
    scroller.scrollTop = scroller.scrollHeight;
    const r = scroller.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, fadeAttr: scroller.getAttribute('data-op-scroller-fade'), mask: getComputedStyle(scroller).maskImage || getComputedStyle(scroller).webkitMaskImage };
  });
  assert.equal(sRect.fadeAttr, 'true', `${label}: independent scroller carries data-op-scroller-fade="true"`);
  assert.match(sRect.mask, /linear-gradient/, `${label}: scroller applies Alpha mask-image`);

  const stripColor = (canvas.r + canvas.g + canvas.b) / 3 > 128 ? { r: 10, g: 14, b: 22 } : { r: 245, g: 247, b: 252 };
  const x = Math.round(sRect.left + 44);
  const yStart = Math.round(sRect.bottom - 42);
  const height = 40;
  const bgImg = await capturePixels(page, { x, y: yStart, width: 1, height });
  await page.locator(LIVE_SELECTORS.chatgpt.scroller).evaluate((scroller, color) => {
    const strip = document.createElement('div');
    strip.id = 'prism-test-alpha-strip';
    strip.style.cssText = `height:44px;margin-top:-44px;width:120px;margin-left:16px;position:relative;z-index:1;pointer-events:none;background:${color}`;
    scroller.append(strip);
    scroller.scrollTop = scroller.scrollHeight;
  }, fmt(stripColor));
  let fgImg;
  try {
    await frames(page);
    fgImg = await capturePixels(page, { x, y: yStart, width: 1, height });
  } finally {
    await page.evaluate(() => document.getElementById('prism-test-alpha-strip')?.remove());
    await frames(page);
  }
  const alphas = [];
  for (let row = 0; row < height; row++) {
    const bg = bgImg.at(0, row);
    const fg = fgImg.at(0, row);
    const span = { r: stripColor.r - bg.r, g: stripColor.g - bg.g, b: stripColor.b - bg.b };
    const norm = span.r ** 2 + span.g ** 2 + span.b ** 2;
    alphas.push(norm > 0 ? Math.max(0, Math.min(1, ((fg.r - bg.r) * span.r + (fg.g - bg.g) * span.g + (fg.b - bg.b) * span.b) / norm)) : 0);
  }
  const topAlpha = alphas[2]; // ~40px above scroller bottom (well above 24px fade band)
  const midAlpha = alphas[Math.round(height - 10)]; // inside 24px fade band
  const botAlpha = alphas[height - 1]; // ~2px above scroller bottom
  let maxStep = 0;
  for (let i = 2; i < alphas.length; i += 2) maxStep = Math.max(maxStep, Math.abs(alphas[i] - alphas[i - 2]));
  assert.ok(topAlpha >= 0.9, `${label}: scroller strip above 24px fade stays opaque (alpha ${topAlpha.toFixed(2)})`);
  assert.ok(midAlpha > botAlpha && midAlpha < topAlpha, `${label}: scroller strip fades progressively across bottom 24px (${topAlpha.toFixed(2)} -> ${midAlpha.toFixed(2)} -> ${botAlpha.toFixed(2)})`);
  assert.ok(botAlpha <= 0.18, `${label}: scroller strip fades out near bottom edge (alpha ${botAlpha.toFixed(2)})`);
  assert.ok(maxStep <= 0.18, `${label}: Alpha fade has no sharp step (maxStep ${maxStep.toFixed(2)})`);
}

/** ChatGPT bottom-band reproduction variants across all 4 palettes with Ambient Stage glyphs enabled. */
async function checkChatGPTBottomVariants(suite) {
  const { engine, artifacts } = suite;
  const host = 'chatgpt';
  const initial = { ...PALETTES[0].patch, ambientStyle: 'aurora', ambientTexture: 'glyphs', motionLevel: 'off' };
  await onLiveFixture(suite, host, { failure: 'chatgpt-bottom-variants-scrim-failure', colorScheme: 'dark', initial }, async ({ page, errors }) => {
    await applyChatGPTBottomVariants(page, {
      containerFadeAfter: true,
      overlayHostAfter: true,
      sharpEdgeShadow: true,
      outerSpacersAndVtDisclaimer: true
    });
    const native = {
      attributes: await attributeSnapshot(page, host),
      domOrder: await domOrderSnapshot(page, host),
      spacing: await chatgptSpacingMetrics(page)
    };
    assert.ok(native.spacing.outerSpacerHeight >= 20 && native.spacing.outerDiscHeight >= 24 && native.spacing.bottomGap >= 58, `${engine} chatgpt variants native: external spacer (${native.spacing.outerSpacerHeight}), vt disclaimer (${native.spacing.outerDiscHeight}), bottomGap (${native.spacing.bottomGap})`);

    await injectExtension(page, suite);

    for (const pal of PALETTES) {
      const label = `${engine} chatgpt bottom-variants ${pal.name}`;
      await applyPalette(page, pal, '#thread-bottom-container[data-op-composer-backdrop="true"]', { ambientTexture: 'glyphs' });
      await scrollToEnd(page, host);

      const canvas = await canvasColor(page);
      const occlusion = await occlusionColumn(page, host, canvas);
      assert.ok(occlusion.max <= 0.08, `${label}: zero horizontal band across variants (max alpha ${occlusion.max.toFixed(2)})`);
      assert.ok(occlusion.maxStep <= 0.08, `${label}: zero sharp band edge (max step ${occlusion.maxStep.toFixed(2)})`);

      await assertGlowContinuous(page, host, label, canvas, { includeInFlowBands: true });
      await applyPalette(page, pal, '', { ambientTexture: 'glyphs' });

      // Trigger multiple refreshes to verify external spacers & disclaimers stay at 0px without bounce-back.
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => ObsidianPrismRuntime.refresh());
        await page.waitForTimeout(180);
        await frames(page);
      }

      const variantState = await page.evaluate(() => {
        const dock = document.querySelector('#thread-bottom-container');
        const fade = document.querySelector('.content-fade-container');
        const scrollBtn = document.querySelector('.scroll-to-bottom-btn');
        const outerSpacer = document.querySelector('.dock-outer-spacer');
        const outerDisc = document.querySelector('.disclaimer-outer-wrap');
        const composer = document.querySelector('[data-composer-layout]');
        const model = document.querySelector('button[aria-label="Select ChatGPT model"]');
        const stage = document.querySelector('#op-ambient-stage');
        const glyphs = document.querySelector('.op-ambient-glyphs');
        const scroller = document.querySelector('[data-prism-test-scroller]');
        const dockStyle = getComputedStyle(dock);
        const dockAfter = getComputedStyle(dock, '::after');
        const fadeStyle = getComputedStyle(fade);
        const fadeAfter = getComputedStyle(fade, '::after');
        const btnStyle = getComputedStyle(scrollBtn);
        const compStyle = getComputedStyle(composer);
        return {
          dockBackdrop: dock.getAttribute('data-op-composer-backdrop'),
          dockScrim: dock.getAttribute('data-op-composer-scrim'),
          dockOverlaid: dock.getAttribute('data-op-composer-overlaid'),
          dockBg: dockStyle.backgroundColor,
          dockBgImg: dockStyle.backgroundImage,
          dockShadow: dockStyle.boxShadow,
          sharpBottom: dockStyle.getPropertyValue('--sharp-edge-bottom-shadow').trim(),
          sharpTop: dockStyle.getPropertyValue('--sharp-edge-top-shadow').trim(),
          sharpContent: dockStyle.getPropertyValue('--sharp-edge-bottom-shadow-placeholder-content').trim(),
          dockAfterBg: dockAfter.backgroundColor,
          dockAfterImg: dockAfter.backgroundImage,
          dockAfterMask: dockAfter.maskImage || dockAfter.webkitMaskImage || 'none',
          dockAfterShadow: dockAfter.boxShadow,
          fadeBackdrop: fade.getAttribute('data-op-composer-backdrop'),
          fadeAfterImg: fadeAfter.backgroundImage,
          fadeAfterMask: fadeAfter.maskImage || fadeAfter.webkitMaskImage || 'none',
          fadeBgImg: fadeStyle.backgroundImage,
          btnBackdrop: scrollBtn.getAttribute('data-op-composer-backdrop'),
          btnBg: btnStyle.backgroundColor,
          btnOpacity: btnStyle.opacity,
          outerSpacerAttr: outerSpacer.getAttribute('data-op-composer-empty-sibling'),
          outerSpacerHeight: Math.round(outerSpacer.getBoundingClientRect().height * 10) / 10,
          outerDiscAttr: outerDisc.getAttribute('data-op-composer-disclaimer'),
          outerDiscDisplay: getComputedStyle(outerDisc).display,
          outerDiscHeight: Math.round(outerDisc.getBoundingClientRect().height * 10) / 10,
          composerBackdrop: composer.getAttribute('data-op-composer-backdrop'),
          composerSurface: composer.getAttribute('data-op-composer-surface'),
          composerOpacity: compStyle.opacity,
          composerBg: compStyle.backgroundColor,
          composerShadow: compStyle.boxShadow,
          modelColor: getComputedStyle(model).color,
          stageInsideScroller: Boolean(scroller.contains(stage)),
          glyphsDisplay: getComputedStyle(glyphs).display,
          glyphsOpacity: parseFloat(getComputedStyle(glyphs).opacity)
        };
      });
      const isTransparent = v => v === 'transparent' || /^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(v);
      assert.equal(variantState.dockBackdrop, 'true', `${label}: dock marked backdrop`);
      assert.equal(variantState.dockScrim, null, `${label}: ChatGPT dock never gets data-op-composer-scrim`);
      assert.equal(variantState.dockOverlaid, null, `${label}: in-flow dock not marked overlaid`);
      assert.ok(isTransparent(variantState.dockBg) && variantState.dockBgImg === 'none', `${label}: dock background cleared`);
      assert.equal(variantState.dockShadow, 'none', `${label}: dock box-shadow cleared`);
      assert.equal(variantState.sharpBottom, 'none', `${label}: --sharp-edge-bottom-shadow cleared`);
      assert.equal(variantState.sharpTop, 'none', `${label}: --sharp-edge-top-shadow cleared`);
      assert.equal(variantState.sharpContent, 'none', `${label}: --sharp-edge-bottom-shadow-placeholder-content cleared`);
      assert.ok(isTransparent(variantState.dockAfterBg) && variantState.dockAfterImg === 'none' && variantState.dockAfterMask === 'none' && variantState.dockAfterShadow === 'none', `${label}: dock ::after completely cleared`);
      assert.equal(variantState.fadeBackdrop, 'true', `${label}: container .content-fade marked backdrop`);
      assert.equal(variantState.fadeBgImg, 'none', `${label}: .content-fade-container backgroundImage cleared`);
      assert.equal(variantState.fadeAfterImg, 'none', `${label}: .content-fade-container::after backgroundImage cleared`);
      assert.equal(variantState.fadeAfterMask, 'none', `${label}: .content-fade-container::after maskImage cleared`);
      assert.equal(variantState.btnBackdrop, null, `${label}: scroll-to-bottom button never marked backdrop`);
      assert.ok(!isTransparent(variantState.btnBg) && variantState.btnOpacity === '1', `${label}: scroll-to-bottom button retains own painted surface`);
      assert.equal(variantState.outerSpacerAttr, 'true', `${label}: external spacer marked`);
      assert.equal(variantState.outerSpacerHeight, 0, `${label}: external spacer collapsed to 0px without bounce-back`);
      assert.equal(variantState.outerDiscAttr, 'true', `${label}: external vt disclaimer marked`);
      assert.equal(variantState.outerDiscDisplay, 'none', `${label}: external vt disclaimer hidden`);
      assert.equal(variantState.outerDiscHeight, 0, `${label}: external vt disclaimer height 0 without bounce-back`);
      assert.equal(variantState.composerBackdrop, null, `${label}: composer never marked backdrop`);
      assert.equal(variantState.composerSurface, 'true', `${label}: composer restyled`);
      assert.ok(variantState.composerOpacity === '1' && !isTransparent(variantState.composerBg) && variantState.composerShadow !== 'none', `${label}: Composer Surface retains opaque card & glow`);
      assert.equal(variantState.stageInsideScroller, false, `${label}: Ambient Stage sits outside masked scroller`);
      assert.equal(variantState.glyphsDisplay, 'block', `${label}: Ambient Stage glyphs visible`);
      assert.ok(variantState.glyphsOpacity > 0, `${label}: Ambient Stage glyphs opacity > 0 (${variantState.glyphsOpacity})`);

      await assertCardUnclippedAndCompactGap(page, host, label);
      await assertCrispAndClickable(page, host, label);
      assert.deepEqual(await domOrderSnapshot(page, host), native.domOrder, `${label}: active variants preserve DOM parent/child/sibling order`);

      // Verify injected [role="dialog"] and [role="menu"] inside main are strictly protected.
      await page.evaluate(() => {
        const main = document.querySelector('main');
        const dlg = document.createElement('div');
        dlg.id = 'prism-test-dialog';
        dlg.setAttribute('role', 'dialog');
        dlg.className = 'content-fade';
        dlg.style.cssText = 'position:fixed;left:420px;top:300px;width:220px;height:80px;background:rgb(32,36,44);color:#fff;z-index:40';
        dlg.textContent = 'Dialog sample';
        const menu = document.createElement('div');
        menu.id = 'prism-test-menu';
        menu.setAttribute('role', 'menu');
        menu.className = 'content-fade';
        menu.style.cssText = 'position:fixed;left:420px;top:400px;width:180px;height:60px;background:rgb(38,42,52);color:#fff;z-index:40';
        menu.textContent = 'Menu sample';
        main.append(dlg, menu);
        ObsidianPrismRuntime.refresh();
      });
      await frames(page);
      const overlayCheck = await page.evaluate(() => {
        const dlg = document.getElementById('prism-test-dialog');
        const menu = document.getElementById('prism-test-menu');
        const ds = getComputedStyle(dlg);
        const ms = getComputedStyle(menu);
        return {
          dlgBackdrop: dlg.getAttribute('data-op-composer-backdrop'),
          dlgBg: ds.backgroundColor,
          dlgOpacity: ds.opacity,
          menuBackdrop: menu.getAttribute('data-op-composer-backdrop'),
          menuBg: ms.backgroundColor,
          menuOpacity: ms.opacity
        };
      });
      await page.evaluate(() => {
        document.getElementById('prism-test-dialog')?.remove();
        document.getElementById('prism-test-menu')?.remove();
        ObsidianPrismRuntime.refresh();
      });
      await frames(page);
      assert.equal(overlayCheck.dlgBackdrop, null, `${label}: [role="dialog"] protected from backdrop clearing`);
      assert.ok(!isTransparent(overlayCheck.dlgBg) && overlayCheck.dlgOpacity === '1', `${label}: [role="dialog"] retains painted background & opacity`);
      assert.equal(overlayCheck.menuBackdrop, null, `${label}: [role="menu"] protected from backdrop clearing`);
      assert.ok(!isTransparent(overlayCheck.menuBg) && overlayCheck.menuOpacity === '1', `${label}: [role="menu"] retains painted background & opacity`);

      await assertScrollerAlphaFade(page, label, canvas);
      if (pal.name === 'obsidian' || pal.name === 'crystal') {
        await page.screenshot({ path: path.join(artifacts, `${engine}-chatgpt-${pal.name}-bottom-variants.png`) });
      }
      console.log(`PASS ${label}: zero band/shadow/::after leak, external spacer/vt disclaimer 0px, safe scroller Alpha fade, glyphs & overlays intact`);
    }

    // composerRestyle: false, Native Palette, disabled, and stop() restore variant shadows, ::after gradients, external spacers, disclaimers, bottomGap & DOM order.
    await patchConfig(page, { composerRestyle: false }, () => document.documentElement.getAttribute('data-op-composer') === 'false');
    await frames(page);
    const unstyledMetrics = await chatgptSpacingMetrics(page);
    near(unstyledMetrics.spacerHeight, native.spacing.spacerHeight, 0.5, `${engine} chatgpt variants composerRestyle: false restores inner spacer`);
    near(unstyledMetrics.outerSpacerHeight, native.spacing.outerSpacerHeight, 0.5, `${engine} chatgpt variants composerRestyle: false restores external spacer`);
    near(unstyledMetrics.outerDiscHeight, native.spacing.outerDiscHeight, 0.5, `${engine} chatgpt variants composerRestyle: false restores external vt disclaimer`);
    near(unstyledMetrics.bottomGap, native.spacing.bottomGap, 0.5, `${engine} chatgpt variants composerRestyle: false restores bottomGap`);
    assert.deepEqual(await domOrderSnapshot(page, host), native.domOrder, `${engine} chatgpt variants composerRestyle: false preserves DOM order`);
    await patchConfig(page, { composerRestyle: true }, () => document.documentElement.getAttribute('data-op-composer') === 'true');

    for (const [modeName, patch, ready] of [
      ['Native Palette', { palette: 'host', lightPreset: 'host' }, () => document.documentElement.getAttribute('data-op-effective-palette') === 'host'],
      ['disabled', { enabled: false }, () => !document.documentElement.hasAttribute('data-op-enabled')]
    ]) {
      await patchConfig(page, patch, ready);
      await frames(page);
      const restored = await page.evaluate(() => {
        const dock = document.querySelector('#thread-bottom-container');
        const scroller = document.querySelector('[data-prism-test-scroller]');
        const outerSpacer = document.querySelector('.dock-outer-spacer');
        const outerDisc = document.querySelector('.disclaimer-outer-wrap');
        return {
          dockShadow: getComputedStyle(dock).boxShadow,
          dockAfterImg: getComputedStyle(dock, '::after').backgroundImage,
          scrollerFadeAttr: scroller.getAttribute('data-op-scroller-fade'),
          scrollerMask: getComputedStyle(scroller).maskImage || getComputedStyle(scroller).webkitMaskImage || 'none',
          outerSpacerHeight: Math.round(outerSpacer.getBoundingClientRect().height * 10) / 10,
          outerDiscHeight: Math.round(outerDisc.getBoundingClientRect().height * 10) / 10,
          discDisplay: getComputedStyle(outerDisc).display
        };
      });
      const restoredSpacing = await chatgptSpacingMetrics(page);
      assert.notEqual(restored.dockShadow, 'none', `${engine} chatgpt variants ${modeName}: restores native sharp-edge box-shadow`);
      assert.match(restored.dockAfterImg, /linear-gradient/, `${engine} chatgpt variants ${modeName}: restores native ::after gradient`);
      assert.equal(restored.scrollerFadeAttr, null, `${engine} chatgpt variants ${modeName}: clears data-op-scroller-fade`);
      assert.equal(restored.scrollerMask, 'none', `${engine} chatgpt variants ${modeName}: restores scroller maskImage none`);
      assert.notEqual(restored.discDisplay, 'none', `${engine} chatgpt variants ${modeName}: restores external disclaimer`);
      near(restored.outerSpacerHeight, native.spacing.outerSpacerHeight, 0.5, `${engine} chatgpt variants ${modeName}: restores external spacer height`);
      near(restored.outerDiscHeight, native.spacing.outerDiscHeight, 0.5, `${engine} chatgpt variants ${modeName}: restores external disclaimer height`);
      near(restoredSpacing.bottomGap, native.spacing.bottomGap, 0.5, `${engine} chatgpt variants ${modeName}: restores bottomGap`);
      assert.deepEqual(await domOrderSnapshot(page, host), native.domOrder, `${engine} chatgpt variants ${modeName}: preserves DOM order`);
      await patchConfig(page, { enabled: true, ...PALETTES[0].patch, ambientStyle: 'aurora', ambientTexture: 'glyphs' }, () => document.documentElement.getAttribute('data-op-effective-palette') === 'obsidian');
    }

    await page.evaluate(() => ObsidianPrismRuntime.stop());
    await frames(page);
    assert.deepEqual(await attributeSnapshot(page, host), native.attributes, `${engine} chatgpt variants stop(): restores every attribute`);
    assert.deepEqual(await domOrderSnapshot(page, host), native.domOrder, `${engine} chatgpt variants stop(): preserves DOM order`);
    const stoppedSpacing = await chatgptSpacingMetrics(page);
    near(stoppedSpacing.outerSpacerHeight, native.spacing.outerSpacerHeight, 0.5, `${engine} chatgpt variants stop(): restores external spacer height`);
    near(stoppedSpacing.outerDiscHeight, native.spacing.outerDiscHeight, 0.5, `${engine} chatgpt variants stop(): restores external disclaimer height`);
    near(stoppedSpacing.bottomGap, native.spacing.bottomGap, 0.5, `${engine} chatgpt variants stop(): restores bottomGap`);
    assert.deepEqual(errors, []);
  });
}

/** ChatGPT sticky-overlay variant: #thread-bottom-container inside scroller skips Alpha fade & blur scrim, keeps clearance. */
async function checkChatGPTStickyOverlay(suite) {
  const { engine } = suite;
  const host = 'chatgpt';
  const initial = { ...PALETTES[0].patch, ambientStyle: 'aurora', ambientTexture: 'glyphs', motionLevel: 'off' };
  await onLiveFixture(suite, host, { failure: 'chatgpt-sticky-overlay-failure', colorScheme: 'dark', initial }, async ({ page, errors }) => {
    await applyChatGPTBottomVariants(page, {
      stickyInScroller: true,
      containerFadeAfter: true,
      overlayHostAfter: true,
      sharpEdgeShadow: true
    });
    await injectExtension(page, suite);
    for (const pal of [PALETTES[0], PALETTES[2]]) {
      const label = `${engine} chatgpt sticky-overlay ${pal.name}`;
      await applyPalette(page, pal, '#thread-bottom-container[data-op-composer-overlaid="true"]', { ambientTexture: 'glyphs' });
      await scrollToEnd(page, host);
      const state = await page.evaluate(() => {
        const dock = document.querySelector('#thread-bottom-container');
        const scroller = document.querySelector('[data-prism-test-scroller]');
        const col = document.querySelector('[class*="transcriptContent"]');
        const composer = document.querySelector('[data-composer-layout]');
        const compStyle = getComputedStyle(composer);
        return {
          overlaid: dock.getAttribute('data-op-composer-overlaid'),
          scrim: dock.getAttribute('data-op-composer-scrim'),
          scrollerFade: scroller.getAttribute('data-op-scroller-fade'),
          threadScroller: scroller.getAttribute('data-op-thread-scroller'),
          scrollerMask: getComputedStyle(scroller).maskImage || getComputedStyle(scroller).webkitMaskImage || 'none',
          threadPadBottom: parseFloat(getComputedStyle(col).paddingBottom),
          dockShadow: getComputedStyle(dock).boxShadow,
          dockAfterBg: getComputedStyle(dock, '::after').backgroundImage,
          composerOpacity: compStyle.opacity,
          composerBg: compStyle.backgroundColor
        };
      });
      assert.equal(state.overlaid, 'true', `${label}: sticky dock receives data-op-composer-overlaid`);
      assert.equal(state.scrim, null, `${label}: ChatGPT sticky dock NEVER receives data-op-composer-scrim`);
      assert.equal(state.scrollerFade, null, `${label}: sticky-in-scroller skips data-op-scroller-fade`);
      assert.equal(state.threadScroller, null, `${label}: sticky dock inside scroller skips data-op-thread-scroller`);
      assert.equal(state.scrollerMask, 'none', `${label}: scroller applies NO Alpha mask when containing sticky composer`);
      assert.ok(state.threadPadBottom >= 96, `${label}: overlaid thread column preserves scroll clearance >= 96px (got ${state.threadPadBottom})`);
      assert.equal(state.dockShadow, 'none', `${label}: sticky dock box-shadow cleared`);
      assert.equal(state.dockAfterBg, 'none', `${label}: sticky dock ::after cleared`);
      assert.equal(state.composerOpacity, '1', `${label}: Composer Surface remains 100% opaque`);
      assert.notEqual(state.composerBg, 'rgba(0, 0, 0, 0)', `${label}: Composer Surface keeps card paint`);

      const canvas = await canvasColor(page);
      const occlusion = await occlusionColumn(page, host, canvas);
      assert.ok(occlusion.max <= 0.08, `${label}: zero canvas veil on ChatGPT sticky dock (max alpha ${occlusion.max.toFixed(2)})`);
      assert.ok(occlusion.maxStep <= 0.08, `${label}: zero sharp band step (max step ${occlusion.maxStep.toFixed(2)})`);

      const declared = await scrimBackdropFilter(page, host);
      assert.equal(declared.value, 'none', `${label}: ChatGPT sticky dock applies no backdrop blur`);
      assert.ok((await dockPaint(page, host)).every(layer => layer.backdrop === 'none' && layer.before.backdrop === 'none'), `${label}: computed dock paint has no blur`);

      await assertGlowContinuous(page, host, label, canvas);
      await applyPalette(page, pal, '', { ambientTexture: 'glyphs' });
      const open = await textBlockStats(page, host, 'open');
      const behind = await textBlockStats(page, host, 'behind');
      assert.ok(behind.sharpness >= open.sharpness * 0.8, `${label}: sticky dock does not blur beside composer (${behind.sharpness.toFixed(2)} vs ${open.sharpness.toFixed(2)})`);
      await assertCrispAndClickable(page, host, label);
      console.log(`PASS ${label}: zero veil/blur/::after, skipped scroller Alpha fade, opaque Composer Surface, padBottom ${state.threadPadBottom}px`);
    }
    assert.deepEqual(errors, []);
  });
}

/** Gemini pure transparent bottom bar across all 4 palettes × 3 Content Width Presets, overlaid scroll clearance, and full restoration. */
async function checkGeminiOverlay(suite) {
  const { engine, artifacts } = suite;
  const host = 'gemini';
  const initial = { ...PALETTES[0].patch, ambientStyle: 'aurora', ambientTexture: 'off', motionLevel: 'off', contentWidth: 'standard' };
  const isTransparent = v => v === 'transparent' || /^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(v);
  await onLiveFixture(suite, host, { failure: 'gemini-overlay-live-scrim-failure', colorScheme: 'dark', initial }, async ({ page, errors }) => {
    await scrollToEnd(page, host);
    const native = {
      canvas: await canvasColor(page),
      attributes: await attributeSnapshot(page, host),
      domOrder: await domOrderSnapshot(page, host),
      paint: await dockPaint(page, host),
      layout: await gemiInputLayout(page),
      bottomGap: await composerBottomGap(page, host)
    };
    native.occlusion = await occlusionColumn(page, host, native.canvas, { side: 'left' });
    native.rightOcclusion = await occlusionColumn(page, host, native.canvas, { side: 'right' });
    assert.ok(native.occlusion.max >= 0.95, `${engine} gemini native: left wing gradient is opaque (alpha ${native.occlusion.max.toFixed(2)})`);
    assert.ok(native.rightOcclusion.max >= 0.95, `${engine} gemini native: right wing gradient is opaque (alpha ${native.rightOcclusion.max.toFixed(2)})`);

    await injectExtension(page, suite);
    for (const pal of PALETTES) {
      for (const width of WIDTHS) {
        const label = `${engine} gemini transparent-dock ${pal.name} ${width}`;
        await applyPalette(page, pal, 'input-container[data-op-composer-overlaid="true"]', { contentWidth: width, ambientStyle: 'none' });
        await scrollToEnd(page, host);
        assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-op-home')), 'false', `${label}: active conversation`);

        const state = await page.evaluate(() => {
          const input = document.querySelector('input-container.input-gradient');
          const scroller = document.querySelector('[data-prism-test-scroller]');
          const composer = document.querySelector('[data-op-composer-surface="true"]') || document.querySelector('input-area-v2');
          const compStyle = getComputedStyle(composer);
          const scrollerRect = scroller.getBoundingClientRect();
          const dockRect = input.getBoundingClientRect();
          const scrollerPadBottom = parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
          const clearancePx = parseFloat(document.documentElement.style.getPropertyValue('--op-dock-clearance')) || 0;
          return {
            backdrop: input.getAttribute('data-op-composer-backdrop'),
            dock: input.getAttribute('data-op-composer-dock'),
            overlaid: input.getAttribute('data-op-composer-overlaid'),
            scrim: input.getAttribute('data-op-composer-scrim'),
            threadScroller: scroller.getAttribute('data-op-thread-scroller'),
            scrollerFade: scroller.getAttribute('data-op-scroller-fade'),
            clearance: document.documentElement.style.getPropertyValue('--op-dock-clearance'),
            clearancePx,
            scrollerPadBottom,
            overlap: Math.max(0, Math.ceil(scrollerRect.bottom - dockRect.top)),
            composerOpacity: compStyle.opacity,
            composerBg: compStyle.backgroundColor
          };
        });
        assert.equal(state.backdrop, 'true', `${label}: input-container marked data-op-composer-backdrop`);
        assert.equal(state.dock, 'true', `${label}: input-container marked data-op-composer-dock`);
        assert.equal(state.overlaid, 'true', `${label}: input-container marked data-op-composer-overlaid`);
        assert.equal(state.scrim, null, `${label}: Gemini dock NEVER receives data-op-composer-scrim`);
        assert.equal(state.threadScroller, 'true', `${label}: overlaid scroller marked data-op-thread-scroller`);
        assert.equal(state.scrollerFade, null, `${label}: Gemini skips data-op-scroller-fade`);
        assert.ok(state.scrollerPadBottom + state.clearancePx >= state.overlap + 7, `${label}: total scroll-end clearance (${state.scrollerPadBottom} + ${state.clearancePx}) covers dock overlap (${state.overlap})`);
        assert.equal(state.composerOpacity, '1', `${label}: Composer Surface remains 100% opaque`);
        assert.ok(!isTransparent(state.composerBg), `${label}: Composer Surface keeps opaque card fill (${state.composerBg})`);

        const declared = await scrimBackdropFilter(page, host);
        assert.equal(declared.value, 'none', `${label}: Gemini dock applies NO extension backdrop-filter blur`);
        const layers = await dockPaint(page, host);
        for (const layer of layers) {
          assert.ok(isTransparent(layer.background) && layer.image === 'none' && layer.mask === 'none' && layer.boxShadow === 'none' && layer.backdrop === 'none', `${label}: ${layer.tag} paint cleared (${JSON.stringify(layer)})`);
          assert.ok(isTransparent(layer.before.background) && layer.before.image === 'none' && layer.before.mask === 'none' && layer.before.backdrop === 'none', `${label}: ${layer.tag}::before paint cleared (${JSON.stringify(layer.before)})`);
          assert.ok(isTransparent(layer.after.background) && layer.after.image === 'none' && layer.after.mask === 'none' && layer.after.backdrop === 'none' && layer.after.boxShadow === 'none', `${label}: ${layer.tag}::after paint cleared (${JSON.stringify(layer.after)})`);
        }

        // Flat-canvas wing continuity + opaque Composer Surface check.
        const regions = await geminiWingRegions(page);
        const flatLeft = (await regionStats(page, regions.left)).mean;
        const flatAboveLeft = (await regionStats(page, regions.aboveLeft)).mean;
        const flatRight = (await regionStats(page, regions.right)).mean;
        const flatAboveRight = (await regionStats(page, regions.aboveRight)).mean;
        const flatInterior = (await regionStats(page, regions.interior)).mean;
        assert.ok(channelGap(flatLeft, flatAboveLeft) <= 3, `${label}: left wing ${fmt(flatLeft)} matches canvas above ${fmt(flatAboveLeft)} (no dark box)`);
        assert.ok(channelGap(flatRight, flatAboveRight) <= 3, `${label}: right wing ${fmt(flatRight)} matches canvas above ${fmt(flatAboveRight)} (no dark box)`);

        // Aurora continuity & zero luminance step on both left and right wings.
        await applyPalette(page, pal, 'input-container[data-op-composer-overlaid="true"]', { contentWidth: width, ambientStyle: 'aurora' });
        const litInterior = (await regionStats(page, regions.interior)).mean;
        assert.ok(channelGap(litInterior, flatInterior) <= 2, `${label}: Composer Surface interior stays opaque across ambient toggle (${fmt(flatInterior)} -> ${fmt(litInterior)})`);

        const canvas = await canvasColor(page);
        const leftOcc = await occlusionColumn(page, host, canvas, { side: 'left' });
        const rightOcc = await occlusionColumn(page, host, canvas, { side: 'right' });
        assert.ok(leftOcc.max <= 0.08 && leftOcc.maxStep <= 0.08, `${label}: left wing has zero dark rectangular luminance step (max ${leftOcc.max.toFixed(2)}, step ${leftOcc.maxStep.toFixed(2)})`);
        assert.ok(rightOcc.max <= 0.08 && rightOcc.maxStep <= 0.08, `${label}: right wing has zero dark rectangular luminance step (max ${rightOcc.max.toFixed(2)}, step ${rightOcc.maxStep.toFixed(2)})`);
        await assertGlowContinuous(page, host, label, canvas);
        await assertCrispAndClickable(page, host, label);
        await applyPalette(page, pal, '', { contentWidth: width, ambientStyle: 'aurora' });

        if (width === 'standard') {
          const open = await textBlockStats(page, host, 'open');
          const behind = await textBlockStats(page, host, 'behind');
          assert.ok(behind.sharpness >= open.sharpness * 0.8, `${label}: wing area behind dock stays unblurred (${behind.sharpness.toFixed(2)} vs ${open.sharpness.toFixed(2)})`);
          const activeLayout = await gemiInputLayout(page);
          assert.equal(activeLayout.position, native.layout.position, `${label}: Gemini dock keeps native positioning`);
          assert.equal(activeLayout.left, native.layout.left);
          assert.equal(activeLayout.right, native.layout.right);
          assert.equal(activeLayout.bottom, native.layout.bottom);
          assert.equal(activeLayout.minHeight, '0px', `${label}: Gemini dock drops 133px min-height`);
          assert.equal(activeLayout.paddingTop, '16px', `${label}: Gemini dock tightens top fade padding to 16px`);
          const cardMetrics = await assertCardUnclippedAndCompactGap(page, host, label);
          assert.ok(await page.locator(LIVE_SELECTORS.gemini.attachment).isVisible(), `${label}: attachment preview visible`);
          await page.locator(`${LIVE_SELECTORS.gemini.attachment} button`).click({ trial: true });
          const disclaimerHeight = await page.locator(LIVE_SELECTORS.gemini.disclaimer).evaluate(el => Math.round(el.getBoundingClientRect().height * 10) / 10);
          assert.equal(disclaimerHeight, 0, `${label}: Gemini disclaimer is hidden (0px)`);
          assert.deepEqual(await domOrderSnapshot(page, host), native.domOrder, `${label}: Gemini active DOM parent/child/sibling order intact`);

          for (let i = 0; i < 2; i++) {
            await page.evaluate(() => ObsidianPrismRuntime.refresh());
            await page.waitForTimeout(180);
            await frames(page);
          }
          const rescanDisclaimerHeight = await page.locator(LIVE_SELECTORS.gemini.disclaimer).evaluate(el => Math.round(el.getBoundingClientRect().height * 10) / 10);
          assert.equal(rescanDisclaimerHeight, 0, `${label}: Gemini disclaimer stays 0px across rescans`);
          await assertCardUnclippedAndCompactGap(page, host, `${label} rescan`);

          if (pal.name === 'obsidian' || pal.name === 'crystal') {
            await page.screenshot({ path: path.join(artifacts, `${engine}-${host}-${pal.name}-live-scrim.png`) });
            if (pal.name === 'obsidian') {
              // Prove dynamic --op-dock-clearance activates when scroller padding is smaller than the overlaid dock,
              // keeping the last Assistant Turn and message-actions above Composer Surface and clickable.
              await page.evaluate(() => {
                document.querySelector('[data-prism-test-scroller]').style.paddingBottom = '24px';
                ObsidianPrismRuntime.refresh();
              });
              await page.waitForFunction(() => parseFloat(document.documentElement.style.getPropertyValue('--op-dock-clearance')) >= 80);
              await scrollToEnd(page, host);
              const dynClearance = await page.evaluate(() => document.documentElement.style.getPropertyValue('--op-dock-clearance'));
              assert.ok(parseFloat(dynClearance) >= 80, `${label}: tight-padding scroller receives dynamic --op-dock-clearance (${dynClearance})`);
              await assertCrispAndClickable(page, host, `${label} tight-scroller-clearance`);
              await page.evaluate(() => {
                const scroller = document.querySelector('[data-prism-test-scroller]');
                scroller.style.removeProperty('padding-bottom');
                if (!scroller.getAttribute('style')?.trim()) scroller.removeAttribute('style');
                ObsidianPrismRuntime.refresh();
              });
              await scrollToEnd(page, host);

              const emptyDockH = await page.evaluate(() => {
                const hdr = document.querySelector('.file-preview-container');
                const saved = [...hdr.childNodes];
                hdr.replaceChildren();
                ObsidianPrismRuntime.refresh();
                return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => {
                  const h = document.querySelector('input-container.input-gradient').getBoundingClientRect().height;
                  hdr.replaceChildren(...saved);
                  ObsidianPrismRuntime.refresh();
                  requestAnimationFrame(() => requestAnimationFrame(() => r(Math.round(h * 10) / 10)));
                })));
              });
              assert.ok(emptyDockH <= 120, `${label}: empty-header Gemini overlaid dock <= 120px (got ${emptyDockH}px)`);
            }
            await assertRestoredState(page, host, label, native, pal.hostPatch, pal.patch);
          }
          console.log(`PASS ${label}: pure transparent dock (left/right alpha ${leftOcc.max.toFixed(2)}/${rightOcc.max.toFixed(2)}, clearance ${state.clearance || '0px'}+${state.scrollerPadBottom}px, bottomGap ${cardMetrics.cardGap}px)`);
        }
      }
      console.log(`PASS ${engine} gemini transparent-dock ${pal.name}: verified standard/wide/full widths, zero blur/dark box, clickable last message-actions`);
    }

    // Verify site disable (enableGemini: false) and extension disable (enabled: false) restore native paint & zero residue.
    await applyPalette(page, PALETTES[0], '', { contentWidth: 'standard', ambientStyle: 'aurora' });
    for (const off of [{ enableGemini: false }, { enabled: false }]) {
      const modeLabel = `${engine} gemini ${Object.keys(off)[0]}=false`;
      await patchConfig(page, off, () => !document.documentElement.hasAttribute('data-op-enabled'));
      await scrollToEnd(page, host);
      assert.deepEqual(await attributeSnapshot(page, host), native.attributes, `${modeLabel}: restores every attribute`);
      assert.deepEqual(await domOrderSnapshot(page, host), native.domOrder, `${modeLabel}: preserves DOM order`);
      assert.deepEqual(await dockPaint(page, host), native.paint, `${modeLabel}: restores native gradient paint`);
      near((await occlusionColumn(page, host, native.canvas)).max, native.occlusion.max, 0.05, `${modeLabel}: restores native gradient occlusion`);
      near(await composerBottomGap(page, host), native.bottomGap, 0.5, `${modeLabel}: restores native bottom gap`);
      assert.deepEqual(await gemiInputLayout(page), native.layout, `${modeLabel}: restores native input layout`);
      assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--op-dock-clearance')), '', `${modeLabel}: clears --op-dock-clearance`);
      await patchConfig(page, { enabled: true, enableGemini: true, ...PALETTES[0].patch, ambientStyle: 'aurora' }, () => document.documentElement.getAttribute('data-op-enabled') === 'true');
    }

    // Verify Home State restores native Gemini bottom gradient paint and clears all dock/backdrop/scroller marks & --op-dock-clearance.
    const removedTurns = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('user-query,model-response')];
      window.__prismGeminiHomeTurns = nodes.map(node => ({ parent: node.parentElement, node }));
      for (const node of nodes) node.remove();
      return nodes.length;
    });
    assert.ok(removedTurns > 0, `${engine} gemini Home State: fixture has turns to remove`);
    await page.waitForFunction(() => document.documentElement.getAttribute('data-op-home') === 'true');
    await frames(page);
    assert.deepEqual(await dockPaint(page, host), native.paint, `${engine} gemini Home State: restores native gradient paint`);
    near((await occlusionColumn(page, host, native.canvas)).max, native.occlusion.max, 0.05, `${engine} gemini Home State: restores native gradient occlusion`);
    near(await composerBottomGap(page, host), native.bottomGap, 0.5, `${engine} gemini Home State: restores native bottom gap`);
    assert.deepEqual(await gemiInputLayout(page), native.layout, `${engine} gemini Home State: restores native input layout`);
    assert.equal(await page.locator('[data-op-composer-backdrop="true"],[data-op-composer-dock="true"],[data-op-composer-overlaid="true"],[data-op-composer-scrim="true"],[data-op-thread-scroller="true"],[data-op-scroller-fade="true"],[data-op-composer-empty-sibling="true"],[data-op-composer-disclaimer="true"]').count(), 0, `${engine} gemini Home State: leaves zero dock/backdrop/scrim/scroller marks`);
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--op-dock-clearance')), '', `${engine} gemini Home State: clears --op-dock-clearance`);

    // Restore turns, re-verify active transparent bar, then test runtime stop().
    await page.evaluate(() => {
      for (const { parent, node } of window.__prismGeminiHomeTurns) parent.append(node);
      delete window.__prismGeminiHomeTurns;
      ObsidianPrismRuntime.refresh();
    });
    await page.waitForFunction(() => document.documentElement.getAttribute('data-op-home') === 'false' && document.querySelector('input-container')?.getAttribute('data-op-composer-overlaid') === 'true');
    await frames(page);

    await page.evaluate(() => ObsidianPrismRuntime.stop());
    await frames(page);
    await scrollToEnd(page, host);
    assert.deepEqual(await attributeSnapshot(page, host), native.attributes, `${engine} gemini stop(): restores every attribute`);
    assert.deepEqual(await domOrderSnapshot(page, host), native.domOrder, `${engine} gemini stop(): preserves DOM order`);
    assert.deepEqual(await dockPaint(page, host), native.paint, `${engine} gemini stop(): restores native gradient paint`);
    near((await occlusionColumn(page, host, native.canvas)).max, native.occlusion.max, 0.05, `${engine} gemini stop(): restores native gradient occlusion`);
    near(await composerBottomGap(page, host), native.bottomGap, 0.5, `${engine} gemini stop(): restores native bottom gap`);
    assert.deepEqual(await gemiInputLayout(page), native.layout, `${engine} gemini stop(): restores native input layout`);
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--op-dock-clearance')), '', `${engine} gemini stop(): clears --op-dock-clearance`);
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine} gemini transparent-dock restoration: Native Palette, Home State, site/extension disable and stop() restore native gradient with zero residue`);
  });
}

export async function checkLiveComposerScrim(options) {
  await checkChatGPTInFlow(options);
  await checkChatGPTBottomVariants(options);
  await checkChatGPTStickyOverlay(options);
  await checkGeminiOverlay(options);
  // v0.4.3 #41 live ChatGPT thread footer (2026-11-24 facts)
  await checkChatGPTThreadFooter(options);
}
