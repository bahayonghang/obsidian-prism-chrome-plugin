'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('./helpers.cjs');

const PROBE = 'tools/structure-probe.js';

test('structure probe is a syntactically valid developer tool outside every release package', () => {
  const probePath = path.join(ROOT, PROBE);
  assert.ok(fs.existsSync(probePath), `${PROBE} exists`);
  const syntax = spawnSync(process.execPath, ['--check', probePath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
  const build = fs.readFileSync(path.join(ROOT, 'scripts/build.py'), 'utf8');
  const allowlist = build.match(/^FILES = \(([\s\S]*?)^\)/m);
  assert.ok(allowlist, 'build.py keeps an explicit FILES allowlist');
  const packaged = [...allowlist[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.ok(packaged.includes('src/content.js'), 'allowlist parsed');
  assert.deepEqual(packaged.filter(file => file.startsWith('tools/') || /probe/i.test(file)), [], 'no probe file is packaged');
  const manifests = ['manifest.json', 'manifests/firefox.json'].map(file => fs.readFileSync(path.join(ROOT, file), 'utf8'));
  for (const manifest of manifests) assert.equal(manifest.includes('structure-probe'), false, 'no manifest references the probe');
});

test('structure probe documents its run modes and privacy limits', () => {
  const source = fs.readFileSync(path.join(ROOT, PROBE), 'utf8');
  for (const phrase of ['DevTools', 'ego-browser', 'never', 'text']) assert.ok(source.includes(phrase), `probe header mentions ${phrase}`);
  // The probe must not read text-bearing DOM properties at all.
  for (const property of ['textContent', 'innerText', 'innerHTML', 'outerHTML', '.value', 'nodeValue', "getAttribute('aria-label')", "getAttribute('title')", "getAttribute('href')", "getAttribute('src')", "getAttribute('placeholder')"]) {
    assert.equal(source.includes(property), false, `probe never reads ${property}`);
  }
});

function makePNG(width, height, colorType, pixels) {
  const channels = colorType === 6 ? 4 : 3;
  const rows = [];
  const raw = (x, y, c) => (x < 0 || y < 0 ? 0 : pixels[(y * width + x) * channels + c]);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    // Each row uses a different PNG filter type (None, Sub, Up, Average, Paeth), as browser encoders do.
    const filter = y % 5;
    const row = Buffer.alloc(1 + width * channels);
    row[0] = filter;
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        const left = raw(x - 1, y, c), up = raw(x, y - 1, c), corner = raw(x - 1, y - 1, c);
        const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, corner)][filter];
        row[1 + x * channels + c] = (raw(x, y, c) - predictor + 256) & 255;
      }
    }
    rows.push(row);
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = colorType; header[10] = 0; header[11] = 0; header[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

test('measurement PNG decoder returns exact RGBA pixels for RGB and RGBA screenshots', async () => {
  const { decodePNG } = await import('./measure.mjs');
  const rgba = [10, 20, 30, 255, 200, 100, 50, 128, 0, 0, 0, 0, 255, 255, 255, 255, 7, 8, 9, 255, 70, 80, 90, 255];
  const decoded = decodePNG(makePNG(3, 2, 6, rgba));
  assert.equal(decoded.width, 3);
  assert.equal(decoded.height, 2);
  assert.deepEqual(decoded.at(1, 0), { r: 200, g: 100, b: 50, a: 128 });
  assert.deepEqual(decoded.at(2, 1), { r: 70, g: 80, b: 90, a: 255 });
  // Five rows exercise all five filter types.
  const rgb = Array.from({ length: 2 * 5 * 3 }, (_, index) => (index * 53 + 17) % 256);
  const opaque = decodePNG(makePNG(2, 5, 2, rgb));
  for (let y = 0; y < 5; y++) for (let x = 0; x < 2; x++) {
    const offset = (y * 2 + x) * 3;
    assert.deepEqual(opaque.at(x, y), { r: rgb[offset], g: rgb[offset + 1], b: rgb[offset + 2], a: 255 }, `pixel ${x},${y}`);
  }
});
