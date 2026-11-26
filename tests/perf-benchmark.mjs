/**
 * Offline Playwright performance benchmark for Obsidian Prism Web (ChatGPT & Gemini).
 * Developer/CI verification tool — never included in packaged browser extensions.
 *
 * Usage:
 *   node tests/perf-benchmark.mjs                # Run 1x & 25x report for both hosts
 *   node tests/perf-benchmark.mjs --assert       # Enforce v0.4.5 performance budgets
 *   node tests/perf-benchmark.mjs --json         # Print machine-readable JSON only
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const shouldAssert = args.has('--assert');
const jsonOnly = args.has('--json');

let playwright;
try {
  playwright = await import('playwright');
} catch {
  const modules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
  if (!modules) throw new Error('Install developer dependency playwright before running performance benchmarks.');
  const require = createRequire(import.meta.url);
  const mod = await import(pathToFileURL(require.resolve('playwright', { paths: [modules] })).href);
  playwright = mod.chromium ? mod : mod.default;
}

const chromiumType = playwright.chromium;
const executable = process.env.PRISM_BROWSER_EXECUTABLE ||
  (existsSync(chromiumType.executablePath()) ? undefined : existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const launchOptions = { headless: true, ...(executable ? { executablePath: executable } : {}) };

const read = rel => fs.readFile(path.join(ROOT, rel), 'utf8');
const chromeManifest = JSON.parse(await read('manifest.json'));
const hostUrlFor = host => host === 'chatgpt' ? 'https://chatgpt.com/c/perf-benchmark' : 'https://gemini.google.com/app/perf-benchmark';
const hostPatternFor = host => host === 'chatgpt' ? 'https://chatgpt.com/*' : 'https://gemini.google.com/*';

function collectHostAssets(manifest, host) {
  const targetMatch = hostPatternFor(host);
  const css = [];
  const js = [];
  for (const group of manifest.content_scripts || []) {
    if (!Array.isArray(group.matches) || !group.matches.includes(targetMatch)) continue;
    for (const file of group.css || []) if (!css.includes(file)) css.push(file);
    for (const file of group.js || []) if (!js.includes(file)) js.push(file);
  }
  return { css, js };
}

const [chatgptHtml, geminiHtml] = await Promise.all([
  read('tests/fixtures/chatgpt-live.html'),
  read('tests/fixtures/gemini-live.html')
]);

const BUDGETS_25X = Object.freeze({
  initMs: 250,
  initRecalcs: 6,
  scanMs: 15,
  scanGcs: 1500,
  steadySetAttr: 0,
  steadyRemoveAttr: 0,
  scrollMs: 4,
  scrollGcs: 50,
  // 30 steps x 30ms + 250ms trailing settle has ~1150-1190ms OS timer floor; budget caps both wall time and active main-thread work.
  streamWallMs: 1350,
  streamMainThreadMs: 150,
  streamCloneNode: 0,
  streamGcs: 5000
});

async function profileHost(host, baseHtml, cloneCount) {
  const { css: cssFiles, js: jsFiles } = collectHostAssets(chromeManifest, host);
  const [cssSources, jsSources] = await Promise.all([
    Promise.all(cssFiles.map(read)),
    Promise.all(jsFiles.map(async file => ({ file, src: await read(file) })))
  ]);
  const contentScriptEntry = jsSources.find(item => item.file === 'src/content.js');
  const bootScripts = jsSources.filter(item => item.file !== 'src/content.js');

  const browser = await chromiumType.launch(launchOptions);
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');

    const url = hostUrlFor(host);
    await context.route(/^https?:\/\//, route => {
      if (route.request().url() === url) {
        return route.fulfill({ status: 200, contentType: 'text/html', body: baseHtml });
      }
      return route.abort('blockedbyclient');
    });

    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const domStats = await page.evaluate(({ host, cloneCount }) => {
      const turnSel = host === 'chatgpt'
        ? '[data-turn-key], article[data-testid^="conversation-turn-"]'
        : 'user-query, model-response';
      const existing = [...document.querySelectorAll(turnSel)];
      if (existing.length && cloneCount > 1) {
        const parent = existing[existing.length - 1].parentElement;
        const frag = document.createDocumentFragment();
        for (let i = 1; i < cloneCount; i++) {
          for (const node of existing) {
            const clone = node.cloneNode(true);
            if (clone.hasAttribute('data-turn-key')) clone.setAttribute('data-turn-key', `${clone.getAttribute('data-turn-key')}-${i}`);
            frag.appendChild(clone);
          }
        }
        parent.appendChild(frag);
      }
      const nav = document.querySelector('nav, aside, bard-sidenav, side-navigation-v2');
      if (nav) {
        const sampleLink = nav.querySelector('a[href]');
        if (sampleLink && sampleLink.parentElement) {
          const existingLinks = nav.querySelectorAll('a[href]').length;
          for (let i = existingLinks; i < 40; i++) {
            const c = sampleLink.cloneNode(true);
            c.removeAttribute('aria-current');
            c.setAttribute('href', host === 'chatgpt' ? `/c/conv-${i}` : `/app/conv-${i}`);
            c.textContent = `Conversation thread #${i}`;
            sampleLink.parentElement.appendChild(c);
          }
        }
      }
      return {
        totalElements: document.querySelectorAll('*').length,
        turns: document.querySelectorAll(turnSel).length,
        pres: document.querySelectorAll('pre').length,
        buttonsAndLinks: document.querySelectorAll('button,[role="button"],a[href]').length
      };
    }, { host, cloneCount });

    await page.evaluate(() => {
      const store = {};
      window.chrome = {
        runtime: {
          id: 'perf-benchmark',
          sendMessage: (msg, cb) => cb?.({ ok: true, config: store.obsidianPrismWebConfig_v1 || {} }),
          getURL: p => p
        },
        storage: {
          local: {
            get: (keys, cb) => cb?.({ ...store }),
            set: (obj, cb) => { Object.assign(store, obj); cb?.(); }
          },
          onChanged: { addListener: () => {}, removeListener: () => {} }
        }
      };
    });

    const cssStart = await page.evaluate(() => performance.now());
    for (const css of cssSources) await page.addStyleTag({ content: css });
    const cssInjectMs = await page.evaluate(t0 => {
      void document.documentElement.offsetHeight;
      return +(performance.now() - t0).toFixed(2);
    }, cssStart);

    const evalTimes = {};
    for (const { file, src } of bootScripts) {
      evalTimes[file] = await page.evaluate(code => {
        const s = performance.now();
        (0, eval)(code);
        return +(performance.now() - s).toFixed(2);
      }, src);
    }

    await page.evaluate(() => {
      const counts = { qsa: 0, qs: 0, gcs: 0, gbcr: 0, cloneNode: 0, matches: 0, closest: 0, setAttr: 0, removeAttr: 0 };
      window.__perfCounts = counts;
      window.__resetPerfCounts = () => { for (const k of Object.keys(counts)) counts[k] = 0; };
      window.__getPerfCounts = () => ({ ...counts });

      const wrap = (proto, name, key) => {
        const orig = proto[name];
        proto[name] = function (...a) { counts[key]++; return orig.apply(this, a); };
      };
      wrap(Document.prototype, 'querySelectorAll', 'qsa');
      wrap(Element.prototype, 'querySelectorAll', 'qsa');
      wrap(Document.prototype, 'querySelector', 'qs');
      wrap(Element.prototype, 'querySelector', 'qs');
      const origGcs = window.getComputedStyle;
      window.getComputedStyle = function (...a) { counts.gcs++; return origGcs.apply(this, a); };
      wrap(Element.prototype, 'getBoundingClientRect', 'gbcr');
      wrap(Node.prototype, 'cloneNode', 'cloneNode');
      wrap(Element.prototype, 'matches', 'matches');
      wrap(Element.prototype, 'closest', 'closest');
      wrap(Element.prototype, 'setAttribute', 'setAttr');
      wrap(Element.prototype, 'removeAttribute', 'removeAttr');
    });

    const getMetrics = async () => {
      const { metrics } = await cdp.send('Performance.getMetrics');
      const map = Object.fromEntries(metrics.map(m => [m.name, m.value]));
      return {
        layouts: map.LayoutCount,
        recalcs: map.RecalcStyleCount,
        layoutMs: +(map.LayoutDuration * 1000).toFixed(2),
        recalcMs: +(map.RecalcStyleDuration * 1000).toFixed(2),
        scriptMs: +(map.ScriptDuration * 1000).toFixed(2)
      };
    };
    const diff = (a, b) => ({
      layouts: b.layouts - a.layouts,
      recalcs: b.recalcs - a.recalcs,
      layoutMs: +(b.layoutMs - a.layoutMs).toFixed(2),
      recalcMs: +(b.recalcMs - a.recalcMs).toFixed(2),
      scriptMs: +(b.scriptMs - a.scriptMs).toFixed(2)
    });

    const mInit0 = await getMetrics();
    const tInit0 = await page.evaluate(() => { window.__resetPerfCounts(); return performance.now(); });
    await page.evaluate(code => (0, eval)(code), contentScriptEntry.src);
    await page.waitForFunction(() => window.ObsidianPrismRuntime?.diagnostics().passes >= 1);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const initMs = await page.evaluate(t0 => +(performance.now() - t0).toFixed(2), tInit0);
    const initCounts = await page.evaluate(() => window.__getPerfCounts());
    const mInit1 = await getMetrics();

    const exactScan = await page.evaluate(async () => {
      let measured = null;
      const origST = window.setTimeout;
      window.setTimeout = function (fn, delay, ...rest) {
        if (delay >= 150 && delay <= 350) {
          return origST.call(this, () => {
            window.__resetPerfCounts();
            const s = performance.now();
            fn(...rest);
            measured = { ms: +(performance.now() - s).toFixed(2), counts: window.__getPerfCounts() };
          }, delay);
        }
        return origST.call(this, fn, delay, ...rest);
      };
      await new Promise(r => origST(r, 800));
      window.ObsidianPrismRuntime.refresh();
      await new Promise(r => origST(r, 360));
      const withEstimate = measured;
      measured = null;
      window.ObsidianPrismRuntime.refresh();
      await new Promise(r => origST(r, 360));
      const withoutEstimate = measured;
      window.setTimeout = origST;
      return { withEstimate, withoutEstimate };
    });

    const mScroll0 = await getMetrics();
    const scrollFrame = await page.evaluate(async host => {
      const scroller = document.querySelector('[data-op-thread-scroller="true"], [data-op-scroller-fade="true"], infinite-scroller, [data-testid="conversation-scroll-container"], main') || document;
      window.__resetPerfCounts();
      const s = performance.now();
      scroller.dispatchEvent(new Event('scroll', { bubbles: false }));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { ms: +(performance.now() - s).toFixed(2), counts: window.__getPerfCounts() };
    }, host);
    const mScroll1 = await getMetrics();

    const mStream0 = await getMetrics();
    const streamBurst = await page.evaluate(async host => {
      const targetSel = host === 'chatgpt'
        ? '[data-markdown-text-style="assistant-message"] p, [data-message-author-role="assistant"] p'
        : 'model-response .md-content p, model-response p';
      const nodes = document.querySelectorAll(targetSel);
      const p = nodes[nodes.length - 1];
      if (!p) return { error: 'no assistant paragraph' };
      const textNode = document.createTextNode('');
      p.appendChild(textNode);
      window.__resetPerfCounts();
      const s = performance.now();
      for (let i = 0; i < 30; i++) {
        textNode.nodeValue += ` token_${i} `;
        await new Promise(r => setTimeout(r, 30));
      }
      await new Promise(r => setTimeout(r, 250));
      return { wallMs: +(performance.now() - s).toFixed(2), counts: window.__getPerfCounts() };
    }, host);
    const mStream1 = await getMetrics();

    return {
      host,
      cloneCount,
      cssFiles,
      domStats,
      cssInjectMs,
      evalTimes,
      init: { ms: initMs, counts: initCounts, cdp: diff(mInit0, mInit1) },
      scanWithEstimate: exactScan.withEstimate,
      scanWithoutEstimate: exactScan.withoutEstimate,
      scrollFrame: { ...scrollFrame, cdp: diff(mScroll0, mScroll1) },
      streamBurst: { ...streamBurst, cdp: diff(mStream0, mStream1) }
    };
  } finally {
    await browser.close();
  }
}

const results = [];
for (const [host, html] of [['chatgpt', chatgptHtml], ['gemini', geminiHtml]]) {
  results.push(await profileHost(host, html, 1));
  results.push(await profileHost(host, html, 25));
}

if (jsonOnly) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) {
    console.log(`\n=== ${r.host.toUpperCase()} ${r.cloneCount}x (${r.domStats.turns} turns, ${r.domStats.pres} pre, ${r.domStats.totalElements} els) ===`);
    console.log(`  init:   ${r.init.ms}ms | recalcs=${r.init.cdp.recalcs} (${r.init.cdp.recalcMs}ms) | layouts=${r.init.cdp.layouts} (${r.init.cdp.layoutMs}ms) | gCS=${r.init.counts.gcs}`);
    console.log(`  scan+E: ${r.scanWithEstimate?.ms}ms | gCS=${r.scanWithEstimate?.counts.gcs} | qsa=${r.scanWithEstimate?.counts.qsa} | clone=${r.scanWithEstimate?.counts.cloneNode} | setAttr=${r.scanWithEstimate?.counts.setAttr} | rmAttr=${r.scanWithEstimate?.counts.removeAttr}`);
    console.log(`  scan-E: ${r.scanWithoutEstimate?.ms}ms | gCS=${r.scanWithoutEstimate?.counts.gcs} | setAttr=${r.scanWithoutEstimate?.counts.setAttr} | rmAttr=${r.scanWithoutEstimate?.counts.removeAttr}`);
    console.log(`  scroll: ${r.scrollFrame.ms}ms (script=${r.scrollFrame.cdp.scriptMs}ms) | gCS=${r.scrollFrame.counts.gcs} | gBCR=${r.scrollFrame.counts.gbcr} | setAttr=${r.scrollFrame.counts.setAttr} | rmAttr=${r.scrollFrame.counts.removeAttr}`);
    console.log(`  stream: ${r.streamBurst.wallMs}ms (script=${r.streamBurst.cdp.scriptMs}ms, recalc=${r.streamBurst.cdp.recalcMs}ms) | gCS=${r.streamBurst.counts.gcs} | clone=${r.streamBurst.counts.cloneNode}`);
  }
}

if (shouldAssert) {
  for (const r of results.filter(x => x.cloneCount === 25)) {
    const tag = `${r.host} 25x`;
    assert.ok(r.init.ms <= BUDGETS_25X.initMs, `${tag}: init ${r.init.ms}ms > ${BUDGETS_25X.initMs}ms`);
    assert.ok(r.init.cdp.recalcs <= BUDGETS_25X.initRecalcs, `${tag}: init recalcs ${r.init.cdp.recalcs} > ${BUDGETS_25X.initRecalcs}`);
    assert.ok(r.scanWithEstimate.ms <= BUDGETS_25X.scanMs, `${tag}: scan ${r.scanWithEstimate.ms}ms > ${BUDGETS_25X.scanMs}ms`);
    assert.ok(r.scanWithEstimate.counts.gcs <= BUDGETS_25X.scanGcs, `${tag}: scan gCS ${r.scanWithEstimate.counts.gcs} > ${BUDGETS_25X.scanGcs}`);
    assert.equal(r.scanWithoutEstimate.counts.setAttr, BUDGETS_25X.steadySetAttr, `${tag}: steady setAttr ${r.scanWithoutEstimate.counts.setAttr} !== 0`);
    assert.equal(r.scanWithoutEstimate.counts.removeAttr, BUDGETS_25X.steadyRemoveAttr, `${tag}: steady removeAttr ${r.scanWithoutEstimate.counts.removeAttr} !== 0`);
    assert.ok(r.scrollFrame.cdp.scriptMs <= BUDGETS_25X.scrollMs, `${tag}: scroll script ${r.scrollFrame.cdp.scriptMs}ms > ${BUDGETS_25X.scrollMs}ms`);
    assert.ok(r.scrollFrame.counts.gcs <= BUDGETS_25X.scrollGcs, `${tag}: scroll gCS ${r.scrollFrame.counts.gcs} > ${BUDGETS_25X.scrollGcs}`);
    assert.ok(r.streamBurst.wallMs <= BUDGETS_25X.streamWallMs, `${tag}: stream ${r.streamBurst.wallMs}ms > ${BUDGETS_25X.streamWallMs}ms`);
    const streamMainMs = +(r.streamBurst.cdp.scriptMs + r.streamBurst.cdp.recalcMs + r.streamBurst.cdp.layoutMs).toFixed(2);
    assert.ok(streamMainMs <= BUDGETS_25X.streamMainThreadMs, `${tag}: stream main-thread ${streamMainMs}ms > ${BUDGETS_25X.streamMainThreadMs}ms`);
    assert.equal(r.streamBurst.counts.cloneNode, BUDGETS_25X.streamCloneNode, `${tag}: stream cloneNode ${r.streamBurst.counts.cloneNode} !== 0`);
    assert.ok(r.streamBurst.counts.gcs <= BUDGETS_25X.streamGcs, `${tag}: stream gCS ${r.streamBurst.counts.gcs} > ${BUDGETS_25X.streamGcs}`);
  }
  if (!jsonOnly) console.log('\nPASS: all 25x v0.4.5 performance budgets satisfied.');
}
