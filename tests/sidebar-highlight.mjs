/**
 * v0.4.3 #42: sidebar active highlight shaped like its control, measured on the live fixtures.
 * An icon tile (equal-width icon-only rail button) gets an even fill, an even 1px ring and an accent icon,
 * with no single-side bar and no visible host overlay. An active row gets exactly one highlight layer that
 * covers the whole row, with no second layer on its inner link and no visible host grey. Assertions use
 * rendered pixels, boxes and computed styles, never marker attributes.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { onLiveFixture, injectExtension, patchConfig, settle } from './live-fixtures.mjs';
import { capturePixels } from './measure.mjs';

const TARGETS = {
  chatgpt: {
    tile: '#stage-slideover-sidebar button[aria-label="Home"]',
    idleTile: '#stage-slideover-sidebar button[aria-label="Library"]',
    row: '#stage-slideover-sidebar [role="group"][aria-current="page"]',
    link: '#stage-slideover-sidebar [role="group"][aria-current="page"] > a',
    idleRow: '#stage-slideover-sidebar nav > a[href^="/c/"]:not([aria-current])'
  },
  gemini: {
    row: 'side-navigation-v2 a[aria-current="page"]',
    link: 'side-navigation-v2 a[aria-current="page"]',
    idleRow: 'side-navigation-v2 a[href^="/app/"]:not([aria-current])'
  }
};
const PALETTES = [
  { palette: 'obsidian', patch: { themeMode: 'dark', palette: 'obsidian' } },
  { palette: 'warm', patch: { themeMode: 'dark', palette: 'warm' } },
  { palette: 'crystal', patch: { themeMode: 'light', lightPreset: 'crystal' } },
  { palette: 'alabaster', patch: { themeMode: 'light', lightPreset: 'alabaster' } }
];
const ACCENTS = ['follow', 'cobalt', 'iris', 'amber', 'mono'];

/** Parses rgb()/rgba()/color(srgb …)/#hex into 0–255 channels plus alpha. */
function parseColor(value) {
  const text = String(value || '').trim();
  const hex = text.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const digits = hex[1].length <= 4 ? [...hex[1]].map(d => d + d).join('') : hex[1];
    const [r, g, b, a = 255] = digits.match(/../g).map(pair => parseInt(pair, 16));
    return { r, g, b, a: a / 255 };
  }
  const numbers = text.match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number);
  if (!numbers || numbers.length < 3) return null;
  if (text.startsWith('color(srgb')) return { r: numbers[0] * 255, g: numbers[1] * 255, b: numbers[2] * 255, a: numbers[3] ?? 1 };
  if (/^rgba?\(/.test(text)) return { r: numbers[0], g: numbers[1], b: numbers[2], a: numbers[3] ?? 1 };
  return null;
}
const distance = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
const show = c => c ? `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}${c.a !== undefined && c.a < 1 ? ` / ${c.a}` : ''})` : String(c);
function contrast(fg, bg) {
  const lum = c => [c.r, c.g, c.b].map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
/** Weight of `accent` when `color` is read as a mix of accent and foreground (1 = pure accent). */
function accentWeight(color, accent, fg) {
  const d = ['r', 'g', 'b'].map(k => accent[k] - fg[k]);
  const v = ['r', 'g', 'b'].map(k => color[k] - fg[k]);
  const len = d.reduce((s, x) => s + x * x, 0);
  const t = v.reduce((s, x, i) => s + x * d[i], 0) / len;
  const residual = Math.max(...['r', 'g', 'b'].map((k, i) => Math.abs(color[k] - (fg[k] + t * d[i]))));
  return { t, residual };
}

async function rectOf(page, selector) {
  return page.locator(selector).first().evaluate(node => {
    const r = node.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  });
}
/** Computed paint of the visible pieces: tile (+ host ::before overlay and icon), row and inner link. */
async function paintSnapshot(page, host) {
  return page.evaluate(targets => {
    const read = (selector, pseudo) => {
      const node = selector && document.querySelector(selector);
      if (!node) return null;
      const style = getComputedStyle(node, pseudo);
      return ['backgroundColor', 'backgroundImage', 'boxShadow', 'color', 'outlineStyle', 'borderTopLeftRadius', 'fontFamily', 'transitionDuration']
        .map(key => `${key}:${style[key]}`).join('|');
    };
    return {
      tile: read(targets.tile), tileOverlay: read(targets.tile, '::before'), icon: read(targets.tile && `${targets.tile} svg`),
      row: read(targets.row), link: read(targets.link), idleRow: read(targets.idleRow)
    };
  }, TARGETS[host]);
}
async function computed(page, selector, keys, pseudo) {
  return page.locator(selector).first().evaluate((node, { keys, pseudo }) => {
    const style = getComputedStyle(node, pseudo);
    return Object.fromEntries(keys.map(key => [key, style[key]]));
  }, { keys, pseudo });
}
async function rootTokens(page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return { accent: style.getPropertyValue('--op-accent').trim(), fg: style.getPropertyValue('--op-fg').trim() };
  });
}
async function pixelsOf(page, rect, pad = 0) {
  const clip = { x: Math.floor(rect.left) - pad, y: Math.floor(rect.top) - pad, width: Math.ceil(rect.width) + pad * 2, height: Math.ceil(rect.height) + pad * 2 };
  return { image: await capturePixels(page, clip), clip };
}
async function hoverNothing(page) {
  await page.mouse.move(page.viewportSize().width - 2, page.viewportSize().height - 2);
}

