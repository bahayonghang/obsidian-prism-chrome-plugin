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

const TWO_ROW_MARKER = '/* === v0.3.1 #19 two-row composer';

test('hosts.css Reference Composer Surface, Model Capsule, and two-row sections strictly gate every rule and forbid DOM hiding', () => {
  for (const marker of [SECTION_MARKER, TWO_ROW_MARKER]) {
    const section = sliceSection(marker);
    const rules = flattenRules(parseCssRules(section));
    assert.ok(rules.length >= 6, `${marker} section must define composer rules`);

    for (const rule of rules) {
      const parts = splitTopLevelSelectors(rule.selector);
      assert.ok(parts.length > 0);
      for (const sel of parts) {
        assert.ok(
          sel.startsWith('html[data-op-enabled="true"][data-op-composer="true"]') &&
            sel.includes(':not([data-op-effective-palette="host"])'),
          `Every selector in ${marker} must strictly gate on enabled=true, composer=true, and :not([data-op-effective-palette="host"]): ${sel}`
        );
      }
      assert.equal(
        /\bdisplay\s*:\s*none\b/i.test(rule.body),
        false,
        `Section ${marker} must never hide host DOM via display: none: ${rule.selector}`
      );
    }
  }
});

test('v0.4.4 #47: hosts.css keeps one canonical Composer Surface rule, no duplicate outline-color, and no resting composerGlow rule', () => {
  const allRules = flattenRules(parseCssRules(HOSTS_CSS));
  const surfaceCardRules = allRules.filter(r =>
    /\b(?:background-color|border-radius|box-shadow)\s*:/.test(r.body) &&
    splitTopLevelSelectors(r.selector).some(s =>
      /(?:^|\s)(?::where\()?\[data-op-composer-surface="true"\]\)?$/.test(s) &&
      !s.includes('[data-op-home="true"]') &&
      !s.includes('[data-op-composer-dock="true"]') &&
      !s.includes('[data-op-motion="off"]') &&
      !s.includes('[data-op-composer-glow="true"]') &&
      !s.includes(':focus-within')
    )
  );
  assert.equal(surfaceCardRules.length, 1, `expected exactly one canonical [data-op-composer-surface="true"] base card rule (no L200 vs L950 duplication), found ${surfaceCardRules.length}`);

  const composerSurfaceRules = allRules.filter(r =>
    splitTopLevelSelectors(r.selector).some(s => s.includes('[data-op-composer-surface="true"]'))
  );
  for (const r of composerSurfaceRules) {
    assert.doesNotMatch(r.body, /\boutline-color\b/, `composer surface must never introduce a second outline: ${r.selector}`);
  }

  const restingGlowRules = allRules.filter(r =>
    splitTopLevelSelectors(r.selector).some(s =>
      s.includes('[data-op-composer-glow="true"]') &&
      s.includes('[data-op-composer-surface="true"]') &&
      !s.includes(':hover') &&
      !s.includes(':focus-within')
    )
  );
  assert.equal(restingGlowRules.length, 0, 'composerGlow must not attach resting-state shadow or rim rules outside :hover/:focus-within');
});
