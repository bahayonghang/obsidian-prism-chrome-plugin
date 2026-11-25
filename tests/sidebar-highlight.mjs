/**
 * v0.4.3 #42 / sidebar active prominence upgrade: sidebar active highlight shaped like its control,
 * measured on the live fixtures. An icon tile (equal-width icon-only rail button) gets an even fill,
 * an even 1px ring and an accent icon, with no single-side bar and no visible host overlay. An active
 * row gets one opaque layer clearly separated from the sidebar background (deltaE >= 9, channelGap >= 20)
 * and hover state, paired with a 3px left accent bar, a subtler 1px perimeter hairline, 600 weight,
 * and no second layer or host ::before overlay. Assertions use rendered pixels, boxes and computed styles.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { onLiveFixture, injectExtension, patchConfig, settle } from './live-fixtures.mjs';
import { capturePixels, PALETTES, channelGap } from './measure.mjs';

const TARGETS = {
  chatgpt: {
    tile: '#stage-slideover-sidebar button[aria-label="Home"]',
    idleTile: '#stage-slideover-sidebar button[aria-label="Library"]',
    row: '#stage-slideover-sidebar [role="group"][aria-current="page"]',
    link: '#stage-slideover-sidebar [role="group"][aria-current="page"] > a',
    title: '#stage-slideover-sidebar [role="group"][aria-current="page"] > a',
    idleRow: '#stage-slideover-sidebar nav > a[href^="/c/"]:not([aria-current])',
    idleTitle: '#stage-slideover-sidebar nav > a[href^="/c/"]:not([aria-current])'
  },
  gemini: {
    row: 'side-navigation-v2 a[aria-current="page"]',
    link: 'side-navigation-v2 a[aria-current="page"]',
    title: 'side-navigation-v2 a[aria-current="page"] .conversation-title',
    idleRow: 'side-navigation-v2 a[href^="/app/"]:not([aria-current])',
    idleTitle: 'side-navigation-v2 a[href^="/app/"]:not([aria-current]) .conversation-title'
  }
};
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
const show = c => c ? `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}${c.a !== undefined && c.a < 1 ? ` / ${c.a}` : ''})` : String(c);
function contrast(fg, bg) {
  const lum = c => [c.r, c.g, c.b].map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function srgbToLab(c) {
  const lin = v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const [r, g, b] = [c.r, c.g, c.b].map(v => lin(v / 255));
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = f((r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047);
  const fy = f((r * 0.2126729 + g * 0.7151522 + b * 0.0721750) / 1.00000);
  const fz = f((r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function deltaE(a, b) {
  const [l1, a1, b1] = srgbToLab(a), [l2, a2, b2] = srgbToLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
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
/** Computed paint of the visible pieces: tile (+ host ::before overlay and icon), row, row overlay, title and inner link. */
async function paintSnapshot(page, host) {
  return page.evaluate(targets => {
    const read = (selector, pseudo) => {
      const node = selector && document.querySelector(selector);
      if (!node) return null;
      const style = getComputedStyle(node, pseudo);
      return ['backgroundColor', 'backgroundImage', 'boxShadow', 'color', 'fontWeight', 'outlineStyle', 'borderTopLeftRadius', 'fontFamily', 'transitionDuration']
        .map(key => `${key}:${style[key]}`).join('|');
    };
    return {
      tile: read(targets.tile), tileOverlay: read(targets.tile, '::before'), icon: read(targets.tile && `${targets.tile} svg`),
      row: read(targets.row), rowOverlay: read(targets.row, '::before'), link: read(targets.link), title: read(targets.title), idleRow: read(targets.idleRow)
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
    return {
      accent: style.getPropertyValue('--op-accent').trim(),
      fg: style.getPropertyValue('--op-fg').trim(),
      sidebar: style.getPropertyValue('--op-sidebar').trim()
    };
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
    assert.ok(channelGap(pixel, fill) <= 3, `${label}: tile fill at (${x},${y}) is the tile colour ${show(fill)}, no host overlay on top (got ${show(pixel)})`);
  }
  for (const inset of [0, 1]) {
    const edges = { left: image.at(inset, h / 2), right: image.at(w - 1 - inset, h / 2), top: image.at(w / 2, inset), bottom: image.at(w / 2, h - 1 - inset) };
    const values = Object.values(edges);
    const spread = Math.max(...values.flatMap(a => values.map(b => channelGap(a, b))));
    assert.ok(spread <= 6, `${label}: all four tile edges share one colour ${inset}px in (no single-side bar): ${JSON.stringify(Object.fromEntries(Object.entries(edges).map(([k, v]) => [k, show(v)])))}`);
    if (inset === 0) assert.ok(channelGap(edges.left, fill) >= 10, `${label}: the tile has a visible ring (edge ${show(edges.left)} vs fill ${show(fill)})`);
    else assert.ok(channelGap(edges.left, fill) <= 3, `${label}: the ring is 1px, not a 2px bar (got ${show(edges.left)})`);
  }
  const icon = parseColor((await computed(page, `${tile} svg`, ['color'])).color);
  let nearest = Infinity;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) nearest = Math.min(nearest, channelGap(image.at(x, y), icon));
  assert.ok(nearest <= 24, `${label}: the icon is painted in the icon colour ${show(icon)} (nearest pixel off by ${nearest})`);
  return { fill, icon };
}

/** Active row: one opaque highlight clearly separated from the sidebar, 3px left bar, 1px hairline ring, 600 weight, no host overlay. */
async function assertRowHighlight(page, host, label) {
  const { row, link, title, idleRow } = TARGETS[host];
  await hoverNothing(page);
  await settle(page);
  const rect = await rectOf(page, row);
  const linkRect = await rectOf(page, link);
  const idleRect = await rectOf(page, idleRow);
  const pad = 4;
  const { image, clip } = await pixelsOf(page, rect, pad);
  const { image: idleImg, clip: idleClip } = await pixelsOf(page, idleRect, 0);
  const fill = parseColor((await computed(page, row, ['backgroundColor'])).backgroundColor);
  assert.ok(fill && fill.a === 1, `${label}: the active row has one opaque highlight`);
  const at = (x, y) => image.at(x - clip.x, y - clip.y);
  // Scan one column (clear of text and rounded corners) through the row and its inner link.
  const column = Math.round(rect.right - 12);
  const matches = [];
  for (let y = clip.y; y < clip.y + image.height; y++) if (channelGap(at(column, y), fill) <= 3) matches.push(y);
  assert.ok(matches.length, `${label}: the row highlight colour ${show(fill)} is painted with no host overlay on top`);
  const top = Math.min(...matches), bottom = Math.max(...matches) + 1;
  assert.equal(matches.length, bottom - top, `${label}: one uninterrupted layer (no inner link layer) from ${top} to ${bottom}: ${matches.join(',')}`);
  assert.ok(Math.abs(top - rect.top) <= 1 && Math.abs(bottom - rect.bottom) <= 1,
    `${label}: highlight box ${top}–${bottom} equals the whole row ${rect.top}–${rect.bottom} (inner link ${linkRect.top}–${linkRect.bottom})`);
  // Rendered active fill stands clearly apart from the rendered surrounding sidebar behind an inactive row.
  const sidebarPixel = idleImg.at(Math.round(idleRect.right - 12) - idleClip.x, Math.round(idleRect.top + idleRect.height / 2) - idleClip.y);
  const renderedDe = deltaE(fill, sidebarPixel);
  const renderedGap = channelGap(fill, sidebarPixel);
  assert.ok(renderedDe >= 9 && renderedGap >= 20,
    `${label}: active fill ${show(fill)} clearly stands out from rendered sidebar ${show(sidebarPixel)} (dE=${renderedDe.toFixed(1)}, gap=${renderedGap})`);
  const middle = rect.top + rect.height / 2;
  const edge0 = at(Math.floor(rect.left), middle);
  for (const dx of [0, 1, 2]) {
    const px = at(Math.floor(rect.left) + dx, middle);
    assert.ok(channelGap(px, fill) >= 20, `${label}: left accent bar at +${dx}px is painted (px ${show(px)} vs fill ${show(fill)})`);
  }
  assert.ok(channelGap(at(Math.floor(rect.left) + 3, middle), fill) <= 3, `${label}: the left accent bar is 3px wide`);
  const rightEdge = at(Math.ceil(rect.right) - 1, middle);
  assert.ok(channelGap(rightEdge, fill) >= 10, `${label}: right perimeter hairline is visible (edge ${show(rightEdge)} vs fill ${show(fill)})`);
  assert.ok(channelGap(rightEdge, fill) < channelGap(edge0, fill),
    `${label}: right 1px hairline (gap ${channelGap(rightEdge, fill)}) stays subtler than the 3px left bar (gap ${channelGap(edge0, fill)})`);
  assert.ok(channelGap(at(Math.ceil(rect.right) - 2, middle), fill) <= 3, `${label}: the perimeter hairline is 1px wide`);
  const titleStyle = await computed(page, title, ['color', 'fontWeight']);
  const text = parseColor(titleStyle.color);
  const ratio = contrast(text, fill);
  assert.ok(ratio >= 4.5, `${label}: active row text contrast ${ratio.toFixed(2)}:1 >= 4.5:1`);
  assert.ok(Number(titleStyle.fontWeight) >= 600, `${label}: active row text is semibold (got ${titleStyle.fontWeight})`);
  return { fill, rect };
}

/** Text, icon contrast, and sidebar separation across every accent in the current palette. */
async function assertContrastAcrossAccents(page, host, palette, label) {
  for (const accent of ACCENTS) {
    await patchConfig(page, { accentTone: accent });
    await page.waitForFunction(value => document.documentElement.getAttribute('data-op-accent') === value, accent);
    await settle(page);
    const tokens = await rootTokens(page);
    const accentColor = parseColor(tokens.accent), fg = parseColor(tokens.fg), sidebarBg = parseColor(tokens.sidebar);
    const name = `${label} ${palette}/${accent}`;
    const rowFill = parseColor((await computed(page, TARGETS[host].row, ['backgroundColor'])).backgroundColor);
    const titleStyle = await computed(page, TARGETS[host].title, ['color', 'fontWeight']);
    const rowText = parseColor(titleStyle.color);
    const de = deltaE(rowFill, sidebarBg), gap = channelGap(rowFill, sidebarBg);
    assert.ok(de >= 9 && gap >= 20, `${name}: active fill ${show(rowFill)} stays distinct from sidebar ${show(sidebarBg)} (dE=${de.toFixed(1)}, gap=${gap})`);
    assert.ok(contrast(rowText, rowFill) >= 4.5, `${name}: row text contrast ${contrast(rowText, rowFill).toFixed(2)}:1 >= 4.5:1`);
    assert.ok(Number(titleStyle.fontWeight) >= 600, `${name}: active title fontWeight >= 600 (got ${titleStyle.fontWeight})`);
    const idleTitleStyle = await computed(page, TARGETS[host].idleTitle, ['color', 'fontWeight']);
    const idleText = parseColor(idleTitleStyle.color);
    assert.ok(contrast(idleText, sidebarBg) >= 4.5, `${name}: inactive row text contrast ${contrast(idleText, sidebarBg).toFixed(2)}:1 >= 4.5:1`);
    assert.ok(Number(idleTitleStyle.fontWeight) < 600, `${name}: inactive row stays lighter than active (got ${idleTitleStyle.fontWeight})`);
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
  const activeFill = parseColor((await computed(page, t.row, ['backgroundColor'])).backgroundColor);
  const idle = await signature(t.idleRow);
  const idleRect = await rectOf(page, t.idleRow);
  await page.mouse.move(idleRect.left + idleRect.width / 2, idleRect.top + idleRect.height / 2);
  await settle(page);
  const hovered = await signature(t.idleRow);
  const hoveredFill = parseColor((await computed(page, t.idleRow, ['backgroundColor'])).backgroundColor);
  assert.notEqual(hovered, idle, `${label}: hover changes an inactive row`);
  assert.notEqual(hovered, active, `${label}: a hovered row does not look active`);
  assert.ok(deltaE(activeFill, hoveredFill) >= 5,
    `${label}: active fill ${show(activeFill)} stays clearly separate from hovered fill ${show(hoveredFill)} (dE=${deltaE(activeFill, hoveredFill).toFixed(1)})`);
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

      for (const { name: palette, patch } of PALETTES) {
        await patchConfig(page, patch);
        await page.waitForFunction(value => document.documentElement.getAttribute('data-op-effective-palette') === value, palette);
        await settle(page);
        if (host === 'chatgpt') await assertIconTile(page, `${tag} ${palette}`);
        await assertRowHighlight(page, host, `${tag} ${palette}`);
        await assertContrastAcrossAccents(page, host, palette, tag);
        if (palette === 'obsidian' || palette === 'crystal') await assertStatesDistinct(page, host, `${tag} ${palette}`);
        if (palette === 'crystal') {
          await page.screenshot({ path: path.join(artifacts, `${engine}-${host}-sidebar-highlight-crystal.png`) });
        }
      }
      await page.screenshot({ path: path.join(artifacts, `${engine}-${host}-sidebar-highlight.png`) });

      // Solid light crystal (worst-case same-hue background without glass brightening) keeps clear separation.
      await patchConfig(page, { themeMode: 'light', lightPreset: 'crystal', accentTone: 'follow', sidebarStyle: 'solid', sidebarCompact: false },
        () => document.documentElement.getAttribute('data-op-effective-palette') === 'crystal' && document.documentElement.getAttribute('data-op-sidebar-style') === 'solid');
      if (host === 'chatgpt') await assertIconTile(page, `${tag} crystal solid`);
      await assertRowHighlight(page, host, `${tag} crystal solid`);

      // Solid dark obsidian + compact option keep one whole-row layer.
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