/** Icon tile: even fill and even ring on all four sides, accent icon, no visible host overlay. */
async function assertIconTile(page, label) {
  const { tile } = TARGETS.chatgpt;
  await hoverNothing(page);
  await settle(page);
  const rect = await rectOf(page, tile);
  const { image } = await pixelsOf(page, rect);
  const w = image.width, h = image.height;
  const style = await computed(page, tile, ['backgroundColor']);
  const fill = parseColor(style.backgroundColor);
  assert.ok(fill && fill.a === 1, `${label}: the icon tile has an opaque fill (got ${style.backgroundColor})`);
  for (const [x, y] of [[w / 2, 3], [3, h / 2], [w - 4, h / 2], [w / 2, h - 4]]) {
    const pixel = image.at(x, y);
    assert.ok(distance(pixel, fill) <= 3, `${label}: tile fill at (${x},${y}) is the tile colour ${show(fill)}, no host overlay on top (got ${show(pixel)})`);
  }
  for (const inset of [0, 1]) {
    const edges = { left: image.at(inset, h / 2), right: image.at(w - 1 - inset, h / 2), top: image.at(w / 2, inset), bottom: image.at(w / 2, h - 1 - inset) };
    const values = Object.values(edges);
    const spread = Math.max(...values.flatMap(a => values.map(b => distance(a, b))));
    assert.ok(spread <= 6, `${label}: all four tile edges share one colour ${inset}px in (no single-side bar): ${JSON.stringify(Object.fromEntries(Object.entries(edges).map(([k, v]) => [k, show(v)])))}`);
    if (inset === 0) assert.ok(distance(edges.left, fill) >= 10, `${label}: the tile has a visible ring (edge ${show(edges.left)} vs fill ${show(fill)})`);
    else assert.ok(distance(edges.left, fill) <= 3, `${label}: the ring is 1px, not a 2px bar (got ${show(edges.left)})`);
  }
  const icon = parseColor((await computed(page, `${tile} svg`, ['color'])).color);
  let nearest = Infinity;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) nearest = Math.min(nearest, distance(image.at(x, y), icon));
  assert.ok(nearest <= 24, `${label}: the icon is painted in the icon colour ${show(icon)} (nearest pixel off by ${nearest})`);
  return { fill, icon };
}

