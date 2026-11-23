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
  assert.ok(blocks.length >= 5, 'scrim & spacing section must define all layout and backdrop-clearing rules');

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
    s => s.startsWith(chatgptPrefix) && s.includes('[data-op-composer-dock="true"]') && s.includes('.composer-container')
  );
  assert.ok(composerColRule, 'must tighten .composer-container inside dock');
  assert.match(composerColRule.body, /padding-top:\s*8px\s*!important/);
  assert.match(composerColRule.body, /padding-bottom:\s*14px\s*!important/);

  const hintRule = findRule(s => s.startsWith(chatgptPrefix) && s.includes('[data-op-composer-dock="true"]') && s.includes('.composer-hint'));
  assert.ok(hintRule, 'must tighten .composer-hint inside dock');
  assert.match(hintRule.body, /margin-top:\s*6px\s*!important/);
  assert.match(hintRule.body, /margin-bottom:\s*0\s*!important/);

  const dockTightRule = blocks.find(
    b =>
      b.selectors.some(s => s.startsWith(chatgptPrefix) && s.endsWith('[data-op-composer-dock="true"]')) &&
      b.selectors.some(s => s.startsWith(chatgptPrefix) && s.includes('[data-op-composer-dock="true"] [data-op-composer-column="true"]:not(.composer-container)'))
  );
  assert.ok(dockTightRule, 'must tighten [data-op-composer-dock="true"] and non-.composer-container column');
  assert.match(dockTightRule.body, /padding-top:\s*4px\s*!important/);
  assert.match(dockTightRule.body, /padding-bottom:\s*0\s*!important/);

  const noDisclaimerRule = findRule(
    s => s.startsWith(chatgptPrefix) && s.includes('[data-op-composer-dock="true"]:not(:has([data-op-composer-disclaimer="true"])):not(:has(.composer-hint))')
  );
  assert.ok(noDisclaimerRule, 'must keep 10px bottom padding when no disclaimer or hint is present');
  assert.match(noDisclaimerRule.body, /padding-bottom:\s*10px\s*!important/);

  const emptyRule = findRule(s => s.startsWith(chatgptPrefix) && s.includes('[data-op-composer-empty-sibling="true"]'));
  assert.ok(emptyRule, 'must collapse empty non-interactive siblings below form');
  for (const prop of [
    /height:\s*0\s*!important/,
    /min-height:\s*0\s*!important/,
    /max-height:\s*0\s*!important/,
    /padding-top:\s*0\s*!important/,
    /padding-bottom:\s*0\s*!important/,
    /margin-top:\s*0\s*!important/,
    /margin-bottom:\s*0\s*!important/,
    /border:\s*0\s*!important/
  ]) {
    assert.match(emptyRule.body, prop);
  }

  const disclaimerRule = findRule(
    s => s.startsWith(chatgptPrefix) && s.includes('[data-op-composer-disclaimer="true"]:not(.composer-hint)')
  );
  assert.ok(disclaimerRule, 'must compact visible disclaimer siblings without touching .composer-hint');
  for (const prop of [
    /min-height:\s*0\s*!important/,
    /padding-top:\s*4px\s*!important/,
    /padding-bottom:\s*6px\s*!important/,
    /margin-top:\s*2px\s*!important/,
    /margin-bottom:\s*0\s*!important/,
    /font-size:\s*11px\s*!important/,
    /line-height:\s*1\.35\s*!important/,
    /text-align:\s*center\s*!important/
  ]) {
    assert.match(disclaimerRule.body, prop);
  }
});

