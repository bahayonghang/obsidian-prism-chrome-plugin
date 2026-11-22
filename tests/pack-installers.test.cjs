'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function buildMinimalZip(entryName = 'manifest.json', content = '{"manifest_version":3}') {
  const nameBuf = Buffer.from(entryName, 'utf8');
  const dataBuf = Buffer.from(content, 'utf8');
  const crc = 0xdeadbeef;

  const localHeader = Buffer.alloc(30 + nameBuf.length);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt16LE(0, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(dataBuf.length, 18);
  localHeader.writeUInt32LE(dataBuf.length, 22);
  localHeader.writeUInt16LE(nameBuf.length, 26);
  localHeader.writeUInt16LE(0, 28);
  nameBuf.copy(localHeader, 30);

  const centralHeader = Buffer.alloc(46 + nameBuf.length);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(0, 10);
  centralHeader.writeUInt16LE(0, 12);
  centralHeader.writeUInt16LE(0, 14);
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(dataBuf.length, 20);
  centralHeader.writeUInt32LE(dataBuf.length, 24);
  centralHeader.writeUInt16LE(nameBuf.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(0, 42);
  nameBuf.copy(centralHeader, 46);

  const centralOffset = localHeader.length + dataBuf.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralHeader.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localHeader, dataBuf, centralHeader, eocd]);
}

async function loadPackager() {
  return import('../scripts/pack-installers.mjs');
}

test('varint and protobuf encoding handle high field number 10000 accurately', async () => {
  const { encodeVarint, encodeLengthDelimited, decodeProtobufFields } = await loadPackager();

  assert.deepEqual(encodeVarint(0), Buffer.from([0x00]));
  assert.deepEqual(encodeVarint(127), Buffer.from([0x7f]));
  assert.deepEqual(encodeVarint(128), Buffer.from([0x80, 0x01]));

  const payload = Buffer.from('0123456789abcdef', 'ascii');
  const encoded = encodeLengthDelimited(10000, payload);
  assert.deepEqual(encoded.subarray(0, 3), Buffer.from([0x82, 0xf1, 0x04]));

  const decoded = decodeProtobufFields(encoded);
  assert.equal(decoded.get(10000).length, 1);
  assert.deepEqual(decoded.get(10000)[0], payload);
});

test('packCrx3 and verifyCrx3 produce deterministic valid CRX3 binaries', async () => {
  const { packCrx3, verifyCrx3 } = await loadPackager();
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const zip = buildMinimalZip();

  const first = packCrx3(zip, privateKey);
  const second = packCrx3(zip, privateKey);

  assert.equal(first.crxBuffer.subarray(0, 4).toString('ascii'), 'Cr24');
  assert.equal(first.crxBuffer.readUInt32LE(4), 3);
  assert.match(first.extensionId, /^[a-p]{32}$/);
  assert.equal(Buffer.compare(first.crxBuffer, second.crxBuffer), 0);

  const headerLength = first.crxBuffer.readUInt32LE(8);
  const extractedZip = first.crxBuffer.subarray(12 + headerLength);
  assert.equal(Buffer.compare(extractedZip, zip), 0);

  const verified = verifyCrx3(first.crxBuffer, zip);
  assert.equal(verified.version, 3);
  assert.equal(verified.extensionId, first.extensionId);
  assert.equal(verified.zipSize, zip.length);
});

test('verifyCrx3 rejects tampered ZIP, tampered crx_id, and bad magic bytes', async () => {
  const { packCrx3, verifyCrx3 } = await loadPackager();
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const zip = buildMinimalZip();
  const { crxBuffer } = packCrx3(zip, privateKey);

  const tamperedZip = Buffer.from(crxBuffer);
  tamperedZip[tamperedZip.length - 1] ^= 0x01;
  assert.throws(() => verifyCrx3(tamperedZip), /signature verification failed/i);

  const headerLen = crxBuffer.readUInt32LE(8);
  const tamperedId = Buffer.from(crxBuffer);
  tamperedId[12 + headerLen - 1] ^= 0x01;
  assert.throws(() => verifyCrx3(tamperedId), /No CRX3 proof matches|signature verification failed/i);

  const tamperedMagic = Buffer.from(crxBuffer);
  tamperedMagic.write('Cr23', 0, 4, 'ascii');
  assert.throws(() => verifyCrx3(tamperedMagic), /Invalid CRX magic header/i);
});

test('packInstallers creates and reuses PEM key for deterministic .crx and .xpi outputs', async () => {
  const { packInstallers, verifyCrx3 } = await loadPackager();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-pack-test-'));

  try {
    const distDir = path.join(tempRoot, 'dist');
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, 'package.json'),
      JSON.stringify({ name: 'test-ext', version: '0.2.1' }),
      'utf8'
    );

    const chromeZip = buildMinimalZip('manifest.json', '{"manifest_version":3,"name":"chrome"}');
    const firefoxZip = buildMinimalZip('manifest.json', '{"manifest_version":3,"name":"firefox"}');
    fs.writeFileSync(path.join(distDir, 'obsidian-prism-web-0.2.1-chrome.zip'), chromeZip);
    fs.writeFileSync(path.join(distDir, 'obsidian-prism-web-0.2.1-firefox.zip'), firefoxZip);

    const keyPath = path.join(tempRoot, '.keys', 'chrome-dev.pem');
    const first = packInstallers({ root: tempRoot, distDir, keyPath });
    assert.equal(first.keyGenerated, true);
    assert.equal(fs.existsSync(keyPath), true);
    assert.equal(fs.existsSync(first.crxPath), true);
    assert.equal(fs.existsSync(first.xpiPath), true);
    assert.equal(fs.existsSync(first.checksumPath), true);

    const firstCrxBytes = fs.readFileSync(first.crxPath);
    const firstXpiBytes = fs.readFileSync(first.xpiPath);
    assert.equal(Buffer.compare(firstXpiBytes, firefoxZip), 0);
    assert.equal(verifyCrx3(firstCrxBytes, chromeZip).extensionId, first.extensionId);

    const second = packInstallers({ root: tempRoot, distDir, keyPath });
    assert.equal(second.keyGenerated, false);
    assert.equal(second.extensionId, first.extensionId);
    assert.equal(Buffer.compare(fs.readFileSync(second.crxPath), firstCrxBytes), 0);
    assert.equal(Buffer.compare(fs.readFileSync(second.xpiPath), firstXpiBytes), 0);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
