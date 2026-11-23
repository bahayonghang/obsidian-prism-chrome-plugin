/* Obsidian Prism Web — reversible, event-driven workbench.
 * Community port of RMvdesi/obsidian-prism. Modified 2026-11-22.
 * SPDX-License-Identifier: GPL-3.0-only. See NOTICE / MODIFICATIONS.md. */
(function (global) {
  'use strict';
  if (global.ObsidianPrismRuntime) return;
  const Schema = global.ObsidianPrismSchema;
  const Adapters = global.ObsidianPrismAdapters;
  const host = Schema?.detectHost();
  const adapter = Adapters?.forHost(host);
  if (!Schema || !adapter) return;

  let cfg = Schema.DEFAULT_CONFIG;
  let enabled = false;
  let stopped = false;
  let hasConfig = false;
  let observer = null;
  let documentObserver = null;
  let observedBody = null;
  let events = null;
  let pending = null;
  let streamIdle = null;
  let fadeTimer = null;
  let scrollFrame = null;
  let revision = 0;
  let passes = 0;
  let nextId = 0;
  let route = location.href;
  let rail = null;
  let dock = null;
  let ambient = null;
  let activeTurn = -1;
  let railSignature = '';
  let lastEstimate = 0;
  let lastModelLabel = '';
  let lastAttachments = 0;
  let estimate = {user:0, assistant:0, code:0, total:0};
  let fadeEntries = [];
  let surfaceObserver = null;
  let primarySurface = null;
  let dockObserver = null;
  let observedDock = null;
  let dockScrim = null;
  let dockScroller = null;
  let dockOverlaidHost = null;
  let alphaFadeScroller = null;
  let alphaFadeDock = null;
  let geometryFrame = null;
  const surfaceMarks = new Map();
  const codes = new Map();
  const thoughts = new Map();
  const fades = ['op-stream-f0','op-stream-f1','op-stream-f2','op-stream-f3','op-stream-f4'];
  const systemTheme = matchMedia('(prefers-color-scheme: dark)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const instanceId = `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const RUNTIME_SURFACE_ATTRS = Object.freeze([
    'data-op-main-surface',
    'data-op-thread-column',
    'data-op-composer-column',
    'data-op-code-surface',
    'data-op-code-header',
    'data-op-composer-dock',
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
    'data-op-sidebar-active'
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
    documentObserver?.disconnect(); documentObserver = null; observedBody = null;
    events?.abort(); events = null;
    clearTimeout(pending); pending = null;
    if (scrollFrame) cancelAnimationFrame(scrollFrame); scrollFrame = null;
    if (geometryFrame) cancelAnimationFrame(geometryFrame); geometryFrame = null;
    dockObserver?.disconnect(); dockObserver = null; observedDock = null;
    dockScrim = dockScroller = dockOverlaidHost = alphaFadeScroller = alphaFadeDock = null;
    railSignature = ''; lastEstimate = 0; lastModelLabel = ''; lastAttachments = 0; activeTurn = -1;
    if (permanent) {
      stopped = true;
      surfaceObserver?.disconnect(); surfaceObserver = null; primarySurface = null;
      clearTimeout(streamIdle); streamIdle = null;
      clearTimeout(fadeTimer); fadeTimer = null; fadeEntries = [];
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
      for (const root of roots) {
        if (!root.querySelectorAll) continue;
        for (const node of root.querySelectorAll(simple)) {
          if (!out.includes(node) && (!part.includes('[data-op-owned]') || node.hasAttribute?.('data-op-owned'))) out.push(node);
        }
      }
    }
    return out;
  }
  function pruneOrphanRoots() {
    const keepButtons = new Set([...codes.values()].map(entry => entry.button));
    const keepToolbars = new Set([...thoughts.values()].map(entry => entry.toolbar));
    for (const node of queryAllNodes('#op-bottom-dock, .op-dock[data-op-owned]')) if (node !== dock) node.remove();
    for (const node of queryAllNodes('#op-rail-root, .op-rail[data-op-owned]')) if (node !== rail) node.remove();
    for (const node of queryAllNodes('#op-ambient-stage, .op-ambient[data-op-owned]')) if (node !== ambient) node.remove();
    for (const node of queryAllNodes('.op-code-fold-bar[data-op-owned]')) if (!keepButtons.has(node)) node.remove();
    for (const node of queryAllNodes('.op-thought-toolbar[data-op-owned]')) if (!keepToolbars.has(node)) node.remove();
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
  function listen(target, type, listener, options = {}) {
    target.addEventListener(type, listener, {...options, signal: events.signal});
  }
  function cleanupCode(pre, entry) {
    entry.button.remove();
    pre.classList.remove('op-code-folded');
    if (entry.generatedId && pre.id === entry.generatedId) pre.removeAttribute('id');
    codes.delete(pre);
  }
  function cleanupThought(element, entry) {
    entry.version++;
    entry.toolbar.remove();
    element.classList.remove('op-thought-hidden');
    thoughts.delete(element);
  }
  function clearHighlights() {
    clearTimeout(fadeTimer); fadeTimer = null; fadeEntries = [];
    if (global.CSS?.highlights) fades.forEach(name => CSS.highlights.delete(name));
  }
  function clearActivity() {
    clearTimeout(streamIdle); streamIdle = null;
    clearHighlights();
    document.documentElement.removeAttribute('data-op-aura');
  }

  // No wrappers are inserted into streamed text. Ranges live only for a short fade.
  function paintHighlights() {
    fadeTimer = null;
    if (!enabled || !cfg.streamChoreography || !motionAllowed() || !global.CSS?.highlights || !global.Highlight) {
      clearHighlights(); return;
    }
    const now = performance.now();
    const buckets = fades.map(() => []);
    fadeEntries = fadeEntries.filter(entry => {
      const tier = Math.floor((now - entry.created) / 65);
      const length = entry.node.nodeValue?.length || 0;
      if (!entry.node.isConnected || tier > 4 || entry.start >= length) return false;
      try {
        const range = document.createRange();
        range.setStart(entry.node, entry.start);
        range.setEnd(entry.node, Math.min(length, entry.end));
        buckets[Math.max(0,tier)].push(range);
        return true;
      } catch (_) { return false; }
    });
    fades.forEach((name, index) => {
      if (buckets[index].length) CSS.highlights.set(name, new Highlight(...buckets[index]));
      else CSS.highlights.delete(name);
    });
    if (fadeEntries.length) fadeTimer = setTimeout(paintHighlights, 55);
  }
  function addTextFade(node, oldValue = '') {
    if (!cfg.streamChoreography || !motionAllowed() || !global.CSS?.highlights || !global.Highlight) return;
    if (node.nodeType !== Node.TEXT_NODE || !adapter.isAssistantNode(node)) return;
    if (node.parentElement?.closest('pre,code,[data-op-owned]')) return;
    const text = node.nodeValue || '';
    if (!text.trim()) return;
    const start = oldValue && text.startsWith(oldValue) ? oldValue.length : 0;
    if (start >= text.length) return;
    fadeEntries.push({node, start, end:text.length, created:performance.now()});
    fadeEntries = fadeEntries.slice(-64);
    if (!fadeTimer) paintHighlights();
  }
  function markResponseActivity() {
    if (!enabled || document.hidden) return;
    if (cfg.semanticAura && motionAllowed()) document.documentElement.setAttribute('data-op-aura','streaming');
    clearTimeout(streamIdle);
    streamIdle = setTimeout(() => {
      streamIdle = null;
      clearHighlights();
      if (enabled && cfg.semanticAura && motionAllowed()) document.documentElement.setAttribute('data-op-aura','settled');
      else document.documentElement.removeAttribute('data-op-aura');
      lastEstimate = 0;
      schedule();
    }, 1200);
  }
  function mutationsChanged(records) {
    if (lostOwnership() || !enabled || stopped) return;
    // A host rerender can remove our complete controls. Reattach them without
    // subscribing to ordinary text changes inside controls we still own.
    let changed = [rail,dock,ambient].some(root=>root&&!root.isConnected)
      || [...codes].some(([pre,entry])=>pre.isConnected&&!entry.button.isConnected)
      || [...thoughts].some(([element,entry])=>element.isConnected&&!entry.toolbar.isConnected);
    let responseChanged = false;
    for (const record of records) {
      if (Adapters.isOwned(record.target)) continue;
      const children = [...(record.addedNodes || []), ...(record.removedNodes || [])];
      // This also covers bare text nodes written inside an owned component.
      if (record.type === 'childList' && children.length && children.every(Adapters.isOwned)) continue;
      changed = true;
      if (document.hidden) continue;
      if (record.type === 'characterData' && adapter.isAssistantNode(record.target)) {
        responseChanged = true;
        addTextFade(record.target, record.oldValue || '');
      }
      for (const node of record.addedNodes || []) {
        if (Adapters.isOwned(node) || (!adapter.isAssistantNode(node) && !adapter.isAssistantNode(record.target))) continue;
        responseChanged = true;
        if (node.nodeType === Node.TEXT_NODE) addTextFade(node);
        else if (node.nodeType === Node.ELEMENT_NODE) {
          const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
          for (let textNode = walker.nextNode(), count = 0; textNode && count < 64; textNode = walker.nextNode(), count++) addTextFade(textNode);
        }
      }
    }
    if (responseChanged) markResponseActivity();
    if (changed) schedule();
  }
  function schedule() {
    if (lostOwnership() || !enabled || stopped || pending || document.hidden) return;
    pending = setTimeout(() => { pending = null; if (lostOwnership()) return; scan(); }, 160);
  }

  function syncCodes() {
    const current = new Set(cfg.longCodeFold ? adapter.codeBlocks() : []);
    for (const [pre, entry] of codes) {
      if (!current.has(pre) || !pre.isConnected) cleanupCode(pre, entry);
    }
    for (const pre of current) {
      const count = Adapters.textOf(pre.querySelector('code') || pre).replace(/\n$/, '').split('\n').length;
      if (count < 48) {
        if (codes.has(pre)) cleanupCode(pre, codes.get(pre));
        continue;
      }
      let entry = codes.get(pre);
      if (!entry) {
        const button = own(make('button','op-code-fold-bar'));
        const generatedId = pre.id ? null : 'op-code-'+(++nextId);
        if (generatedId) pre.id = generatedId;
        entry = {button, generatedId, folded:false, lines:count};
        button.setAttribute('aria-controls',pre.id);
        button.addEventListener('click', () => {
          if (!enabled) return;
          const scroller = adapter.scrollContainer(pre);
          const viewportTop = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
          const beforeTop = button.getBoundingClientRect().top;
          const startsAbove = pre.getBoundingClientRect().top < viewportTop;
          entry.folded = !entry.folded;
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
    entry.button.setAttribute('aria-expanded',String(!entry.folded));
  }

  function closeRail(returnFocus = false) {
    if (!rail) return;
    rail.querySelector('.op-rail-drawer').hidden = true;
    const toggle = rail.querySelector('.op-rail-toggle');
    toggle.setAttribute('aria-expanded','false');
    if (returnFocus) toggle.focus();
  }
  function renderRailList(turns) {
    if (!rail) return;
    const search = rail.querySelector('.op-rail-search');
    const keyword = search.value.trim().toLocaleLowerCase();
    const list = rail.querySelector('.op-rail-list');
    const fragment = document.createDocumentFragment();
    turns.forEach((turn,index) => {
      const text = Adapters.cleanTurnText(turn).replace(/\s+/g,' ').trim();
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
    updateRailActive();
  }
  function syncRail() {
    if (lostOwnership()) return;
    pruneOrphanRoots();
    const turns = adapter.userTurns();
    if (!cfg.railOutline || !turns.length) {
      rail?.remove(); rail = null; railSignature = ''; return;
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
    toggle.setAttribute('aria-label',t('outlineTitle')); toggle.title = t('outlineTitle');
    rail.setAttribute('aria-label',t('outlineTitle'));
    const search = rail.querySelector('.op-rail-search');
    search.placeholder = t('outlineSearch'); search.setAttribute('aria-label',t('outlineSearch'));
    setText(rail.querySelector('.op-rail-title'),t('outlineTitle'));
    setText(rail.querySelector('.op-rail-count'),String(turns.length));
    const signature = JSON.stringify([cfg.language,turns.map(turn => Adapters.cleanTurnText(turn))]);
    if (signature !== railSignature) {
      railSignature = signature;
      const ticks = rail.querySelector('.op-rail-ticks');
      const fragment = document.createDocumentFragment();
      const count = Math.min(24,turns.length);
      for (let i=0; i<count; i++) {
        const index = count === 1 ? 0 : Math.round(i*(turns.length-1)/(count-1));
        const tick = make('button','op-rail-tick');
        tick.dataset.turn = String(index);
        tick.title = Adapters.cleanTurnText(turns[index]).replace(/\s+/g,' ').trim().slice(0,100);
        tick.setAttribute('aria-label',`${local('跳到提问','Go to question')} ${index+1}: ${tick.title}`);
        tick.addEventListener('click', () => jump(index));
        fragment.append(tick);
      }
      ticks.replaceChildren(fragment);
      renderRailList(turns);
    }
  }
  function updateRailActive() {
    rail?.querySelectorAll('[data-turn]').forEach(button => {
      const active = Number(button.dataset.turn) === activeTurn;
      button.classList.toggle('is-active',active);
      if (active) button.setAttribute('aria-current','location'); else button.removeAttribute('aria-current');
    });
  }
  function jump(index) {
    const turns = adapter.userTurns();
    if (!turns.length) return;
    activeTurn = Math.max(0, Math.min(turns.length-1,index));
    turns[activeTurn].scrollIntoView({behavior:motionAllowed() ? 'smooth' : 'auto',block:'start'});
    updateRailActive();
  }
  function nearestTurn() {
    const turns = adapter.userTurns();
    if (!turns.length) return -1;
    let result = 0, distance = Infinity;
    turns.forEach((turn,index) => {
      const scroller = adapter.scrollContainer(turn);
      const top = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
      const delta = Math.abs(turn.getBoundingClientRect().top - top - 48);
      if (delta < distance) { distance = delta; result = index; }
    });
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
    let rect = popover.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return;
    const overflowY = r => Math.max(0, margin - r.top) + Math.max(0, r.bottom - (vh - margin));
    if (rect.top < margin || rect.bottom > vh - margin) {
      const aboveOverflow = overflowY(rect);
      dock.setAttribute('data-op-popover-side', 'below');
      const belowRect = popover.getBoundingClientRect();
      if (overflowY(belowRect) < aboveOverflow) {
        rect = belowRect;
      } else {
        dock.removeAttribute('data-op-popover-side');
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
    widthBtn.setAttribute('data-width-preset', preset);
    widthBtn.title = widthTip;
    widthBtn.setAttribute('aria-label', widthTip);
  }
  function syncContextVial() {
    let vial = dock.querySelector('.op-vial-pill');
    if (!cfg.contextVial) {
      vial?.remove();
      dock.querySelector('.op-vial-popover')?.remove();
      dock.removeAttribute('data-op-popover-side');
      dock.style.removeProperty('--op-vial-popover-shift-x');
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
    const modelLabel=adapter.activeModelLabel?.()||'';
    const attachments=(adapter.visibleAttachments?.()||[]).length;
    const capacity=Adapters.resolveReferenceCapacity(host,modelLabel,cfg.contextWindowTokens);
    const now=performance.now();
    if (!lastEstimate || now-lastEstimate>750 || lastModelLabel!==modelLabel || lastAttachments!==attachments) {
      let user=0, assistant=0, code=0;
      for (const node of adapter.userTurns()) {
        const turn=Adapters.estimateTurnTokens(node);
        user+=turn.total; code+=turn.code;
      }
      for (const node of adapter.assistantTurns()) {
        const turn=Adapters.estimateTurnTokens(node);
        assistant+=turn.total; code+=turn.code;
      }
      estimate={user, assistant, code, total:user+assistant};
      lastEstimate=now; lastModelLabel=modelLabel; lastAttachments=attachments;
    }
    const format = number => number>=1000000 ? (number/1000000).toFixed(1)+'M' : number>=1000 ? (number/1000).toFixed(1)+'K' : String(number);
    const percent=Math.min(100,capacity.tokens>0?estimate.total/capacity.tokens*100:0);
    // v0.3.1 #18: `?` marks an unrecognized auto capacity so a fallback never reads as the real window.
    const unsure=capacity.source==='unrecognized'?'?':'';
    setText(vial.querySelector('.op-vial-summary'),`≈ ${format(estimate.total)}${attachments>0?'+':''} / ${format(capacity.tokens)}${unsure}`);
    vial.setAttribute('aria-label',`${t('vialTitle')}: ${estimate.total.toLocaleString()}${attachments>0?'+':''} / ${capacity.tokens.toLocaleString()}${unsure} tokens${unsure?` (${t('vialSourceUnrecognized')})`:''}`);
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
  function syncDock() {
    if (lostOwnership()) return;
    pruneOrphanRoots();
    if (!dock) { dock=own(make('aside','op-dock')); dock.id='op-bottom-dock'; document.body.append(dock); }
    if (!dock.isConnected) document.body.append(dock);
    syncWidthToggle();
    syncContextVial();
  }

  function applyThoughtView(element,entry) {
    const immersive=entry.hasTranslation && entry.view==='immersive';
    element.classList.toggle('op-thought-hidden',Boolean(immersive));
    entry.toggle.hidden=!entry.hasTranslation;
    entry.toggle.setAttribute('aria-pressed',String(Boolean(immersive)));
  }
  function syncThoughts() {
    // Keep our deliberately hidden original in the registry until the host removes it.
    const current=new Set(cfg.thoughtTranslate ? adapter.thoughtBlocks() : []);
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
  function syncSurfaces() {
    const targets = new Map();
    const add = (element, attribute) => {
      if (!element?.isConnected || Adapters.isOwned(element)) return;
      if (!targets.has(element)) targets.set(element,new Set());
      targets.get(element).add(attribute);
    };
    const isNativePalette = Schema.resolvePalette(cfg) === 'host';
    const isHome = !adapter.userTurns().length && !adapter.assistantTurns().length;
    let dockHost = null, nextScrim = null, nextScroller = null, nextThreadScroller = null, nextOverlaidDock = null, nextAlphaFadeScroller = null, nextAlphaFadeDock = null, nextObservedDock = null;
    const nextPrimary = adapter.primarySurface?.() || null;
    add(nextPrimary,'data-op-main-surface');
    for (const element of adapter.threadColumns?.() || []) add(element,'data-op-thread-column');
    const composer = adapter.composerSurface?.() || null;
    for (const element of adapter.composerColumns?.(composer) || []) add(element,'data-op-composer-column');
    if (!isNativePalette) {
      for (const element of adapter.codeSurfaces?.() || []) add(element,'data-op-code-surface');
      for (const element of adapter.codeHeaders?.() || []) add(element,'data-op-code-header');
      if (!isHome) {
        dockHost = adapter.composerScrimSurface?.(composer) || null;
        add(dockHost, 'data-op-composer-dock');
        const turn = adapter.assistantTurns()[0] || adapter.userTurns()[0];
        const scroller = turn ? adapter.scrollContainer(turn) : null;
        const isOverlaid = dockHost ? Adapters.isComposerDockOverlaid(dockHost, scroller, global) : false;
        if (isOverlaid) {
          nextOverlaidDock = dockHost;
          add(dockHost, 'data-op-composer-overlaid');
          if (adapter.usesOverlayScrim) {
            nextScrim = dockHost;
            add(nextScrim, 'data-op-composer-scrim');
          }
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
          const below = adapter.composerBelowSiblings?.(composer, dockHost);
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
    }
    nextObservedDock = nextScrim || dockHost || composer || null;
    // Backdrops belong to the page canvas, not the input card. Keep their
    // reversible bridge independent of the optional composer restyling.
    for (const element of adapter.composerBackdropSurfaces?.(composer) || []) {
      add(element,'data-op-composer-backdrop');
    }
    if (cfg.sidebarStyle !== 'native') {
      const sidebars = adapter.sidebarSurfaces?.() || [];
      for (const element of sidebars) add(element,'data-op-sidebar-surface');
      for (const element of adapter.sidebarActiveRows?.(sidebars) || []) add(element,'data-op-sidebar-active');
    }
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
      if (primarySurface && global.ResizeObserver) {
        surfaceObserver=new ResizeObserver(primaryResized);
        surfaceObserver.observe(primarySurface);
      }
    }
    if (nextObservedDock !== observedDock) {
      dockObserver?.disconnect(); dockObserver = null; observedDock = nextObservedDock;
      if (observedDock && global.ResizeObserver) {
        dockObserver = new ResizeObserver(dockResized);
        dockObserver.observe(observedDock);
      }
    }
    dockScrim = nextScrim; dockOverlaidHost = nextOverlaidDock; dockScroller = nextThreadScroller;
    alphaFadeScroller = nextAlphaFadeScroller; alphaFadeDock = nextAlphaFadeDock;
    const home = String(isHome);
    if (document.documentElement.getAttribute('data-op-home') !== home) document.documentElement.setAttribute('data-op-home',home);
    document.documentElement.setAttribute('data-op-visibility',document.hidden?'hidden':'visible');
  }
  function updateAmbientGeometry() {
    geometryFrame=null;
    if (lostOwnership() || !enabled || stopped || document.hidden) return;
    if (ambient && primarySurface?.isConnected) {
      const rect=primarySurface.getBoundingClientRect();
      const left=Math.max(0,Math.min(innerWidth,rect.left));
      const top=Math.max(0,Math.min(innerHeight,rect.top));
      const width=Math.max(0,Math.min(innerWidth,rect.right)-left);
      const height=Math.max(0,Math.min(innerHeight,rect.bottom)-top);
      for (const [key,value] of Object.entries({left,top,width,height})) {
        const pixels=Math.round(value)+'px';
        if (ambient.style[key]!==pixels) ambient.style[key]=pixels;
      }
    }
    syncDockClearance();
    syncScrollerFade();
    syncDockAvoidance();
  }
  function scheduleGeometry() {
    if (lostOwnership() || !enabled || stopped || document.hidden || (!ambient && !dock && !dockOverlaidHost && !alphaFadeDock) || geometryFrame) return;
    geometryFrame=requestAnimationFrame(updateAmbientGeometry);
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
   * hosts.css applies it only to the adapter's declared width limiters (no per-node marks).
   * `standard`, a disabled site and stop restore both variables, restoring the native width. */
  let readingWidth='';
  function syncReadingWidth() {
    const mainWidth=enabled && primarySurface?.isConnected ? primarySurface.getBoundingClientRect().width : 0;
    const target=mainWidth ? Adapters.contentWidthTarget(adapter.contentWidth?.native,cfg.contentWidth,mainWidth,global.innerWidth||0) : null;
    const next=target ? `${target.width}px ${target.shift}px` : '';
    if (next===readingWidth || !document.documentElement) return;
    readingWidth=next;
    if (target) {
      setRootVar('--op-reading-width',target.width+'px');
      setRootVar('--op-reading-shift',target.shift+'px');
    } else {
      clearRootVar('--op-reading-width');
      clearRootVar('--op-reading-shift');
    }
  }
  /* Review fix P2: dock clearance. A composer dock that overlays the conversation scroller (Gemini's
   * absolute input container) rather than following the thread in flow (ChatGPT's sticky footer) covers the
   * last reply's action row once the two-row Composer Surface makes it taller. The overlaid scroller carries a
   * reversible mark; hosts.css adds an empty ::after of --op-dock-clearance after the thread. The clearance is
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
  function syncDockClearance() {
    let clearance=0;
    if (enabled && dockScroller?.isConnected && dockOverlaidHost?.isConnected) {
      const box=dockScroller.getBoundingClientRect(), dockRect=dockOverlaidHost.getBoundingClientRect();
      if (typeof dockScroller.contains==='function' && dockScroller.contains(dockOverlaidHost)) {
        if (dockRect.height > 0) clearance=Math.max(0,Math.ceil(dockRect.height + DOCK_GAP));
      } else {
        const padding=parseFloat(getComputedStyle(dockScroller).paddingBottom)||0;
        // Only a dock docked over or floating near the scroller's bottom edge covers the end of the thread.
        if (dockRect.top < box.bottom && dockRect.bottom >= box.bottom - 48 && dockRect.bottom <= box.bottom + 48) {
          clearance=Math.max(0,Math.ceil(box.bottom - padding - dockRect.top + DOCK_GAP));
        }
      }
    }
    if (clearance) setRootVar('--op-dock-clearance',clearance+'px'); else clearRootVar('--op-dock-clearance');
  }
  function syncScrollerFade() {
    if (enabled && alphaFadeScroller?.isConnected && alphaFadeDock?.isConnected) {
      const sRect = alphaFadeScroller.getBoundingClientRect();
      const dRect = alphaFadeDock.getBoundingClientRect();
      if (dRect.top < sRect.bottom - 1) {
        const overlap = Math.max(0, Math.ceil(sRect.bottom - dRect.top));
        setRootVar('--op-scroller-fade-start', overlap + 'px');
        setRootVar('--op-scroller-fade-end', Math.max(0, overlap - 24) + 'px');
        return;
      }
    }
    clearRootVar('--op-scroller-fade-start');
    clearRootVar('--op-scroller-fade-end');
  }
  function syncDockAvoidance() {
    if (lostOwnership()) return;
    if (!enabled || stopped || !dock || !dock.isConnected) {
      clearRootVar('--op-dock-offset-x');
      clearRootVar('--op-dock-offset-y');
      return;
    }
    const vw = document.documentElement?.clientWidth || global.innerWidth || 0;
    const vh = document.documentElement?.clientHeight || global.innerHeight || 0;
    if (!(vw > 0) || !(vh > 0)) return;
    const dockBox = dock.getBoundingClientRect();
    if (!(dockBox.width > 0) || !(dockBox.height > 0)) return;
    const { right: baseRight, bottom: baseBottom } = Adapters.dockEdgeMargin(vw);
    const composer = adapter.composerSurface?.() || null;
    const composerCard = adapter.composerCardSurface?.(composer) || composer;
    const composerVisible = composerCard && (typeof Adapters.isVisible !== 'function' || Adapters.isVisible(composerCard));
    const composerRect = composerVisible ? composerCard.getBoundingClientRect() : null;
    const railRect = rail && rail.isConnected ? rail.getBoundingClientRect() : null;
    const cornerObstacles = adapter.cornerFloatingObstacles?.(composer) || [];
    const { offsetX, offsetY } = Adapters.computeDockAvoidance({
      viewport: { width: vw, height: vh },
      dockSize: { width: dockBox.width, height: dockBox.height },
      baseRight,
      baseBottom,
      composerRect,
      railRect,
      cornerObstacles,
      gap: 10
    });
    if (offsetX > 0) setRootVar('--op-dock-offset-x', offsetX + 'px'); else clearRootVar('--op-dock-offset-x');
    if (offsetY > 0) setRootVar('--op-dock-offset-y', offsetY + 'px'); else clearRootVar('--op-dock-offset-y');
    const popover = dock.querySelector('.op-vial-popover');
    if (popover && !popover.hidden) syncDockPopoverPosition();
  }
  function primaryResized() {
    if (lostOwnership() || !enabled || stopped) return;
    syncReadingWidth(); syncDockClearance(); syncScrollerFade(); syncDockAvoidance(); scheduleGeometry();
  }
  function dockResized() {
    if (lostOwnership() || !enabled || stopped) return;
    syncDockClearance(); syncScrollerFade(); syncDockAvoidance();
  }
  function syncAmbient() {
    if (lostOwnership()) return;
    pruneOrphanRoots();
    const needed=(cfg.ambientIntensity>0 && (cfg.ambientStyle!=='none' || cfg.ambientTexture!=='off')) || cfg.semanticAura;
    if (!needed || !primarySurface) {ambient?.remove();ambient=null;return;}
    if (!ambient) {
      ambient=own(make('div','op-ambient'));ambient.id='op-ambient-stage';ambient.setAttribute('aria-hidden','true');
      const wash=make('div','op-ambient-wash');
      for (const layer of ['one','two','three']) wash.append(make('i','op-aurora op-aurora-'+layer));
      const glyphs=make('div','op-ambient-glyphs');
      // Fixed decorative characters: never derived from prompts, replies, or keys.
      const alphabet='01:<>[]{}+*PRISM';
      glyphs.textContent=Array.from({length:44},(_,row)=>Array.from({length:126},(_,column)=>alphabet[(row*11+column*7+row*column*3)%alphabet.length]).join('')).join('\n');
      ambient.append(wash,make('div','op-ambient-grid'),glyphs,make('div','op-ambient-rim'));
    }
    if (ambient.parentElement!==primarySurface) primarySurface.append(ambient);
    updateAmbientGeometry();
  }
  function resetConversation() {
    activeTurn=-1; railSignature=''; lastEstimate=0; lastModelLabel=''; lastAttachments=0;
    for(const [element,entry] of thoughts) cleanupThought(element,entry);
    for(const [pre,entry] of codes) cleanupCode(pre,entry);
    clearActivity();
    closeRail(); setDockOpen(false);
    if (isOwner()) { clearRootVar('--op-dock-offset-x'); clearRootVar('--op-dock-offset-y'); }
  }
  function scan() {
    if(lostOwnership() || !enabled || stopped || document.hidden || !document.body) return;
    passes++;
    if(route!==location.href) {route=location.href;revision++;resetConversation();}
    syncSurfaces(); syncReadingWidth(); syncDockClearance(); syncScrollerFade(); syncAmbient(); syncCodes(); syncRail(); syncDock(); syncThoughts(); syncDockAvoidance();
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
      if(observedBody) {
        observer.observe(observedBody,{childList:true,subtree:true,characterData:true,characterDataOldValue:true,attributes:true,attributeFilter:['hidden','open','class','aria-hidden','aria-expanded','aria-current','aria-selected','data-active','data-is-streaming']});
        documentObserver.observe(observedBody,{attributes:true,attributeFilter:['class','data-theme']});
      }
    }
    documentObserver=new MutationObserver(records=>{
      if(lostOwnership()) return;
      if(document.body!==observedBody) {observeBody();lastEstimate=0;railSignature='';schedule();}
      if(records.some(record=>record.type==='attributes' && record.attributeName!=='data-op-instance') && Schema.resolvePalette(cfg)==='host') {
        Schema.applyConfigToRoot(cfg);schedule();
      }
    });
    observeBody();
    listen(document,'keydown',event=>{ if (!lostOwnership() && enabled) onKey(event); });
    listen(document,'click',event=>{
      if(lostOwnership() || !enabled) return;
      if(rail&&!rail.contains(event.target)) closeRail();
      if(dock&&!dock.contains(event.target)) setDockOpen(false);
    });
    listen(document,'scroll',()=>{
      if(lostOwnership()) return;
      scheduleGeometry();
      if(scrollFrame||document.hidden) return;
      scrollFrame=requestAnimationFrame(()=>{scrollFrame=null;if(lostOwnership()) return;activeTurn=nearestTurn();updateRailActive();});
    },{capture:true,passive:true});
    listen(window,'resize',()=>{if(lostOwnership()) return;scheduleGeometry();schedule();});
    listen(window,'popstate',schedule);listen(window,'hashchange',schedule);
    listen(document,'visibilitychange',()=>{
      if(lostOwnership()) return;
      document.documentElement.setAttribute('data-op-visibility',document.hidden?'hidden':'visible');
      if(document.hidden) {clearActivity();clearTimeout(pending);pending=null;if(geometryFrame)cancelAnimationFrame(geometryFrame);geometryFrame=null;}
      else {lastEstimate=0;schedule();}
    });
    scan();
  }
  function configure(next) {
    if(lostOwnership() || stopped) return;
    revision++;
    const previous=cfg;cfg=Schema.sanitizeConfig(next);
    if(previous.thoughtView!==cfg.thoughtView) for(const [element,entry] of thoughts){entry.view=cfg.thoughtView;applyThoughtView(element,entry);}
    if(previous.thoughtEndpoint!==cfg.thoughtEndpoint||previous.thoughtModel!==cfg.thoughtModel) for(const [element,entry] of thoughts) cleanupThought(element,entry);
    if(!activeForSite()) {suspend();Schema.applyConfigToRoot(cfg);return;}
    Schema.applyConfigToRoot(cfg);
    if(!motionAllowed()||!cfg.streamChoreography) clearHighlights();
    if(!motionAllowed()||!cfg.semanticAura) document.documentElement.removeAttribute('data-op-aura');
    railSignature='';lastEstimate=0;
    if(!enabled) activate();else scan();
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
  Schema.loadConfig().then(loaded=>{if(lostOwnership()||stopped)return;if(changes===initialChanges){hasConfig=true;configure(loaded);}}).catch(()=>{
    if(lostOwnership()||stopped)return;
    suspend();Schema.applyConfigToRoot({...cfg,enabled:false});
  });
  global.ObsidianPrismRuntime=Object.freeze({
    refresh:schedule,
    diagnostics:()=>({passes,enabled,observing:Boolean(observer),pending:Boolean(pending),codeBlocks:codes.size,thoughtBlocks:thoughts.size,surfaces:surfaceMarks.size}),
    stop(){
      if(lostOwnership()) return;
      revision++;suspend();disconnectRuntime({permanent:true});
      Schema.applyConfigToRoot({...cfg,enabled:false});
    }
  });
})(globalThis);
