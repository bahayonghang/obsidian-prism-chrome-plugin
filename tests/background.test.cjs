'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers.cjs');

function configure(h) {
  h.state.storage[h.schema.STORAGE_KEY] = {
    ...h.schema.DEFAULT_CONFIG, thoughtTranslate: true,
    thoughtEndpoint: 'https://translate.example.test/v1/chat/completions', thoughtModel: 'offline-model'
  };
}

for (const kind of ['chrome', 'firefox']) {
  test(`${kind}: an extension options page remains trusted when displayed in a browser tab`, async () => {
    const h = harness({ kind, background: true });
    const result = await h.dispatch({ type: 'OP_CONFIG_PATCH', patch: { palette: 'warm' } }, { ...h.pageSender, tab: { id: 9 } });
    assert.equal(result.ok, true);
    assert.equal(result.config.palette, 'warm');
  });

  test(`${kind}: remote pages cannot change settings or read/write secrets`, async () => {
    const h = harness({ kind, background: true });
    const senders = [h.chatSender, { ...h.pageSender, id: 'another-extension' }, { ...h.pageSender, url: 'https://chatgpt.com/' }, {}];
    for (const sender of senders) for (const message of [
      { type: 'OP_CONFIG_PATCH', patch: { enabled: false } },
      { type: 'OP_CONFIG_RESET' },
      { type: 'OP_SECRETS_STATUS' },
      { type: 'OP_SECRETS_SET', apiKey: 'FAKE_SECRET' }
    ]) assert.deepEqual(await h.dispatch(message, sender), { ok: false, error: 'UNTRUSTED_SENDER' });
    assert.equal(h.state.writes, 0);
    assert.equal(h.state.requests.length, 0);
  });

  test(`${kind}: OP_CONTENT_WIDTH_SET accepts page or trusted top-frame chat, validates enum, and keeps OP_CONFIG_PATCH restricted to page`, async () => {
    const h = harness({ kind, background: true });
    const fromPage = await h.dispatch({ type: 'OP_CONTENT_WIDTH_SET', contentWidth: 'wide' }, h.pageSender);
    assert.equal(fromPage.ok, true);
    assert.equal(fromPage.config.contentWidth, 'wide');

    const fromChat = await h.dispatch({ type: 'OP_CONTENT_WIDTH_SET', contentWidth: 'full' }, h.chatSender);
    assert.equal(fromChat.ok, true);
    assert.equal(fromChat.config.contentWidth, 'full');

    const badSenders = [
      { ...h.pageSender, id: 'another-extension' },
      { ...h.chatSender, id: 'another-extension' },
      { ...h.chatSender, frameId: 2 },
      { ...h.chatSender, url: 'http://chatgpt.com/' },
      { ...h.chatSender, url: 'https://example.test/' },
      {}
    ];
    for (const sender of badSenders) {
      assert.deepEqual(await h.dispatch({ type: 'OP_CONTENT_WIDTH_SET', contentWidth: 'standard' }, sender), { ok: false, error: 'UNTRUSTED_SENDER' });
    }

    for (const invalid of ['narrow', 'ultra', '', null, 123, true]) {
      assert.deepEqual(await h.dispatch({ type: 'OP_CONTENT_WIDTH_SET', contentWidth: invalid }, h.chatSender), { ok: false, error: 'INVALID_CONTENT_WIDTH' });
    }

    assert.deepEqual(await h.dispatch({ type: 'OP_CONFIG_PATCH', patch: { contentWidth: 'standard' } }, h.chatSender), { ok: false, error: 'UNTRUSTED_SENDER' });
  });

  test(`${kind}: secrets remain separate from ordinary and exported configuration`, async () => {
    const h = harness({ kind, background: true });
    configure(h);
    assert.deepEqual(await h.dispatch({ type: 'OP_SECRETS_SET', apiKey: 'FAKE_SECRET' }), { ok: true, configured: true });
    assert.deepEqual(await h.dispatch({ type: 'OP_SECRETS_STATUS' }), { ok: true, configured: true });
    const saved = await h.schema.saveConfig({ palette: 'warm', thoughtApiKey: 'UNTRUSTED_KEY' });
    assert.equal(JSON.stringify(saved).includes('SECRET'), false);
    assert.equal(JSON.stringify(saved).includes('UNTRUSTED_KEY'), false);
    assert.equal(h.state.storage[h.schema.SECRETS_KEY].apiKey, 'FAKE_SECRET');
    assert.equal(Object.hasOwn(h.state.storage[h.schema.STORAGE_KEY], 'thoughtApiKey'), false);
    assert.deepEqual(await h.dispatch({ type: 'OP_SECRETS_SET', apiKey: 'a\r\nAuthorization: malicious' }), { ok: false, error: 'INVALID_API_KEY' });
    await h.dispatch({ type: 'OP_SECRETS_SET', apiKey: '' });
    assert.deepEqual(await h.dispatch({ type: 'OP_SECRETS_STATUS' }), { ok: true, configured: false });
  });

  test(`${kind}: no translation request is sent by default or without explicit permission`, async () => {
    const h = harness({ kind, background: true });
    assert.equal(h.state.requests.length, 0, 'background startup is network-free');
    assert.deepEqual(await h.dispatch({ type: 'OP_TRANSLATE', text: 'Visible sample text' }, h.chatSender), { ok: false, error: 'TRANSLATION_NOT_CONFIGURED' });
    configure(h);
    assert.deepEqual(await h.dispatch({ type: 'OP_TRANSLATE', text: 'Visible sample text' }, h.chatSender), { ok: false, error: 'TRANSLATION_PERMISSION_REQUIRED' });
    assert.equal(h.state.requests.length, 0);
  });

  test(`${kind}: translation accepts only this extension's top-frame supported-site sender`, async () => {
    const h = harness({ kind, background: true, granted: true });
    configure(h);
    const badSenders = [h.pageSender, { ...h.chatSender, id: 'other' }, { ...h.chatSender, frameId: 2 }, { ...h.chatSender, url: 'https://chatgpt.com.evil.test/' }, { ...h.chatSender, url: 'http://chatgpt.com/' }, { ...h.chatSender, url: 'https://example.test/' }];
    for (const sender of badSenders) assert.deepEqual(await h.dispatch({ type: 'OP_TRANSLATE', text: 'Visible text' }, sender), { ok: false, error: 'UNTRUSTED_SENDER' });
    assert.equal(h.state.requests.length, 0);
  });

  test(`${kind}: authorized manual translation uses stored endpoint with secure fetch options`, async () => {
    const h = harness({ kind, background: true, granted: true });
    configure(h);
    await h.dispatch({ type: 'OP_SECRETS_SET', apiKey: 'FAKE_SECRET' });
    const result = await h.dispatch({ type: 'OP_TRANSLATE', text: 'Only this visible text', endpoint: 'https://evil.test/', apiKey: 'OVERRIDE' }, h.chatSender);
    assert.deepEqual(result, { ok: true, text: 'Offline translated text' });
    assert.equal(h.state.requests.length, 1);
    const [url, options] = h.state.requests[0];
    assert.equal(url, 'https://translate.example.test/v1/chat/completions');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.headers.Authorization, 'Bearer FAKE_SECRET');
    assert.equal(JSON.parse(options.body).messages[1].content, 'Only this visible text');
    assert.equal(JSON.parse(options.body).model, 'offline-model');
    assert.equal(JSON.parse(options.body).stream, false);
  });
}

