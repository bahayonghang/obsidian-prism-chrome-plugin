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
  const DISCLAIMER_SELECTOR = '[class*="disclaimer"], [data-testid*="disclaimer"], [style*="view-transition-name"]';
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
      userBubbleAncestors: { ancestorsOf: '[data-user-message-bubble]', depth: 8 },
      legacyTurns: '[data-message-author-role], article[data-turn], [data-testid^="conversation-turn-"], .agent-turn',
      composerForm: 'form[data-chatgpt-composer]',
      composerLayout: '[data-composer-layout]',
      composerGrids: { selector: 'form[data-chatgpt-composer] *', where: 'grid' },
      composerButtons: 'form[data-chatgpt-composer] button',
      composerAncestors: { ancestorsOf: 'form[data-chatgpt-composer]', depth: 12 },
      composerSiblings: { siblingsAfter: 'form[data-chatgpt-composer]' },
      contentFades: { selector: '[class*="content-fade"], .content-fade, [class*="fade-mask"]', limit: 12 },
      threadBottomSiblings: { siblingsAfter: '#thread-bottom' },
      dockSiblings: { siblingsAfter: '#thread-bottom-container' },
      disclaimerShells: { selector: DISCLAIMER_SELECTOR, limit: 12 },
      outerWrappers: { outerWrappers: '[class*="--thread-content-"]', limit: 12 },
      threadScrollFooter: '[data-thread-scroll-footer]',
      threadComposerBackdrop: '[data-thread-composer-backdrop]',
      scrollFooterSiblings: { siblingsAfter: '[data-thread-scroll-footer]' },
      composerBackdropSiblings: { siblingsAfter: '[data-thread-composer-backdrop]' },
      scrollerOverlap: { scrollerOverlap: { composer: ['[data-composer-layout]', 'form[data-chatgpt-composer]'], footer: '#thread-bottom-container' } },
      cornerFloats: { cornerFloats: true },
      composerFooter: {
        paintedFooter: {
          form: 'form[data-chatgpt-composer]',
          composerLayout: 'form[data-chatgpt-composer] [data-composer-layout]',
          editor: 'form[data-chatgpt-composer] [contenteditable="true"]'
        },
        markers: { scrollFooter: '[data-thread-scroll-footer]', composerBackdrop: '[data-thread-composer-backdrop]' }
      }
    },
    gemini: {
      sidebar: 'bard-sidenav, side-navigation-v2, mat-sidenav',
      chatWindow: 'chat-window',
      extendedGridScope: '.enable-extended-and-xl-grid',
      userQueries: 'user-query',
      userBubbles: '.user-query-bubble-with-background',
      userBubbleAncestors: { ancestorsOf: '.user-query-bubble-with-background', depth: 8 },
      userQueryText: 'user-query .query-text, user-query .query-text-line, .user-query-bubble-with-background > *',
      modelResponses: 'model-response',
      markdown: '.md-content, .markdown',
      markdownBlocks: '.md-content > *',
      headings: 'model-response :is(h1, h2, h3, h4)',
      responseFooters: 'message-actions',
      disclaimers: 'hallucination-disclaimer, .hallucination-disclaimer',
      inputContainer: 'input-container, .input-gradient',
      inputArea: 'input-area-v2',
      inputAreaContainer: '.input-area-container',
      inputAreaChildren: '.input-area-container > *, input-area-v2 > *',
      textInputField: '.text-input-field',
      composerGrids: { selector: 'input-area-v2 *', where: 'grid' },
      composerButtons: 'input-area-v2 button',
      filePreviews: 'input-area-v2 [class*="file-preview"]',
      inputAncestors: { ancestorsOf: 'input-area-v2', depth: 10 },
      inputSiblings: { siblingsAfter: '.input-area-container' },
      cornerFloats: { cornerFloats: true }
    }
  };
  const STYLE_KEYS = [
    'display', 'position', 'overflowY', 'boxSizing', 'width', 'minWidth', 'maxWidth', 'height', 'minHeight',
    'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
    'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'top', 'bottom', 'zIndex', 'opacity',
    'color', 'backgroundColor', 'backgroundImage', 'boxShadow', 'maskImage', 'webkitMaskImage', 'backdropFilter',
    'viewTransitionName',
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
    'gridTemplateColumns', 'gridTemplateRows', 'gridTemplateAreas', 'gridArea', 'flexDirection', 'alignItems', 'justifyContent'
  ];
  const PSEUDO_STYLE_KEYS = [
    'display', 'position', 'height', 'top', 'bottom', 'left', 'right', 'zIndex', 'opacity',
    'backgroundColor', 'backgroundImage', 'boxShadow', 'maskImage', 'webkitMaskImage', 'backdropFilter'
  ];
  // v0.4.3 #41: anchor positioning of the painted footer and its pseudo-elements (keyword/length values only).
  const ANCHOR_STYLE_KEYS = ['anchorName', 'anchorScope', 'positionAnchor', 'positionArea', 'insetInlineStart', 'insetInlineEnd', 'insetBlockStart', 'insetBlockEnd', 'width'];
  const INTERACTIVE_SELECTOR = 'a[href],button,[role="button"],input,textarea,select';
  const CORNER_EXCLUDED_SELF = 'main, [role="main"]';
  const CORNER_EXCLUDED_ANCESTOR = 'dialog, [role="dialog"], [aria-modal="true"], [data-op-owned], form[data-chatgpt-composer], input-area-v2, input-container';
  const CUSTOM_PROPERTIES = [
    '--thread-content-max-width',
    '--thread-content-responsive-max-width',
    '--thread-body-max-width',
    '--thread-content-top-inset',
    '--thread-content-x',
    '--thread-composer-bottom-inset',
    '--user-chat-width',
    '--bard-chat-window-content-width-default',
    '--bard-chat-window-content-width',
    '--sharp-edge-bottom-shadow',
    '--sharp-edge-bottom-shadow-placeholder-content',
    '--sharp-edge-top-shadow',
    '--sharp-edge-top-shadow-placeholder-content',
    '--composer-surface-primary',
    '--main-surface-primary'
  ];
  const VALUE_REDACTED_STYLES = new Set(['viewTransitionName']);
  const CSS_UNIT_NUMBER = /^\d+(?:px|em|rem|vh|vw|vmin|vmax|ch|ex|pt|pc|in|cm|mm|deg|rad|turn|ms|s|fr)$/i;
  const BOTTOM_SELECTORS = {
    chatgpt: { dock: '#thread-bottom-container', composer: '[data-composer-layout]' },
    gemini: { dock: 'input-container', composer: 'input-area-v2' }
  };

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
    if (/^url\(/i.test(value)) return 'url([url])';
    // Structured keys such as "<conversation>:<turn>:<role>" keep their non-id segments.
    return value.split(':').map(redactToken).join(':');
  }
  function redactClass(token) {
    if (/[[\]:()]/.test(token)) {
      return redactStyle(token)
        .replace(/(['"])[^'"]+\1/g, (_, quote) => `${quote}[text]${quote}`)
        .replace(/[A-Za-z0-9_-]*\d{5,}[A-Za-z0-9_-]*/g, '[id]');
    }
    return ID_LIKE.test(token) ? '[id]' : token;
  }
  function redactStyle(value) {
    return String(value)
      .replace(/url\((['"]?)[^)]*\1\)/g, 'url([url])')
      .replace(/#[0-9a-f]{3,8}\b|\.[0-9]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9_]{8,}/gi, token => {
        if (token[0] === '#' || token[0] === '.') return token;
        if (token.includes('-')) return '[id]';
        if (CSS_UNIT_NUMBER.test(token) || /^(?:matrix|rotate|translate|perspective)3d$/i.test(token)) return token;
        return /[0-9a-f]{12,}/i.test(token) || MIXED_ID.test(token) ? '[id]' : token;
      });
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
  const round = number => Math.round(number * 10) / 10;
  function rect(element) {
    const box = element.getBoundingClientRect();
    const bottom = box.bottom ?? (box.y + box.height);
    return {
      x: round(box.x),
      y: round(box.y),
      width: round(box.width),
      height: round(box.height),
      bottom: round(bottom),
      viewportBottomOffset: round(innerHeight - bottom)
    };
  }
  function elementBottomOffset(node) {
    if (!node) return null;
    const box = node.getBoundingClientRect();
    return round(innerHeight - (box.bottom ?? (box.y + box.height)));
  }
  function bottomOffset(selector) {
    return elementBottomOffset(selector ? document.querySelector(selector) : null);
  }
  function styles(element) {
    const computed = getComputedStyle(element);
    const out = {};
    for (const key of STYLE_KEYS) {
      const value = computed[key];
      if (value !== undefined && value !== '') {
        out[key] = VALUE_REDACTED_STYLES.has(key) ? redactValue(String(value)) : redactStyle(value);
      }
    }
    for (const property of CUSTOM_PROPERTIES) {
      const value = computed.getPropertyValue(property).trim();
      if (value) {
        out[property] = property.endsWith('-placeholder-content') ? redactValue(value) : redactStyle(value);
      }
    }
    return out;
  }
  // Copies the set, non-empty `keys` of a computed style into `out`, each value redacted.
  function readRedactedStyles(computed, keys, out = {}) {
    for (const key of keys) {
      const value = computed[key];
      if (value !== undefined && value !== '') out[key] = redactStyle(value);
    }
    return out;
  }
  // A pseudo-element is generated only when its computed `content` is neither `none` nor `normal`.
  function hasPseudoContent(computed) {
    const content = computed.content;
    return Boolean(content && content !== 'none' && content !== 'normal');
  }
  function anchorStyles(element, pseudo) {
    return readRedactedStyles(getComputedStyle(element, pseudo), ANCHOR_STYLE_KEYS);
  }
  function pseudoStyles(element, pseudo, extraKeys = []) {
    const computed = getComputedStyle(element, pseudo);
    return readRedactedStyles(computed, [...PSEUDO_STYLE_KEYS, ...extraKeys], { hasContent: hasPseudoContent(computed) });
  }
  function describe(element) {
    const ancestors = [];
    for (let node = element.parentElement; node && node !== document.documentElement && ancestors.length < 4; node = node.parentElement) {
      ancestors.push(descriptor(node));
    }
    const before = pseudoStyles(element, '::before');
    const after = pseudoStyles(element, '::after');
    const out = {
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
    if (before.hasContent || after.hasContent) out.pseudos = { before, after };
    return out;
  }
  function collectCornerFloats() {
    const root = document.body || document.documentElement;
    if (!root) return [];
    const candidates = [];
    for (const node of root.querySelectorAll('*')) {
      if (node.matches(CORNER_EXCLUDED_SELF) || node.closest(CORNER_EXCLUDED_ANCESTOR)) continue;
      const style = getComputedStyle(node);
      if (!/^(fixed|absolute|sticky)$/.test(style.position)) continue;
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || parseFloat(style.opacity) === 0) continue;
      if (/^rect\(0px[, ]+0px[, ]+0px[, ]+0px\)$/.test(style.clip) || style.clipPath === 'inset(50%)' || style.pointerEvents === 'none') continue;
      const box = node.getBoundingClientRect();
      if (!(box.width > 0 && box.height > 0 && box.width <= 260 && box.height <= 160)) continue;
      if (!(box.right >= innerWidth - 260 && box.bottom >= innerHeight - 200 && box.left >= innerWidth * 0.5 && box.top >= innerHeight * 0.5 && box.left < innerWidth && box.top < innerHeight)) continue;
      candidates.push(node);
    }
    return candidates.filter(node => !candidates.some(other => other !== node && other.contains(node)));
  }
  const TRANSPARENT = /^(?:transparent|rgba\([^)]*,\s*0\))$/;
  function paintsPseudo(element, pseudo) {
    const computed = getComputedStyle(element, pseudo);
    if (!hasPseudoContent(computed)) return false;
    return (computed.backgroundImage && computed.backgroundImage !== 'none') ||
      Boolean(computed.backgroundColor && !TRANSPARENT.test(computed.backgroundColor));
  }
  function findPaintedFooterNode(form) {
    for (let node = form?.parentElement; node && !node.matches('main, body, html'); node = node.parentElement) {
      if (paintsPseudo(node, '::before') || paintsPseudo(node, '::after')) return node;
    }
    return null;
  }
  function findThreadFooterNode() {
    const marker = document.querySelector('[data-thread-scroll-footer]') || document.querySelector('[data-thread-composer-backdrop]');
    if (!marker) return null;
    const form = document.querySelector('form[data-chatgpt-composer]');
    const painted = form ? findPaintedFooterNode(form) : null;
    if (painted && (painted === marker || painted.contains(marker))) return painted;
    return marker;
  }
  function findMessageScrollerNode() {
    const turn = document.querySelector('[data-turn-key], [data-content-search-unit-key], [data-message-author-role], user-query, model-response');
    for (let node = turn?.parentElement; node && !node.matches('body, html'); node = node.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(node).overflowY || '') || node.matches('[data-prism-test-scroller], [class*="thread-scroll"], infinite-scroller')) {
        return node;
      }
    }
    return document.querySelector('[data-prism-test-scroller], [class*="thread-scroll"], infinite-scroller');
  }
  function describeSibling(node) {
    return {
      ...describe(node),
      childCount: node.children.length,
      hasInteractive: node.matches(INTERACTIVE_SELECTOR) || Boolean(node.querySelector(INTERACTIVE_SELECTOR))
    };
  }
  // v0.4.3 #41 / v0.4.4 #46: the nearest ancestor of the composer form whose ::before/::after paints a surface,
  // ancestor depths, boxless wrappers, inner scrollFooter/composerBackdrop metrics, internal spacers and disclaimers.
  function collectPaintedFooter(spec) {
    const form = document.querySelector(spec.paintedFooter.form);
    const footer = findPaintedFooterNode(form);
    if (!footer) return { count: 0, samples: [] };
    const chain = start => {
      if (!start || !footer.contains(start)) return null;
      let ancestors = 0, noBox = 0;
      for (let node = start.parentElement; node; node = node.parentElement) {
        ancestors++;
        if (node === footer) break;
        if (getComputedStyle(node).display === 'contents') noBox++;
      }
      return { ancestors, noBox };
    };
    const chains = {};
    for (const [name, selector] of Object.entries(spec.paintedFooter)) chains[name] = chain(document.querySelector(selector));
    const markers = {};
    for (const [name, selector] of Object.entries(spec.markers || {})) {
      let step = 0, found = null;
      for (let node = form.parentElement; node && node !== footer.parentElement; node = node.parentElement) {
        step++;
        if (node.matches(selector)) { found = step; break; }
      }
      markers[name] = found;
    }
    const scrollFooterNode = footer.matches('[data-thread-scroll-footer]') ? footer : footer.querySelector('[data-thread-scroll-footer]');
    const composerBackdropNode = footer.matches('[data-thread-composer-backdrop]') ? footer : footer.querySelector('[data-thread-composer-backdrop]');
    const internalSpacers = [];
    const seenSpacers = new Set();
    for (let cur = form; cur && cur !== footer; cur = cur.parentElement) {
      for (let sib = cur.nextElementSibling; sib; sib = sib.nextElementSibling) {
        if (seenSpacers.has(sib)) continue;
        seenSpacers.add(sib);
        internalSpacers.push(describeSibling(sib));
      }
    }
    const internalDisclaimers = [...footer.querySelectorAll(DISCLAIMER_SELECTOR)].slice(0, 12).map(describe);
    const sample = describe(footer);
    sample.pseudos = { before: pseudoStyles(footer, '::before', ANCHOR_STYLE_KEYS), after: pseudoStyles(footer, '::after', ANCHOR_STYLE_KEYS) };
    sample.anchor = anchorStyles(footer);
    return {
      count: 1,
      chains,
      markers,
      formAnchor: anchorStyles(form),
      scrollFooter: scrollFooterNode ? describe(scrollFooterNode) : null,
      composerBackdrop: composerBackdropNode ? describe(composerBackdropNode) : null,
      internalSpacers,
      internalDisclaimers,
      samples: [sample]
    };
  }
  function collectOuterWrappers(spec) {
    const seen = new Set();
    const nodes = [];
    const push = node => {
      if (!node || seen.has(node) || node.matches('body, html')) return;
      seen.add(node);
      nodes.push(node);
    };
    const scroller = findMessageScrollerNode();
    for (let node = scroller?.parentElement; node && !node.matches('body, html'); node = node.parentElement) push(node);
    if (spec.outerWrappers) {
      for (const node of document.querySelectorAll(spec.outerWrappers)) push(node);
    }
    const limit = spec.limit != null ? Math.max(1, Number(spec.limit) || nodes.length) : 12;
    return { count: nodes.length, samples: nodes.slice(0, limit).map(describe) };
  }
  function firstQuery(selectorOrList) {
    if (!selectorOrList) return null;
    if (Array.isArray(selectorOrList)) {
      for (const sel of selectorOrList) {
        const hit = document.querySelector(sel);
        if (hit) return hit;
      }
      return null;
    }
    return document.querySelector(selectorOrList);
  }
  function collectScrollerOverlap(spec) {
    const scroller = findMessageScrollerNode();
    const footer = findThreadFooterNode() || firstQuery(spec.footer);
    const composer = firstQuery(spec.composer);
    const scrollerBox = scroller ? scroller.getBoundingClientRect() : null;
    const footerBox = footer ? footer.getBoundingClientRect() : null;
    const composerBox = composer ? composer.getBoundingClientRect() : null;
    const scrollerBottom = scrollerBox ? (scrollerBox.bottom ?? (scrollerBox.y + scrollerBox.height)) : null;
    const footerTop = footerBox ? (footerBox.top ?? footerBox.y) : null;
    const footerBottom = footerBox ? (footerBox.bottom ?? (footerBox.y + footerBox.height)) : null;
    const composerTop = composerBox ? (composerBox.top ?? composerBox.y) : null;
    const composerBottom = composerBox ? (composerBox.bottom ?? (composerBox.y + composerBox.height)) : null;
    return {
      found: Boolean(scroller),
      scroller: scroller ? {
        descriptor: descriptor(scroller),
        rect: rect(scroller),
        paddingBottom: redactStyle(getComputedStyle(scroller).paddingBottom || ''),
        overflowY: redactStyle(getComputedStyle(scroller).overflowY || ''),
        containsFooter: Boolean(footer && scroller.contains(footer)),
        containsComposer: Boolean(composer && scroller.contains(composer))
      } : null,
      footerTop: footerTop !== null ? round(footerTop) : null,
      footerBottom: footerBottom !== null ? round(footerBottom) : null,
      composerTop: composerTop !== null ? round(composerTop) : null,
      composerBottom: composerBottom !== null ? round(composerBottom) : null,
      footerOverlapPx: scrollerBottom !== null && footerTop !== null ? round(Math.max(0, scrollerBottom - footerTop)) : null,
      composerOverlapPx: scrollerBottom !== null && composerTop !== null ? round(Math.max(0, scrollerBottom - composerTop)) : null
    };
  }
  function collect(spec) {
    if (typeof spec !== 'string' && spec.paintedFooter) return collectPaintedFooter(spec);
    if (typeof spec !== 'string' && spec.outerWrappers) return collectOuterWrappers(spec);
    if (typeof spec !== 'string' && spec.scrollerOverlap) return collectScrollerOverlap(spec.scrollerOverlap);
    if (typeof spec !== 'string' && spec.siblingsAfter) {
      const nodes = [];
      for (let node = document.querySelector(spec.siblingsAfter)?.nextElementSibling; node; node = node.nextElementSibling) nodes.push(node);
      const limit = spec.limit != null ? Math.max(1, Number(spec.limit) || nodes.length) : nodes.length;
      return {
        count: nodes.length,
        samples: nodes.slice(0, limit).map(describeSibling)
      };
    }
    let nodes;
    let limit = typeof spec !== 'string' && spec.limit != null ? Math.max(1, Number(spec.limit) || SAMPLE_LIMIT) : SAMPLE_LIMIT;
    if (typeof spec === 'string') nodes = [...document.querySelectorAll(spec)];
    else if (spec.ancestorsOf) {
      limit = Math.max(1, Number(spec.depth || spec.limit) || 4);
      nodes = [];
      for (let node = document.querySelector(spec.ancestorsOf)?.parentElement; node && nodes.length < limit; node = node.parentElement) nodes.push(node);
    } else if (spec.cornerFloats) {
      nodes = collectCornerFloats();
    } else {
      nodes = [...document.querySelectorAll(spec.selector)];
      if (spec.where === 'grid') nodes = nodes.filter(node => /grid/.test(getComputedStyle(node).display));
    }
    return { count: nodes.length, samples: nodes.slice(0, limit).map(describe) };
  }

  const hostname = location.hostname;
  const site = /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/.test(hostname) ? 'chatgpt' : /(^|\.)gemini\.google\.com$/.test(hostname) ? 'gemini' : 'unknown';
  const targets = { ...(TARGETS[site] || {}), ...(options.targets || {}) };
  const bottomSpec = BOTTOM_SELECTORS[site];
  const threadFooterNode = site === 'chatgpt' ? findThreadFooterNode() : null;
  const dockNode = bottomSpec ? (document.querySelector(bottomSpec.dock) || threadFooterNode) : null;
  const result = {
    probe: 'obsidian-prism-structure-probe',
    version: 1,
    site,
    host: hostname,
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    colorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    root: { html: describe(document.documentElement), body: document.body ? describe(document.body) : null },
    bottomOffsets: {
      dockBottomOffset: elementBottomOffset(dockNode),
      threadFooterBottomOffset: elementBottomOffset(threadFooterNode),
      composerBottomOffset: bottomSpec ? bottomOffset(bottomSpec.composer) : null
    },
    targets: {}
  };
  for (const [name, spec] of Object.entries(targets)) {
    try { result.targets[name] = collect(spec); }
    catch (error) { result.targets[name] = { error: String(error && error.name || 'Error') }; }
  }
  return result;
})(typeof globalThis.__PRISM_PROBE_OPTIONS__ === 'object' && globalThis.__PRISM_PROBE_OPTIONS__ || {});
