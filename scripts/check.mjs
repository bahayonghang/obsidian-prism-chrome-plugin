// Community WebExtension validation, 2026-11-21. GPL-3.0-only.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const json = path => JSON.parse(read(path));
const chrome = json('manifest.json');
const firefox = json('manifests/firefox.json');
const pkg = json('package.json');
const hosts = ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://gemini.google.com/*'];
const chatgptHosts = ['https://chatgpt.com/*', 'https://chat.openai.com/*'];
const geminiHosts = ['https://gemini.google.com/*'];
const optional = ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'];
const expectedScripts = [
  { matches: hosts, run_at: 'document_start', js: ['src/config-schema.js', 'src/early-boot.js'], css: ['styles/prism-tokens.css', 'styles/common.css'] },
  { matches: chatgptHosts, run_at: 'document_start', css: ['styles/host-chatgpt.css'] },
  { matches: geminiHosts, run_at: 'document_start', css: ['styles/host-gemini.css'] },
  { matches: hosts, run_at: 'document_idle', css: ['vendor/temml/temml-local.css'], js: ['vendor/temml/temml.min.js', 'src/formula.js', 'src/adapters.js', 'src/content.js'] }
];

function resource(path) {
  assert.equal(typeof path, 'string', 'resource must be a string');
  const clean = path.split('?')[0];
  assert(!clean.startsWith('/') && !clean.includes('..') && !clean.includes('\\') && !/^[a-z]+:/i.test(clean), `non-local resource: ${path}`);
  assert(statSync(resolve(root, clean)).isFile(), `missing resource: ${clean}`);
}

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
function assertChromeUtf8(filePath) {
  const bytes = readFileSync(resolve(root, filePath));
  const text = utf8Decoder.decode(bytes);
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i);
    if (cp > 0xffff) i++;
    assert(
      cp !== 0 && !(cp >= 0xfdd0 && cp <= 0xfdef) && (cp & 0xfffe) !== 0xfffe,
      `${filePath}: contains raw Unicode noncharacter/NUL U+${cp.toString(16).toUpperCase()} rejected by Chromium's MV3 UTF-8 content-script loader`
    );
  }
}

for (const [name, manifest] of [['Chrome', chrome], ['Firefox', firefox]]) {
  assert.equal(manifest.manifest_version, 3, `${name}: MV3 required`);
  assert.equal(manifest.version, pkg.version, `${name}: package version mismatch`);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert(manifest.name.length <= 75 && manifest.description.length <= 132, `${name}: browser store text limit`);
  assert.deepEqual(manifest.permissions, ['storage'], `${name}: unexpected mandatory permission`);
  assert.deepEqual(manifest.host_permissions, hosts, `${name}: unexpected default host access`);
  assert.deepEqual(manifest.optional_host_permissions, optional, `${name}: optional network scope changed`);
  assert.equal(manifest.content_scripts.length, expectedScripts.length);
  manifest.content_scripts.forEach((script, i) => {
    assert.deepEqual(script.matches, expectedScripts[i].matches, `${name}: content injection scope changed`);
    assert.equal(script.all_frames, false, `${name}: must not inject into frames`);
    assert.equal(script.run_at, expectedScripts[i].run_at);
    assert.deepEqual(script.js, expectedScripts[i].js);
    assert.deepEqual(script.css, expectedScripts[i].css);
    [...(script.js || []), ...(script.css || [])].forEach(file => { resource(file); assertChromeUtf8(file); });
  });
  const csp = manifest.content_security_policy?.extension_pages || '';
  assert(csp.includes("script-src 'self'") && csp.includes("object-src 'none'"));
  assert(!/unsafe-eval|unsafe-inline|https?:|\*/.test(csp), `${name}: unsafe extension CSP`);
  assert.equal(manifest.options_ui.open_in_tab, true);
  assert.equal(manifest.action.default_popup, 'popup/popup.html');
  resource(manifest.action.default_popup);
  resource(manifest.options_ui.page);
  Object.values(manifest.icons).forEach(resource);
  Object.values(manifest.action.default_icon).forEach(resource);
  assert.equal(manifest.web_accessible_resources, undefined, `${name}: no public extension resources required`);
  assert.equal(manifest.externally_connectable, undefined, `${name}: no external messaging required`);
}

assert.deepEqual(chrome.background, { service_worker: 'src/background.js' });
assert.equal(chrome.minimum_chrome_version, '111');
assert.equal(chrome.browser_specific_settings, undefined);
assert.deepEqual(firefox.background, { scripts: ['src/config-schema.js', 'src/background.js'] });
assert.equal(firefox.minimum_chrome_version, undefined);
assert.equal(firefox.browser_specific_settings.gecko.strict_min_version, '140.0');
assert.equal(firefox.browser_specific_settings.gecko.id, 'obsidian-prism-web@bahayonghang.github.io');
assert.deepEqual(firefox.browser_specific_settings.gecko.data_collection_permissions, {
  required: ['none'], optional: ['websiteContent', 'personalCommunications', 'authenticationInfo']
});
resource(chrome.background.service_worker);
firefox.background.scripts.forEach(resource);