test('hosts.css keeps non-scrim composer backdrop layers and native fades transparent and mask-free', () => {
  const allBlocks = parseRuleBlocks(hostsCss);
  const dualPrefix = 'html[data-op-enabled="true"]:not([data-op-effective-palette="host"])';
  assert.equal(
    allBlocks.some(b =>
      b.selectors.some(s =>
        s === `${dualPrefix} [data-op-composer-backdrop="true"]::before` ||
        s === `${dualPrefix} [data-op-composer-backdrop="true"]::after`
      )
    ),
    false,
    'must not unconditionally clear pseudo-elements on scrim-eligible backdrop hosts'
  );

  const baseBackdropRule = allBlocks.find(
    b =>
      b.selectors.some(s => s === `${dualPrefix} [data-op-composer-backdrop="true"]`) &&
      b.selectors.some(s => s === `${dualPrefix} [data-op-composer-backdrop="true"]:not([data-op-composer-scrim="true"])::before`) &&
      b.selectors.some(s => s === `${dualPrefix} [data-op-composer-backdrop="true"]:not([data-op-composer-scrim="true"])::after`)
  );
  assert.ok(baseBackdropRule, 'non-scrim backdrop rule must clear background and mask without overriding scrim ::before/::after');
  for (const prop of [
    /background-color:\s*transparent\s*!important/,
    /background-image:\s*none\s*!important/,
    /-webkit-mask-image:\s*none\s*!important/,
    /\bmask-image:\s*none\s*!important/
  ]) {
    assert.match(baseBackdropRule.body, prop);
  }

  const idx = hostsCss.indexOf(SECTION_MARKER);
  assert.notEqual(idx, -1);
  const nextIdx = hostsCss.indexOf('/* === ', idx + SECTION_MARKER.length);
  const blocks = parseRuleBlocks(nextIdx === -1 ? hostsCss.slice(idx) : hostsCss.slice(idx, nextIdx));

  const fadeRule = blocks.find(b => b.selectors.some(s => s.startsWith(dualPrefix) && s.includes('.native-composer-fade:not([data-op-composer-scrim="true"])')));
  assert.ok(fadeRule, 'must keep .native-composer-fade transparent when not scrim host');
  assert.match(fadeRule.body, /background-color:\s*transparent\s*!important/);
  assert.match(fadeRule.body, /background-image:\s*none\s*!important/);
  assert.match(fadeRule.body, /-webkit-mask-image:\s*none\s*!important/);
  assert.match(fadeRule.body, /\bmask-image:\s*none\s*!important/);
});

test('hosts.css tunes Blur Composer Scrim opacity separately for dark and light schemes', () => {
  const blurMarker = '/* === Blur Composer Scrim (v0.3.1 #22) === */';
  const idx = hostsCss.indexOf(blurMarker);
  assert.notEqual(idx, -1);
  const nextIdx = hostsCss.indexOf('/* === ', idx + blurMarker.length);
  const section = nextIdx === -1 ? hostsCss.slice(idx) : hostsCss.slice(idx, nextIdx);
  const supportsIdx = section.indexOf('@supports');
  assert.notEqual(supportsIdx, -1);
  const fallbackBlocks = parseRuleBlocks(section.slice(0, supportsIdx));
  const blurBlocks = parseRuleBlocks(section.slice(supportsIdx));

  const darkFallback = fallbackBlocks.find(b => b.selectors.some(s => s.endsWith('[data-op-composer-scrim="true"]::before') && !s.includes('[data-op-scheme="light"]')));
  assert.ok(darkFallback);
  assert.match(darkFallback.body, /var\(--op-canvas\) 56%/);

  const lightFallback = fallbackBlocks.find(b => b.selectors.some(s => s.includes('[data-op-scheme="light"]') && s.endsWith('[data-op-composer-scrim="true"]::before')));
  assert.ok(lightFallback);
  assert.match(lightFallback.body, /var\(--op-canvas\) 20%[\s\S]*var\(--op-canvas\) 36%/);

  const darkBlur = blurBlocks.find(b => b.selectors.some(s => s.endsWith('[data-op-composer-scrim="true"]::before') && !s.includes('[data-op-scheme="light"]')));
  assert.ok(darkBlur);
  assert.match(darkBlur.body, /var\(--op-canvas\) 44%/);

  const lightBlur = blurBlocks.find(b => b.selectors.some(s => s.includes('[data-op-scheme="light"]') && s.endsWith('[data-op-composer-scrim="true"]::before')));
  assert.ok(lightBlur);
  assert.match(lightBlur.body, /var\(--op-canvas\) 26%/);
  assert.match(lightBlur.body, /background-image:\s*none\s*!important/);
});
