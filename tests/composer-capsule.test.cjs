'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./helpers.cjs');

const HOSTS_CSS = fs.readFileSync(path.join(ROOT, 'styles/hosts.css'), 'utf8');
const SECTION_MARKER = '/* === Reference Composer Surface & Model Capsule (v0.3.0) === */';

function splitTopLevelSelectors(selectorText) {
  const parts = [];
  let parenDepth = 0;
  let bracketDepth = 0;
  let start = 0;
  for (let i = 0; i < selectorText.length; i++) {
    const ch = selectorText[i];
    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === ',' && parenDepth === 0 && bracketDepth === 0) {
      const part = selectorText.slice(start, i).trim();
      if (part) parts.push(part);
      start = i + 1;
    }
  }
  const tail = selectorText.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function parseCssRules(css) {
  const clean = stripCssComments(css);
  const rules = [];
  let i = 0;
  while (i < clean.length) {
    const open = clean.indexOf('{', i);
    if (open === -1) break;
    const selector = clean.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < clean.length && depth > 0) {
      if (clean[j] === '{') depth++;
      else if (clean[j] === '}') depth--;
      j++;
    }
    const body = clean.slice(open + 1, j - 1).trim();
    if (selector.startsWith('@')) {
      rules.push({ selector, body, isAtRule: true, nested: parseCssRules(body) });
    } else if (selector) {
      rules.push({ selector, body, isAtRule: false });
    }
    i = j;
  }
  return rules;
}

function flattenRules(rules) {
  const out = [];
  for (const rule of rules) {
    if (rule.isAtRule) out.push(...flattenRules(rule.nested));
    else out.push(rule);
  }
  return out;
}

function sliceSection(marker = SECTION_MARKER) {
  const idx = HOSTS_CSS.indexOf(marker);
  assert.notEqual(idx, -1, `hosts.css must contain the ${marker} section`);
  const nextIdx = HOSTS_CSS.indexOf('/* === ', idx + marker.length);
  return nextIdx === -1 ? HOSTS_CSS.slice(idx) : HOSTS_CSS.slice(idx, nextIdx);
}

test('hosts.css Reference Composer Surface & Model Capsule section strictly gates every rule and forbids DOM hiding', () => {
  const section = sliceSection();
  const rules = flattenRules(parseCssRules(section));
  assert.ok(rules.length >= 14, 'section must define composer surface, editor, attachments, tools, add button, model capsule, pseudo star, tier, primary action, secondary toolbar buttons, and chip rules');

  for (const rule of rules) {
    const parts = splitTopLevelSelectors(rule.selector);
    assert.ok(parts.length > 0);
    for (const sel of parts) {
      assert.ok(
        sel.startsWith('html[data-op-enabled="true"][data-op-composer="true"]') &&
          sel.includes(':not([data-op-effective-palette="host"])'),
        `Every selector must strictly gate on enabled=true, composer=true, and :not([data-op-effective-palette="host"]): ${sel}`
      );
    }
    assert.equal(
      /\bdisplay\s*:\s*none\b/i.test(rule.body),
      false,
      `Section must never hide host DOM via display: none: ${rule.selector}`
    );
  }
});

