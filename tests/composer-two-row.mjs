/**
 * v0.3.1 #19: two-row prototype Composer Surface on the probe-derived fixtures.
 * Measures what the user sees (control geometry, host DOM order, native input behaviour) and that every
 * off switch restores the native single-row grid. Host behaviour (send on Enter, model menu, file picker)
 * is simulated by test-side handlers that are installed before the native snapshot.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { controlGeometry } from './measure.mjs';
import { LIVE_SELECTORS, onLiveFixture, injectExtension, patchConfig } from './live-fixtures.mjs';

/** The element that visibly paints the Composer Surface card on each host. */
const CARD = { chatgpt: '[data-composer-layout]', gemini: '.text-input-field' };
/** Rightmost trailing control (send / voice / microphone). */
const TRAILING = { chatgpt: 'voice', gemini: 'mic' };
const SITE_SWITCH = { chatgpt: 'enableChatGPT', gemini: 'enableGemini' };
/** Host CSS for a hypothetical redesign that renames the composer grid areas (negative fixture case). */
const RENAMED_TEMPLATE = { chatgpt: '"top top top" "lead input tail"', gemini: '"fp fp fp" "lead input tail"' };
const RENAMED_AREAS = {
  chatgpt: `[class*="composerGrid"]{grid-template-areas:${RENAMED_TEMPLATE.chatgpt}}.composer-header{grid-area:top}.composer-leading{grid-area:lead}.composer-primary{grid-area:input}.composer-trailing{grid-area:tail}`,
  gemini: `.text-input-field{grid-template-areas:${RENAMED_TEMPLATE.gemini}}.file-preview-container{grid-area:fp}.leading-actions-wrapper{grid-area:lead}.text-input-field_textarea-wrapper{grid-area:input}.trailing-actions-wrapper{grid-area:tail}`
};

function controlsOf(host) {
  const s = LIVE_SELECTORS[host];
  const out = { editor: s.editor, add: s.add, model: s.model, attachment: s.attachment };
  if (host === 'chatgpt') Object.assign(out, { dictate: s.dictate, voice: s.voice });
  else out.mic = s.mic;
  return out;
}

/** 'two-row' when the editor sits fully above the add button, 'single-row' when both share a row. */
function shapeProbe([card, editor, add]) {
  const root = document.querySelector(card);
  const e = root?.querySelector(editor)?.getBoundingClientRect();
  const a = root?.querySelector(add)?.getBoundingClientRect();
  if (!e || !a) return 'missing';
  if (e.bottom <= a.top + 0.5) return 'two-row';
  return Math.abs((e.top + e.bottom) / 2 - (a.top + a.bottom) / 2) <= 10 ? 'single-row' : 'other';
}

async function waitForShape(page, host, shape, label) {
  const s = LIVE_SELECTORS[host];
  try {
    await page.waitForFunction(([args, wanted, source]) => (0, eval)(`(${source})`)(args) === wanted,
      [[CARD[host], s.editor, s.add], shape, shapeProbe.toString()], { timeout: 3000 });
  } catch {
    const actual = await page.evaluate(([args, source]) => (0, eval)(`(${source})`)(args), [[CARD[host], s.editor, s.add], shapeProbe.toString()]);
    assert.fail(`${label}: expected a ${shape} composer, got ${actual}`);
  }
  // Let the same configure pass finish restoring or applying reversible marks.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/** Simulates the host's own composer behaviour without touching the composer subtree. */
async function installHostBehaviour(page, host) {
  const s = LIVE_SELECTORS[host];
  await page.evaluate(({ host, s, card }) => {
    const root = document.querySelector(card);
    const editor = root.querySelector(s.editor);
    const state = window.__hostComposer = { sends: [], uploads: 0 };
    // The host resets to its original empty paragraph nodes after sending.
    const empty = [...editor.childNodes].map(node => [node, [...node.childNodes]]);
    // Send on Enter, newline on Shift+Enter, never while an IME composition is active (host contract).
    editor.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      state.sends.push(editor.innerText.replace(/\n+$/, ''));
      for (const [node, children] of empty) node.replaceChildren(...children);
      editor.replaceChildren(...empty.map(([node]) => node));
    });
    // Hidden native file input opened by the leading + button.
    const input = document.createElement('input');
    input.type = 'file'; input.hidden = true; input.id = 'host-file-input';
    document.body.append(input);
    root.querySelector(s.add).addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      state.uploads += input.files.length;
      const chip = root.querySelector(s.attachment).cloneNode(true);
      chip.setAttribute('data-host-upload', '');
      root.querySelector(s.attachment).parentElement.append(chip);
    });
    // Popper-style model menu anchored to the model button's current rectangle.
    const model = root.querySelector(s.model);
    model.addEventListener('click', () => {
      const anchor = model.getBoundingClientRect();
      const menu = document.createElement('div');
      menu.setAttribute('role', 'menu'); menu.id = 'host-model-menu';
      menu.style.cssText = 'position:fixed;display:flex;flex-direction:column;width:180px;padding:6px;z-index:50';
      for (const tier of ['Instant', 'High']) {
        const item = document.createElement('button');
        item.type = 'button'; item.setAttribute('role', 'menuitem'); item.textContent = tier;
        item.addEventListener('click', () => {
          model.querySelector('span').textContent = host === 'chatgpt' ? tier : `Neon ${tier}`;
          if (host === 'chatgpt') model.setAttribute('data-selected-reasoning-effort', tier.toLowerCase());
          else model.setAttribute('aria-label', `Open mode picker, currently Neon ${tier}`);
          menu.remove();
        });
        menu.append(item);
      }
      document.body.append(menu);
      const height = menu.getBoundingClientRect().height;
      menu.style.left = `${anchor.left}px`;
      menu.style.top = `${anchor.top - height - 8}px`;
    });
  }, { host, s, card: CARD[host] });
}

