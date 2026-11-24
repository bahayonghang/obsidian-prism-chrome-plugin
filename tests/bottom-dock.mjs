/**
 * v0.4.0 #27: Bottom Dock singleton ownership handover, button typography/anti-squish,
 * zero-polling collision avoidance (corner floats, Composer Surface, Conversation Rail),
 * Context Vial popover containment, and clean disable/stop restoration.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { onLiveFixture, injectExtension, patchConfig, settle, LIVE_SELECTORS } from './live-fixtures.mjs';

const VIEWPORTS = [
  { width: 1707, height: 900 },
  { width: 1280, height: 900 },
  { width: 820, height: 900 }
];
const PRESETS = ['standard', 'wide', 'full'];
const COMPOSER_CARD = { chatgpt: '[data-composer-layout]', gemini: 'input-area-v2' };

function parseRgb(color) {
  const m = String(color || '').match(/[\d.]+/g);
  return m ? { r: Number(m[0]), g: Number(m[1]), b: Number(m[2]) } : null;
}
function luminance({ r, g, b }) {
  const c = [r, g, b].map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrastRatio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function rectsOverlap(a, b, tolerance = 0) {
  const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return ox > tolerance && oy > tolerance;
}

async function assertButtonTypographyAndContrast(page, label) {
  const info = await page.evaluate(() => {
    const dock = document.querySelector('#op-bottom-dock');
    const widthBtn = dock?.querySelector('.op-width-toggle');
    const vialBtn = dock?.querySelector('.op-vial-pill');
    const summary = vialBtn?.querySelector('.op-vial-summary');
    const tube = vialBtn?.querySelector('.op-vial-tube');
    if (!widthBtn || !vialBtn || !summary || !tube) return null;
    const read = el => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
        fontWeight: s.fontWeight,
        color: s.color,
        backgroundColor: s.backgroundColor,
        flexShrink: s.flexShrink,
        whiteSpace: s.whiteSpace,
        width: r.width,
        height: r.height,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth
      };
    };
    return { widthBtn: read(widthBtn), vialBtn: read(vialBtn), summary: read(summary), tube: read(tube) };
  });
  assert.ok(info, `${label}: width toggle and vial pill exist`);
  assert.equal(info.widthBtn.fontSize, '11px', `${label}: width toggle uses 11px font`);
  assert.equal(info.vialBtn.fontSize, '11px', `${label}: vial pill uses 11px font`);
  assert.equal(info.summary.fontSize, '11px', `${label}: vial summary uses 11px font`);
  assert.equal(info.widthBtn.lineHeight, info.summary.lineHeight, `${label}: lineHeight matches`);
  assert.ok(Math.abs(info.widthBtn.height - 38) <= 0.5, `${label}: width toggle height is 38px (got ${info.widthBtn.height})`);
  assert.ok(Math.abs(info.vialBtn.height - 38) <= 0.5, `${label}: vial pill height is 38px (got ${info.vialBtn.height})`);
  assert.equal(info.widthBtn.flexShrink, '0', `${label}: width toggle flexShrink is 0`);
  assert.equal(info.vialBtn.flexShrink, '0', `${label}: vial pill flexShrink is 0`);
  assert.equal(info.summary.flexShrink, '0', `${label}: vial summary flexShrink is 0`);
  assert.equal(info.tube.flexShrink, '0', `${label}: vial tube flexShrink is 0`);
  assert.equal(info.widthBtn.whiteSpace, 'nowrap', `${label}: width toggle never wraps`);
  assert.equal(info.summary.whiteSpace, 'nowrap', `${label}: vial summary never wraps`);
  assert.ok(info.widthBtn.scrollWidth <= info.widthBtn.clientWidth + 1, `${label}: width toggle text is not clipped`);
  assert.ok(info.tube.width >= 8.5, `${label}: vial tube is not squished (${info.tube.width}px)`);

  for (const [name, fgColor, bgColor] of [
    ['widthBtn', info.widthBtn.color, info.widthBtn.backgroundColor],
    ['vialSummary', info.summary.color, info.vialBtn.backgroundColor]
  ]) {
    const fg = parseRgb(fgColor);
    const bg = parseRgb(bgColor);
    assert.ok(fg && bg, `${label} ${name}: readable RGB colors`);
    const ratio = contrastRatio(fg, bg);
    assert.ok(ratio >= 4.5, `${label} ${name}: contrast ratio ${ratio.toFixed(2)} >= 4.5`);
  }
}

async function assertZeroOverlapAndHitTest(page, host, label) {
  const s = LIVE_SELECTORS[host];
  const trailingSelectors = host === 'chatgpt' ? [s.dictate, s.voice] : [s.mic];
  const geom = await page.evaluate(({ cardSel, cornerSel, trailingSelectors }) => {
    const box = node => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const hitOk = node => {
      if (!node) return false;
      const r = node.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return Boolean(hit && (hit === node || node.contains(hit)));
    };
    const dock = document.querySelector('#op-bottom-dock');
    const widthBtn = dock?.querySelector('.op-width-toggle');
    const vialBtn = dock?.querySelector('.op-vial-pill');
    const corner = document.querySelector(cornerSel);
    const composer = document.querySelector(cardSel);
    const rail = document.querySelector('#op-rail-root');
    return {
      composerRestyle: document.documentElement.getAttribute('data-op-composer'),
      vw: document.documentElement.clientWidth || window.innerWidth,
      vh: document.documentElement.clientHeight || window.innerHeight,
      dock: box(dock),
      corner: box(corner),
      composer: box(composer),
      rail: box(rail),
      trailing: trailingSelectors.map(sel => box(document.querySelector(sel))).filter(Boolean),
      hits: {
        corner: hitOk(corner),
        widthBtn: hitOk(widthBtn),
        vialBtn: hitOk(vialBtn),
        trailing: trailingSelectors.map(sel => {
          const node = document.querySelector(sel);
          if (!node) return { rect: null, hit: true, blockedByDock: false };
          const r = node.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return {
            rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
            hit: Boolean(hit && (hit === node || node.contains(hit))),
            blockedByDock: Boolean(hit && dock && (hit === dock || dock.contains(hit)))
          };
        })
      }
    };
  }, { cardSel: COMPOSER_CARD[host], cornerSel: s.cornerFloat, trailingSelectors });

  assert.ok(geom.dock, `${label}: #op-bottom-dock exists`);
  assert.ok(
    geom.dock.left >= 7.5 && geom.dock.right <= geom.vw - 7.5 && geom.dock.top >= 7.5 && geom.dock.bottom <= geom.vh - 7.5,
    `${label}: dock (${JSON.stringify(geom.dock)}) inside viewport [8..${geom.vw - 8}, 8..${geom.vh - 8}]`
  );
  assert.ok(geom.corner, `${label}: corner float button exists`);
  assert.equal(rectsOverlap(geom.dock, geom.corner, 0), false, `${label}: dock must not overlap corner float (${JSON.stringify(geom.dock)} vs ${JSON.stringify(geom.corner)})`);
  assert.ok(geom.composer, `${label}: composer card exists`);
  if (geom.composerRestyle === 'true') {
    const composerBottomGap = Math.round((geom.vh - geom.composer.bottom) * 10) / 10;
    assert.ok(composerBottomGap >= 3.5 && composerBottomGap <= 6.5, `${label}: lowered Composer Surface bottomGap sits in 4-6px range (got ${composerBottomGap}px)`);
  }
  assert.equal(rectsOverlap(geom.dock, geom.composer, 0), false, `${label}: dock must not overlap composer (${JSON.stringify(geom.dock)} vs ${JSON.stringify(geom.composer)})`);
  for (const [idx, ctrl] of geom.trailing.entries()) {
    assert.equal(rectsOverlap(geom.dock, ctrl, 0), false, `${label}: dock must not overlap trailing control #${idx}`);
  }
  for (const [idx, entry] of geom.hits.trailing.entries()) {
    assert.equal(entry.blockedByDock, false, `${label}: #op-bottom-dock must not intercept trailing control #${idx}`);
    if (entry.rect && !rectsOverlap(entry.rect, geom.corner, 0)) {
      assert.equal(entry.hit, true, `${label}: trailing control #${idx} is hit-testable`);
    }
  }
  if (geom.rail) {
    assert.equal(rectsOverlap(geom.dock, geom.rail, 0), false, `${label}: dock must not overlap rail (${JSON.stringify(geom.dock)} vs ${JSON.stringify(geom.rail)})`);
  }
  assert.equal(geom.hits.corner, true, `${label}: corner float button is hit-testable`);
  assert.equal(geom.hits.widthBtn, true, `${label}: width toggle is hit-testable`);
  assert.equal(geom.hits.vialBtn, true, `${label}: vial pill is hit-testable`);
}

async function assertPopoverInsideViewport(page, label) {
  await page.locator('#op-bottom-dock .op-vial-pill').click();
  await page.waitForFunction(() => {
    const p = document.querySelector('#op-bottom-dock .op-vial-popover');
    return p && !p.hidden;
  });
  await settle(page);
  const pop = await page.evaluate(() => {
    const dock = document.querySelector('#op-bottom-dock');
    const p = dock?.querySelector('.op-vial-popover');
    const r = p.getBoundingClientRect();
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      side: dock.getAttribute('data-op-popover-side'),
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
    };
  });
  assert.ok(
    pop.rect.left >= 0 && pop.rect.right <= pop.vw + 0.5 && pop.rect.top >= 0 && pop.rect.bottom <= pop.vh + 0.5,
    `${label}: popover (${JSON.stringify(pop.rect)}) fits strictly inside viewport ${pop.vw}x${pop.vh}`
  );
  await page.locator('#op-bottom-dock .op-vial-pill').click();
  await page.waitForFunction(() => document.querySelector('#op-bottom-dock .op-vial-popover')?.hidden === true);
  await settle(page);
  return pop;
}

const RUNTIME_SURFACE_ATTRS = [
  'data-op-main-surface', 'data-op-thread-column', 'data-op-composer-column', 'data-op-code-surface',
  'data-op-code-header', 'data-op-code-icon-fill', 'data-op-code-icon-stroke',
  'data-op-composer-dock', 'data-op-composer-overlaid', 'data-op-composer-scrim', 'data-op-thread-scroller', 'data-op-scroller-fade',
  'data-op-composer-empty-sibling', 'data-op-composer-disclaimer', 'data-op-thread-spacer',
  'data-op-composer-surface', 'data-op-composer-grid', 'data-op-composer-header-empty', 'data-op-composer-leading', 'data-op-composer-primary',
  'data-op-composer-trailing', 'data-op-composer-toolbar', 'data-op-composer-add', 'data-op-model-capsule',
  'data-op-model-capsule-item', 'data-op-composer-primary-action', 'data-op-composer-attachment',
  'data-op-composer-chip', 'data-op-composer-backdrop', 'data-op-sidebar-surface', 'data-op-sidebar-active'
];
const RUNTIME_ROOT_VARS = [
  '--op-reading-width', '--op-reading-shift', '--op-dock-clearance', '--op-scroller-fade-start', '--op-scroller-fade-end', '--op-dock-offset-x', '--op-dock-offset-y'
];

async function assertNoRuntimeResidue(page, label) {
  const residue = await page.evaluate(({ attrs, vars }) => ({
    docks: document.querySelectorAll('#op-bottom-dock, [data-op-owned]').length,
    hasInstance: document.documentElement.hasAttribute('data-op-instance'),
    hasEnabled: document.documentElement.hasAttribute('data-op-enabled'),
    surfaceMarks: Object.fromEntries(attrs.map(attr => [attr, document.querySelectorAll(`[${attr}="true"]`).length]).filter(([, n]) => n > 0)),
    rootVars: Object.fromEntries(vars.map(v => [v, document.documentElement.style.getPropertyValue(v)]).filter(([, val]) => val !== ''))
  }), { attrs: RUNTIME_SURFACE_ATTRS, vars: RUNTIME_ROOT_VARS });
  assert.deepEqual(
    residue,
    { docks: 0, hasInstance: false, hasEnabled: false, surfaceMarks: {}, rootVars: {} },
    `${label}: leaves zero owned nodes, data-op-instance, surface marks, or runtime root vars`
  );
}

async function verifySingletonAndHandover(page, suite, host, s) {
  const { engine, scripts } = suite;
  const contentScript = scripts[scripts.length - 1];

  // 1. Pre-seed orphan extension roots BEFORE injecting the runtime.
  await page.evaluate(mainSelector => {
    const main = document.querySelector(mainSelector);
    const addOrphan = (parent, tag, id, cls) => {
      const el = document.createElement(tag);
      if (id) el.id = id;
      el.className = cls;
      el.setAttribute('data-op-owned', '');
      el.textContent = 'orphan-stale';
      parent.append(el);
    };
    addOrphan(document.body, 'aside', 'op-bottom-dock', 'op-dock');
    addOrphan(document.body, 'aside', '', 'op-dock');
    addOrphan(document.body, 'aside', 'op-rail-root', 'op-rail');
    addOrphan(main, 'div', 'op-ambient-stage', 'op-ambient');
  }, s.main);

  await injectExtension(page, suite, { waitFor: '#op-bottom-dock' });
  await patchConfig(page, { contentWidth: 'full' }, () => document.documentElement.getAttribute('data-op-content-width') === 'full');
  await settle(page);

  const firstId = await page.evaluate(() => document.documentElement.getAttribute('data-op-instance'));
  assert.ok(firstId && firstId.startsWith('op-'), `${engine} ${host}: activation sets data-op-instance`);
  assert.equal(await page.locator('#op-bottom-dock').count(), 1, `${engine} ${host}: orphan dock pruned`);
  assert.equal(await page.locator('.op-dock[data-op-owned]').count(), 1);
  assert.equal(await page.locator('#op-rail-root').count(), 1, `${engine} ${host}: orphan rail pruned`);
  assert.equal(await page.locator('#op-ambient-stage').count(), 1, `${engine} ${host}: orphan ambient pruned`);
  assert.ok(await page.evaluate(() => Boolean(document.documentElement.style.getPropertyValue('--op-reading-width'))), `${engine} ${host}: reading width var active before handover`);

  // 2. Re-inject a second runtime instance (simulating extension reload / double injection).
  await page.evaluate(() => { delete window.ObsidianPrismRuntime; });
  await page.addScriptTag({ content: contentScript });
  await page.waitForFunction(prev => {
    const cur = document.documentElement.getAttribute('data-op-instance');
    return Boolean(cur && cur !== prev && window.ObsidianPrismRuntime?.diagnostics().enabled);
  }, firstId);
  await settle(page);

  assert.equal(await page.locator('#op-bottom-dock').count(), 1, `${engine} ${host}: strictly 1 dock after handover`);
  assert.equal(await page.locator('#op-bottom-dock:visible').count(), 1);
  assert.equal(await page.locator('#op-rail-root').count(), 1, `${engine} ${host}: strictly 1 rail after handover`);
  assert.equal(await page.locator('#op-ambient-stage').count(), 1, `${engine} ${host}: strictly 1 ambient after handover`);
  assert.equal(await page.locator('.op-code-fold-bar').count(), 0, `${engine} ${host}: no duplicate fold bars`);

  // Wait 300ms to assert zero observer loop.
  const passesBefore = await page.evaluate(() => window.ObsidianPrismRuntime.diagnostics().passes);
  await page.waitForTimeout(300);
  const passesAfter = await page.evaluate(() => window.ObsidianPrismRuntime.diagnostics().passes);
  assert.equal(passesAfter, passesBefore, `${engine} ${host}: zero observer ping-pong after handover`);

  // Disable immediately after handover -> zero surface marks & zero runtime root vars remain.
  await patchConfig(page, { enabled: false }, () => !document.documentElement.hasAttribute('data-op-enabled'));
  await settle(page);
  await assertNoRuntimeResidue(page, `${engine} ${host} post-handover disable`);

  // Re-enable cleanly for matrix & typography assertions.
  await patchConfig(page, { enabled: true, contentWidth: 'standard' }, () => document.querySelector('#op-bottom-dock'));
  await settle(page);
}

export async function checkBottomDock(suite) {
  const { engine, artifacts } = suite;

  for (const host of ['chatgpt', 'gemini']) {
    const s = LIVE_SELECTORS[host];
    await onLiveFixture(suite, host, { failure: `${host}-bottom-dock-failure`, colorScheme: 'dark' }, async ({ page, errors }) => {
      const nativeBottomGap = await page.evaluate(sel => {
        const c = document.querySelector(sel);
        return Math.round((window.innerHeight - c.getBoundingClientRect().bottom) * 10) / 10;
      }, COMPOSER_CARD[host]);
      await verifySingletonAndHandover(page, suite, host, s);

      // 3. Button typography, anti-squish & contrast (dark obsidian + light crystal).
      await assertButtonTypographyAndContrast(page, `${engine} ${host} obsidian`);
      await patchConfig(page, { themeMode: 'light', lightPreset: 'crystal' }, () => document.documentElement.getAttribute('data-op-effective-palette') === 'crystal');
      await assertButtonTypographyAndContrast(page, `${engine} ${host} crystal`);
      await patchConfig(page, { themeMode: 'dark', palette: 'obsidian' }, () => document.documentElement.getAttribute('data-op-effective-palette') === 'obsidian');

      // Attach click spy on .host-corner-help to confirm both host corner help and dock buttons are genuinely clickable.
      await page.evaluate(sel => {
        window.__cornerHelpClicks = 0;
        document.querySelector(sel).addEventListener('click', () => { window.__cornerHelpClicks++; });
      }, s.cornerFloat);

      // 4. Non-overlap invariant matrix across presets x viewports.
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize(viewport);
        await settle(page);
        for (const preset of PRESETS) {
          await patchConfig(page, { contentWidth: preset });
          await page.waitForFunction(value => document.documentElement.getAttribute('data-op-content-width') === value, preset);
          await settle(page);
          const label = `${engine} ${host} ${viewport.width}x${viewport.height} ${preset}`;
          await assertZeroOverlapAndHitTest(page, host, label);
          await page.locator(s.cornerFloat).click();
          if (viewport.width === 1280 || viewport.width === 820) {
            await assertPopoverInsideViewport(page, label);
          }
        }
        // Anti-squish holds at narrow 820px viewport too.
        if (viewport.width === 820) {
          await assertButtonTypographyAndContrast(page, `${engine} ${host} 820px`);
        }
      }
      assert.equal(await page.evaluate(() => window.__cornerHelpClicks), VIEWPORTS.length * PRESETS.length, `${engine} ${host}: every corner help click succeeded`);

      // Interactive width toggle click still works when lifted above composer!
      await page.setViewportSize({ width: 1280, height: 900 });
      await patchConfig(page, { contentWidth: 'standard' }, () => document.documentElement.getAttribute('data-op-content-width') === 'standard');
      await page.locator('#op-bottom-dock .op-width-toggle').click();
      await page.waitForFunction(() => document.documentElement.getAttribute('data-op-content-width') === 'wide');
      await settle(page);
      await assertZeroOverlapAndHitTest(page, host, `${engine} ${host} 1280x900 clicked->wide`);

      // 5. Tall Conversation Rail + lifted-above-composer simultaneous avoidance + popover containment.
      await patchConfig(page, { contentWidth: 'full' }, () => document.documentElement.getAttribute('data-op-content-width') === 'full');
      await page.setViewportSize({ width: 820, height: 900 });
      await page.evaluate(host => {
        const container = document.querySelector(host === 'chatgpt' ? '[class*="transcriptContent"]' : '.conversation-container');
        const firstUser = document.querySelector(host === 'chatgpt' ? '[data-turn-key]:has([data-user-message-bubble])' : 'user-query');
        for (let i = 0; i < 16; i++) {
          const clone = firstUser.cloneNode(true);
          clone.querySelector(host === 'chatgpt' ? '[data-user-message-bubble]' : '.query-text-line').textContent = `Extra synthetic question ${i + 1}`;
          container.append(clone);
        }
      }, host);
      await page.waitForFunction(() => document.querySelectorAll('#op-rail-root .op-rail-tick').length >= 16);
      await settle(page);
      await assertZeroOverlapAndHitTest(page, host, `${engine} ${host} 820x900 tall-rail full`);
      await assertPopoverInsideViewport(page, `${engine} ${host} 820x900 tall-rail popover`);
      await page.screenshot({ path: path.join(artifacts, `${engine}-${host}-bottom-dock-avoidance.png`) });

      // Short viewport + tall multi-line composer forces dock near top so popover flips below without overflowing viewport.
      await page.setViewportSize({ width: 820, height: 500 });
      await page.evaluate(editorSel => {
        const editor = document.querySelector(editorSel);
        if (editor) editor.style.minHeight = '210px';
      }, s.editor);
      await page.evaluate(() => window.ObsidianPrismRuntime.refresh());
      await page.waitForTimeout(200);
      await settle(page);
      await assertZeroOverlapAndHitTest(page, host, `${engine} ${host} 820x500 short-viewport`);
      const flipped = await assertPopoverInsideViewport(page, `${engine} ${host} 820x500 short-viewport popover`);
      assert.equal(flipped.side, 'below', `${engine} ${host}: popover flips below when clipped at top`);
      await page.evaluate(editorSel => {
        const editor = document.querySelector(editorSel);
        if (editor) editor.style.removeProperty('min-height');
      }, s.editor);

      // 5b. Toggling composerRestyle: false restores native composer position & updates Bottom Dock offset cleanly.
      await page.setViewportSize({ width: 1280, height: 900 });
      await patchConfig(page, { contentWidth: 'full' }, () => document.documentElement.getAttribute('data-op-content-width') === 'full');
      await settle(page);
      await page.waitForTimeout(80);
      await assertZeroOverlapAndHitTest(page, host, `${engine} ${host} 1280x900 before composerRestyle:false`);
      await patchConfig(page, { composerRestyle: false }, () => document.documentElement.getAttribute('data-op-composer') === 'false');
      await page.waitForTimeout(80);
      await settle(page);
      const unstyledGap = await page.evaluate(sel => {
        const c = document.querySelector(sel);
        return Math.round((window.innerHeight - c.getBoundingClientRect().bottom) * 10) / 10;
      }, COMPOSER_CARD[host]);
      assert.ok(Math.abs(unstyledGap - nativeBottomGap) <= 1.0, `${engine} ${host}: composerRestyle: false restores native composer bottomGap (${unstyledGap} vs ${nativeBottomGap})`);
      await assertZeroOverlapAndHitTest(page, host, `${engine} ${host} 1280x900 composerRestyle:false`);
      await patchConfig(page, { composerRestyle: true }, () => document.documentElement.getAttribute('data-op-composer') === 'true');
      await page.waitForTimeout(80);
      await settle(page);
      await assertZeroOverlapAndHitTest(page, host, `${engine} ${host} 1280x900 composerRestyle:true restored`);

      // 6. Disable extension -> zero nodes, zero data-op-instance, zero surface marks, zero root CSS variables.
      await page.setViewportSize({ width: 1280, height: 900 });
      await patchConfig(page, { enabled: false }, () => !document.documentElement.hasAttribute('data-op-enabled'));
      await settle(page);
      await assertNoRuntimeResidue(page, `${engine} ${host} disable`);
      const disabledGap = await page.evaluate(sel => Math.round((window.innerHeight - document.querySelector(sel).getBoundingClientRect().bottom) * 10) / 10, COMPOSER_CARD[host]);
      assert.ok(Math.abs(disabledGap - nativeBottomGap) <= 1.0, `${engine} ${host}: disable restores native bottomGap (${disabledGap} vs ${nativeBottomGap})`);

      // Re-enable -> stop() also removes everything with zero residue and restores native composer position.
      await patchConfig(page, { enabled: true, contentWidth: 'full' }, () => document.querySelector('#op-bottom-dock'));
      await settle(page);
      await page.evaluate(() => window.ObsidianPrismRuntime.stop());
      await settle(page);
      await assertNoRuntimeResidue(page, `${engine} ${host} stop()`);
      const stoppedGap = await page.evaluate(sel => Math.round((window.innerHeight - document.querySelector(sel).getBoundingClientRect().bottom) * 10) / 10, COMPOSER_CARD[host]);
      assert.ok(Math.abs(stoppedGap - nativeBottomGap) <= 1.0, `${engine} ${host}: stop() restores native bottomGap (${stoppedGap} vs ${nativeBottomGap})`);

      assert.deepEqual(errors, []);
      console.log(`PASS ${engine} ${host} bottom dock: singleton handover, typography/anti-squish, zero-overlap matrix (1707/1280/820 x standard/wide/full + 820x500), composerRestyle restore, popover containment & clean teardown`);
    });
  }
}