test('hosts.css defines Prism optical composer card (single 1px border, no outline), compact editor, attachment cards, and glow focus rules', () => {
  const rules = flattenRules(parseCssRules(sliceSection()));
  const findBySelector = pred => rules.find(r => splitTopLevelSelectors(r.selector).some(pred));

  const surfaceRule = findBySelector(s =>
    s.endsWith('[data-op-composer-surface="true"]') &&
    !s.includes('[data-op-composer-glow="true"]') &&
    !s.includes(':focus-within')
  );
  assert.ok(surfaceRule, 'must define upgraded [data-op-composer-surface="true"] card rule');
  assert.match(surfaceRule.body, /padding:\s*8px 12px 7px\s*!important/);
  assert.match(surfaceRule.body, /border-radius:\s*calc\(var\(--op-radius-md\)\s*\+\s*4px\)\s*!important/);
  assert.match(surfaceRule.body, /border:\s*1px solid var\(--op-border-strong\)\s*!important/);
  assert.match(surfaceRule.body, /outline:\s*none\s*!important/);
  assert.match(surfaceRule.body, /box-shadow:[\s\S]*inset 0 1px 0 var\(--op-glass-specular\)/);
  for (const r of rules) {
    if (splitTopLevelSelectors(r.selector).some(s => s.includes('[data-op-composer-surface="true"]'))) {
      assert.doesNotMatch(r.body, /\boutline-color\b/, 'composer surface must never reintroduce a second outline');
    }
  }

  const geminiInputAreaRule = findBySelector(s => s.includes('[data-op-host="gemini"]') && s.includes('input-area-v2:has([data-op-composer-surface="true"])'));
  assert.ok(geminiInputAreaRule, 'must reset outer input-area-v2 vertical padding on Gemini');
  assert.match(geminiInputAreaRule.body, /padding-top:\s*0\s*!important/);
  assert.match(geminiInputAreaRule.body, /padding-bottom:\s*0\s*!important/);

  const editorRule = findBySelector(s =>
    s.includes('[data-op-composer-surface="true"]') &&
    s.includes('textarea') &&
    s.includes('[contenteditable="true"]') &&
    s.includes('.ql-editor')
  );
  assert.ok(editorRule, 'must define editor rule covering textarea, [contenteditable="true"], and .ql-editor');
  assert.match(editorRule.body, /min-height:\s*24px/);
  assert.match(editorRule.body, /padding-top:\s*2px\s*!important/);
  assert.match(editorRule.body, /padding-bottom:\s*2px\s*!important/);
  assert.match(editorRule.body, /line-height:\s*1\.45/);
  assert.match(editorRule.body, /caret-color:\s*var\(--op-accent\)/);

  const attachmentRule = findBySelector(s => s.endsWith('[data-op-composer-attachment="true"]'));
  assert.ok(attachmentRule, 'must define compact rounded-square [data-op-composer-attachment="true"] card rule');
  assert.match(attachmentRule.body, /border-radius:\s*var\(--op-radius-md\)\s*!important/);
  assert.match(attachmentRule.body, /border:\s*1px solid var\(--op-border-strong\)\s*!important/);
  assert.match(attachmentRule.body, /background:\s*var\(--op-secondary\)\s*!important/);
  assert.match(attachmentRule.body, /color:\s*var\(--op-fg\)\s*!important/);
  assert.match(attachmentRule.body, /padding:\s*6px 10px\s*!important/);

  const toolsRule = findBySelector(s => s.includes('[data-op-composer-surface="true"]') && s.includes('.composer-tools'));
  assert.ok(toolsRule, 'must define .composer-tools spacing rule');
  assert.match(toolsRule.body, /margin-top:\s*6px/);

  const glowRule = findBySelector(s =>
    s.includes('[data-op-composer-glow="true"]') && s.includes('[data-op-composer-surface="true"]')
  );
  assert.ok(glowRule, 'must preserve [data-op-composer-glow="true"] integration');

  const focusRule = findBySelector(s => s.includes('[data-op-composer-surface="true"]:focus-within'));
  assert.ok(focusRule, 'must preserve :focus-within integration');
});

