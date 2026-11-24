/**
 * v0.4.3 #41: the 2026-11-24 live ChatGPT thread footer (applyChatGPTThreadFooter). Natively its anchor-positioned
 * ::before/::after paint an opaque band left of, right of and below the Composer Surface. With the extension the same
 * sample areas show the page background seen above the composer, in all 4 palettes and every Content Width Preset.
 * The Composer Surface stays opaque and in place, the footer keeps its positioning, and Native Palette, site disable,
 * extension disable, the Home State and stop() bring the native band back. Measured in pixels and computed styles.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { onLiveFixture, injectExtension, patchConfig, settle, applyChatGPTThreadFooter, threadFooterRegions, LIVE_SELECTORS } from './live-fixtures.mjs';
import { regionStats, PALETTES, channelGap } from './measure.mjs';

const WIDTHS = ['standard', 'wide', 'full'];
const S = LIVE_SELECTORS.chatgpt;

const fmt = c => `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`;
const blueness = c => c.b - (c.r + c.g) / 2;
const mean = async (page, clip) => (await regionStats(page, clip)).mean;

async function scrollToEnd(page) {
  await page.locator(S.scroller).evaluate(node => { node.scrollTop = node.scrollHeight; });
  await settle(page);
}

/** Footer positioning and its pseudo-element boxes as computed by the browser, plus the Composer Surface box. */
async function footerGeometry(page) {
  return page.evaluate(({ threadFooter, composer: selector }) => {
    const footer = document.querySelector(threadFooter);
    const composer = document.querySelector(selector).getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const pick = (style, keys) => Object.fromEntries(keys.map(key => [key, style[key]]));
    const keys = ['position', 'top', 'right', 'bottom', 'left', 'zIndex', 'height', 'anchorScope'];
    return {
      footer: pick(getComputedStyle(footer), keys),
      before: pick(getComputedStyle(footer, '::before'), ['top', 'right', 'bottom', 'left', 'height']),
      after: pick(getComputedStyle(footer, '::after'), ['top', 'right', 'bottom', 'left', 'height']),
      composerGap: Math.round((footerRect.bottom - composer.bottom) * 10) / 10,
      composer: { left: composer.left, top: composer.top, width: composer.width, height: composer.height }
    };
  }, { threadFooter: S.threadFooter, composer: S.composer });
}

/** A small area inside the Composer Surface, right of the empty editor's placeholder. */
async function composerInterior(page) {
  return page.evaluate(({ composer, editor }) => {
    const card = document.querySelector(composer).getBoundingClientRect();
    const input = document.querySelector(editor).getBoundingClientRect();
    return { x: card.left + card.width * 0.7, y: input.top + input.height / 2 - 2, width: 8, height: 4 };
  }, { composer: S.composer, editor: S.editor });
}

async function bandPixels(page) {
  const regions = await threadFooterRegions(page);
  assert.ok(regions.left.width >= 4 && regions.below.height >= 4, `sample areas exist beside and below the composer (${JSON.stringify(regions)})`);
  return { regions, left: await mean(page, regions.left), below: await mean(page, regions.below), above: await mean(page, regions.above) };
}

/** The band is gone: left of and below the composer match the background above it. */
async function assertBandCleared(page, label) {
  const px = await bandPixels(page);
  for (const name of ['left', 'below']) {
    assert.ok(channelGap(px[name], px.above) <= 3, `${label}: ${name} of the composer ${fmt(px[name])} matches the background above it ${fmt(px.above)}`);
  }
  return px;
}

/** The native band is back: the sample areas show the opaque footer surface measured without the extension. */
async function assertNativeBand(page, native, label) {
  const px = await bandPixels(page);
  for (const name of ['left', 'below']) {
    assert.ok(channelGap(px[name], native[name]) <= 2, `${label}: ${name} of the composer ${fmt(px[name])} is the native footer surface ${fmt(native[name])}`);
  }
}