/** Every host element in <body> (extension-owned nodes excluded) with its parent, in document order. */
async function rememberHostNodes(page) {
  await page.evaluate(() => {
    const nodes = [...document.body.querySelectorAll('*')].filter(node => !node.closest('[data-op-owned]'));
    window.__hostNodes = nodes.map(node => [node, node.parentElement]);
  });
}
async function assertHostNodesUnchanged(page, label) {
  const result = await page.evaluate(() => {
    const now = [...document.body.querySelectorAll('*')].filter(node => !node.closest('[data-op-owned]'));
    const saved = window.__hostNodes;
    const firstDiff = now.findIndex((node, index) => !saved[index] || saved[index][0] !== node || saved[index][1] !== node.parentElement);
    return { now: now.length, saved: saved.length, firstDiff, at: firstDiff >= 0 ? now[firstDiff].outerHTML.slice(0, 120) : '' };
  });
  assert.equal(result.now, result.saved, `${label}: host element count is unchanged`);
  assert.equal(result.firstDiff, -1, `${label}: host parent/child order is identical (first difference: ${result.at})`);
}

/** Attributes and layout-relevant computed styles of the card subtree. */
async function cardSnapshot(page, host, { geometry = false } = {}) {
  return page.locator(CARD[host]).evaluate((root, geometry) => {
    const base = root.getBoundingClientRect();
    return [root, ...root.querySelectorAll('*')].map(node => {
      const style = getComputedStyle(node);
      const attrs = node.getAttributeNames().sort().map(name => `${name}=${node.getAttribute(name)}`);
      const layout = ['display', 'gridTemplateColumns', 'gridTemplateAreas', 'gridArea', 'order', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopLeftRadius', 'rowGap', 'columnGap'].map(key => `${key}:${style[key]}`);
      const out = { tag: node.localName, attrs, layout };
      if (geometry) {
        const r = node.getBoundingClientRect();
        out.box = [r.left - base.left, r.top - base.top, r.width, r.height].map(value => Math.round(value * 2) / 2).join(',');
        out.paint = ['backgroundColor', 'backgroundImage', 'boxShadow', 'outlineStyle', 'color', 'fontFamily'].map(key => `${key}:${style[key]}`);
      }
      return out;
    });
  }, geometry);
}

function contrastRatio(foregroundValue, backgroundValue) {
  const parse = value => {
    const srgb = value.startsWith('color(srgb ');
    if (!srgb && !/^rgba?\(/.test(value)) return null;
    const numbers = value.match(/-?\d*\.?\d+/g)?.map(Number);
    if (!numbers || numbers.length < 3 || (numbers.length > 3 && numbers[3] !== 1)) return null;
    return numbers.slice(0, 3).map(number => number / (srgb ? 1 : value.includes('%') ? 100 : 255));
  };
  const fg = parse(foregroundValue), bg = parse(backgroundValue);
  assert.ok(fg && bg, `expected opaque sRGB colors, got ${JSON.stringify({ foregroundValue, backgroundValue })}`);
  const lum = rgb => rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

async function assertTwoRow(page, host, label) {
  const s = LIVE_SELECTORS[host];
  const geometry = await controlGeometry(page, CARD[host], controlsOf(host));
  const { container, controls } = geometry;
  const { editor, add, model, attachment } = controls;
  const trailing = controls[TRAILING[host]];
  assert.ok(editor && add && model && attachment && trailing, `${label}: editor, +, Model Capsule, trailing control and attachment exist`);
  const visual = await page.locator(CARD[host]).evaluate((node, sels) => {
    const style = getComputedStyle(node);
    const modelNode = node.querySelector(sels.model);
    const before = modelNode ? getComputedStyle(modelNode, '::before') : null;
    const tierNode = modelNode?.querySelector('.model-tier, .mode-tier') || (modelNode?.hasAttribute('data-selected-reasoning-effort') ? modelNode.querySelector('span') : null);
    const primaryNode = node.querySelector(sels.trailing);
    const attachmentNode = node.querySelector(sels.attachment);
    const dictateNode = sels.dictate ? node.querySelector(sels.dictate) : null;
    const read = (el, props) => el ? Object.fromEntries(props.map(p => [p, getComputedStyle(el)[p]])) : null;
    return {
      card: {
        background: style.backgroundColor,
        border: parseFloat(style.borderTopWidth),
        borderTopWidth: style.borderTopWidth,
        outlineStyle: style.outlineStyle,
        borderRadius: style.borderRadius,
        left: parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
      },
      model: modelNode ? {
        color: getComputedStyle(modelNode).color,
        before: { content: before.content, width: before.width, height: before.height, borderRadius: before.borderRadius, clipPath: before.clipPath, backgroundColor: before.backgroundColor },
        tier: read(tierNode, ['color', 'fontWeight'])
      } : null,
      primary: read(primaryNode, ['backgroundColor', 'color', 'borderRadius', 'width', 'height']),
      attachment: read(attachmentNode, ['borderRadius', 'borderTopWidth', 'backgroundColor', 'color']),
      dictate: read(dictateNode, ['backgroundColor', 'borderTopWidth', 'borderTopColor'])
    };
  }, { model: s.model, trailing: s[TRAILING[host]], attachment: s.attachment, dictate: s.dictate || null });

  const { card } = visual;
  assert.ok(card.border > 0 && card.background !== 'rgba(0, 0, 0, 0)', `${label}: the measured card is the painted, bordered Composer Surface (${card.background}, ${card.border}px)`);
  assert.equal(card.borderTopWidth, '1px', `${label}: composer card has a crisp 1px border`);
  assert.equal(card.outlineStyle, 'none', `${label}: composer card has no second outline`);
  assert.equal(card.borderRadius, '16px', `${label}: composer card uses balanced 16px radius`);
  for (const [name, control] of Object.entries({ add, model, trailing })) {
    assert.ok(editor.bottom <= control.top + 0.5, `${label}: editor (bottom ${editor.bottom}) sits above the toolbar ${name} (top ${control.top})`);
  }
  assert.ok(attachment.bottom <= editor.top + 0.5, `${label}: attachment preview (bottom ${attachment.bottom}) sits above the editor (top ${editor.top})`);
  assert.ok(Math.abs(editor.width - container.innerWidth) <= 8, `${label}: editor width ${editor.width} spans the card inner width ${container.innerWidth} (±8px)`);
  assert.ok(Math.abs(editor.left - card.left) <= 8, `${label}: editor starts at the card inner edge (${editor.left} vs ${card.left})`);
  assert.ok(add.left < model.left, `${label}: + (${add.left}) is left of the Model Capsule (${model.left})`);
  assert.ok(model.left - add.right <= 24, `${label}: Model Capsule (left ${model.left}) sits immediately right of + (right ${add.right})`);
  assert.ok(model.right < container.width * 0.55, `${label}: Model Capsule (right ${model.right}) stays in the left half of card (${container.width})`);
  assert.ok(model.right <= trailing.left + 0.5, `${label}: Model Capsule (right ${model.right}) is left of ${TRAILING[host]} (left ${trailing.left})`);
  if (controls.dictate) {
    assert.ok(model.right < controls.dictate.left && controls.dictate.right <= trailing.left + 0.5, `${label}: dictate stays on the right ahead of ${TRAILING[host]}`);
    assert.equal(visual.dictate.backgroundColor, 'rgba(0, 0, 0, 0)', `${label}: secondary dictate icon uses clean transparent background`);
  }
  assert.ok(Math.abs(add.centerY - model.centerY) <= 10 && Math.abs(model.centerY - trailing.centerY) <= 10, `${label}: +, Model Capsule and ${TRAILING[host]} share the toolbar row`);
  assert.ok(add.left - card.left <= 8, `${label}: + leads the toolbar row at the left edge (${add.left})`);
  assert.ok(container.width - trailing.right <= card.left + 8, `${label}: ${TRAILING[host]} trails at the right edge (${trailing.right} of ${container.width})`);

  assert.equal(visual.model.before.content, '""', `${label}: Model Capsule renders CSS ::before star`);
  assert.equal(visual.model.before.width, '11px', `${label}: star width is 11px`);
  assert.equal(visual.model.before.height, '11px', `${label}: star height is 11px`);
  assert.notEqual(visual.model.before.borderRadius, '50%', `${label}: star is not a round dot`);
  assert.match(visual.model.before.clipPath, /^polygon\(/, `${label}: Model Capsule ::before renders 4-pointed star polygon clip-path`);
  assert.notEqual(visual.model.before.backgroundColor, visual.model.color, `${label}: star accent differs from capsule text`);
  if (visual.model.tier) {
    assert.equal(visual.model.tier.color, visual.model.before.backgroundColor, `${label}: star and tier share --op-accent`);
    assert.notEqual(visual.model.tier.color, visual.model.color, `${label}: tier accent differs from base capsule text`);
    assert.ok(Number(visual.model.tier.fontWeight) >= 600, `${label}: tier label is semibold`);
  }

  assert.equal(visual.attachment.borderRadius, '12px', `${label}: attachment preview renders as compact rounded-square card`);
  assert.equal(visual.attachment.borderTopWidth, '1px', `${label}: attachment card carries 1px border`);

  assert.ok(Math.abs(trailing.width - 34) <= 1 && Math.abs(trailing.height - 34) <= 1, `${label}: primary action is 34px circle (${trailing.width}x${trailing.height})`);
  assert.ok(parseFloat(visual.primary.borderRadius) >= 999, `${label}: primary action is circular`);
  const ratio = contrastRatio(visual.primary.color, visual.primary.backgroundColor);
  assert.ok(ratio >= 4.5, `${label}: primary action icon contrast >= 4.5:1 (got ${ratio.toFixed(2)}:1)`);
  return geometry;
}

/** Native input, IME composition, Enter / Shift+Enter, model menu and upload. Returns comparable results. */
async function exerciseComposer(page, host, label) {
  const s = LIVE_SELECTORS[host];
  const root = page.locator(CARD[host]);
  const editor = root.locator(s.editor);
  const before = await page.evaluate(() => ({ sends: __hostComposer.sends.length, uploads: __hostComposer.uploads }));
  await editor.click();
  await page.keyboard.type('First line');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Second line');
  const draft = await editor.evaluate(node => ({ text: node.innerText.replace(/\n+$/, ''), focused: document.activeElement === node }));
  assert.equal(draft.focused, true, `${label}: native editor keeps focus while typing`);
  assert.equal(draft.text, 'First line\nSecond line', `${label}: Shift+Enter inserts a newline and does not send`);
  const composition = await editor.evaluate(node => {
    const seen = [];
    const remember = event => seen.push(event.type);
    node.addEventListener('compositionstart', remember); node.addEventListener('compositionend', remember);
    node.dispatchEvent(new CompositionEvent('compositionstart', { data: '运行', bubbles: true }));
    const composingEnter = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true });
    node.dispatchEvent(composingEnter);
    node.dispatchEvent(new CompositionEvent('compositionend', { data: '运行指标', bubbles: true }));
    node.removeEventListener('compositionstart', remember); node.removeEventListener('compositionend', remember);
    return { text: node.innerText.replace(/\n+$/, ''), prevented: composingEnter.defaultPrevented, seen, sends: __hostComposer.sends.length };
  });
  assert.deepEqual(composition.seen, ['compositionstart', 'compositionend'], `${label}: IME composition events reach the native editor`);
  assert.equal(composition.prevented, false, `${label}: Enter during IME composition keeps native behaviour`);
  assert.equal(composition.sends, before.sends, `${label}: Enter during IME composition does not send`);
  assert.equal(composition.text, draft.text, `${label}: composition never rewrites the typed text`);
  await page.keyboard.press('Enter');
  const sent = await page.evaluate(() => __hostComposer.sends.at(-1));
  assert.equal(await page.evaluate(() => __hostComposer.sends.length), before.sends + 1, `${label}: Enter sends once`);
  assert.equal(sent, 'First line\nSecond line', `${label}: the sent draft keeps the Shift+Enter newline`);

  await root.locator(s.model).click();
  const menu = await page.evaluate(sel => {
    const anchor = document.querySelector(sel).getBoundingClientRect();
    const box = document.querySelector('#host-model-menu').getBoundingClientRect();
    return { dx: box.left - anchor.left, gap: anchor.top - box.bottom, inView: box.top >= 0 && box.left >= 0 && box.right <= innerWidth };
  }, `${CARD[host]} ${s.model}`);
  assert.ok(Math.abs(menu.dx) <= 0.5 && Math.abs(menu.gap - 8) <= 0.5 && menu.inView, `${label}: the model menu opens anchored to the Model Capsule (${JSON.stringify(menu)})`);
  await page.locator('#host-model-menu [role="menuitem"]', { hasText: 'Instant' }).click();
  assert.match(await root.locator(s.model).innerText(), /Instant/, `${label}: choosing a model in the native menu switches it`);
  await root.locator(s.model).click();
  await page.locator('#host-model-menu [role="menuitem"]', { hasText: 'High' }).click();
  assert.match(await root.locator(s.model).innerText(), /High/, `${label}: the model switches back`);

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), root.locator(s.add).click()]);
  await chooser.setFiles({ name: 'two-row.txt', mimeType: 'text/plain', buffer: Buffer.from('offline') });
  await page.waitForFunction(count => __hostComposer.uploads === count, before.uploads + 1);
  assert.equal(await root.locator('[data-host-upload]').count(), 1, `${label}: the native upload button still adds an attachment preview`);
  const uploaded = await controlGeometry(page, CARD[host], { chip: '[data-host-upload]', editor: s.editor });
  assert.ok(uploaded.controls.chip.bottom <= uploaded.controls.editor.top + 0.5, `${label}: a new attachment preview appears above the editor`);
  await page.evaluate(() => { document.querySelector('[data-host-upload]').remove(); document.querySelector('#host-file-input').value = ''; });
  await editor.evaluate(node => node.blur());
  return { draft: draft.text, sent, composition: composition.seen, menu: { dx: menu.dx, gap: menu.gap } };
}