test('changing the endpoint never forwards an old endpoint-bound API key', async () => {
  const h = harness({ background: true, granted: true });
  configure(h);
  await h.dispatch({ type: 'OP_SECRETS_SET', apiKey: 'FAKE_ENDPOINT_BOUND_SECRET' });
  await h.schema.saveConfig({ thoughtEndpoint: 'https://different.example.test/v1/chat/completions' });
  assert.deepEqual(await h.dispatch({ type: 'OP_SECRETS_STATUS' }), { ok: true, configured: false });
  assert.equal((await h.dispatch({ type: 'OP_TRANSLATE', text: 'Visible text' }, h.chatSender)).ok, true);
  assert.equal(h.state.requests[0][0], 'https://different.example.test/v1/chat/completions');
  assert.equal(Object.hasOwn(h.state.requests[0][1].headers, 'Authorization'), false);
});

test('master and per-site disable also block background translation requests', async () => {
  for (const [patch, url] of [[{ enabled: false }, 'https://chatgpt.com/'], [{ enableChatGPT: false }, 'https://chatgpt.com/'], [{ enableGemini: false }, 'https://gemini.google.com/']]) {
    const h = harness({ background: true, granted: true });
    configure(h);
    await h.schema.saveConfig(patch);
    const response = await h.dispatch({ type: 'OP_TRANSLATE', text: 'Visible text' }, { ...h.chatSender, url });
    assert.deepEqual(response, { ok: false, error: 'TRANSLATION_NOT_CONFIGURED' });
    assert.equal(h.state.requests.length, 0);
  }
});

