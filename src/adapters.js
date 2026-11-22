/* Obsidian Prism Web — site adapters. Copyright (c) 2026 bahayonghang.
 * Modified 2026-11-21. GPL-3.0-only. See NOTICE and MODIFICATIONS.md. */
(function (global) {
  'use strict';

  const HOSTS = Object.freeze({
    chatgpt: {
      users: '[data-message-author-role="user"]',
      assistants: '[data-message-author-role="assistant"]',
      conversation: 'main',
      thoughts: '[data-testid="reasoning-content"], [data-testid="thoughts-content"], [data-testid="thinking-content"]',
      streaming: '[data-testid="stop-button"], [data-is-streaming="true"]'
    },
    gemini: {
      users: 'user-query, [data-test-id="user-query"], .user-query-container',
      assistants: 'model-response, [data-test-id="model-response"], .model-response-text',
      conversation: 'chat-window, main, [role="main"]',
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
