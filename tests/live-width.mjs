/**
 * v0.3.1 #21: Content Width Presets on the probe-derived live fixtures, with the extension injected.
 * Everything is measured as the reader sees it: the rendered assistant paragraph, the Gemini markdown
 * blocks, the User Turn, the Composer Surface card and the Conversation Rail geometry.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { onLiveFixture, injectExtension, patchConfig, settle, LIVE_SELECTORS, NATIVE_BASELINES } from './live-fixtures.mjs';
import { MAIN_SELECTORS, paragraphWidth, setMainWidth } from './measure.mjs';

const MIN_STEP = 120; // spec: adjacent presets differ by at least 120px
const MIDPOINT_TOLERANCE = 1; // px: wide equals (standard + full) / 2 within subpixel rounding
const WIDE_CAP = 1200;
const SITE_FLAG = { chatgpt: 'enableChatGPT', gemini: 'enableGemini' };

async function setPreset(page, preset) {
  await patchConfig(page, { contentWidth: preset });
  await page.waitForFunction(value => document.documentElement.getAttribute('data-op-content-width') === value, preset);
  await settle(page);
}
async function cyclePreset(page, expected) {
  await page.locator('.op-width-toggle').click();
  await page.waitForFunction(value => document.documentElement.getAttribute('data-op-content-width') === value && document.querySelector('.op-width-toggle')?.getAttribute('data-width-preset') === value, expected);
  await settle(page);
}

/** What the reader sees: paragraph and composer card boxes, the rail, and Gemini's per-block widths. */
async function measure(page, host) {
  const s = LIVE_SELECTORS[host];
  const paragraph = await paragraphWidth(page, s.paragraph);
  const boxes = await page.evaluate(({ host, s }) => {
    const rect = selector => { const node = document.querySelector(selector); if (!node) return null; const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; };
    const out = { composer: rect(s.composer), rail: rect('#op-rail-root'), main: rect(s.main) };
    if (host === 'gemini') {
      out.blocks = [...document.querySelectorAll(`${s.assistant} > *`)].map(node => ({ tag: node.localName, width: node.getBoundingClientRect().width }));
      out.userQuery = rect(s.column);
      out.inputArea = rect(s.inputAreaContainer);
      out.footer = rect('.response-footer');
    }
    return out;
  }, { host, s });
  return { paragraph, ...boxes };
}

async function assertBubbleCap(page, host, preset) {
  const selector = LIVE_SELECTORS[host].userBubble;
  const result = await page.locator(selector).first().evaluate(bubble => {
    const original = bubble.innerHTML;
    bubble.textContent = 'Long prompt '.repeat(60);
    const width = bubble.getBoundingClientRect().width;
    const column = bubble.parentElement.getBoundingClientRect().width;
    bubble.innerHTML = original;
    return { width, column };
  });
  const cap = Math.min(result.column * 0.78, 820);
  assert.ok(result.width <= cap + 1, `${host} ${preset}: User Turn bubble (${result.width}) stays within min(78%, 820px) = ${cap}`);
}

