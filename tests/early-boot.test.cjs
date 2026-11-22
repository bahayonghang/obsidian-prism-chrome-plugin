'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./helpers.cjs');
const source = fs.readFileSync(path.join(ROOT, 'src/early-boot.js'), 'utf8');

test('early boot waits for saved state and never applies an enabled default first', async () => {
  let resolve; const config = new Promise(done => { resolve = done; });
  const applied = [];
  const context = vm.createContext({ document: { documentElement: {} }, ObsidianPrismSchema: { detectHost: () => 'chatgpt', loadConfig: () => config, applyConfigToRoot: value => applied.push(value) } });
  vm.runInContext(source, context);
  assert.equal(applied.length, 0);
  resolve({ enabled: false });
  await context.ObsidianPrismReady;
  assert.deepEqual(applied, [{ enabled: false }]);
});

test('early boot handles document_start before the root element exists', async () => {
  let notify, disconnected = false, applied = 0;
  const document = { documentElement: null };
  const context = vm.createContext({ document, MutationObserver: class {
    constructor(callback) { notify = callback; } observe() {} disconnect() { disconnected = true; }
  }, ObsidianPrismSchema: { detectHost: () => 'gemini', loadConfig: async () => ({ enabled: true }), applyConfigToRoot: () => { applied++; } } });
  vm.runInContext(source, context);
  await context.ObsidianPrismReady;
  assert.equal(applied, 0);
  document.documentElement = {};
  notify();
  assert.equal(applied, 1);
  assert.equal(disconnected, true);
});

test('failed early settings load leaves native appearance untouched', async () => {
  let applied = 0;
  const context = vm.createContext({ document: { documentElement: {} }, ObsidianPrismSchema: { detectHost: () => 'chatgpt', loadConfig: async () => { throw new Error('Storage unavailable'); }, applyConfigToRoot: () => { applied++; } } });
  vm.runInContext(source, context);
  await assert.rejects(context.ObsidianPrismReady, /Storage unavailable/);
  assert.equal(applied, 0);
});
