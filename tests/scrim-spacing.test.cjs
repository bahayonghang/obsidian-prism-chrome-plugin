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

  const overlaidThreadRule = findRule(s => s.startsWith(chatgptPrefix) && s.includes(':has([data-op-composer-overlaid="true"])') && s.includes('[data-op-thread-column="true"]'));
  assert.ok(overlaidThreadRule, 'must preserve bottom scroll clearance when ChatGPT dock is overlaid');
  assert.match(overlaidThreadRule.body, /padding-bottom:\s*max\(24px,\s*var\(--op-dock-clearance,\s*96px\)\)\s*!important/);

  const scrollerFadeRule = findRule(s => s.startsWith(chatgptPrefix) && s.endsWith('[data-op-scroller-fade="true"]'));
  assert.ok(scrollerFadeRule, 'must define ChatGPT independent-scroller Alpha bottom fade rule');
  assert.match(scrollerFadeRule.body, /-webkit-mask-image:\s*linear-gradient\(to bottom,\s*#000 0,\s*#000 calc\(100% - var\(--op-scroller-fade-start,\s*24px\)\),\s*transparent calc\(100% - var\(--op-scroller-fade-end,\s*0px\)\),\s*transparent 100%\)\s*!important/);
  assert.match(scrollerFadeRule.body, /\bmask-image:\s*linear-gradient\(to bottom,\s*#000 0,\s*#000 calc\(100% - var\(--op-scroller-fade-start,\s*24px\)\),\s*transparent calc\(100% - var\(--op-scroller-fade-end,\s*0px\)\),\s*transparent 100%\)\s*!important/);

  const chatgptComposerPrefix = 'html[data-op-enabled="true"][data-op-composer="true"][data-op-host="chatgpt"][data-op-home="false"]:not([data-op-effective-palette="host"])';
  const geminiComposerPrefix = 'html[data-op-enabled="true"][data-op-composer="true"][data-op-host="gemini"][data-op-home="false"]:not([data-op-effective-palette="host"])';
  const dualComposerPrefix = 'html[data-op-enabled="true"][data-op-composer="true"][data-op-home="false"]:not([data-op-effective-palette="host"])';

  for (const block of blocks) {
    for (const sel of block.selectors) {
      if (
        sel.includes('[data-op-composer-dock="true"]') ||
        sel.includes('[data-op-thread-footer="true"]') ||
        sel.includes('[data-op-composer-empty-sibling="true"]') ||
        sel.includes('[data-op-composer-disclaimer="true"]') ||
        sel.includes('hallucination-disclaimer')
      ) {
        assert.ok(sel.includes('[data-op-composer="true"]'), `bottom pinning / disclaimer / empty-sibling rule must gate on [data-op-composer="true"]: ${sel}`);
      }
    }
  }

  const threadFooterBlocks = blocks.filter(b => b.selectors.some(s => s.includes('[data-op-thread-footer="true"]')));
  assert.ok(threadFooterBlocks.length >= 2, 'must define ChatGPT active conversation rules for [data-op-thread-footer="true"]');
  for (const block of threadFooterBlocks) {
    for (const sel of block.selectors) {
      assert.ok(sel.startsWith(chatgptComposerPrefix), `Thread Footer spacing rule must gate on ChatGPT active conversation + composerRestyle: ${sel}`);
    }
    assert.equal(/(?:^|;|\s)(?:position|z-index|top|bottom|left|right|anchor-scope)\s*:/i.test(block.body), false, `Thread Footer spacing rule must never alter native positioning, z-index, or anchor-scope: ${block.body}`);
  }

  const overlaidDockRule = findRule(
    s => s.startsWith('html[data-op-enabled="true"][data-op-home="false"]:not([data-op-effective-palette="host"])') && s.endsWith('[data-op-composer-overlaid="true"]')
  );
  assert.ok(overlaidDockRule, 'must elevate overlaid composer dock above sticky code headers');
  assert.match(overlaidDockRule.body, /z-index:\s*6\s*!important/);

  const composerColRule = findRule(
    s => s.startsWith(chatgptComposerPrefix) && s.includes('[data-op-composer-dock="true"]') && s.includes('.composer-container')
  );
  assert.ok(composerColRule, 'must tighten .composer-container inside dock only when composerRestyle is active');
  assert.match(composerColRule.body, /padding-top:\s*8px\s*!important/);
  assert.match(composerColRule.body, /padding-bottom:\s*14px\s*!important/);

  const hintRule = findRule(s => s.startsWith(chatgptComposerPrefix) && s.includes('[data-op-composer-dock="true"]') && s.includes('.composer-hint'));
  assert.ok(hintRule, 'must tighten .composer-hint inside dock only when composerRestyle is active');
  assert.match(hintRule.body, /margin-top:\s*6px\s*!important/);
  assert.match(hintRule.body, /margin-bottom:\s*0\s*!important/);

  const dockTightRule = blocks.find(
    b =>
      b.selectors.some(s => s.startsWith(chatgptComposerPrefix) && s.endsWith('[data-op-composer-dock="true"]')) &&
      b.selectors.some(s => s.startsWith(chatgptComposerPrefix) && s.includes('[data-op-composer-dock="true"] [data-op-composer-column="true"]:not(.composer-container)')) &&
      b.selectors.some(s => s.startsWith(chatgptComposerPrefix) && s.includes('[data-op-composer-dock="true"] .composer-column:not(.composer-container):not(:has(.composer-hint))'))
  );
  assert.ok(dockTightRule, 'must tighten [data-op-composer-dock="true"] and non-.composer-container column');
  assert.match(dockTightRule.body, /padding-top:\s*4px\s*!important/);
  assert.match(dockTightRule.body, /padding-bottom:\s*0\s*!important/);
  assert.match(dockTightRule.body, /margin-bottom:\s*0\s*!important/);

  const noDisclaimerRule = findRule(
    s => s.startsWith(chatgptComposerPrefix) && s.includes('[data-op-composer-dock="true"]:not(:has([data-op-composer-disclaimer="true"])):not(:has(.composer-hint))')
  );
  assert.ok(noDisclaimerRule, 'must keep 5px bottom padding when no disclaimer or hint is present');
  assert.match(noDisclaimerRule.body, /padding-bottom:\s*5px\s*!important/);

  const emptyRule = findRule(s => s.startsWith(dualComposerPrefix) && s.includes('[data-op-composer-empty-sibling="true"]'));
  assert.ok(emptyRule, 'must collapse empty non-interactive siblings on both hosts when composerRestyle is active');
  for (const prop of [
    /height:\s*0\s*!important/,
    /min-height:\s*0\s*!important/,
    /max-height:\s*0\s*!important/,
    /padding-top:\s*0\s*!important/,
    /padding-bottom:\s*0\s*!important/,
    /margin-top:\s*0\s*!important/,
    /margin-bottom:\s*0\s*!important/,
    /border:\s*0\s*!important/,
    /flex:\s*0 0 0\s*!important/
  ]) {
    assert.match(emptyRule.body, prop);
  }

  const chatgptNoHintDockRule = findRule(
    s => s.startsWith(chatgptComposerPrefix) && s.includes('[data-op-composer-dock="true"]:not(:has(.composer-hint))')
  );
  assert.ok(chatgptNoHintDockRule, 'must keep 5px bottom padding on ChatGPT dock without .composer-hint');
  assert.match(chatgptNoHintDockRule.body, /padding-bottom:\s*5px\s*!important/);
  assert.match(chatgptNoHintDockRule.body, /margin-bottom:\s*0\s*!important/);
  assert.match(chatgptNoHintDockRule.body, /min-height:\s*0\s*!important/);

  const dockInnerResetRule = findRule(
    s => s.startsWith(dualComposerPrefix) && s.includes('[data-op-composer-dock="true"] :has([data-op-composer-surface="true"]):not(.composer-container)')
  );
  assert.ok(dockInnerResetRule, 'must clear vertical padding/margin on inner dock wrappers around composer surface');
  assert.match(dockInnerResetRule.body, /padding-top:\s*0\s*!important/);
  assert.match(dockInnerResetRule.body, /padding-bottom:\s*0\s*!important/);
  assert.match(dockInnerResetRule.body, /margin-top:\s*0\s*!important/);
  assert.match(dockInnerResetRule.body, /margin-bottom:\s*0\s*!important/);
  assert.match(dockInnerResetRule.body, /min-height:\s*0\s*!important/);

  const geminiDockRule = findRule(
    s => s.startsWith(geminiComposerPrefix) && s.endsWith('[data-op-composer-dock="true"]')
  );
  assert.ok(geminiDockRule, 'must lower Gemini overlaid dock to 5px bottom margin when composerRestyle is active');
  assert.match(geminiDockRule.body, /min-height:\s*0\s*!important/);
  assert.match(geminiDockRule.body, /padding-top:\s*16px\s*!important/);
  assert.match(geminiDockRule.body, /padding-bottom:\s*5px\s*!important/);
  assert.match(geminiDockRule.body, /margin-bottom:\s*0\s*!important/);

  const disclaimerRule = findRule(
    s => s.startsWith(chatgptComposerPrefix) && s.includes('[data-op-composer-disclaimer="true"]:not(.composer-hint)')
  );
  assert.ok(disclaimerRule, 'must hide visible disclaimer siblings without touching .composer-hint');
  assert.match(disclaimerRule.body, /display:\s*none\s*!important/);

  const geminiDisclaimerRule = findRule(
    s => s.startsWith(geminiComposerPrefix) && s.includes('hallucination-disclaimer')
  );
  assert.ok(geminiDisclaimerRule, 'must hide Gemini hallucination-disclaimer cleanly when composerRestyle is active');
  assert.match(geminiDisclaimerRule.body, /display:\s*none\s*!important/);
});

test('hosts.css clears backdrop layers, shadows, sharp-edge vars, backdrop-filter, ::before, and ::after unconditionally while keeping overlaid scroll clearance and zero painted scrim rules', () => {
  const allBlocks = parseRuleBlocks(hostsCss);
  const dualPrefix = 'html[data-op-enabled="true"]:not([data-op-effective-palette="host"])';
  assert.equal(
    allBlocks.some(b => b.selectors.some(s => s === ':root')),
    false,
    'must not emit bare :root rules'
  );
  assert.equal(
    allBlocks.some(b => b.selectors.some(s => s.includes('[data-op-composer-scrim="true"]'))),
    false,
    'must not define painted [data-op-composer-scrim="true"] canvas veil or blur rules for either host'
  );
  for (const block of allBlocks) {
    for (const sel of block.selectors) {
      assert.equal(
        /(?:#thread-bottom-container|\[data-op-composer-dock="true"\]|\[data-op-composer-backdrop="true"\])\s+\*/.test(sel),
        false,
        `must not apply wildcard resets inside dock/backdrop containers: ${sel}`
      );
    }
  }

  const baseBackdropRule = allBlocks.find(
    b =>
      b.selectors.some(s => s === `${dualPrefix} [data-op-composer-backdrop="true"]`) &&
      b.selectors.some(s => s === `${dualPrefix} [data-op-composer-backdrop="true"]::before`) &&
      b.selectors.some(s => s === `${dualPrefix} [data-op-composer-backdrop="true"]::after`)
  );
  assert.ok(baseBackdropRule, 'backdrop rule must clear background, shadows, sharp-edge vars, backdrop-filter, masks, ::before, and ::after unconditionally');
  for (const prop of [
    /--sharp-edge-bottom-shadow:\s*none\s*!important/,
    /--sharp-edge-bottom-shadow-placeholder-content:\s*none\s*!important/,
    /--sharp-edge-top-shadow:\s*none\s*!important/,
    /--sharp-edge-top-shadow-placeholder-content:\s*none\s*!important/,
    /background-color:\s*transparent\s*!important/,
    /background-image:\s*none\s*!important/,
    /-webkit-backdrop-filter:\s*none\s*!important/,
    /\bbackdrop-filter:\s*none\s*!important/,
    /-webkit-mask-image:\s*none\s*!important/,
    /\bmask-image:\s*none\s*!important/,
    /box-shadow:\s*none\s*!important/
  ]) {
    assert.match(baseBackdropRule.body, prop);
  }

  const idx = hostsCss.indexOf(SECTION_MARKER);
  assert.notEqual(idx, -1);
  const nextIdx = hostsCss.indexOf('/* === ', idx + SECTION_MARKER.length);
  const blocks = parseRuleBlocks(nextIdx === -1 ? hostsCss.slice(idx) : hostsCss.slice(idx, nextIdx));

  const fadeRule = blocks.find(b => b.selectors.some(s => s.startsWith(dualPrefix) && s.includes('.native-composer-fade')));
  assert.ok(fadeRule, 'must keep .native-composer-fade transparent');
  assert.match(fadeRule.body, /background-color:\s*transparent\s*!important/);
  assert.match(fadeRule.body, /background-image:\s*none\s*!important/);
  assert.match(fadeRule.body, /-webkit-mask-image:\s*none\s*!important/);
  assert.match(fadeRule.body, /\bmask-image:\s*none\s*!important/);

  const clearanceRule = allBlocks.find(b =>
    b.selectors.some(s =>
      s === 'html[data-op-enabled="true"][data-op-home="false"]:not([data-op-effective-palette="host"]) [data-op-thread-scroller="true"]::after'
    )
  );
  assert.ok(clearanceRule, 'must keep overlaid scroller ::after clearance rule gated on enabled + active conversation + non-host palette');
  assert.match(clearanceRule.body, /height:\s*var\(--op-dock-clearance,\s*0px\)\s*!important/);
  assert.match(clearanceRule.body, /pointer-events:\s*none\s*!important/);
});