async function checkHost(suite, host) {
  const { engine, artifacts } = suite;
  await onLiveFixture(suite, host, { failure: `${host}-live-width-failure` }, async ({ page, errors }) => {
    // Native widths before the extension exists.
    const native = await measure(page, host);
    await injectExtension(page, suite, { waitFor: '.op-width-toggle' });
    for (const mainWidth of [1280, 1100]) {
      await setMainWidth(page, MAIN_SELECTORS[host], mainWidth);
      await settle(page);
      const label = `${engine} ${host} @main ${mainWidth}`;
      const std = await measure(page, host);
      assert.ok(Math.abs(std.paragraph.box - native.paragraph.box) <= 1, `${label}: standard keeps the native paragraph width (${std.paragraph.box} vs ${native.paragraph.box})`);
      assert.ok(Math.abs(std.composer.width - native.composer.width) <= 1, `${label}: standard keeps the native composer width`);
      // The Bottom Dock cycle (v0.3.0 contract) drives standard -> wide -> full.
      await cyclePreset(page, 'wide');
      const wide = await measure(page, host);
      await assertBubbleCap(page, host, 'wide');
      await cyclePreset(page, 'full');
      const full = await measure(page, host);
      await assertBubbleCap(page, host, 'full');
      await page.screenshot({ path: path.join(artifacts, `${engine}-${host}-live-width-full-${mainWidth}.png`) });

      const [p0, p1, p2] = [std, wide, full].map(m => m.paragraph.box);
      assert.ok(p1 - p0 >= MIN_STEP, `${label}: wide paragraph (${p1}) is at least ${MIN_STEP}px wider than standard (${p0})`);
      assert.ok(p2 - p1 >= MIN_STEP, `${label}: full paragraph (${p2}) is at least ${MIN_STEP}px wider than wide (${p1})`);
      assert.ok(Math.abs(p1 - (p0 + p2) / 2) <= MIDPOINT_TOLERANCE, `${label}: wide paragraph (${p1}) is the midpoint of standard and full (${(p0 + p2) / 2}) within ${MIDPOINT_TOLERANCE}px`);
      assert.ok(p1 <= WIDE_CAP, `${label}: wide paragraph (${p1}) is at most ${WIDE_CAP}px`);
      assert.ok(wide.paragraph.text > p1 * 0.8 && full.paragraph.text > p2 * 0.8, `${label}: the long paragraph's lines actually fill the wider column`);
      // The Composer Surface follows the column.
      for (const [name, m] of [['wide', wide], ['full', full]]) {
        const grow = m.paragraph.box - p0, composerGrow = m.composer.width - std.composer.width;
        assert.ok(Math.abs(composerGrow - grow) <= 2, `${label} ${name}: composer grows with the column (composer +${composerGrow}, paragraph +${grow})`);
      }
      // Full: neither the body nor the composer overlaps the Conversation Rail; both stay inside the main area.
      assert.ok(full.rail, `${label}: the Conversation Rail is shown`);
      assert.ok(full.paragraph.right <= full.rail.left + 0.5, `${label}: full paragraph (right ${full.paragraph.right}) clears the rail (left ${full.rail.left})`);
      assert.ok(full.composer.right <= full.rail.left + 0.5, `${label}: full composer (right ${full.composer.right}) clears the rail (left ${full.rail.left})`);
      assert.ok(full.paragraph.left >= full.main.left && full.composer.left >= full.main.left, `${label}: full column stays inside the main area`);
      if (host === 'gemini') {
        const base = NATIVE_BASELINES.gemini;
        for (const [name, m] of [['wide', wide], ['full', full]]) {
          for (const block of m.blocks) {
            assert.ok(Math.abs(block.width - base.block) > 0.5 && Math.abs(block.width - base.inputArea) > 0.5, `${label} ${name}: no ${block.tag} block left at ${base.block}/${base.inputArea}px (got ${block.width})`);
            if (['p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'blockquote', 'code-block'].includes(block.tag)) {
              assert.ok(Math.abs(block.width - m.paragraph.box) <= 0.5, `${label} ${name}: ${block.tag} grows with the paragraph (${block.width} vs ${m.paragraph.box})`);
            }
          }
          assert.ok(Math.abs(m.userQuery.width - m.paragraph.box) <= 0.5, `${label} ${name}: User Turn follows the column (${m.userQuery.width})`);
          assert.ok(Math.abs(m.footer.width - m.paragraph.box) <= 0.5, `${label} ${name}: response footer follows the column (${m.footer.width})`);
          assert.ok(Math.abs((m.inputArea.width - base.inputArea) - (m.paragraph.box - base.block)) <= 0.5, `${label} ${name}: input area grows with the column (${m.inputArea.width})`);
        }
      }
      // Back to standard through the dock: native within 1px.
      await cyclePreset(page, 'standard');
      const back = await measure(page, host);
      assert.ok(Math.abs(back.paragraph.box - native.paragraph.box) <= 1, `${label}: back to standard restores the native paragraph width`);
      assert.ok(Math.abs(back.composer.width - native.composer.width) <= 1, `${label}: back to standard restores the native composer width`);
    }

    // Disabling the site or the extension in full restores native widths within 1px.
    for (const off of [{ [SITE_FLAG[host]]: false }, { enabled: false }]) {
      await setPreset(page, 'full');
      await patchConfig(page, off);
      await page.waitForFunction(() => !document.documentElement.hasAttribute('data-op-enabled'));
      await settle(page);
      const restored = await measure(page, host);
      const what = Object.keys(off)[0] === 'enabled' ? 'disabling the extension' : 'disabling the site';
      assert.ok(Math.abs(restored.paragraph.box - native.paragraph.box) <= 1, `${engine} ${host}: ${what} restores the native paragraph width (${restored.paragraph.box})`);
      assert.ok(Math.abs(restored.composer.width - native.composer.width) <= 1, `${engine} ${host}: ${what} restores the native composer width (${restored.composer.width})`);
      await patchConfig(page, { enabled: true, [SITE_FLAG[host]]: true, contentWidth: 'standard' });
      await page.waitForFunction(() => document.documentElement.getAttribute('data-op-enabled') === 'true');
    }

    // Below a 900px viewport wide and full fall back smoothly without horizontal scrolling.
    await page.setViewportSize({ width: 860, height: 900 });
    for (const preset of ['wide', 'full']) {
      await setPreset(page, preset);
      const overflow = await page.evaluate(selector => {
        const scroller = document.querySelector(selector);
        return { doc: document.documentElement.scrollWidth > window.innerWidth, scroller: scroller.scrollWidth > scroller.clientWidth + 1 };
      }, LIVE_SELECTORS[host].scroller);
      assert.equal(overflow.doc, false, `${engine} ${host} ${preset}: no document horizontal scroll below 900px`);
      assert.equal(overflow.scroller, false, `${engine} ${host} ${preset}: no conversation horizontal scroll below 900px`);
      await assertBubbleCap(page, host, `${preset} narrow`);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine} ${host} live fixture: Content Width Presets at main 1280/1100 (midpoint, >=${MIN_STEP}px steps, composer follows, rail clear, native restore, <900px fallback)`);
  });
}

export async function checkLiveWidthPresets(options) {
  for (const host of ['chatgpt', 'gemini']) await checkHost(options, host);
}
