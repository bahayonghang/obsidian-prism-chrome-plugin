'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./helpers.cjs');

const TOKENS_CSS = fs.readFileSync(path.join(ROOT, 'styles/prism-tokens.css'), 'utf8');
const CSS_FILES = ['styles/common.css', 'styles/host-chatgpt.css', 'styles/host-gemini.css'].map(rel =>
  fs.readFileSync(path.join(ROOT, rel), 'utf8')
);
const HOSTS_CSS = CSS_FILES.join('\n');

function collectSection(marker) {
  const parts = [];
  for (const css of CSS_FILES) {
    const idx = css.indexOf(marker);
    if (idx === -1) continue;
    const nextIdx = css.indexOf('/* === ', idx + marker.length);
    parts.push(nextIdx === -1 ? css.slice(idx) : css.slice(idx, nextIdx));
  }
  return parts.join('\n');
}

const OPTICAL_PALETTES = ['obsidian', 'warm', 'crystal', 'alabaster'];
const BASE_CODE_TOKENS = [
  '--op-code-surface',
  '--op-code-header',
  '--op-code-header-fg',
  '--op-code-header-icon',
  '--op-code-well',
  '--op-code-fg',
  '--op-code-inline-bg',
  '--op-code-inline-fg',
  '--op-code-inline-border'
];
const SYNTAX_TOKENS = [
  '--op-syn-keyword',
  '--op-syn-string',
  '--op-syn-number',
  '--op-syn-function',
  '--op-syn-type',
  '--op-syn-comment',
  '--op-syn-operator',
  '--op-syn-attr'
];

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

function extractVariablesForSelector(rules, exactSelector) {
  const vars = {};
  for (const rule of rules) {
    if (rule.isAtRule) continue;
    const selectors = rule.selector.split(',').map(s => s.replace(/\s+/g, ' ').trim());
    if (!selectors.includes(exactSelector.replace(/\s+/g, ' ').trim())) continue;
    for (const decl of rule.body.split(';')) {
      const colon = decl.indexOf(':');
      if (colon === -1) continue;
      const name = decl.slice(0, colon).trim();
      const value = decl.slice(colon + 1).trim();
      if (name.startsWith('--')) vars[name] = value;
    }
  }
  return vars;
}

function parseOpaqueHexColor(value) {
  const hex = value.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hex) {
    const raw = hex[1];
    const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
    return [
      parseInt(full.slice(0, 2), 16) / 255,
      parseInt(full.slice(2, 4), 16) / 255,
      parseInt(full.slice(4, 6), 16) / 255
    ];
  }
  const rgb = value.trim().match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
  return null;
}

