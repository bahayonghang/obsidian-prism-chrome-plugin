/**
 * v0.3.1 #18: turn recognition and tier-aware Reference Capacity on the probe-derived live fixtures.
 * Asserts what the user sees: a non-zero Context Vial, a Conversation Rail that searches and jumps,
 * and the capsule/popover text for each ChatGPT tier label (plus the Gemini custom-mode fallback).
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { onLiveFixture, injectExtension, LIVE_SELECTORS } from './live-fixtures.mjs';

const summaryText = page => page.locator('.op-vial-summary').textContent();
async function waitForSummary(page, pattern, label) {
  try {
    await page.waitForFunction(source => new RegExp(source).test(document.querySelector('.op-vial-summary')?.textContent || ''), pattern.source, { timeout: 4000 });
  } catch {
    assert.fail(`${label}: capsule should match ${pattern}, got "${await summaryText(page)}"`);
  }
}
async function setTierLabel(page, label) {
  await page.locator(`${LIVE_SELECTORS.chatgpt.model} span`).evaluate((node, text) => { node.textContent = text; }, label);
}
/** Opens the popover, returns its visible text as { label: value } rows, and closes it again. */
async function popoverRows(page) {
  await page.locator('.op-vial-pill').click();
  await page.locator('.op-vial-popover').waitFor({ state: 'visible' });
  const rows = await page.locator('.op-vial-details').evaluate(list => {
    const out = {};
    const items = [...list.children];
    for (let i = 0; i + 1 < items.length; i += 2) out[items[i].innerText.trim()] = items[i + 1].innerText.trim();
    return out;
  });
  await page.locator('.op-vial-pill').click();
  await page.locator('.op-vial-popover').waitFor({ state: 'hidden' });
  return rows;
}

async function checkChatGPT(suite) {
  const { engine, artifacts } = suite;
  await onLiveFixture(suite, 'chatgpt', { failure: 'chatgpt-live-turns-failure' }, async ({ page, errors }) => {
    await injectExtension(page, suite, { waitFor: '.op-vial-pill' });
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-op-home')), 'false', 'chatgpt live: an active conversation is not the Home State');

    // Context Vial: a non-zero local estimate against the High tier (400K).
    await waitForSummary(page, /^≈ [1-9][\d.]*K?\+? \/ 400\.0K$/, 'chatgpt live High');
    assert.ok(await page.locator('.op-vial-pill').isVisible(), 'chatgpt live: the Context Vial capsule is visible');
    const rows = await popoverRows(page);
    assert.ok(Number((rows.Questions || '').replace(/,/g, '')) > 0 && Number((rows.Replies || '').replace(/,/g, '')) > 0, `chatgpt live: both user and assistant turns are estimated (${JSON.stringify(rows)})`);
    assert.match(rows['Reference capacity'] || '', /^400,000 \(Auto-matched · High\)$/);

    // Conversation Rail: appears, lists only the two loaded user turns, searches and jumps.
    const toggle = page.locator('.op-rail-toggle');
    await toggle.waitFor({ state: 'visible' });
    await toggle.click();
    await page.locator('.op-rail-search').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.op-rail-item').count(), 2, 'chatgpt live: virtualized placeholders are not listed');
    const scroller = page.locator(LIVE_SELECTORS.chatgpt.scroller);
    await scroller.evaluate(node => { node.scrollTop = node.scrollHeight; });
    await page.locator('.op-rail-search').fill('calm layout');
    assert.equal(await page.locator('.op-rail-item:visible').count(), 1, 'chatgpt live: rail search filters to the matching question');
    await page.locator('.op-rail-item:visible').click();
    await page.waitForFunction(selector => {
      const target = document.querySelector('[data-content-search-unit-key$=":2:user"]');
      const box = document.querySelector(selector).getBoundingClientRect();
      const top = target.getBoundingClientRect().top;
      return top >= box.top - 2 && top <= box.top + 80;
    }, LIVE_SELECTORS.chatgpt.scroller, { timeout: 4000 });
    await page.locator('.op-rail-search').fill('');
    await toggle.click();

    // Tier labels → Reference Capacity.
    for (const tier of ['Pro', 'Thinking', 'xHigh']) {
      await setTierLabel(page, tier);
      await waitForSummary(page, /^≈ [1-9][\d.]*K?\+? \/ 400\.0K$/, `chatgpt live ${tier}`);
    }
    await setTierLabel(page, 'Instant');
    await waitForSummary(page, /^≈ [1-9][\d.]*K?\+? \/ 128\.0K$/, 'chatgpt live Instant');
    await setTierLabel(page, 'Auto');
    await waitForSummary(page, /^≈ [1-9][\d.]*K?\+? \/ 128\.0K\?$/, 'chatgpt live unknown tier');
    assert.match((await popoverRows(page))['Reference capacity'] || '', /^128,000 \(Unrecognized model; choose a capacity in settings · Auto\)$/);
    await page.evaluate(() => __prismFixture.patch({ language: 'zh-CN' }));
    await page.waitForFunction(() => document.querySelector('.op-vial-details')?.textContent.includes('参考容量'));
    assert.match((await popoverRows(page))['参考容量'] || '', /^128,000 \(未识别型号，可在设置中指定 · Auto\)$/);
    await page.screenshot({ path: path.join(artifacts, `${engine}-chatgpt-live-vial-unrecognized.png`) });

    // A manual capacity overrides auto and removes the `?`.
    await page.evaluate(() => __prismFixture.patch({ language: 'en-US', contextWindowTokens: 200000 }));
    await waitForSummary(page, /^≈ [1-9][\d.]*K?\+? \/ 200\.0K$/, 'chatgpt live manual override');
    assert.match((await popoverRows(page))['Reference capacity'] || '', /^200,000 \(Manual · Auto\)$/);
    await page.evaluate(() => __prismFixture.patch({ contextWindowTokens: 'auto' }));
    await waitForSummary(page, /\/ 128\.0K\?$/, 'chatgpt live back to auto');
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine} chatgpt live fixture: turns recognized, non-zero Context Vial, rail search/jump, not Home State, tier capacities with unrecognized '?' and manual override`);
  });
}

async function checkGemini(suite) {
  const { engine } = suite;
  await onLiveFixture(suite, 'gemini', { failure: 'gemini-live-turns-failure' }, async ({ page, errors }) => {
    await injectExtension(page, suite, { waitFor: '.op-vial-pill' });
    await waitForSummary(page, /^≈ [1-9][\d.]*K?\+? \/ 1\.0M$/, 'gemini live Neon High');
    assert.match((await popoverRows(page))['Reference capacity'] || '', /^1,000,000 \(Auto fallback · Neon High\)$/);
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine} gemini live fixture: custom mode keeps the 1M auto fallback, labelled as such`);
  });
}

export async function checkLiveTurnsAndCapacity(options) {
  await checkChatGPT(options);
  await checkGemini(options);
}
