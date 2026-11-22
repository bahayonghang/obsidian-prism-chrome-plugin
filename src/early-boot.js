/* Obsidian Prism Web — early theme initialization. Modified 2026-11-21.
 * GPL-3.0-only. Never place extension settings in website storage. */
(function (global) {
  'use strict';
  const schema = global.ObsidianPrismSchema;
  if (!schema || schema.detectHost() === 'unknown') return;
  // Do not briefly enable defaults before the user's saved disabled state arrives.
  const ready = schema.loadConfig().then(config => {
    if (document.documentElement) schema.applyConfigToRoot(config);
    else {
      const observer = new MutationObserver(() => {
        if (!document.documentElement) return;
        observer.disconnect();
        schema.applyConfigToRoot(config);
      });
      observer.observe(document, { childList: true });
    }
    return config;
  });
  // Expose the same read to the later content script; a failure leaves the host intact.
  global.ObsidianPrismReady = ready;
  ready.catch(() => {});
})(globalThis);
