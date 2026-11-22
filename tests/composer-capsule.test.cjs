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

function sliceSection() {
  const idx = HOSTS_CSS.indexOf(SECTION_MARKER);
  assert.notEqual(idx, -1, 'hosts.css must contain the Reference Composer Surface & Model Capsule (v0.3.0) section');
  const nextIdx = HOSTS_CSS.indexOf('/* === ', idx + SECTION_MARKER.length);
  return nextIdx === -1 ? HOSTS_CSS.slice(idx) : HOSTS_CSS.slice(idx, nextIdx);
}

test('hosts.css Reference Composer Surface & Model Capsule section strictly gates every rule and forbids DOM hiding', () => {
  const section = sliceSection();
  const rules = flattenRules(parseCssRules(section));
  assert.ok(rules.length >= 10, 'section must define composer surface, editor, tools, add button, model capsule, pseudo dot, tier, and chip rules');

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

test('hosts.css defines reference two-line floating composer card, editor breathing room, and glow focus rules', () => {
  const rules = flattenRules(parseCssRules(sliceSection()));
  const findBySelector = pred => rules.find(r => splitTopLevelSelectors(r.selector).some(pred));

  const surfaceRule = findBySelector(s =>
    s.endsWith('[data-op-composer-surface="true"]') &&
    !s.includes('[data-op-composer-glow="true"]') &&
    !s.includes(':focus-within')
  );
  assert.ok(surfaceRule, 'must define upgraded [data-op-composer-surface="true"] card rule');
  assert.match(surfaceRule.body, /padding:\s*14px 16px 12px\s*!important/);
  assert.match(surfaceRule.body, /border-radius:\s*calc\(var\(--op-radius-lg\)\s*\+\s*4px\)\s*!important/);
  assert.match(surfaceRule.body, /box-shadow:[\s\S]*inset 0 1px 0 var\(--op-glass-specular\)/);

  const editorRule = findBySelector(s =>
    s.includes('[data-op-composer-surface="true"]') &&
    s.includes('textarea') &&
    s.includes('[contenteditable="true"]') &&
    s.includes('.ql-editor')
  );
  assert.ok(editorRule, 'must define editor rule covering textarea, [contenteditable="true"], and .ql-editor');
  assert.match(editorRule.body, /min-height:\s*44px/);
  assert.match(editorRule.body, /padding-bottom:\s*6px/);
  assert.match(editorRule.body, /caret-color:\s*var\(--op-accent\)/);

  const toolsRule = findBySelector(s => s.includes('[data-op-composer-surface="true"]') && s.includes('.composer-tools'));
  assert.ok(toolsRule, 'must define .composer-tools spacing rule');
  assert.match(toolsRule.body, /margin-top:\s*10px/);

  const glowRule = findBySelector(s =>
    s.includes('[data-op-composer-glow="true"]') && s.includes('[data-op-composer-surface="true"]')
  );
  assert.ok(glowRule, 'must preserve [data-op-composer-glow="true"] integration');

  const focusRule = findBySelector(s => s.includes('[data-op-composer-surface="true"]:focus-within'));
  assert.ok(focusRule, 'must preserve :focus-within integration');
});

test('hosts.css defines circular + add trigger, in-place Model Capsule with ::before indicator dot, and unified composer chips', () => {
  const rules = flattenRules(parseCssRules(sliceSection()));
  const findBySelector = pred => rules.find(r => splitTopLevelSelectors(r.selector).some(pred));

  const addRule = findBySelector(s => s.endsWith('[data-op-composer-add="true"]'));
  assert.ok(addRule, 'must define [data-op-composer-add="true"] rule');
  assert.match(addRule.body, /min-width:\s*32px\s*!important/);
  assert.match(addRule.body, /width:\s*32px/);
  assert.match(addRule.body, /height:\s*32px\s*!important/);
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
  assert.match(capsuleRule.body, /border:\s*1px solid color-mix\(in srgb,\s*var\(--op-accent\)\s*26%,\s*var\(--op-border-strong\)\)\s*!important/);
  assert.match(capsuleRule.body, /background:\s*color-mix\(in srgb,\s*var\(--op-accent\)\s*7%,\s*var\(--op-secondary\)\)\s*!important/);
  assert.match(capsuleRule.body, /color:\s*var\(--op-fg\)\s*!important/);
  assert.match(capsuleRule.body, /padding:\s*5px 11px\s*!important/);
  assert.match(capsuleRule.body, /gap:\s*6px\s*!important/);
  assert.match(capsuleRule.body, /display:\s*inline-flex\s*!important/);
  assert.match(capsuleRule.body, /align-items:\s*center\s*!important/);

  const capsuleDot = findBySelector(s => s.endsWith('[data-op-model-capsule="true"]::before'));
  assert.ok(capsuleDot, 'must define pure-CSS ::before indicator dot on [data-op-model-capsule="true"]');
  assert.match(capsuleDot.body, /content:\s*["']{2}/);
  assert.match(capsuleDot.body, /width:\s*6px/);
  assert.match(capsuleDot.body, /height:\s*6px/);
  assert.match(capsuleDot.body, /border-radius:\s*50%/);
  assert.match(capsuleDot.body, /background:\s*var\(--op-accent\)/);
  assert.match(capsuleDot.body, /flex:\s*none/);

  const capsuleTier = findBySelector(s =>
    s.includes('[data-op-model-capsule="true"]') &&
    s.includes('.model-tier') &&
    s.includes('.mode-tier')
  );
  assert.ok(capsuleTier, 'must style :is(.model-tier, .mode-tier) inside [data-op-model-capsule="true"]');
  assert.match(capsuleTier.body, /color:\s*var\(--op-accent\)\s*!important/);
  assert.match(capsuleTier.body, /font-weight:\s*600/);

  const capsuleHover = findBySelector(s => s.endsWith('[data-op-model-capsule="true"]:hover'));
  assert.ok(capsuleHover, 'must define [data-op-model-capsule="true"]:hover rule');
  const capsuleFocus = findBySelector(s => s.endsWith('[data-op-model-capsule="true"]:focus-visible'));
  assert.ok(capsuleFocus, 'must define [data-op-model-capsule="true"]:focus-visible rule');
  assert.match(capsuleFocus.body, /outline:\s*2px solid var\(--op-accent\)/);
  assert.match(capsuleFocus.body, /outline-offset:\s*2px/);

  const chipRule = findBySelector(s => s.endsWith('[data-op-composer-chip="true"]'));
  assert.ok(chipRule, 'must define [data-op-composer-chip="true"] rule');
  assert.match(chipRule.body, /border-radius:\s*999px\s*!important/);
  assert.match(chipRule.body, /border:\s*1px solid var\(--op-border-strong\)\s*!important/);
  assert.match(chipRule.body, /background:\s*var\(--op-secondary\)\s*!important/);
  assert.match(chipRule.body, /color:\s*var\(--op-fg-secondary\)\s*!important/);
  assert.match(chipRule.body, /padding:\s*5px 11px\s*!important/);

  const chipHover = findBySelector(s => s.endsWith('[data-op-composer-chip="true"]:hover'));
  assert.ok(chipHover, 'must define [data-op-composer-chip="true"]:hover rule');
  const chipFocus = findBySelector(s => s.endsWith('[data-op-composer-chip="true"]:focus-visible'));
  assert.ok(chipFocus, 'must define [data-op-composer-chip="true"]:focus-visible rule');
  assert.match(chipFocus.body, /outline:\s*2px solid var\(--op-accent\)/);
  assert.match(chipFocus.body, /outline-offset:\s*2px/);
});