async function attributeSnapshot(page) {
  return page.locator(S.main).evaluate(root => [root, ...root.querySelectorAll('*')]
    .filter(node => !node.closest('[data-op-owned]'))
    .map(node => `${node.localName}${node.getAttributeNames().filter(name => !(name === 'style' && !node.getAttribute(name).trim())).sort().map(name => ` ${name}="${node.getAttribute(name)}"`).join('')}`));
}

async function applyPalette(page, pal, extra = {}) {
  await patchConfig(page, { ...pal.patch, ambientStyle: 'none', ...extra });
  await page.waitForFunction(([name, scheme, width]) =>
    document.documentElement.getAttribute('data-op-effective-palette') === name &&
    document.documentElement.getAttribute('data-op-scheme') === scheme &&
    document.documentElement.getAttribute('data-op-ambient-style') === 'none' &&
    (!width || document.documentElement.getAttribute('data-op-content-width') === width), [pal.name, pal.scheme, extra.contentWidth || '']);
  await settle(page);
}

export async function checkChatGPTThreadFooter(suite) {
  const { engine, artifacts } = suite;
  const initial = { ...PALETTES[0].patch, ambientStyle: 'none', ambientTexture: 'off', motionLevel: 'off', contentWidth: 'standard' };
  await onLiveFixture(suite, 'chatgpt', { failure: 'chatgpt-thread-footer-failure', colorScheme: 'dark', initial }, async ({ page, errors }) => {
    await applyChatGPTThreadFooter(page);
    await scrollToEnd(page);
    const native = { ...(await bandPixels(page)), geometry: await footerGeometry(page), attributes: await attributeSnapshot(page) };
    assert.ok(channelGap(native.below, { r: 14, g: 14, b: 14 }) <= 3 && channelGap(native.above, native.below) >= 12, `${engine} chatgpt thread footer native: opaque band below the composer (${fmt(native.below)} vs ${fmt(native.above)})`);

    await injectExtension(page, suite, { waitFor: '.op-vial-pill' });
    await settle(page);
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-op-home')), 'false', 'active conversation');

    // Clearing the band moves nothing: without composer restyling the composer and footer boxes equal the native ones.
    // Crystal's light canvas is far from the dark footer surface, so a leftover band cannot pass unnoticed.
    await applyPalette(page, PALETTES[2]);
    await patchConfig(page, { composerRestyle: false }, () => document.documentElement.getAttribute('data-op-composer') === 'false');
    await scrollToEnd(page);
    await assertBandCleared(page, `${engine} chatgpt thread footer composerRestyle:false`);
    assert.deepEqual(await footerGeometry(page), native.geometry, `${engine} chatgpt thread footer: composer position/size and footer positioning are unchanged`);
    await patchConfig(page, { composerRestyle: true }, () => document.documentElement.getAttribute('data-op-composer') === 'true');

    for (const pal of PALETTES) {
      for (const width of WIDTHS) {
        const label = `${engine} chatgpt thread footer ${pal.name} ${width}`;
        await applyPalette(page, pal, { contentWidth: width });
        await scrollToEnd(page);
        await assertBandCleared(page, label);
        const geometry = await footerGeometry(page);
        // The footer's height follows the (restyled) composer; its positioning stays native.
        const positioning = ({ top, height, ...rest }) => rest;
        assert.deepEqual(positioning(geometry.footer), positioning(native.geometry.footer), `${label}: the footer keeps its native position, inset, z-index and anchor scope`);
        assert.ok(Math.abs(geometry.composerGap - native.geometry.composerGap) <= 1, `${label}: the composer keeps its native distance to the footer bottom (${geometry.composerGap} vs ${native.geometry.composerGap})`);
        if (width === 'standard') {
          // Opaque Composer Surface: changing the ambient light behind it leaves its interior unchanged,
          // while the cleared band beside and below it now shows the light.
          const interior = await composerInterior(page);
          const flat = { inside: await mean(page, interior), ...(await bandPixels(page)) };
          await patchConfig(page, { ambientStyle: 'aurora' }, () => document.documentElement.getAttribute('data-op-ambient-style') === 'aurora');
          const lit = { inside: await mean(page, interior), ...(await bandPixels(page)) };
          assert.ok(channelGap(lit.inside, flat.inside) <= 2, `${label}: Composer Surface interior stays opaque (${fmt(flat.inside)} -> ${fmt(lit.inside)})`);
          for (const name of ['left', 'below']) {
            assert.ok(blueness(lit[name]) - blueness(flat[name]) >= 2, `${label}: ambient glow shows ${name} of the composer (${fmt(flat[name])} -> ${fmt(lit[name])})`);
          }
          if (pal.name === 'obsidian' || pal.name === 'crystal') await page.screenshot({ path: path.join(artifacts, `${engine}-chatgpt-thread-footer-${pal.name}.png`) });
          await applyPalette(page, pal, { contentWidth: width });
        }
      }
      // Native Palette restores the host footer paint.
      await patchConfig(page, { ...pal.hostPatch, contentWidth: 'standard' }, () => document.documentElement.getAttribute('data-op-effective-palette') === 'host');
      await scrollToEnd(page);
      await assertNativeBand(page, native, `${engine} chatgpt thread footer ${pal.name} Native Palette`);
      console.log(`PASS ${engine} chatgpt thread footer ${pal.name}: band cleared at standard/wide/full, opaque composer, native positioning, Native Palette restores`);
    }

    await applyPalette(page, PALETTES[0], { contentWidth: 'standard' });
    // The host re-renders the footer: the band stays cleared.
    await applyChatGPTThreadFooter(page);
    await page.evaluate(() => ObsidianPrismRuntime.refresh());
    await page.waitForTimeout(150);
    await scrollToEnd(page);
    await assertBandCleared(page, `${engine} chatgpt thread footer re-rendered`);

    for (const off of [{ enableChatGPT: false }, { enabled: false }]) {
      const label = `${engine} chatgpt thread footer ${Object.keys(off)[0]}=false`;
      await patchConfig(page, off, () => !document.documentElement.hasAttribute('data-op-enabled'));
      await scrollToEnd(page);
      await assertNativeBand(page, native, label);
      assert.deepEqual(await attributeSnapshot(page), native.attributes, `${label}: no residue on the page`);
      await patchConfig(page, { enabled: true, enableChatGPT: true }, () => document.documentElement.getAttribute('data-op-enabled') === 'true');
      await scrollToEnd(page);
      await assertBandCleared(page, `${label} re-enabled`);
    }

    // Home State: the conversation footer is left native.
    const turns = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('[data-turn-key]')];
      window.__prismHomeTurns = { parent: nodes[0].parentElement, nodes };
      for (const node of nodes) node.remove();
      return nodes.length;
    });
    assert.ok(turns > 0);
    await page.waitForFunction(() => document.documentElement.getAttribute('data-op-home') === 'true');
    await settle(page);
    const homeAfter = await page.evaluate(threadFooter => getComputedStyle(document.querySelector(threadFooter), '::after').backgroundColor, S.threadFooter);
    assert.equal(homeAfter, 'rgb(14, 14, 14)', `${engine} chatgpt thread footer Home State: the conversation footer keeps its native paint`);
    await page.evaluate(() => {
      const { parent, nodes } = window.__prismHomeTurns;
      parent.append(...nodes);
      delete window.__prismHomeTurns;
      ObsidianPrismRuntime.refresh();
    });
    await page.waitForFunction(() => document.documentElement.getAttribute('data-op-home') === 'false');
    await scrollToEnd(page);
    await assertBandCleared(page, `${engine} chatgpt thread footer after Home State`);

    await page.evaluate(() => ObsidianPrismRuntime.stop());
    await settle(page);
    await scrollToEnd(page);
    await assertNativeBand(page, native, `${engine} chatgpt thread footer stop()`);
    assert.deepEqual(await attributeSnapshot(page), native.attributes, `${engine} chatgpt thread footer stop(): no residue on the page`);
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine} chatgpt thread footer: re-render, site/extension disable, Home State and stop() restore the native band with zero residue`);
  });
}
