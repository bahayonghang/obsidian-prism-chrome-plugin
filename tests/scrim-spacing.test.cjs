'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./helpers.cjs');

const hostsCss = fs.readFileSync(path.join(ROOT, 'styles/hosts.css'), 'utf8');
const SECTION_MARKER = '/* === Bottom Spacing & Composer Scrim (v0.3.0) === */';

function splitTopLevelCommas(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function parseRuleBlocks(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(stripped)) !== null) {
    const selectors = splitTopLevelCommas(match[1].replace(/\s+/g, ' ').trim());
    const body = match[2].replace(/\s+/g, ' ').trim();
    blocks.push({ selectors, body });
  }
  return blocks;
}

test('hosts.css includes Bottom Spacing & Composer Scrim section strictly gated off host palette and disabled mode', () => {
  const idx = hostsCss.indexOf(SECTION_MARKER);
  assert.notEqual(idx, -1, 'hosts.css must include Bottom Spacing & Composer Scrim (v0.3.0) marker');
  const nextIdx = hostsCss.indexOf('/* === ', idx + SECTION_MARKER.length);
  const section = nextIdx === -1 ? hostsCss.slice(idx) : hostsCss.slice(idx, nextIdx);
  const blocks = parseRuleBlocks(section);
  assert.ok(blocks.length >= 6, 'scrim & spacing section must define all layout and scrim rules');

  for (const block of blocks) {
    for (const sel of block.selectors) {
      assert.ok(
        sel.includes('html[data-op-enabled="true"]') && sel.includes(':not([data-op-effective-palette="host"])'),
        `selector must gate on enabled + non-host palette: ${sel}`
      );
    }
    assert.equal(/\boverflow(?:-y)?\s*:\s*hidden\b/i.test(block.body), false, `must not apply overflow: hidden in ${block.selectors.join(', ')}`);
  }
});

test('hosts.css tightens ChatGPT active conversation bottom spacer, thread column, and composer container/hint', () => {
  const idx = hostsCss.indexOf(SECTION_MARKER);
  assert.notEqual(idx, -1);
  const nextIdx = hostsCss.indexOf('/* === ', idx + SECTION_MARKER.length);
  const blocks = parseRuleBlocks(nextIdx === -1 ? hostsCss.slice(idx) : hostsCss.slice(idx, nextIdx));
  const chatgptPrefix = 'html[data-op-enabled="true"][data-op-host="chatgpt"][data-op-home="false"]:not([data-op-effective-palette="host"])';

  const findRule = selectorPredicate => blocks.find(b => b.selectors.some(selectorPredicate));

  const spacerRule = findRule(s => s.startsWith(chatgptPrefix) && s.includes('[data-op-thread-spacer="true"]'));
  assert.ok(spacerRule, 'must define ChatGPT active conversation rule for [data-op-thread-spacer="true"]');
  assert.match(spacerRule.body, /min-height:\s*20px\s*!important/);
  assert.match(spacerRule.body, /\bheight:\s*20px\s*!important/);
  assert.match(spacerRule.body, /padding-bottom:\s*0\s*!important/);

  const threadRule = findRule(s => s.startsWith(chatgptPrefix) && s.includes('[data-op-thread-column="true"]'));
  assert.ok(threadRule, 'must define ChatGPT active conversation rule for [data-op-thread-column="true"]');
  assert.match(threadRule.body, /padding-bottom:\s*24px\s*!important/);

  const composerColRule = findRule(
    s => s.startsWith(chatgptPrefix) && s.includes('[data-op-composer-scrim="true"]') && (s.includes('.composer-container') || s.includes('[data-op-composer-column="true"]'))
  );
  assert.ok(composerColRule, 'must tighten .composer-container / [data-op-composer-column="true"] inside scrim');
  assert.match(composerColRule.body, /padding-top:\s*8px\s*!important/);
  assert.match(composerColRule.body, /padding-bottom:\s*14px\s*!important/);

  const hintRule = findRule(s => s.startsWith(chatgptPrefix) && s.includes('[data-op-composer-scrim="true"]') && s.includes('.composer-hint'));
  assert.ok(hintRule, 'must tighten .composer-hint inside scrim');
  assert.match(hintRule.body, /margin-top:\s*6px\s*!important/);
  assert.match(hintRule.body, /margin-bottom:\s*0\s*!important/);
});

test('hosts.css paints feathered var(--op-canvas) linear-gradient on scrim host and ::before while keeping inner layers transparent', () => {
  const idx = hostsCss.indexOf(SECTION_MARKER);
  assert.notEqual(idx, -1);
  const nextIdx = hostsCss.indexOf('/* === ', idx + SECTION_MARKER.length);
  const blocks = parseRuleBlocks(nextIdx === -1 ? hostsCss.slice(idx) : hostsCss.slice(idx, nextIdx));
  const dualPrefix = 'html[data-op-enabled="true"]:not([data-op-effective-palette="host"])';

  const innerRule = blocks.find(
    b =>
      b.selectors.some(s => s.startsWith(dualPrefix) && s.includes('[data-op-composer-backdrop="true"]:not([data-op-composer-scrim="true"])')) &&
      b.selectors.some(s => s.includes('::before')) &&
      b.selectors.some(s => s.includes('::after'))
  );
  assert.ok(innerRule, 'must keep non-scrim backdrop layers and their ::before/::after transparent');
  assert.match(innerRule.body, /background-color:\s*transparent\s*!important/);
  assert.match(innerRule.body, /background-image:\s*none\s*!important/);

  const fadeRule = blocks.find(b => b.selectors.some(s => s.startsWith(dualPrefix) && s.includes('.native-composer-fade:not([data-op-composer-scrim="true"])')));
  assert.ok(fadeRule, 'must keep .native-composer-fade transparent when not scrim host');
  assert.match(fadeRule.body, /background-color:\s*transparent\s*!important/);
  assert.match(fadeRule.body, /background-image:\s*none\s*!important/);

  const scrimRule = blocks.find(b => b.selectors.some(s => s === `${dualPrefix} [data-op-composer-scrim="true"]`));
  assert.ok(scrimRule, 'must define dual-host feathered scrim rule for [data-op-composer-scrim="true"]');
  assert.match(scrimRule.body, /background-color:\s*transparent\s*!important/);
  assert.match(scrimRule.body, /linear-gradient\(\s*to bottom,\s*transparent 0%,\s*color-mix\(in srgb,\s*var\(--op-canvas\) 82%,\s*transparent\) 18%,\s*color-mix\(in srgb,\s*var\(--op-canvas\) 96%,\s*transparent\) 44%,\s*var\(--op-canvas\) 100%\s*\)\s*!important/);

  const scrimBeforeRule = blocks.find(b => b.selectors.some(s => s === `${dualPrefix} [data-op-composer-scrim="true"]::before`));
  assert.ok(scrimBeforeRule, 'must define dual-host feathered ::before rule for [data-op-composer-scrim="true"]::before');
  assert.match(scrimBeforeRule.body, /pointer-events:\s*none\s*!important/);
  assert.match(scrimBeforeRule.body, /background-color:\s*transparent\s*!important/);
  assert.match(scrimBeforeRule.body, /linear-gradient\(\s*to bottom,\s*transparent 0%,\s*color-mix\(in srgb,\s*var\(--op-canvas\) 78%,\s*transparent\) 100%\s*\)\s*!important/);
});