export async function checkTwoRowComposer(suite) {
  const { engine, artifacts } = suite;
  for (const host of ['chatgpt', 'gemini']) {
    await onLiveFixture(suite, host, { failure: `${host}-two-row-failure`, initial: { themeMode: 'dark' } }, async ({ page, errors }) => {
      if (host === 'chatgpt') {
        // Host CSS for ChatGPT's own multi-line state (the editor takes a full row natively).
        await page.addStyleTag({ content: '[data-composer-layout="multi-line"] [class*="composerGrid"]{grid-template-areas:"header header header" "primary primary primary" "leading footer trailing"}' });
      }
      await installHostBehaviour(page, host);
      await waitForShape(page, host, 'single-row', `${host} native`);
      const nativeSnapshot = await cardSnapshot(page, host, { geometry: true });
      const nativeBehaviour = await exerciseComposer(page, host, `${host} native`);
      assert.deepEqual(await cardSnapshot(page, host, { geometry: true }), nativeSnapshot, `${host}: exercising the native composer leaves it as it was`);
      await rememberHostNodes(page);

      await injectExtension(page, suite);

      for (const [theme, palette] of [['dark', 'warm'], ['dark', 'obsidian'], ['light', 'alabaster'], ['light', 'crystal']]) {
        const label = `${engine} ${host} ${theme} (${palette})`;
        const paletteKey = theme === 'dark' ? 'palette' : 'lightPreset';
        await patchConfig(page, { themeMode: theme, [paletteKey]: palette });
        await page.waitForFunction(([t, p]) =>
          document.documentElement.getAttribute('data-op-scheme') === t &&
          document.documentElement.getAttribute('data-op-effective-palette') === p,
          [theme, palette]);
        await waitForShape(page, host, 'two-row', label);
        await assertTwoRow(page, host, label);
        await assertHostNodesUnchanged(page, label);
        if (palette === 'obsidian') {
          // caret: 'initial' keeps Playwright from leaving an empty style attribute on the native editor.
          await page.screenshot({ path: path.join(artifacts, `${engine}-${host}-two-row-composer.png`), caret: 'initial' });
          assert.deepEqual(await exerciseComposer(page, host, label), nativeBehaviour, `${label}: input, IME, Enter/Shift+Enter, model menu and upload match native`);
          if (host === 'chatgpt') {
            for (const state of ['multi-line', 'single-line']) {
              await page.locator(CARD.chatgpt).evaluate((node, state) => node.setAttribute('data-composer-layout', state), state);
              await waitForShape(page, host, 'two-row', `${label} host ${state}`);
              await assertTwoRow(page, host, `${label} host ${state}`);
            }
          }
          await assertHostNodesUnchanged(page, `${label} after interaction`);
        }
        if (palette === 'obsidian' || palette === 'crystal') {
          // composerRestyle off and Native Palette restore the native single-row grid with no residue.
          for (const [name, off, on] of [['composerRestyle off', { composerRestyle: false }, { composerRestyle: true }], ['Native Palette', { [paletteKey]: 'host' }, { [paletteKey]: palette }]]) {
            await patchConfig(page, off);
            await waitForShape(page, host, 'single-row', `${label} ${name}`);
            assert.deepEqual(await cardSnapshot(page, host), await stripGeometry(nativeSnapshot), `${label} ${name}: native grid restored without attribute or layout residue`);
            await patchConfig(page, on);
            await waitForShape(page, host, 'two-row', `${label} ${name} back on`);
          }
        }
      }

      // Negative case: a host redesign whose grid children use unknown area names keeps its native single row.
      const renamed = await page.addStyleTag({ content: RENAMED_AREAS[host] });
      await page.evaluate(() => ObsidianPrismRuntime.refresh());
      const renamedGrid = () => page.locator(LIVE_SELECTORS[host].composerGrid).evaluate(node => getComputedStyle(node).gridTemplateAreas.replace(/\s+/g, ' '));
      await page.waitForFunction(([selector, wanted]) => getComputedStyle(document.querySelector(selector)).gridTemplateAreas.replace(/\s+/g, ' ') === wanted,
        [LIVE_SELECTORS[host].composerGrid, RENAMED_TEMPLATE[host]], { timeout: 3000 }).catch(() => {});
      assert.equal(await renamedGrid(), RENAMED_TEMPLATE[host], `${engine} ${host}: an unrecognized host grid template is left untouched`);
      await waitForShape(page, host, 'single-row', `${engine} ${host} unknown grid areas`);
      await renamed.evaluate(node => node.remove());
      await page.evaluate(() => ObsidianPrismRuntime.refresh());
      await waitForShape(page, host, 'two-row', `${engine} ${host} known grid areas again`);

      // Site disable, extension disable and a permanent stop restore the exact native composer.
      for (const [name, off, on] of [['site disabled', { [SITE_SWITCH[host]]: false }, { [SITE_SWITCH[host]]: true }], ['extension disabled', { enabled: false }, { enabled: true }]]) {
        await patchConfig(page, off);
        await waitForShape(page, host, 'single-row', `${engine} ${host} ${name}`);
        assert.deepEqual(await cardSnapshot(page, host, { geometry: true }), nativeSnapshot, `${engine} ${host} ${name}: native composer restored exactly`);
        await patchConfig(page, on);
        await waitForShape(page, host, 'two-row', `${engine} ${host} ${name} re-enabled`);
      }
      await page.evaluate(() => ObsidianPrismRuntime.stop());
      await waitForShape(page, host, 'single-row', `${engine} ${host} stopped`);
      assert.deepEqual(await cardSnapshot(page, host, { geometry: true }), nativeSnapshot, `${engine} ${host} stopped: native composer restored exactly`);
      await assertHostNodesUnchanged(page, `${engine} ${host} stopped`);
      assert.deepEqual(errors, []);
      console.log(`PASS ${engine} ${host} two-row Composer Surface: geometry, host DOM order, native input/menu/upload, reversible in dark and light`);
    });
  }
  await checkPositionalChatGPTGrid(suite);
}

