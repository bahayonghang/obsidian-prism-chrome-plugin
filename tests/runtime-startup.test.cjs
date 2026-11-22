'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness, rootElement } = require('./helpers.cjs');

function delayedRuntime() {
  const h = harness();
  const events = new Map(), mediaEvents = new Map();
  let release;
  const loaded = new Promise(resolve => { release = resolve; });
  const root = rootElement();
  h.context.document = { documentElement: root, body: {}, hidden: false };
  h.context.window = h.context;
  h.context.addEventListener = (type, callback) => events.set(type, callback);
  h.context.removeEventListener = (type, callback) => { if (events.get(type) === callback) events.delete(type); };
  h.context.matchMedia = query => ({ matches: false, addEventListener: (type, callback) => mediaEvents.set(query, callback), removeEventListener: () => mediaEvents.delete(query) });
  h.context.ObsidianPrismAdapters = { forHost: () => ({}) };
  h.context.ObsidianPrismSchema = { ...h.schema, loadConfig: () => loaded };
  h.load('src/content.js');
  return { ...h, events, mediaEvents, root, release, loaded, runtime: h.context.ObsidianPrismRuntime };
}

test('pageshow and media changes cannot activate defaults while saved disabled state is loading', async () => {
  const h = delayedRuntime();
  h.events.get('pageshow')();
  for (const callback of h.mediaEvents.values()) callback();
  assert.equal(h.runtime.diagnostics().enabled, false);
  assert.equal(h.runtime.diagnostics().passes, 0);
  assert.equal(h.root.getAttribute('data-op-enabled'), null);
  h.release({ ...h.schema.DEFAULT_CONFIG, enabled: false });
  await h.loaded;
  await Promise.resolve();
  h.events.get('pageshow')();
  assert.equal(h.runtime.diagnostics().enabled, false);
  assert.equal(h.root.getAttribute('data-op-enabled'), null);
  h.runtime.stop();
});

test('stop before an initial settings result prevents later activation and removes event hooks', async () => {
  const h = delayedRuntime();
  h.runtime.stop();
  assert.equal(h.events.size, 0);
  assert.equal(h.mediaEvents.size, 0);
  h.release({ ...h.schema.DEFAULT_CONFIG, enabled: true });
  await h.loaded;
  await Promise.resolve();
  const status = h.runtime.diagnostics();
  assert.equal(status.enabled, false);
  assert.equal(status.observing, false);
  assert.equal(status.pending, false);
  assert.equal(status.passes, 0);
});
