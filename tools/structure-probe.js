/*
 * Obsidian Prism read-only structure probe (developer tool, GPL-3.0-only).
 *
 * Not part of any release package: scripts/build.py packages an explicit allowlist that excludes tools/.
 *
 * What it does: evaluates in the current ChatGPT or Gemini page and returns one JSON-serializable object that
 * describes the structure the extension depends on: tags, class tokens, data-* attributes, roles, element sizes
 * and a fixed list of computed styles (width/max-width, position, background color/image, mask, font family/
 * size/weight, grid columns/rows/areas, flex direction) plus a few host CSS variables.
 *
 * Privacy rules enforced by the code:
 *   - It never reads text nodes, input values, aria-label, title, alt, placeholder, href or src.
 *   - Element ids are never emitted. data-* values keep only short identifier-like tokens; id-like tokens
 *     (UUIDs, long hex/digit runs, long mixed tokens) become "[id]", URLs become "[url]", free text becomes "[text]".
 *   - Class tokens that look like ids are replaced by "[id]"; url(...) inside computed styles becomes url([url]).
 *   - The page path and query are never emitted, only the hostname.
 *   Review the output before sharing it anyway, and never commit raw output from a signed-in page; record only
 *   the derived facts (as in .trellis/research/live-host-dom.md).
 *
 * Run it from DevTools: open a conversation, paste this whole file into the Console and press Enter. The
 *   console shows the result object; `copy(JSON.stringify($_, null, 2))` copies it.
 * Run it from ego-browser (or any CDP/Playwright evaluate): evaluate the whole file text as a script in the
 *   conversation tab; the completion value is the result object.
 * Options: before running, optionally set `globalThis.__PRISM_PROBE_OPTIONS__ = { samples: 3, targets: { name:
 *   'css selector' } }` to change the per-target sample count or add/override target selectors.
 */
