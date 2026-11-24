'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('./helpers.cjs');

const PROBE = 'tools/structure-probe.js';

test('structure probe is a syntactically valid developer tool outside every release package', () => {
  const probePath = path.join(ROOT, PROBE);
  assert.ok(fs.existsSync(probePath), `${PROBE} exists`);
  const syntax = spawnSync(process.execPath, ['--check', probePath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
  const build = fs.readFileSync(path.join(ROOT, 'scripts/build.py'), 'utf8');
  const allowlist = build.match(/^FILES = \(([\s\S]*?)^\)/m);
  assert.ok(allowlist, 'build.py keeps an explicit FILES allowlist');
  const packaged = [...allowlist[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.ok(packaged.includes('src/content.js'), 'allowlist parsed');
  assert.deepEqual(packaged.filter(file => file.startsWith('tools/') || /probe/i.test(file)), [], 'no probe file is packaged');
  const manifests = ['manifest.json', 'manifests/firefox.json'].map(file => fs.readFileSync(path.join(ROOT, file), 'utf8'));
  for (const manifest of manifests) assert.equal(manifest.includes('structure-probe'), false, 'no manifest references the probe');
});

test('structure probe documents its run modes and privacy limits', () => {
  const source = fs.readFileSync(path.join(ROOT, PROBE), 'utf8');
  for (const phrase of ['DevTools', 'ego-browser', 'never', 'text']) assert.ok(source.includes(phrase), `probe header mentions ${phrase}`);
  // The probe must not read text-bearing DOM properties or path/id fields at all.
  for (const property of ['textContent', 'innerText', 'innerHTML', 'outerHTML', '.value', 'nodeValue', "getAttribute('aria-label')", "getAttribute('title')", "getAttribute('href')", "getAttribute('src')", "getAttribute('placeholder')"]) {
    assert.equal(source.includes(property), false, `probe never reads ${property}`);
  }
  assert.equal(/getAttribute\s*\(\s*['"](?:aria-label|title|href|src|placeholder|alt)['"]\s*\)/.test(source), false, 'probe never reads quoted text/url attributes');
  assert.equal(/\.\s*id\b|getAttribute\s*\(\s*['"]id['"]\s*\)/.test(source), false, 'probe never reads element id');
  assert.equal(/location\.(?:pathname|search|href|hash)\b/.test(source), false, 'probe never reads page path or query');
});

function matchSimpleSelector(node, token) {
  let rest = token.trim();
  if (!rest || rest === '*') return Boolean(rest);
  const tag = rest.match(/^[a-z0-9-]+/i);
  if (tag) {
    if (node.localName !== tag[0].toLowerCase()) return false;
    rest = rest.slice(tag[0].length);
  }
  while (rest.length) {
    if (rest.startsWith('#')) {
      const m = rest.match(/^#([A-Za-z0-9_-]+)/);
      if (!m || node.getAttribute('id') !== m[1]) return false;
      rest = rest.slice(m[0].length);
    } else if (rest.startsWith('.')) {
      const m = rest.match(/^\.([A-Za-z0-9_-]+)/);
      if (!m || !node.classList.includes(m[1])) return false;
      rest = rest.slice(m[0].length);
    } else if (rest.startsWith(':is(')) {
      const end = rest.indexOf(')');
      if (end < 0) return false;
      const inner = rest.slice(4, end);
      if (!inner.split(',').some(part => matchSelector(node, part))) return false;
      rest = rest.slice(end + 1);
    } else if (rest.startsWith('[')) {
      const m = rest.match(/^\[([A-Za-z0-9_-]+)(?:([*^]?=)"([^"]*)")?\]/);
      if (!m) return false;
      const val = node.getAttribute(m[1]);
      if (val === null) return false;
      if (m[2] === '=' && val !== m[3]) return false;
      if (m[2] === '*=' && !val.includes(m[3])) return false;
      if (m[2] === '^=' && !val.startsWith(m[3])) return false;
      rest = rest.slice(m[0].length);
    } else {
      return false;
    }
  }
  return true;
}

function matchSelector(node, selector) {
  for (const branch of selector.split(',')) {
    const tokens = branch.trim().split(/\s+/);
    let cursor = node;
    let ok = true;
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (tokens[i] === '>') {
        cursor = cursor?.parentElement;
        if (!cursor || !matchSimpleSelector(cursor, tokens[--i])) { ok = false; break; }
        continue;
      }
      if (i === tokens.length - 1) {
        if (!cursor || !matchSimpleSelector(cursor, tokens[i])) { ok = false; break; }
      } else {
        let anc = cursor.parentElement;
        while (anc && !matchSimpleSelector(anc, tokens[i])) anc = anc.parentElement;
        if (!anc) { ok = false; break; }
        cursor = anc;
      }
    }
    if (ok) return true;
  }
  return false;
}

function makeMockDom(hostname, variant = 'default') {
  const all = [];
  function create(localName, opts = {}) {
    const attrs = new Map(Object.entries(opts.attrs || {}));
    const el = {
      localName,
      classList: opts.classes || [],
      children: [],
      parentElement: null,
      nextElementSibling: null,
      isContentEditable: Boolean(opts.contentEditable),
      rect: {
        x: 0, y: 0, width: 100, height: 40,
        left: opts.rect?.left ?? opts.rect?.x ?? 0,
        top: opts.rect?.top ?? opts.rect?.y ?? 0,
        right: 100, bottom: 40, ...(opts.rect || {})
      },
      style: { display: 'block', position: 'static', visibility: 'visible', opacity: '1', minHeight: '0px', ...opts.style },
      pseudos: opts.pseudos || {},
      getAttributeNames: () => [...attrs.keys()],
      getAttribute: name => (name === 'class' && el.classList.length ? el.classList.join(' ') : (attrs.get(name) ?? null)),
      hasAttribute: name => (name === 'class' && el.classList.length > 0) || attrs.has(name),
      getBoundingClientRect: () => ({ ...el.rect }),
      contains: other => { for (let c = other; c; c = c.parentElement) if (c === el) return true; return false; },
      matches: sel => matchSelector(el, sel),
      closest: sel => { for (let c = el; c; c = c.parentElement) if (matchSelector(c, sel)) return c; return null; },
      querySelectorAll: sel => {
        const list = [];
        const walk = root => { for (const child of root.children) { if (matchSelector(child, sel)) list.push(child); walk(child); } };
        walk(el);
        return list;
      },
      querySelector: sel => el.querySelectorAll(sel)[0] || null,
      append(...nodes) {
        for (const child of nodes) {
          if (el.children.length) el.children[el.children.length - 1].nextElementSibling = child;
          child.parentElement = el;
          el.children.push(child);
        }
      }
    };
    if (el.rect.right === 100 && opts.rect?.x !== undefined && opts.rect?.width !== undefined) el.rect.right = el.rect.x + el.rect.width;
    if (el.rect.bottom === 40 && opts.rect?.y !== undefined && opts.rect?.height !== undefined) el.rect.bottom = el.rect.y + el.rect.height;
    all.push(el);
    return el;
  }

  const html = create('html');
  const body = create('body');
  html.append(body);
  if (hostname === 'chatgpt.com' && variant === 'deep-footer') {
    // v0.4.3 #41: the 2026-11-24 live footer. An absolutely positioned layer inside the scroll container paints
    // the band with ::before/::after (anchor positioned); most of the 22 steps from the form are display: contents.
    const contents = { display: 'contents' };
    const zero = { x: 0, y: 0, width: 0, height: 0 };
    const main = create('main', { rect: { x: 260, y: 0, width: 1280, height: 900 }, style: { position: 'relative' } });
    const scroller = create('div', { classes: ['thread-scroll-container'], style: { overflowY: 'auto' } });
    const turn = create('div', { attrs: { 'data-turn-key': '68f0c2a1-4d3b-4e8a-9c71-2b5e8f0a6d13' } });
    const footer = create('div', {
      classes: ['footer-A8ZvKV'],
      rect: { x: 260, y: 740, width: 1280, height: 160 },
      style: { position: 'absolute', zIndex: '20', anchorScope: '--thread-composer' },
      pseudos: {
        '::before': {
          content: '""', display: 'block', position: 'absolute', zIndex: '-1', top: '50px', bottom: '16px', left: '16px', right: '16px',
          insetInlineStart: '16px', insetInlineEnd: '16px', width: '1248px',
          backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0), rgb(14, 14, 14))', backgroundColor: 'rgba(0, 0, 0, 0)'
        },
        '::after': {
          content: '""', display: 'block', position: 'absolute', zIndex: '-1', top: '144px', bottom: '0px', left: '16px', right: '16px',
          insetInlineStart: '16px', insetInlineEnd: '16px', width: '1248px',
          backgroundImage: 'none', backgroundColor: 'rgb(14, 14, 14)'
        }
      }
    });
    const chain = (top, count) => {
      let cur = top;
      for (let i = 0; i < count; i++) { const next = create('div', { rect: zero, style: contents }); cur.append(next); cur = next; }
      return cur;
    };
    const scrollFooter = create('div', { attrs: { 'data-thread-scroll-footer': 'true' }, rect: { x: 260, y: 740, width: 1280, height: 160 } });
    chain(footer, 5).append(scrollFooter);
    const backdrop = create('div', { attrs: { 'data-thread-composer-backdrop': 'true', 'data-pip-obstacle': 'thread-footer' }, rect: { x: 260, y: 744, width: 1280, height: 156 } });
    const secretButton = create('button', { attrs: { 'aria-label': 'Secret footer label', 'data-message-id': '5f2c9a81-0d3e-4b7a-9c61-2e8f0a6d13b4' } });
    chain(scrollFooter, 4).append(backdrop, secretButton);
    const column = create('div', { classes: ['composer-column'], rect: { x: 496, y: 744, width: 808, height: 140 } });
    chain(backdrop, 4).append(column);
    const form = create('form', { attrs: { 'data-chatgpt-composer': '', 'data-secret': 'Private user text' }, style: { anchorName: '--thread-composer' } });
    chain(column, 5).append(form);
    const layout = create('div', { attrs: { 'data-composer-layout': 'single-line', 'data-composer-body': '' }, rect: { x: 516, y: 744, width: 768, height: 100 } });
    const grid = create('div', { classes: ['composerGrid_h2vs'], style: { display: 'grid' } });
    const editor = create('div', { attrs: { contenteditable: 'true', role: 'textbox', id: 'prompt-textarea' }, contentEditable: true });
    grid.append(editor);
    layout.append(grid);
    form.append(layout);
    scroller.append(turn, footer);
    main.append(scroller);
    body.append(main);
  } else if (hostname === 'chatgpt.com') {
    const page = create('div', { classes: ['page'] });
    const mainCol = create('div', { classes: ['main-column'] });
    const main = create('main', {
      attrs: { id: 'main' },
      rect: { x: 260, y: 0, width: 1280, height: 900, left: 260, top: 0, right: 1540, bottom: 900 },
      style: { '--thread-content-max-width': '48rem', position: 'relative' }
    });
    const parent = create('div', { classes: ['composer-parent'] });
    const scroller = create('div', { attrs: { 'data-prism-test-scroller': '' } });
    const transcript = create('div', { classes: ['transcriptContent_q8xz'], style: { '--thread-content-max-width': '48rem', '--user-chat-width': '70%' } });
    const turn = create('div', { attrs: { 'data-turn-key': '68f0c2a1-4d3b-4e8a-9c71-2b5e8f0a6d13' }, classes: ['turn-container'], style: { '--user-chat-width': '70%' } });
    const virtualTurn = create('div', { attrs: { 'data-virtualized-turn': '' }, style: { '--user-chat-width': '70%' } });
    const userTurn = create('div', {
      attrs: { 'data-content-search-unit-key': '68f0c2a1-4d3b-4e8a-9c71-2b5e8f0a6d13:0:user' },
      classes: ['user-turn'],
      style: { '--user-chat-width': '70%' }
    });
    const userBubbleWrap = create('div', { classes: ['user-bubble-wrap'], style: { maxWidth: 'var(--user-chat-width, 70%)', '--user-chat-width': '70%' } });
    const userBubble = create('div', {
      attrs: { 'data-user-message-bubble': 'true' },
      classes: ['user-message-bubble-color'],
      style: { maxWidth: '70%', '--user-chat-width': '70%' }
    });
    userBubbleWrap.append(userBubble);
    userTurn.append(userBubbleWrap);
    virtualTurn.append(userTurn);
    turn.append(virtualTurn);
    transcript.append(turn);
    scroller.append(transcript);
    const dock = create('div', {
      attrs: { id: 'thread-bottom-container' },
      classes: ['content-fade_b9xk'],
      rect: { x: 260, y: 700, width: 1280, height: 144 },
      style: {
        position: 'relative',
        backgroundColor: 'rgb(33, 33, 33)',
        boxShadow: '0 -24px 0 0 #2b2738, 0 18px 0 0 rgba(43, 39, 56, 0.9490196078431372)',
        '--sharp-edge-bottom-shadow': '0 -24px 0 0 #2b2738, 0 18px 0 0 #2b2738',
        '--sharp-edge-bottom-shadow-placeholder-content': '""',
        '--sharp-edge-top-shadow': '0 2px 0 0 #2b2738',
        '--sharp-edge-top-shadow-placeholder-content': 'Secret top placeholder',
        '--composer-surface-primary': 'rgba(48, 48, 48, 0.9490196078431372)',
        '--main-surface-primary': '#212121'
      },
      pseudos: {
        '::before': {
          content: '""', display: 'block', position: 'absolute', top: '-24px', height: '28px',
          backgroundImage: 'linear-gradient(transparent, rgb(33, 33, 33))',
          maskImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 0), rgb(0, 0, 0))',
          webkitMaskImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 0), rgb(0, 0, 0))'
        },
        '::after': {
          content: '""', display: 'block', position: 'absolute', left: '0px', right: '0px', bottom: '0px', height: '96px', zIndex: '-1',
          boxShadow: '0 -24px 0 0 #2b2738, 0 0 0 url("https://secret.example/pseudo.png")',
          backgroundImage: 'linear-gradient(transparent, rgb(45, 42, 58))',
          maskImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 0), rgb(0, 0, 0))'
        }
      }
    });
    const contentFadeContainer = create('div', {
      classes: ['content-fade-container', 'content-fade'],
      style: { position: 'absolute', left: '0px', right: '0px', bottom: '0px', height: '96px', zIndex: '-1' },
      pseudos: {
        '::before': { content: 'normal' },
        '::after': {
          content: '""', display: 'block', position: 'absolute', left: '0px', right: '0px', bottom: '0px', height: '96px', zIndex: '-1',
          backgroundImage: 'linear-gradient(transparent, #2d2a3a 20%, #2d2a3a)',
          maskImage: 'linear-gradient(to bottom, transparent, #000)'
        }
      }
    });
    const scrollToBottomBtn = create('button', {
      attrs: { type: 'button', 'aria-label': 'Scroll to bottom' },
      classes: ['scroll-to-bottom-btn']
    });
    contentFadeContainer.append(scrollToBottomBtn);
    const extraFade1 = create('div', {
      classes: ['fade-mask_a1'],
      pseudos: { '::before': { content: 'normal' }, '::after': { content: 'none' } }
    });
    const extraFade2 = create('div', {
      classes: ['content-fade_extra'],
      style: {
        boxShadow: '0 0 0 #00000014 68f0c2a1-4d3b-4e8a-9c71-2b5e8f0a6d13 r_5f2c9a81 4f8a1c2e9b7d url("https://secret.example/fade.png")',
        maxWidth: '100000px',
        zIndex: '2147483647',
        backgroundImage: 'translate3d(0px, 0px, 0px)',
        '--sharp-edge-bottom-shadow-placeholder-content': 'https://secret.example/placeholder'
      }
    });
    const threadBottom = create('div', { attrs: { id: 'thread-bottom' } });
    const threadBottomAfterSpacer = create('div', { classes: ['thread-bottom-trailing-spacer'], style: { height: '12px' } });
    const col = create('div', { classes: ['composer-column'], style: { '--thread-content-max-width': '48rem' } });
    const form = create('form', { attrs: { 'data-chatgpt-composer': '', 'data-secret': 'Private user text' } });
    const composerLayout = create('div', {
      attrs: { 'data-composer-layout': 'single-line' },
      classes: ['ComposerLayoutRoot_m3kp'],
      rect: { x: 400, y: 730, width: 768, height: 100 }
    });
    const formInnerCorner = create('button', {
      attrs: { type: 'button', 'aria-label': 'Start Voice' },
      rect: { x: 1400, y: 800, width: 36, height: 36 },
      style: { position: 'absolute' }
    });
    composerLayout.append(formInnerCorner);
    form.append(composerLayout);
    const spacer = create('div', { classes: ['composer-below-spacer'], rect: { x: 400, y: 830, width: 768, height: 24 }, style: { height: '24px' } });
    const disclaimer = create('div', {
      classes: ['disclaimer_v7rk'],
      rect: { x: 400, y: 854, width: 768, height: 46 },
      style: { minHeight: '44px' }
    });
    const disclaimerLink = create('a', { attrs: { href: 'https://secret.example/help' } });
    disclaimer.append(disclaimerLink);
    const dockOuterSpacer = create('div', {
      classes: ['dock-outer-spacer'],
      rect: { x: 260, y: 844, width: 1280, height: 28 },
      style: { height: '28px' }
    });
    const disclaimerOuterWrap = create('div', {
      classes: ['disclaimer-outer-wrap'],
      attrs: { 'data-testid': 'bottom-disclaimer' },
      rect: { x: 260, y: 864, width: 1280, height: 36 },
      style: { marginTop: '-8px', marginBottom: '0px', minHeight: '36px', paddingBottom: '12px', viewTransitionName: 'disclaimer-shell' }
    });
    const secretVtShell = create('div', {
      attrs: { style: 'view-transition-name: vt-68f0c2a1-4d3b-4e8a-9c71-2b5e8f0a6d13' },
      style: { viewTransitionName: 'vt-68f0c2a1-4d3b-4e8a-9c71-2b5e8f0a6d13' }
    });
    const mixedIdVtShell = create('div', {
      attrs: { 'data-testid': 'disclaimer-extra' },
      style: { viewTransitionName: 'r_5f2c9a81' }
    });
    const cornerBtn = create('button', {
      attrs: { type: 'button', 'aria-label': 'Help and shortcuts', id: 'corner-help-98765' },
      classes: ['host-corner-help'],
      rect: { x: 1492, y: 852, width: 32, height: 32 },
      style: { position: 'fixed', backgroundImage: 'url("https://secret.example/icon.png")' }
    });
    const cornerChild = create('span', {
      rect: { x: 1498, y: 858, width: 16, height: 16 },
      style: { position: 'absolute' }
    });
    cornerBtn.append(cornerChild);
    const dialog = create('div', { attrs: { role: 'dialog' } });
    const dialogFloat = create('button', {
      rect: { x: 1450, y: 820, width: 40, height: 40 },
      style: { position: 'fixed' }
    });
    dialog.append(dialogFloat);
    const owned = create('div', { attrs: { 'data-op-owned': 'true' } });
    const ownedFloat = create('button', {
      rect: { x: 1400, y: 820, width: 40, height: 40 },
      style: { position: 'fixed' }
    });
    owned.append(ownedFloat);
    col.append(form, spacer, disclaimer);
    threadBottom.append(col);
    dock.append(contentFadeContainer, threadBottom, threadBottomAfterSpacer);
    parent.append(scroller, extraFade1, extraFade2, dock, dockOuterSpacer, disclaimerOuterWrap, secretVtShell, mixedIdVtShell);
    main.append(parent);
    mainCol.append(main);
    page.append(mainCol);
    body.append(page, cornerBtn, dialog, owned);
  } else if (hostname === 'gemini.google.com') {
    const app = create('chat-app');
    const chatWindow = create('chat-window', {
      style: { '--bard-chat-window-content-width-default': '744px', '--bard-chat-window-content-width': '708px' }
    });
    const geminiScroller = create('div', { classes: ['chat-history-scroll-container'] });
    const conversation = create('div', { classes: ['conversation-container', 'enable-extended-and-xl-grid'] });
    const userQuery = create('user-query', { style: { maxWidth: '708px' } });
    const userQueryContent = create('user-query-content');
    const userQueryContainer = create('div', { classes: ['user-query-container'] });
    const queryContent = create('div', { classes: ['query-content'], style: { maxWidth: '588px' } });
    const bubbleContainer = create('div', { classes: ['user-query-bubble-container'], style: { maxWidth: '520px' } });
    const geminiBubble = create('div', { classes: ['user-query-bubble-with-background'], style: { maxWidth: '458px' } });
    const queryText = create('div', { classes: ['query-text'], style: { maxWidth: '458px' } });
    const queryLine = create('p', { classes: ['query-text-line'], style: { maxWidth: '458px' } });
    queryText.append(queryLine);
    geminiBubble.append(queryText);
    bubbleContainer.append(geminiBubble);
    queryContent.append(bubbleContainer);
    userQueryContainer.append(queryContent);
    userQueryContent.append(userQueryContainer);
    userQuery.append(userQueryContent);
    conversation.append(userQuery);
    geminiScroller.append(conversation);
    const inputContainer = create('input-container', {
      classes: ['input-gradient'],
      rect: { x: 312, y: 767, width: 1228, height: 133 },
      style: { position: 'absolute', minHeight: '133px' }
    });
    const inputAreaContainer = create('div', { classes: ['input-area-container'] });
    const inputArea = create('input-area-v2', { rect: { x: 540, y: 790, width: 660, height: 72 } });
    const textInputField = create('div', {
      classes: ['text-input-field'],
      style: { display: 'grid', gridTemplateAreas: '"file-preview file-preview file-preview" "leading-actions text-input trailing-actions"' }
    });
    const innerFloat = create('button', { rect: { x: 1400, y: 800, width: 32, height: 32 }, style: { position: 'fixed' } });
    inputArea.append(textInputField, innerFloat);
    inputAreaContainer.append(inputArea);
    const disclaimer = create('hallucination-disclaimer', { rect: { x: 500, y: 860, width: 500, height: 36 } });
    inputContainer.append(inputAreaContainer, disclaimer);
    const cornerBtn = create('button', {
      attrs: { type: 'button', 'aria-label': 'Help and shortcuts' },
      classes: ['host-corner-help'],
      rect: { x: 1492, y: 852, width: 32, height: 32 },
      style: { position: 'fixed' }
    });
    chatWindow.append(geminiScroller, inputContainer);
    app.append(chatWindow);
    body.append(app, cornerBtn);
  }
  const document = {
    documentElement: html,
    body,
    querySelector: sel => html.querySelector(sel),
    querySelectorAll: sel => html.querySelectorAll(sel)
  };
  return {
    location: { hostname, pathname: '/c/secret-conversation-id', search: '?token=secret' },
    innerWidth: 1540,
    innerHeight: 900,
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: true }),
    document,
    getComputedStyle(element, pseudo) {
      const source = pseudo ? (element.pseudos?.[pseudo] || { content: 'none' }) : element.style;
      return {
        ...source,
        getPropertyValue: prop => String(source[prop] || '')
      };
    }
  };
}

test('structure probe collects pseudo paint/mask, full ancestor depth, siblingsAfter and cornerFloats cleanly', () => {
  const vm = require('node:vm');
  const probeSource = fs.readFileSync(path.join(ROOT, PROBE), 'utf8');

  const runProbe = host => JSON.parse(JSON.stringify(vm.runInNewContext(probeSource, makeMockDom(host))));
  const chatgpt = runProbe('chatgpt.com');
  const chatgptJson = JSON.stringify(chatgpt);
  assert.equal(chatgptJson.includes('Private user text'), false, 'redacts long data values');
  assert.equal(chatgptJson.includes('Help and shortcuts'), false, 'never leaks aria-label');
  assert.equal(chatgptJson.includes('Scroll to bottom'), false, 'never leaks scroll-to-bottom aria-label');
  assert.equal(chatgptJson.includes('Secret top placeholder'), false, 'redacts *-placeholder-content custom properties');
  assert.equal(chatgptJson.includes('corner-help-98765'), false, 'never leaks element id');
  assert.equal(chatgptJson.includes('secret.example'), false, 'never leaks href or url(...)');
  assert.equal(chatgptJson.includes('secret-conversation-id'), false, 'never leaks page path');
  assert.equal(chatgptJson.includes('68f0c2a1-4d3b-4e8a-9c71-2b5e8f0a6d13'), false, 'redacts UUID in viewTransitionName and CSS values');
  assert.equal(chatgptJson.includes('r_5f2c9a81'), false, 'redacts mixed-id in viewTransitionName and CSS values');
  assert.equal(chatgptJson.includes('4f8a1c2e9b7d'), false, 'redacts long hex in CSS values');

  assert.equal(chatgpt.targets.composerAncestors.count, 9, 'collects deeper ancestor chain (> 6 levels) up through html');
  assert.equal(chatgpt.targets.composerAncestors.samples.length, 9, 'ancestorsOf collects beyond old depth 6');
  assert.ok(chatgpt.targets.composerAncestors.samples.some(s => s.classes.includes('page')), 'captures .page ancestor');
  assert.ok(chatgpt.targets.composerAncestors.samples.some(s => s.tag === 'body'), 'captures body ancestor');

  const dock = chatgpt.targets.composerAncestors.samples.find(s => s.classes.includes('content-fade_b9xk'));
  assert.ok(dock?.pseudos?.before?.hasContent, 'attaches ::before pseudo details when content exists');
  assert.match(dock.pseudos.before.backgroundImage, /linear-gradient/);
  assert.match(dock.pseudos.before.maskImage, /linear-gradient/);
  assert.ok(dock?.pseudos?.after?.hasContent, 'attaches ::after pseudo details when content exists');
  assert.equal(dock.pseudos.after.left, '0px');
  assert.equal(dock.pseudos.after.right, '0px');
  assert.equal(dock.pseudos.after.zIndex, '-1');
  assert.match(dock.pseudos.after.boxShadow, /#2b2738/);
  assert.equal(dock.pseudos.after.boxShadow.includes('url([url])'), true, 'redacts url(...) inside pseudo boxShadow');
  assert.equal(dock.style.boxShadow, '0 -24px 0 0 #2b2738, 0 18px 0 0 rgba(43, 39, 56, 0.9490196078431372)', 'preserves hex colors and floating point numbers in boxShadow');
  assert.equal(dock.style['--sharp-edge-bottom-shadow'], '0 -24px 0 0 #2b2738, 0 18px 0 0 #2b2738');
  assert.equal(dock.style['--sharp-edge-bottom-shadow-placeholder-content'], '[text]');
  assert.equal(dock.style['--sharp-edge-top-shadow'], '0 2px 0 0 #2b2738');
  assert.equal(dock.style['--sharp-edge-top-shadow-placeholder-content'], '[text]');
  assert.equal(dock.style['--composer-surface-primary'], 'rgba(48, 48, 48, 0.9490196078431372)');
  assert.equal(dock.style['--main-surface-primary'], '#212121');
  assert.equal(dock.rect.bottom, 844);
  assert.equal(dock.rect.viewportBottomOffset, 56);

  assert.equal(chatgpt.targets.contentFades.count, 4, 'finds all 4 contentFade nodes');
  assert.equal(chatgpt.targets.contentFades.samples.length, 4, 'spec.limit collects contentFades beyond SAMPLE_LIMIT=3');
  const fadeContainer = chatgpt.targets.contentFades.samples.find(s => s.classes.includes('content-fade-container'));
  assert.ok(fadeContainer?.pseudos?.after?.hasContent, 'captures non-empty container .content-fade::after');
  assert.equal(fadeContainer.pseudos.before.hasContent, false, 'treats content: normal as hasContent=false');
  const normalFade = chatgpt.targets.contentFades.samples.find(s => s.classes.includes('fade-mask_a1'));
  assert.equal(normalFade.pseudos, undefined, 'omits pseudos when ::before is normal and ::after is none');
  const extraFade = chatgpt.targets.contentFades.samples.find(s => s.classes.includes('content-fade_extra'));
  assert.equal(extraFade.style.maxWidth, '100000px', 'does not redact numeric CSS lengths');
  assert.equal(extraFade.style.zIndex, '2147483647', 'does not redact max z-index integer');
  assert.equal(extraFade.style.backgroundImage, 'translate3d(0px, 0px, 0px)', 'does not redact translate3d keyword');
  assert.equal(extraFade.style.boxShadow, '0 0 0 #00000014 [id] [id] [id] url([url])', 'redacts UUID, mixed-id, long hex, and url(...) while keeping 8-digit hex colors');
  assert.equal(extraFade.style['--sharp-edge-bottom-shadow-placeholder-content'], '[url]', 'redacts URL in placeholder-content custom prop via redactValue');

  assert.equal(chatgpt.targets.threadBottomSiblings.count, 1, 'captures siblings after #thread-bottom');
  assert.deepEqual(chatgpt.targets.threadBottomSiblings.samples[0].classes, ['thread-bottom-trailing-spacer']);

  assert.equal(chatgpt.targets.dockSiblings.count, 4, 'captures external siblings after #thread-bottom-container');
  const [outerSpacer, outerDisclaimer, vtUuidShell, vtMixedShell] = chatgpt.targets.dockSiblings.samples;
  assert.equal(outerSpacer.classes[0], 'dock-outer-spacer');
  assert.equal(outerSpacer.childCount, 0);
  assert.equal(outerDisclaimer.classes[0], 'disclaimer-outer-wrap');
  assert.equal(outerDisclaimer.style.marginTop, '-8px');
  assert.equal(outerDisclaimer.style.marginBottom, '0px');
  assert.equal(outerDisclaimer.style.viewTransitionName, 'disclaimer-shell');
  assert.equal(vtUuidShell.style.viewTransitionName, '[id]', 'redacts UUID in viewTransitionName via redactValue');
  assert.equal(vtMixedShell.style.viewTransitionName, '[id]', 'redacts mixed-id in viewTransitionName via redactValue');

  assert.equal(chatgpt.targets.disclaimerShells.count, 4, 'disclaimerShells captures disclaimer classes, testids, and view-transition-name styles');
  assert.equal(chatgpt.targets.disclaimerShells.samples.length, 4);

  assert.deepEqual(chatgpt.bottomOffsets, { dockBottomOffset: 56, composerBottomOffset: 70 });

  const mainAnc = chatgpt.targets.composerAncestors.samples.find(s => s.tag === 'main');
  assert.equal(mainAnc?.style['--thread-content-max-width'], '48rem', 'reads --thread-content-max-width on main');
  assert.equal(mainAnc?.style.minHeight, '0px', 'STYLE_KEYS includes minHeight');

  assert.equal(chatgpt.targets.composerSiblings.count, 2, 'collects siblings after ChatGPT composer form');
  const [spacer, disclaimer] = chatgpt.targets.composerSiblings.samples;
  assert.deepEqual({ cls: spacer.classes[0], childCount: spacer.childCount, hasInteractive: spacer.hasInteractive }, { cls: 'composer-below-spacer', childCount: 0, hasInteractive: false });
  assert.deepEqual({ cls: disclaimer.classes[0], childCount: disclaimer.childCount, hasInteractive: disclaimer.hasInteractive, minHeight: disclaimer.style.minHeight }, { cls: 'disclaimer_v7rk', childCount: 1, hasInteractive: true, minHeight: '44px' });

  assert.equal(chatgpt.targets.cornerFloats.count, 1, 'captures corner button while excluding dialog, op-owned, form child and nested span');
  assert.deepEqual(chatgpt.targets.cornerFloats.samples[0].classes, ['host-corner-help']);

  assert.equal(chatgpt.targets.userBubbleAncestors.count, 8, 'collects ChatGPT userBubbleAncestors up to depth 8');
  assert.equal(chatgpt.targets.userBubbleAncestors.samples.length, 8);
  assert.ok(chatgpt.targets.userBubbleAncestors.samples.some(s => s.classes.includes('user-bubble-wrap')), 'captures bubble wrapper');
  assert.ok(chatgpt.targets.userBubbleAncestors.samples.some(s => s.classes.includes('user-turn') && s.data['data-content-search-unit-key'] === '[id]:0:user'), 'captures .user-turn with redacted unit key');
  assert.ok(chatgpt.targets.userBubbleAncestors.samples.some(s => s.data['data-turn-key'] === '[id]'), 'captures [data-turn-key] with redacted key');
  const chatgptTranscriptAnc = chatgpt.targets.userBubbleAncestors.samples.find(s => s.classes.includes('transcriptContent_q8xz'));
  assert.ok(chatgptTranscriptAnc, 'captures transcriptContent in userBubbleAncestors');
  assert.equal(chatgptTranscriptAnc.style['--thread-content-max-width'], '48rem');
  assert.equal(chatgptTranscriptAnc.style['--user-chat-width'], '70%');

  const gemini = runProbe('gemini.google.com');
  assert.equal(gemini.targets.inputSiblings.count, 1, 'collects siblings after Gemini .input-area-container');
  assert.equal(gemini.targets.inputSiblings.samples[0].tag, 'hallucination-disclaimer');
  assert.equal(gemini.targets.inputSiblings.samples[0].hasInteractive, false);
  assert.equal(gemini.targets.inputAncestors.count, 6, 'collects Gemini inputAncestors chain');
  assert.equal(gemini.targets.inputAncestors.samples.length, 6);
  assert.equal(gemini.targets.userBubbleAncestors.count, 8, 'collects Gemini userBubbleAncestors up to depth 8');
  assert.equal(gemini.targets.userBubbleAncestors.samples.length, 8);
  assert.ok(gemini.targets.userBubbleAncestors.samples.some(s => s.classes.includes('user-query-bubble-container') && s.style.maxWidth === '520px'));
  assert.ok(gemini.targets.userBubbleAncestors.samples.some(s => s.classes.includes('query-content') && s.style.maxWidth === '588px'));
  assert.ok(gemini.targets.userBubbleAncestors.samples.some(s => s.tag === 'user-query' && s.style.maxWidth === '708px'));
  const geminiChatWindow = gemini.targets.userBubbleAncestors.samples.find(s => s.tag === 'chat-window');
  assert.ok(geminiChatWindow, 'captures chat-window in userBubbleAncestors');
  assert.equal(geminiChatWindow.style['--bard-chat-window-content-width-default'], '744px');
  assert.equal(geminiChatWindow.style['--bard-chat-window-content-width'], '708px');
  assert.equal(gemini.targets.userQueryText.count, 2, 'collects Gemini userQueryText nodes');
  assert.ok(gemini.targets.userQueryText.samples.some(s => s.classes.includes('query-text') && s.style.maxWidth === '458px'));
  assert.ok(gemini.targets.userQueryText.samples.some(s => s.classes.includes('query-text-line') && s.style.maxWidth === '458px'));
  assert.ok(gemini.targets.inputAreaChildren.count >= 2, 'collects Gemini inputAreaChildren');
  assert.ok(gemini.targets.inputAreaChildren.samples.some(s => s.tag === 'input-area-v2'));
  assert.ok(gemini.targets.inputAreaChildren.samples.some(s => s.classes.includes('text-input-field')));
  assert.deepEqual(gemini.bottomOffsets, { dockBottomOffset: 0, composerBottomOffset: 38 });
  assert.equal(gemini.targets.cornerFloats.count, 1, 'captures Gemini corner button while excluding input-area-v2 inner float');
  assert.deepEqual(gemini.targets.cornerFloats.samples[0].classes, ['host-corner-help']);

  const unknown = runProbe('unknown.example');
  assert.deepEqual(unknown.bottomOffsets, { dockBottomOffset: null, composerBottomOffset: null });
});

test('structure probe reports the painted composer footer: ancestor depth, boxless wrappers, pseudo paint and anchor positioning', () => {
  const vm = require('node:vm');
  const probeSource = fs.readFileSync(path.join(ROOT, PROBE), 'utf8');
  const result = JSON.parse(JSON.stringify(vm.runInNewContext(probeSource, makeMockDom('chatgpt.com', 'deep-footer'))));
  const json = JSON.stringify(result);
  for (const secret of ['Private user text', 'Secret footer label', '5f2c9a81-0d3e-4b7a-9c61-2e8f0a6d13b4', '68f0c2a1-4d3b-4e8a-9c71-2b5e8f0a6d13', 'prompt-textarea', 'secret-conversation-id']) {
    assert.equal(json.includes(secret), false, `probe output omits ${secret}`);
  }
  const footer = result.targets.composerFooter;
  assert.equal(footer.count, 1, 'finds the painted footer above the composer');
  assert.deepEqual(footer.chains, {
    form: { ancestors: 22, noBox: 18 },
    composerLayout: { ancestors: 23, noBox: 18 },
    editor: { ancestors: 25, noBox: 18 }
  }, 'counts ancestors from form, Composer Surface and editor to the painted footer, and those that generate no box');
  assert.deepEqual(footer.markers, { scrollFooter: 16, composerBackdrop: 11 }, 'reports where the host footer markers sit on the form chain');
  const [sample] = footer.samples;
  assert.deepEqual(sample.classes, ['footer-A8ZvKV']);
  assert.equal(sample.style.position, 'absolute');
  assert.equal(sample.style.zIndex, '20');
  assert.equal(sample.anchor.anchorScope, '--thread-composer', 'reports the footer anchor scope');
  assert.equal(footer.formAnchor.anchorName, '--thread-composer', 'reports the composer anchor name');
  assert.match(sample.pseudos.before.backgroundImage, /linear-gradient\(rgba\(0, 0, 0, 0\), rgb\(14, 14, 14\)\)/);
  assert.equal(sample.pseudos.after.backgroundColor, 'rgb(14, 14, 14)');
  for (const pseudo of ['before', 'after']) {
    assert.equal(sample.pseudos[pseudo].insetInlineStart, '16px', `${pseudo} inset-inline-start`);
    assert.equal(sample.pseudos[pseudo].insetInlineEnd, '16px', `${pseudo} inset-inline-end`);
  }
  assert.equal(sample.pseudos.before.top, '50px');
  assert.equal(sample.pseudos.after.bottom, '0px');

  const plain = JSON.parse(JSON.stringify(vm.runInNewContext(probeSource, makeMockDom('chatgpt.com'))));
  assert.equal(plain.targets.composerFooter.count, 1, 'the v0.4.2 in-flow dock also paints a ::before');
  assert.deepEqual(plain.targets.composerFooter.samples[0].classes, ['content-fade_b9xk']);
  assert.deepEqual(plain.targets.composerFooter.chains.form, { ancestors: 3, noBox: 0 }, 'the in-flow dock sits three boxed layers above the form');
  assert.deepEqual(plain.targets.composerFooter.markers, { scrollFooter: null, composerBackdrop: null }, 'no host footer markers on the v0.4.2 shape');
});

function makePNG(width, height, colorType, pixels) {
  const channels = colorType === 6 ? 4 : 3;
  const rows = [];
  const raw = (x, y, c) => (x < 0 || y < 0 ? 0 : pixels[(y * width + x) * channels + c]);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    // Each row uses a different PNG filter type (None, Sub, Up, Average, Paeth), as browser encoders do.
    const filter = y % 5;
    const row = Buffer.alloc(1 + width * channels);
    row[0] = filter;
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        const left = raw(x - 1, y, c), up = raw(x, y - 1, c), corner = raw(x - 1, y - 1, c);
        const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, corner)][filter];
        row[1 + x * channels + c] = (raw(x, y, c) - predictor + 256) & 255;
      }
    }
    rows.push(row);
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = colorType; header[10] = 0; header[11] = 0; header[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

test('measurement PNG decoder returns exact RGBA pixels for RGB and RGBA screenshots', async () => {
  const { decodePNG } = await import('./measure.mjs');
  const rgba = [10, 20, 30, 255, 200, 100, 50, 128, 0, 0, 0, 0, 255, 255, 255, 255, 7, 8, 9, 255, 70, 80, 90, 255];
  const decoded = decodePNG(makePNG(3, 2, 6, rgba));
  assert.equal(decoded.width, 3);
  assert.equal(decoded.height, 2);
  assert.deepEqual(decoded.at(1, 0), { r: 200, g: 100, b: 50, a: 128 });
  assert.deepEqual(decoded.at(2, 1), { r: 70, g: 80, b: 90, a: 255 });
  // Five rows exercise all five filter types.
  const rgb = Array.from({ length: 2 * 5 * 3 }, (_, index) => (index * 53 + 17) % 256);
  const opaque = decodePNG(makePNG(2, 5, 2, rgb));
  for (let y = 0; y < 5; y++) for (let x = 0; x < 2; x++) {
    const offset = (y * 2 + x) * 3;
    assert.deepEqual(opaque.at(x, y), { r: rgb[offset], g: rgb[offset + 1], b: rgb[offset + 2], a: 255 }, `pixel ${x},${y}`);
  }
});