/** Active row: exactly one highlight layer covering the whole row, an accent left edge, no inner layer. */
async function assertRowHighlight(page, host, label) {
  const { row, link } = TARGETS[host];
  await hoverNothing(page);
  await settle(page);
  const rect = await rectOf(page, row);
  const linkRect = await rectOf(page, link);
  const pad = 4;
  const { image, clip } = await pixelsOf(page, rect, pad);
  const fill = parseColor((await computed(page, row, ['backgroundColor'])).backgroundColor);
  assert.ok(fill && fill.a === 1, `${label}: the active row has one opaque highlight`);
  const at = (x, y) => image.at(x - clip.x, y - clip.y);
  // Scan one column (clear of text and rounded corners) through the row and its inner link.
  const column = Math.round(rect.right - 12);
  const matches = [];
  for (let y = clip.y; y < clip.y + image.height; y++) if (distance(at(column, y), fill) <= 3) matches.push(y);
  assert.ok(matches.length, `${label}: the row highlight colour ${show(fill)} is painted`);
  const top = Math.min(...matches), bottom = Math.max(...matches) + 1;
  assert.equal(matches.length, bottom - top, `${label}: one uninterrupted layer (no inner link layer) from ${top} to ${bottom}: ${matches.join(',')}`);
  assert.ok(Math.abs(top - rect.top) <= 1 && Math.abs(bottom - rect.bottom) <= 1,
    `${label}: highlight box ${top}–${bottom} equals the whole row ${rect.top}–${rect.bottom} (inner link ${linkRect.top}–${linkRect.bottom})`);
  const middle = rect.top + rect.height / 2;
  const edge = at(Math.floor(rect.left), middle);
  assert.ok(distance(edge, fill) >= 20, `${label}: the row has a left accent edge (edge ${show(edge)} vs fill ${show(fill)})`);
  assert.ok(distance(at(Math.floor(rect.left) + 2, middle), fill) <= 3, `${label}: the left edge is 2px wide`);
  assert.ok(distance(at(Math.ceil(rect.right) - 1, middle), fill) <= 3, `${label}: only the left side carries an edge`);
  const text = parseColor((await computed(page, link, ['color'])).color);
  const ratio = contrast(text, fill);
  assert.ok(ratio >= 4.5, `${label}: active row text contrast ${ratio.toFixed(2)}:1 >= 4.5:1`);
  return { fill, rect };
}

