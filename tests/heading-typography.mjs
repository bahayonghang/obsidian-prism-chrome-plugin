/**
 * v0.3.1 #20 conversation heading typography contract, measured on the probe-derived live fixtures.
 * Outside Native Palette, h1–h4 inside User and Assistant Turns follow the message body font family, use the
 * palette's primary foreground and rank h1 ≥ h2 ≥ h3 ≥ h4 in weight and size. Native Palette and a disabled
 * extension leave the host's computed heading styles untouched. Only computed styles are asserted.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { headingStyles } from './measure.mjs';
import { LIVE_SELECTORS, onLiveFixture, injectExtension } from './live-fixtures.mjs';

const TAGS = ['h1', 'h2', 'h3', 'h4'];
const MONOSPACE = 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace';

function assertFollowsBody(styles, label) {
  assert.ok(styles.body, `${label}: reply has a paragraph`);
  for (const tag of TAGS) {
    assert.ok(styles[tag], `${label}: reply has an ${tag}`);
    assert.equal(styles[tag].fontFamily, styles.body.fontFamily, `${label}: ${tag} font family follows the paragraph`);
  }
}

/** h1 ≥ h2 ≥ h3 ≥ h4 in weight and in size, with at least one strictly greater value per adjacent pair. */
function hierarchyViolations(styles) {
  const problems = [];
  for (let i = 0; i < TAGS.length - 1; i++) {
    const upper = styles[TAGS[i]], lower = styles[TAGS[i + 1]];
    const pair = `${TAGS[i]} ${upper.fontSize}/${upper.fontWeight} vs ${TAGS[i + 1]} ${lower.fontSize}/${lower.fontWeight}`;
    if (upper.fontWeight < lower.fontWeight) problems.push(`weight inverted: ${pair}`);
    if (upper.fontSize < lower.fontSize) problems.push(`size inverted: ${pair}`);
    if (upper.fontWeight === lower.fontWeight && upper.fontSize === lower.fontSize) problems.push(`no step: ${pair}`);
  }
  return problems;
}

function assertHierarchy(styles, label) {
  assert.deepEqual(hierarchyViolations(styles), [], `${label}: heading hierarchy`);
  assert.ok(styles.h2.fontWeight >= styles.h3.fontWeight, `${label}: h2 weight (${styles.h2.fontWeight}) is not lighter than h3 (${styles.h3.fontWeight})`);
}

/**
 * Heading colours, the palette's primary foreground (--op-fg) and the colour actually painted behind each
 * heading (ancestor backgrounds composited until an opaque layer), all as sRGB 0–255.
 */
async function headingColours(page, scope) {
  return page.locator(scope).first().evaluate((root, tags) => {
    const parse = value => {
      const text = String(value).trim();
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
      if (!rgb) throw new Error(`Unparsed colour ${text}`);
      const [r, g, b, a = 1] = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r, g, b, a };
    };
    const backdrop = node => {
      const layers = [];
      for (let el = node; el; el = el.parentElement) {
        const layer = parse(getComputedStyle(el).backgroundColor);
        if (layer.a > 0) layers.push(layer);
        if (layer.a >= 1) break;
      }
      let out = { r: 255, g: 255, b: 255 };
      for (const layer of layers.reverse()) out = { r: layer.r * layer.a + out.r * (1 - layer.a), g: layer.g * layer.a + out.g * (1 - layer.a), b: layer.b * layer.a + out.b * (1 - layer.a) };
      return out;
    };
    const fg = parse(getComputedStyle(document.documentElement).getPropertyValue('--op-fg'));
    return { fg, headings: Object.fromEntries(tags.map(tag => { const node = root.querySelector(tag); return [tag, { color: parse(getComputedStyle(node).color), background: backdrop(node) }]; })) };
  }, TAGS);
}

