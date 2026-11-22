'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));

/** An asynchronous browser-API contract double; never accesses a network or user account. */
function harness(options = {}) {
  const kind = options.kind || 'chrome';
  const state = { storage: plain(options.storage || {}), getError: null, setError: null, writes: 0, requests: [], permissions: [], granted: options.granted ?? false, localStorageTouches: 0 };
  const changed = new Set();
  let listener;
  let context;
  const extensionOrigin = kind === 'firefox' ? 'moz-extension://prism-test/' : 'chrome-extension://prism-test/';
  const pageSender = { id: 'prism-test', url: extensionOrigin + 'popup/popup.html?mode=options' };
  const chatSender = { id: 'prism-test', url: 'https://chatgpt.com/c/offline-test', tab: { id: 8 }, frameId: 0 };
  const api = {
    runtime: { id: 'prism-test', getURL: value => extensionOrigin + value, onMessage: { addListener(fn) { listener = fn; } } },
    storage: { local: {}, onChanged: { addListener(fn) { changed.add(fn); }, removeListener(fn) { changed.delete(fn); } } },
    permissions: {}
  };
  if (kind === 'firefox') api.runtime.getBrowserInfo = async () => ({ name: 'Firefox', version: '140.0' });
  function bridge(fn) {
    if (kind === 'firefox') return (...args) => {
      if (args.some(value => typeof value === 'function')) throw new TypeError('Firefox Promise APIs do not take Chrome callbacks');
      return Promise.resolve().then(() => fn(...args));
    };
    return (...args) => {
      const callback = args.pop();
      if (typeof callback !== 'function') throw new TypeError('Expected a Chrome callback');
      Promise.resolve().then(() => fn(...args)).then(value => callback(value), error => {
        api.runtime.lastError = { message: error.message };
        try { callback(undefined); } finally { delete api.runtime.lastError; }
      });
    };
  }
  api.storage.local.get = bridge(async keys => {
    if (state.getError) throw new Error(state.getError);
    await new Promise(resolve => setTimeout(resolve, 1));
    const result = {};
    for (const key of keys || Object.keys(state.storage)) if (Object.hasOwn(state.storage, key)) result[key] = plain(state.storage[key]);
    return result;
  });
  api.storage.local.set = bridge(async values => {
    if (state.setError) throw new Error(state.setError);
    await new Promise(resolve => setTimeout(resolve, 2));
    const changes = {};
    for (const [key, value] of Object.entries(values)) {
      changes[key] = { oldValue: state.storage[key], newValue: plain(value) };
      state.storage[key] = plain(value);
    }
    state.writes++;
    for (const fn of changed) fn(changes, 'local');
  });
  api.permissions.contains = bridge(request => { state.permissions.push(plain(request)); return state.granted; });
  api.runtime.openOptionsPage = bridge(() => undefined);
  function dispatch(message, sender = pageSender) {
    if (!listener) return Promise.reject(new Error('Background listener not loaded'));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Background did not answer')), 1500);
      try { listener(message, sender, value => { clearTimeout(timeout); resolve(plain(value)); }); }
      catch (error) { clearTimeout(timeout); reject(error); }
    });
  }
  api.runtime.sendMessage = bridge(message => dispatch(message));
  const locals = {
    console, URL, AbortController, TextEncoder, TextDecoder, queueMicrotask,
    setTimeout: options.fastTimeout ? (fn, delay, ...args) => setTimeout(fn, delay === 20000 ? 5 : delay, ...args) : setTimeout,
    clearTimeout, setInterval, clearInterval,
    location: { hostname: 'chatgpt.com' }, matchMedia: query => ({ matches: query.includes('reduced-motion') ? Boolean(options.reducedMotion) : false }),
    localStorage: { getItem() { state.localStorageTouches++; throw new Error('Host localStorage must not be read'); }, setItem() { state.localStorageTouches++; throw new Error('Host localStorage must not be written'); } },
    fetch: async (...args) => {
      state.requests.push(args);
      if (options.fetch) return options.fetch(...args);
      return { ok: true, status: 200, headers: { get() { return null; } }, text: async () => JSON.stringify({ choices: [{ message: { content: 'Offline translated text' } }] }) };
    },
    [kind === 'firefox' ? 'browser' : 'chrome']: api
  };
  context = vm.createContext(locals);
  function load(relative) { vm.runInContext(fs.readFileSync(path.join(ROOT, relative), 'utf8'), context, { filename: relative }); }
  locals.importScripts = (...scripts) => scripts.forEach(script => load('src/' + script));
  context.importScripts = locals.importScripts;
  load('src/config-schema.js');
  if (options.background) load('src/background.js');
  return { context, schema: context.ObsidianPrismSchema, state, api, load, dispatch, pageSender, chatSender, extensionOrigin };
}

function rootElement() {
  const attributes = new Map([['class', 'native-site-theme'], ['data-native', 'preserved']]);
  const styleValues = new Map([['--native-color', ['#123456', 'important']]]);
  return {
    get attributes() { return [...attributes].map(([name, value]) => ({ name, value })); },
    getAttribute(key) { return attributes.get(key) ?? null; },
    setAttribute(key, value) { attributes.set(key, String(value)); },
    removeAttribute(key) { attributes.delete(key); },
    style: {
      getPropertyValue(key) { return styleValues.get(key)?.[0] || ''; },
      getPropertyPriority(key) { return styleValues.get(key)?.[1] || ''; },
      setProperty(key, value, priority = '') { styleValues.set(key, [String(value), priority]); },
      removeProperty(key) { styleValues.delete(key); }
    }
  };
}
module.exports = { ROOT, plain, harness, rootElement };