/** Text and icon contrast (computed, opaque surfaces) for every accent in the current palette. */
async function assertContrastAcrossAccents(page, host, palette, label) {
  for (const accent of ACCENTS) {
    await patchConfig(page, { accentTone: accent });
    await page.waitForFunction(value => document.documentElement.getAttribute('data-op-accent') === value, accent);
    await settle(page);
    const tokens = await rootTokens(page);
    const accentColor = parseColor(tokens.accent), fg = parseColor(tokens.fg);
    const name = `${label} ${palette}/${accent}`;
    const rowFill = parseColor((await computed(page, TARGETS[host].row, ['backgroundColor'])).backgroundColor);
    const rowText = parseColor((await computed(page, TARGETS[host].link, ['color'])).color);
    assert.ok(contrast(rowText, rowFill) >= 4.5, `${name}: row text contrast ${contrast(rowText, rowFill).toFixed(2)}:1 >= 4.5:1`);
    if (!TARGETS[host].tile) continue;
    const tileFill = parseColor((await computed(page, TARGETS[host].tile, ['backgroundColor'])).backgroundColor);
    const icon = parseColor((await computed(page, `${TARGETS[host].tile} svg`, ['color'])).color);
    assert.ok(contrast(icon, tileFill) >= 3, `${name}: icon contrast ${contrast(icon, tileFill).toFixed(2)}:1 >= 3:1 on the tile ${show(tileFill)}`);
    const { t, residual } = accentWeight(icon, accentColor, fg);
    assert.ok(t >= 0.7 && t <= 1.001 && residual <= 3, `${name}: the icon uses the accent ${tokens.accent} (accent weight ${t.toFixed(2)}, residual ${residual.toFixed(1)}; got ${show(icon)})`);
  }
  await patchConfig(page, { accentTone: 'follow' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-op-accent') === 'follow');
}

/** Active, hovered and keyboard-focused items look different from one another. */
async function assertStatesDistinct(page, host, label) {
  const t = TARGETS[host];
  const signature = async selector => {
    const style = await computed(page, selector, ['backgroundColor', 'boxShadow', 'outlineStyle', 'outlineWidth', 'color']);
    return `${style.backgroundColor}|${style.boxShadow}|${style.outlineStyle === 'none' ? 'none' : style.outlineWidth}`;
  };
  await hoverNothing(page);
  await settle(page);
  const active = await signature(t.row);
  const idle = await signature(t.idleRow);
  const idleRect = await rectOf(page, t.idleRow);
  await page.mouse.move(idleRect.left + idleRect.width / 2, idleRect.top + idleRect.height / 2);
  await settle(page);
  const hovered = await signature(t.idleRow);
  assert.notEqual(hovered, idle, `${label}: hover changes an inactive row`);
  assert.notEqual(hovered, active, `${label}: a hovered row does not look active`);
  const rowRect = await rectOf(page, t.row);
  await page.mouse.move(rowRect.left + rowRect.width / 2, rowRect.top + rowRect.height / 2);
  await settle(page);
  assert.equal(await signature(t.row), active, `${label}: hovering the active row keeps its single active highlight`);
  await hoverNothing(page);
  // Keyboard focus on an inactive row, then on the active one.
  await page.locator(t.link).first().focus();
  await page.keyboard.press('Tab');
  await page.waitForFunction(selector => document.activeElement === document.querySelector(selector), t.idleRow);
  await settle(page);
  const focused = await signature(t.idleRow);
  assert.ok(await page.locator(t.idleRow).first().evaluate(node => node.matches(':focus-visible')), `${label}: keyboard focus is focus-visible`);
  assert.notEqual(focused, idle, `${label}: keyboard focus is visible on an inactive row`);
  assert.notEqual(focused, hovered, `${label}: keyboard focus differs from hover`);
  assert.notEqual(focused, active, `${label}: keyboard focus differs from the active highlight`);
  await page.keyboard.press('Shift+Tab');
  await page.waitForFunction(selector => document.activeElement === document.querySelector(selector), t.link);
  await settle(page);
  const focusedLink = await computed(page, t.link, ['outlineStyle', 'outlineWidth']);
  assert.ok(focusedLink.outlineStyle !== 'none' && parseFloat(focusedLink.outlineWidth) >= 1, `${label}: the focused active item shows a focus ring on top of its highlight`);
  await page.locator(t.link).first().evaluate(node => node.blur());
  if (t.tile) {
    const tileActive = await signature(t.tile);
    const idleTile = await rectOf(page, t.idleTile);
    await page.mouse.move(idleTile.left + idleTile.width / 2, idleTile.top + idleTile.height / 2);
    await settle(page);
    assert.notEqual(await signature(t.idleTile), tileActive, `${label}: a hovered icon button does not look like the active tile`);
    await hoverNothing(page);
  }
  await settle(page);
}

async function assertNoActiveMarks(page, label) {
  const residue = await page.evaluate(() => document.querySelectorAll('[data-op-sidebar-active],[data-op-sidebar-active-tile],[data-op-sidebar-surface]').length);
  assert.equal(residue, 0, `${label}: no sidebar marks remain`);
}

export async function checkSidebarActiveHighlight(suite) {
  const { engine, artifacts } = suite;
  for (const host of ['chatgpt', 'gemini']) {
    await onLiveFixture(suite, host, { failure: `${host}-sidebar-highlight-failure` }, async ({ page, errors }) => {
      await hoverNothing(page);
      const native = await paintSnapshot(page, host);
      const nativeRow = await rectOf(page, TARGETS[host].row);
      await injectExtension(page, suite, { waitFor: '[data-op-sidebar-surface="true"]' });
      await patchConfig(page, { themeMode: 'dark', palette: 'obsidian', accentTone: 'follow', sidebarStyle: 'glass' },
        () => document.documentElement.getAttribute('data-op-effective-palette') === 'obsidian');
      const tag = `${engine} ${host}`;

      for (const { palette, patch } of PALETTES) {
        await patchConfig(page, patch);
        await page.waitForFunction(value => document.documentElement.getAttribute('data-op-effective-palette') === value, palette);
        await settle(page);
        if (host === 'chatgpt') await assertIconTile(page, `${tag} ${palette}`);
        await assertRowHighlight(page, host, `${tag} ${palette}`);
        await assertContrastAcrossAccents(page, host, palette, tag);
        if (palette === 'obsidian' || palette === 'crystal') await assertStatesDistinct(page, host, `${tag} ${palette}`);
      }
      await page.screenshot({ path: path.join(artifacts, `${engine}-${host}-sidebar-highlight.png`) });

      // Solid sidebar surface and the compact option keep one whole-row layer.
      await patchConfig(page, { themeMode: 'dark', palette: 'obsidian', sidebarStyle: 'solid', sidebarCompact: true },
        () => document.documentElement.getAttribute('data-op-sidebar-compact') === 'true' && document.documentElement.getAttribute('data-op-sidebar-style') === 'solid');
      if (host === 'chatgpt') await assertIconTile(page, `${tag} solid compact`);
      await assertRowHighlight(page, host, `${tag} solid compact`);
      await patchConfig(page, { sidebarStyle: 'glass', sidebarCompact: false },
        () => document.documentElement.getAttribute('data-op-sidebar-compact') === 'false');

      // Reduced motion (the fixture context emulates it): highlight changes are not animated.
      const motion = await paintSnapshot(page, host);
      for (const [key, value] of Object.entries(motion)) {
        if (value && key !== 'idleRow') assert.match(value, /transitionDuration:0s(\||$)/, `${tag}: no highlight transition under reduced motion (${key})`);
      }

      // Native sidebar style and Native Palette leave the host's own active state untouched.
      await patchConfig(page, { sidebarStyle: 'native' }, () => document.documentElement.getAttribute('data-op-sidebar-style') === 'native');
      await hoverNothing(page);
      await settle(page);
      assert.deepEqual(await paintSnapshot(page, host), native, `${tag}: sidebar style native keeps the host active look`);
      await patchConfig(page, { sidebarStyle: 'glass', palette: 'host' }, () => document.documentElement.getAttribute('data-op-effective-palette') === 'host');
      await hoverNothing(page);
      await settle(page);
      assert.deepEqual(await paintSnapshot(page, host), native, `${tag}: Native Palette keeps the host active look`);
      await patchConfig(page, { palette: 'obsidian' }, () => document.documentElement.getAttribute('data-op-effective-palette') === 'obsidian');
      await assertRowHighlight(page, host, `${tag} restyled again`);

      // Site disable, extension disable and stop() leave the host look and no marks behind.
      const siteKey = host === 'chatgpt' ? 'enableChatGPT' : 'enableGemini';
      await patchConfig(page, { [siteKey]: false }, () => !document.documentElement.hasAttribute('data-op-enabled'));
      await settle(page);
      assert.deepEqual(await paintSnapshot(page, host), native, `${tag}: site disable restores the host active look`);
      await assertNoActiveMarks(page, `${tag} site disable`);
      await patchConfig(page, { [siteKey]: true }, () => document.documentElement.getAttribute('data-op-effective-palette') === 'obsidian');
      await assertRowHighlight(page, host, `${tag} site re-enabled`);
      await patchConfig(page, { enabled: false }, () => !document.documentElement.hasAttribute('data-op-enabled'));
      await settle(page);
      assert.deepEqual(await paintSnapshot(page, host), native, `${tag}: extension disable restores the host active look`);
      await assertNoActiveMarks(page, `${tag} extension disable`);
      await patchConfig(page, { enabled: true }, () => document.documentElement.getAttribute('data-op-effective-palette') === 'obsidian');
      await assertRowHighlight(page, host, `${tag} re-enabled`);
      await page.evaluate(() => window.ObsidianPrismRuntime.stop());
      await settle(page);
      assert.deepEqual(await paintSnapshot(page, host), native, `${tag}: stop() restores the host active look`);
      await assertNoActiveMarks(page, `${tag} stop()`);
      assert.deepEqual(await rectOf(page, TARGETS[host].row), nativeRow, `${tag}: the active row keeps its native box`);

      assert.deepEqual(errors, []);
      console.log(`PASS ${tag} sidebar active highlight: ${host === 'chatgpt' ? 'icon tile + ' : ''}single whole-row layer across 4 palettes × 5 accents, contrast, hover/focus distinct, compact, reduced motion, native/Native Palette, site/extension disable and stop()`);
    });
  }
}