function relativeLuminance(rgb) {
  const linear = rgb.map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(fgValue, bgValue) {
  const fg = parseOpaqueHexColor(fgValue);
  const bg = parseOpaqueHexColor(bgValue);
  assert.ok(fg, `Expected opaque foreground color, got "${fgValue}"`);
  assert.ok(bg, `Expected opaque background color, got "${bgValue}"`);
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

test('prism-tokens.css defines all code surface and syntax tokens for all 4 optical palettes and host palettes', () => {
  const rules = parseCssRules(TOKENS_CSS);
  for (const palette of OPTICAL_PALETTES) {
    const vars = extractVariablesForSelector(rules, `html[data-op-enabled="true"][data-op-effective-palette="${palette}"]`);
    for (const token of [...BASE_CODE_TOKENS, ...SYNTAX_TOKENS]) {
      assert.ok(vars[token], `${palette}: missing required token ${token}`);
    }
  }
  for (const scheme of ['dark', 'light']) {
    const vars = extractVariablesForSelector(rules, `html[data-op-enabled="true"][data-op-effective-palette="host"][data-op-scheme="${scheme}"]`);
    for (const token of BASE_CODE_TOKENS) {
      assert.ok(vars[token], `host (${scheme}): missing base token ${token}`);
    }
  }
});

test('all 4 optical palettes satisfy WCAG AA (>= 4.5:1) contrast for code text, syntax tokens, headers, icons, and inline code', () => {
  const rules = parseCssRules(TOKENS_CSS);
  for (const palette of OPTICAL_PALETTES) {
    const vars = extractVariablesForSelector(rules, `html[data-op-enabled="true"][data-op-effective-palette="${palette}"]`);
    const pairs = [
      ['--op-code-fg', '--op-code-well'],
      ...SYNTAX_TOKENS.map(token => [token, '--op-code-well']),
      ['--op-code-header-fg', '--op-code-header'],
      ['--op-code-header-icon', '--op-code-header'],
      ['--op-code-inline-fg', '--op-code-inline-bg']
    ];
    for (const [fgToken, bgToken] of pairs) {
      const ratio = contrastRatio(vars[fgToken], vars[bgToken]);
      assert.ok(
        ratio >= 4.5,
        `${palette}: ${fgToken} (${vars[fgToken]}) on ${bgToken} (${vars[bgToken]}) contrast ${ratio.toFixed(2)}:1 < 4.5:1`
      );
    }
  }
});

test('hosts.css Code Surface Readability section gates every rule against host palette and preserves sticky/fold behavior', () => {
  const marker = '/* === Code Surface Readability (v0.3.0) === */';
  const section = collectSection(marker);
  assert.ok(section.length > 0, 'split stylesheets must contain the Code Surface Readability (v0.3.0) section');
  const rules = parseCssRules(section);
  assert.ok(rules.length >= 6, 'Code Surface Readability section must define surface, well, header, syntax, and inline rules');

  const checkRuleList = list => {
    for (const rule of list) {
      if (rule.isAtRule) {
        checkRuleList(rule.nested);
        continue;
      }
      const parts = splitTopLevelSelectors(rule.selector);
      for (const sel of parts) {
        assert.ok(
          sel.startsWith('html[data-op-enabled="true"]') && sel.includes(':not([data-op-effective-palette="host"])'),
          `Every selector in Code Surface Readability must gate on enabled=true and :not([data-op-effective-palette="host"]): ${sel}`
        );
      }
      const touchesShell = parts.some(sel =>
        /\[data-op-code-surface="true"\]|code-block|\[data-testid="code-block"\]|\.code-block-wrapper/.test(sel)
      );
      if (touchesShell && !parts.some(sel => /\bpre\b/.test(sel))) {
        assert.equal(
          /overflow\s*:\s*hidden/i.test(rule.body),
          false,
          `Outer code shell rule must not set overflow: hidden (breaks sticky headers): ${rule.selector}`
        );
      }
      if (parts.some(sel => /\bsvg\b/i.test(sel)) && !parts.some(sel => /\[fill\]|\[fill="none"\]/.test(sel))) {
        assert.equal(
          /(?:^|;)\s*fill\s*:/i.test(rule.body),
          false,
          `SVG rule must not unconditionally set fill (would turn stroke icons into solid blocks): ${rule.selector}`
        );
      }
    }
  };
  checkRuleList(rules);

  assert.match(HOSTS_CSS, /\[data-op-sticky-code="true"\][\s\S]*?position:\s*sticky\s*!important;\s*top:\s*0;\s*z-index:\s*5;/);
  assert.match(HOSTS_CSS, /pre\.op-code-folded\s*\{[\s\S]*?max-height:\s*260px\s*!important/);
});

test('v0.4.1 #33: hosts.css resets outer code-block:has(.code-block), colors Material/font icons and computed SVG icon attrs, and scopes Native Math Surface', () => {
  const codeMarker = '/* === Code Surface Readability (v0.3.0) === */';
  const codeSection = collectSection(codeMarker);
  assert.ok(codeSection.length > 0);
  const codeRules = parseCssRules(codeSection);

  const outerResetRule = codeRules.find(rule => !rule.isAtRule && /code-block:has\(\.code-block\)/.test(rule.selector) && !/\.code-block\s*>|>\s*\.code-block/.test(rule.selector));
  assert.ok(outerResetRule, 'Code Surface Readability must explicitly reset outer code-block:has(.code-block)');
  assert.match(outerResetRule.body, /display\s*:\s*block\s*!important/i);
  assert.match(outerResetRule.body, /background\s*:\s*transparent\s*!important/i);
  assert.match(outerResetRule.body, /border\s*:\s*0\s*!important/i);
  assert.match(outerResetRule.body, /padding\s*:\s*0\s*!important/i);

  assert.match(codeSection, /mat-icon|\.google-symbols|\.material-icons/, 'Code Surface Readability must style Material/font icons');
  assert.match(codeSection, /--mat-icon-color\s*:\s*var\(--op-code-header-icon\)/, 'Code Surface Readability must override Material icon CSS variables');
  assert.match(codeSection, /--mdc-icon-button-icon-color\s*:\s*var\(--op-code-header-icon\)/, 'Code Surface Readability must override MDC icon button CSS variables');
  assert.match(codeSection, /\[data-op-code-icon-fill="true"\]:not\(\[fill="none"\]\)/, 'Code Surface Readability must style computed filled SVG marks while preserving :not([fill="none"]) guard');
  assert.match(codeSection, /\[data-op-code-icon-stroke="true"\]:not\(\[stroke="none"\]\)/, 'Code Surface Readability must style computed stroke SVG marks');

  const mathMarker = '/* === Native Math Surface Readability & Overflow (v0.4.1 #33) === */';
  const mathSection = collectSection(mathMarker);
  assert.ok(mathSection.length > 0, 'split stylesheets must contain the Native Math Surface Readability & Overflow (v0.4.1 #33) section');
  const mathRules = parseCssRules(mathSection);
  assert.ok(mathRules.length >= 2, 'Native Math Surface section must define color/background and display overflow rules');

  const checkMathRules = list => {
    for (const rule of list) {
      if (rule.isAtRule) {
        checkMathRules(rule.nested);
        continue;
      }
      for (const sel of splitTopLevelSelectors(rule.selector)) {
        assert.ok(
          sel.startsWith('html[data-op-enabled="true"]') && sel.includes(':not([data-op-effective-palette="host"])'),
          `Every selector in Native Math Surface section must gate on enabled=true and :not([data-op-effective-palette="host"]): ${sel}`
        );
      }
    }
  };
  checkMathRules(mathRules);
  assert.match(mathSection, /var\(--op-fg\)/, 'Native Math Surface must use --op-fg for contrast');
  assert.match(mathSection, /background-color\s*:\s*transparent\s*!important/i, 'Native Math Surface must clear background slabs');
  assert.match(mathSection, /\.math-block[\s\S]*?\.katex-display[\s\S]*?overflow-x\s*:\s*auto\s*!important/i, 'Native Math Surface must contain wide display math with overflow-x: auto');
});

test('v0.4.1 #34: hosts.css scopes Formula Preview rules, hides source cleanly, and inherits host colors under Native Palette', () => {
  const formulaMarker = '/* === Formula Preview (v0.4.1 #34) === */';
  const section = collectSection(formulaMarker);
  assert.ok(section.length > 0, 'split stylesheets must contain the Formula Preview (v0.4.1 #34) section');
  const rules = parseCssRules(section);
  assert.ok(rules.length >= 6, 'Formula Preview section must define source-hidden, preview card, caption, math, fallback, toggle, and Native Palette rules');

  const checkFormulaRules = list => {
    for (const rule of list) {
      if (rule.isAtRule) {
        checkFormulaRules(rule.nested);
        continue;
      }
      for (const sel of splitTopLevelSelectors(rule.selector)) {
        assert.ok(
          sel.startsWith('html[data-op-enabled="true"]'),
          `Every selector in Formula Preview section must gate on html[data-op-enabled="true"]: ${sel}`
        );
      }
    }
  };
  checkFormulaRules(rules);

  assert.match(section, /\[data-op-formula-source-hidden="true"\]\s*\{[\s\S]*?display\s*:\s*none\s*!important/i);
  assert.match(section, /\.op-formula-math[\s\S]*?overflow-x\s*:\s*auto/i);
  assert.match(section, /\[data-op-effective-palette="host"\]\s+\.op-formula-preview\[data-op-owned\][\s\S]*?color\s*:\s*inherit/i);
  assert.match(section, /\[data-op-effective-palette="host"\]\s+\.op-formula-toggle\[data-op-owned\][\s\S]*?color\s*:\s*inherit/i);

  assert.equal(HOSTS_CSS.includes('--op-font-code'), false, 'hosts.css must use --op-code-font-family rather than nonexistent --op-font-code');
  assert.match(section, /\.op-formula-fallback[\s\S]*?var\(--op-code-font-family\)/);
  assert.match(HOSTS_CSS, /:is\(button,\s*\[role="button"\],\s*a\):not\(\.op-formula-toggle\)[\s\S]*?border-color:\s*var\(--op-border-strong\)\s*!important/);
  assert.match(section, /\.op-formula-bar\[data-op-owned\]\[data-op-formula-bare="true"\][\s\S]*?border:\s*1px\s+solid/i);
  assert.match(section, /\.op-formula-preview\[data-op-owned\]\[data-op-formula-bare="true"\][\s\S]*?border:\s*1px\s+solid/i);
  assert.match(section, /\.op-formula-bar\[data-op-owned\]\[data-op-formula-bare="true"\]\s*\+\s*pre:not\(\[data-op-formula-source-hidden="true"\]\)/);
});
