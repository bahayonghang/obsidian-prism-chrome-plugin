/* Obsidian Prism Web — site adapters. Copyright (c) 2026 bahayonghang.
 * Modified 2026-11-22. GPL-3.0-only. See NOTICE and MODIFICATIONS.md. */
(function (global) {
  'use strict';

  const HOSTS = Object.freeze({
    chatgpt: {
      /* v0.3.1 #18 live turn markers (2026-11-22 probe): the role is the content-search-unit-key
       * suffix, with the question bubble / assistant markdown style as secondary markers and
       * [data-turn-key] as the turn container. The v0.3.0 selectors after them remain a fallback.
       * Virtualized placeholders carry none of these markers and are not counted (ADR-0001). */
      users: '[data-content-search-unit-key$=":user"], [data-user-message-bubble="true"], [data-message-author-role="user"], article[data-turn="user"], [data-testid="user-message"]',
      assistants: '[data-content-search-unit-key$=":assistant"], [data-markdown-text-style="assistant-message"], [data-message-author-role="assistant"], article[data-turn="assistant"], [data-testid="assistant-message"], .agent-turn',
      turnContainers: '[data-turn-key], article[data-testid^="conversation-turn-"]',
      conversation: 'main',
      primary: ['main', '[role="main"]', '[data-testid="conversation-pane"]', '[data-testid="chat-main"]', '#main-content'],
      editors: ['#prompt-textarea', '[data-testid="prompt-textarea"]', 'textarea[name="prompt-textarea"]', 'main [contenteditable="true"][role="textbox"]', 'main textarea'],
      composers: ['[data-composer-layout]', '#composer-background', '[data-testid="chat-composer"]', '[data-testid="composer"]', '[data-composer-surface]', '.composer-parent'],
      composerBackdrops: '#thread-bottom-container,#thread-bottom,[class*="content-fade"],.content-fade,[class*="fade-mask"],[data-testid="composer-footer"],[data-testid="composer-container"],.thread-bottom-container,.composer-parent',
      codeSurfaces: '[data-testid="code-block"], .code-block-wrapper',
      codeHeaders: '.code-header, [data-testid="code-block-header"]',
      modelTriggers: '[data-testid="model-switcher-dropdown-button"], [data-testid="composer-model-switcher"], button[aria-label*="model" i], button[aria-label*="模型"]',
      modelLabels: '[data-testid="model-switcher-dropdown-button"], [data-testid="composer-model-switcher"], .model-label',
      addTriggers: '[data-testid="composer-plus-btn"], button[aria-label*="Add files" i], button[aria-label*="Attach" i], button[aria-label*="上传"], button[aria-label*="添加"]',
      composerChips: '[data-testid="composer-mode-pill"], [data-testid="composer-chip"], [data-testid="composer-tool-chip"]',
      attachments: '[data-testid="attachment-card"], [data-testid="file-attachment"], [data-testid="uploaded-file"], [data-testid="image-attachment"], [class*="file-tile"], .native-footer-attachment',
      primaryActions: [
        '[data-testid="send-button"], .send-button, button[aria-label*="Send" i], button[aria-label*="发送"]',
        '[data-testid="composer-speech-button"], button[aria-label*="Start Voice" i], button[aria-label*="Voice" i], button[aria-label*="语音"]',
        'button[aria-label*="Microphone" i], button[aria-label*="麦克风"]'
      ],
      /* v0.3.1 #21 / v0.4.0 #26 Content Width Presets: the reading (text) width is 48rem natively (the 808px
       * transcript = 48rem + 2 × 20px padding, probe 2026-11-22). This declaration owns the width
       * limiters: hosts.css repeats them in its static width rules (CSS cannot read it) and
       * tests/content-width.test.cjs fails if the two drift. The runtime reads only `native`.
       * Bridges --thread-content-max-width onto main and dock containers, sizes both transcript and
       * #thread-bottom column wrapper, and keeps direct-form fallback if #thread-bottom > form exists. */
      contentWidth: {
        native: 768,
        targets: ['main', '[class*="transcriptContent"]'],
        composerTargets: [
          '#thread-bottom-container',
          '#thread-bottom',
          '#thread-bottom [class*="--thread-content-max-width"]',
          '#thread-bottom :has(> form[data-chatgpt-composer])',
          '#thread-bottom > form[data-chatgpt-composer]'
        ]
      },
      threadColumns: '[class*="transcriptContent"], .thread, [data-testid="conversation-thread"], [class*="thread-content"]',
      composerColumns: '.composer-column, .composer-container, [data-testid="composer-container"]',
      // v0.3.1 #19: grid area names the two-row Composer Surface rearranges. Inferred: the probe
      // (2026-11-22) saw only the column tracks, so an unnamed grid falls back to structural slots.
      composerGridAreas: ['leading', 'primary', 'trailing'],
      composerGridSlots: true,
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
      composerCard: 'input-area-v2',
      composerBackdrops: 'input-area-v2,input-area,.input-area-container,[data-test-id="input-area"],[data-test-id="input-area-container"],.input-area-wrapper',
      codeSurfaces: 'code-block, .code-block',
      codeHeaders: '.code-block-decoration, [data-test-id="code-block-header"]',
      modelTriggers: 'bard-mode-switcher button, [data-test-id="bard-mode-menu-button"], .input-area-switch',
      modelLabels: 'bard-mode-switcher button, [data-test-id="bard-mode-menu-button"], .input-area-switch, .model-label',
      addTriggers: '[data-test-id="upload-file-button"], button[aria-label*="Add files" i], button[aria-label*="Upload" i], button[aria-label*="上传"], button[aria-label*="添加"]',
      composerChips: '.toolbox-drawer-item-button, [data-test-id="composer-chip"]',
      attachments: '[data-test-id="file-preview-chip"], [data-test-id="attachment-card"], .file-preview-chip, uploader-file-preview, file-preview-chip, .native-footer-attachment',
      primaryActions: [
        '[data-test-id="send-button"], .send-button, button[aria-label*="Send" i], button[aria-label*="发送"]',
        'button[aria-label*="Start Voice" i], button[aria-label*="Voice" i], button[aria-label*="语音"]',
        'button[aria-label*="Microphone" i], button[aria-label*="麦克风"]'
      ],
      /* v0.3.1 #21: Gemini caps every markdown block at 708px (not the outer panel), plus the
       * User Turn, the response footer, the disclaimer and the 660px input area (probe 2026-11-22).
       * Owned here and mirrored by the hosts.css width rules (see the ChatGPT note above). */
      contentWidth: { native: 708, targets: ['.md-content > *', 'user-query', '.response-footer', 'hallucination-disclaimer'], composerTargets: ['.input-area-container'] },
      threadColumns: '.thread, .response-container',
      composerColumns: '.composer-container, input-area-v2',
      // v0.3.1 #19: grid area names the two-row Composer Surface rearranges (probe 2026-11-22).
      composerGridAreas: ['leading-actions', 'text-input', 'trailing-actions'],
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
    const el = elementOf(node);
    if (!el) return false;
    return typeof el.closest === 'function' ? Boolean(el.closest('[data-op-owned]')) : Boolean(el.hasAttribute?.('data-op-owned'));
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
  const TURN_NOISE_SELECTOR = '[data-op-owned],script,style,svg,[hidden],[aria-hidden="true"],.sr-only,button,[role="button"],.turn-actions,[data-testid="turn-actions"],.code-header,.code-block-decoration,[data-testid="code-block-header"],[data-test-id="code-block-header"],[data-testid="citation-pill"],.citation-chip,message-actions';
  function cleanTurnText(element, options = {}) {
    if (!element) return '';
    const selector = options && options.excludeCode ? `${TURN_NOISE_SELECTOR},pre` : TURN_NOISE_SELECTOR;
    if (element.matches && element.matches(selector)) return '';
    if (typeof element.cloneNode === 'function') {
      if (!element.querySelector || !element.querySelector(selector)) {
        return (element.textContent || '').trim();
      }
      const copy = element.cloneNode(true);
      copy.querySelectorAll(selector).forEach(node => node.remove());
      return (copy.textContent || '').trim();
    }
    const collectText = node => {
      if (!node) return '';
      if (node.nodeType === 3) return node.nodeValue ?? node.textContent ?? '';
      if (node !== element && node.matches && node.matches(selector)) return '';
      let out = node.textContent || '';
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          const part = collectText(child);
          if (part) out += (out ? ' ' : '') + part;
        }
      }
      return out;
    };
    return collectText(element).trim();
  }
  function visibleText(element) {
    if (!isVisible(element)) return '';
    // innerText follows rendered visibility, including collapsed native details.
    return typeof element.innerText === 'string' ? element.innerText.trim() : textOf(element).trim();
  }
  function estimateTokens(text, options = {}) {
    const source = String(text || '');
    if (!source.trim()) return 0;
    let cjk = 0;
    let other = 0;
    for (const character of source) {
      if (/[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff]/u.test(character)) cjk++;
      else other++;
    }
    const divisor = options && options.mode === 'code' ? 3.2 : 4;
    return Math.ceil(cjk * 0.7 + other / divisor);
  }
  function estimateTurnTokens(turn) {
    if (!turn) return { prose: 0, code: 0, total: 0 };
    const prose = estimateTokens(cleanTurnText(turn, { excludeCode: true }));
    let code = 0;
    if (typeof turn.querySelectorAll === 'function') {
      const pres = [...turn.querySelectorAll('pre')].filter(pre =>
        !isOwned(pre) &&
        !pre.closest?.('[hidden],[aria-hidden="true"]') &&
        !pre.parentElement?.closest?.('pre')
      );
      for (const pre of pres) {
        if (pre.parentElement && pre.parentElement !== turn) {
          const noiseAnc = pre.closest?.(TURN_NOISE_SELECTOR);
          if (noiseAnc && turn.contains?.(noiseAnc)) continue;
        }
        const codeText = cleanTurnText(pre.querySelector?.('code') || pre);
        code += estimateTokens(codeText, { mode: 'code' });
      }
    }
    return { prose, code, total: prose + code };
  }
  // Review fix S9: one `source` says where the Reference Capacity came from: 'manual' (user setting),
  // 'matched' (recognized model label), 'fallback' (expected site default, e.g. a Gemini custom mode
  // name, which stays unflagged) or 'unrecognized' (ChatGPT only, v0.3.1 #18: the capsule shows `?`
  // and the popover suggests a manual capacity).
  function resolveReferenceCapacity(host, modelLabel, configured) {
    const rawLabel = String(modelLabel || '').trim();
    const result = (tokens, source) => ({ tokens, source, modelLabel: rawLabel });
    if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) {
      return result(configured, 'manual');
    }
    const label = rawLabel.toLowerCase();
    if (host === 'gemini') {
      if (/\b1\.5\s*pro\b/.test(label)) return result(2000000, 'matched');
      if (/\b(?:3(?:\.\d+)?|2\.5|2\.0|flash|pro|thinking|ultra)\b/.test(label)) return result(1000000, 'matched');
      return result(1000000, 'fallback');
    }
    if (host === 'chatgpt') {
      if (/\b4\.1\b/.test(label)) return result(1000000, 'matched');
      if (/\b(?:gpt-?5|chatgpt\s*5|5\.[12])\b/.test(label)) return result(400000, 'matched');
      if (/\bo[134]\b/.test(label)) return result(200000, 'matched');
      if (/\b4o\b|gpt-?4/.test(label)) return result(128000, 'matched');
      if (/\b3\.5\b/.test(label)) return result(32000, 'matched');
      // v0.3.1 #18: the live model button shows only the tier (probe 2026-11-22).
      if (/\b(?:pro|thinking|x-?high|extra\s+high|high)\b/.test(label)) return result(400000, 'matched');
      if (/\binstant\b/.test(label)) return result(128000, 'matched');
      return result(128000, 'unrecognized');
    }
    return result(128000, 'fallback');
  }
  function scrollContainer(element) {
    for (let parent = element?.parentElement; parent; parent = parent.parentElement) {
      const style = parent.ownerDocument?.defaultView?.getComputedStyle?.(parent);
      if (style && /(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight + 1) return parent;
    }
    return element?.ownerDocument?.scrollingElement || global.document?.scrollingElement || null;
  }
  // v0.3.1 #18: live ChatGPT message markers lead; the rest are the v0.3.0 markers.
  const MESSAGE_AREAS = '[data-content-search-unit-key],[data-user-message-bubble],[data-markdown-text-style="assistant-message"],[data-message-author-role],[data-turn="user"],[data-turn="assistant"],article[data-testid^="conversation-turn-"],[data-testid="user-message"],[data-testid="assistant-message"],.agent-turn,user-query,model-response,[data-test-id="model-response"],.model-response-text';
  const OVERLAY_EXCLUDED = 'dialog,[role="dialog"],[aria-modal="true"],[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper],.mat-mdc-menu-panel';
  const FADE_LAYER_SELECTOR = '[class*="content-fade"],.content-fade,[class*="fade-mask"]';
  const INTERACTIVE_DESCENDANT = 'a[href],button,[role="button"],input,textarea,select,img,picture,svg,video,audio,canvas,iframe,[contenteditable],[tabindex],details,summary';
  const INTERACTIVE_CONTROL_SELF = 'button,a[href],input,textarea,select,[role="button"],[role="link"],[contenteditable],[contenteditable="true"],img,picture,svg,video,audio,canvas,iframe,details,summary';
  const THOUGHT_AREAS = 'model-thoughts,[data-testid="reasoning-content"],[data-testid="thoughts-content"],[data-testid="thinking-content"],[data-test-id="thoughts-content"],[data-test-id="thinking-content"]';
  const FORM_FIELD = 'input,textarea,select,[contenteditable],[contenteditable="true"]';
  const DISCLAIMER_SELECTOR = '[class*="disclaimer"], [data-testid*="disclaimer"], [data-test-id*="disclaimer"], hallucination-disclaimer, .composer-hint';
  const DISCLAIMER_TEXT_RE = /(?:chatgpt|gemini|ai)\s+(?:is\s+ai\s+and\s+)?(?:can|may|might)\s+make\s+mistakes|check\s+important\s+info|double[- ]check\s+(?:its\s+)?responses|可能会犯错|可能会出错|请核查重要信息|内容由\s*ai\s*生成|仅供参考/i;
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
    const composerCard = findComposerCard(spec, composer);
    const viewportHeight = view.innerHeight || composer.ownerDocument.documentElement.clientHeight;
    const path = [];
    let boundary = -1;
    // Recognize only the small docking region around a known native editor.
    // Structure and positioning remain stable after its paint is overridden.
    for (let node = composer.parentElement, depth = 0; node && depth < 14; node = node.parentElement, depth++) {
      if (node.matches('main,[role="main"],body,html,chat-window,dialog,[role="dialog"],[aria-modal="true"],aside,nav,[role="navigation"]') ||
          node.matches(OVERLAY_EXCLUDED) || node.querySelector(MESSAGE_AREAS)) break;
      if (isOwned(node)) break;
      path.push(node);
      const rect = node.getBoundingClientRect();
      const style = view.getComputedStyle(node);
      const smallRegion = rect.height > 0 && rect.height <= Math.max(composerRect.height + 220, viewportHeight * 0.48) &&
        rect.width >= composerRect.width - 24 && rect.right > composerRect.left && rect.left < composerRect.right &&
        rect.bottom >= composerRect.top - 80 && rect.top <= composerRect.bottom + 140;
      const bottomDock = ['sticky','fixed','absolute'].includes(style.position) &&
        rect.bottom >= Math.min(viewportHeight - 96, composerRect.bottom - 4);
      const nearBottomInFlowDock = rect.bottom >= Math.min(viewportHeight - 120, composerRect.bottom - 4) &&
        Boolean(node.parentElement && (node.parentElement.querySelector(MESSAGE_AREAS) || node.parentElement.matches('.composer-parent,main,[role="main"]')));
      if (smallRegion && (node.matches(spec.composerBackdrops) || bottomDock || nearBottomInFlowDock)) boundary = path.length - 1;
    }
    if (boundary < 0) return [];
    const surfaces = path.slice(0, boundary + 1);
    const outerDock = path[boundary];
    const isProtectedBackdrop = node => {
      if (!node || isOwned(node)) return true;
      if (node === composer || composer.contains?.(node)) return true;
      if (composerCard && (node === composerCard || composerCard.contains?.(node))) return true;
      if (node.matches?.(OVERLAY_EXCLUDED) || node.closest?.(OVERLAY_EXCLUDED)) return true;
      if (node.matches?.(MESSAGE_AREAS) || node.closest?.(MESSAGE_AREAS)) return true;
      if (spec.attachments && (node.matches?.(spec.attachments) || node.closest?.(spec.attachments))) return true;
      return false;
    };
    const hasInteractiveDescendant = node => Boolean(node.querySelector(INTERACTIVE_DESCENDANT));
    const isEmptyFadeBox = node =>
      !node.contains(composer) && !composer.contains(node) && !isOwned(node) &&
      !node.matches('[role="button"],[role="link"],[tabindex],[contenteditable],a[href],button,input,textarea,select,img,picture,svg,video,audio,canvas,iframe') &&
      !textOf(node).trim() && !hasInteractiveDescendant(node);
    const isContainerFadeLayer = (node, maxHeight) => {
      if (!node?.matches?.(FADE_LAYER_SELECTOR)) return false;
      if (isProtectedBackdrop(node) || node.matches?.(INTERACTIVE_CONTROL_SELF)) return false;
      if (node.querySelector?.(MESSAGE_AREAS) || node.querySelector?.(OVERLAY_EXCLUDED)) return false;
      if (spec.attachments && node.querySelector?.(spec.attachments)) return false;
      const fStyle = view.getComputedStyle(node);
      if (fStyle && fStyle.display === 'none') return false;
      const fRect = node.getBoundingClientRect();
      if (fRect.height > maxHeight) return false;
      if (isEmptyFadeBox(node)) return true;
      if (node.contains?.(composer)) return true;
      if ((node.children?.length || 0) > 0 && !node.matches?.(FORM_FIELD) && !node.querySelector?.(FORM_FIELD)) return true;
      if (node.matches?.(DISCLAIMER_SELECTOR) || DISCLAIMER_TEXT_RE.test(textOf(node))) return true;
      return false;
    };
    const isAdjacentDisclaimerShell = (node, maxHeight) => {
      if (!node || isProtectedBackdrop(node) || node.contains?.(composer) || node.matches?.(INTERACTIVE_CONTROL_SELF)) return false;
      if (node.matches?.('script,style,template') || node.hasAttribute?.('hidden')) return false;
      if (node.querySelector?.(MESSAGE_AREAS) || node.querySelector?.(OVERLAY_EXCLUDED)) return false;
      if (node.matches?.(FORM_FIELD) || node.querySelector?.(FORM_FIELD)) return false;
      const sStyle = view.getComputedStyle(node);
      if (sStyle && (sStyle.display === 'none' || /(auto|scroll)/.test(sStyle.overflowY || ''))) return false;
      const sRect = node.getBoundingClientRect();
      if (sRect.height > maxHeight) return false;
      const txt = textOf(node).trim();
      if (node.matches?.(DISCLAIMER_SELECTOR) || node.querySelector?.(DISCLAIMER_SELECTOR)) return true;
      if (txt && txt.length <= 240 && DISCLAIMER_TEXT_RE.test(txt)) return true;
      const hasVt = node.matches?.('[style*="view-transition-name"]') || Boolean(sStyle?.viewTransitionName && sStyle.viewTransitionName !== 'none');
      return Boolean(hasVt && sRect.height <= 140 && txt.length > 0 && txt.length <= 240 && !node.querySelector?.('svg'));
    };
    // Native fade siblings may sit above the shell, inside dock surfaces, or as adjacent wrappers
    // in outerDock.parentElement. Protected surfaces (composer/card/attachments/dialogs/menus) are never returned.
    for (const surface of [...surfaces]) {
      const bounds = surface.getBoundingClientRect();
      const maxHeight = Math.max(bounds.height + 160, viewportHeight * 0.48);
      for (const child of surface.children) {
        if (!child.matches('div,span') || !isEmptyFadeBox(child)) continue;
        const style = view.getComputedStyle(child);
        if (!['absolute','fixed'].includes(style.position) ||
            (style.pointerEvents !== 'none' && child.getAttribute('aria-hidden') !== 'true')) continue;
        const rect = child.getBoundingClientRect();
        if (rect.width >= bounds.width * .8 && rect.height > 0 && rect.height <= bounds.height + 80 &&
            rect.right > bounds.left && rect.left < bounds.right && rect.bottom >= bounds.top - 80 && rect.top <= bounds.bottom + 1) {
          surfaces.push(child);
        }
      }
      for (const fade of surface.querySelectorAll(FADE_LAYER_SELECTOR)) {
        if (isContainerFadeLayer(fade, maxHeight)) surfaces.push(fade);
      }
    }
    if (outerDock?.parentElement && !outerDock.parentElement.matches?.('body,html')) {
      const outerBounds = outerDock.getBoundingClientRect();
      const outerMaxHeight = Math.max(outerBounds.height + 160, viewportHeight * 0.48);
      for (const sib of [...(outerDock.parentElement.children || [])]) {
        if (sib === outerDock || isProtectedBackdrop(sib) || sib.contains?.(composer)) continue;
        const sibStyle = view.getComputedStyle(sib);
        if (sibStyle && /(auto|scroll)/.test(sibStyle.overflowY || '')) continue;
        if (sib.querySelector?.(MESSAGE_AREAS) || sib.querySelector?.(OVERLAY_EXCLUDED)) continue;
        if (isContainerFadeLayer(sib, outerMaxHeight) || isAdjacentDisclaimerShell(sib, outerMaxHeight)) {
          surfaces.push(sib);
        } else if (sib.querySelectorAll) {
          for (const fade of sib.querySelectorAll(FADE_LAYER_SELECTOR)) {
            if (isContainerFadeLayer(fade, outerMaxHeight)) surfaces.push(fade);
          }
        }
      }
    }
    return [...new Set(surfaces)].filter(node => !isProtectedBackdrop(node));
  }
  function findSidebars(spec, root) {
    const result = [];
    const primary = findPrimary(spec, root);
    const composer = findComposer(spec, root);
    const add = node => {
      if (!node || isOwned(node) || !isVisible(node) || node.closest(MESSAGE_AREAS)) return;
      if ((primary && (node === primary || node.contains?.(primary))) ||
          (composer && (node === composer || node.contains?.(composer)))) return;
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
  function sortByDocumentOrder(nodes) {
    if (nodes.length <= 1 || typeof nodes[0]?.compareDocumentPosition !== 'function') return nodes;
    return [...nodes].sort((a, b) => {
      if (a === b) return 0;
      const pos = a.compareDocumentPosition(b);
      if (pos & 4) return -1;
      if (pos & 2) return 1;
      return 0;
    });
  }
  function findTurns(spec, role, root) {
    const selector = role === 'user' ? spec.users : spec.assistants;
    const explicit = topLevelMatches(selector, root).filter(isVisible);
    if (!spec.turnContainers) return sortByDocumentOrder(explicit);
    const result = [...explicit];
    const seen = new Set(explicit);
    const containers = topLevelMatches(spec.turnContainers, root).filter(isVisible);
    for (const container of containers) {
      if (seen.has(container) || result.some(node => node.contains(container) || container.contains(node))) continue;
      if (container.querySelector(spec.users) || container.querySelector(spec.assistants)) continue;
      const heading = container.querySelector('.sr-only');
      const srText = heading ? textOf(heading).trim().toLowerCase() : '';
      const turnAttr = container.getAttribute('data-turn');
      const isUser = turnAttr === 'user' || Boolean(container.querySelector('.user-message-bubble-color')) || /^(you said|你说|您说)/i.test(srText);
      const isAssistant = turnAttr === 'assistant' || Boolean(container.querySelector('.agent-turn')) || /^(chatgpt said|chatgpt\s*说)/i.test(srText);
      if (role === 'user' && isUser && !isAssistant) {
        seen.add(container);
        result.push(container);
      } else if (role === 'assistant' && isAssistant && !isUser) {
        seen.add(container);
        result.push(container);
      }
    }
    return sortByDocumentOrder(result);
  }
  function normalizeModelText(raw) {
    return String(raw || '').replace(/[⌄▾▼›❯]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function firstMatchingSelector(selectorList, scope, predicate) {
    if (!selectorList || !scope?.querySelectorAll) return null;
    for (const selector of selectorList.split(',').map(s => s.trim()).filter(Boolean)) {
      const found = [...scope.querySelectorAll(selector)].find(node => !isOwned(node) && isVisible(node) && predicate(node));
      if (found) return found;
    }
    return null;
  }
  const isNonMessageTrigger = node => !node.closest('dialog,[role="dialog"],[aria-modal="true"]') && !node.closest(MESSAGE_AREAS);
  function findModelTrigger(spec, root) {
    return firstMatchingSelector(spec.modelTriggers, root, isNonMessageTrigger);
  }
  function findActiveModelLabel(spec, root) {
    const readLabel = node => node ? normalizeModelText(textOf(node) || node.getAttribute('aria-label') || '') : '';
    const triggerLabel = readLabel(findModelTrigger(spec, root));
    if (triggerLabel) return triggerLabel;
    let resolved = '';
    firstMatchingSelector(spec.modelLabels, root, node => {
      if (!isNonMessageTrigger(node)) return false;
      const label = readLabel(node);
      if (label) { resolved = label; return true; }
      return false;
    });
    return resolved;
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
  function collectAttachments(selector, scopes) {
    if (!selector) return [];
    const candidates = new Set();
    for (const scope of scopes) {
      if (!scope?.querySelectorAll) continue;
      for (const node of scope.querySelectorAll(selector)) {
        if (isOwned(node) || !isVisible(node) || node.closest?.('dialog,[role="dialog"],[aria-modal="true"]')) continue;
        const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
        if (rect && rect.width > 0 && rect.height > 0 && rect.width <= 36 && rect.height <= 36) continue;
        candidates.add(node);
      }
    }
    const list = [...candidates];
    return list.filter(node => !list.some(other => other !== node && other.contains(node)));
  }
  function findVisibleAttachments(spec, messages, composer, root) {
    return collectAttachments(spec.attachments, [...messages, composer?.parentElement || composer, root]);
  }
  function findComposerAttachments(spec, composer) {
    if (!composer || isOwned(composer)) return [];
    return collectAttachments(spec.attachments, [composer]);
  }
  function findComposerAddTrigger(spec, composer) {
    if (!composer || !spec.addTriggers) return null;
    const scope = composer.parentElement || composer;
    const isCandidate = node => composer.contains(node) && !node.classList.contains('send-button');
    // Prefer icon-only or '+' buttons so 32px circular styling never clips text labels.
    return firstMatchingSelector(spec.addTriggers, scope, node => isCandidate(node) && textOf(node).trim().length <= 2) ||
      firstMatchingSelector(spec.addTriggers, scope, isCandidate);
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
  // v0.3.1 #19 two-row composer: the host's own grid that lays out the editor row, as { element, slots, trailing }.
  // It qualifies when its direct children are placed by every expected area name (slots: null). Children
  // are read, not the container, because our override changes the container's template.
  // Review fix (P1): the ChatGPT area names are inferred; the probe only saw a "36px | input | trailing"
  // grid. When no child carries a named area, a host with composerGridSlots identifies the slots by role
  // instead: leading holds the add button, primary the editor, trailing is the only control-bearing child
  // after primary. content.js marks those existing children reversibly (data-op-composer-<slot>) and
  // hosts.css names their areas; nothing is moved or wrapped (ADR-0002). An unknown layout stays native.
  const COMPOSER_SLOT_MARKS = ['data-op-composer-leading', 'data-op-composer-primary', 'data-op-composer-trailing'];
  const isAreaName = value => Boolean(value) && !/^(?:auto|-?\d+|span(?:\s+\d+)?)$/.test(value);
  function composerGridSlots(spec, grid, editor, view) {
    const children = [...grid.children].filter(child => !isOwned(child));
    // Our slot marks give children area names; only unmarked children show the host's own placement.
    const hostNamed = children.some(child => !COMPOSER_SLOT_MARKS.some(mark => child.hasAttribute(mark)) &&
      ['gridRowStart', 'gridRowEnd', 'gridColumnStart', 'gridColumnEnd'].some(key => isAreaName(view.getComputedStyle(child)[key])));
    if (hostNamed) return null;
    const primaryIndex = children.findIndex(child => child.contains(editor));
    if (primaryIndex < 0) return null;
    const leadingBefore = children.slice(0, primaryIndex).filter(child => child.querySelector(spec.addTriggers));
    if (leadingBefore.length === 1) {
      const trailing = children.slice(primaryIndex + 1).filter(child => child.querySelector('button,[role="button"]'));
      if (trailing.length !== 1) return null;
      return { leading: leadingBefore[0], primary: children[primaryIndex], trailing: trailing[0] };
    }
    if (leadingBefore.length !== 0) return null;
    const afterPrimary = children.slice(primaryIndex + 1);
    const leadingAfter = afterPrimary.filter(child => child.querySelector(spec.addTriggers));
    if (leadingAfter.length !== 1) return null;
    const trailingAfter = afterPrimary.filter(child => child !== leadingAfter[0] && child.querySelector('button,[role="button"]'));
    if (trailingAfter.length !== 1) return null;
    if (children.indexOf(trailingAfter[0]) <= children.indexOf(leadingAfter[0])) return null;
    return { leading: leadingAfter[0], primary: children[primaryIndex], trailing: trailingAfter[0] };
  }
  function findComposerGrid(spec, composer) {
    if (!composer || !spec.composerGridAreas || isOwned(composer)) return null;
    const view = composer.ownerDocument?.defaultView;
    const editor = firstVisible(spec.editors, composer, node => composer.contains(node));
    if (!editor || !view?.getComputedStyle) return null;
    const trailingArea = spec.composerGridAreas[spec.composerGridAreas.length - 1];
    for (let node = editor.parentElement; node; node = node.parentElement) {
      if (/grid/.test(view.getComputedStyle(node).display)) {
        const names = new Set();
        let hostTrailing = null;
        for (const child of node.children) {
          if (COMPOSER_SLOT_MARKS.some(mark => child.hasAttribute(mark))) continue;
          const style = view.getComputedStyle(child);
          names.add(style.gridRowStart); names.add(style.gridColumnStart);
          if (!hostTrailing && !isOwned(child) && (style.gridColumnStart === trailingArea || style.gridRowStart === trailingArea)) {
            hostTrailing = child;
          }
        }
        if (spec.composerGridAreas.every(name => names.has(name))) return { element: node, slots: null, trailing: hostTrailing };
        const slots = spec.composerGridSlots ? composerGridSlots(spec, node, editor, view) : null;
        if (slots) return { element: node, slots, trailing: slots.trailing };
      }
      if (node === composer) break;
    }
    return null;
  }
  function hasOtherVisibleControl(container, excluded) {
    if (!container || isOwned(container)) return false;
    const isExcluded = node => Boolean(excluded && (node === excluded || node.contains(excluded) || excluded.contains?.(node)));
    if (container.matches?.('button,[role="button"]') && isVisible(container) && !isExcluded(container)) return true;
    for (const node of container.querySelectorAll?.('button,[role="button"]') || []) {
      if (isOwned(node) || !isVisible(node) || isExcluded(node)) continue;
      return true;
    }
    return false;
  }
  function findComposerToolbar(trailing, modelTrigger) {
    if (!trailing || isOwned(trailing)) return null;
    let current = trailing;
    for (let depth = 0; depth < 6; depth++) {
      const kids = [...(current.children || [])].filter(child => !isOwned(child));
      if (!kids.length) break;
      if (modelTrigger && current.contains(modelTrigger)) {
        const modelBranch = kids.find(child => child === modelTrigger || child.contains(modelTrigger));
        if (!modelBranch || modelBranch === modelTrigger) break;
        const siblingHasControl = kids.some(child => child !== modelBranch && hasOtherVisibleControl(child, null));
        if (!siblingHasControl && hasOtherVisibleControl(modelBranch, modelTrigger)) {
          current = modelBranch;
          continue;
        }
        break;
      }
      if (kids.length === 1 && !kids[0].matches?.('button,[role="button"]') && hasOtherVisibleControl(kids[0], null)) {
        current = kids[0];
        continue;
      }
      break;
    }
    return current;
  }
  function findModelCapsuleSlot(trailing, modelTrigger) {
    if (!trailing || !modelTrigger || isOwned(trailing) || isOwned(modelTrigger)) return null;
    const toolbar = findComposerToolbar(trailing, modelTrigger) || trailing;
    if (!toolbar.contains(modelTrigger)) return null;
    return [...(toolbar.children || [])].find(child => !isOwned(child) && (child === modelTrigger || child.contains(modelTrigger))) || null;
  }
  function findComposerCard(spec, composer) {
    if (!composer) return null;
    return (spec?.composerCard && composer.closest?.(spec.composerCard)) || composer;
  }
  function findComposerPrimaryAction(spec, composer, addTrigger, modelTrigger, trailing) {
    if (!composer || isOwned(composer)) return null;
    const isCandidate = node => {
      if (!node || node === composer || isOwned(node) || !isVisible(node) || !composer.contains(node)) return false;
      if (node.closest?.('dialog,[role="dialog"],[aria-modal="true"]')) return false;
      if (addTrigger && (node === addTrigger || node.contains(addTrigger) || addTrigger.contains?.(node))) return false;
      if (modelTrigger && (node === modelTrigger || node.contains(modelTrigger) || modelTrigger.contains?.(node))) return false;
      if (spec.attachments && node.closest?.(spec.attachments)) return false;
      if (spec.composerChips && node.closest?.(spec.composerChips)) return false;
      const aria = node.getAttribute?.('aria-label') || '';
      if (/\bdictate\b|听写/i.test(aria)) return false;
      return true;
    };
    const tiers = Array.isArray(spec.primaryActions) ? spec.primaryActions : (spec.primaryActions ? [spec.primaryActions] : []);
    const scopes = trailing && composer.contains(trailing) && trailing !== composer ? [trailing, composer] : [composer];
    for (const selector of tiers) {
      if (!selector) continue;
      for (const scope of scopes) {
        const matched = [...scope.querySelectorAll(selector)].filter(isCandidate);
        if (matched.length) return matched[matched.length - 1];
      }
    }
    if (trailing && composer.contains(trailing)) {
      const fallback = [...trailing.querySelectorAll('button')].filter(isCandidate);
      if (fallback.length) return fallback[fallback.length - 1];
    }
    return null;
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
  function isComposerDockOverlaid(dock, scroller, view = dock?.ownerDocument?.defaultView || global) {
    if (!dock) return false;
    const style = view?.getComputedStyle?.(dock);
    if (!style) return true;
    const pos = style.position || '';
    const doc = dock.ownerDocument || scroller?.ownerDocument || global.document;
    if (!scroller || scroller === doc?.scrollingElement || scroller === doc?.documentElement || scroller === doc?.body) {
      for (let el = dock, steps = 0; el && steps < 4; el = el.parentElement, steps++) {
        if (steps > 0 && el.matches?.('main,[role="main"],body,html')) break;
        const elPos = view?.getComputedStyle?.(el)?.position || '';
        if (['sticky', 'fixed', 'absolute'].includes(elPos)) return true;
      }
      return false;
    }
    if (typeof scroller.contains === 'function' && scroller.contains(dock)) {
      for (let el = dock; el && el !== scroller; el = el.parentElement) {
        const elPos = view?.getComputedStyle?.(el)?.position || '';
        if (['sticky', 'fixed', 'absolute'].includes(elPos)) return true;
      }
      return false;
    }
    if (typeof dock.contains === 'function' && dock.contains(scroller)) return false;
    if (typeof dock.getBoundingClientRect !== 'function' || typeof scroller.getBoundingClientRect !== 'function') return false;
    const dRect = dock.getBoundingClientRect();
    const sRect = scroller.getBoundingClientRect();
    return dRect.height > 0 && sRect.height > 0 && dRect.top < sRect.bottom - 1 && dRect.bottom > sRect.top + 1;
  }
  function isIndependentMessageScroller(scroller, composer, dock = null) {
    if (!scroller || !composer || isOwned(scroller)) return false;
    const doc = scroller.ownerDocument || composer.ownerDocument || global.document;
    if (doc && (scroller === doc.scrollingElement || scroller === doc.documentElement || scroller === doc.body)) return false;
    if (scroller === composer || scroller.contains?.(composer) || composer.contains?.(scroller)) return false;
    if (dock && (scroller === dock || scroller.contains?.(dock) || dock.contains?.(scroller))) return false;
    return true;
  }
  function followingSiblings(node) {
    if (node.nextElementSibling !== undefined) {
      const out = [];
      for (let sib = node.nextElementSibling; sib; sib = sib.nextElementSibling) out.push(sib);
      return out;
    }
    const children = node.parentElement?.children;
    if (!children) return [];
    const idx = [...children].indexOf(node);
    return idx >= 0 ? [...children].slice(idx + 1) : [];
  }
  function precedingSiblings(node) {
    if (node.previousElementSibling !== undefined) {
      const out = [];
      for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) out.push(sib);
      return out;
    }
    const children = node.parentElement?.children;
    if (!children) return [];
    const idx = [...children].indexOf(node);
    return idx > 0 ? [...children].slice(0, idx).reverse() : [];
  }
  function isDisclaimerCandidate(node, composer, { allowGenericBelow = false } = {}) {
    if (!node || isOwned(node)) return false;
    if (composer && (node === composer || node.contains?.(composer) || composer.contains?.(node))) return false;
    if (node.matches?.('script,style,template,details,summary,nav,aside,header,article,form,fieldset,table,pre,code') || node.hasAttribute?.('hidden')) return false;
    if (node.querySelector?.('details,summary,nav,aside,header,article,table,pre')) return false;
    if (node.matches?.(OVERLAY_EXCLUDED) || node.closest?.(OVERLAY_EXCLUDED) || node.querySelector?.(OVERLAY_EXCLUDED)) return false;
    if (node.matches?.(MESSAGE_AREAS) || node.closest?.(MESSAGE_AREAS) || node.querySelector?.(MESSAGE_AREAS)) return false;
    if (node.matches?.(THOUGHT_AREAS) || node.closest?.(THOUGHT_AREAS) || node.querySelector?.(THOUGHT_AREAS)) return false;
    if (node.matches?.(FORM_FIELD) || node.querySelector?.(FORM_FIELD)) return false;
    const view = node.ownerDocument?.defaultView || global;
    const computed = view?.getComputedStyle?.(node);
    const selfMarked = node.getAttribute?.('data-op-composer-disclaimer') === 'true';
    const txt = textOf(node).trim();
    const markedChildren = !selfMarked && node.querySelectorAll ? [...node.querySelectorAll('[data-op-composer-disclaimer="true"]')] : [];
    const wrapsMarkedDisclaimer = markedChildren.some(child =>
      !isOwned(child) && !child.closest?.('[hidden], [aria-hidden="true"]') && textOf(child).trim() === txt
    );
    if (selfMarked) {
      if (!node.isConnected || node.closest?.('[hidden], [aria-hidden="true"]') || node.style?.display === 'none') return false;
      if (node.parentElement && !isVisible(node.parentElement)) return false;
    } else if (!isVisible(node)) {
      return false;
    }
    if (!txt || txt.length > 240) return false;
    if (node.matches?.('svg,button,[role="button"]') || node.querySelector?.('svg')) return false;
    if ((node.querySelectorAll?.('button,[role="button"]')?.length || 0) > 2) return false;
    if (node.matches?.(DISCLAIMER_SELECTOR) || DISCLAIMER_TEXT_RE.test(txt)) return true;
    if (!allowGenericBelow) return selfMarked || wrapsMarkedDisclaimer;
    if (selfMarked || wrapsMarkedDisclaimer) return true;
    const styleAttr = node.getAttribute?.('style') || '';
    const hasVt = Boolean(
      (node.style?.viewTransitionName && node.style.viewTransitionName !== 'none') ||
      (computed?.viewTransitionName && computed.viewTransitionName !== 'none') ||
      /view-transition-name\s*:/i.test(styleAttr)
    );
    const negMargin =
      parseFloat(computed?.marginTop) < 0 ||
      parseFloat(node.style?.marginTop) < 0 ||
      /margin-top\s*:\s*-/i.test(styleAttr);
    const rect = typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null;
    if (hasVt || negMargin) return Boolean(rect && rect.height > 0 && rect.height <= 140);
    return Boolean(rect && rect.height > 0 && rect.height <= 96);
  }
  function outermostDisclaimerWrapper(node, boundary, composer) {
    let current = node;
    const targetText = textOf(node).trim();
    while (current.parentElement && current.parentElement !== boundary) {
      const parent = current.parentElement;
      if (parent.matches?.('main,[role="main"],chat-window,body,html')) break;
      if (isOwned(parent) || (composer && parent.contains?.(composer))) break;
      if (parent.matches?.(OVERLAY_EXCLUDED) || parent.querySelector?.(OVERLAY_EXCLUDED)) break;
      if (parent.matches?.(MESSAGE_AREAS) || parent.querySelector?.(MESSAGE_AREAS)) break;
      if (parent.matches?.(FORM_FIELD) || parent.querySelector?.(FORM_FIELD) || parent.querySelector?.('svg')) break;
      if ((parent.querySelectorAll?.('button,[role="button"]')?.length || 0) > 2) break;
      if (textOf(parent).trim() !== targetText) break;
      current = parent;
    }
    return current;
  }
  function findComposerBelowSiblings(composer, dock, primary = null, lastMessage = null) {
    const empty = [];
    const disclaimers = [];
    const seenDisclaimers = new Set();
    const pushDisclaimer = (node, boundary) => {
      if (!node) return;
      const target = boundary ? outermostDisclaimerWrapper(node, boundary, composer) : node;
      if (!target || seenDisclaimers.has(target)) return;
      seenDisclaimers.add(target);
      disclaimers.push(target);
    };
    const scanExplicitInside = (container, boundary) => {
      if (!container || isOwned(container)) return;
      if (container.matches?.(OVERLAY_EXCLUDED) || container.closest?.(OVERLAY_EXCLUDED) || container.querySelector?.(OVERLAY_EXCLUDED)) return;
      if (isDisclaimerCandidate(container, composer, { allowGenericBelow: false })) {
        pushDisclaimer(container, boundary);
        return;
      }
      if (!container.querySelectorAll || container.matches?.(FORM_FIELD) || container.querySelector?.(FORM_FIELD)) return;
      const selector = (container.matches?.(MESSAGE_AREAS) || container.querySelector?.(MESSAGE_AREAS))
        ? DISCLAIMER_SELECTOR
        : `${DISCLAIMER_SELECTOR}, p, span, div, small, footer`;
      for (const child of [...container.querySelectorAll(selector)].slice(0, 24)) {
        if (isDisclaimerCandidate(child, composer, { allowGenericBelow: false })) {
          pushDisclaimer(child, boundary);
        }
      }
    };
    const doc = composer?.ownerDocument || dock?.ownerDocument || global.document;
    const view = doc?.defaultView || global;
    const rawScroller = lastMessage ? scrollContainer(lastMessage) : null;
    const scrollerNode = rawScroller && ![doc?.scrollingElement, doc?.documentElement, doc?.body].includes(rawScroller) ? rawScroller : null;
    const isScrollNode = (node, style) => Boolean(
      (style && /(auto|scroll)/.test(style.overflowY || '')) ||
      node.matches?.('infinite-scroller,[data-prism-test-scroller]') ||
      (scrollerNode && (node === scrollerNode || node.contains?.(scrollerNode)))
    );
    const classifyTrailingSibling = (sib, boundary) => {
      if (!sib || isOwned(sib)) return;
      if (sib.matches?.('script,style,template,details,summary,nav,aside,header,article,form,fieldset,table,pre,code') || sib.hasAttribute?.('hidden')) return;
      if (dock && (sib === dock || sib.contains?.(dock))) return;
      if (composer && (sib === composer || sib.contains?.(composer))) return;
      if (sib.matches?.(MESSAGE_AREAS) || sib.closest?.(MESSAGE_AREAS) || sib.querySelector?.(MESSAGE_AREAS)) return;
      if (sib.matches?.(THOUGHT_AREAS) || sib.closest?.(THOUGHT_AREAS) || sib.querySelector?.(THOUGHT_AREAS)) return;
      if (sib.matches?.(OVERLAY_EXCLUDED) || sib.closest?.(OVERLAY_EXCLUDED) || sib.querySelector?.(OVERLAY_EXCLUDED)) return;
      const sibStyle = view?.getComputedStyle?.(sib);
      if (isScrollNode(sib, sibStyle)) return;
      const selfMarked = sib.getAttribute?.('data-op-composer-disclaimer') === 'true';
      if (!selfMarked && sibStyle && sibStyle.display === 'none') return;
      const isPositioned = Boolean(sibStyle && ['absolute', 'fixed'].includes(sibStyle.position));
      const txt = textOf(sib).trim();
      if (!selfMarked && !isPositioned && !txt && !sib.matches?.(INTERACTIVE_DESCENDANT) && !sib.querySelector?.(INTERACTIVE_DESCENDANT)) {
        empty.push(sib);
        return;
      }
      if (isDisclaimerCandidate(sib, composer, { allowGenericBelow: !isPositioned })) {
        pushDisclaimer(sib, boundary);
      } else if (!isPositioned) {
        scanExplicitInside(sib, boundary);
      }
    };
    if (composer && dock && !isOwned(composer) && !isOwned(dock) && dock.contains?.(composer)) {
      const form = composer.closest?.('form');
      const anchor = form && dock.contains(form) && form !== dock ? form : composer;
      const seenFollowing = new Set();
      const seenPreceding = new Set();
      for (let current = anchor; current && current !== dock && dock.contains(current); current = current.parentElement) {
        for (const sib of followingSiblings(current)) {
          if (!sib || seenFollowing.has(sib)) continue;
          seenFollowing.add(sib);
          classifyTrailingSibling(sib, dock);
        }
        for (const sib of precedingSiblings(current)) {
          if (!sib || seenPreceding.has(sib) || isOwned(sib)) continue;
          seenPreceding.add(sib);
          scanExplicitInside(sib, dock);
        }
      }
      if (dock.parentElement && !dock.parentElement.matches?.('body,html')) {
        for (const sib of precedingSiblings(dock)) {
          if (!sib || sib === dock || sib.contains?.(dock) || sib.contains?.(composer) || isOwned(sib)) continue;
          if (sib.matches?.(OVERLAY_EXCLUDED) || sib.closest?.(OVERLAY_EXCLUDED) || sib.querySelector?.(OVERLAY_EXCLUDED)) continue;
          const sibStyle = view?.getComputedStyle?.(sib);
          if (isScrollNode(sib, sibStyle)) continue;
          scanExplicitInside(sib, dock.parentElement);
        }
      }
      const seenOutsideFollowing = new Set();
      for (let cur = dock, level = 0; cur && level <= 2; cur = cur.parentElement, level++) {
        if (level > 0 && cur.matches?.('main,[role="main"],chat-window,body,html')) break;
        const container = cur.parentElement;
        if (!container || container.matches?.('body,html')) break;
        for (const sib of followingSiblings(cur)) {
          if (!sib || seenOutsideFollowing.has(sib)) continue;
          seenOutsideFollowing.add(sib);
          classifyTrailingSibling(sib, container);
        }
      }
    }
    if (composer && primary && lastMessage && primary.contains?.(lastMessage)) {
      const seenPostThread = new Set();
      for (let cur = lastMessage, depth = 0; cur && cur !== primary && depth < 14; cur = cur.parentElement, depth++) {
        for (const sib of followingSiblings(cur)) {
          if (!sib || seenPostThread.has(sib) || isOwned(sib)) continue;
          seenPostThread.add(sib);
          if (dock && (sib === dock || sib.contains?.(dock) || dock.contains?.(sib))) continue;
          if (sib.contains?.(composer) || sib.matches?.(MESSAGE_AREAS) || sib.querySelector?.(MESSAGE_AREAS)) continue;
          if (sib.matches?.(OVERLAY_EXCLUDED) || sib.closest?.(OVERLAY_EXCLUDED) || sib.querySelector?.(OVERLAY_EXCLUDED)) continue;
          scanExplicitInside(sib, cur.parentElement || primary);
        }
      }
    }
    const dedupedDisclaimers = disclaimers.filter(node => !disclaimers.some(other => other !== node && other.contains?.(node)));
    return { empty, disclaimers: dedupedDisclaimers };
  }
  function findComposerEmptyHeaders(spec, composer, grid, addTrigger, modelTrigger) {
    if (!composer || !grid?.element || isOwned(composer) || isOwned(grid.element)) return [];
    const editor = firstVisible(spec.editors, composer, node => composer.contains(node));
    const view = composer.ownerDocument?.defaultView || global;
    const emptyHeaders = [];
    for (const child of [...(grid.element.children || [])]) {
      if (!child || isOwned(child)) continue;
      if (child === grid.trailing || child === grid.slots?.leading || child === grid.slots?.primary || child === grid.slots?.trailing) continue;
      if (editor && (child === editor || child.contains?.(editor))) continue;
      if (addTrigger && (child === addTrigger || child.contains?.(addTrigger))) continue;
      if (modelTrigger && (child === modelTrigger || child.contains?.(modelTrigger))) continue;
      if (child.matches?.('script,style,template') || child.hasAttribute?.('hidden')) continue;
      const style = view?.getComputedStyle?.(child);
      if (style && (style.display === 'none' || ['absolute', 'fixed'].includes(style.position))) continue;
      if (!textOf(child).trim() && !child.matches?.(INTERACTIVE_DESCENDANT) && !child.querySelector?.(INTERACTIVE_DESCENDANT)) {
        emptyHeaders.push(child);
      }
    }
    return emptyHeaders;
  }
  function findThreadTailSpacers(spec, primary, messages) {
    if (!primary || !spec.tailSpacers || !messages.length) return [];
    const lastMessage = messages[messages.length - 1];
    const spacers = [];
    for (const node of primary.querySelectorAll(spec.tailSpacers)) {
      if (isOwned(node) || node.closest(MESSAGE_AREAS)) continue;
      if (textOf(node).trim() || node.querySelector('button,a[href],[role="button"],input,textarea')) continue;
      if (lastMessage.contains(node)) continue;
      if (typeof lastMessage.compareDocumentPosition === 'function' && !(lastMessage.compareDocumentPosition(node) & 4)) continue;
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
  /* v0.3.1 #21 Content Width Presets, computed from the main area's width (not fixed tiers).
   * Returns the target reading (text) width and a leftward shift for the centred column, or null
   * for `standard` (native width, no override). full = main − left edge − Conversation Rail
   * reserve; wide = (native + full) / 2, at most 1200px. Below a 900px viewport both fall back to
   * the main width minus 16px edges. The shift keeps a full column clear of the rail. */
  const READING_LAYOUT = Object.freeze({ leftEdge: 20, railReserve: 56, wideCap: 1200, narrowViewport: 900, narrowEdge: 16 });
  function contentWidthTarget(nativeWidth, preset, mainWidth, viewportWidth) {
    if ((preset !== 'wide' && preset !== 'full') || !(mainWidth > 0) || !(nativeWidth > 0)) return null;
    const L = READING_LAYOUT;
    const round = value => Math.round(value * 100) / 100;
    if (viewportWidth < L.narrowViewport) return { width: round(Math.max(0, mainWidth - 2 * L.narrowEdge)), shift: 0 };
    const full = Math.max(mainWidth - L.leftEdge - L.railReserve, Math.min(nativeWidth, mainWidth - 2 * L.narrowEdge));
    const width = preset === 'full' ? full : Math.min(L.wideCap, (nativeWidth + full) / 2, full);
    const gap = (mainWidth - width) / 2;
    const shift = Math.min(0, Math.max(L.leftEdge - gap, gap - L.railReserve));
    return { width: round(width), shift: round(shift) || 0 };
  }
  function normalizeBox(rect) {
    if (!rect) return null;
    const left = Number(rect.left);
    const top = Number(rect.top);
    const width = Number.isFinite(Number(rect.width)) ? Number(rect.width) : Number(rect.right) - left;
    const height = Number.isFinite(Number(rect.height)) ? Number(rect.height) : Number(rect.bottom) - top;
    if (!Number.isFinite(left) || !Number.isFinite(top) || !(width > 0) || !(height > 0)) return null;
    const right = Number.isFinite(Number(rect.right)) ? Number(rect.right) : left + width;
    const bottom = Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : top + height;
    return { left, top, right, bottom, width, height };
  }
  function boxOverlapArea(a, b, pad = 0) {
    if (!a || !b) return 0;
    const ox = Math.max(0, Math.min(a.right, b.right + pad) - Math.max(a.left, b.left - pad));
    const oy = Math.max(0, Math.min(a.bottom, b.bottom + pad) - Math.max(a.top, b.top - pad));
    return ox * oy;
  }
  function findCornerFloatingObstacles(root, composer, spec) {
    const scope = root || document;
    const doc = scope?.ownerDocument || scope;
    const view = doc?.defaultView || global;
    const vw = view?.innerWidth || doc?.documentElement?.clientWidth || 0;
    const vh = view?.innerHeight || doc?.documentElement?.clientHeight || 0;
    if (!scope?.querySelectorAll || !view?.getComputedStyle || !(vw > 0) || !(vh > 0)) return [];
    const composerCard = findComposerCard(spec, composer);
    const excludeZone = 'dialog,[role="dialog"],[aria-modal="true"],nav,[role="navigation"],[data-op-owned],[data-op-composer-backdrop="true"]';
    const mainSelector = 'main,[role="main"],chat-window';
    const raw = [...scope.querySelectorAll('button,[role="button"],a[href]')].filter(node => {
      if (!isVisible(node)) return false;
      if (node.closest?.(excludeZone) || node.closest?.(MESSAGE_AREAS)) return false;
      if (composer && (composer.contains?.(node) || node.contains?.(composer))) return false;
      if (composerCard && composerCard !== composer && (composerCard.contains?.(node) || node.contains?.(composerCard))) return false;
      if (node.matches?.(mainSelector) || node.querySelector?.(mainSelector)) return false;
      return true;
    });
    const candidates = raw.length > 240 ? [...raw.slice(0, 120), ...raw.slice(-120)] : raw;
    const found = [];
    for (const node of candidates) {
      for (let cur = node, depth = 0; cur && depth <= 2; cur = cur.parentElement, depth++) {
        if (cur.matches?.(`body,html,${mainSelector}`) || cur.matches?.(excludeZone)) break;
        if (cur === composer || cur === composerCard) break;
        if ((composer && cur.contains?.(composer)) || (composerCard && cur.contains?.(composerCard)) || cur.querySelector?.(mainSelector)) break;
        const pos = view.getComputedStyle(cur).position;
        if (!['fixed', 'absolute', 'sticky'].includes(pos)) continue;
        const rect = normalizeBox(cur.getBoundingClientRect?.());
        if (!rect || rect.width > 260 || rect.height > 160) continue;
        if (rect.right >= vw - 360 && rect.bottom >= vh - 260 && rect.left >= vw * 0.45 && rect.top >= vh * 0.45) {
          found.push({ node: cur, rect });
          break;
        }
      }
    }
    const deduped = [];
    for (const item of found) {
      const idx = deduped.findIndex(other =>
        other.node === item.node ||
        other.node.contains?.(item.node) ||
        item.node.contains?.(other.node) ||
        boxOverlapArea(other.rect, item.rect, 0) > 0
      );
      if (idx < 0) {
        deduped.push(item);
      } else {
        const existing = deduped[idx];
        if (item.node.contains?.(existing.node) && item.node !== existing.node) {
          deduped[idx] = item;
        } else if (!existing.node.contains?.(item.node)) {
          const left = Math.min(existing.rect.left, item.rect.left);
          const top = Math.min(existing.rect.top, item.rect.top);
          const right = Math.max(existing.rect.right, item.rect.right);
          const bottom = Math.max(existing.rect.bottom, item.rect.bottom);
          deduped[idx] = { node: existing.node, rect: { left, top, right, bottom, width: right - left, height: bottom - top } };
        }
      }
    }
    return deduped.map(item => item.rect);
  }
  function dockEdgeMargin(viewportWidth) {
    const narrow = Number(viewportWidth) <= 700;
    return { right: narrow ? 10 : 20, bottom: narrow ? 10 : 18 };
  }
  function pushAwayFromObstacles(obstacles, axis, initialOffset, boxFor, shiftFor, pad) {
    let offset = initialOffset;
    for (let i = 0; i < obstacles.length; i++) {
      let advanced = false;
      for (const obs of obstacles) {
        const box = axis === 'x' ? boxFor(offset, 0) : boxFor(0, offset);
        if (boxOverlapArea(box, obs, pad) > 0) {
          const next = Math.max(offset, shiftFor(obs));
          if (next > offset) { offset = next; advanced = true; }
        }
      }
      if (!advanced) break;
    }
    return offset;
  }
  function computeDockAvoidance({ viewport, dockSize, baseRight, baseBottom, composerRect, railRect, cornerObstacles = [], gap = 10 } = {}) {
    const vw = Number(viewport?.width) || 0;
    const vh = Number(viewport?.height) || 0;
    const dockW = Number(dockSize?.width) || 0;
    const dockH = Number(dockSize?.height) || 0;
    if (!(vw > 0) || !(vh > 0) || !(dockW > 0) || !(dockH > 0)) return { offsetX: 0, offsetY: 0 };
    const margin = 8;
    const defaults = dockEdgeMargin(vw);
    const bRight = Number.isFinite(Number(baseRight)) ? Number(baseRight) : defaults.right;
    const bBottom = Number.isFinite(Number(baseBottom)) ? Number(baseBottom) : defaults.bottom;
    const pad = Math.max(0, Number.isFinite(Number(gap)) ? Number(gap) : 10);
    const baseBox = { left: vw - bRight - dockW, top: vh - bBottom - dockH, right: vw - bRight, bottom: vh - bBottom, width: dockW, height: dockH };
    const boxFor = (x, y) => ({ left: baseBox.left - x, top: baseBox.top - y, right: baseBox.right - x, bottom: baseBox.bottom - y, width: dockW, height: dockH });
    const comp = normalizeBox(composerRect);
    const rail = normalizeBox(railRect);
    const corners = (Array.isArray(cornerObstacles) ? cornerObstacles : []).map(normalizeBox).filter(Boolean);
    const shiftLeftOf = (obs, g = pad) => obs ? Math.max(0, Math.ceil(baseBox.right - (obs.left - g))) : 0;
    const shiftAboveOf = (obs, g = pad) => obs ? Math.max(0, Math.ceil(baseBox.bottom - (obs.top - g))) : 0;
    const neededCornerLeftX = pushAwayFromObstacles(corners, 'x', 0, boxFor, shiftLeftOf, pad);
    const neededCornerUpY = pushAwayFromObstacles(corners, 'y', 0, boxFor, shiftAboveOf, pad);
    const aboveComposerY = shiftAboveOf(comp);
    const maxAboveY = pushAwayFromObstacles(corners, 'y', Math.max(aboveComposerY, neededCornerUpY), boxFor, shiftAboveOf, pad);
    const railClearX = shiftLeftOf(rail);
    const aboveRailY = shiftAboveOf(rail);
    const composerLeftX = shiftLeftOf(comp);
    const bothClearX = Math.max(railClearX, neededCornerLeftX);
    const aboveAllY = Math.max(maxAboveY, aboveRailY);
    const rawCandidates = [
      [0, 0],
      [neededCornerLeftX, 0],
      [0, neededCornerUpY],
      [0, aboveComposerY],
      [railClearX, aboveComposerY],
      [0, maxAboveY],
      [railClearX, maxAboveY],
      [railClearX, 0],
      [railClearX, neededCornerUpY],
      [bothClearX, 0],
      [bothClearX, aboveComposerY],
      [bothClearX, maxAboveY],
      [neededCornerLeftX, aboveComposerY],
      [0, Math.max(aboveComposerY, aboveRailY)],
      [0, aboveAllY],
      [composerLeftX, 0],
      [composerLeftX, neededCornerUpY]
    ];
    const inside = box => box.left >= margin - 0.5 && box.right <= vw - margin + 0.5 && box.top >= margin - 0.5 && box.bottom <= vh - margin + 0.5;
    const isClear = box => inside(box) && boxOverlapArea(box, comp, pad) === 0 && boxOverlapArea(box, rail, pad) === 0 && corners.every(c => boxOverlapArea(box, c, pad) === 0);
    const seen = new Set();
    for (const [rx, ry] of rawCandidates) {
      const x = Math.max(0, Math.round(rx));
      const y = Math.max(0, Math.round(ry));
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (isClear(boxFor(x, y))) return { offsetX: x, offsetY: y };
    }
    const minX = Math.max(0, Math.ceil(baseBox.right - (vw - margin)));
    const maxX = Math.max(0, Math.floor(baseBox.left - margin));
    const minY = Math.max(0, Math.ceil(baseBox.bottom - (vh - margin)));
    const maxY = Math.max(0, Math.floor(baseBox.top - margin));
    const clampX = x => Math.max(0, Math.min(maxX, Math.max(minX, Math.round(x))));
    const clampY = y => Math.max(0, Math.min(maxY, Math.max(minY, Math.round(y))));
    const cornerLeftTight = corners.reduce((m, c) => Math.max(m, shiftLeftOf(c, 0)), 0);
    const cornerUpTight = corners.reduce((m, c) => Math.max(m, shiftAboveOf(c, 0)), 0);
    const fallbackPool = [
      ...rawCandidates,
      [shiftLeftOf(rail, 0), shiftAboveOf(comp, 0)],
      [0, shiftAboveOf(comp, 0)],
      [cornerLeftTight, 0],
      [0, cornerUpTight],
      [railClearX, maxY],
      [0, maxY],
      [maxX, 0],
      [maxX, maxY]
    ];
    const weightedOverlap = (box, p) =>
      10 * boxOverlapArea(box, comp, p) +
      10 * corners.reduce((sum, c) => sum + boxOverlapArea(box, c, p), 0) +
      4 * boxOverlapArea(box, rail, p);
    let best = { offsetX: clampX(0), offsetY: clampY(0) };
    let bestScore = [Infinity, Infinity, Infinity];
    const evalSeen = new Set();
    for (const [rx, ry] of fallbackPool) {
      const x = clampX(rx);
      const y = clampY(ry);
      const key = `${x},${y}`;
      if (evalSeen.has(key)) continue;
      evalSeen.add(key);
      const box = boxFor(x, y);
      const score = [weightedOverlap(box, 0), weightedOverlap(box, pad), x + y];
      if (score[0] < bestScore[0] || (score[0] === bestScore[0] && (score[1] < bestScore[1] || (score[1] === bestScore[1] && score[2] < bestScore[2])))) {
        bestScore = score;
        best = { offsetX: x, offsetY: y };
      }
    }
    return best;
  }
  function forHost(host, root = document) {
    const spec = HOSTS[host];
    if (!spec) return null;
    const collect = selectors => topLevelMatches(selectors, root).filter(isVisible);
    const userTurns = () => findTurns(spec, 'user', root);
    const assistantTurns = () => findTurns(spec, 'assistant', root);
    const messages = () => sortByDocumentOrder([...userTurns(), ...assistantTurns()]);
    return Object.freeze({
      host,
      contentWidth: Object.freeze({ native: spec.contentWidth.native, targets: [...spec.contentWidth.targets], composerTargets: [...spec.contentWidth.composerTargets] }),
      userTurns,
      assistantTurns,
      conversationRoot: () => root.querySelector(spec.conversation) || root.body || root,
      primarySurface: () => findPrimary(spec, root),
      composerSurface: () => findComposer(spec, root),
      composerCardSurface: (composer) => findComposerCard(spec, composer === undefined ? findComposer(spec, root) : composer),
      composerBackdropSurfaces: (composer) => findComposerBackdrops(spec, composer === undefined ? findComposer(spec, root) : composer),
      composerScrimSurface: (composer) => findComposerScrim(spec, composer === undefined ? findComposer(spec, root) : composer),
      composerBelowSiblings: (composer, dock) => {
        const comp = composer === undefined ? findComposer(spec, root) : composer;
        const resolvedDock = dock === undefined ? findComposerScrim(spec, comp) : dock;
        const primary = findPrimary(spec, root);
        const allMessages = messages();
        return findComposerBelowSiblings(comp, resolvedDock, primary, allMessages[allMessages.length - 1] || null);
      },
      composerGrid: (composer) => findComposerGrid(spec, composer === undefined ? findComposer(spec, root) : composer),
      composerEmptyHeaders: (composer, grid) => {
        const comp = composer === undefined ? findComposer(spec, root) : composer;
        const resolvedGrid = grid === undefined ? findComposerGrid(spec, comp) : grid;
        return findComposerEmptyHeaders(spec, comp, resolvedGrid, findComposerAddTrigger(spec, comp), findModelTrigger(spec, root));
      },
      composerAddTrigger: (composer) => findComposerAddTrigger(spec, composer === undefined ? findComposer(spec, root) : composer),
      modelSelectorTrigger: () => findModelTrigger(spec, root),
      composerToolbar: (trailing, modelTrigger) => findComposerToolbar(
        trailing === undefined ? findComposerGrid(spec, findComposer(spec, root))?.trailing : trailing,
        modelTrigger === undefined ? findModelTrigger(spec, root) : modelTrigger
      ),
      modelCapsuleSlot: (trailing, modelTrigger) => findModelCapsuleSlot(
        trailing === undefined ? findComposerGrid(spec, findComposer(spec, root))?.trailing : trailing,
        modelTrigger === undefined ? findModelTrigger(spec, root) : modelTrigger
      ),
      composerPrimaryAction: (composer) => {
        const comp = composer === undefined ? findComposer(spec, root) : composer;
        const grid = findComposerGrid(spec, comp);
        return findComposerPrimaryAction(spec, comp, findComposerAddTrigger(spec, comp), findModelTrigger(spec, root), grid?.trailing || null);
      },
      composerAttachments: (composer) => findComposerAttachments(spec, composer === undefined ? findComposer(spec, root) : composer),
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
      cornerFloatingObstacles: (composer) => findCornerFloatingObstacles(root, composer === undefined ? findComposer(spec, root) : composer, spec),
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
    forHost, contentWidthTarget, dockEdgeMargin, computeDockAvoidance, topLevelMatches, estimateTokens, estimateTurnTokens, cleanTurnText, resolveReferenceCapacity, textOf, visibleText, isOwned, isVisible, isComposerDockOverlaid, isIndependentMessageScroller, scrollContainer
  });
})(globalThis);
