/**
 * v0.4.1 #34: Dual-host (Gemini + ChatGPT) offline Temml MathML Formula Preview,
 *「源码 / 公式」toggling, native Copy preservation, 48-line fold coordination,
 * streaming debounce, Native Palette color inheritance, Context Vial invariance,
 * and zero-residue disable/stop lifecycle.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { onLiveFixture, injectExtension, patchConfig, settle, LIVE_SELECTORS } from './live-fixtures.mjs';

function cardSelector(host) {
  return host === 'gemini' ? 'model-response .code-block' : '.assistant-turn .code-shell';
}

function hideTargetSelector(host) {
  return host === 'gemini' ? '.formatted-code-block-internal-container' : 'pre';
}

async function vialSnapshot(page) {
  await page.locator('.op-vial-pill').click();
  await page.locator('.op-vial-popover').waitFor({ state: 'visible' });
  const snap = await page.evaluate(() => {
    const summary = document.querySelector('.op-vial-summary')?.textContent?.trim() || '';
    const details = {};
    const children = [...(document.querySelector('.op-vial-details')?.children || [])];
    for (let i = 0; i + 1 < children.length; i += 2) {
      details[children[i].textContent.trim()] = children[i + 1].textContent.trim();
    }
    return { summary, details };
  });
  await page.locator('.op-vial-pill').click();
  await page.locator('.op-vial-popover').waitFor({ state: 'hidden' });
  return snap;
}

export async function checkFormulaPreview(suite) {
  const { engine, artifacts } = suite;
  for (const host of ['gemini', 'chatgpt']) {
    const cardSel = cardSelector(host);
    const hideSel = hideTargetSelector(host);
    await onLiveFixture(suite, host, { failure: `${host}-formula-preview-failure` }, async ({ page, errors }) => {
      // Wire native Copy buttons to read the untouched host <pre><code> text, and snapshot original code nodes.
      const nativeTexts = await page.evaluate(sel => {
        const cards = [...document.querySelectorAll(sel)];
        window.__prismNativeCodes = cards.map(card => card.querySelector('pre code'));
        window.__prismCopiedTexts = [];
        cards.forEach((card, index) => {
          const btn = card.querySelector('button[aria-label*="Copy" i]');
          if (btn) {
            btn.addEventListener('click', () => {
              window.__prismCopiedTexts[index] = card.querySelector('pre code')?.textContent || '';
            });
          }
        });
        return window.__prismNativeCodes.map(node => node.textContent);
      }, cardSel);
      assert.equal(nativeTexts.length, 6, `${engine} ${host}: expected 6 code cards in live fixture`);

      await injectExtension(page, suite, { waitFor: '.op-formula-preview' });
      await page.waitForFunction(() => document.querySelectorAll('.op-formula-preview').length === 4);
      await settle(page);

      const initialState = await page.evaluate(({ cardSel, hideSel }) => {
        const cards = [...document.querySelectorAll(cardSel)];
        return cards.map((card, index) => {
          const code = card.querySelector('pre code');
          const pre = card.querySelector('pre');
          const hideTarget = card.querySelector(hideSel);
          const preview = card.querySelector('.op-formula-preview');
          const toggle = card.querySelector('.op-formula-toggle');
          const segs = preview ? [...preview.querySelectorAll('.op-formula-segment')] : [];
          return {
            index,
            sameNode: code === window.__prismNativeCodes[index],
            text: code.textContent,
            hasPreview: Boolean(preview),
            previewOwned: preview?.hasAttribute('data-op-owned') || false,
            previewVisible: Boolean(preview && getComputedStyle(preview).display !== 'none'),
            mathCount: preview ? preview.querySelectorAll('math').length : 0,
            captions: preview ? [...preview.querySelectorAll('.op-formula-caption')].map(n => n.textContent) : [],
            segments: segs.map(s => ({
              hasMath: Boolean(s.querySelector('math')),
              fallback: s.querySelector('.op-formula-fallback')?.textContent ?? null
            })),
            toggleText: toggle?.textContent ?? null,
            toggleOwned: toggle?.hasAttribute('data-op-owned') || false,
            sourceHiddenAttr: hideTarget.getAttribute('data-op-formula-source-hidden'),
            sourceHiddenAttrHidden: hideTarget.hasAttribute('hidden'),
            sourceAriaHidden: hideTarget.getAttribute('aria-hidden'),
            sourceDisplay: getComputedStyle(hideTarget).display,
            foldBars: card.querySelectorAll('.op-code-fold-bar').length,
            isFolded: pre.classList.contains('op-code-folded')
          };
        });
      }, { cardSel, hideSel });

      // Card 0: ordinary JS block untouched
      assert.equal(initialState[0].hasPreview, false, `${engine} ${host}: ordinary JS block must not render Formula Preview`);
      assert.equal(initialState[0].toggleText, null, `${engine} ${host}: ordinary JS block has no formula toggle`);
      assert.notEqual(initialState[0].sourceDisplay, 'none');

      // Card 1: unlabeled Code snippet with % Chinese/English comments + aligned
      assert.equal(initialState[1].hasPreview, true);
      assert.equal(initialState[1].previewOwned, true);
      assert.equal(initialState[1].previewVisible, true);
      assert.ok(initialState[1].mathCount >= 2, `${engine} ${host}: unlabeled LaTeX renders >= 2 <math> nodes`);
      assert.deepEqual(initialState[1].captions, ['1. 目标函数 (Objective)', '2. 梯度更新推导']);
      assert.equal(initialState[1].toggleText, 'Source');
      assert.equal(initialState[1].toggleOwned, true);
      assert.equal(initialState[1].sourceHiddenAttr, 'true');
      assert.equal(initialState[1].sourceHiddenAttrHidden, false, 'must never set [hidden] on source container');
      assert.equal(initialState[1].sourceAriaHidden, null, 'must never set [aria-hidden] on source container');
      assert.equal(initialState[1].sourceDisplay, 'none');
      assert.equal(initialState[1].sameNode, true);
      assert.equal(initialState[1].text, nativeTexts[1]);

      // Native Copy button in Formula view still copies intact original LaTeX
      await page.locator(`${cardSel}`).nth(1).locator('button[aria-label*="Copy" i]').click();
      assert.equal(await page.evaluate(() => window.__prismCopiedTexts[1]), nativeTexts[1], `${engine} ${host}: native Copy in Formula view preserves original LaTeX`);

      // Card 2: explicit LaTeX
      assert.equal(initialState[2].hasPreview, true);
      assert.equal(initialState[2].mathCount, 1);
      assert.deepEqual(initialState[2].captions, ['欧拉恒等式']);

      // Card 3: partial error degrades only failing segment
      assert.equal(initialState[3].hasPreview, true);
      assert.equal(initialState[3].segments.length, 2);
      assert.equal(initialState[3].segments[0].hasMath, true);
      assert.equal(initialState[3].segments[0].fallback, null);
      assert.equal(initialState[3].segments[1].hasMath, false);
      assert.equal(initialState[3].segments[1].fallback, '\\frac{1}{');

      // Card 4: all-invalid stays silently as original Code Surface
      assert.equal(initialState[4].hasPreview, false, `${engine} ${host}: all-invalid block stays silently as Code Surface`);
      assert.equal(initialState[4].toggleText, null);
      assert.notEqual(initialState[4].sourceDisplay, 'none');

      // Card 5: 50-line LaTeX skips folding in Formula view
      assert.equal(initialState[5].hasPreview, true);
      assert.equal(initialState[5].foldBars, 0, `${engine} ${host}: 50-line block skips folding in Formula view`);
      assert.equal(initialState[5].isFolded, false);

      await page.screenshot({ path: path.join(artifacts, `${engine}-${host}-formula-preview.png`) });

      // Language toggle updates formula toggle button labels (en-US -> zh-CN)
      await patchConfig(page, { language: 'zh-CN' }, () => document.querySelectorAll('.op-formula-toggle')[0]?.textContent === '源码');

      // Context Vial token estimate before vs after toggling all blocks to Source view (both in zh-CN)
      const vialInFormula = await vialSnapshot(page);
      for (const idx of [1, 2, 3, 5]) {
        await page.locator(cardSel).nth(idx).locator('.op-formula-toggle').click();
      }
      await page.waitForFunction(() => [...document.querySelectorAll('.op-formula-toggle')].every(b => b.textContent === '公式'));

      // Source view checks on Card 1
      const sourceCheck = await page.evaluate(({ cardSel, hideSel }) => {
        const card = document.querySelectorAll(cardSel)[1];
        const hideTarget = card.querySelector(hideSel);
        const preview = card.querySelector('.op-formula-preview');
        return {
          sameNode: card.querySelector('pre code') === window.__prismNativeCodes[1],
          text: card.querySelector('pre code').textContent,
          sourceHiddenAttr: hideTarget.getAttribute('data-op-formula-source-hidden'),
          sourceDisplay: getComputedStyle(hideTarget).display,
          previewHidden: preview.hidden,
          previewDisplay: getComputedStyle(preview).display
        };
      }, { cardSel, hideSel });
      assert.equal(sourceCheck.sameNode, true);
      assert.equal(sourceCheck.text, nativeTexts[1]);
      assert.equal(sourceCheck.sourceHiddenAttr, null);
      assert.notEqual(sourceCheck.sourceDisplay, 'none');
      assert.equal(sourceCheck.previewHidden, true);
      assert.equal(sourceCheck.previewDisplay, 'none');

      // Force Context Vial recomputation (>750ms throttle window) in Source view
      await page.waitForTimeout(780);
      await page.evaluate(() => ObsidianPrismRuntime.refresh());
      await page.waitForTimeout(200);
      const vialInSource = await vialSnapshot(page);
      assert.equal(vialInSource.summary, vialInFormula.summary, `${engine} ${host}: Context Vial summary identical between Formula and Source views`);
      assert.equal(vialInSource.details['其中代码'], vialInFormula.details['其中代码'], `${engine} ${host}: Context Vial code tokens identical between Formula and Source views`);

      // Card 5 (50-line LaTeX): folds in Source view, unclips in Formula view, restores fold when toggling back to Source
      const card5 = page.locator(cardSel).nth(5);
      await card5.locator('.op-code-fold-bar').waitFor({ state: 'visible' });
      await card5.locator('.op-code-fold-bar').click();
      await page.waitForFunction(({ sel }) => document.querySelectorAll(sel)[5].querySelector('pre').classList.contains('op-code-folded'), { sel: cardSel });
      const foldedHeight = await card5.locator('pre').evaluate(pre => pre.getBoundingClientRect().height);
      assert.ok(foldedHeight <= 270, `${engine} ${host}: 50-line block folds in Source view (height ${foldedHeight})`);

      await card5.locator('.op-formula-toggle').click();
      await page.waitForFunction(({ sel }) => {
        const c = document.querySelectorAll(sel)[5];
        return !c.querySelector('pre').classList.contains('op-code-folded') && c.querySelectorAll('.op-code-fold-bar').length === 0;
      }, { sel: cardSel });

      await card5.locator('.op-formula-toggle').click();
      await page.waitForFunction(({ sel }) => {
        const c = document.querySelectorAll(sel)[5];
        return c.querySelector('pre').classList.contains('op-code-folded') && c.querySelectorAll('.op-code-fold-bar').length === 1;
      }, { sel: cardSel });

      // Restore all back to Formula view
      for (const idx of [1, 2, 3, 5]) {
        await page.locator(cardSel).nth(idx).locator('.op-formula-toggle').click();
      }
      await page.waitForFunction(() => [...document.querySelectorAll('.op-formula-toggle')].every(b => b.textContent === '源码'));

      // Streaming debounce (~280ms): rapid updates do not re-render immediately, then settle cleanly
      await page.evaluate(({ cardSel, host }) => {
        if (host === 'chatgpt') {
          document.querySelector('.assistant-turn')?.setAttribute('data-is-streaming', 'true');
        } else {
          const stopBtn = document.createElement('button');
          stopBtn.id = 'prism-test-stop-btn';
          stopBtn.setAttribute('data-test-id', 'stop-button');
          document.querySelector('chat-window')?.append(stopBtn);
        }
        const code = document.querySelectorAll(cardSel)[2].querySelector('pre code');
        code.textContent = '% 流式更新 1\nx_1 = \\frac{1}{2}';
      }, { cardSel, host });
      await page.waitForTimeout(55);
      await page.evaluate(sel => {
        document.querySelectorAll(sel)[2].querySelector('pre code').textContent = '% 流式更新 2\nx_2 = \\frac{1}{3}';
      }, cardSel);
      await page.waitForTimeout(55);
      await page.evaluate(sel => {
        document.querySelectorAll(sel)[2].querySelector('pre code').textContent = '% 流式收敛\n\\alpha^2 + \\beta^2 = \\gamma^2';
      }, cardSel);
      await page.waitForTimeout(80);
      const midStreamCaption = await page.locator(cardSel).nth(2).locator('.op-formula-caption').textContent();
      assert.equal(midStreamCaption, '欧拉恒等式', `${engine} ${host}: streaming updates debounce before re-rendering`);

      await page.evaluate(host => {
        if (host === 'chatgpt') document.querySelector('.assistant-turn')?.removeAttribute('data-is-streaming');
        else document.getElementById('prism-test-stop-btn')?.remove();
      }, host);
      await page.waitForFunction(sel => document.querySelectorAll(sel)[2].querySelector('.op-formula-caption')?.textContent === '流式收敛', cardSel, { timeout: 4000 });
      assert.equal(await page.locator(cardSel).nth(2).locator('.op-formula-preview math').count(), 1);

      // Native Palette ('host'): retains Formula Preview and inherits host foreground colors
      await patchConfig(page, { themeMode: 'dark', palette: 'host' }, () => document.documentElement.getAttribute('data-op-effective-palette') === 'host');
      await settle(page);
      const expectedHostColor = await page.evaluate(sel => getComputedStyle(document.querySelector(sel)).color, LIVE_SELECTORS[host].assistant);
      const hostPaletteSnap = await page.evaluate(sel => {
        const card = document.querySelectorAll(sel)[1];
        const preview = card.querySelector('.op-formula-preview');
        const toggle = card.querySelector('.op-formula-toggle');
        return {
          previewCount: document.querySelectorAll('.op-formula-preview').length,
          visible: getComputedStyle(preview).display !== 'none',
          hasMath: Boolean(preview.querySelector('math')),
          previewColor: getComputedStyle(preview).color,
          previewParentColor: getComputedStyle(preview.parentElement).color,
          previewBg: getComputedStyle(preview).backgroundColor,
          toggleColor: getComputedStyle(toggle).color,
          toggleParentColor: getComputedStyle(toggle.parentElement).color
        };
      }, cardSel);
      assert.equal(hostPaletteSnap.previewCount, 4, `${engine} ${host}: Native Palette retains Formula Preview`);
      assert.equal(hostPaletteSnap.visible, true);
      assert.equal(hostPaletteSnap.hasMath, true);
      assert.equal(hostPaletteSnap.previewColor, hostPaletteSnap.previewParentColor, `${engine} ${host}: Native Palette preview inherits parent foreground color`);
      assert.equal(hostPaletteSnap.previewColor, expectedHostColor, `${engine} ${host}: Native Palette preview matches host foreground color`);
      assert.equal(hostPaletteSnap.toggleColor, hostPaletteSnap.toggleParentColor, `${engine} ${host}: Native Palette toggle inherits header foreground color`);
      assert.match(hostPaletteSnap.previewBg, /^rgba\(0,\s*0,\s*0,\s*0\)$|^transparent$/);

      await patchConfig(page, { palette: 'obsidian' }, () => document.documentElement.getAttribute('data-op-effective-palette') === 'obsidian');
      await settle(page);

      // Hover feedback on .op-formula-toggle must not be overridden by header button !important border-color
      const toggleLocator = page.locator(cardSel).nth(1).locator('.op-formula-toggle');
      const baseBorder = await toggleLocator.evaluate(btn => getComputedStyle(btn).borderTopColor);
      await toggleLocator.hover();
      await page.waitForTimeout(180);
      const hoverBorder = await toggleLocator.evaluate(btn => getComputedStyle(btn).borderTopColor);
      assert.notEqual(hoverBorder, baseBorder, `${engine} ${host}: .op-formula-toggle:hover updates border-color instead of being overridden`);

      // User source mode survives transient incomplete-brace streaming updates without snapping back to preview
      await toggleLocator.click();
      await page.waitForFunction(sel => document.querySelectorAll(sel)[1].querySelector('.op-formula-toggle')?.getAttribute('data-formula-mode') === 'source', cardSel);
      await page.evaluate(({ cardSel, host }) => {
        if (host === 'chatgpt') document.querySelector('.assistant-turn')?.setAttribute('data-is-streaming', 'true');
        else {
          const stopBtn = document.createElement('button');
          stopBtn.id = 'prism-test-stop-btn';
          stopBtn.setAttribute('data-test-id', 'stop-button');
          document.querySelector('chat-window')?.append(stopBtn);
        }
        document.querySelectorAll(cardSel)[1].querySelector('pre code').textContent = '\\frac{1}{';
      }, { cardSel, host });
      await page.waitForTimeout(360);
      await page.evaluate(({ cardSel, host }) => {
        document.querySelectorAll(cardSel)[1].querySelector('pre code').textContent = '\\frac{1}{2} + \\sqrt{x}';
        if (host === 'chatgpt') document.querySelector('.assistant-turn')?.removeAttribute('data-is-streaming');
        else document.getElementById('prism-test-stop-btn')?.remove();
      }, { cardSel, host });
      await page.waitForFunction(sel => document.querySelectorAll(sel)[1].querySelector('.op-formula-toggle')?.getAttribute('data-formula-mode') === 'source' && Boolean(document.querySelectorAll(sel)[1].querySelector('.op-formula-preview math')), cardSel, { timeout: 4000 });
      const preservedMode = await page.evaluate(({ cardSel, hideSel }) => {
        const card = document.querySelectorAll(cardSel)[1];
        return {
          mode: card.querySelector('.op-formula-toggle')?.getAttribute('data-formula-mode'),
          sourceHidden: card.querySelector(hideSel)?.getAttribute('data-op-formula-source-hidden'),
          previewHidden: card.querySelector('.op-formula-preview')?.hidden
        };
      }, { cardSel, hideSel });
      assert.deepEqual(preservedMode, { mode: 'source', sourceHidden: null, previewHidden: true }, `${engine} ${host}: user source mode survives transient streaming syntax error`);
      await page.evaluate(({ cardSel, text }) => {
        document.querySelectorAll(cardSel)[1].querySelector('pre code').textContent = text;
      }, { cardSel, text: nativeTexts[1] });
      await page.waitForFunction(sel => document.querySelectorAll(sel)[1].querySelectorAll('.op-formula-preview math').length >= 2, cardSel, { timeout: 4000 });
      await toggleLocator.click();
      await page.waitForFunction(sel => document.querySelectorAll(sel)[1].querySelector('.op-formula-toggle')?.getAttribute('data-formula-mode') === 'preview', cardSel);

      // Headerless bare <pre> gets framed .op-formula-bar + .op-formula-preview borders
      await page.evaluate(sel => {
        const container = document.querySelector(sel);
        const pre = document.createElement('pre');
        pre.id = 'prism-temp-bare-pre';
        const code = document.createElement('code');
        code.className = 'language-latex';
        code.textContent = 'E = mc^2';
        pre.append(code);
        container.append(pre);
      }, LIVE_SELECTORS[host].assistant);
      await page.waitForSelector('.op-formula-bar[data-op-formula-bare="true"]');
      const bareFrame = await page.evaluate(() => {
        const bar = document.querySelector('.op-formula-bar[data-op-formula-bare="true"]');
        const preview = document.querySelector('.op-formula-preview[data-op-formula-bare="true"]');
        const barStyle = getComputedStyle(bar);
        const prevStyle = getComputedStyle(preview);
        return {
          barTopBorder: barStyle.borderTopWidth,
          barLeftBorder: barStyle.borderLeftWidth,
          prevLeftBorder: prevStyle.borderLeftWidth,
          prevBottomBorder: prevStyle.borderBottomWidth,
          prevTopBorder: prevStyle.borderTopWidth
        };
      });
      assert.deepEqual(bareFrame, {
        barTopBorder: '1px',
        barLeftBorder: '1px',
        prevLeftBorder: '1px',
        prevBottomBorder: '1px',
        prevTopBorder: '0px'
      }, `${engine} ${host}: bare headerless <pre> gets unified card border framing`);
      await page.evaluate(() => {
        document.querySelector('.op-formula-bar[data-op-formula-bare="true"]')?.remove();
        document.querySelector('.op-formula-preview[data-op-formula-bare="true"]')?.remove();
        document.getElementById('prism-temp-bare-pre')?.remove();
      });
      await page.waitForFunction(() => !document.querySelector('[data-op-formula-bare]') && ObsidianPrismRuntime.diagnostics().formulaBlocks === 4);

      // Disable formulaPreview setting: removes all Formula Preview UI, restores Code Surface & 48-line fold bar; re-enable restores cleanly
      await patchConfig(page, { formulaPreview: false }, () => document.documentElement.getAttribute('data-op-formula-preview') === 'false' && document.querySelectorAll('.op-formula-preview').length === 0);
      await settle(page);
      const disabledFormulaSnap = await page.evaluate(({ cardSel, hideSel }) => ({
        formulaBlocks: ObsidianPrismRuntime.diagnostics().formulaBlocks,
        previews: document.querySelectorAll('.op-formula-preview').length,
        toggles: document.querySelectorAll('.op-formula-toggle').length,
        bars: document.querySelectorAll('.op-formula-bar').length,
        hiddenAttrs: document.querySelectorAll('[data-op-formula-source-hidden]').length,
        allSourcesVisible: [...document.querySelectorAll(`${cardSel} ${hideSel}`)].every(n => getComputedStyle(n).display !== 'none'),
        nativeIdentitiesIntact: [...document.querySelectorAll(`${cardSel} pre code`)].every((node, i) => node === window.__prismNativeCodes[i]),
        card5FoldBars: document.querySelectorAll(cardSel)[5].querySelectorAll('.op-code-fold-bar').length
      }), { cardSel, hideSel });
      assert.deepEqual(disabledFormulaSnap, {
        formulaBlocks: 0, previews: 0, toggles: 0, bars: 0, hiddenAttrs: 0,
        allSourcesVisible: true, nativeIdentitiesIntact: true, card5FoldBars: 1
      }, `${engine} ${host}: formulaPreview: false restores original Code Surface and 48-line fold bar with zero residue`);

      // Unfold Card 5 while formulaPreview is false, then re-enable formulaPreview and verify clean restoration
      if (await card5.locator('pre').evaluate(pre => pre.classList.contains('op-code-folded'))) {
        await card5.locator('.op-code-fold-bar').click();
        await page.waitForFunction(({ sel }) => !document.querySelectorAll(sel)[5].querySelector('pre').classList.contains('op-code-folded'), { sel: cardSel });
      }
      await patchConfig(page, { formulaPreview: true }, () => document.documentElement.getAttribute('data-op-formula-preview') === 'true' && document.querySelectorAll('.op-formula-preview').length === 4);
      await settle(page);
      const restoredFormulaSnap = await page.evaluate(sel => ({
        formulaBlocks: ObsidianPrismRuntime.diagnostics().formulaBlocks,
        previews: document.querySelectorAll('.op-formula-preview').length,
        toggles: document.querySelectorAll('.op-formula-toggle').length,
        mathCards: [...document.querySelectorAll(sel)].filter(c => Boolean(c.querySelector('.op-formula-preview math'))).length,
        card5FoldBars: document.querySelectorAll(sel)[5].querySelectorAll('.op-code-fold-bar').length,
        card5Folded: document.querySelectorAll(sel)[5].querySelector('pre').classList.contains('op-code-folded')
      }), cardSel);
      assert.deepEqual(restoredFormulaSnap, {
        formulaBlocks: 4, previews: 4, toggles: 4, mathCards: 4, card5FoldBars: 0, card5Folded: false
      }, `${engine} ${host}: formulaPreview: true restores Formula Preview and removes fold bar cleanly`);

      // Disable ('enabled: false') and ObsidianPrismRuntime.stop(): zero residue
      await patchConfig(page, { enabled: false }, () => !document.documentElement.hasAttribute('data-op-enabled'));
      await settle(page);
      for (const label of ['disabled']) {
        const clean = await page.evaluate(({ cardSel, hideSel }) => ({
          owned: document.querySelectorAll('[data-op-owned]').length,
          previews: document.querySelectorAll('.op-formula-preview').length,
          toggles: document.querySelectorAll('.op-formula-toggle').length,
          bars: document.querySelectorAll('.op-formula-bar').length,
          hiddenAttrs: document.querySelectorAll('[data-op-formula-source-hidden]').length,
          allSourcesVisible: [...document.querySelectorAll(`${cardSel} ${hideSel}`)].every(n => getComputedStyle(n).display !== 'none')
        }), { cardSel, hideSel });
        assert.deepEqual(clean, { owned: 0, previews: 0, toggles: 0, bars: 0, hiddenAttrs: 0, allSourcesVisible: true }, `${engine} ${host}: ${label} leaves zero Formula Preview residue`);
      }

      await patchConfig(page, { enabled: true }, () => document.querySelectorAll('.op-formula-preview').length === 4);
      await page.evaluate(() => ObsidianPrismRuntime.stop());
      await settle(page);
      const stoppedClean = await page.evaluate(({ cardSel, hideSel }) => ({
        formulaBlocks: ObsidianPrismRuntime.diagnostics().formulaBlocks,
        owned: document.querySelectorAll('[data-op-owned]').length,
        previews: document.querySelectorAll('.op-formula-preview').length,
        toggles: document.querySelectorAll('.op-formula-toggle').length,
        bars: document.querySelectorAll('.op-formula-bar').length,
        hiddenAttrs: document.querySelectorAll('[data-op-formula-source-hidden]').length,
        allSourcesVisible: [...document.querySelectorAll(`${cardSel} ${hideSel}`)].every(n => getComputedStyle(n).display !== 'none'),
        nativeIdentitiesIntact: [...document.querySelectorAll(`${cardSel} pre code`)].every((node, i) => node === window.__prismNativeCodes[i])
      }), { cardSel, hideSel });
      assert.deepEqual(stoppedClean, {
        formulaBlocks: 0, owned: 0, previews: 0, toggles: 0, bars: 0, hiddenAttrs: 0,
        allSourcesVisible: true, nativeIdentitiesIntact: true
      }, `${engine} ${host}: stop() leaves zero Formula Preview residue`);

      assert.deepEqual(errors, []);
      console.log(`PASS ${engine} ${host} live fixture Formula Preview: MathML Core, captions, partial/full degradation, lossless toggle & Copy, 48-line fold sync, streaming debounce, Native Palette, Context Vial & zero-residue stop`);
    });
  }
}
