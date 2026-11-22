/* Obsidian Prism Web — site adapters. Copyright (c) 2026 bahayonghang.
 * Modified 2026-11-21. GPL-3.0-only. See NOTICE and MODIFICATIONS.md. */
(function (global) {
  'use strict';

  const HOSTS = Object.freeze({
    chatgpt: {
      users: '[data-message-author-role="user"]',
      assistants: '[data-message-author-role="assistant"]',
      conversation: 'main',
      primary: ['main', '[role="main"]', '[data-testid="conversation-pane"]', '[data-testid="chat-main"]', '#main-content'],
      editors: ['#prompt-textarea', '[data-testid="prompt-textarea"]', 'textarea[name="prompt-textarea"]', 'main [contenteditable="true"][role="textbox"]', 'main textarea'],
      composers: ['#composer-background', '[data-testid="chat-composer"]', '[data-testid="composer"]', '[data-composer-surface]', '.composer-parent'],
      sidebars: ['#stage-slideover-sidebar', '#stage-sidebar', '#app-rail', '[data-testid="app-rail"]', '[data-testid="app-sidebar"]', '[data-testid="history-sidebar"]', '[data-testid="sidebar"]', '[data-testid="sidebar-container"]', '[data-testid="stage-thread-flyout"]', '[data-testid="conversation-history"]', '[data-testid="chat-history"]'],
      sidebarLinks: 'a[href^="/c/"],a[href^="/g/"],a[href^="/project/"]',
      thoughts: '[data-testid="reasoning-content"], [data-testid="thoughts-content"], [data-testid="thinking-content"]',
      streaming: '[data-testid="stop-button"], [data-is-streaming="true"]'
    },
    gemini: {
      users: 'user-query, [data-test-id="user-query"], .user-query-container',
      assistants: 'model-response, [data-test-id="model-response"], .model-response-text',
      conversation: 'chat-window, main, [role="main"]',
      primary: ['chat-window', 'main', '[role="main"]', '.chat-app'],
      editors: ['input-area-v2 .ql-editor[contenteditable="true"]', 'rich-textarea .ql-editor', 'input-area-v2 [contenteditable="true"]', 'rich-textarea [contenteditable="true"]', 'textarea[aria-label]', 'main [contenteditable="true"][role="textbox"]'],
      composers: ['input-area-v2 .text-input-field', 'input-area-v2 .input-area-container', '.input-area-container', '[data-test-id="input-area"]', 'input-area-v2', 'input-area'],
      sidebars: ['bard-sidenav', 'side-navigation-v2', 'side-navigation', 'mat-sidenav', '[data-test-id="side-nav"]', '[data-test-id="side-navigation"]', '[data-testid="sidebar"]'],
      sidebarLinks: 'a[href^="/app/"]',
      thoughts: 'model-thoughts .thoughts-content, model-thoughts .thought-content, model-thoughts .markdown, [data-test-id="thoughts-content"], [data-test-id="thinking-content"]',
      streaming: '[data-test-id="stop-button"], [data-test-id="stop-response-button"], .stop-button'
    }
  });

  function elementOf(node) {
    return node && (node.nodeType === 1 ? node : node.parentElement);
  }
  function isOwned(node) {
    return Boolean(elementOf(node)?.closest('[data-op-owned]'));
  }
  function isVisible(node) {
    if (!node || !node.isConnected || node.closest('[hidden], [aria-hidden="true"]')) return false;
    const view = node.ownerDocument?.defaultView;
    if (!view?.getComputedStyle) return true;
    for (let current = node; current; current = current.parentElement) {
      if (current !== node && current.tagName === 'DETAILS' && !current.open) {
        const summary = [...current.children].find(child => child.tagName === 'SUMMARY');
        if (!summary?.contains(node)) return false;
      }
      const style = view.getComputedStyle(current);
      if (style.display === 'none' || ['hidden','collapse'].includes(style.visibility) || style.contentVisibility === 'hidden' || style.opacity === '0') return false;
    }
    return true;
  }
  function topLevelMatches(selectors, root = document) {
    const nodes = [...root.querySelectorAll(selectors)].filter(node => !isOwned(node));
    const all = new Set(nodes);
    return nodes.filter(node => {
      for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (all.has(ancestor)) return false;
      }
      return true;
    });
  }
  // A detached copy excludes our sibling controls without mutating framework-owned text.
  function textOf(element) {
    if (!element) return '';
    if (!element.querySelector('[data-op-owned],script,style,[hidden],[aria-hidden="true"]')) {
      return element.textContent || '';
    }
    const copy = element.cloneNode(true);
    copy.querySelectorAll('[data-op-owned],script,style,[hidden],[aria-hidden="true"]').forEach(node => node.remove());
    return copy.textContent || '';
  }
  function visibleText(element) {
    if (!isVisible(element)) return '';
    // innerText follows rendered visibility, including collapsed native details.
    return typeof element.innerText === 'string' ? element.innerText.trim() : textOf(element).trim();
  }
  function estimateTokens(text) {
    let cjk = 0;
    let other = 0;
    for (const character of String(text || '')) {
      if (/[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff]/u.test(character)) cjk++;
      else other++;
    }
    return Math.ceil(cjk * 1.45 + other / 3.8);
  }
  function scrollContainer(element) {
    for (let parent = element?.parentElement; parent; parent = parent.parentElement) {
      const style = parent.ownerDocument.defaultView.getComputedStyle(parent);
      if (/(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight + 1) return parent;
    }
    return element?.ownerDocument.scrollingElement || document.scrollingElement;
  }
  const MESSAGE_AREAS = '[data-message-author-role],user-query,model-response,[data-test-id="model-response"],.model-response-text';
  function firstVisible(selectors, root, predicate = () => true) {
    for (const selector of selectors) {
      const found = [...root.querySelectorAll(selector)].find(node => !isOwned(node) && isVisible(node) && predicate(node));
      if (found) return found;
    }
    return null;
  }
  function findPrimary(spec, root) {
    // Never return body: an unrecognized layout should not get a full-page effect.
    return firstVisible(spec.primary, root, node => !node.closest('dialog,[role="dialog"],[aria-modal="true"]'));
  }
  function findComposer(spec, root) {
    const editor = firstVisible(spec.editors, root, node => !node.closest(MESSAGE_AREAS) && !node.closest('dialog,[role="dialog"],[aria-modal="true"]'));
    if (!editor) return null;
    const safeShell = node => node !== editor && node.contains(editor) && !node.matches('main,[role="main"],body,html,textarea,[contenteditable="true"]');
    // Prefer a known visual shell, not the entire thread-bottom docking region.
    const known = firstVisible(spec.composers, root, node => safeShell(node) &&
      (node.querySelector('button,[role="button"],input[type="file"]') || node.matches('#composer-background,input-area-v2')));
    if (known) return known;
    let fallback = null;
    for (let node = editor.parentElement, depth = 0; node && depth < 8; node = node.parentElement, depth++) {
      if (node.matches('main,[role="main"],body,html')) break;
      if (!safeShell(node)) continue;
      const controls = node.querySelector('button,[role="button"],input[type="file"]');
      if (!controls) continue;
      if (!fallback && node.matches('form,[role="group"]')) fallback = node;
      const view = node.ownerDocument?.defaultView;
      const style = view?.getComputedStyle?.(node);
      const painted = style && ((style.backgroundColor && !['transparent','rgba(0, 0, 0, 0)'].includes(style.backgroundColor)) ||
        parseFloat(style.borderTopWidth || '0') > 0 || (style.boxShadow && style.boxShadow !== 'none'));
      const rounded = style && parseFloat(style.borderTopLeftRadius || '0') >= 6;
      if (painted || rounded) return node;
    }
    // A genuine form with controls is safer than styling an arbitrary ancestor.
    return fallback;
  }
  function findSidebars(spec, root) {
    const result = [];
    const add = node => {
      if (!node || isOwned(node) || !isVisible(node) || node.closest(MESSAGE_AREAS)) return;
      if (!result.includes(node)) result.push(node);
    };
    for (const selector of spec.sidebars) root.querySelectorAll(selector).forEach(add);
    // New ChatGPT shells sometimes expose only semantic nav/aside elements.
    // Constrain the fallback to a tall left-edge navigation surface with controls.
    const doc = root.ownerDocument || root;
    const view = doc.defaultView || global;
    const viewportWidth = view.innerWidth || doc.documentElement?.clientWidth || 0;
    const viewportHeight = view.innerHeight || doc.documentElement?.clientHeight || 0;
    if (viewportWidth > 0 && viewportHeight > 0) {
      const isSideNavigation = node => {
        if (node.closest('main,[role="main"],dialog,[role="dialog"],[aria-modal="true"]') || isOwned(node) || !isVisible(node)) return false;
        if (!node.querySelector('a[href],button,[role="button"]')) return false;
        const rect = node.getBoundingClientRect();
        const tall = rect.height >= Math.min(280, viewportHeight * .45);
        const leftAligned = rect.left >= -8 && rect.left <= Math.min(160, viewportWidth * .16);
        const narrow = rect.width >= 28 && rect.width <= Math.min(560, viewportWidth * .55) && rect.right <= viewportWidth * .66;
        return tall && leftAligned && narrow;
      };
      for (const node of root.querySelectorAll('aside,nav,[role="navigation"],[aria-label="Main navigation"],[aria-label="Chat history"],[aria-label="主导航"],[aria-label="聊天记录"]')) {
        if (isSideNavigation(node)) add(node);
      }
      const visited = new Set();
      // Conversation links offer a semantic fallback when a release replaces nav
      // with generic divs. Inspect only a bounded sample, never the whole DOM.
      for (const link of [...root.querySelectorAll(spec.sidebarLinks)].slice(0, 24)) {
        if (link.closest('main,[role="main"]') || isOwned(link)) continue;
        for (let node = link.parentElement, depth = 0; node && depth < 8; node = node.parentElement, depth++) {
          if (visited.has(node)) break;
          visited.add(node);
          if (node.matches('body,html')) break;
          if (isSideNavigation(node)) add(node);
        }
      }
    }
    // A single outer surface per sidebar prevents nested, doubled glass frames.
    return result.filter(node => !result.some(parent => parent !== node && parent.contains(node)));
  }
  function forHost(host, root = document) {
    const spec = HOSTS[host];
    if (!spec) return null;
    const collect = selectors => topLevelMatches(selectors, root).filter(isVisible);
    const messages = () => [...collect(spec.users), ...collect(spec.assistants)];
    return Object.freeze({
      host,
      userTurns: () => collect(spec.users),
      assistantTurns: () => collect(spec.assistants),
      conversationRoot: () => root.querySelector(spec.conversation) || root.body || root,
      primarySurface: () => findPrimary(spec, root),
      composerSurface: () => findComposer(spec, root),
      sidebarSurfaces: () => findSidebars(spec, root),
      codeBlocks: () => [...new Set(messages().flatMap(message => [...message.querySelectorAll('pre')]))],
      thoughtBlocks: () => collect(spec.thoughts),
      isAssistantNode(node) {
        const element = elementOf(node);
        return Boolean(element && !isOwned(element) && !element.closest('[contenteditable="true"], input, textarea, script, style') && element.closest(spec.assistants));
      },
      isStreaming: () => collect(spec.streaming).length > 0,
      scrollContainer
    });
  }
  global.ObsidianPrismAdapters = Object.freeze({
    forHost, topLevelMatches, estimateTokens, textOf, visibleText, isOwned, isVisible, scrollContainer
  });
})(globalThis);
