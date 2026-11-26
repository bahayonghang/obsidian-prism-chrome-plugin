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

function parseRgba(value) {
  if (!value) return null;
  const srgb = value.startsWith('color(srgb ');
  if (!srgb && !/^rgba?\(/.test(value)) return null;
  const numbers = value.match(/-?\d*\.?\d+/g)?.map(Number);
  if (!numbers || numbers.length < 3) return null;
  const scale = srgb ? 255 : value.includes('%') ? 2.55 : 1;
  return {
    r: numbers[0] * scale,
    g: numbers[1] * scale,
    b: numbers[2] * scale,
    a: numbers.length > 3 ? numbers[3] : 1
  };
}

function assertNeutralColor(value, label) {
  const c = parseRgba(value);
  assert.ok(c, `${label}: expected parseable color, got ${value}`);
  const spread = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  assert.ok(spread <= 45, `${label}: expected neutral low-saturation tone (channel spread ${spread.toFixed(1)} <= 45, got ${value})`);
}

function parseShadowLayers(boxShadow) {
  if (!boxShadow || boxShadow === 'none') return [];
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < boxShadow.length; i++) {
    const ch = boxShadow[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      parts.push(boxShadow.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(boxShadow.slice(start).trim());
  return parts.filter(Boolean);
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
    const cardBefore = getComputedStyle(node, '::before');
    const surfaceNode = node.matches('[data-op-composer-surface="true"]') ? node : (node.closest('[data-op-composer-surface="true"]') || node);
    const surfaceStyle = getComputedStyle(surfaceNode);
    const surfaceBefore = getComputedStyle(surfaceNode, '::before');
    const addNode = node.querySelector(sels.add);
    const modelNode = node.querySelector(sels.model);
    const before = modelNode ? getComputedStyle(modelNode, '::before') : null;
    const tierNode = modelNode?.querySelector('.model-tier, .mode-tier') || (modelNode?.hasAttribute('data-selected-reasoning-effort') ? modelNode.querySelector('span') : null);
    const trailingNode = node.querySelector(sels.trailing);
    const attachmentNode = node.querySelector(sels.attachment);
    const dictateNode = sels.dictate ? node.querySelector(sels.dictate) : null;
    const read = (el, props) => el ? Object.fromEntries(props.map(p => [p, getComputedStyle(el)[p]])) : null;
    return {
      card: {
        background: surfaceStyle.backgroundColor,
        backgroundImage: surfaceStyle.backgroundImage,
        backdropFilter: surfaceStyle.backdropFilter || surfaceStyle.webkitBackdropFilter || 'none',
        border: parseFloat(surfaceStyle.borderTopWidth),
        borders: [surfaceStyle.borderTopWidth, surfaceStyle.borderRightWidth, surfaceStyle.borderBottomWidth, surfaceStyle.borderLeftWidth],
        borderStyles: [surfaceStyle.borderTopStyle, surfaceStyle.borderRightStyle, surfaceStyle.borderBottomStyle, surfaceStyle.borderLeftStyle],
        borderColor: surfaceStyle.borderTopColor,
        outlineStyle: surfaceStyle.outlineStyle,
        borderRadius: surfaceStyle.borderRadius,
        boxShadow: surfaceStyle.boxShadow,
        beforeContent: surfaceBefore.content,
        canvasCount: surfaceNode.querySelectorAll('canvas').length,
        left: parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft)
      },
      add: addNode ? {
        ...read(addNode, ['backgroundColor', 'borderTopWidth', 'borderTopColor', 'boxShadow', 'borderRadius', 'width', 'height', 'color'])
      } : null,
      model: modelNode ? {
        ...read(modelNode, ['backgroundColor', 'borderTopWidth', 'borderTopColor', 'boxShadow', 'color', 'height', 'borderRadius']),
        before: { content: before.content, width: before.width, height: before.height, borderRadius: before.borderRadius, clipPath: before.clipPath, backgroundColor: before.backgroundColor },
        tier: read(tierNode, ['color', 'fontWeight'])
      } : null,
      trailing: trailingNode ? {
        primaryAttr: trailingNode.getAttribute('data-op-composer-primary-action'),
        ...read(trailingNode, ['backgroundColor', 'borderTopColor', 'borderRadius', 'width', 'height', 'color'])
      } : null,
      attachment: read(attachmentNode, ['borderRadius', 'borderTopWidth', 'backgroundColor', 'color']),
      dictate: dictateNode ? {
        primaryAttr: dictateNode.getAttribute('data-op-composer-primary-action'),
        ...read(dictateNode, ['backgroundColor', 'borderTopColor', 'borderRadius', 'width', 'height'])
      } : null
    };
  }, { add: s.add, model: s.model, trailing: s[TRAILING[host]], attachment: s.attachment, dictate: s.dictate || null });

  const { card } = visual;
  const bg = parseRgba(card.background);
  assert.ok(bg && bg.a >= 0.95, `${label}: Composer Surface card background is solid/near-solid opaque (got ${card.background})`);
  assert.match(card.backgroundImage, /linear-gradient\(/, `${label}: Composer Surface card renders top sheen gradient`);
  assert.equal(card.backdropFilter, 'none', `${label}: Composer Surface clears host backdrop-filter`);
  assert.deepEqual(card.borders, ['1px', '1px', '1px', '1px'], `${label}: Composer Surface has 1px border on all four sides`);
  assert.deepEqual(card.borderStyles, ['solid', 'solid', 'solid', 'solid'], `${label}: Composer Surface has solid border on all four sides`);
  assert.equal(card.outlineStyle, 'none', `${label}: composer card has no second outline`);
  assert.equal(card.borderRadius, '12px', `${label}: composer card uses balanced 12px optical radius`);
  assert.match(card.boxShadow, /inset/, `${label}: composer card includes top specular inset highlight`);
  assert.equal(card.beforeContent, 'none', `${label}: resting composer renders no prismatic ::before rim`);
  assert.equal(card.canvasCount, 0, `${label}: ADR-0002 zero Canvas elements inside Composer Surface`);
  for (const layer of parseShadowLayers(card.boxShadow)) {
    if (layer.includes('inset')) continue;
    const lengths = layer.replace(/(?:rgba?\([^)]+\)|color\([^)]+\))/g, '').trim().match(/-?\d*\.?\d+px/g)?.map(parseFloat) || [];
    if (lengths.length >= 2) {
      assert.ok(lengths[1] >= 0, `${label}: resting outer shadow must be downward drop shadow, not upward halo (${layer})`);
    }
    const colorMatch = layer.match(/(?:rgba?\([^)]+\)|color\([^)]+\))/);
    if (colorMatch) {
      const c = parseRgba(colorMatch[0]);
      assert.ok(c, `${label}: expected parseable shadow color (${layer})`);
      const spread = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
      assert.ok(spread <= 45 || c.a <= 0.15, `${label}: resting outer shadow has no colored violet/cyan glow haze (${layer})`);
    }
  }

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
    assert.equal(visual.dictate.primaryAttr, null, `${label}: dictate never receives primary-action mark`);
    assert.equal(visual.dictate.backgroundColor, 'rgba(0, 0, 0, 0)', `${label}: secondary dictate icon uses clean transparent background`);
    assert.equal(visual.dictate.borderTopColor, 'rgba(0, 0, 0, 0)', `${label}: secondary dictate icon uses transparent border`);
    assert.ok(Math.abs(controls.dictate.width - 28) <= 1 && Math.abs(controls.dictate.height - 28) <= 1, `${label}: dictate is 28x28 ghost circle`);
  }
  assert.ok(Math.abs(add.centerY - model.centerY) <= 10 && Math.abs(model.centerY - trailing.centerY) <= 10, `${label}: +, Model Capsule and ${TRAILING[host]} share the toolbar row`);
  assert.ok(add.left - card.left <= 8, `${label}: + leads the toolbar row at the left edge (${add.left})`);
  assert.ok(container.width - trailing.right <= card.left + 8, `${label}: ${TRAILING[host]} trails at the right edge (${trailing.right} of ${container.width})`);

  // Neutral low-saturation elevated pill hierarchy for + and Model Capsule (no accent wash on body/border).
  assert.ok(Math.abs(add.width - 28) <= 1 && Math.abs(add.height - 28) <= 1, `${label}: + trigger is 28x28 circle`);
  assert.equal(visual.add.borderTopWidth, '1px', `${label}: + trigger has 1px subtle border`);
  assert.match(visual.add.boxShadow, /inset/, `${label}: + trigger has top inset specular`);
  assertNeutralColor(visual.add.backgroundColor, `${label}: + trigger background`);
  assertNeutralColor(visual.add.borderTopColor, `${label}: + trigger border`);

  assert.equal(visual.model.height, '28px', `${label}: Model Capsule height is 28px`);
  assert.equal(visual.model.borderTopWidth, '1px', `${label}: Model Capsule has 1px subtle border`);
  assert.match(visual.model.boxShadow, /inset/, `${label}: Model Capsule has top inset specular`);
  assert.equal(visual.model.backgroundColor, visual.add.backgroundColor, `${label}: Model Capsule shares neutral pill background with +`);
  assert.equal(visual.model.borderTopColor, visual.add.borderTopColor, `${label}: Model Capsule shares neutral pill border with +`);
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

  assert.equal(visual.attachment.borderRadius, '8px', `${label}: attachment preview renders with compact balanced 8px optical radius`);
  assert.equal(visual.attachment.borderTopWidth, '1px', `${label}: attachment card carries 1px border`);

  // Idle Start Voice (ChatGPT) & Microphone (Gemini) render as transparent 28x28 ghost circular buttons (never solid primary action).
  assert.equal(visual.trailing.primaryAttr, null, `${label}: idle ${TRAILING[host]} never receives data-op-composer-primary-action`);
  assert.equal(visual.trailing.backgroundColor, 'rgba(0, 0, 0, 0)', `${label}: idle ${TRAILING[host]} uses transparent ghost background`);
  assert.equal(visual.trailing.borderTopColor, 'rgba(0, 0, 0, 0)', `${label}: idle ${TRAILING[host]} uses transparent ghost border`);
  assert.ok(Math.abs(trailing.width - 28) <= 1 && Math.abs(trailing.height - 28) <= 1, `${label}: idle ${TRAILING[host]} is 28x28 ghost circle (${trailing.width}x${trailing.height})`);
  assert.ok(parseFloat(visual.trailing.borderRadius) >= 999, `${label}: idle ${TRAILING[host]} is circular`);
  return geometry;
}