test('hosts.css defines circular + add trigger, four-pointed star Model Capsule, ink primary action, ghost toolbar buttons, and two-row left-capsule grid', () => {
  const rules = flattenRules(parseCssRules(sliceSection()));
  const findBySelector = pred => rules.find(r => splitTopLevelSelectors(r.selector).some(pred));

  const addRule = findBySelector(s => s.endsWith('[data-op-composer-add="true"]'));
  assert.ok(addRule, 'must define [data-op-composer-add="true"] rule');
  assert.match(addRule.body, /min-width:\s*28px\s*!important/);
  assert.match(addRule.body, /width:\s*28px/);
  assert.match(addRule.body, /height:\s*28px\s*!important/);
  assert.match(addRule.body, /padding:\s*0\s*!important/);
  assert.match(addRule.body, /border-radius:\s*999px\s*!important/);
  assert.match(addRule.body, /display:\s*inline-flex/);
  assert.match(addRule.body, /align-items:\s*center/);
  assert.match(addRule.body, /justify-content:\s*center/);
  assert.match(addRule.body, /border:\s*1px solid var\(--op-border-strong\)\s*!important/);
  assert.match(addRule.body, /background:\s*var\(--op-secondary\)\s*!important/);

  const addHover = findBySelector(s => s.endsWith('[data-op-composer-add="true"]:hover'));
  assert.ok(addHover, 'must define [data-op-composer-add="true"]:hover rule');
  const addFocus = findBySelector(s => s.endsWith('[data-op-composer-add="true"]:focus-visible'));
  assert.ok(addFocus, 'must define [data-op-composer-add="true"]:focus-visible rule');
  assert.match(addFocus.body, /outline:\s*2px solid var\(--op-accent\)/);
  assert.match(addFocus.body, /outline-offset:\s*2px/);

  const capsuleRule = findBySelector(s => s.endsWith('[data-op-model-capsule="true"]'));
  assert.ok(capsuleRule, 'must define [data-op-model-capsule="true"] rule');
  assert.match(capsuleRule.body, /border-radius:\s*999px\s*!important/);
  assert.match(capsuleRule.body, /border:\s*1px solid color-mix\(in srgb,\s*var\(--op-accent\)\s*22%,\s*var\(--op-border-strong\)\)\s*!important/);
  assert.match(capsuleRule.body, /background:\s*color-mix\(in srgb,\s*var\(--op-accent\)\s*5%,\s*var\(--op-secondary\)\)\s*!important/);
  assert.match(capsuleRule.body, /color:\s*var\(--op-fg\)\s*!important/);
  assert.match(capsuleRule.body, /padding:\s*3px 9px\s*!important/);
  assert.match(capsuleRule.body, /min-height:\s*28px\s*!important/);
  assert.match(capsuleRule.body, /height:\s*28px\s*!important/);
  assert.match(capsuleRule.body, /gap:\s*6px\s*!important/);
  assert.match(capsuleRule.body, /display:\s*inline-flex\s*!important/);
  assert.match(capsuleRule.body, /align-items:\s*center\s*!important/);

  const capsuleStar = findBySelector(s => s.endsWith('[data-op-model-capsule="true"]::before'));
  assert.ok(capsuleStar, 'must define pure-CSS ::before 4-pointed star on [data-op-model-capsule="true"]');
  assert.match(capsuleStar.body, /content:\s*["']{2}/);
  assert.match(capsuleStar.body, /width:\s*11px/);
  assert.match(capsuleStar.body, /height:\s*11px/);
  assert.doesNotMatch(capsuleStar.body, /border-radius:\s*50%/);
  assert.match(capsuleStar.body, /clip-path:\s*polygon\(/);
  assert.match(capsuleStar.body, /background:\s*var\(--op-accent\)/);
  assert.match(capsuleStar.body, /flex:\s*none/);

  const capsuleTier = findBySelector(s =>
    s.includes('[data-op-model-capsule="true"]') &&
    s.includes('.model-tier') &&
    s.includes('.mode-tier')
  );
  assert.ok(capsuleTier, 'must style :is(.model-tier, .mode-tier) inside [data-op-model-capsule="true"]');
  assert.match(capsuleTier.body, /color:\s*var\(--op-accent\)\s*!important/);
  assert.match(capsuleTier.body, /font-weight:\s*600/);

  const capsuleReasoningTier = findBySelector(s =>
    s.includes('[data-op-model-capsule="true"][data-selected-reasoning-effort]') &&
    s.includes('> span')
  );
  assert.ok(capsuleReasoningTier, 'must accent ChatGPT live tier > span on [data-selected-reasoning-effort]');
  assert.match(capsuleReasoningTier.body, /color:\s*var\(--op-accent\)\s*!important/);
  assert.match(capsuleReasoningTier.body, /font-weight:\s*600/);

  const primaryRule = findBySelector(s => s.endsWith('[data-op-composer-primary-action="true"]'));
  assert.ok(primaryRule, 'must define [data-op-composer-primary-action="true"] ink button base rule');
  assert.match(primaryRule.body, /width:\s*30px\s*!important/);
  assert.match(primaryRule.body, /min-width:\s*30px\s*!important/);
  assert.match(primaryRule.body, /height:\s*30px\s*!important/);
  assert.match(primaryRule.body, /border-radius:\s*999px\s*!important/);

  const primaryLight = findBySelector(s => s.includes('[data-op-scheme="light"]') && s.endsWith('[data-op-composer-primary-action="true"]'));
  assert.ok(primaryLight, 'must define light-scheme deep ink primary action button');
  assert.match(primaryLight.body, /background:\s*var\(--op-fg\)\s*!important/);
  assert.match(primaryLight.body, /color:\s*var\(--op-card\)\s*!important/);

  const primaryDark = findBySelector(s => s.includes('[data-op-scheme="dark"]') && s.endsWith('[data-op-composer-primary-action="true"]'));
  assert.ok(primaryDark, 'must define dark-scheme bright primary action button');
  assert.match(primaryDark.body, /background:\s*var\(--op-fg\)\s*!important/);
  assert.match(primaryDark.body, /color:\s*var\(--op-bg\)\s*!important/);

  const primaryDisabled = findBySelector(s => s.includes('[data-op-composer-primary-action="true"]:is(:disabled'));
  assert.ok(primaryDisabled, 'must define disabled primary action state');
  assert.match(primaryDisabled.body, /background:\s*var\(--op-secondary\)\s*!important/);
  assert.match(primaryDisabled.body, /color:\s*var\(--op-fg-muted\)\s*!important/);

  const secondaryGhost = findBySelector(s => s.includes('[data-op-composer-toolbar="true"]') && s.includes(':not(') && !s.includes(':hover') && !s.includes(':focus-visible'));
  assert.ok(secondaryGhost, 'must define ghost secondary button styling inside [data-op-composer-toolbar="true"]');
  assert.match(secondaryGhost.body, /background:\s*transparent\s*!important/);
  assert.match(secondaryGhost.body, /border-color:\s*transparent\s*!important/);
  assert.match(secondaryGhost.body, /color:\s*var\(--op-fg-secondary\)\s*!important/);
  assert.match(secondaryGhost.body, /height:\s*28px\s*!important/);
  assert.match(secondaryGhost.body, /min-height:\s*28px\s*!important/);

  const motionOffRule = findBySelector(s => s.includes('[data-op-motion="off"]') && s.includes('[data-op-composer-primary-action="true"]'));
  assert.ok(motionOffRule, 'motion="off" rule must disable transitions on [data-op-composer-primary-action="true"]');

  const chipRule = findBySelector(s => s.endsWith('[data-op-composer-chip="true"]'));
  assert.ok(chipRule, 'must define [data-op-composer-chip="true"] rule');
  assert.match(chipRule.body, /border-radius:\s*999px\s*!important/);
  assert.match(chipRule.body, /border:\s*1px solid var\(--op-border-strong\)\s*!important/);
  assert.match(chipRule.body, /background:\s*var\(--op-secondary\)\s*!important/);
  assert.match(chipRule.body, /color:\s*var\(--op-fg-secondary\)\s*!important/);
  assert.match(chipRule.body, /padding:\s*3px 10px\s*!important/);

  const twoRowRules = flattenRules(parseCssRules(sliceSection('/* === v0.3.1 #19 two-row composer')));
  const findTwoRow = pred => twoRowRules.find(r => splitTopLevelSelectors(r.selector).some(pred));
  const chatgptGrid = findTwoRow(s => s.includes('[data-op-host="chatgpt"]') && s.endsWith('[data-op-composer-grid="true"]'));
  assert.ok(chatgptGrid);
  assert.match(chatgptGrid.body, /grid-template-columns:\s*auto minmax\(0,\s*1fr\)\s*!important/);
  assert.match(chatgptGrid.body, /grid-template-areas:\s*"header header" "primary primary" "leading trailing"\s*!important/);
  assert.match(chatgptGrid.body, /row-gap:\s*0\s*!important/);

  const geminiGrid = findTwoRow(s => s.includes('[data-op-host="gemini"]') && s.endsWith('[data-op-composer-grid="true"]'));
  assert.ok(geminiGrid);
  assert.match(geminiGrid.body, /grid-template-columns:\s*auto minmax\(0,\s*1fr\)\s*!important/);
  assert.match(geminiGrid.body, /grid-template-areas:\s*"file-preview file-preview" "text-input text-input" "leading-actions trailing-actions"\s*!important/);
  assert.match(geminiGrid.body, /row-gap:\s*0\s*!important/);

  const emptyHeaderCollapse = findTwoRow(s => s.includes('[data-op-composer-header-empty="true"]'));
  assert.ok(emptyHeaderCollapse, 'must collapse empty attachment header rows cleanly');
  assert.match(emptyHeaderCollapse.body, /height:\s*0\s*!important/);

  const toolbarRule = findTwoRow(s => s.endsWith('[data-op-composer-toolbar="true"]'));
  assert.ok(toolbarRule, 'must define [data-op-composer-toolbar="true"] flex row');
  assert.match(toolbarRule.body, /display:\s*flex\s*!important/);
  assert.match(toolbarRule.body, /width:\s*100%\s*!important/);

  const capsuleSlotRule = findTwoRow(s => s.includes('[data-op-composer-toolbar="true"] > [data-op-model-capsule-item="true"]'));
  assert.ok(capsuleSlotRule, 'must order [data-op-model-capsule-item="true"] left with margin-inline-end: auto');
  assert.match(capsuleSlotRule.body, /order:\s*-10\s*!important/);
  assert.match(capsuleSlotRule.body, /margin-inline-end:\s*auto\s*!important/);
  assert.match(capsuleSlotRule.body, /flex-shrink:\s*0\s*!important/);
});
