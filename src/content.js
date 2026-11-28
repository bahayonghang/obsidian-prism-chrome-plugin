/* Obsidian Prism Web — reversible, event-driven workbench.
 * Community port of RMvdesi/obsidian-prism. Modified 2026-11-22.
 * SPDX-License-Identifier: GPL-3.0-only. See NOTICE / MODIFICATIONS.md. */
(function (global) {
  'use strict';
  if (global.ObsidianPrismRuntime) return;
  const Schema = global.ObsidianPrismSchema;
  const Adapters = global.ObsidianPrismAdapters;
  const Formula = global.ObsidianPrismFormula;
  const host = Schema?.detectHost();
  const adapter = Adapters?.forHost(host);
  if (!Schema || !adapter) return;
  const FORMULA_DEBOUNCE_MS = 280;
  const SCAN_DEBOUNCE_MS = 160;
  const STREAM_SCAN_MS = 260;

  let cfg = Schema.DEFAULT_CONFIG;
  let enabled = false;
  let stopped = false;
  let hasConfig = false;
  let observer = null;
  let documentObserver = null;
  let observedBody = null;
  let observeBodyFn = null;
  let observerCapturesOldValue = false;
  let events = null;
  let pending = null;
  let pendingDelay = 0;
  let streamIdle = null;
  let fadeFrame = null;
  let lastHighlightPaint = 0;
  let lastHighlightBuckets = ['', '', '', '', ''];
  let scrollFrame = null;
  let revision = 0;
  let passes = 0;
  let nextId = 0;
  let route = location.href;
  let rail = null;
  let dock = null;
  let ambient = null;
  let activeTurn = -1;
  let renderedActiveTurn = -2;
  let cachedUserTurns = [];
  let cachedAssistantTurns = [];
  let cachedUserTurnSet = new Set();
  let cachedAssistantTurnSet = new Set();
  let cachedMessageScroller = null;
  let railSignature = '';
  let prevRailTurns = [];
  let lastRailLang = '';
  let lastEstimate = 0;
  let lastModelLabel = '';
  let lastAttachments = 0;
  let estimate = {user:0, assistant:0, code:0, total:0};
  let fadeEntries = [];
  let surfaceObserver = null;
  let primarySurface = null;
  let dockObserver = null;
  let observedDock = null;
  let dockScroller = null;
  let dockOverlaidHost = null;
  let alphaFadeScroller = null;
  let alphaFadeDock = null;
  let geometryFrame = null;
  const surfaceMarks = new Map();
  const codes = new Map();
  const formulas = new Map();
  const savedFoldState = new WeakMap();
  let formulaSkipCache = new WeakMap();
  let codeHeaderSvgCache = new WeakMap();
  let turnTokenCache = new WeakMap();
  let dirtyVialTurns = new WeakSet();
  let dirtyRailTurns = new WeakSet();
  let railTurnTextCache = new WeakMap();
  let forceFullEstimate = true;
  let forceRailRecompute = true;
  let needOrphanPrune = true;
  const dirty = { surfaces: true, formulas: true, codes: true, rail: true, vial: true, thoughts: true, geometry: true };
  function markTurnDirty(turn) {
    if (!turn) return;
    dirtyVialTurns.add(turn);
    dirtyRailTurns.add(turn);
  }
  function markAllDirty({ fullEstimate = false, fullRail = false, pruneOrphans = false } = {}) {
    dirty.surfaces = dirty.formulas = dirty.codes = dirty.rail = dirty.vial = dirty.thoughts = dirty.geometry = true;
    if (fullEstimate) forceFullEstimate = true;
    if (fullRail) forceRailRecompute = true;
    if (pruneOrphans) needOrphanPrune = true;
  }
  function clearTurnCaches() {
    turnTokenCache = new WeakMap();
    dirtyVialTurns = new WeakSet();
    dirtyRailTurns = new WeakSet();
    railTurnTextCache = new WeakMap();
    prevRailTurns = [];
    lastRailLang = '';
    cachedUserTurns = [];
    cachedAssistantTurns = [];
    cachedUserTurnSet = new Set();
    cachedAssistantTurnSet = new Set();
    cachedMessageScroller = null;
    forceFullEstimate = true;
    forceRailRecompute = true;
  }
  const thoughts = new Map();
  const runWithScanCache = fn => (typeof adapter.withScanCache === 'function' ? adapter.withScanCache(fn) : fn());
  const fades = ['op-stream-f0','op-stream-f1','op-stream-f2','op-stream-f3','op-stream-f4'];
  const systemTheme = matchMedia('(prefers-color-scheme: dark)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const instanceId = `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const RUNTIME_SURFACE_ATTRS = Object.freeze([
    'data-op-main-surface',
    'data-op-thread-column',
    'data-op-thread-overlaid',
    'data-op-composer-column',
    'data-op-code-surface',
    'data-op-code-header',
    'data-op-code-icon-fill',
    'data-op-code-icon-stroke',
    'data-op-composer-dock',
    'data-op-thread-footer',
    'data-op-composer-overlaid',
    'data-op-composer-scrim',
    'data-op-thread-scroller',
    'data-op-scroller-fade',
    'data-op-composer-empty-sibling',
    'data-op-composer-disclaimer',
    'data-op-thread-spacer',
    'data-op-composer-surface',
    'data-op-composer-grid',
    'data-op-composer-header-empty',
    'data-op-composer-leading',
    'data-op-composer-primary',
    'data-op-composer-trailing',
    'data-op-composer-toolbar',
    'data-op-composer-add',
    'data-op-model-capsule',
    'data-op-model-capsule-item',
    'data-op-composer-primary-action',
    'data-op-composer-attachment',
    'data-op-composer-chip',
    'data-op-composer-backdrop',
    'data-op-sidebar-surface',
    'data-op-sidebar-active',
    'data-op-sidebar-active-tile'
  ]);
  const RUNTIME_SURFACE_SELECTOR = RUNTIME_SURFACE_ATTRS.map(attr => `[${attr}="true"]`).join(',');
  const RUNTIME_ROOT_VARS = Object.freeze([
    '--op-reading-width',
    '--op-reading-shift',
    '--op-dock-clearance',
    '--op-scroller-fade-start',
    '--op-scroller-fade-end',
    '--op-dock-offset-x',
    '--op-dock-offset-y'
  ]);
  let unsubscribe = () => {};
  let yielded = false;
  let claimedOwnership = false;
  let handoverPending = false;
  let mediaChanged = () => {};
  let onHide = () => {};
  let onShow = () => {};
  const currentOwner = () => document.documentElement?.getAttribute('data-op-instance') || null;
  const hasLostOwnership = () => claimedOwnership && Boolean(currentOwner() && currentOwner() !== instanceId);
  const isOwner = () => !hasLostOwnership();
  const ownsRootAttr = () => currentOwner() === instanceId;
  function disconnectRuntime({ permanent = false } = {}) {
    enabled = false;
    observer?.disconnect(); observer = null;
    documentObserver?.disconnect(); documentObserver = null; observedBody = null; observeBodyFn = null; observerCapturesOldValue = false;
    events?.abort(); events = null;
    clearTimeout(pending); pending = null; pendingDelay = 0;
    clearFormulaChunkQueue();
    for (const entry of formulas.values()) { clearTimeout(entry.debounceTimer); entry.debounceTimer = null; }
    if (scrollFrame) cancelAnimationFrame(scrollFrame); scrollFrame = null;
    if (geometryFrame) cancelAnimationFrame(geometryFrame); geometryFrame = null;
    if (fadeFrame) cancelAnimationFrame(fadeFrame); fadeFrame = null;
    lastHighlightPaint = 0; lastHighlightBuckets = ['', '', '', '', ''];
    dockObserver?.disconnect(); dockObserver = null; observedDock = null;
    dockScroller = dockOverlaidHost = alphaFadeScroller = alphaFadeDock = null;
    railSignature = ''; lastEstimate = 0; lastModelLabel = ''; lastAttachments = 0; activeTurn = -1;
    renderedActiveTurn = -2;
    clearTurnCaches();
    markAllDirty({ fullEstimate: true, fullRail: true });
    if (permanent) {
      stopped = true;
      surfaceObserver?.disconnect(); surfaceObserver = null; primarySurface = null;
      clearTimeout(streamIdle); streamIdle = null;
      fadeEntries = [];
      unsubscribe();
      systemTheme.removeEventListener('change', mediaChanged);
      reducedMotion.removeEventListener('change', mediaChanged);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
    }
  }
  function yieldOwnership() {
    if (yielded) return;
    yielded = true;
    disconnectRuntime({ permanent: true });
    handoverPending = false;
    surfaceMarks.clear();
    codes.clear();
    for (const entry of formulas.values()) { clearTimeout(entry.debounceTimer); entry.debounceTimer = null; }
    formulas.clear();
    formulaSkipCache = new WeakMap();
    codeHeaderSvgCache = new WeakMap();
    thoughts.clear();
    rootVarOriginals.clear();
    readingWidth = '';
    dock = rail = ambient = null;
  }
  function lostOwnership() {
    if (!hasLostOwnership()) return false;
    yieldOwnership();
    return true;
  }
  function queryAllNodes(selectorList) {
    if (typeof document.querySelectorAll === 'function') {
      try { return [...document.querySelectorAll(selectorList)]; } catch (_) {}
    }
    const out = [];
    const roots = [document.body, document.documentElement].filter(Boolean);
    for (const part of selectorList.split(',').map(s => s.trim()).filter(Boolean)) {
      const simple = part.replace(/\[[^\]]+\]/g, '');
      if (!simple) {
        const attrMatch = part.match(/\[([^\]=]+)(?:="([^"]*)")?\]/);
        if (attrMatch) {
          const walk = node => {
            for (const child of node?.children || []) {
              const val = child.getAttribute?.(attrMatch[1]);
              if ((attrMatch[2] === undefined ? val !== null : val === attrMatch[2]) && !out.includes(child)) out.push(child);
              walk(child);
            }
          };
          for (const root of roots) walk(root);
        }
        continue;
      }
      for (const root of roots) {
        if (!root.querySelectorAll) continue;
        for (const node of root.querySelectorAll(simple)) {
          if (!out.includes(node) && (!part.includes('[data-op-owned]') || node.hasAttribute?.('data-op-owned'))) out.push(node);
        }
      }
    }
    return out;
  }
  const ORPHAN_ROOT_SELECTOR = [
    '#op-bottom-dock', '.op-dock[data-op-owned]',
    '#op-rail-root', '.op-rail[data-op-owned]',
    '#op-ambient-stage', '.op-ambient[data-op-owned]',
    '.op-code-fold-bar[data-op-owned]',
    '.op-thought-toolbar[data-op-owned]',
    '.op-formula-preview[data-op-owned]',
    '.op-formula-toggle[data-op-owned]',
    '.op-formula-bar[data-op-owned]'
  ].join(', ');
  function pruneOrphanRoots() {
    const keepOwned = new Set();
    if (dock) keepOwned.add(dock);
    if (rail) keepOwned.add(rail);
    if (ambient) keepOwned.add(ambient);
    for (const entry of codes.values()) keepOwned.add(entry.button);
    for (const entry of thoughts.values()) keepOwned.add(entry.toolbar);
    const keepHiddenTargets = new Set();
    for (const entry of formulas.values()) {
      if (!entry.renderedOk) continue;
      keepOwned.add(entry.previewEl);
      keepOwned.add(entry.toggleBtn);
      if (entry.barEl) keepOwned.add(entry.barEl);
      if (entry.mode === 'preview') keepHiddenTargets.add(entry.hideTarget);
    }
    for (const node of queryAllNodes(ORPHAN_ROOT_SELECTOR)) {
      if (!keepOwned.has(node)) node.remove();
    }
    for (const node of queryAllNodes('[data-op-formula-source-hidden="true"]')) {
      if (!keepHiddenTargets.has(node)) node.removeAttribute('data-op-formula-source-hidden');
    }
  }

  const t = key => Schema.t(cfg, key);
  const local = (zh, en) => cfg.language === 'zh-CN' ? zh : en;
  const motionAllowed = () => cfg.motionLevel !== 'off' && !reducedMotion.matches && !document.hidden;
  const activeForSite = () => cfg.enabled && (host === 'chatgpt' ? cfg.enableChatGPT : cfg.enableGemini);
  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    if (tag === 'button') element.type = 'button';
    return element;
  }
  function own(element) { element.setAttribute('data-op-owned',''); return element; }
  function setText(element, value) { if (element.textContent !== value) element.textContent = value; }
  function setAttr(element, name, value) {
    const next = String(value);
    if (element.getAttribute(name) !== next) element.setAttribute(name, next);
  }
  function removeAttr(element, name) {
    if (element.hasAttribute ? element.hasAttribute(name) : element.getAttribute(name) !== null) {
      element.removeAttribute(name);
    }
  }
  function listen(target, type, listener, options = {}) {
    target.addEventListener(type, listener, {...options, signal: events.signal});
  }
  function cleanupCode(pre, entry) {
    entry.button.remove();
    pre.classList.remove('op-code-folded');
    if (entry.generatedId && pre.id === entry.generatedId) pre.removeAttribute('id');
    codes.delete(pre);
  }
  function cleanupFormula(pre, entry) {
    clearTimeout(entry.debounceTimer);
    entry.debounceTimer = null;
    entry.hideTarget?.removeAttribute('data-op-formula-source-hidden');
    entry.previewEl?.remove();
    entry.toggleBtn?.remove();
    entry.barEl?.remove();
    formulas.delete(pre);
  }
  function cleanupThought(element, entry) {
    entry.version++;
    entry.toolbar.remove();
    element.classList.remove('op-thought-hidden');
    thoughts.delete(element);
  }
  function clearHighlights() {
    if (fadeFrame) cancelAnimationFrame(fadeFrame);
    fadeFrame = null; fadeEntries = []; lastHighlightPaint = 0; lastHighlightBuckets = ['', '', '', '', ''];
    if (global.CSS?.highlights) fades.forEach(name => CSS.highlights.delete(name));
  }
  function setAuraState(state) {
    if (ambient) {
      if (state) setAttr(ambient, 'data-op-aura', state);
      else removeAttr(ambient, 'data-op-aura');
    }
    removeAttr(document.documentElement, 'data-op-aura');
  }
  function clearActivity() {
    clearTimeout(streamIdle); streamIdle = null;
    clearHighlights();
    setAuraState(null);
  }

  // No wrappers are inserted into streamed text. Ranges are created once and reused across rAF frames.
  function paintHighlights(force = false) {
    fadeFrame = null;
    if (!enabled || !cfg.streamChoreography || !motionAllowed() || !global.CSS?.highlights || !global.Highlight) {
      clearHighlights(); return;
    }
    const now = performance.now();
    // Each fade tier lasts 65ms; step highlight updates at ~60ms rAF cadence to avoid 60Hz document-wide style invalidation.
    if (!force && lastHighlightPaint && now - lastHighlightPaint < 60 && fadeEntries.length) {
      fadeFrame = requestAnimationFrame(() => paintHighlights(false));
      return;
    }
    lastHighlightPaint = now;
    const buckets = fades.map(() => []);
    const bucketSigParts = fades.map(() => []);
    const alive = [];
    for (let i = 0; i < fadeEntries.length; i++) {
      const entry = fadeEntries[i];
      const tier = Math.floor((now - entry.created) / 65);
      const length = entry.node.nodeValue?.length || 0;
      if (!entry.node.isConnected || tier > 4 || entry.start >= length) continue;
      const clampedEnd = Math.min(length, entry.end);
      try {
        if (clampedEnd !== entry.clampedEnd) {
          entry.range.setEnd(entry.node, clampedEnd);
          entry.clampedEnd = clampedEnd;
        }
        const bucketIdx = Math.max(0, tier);
        buckets[bucketIdx].push(entry.range);
        bucketSigParts[bucketIdx].push(`${entry.id}:${clampedEnd}`);
        alive.push(entry);
      } catch (_) {}
    }
    fadeEntries = alive;
    for (let index = 0; index < fades.length; index++) {
      const sig = bucketSigParts[index].join(',');
      if (sig === lastHighlightBuckets[index]) continue;
      lastHighlightBuckets[index] = sig;
      const name = fades[index];
      if (buckets[index].length) CSS.highlights.set(name, new Highlight(...buckets[index]));
      else CSS.highlights.delete(name);
    }
    if (fadeEntries.length) fadeFrame = requestAnimationFrame(() => paintHighlights(false));
  }
  let nextFadeId = 0;
  function addTextFade(node, oldValue = '') {
    if (!cfg.streamChoreography || !motionAllowed() || !global.CSS?.highlights || !global.Highlight) return;
    if (node.nodeType !== Node.TEXT_NODE || !adapter.isAssistantNode(node)) return;
    if (node.parentElement?.closest('pre,code,[data-op-owned]')) return;
    const text = node.nodeValue || '';
    if (!text.trim()) return;
    const start = oldValue && text.startsWith(oldValue) ? oldValue.length : 0;
    if (start >= text.length) return;
    let range;
    try {
      range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, text.length);
    } catch (_) { return; }
    fadeEntries.push({ id: ++nextFadeId, node, start, end: text.length, clampedEnd: text.length, created: performance.now(), range });
    if (fadeEntries.length > 64) fadeEntries = fadeEntries.slice(-64);
    if (!fadeFrame) fadeFrame = requestAnimationFrame(() => paintHighlights(true));
  }
  function markResponseActivity() {
    if (!enabled || document.hidden) return;
    if (cfg.semanticAura && motionAllowed()) setAuraState('streaming');
    clearTimeout(streamIdle);
    streamIdle = setTimeout(() => {
      streamIdle = null;
      clearHighlights();
      if (enabled && cfg.semanticAura && motionAllowed()) setAuraState('settled');
      else setAuraState(null);
      lastEstimate = 0;
      markAllDirty({ fullEstimate: true });
      schedule(SCAN_DEBOUNCE_MS);
    }, 1200);
  }
  const STRUCTURAL_TAGS = new Set(['PRE','CODE','DETAILS','SUMMARY','FORM','NAV','ASIDE','MAIN','HEADER','FOOTER','DIALOG','BUTTON','INPUT','TEXTAREA','IMG','TABLE','CODE-BLOCK','USER-QUERY','MODEL-RESPONSE','ARTICLE','SECTION']);
  function findEnclosingTurn(node) {
    let cur = node && node.nodeType === 1 ? node : node?.parentElement;
    while (cur) {
      if (cachedAssistantTurnSet.has(cur)) return { turn: cur, role: 'assistant' };
      if (cachedUserTurnSet.has(cur)) return { turn: cur, role: 'user' };
      cur = cur.parentElement;
    }
    return null;
  }
  function isStructuralNode(node) {
    if (!node || node.nodeType !== 1) return false;
    const tag = (node.tagName || '').toUpperCase();
    if (STRUCTURAL_TAGS.has(tag)) return true;
    if (node.matches?.('[data-testid],[data-turn],[data-message-author-role],[contenteditable="true"],[role="dialog"],[role="navigation"],.code-block,.code-header')) return true;
    if (node.querySelector?.('pre,code,details,form,nav,aside,button,img,code-block,user-query,model-response,[data-turn],[data-message-author-role]')) return true;
    return false;
  }
  function isRelevantClassTarget(node) {
    if (!node || node.nodeType !== 1) return false;
    const enclosed = findEnclosingTurn(node);
    if (!enclosed || enclosed.turn === node) return true;
    if (node.closest?.('pre,code,details,button,a,form,nav,aside,[data-op-code-surface],[data-op-code-header],[data-op-sidebar-surface],[data-op-composer-surface],[data-op-composer-dock]')) return true;
    return false;
  }
  function mutationsChanged(records) {
    if (lostOwnership() || !enabled || stopped) return;
    // Check detached extension roots without allocating intermediate arrays.
    let anyDirty = false;
    let structuralDirty = false;
    if (rail && !rail.isConnected) { dirty.rail = true; anyDirty = structuralDirty = true; }
    if (dock && !dock.isConnected) { dirty.vial = dirty.geometry = true; anyDirty = structuralDirty = true; }
    if (ambient && !ambient.isConnected) { dirty.surfaces = dirty.geometry = true; anyDirty = structuralDirty = true; }
    for (const [pre, entry] of codes) {
      if (pre.isConnected && !entry.button.isConnected) { dirty.codes = true; anyDirty = true; break; }
    }
    for (const entry of formulas.values()) {
      if (entry.pre.isConnected && entry.renderedOk && (!entry.toggleBtn.isConnected || (entry.mode === 'preview' && !entry.previewEl.isConnected))) {
        dirty.formulas = true; anyDirty = true; break;
      }
    }
    for (const [element, entry] of thoughts) {
      if (element.isConnected && !entry.toolbar.isConnected) { dirty.thoughts = true; anyDirty = structuralDirty = true; break; }
    }
    let responseChanged = false;
    for (let r = 0; r < records.length; r++) {
      const record = records[r];
      if (Adapters.isOwned(record.target)) continue;
      if (record.type === 'childList') {
        const added = record.addedNodes;
        const removed = record.removedNodes;
        const addedLen = added ? added.length : 0;
        const removedLen = removed ? removed.length : 0;
        if (addedLen + removedLen > 0) {
          let allOwned = true;
          for (let i = 0; i < addedLen; i++) if (!Adapters.isOwned(added[i])) { allOwned = false; break; }
          if (allOwned) for (let i = 0; i < removedLen; i++) if (!Adapters.isOwned(removed[i])) { allOwned = false; break; }
          if (allOwned) {
            for (let i = 0; i < addedLen; i++) {
              const n = added[i];
              if (n.nodeType === 1 && n !== rail && n !== dock && n !== ambient && !codes.has(n.previousElementSibling) && !formulas.has(n)) {
                needOrphanPrune = true;
              }
            }
            continue;
          }
        }
      }
      const enclosed = findEnclosingTurn(record.target);
      const targetEl = record.target && record.target.nodeType === 1 ? record.target : record.target?.parentElement;
      if (record.type === 'characterData') {
        const isAssistant = enclosed ? enclosed.role === 'assistant' : adapter.isAssistantNode(record.target);
        if (enclosed) markTurnDirty(enclosed.turn);
        dirty.vial = true;
        anyDirty = true;
        if (enclosed?.role === 'user') { dirty.rail = true; structuralDirty = true; }
        if (targetEl?.closest?.('pre,code')) { dirty.formulas = dirty.codes = true; }
        if (thoughts.size && targetEl) {
          for (const thoughtEl of thoughts.keys()) {
            if (thoughtEl === targetEl || thoughtEl.contains?.(targetEl)) { dirty.thoughts = true; structuralDirty = true; break; }
          }
        }
        if (!enclosed && !isAssistant) {
          dirty.surfaces = dirty.rail = dirty.thoughts = dirty.geometry = true;
          structuralDirty = true;
        }
        if (!document.hidden && isAssistant) {
          responseChanged = true;
          addTextFade(record.target, record.oldValue || '');
        }
        continue;
      }
      if (record.type === 'attributes') {
        if (record.attributeName === 'data-is-streaming') {
          dirty.formulas = dirty.vial = true;
          anyDirty = true;
          continue;
        }
        if (record.attributeName === 'class' && !isRelevantClassTarget(record.target)) continue;
        if (enclosed) {
          markTurnDirty(enclosed.turn);
          dirty.vial = true;
          if (enclosed.role === 'user') dirty.rail = true;
        }
        dirty.surfaces = dirty.thoughts = dirty.geometry = true;
        if (targetEl?.closest?.('pre,code,[data-op-code-surface]')) dirty.formulas = dirty.codes = true;
        anyDirty = structuralDirty = true;
        continue;
      }
      // childList mutation: check if purely inline prose inside a known assistant turn
      let hasStructural = !enclosed || enclosed.role !== 'assistant' || Boolean(targetEl?.closest?.('pre,code'));
      if (!hasStructural) {
        const added = record.addedNodes || [];
        const removed = record.removedNodes || [];
        for (let i = 0; i < added.length; i++) {
          if (!Adapters.isOwned(added[i]) && isStructuralNode(added[i])) { hasStructural = true; break; }
        }
        if (!hasStructural) {
          for (let i = 0; i < removed.length; i++) {
            if (!Adapters.isOwned(removed[i]) && isStructuralNode(removed[i])) { hasStructural = true; break; }
          }
        }
      }
      if (enclosed) markTurnDirty(enclosed.turn);
      anyDirty = true;
      if (!hasStructural) {
        dirty.vial = true;
        responseChanged = true;
      } else {
        dirty.surfaces = dirty.formulas = dirty.codes = dirty.rail = dirty.vial = dirty.thoughts = dirty.geometry = true;
        structuralDirty = true;
      }
      if (document.hidden) continue;
      const added = record.addedNodes || [];
      const targetIsAssistant = enclosed ? enclosed.role === 'assistant' : adapter.isAssistantNode(record.target);
      for (let i = 0; i < added.length; i++) {
        const node = added[i];
        if (Adapters.isOwned(node) || (!targetIsAssistant && !adapter.isAssistantNode(node))) continue;
        responseChanged = true;
        if (node.nodeType === Node.TEXT_NODE) addTextFade(node);
        else if (node.nodeType === Node.ELEMENT_NODE && typeof document.createTreeWalker === 'function') {
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
          for (let textNode = walker.nextNode(), count = 0; textNode && count < 64; textNode = walker.nextNode(), count++) addTextFade(textNode);
        }
      }
    }
    if (responseChanged) markResponseActivity();
    if (anyDirty) schedule(!structuralDirty && responseChanged ? STREAM_SCAN_MS : SCAN_DEBOUNCE_MS);
  }
  function schedule(delay = SCAN_DEBOUNCE_MS) {
    if (lostOwnership() || !enabled || stopped || document.hidden) return;
    if (pending) {
      if (delay >= pendingDelay) return;
      clearTimeout(pending);
      pending = null;
    }
    pendingDelay = delay;
    pending = setTimeout(() => { pending = null; pendingDelay = 0; if (lostOwnership()) return; scan(); }, delay);
  }

  function isFormulaViewActive(pre) {
    const entry = formulas.get(pre);
    return Boolean(entry && entry.renderedOk && entry.mode === 'preview');
  }
  function resolveFormulaSurface(pre, hostSurfaces) {
    if (typeof adapter.codeSurfaceFor === 'function') return adapter.codeSurfaceFor(pre, hostSurfaces) || pre;
    return hostSurfaces.find(surface => surface === pre || surface.contains?.(pre)) || pre;
  }
  function resolveFormulaHideTarget(pre, surface) {
    if (typeof adapter.codeWellFor === 'function') return adapter.codeWellFor(pre, surface) || pre;
    return pre;
  }
  function resolveFormulaHeader(surface, pre, hostHeaders) {
    if (typeof adapter.codeHeaderFor === 'function') return adapter.codeHeaderFor(surface, pre, hostHeaders) || null;
    return hostHeaders.find(header => surface && surface !== pre && surface.contains?.(header)) || null;
  }
  function mountFormulaToggle(entry) {
    const { header, toggleBtn, hideTarget } = entry;
    const isBare = !header && entry.surface === entry.pre;
    if (isBare) setAttr(entry.previewEl, 'data-op-formula-bare', 'true');
    else removeAttr(entry.previewEl, 'data-op-formula-bare');
    if (header) {
      if (toggleBtn.isConnected && !entry.barEl && header.contains?.(toggleBtn)) return;
      const actionBox = [...(header.children || [])].find(child =>
        !Adapters.isOwned(child) &&
        (child.localName || child.tagName || '').toLowerCase() !== 'button' &&
        child.getAttribute?.('role') !== 'button' &&
        (child.querySelector?.('button') || child.querySelector?.('[role="button"]'))
      );
      if (actionBox) {
        removeAttr(toggleBtn, 'data-op-formula-header-direct');
        if (toggleBtn.parentElement !== actionBox || actionBox.firstChild !== toggleBtn) {
          actionBox.prepend(toggleBtn);
        }
      } else {
        setAttr(toggleBtn, 'data-op-formula-header-direct', 'true');
        const firstBtn = [...(header.children || [])].find(child =>
          !Adapters.isOwned(child) &&
          ((child.localName || child.tagName || '').toLowerCase() === 'button' || child.getAttribute?.('role') === 'button')
        );
        if (firstBtn && typeof firstBtn.before === 'function') {
          if (firstBtn.previousElementSibling !== toggleBtn) firstBtn.before(toggleBtn);
        } else if (toggleBtn.parentElement !== header) {
          header.append(toggleBtn);
        }
      }
      entry.barEl?.remove();
      entry.barEl = null;
      return;
    }
    removeAttr(toggleBtn, 'data-op-formula-header-direct');
    if (!entry.barEl) entry.barEl = own(make('div', 'op-formula-bar'));
    if (isBare) setAttr(entry.barEl, 'data-op-formula-bare', 'true');
    else removeAttr(entry.barEl, 'data-op-formula-bare');
    if (toggleBtn.parentElement !== entry.barEl) entry.barEl.append(toggleBtn);
    if (entry.barEl.nextElementSibling !== hideTarget) {
      if (typeof hideTarget.before === 'function') hideTarget.before(entry.barEl);
    }
  }
  function updateFormulaToggleLabel(entry) {
    const preview = entry.mode === 'preview';
    setText(entry.toggleBtn, t(preview ? 'formulaShowSource' : 'formulaShowPreview'));
    const tip = t(preview ? 'formulaShowSourceLabel' : 'formulaShowPreviewLabel');
    if (entry.toggleBtn.title !== tip) entry.toggleBtn.title = tip;
    setAttr(entry.toggleBtn, 'aria-label', tip);
    setAttr(entry.toggleBtn, 'aria-pressed', String(preview));
    setAttr(entry.toggleBtn, 'data-formula-mode', entry.mode);
  }
  function applyFormulaEntry(entry) {
    const showPreview = Boolean(entry.renderedOk && entry.mode === 'preview');
    if (showPreview) {
      setAttr(entry.hideTarget, 'data-op-formula-source-hidden', 'true');
      if (entry.previewEl.hidden) entry.previewEl.hidden = false;
      if (entry.hideTarget.nextElementSibling !== entry.previewEl) {
        entry.hideTarget.insertAdjacentElement('afterend', entry.previewEl);
      }
    } else {
      removeAttr(entry.hideTarget, 'data-op-formula-source-hidden');
      if (!entry.previewEl.hidden) entry.previewEl.hidden = true;
      if (entry.renderedOk && entry.hideTarget.nextElementSibling !== entry.previewEl) {
        entry.hideTarget.insertAdjacentElement('afterend', entry.previewEl);
      }
    }
    mountFormulaToggle(entry);
    updateFormulaToggleLabel(entry);
  }
  function formulaHintKey(surface, pre, code, header) {
    const c1 = code.getAttribute?.('class') || code.className || '';
    const c2 = pre.getAttribute?.('class') || pre.className || '';
    const c3 = surface && surface !== pre ? (surface.getAttribute?.('class') || surface.className || '') : '';
    const a1 = code.getAttribute?.('data-language') || code.getAttribute?.('data-lang') || '';
    const a2 = pre.getAttribute?.('data-language') || pre.getAttribute?.('data-lang') || '';
    const a3 = surface && surface !== pre ? (surface.getAttribute?.('data-language') || surface.getAttribute?.('data-lang') || '') : '';
    const hText = header ? (header.textContent || '') : '';
    return `${c1}\0${c2}\0${c3}\0${a1}\0${a2}\0${a3}\0${hText}`;
  }
  function commitFormulaEntry(entry, { syncFold = true, precomputed = null } = {}) {
    if (lostOwnership() || !enabled || stopped || !entry.pre.isConnected || cfg.formulaPreview === false || !Formula || !global.temml) {
      cleanupFormula(entry.pre, entry);
      if (syncFold) syncCodes();
      return;
    }
    const code = precomputed ? precomputed.code : (entry.pre.querySelector('code') || entry.pre);
    const source = precomputed ? precomputed.source : Adapters.textOf(code);
    const hint = precomputed ? precomputed.hint : Formula.extractLanguageHint(entry.surface, entry.pre, code, entry.header);
    const hintKey = precomputed
      ? precomputed.hintKey
      : ((entry.header || entry.surface === entry.pre) ? formulaHintKey(entry.surface, entry.pre, code, entry.header) : null);
    entry.code = code;
    entry.lastSource = source;
    entry.lastHint = hint;
    entry.lastHintKey = hintKey;
    if (!precomputed && !Formula.isLikelyLatex(source, hint)) {
      formulaSkipCache.set(entry.pre, { code, surface: entry.surface, header: entry.header, source, hint, hintKey });
      cleanupFormula(entry.pre, entry);
      if (syncFold) syncCodes();
      return;
    }
    const rendered = Formula.renderFormulaPreview(document, global.temml, source);
    if (!rendered.ok || !rendered.fragment) {
      if (entry.mode === 'source') {
        entry.renderedOk = false;
        removeAttr(entry.hideTarget, 'data-op-formula-source-hidden');
        entry.previewEl.replaceChildren();
        entry.previewEl.hidden = true;
        entry.previewEl.remove();
        entry.toggleBtn.remove();
        entry.barEl?.remove();
        entry.barEl = null;
        if (syncFold) syncCodes();
        return;
      }
      formulaSkipCache.set(entry.pre, { code, surface: entry.surface, header: entry.header, source, hint, hintKey });
      cleanupFormula(entry.pre, entry);
      if (syncFold) syncCodes();
      return;
    }
    formulaSkipCache.delete(entry.pre);
    entry.renderedOk = true;
    entry.previewEl.replaceChildren(rendered.fragment);
    applyFormulaEntry(entry);
    entry.lastLang = cfg.language;
    if (syncFold) syncCodes();
  }
  function readCodeText(pre, snap) {
    if (snap?.codeTextCache?.has(pre)) return snap.codeTextCache.get(pre);
    const code = pre.querySelector('code') || pre;
    const text = Adapters.textOf(code);
    snap?.codeTextCache?.set(pre, text);
    return text;
  }
  function countLines(text) {
    let end = text.length;
    if (end > 0 && text.charCodeAt(end - 1) === 10) end--;
    let lines = 1;
    for (let i = 0; i < end; i++) {
      if (text.charCodeAt(i) === 10) lines++;
    }
    return lines;
  }
  let formulaChunkQueue = [];
  let formulaChunkTimer = null;
  function clearFormulaChunkQueue() {
    if (formulaChunkTimer) { clearTimeout(formulaChunkTimer); formulaChunkTimer = null; }
    for (const item of formulaChunkQueue) item.entry.pendingChunk = false;
    formulaChunkQueue = [];
  }
  function scheduleFormulaChunkDrain(delay = 16) {
    if (formulaChunkTimer || !formulaChunkQueue.length) return;
    formulaChunkTimer = setTimeout(drainFormulaChunks, delay);
  }
  function syncFormulaDeferAttrs() {
    const deferAbove = formulas.size > 12 ? formulas.size - 2 : 0;
    let formulaIdx = 0;
    for (const entry of formulas.values()) {
      if (formulaIdx < deferAbove) setAttr(entry.previewEl, 'data-op-formula-deferred', 'true');
      else removeAttr(entry.previewEl, 'data-op-formula-deferred');
      formulaIdx++;
    }
  }
  function drainFormulaChunks() {
    formulaChunkTimer = null;
    if (lostOwnership() || !enabled || stopped || cfg.formulaPreview === false) {
      clearFormulaChunkQueue();
      return;
    }
    const batch = formulaChunkQueue.splice(0, 16);
    for (const item of batch) {
      const { entry, precomputed } = item;
      if (!entry.pendingChunk || formulas.get(entry.pre) !== entry || !entry.pre.isConnected) continue;
      entry.pendingChunk = false;
      setAttr(entry.previewEl, 'data-op-formula-deferred', 'true');
      commitFormulaEntry(entry, { syncFold: false, precomputed });
    }
    if (formulaChunkQueue.length) {
      scheduleFormulaChunkDrain(16);
    } else {
      syncFormulaDeferAttrs();
      syncCodes();
    }
  }
  function syncFormulas(snap) {
    const temml = global.temml;
    const active = Boolean(cfg.formulaPreview !== false && Formula && temml);
    if (!active) clearFormulaChunkQueue();
    const current = new Set(active ? (snap ? snap.codeBlocks : adapter.codeBlocks().filter(pre => !Adapters.isOwned(pre))) : []);
    for (const [pre, entry] of formulas) {
      if (!current.has(pre) || !pre.isConnected) cleanupFormula(pre, entry);
    }
    if (!current.size) return;
    const hostSurfaces = snap ? snap.codeSurfaces : (adapter.codeSurfaces?.() || []);
    const hostHeaders = snap ? snap.codeHeaders : (adapter.codeHeaders?.() || []);
    const isStreaming = snap ? snap.isStreaming : Boolean(adapter.isStreaming?.());
    const newEntries = [];
    for (const pre of current) {
      const code = pre.querySelector('code') || pre;
      const source = readCodeText(pre, snap);
      let entry = formulas.get(pre);
      if (entry) {
        const stableContainer = entry.code === code && entry.surface?.isConnected && entry.hideTarget?.isConnected &&
          (!entry.header || entry.header.isConnected) &&
          (entry.surface === pre || entry.surface.contains?.(pre));
        const surface = stableContainer ? entry.surface : resolveFormulaSurface(pre, hostSurfaces);
        const hideTarget = stableContainer ? entry.hideTarget : resolveFormulaHideTarget(pre, surface);
        const header = stableContainer ? entry.header : resolveFormulaHeader(surface, pre, hostHeaders);
        const canFastHint = Boolean(stableContainer && (header || surface === pre));
        const hintKey = canFastHint ? formulaHintKey(surface, pre, code, header) : null;
        const hint = (canFastHint && source === entry.lastSource && hintKey !== null && hintKey === entry.lastHintKey)
          ? entry.lastHint
          : Formula.extractLanguageHint(surface, pre, code, header);
        entry.code = code;
        entry.surface = surface;
        entry.header = header;
        entry.lastHintKey = hintKey;
        if (entry.hideTarget !== hideTarget) {
          removeAttr(entry.hideTarget, 'data-op-formula-source-hidden');
          entry.hideTarget = hideTarget;
        }
        if (source !== entry.lastSource || hint !== entry.lastHint) {
          entry.pendingChunk = false;
          entry.lastSource = source;
          entry.lastHint = hint;
          clearTimeout(entry.debounceTimer);
          entry.debounceTimer = setTimeout(() => {
            entry.debounceTimer = null;
            commitFormulaEntry(entry);
          }, FORMULA_DEBOUNCE_MS);
        } else if (entry.pendingChunk) {
          continue;
        } else if (entry.renderedOk) {
          const alreadyMounted = stableContainer &&
            entry.lastLang === cfg.language &&
            entry.toggleBtn.isConnected &&
            entry.previewEl.isConnected &&
            (entry.header ? entry.header.contains?.(entry.toggleBtn) : entry.barEl?.isConnected) &&
            entry.hideTarget.nextElementSibling === entry.previewEl &&
            (entry.mode === 'preview'
              ? entry.hideTarget.getAttribute('data-op-formula-source-hidden') === 'true' && !entry.previewEl.hidden
              : entry.hideTarget.getAttribute('data-op-formula-source-hidden') === null && entry.previewEl.hidden);
          if (!alreadyMounted) {
            applyFormulaEntry(entry);
            entry.lastLang = cfg.language;
          }
        }
        continue;
      }
      const skipped = formulaSkipCache.get(pre);
      if (skipped && skipped.code === code && skipped.source === source &&
          skipped.surface?.isConnected && (!skipped.header || skipped.header.isConnected) &&
          (skipped.surface === pre || skipped.surface.contains?.(pre))) {
        if (skipped.hintKey !== null && (skipped.header || skipped.surface === pre) &&
            formulaHintKey(skipped.surface, pre, code, skipped.header) === skipped.hintKey) {
          continue;
        }
        if (Formula.extractLanguageHint(skipped.surface, pre, code, skipped.header) === skipped.hint) {
          continue;
        }
      }
      const surface = resolveFormulaSurface(pre, hostSurfaces);
      const hideTarget = resolveFormulaHideTarget(pre, surface);
      const header = resolveFormulaHeader(surface, pre, hostHeaders);
      const hint = Formula.extractLanguageHint(surface, pre, code, header);
      const hintKey = (header || surface === pre) ? formulaHintKey(surface, pre, code, header) : null;
      if (skipped && skipped.source === source && skipped.hint === hint) {
        formulaSkipCache.set(pre, { code, surface, header, source, hint, hintKey });
        continue;
      }
      if (!Formula.isLikelyLatex(source, hint)) {
        formulaSkipCache.set(pre, { code, surface, header, source, hint, hintKey });
        continue;
      }
      formulaSkipCache.delete(pre);
      const previewEl = own(make('div', 'op-formula-preview'));
      const toggleBtn = own(make('button', 'op-formula-toggle'));
      entry = {
        pre, code, surface, hideTarget, header, previewEl, toggleBtn, barEl: null,
        mode: 'preview', lastSource: source, lastHint: hint, lastHintKey: hintKey, renderedOk: false, pendingChunk: false, debounceTimer: null
      };
      toggleBtn.addEventListener('click', () => {
        if (!enabled || lostOwnership()) return;
        entry.mode = entry.mode === 'preview' ? 'source' : 'preview';
        applyFormulaEntry(entry);
        syncCodes();
      });
      formulas.set(pre, entry);
      if (isStreaming) {
        entry.debounceTimer = setTimeout(() => {
          entry.debounceTimer = null;
          commitFormulaEntry(entry);
        }, FORMULA_DEBOUNCE_MS);
      } else {
        newEntries.push({ entry, precomputed: { code, source, hint, hintKey } });
      }
    }
    if (newEntries.length > 12) {
      const headEnd = 6;
      const tailStart = newEntries.length - 2;
      for (let i = 0; i < newEntries.length; i++) {
        const item = newEntries[i];
        if (i < headEnd || i >= tailStart) {
          if (i < tailStart) setAttr(item.entry.previewEl, 'data-op-formula-deferred', 'true');
          commitFormulaEntry(item.entry, { syncFold: false, precomputed: item.precomputed });
        } else {
          item.entry.pendingChunk = true;
          formulaChunkQueue.push(item);
        }
      }
      scheduleFormulaChunkDrain(80);
    } else {
      for (const item of newEntries) {
        commitFormulaEntry(item.entry, { syncFold: false, precomputed: item.precomputed });
      }
    }
    syncFormulaDeferAttrs();
  }

  function syncCodes(snap) {
    const current = new Set(cfg.longCodeFold ? (snap ? snap.codeBlocks : adapter.codeBlocks().filter(pre => !Adapters.isOwned(pre))) : []);
    for (const [pre, entry] of codes) {
      if (!current.has(pre) || !pre.isConnected) cleanupCode(pre, entry);
    }
    for (const pre of current) {
      if (isFormulaViewActive(pre)) {
        const existing = codes.get(pre);
        if (existing) {
          savedFoldState.set(pre, existing.folded);
          cleanupCode(pre, existing);
        }
        continue;
      }
      const count = countLines(readCodeText(pre, snap));
      if (count < 48) {
        if (codes.has(pre)) cleanupCode(pre, codes.get(pre));
        continue;
      }
      let entry = codes.get(pre);
      if (!entry) {
        const button = own(make('button','op-code-fold-bar'));
        const generatedId = pre.id ? null : 'op-code-'+(++nextId);
        if (generatedId) pre.id = generatedId;
        const priorFolded = Boolean(savedFoldState.get(pre));
        entry = {button, generatedId, folded:priorFolded, lines:count};
        if (entry.folded) pre.classList.add('op-code-folded');
        button.setAttribute('aria-controls',pre.id);
        button.addEventListener('click', () => {
          if (!enabled) return;
          const scroller = adapter.scrollContainer(pre);
          const viewportTop = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
          const beforeTop = button.getBoundingClientRect().top;
          const startsAbove = pre.getBoundingClientRect().top < viewportTop;
          entry.folded = !entry.folded;
          savedFoldState.set(pre, entry.folded);
          pre.classList.toggle('op-code-folded', entry.folded);
          updateFoldLabel(entry);
          if (startsAbove && scroller) {
            const delta = button.getBoundingClientRect().top - beforeTop;
            // Browser scroll anchoring may already have compensated; only correct the remainder.
            if (Math.abs(delta) > 1) scroller.scrollTop += delta;
          }
        });
        codes.set(pre,entry);
      }
      entry.lines = count;
      if (pre.nextElementSibling !== entry.button) pre.insertAdjacentElement('afterend',entry.button);
      updateFoldLabel(entry);
    }
  }
  function updateFoldLabel(entry) {
    setText(entry.button, `${t(entry.folded ? 'foldExpand' : 'foldCollapse')} · ${entry.lines} ${t('linesUnit')}`);
    setAttr(entry.button, 'aria-expanded', String(!entry.folded));
  }

  function closeRail(returnFocus = false) {
    if (!rail) return;
    rail.querySelector('.op-rail-drawer').hidden = true;
    const toggle = rail.querySelector('.op-rail-toggle');
    toggle.setAttribute('aria-expanded','false');
    if (returnFocus) toggle.focus();
  }
  function readRailTurnText(turn) {
    if (!forceRailRecompute && !dirtyRailTurns.has(turn) && railTurnTextCache.has(turn)) {
      return railTurnTextCache.get(turn);
    }
    const text = Adapters.cleanTurnText(turn);
    railTurnTextCache.set(turn, text);
    dirtyRailTurns.delete(turn);
    return text;
  }
  function renderRailList(turns, turnTexts) {
    if (!rail) return;
    const search = rail.querySelector('.op-rail-search');
    const keyword = search.value.trim().toLocaleLowerCase();
    const list = rail.querySelector('.op-rail-list');
    const fragment = document.createDocumentFragment();
    turns.forEach((turn,index) => {
      const raw = turnTexts ? turnTexts[index] : readRailTurnText(turn);
      const text = raw.replace(/\s+/g,' ').trim();
      if (keyword && !text.toLocaleLowerCase().includes(keyword)) return;
      const button = make('button','op-rail-item');
      button.dataset.turn = String(index);
      button.append(make('span','op-rail-index',String(index+1).padStart(2,'0')),make('span','op-rail-text',text || local('提问','Question')));
      button.title = text;
      button.addEventListener('click', () => { jump(index); if (innerWidth < 700) closeRail(true); });
      fragment.append(button);
    });
    if (!fragment.childNodes.length) fragment.append(make('p','op-rail-empty',t('outlineEmpty')));
    list.replaceChildren(fragment);
    updateRailActive(true);
  }
  function syncRail(snap) {
    if (lostOwnership()) return;
    const turns = snap ? snap.userTurns : adapter.userTurns();
    if (!cfg.railOutline || !turns.length) {
      rail?.remove(); rail = null; railSignature = ''; prevRailTurns = []; lastRailLang = ''; renderedActiveTurn = -2; return;
    }
    if (!rail) {
      rail = own(make('aside','op-rail'));
      rail.id = 'op-rail-root';
      const toggle = make('button','op-rail-toggle','☷');
      toggle.setAttribute('aria-expanded','false');
      toggle.setAttribute('aria-controls','op-rail-drawer');
      const drawer = make('section','op-rail-drawer');
      drawer.id = 'op-rail-drawer'; drawer.hidden = true;
      const heading = make('div','op-rail-heading');
      heading.append(make('strong','op-rail-title'),make('span','op-rail-count'));
      const search = make('input','op-rail-search');
      search.type = 'search'; search.autocomplete = 'off';
      const list = make('div','op-rail-list');
      drawer.append(heading,search,list);
      rail.append(toggle,make('div','op-rail-ticks'),drawer);
      toggle.addEventListener('click', () => {
        const open = drawer.hidden;
        drawer.hidden = !open; toggle.setAttribute('aria-expanded',String(open));
        if (open) search.focus();
      });
      search.addEventListener('input', () => renderRailList(adapter.userTurns()));
      document.body.append(rail);
    }
    if (!rail.isConnected) document.body.append(rail);
    const toggle = rail.querySelector('.op-rail-toggle');
    const outlineTitle = t('outlineTitle');
    setAttr(toggle, 'aria-label', outlineTitle);
    if (toggle.title !== outlineTitle) toggle.title = outlineTitle;
    setAttr(rail, 'aria-label', outlineTitle);
    const search = rail.querySelector('.op-rail-search');
    const outlineSearch = t('outlineSearch');
    if (search.placeholder !== outlineSearch) search.placeholder = outlineSearch;
    setAttr(search, 'aria-label', outlineSearch);
    setText(rail.querySelector('.op-rail-title'),outlineTitle);
    setText(rail.querySelector('.op-rail-count'),String(turns.length));
    let turnsUnchanged = !forceRailRecompute && railSignature !== '' && lastRailLang === cfg.language && turns.length === prevRailTurns.length;
    if (turnsUnchanged) {
      for (let i = 0; i < turns.length; i++) {
        if (turns[i] !== prevRailTurns[i] || dirtyRailTurns.has(turns[i])) { turnsUnchanged = false; break; }
      }
    }
    if (turnsUnchanged) return;
    const turnTexts = turns.map(readRailTurnText);
    prevRailTurns = turns;
    lastRailLang = cfg.language;
    forceRailRecompute = false;
    const signature = JSON.stringify([cfg.language, turnTexts]);
    if (signature !== railSignature) {
      railSignature = signature;
      const ticks = rail.querySelector('.op-rail-ticks');
      const fragment = document.createDocumentFragment();
      const count = Math.min(24,turns.length);
      for (let i=0; i<count; i++) {
        const index = count === 1 ? 0 : Math.round(i*(turns.length-1)/(count-1));
        const tick = make('button','op-rail-tick');
        tick.dataset.turn = String(index);
        tick.title = turnTexts[index].replace(/\s+/g,' ').trim().slice(0,100);
        tick.setAttribute('aria-label',`${local('跳到提问','Go to question')} ${index+1}: ${tick.title}`);
        tick.addEventListener('click', () => jump(index));
        fragment.append(tick);
      }
      ticks.replaceChildren(fragment);
      renderRailList(turns, turnTexts);
    }
  }
  function updateRailActive(force = false) {
    if (!rail) return;
    if (!force && renderedActiveTurn === activeTurn) return;
    renderedActiveTurn = activeTurn;
    rail.querySelectorAll('[data-turn]').forEach(button => {
      const active = Number(button.dataset.turn) === activeTurn;
      if (button.classList.contains('is-active') !== active) button.classList.toggle('is-active', active);
      if (active) setAttr(button, 'aria-current', 'location'); else removeAttr(button, 'aria-current');
    });
  }
  function jump(index) {
    const turns = cachedUserTurns.length && cachedUserTurns[0]?.isConnected ? cachedUserTurns : adapter.userTurns();
    if (!turns.length) return;
    activeTurn = Math.max(0, Math.min(turns.length-1,index));
    turns[activeTurn].scrollIntoView({behavior:motionAllowed() ? 'smooth' : 'auto',block:'start'});
    updateRailActive();
  }
  function nearestTurn() {
    const turns = cachedUserTurns.length && cachedUserTurns[0]?.isConnected ? cachedUserTurns : adapter.userTurns();
    if (!turns.length) return -1;
    let scroller = cachedMessageScroller?.isConnected ? cachedMessageScroller : null;
    if (!scroller) {
      scroller = adapter.scrollContainer(turns[0]);
      cachedMessageScroller = scroller;
    }
    const scrollerTop = (!scroller || scroller === document.scrollingElement) ? 0 : scroller.getBoundingClientRect().top;
    const targetY = scrollerTop + 48;
    const n = turns.length;
    if (n > 4) {
      const firstTop = turns[0].getBoundingClientRect().top;
      const lastTop = turns[n - 1].getBoundingClientRect().top;
      if (lastTop >= firstTop) {
        if (targetY <= firstTop) return 0;
        if (targetY >= lastTop) return n - 1;
        let lo = 0, hi = n - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (turns[mid].getBoundingClientRect().top < targetY) lo = mid + 1;
          else hi = mid;
        }
        const currDist = Math.abs(turns[lo].getBoundingClientRect().top - targetY);
        if (lo > 0) {
          const prevDist = Math.abs(turns[lo - 1].getBoundingClientRect().top - targetY);
          if (prevDist <= currDist) return lo - 1;
        }
        return lo;
      }
    }
    let result = 0, distance = Infinity;
    for (let index = 0; index < n; index++) {
      const delta = Math.abs(turns[index].getBoundingClientRect().top - targetY);
      if (delta < distance) { distance = delta; result = index; }
    }
    return result;
  }
  function onKey(event) {
    if (event.key === 'Escape') {
      if (rail && !rail.querySelector('.op-rail-drawer').hidden) closeRail(rail.contains(document.activeElement));
      if (dock) setDockOpen(false);
      return;
    }
    const target = event.target;
    if (!cfg.turnJumpShortcuts || event.isComposing || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!['ArrowUp','ArrowDown'].includes(event.key) || target?.isContentEditable || target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"],[role="dialog"],dialog,[aria-modal="true"]')) return;
    const index = nearestTurn();
    if (index < 0) return;
    event.preventDefault();
    jump(index + (event.key === 'ArrowUp' ? -1 : 1));
  }

  const WIDTH_LABELS = {standard:'widthStandard', wide:'widthWide', full:'widthFull'};
  const CAPACITY_SOURCE_KEYS = {manual:'vialSourceManual', matched:'vialSourceAutoMatched', fallback:'vialSourceAutoFallback', unrecognized:'vialSourceUnrecognized'};
  function syncDockPopoverPosition() {
    if (!dock) return;
    const popover = dock.querySelector('.op-vial-popover');
    if (!popover || popover.hidden) return;
    const vw = document.documentElement?.clientWidth || global.innerWidth || 0;
    const vh = document.documentElement?.clientHeight || global.innerHeight || 0;
    if (!(vw > 0) || !(vh > 0)) return;
    const margin = 8;
    dock.removeAttribute('data-op-popover-side');
    dock.style.removeProperty('--op-vial-popover-shift-x');
    dock.style.removeProperty('--op-vial-popover-max-h');
    let rect = popover.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return;
    const overflowY = r => Math.max(0, margin - r.top) + Math.max(0, r.bottom - (vh - margin));
    let side = 'above';
    if (rect.top < margin || rect.bottom > vh - margin) {
      const aboveOverflow = overflowY(rect);
      dock.setAttribute('data-op-popover-side', 'below');
      const belowRect = popover.getBoundingClientRect();
      if (overflowY(belowRect) < aboveOverflow) {
        rect = belowRect;
        side = 'below';
      } else {
        dock.removeAttribute('data-op-popover-side');
        rect = popover.getBoundingClientRect();
      }
      if (overflowY(rect) > 0) {
        const availH = side === 'below'
          ? Math.max(96, Math.floor((vh - margin) - rect.top))
          : Math.max(96, Math.floor(rect.bottom - margin));
        dock.style.setProperty('--op-vial-popover-max-h', availH + 'px');
        rect = popover.getBoundingClientRect();
      }
    }
    let shiftX = 0;
    if (rect.left < margin) shiftX = Math.ceil(margin - rect.left);
    else if (rect.right > vw - margin) shiftX = Math.floor((vw - margin) - rect.right);
    if (shiftX !== 0) dock.style.setProperty('--op-vial-popover-shift-x', shiftX + 'px');
  }
  function setDockOpen(open) {
    if (!dock) return;
    const popover = dock.querySelector('.op-vial-popover');
    if (popover) popover.hidden = !open;
    dock.querySelector('.op-vial-pill')?.setAttribute('aria-expanded',String(open));
    if (open) {
      syncDockPopoverPosition();
    } else {
      dock.removeAttribute('data-op-popover-side');
      dock.style.removeProperty('--op-vial-popover-shift-x');
      dock.style.removeProperty('--op-vial-popover-max-h');
    }
  }
  function syncWidthToggle() {
    let widthBtn = dock.querySelector('.op-width-toggle');
    if (!widthBtn) {
      widthBtn = make('button','op-width-toggle');
      widthBtn.addEventListener('click', event => {
        if (!event.isTrusted || !enabled) return;
        const presets = Schema.ENUMS.contentWidth;
        const next = presets[(presets.indexOf(cfg.contentWidth) + 1) % presets.length];
        Schema.saveContentWidth(next).then(updated => {
          if (updated && !stopped && cfg.contentWidth !== updated.contentWidth) configure(updated);
        }).catch(() => {});
      });
      dock.prepend(widthBtn);
    }
    const preset = WIDTH_LABELS[cfg.contentWidth] ? cfg.contentWidth : 'standard';
    const widthLabel = t(WIDTH_LABELS[preset]);
    const widthTip = `${t('widthToggleLabel')}: ${widthLabel}`;
    setText(widthBtn, widthLabel);
    setAttr(widthBtn, 'data-width-preset', preset);
    if (widthBtn.title !== widthTip) widthBtn.title = widthTip;
    setAttr(widthBtn, 'aria-label', widthTip);
  }
  function syncContextVial(snap) {
    let vial = dock.querySelector('.op-vial-pill');
    if (!cfg.contextVial) {
      vial?.remove();
      dock.querySelector('.op-vial-popover')?.remove();
      removeAttr(dock, 'data-op-popover-side');
      dock.style.removeProperty('--op-vial-popover-shift-x');
      dock.style.removeProperty('--op-vial-popover-max-h');
      return;
    }
    if (!vial) {
      vial=make('button','op-vial-pill');
      vial.setAttribute('aria-expanded','false'); vial.setAttribute('aria-controls','op-vial-popover');
      const tube=make('span','op-vial-tube'); tube.setAttribute('aria-hidden','true'); tube.append(make('span','op-vial-liquid'));
      vial.append(tube,make('span','op-vial-summary'));
      const popover=make('section','op-vial-popover'); popover.id='op-vial-popover'; popover.hidden=true;
      popover.append(make('strong','op-vial-title'),make('dl','op-vial-details'),make('p','op-vial-note'));
      vial.addEventListener('click', () => setDockOpen(popover.hidden));
      dock.append(vial,popover);
    }
    const modelLabel=snap ? snap.modelLabel : (adapter.activeModelLabel?.()||'');
    const attachments=snap ? snap.attachmentsCount : (adapter.visibleAttachments?.()||[]).length;
    const capacity=Adapters.resolveReferenceCapacity(host,modelLabel,cfg.contextWindowTokens);
    const now=performance.now();
    if (!lastEstimate || now-lastEstimate>750 || lastModelLabel!==modelLabel || lastAttachments!==attachments || forceFullEstimate) {
      let user=0, assistant=0, code=0;
      const uTurns = snap ? snap.userTurns : adapter.userTurns();
      const aTurns = snap ? snap.assistantTurns : adapter.assistantTurns();
      const readTurnEstimate = node => {
        if (!forceFullEstimate && !dirtyVialTurns.has(node) && turnTokenCache.has(node)) {
          return turnTokenCache.get(node);
        }
        const computed = Adapters.estimateTurnTokens(node);
        turnTokenCache.set(node, computed);
        dirtyVialTurns.delete(node);
        return computed;
      };
      for (const node of uTurns) {
        const turn=readTurnEstimate(node);
        user+=turn.total; code+=turn.code;
      }
      for (const node of aTurns) {
        const turn=readTurnEstimate(node);
        assistant+=turn.total; code+=turn.code;
      }
      estimate={user, assistant, code, total:user+assistant};
      forceFullEstimate = false;
      lastEstimate=now; lastModelLabel=modelLabel; lastAttachments=attachments;
    }
    const format = number => number>=1000000 ? (number/1000000).toFixed(1)+'M' : number>=1000 ? (number/1000).toFixed(1)+'K' : String(number);
    const percent=Math.min(100,capacity.tokens>0?estimate.total/capacity.tokens*100:0);
    // v0.3.1 #18: `?` marks an unrecognized auto capacity so a fallback never reads as the real window.
    const unsure=capacity.source==='unrecognized'?'?':'';
    setText(vial.querySelector('.op-vial-summary'),`≈ ${format(estimate.total)}${attachments>0?'+':''} / ${format(capacity.tokens)}${unsure}`);
    setAttr(vial, 'aria-label', `${t('vialTitle')}: ${estimate.total.toLocaleString()}${attachments>0?'+':''} / ${capacity.tokens.toLocaleString()}${unsure} tokens${unsure?` (${t('vialSourceUnrecognized')})`:''}`);
    const liquid=vial.querySelector('.op-vial-liquid');
    if(liquid.style.height!==percent.toFixed(1)+'%') liquid.style.height=percent.toFixed(1)+'%';
    const popover=dock.querySelector('.op-vial-popover');
    setText(popover.querySelector('.op-vial-title'),t('vialTitle'));
    setText(popover.querySelector('.op-vial-note'),attachments>0?`${t('vialNote')} ${t('vialAttachmentNote')}`:t('vialNote'));
    const signature=JSON.stringify([cfg.language,estimate,capacity,attachments]);
    if(popover.dataset.signature!==signature) {
      popover.dataset.signature=signature;
      const details=popover.querySelector('.op-vial-details');
      const fragment=document.createDocumentFragment();
      const sourceKey=CAPACITY_SOURCE_KEYS[capacity.source]||'vialSourceAutoFallback';
      const sourceText=capacity.modelLabel?`${t(sourceKey)} · ${capacity.modelLabel}`:t(sourceKey);
      const rows=[
        ['vialTotal',estimate.total.toLocaleString()],
        ['vialUser',estimate.user.toLocaleString()],
        ['vialAssistant',estimate.assistant.toLocaleString()],
        ['vialCode',estimate.code.toLocaleString()],
        ['vialCapacity',`${capacity.tokens.toLocaleString()} (${sourceText})`]
      ];
      if(attachments>0) rows.push(['vialUncountedAttachments',`${attachments} ${t('vialAttachmentsUnit')}`]);
      for(const [label,value] of rows) fragment.append(make('dt','',t(label)),make('dd','',value));
      details.replaceChildren(fragment);
    }
  }
  function syncDock(snap) {
    if (lostOwnership()) return;
    if (!dock) { dock=own(make('aside','op-dock')); dock.id='op-bottom-dock'; document.body.append(dock); }
    if (!dock.isConnected) document.body.append(dock);
    syncWidthToggle();
    syncContextVial(snap);
  }

  function applyThoughtView(element,entry) {
    const immersive=entry.hasTranslation && entry.view==='immersive';
    element.classList.toggle('op-thought-hidden',Boolean(immersive));
    entry.toggle.hidden=!entry.hasTranslation;
    entry.toggle.setAttribute('aria-pressed',String(Boolean(immersive)));
  }
  function syncThoughts(snap) {
    // Keep our deliberately hidden original in the registry until the host removes it.
    const current=new Set(cfg.thoughtTranslate ? (snap ? snap.thoughtBlocks : adapter.thoughtBlocks()) : []);
    for(const [element,entry] of thoughts) {
      if(cfg.thoughtTranslate && element.isConnected && element.classList.contains('op-thought-hidden')) current.add(element);
      if(!current.has(element) || !element.isConnected) cleanupThought(element,entry);
    }
    for(const element of current) {
      let entry=thoughts.get(element);
      if(!entry) {
        const toolbar=own(make('section','op-thought-toolbar'));
        const controls=make('div','op-thought-controls');
        const button=make('button','op-translate-button');
        const toggle=make('button','op-translation-toggle'); toggle.hidden=true;
        const disclosure=make('p','op-translation-disclosure');
        const result=make('div','op-thought-result');
        result.setAttribute('role','status'); result.setAttribute('aria-live','polite');
        controls.append(button,toggle); toolbar.append(controls,disclosure,result);
        entry={toolbar,button,toggle,disclosure,result,version:0,view:cfg.thoughtView,busy:false,hasTranslation:false,sourceSnapshot:null};
        thoughts.set(element,entry);
        toggle.addEventListener('click',()=>{entry.view=entry.view==='immersive'?'bilingual':'immersive';applyThoughtView(element,entry);});
        button.addEventListener('click',async event=>{
          // A host page calling .click() must never initiate transmission of conversation text.
          if(!event.isTrusted || !enabled || !cfg.thoughtTranslate || entry.busy) return;
          if(!cfg.thoughtEndpoint || !cfg.thoughtModel) {
            try { await Schema.sendMessage({type:'OP_OPEN_OPTIONS'}); } catch (_) { setText(result,t('translationDisabled')); }
            return;
          }
          // Restore the already-rendered source for reading when retranslating an immersive view.
          element.classList.remove('op-thought-hidden');
          const text=Adapters.visibleText(element);
          if(!text) { setText(result,local('请先展开网页上可见的思考文字。','Expand the displayed thoughts first.')); return; }
          if(text.length>12000) { setText(result,local('文字超过 12,000 字符，请使用较短的思考片段。','This section exceeds 12,000 characters. Use a shorter section.')); return; }
          const version=++entry.version, startedRevision=revision;
          const sourceSnapshot=Adapters.textOf(element);
          entry.hasTranslation=false;entry.sourceSnapshot=null;
          setText(result,'');applyThoughtView(element,entry);
          entry.busy=true; button.disabled=true; setText(button,t('translating'));
          try {
            const response=await Schema.sendMessage({type:'OP_TRANSLATE',text});
            if(!enabled || !cfg.thoughtTranslate || revision!==startedRevision || entry.version!==version || !element.isConnected || !thoughts.has(element)) return;
            if(Adapters.textOf(element)!==sourceSnapshot) {
              setText(result,local('原文已更新，请重新翻译。','The source changed. Translate it again.'));
              return;
            }
            setText(result,String(response.text||''));
            entry.hasTranslation=Boolean(response.text);entry.sourceSnapshot=sourceSnapshot;
            applyThoughtView(element,entry);
          } catch (_) {
            if(thoughts.has(element)&&entry.version===version) setText(result,t('translationError'));
          } finally {
            entry.busy=false; button.disabled=false;
            if(thoughts.has(element)) setText(button,t(entry.hasTranslation?'retranslateBtn':'translateBtn'));
          }
        });
      }
      if(element.nextElementSibling!==entry.toolbar) element.insertAdjacentElement('afterend',entry.toolbar);
      if(entry.hasTranslation && Adapters.textOf(element)!==entry.sourceSnapshot) {
        entry.hasTranslation=false;entry.sourceSnapshot=null;
        setText(entry.result,local('原文已更新，请重新翻译。','The source changed. Translate it again.'));
        applyThoughtView(element,entry);
      }
      if(!entry.busy) setText(entry.button,t(entry.hasTranslation?'retranslateBtn':'translateBtn'));
      setText(entry.toggle,t('toggleViewBtn'));
      let destination=local('尚未配置','not configured');
      try { destination=new URL(cfg.thoughtEndpoint).host; } catch (_) {}
      setText(entry.disclosure,`${t('translationConsent')} (${destination})`);
    }
  }
  // Mark native surfaces reversibly. Never wrap or recreate the site's editor,
  // navigation buttons, or framework-owned message structure.
  function findSurfaceMarkedNodes() {
    if (typeof document.querySelectorAll === 'function') {
      try { return [...document.querySelectorAll(RUNTIME_SURFACE_SELECTOR)]; } catch (_) {}
    }
    const seen = new Set();
    const walk = node => {
      if (!node || seen.has(node)) return;
      seen.add(node);
      for (const child of node.children || []) walk(child);
    };
    walk(document.documentElement);
    walk(document.body);
    return [...seen].filter(node => !Adapters.isOwned(node) && RUNTIME_SURFACE_ATTRS.some(attr => node.getAttribute?.(attr) === 'true'));
  }
  function adoptHandoverSurfaceMarks() {
    if (!handoverPending) return false;
    handoverPending = false;
    for (const element of findSurfaceMarkedNodes()) {
      if (Adapters.isOwned(element)) continue;
      let originals = surfaceMarks.get(element);
      for (const attribute of RUNTIME_SURFACE_ATTRS) {
        if (element.getAttribute(attribute) !== 'true') continue;
        if (!originals) { originals = new Map(); surfaceMarks.set(element, originals); }
        if (!originals.has(attribute)) originals.set(attribute, null);
      }
    }
    return true;
  }
  function restoreSurfaceMark(element, attribute, original) {
    if (original === null) element.removeAttribute(attribute);
    else if (element.getAttribute(attribute) !== original) element.setAttribute(attribute,original);
  }
  function clearSurfaceMarks() {
    adoptHandoverSurfaceMarks();
    for (const [element, attributes] of surfaceMarks) {
      for (const [attribute, original] of attributes) restoreSurfaceMark(element,attribute,original);
    }
    surfaceMarks.clear();
    surfaceObserver?.disconnect();surfaceObserver=null;primarySurface=null;
    dockObserver?.disconnect();dockObserver=null;observedDock=null;
  }
  const CODE_ICON_TAGS = new Set(['svg', 'path', 'rect', 'circle', 'polygon', 'line', 'polyline', 'g']);
  function isPaintedSvgPaint(value) {
    const normalized = String(value || '').trim();
    return Boolean(normalized) && !/^(?:none|transparent|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)|url\()/i.test(normalized);
  }
  function markCodeHeaderSvgIcons(header, add, paletteKey) {
    if (typeof getComputedStyle !== 'function') return;
    const svgs = [...(header.querySelectorAll?.('svg') || [])];
    const cached = codeHeaderSvgCache.get(header);
    if (cached && cached.paletteKey === paletteKey && cached.svgs.length === svgs.length &&
        cached.svgs.every((s, i) => s === svgs[i] && s.isConnected) &&
        cached.fills.every(n => n.isConnected) && cached.strokes.every(n => n.isConnected)) {
      for (const n of cached.fills) add(n, 'data-op-code-icon-fill');
      for (const n of cached.strokes) add(n, 'data-op-code-icon-stroke');
      return;
    }
    const fills = [];
    const strokes = [];
    const visit = node => {
      if (!node || Adapters.isOwned(node)) return;
      const tag = (node.localName || node.tagName || '').toLowerCase();
      if (CODE_ICON_TAGS.has(tag)) {
        const style = getComputedStyle(node);
        if (style) {
          if (isPaintedSvgPaint(style.fill)) { fills.push(node); add(node, 'data-op-code-icon-fill'); }
          if (isPaintedSvgPaint(style.stroke)) { strokes.push(node); add(node, 'data-op-code-icon-stroke'); }
        }
      }
      for (const child of node.children || []) visit(child);
    };
    for (const svg of svgs) visit(svg);
    codeHeaderSvgCache.set(header, { paletteKey, svgs, fills, strokes });
  }
  function collectSurfaceState() {
    const targets = new Map();
    const add = (element, attribute) => {
      if (!element?.isConnected || Adapters.isOwned(element)) return;
      if (!targets.has(element)) targets.set(element,new Set());
      targets.get(element).add(attribute);
    };
    const resolvedPalette = Schema.resolvePalette(cfg);
    const resolvedScheme = Schema.resolveScheme(cfg);
    const paletteKey = `${resolvedPalette}:${resolvedScheme}`;
    const isNativePalette = resolvedPalette === 'host';
    const uTurns = adapter.userTurns();
    const aTurns = adapter.assistantTurns();
    const isHome = !uTurns.length && !aTurns.length;
    let dockHost = null, threadFooter = null, nextScroller = null, nextThreadScroller = null, nextOverlaidDock = null, nextAlphaFadeScroller = null, nextAlphaFadeDock = null, nextObservedDock = null, messageScroller = null;
    const nextPrimary = adapter.primarySurface?.() || null;
    add(nextPrimary,'data-op-main-surface');
    const threadCols = adapter.threadColumns?.() || [];
    for (const element of threadCols) add(element,'data-op-thread-column');
    const composer = adapter.composerSurface?.() || null;
    for (const element of adapter.composerColumns?.(composer) || []) add(element,'data-op-composer-column');
    const firstTurn = aTurns[0] || uTurns[0];
    if (firstTurn) messageScroller = adapter.scrollContainer(firstTurn);
    if (!isNativePalette) {
      for (const element of adapter.codeSurfaces?.() || []) add(element,'data-op-code-surface');
      for (const element of adapter.codeHeaders?.() || []) {
        add(element,'data-op-code-header');
        markCodeHeaderSvgIcons(element, add, paletteKey);
      }
      if (!isHome) {
        dockHost = adapter.composerScrimSurface?.(composer) || null;
        threadFooter = !dockHost ? (adapter.threadFooterLayer?.(composer) || null) : null;
        add(dockHost, 'data-op-composer-dock');
        if (cfg.composerRestyle) add(threadFooter, 'data-op-thread-footer');
        const scroller = messageScroller;
        const isOverlaid = dockHost ? Adapters.isComposerDockOverlaid(dockHost, scroller, global) : false;
        if (isOverlaid) {
          nextOverlaidDock = dockHost;
          add(dockHost, 'data-op-composer-overlaid');
          for (const col of threadCols) add(col, 'data-op-thread-overlaid');
          nextScroller = overlaidScroller(dockHost, scroller);
          add(nextScroller, 'data-op-thread-scroller');
          if (nextScroller) {
            nextThreadScroller = nextScroller;
          } else if (scroller && ![document.scrollingElement, document.documentElement, document.body].includes(scroller) && !dockHost.contains?.(scroller)) {
            nextThreadScroller = scroller;
          }
        }
        if (adapter.usesScrollerAlphaFade && Adapters.isIndependentMessageScroller(scroller, composer, dockHost)) {
          nextAlphaFadeScroller = scroller;
          nextAlphaFadeDock = dockHost;
          add(scroller, 'data-op-scroller-fade');
        }
        if (cfg.composerRestyle) {
          const below = adapter.composerBelowSiblings?.(composer, dockHost || threadFooter);
          for (const element of below?.empty || []) add(element, 'data-op-composer-empty-sibling');
          for (const element of below?.disclaimers || []) add(element, 'data-op-composer-disclaimer');
        }
        for (const element of adapter.threadTailSpacers?.() || []) add(element, 'data-op-thread-spacer');
      }
      if (cfg.composerRestyle) {
        add(composer,'data-op-composer-surface');
        // v0.3.1 #19 two-row composer: the host grid is rearranged by CSS only, never re-parented.
        // Structural slots (unnamed ChatGPT grid, review fix P1) mark the existing grid children.
        const grid = adapter.composerGrid?.(composer);
        add(grid?.element,'data-op-composer-grid');
        for (const element of adapter.composerEmptyHeaders?.(composer, grid) || []) add(element, 'data-op-composer-header-empty');
        for (const [slot, element] of Object.entries(grid?.slots || {})) add(element,`data-op-composer-${slot}`);
        const modelTrigger = adapter.modelSelectorTrigger?.() || null;
        const toolbar = adapter.composerToolbar?.(grid?.trailing, modelTrigger) || grid?.trailing || null;
        add(toolbar,'data-op-composer-toolbar');
        add(adapter.composerAddTrigger?.(composer),'data-op-composer-add');
        add(modelTrigger,'data-op-model-capsule');
        add(adapter.modelCapsuleSlot?.(toolbar,modelTrigger),'data-op-model-capsule-item');
        add(adapter.composerPrimaryAction?.(composer),'data-op-composer-primary-action');
        for (const element of adapter.composerAttachments?.(composer) || []) add(element,'data-op-composer-attachment');
        for (const element of adapter.composerChips?.(composer) || []) add(element,'data-op-composer-chip');
      }
      // Backdrops belong to the page canvas, not the input card. Keep their
      // reversible bridge independent of the optional composer restyling,
      // while leaving conversation-only docks native in Home State and Native Palette.
      if (!isHome || !adapter.conversationOnlyBackdrops) {
        for (const element of adapter.composerBackdropSurfaces?.(composer) || []) {
          add(element,'data-op-composer-backdrop');
        }
      }
    }
    nextObservedDock = dockHost || threadFooter || composer || null;
    if (cfg.sidebarStyle !== 'native') {
      const sidebars = adapter.sidebarSurfaces?.() || [];
      for (const element of sidebars) add(element,'data-op-sidebar-surface');
      // v0.4.3 #42: one highlight per active item; its shape (row / icon tile) selects the style.
      for (const { element, shape } of adapter.sidebarActiveTargets?.(sidebars) || []) {
        add(element,'data-op-sidebar-active');
        if (shape === 'tile') add(element,'data-op-sidebar-active-tile');
      }
    }
    return {
      targets, nextPrimary, nextObservedDock, nextOverlaidDock, nextThreadScroller,
      nextAlphaFadeScroller, nextAlphaFadeDock, isHome, messageScroller, composer
    };
  }
  function commitSurfaceState(state) {
    const {
      targets, nextPrimary, nextObservedDock, nextOverlaidDock, nextThreadScroller,
      nextAlphaFadeScroller, nextAlphaFadeDock, isHome
    } = state;
    const adoptingHandover = adoptHandoverSurfaceMarks();
    for (const [element, attributes] of surfaceMarks) {
      for (const [attribute, original] of attributes) {
        if (!targets.get(element)?.has(attribute)) {
          restoreSurfaceMark(element,attribute,original);attributes.delete(attribute);
        }
      }
      if (!attributes.size) surfaceMarks.delete(element);
    }
    for (const [element, attributes] of targets) {
      if (!surfaceMarks.has(element)) surfaceMarks.set(element,new Map());
      const originals = surfaceMarks.get(element);
      for (const attribute of attributes) {
        if (!originals.has(attribute)) {
          const current = element.getAttribute(attribute);
          originals.set(attribute, adoptingHandover && current === 'true' ? null : current);
        }
        if (element.getAttribute(attribute) !== 'true') element.setAttribute(attribute,'true');
      }
    }
    if (nextPrimary !== primarySurface) {
      surfaceObserver?.disconnect();surfaceObserver=null;primarySurface=nextPrimary;
      primaryResizeState.armed = false; primaryResizeState.key = '';
      if (primarySurface && global.ResizeObserver) {
        surfaceObserver=new ResizeObserver(primaryResized);
        surfaceObserver.observe(primarySurface);
      }
    }
    if (nextObservedDock !== observedDock) {
      dockObserver?.disconnect(); dockObserver = null; observedDock = nextObservedDock;
      dockResizeState.armed = false; dockResizeState.key = '';
      if (observedDock && global.ResizeObserver) {
        dockObserver = new ResizeObserver(dockResized);
        dockObserver.observe(observedDock);
      }
    }
    dockOverlaidHost = nextOverlaidDock; dockScroller = nextThreadScroller;
    alphaFadeScroller = nextAlphaFadeScroller; alphaFadeDock = nextAlphaFadeDock;
    const home = String(isHome);
    setAttr(document.documentElement, 'data-op-home', home);
    setAttr(document.documentElement, 'data-op-visibility', document.hidden?'hidden':'visible');
  }
  function syncAmbientBounds(precomputedRect) {
    if (ambient && primarySurface?.isConnected) {
      const rect = precomputedRect || primarySurface.getBoundingClientRect();
      const left=Math.max(0,Math.min(innerWidth,rect.left));
      const top=Math.max(0,Math.min(innerHeight,rect.top));
      const width=Math.max(0,Math.min(innerWidth,rect.right)-left);
      const height=Math.max(0,Math.min(innerHeight,rect.bottom)-top);
      for (const [key,value] of Object.entries({left,top,width,height})) {
        const pixels=Math.round(value)+'px';
        if (ambient.style[key]!==pixels) ambient.style[key]=pixels;
      }
    }
  }
  function flushScheduledGeometry() {
    geometryFrame=null;
    if (lostOwnership() || !enabled || stopped || document.hidden) return;
    syncAllGeometry({ includeReadingWidth: false });
  }
  function scheduleGeometry() {
    if (lostOwnership() || !enabled || stopped || document.hidden || (!ambient && !dock && !dockOverlaidHost && !alphaFadeDock) || geometryFrame) return;
    geometryFrame=requestAnimationFrame(flushScheduledGeometry);
  }
  /* Root custom properties owned by the runtime (review fix S2), following the --op-ambient-alpha pattern in
   * config-schema.js: the first write saves the original inline value and priority, clearing restores them,
   * and an emptied style attribute that did not exist before is removed (no style="" residue). */
  const rootVarOriginals=new Map();
  let rootHadStyle=false;
  function hasNonRuntimeStyle(root) {
    const raw=root?.getAttribute('style');
    if (raw===null || raw===undefined) return false;
    if (typeof root.style?.length==='number') {
      for (let i=0; i<root.style.length; i++) {
        if (!RUNTIME_ROOT_VARS.includes(root.style[i])) return true;
      }
      return false;
    }
    return raw.split(';').some(decl=>{
      const colon=decl.indexOf(':');
      if (colon<0) return Boolean(decl.trim());
      const prop=decl.slice(0,colon).trim();
      return Boolean(prop) && !RUNTIME_ROOT_VARS.includes(prop);
    });
  }
  function setRootVar(name,value) {
    const root=document.documentElement;
    if (!rootVarOriginals.has(name)) {
      if (!rootVarOriginals.size) rootHadStyle=root.getAttribute('style')!==null;
      rootVarOriginals.set(name,[root.style.getPropertyValue(name),root.style.getPropertyPriority(name)]);
    }
    if (root.style.getPropertyValue(name)!==value) root.style.setProperty(name,value);
  }
  function clearRootVar(name) {
    const root=document.documentElement, original=rootVarOriginals.get(name);
    if (!original) return;
    rootVarOriginals.delete(name);
    if (original[0]) root.style.setProperty(name,original[0],original[1]); else root.style.removeProperty(name);
    if (!rootVarOriginals.size && !rootHadStyle && root.getAttribute('style')?.trim()==='') root.removeAttribute('style');
  }
  /* v0.3.1 #21 Content Width Presets: one root reading width computed from the main area's width.
   * styles/host-*.css apply it only to each adapter's declared width limiters (no per-node marks).
   * `standard`, a disabled site and stop restore both variables, restoring the native width. */
  let readingWidth='';
  function syncReadingWidth(precomputedRect) {
    const mainWidth = enabled && primarySurface?.isConnected
      ? (precomputedRect ? precomputedRect.width : primarySurface.getBoundingClientRect().width)
      : 0;
    const target=mainWidth ? Adapters.contentWidthTarget(adapter.contentWidth?.native,cfg.contentWidth,mainWidth,global.innerWidth||0) : null;
    const next=target ? `${target.width}px ${target.shift}px` : '';
    if (next===readingWidth || !document.documentElement) return false;
    readingWidth=next;
    if (target) {
      setRootVar('--op-reading-width',target.width+'px');
      setRootVar('--op-reading-shift',target.shift+'px');
    } else {
      clearRootVar('--op-reading-width');
      clearRootVar('--op-reading-shift');
    }
    return true;
  }
  /* Review fix P2: dock clearance. A composer dock that overlays the conversation scroller (Gemini's
   * absolute input container) rather than following the thread in flow (ChatGPT's sticky footer) covers the
   * last reply's action row once the two-row Composer Surface makes it taller. The overlaid scroller carries a
   * reversible mark; styles/common.css adds an empty ::after of --op-dock-clearance after the thread. The clearance is
   * the measured overlap at the scroll end plus a small gap; the ::after changes neither the scroller box nor
   * the dock, so the measurement never feeds back on itself. */
  const DOCK_GAP=8;
  function overlaidScroller(scrim, precomputedScroller) {
    if (!scrim) return null;
    let scroller = precomputedScroller;
    if (scroller === undefined) {
      const turn=adapter.assistantTurns()[0]||adapter.userTurns()[0];
      scroller=turn?adapter.scrollContainer(turn):null;
    }
    const scrimPos = (typeof getComputedStyle === 'function' ? getComputedStyle(scrim)?.position : '') || '';
    if (!scroller || [document.scrollingElement,document.documentElement,document.body].includes(scroller) || scrim.contains(scroller) || (scroller.contains(scrim) && scrimPos !== 'fixed')) return null;
    return scroller;
  }
  function readDockClearance() {
    let clearance=0;
    if (enabled && dockScroller?.isConnected && dockOverlaidHost?.isConnected) {
      const box=dockScroller.getBoundingClientRect(), dockRect=dockOverlaidHost.getBoundingClientRect();
      if (typeof dockScroller.contains==='function' && dockScroller.contains(dockOverlaidHost)) {
        if (dockRect.height > 0) clearance=Math.max(0,Math.ceil(dockRect.height + DOCK_GAP));
      } else {
        const padding = (typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(dockScroller)?.paddingBottom) : 0) || 0;
        // Only a dock docked over or floating near the scroller's bottom edge covers the end of the thread.
        if (dockRect.top < box.bottom && dockRect.bottom >= box.bottom - 48 && dockRect.bottom <= box.bottom + 48) {
          clearance=Math.max(0,Math.ceil(box.bottom - padding - dockRect.top + DOCK_GAP));
        }
      }
    }
    return clearance;
  }
  function applyDockClearance(clearance) {
    if (clearance) setRootVar('--op-dock-clearance',clearance+'px'); else clearRootVar('--op-dock-clearance');
  }
  function syncDockClearance() { applyDockClearance(readDockClearance()); }
  function readScrollerFade() {
    if (enabled && alphaFadeScroller?.isConnected && alphaFadeDock?.isConnected) {
      const sRect = alphaFadeScroller.getBoundingClientRect();
      const dRect = alphaFadeDock.getBoundingClientRect();
      if (dRect.top < sRect.bottom - 1) return Math.max(0, Math.ceil(sRect.bottom - dRect.top));
    }
    return null;
  }
  function applyScrollerFade(overlap) {
    if (overlap !== null) {
      setRootVar('--op-scroller-fade-start', overlap + 'px');
      setRootVar('--op-scroller-fade-end', Math.max(0, overlap - 24) + 'px');
    } else {
      clearRootVar('--op-scroller-fade-start');
      clearRootVar('--op-scroller-fade-end');
    }
  }
  function syncScrollerFade() { applyScrollerFade(readScrollerFade()); }
  function readDockAvoidance(precomputedComposer) {
    if (lostOwnership()) return null;
    if (!enabled || stopped || !dock || !dock.isConnected) return { clear: true };
    const vw = document.documentElement?.clientWidth || global.innerWidth || 0;
    const vh = document.documentElement?.clientHeight || global.innerHeight || 0;
    if (!(vw > 0) || !(vh > 0)) return null;
    const dockBox = dock.getBoundingClientRect();
    if (!(dockBox.width > 0) || !(dockBox.height > 0)) return null;
    const { right: baseRight, bottom: baseBottom } = Adapters.dockEdgeMargin(vw);
    const composer = precomputedComposer !== undefined ? precomputedComposer : (adapter.composerSurface?.() || null);
    const composerCard = adapter.composerCardSurface?.(composer) || composer;
    const composerVisible = composerCard && (typeof Adapters.isVisible !== 'function' || Adapters.isVisible(composerCard));
    const composerRect = composerVisible ? composerCard.getBoundingClientRect() : null;
    const railRect = rail && rail.isConnected ? rail.getBoundingClientRect() : null;
    const cornerObstacles = adapter.cornerFloatingObstacles?.(composer) || [];
    return Adapters.computeDockAvoidance({
      viewport: { width: vw, height: vh },
      dockSize: { width: dockBox.width, height: dockBox.height },
      baseRight,
      baseBottom,
      composerRect,
      railRect,
      cornerObstacles,
      gap: 10
    });
  }
  function applyDockAvoidance(result) {
    if (!result) return;
    if (result.clear) {
      clearRootVar('--op-dock-offset-x');
      clearRootVar('--op-dock-offset-y');
      return;
    }
    if (result.offsetX > 0) setRootVar('--op-dock-offset-x', result.offsetX + 'px'); else clearRootVar('--op-dock-offset-x');
    if (result.offsetY > 0) setRootVar('--op-dock-offset-y', result.offsetY + 'px'); else clearRootVar('--op-dock-offset-y');
    const popover = dock?.querySelector('.op-vial-popover');
    if (popover && !popover.hidden) syncDockPopoverPosition();
  }
  const primaryResizeState = { armed: false, key: '' };
  const dockResizeState = { armed: false, key: '' };
  let lastGeometryPass = 0;
  function resizeEntryKey(entries) {
    const first = Array.isArray(entries) && entries.length ? entries[0] : null;
    const box = first?.borderBoxSize?.[0];
    if (box && Number.isFinite(box.inlineSize) && Number.isFinite(box.blockSize)) {
      return `${Math.round(box.inlineSize)}x${Math.round(box.blockSize)}`;
    }
    const rect = first?.contentRect;
    if (rect && Number.isFinite(rect.width) && Number.isFinite(rect.height)) {
      return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    }
    return '';
  }
  function syncAllGeometry({ includeReadingWidth = true, composer } = {}) {
    if (lostOwnership() || !enabled || stopped) return;
    lastGeometryPass = passes;
    // Batched read phase: sync reading width before measuring composer/dock boxes only when
    // --op-reading-width/-shift actually changes (no-op writes 0 attributes/vars in steady state).
    const measured = runWithScanCache(() => {
      const primaryRect = primarySurface?.isConnected && (includeReadingWidth || ambient)
        ? primarySurface.getBoundingClientRect()
        : null;
      if (includeReadingWidth) syncReadingWidth(primaryRect);
      const clearance = readDockClearance();
      const fadeOverlap = readScrollerFade();
      const avoidance = readDockAvoidance(composer);
      return { primaryRect, clearance, fadeOverlap, avoidance };
    });
    // Batched write phase: apply ambient bounds and dock variables together.
    syncAmbientBounds(measured.primaryRect);
    applyDockClearance(measured.clearance);
    applyScrollerFade(measured.fadeOverlap);
    applyDockAvoidance(measured.avoidance);
  }
  function handleObservedResize(state, entries, includeReadingWidth) {
    if (lostOwnership() || !enabled || stopped) return;
    const key = resizeEntryKey(entries);
    if (key) {
      if (!state.armed) {
        state.armed = true;
        state.key = key;
        if (lastGeometryPass === passes) return;
      } else if (key === state.key) {
        return;
      } else {
        state.key = key;
      }
    }
    syncAllGeometry({ includeReadingWidth });
  }
  const primaryResized = entries => handleObservedResize(primaryResizeState, entries, true);
  const dockResized = entries => handleObservedResize(dockResizeState, entries, false);
  function syncAmbientDom() {
    if (lostOwnership()) return;
    const needed=(cfg.ambientIntensity>0 && (cfg.ambientStyle!=='none' || cfg.ambientTexture!=='off')) || cfg.semanticAura;
    if (!needed || !primarySurface) {ambient?.remove();ambient=null;return;}
    if (!ambient) {
      ambient=own(make('div','op-ambient'));ambient.id='op-ambient-stage';ambient.setAttribute('aria-hidden','true');
      const wash=make('div','op-ambient-wash');
      for (const layer of ['one','two','three']) wash.append(make('i','op-aurora op-aurora-'+layer));
      ambient.append(wash,make('div','op-ambient-grid'),make('div','op-ambient-rim'));
    }
    // Lazily mount the inline-SVG glyph layer only when glyph texture is enabled (zero text nodes).
    const needGlyphs = cfg.ambientIntensity > 0 && cfg.ambientTexture === 'glyphs';
    const existingGlyphs = ambient.querySelector('.op-ambient-glyphs');
    if (needGlyphs && !existingGlyphs) {
      const glyphs = make('div', 'op-ambient-glyphs');
      const rim = ambient.querySelector('.op-ambient-rim');
      if (rim && typeof rim.before === 'function') rim.before(glyphs);
      else ambient.append(glyphs);
    } else if (!needGlyphs && existingGlyphs) {
      existingGlyphs.remove();
    }
    const ambientActive = cfg.ambientIntensity > 0 && cfg.ambientStyle !== 'none';
    setAttr(ambient, 'data-op-ambient-active', String(ambientActive));
    if (ambient.parentElement!==primarySurface) primarySurface.append(ambient);
  }
  function resetConversation() {
    activeTurn=-1; renderedActiveTurn=-2;
    railSignature=''; lastEstimate=0; lastModelLabel=''; lastAttachments=0;
    clearTurnCaches();
    markAllDirty({ fullEstimate: true, fullRail: true, pruneOrphans: true });
    for(const [element,entry] of thoughts) cleanupThought(element,entry);
    clearFormulaChunkQueue();
    for(const [pre,entry] of formulas) cleanupFormula(pre,entry);
    formulaSkipCache = new WeakMap();
    codeHeaderSvgCache = new WeakMap();
    for(const [pre,entry] of codes) cleanupCode(pre,entry);
    clearActivity();
    closeRail(); setDockOpen(false);
    if (isOwner()) { clearRootVar('--op-dock-offset-x'); clearRootVar('--op-dock-offset-y'); }
  }
  function scan() {
    if(lostOwnership() || !enabled || stopped || document.hidden || !document.body) return;
    passes++;
    if(route!==location.href) {route=location.href;revision++;resetConversation();}
    let work = { ...dirty };
    dirty.surfaces = dirty.formulas = dirty.codes = dirty.rail = dirty.vial = dirty.thoughts = dirty.geometry = false;
    // Fast path: streaming prose-only tick inside existing assistant turns (zero surface/geometry rescan).
    const vialOnly = work.vial && !work.surfaces && !work.formulas && !work.codes && !work.rail && !work.thoughts && !work.geometry;
    if (vialOnly && dock?.isConnected && (cachedUserTurns.length || cachedAssistantTurns.length) &&
        cachedUserTurns.every(t => t.isConnected) && cachedAssistantTurns.every(t => t.isConnected)) {
      syncContextVial({
        userTurns: cachedUserTurns,
        assistantTurns: cachedAssistantTurns,
        modelLabel: lastModelLabel,
        attachmentsCount: lastAttachments
      });
      return;
    }
    if (vialOnly) work = { surfaces: true, formulas: true, codes: true, rail: true, vial: true, thoughts: true, geometry: true };
    // Phase 1: pure read/discovery inside one scan-scoped cache (zero DOM mutations).
    const snap = runWithScanCache(() => {
      const surfaceState = work.surfaces ? collectSurfaceState() : null;
      const needTurns = work.surfaces || work.rail || work.vial || work.formulas || work.codes;
      const userTurns = needTurns ? adapter.userTurns() : cachedUserTurns;
      const assistantTurns = needTurns ? adapter.assistantTurns() : cachedAssistantTurns;
      const needCode = (work.formulas || work.codes) && (cfg.formulaPreview !== false || cfg.longCodeFold);
      const codeBlocks = needCode ? adapter.codeBlocks().filter(pre => !Adapters.isOwned(pre)) : [];
      const needFormula = work.formulas && cfg.formulaPreview !== false && codeBlocks.length > 0;
      const codeSurfaces = needFormula ? (adapter.codeSurfaces?.() || []) : [];
      const codeHeaders = needFormula ? (adapter.codeHeaders?.() || []) : [];
      const isStreaming = needFormula ? Boolean(adapter.isStreaming?.()) : false;
      const modelLabel = (work.vial || work.surfaces) && cfg.contextVial ? (adapter.activeModelLabel?.() || '') : lastModelLabel;
      const attachmentsCount = (work.vial || work.surfaces) && cfg.contextVial ? (adapter.visibleAttachments?.() || []).length : lastAttachments;
      const thoughtBlocks = work.thoughts && cfg.thoughtTranslate ? adapter.thoughtBlocks() : [];
      return {
        surfaceState, userTurns, assistantTurns, codeBlocks, codeSurfaces, codeHeaders,
        isStreaming, modelLabel, attachmentsCount, thoughtBlocks, codeTextCache: new Map()
      };
    });
    if (work.surfaces || work.rail || work.vial || work.formulas || work.codes) {
      cachedUserTurns = snap.userTurns;
      cachedAssistantTurns = snap.assistantTurns;
      cachedUserTurnSet = new Set(snap.userTurns);
      cachedAssistantTurnSet = new Set(snap.assistantTurns);
    }
    if (snap.surfaceState) cachedMessageScroller = snap.surfaceState.messageScroller || null;
    // Phase 2: pure DOM & attribute writes (zero interleaved layout reads).
    if (work.surfaces && snap.surfaceState) {
      commitSurfaceState(snap.surfaceState);
      syncAmbientDom();
    }
    if (work.formulas) syncFormulas(snap);
    if (work.codes) syncCodes(snap);
    if (work.rail) syncRail(snap);
    if (work.vial || work.surfaces) syncDock(snap);
    if (work.thoughts) syncThoughts(snap);
    if (needOrphanPrune && (work.surfaces || work.formulas || work.codes || work.rail || work.thoughts)) {
      pruneOrphanRoots();
      needOrphanPrune = false;
    }
    // Phase 3: single batched geometry read -> single batched root-var & bounds write.
    if (work.geometry || work.surfaces) {
      syncAllGeometry({ includeReadingWidth: true, composer: snap.surfaceState?.composer });
    }
  }
  function shouldIgnoreScrollTarget(target) {
    if (!target || target === document || target === document.documentElement || target === document.body || target === document.scrollingElement || target === global) return false;
    if (Adapters.isOwned(target)) return true;
    if (typeof target.closest === 'function') {
      if (target.closest('[data-op-sidebar-surface="true"], pre, code, .op-formula-math, dialog, [role="dialog"], [aria-modal="true"], [role="menu"], [role="listbox"]')) return true;
    } else {
      for (let cur = target; cur; cur = cur.parentElement) {
        if (Adapters.isOwned(cur)) return true;
        const tag = (cur.localName || cur.tagName || '').toLowerCase();
        if (tag === 'pre' || tag === 'code' || tag === 'dialog') return true;
        if (cur.getAttribute?.('data-op-sidebar-surface') === 'true' || cur.getAttribute?.('aria-modal') === 'true') return true;
        const role = cur.getAttribute?.('role');
        if (role === 'dialog' || role === 'menu' || role === 'listbox') return true;
        if (cur.classList?.contains?.('op-formula-math')) return true;
      }
    }
    if (primarySurface?.isConnected && target !== primarySurface && !primarySurface.contains?.(target) && !target.contains?.(primarySurface)) return true;
    return false;
  }
  function isDocumentLevelScroll(target) {
    if (!target || target === document || target === document.documentElement || target === document.body || target === document.scrollingElement || target === global) return true;
    return Boolean(primarySurface?.isConnected && target !== primarySurface && target.contains?.(primarySurface));
  }
  function suspend() {
    if (lostOwnership()) return;
    disconnectRuntime();
    clearSurfaceMarks();
    syncReadingWidth(); syncDockClearance(); syncScrollerFade();
    clearRootVar('--op-dock-offset-x'); clearRootVar('--op-dock-offset-y');
    if (ownsRootAttr()) document.documentElement?.removeAttribute('data-op-instance');
    document.documentElement.removeAttribute('data-op-home');
    document.documentElement.removeAttribute('data-op-visibility');
    clearActivity();
    clearFormulaChunkQueue();
    for(const [pre,entry] of formulas) cleanupFormula(pre,entry);
    formulaSkipCache = new WeakMap();
    codeHeaderSvgCache = new WeakMap();
    for(const [pre,entry] of codes) cleanupCode(pre,entry);
    for(const [element,entry] of thoughts) cleanupThought(element,entry);
    rail?.remove();dock?.remove();ambient?.remove();rail=dock=ambient=null;
  }
  function activate() {
    if(lostOwnership() || enabled || !document.body || stopped) return;
    const prevInstance = currentOwner();
    const tookOver = Boolean(prevInstance && prevInstance !== instanceId);
    enabled=true;events=new AbortController();
    claimedOwnership=true;
    document.documentElement.setAttribute('data-op-instance',instanceId);
    pruneOrphanRoots();
    if (tookOver) {
      const root=document.documentElement;
      if (!rootVarOriginals.size) rootHadStyle=hasNonRuntimeStyle(root);
      for (const name of RUNTIME_ROOT_VARS) {
        if (!rootVarOriginals.has(name) && (root.style.getPropertyValue(name) || root.style.getPropertyPriority(name))) {
          rootVarOriginals.set(name,['','']);
        }
      }
      if (rootVarOriginals.has('--op-reading-width') || rootVarOriginals.has('--op-reading-shift')) readingWidth=null;
      handoverPending=true;
    }
    observer=new MutationObserver(mutationsChanged);
    function observeBody() {
      observer.disconnect();
      documentObserver.disconnect();
      documentObserver.observe(document.documentElement,{childList:true,attributes:true,attributeFilter:['class','data-theme','data-op-instance']});
      observedBody=document.body;
      observerCapturesOldValue = Boolean(cfg.streamChoreography && motionAllowed());
      if(observedBody) {
        observer.observe(observedBody,{childList:true,subtree:true,characterData:true,characterDataOldValue:observerCapturesOldValue,attributes:true,attributeFilter:['hidden','open','class','aria-hidden','aria-expanded','aria-current','aria-selected','data-active','data-is-streaming']});
        documentObserver.observe(observedBody,{attributes:true,attributeFilter:['class','data-theme']});
      }
    }
    observeBodyFn = observeBody;
    documentObserver=new MutationObserver(records=>{
      if(lostOwnership()) return;
      if(document.body!==observedBody) {observeBody();lastEstimate=0;railSignature='';markAllDirty({fullEstimate:true,fullRail:true});schedule();}
      if(records.some(record=>record.type==='attributes' && record.attributeName!=='data-op-instance') && Schema.resolvePalette(cfg)==='host') {
        Schema.applyConfigToRoot(cfg);markAllDirty();schedule();
      }
    });
    observeBody();
    listen(document,'keydown',event=>{ if (!lostOwnership() && enabled) onKey(event); });
    listen(document,'click',event=>{
      if(lostOwnership() || !enabled) return;
      if(rail&&!rail.contains(event.target)) closeRail();
      if(dock&&!dock.contains(event.target)) setDockOpen(false);
    });
    listen(document,'scroll',event=>{
      if(lostOwnership() || document.hidden) return;
      const target = event?.target;
      if(shouldIgnoreScrollTarget(target)) return;
      if(isDocumentLevelScroll(target)) scheduleGeometry();
      if(scrollFrame) return;
      scrollFrame=requestAnimationFrame(()=>{scrollFrame=null;if(lostOwnership() || document.hidden) return;activeTurn=nearestTurn();updateRailActive();});
    },{capture:true,passive:true});
    listen(window,'resize',()=>{if(lostOwnership()) return;scheduleGeometry();markAllDirty();schedule();});
    listen(window,'popstate',()=>{markAllDirty({fullEstimate:true,fullRail:true});schedule();});
    listen(window,'hashchange',()=>{markAllDirty({fullEstimate:true,fullRail:true});schedule();});
    listen(document,'visibilitychange',()=>{
      if(lostOwnership()) return;
      document.documentElement.setAttribute('data-op-visibility',document.hidden?'hidden':'visible');
      if(document.hidden) {clearActivity();clearTimeout(pending);pending=null;pendingDelay=0;if(geometryFrame)cancelAnimationFrame(geometryFrame);geometryFrame=null;}
      else {lastEstimate=0;markAllDirty({fullEstimate:true,fullRail:true});schedule();}
    });
    markAllDirty({fullEstimate:true,fullRail:true,pruneOrphans:true});
    scan();
  }
  function configure(next) {
    if(lostOwnership() || stopped) return;
    revision++;
    const previous=cfg;cfg=Schema.sanitizeConfig(next);
    if(previous.thoughtView!==cfg.thoughtView) for(const [element,entry] of thoughts){entry.view=cfg.thoughtView;applyThoughtView(element,entry);}
    if(previous.thoughtEndpoint!==cfg.thoughtEndpoint||previous.thoughtModel!==cfg.thoughtModel) for(const [element,entry] of thoughts) cleanupThought(element,entry);
    if(previous.formulaPreview!==cfg.formulaPreview) formulaSkipCache = new WeakMap();
    if(!activeForSite()) {suspend();Schema.applyConfigToRoot(cfg);return;}
    Schema.applyConfigToRoot(cfg);
    if(!motionAllowed()||!cfg.streamChoreography) clearHighlights();
    if(!motionAllowed()||!cfg.semanticAura) setAuraState(null);
    railSignature='';lastEstimate=0;
    markAllDirty({fullEstimate:true,fullRail:true,pruneOrphans:true});
    if(!enabled) activate();
    else {
      if (observer && observeBodyFn && Boolean(cfg.streamChoreography && motionAllowed()) !== observerCapturesOldValue) {
        observeBodyFn();
      }
      scan();
    }
  }
  mediaChanged=()=>{if(!lostOwnership()&&hasConfig)configure(cfg);};
  systemTheme.addEventListener('change',mediaChanged);
  reducedMotion.addEventListener('change',mediaChanged);
  onHide=()=>{if(!lostOwnership())suspend();};
  onShow=()=>{if(!lostOwnership()&&!stopped&&hasConfig)configure(cfg);};
  window.addEventListener('pagehide',onHide);window.addEventListener('pageshow',onShow);
  let changes=0;
  unsubscribe=Schema.subscribe(next=>{if(lostOwnership())return;changes++;hasConfig=true;configure(next);});
  const initialChanges=changes;
  const initialConfigPromise = (global.ObsidianPrismReady && typeof global.ObsidianPrismReady.then === 'function')
    ? global.ObsidianPrismReady
    : Schema.loadConfig();
  initialConfigPromise.then(loaded=>{if(lostOwnership()||stopped)return;if(changes===initialChanges){hasConfig=true;configure(loaded);}}).catch(()=>{
    if(lostOwnership()||stopped)return;
    suspend();Schema.applyConfigToRoot({...cfg,enabled:false});
  });
  global.ObsidianPrismRuntime=Object.freeze({
    refresh(){ markAllDirty(); schedule(SCAN_DEBOUNCE_MS); },
    diagnostics:()=>({passes,enabled,observing:Boolean(observer),pending:Boolean(pending),codeBlocks:codes.size,formulaBlocks:formulas.size,thoughtBlocks:thoughts.size,surfaces:surfaceMarks.size}),
    stop(){
      if(lostOwnership()) return;
      revision++;suspend();disconnectRuntime({permanent:true});
      Schema.applyConfigToRoot({...cfg,enabled:false});
    }
  });
})(globalThis);
