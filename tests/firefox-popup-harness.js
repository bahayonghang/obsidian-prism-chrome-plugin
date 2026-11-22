/* TEST ONLY. Copied into a temporary Firefox add-on; never shipped in dist.
 * Executes in the extension's own background through public WebExtension APIs.
 * Does not grant permissions, navigate privileged pages, or set popup sizes.
 * SPDX-License-Identifier: GPL-3.0-only
 */
(async () => {
  'use strict';
  const config = globalThis.PRISM_NATIVE_TEST;
  const steps = {};
  let stage = 'harness-start', lastSnapshot = null, completed = false;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  function require(condition, message, detail) {
    if (!condition) { const error = new Error(message); error.detail = detail; throw error; }
  }
  async function request(path, data) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(config.reportUrl + path, {
        method: data ? 'POST' : 'GET', mode: 'cors', credentials: 'omit',
        redirect: 'error', cache: 'no-store', signal: controller.signal,
        ...(data ? {headers: {'Content-Type': 'text/plain;charset=UTF-8'}, body: JSON.stringify(data)} : {})
      });
      require(response.ok, 'Loopback reporter rejected request: ' + response.status);
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  async function report(name, data = {}) {
    stage = name;
    await request('', {kind: 'stage', stage: name, data});
  }
  async function finish(status, error) {
    if (completed) return;
    completed = true;
    clearTimeout(hardDeadline);
    await request('', {kind: 'result', stage: status === 'passed' ? 'passed' : 'failed',
      data: {status, lastStage: stage, steps, lastSnapshot,
        ...(error ? {error: {message: String(error.message || error), stack: error.stack, detail: error.detail}} : {})}});
  }
  const hardDeadline = setTimeout(() => {
    finish('failed', new Error('Extension-owned native-popup checks exceeded 90 seconds')).catch(console.error);
  }, 90000);
  async function waitFor(check, message, timeout = 20000) {
    const deadline = performance.now() + timeout;
    do {
      const result = await check();
      if (result) return result;
      await delay(100);
    } while (!completed && performance.now() < deadline);
    const error = new Error(message); error.detail = lastSnapshot; throw error;
  }
  function popup() {
    const views = browser.extension.getViews({type: 'popup'});
    return views.length === 1 ? views[0] : null;
  }
  function snapshot() {
    const win = popup();
    if (!win || !win.document.body) {
      return (lastSnapshot = {count: browser.extension.getViews({type: 'popup'}).length, ready: false});
    }
    const doc = win.document;
    function box(selector) {
      const node = doc.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect(), css = win.getComputedStyle(node);
      let left = 0, top = 0, right = win.innerWidth, bottom = win.innerHeight;
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const style = win.getComputedStyle(parent), bounds = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          left = Math.max(left, bounds.left); right = Math.min(right, bounds.right);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
        }
      }
      return {x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        visible: rect.width > 0 && rect.height > 0 && css.display !== 'none' &&
          css.visibility === 'visible' && Number(css.opacity) > 0 &&
          rect.left >= left - 1 && rect.right <= right + 1 &&
          rect.top >= top - 1 && rect.bottom <= bottom + 1};
    }
    const fields = doc.getElementById('settings-fields'), status = doc.getElementById('status-msg');
    return (lastSnapshot = {
      count: 1, ready: doc.readyState === 'complete' && Boolean(fields && !fields.disabled),
      width: win.innerWidth, height: win.innerHeight, timeOrigin: win.performance.timeOrigin,
      bodyWidth: doc.body.getBoundingClientRect().width, bodyHeight: doc.body.getBoundingClientRect().height,
      scrollWidth: doc.documentElement.scrollWidth, activeTab: doc.body.dataset.activeTab,
      optionsMode: doc.body.classList.contains('is-options-page'), visible: !doc.hidden,
      saveStatus: status?.textContent, saveError: status?.dataset.error,
      ambientStyle: doc.getElementById('cfg-ambientStyle')?.value,
      ambientIntensity: doc.getElementById('cfg-ambientIntensity')?.value,
      spotlightPressed: doc.querySelector('[data-choice="ambientStyle"][data-value="spotlight"]')?.getAttribute('aria-pressed'),
      previewStyle: doc.getElementById('chat-preview')?.dataset.ambient,
      boxes: Object.fromEntries(['header.brand', 'nav.tabs', '#settings-scroll', 'footer',
        '#cfg-enabled', '#tab-motion', '#cfg-ambientStyle', '#cfg-ambientIntensity',
        '[data-choice="ambientStyle"][data-value="spotlight"]'].map(selector => [selector, box(selector)]))
    });
  }
  function checkLayout(state, motion = false) {
    require(state.count === 1 && state.visible && !state.optionsMode, 'Expected a visible native action popup', state);
    require(state.width >= 438 && state.width <= 442 && state.height >= 598 && state.height <= 602,
      'Native action popup did not acquire its natural 440 x 600 size', state);
    require(state.scrollWidth <= state.width + 1, 'Native popup has horizontal overflow', state);
    const selectors = ['header.brand', 'nav.tabs', '#settings-scroll', 'footer', '#cfg-enabled', '#tab-motion'];
    if (motion) selectors.push('#cfg-ambientStyle', '#cfg-ambientIntensity',
      '[data-choice="ambientStyle"][data-value="spotlight"]');
    for (const selector of selectors) require(state.boxes[selector]?.visible,
      'Native popup control is clipped or missing: ' + selector, state);
    require(state.saveError !== 'true' && Boolean(state.saveStatus), 'Native popup did not load settings successfully', state);
  }
  async function openPopup() {
    const window = await browser.windows.getLastFocused({windowTypes: ['normal']});
    if (!window.focused) await browser.windows.update(window.id, {focused: true});
    await browser.action.openPopup({windowId: window.id});
    let previous = '', stable = 0;
    return waitFor(() => {
      const state = snapshot(), geometry = state.width + ':' + state.height;
      stable = state.ready && state.visible && geometry === previous ? stable + 1 : 0;
      previous = geometry;
      return stable >= 2 ? state : false;
    }, 'Native action popup did not become ready with stable dimensions');
  }
  async function motionTab() {
    require(popup(), 'Native popup disappeared before selecting the motion tab');
    popup().document.getElementById('tab-motion').click();
    return waitFor(() => {
      const state = snapshot();
      return state.activeTab === 'motion' && state.boxes?.['#cfg-ambientIntensity']?.visible ? state : false;
    }, 'Native motion controls did not become visible');
  }
  try {
    require(browser.runtime.id === config.extensionId, 'Harness belongs to an unexpected extension');
    require(browser.runtime.getManifest().version === config.version, 'Unexpected extension version');
    // The runner only signals readiness after temporary installation completes.
    await waitFor(async () => (await request('/ready')).ready, 'Runner did not complete temporary installation');
    await report('harness-ready', {extensionId: browser.runtime.id, manifestVersion: config.version});
    stage = 'first-native-open';
    const initial = await openPopup();
    checkLayout(initial); steps.initial = initial;
    await report('initial', initial);
    const motion = await motionTab();
    checkLayout(motion, true); steps.motion = motion;
    await report('motion', motion);
    stage = 'persist-popup-controls';
    const win = popup(), doc = win.document;
    doc.querySelector('[data-choice="ambientStyle"][data-value="spotlight"]').click();
    const range = doc.getElementById('cfg-ambientIntensity');
    range.value = '77';
    range.dispatchEvent(new win.Event('input', {bubbles: true}));
    range.dispatchEvent(new win.Event('change', {bubbles: true}));
    const saved = await waitFor(async () => {
      const key = ObsidianPrismSchema.STORAGE_KEY;
      const values = await browser.storage.local.get(key), cfg = values[key];
      return cfg?.ambientStyle === 'spotlight' && cfg.ambientIntensity === 77 ?
        {ambientStyle: cfg.ambientStyle, ambientIntensity: cfg.ambientIntensity, thoughtTranslate: cfg.thoughtTranslate} : false;
    }, 'Changes made through native popup controls were not saved');
    require(saved.thoughtTranslate === false, 'Optional remote translation must remain disabled');
    steps.savedConfig = saved;
    await report('saved', saved);
    stage = 'native-close-and-reopen';
    popup().close();
    await waitFor(() => browser.extension.getViews({type: 'popup'}).length === 0, 'Native popup did not close');
    const reopened = await openPopup();
    checkLayout(reopened);
    require(reopened.timeOrigin !== initial.timeOrigin, 'Native popup was not recreated after close');
    require(reopened.ambientStyle === 'spotlight' && reopened.ambientIntensity === '77' &&
      reopened.previewStyle === 'spotlight' && reopened.spotlightPressed === 'true',
      'Reopened native popup did not restore saved controls and preview', reopened);
    steps.reopened = reopened;
    const reopenedMotion = await motionTab();
    checkLayout(reopenedMotion, true); steps.reopenedMotion = reopenedMotion;
    await report('reopened', reopenedMotion);
    await finish('passed');
  } catch (error) {
    console.error('PRISM_NATIVE_FIREFOX_FAILURE', stage, error);
    await finish('failed', error).catch(reportError => console.error('PRISM_NATIVE_REPORT_FAILURE', reportError));
  }
})();
