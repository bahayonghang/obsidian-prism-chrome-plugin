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
const optional = ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'];
const expectedScripts = [
  { run_at: 'document_start', js: ['src/config-schema.js', 'src/early-boot.js'], css: ['styles/prism-tokens.css', 'styles/hosts.css'] },
  { run_at: 'document_idle', js: ['src/adapters.js', 'src/content.js'] }
];

function resource(path) {
  assert.equal(typeof path, 'string', 'resource must be a string');
  const clean = path.split('?')[0];
  assert(!clean.startsWith('/') && !clean.includes('..') && !clean.includes('\\') && !/^[a-z]+:/i.test(clean), `non-local resource: ${path}`);
  assert(statSync(resolve(root, clean)).isFile(), `missing resource: ${clean}`);
}

for (const [name, manifest] of [['Chrome', chrome], ['Firefox', firefox]]) {
  assert.equal(manifest.manifest_version, 3, `${name}: MV3 required`);
  assert.equal(manifest.version, pkg.version, `${name}: package version mismatch`);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert(manifest.name.length <= 75 && manifest.description.length <= 132, `${name}: browser store text limit`);
  assert.deepEqual(manifest.permissions, ['storage'], `${name}: unexpected mandatory permission`);
  assert.deepEqual(manifest.host_permissions, hosts, `${name}: unexpected default host access`);
  assert.deepEqual(manifest.optional_host_permissions, optional, `${name}: optional network scope changed`);
  assert.equal(manifest.content_scripts.length, 2);
  manifest.content_scripts.forEach((script, i) => {
    assert.deepEqual(script.matches, hosts, `${name}: content injection scope changed`);
    assert.equal(script.all_frames, false, `${name}: must not inject into frames`);
    assert.equal(script.run_at, expectedScripts[i].run_at);
    assert.deepEqual(script.js, expectedScripts[i].js);
    assert.deepEqual(script.css, expectedScripts[i].css);
    [...script.js, ...(script.css || [])].forEach(resource);
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
const javascript = ['src', 'popup', 'scripts'].flatMap(list).filter(path => ['.js', '.mjs', '.cjs'].includes(extname(path)));
for (const path of javascript) {
  const result = spawnSync(process.execPath, ['--check', resolve(root, path)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${path}: ${result.stderr || result.error || 'syntax check failed'}`);
  if (path.startsWith('src/') || path.startsWith('popup/')) {
    const source = read(path);
    assert(!/\beval\s*\(|\bnew\s+Function\s*\(/.test(source), `${path}: dynamically evaluated code`);
    assert(!/\bimportScripts\s*\(\s*['"]https?:/.test(source), `${path}: remote executable code`);
  }
}
const html = read('popup/popup.html');
assert(!/\son[a-z]+\s*=/i.test(html), 'Popup cannot use inline event handlers');
for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  const source = script[1].match(/\bsrc=["']([^"']+)["']/i);
  assert(source && !script[2].trim(), 'Popup scripts must be packaged external files');
  const path = relative(root, resolve(root, 'popup', source[1]));
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
assert(read('THIRD_PARTY_NOTICES.md').includes('Permission is hereby granted'));
console.log(`Checked ${javascript.length} JavaScript files, both browser manifests, packaged resources, CSP, permissions and notices.`);
