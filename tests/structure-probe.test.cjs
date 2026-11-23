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

function makeMockDom(hostname) {
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
      getAttribute: name => attrs.get(name) ?? null,
      hasAttribute: name => attrs.has(name),
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
  if (hostname === 'chatgpt.com') {
    const page = create('div', { classes: ['page'] });
    const mainCol = create('div', { classes: ['main-column'] });
    const main = create('main', {
      attrs: { id: 'main' },
      rect: { x: 260, y: 0, width: 1280, height: 900, left: 260, top: 0, right: 1540, bottom: 900 },
      style: { '--thread-content-max-width': '48rem', position: 'relative' }
    });
    const parent = create('div', { classes: ['composer-parent'] });
    const scroller = create('div', { attrs: { 'data-prism-test-scroller': '' } });
    const transcript = create('div', { classes: ['transcriptContent_q8xz'], style: { '--thread-content-max-width': '48rem' } });
    scroller.append(transcript);
    const dock = create('div', {
      attrs: { id: 'thread-bottom-container' },
      classes: ['content-fade_b9xk'],
      style: { position: 'relative', backgroundColor: 'rgb(33, 33, 33)' },
      pseudos: {
        '::before': {
          content: '""', display: 'block', position: 'absolute', top: '-24px', height: '28px',
          backgroundImage: 'linear-gradient(transparent, rgb(33, 33, 33))',
          maskImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 0), rgb(0, 0, 0))',
          webkitMaskImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 0), rgb(0, 0, 0))'
        }
      }
    });
    const threadBottom = create('div', { attrs: { id: 'thread-bottom' } });
    const col = create('div', { classes: ['composer-column'], style: { '--thread-content-max-width': '48rem' } });
    const form = create('form', { attrs: { 'data-chatgpt-composer': '', 'data-secret': 'Private user text' } });
    const formInnerCorner = create('button', {
      attrs: { type: 'button', 'aria-label': 'Start Voice' },
      rect: { x: 1400, y: 800, width: 36, height: 36 },
      style: { position: 'absolute' }
    });
    form.append(formInnerCorner);
    const spacer = create('div', { classes: ['composer-below-spacer'], rect: { x: 400, y: 830, width: 768, height: 24 }, style: { height: '24px' } });
    const disclaimer = create('div', {
      classes: ['disclaimer_v7rk'],
      rect: { x: 400, y: 854, width: 768, height: 46 },
      style: { minHeight: '44px' }
    });
    const disclaimerLink = create('a', { attrs: { href: 'https://secret.example/help' } });
    disclaimer.append(disclaimerLink);
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
    dock.append(threadBottom);
    parent.append(scroller, dock);
    main.append(parent);
    mainCol.append(main);
    page.append(mainCol);
    body.append(page, cornerBtn, dialog, owned);
  } else {
    const app = create('chat-app');
    const inputContainer = create('input-container', { classes: ['input-gradient'], style: { position: 'absolute', minHeight: '133px' } });
    const inputAreaContainer = create('div', { classes: ['input-area-container'] });
    const inputArea = create('input-area-v2');
    const innerFloat = create('button', { rect: { x: 1400, y: 800, width: 32, height: 32 }, style: { position: 'fixed' } });
    inputArea.append(innerFloat);
    inputAreaContainer.append(inputArea);
    const disclaimer = create('hallucination-disclaimer', { rect: { x: 500, y: 860, width: 500, height: 36 } });
    inputContainer.append(inputAreaContainer, disclaimer);
    const cornerBtn = create('button', {
      attrs: { type: 'button', 'aria-label': 'Help and shortcuts' },
      classes: ['host-corner-help'],
      rect: { x: 1492, y: 852, width: 32, height: 32 },
      style: { position: 'fixed' }
    });
    app.append(inputContainer);
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
  assert.equal(chatgptJson.includes('corner-help-98765'), false, 'never leaks element id');
  assert.equal(chatgptJson.includes('secret.example'), false, 'never leaks href or url(...)');
  assert.equal(chatgptJson.includes('secret-conversation-id'), false, 'never leaks page path');

  assert.equal(chatgpt.targets.composerAncestors.count, 6, 'collects all 6 ancestors of composer');
  assert.equal(chatgpt.targets.composerAncestors.samples.length, 6, 'ancestorsOf is not truncated to SAMPLE_LIMIT=3');
  const dock = chatgpt.targets.composerAncestors.samples.find(s => s.classes.includes('content-fade_b9xk'));
  assert.ok(dock?.pseudos?.before?.hasContent, 'attaches ::before pseudo details when content exists');
  assert.match(dock.pseudos.before.backgroundImage, /linear-gradient/);
  assert.match(dock.pseudos.before.maskImage, /linear-gradient/);
  const mainAnc = chatgpt.targets.composerAncestors.samples.find(s => s.tag === 'main');
  assert.equal(mainAnc?.style['--thread-content-max-width'], '48rem', 'reads --thread-content-max-width on main');
  assert.equal(mainAnc?.style.minHeight, '0px', 'STYLE_KEYS includes minHeight');

  assert.equal(chatgpt.targets.composerSiblings.count, 2, 'collects siblings after ChatGPT composer form');
  const [spacer, disclaimer] = chatgpt.targets.composerSiblings.samples;
  assert.deepEqual({ cls: spacer.classes[0], childCount: spacer.childCount, hasInteractive: spacer.hasInteractive }, { cls: 'composer-below-spacer', childCount: 0, hasInteractive: false });
  assert.deepEqual({ cls: disclaimer.classes[0], childCount: disclaimer.childCount, hasInteractive: disclaimer.hasInteractive, minHeight: disclaimer.style.minHeight }, { cls: 'disclaimer_v7rk', childCount: 1, hasInteractive: true, minHeight: '44px' });

  assert.equal(chatgpt.targets.cornerFloats.count, 1, 'captures corner button while excluding dialog, op-owned, form child and nested span');
  assert.deepEqual(chatgpt.targets.cornerFloats.samples[0].classes, ['host-corner-help']);

  const gemini = runProbe('gemini.google.com');
  assert.equal(gemini.targets.inputSiblings.count, 1, 'collects siblings after Gemini .input-area-container');
  assert.equal(gemini.targets.inputSiblings.samples[0].tag, 'hallucination-disclaimer');
  assert.equal(gemini.targets.inputSiblings.samples[0].hasInteractive, false);
  assert.equal(gemini.targets.cornerFloats.count, 1, 'captures Gemini corner button while excluding input-area-v2 inner float');
  assert.deepEqual(gemini.targets.cornerFloats.samples[0].classes, ['host-corner-help']);
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
