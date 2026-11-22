/* Obsidian Prism Web — site adapters. Copyright (c) 2026 bahayonghang.
 * Modified 2026-11-22. GPL-3.0-only. See NOTICE and MODIFICATIONS.md. */
(function (global) {
  'use strict';

  const HOSTS = Object.freeze({
    chatgpt: {
      users: '[data-message-author-role="user"], article[data-turn="user"], [data-testid="user-message"]',
      assistants: '[data-message-author-role="assistant"], article[data-turn="assistant"], [data-testid="assistant-message"], .agent-turn',
      turnContainers: 'article[data-testid^="conversation-turn-"]',
      conversation: 'main',
      primary: ['main', '[role="main"]', '[data-testid="conversation-pane"]', '[data-testid="chat-main"]', '#main-content'],
      editors: ['#prompt-textarea', '[data-testid="prompt-textarea"]', 'textarea[name="prompt-textarea"]', 'main [contenteditable="true"][role="textbox"]', 'main textarea'],
      composers: ['#composer-background', '[data-testid="chat-composer"]', '[data-testid="composer"]', '[data-composer-surface]', '.composer-parent'],
      composerBackdrops: '#thread-bottom,[data-testid="composer-footer"],[data-testid="composer-container"],.thread-bottom-container,.composer-parent',
      codeSurfaces: '[data-testid="code-block"], .code-block-wrapper',
      codeHeaders: '.code-header, [data-testid="code-block-header"]',
      modelTriggers: '[data-testid="model-switcher-dropdown-button"], [data-testid="composer-model-switcher"], button[aria-label*="model" i], button[aria-label*="模型"]',
      modelLabels: '[data-testid="model-switcher-dropdown-button"], [data-testid="composer-model-switcher"], .model-label',
      addTriggers: '[data-testid="composer-plus-btn"], button[aria-label*="Add files" i], button[aria-label*="Attach" i], button[aria-label*="上传"], button[aria-label*="添加"]',
      composerChips: '[data-testid="composer-mode-pill"], [data-testid="composer-chip"], [data-testid="composer-tool-chip"]',
      attachments: '[data-testid="attachment-card"], [data-testid="file-attachment"], [data-testid="uploaded-file"], [data-testid="image-attachment"], .native-footer-attachment',
      threadColumns: '.thread, [data-testid="conversation-thread"], [class*="thread-content"]',
      composerColumns: '.composer-container, [data-testid="composer-container"]',
      tailSpacers: '[data-testid="conversation-turn-spacer"], .thread-bottom-spacer',
      sidebars: ['#stage-slideover-sidebar', '#stage-sidebar', '#app-rail', '[data-testid="app-rail"]', '[data-testid="app-sidebar"]', '[data-testid="history-sidebar"]', '[data-testid="sidebar"]', '[data-testid="sidebar-container"]', '[data-testid="stage-thread-flyout"]', '[data-testid="conversation-history"]', '[data-testid="chat-history"]'],
      sidebarLinks: 'a[href^="/c/"],a[href^="/g/"],a[href^="/project/"]',
      thoughts: '[data-testid="reasoning-content"], [data-testid="thoughts-content"], [data-testid="thinking-content"]',
      streaming: '[data-testid="stop-button"], [data-is-streaming="true"]'
    },
    gemini: {
      users: 'user-query, [data-test-id="user-query"], .user-query-container',
      assistants: 'model-response, [data-test-id="model-response"], .model-response-text',
      turnContainers: '',
      conversation: 'chat-window, main, [role="main"]',
      primary: ['chat-window', 'main', '[role="main"]', '.chat-app'],
      editors: ['input-area-v2 .ql-editor[contenteditable="true"]', 'rich-textarea .ql-editor', 'input-area-v2 [contenteditable="true"]', 'rich-textarea [contenteditable="true"]', 'textarea[aria-label]', 'main [contenteditable="true"][role="textbox"]'],
      composers: ['input-area-v2 .text-input-field', 'input-area-v2 .input-area-container', '.input-area-container', '[data-test-id="input-area"]', 'input-area-v2', 'input-area'],
      composerBackdrops: 'input-area-v2,input-area,.input-area-container,[data-test-id="input-area"],[data-test-id="input-area-container"],.input-area-wrapper',
      codeSurfaces: 'code-block, .code-block',
      codeHeaders: '.code-block-decoration, [data-test-id="code-block-header"]',
      modelTriggers: 'bard-mode-switcher button, [data-test-id="bard-mode-menu-button"], .input-area-switch',
      modelLabels: 'bard-mode-switcher button, [data-test-id="bard-mode-menu-button"], .input-area-switch, .model-label',
      addTriggers: '[data-test-id="upload-file-button"], button[aria-label*="Add files" i], button[aria-label*="Upload" i], button[aria-label*="上传"], button[aria-label*="添加"]',
      composerChips: '.toolbox-drawer-item-button, [data-test-id="composer-chip"]',
      attachments: '[data-test-id="file-preview-chip"], [data-test-id="attachment-card"], file-preview-chip, .native-footer-attachment',
      threadColumns: '.thread, .conversation-container, .response-container',
      composerColumns: '.composer-container, input-area-v2',
      tailSpacers: '',
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
  const MESSAGE_AREAS = '[data-message-author-role],[data-turn="user"],[data-turn="assistant"],article[data-testid^="conversation-turn-"],[data-testid="user-message"],[data-testid="assistant-message"],.agent-turn,user-query,model-response,[data-test-id="model-response"],.model-response-text';
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
  function findComposerBackdrops(spec, composer) {
    if (!composer || isOwned(composer)) return [];
    const view = composer.ownerDocument?.defaultView;
    if (!view?.getComputedStyle) return [];
    const composerRect = composer.getBoundingClientRect();
    if (composerRect.width <= 0 || composerRect.height <= 0) return [];
    const viewportHeight = view.innerHeight || composer.ownerDocument.documentElement.clientHeight;
    const path = [];
    let boundary = -1;
    // Recognize only the small docking region around a known native editor.
    // Structure and positioning remain stable after its paint is overridden.
    for (let node = composer.parentElement, depth = 0; node && depth < 8; node = node.parentElement, depth++) {
      if (node.matches('main,[role="main"],body,html,chat-window,dialog,[role="dialog"],[aria-modal="true"],aside,nav,[role="navigation"]') ||
          node.querySelector(MESSAGE_AREAS)) break;
      if (isOwned(node)) break;
      path.push(node);
      const rect = node.getBoundingClientRect();
      const style = view.getComputedStyle(node);
      const smallRegion = rect.height > 0 && rect.height <= Math.max(composerRect.height + 160, viewportHeight * .5) &&
        rect.width >= composerRect.width - 24 && rect.right > composerRect.left && rect.left < composerRect.right &&
        rect.bottom >= composerRect.top - 80 && rect.top <= composerRect.bottom + 80;
      const bottomDock = ['sticky','fixed','absolute'].includes(style.position) &&
        rect.bottom >= Math.min(viewportHeight - 96, composerRect.bottom - 4);
      if (smallRegion && (node.matches(spec.composerBackdrops) || bottomDock)) boundary = path.length - 1;
    }
    if (boundary < 0) return [];
    const surfaces = path.slice(0, boundary + 1);
    // Native fade siblings may sit above the shell. Only empty, noninteractive,
    // full-width absolute decorations qualify; buttons and attachments do not.
    for (const surface of [...surfaces]) {
      const bounds = surface.getBoundingClientRect();
      for (const child of surface.children) {
        if (child.contains(composer) || isOwned(child) || !child.matches('div,span') ||
            child.matches('[role="button"],[role="link"],[tabindex],[contenteditable]') || child.textContent.trim() ||
            child.querySelector('a[href],button,input,textarea,select,img,picture,svg,video,audio,canvas,iframe,[contenteditable],[tabindex],[role="button"],[role="link"]')) continue;
        const style = view.getComputedStyle(child);
        if (!['absolute','fixed'].includes(style.position) ||
            (style.pointerEvents !== 'none' && child.getAttribute('aria-hidden') !== 'true')) continue;
        const rect = child.getBoundingClientRect();
        if (rect.width >= bounds.width * .8 && rect.height > 0 && rect.height <= bounds.height + 80 &&
            rect.right > bounds.left && rect.left < bounds.right && rect.bottom >= bounds.top - 80 && rect.top <= bounds.bottom + 1) {
          surfaces.push(child);
        }
      }
    }
    return [...new Set(surfaces)];
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
  const ACTIVE_NAV_STATE = '[aria-current="page"],[aria-current="true"],[data-active="true"],[aria-selected="true"]';
  const NAV_ROW = 'a[href],button,[role="link"],[role="button"],[role="option"]';
  function findSidebarActiveRows(sidebars) {
    const rows = new Set();
    for (const sidebar of sidebars) {
      const isRow = node => {
        if (!node || node === sidebar || !sidebar.contains(node) || isOwned(node) || !isVisible(node)) return false;
        const rect = node.getBoundingClientRect();
        // A project/tree group can contain active rows without being one itself.
        return rect.height > 0 && rect.height <= 96 &&
          node.querySelectorAll('a[href],[role="link"]').length <= 1;
      };
      for (const state of sidebar.querySelectorAll(ACTIVE_NAV_STATE)) {
        if (isOwned(state) || !isVisible(state)) continue;
        let row = state.closest(NAV_ROW);
        if (!isRow(row)) {
          const links = [...state.querySelectorAll('a[href],[role="link"]')].filter(isRow);
          // A noninteractive wrapper may carry the state for its single link.
          // Never transfer a group's state to all of its conversations.
          row = links.length === 1 && state.getBoundingClientRect().height <= 96 ? links[0] : null;
        }
        if (row) {
          // A nested title/action can carry the only active flag. Its enclosing
          // navigation row still owns the highlight, even without its own flag.
          for (let parent = row.parentElement; parent && parent !== sidebar; parent = parent.parentElement) {
            if (!parent.matches(NAV_ROW)) continue;
            if (!isRow(parent)) break;
            row = parent;
          }
          rows.add(row);
        }
      }
    }
    const result = [...rows];
    return result.filter(node => !result.some(parent => parent !== node && parent.contains(node)));
  }
  function findTurns(spec, role, root) {
    const selector = role === 'user' ? spec.users : spec.assistants;
    const explicit = topLevelMatches(selector, root).filter(isVisible);
    if (!spec.turnContainers) return explicit;
    const result = [...explicit];
    const seen = new Set(explicit);
    const containers = topLevelMatches(spec.turnContainers, root).filter(isVisible);
    for (const container of containers) {
      if (seen.has(container) || result.some(node => node.contains(container) || container.contains(node))) continue;
      if (container.querySelector(spec.users) || container.querySelector(spec.assistants)) continue;
      const heading = container.querySelector('.sr-only');
      const srText = heading ? textOf(heading).trim().toLowerCase() : '';
      const turnAttr = container.getAttribute('data-turn');
      const isUser = turnAttr === 'user' || Boolean(container.querySelector('.user-message-bubble-color')) || srText.startsWith('you said');
      const isAssistant = turnAttr === 'assistant' || Boolean(container.querySelector('.agent-turn')) || srText.startsWith('chatgpt said');
      if (role === 'user' && isUser && !isAssistant) {
        seen.add(container);
        result.push(container);
      } else if (role === 'assistant' && isAssistant && !isUser) {
        seen.add(container);
        result.push(container);
      }
    }
    return result;
  }
  function normalizeModelText(raw) {
    return String(raw || '').replace(/[⌄▾▼›❯]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function findModelTrigger(spec, root) {
    if (!spec.modelTriggers) return null;
    for (const selector of spec.modelTriggers.split(',').map(s => s.trim()).filter(Boolean)) {
      const found = [...root.querySelectorAll(selector)].find(node =>
        !isOwned(node) && isVisible(node) && !node.closest('dialog,[role="dialog"],[aria-modal="true"]') && !node.closest(MESSAGE_AREAS)
      );
      if (found) return found;
    }
    return null;
  }
  function findActiveModelLabel(spec, root) {
    const trigger = findModelTrigger(spec, root);
    if (trigger) {
      const label = normalizeModelText(textOf(trigger) || trigger.getAttribute('aria-label') || '');
      if (label) return label;
    }
    if (!spec.modelLabels) return '';
    for (const selector of spec.modelLabels.split(',').map(s => s.trim()).filter(Boolean)) {
      const found = [...root.querySelectorAll(selector)].find(node =>
        !isOwned(node) && isVisible(node) && !node.closest('dialog,[role="dialog"],[aria-modal="true"]') && !node.closest(MESSAGE_AREAS)
      );
      if (found) {
        const label = normalizeModelText(textOf(found) || found.getAttribute('aria-label') || '');
        if (label) return label;
      }
    }
    return '';
  }
  function findCodeSurfaces(spec, messages, root) {
    const surfaces = [];
    const seen = new Set();
    const add = node => {
      if (!node || isOwned(node) || !isVisible(node) || seen.has(node)) return;
      if (node.matches(MESSAGE_AREAS) || node.matches('.markdown')) return;
      seen.add(node);
      surfaces.push(node);
    };
    const scope = messages.length ? messages : [root];
    for (const container of scope) {
      if (spec.codeSurfaces) {
        for (const node of container.querySelectorAll(spec.codeSurfaces)) add(node);
      }
      for (const pre of container.querySelectorAll('pre')) {
        if (isOwned(pre) || !isVisible(pre)) continue;
        if (surfaces.some(surface => surface.contains(pre))) continue;
        const parent = pre.parentElement;
        if (parent && !isOwned(parent) && !parent.matches(MESSAGE_AREAS) && !parent.matches('.markdown') &&
            spec.codeHeaders && parent.querySelector(spec.codeHeaders) && parent.querySelectorAll('pre').length === 1) {
          add(parent);
        } else {
          add(pre);
        }
      }
    }
    return surfaces.filter(node => !surfaces.some(other => other !== node && other.contains(node)));
  }
  function findCodeHeaders(spec, messages) {
    if (!spec.codeHeaders) return [];
    const out = [];
    for (const message of messages) {
      for (const hdr of message.querySelectorAll(spec.codeHeaders)) {
        if (!isOwned(hdr) && isVisible(hdr) && !out.includes(hdr)) out.push(hdr);
      }
    }
    return out;
  }
  function findVisibleAttachments(spec, messages, composer, root) {
    if (!spec.attachments) return [];
    const candidates = new Set();
    for (const scope of [...messages, composer?.parentElement || composer, root]) {
      if (!scope?.querySelectorAll) continue;
      for (const node of scope.querySelectorAll(spec.attachments)) {
        if (isOwned(node) || !isVisible(node) || node.closest('dialog,[role="dialog"],[aria-modal="true"]')) continue;
        const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
        if (rect && rect.width > 0 && rect.height > 0 && rect.width <= 36 && rect.height <= 36) continue;
        candidates.add(node);
      }
    }
    const list = [...candidates];
    return list.filter(node => !list.some(other => other !== node && other.contains(node)));
  }
  function findComposerAddTrigger(spec, composer) {
    if (!composer || !spec.addTriggers) return null;
    const scope = composer.parentElement || composer;
    for (const selector of spec.addTriggers.split(',').map(s => s.trim()).filter(Boolean)) {
      const found = [...scope.querySelectorAll(selector)].find(node =>
        !isOwned(node) && isVisible(node) && composer.contains(node) && !node.classList.contains('send-button')
      );
      if (found) return found;
    }
    return null;
  }
  function findComposerChips(spec, composer, addTrigger, modelTrigger) {
    if (!composer || !spec.composerChips) return [];
    const chips = [];
    const scopes = [composer, composer.parentElement].filter(Boolean);
    for (const scope of scopes) {
      for (const node of scope.querySelectorAll(spec.composerChips)) {
        if (isOwned(node) || !isVisible(node) || node === addTrigger || node === modelTrigger) continue;
        if (node.contains(addTrigger) || node.contains(modelTrigger) || node.classList?.contains('send-button')) continue;
        if (!chips.includes(node)) chips.push(node);
      }
    }
    return chips.filter(node => !chips.some(other => other !== node && other.contains(node)));
  }
  function findComposerScrim(spec, composer) {
    const backdrops = findComposerBackdrops(spec, composer);
    if (!backdrops.length) return null;
    // Outermost structural ancestor in the bounded dock chain (ignore empty fade siblings).
    const ancestors = [];
    for (let node = composer.parentElement; node; node = node.parentElement) {
      if (backdrops.includes(node)) ancestors.push(node);
    }
    return ancestors.length ? ancestors[ancestors.length - 1] : null;
  }
  function findThreadTailSpacers(spec, primary, messages) {
    if (!primary || !spec.tailSpacers || !messages.length) return [];
    const lastMessage = messages[messages.length - 1];
    const spacers = [];
    for (const node of primary.querySelectorAll(spec.tailSpacers)) {
      if (isOwned(node) || node.closest(MESSAGE_AREAS)) continue;
      if (textOf(node).trim() || node.querySelector('button,a[href],[role="button"],input,textarea')) continue;
      if (lastMessage.contains(node)) continue;
      spacers.push(node);
    }
    return spacers;
  }
  function findColumnSurfaces(selector, primary, anchor) {
    if (!selector || !primary) return [];
    const out = [];
    for (const node of primary.querySelectorAll(selector)) {
      if (!isOwned(node) && isVisible(node) && primary.contains(node) && (!anchor || node.contains(anchor) || anchor.contains(node))) {
        if (!out.includes(node)) out.push(node);
      }
    }
    if (!out.length && anchor) {
      for (let node = anchor.parentElement; node && node !== primary; node = node.parentElement) {
        if (!isOwned(node) && node.matches && node.matches(selector)) { out.push(node); break; }
      }
    }
    return out;
  }
  function forHost(host, root = document) {
    const spec = HOSTS[host];
    if (!spec) return null;
    const collect = selectors => topLevelMatches(selectors, root).filter(isVisible);
    const userTurns = () => findTurns(spec, 'user', root);
    const assistantTurns = () => findTurns(spec, 'assistant', root);
    const messages = () => [...userTurns(), ...assistantTurns()];
    return Object.freeze({
      host,
      userTurns,
      assistantTurns,
      conversationRoot: () => root.querySelector(spec.conversation) || root.body || root,
      primarySurface: () => findPrimary(spec, root),
      composerSurface: () => findComposer(spec, root),
      composerBackdropSurfaces: (composer) => findComposerBackdrops(spec, composer === undefined ? findComposer(spec, root) : composer),
      composerScrimSurface: (composer) => findComposerScrim(spec, composer === undefined ? findComposer(spec, root) : composer),
      composerAddTrigger: (composer) => findComposerAddTrigger(spec, composer === undefined ? findComposer(spec, root) : composer),
      modelSelectorTrigger: () => findModelTrigger(spec, root),
      activeModelLabel: () => findActiveModelLabel(spec, root),
      composerChips: (composer) => {
        const comp = composer === undefined ? findComposer(spec, root) : composer;
        return findComposerChips(spec, comp, findComposerAddTrigger(spec, comp), findModelTrigger(spec, root));
      },
      visibleAttachments: (composer) => findVisibleAttachments(spec, messages(), composer === undefined ? findComposer(spec, root) : composer, root),
      codeSurfaces: () => findCodeSurfaces(spec, messages(), root),
      codeHeaders: () => findCodeHeaders(spec, messages()),
      threadTailSpacers: () => findThreadTailSpacers(spec, findPrimary(spec, root), messages()),
      threadColumns: () => findColumnSurfaces(spec.threadColumns, findPrimary(spec, root), messages()[0]),
      composerColumns: (composer) => findColumnSurfaces(spec.composerColumns, findPrimary(spec, root), composer === undefined ? findComposer(spec, root) : composer),
      sidebarSurfaces: () => findSidebars(spec, root),
      sidebarActiveRows: (sidebars) => findSidebarActiveRows(sidebars === undefined ? findSidebars(spec, root) : sidebars),
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