function list(directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? list(path) : [path];
  });
}
// tools/ holds developer-only scripts (the structure probe); they are syntax-checked but never packaged.
const javascript = ['src', 'popup', 'scripts', 'tools', 'vendor'].flatMap(list).filter(path => ['.js', '.mjs', '.cjs'].includes(extname(path)));
for (const path of javascript) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, path)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${path}: ${result.stderr || result.error || 'syntax check failed'}`);
  if (path.startsWith('src/') || path.startsWith('popup/') || path.startsWith('vendor/')) {
    const source = read(path);
    assert(!/\beval\s*\(|\bnew\s+Function\s*\(/.test(source), `${path}: dynamically evaluated code`);
    assert(!/\bimportScripts\s*\(\s*['"]https?:/.test(source), `${path}: remote executable code`);
  }
  if (path.startsWith('vendor/') || path === 'src/formula.js') {
    const source = read(path);
    assert(!/\b(?:innerHTML|outerHTML)\b|\bdocument\.write\s*\(/.test(source), `${path}: forbidden DOM HTML injection`);
  }
}
const temmlCss = read('vendor/temml/temml-local.css');
const temmlCssCode = temmlCss.replace(/\/\*[\s\S]*?\*\//g, '');
assert(!/@font-face\b|@import\b|\.woff2?\b|url\(\s*['"]?https?:/i.test(temmlCssCode), 'vendor/temml/temml-local.css: forbidden webfont, @import, or remote url');
assert(!/^\s*(?:body|math)(?![\w-])/m.test(temmlCssCode), 'vendor/temml/temml-local.css: unscoped body or math rule');

function splitTopLevelSelectors(selectorText) {
  const parts = [];
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < selectorText.length; i++) {
    const ch = selectorText[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === '[') bracketDepth++;
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === ',' && parenDepth === 0 && bracketDepth === 0) {
      const part = selectorText.slice(start, i).trim();
      if (part) parts.push(part);
      start = i + 1;
    }
  }
  const tail = selectorText.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

function parseCssRules(css) {
  const rules = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open === -1) break;
    const selector = css.slice(i, open).trim();
    let depth = 1;
    let quote = '';
    let j = open + 1;
    while (j < css.length && depth > 0) {
      const ch = css[j];
      if (quote) {
        if (ch === '\\') j++;
        else if (ch === quote) quote = '';
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
      }
      j++;
    }
    const body = css.slice(open + 1, j - 1).trim();
    if (selector.startsWith('@')) {
      rules.push({ selector, body, isAtRule: true, nested: parseCssRules(body) });
    } else if (selector) {
      rules.push({ selector, body, isAtRule: false });
    }
    i = j;
  }
  return rules;
}

function validateTemmlSelectors(rules) {
  for (const rule of rules) {
    if (rule.isAtRule) {
      if (!/^@keyframes\b/i.test(rule.selector)) validateTemmlSelectors(rule.nested);
      continue;
    }
    for (const sel of splitTopLevelSelectors(rule.selector)) {
      assert(sel.startsWith('html[data-op-enabled="true"] .op-formula-preview'), `vendor/temml/temml-local.css: unscoped selector "${sel}"`);
    }
  }
}
validateTemmlSelectors(parseCssRules(temmlCssCode));
const html = read('popup/popup.html');
assert(!/\son[a-z]+\s*=/i.test(html), 'Popup cannot use inline event handlers');
for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  const source = script[1].match(/\bsrc=["']([^"']+)["']/i);
  assert(source && !script[2].trim(), 'Popup scripts must be packaged external files');
  assert(!source[1].includes('\\'), `non-local resource: ${source[1]}`);
  const path = relative(root, resolve(root, 'popup', source[1])).replaceAll('\\', '/');
  resource(path);
}
for (const [size, path] of Object.entries(chrome.icons)) {
  const bytes = readFileSync(resolve(root, path));
  assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${path}: invalid PNG`);
  assert.equal(bytes.readUInt32BE(16), Number(size), `${path}: incorrect width`);
  assert.equal(bytes.readUInt32BE(20), Number(size), `${path}: incorrect height`);
}
for (const path of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'README.md', 'PRIVACY.md', 'MODIFICATIONS.md', 'docs/ARCHITECTURE.md', 'docs/TESTING.md', 'docs/IMPLEMENTATION_PLAN.md']) resource(path);
assert(read('LICENSE').includes('GNU GENERAL PUBLIC LICENSE'));
assert(read('NOTICE').includes('RMvdesi'));
const notices = read('THIRD_PARTY_NOTICES.md');
assert(notices.includes('Permission is hereby granted'));
assert(notices.includes('Temml') && notices.includes('0.14.0') && notices.includes('Ron Kok'), 'THIRD_PARTY_NOTICES.md must credit Temml 0.14.0 by Ron Kok');
console.log(`Checked ${javascript.length} JavaScript files, both browser manifests, packaged resources, CSP, permissions and notices.`);