/**
 * Verifies v0.4.4 #47 optical contract dynamically without modifying shared live fixture files:
 * - Corner presets (sharp 6px/4px, balanced 12px/8px, soft 16px/10px)
 * - 4-sided 1px solid border + backdrop-filter: none surviving host border:0 / blur(12px) stress overrides
 * - Calm resting state vs :hover / :focus-within 1px prismatic ::before rim (glow on/off, motion off, reduced motion)
 * - Active Send (enabled >= 4.5:1 contrast & disabled subdued) and Stop 30x30 solid circular primary actions,
 *   while Start Voice (including [data-composer-voice-start] with white paint) & Mic remain transparent ghost buttons.
 */
async function assertOpticalStatesAndActions(page, host, label, { testPresetsAndGlow = false } = {}) {
  const s = LIVE_SELECTORS[host];
  const surfaceSel = '[data-op-composer-surface="true"]';

  // 1) Host border:0 + backdrop-filter:blur(12px) stress resistance
  await page.evaluate(sel => {
    const style = document.createElement('style');
    style.id = 'op-v044-stress-style';
    style.textContent = '.op-v044-host-reset{border:0 !important;border-style:none !important;backdrop-filter:blur(12px) !important;-webkit-backdrop-filter:blur(12px) !important}.op-v044-voice-pill{background:#ffffff;color:#000000;border:1px solid #ffffff}';
    document.head.append(style);
    document.querySelector(sel)?.classList.add('op-v044-host-reset');
  }, surfaceSel);
  const stressed = await page.locator(surfaceSel).evaluate(node => {
    const st = getComputedStyle(node);
    return {
      borders: [st.borderTopWidth, st.borderRightWidth, st.borderBottomWidth, st.borderLeftWidth],
      styles: [st.borderTopStyle, st.borderRightStyle, st.borderBottomStyle, st.borderLeftStyle],
      backdrop: st.backdropFilter || st.webkitBackdropFilter || 'none'
    };
  });
  assert.deepEqual(stressed.borders, ['1px', '1px', '1px', '1px'], `${label}: 1px border survives host border:0 !important reset`);
  assert.deepEqual(stressed.styles, ['solid', 'solid', 'solid', 'solid'], `${label}: solid border survives host border-style:none !important reset`);
  assert.equal(stressed.backdrop, 'none', `${label}: backdrop-filter:none survives host blur(12px) !important`);

  // 2) Active Send (enabled + disabled) & Stop 30x30 solid circles, while Voice/Mic remain ghost
  const voiceOrMicSel = s[TRAILING[host]];
  await page.evaluate(({ host, voiceOrMicSel }) => {
    const trailing = document.querySelector('[data-op-composer-toolbar="true"]');
    const idleBtn = trailing?.querySelector(voiceOrMicSel);
    if (host === 'chatgpt' && idleBtn) {
      idleBtn.setAttribute('data-composer-voice-start', 'true');
      idleBtn.classList.add('op-v044-voice-pill');
    }
    const send = document.createElement('button');
    send.type = 'button';
    send.id = 'op-v044-test-send';
    send.setAttribute(host === 'chatgpt' ? 'data-testid' : 'data-test-id', 'send-button');
    send.setAttribute('aria-label', host === 'chatgpt' ? 'Send prompt' : 'Send message');
    send.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
    trailing.append(send);
    ObsidianPrismRuntime.refresh();
  }, { host, voiceOrMicSel });
  await page.waitForFunction(() => document.getElementById('op-v044-test-send')?.getAttribute('data-op-composer-primary-action') === 'true');
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

  const sendState = await page.evaluate(sel => {
    const send = document.getElementById('op-v044-test-send');
    const idle = document.querySelector(sel);
    const ss = getComputedStyle(send);
    const sr = send.getBoundingClientRect();
    const is = idle ? getComputedStyle(idle) : null;
    return {
      send: { bg: ss.backgroundColor, color: ss.color, radius: ss.borderRadius, w: sr.width, h: sr.height, attr: send.getAttribute('data-op-composer-primary-action') },
      idle: idle ? { bg: is.backgroundColor, border: is.borderTopColor, attr: idle.getAttribute('data-op-composer-primary-action') } : null
    };
  }, voiceOrMicSel);
  assert.equal(sendState.send.attr, 'true');
  assert.ok(Math.abs(sendState.send.w - 30) <= 1 && Math.abs(sendState.send.h - 30) <= 1, `${label}: enabled Send is 30x30 circle (${sendState.send.w}x${sendState.send.h})`);
  assert.ok(parseFloat(sendState.send.radius) >= 999, `${label}: enabled Send is circular`);
  const sendRatio = contrastRatio(sendState.send.color, sendState.send.bg);
  assert.ok(sendRatio >= 4.5, `${label}: enabled Send contrast >= 4.5:1 (got ${sendRatio.toFixed(2)}:1)`);
  assert.equal(sendState.idle.attr, null, `${label}: Start Voice/Mic stays unmarked alongside Send`);
  assert.equal(sendState.idle.bg, 'rgba(0, 0, 0, 0)', `${label}: Start Voice with host white paint stays transparent ghost button`);

  // Disabled Send -> subdued low-contrast neutral circle
  await page.evaluate(() => { document.getElementById('op-v044-test-send').disabled = true; });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const disabledSend = await page.evaluate(() => {
    const send = document.getElementById('op-v044-test-send');
    const ss = getComputedStyle(send);
    return { bg: ss.backgroundColor, color: ss.color, bgImage: ss.backgroundImage };
  });
  assert.notEqual(disabledSend.bg, sendState.send.bg, `${label}: disabled Send uses subdued neutral circle distinct from active Send`);
  assert.equal(disabledSend.bgImage, 'none', `${label}: disabled Send drops top sheen`);
  const disabledBg = parseRgba(disabledSend.bg);
  assert.ok(disabledBg && disabledBg.a <= 0.25, `${label}: disabled Send background is subdued low-opacity neutral (got ${disabledSend.bg})`);

  // Active Stop button -> 30x30 solid circle with >= 4.5:1 contrast
  await page.evaluate(({ host }) => {
    const trailing = document.querySelector('[data-op-composer-toolbar="true"]');
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.id = 'op-v044-test-stop';
    stop.setAttribute(host === 'chatgpt' ? 'data-testid' : 'data-test-id', 'stop-button');
    stop.setAttribute('aria-label', host === 'chatgpt' ? 'Stop streaming' : 'Stop response');
    stop.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>';
    trailing.append(stop);
    ObsidianPrismRuntime.refresh();
  }, { host });
  await page.waitForFunction(() => document.getElementById('op-v044-test-stop')?.getAttribute('data-op-composer-primary-action') === 'true');
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const stopState = await page.evaluate(() => {
    const stop = document.getElementById('op-v044-test-stop');
    const send = document.getElementById('op-v044-test-send');
    const ss = getComputedStyle(stop);
    const sr = stop.getBoundingClientRect();
    return {
      bg: ss.backgroundColor, color: ss.color, radius: ss.borderRadius, w: sr.width, h: sr.height,
      sendAttr: send.getAttribute('data-op-composer-primary-action')
    };
  });
  assert.ok(Math.abs(stopState.w - 30) <= 1 && Math.abs(stopState.h - 30) <= 1, `${label}: active Stop is 30x30 circle (${stopState.w}x${stopState.h})`);
  assert.ok(parseFloat(stopState.radius) >= 999, `${label}: active Stop is circular`);
  const stopRatio = contrastRatio(stopState.color, stopState.bg);
  assert.ok(stopRatio >= 4.5, `${label}: active Stop contrast >= 4.5:1 (got ${stopRatio.toFixed(2)}:1)`);
  assert.equal(stopState.sendAttr, null, `${label}: Send mark clears when Stop takes primary action`);

  // Clean up dynamic stress/action test nodes
  await page.evaluate(({ surfaceSel, voiceOrMicSel }) => {
    document.getElementById('op-v044-test-send')?.remove();
    document.getElementById('op-v044-test-stop')?.remove();
    document.getElementById('op-v044-stress-style')?.remove();
    const surf = document.querySelector(surfaceSel);
    if (surf) {
      surf.classList.remove('op-v044-host-reset');
      if (!surf.getAttribute('class')) surf.removeAttribute('class');
    }
    const idleBtn = document.querySelector(voiceOrMicSel);
    if (idleBtn) {
      idleBtn.removeAttribute('data-composer-voice-start');
      idleBtn.classList.remove('op-v044-voice-pill');
      if (!idleBtn.getAttribute('class')) idleBtn.removeAttribute('class');
    }
    ObsidianPrismRuntime.refresh();
  }, { surfaceSel, voiceOrMicSel });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

  if (!testPresetsAndGlow) return;

  // 3) Corner presets: sharp (6px/4px), balanced (12px/8px), soft (16px/10px)
  for (const [preset, cardRadius, attachRadius] of [['sharp', '6px', '4px'], ['soft', '16px', '10px'], ['balanced', '12px', '8px']]) {
    await patchConfig(page, { cornerStyle: preset });
    await page.waitForFunction(p => document.documentElement.getAttribute('data-op-corners') === p, preset);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const radii = await page.evaluate(({ surfaceSel, attachSel }) => ({
      card: getComputedStyle(document.querySelector(surfaceSel)).borderRadius,
      attachment: getComputedStyle(document.querySelector(attachSel)).borderRadius
    }), { surfaceSel, attachSel: s.attachment });
    assert.equal(radii.card, cardRadius, `${label} corners=${preset}: card border-radius is ${cardRadius}`);
    assert.equal(radii.attachment, attachRadius, `${label} corners=${preset}: attachment border-radius is ${attachRadius}`);
  }

  // 4) Prismatic 1px ::before rim & focus border feedback (motion enabled vs glow off vs motion off vs reduced motion)
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await patchConfig(page, { motionLevel: 'subtle', composerGlow: true });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-op-motion') === 'subtle' && document.documentElement.getAttribute('data-op-composer-glow') === 'true');
  await page.mouse.move(2, 2);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

  const readSurfaceState = () => page.evaluate(sel => {
    const el = document.querySelector(sel);
    const st = getComputedStyle(el);
    const bf = getComputedStyle(el, '::before');
    return {
      borderColor: st.borderTopColor,
      boxShadow: st.boxShadow,
      beforeContent: bf.content,
      beforeOpacity: bf.opacity,
      beforePointerEvents: bf.pointerEvents,
      beforeBgImage: bf.backgroundImage,
      beforeMaskComposite: bf.maskComposite || bf.webkitMaskComposite || ''
    };
  }, surfaceSel);

  const resting = await readSurfaceState();
  assert.equal(resting.beforeContent, 'none', `${label}: resting state with motion+glow enabled still renders no ::before prismatic rim`);

  await page.locator(surfaceSel).hover();
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const hovered = await readSurfaceState();
  assert.equal(hovered.beforeContent, '""', `${label}: hovering with composerGlow=true renders 1px prismatic ::before rim`);
  assert.equal(hovered.beforePointerEvents, 'none', `${label}: prismatic ::before rim never blocks clicks`);
  assert.match(hovered.beforeBgImage, /gradient\(/, `${label}: prismatic ::before rim paints spectrum gradient`);
  assert.match(hovered.beforeMaskComposite, /exclude|xor/i, `${label}: prismatic ::before rim punches out interior`);
  assert.ok(parseFloat(hovered.beforeOpacity) > 0, `${label}: hovered prismatic ::before rim is visible`);

  await page.mouse.move(2, 2);
  await page.locator(`${CARD[host]} ${s.editor}`).click();
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const focusedGlow = await readSurfaceState();
  assert.notEqual(focusedGlow.borderColor, resting.borderColor, `${label}: :focus-within blends accent into 1px border`);
  assert.doesNotMatch(focusedGlow.boxShadow, /0px\s+0px\s+0px\s+3px/, `${label}: :focus-within never paints a 3px outer ring`);
  assert.equal(focusedGlow.beforeContent, '""', `${label}: focused with composerGlow=true renders 1px prismatic ::before rim`);
  assert.equal(focusedGlow.beforeOpacity, '1', `${label}: focused prismatic ::before rim reaches full visibility`);

  await patchConfig(page, { composerGlow: false });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-op-composer-glow') === 'false');
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const focusedNoGlow = await readSurfaceState();
  assert.equal(focusedNoGlow.beforeContent, 'none', `${label}: composerGlow=false removes prismatic ::before rim on focus`);
  assert.notEqual(focusedNoGlow.borderColor, resting.borderColor, `${label}: composerGlow=false keeps calm static accent focus border`);

  await patchConfig(page, { composerGlow: true, motionLevel: 'off' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-op-motion') === 'off');
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert.equal((await readSurfaceState()).beforeContent, 'none', `${label}: motionLevel=off suppresses prismatic ::before rim`);

  await patchConfig(page, { motionLevel: 'subtle' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-op-motion') === 'subtle');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-op-motion') === 'off');
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert.equal((await readSurfaceState()).beforeContent, 'none', `${label}: prefers-reduced-motion:reduce suppresses prismatic ::before rim`);

  await page.evaluate(() => document.activeElement?.blur?.());
  await page.mouse.move(2, 2);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/**
 * Verifies compact single-line height when the attachment header is empty (including an empty
 * wrapper node), tight internal spacing, multi-line growth, and non-collapsed attachment restore.
 */
async function assertCompactEmptyHeaderAndGrowth(page, host, label, screenshotPath = null) {
  const s = LIVE_SELECTORS[host];
  const headerSel = host === 'chatgpt' ? '.composer-header' : '.file-preview-container';
  await page.evaluate(({ headerSel }) => {
    const hdr = document.querySelector(headerSel);
    window.__savedHeaderNodes = hdr ? [...hdr.childNodes] : [];
    hdr?.replaceChildren();
    ObsidianPrismRuntime.refresh();
  }, { headerSel });
  await page.waitForFunction(sel => {
    const h = document.querySelector(sel);
    return h && h.getAttribute('data-op-composer-header-empty') === 'true' && h.getBoundingClientRect().height <= 0.5;
  }, headerSel);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

  const measureState = () => page.evaluate(({ cardSel, headerSel, editorSel, addSel }) => {
    const card = document.querySelector(cardSel);
    const hdr = document.querySelector(headerSel);
    const ed = card.querySelector(editorSel);
    const add = card.querySelector(addSel);
    const c = card.getBoundingClientRect();
    const h = hdr.getBoundingClientRect();
    const e = ed.getBoundingClientRect();
    const a = add.getBoundingClientRect();
    const bt = parseFloat(getComputedStyle(card).borderTopWidth) || 0;
    return {
      cardH: Math.round(c.height * 10) / 10,
      headerH: Math.round(h.height * 10) / 10,
      editorH: Math.round(e.height * 10) / 10,
      topGap: Math.round((e.top - (c.top + bt)) * 10) / 10,
      toolbarGap: Math.round((a.top - e.bottom) * 10) / 10
    };
  }, { cardSel: CARD[host], headerSel, editorSel: s.editor, addSel: s.add });

  const single = await measureState();
  assert.ok(single.headerH <= 0.5, `${label}: empty attachment header collapses to 0px (got ${single.headerH}px)`);
  assert.ok(single.editorH >= 36, `${label}: single-line editor has comfortable >= 36px height (got ${single.editorH}px)`);
  assert.ok(single.cardH <= 108, `${label}: empty-header single-line composer card stays compact <= 108px (got ${single.cardH}px)`);
  assert.ok(single.topGap <= 16, `${label}: editor sits cleanly below top padding (${single.topGap}px <= 16px)`);
  assert.ok(single.toolbarGap >= 4 && single.toolbarGap <= 10, `${label}: balanced breathing gap between editor and toolbar (${single.toolbarGap}px)`);

  // Placeholder uses muted low-saturation palette token (--op-placeholder).
  const placeholderColors = await page.evaluate(({ host }) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--op-placeholder)';
    document.body.append(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    const target = host === 'chatgpt'
      ? document.querySelector('#prompt-textarea p.placeholder')
      : document.querySelector('.ql-editor.ql-blank');
    const actual = target ? getComputedStyle(target, '::before').color : null;
    return { expected, actual };
  }, { host });
  assert.equal(placeholderColors.actual, placeholderColors.expected, `${label}: empty editor placeholder uses muted --op-placeholder`);

  // Empty wrapper inside header also collapses cleanly.
  await page.evaluate(sel => {
    const hdr = document.querySelector(sel);
    const wrapper = document.createElement('div');
    wrapper.id = 'prism-empty-hdr-wrapper';
    hdr.append(wrapper);
    ObsidianPrismRuntime.refresh();
  }, headerSel);
  await page.waitForFunction(sel => document.querySelector(sel)?.getBoundingClientRect().height <= 0.5, headerSel);
  const withEmptyWrapper = await measureState();
  assert.ok(withEmptyWrapper.headerH <= 0.5, `${label}: empty-wrapper header still collapses to 0px (got ${withEmptyWrapper.headerH}px)`);
  await page.evaluate(() => {
    document.getElementById('prism-empty-hdr-wrapper')?.remove();
    ObsidianPrismRuntime.refresh();
  });
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath, caret: 'initial' });
  }

  // Multi-line typing still expands editor & card naturally.
  const editor = page.locator(`${CARD[host]} ${s.editor}`);
  await editor.click();
  await page.keyboard.type('Line 1');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Line 2');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('Line 3');
  const multi = await measureState();
  assert.ok(multi.editorH >= single.editorH + 16, `${label}: multi-line input expands editor (${single.editorH} -> ${multi.editorH})`);
  assert.ok(multi.cardH >= single.cardH + 16, `${label}: multi-line input expands card (${single.cardH} -> ${multi.cardH})`);
  await page.keyboard.press('Enter');
  await page.evaluate(() => { if (window.__hostComposer?.sends?.length) window.__hostComposer.sends.pop(); });
  await editor.evaluate(node => node.blur());

  // Restoring original attachment nodes un-collapses header above the editor.
  await page.evaluate(sel => {
    const hdr = document.querySelector(sel);
    hdr.replaceChildren(...(window.__savedHeaderNodes || []));
    delete window.__savedHeaderNodes;
    ObsidianPrismRuntime.refresh();
  }, headerSel);
  await page.waitForFunction(sel => !document.querySelector(sel)?.hasAttribute('data-op-composer-header-empty'), headerSel);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const restored = await controlGeometry(page, CARD[host], { attachment: s.attachment, editor: s.editor });
  assert.ok(restored.controls.attachment.bottom <= restored.controls.editor.top + 0.5, `${label}: restored attachment preview renders above editor`);
  return single;
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
        await assertOpticalStatesAndActions(page, host, label, { testPresetsAndGlow: palette === 'obsidian' || palette === 'crystal' });
        await assertHostNodesUnchanged(page, label);
        if (palette === 'obsidian') {
          // caret: 'initial' keeps Playwright from leaving an empty style attribute on the native editor.
          await page.screenshot({ path: path.join(artifacts, `${engine}-${host}-two-row-composer.png`), caret: 'initial' });
          assert.deepEqual(await exerciseComposer(page, host, label), nativeBehaviour, `${label}: input, IME, Enter/Shift+Enter, model menu and upload match native`);
          const compactShot = path.join(artifacts, `${engine}-${host}-compact-composer.png`);
          const compact = await assertCompactEmptyHeaderAndGrowth(page, host, label, compactShot);
          console.log(`PASS ${label} compact empty-header card: ${compact.cardH}px (topGap ${compact.topGap}px, toolbarGap ${compact.toolbarGap}px)`);
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
  await checkWrappedChatGPTTrailing(suite);
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

/**
 * Wrapped trailing & multiline stacked variants observed on live ChatGPT (2026-11-23):
 * 1) Single-line footer: unnamed 3-col grid where the trailing grid item has a pill background
 *    (`rounded-full`, `rgb(33, 33, 33)`) and wraps all controls inside a single inner flex row whose
 *    model branch carries `flex: 1 1 0%; justify-content: flex-end`.
 * 2) Multiline footer: `[primary, leading, trailing]` child order where trailing wraps controls
 *    inside `display: contents` + inner flex row.
 */
const WRAPPED_TRAILING_CSS = `
${POSITIONAL_GRID}
[data-composer-trailing-controls="true"]{justify-self:end;border-radius:9999px;background:rgb(33,33,33)}
.trailing-inner{display:flex;align-items:center;justify-content:flex-end;flex-shrink:0}
.trailing-picker-wrap{display:flex;min-width:0;flex:1 1 0%;justify-content:flex-end}
[data-composer-trailing-picker="true"]{padding:0 4px 0 0}
.trailing-actions-group{display:flex;flex-shrink:0;align-items:center;gap:4px}
`;

async function checkWrappedChatGPTTrailing(suite) {
  const { engine, artifacts } = suite;
  const host = 'chatgpt';

  // 1) Wrapped trailing single-line footer variant
  await onLiveFixture(suite, host, { failure: 'chatgpt-wrapped-trailing-failure', initial: { themeMode: 'dark' } }, async ({ page, errors }) => {
    await page.addStyleTag({ content: WRAPPED_TRAILING_CSS });
    await page.locator(LIVE_SELECTORS.chatgpt.composerGrid).evaluate(grid => {
      const expansion = document.createElement('div');
      expansion.setAttribute('data-composer-expansion-control', '');
      expansion.style.cssText = 'position:absolute;width:0;height:0';
      const trailing = grid.querySelector('.composer-trailing');
      trailing.setAttribute('data-composer-trailing-controls', 'true');
      const model = trailing.querySelector('button[aria-label="Select ChatGPT model"]');
      const dictate = trailing.querySelector('button[aria-label="Dictate"]');
      const voice = trailing.querySelector('button[aria-label="Start Voice"]');
      model.querySelector('span').textContent = 'Pro';

      const inner = document.createElement('div');
      inner.className = 'trailing-inner';
      const pickerWrap = document.createElement('div');
      pickerWrap.className = 'trailing-picker-wrap';
      const picker = document.createElement('div');
      picker.setAttribute('data-composer-trailing-picker', 'true');
      const popSpan = document.createElement('span');
      popSpan.append(model);
      picker.append(popSpan);
      pickerWrap.append(picker);

      const actionsGroup = document.createElement('div');
      actionsGroup.className = 'trailing-actions-group';
      actionsGroup.append(dictate, voice);

      inner.append(pickerWrap, actionsGroup);
      trailing.replaceChildren(inner);
      grid.insertBefore(expansion, trailing);
    });

    await waitForShape(page, host, 'single-row', 'chatgpt wrapped trailing native');
    const nativeSnapshot = await cardSnapshot(page, host, { geometry: true });
    await rememberHostNodes(page);

    await injectExtension(page, suite);
    for (const [theme, palette] of [['dark', 'obsidian'], ['light', 'crystal']]) {
      const label = `${engine} chatgpt wrapped trailing ${theme} (${palette})`;
      const paletteKey = theme === 'dark' ? 'palette' : 'lightPreset';
      await patchConfig(page, { themeMode: theme, [paletteKey]: palette });
      await page.waitForFunction(([t, p]) =>
        document.documentElement.getAttribute('data-op-scheme') === t &&
        document.documentElement.getAttribute('data-op-effective-palette') === p,
        [theme, palette]);
      await waitForShape(page, host, 'two-row', label);
      await assertTwoRow(page, host, label);
      await assertHostNodesUnchanged(page, label);

      const state = await page.locator(CARD.chatgpt).evaluate(() => {
        const shell = document.querySelector('[data-composer-trailing-controls]');
        const inner = document.querySelector('.trailing-inner');
        const pickerWrap = document.querySelector('.trailing-picker-wrap');
        const model = document.querySelector('button[aria-label="Select ChatGPT model"]');
        const sc = getComputedStyle(shell);
        return {
          shellBg: sc.backgroundColor,
          shellRadius: sc.borderTopLeftRadius,
          shellToolbarAttr: shell.getAttribute('data-op-composer-toolbar'),
          innerToolbarAttr: inner.getAttribute('data-op-composer-toolbar'),
          pickerWrapCapsuleItem: pickerWrap.getAttribute('data-op-model-capsule-item'),
          pickerWrapWidth: pickerWrap.getBoundingClientRect().width,
          modelWidth: model.getBoundingClientRect().width
        };
      });
      assert.equal(state.shellBg, 'rgba(0, 0, 0, 0)', `${label}: outer trailing shell clears native pill background`);
      assert.equal(state.shellRadius, '0px', `${label}: outer trailing shell clears pill border-radius`);
      assert.equal(state.shellToolbarAttr, null, `${label}: outer shell is not marked data-op-composer-toolbar`);
      assert.equal(state.innerToolbarAttr, 'true', `${label}: inner flex row is marked data-op-composer-toolbar`);
      assert.equal(state.pickerWrapCapsuleItem, 'true', `${label}: picker branch is marked data-op-model-capsule-item`);
      assert.ok(state.pickerWrapWidth < 180, `${label}: picker branch stays compact (${state.pickerWrapWidth}px), not stretched by flex-1`);
      assert.ok(state.modelWidth < 180, `${label}: Model Capsule button stays compact (${state.modelWidth}px)`);

      if (theme === 'dark' && palette === 'obsidian') {
        await page.evaluate(() => {
          const hdr = document.querySelector('.composer-header');
          window.__savedWrappedHdr = [...hdr.childNodes];
          hdr.replaceChildren();
          ObsidianPrismRuntime.refresh();
        });
        await page.waitForFunction(() => document.querySelector('.composer-header')?.getAttribute('data-op-composer-header-empty') === 'true');
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        const wrappedCompact = await page.evaluate(() => {
          const card = document.querySelector('[data-composer-layout]');
          const hdr = document.querySelector('.composer-header');
          return {
            cardH: Math.round(card.getBoundingClientRect().height * 10) / 10,
            hdrH: Math.round(hdr.getBoundingClientRect().height * 10) / 10,
            hdrEmptyAttr: hdr.getAttribute('data-op-composer-header-empty')
          };
        });
        assert.equal(wrappedCompact.hdrEmptyAttr, 'true', `${label}: empty header gets data-op-composer-header-empty`);
        assert.ok(wrappedCompact.hdrH <= 0.5, `${label}: empty header collapses to 0px (got ${wrappedCompact.hdrH}px)`);
        assert.ok(wrappedCompact.cardH <= 108, `${label}: wrapped compact card <= 108px (got ${wrappedCompact.cardH}px)`);
        await page.evaluate(() => {
          const hdr = document.querySelector('.composer-header');
          hdr.replaceChildren(...(window.__savedWrappedHdr || []));
          delete window.__savedWrappedHdr;
          ObsidianPrismRuntime.refresh();
        });
        await page.waitForFunction(() => !document.querySelector('.composer-header')?.hasAttribute('data-op-composer-header-empty'));
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        if (engine === 'chromium' && artifacts) {
          await page.locator(CARD.chatgpt).screenshot({ path: path.join(artifacts, `${engine}-chatgpt-wrapped-composer.png`), caret: 'initial' });
        }
      }
    }

    for (const [name, off, on] of [
      ['composerRestyle off', { composerRestyle: false }, { composerRestyle: true }],
      ['Native Palette', { lightPreset: 'host' }, { lightPreset: 'crystal' }]
    ]) {
      await patchConfig(page, off);
      await waitForShape(page, host, 'single-row', `${engine} chatgpt wrapped ${name}`);
      assert.deepEqual(await cardSnapshot(page, host), stripGeometry(nativeSnapshot), `${engine} chatgpt wrapped ${name}: native grid restored without attribute or layout residue`);
      await patchConfig(page, on);
      await waitForShape(page, host, 'two-row', `${engine} chatgpt wrapped ${name} back on`);
    }

    await patchConfig(page, { themeMode: 'dark', palette: 'obsidian' });
    await page.waitForFunction(() =>
      document.documentElement.getAttribute('data-op-scheme') === 'dark' &&
      document.documentElement.getAttribute('data-op-effective-palette') === 'obsidian'
    );
    await waitForShape(page, host, 'two-row', `${engine} chatgpt wrapped dark obsidian`);

    await patchConfig(page, { enabled: false });
    await waitForShape(page, host, 'single-row', `${engine} chatgpt wrapped extension disabled`);
    assert.deepEqual(await cardSnapshot(page, host, { geometry: true }), nativeSnapshot, `${engine} chatgpt wrapped extension disabled: native composer restored exactly`);
    await patchConfig(page, { enabled: true });
    await waitForShape(page, host, 'two-row', `${engine} chatgpt wrapped re-enabled`);
    await page.evaluate(() => ObsidianPrismRuntime.stop());
    await waitForShape(page, host, 'single-row', `${engine} chatgpt wrapped stopped`);
    assert.deepEqual(await cardSnapshot(page, host, { geometry: true }), nativeSnapshot, `${engine} chatgpt wrapped stopped: native composer restored exactly`);
    await assertHostNodesUnchanged(page, `${engine} chatgpt wrapped stopped`);
    assert.deepEqual(errors, []);
    console.log(`PASS ${engine} chatgpt wrapped trailing: outer pill cleared, compact left Pro capsule, right actions, reversible`);
  });

  // 2) Multiline stacked variant ([header, primary, leading, trailing] + display: contents)
  await onLiveFixture(suite, host, { failure: 'chatgpt-multiline-stacked-failure', initial: { themeMode: 'dark' } }, async ({ page, errors }) => {
    await page.addStyleTag({
      content: `${POSITIONAL_GRID}
      [class*="composerGrid"]{grid-template-columns:146px 0px minmax(0,1fr)}
      [class*="composerGrid"] > .composer-primary{grid-column:1 / -1;grid-row:2}
      [class*="composerGrid"] > .composer-leading{grid-column:1;grid-row:3}
      [class*="composerGrid"] > [data-composer-trailing-controls]{grid-column:3;grid-row:3;justify-self:end}
      .trailing-contents{display:contents}
      .trailing-multiline-row{display:flex;align-items:center;justify-content:flex-end;width:100%}
      .trailing-actions-group{display:flex;flex-shrink:0;align-items:center;gap:4px}`
    });
    await page.locator(LIVE_SELECTORS.chatgpt.composerGrid).evaluate(grid => {
      const header = grid.querySelector('.composer-header');
      const primary = grid.querySelector('.composer-primary');
      const leading = grid.querySelector('.composer-leading');
      const trailing = grid.querySelector('.composer-trailing');
      trailing.setAttribute('data-composer-trailing-controls', 'true');
      const model = trailing.querySelector('button[aria-label="Select ChatGPT model"]');
      const dictate = trailing.querySelector('button[aria-label="Dictate"]');
      const voice = trailing.querySelector('button[aria-label="Start Voice"]');
      model.querySelector('span').textContent = 'Pro';

      const contents = document.createElement('div');
      contents.className = 'trailing-contents';
      const row = document.createElement('div');
      row.className = 'trailing-multiline-row';
      const actions = document.createElement('div');
      actions.className = 'trailing-actions-group';
      actions.append(dictate, voice);
      row.append(model, actions);
      contents.append(row);
      trailing.replaceChildren(contents);
      grid.replaceChildren(header, primary, leading, trailing);
    });

    const nativeSnapshot = await cardSnapshot(page, host, { geometry: true });
    await rememberHostNodes(page);

    await injectExtension(page, suite);
    const label = `${engine} chatgpt multiline stacked`;
    await page.waitForFunction(() => document.querySelector('[data-op-composer-grid="true"]'));
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await assertTwoRow(page, host, label);
    await assertHostNodesUnchanged(page, label);

    const multiState = await page.locator(CARD.chatgpt).evaluate(() => {
      const row = document.querySelector('.trailing-multiline-row');
      const model = document.querySelector('button[aria-label="Select ChatGPT model"]');
      return {
        rowToolbar: row.getAttribute('data-op-composer-toolbar'),
        modelItem: model.getAttribute('data-op-model-capsule-item'),
        modelWidth: model.getBoundingClientRect().width
      };
    });
    assert.equal(multiState.rowToolbar, 'true', `${label}: inner multiline row is marked data-op-composer-toolbar`);
    assert.equal(multiState.modelItem, 'true', `${label}: model button directly inside multiline row is marked data-op-model-capsule-item`);
    assert.ok(multiState.modelWidth < 180, `${label}: model capsule stays compact (${multiState.modelWidth}px)`);

    // Ambiguous extra control group keeps grid native.
    await page.locator(LIVE_SELECTORS.chatgpt.composerGrid).evaluate(grid => {
      const extra = document.createElement('div');
      extra.id = 'host-extra-controls';
      extra.innerHTML = '<button type="button" aria-label="Extra tool">x</button>';
      grid.append(extra);
    });
    await page.evaluate(() => ObsidianPrismRuntime.refresh());
    await page.waitForFunction(() => !document.querySelector('[data-op-composer-grid="true"]'));
    assert.equal(await page.locator(LIVE_SELECTORS.chatgpt.composerGrid).evaluate(n => getComputedStyle(n).gridTemplateAreas), 'none');
    await page.evaluate(() => document.getElementById('host-extra-controls').remove());
    await page.evaluate(() => ObsidianPrismRuntime.refresh());
    await page.waitForFunction(() => Boolean(document.querySelector('[data-op-composer-grid="true"]')));

    await page.evaluate(() => ObsidianPrismRuntime.stop());
    await page.waitForFunction(() => !document.querySelector('[data-op-composer-grid="true"]'));
    assert.deepEqual(await cardSnapshot(page, host, { geometry: true }), nativeSnapshot, `${label} stopped: native composer restored exactly`);
    await assertHostNodesUnchanged(page, `${label} stopped`);
    assert.deepEqual(errors, []);
    console.log(`PASS ${label}: [primary, leading, trailing] grid & display:contents trailing resolved and reversible`);
  });
}

function stripGeometry(snapshot) {
  return snapshot.map(({ tag, attrs, layout }) => ({ tag, attrs, layout }));
}