test('translation rejects empty/oversized input before any network request', async () => {
  const h = harness({ background: true, granted: true });
  configure(h);
  for (const text of ['', '   ', null, 'x'.repeat(12001)]) assert.deepEqual(await h.dispatch({ type: 'OP_TRANSLATE', text }, h.chatSender), { ok: false, error: 'INVALID_TRANSLATION_TEXT' });
  assert.equal(h.state.requests.length, 0);
});

test('translation rejects redirects/network failures without exposing sensitive error text', async () => {
  const h = harness({ background: true, granted: true, fetch: async () => { throw new Error('FAKE_SECRET private response body'); } });
  configure(h);
  assert.deepEqual(await h.dispatch({ type: 'OP_TRANSLATE', text: 'Visible text' }, h.chatSender), { ok: false, error: 'TRANSLATION_REQUEST_FAILED' });
});

test('translation aborts a stalled request and returns a bounded timeout error', async () => {
  const h = harness({ background: true, granted: true, fastTimeout: true, fetch: (_, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))) });
  configure(h);
  assert.deepEqual(await h.dispatch({ type: 'OP_TRANSLATE', text: 'Visible text' }, h.chatSender), { ok: false, error: 'TRANSLATION_TIMEOUT' });
});

test('translation bounds HTTP errors and oversized or invalid responses', async () => {
  const cases = [
    [{ ok: false, status: 429 }, 'TRANSLATION_HTTP_429'],
    [{ ok: true, headers: { get: () => '524289' }, text: async () => 'never read' }, 'TRANSLATION_RESPONSE_TOO_LARGE'],
    [{ ok: true, headers: { get: () => null }, text: async () => 'x'.repeat(524289) }, 'TRANSLATION_RESPONSE_TOO_LARGE'],
    [{ ok: true, headers: { get: () => null }, text: async () => 'invalid-json' }, 'TRANSLATION_REQUEST_FAILED'],
    [{ ok: true, headers: { get: () => null }, text: async () => JSON.stringify({ choices: [{ message: { content: '' } }] }) }, 'TRANSLATION_INVALID_RESPONSE']
  ];
  for (const [response, error] of cases) {
    const h = harness({ background: true, granted: true, fetch: async () => response });
    configure(h);
    assert.deepEqual(await h.dispatch({ type: 'OP_TRANSLATE', text: 'Visible text' }, h.chatSender), { ok: false, error });
  }
});

test('a headerless oversized response is aborted while streaming, before buffering its full body', async () => {
  let reads = 0, released = false;
  const h = harness({ background: true, granted: true, fetch: async () => ({
    ok: true, headers: { get: () => null },
    body: { getReader: () => ({
      read: async () => { reads++; return { done: false, value: new Uint8Array(300000) }; },
      releaseLock: () => { released = true; }
    }) }
  }) });
  configure(h);
  assert.deepEqual(await h.dispatch({ type: 'OP_TRANSLATE', text: 'Visible text' }, h.chatSender), { ok: false, error: 'TRANSLATION_RESPONSE_TOO_LARGE' });
  assert.equal(reads, 2);
  assert.equal(released, true);
  assert.equal(h.state.requests[0][1].signal.aborted, true);
});