const luminance = ({ r, g, b }) => {
  const channel = value => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const sameColour = (a, b) => Math.abs(a.r - b.r) <= 1 && Math.abs(a.g - b.g) <= 1 && Math.abs(a.b - b.b) <= 1 && Math.abs((a.a ?? 1) - (b.a ?? 1)) < 0.01;

async function assertPaletteForeground(page, scope, label) {
  const { fg, headings } = await headingColours(page, scope);
  for (const tag of TAGS) {
    const { color, background } = headings[tag];
    assert.ok(sameColour(color, fg), `${label}: ${tag} colour ${JSON.stringify(color)} equals the palette foreground ${JSON.stringify(fg)}`);
    const ratio = contrast(color, background);
    assert.ok(ratio >= 4.5, `${label}: ${tag} contrast ${ratio.toFixed(2)}:1 against ${JSON.stringify(background)} meets WCAG AA (4.5:1)`);
  }
}

/** Test-time headings: one inside a User Turn (in scope), one in host chrome and one in the sidebar (out of scope). */
const PROBE_HEADINGS = {
  chatgpt: { user: '[data-user-message-bubble="true"]', chrome: '.page-header', sidebar: '#stage-slideover-sidebar nav' },
  gemini: { user: 'user-query .query-text', chrome: '.top-bar', sidebar: 'side-navigation-v2' }
};

async function addProbeHeadings(page, host) {
  await page.evaluate(targets => {
    // A host-like heading rule (own family, light weight, grey) so inheritance alone cannot pass the checks.
    const style = document.createElement('style');
    style.textContent = '[data-prism-test-heading] { font-family: Georgia, "Times New Roman", serif; font-weight: 300; color: rgb(128, 128, 128); }';
    document.head.append(style);
    for (const [name, selector] of Object.entries(targets)) {
      const heading = document.createElement(name === 'user' ? 'h3' : 'h2');
      heading.setAttribute('data-prism-test-heading', name);
      heading.textContent = `Probe ${name} heading`;
      document.querySelector(selector).prepend(heading);
    }
  }, PROBE_HEADINGS[host]);
}

async function probeHeadingStyles(page) {
  return page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-prism-test-heading]')].map(node => {
    const style = getComputedStyle(node), parent = getComputedStyle(node.parentElement);
    return [node.getAttribute('data-prism-test-heading'), { fontFamily: style.fontFamily, fontSize: parseFloat(style.fontSize), fontWeight: Number(style.fontWeight), color: style.color, parentFontFamily: parent.fontFamily }];
  })));
}

/** Switches the message body font the way a user stylesheet would, measures, then removes it. */
async function withMonospaceBody(page, host, measure) {
  const scope = LIVE_SELECTORS[host].assistant;
  await page.evaluate(([selector, family]) => {
    const style = document.createElement('style');
    style.id = 'prism-test-monospace-body';
    style.textContent = `${selector} { font-family: ${family} !important; }`;
    document.head.append(style);
  }, [scope, MONOSPACE]);
  try { return await measure(); }
  finally { await page.evaluate(() => document.getElementById('prism-test-monospace-body')?.remove()); }
}

async function setPalette(page, patch, expected) {
  await page.evaluate(values => __prismFixture.patch(values), patch);
  await page.waitForFunction(value => document.documentElement.getAttribute('data-op-effective-palette') === value, expected);
}