/**
 * Positional variant of the ChatGPT live fixture. The probe recorded only a three-column grid
 * "36px | input | trailing"; the area names in the fixture are inferred. Here the host grid has no
 * grid-template-areas: the attachment header spans the first row by line numbers and the leading, primary
 * and trailing children are placed by column order alone.
 */
const POSITIONAL_GRID = '[class*="composerGrid"]{grid-template-areas:none}[class*="composerGrid"] > *{grid-area:auto}[class*="composerGrid"] > .composer-header{grid-column:1 / -1}';

async function checkPositionalChatGPTGrid(suite) {
  const { engine } = suite;
  const host = 'chatgpt';
  await onLiveFixture(suite, host, { failure: 'chatgpt-two-row-positional-failure', initial: { themeMode: 'dark' } }, async ({ page, errors }) => {
    await page.addStyleTag({ content: POSITIONAL_GRID });
    const areas = () => page.locator(LIVE_SELECTORS.chatgpt.composerGrid).evaluate(node => getComputedStyle(node).gridTemplateAreas);
    assert.equal(await areas(), 'none', 'chatgpt positional: the host grid names no areas');
    await waitForShape(page, host, 'single-row', 'chatgpt positional native');
    const nativeSnapshot = await cardSnapshot(page, host, { geometry: true });
    await rememberHostNodes(page);

    await injectExtension(page, suite);
    const label = `${engine} chatgpt positional grid`;
    await waitForShape(page, host, 'two-row', label);
    await assertTwoRow(page, host, label);
    await assertHostNodesUnchanged(page, label);

    for (const [name, off, on] of [['composerRestyle off', { composerRestyle: false }, { composerRestyle: true }], ['Native Palette', { palette: 'host' }, { palette: 'obsidian' }]]) {
      await patchConfig(page, off);
      await waitForShape(page, host, 'single-row', `${label} ${name}`);
      assert.deepEqual(await cardSnapshot(page, host), stripGeometry(nativeSnapshot), `${label} ${name}: native grid restored without attribute or layout residue`);
      await patchConfig(page, on);
      await waitForShape(page, host, 'two-row', `${label} ${name} back on`);
    }

    // Negative case: a second control group after the editor makes the trailing slot ambiguous, so the
    // unrecognizable grid stays native. Removing it makes the slots recognizable again.
    await page.locator(LIVE_SELECTORS.chatgpt.composerGrid).evaluate(grid => {
      const extra = document.createElement('div');
      extra.id = 'host-extra-controls';
      extra.innerHTML = '<button type="button" aria-label="Extra tool">x</button>';
      grid.append(extra);
    });
    await page.evaluate(() => ObsidianPrismRuntime.refresh());
    await waitForShape(page, host, 'single-row', `${label} unrecognizable slots`);
    assert.equal(await areas(), 'none', `${label}: an unrecognizable positional grid keeps its native template`);
    await page.evaluate(() => document.getElementById('host-extra-controls').remove());
    await page.evaluate(() => ObsidianPrismRuntime.refresh());
    await waitForShape(page, host, 'two-row', `${label} recognizable again`);

    await patchConfig(page, { enabled: false });
    await waitForShape(page, host, 'single-row', `${label} extension disabled`);
    assert.deepEqual(await cardSnapshot(page, host, { geometry: true }), nativeSnapshot, `${label} extension disabled: native composer restored exactly`);
    await patchConfig(page, { enabled: true });
    await waitForShape(page, host, 'two-row', `${label} re-enabled`);
    await page.evaluate(() => ObsidianPrismRuntime.stop());
    await waitForShape(page, host, 'single-row', `${label} stopped`);
    assert.deepEqual(await cardSnapshot(page, host, { geometry: true }), nativeSnapshot, `${label} stopped: native composer restored exactly`);
    await assertHostNodesUnchanged(page, `${label} stopped`);
    assert.deepEqual(errors, []);
    console.log(`PASS ${label}: unnamed ChatGPT grid gets the two-row Composer Surface by structural slots, keeps host DOM order, restores exactly, and an unrecognizable grid stays native`);
  });
}

function stripGeometry(snapshot) {
  return snapshot.map(({ tag, attrs, layout }) => ({ tag, attrs, layout }));
}