(function prismStructureProbe(options) {
  'use strict';
  const SAMPLE_LIMIT = Math.max(1, Math.min(20, Number(options.samples) || 3));
  const TARGETS = {
    chatgpt: {
      sidebar: '#stage-slideover-sidebar, nav',
      main: 'main',
      transcript: '[class*="transcriptContent"]',
      turns: '[data-turn-key]',
      virtualizedTurns: '[data-virtualized-turn]',
      searchUnits: '[data-content-search-unit-key]',
      assistantMarkdown: '[data-markdown-text-style]',
      assistantBlocks: '[data-markdown-text-style] > *',
      headings: '[data-markdown-text-style] :is(h1, h2, h3, h4)',
      userBubbles: '[data-user-message-bubble]',
      legacyTurns: '[data-message-author-role], article[data-turn], [data-testid^="conversation-turn-"], .agent-turn',
      composerForm: 'form[data-chatgpt-composer]',
      composerLayout: '[data-composer-layout]',
      composerGrids: { selector: 'form[data-chatgpt-composer] *', where: 'grid' },
      composerButtons: 'form[data-chatgpt-composer] button',
      composerAncestors: { ancestorsOf: 'form[data-chatgpt-composer]', depth: 6 }
    },
    gemini: {
      sidebar: 'bard-sidenav, side-navigation-v2, mat-sidenav',
      chatWindow: 'chat-window',
      extendedGridScope: '.enable-extended-and-xl-grid',
      userQueries: 'user-query',
      userBubbles: '.user-query-bubble-with-background',
      modelResponses: 'model-response',
      markdown: '.md-content, .markdown',
      markdownBlocks: '.md-content > *',
      headings: 'model-response :is(h1, h2, h3, h4)',
      responseFooters: 'message-actions',
      disclaimers: 'hallucination-disclaimer, .hallucination-disclaimer',
      inputContainer: 'input-container, .input-gradient',
      inputArea: 'input-area-v2',
      inputAreaContainer: '.input-area-container',
      textInputField: '.text-input-field',
      composerGrids: { selector: 'input-area-v2 *', where: 'grid' },
      composerButtons: 'input-area-v2 button',
      filePreviews: 'input-area-v2 [class*="file-preview"]'
    }
  };
  const STYLE_KEYS = [
    'display', 'position', 'boxSizing', 'width', 'minWidth', 'maxWidth', 'height', 'marginLeft', 'marginRight',
    'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'top', 'bottom', 'zIndex', 'opacity',
    'color', 'backgroundColor', 'backgroundImage', 'maskImage', 'webkitMaskImage', 'backdropFilter',
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
    'gridTemplateColumns', 'gridTemplateRows', 'gridTemplateAreas', 'gridArea', 'flexDirection', 'alignItems', 'justifyContent'
  ];
  const CUSTOM_PROPERTIES = ['--thread-content-max-width', '--user-chat-width', '--bard-chat-window-content-width-default'];

  // UUIDs, long hex runs and anything with a 5+ digit run are treated as identifiers.
  const ID_LIKE = /^(?:.*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}.*|.*[0-9a-f]{12,}.*|.*\d{5,}.*)$/i;
  // Data values additionally treat long mixed letter/digit tokens (e.g. "r_5f2c9a81") as identifiers.
  const MIXED_ID = /^(?=.*\d)(?=.*[a-z])[a-z0-9_]{8,}$/i;
  const SHORT_TOKEN = /^[A-Za-z0-9_.-]{0,32}$/;
  function redactToken(token) {
    if (!token) return token;
    if (ID_LIKE.test(token) || MIXED_ID.test(token)) return '[id]';
    return SHORT_TOKEN.test(token) ? token : '[text]';
  }
  function redactValue(value) {
    if (value === '') return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^(\/|\.\/|\?|#|data:|blob:)/i.test(value)) return '[url]';
    // Structured keys such as "<conversation>:<turn>:<role>" keep their non-id segments.
    return value.split(':').map(redactToken).join(':');
  }
  function redactClass(token) {
    return ID_LIKE.test(token) && !/[[\]:]/.test(token) ? '[id]' : token;
  }
  function redactStyle(value) {
    return String(value).replace(/url\((['"]?)[^)]*\1\)/g, 'url([url])');
  }

  function descriptor(element) {
    const classes = [...element.classList].slice(0, 16).map(redactClass);
    return element.localName + classes.map(token => '.' + token).join('');
  }
  function data(element) {
    const out = {};
    for (const name of element.getAttributeNames()) {
      if (name.startsWith('data-')) out[name] = redactValue(element.getAttribute(name));
    }
    return out;
  }
  function rect(element) {
    const box = element.getBoundingClientRect();
    const round = number => Math.round(number * 10) / 10;
    return { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) };
  }
  function styles(element) {
    const computed = getComputedStyle(element);
    const out = {};
    for (const key of STYLE_KEYS) {
      const value = computed[key];
      if (value !== undefined && value !== '') out[key] = redactStyle(value);
    }
    for (const property of CUSTOM_PROPERTIES) {
      const value = computed.getPropertyValue(property).trim();
      if (value) out[property] = redactStyle(value);
    }
    return out;
  }
  function describe(element) {
    const ancestors = [];
    for (let node = element.parentElement; node && node !== document.documentElement && ancestors.length < 4; node = node.parentElement) {
      ancestors.push(descriptor(node));
    }
    return {
      tag: element.localName,
      classes: [...element.classList].slice(0, 16).map(redactClass),
      data: data(element),
      role: element.getAttribute('role') || null,
      hasAriaLabel: element.hasAttribute('aria-label'),
      contentEditable: element.isContentEditable || undefined,
      rect: rect(element),
      style: styles(element),
      ancestors,
      children: [...element.children].slice(0, 12).map(descriptor)
    };
  }
  function collect(spec) {
    let nodes;
    if (typeof spec === 'string') nodes = [...document.querySelectorAll(spec)];
    else if (spec.ancestorsOf) {
      nodes = [];
      for (let node = document.querySelector(spec.ancestorsOf)?.parentElement; node && nodes.length < (spec.depth || 4); node = node.parentElement) nodes.push(node);
    } else {
      nodes = [...document.querySelectorAll(spec.selector)];
      if (spec.where === 'grid') nodes = nodes.filter(node => /grid/.test(getComputedStyle(node).display));
    }
    return { count: nodes.length, samples: nodes.slice(0, SAMPLE_LIMIT).map(describe) };
  }

  const hostname = location.hostname;
  const site = /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/.test(hostname) ? 'chatgpt' : /(^|\.)gemini\.google\.com$/.test(hostname) ? 'gemini' : 'unknown';
  const targets = { ...(TARGETS[site] || {}), ...(options.targets || {}) };
  const result = {
    probe: 'obsidian-prism-structure-probe',
    version: 1,
    site,
    host: hostname,
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    colorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    root: { html: describe(document.documentElement), body: document.body ? describe(document.body) : null },
    targets: {}
  };
  for (const [name, spec] of Object.entries(targets)) {
    try { result.targets[name] = collect(spec); }
    catch (error) { result.targets[name] = { error: String(error && error.name || 'Error') }; }
  }
  return result;
})(typeof globalThis.__PRISM_PROBE_OPTIONS__ === 'object' && globalThis.__PRISM_PROBE_OPTIONS__ || {});
