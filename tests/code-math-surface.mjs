/**
 * v0.4.1 #33: Gemini double-nested Code Surface layout/icon contrast and Gemini + ChatGPT Native Math Surface
 * readability & horizontal overflow containment across all 4 optical palettes and reversible restoration.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { onLiveFixture, injectExtension, patchConfig, settle, LIVE_SELECTORS } from './live-fixtures.mjs';

const PALETTES = [
  { name: 'obsidian', patch: { themeMode: 'dark', palette: 'obsidian' } },
  { name: 'warm', patch: { themeMode: 'dark', palette: 'warm' } },
  { name: 'crystal', patch: { themeMode: 'light', lightPreset: 'crystal' } },
  { name: 'alabaster', patch: { themeMode: 'light', lightPreset: 'alabaster' } }
];

const parseColor = value => {
  const text = String(value || '').trim();
  if (!text || text === 'none') return null;
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (/^#[0-9a-f]{3,8}$/i.test(text)) {
    const hex = text.length <= 5 ? [...text.slice(1)].map(c => c + c).join('') : text.slice(1);
    const n = hex.match(/../g).map(part => parseInt(part, 16));
    return { r: n[0], g: n[1], b: n[2], a: n.length > 3 ? n[3] / 255 : 1 };
  }
  const srgb = text.match(/^color\(srgb\s+([^)]+)\)$/);
  if (srgb) {
    const [rgb, alpha] = srgb[1].split('/');
    const [r, g, b] = rgb.trim().split(/\s+/).map(v => Number(v) * 255);
    return { r, g, b, a: alpha === undefined ? 1 : Number(alpha) };
  }
  const rgb = text.match(/^rgba?\(([^)]+)\)$/);
  if (!rgb) return null;
  const [r, g, b, a = 1] = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r, g, b, a };
};

const luminance = ({ r, g, b }) => {
  const ch = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};

const contrastRatio = (fg, bg) => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};

function assertContrast(fgRaw, bgRaw, label) {
  const fg = parseColor(fgRaw);
  const bg = parseColor(bgRaw);
  assert.ok(fg && fg.a === 1, `${label}: expected opaque foreground color, got "${fgRaw}"`);
  assert.ok(bg && bg.a === 1, `${label}: expected opaque background color, got "${bgRaw}"`);
  const ratio = contrastRatio(fg, bg);
  assert.ok(ratio >= 4.5, `${label}: contrast ${ratio.toFixed(2)}:1 < 4.5:1 (${fgRaw} on ${bgRaw})`);
}

async function captureSurfaceState(page, host) {
  return page.evaluate(({ host, s }) => {
    const parseCss = value => {
      const text = String(value || '').trim();
      const srgb = text.match(/^color\(srgb\s+([^)]+)\)$/);
      if (srgb) {
        const [rgb, alpha] = srgb[1].split('/');
        const [r, g, b] = rgb.trim().split(/\s+/).map(v => Number(v) * 255);
        return { r, g, b, a: alpha === undefined ? 1 : Number(alpha) };
      }
      const rgb = text.match(/^rgba?\(([^)]+)\)$/);
      if (!rgb) return { r: 0, g: 0, b: 0, a: 0 };
      const [r, g, b, a = 1] = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r, g, b, a };
    };
    const compositeBg = node => {
      const layers = [];
      for (let el = node; el; el = el.parentElement) {
        const layer = parseCss(getComputedStyle(el).backgroundColor);
        if (layer.a > 0) layers.push(layer);
        if (layer.a >= 1) break;
      }
      let out = { r: 255, g: 255, b: 255 };
      for (const layer of layers.reverse()) {
        out = {
          r: layer.r * layer.a + out.r * (1 - layer.a),
          g: layer.g * layer.a + out.g * (1 - layer.a),
          b: layer.b * layer.a + out.b * (1 - layer.a)
        };
      }
      return `rgb(${Math.round(out.r)}, ${Math.round(out.g)}, ${Math.round(out.b)})`;
    };

    const columnNode = document.querySelector(host === 'gemini' ? `${s.assistant} > p` : s.assistant);
    const columnRect = columnNode.getBoundingClientRect();
    const scroller = document.querySelector(s.scroller);

    const katexDisplay = document.querySelector('.katex-display');
    const katexDisplayRect = katexDisplay.getBoundingClientRect();
    const katexDisplayStyle = getComputedStyle(katexDisplay);
    const displayKatex = katexDisplay.querySelector('.katex');
    const displayKatexRect = displayKatex.getBoundingClientRect();
    const displayKatexStyle = getComputedStyle(displayKatex);

    const inlineKatex = document.querySelector(`${s.assistant} p .katex`);
    const inlineKatexStyle = getComputedStyle(inlineKatex);

    const math = {
      display: {
        color: displayKatexStyle.color,
        backdrop: compositeBg(displayKatex),
        backgroundColor: katexDisplayStyle.backgroundColor,
        innerBackgroundColor: displayKatexStyle.backgroundColor,
        overflowX: katexDisplayStyle.overflowX,
        scrollWidth: katexDisplay.scrollWidth,
        clientWidth: katexDisplay.clientWidth,
        left: katexDisplayRect.left,
        right: katexDisplayRect.right,
        innerRight: displayKatexRect.right
      },
      inline: {
        color: inlineKatexStyle.color,
        backdrop: compositeBg(inlineKatex),
        backgroundColor: inlineKatexStyle.backgroundColor
      },
      columnLeft: columnRect.left,
      columnRight: columnRect.right,
      scrollerOverflow: scroller.scrollWidth > scroller.clientWidth + 1
    };

    if (host === 'gemini') {
      const mathBlock = document.querySelector('.math-block');
      const mathBlockRect = mathBlock.getBoundingClientRect();
      const mathBlockStyle = getComputedStyle(mathBlock);
      const mathInline = document.querySelector('.math-inline');
      const mathInlineStyle = getComputedStyle(mathInline);
      math.blockShell = {
        color: mathBlockStyle.color,
        backgroundColor: mathBlockStyle.backgroundColor,
        right: mathBlockRect.right
      };
      math.inlineShell = {
        color: mathInlineStyle.color,
        backgroundColor: mathInlineStyle.backgroundColor
      };
    }

    let code = null;
    if (host === 'gemini') {
      const outer = document.querySelector('code-block');
      const outerStyle = getComputedStyle(outer);
      const inner = outer.querySelector('.code-block');
      const innerStyle = getComputedStyle(inner);
      const innerRect = inner.getBoundingClientRect();
      const header = inner.querySelector('.code-block-decoration');
      const headerStyle = getComputedStyle(header);
      const headerRect = header.getBoundingClientRect();
      const labelEl = header.querySelector('span');
      const matIcon = header.querySelector('mat-icon');
      const svg = header.querySelector('svg');
      const svgPath = svg.querySelector('path');
      code = {
        outer: {
          display: outerStyle.display,
          borderTopWidth: outerStyle.borderTopWidth,
          borderLeftWidth: outerStyle.borderLeftWidth,
          paddingTop: outerStyle.paddingTop,
          clientRectsCount: outer.getClientRects().length,
          hasCodeSurfaceAttr: outer.hasAttribute('data-op-code-surface')
        },
        inner: {
          codeSurfaceAttr: inner.getAttribute('data-op-code-surface'),
          backgroundColor: innerStyle.backgroundColor,
          borderTopWidth: innerStyle.borderTopWidth,
          borderRightWidth: innerStyle.borderRightWidth,
          borderBottomWidth: innerStyle.borderBottomWidth,
          borderLeftWidth: innerStyle.borderLeftWidth,
          outlineWidth: innerStyle.outlineWidth,
          outlineStyle: innerStyle.outlineStyle,
          overflow: innerStyle.overflow,
          overflowX: innerStyle.overflowX,
          overflowY: innerStyle.overflowY,
          top: innerRect.top
        },
        header: {
          codeHeaderAttr: header.getAttribute('data-op-code-header'),
          backgroundColor: headerStyle.backgroundColor,
          position: headerStyle.position,
          top: headerRect.top,
          labelColor: getComputedStyle(labelEl).color,
          matIconColor: getComputedStyle(matIcon).color,
          svgFill: getComputedStyle(svg).fill,
          svgFillAttr: svg.getAttribute('data-op-code-icon-fill'),
          svgStrokeAttr: svg.getAttribute('data-op-code-icon-stroke'),
          pathFill: getComputedStyle(svgPath).fill,
          pathFillAttr: svgPath.getAttribute('data-op-code-icon-fill'),
          pathStrokeAttr: svgPath.getAttribute('data-op-code-icon-stroke')
        }
      };
    }

    const residualMarks = document.querySelectorAll(
      '[data-op-code-surface="true"],[data-op-code-header="true"],[data-op-code-icon-fill="true"],[data-op-code-icon-stroke="true"]'
    ).length;

    return { math, code, residualMarks };
  }, { host, s: LIVE_SELECTORS[host] });
}

export async function checkCodeAndNativeMathSurfaces(suite) {
  const { engine, artifacts } = suite;
  for (const host of ['gemini', 'chatgpt']) {
    await onLiveFixture(suite, host, { failure: `${host}-code-math-surface-failure` }, async ({ page, errors }) => {
      const nativeSnap = await captureSurfaceState(page, host);
      if (host === 'gemini') {
        assert.equal(nativeSnap.code.outer.display, 'inline', `${engine} gemini native: outer <code-block> starts inline`);
        assert.ok(nativeSnap.code.outer.clientRectsCount > 1, `${engine} gemini native: inline outer <code-block> splits client rects`);
      }
      assert.ok(nativeSnap.math.display.innerRight > nativeSnap.math.columnRight + 1, `${engine} ${host} native: wide display math overflows reading column`);

      await injectExtension(page, suite);

      for (const pal of PALETTES) {
        const label = `${engine} ${host} ${pal.name}`;
        await patchConfig(page, pal.patch);
        await page.waitForFunction(name => document.documentElement.getAttribute('data-op-effective-palette') === name, pal.name);
        await page.waitForTimeout(30);
        await settle(page);

        const snap = await captureSurfaceState(page, host);
        if (host === 'gemini') {
          const { outer, inner, header } = snap.code;
          assert.equal(outer.display, 'block', `${label}: outer <code-block> must be display:block`);
          assert.equal(outer.borderTopWidth, '0px', `${label}: outer <code-block> has zero top border`);
          assert.equal(outer.borderLeftWidth, '0px', `${label}: outer <code-block> has zero left border`);
          assert.equal(outer.paddingTop, '0px', `${label}: outer <code-block> has zero top padding`);
          assert.equal(outer.clientRectsCount, 1, `${label}: outer <code-block> has single client rect`);
          assert.equal(outer.hasCodeSurfaceAttr, false, `${label}: outer <code-block> does not carry data-op-code-surface`);

          assert.equal(inner.codeSurfaceAttr, 'true', `${label}: inner .code-block carries data-op-code-surface="true"`);
          assert.equal(inner.borderTopWidth, '1px', `${label}: inner .code-block has 1px top border`);
          assert.equal(inner.borderRightWidth, '1px', `${label}: inner .code-block has 1px right border`);
          assert.equal(inner.borderBottomWidth, '1px', `${label}: inner .code-block has 1px bottom border`);
          assert.equal(inner.borderLeftWidth, '1px', `${label}: inner .code-block has 1px left border`);
          assert.ok(inner.outlineStyle === 'none' || inner.outlineWidth === '0px', `${label}: inner .code-block has no duplicate outline`);
          assert.notEqual(inner.overflow, 'hidden', `${label}: inner .code-block must not clip sticky header`);
          assert.notEqual(inner.overflowX, 'hidden', `${label}: inner .code-block overflow-x must not be hidden`);
          assert.notEqual(inner.overflowY, 'hidden', `${label}: inner .code-block overflow-y must not be hidden`);

          assert.equal(header.codeHeaderAttr, 'true', `${label}: header carries data-op-code-header="true"`);
          assert.equal(header.position, 'sticky', `${label}: header remains sticky`);
          assert.ok(Math.abs(header.top - (inner.top + 1)) <= 1.5, `${label}: sticky header top (${header.top}) is flush with card top+1 (${inner.top + 1})`);

          assertContrast(header.labelColor, header.backgroundColor, `${label} header label`);
          assertContrast(header.matIconColor, header.backgroundColor, `${label} header mat-icon`);
          assertContrast(header.svgFill, header.backgroundColor, `${label} header filled svg`);
          assertContrast(header.pathFill, header.backgroundColor, `${label} header filled path`);
          assert.equal(header.svgFillAttr, 'true', `${label}: filled svg marked with data-op-code-icon-fill`);
          assert.equal(header.svgStrokeAttr, null, `${label}: filled svg without stroke not marked for stroke`);
          assert.equal(header.pathFillAttr, 'true', `${label}: filled path marked with data-op-code-icon-fill`);
          assert.equal(header.pathStrokeAttr, null, `${label}: filled path without stroke not marked for stroke`);
        }

        const { math } = snap;
        assertContrast(math.display.color, math.display.backdrop, `${label} display math`);
        assertContrast(math.inline.color, math.inline.backdrop, `${label} inline math`);
        assert.equal(parseColor(math.display.backgroundColor)?.a, 0, `${label}: display math container clears background slab`);
        assert.equal(parseColor(math.display.innerBackgroundColor)?.a, 0, `${label}: display .katex clears background slab`);
        assert.equal(parseColor(math.inline.backgroundColor)?.a, 0, `${label}: inline .katex clears background slab`);
        if (host === 'gemini') {
          assertContrast(math.blockShell.color, math.display.backdrop, `${label} .math-block`);
          assertContrast(math.inlineShell.color, math.inline.backdrop, `${label} .math-inline`);
          assert.equal(parseColor(math.blockShell.backgroundColor)?.a, 0, `${label}: .math-block clears background slab`);
          assert.equal(parseColor(math.inlineShell.backgroundColor)?.a, 0, `${label}: .math-inline clears background slab`);
          assert.ok(math.blockShell.right <= math.columnRight + 1, `${label}: .math-block (${math.blockShell.right}) stays within reading column (${math.columnRight})`);
        }
        assert.equal(math.display.overflowX, 'auto', `${label}: display math allows horizontal scroll`);
        assert.ok(math.display.scrollWidth > math.display.clientWidth, `${label}: ultra-wide display math scrolls internally (${math.display.scrollWidth} > ${math.display.clientWidth})`);
        assert.ok(math.display.right <= math.columnRight + 1, `${label}: display math (${math.display.right}) stays within reading column (${math.columnRight})`);
        assert.equal(math.scrollerOverflow, false, `${label}: ultra-wide display math never overflows conversation scroller`);
      }

      await page.screenshot({ path: path.join(artifacts, `${engine}-${host}-code-math-alabaster.png`) });

      // Native Palette ('host'): restores 100% of native styles and leaves zero surface/icon marks.
      await patchConfig(page, { themeMode: 'dark', palette: 'host' }, () => document.documentElement.getAttribute('data-op-effective-palette') === 'host');
      await page.waitForTimeout(30);
      await settle(page);
      const hostSnap = await captureSurfaceState(page, host);
      assert.equal(hostSnap.residualMarks, 0, `${engine} ${host}: Native Palette leaves zero code/icon marks`);
      assert.equal(hostSnap.math.display.color, nativeSnap.math.display.color, `${engine} ${host}: Native Palette restores display math color`);
      assert.equal(hostSnap.math.display.backgroundColor, nativeSnap.math.display.backgroundColor, `${engine} ${host}: Native Palette restores display math background`);
      assert.equal(hostSnap.math.display.overflowX, nativeSnap.math.display.overflowX, `${engine} ${host}: Native Palette restores display math overflow`);
      assert.equal(hostSnap.math.inline.color, nativeSnap.math.inline.color, `${engine} ${host}: Native Palette restores inline math color`);
      assert.equal(hostSnap.math.inline.backgroundColor, nativeSnap.math.inline.backgroundColor, `${engine} ${host}: Native Palette restores inline math background`);
      if (host === 'gemini') {
        assert.deepEqual(
          { ...hostSnap.code, header: { ...hostSnap.code.header, position: nativeSnap.code.header.position } },
          nativeSnap.code,
          `${engine} gemini: Native Palette restores 100% of native code surface colors, layout, and icon styles`
        );
      }

      // Re-theme then disable ('enabled: false') and stop(): restores 100% of native styles with zero residue.
      await patchConfig(page, { palette: 'obsidian' });
      await page.waitForFunction(() => document.documentElement.getAttribute('data-op-effective-palette') === 'obsidian');
      await patchConfig(page, { enabled: false });
      await page.waitForFunction(() => !document.documentElement.hasAttribute('data-op-enabled'));
      await page.waitForTimeout(30);
      await settle(page);
      const disabledSnap = await captureSurfaceState(page, host);
      assert.equal(disabledSnap.residualMarks, 0, `${engine} ${host}: disabled extension leaves zero code/icon marks`);
      assert.equal(disabledSnap.math.display.color, nativeSnap.math.display.color, `${engine} ${host}: disabled restores display math color`);
      assert.equal(disabledSnap.math.display.backgroundColor, nativeSnap.math.display.backgroundColor, `${engine} ${host}: disabled restores display math background`);
      assert.equal(disabledSnap.math.display.overflowX, nativeSnap.math.display.overflowX, `${engine} ${host}: disabled restores display math overflow`);
      assert.equal(disabledSnap.math.inline.color, nativeSnap.math.inline.color, `${engine} ${host}: disabled restores inline math color`);
      assert.equal(disabledSnap.math.inline.backgroundColor, nativeSnap.math.inline.backgroundColor, `${engine} ${host}: disabled restores inline math background`);
      if (host === 'gemini') {
        assert.deepEqual(disabledSnap.code, nativeSnap.code, `${engine} gemini: disabled restores 100% of native code surface styles`);
      }
      assert.equal(await page.locator('[data-op-owned]').count(), 0, `${engine} ${host}: disabled leaves zero owned nodes`);

      await patchConfig(page, { enabled: true });
      await page.waitForFunction(() => document.documentElement.getAttribute('data-op-enabled') === 'true');
      await page.evaluate(() => window.ObsidianPrismRuntime.stop());
      await settle(page);
      const stoppedSnap = await captureSurfaceState(page, host);
      assert.equal(stoppedSnap.residualMarks, 0, `${engine} ${host}: stop() leaves zero code/icon marks`);
      if (host === 'gemini') {
        assert.deepEqual(stoppedSnap.code, nativeSnap.code, `${engine} gemini: stop() restores 100% of native code surface styles`);
      }
      assert.equal(stoppedSnap.math.display.color, nativeSnap.math.display.color, `${engine} ${host}: stop() restores display math color`);
      assert.equal(stoppedSnap.math.display.backgroundColor, nativeSnap.math.display.backgroundColor, `${engine} ${host}: stop() restores display math background`);
      assert.equal(stoppedSnap.math.display.overflowX, nativeSnap.math.display.overflowX, `${engine} ${host}: stop() restores display math overflow`);

      assert.deepEqual(errors, []);
      console.log(`PASS ${engine} ${host} live fixture: Code Surface nesting/contrast and Native Math Surface readability & overflow across 4 palettes + zero-residue restore`);
    });
  }
}