export async function checkHeadingTypography(suite) {
  const { engine, artifacts } = suite;
  for (const host of ['chatgpt', 'gemini']) {
    const scope = LIVE_SELECTORS[host].assistant;
    await onLiveFixture(suite, host, { failure: `${host}-headings-failure` }, async ({ page, errors }) => {
      await addProbeHeadings(page, host);
      const native = await headingStyles(page, scope);
      const nativeProbes = await probeHeadingStyles(page);
      const nativeMono = await withMonospaceBody(page, host, () => headingStyles(page, scope));
      if (host === 'gemini') {
        // Negative cases: the native Gemini fixture breaks the contract this ticket fixes.
        assert.notEqual(native.h2.fontFamily, native.body.fontFamily, 'gemini native: headings use a different family than the body');
        assert.notEqual(nativeMono.h2.fontFamily, nativeMono.body.fontFamily, 'gemini native: headings ignore a monospace body');
        assert.ok(native.h2.fontWeight < native.h3.fontWeight, 'gemini native: h2 is lighter than h3 (inverted hierarchy)');
        assert.notDeepEqual(hierarchyViolations(native), [], 'gemini native: hierarchy check rejects the inverted weights');
      } else {
        assert.deepEqual(hierarchyViolations(native), [], 'chatgpt native: hierarchy is already correct');
      }

      await injectExtension(page, suite);
      await setPalette(page, { themeMode: 'dark', palette: 'obsidian' }, 'obsidian');
      const themed = await headingStyles(page, scope);
      assertFollowsBody(themed, `${host} obsidian`);
      assertHierarchy(themed, `${host} obsidian`);
      if (host === 'chatgpt') {
        // No regression: ChatGPT keeps its native sizes and never gets lighter headings.
        for (const tag of TAGS) {
          assert.equal(themed[tag].fontSize, native[tag].fontSize, `chatgpt: ${tag} keeps its native size`);
          assert.ok(themed[tag].fontWeight >= native[tag].fontWeight, `chatgpt: ${tag} weight ${themed[tag].fontWeight} is not below native ${native[tag].fontWeight}`);
        }
      }
      await assertPaletteForeground(page, scope, `${host} obsidian`);
      const probes = await probeHeadingStyles(page);
      const fg = (await headingColours(page, scope)).fg;
      assert.equal(probes.user.fontFamily, probes.user.parentFontFamily, `${host}: a User Turn heading follows the bubble's font family`);
      assert.equal(probes.user.color, `rgb(${fg.r}, ${fg.g}, ${fg.b})`, `${host}: a User Turn heading uses the palette foreground`);
      for (const key of ['fontFamily', 'fontSize', 'fontWeight']) assert.equal(probes.chrome[key], nativeProbes.chrome[key], `${host}: host chrome heading outside turns keeps its native ${key}`);
      for (const key of ['fontSize', 'fontWeight']) assert.equal(probes.sidebar[key], nativeProbes.sidebar[key], `${host}: sidebar heading keeps its native ${key}`);
      const mono = await withMonospaceBody(page, host, () => headingStyles(page, scope));
      assert.match(mono.body.fontFamily, /monospace/, `${host}: test stylesheet switched the body to monospace`);
      assertFollowsBody(mono, `${host} obsidian monospace body`);
      assertHierarchy(mono, `${host} obsidian monospace body`);

      await page.evaluate(() => __prismFixture.patch({ themeMode: 'light', lightPreset: 'crystal' }));
      await page.waitForFunction(() => document.documentElement.getAttribute('data-op-scheme') === 'light' && document.documentElement.getAttribute('data-op-effective-palette') === 'crystal');
      const light = await headingStyles(page, scope);
      assertFollowsBody(light, `${host} crystal`);
      assertHierarchy(light, `${host} crystal`);
      await assertPaletteForeground(page, scope, `${host} crystal`);
      await page.screenshot({ path: path.join(artifacts, `${engine}-${host}-live-headings-light.png`) });

      await setPalette(page, { themeMode: 'dark', palette: 'host' }, 'host');
      assert.deepEqual(await headingStyles(page, scope), native, `${host}: Native Palette restores native heading styles`);
      assert.deepEqual(await probeHeadingStyles(page), nativeProbes, `${host}: Native Palette restores the user, chrome and sidebar headings`);
      await setPalette(page, { palette: 'obsidian' }, 'obsidian');
      assert.notDeepEqual(await headingStyles(page, scope), native, `${host}: headings are themed again before the disable check`);
      await page.evaluate(() => __prismFixture.patch({ enabled: false }));
      await page.waitForFunction(() => !document.documentElement.hasAttribute('data-op-enabled'));
      assert.deepEqual(await headingStyles(page, scope), native, `${host}: disabling the extension restores native heading styles`);
      assert.deepEqual(await probeHeadingStyles(page), nativeProbes, `${host}: disabling restores the user, chrome and sidebar headings`);

      assert.deepEqual(errors, []);
      console.log(`PASS ${engine} ${host} live fixture heading typography: body font family, hierarchy, palette foreground, native restore`);
    });
  }
}
