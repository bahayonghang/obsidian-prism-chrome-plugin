#!/usr/bin/env node
// Reproducible CRX3 and unsigned XPI packager. Modified 2026-11-22. GPL-3.0-only.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_KEY_REL = '.keys/chrome-dev.pem';
const CRX_MAGIC = Buffer.from('Cr24', 'ascii');
const CRX_VERSION = 3;
const CRX_SIGNED_DATA_CONTEXT = Buffer.from('CRX3 SignedData\0', 'ascii');
const ZIP_LOCAL_HEADER_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNotSymlink(targetPath, label) {
  let stat;
  try {
    stat = fs.lstatSync(targetPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
  requireCondition(!stat.isSymbolicLink(), `Refusing symlinked ${label}: ${path.basename(targetPath)}`);
  return stat;
}

function formatDisplayPath(targetPath, rootDir = ROOT) {
  const rel = path.relative(rootDir, targetPath);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
    return rel.replaceAll('\\', '/');
  }
  return path.basename(targetPath);
}

/**
 * Encode a non-negative safe integer as a Protobuf base-128 varint.
 */
export function encodeVarint(value) {
  requireCondition(
    Number.isSafeInteger(value) && value >= 0,
    `Invalid varint value: ${value}`
  );
  const bytes = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (remaining > 0);
  return Buffer.from(bytes);
}

/**
 * Encode a Protobuf length-delimited field (wire type 2).
 */
export function encodeLengthDelimited(fieldNumber, payload) {
  requireCondition(
    Number.isSafeInteger(fieldNumber) && fieldNumber > 0,
    `Invalid protobuf field number: ${fieldNumber}`
  );
  requireCondition(Buffer.isBuffer(payload), 'Protobuf payload must be a Buffer');
  const tag = encodeVarint(fieldNumber * 8 + 2);
  const length = encodeVarint(payload.length);
  return Buffer.concat([tag, length, payload]);
}

function readVarint(buffer, offset) {
  let value = 0;
  let multiplier = 1;
  let cursor = offset;
  while (cursor < buffer.length) {
    const byte = buffer[cursor];
    cursor += 1;
    value += (byte & 0x7f) * multiplier;
    requireCondition(Number.isSafeInteger(value), 'Protobuf varint overflow');
    if ((byte & 0x80) === 0) {
      return { value, nextOffset: cursor };
    }
    multiplier *= 128;
    requireCondition(multiplier <= 2 ** 49, 'Protobuf varint exceeds 56 bits');
  }
  throw new Error('Truncated protobuf varint');
}

/**
 * Decode Protobuf wire types 0 (varint) and 2 (length-delimited) into a field map.
 */
export function decodeProtobufFields(buffer) {
  requireCondition(Buffer.isBuffer(buffer), 'Protobuf input must be a Buffer');
  const fields = new Map();
  let offset = 0;
  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset);
    offset = tag.nextOffset;
    const fieldNumber = Math.floor(tag.value / 8);
    const wireType = tag.value & 0x07;
    requireCondition(fieldNumber > 0, `Invalid protobuf field number: ${fieldNumber}`);
    let fieldValue;
    if (wireType === 0) {
      const parsed = readVarint(buffer, offset);
      fieldValue = parsed.value;
      offset = parsed.nextOffset;
    } else if (wireType === 2) {
      const len = readVarint(buffer, offset);
      offset = len.nextOffset;
      requireCondition(offset + len.value <= buffer.length, 'Truncated protobuf length-delimited field');
      fieldValue = buffer.subarray(offset, offset + len.value);
      offset += len.value;
    } else {
      throw new Error(`Unsupported protobuf wire type ${wireType} on field ${fieldNumber}`);
    }
    if (!fields.has(fieldNumber)) {
      fields.set(fieldNumber, []);
    }
    fields.get(fieldNumber).push(fieldValue);
  }
  return fields;
}

/**
 * Compute raw 16-byte CRX ID from DER-encoded SubjectPublicKeyInfo bytes.
 */
export function computeCrxIdRaw(publicKeyDer) {
  requireCondition(Buffer.isBuffer(publicKeyDer) && publicKeyDer.length > 0, 'Public key DER must be non-empty Buffer');
  return crypto.createHash('sha256').update(publicKeyDer).digest().subarray(0, 16);
}

/**
 * Convert a 16-byte raw CRX ID to Chromium's 32-character a..p extension ID.
 */
export function deriveExtensionId(crxIdRaw) {
  requireCondition(Buffer.isBuffer(crxIdRaw) && crxIdRaw.length === 16, 'CRX ID must be exactly 16 bytes');
  let id = '';
  for (const byte of crxIdRaw) {
    id += String.fromCharCode(97 + ((byte >>> 4) & 0x0f));
    id += String.fromCharCode(97 + (byte & 0x0f));
  }
  return id;
}

function buildSignaturePayload(signedHeaderData, zipBuffer) {
  const sizeOctets = Buffer.allocUnsafe(4);
  sizeOctets.writeUInt32LE(signedHeaderData.length, 0);
  return Buffer.concat([CRX_SIGNED_DATA_CONTEXT, sizeOctets, signedHeaderData, zipBuffer]);
}

function assertValidZipBuffer(zipBuffer, label = 'ZIP archive') {
  requireCondition(
    Buffer.isBuffer(zipBuffer) &&
      zipBuffer.length >= 4 &&
      zipBuffer.subarray(0, 4).equals(ZIP_LOCAL_HEADER_MAGIC),
    `${label} is missing ZIP local file header magic`
  );
}

/**
 * Package a ZIP buffer into a signed CRX3 binary using RSASSA-PKCS1-v1_5 SHA-256.
 */
export function packCrx3(zipBuffer, privateKey) {
  assertValidZipBuffer(zipBuffer, 'Chrome extension archive');
  const keyObj =
    privateKey && typeof privateKey === 'object' && 'type' in privateKey
      ? privateKey
      : crypto.createPrivateKey(privateKey);
  requireCondition(keyObj.type === 'private', 'CRX3 signing requires a private key');
  requireCondition(keyObj.asymmetricKeyType === 'rsa', `CRX3 key must be RSA, got ${keyObj.asymmetricKeyType}`);
  const modulusLength = keyObj.asymmetricKeyDetails?.modulusLength ?? 0;
  requireCondition(modulusLength >= 2048, `RSA key must be >= 2048 bits, got ${modulusLength}`);

  const publicKeyDer = crypto.createPublicKey(keyObj).export({ type: 'spki', format: 'der' });
  const crxIdRaw = computeCrxIdRaw(publicKeyDer);
  const extensionId = deriveExtensionId(crxIdRaw);

  const signedHeaderData = encodeLengthDelimited(1, crxIdRaw);
  const payloadToSign = buildSignaturePayload(signedHeaderData, zipBuffer);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(payloadToSign);
  const signature = signer.sign(keyObj);

  const proof = Buffer.concat([
    encodeLengthDelimited(1, publicKeyDer),
    encodeLengthDelimited(2, signature),
  ]);
  const header = Buffer.concat([
    encodeLengthDelimited(2, proof),
    encodeLengthDelimited(10000, signedHeaderData),
  ]);

  const prefix = Buffer.allocUnsafe(12);
  CRX_MAGIC.copy(prefix, 0);
  prefix.writeUInt32LE(CRX_VERSION, 4);
  prefix.writeUInt32LE(header.length, 8);

  return {
    crxBuffer: Buffer.concat([prefix, header, zipBuffer]),
    extensionId,
    publicKeyDer,
    crxIdRaw,
  };
}

/**
 * Verify a CRX3 container's header, embedded ZIP payload, CRX ID binding, and RSA-SHA256 proof.
 */
export function verifyCrx3(crxBuffer, expectedZipBuffer = null) {
  requireCondition(Buffer.isBuffer(crxBuffer) && crxBuffer.length > 16, 'CRX3 buffer is too small');
  requireCondition(crxBuffer.subarray(0, 4).equals(CRX_MAGIC), 'Invalid CRX magic header');
  const version = crxBuffer.readUInt32LE(4);
  requireCondition(version === CRX_VERSION, `Unsupported CRX version: ${version}`);

  const headerLength = crxBuffer.readUInt32LE(8);
  const archiveOffset = 12 + headerLength;
  requireCondition(
    headerLength > 0 && archiveOffset + 4 <= crxBuffer.length,
    `Invalid CRX3 header length: ${headerLength}`
  );

  const headerBytes = crxBuffer.subarray(12, archiveOffset);
  const zipBytes = crxBuffer.subarray(archiveOffset);
  assertValidZipBuffer(zipBytes, 'Embedded CRX3 ZIP payload');
  if (expectedZipBuffer !== null) {
    requireCondition(
      Buffer.compare(zipBytes, expectedZipBuffer) === 0,
      'Embedded CRX3 ZIP payload differs from source archive'
    );
  }

  const headerFields = decodeProtobufFields(headerBytes);
  const signedDataEntries = headerFields.get(10000) || [];
  requireCondition(signedDataEntries.length === 1, 'CRX3 header must contain exactly one signed_header_data');
  const signedHeaderData = signedDataEntries[0];
  requireCondition(Buffer.isBuffer(signedHeaderData), 'signed_header_data must be length-delimited bytes');

  const signedDataFields = decodeProtobufFields(signedHeaderData);
  const crxIdEntries = signedDataFields.get(1) || [];
  requireCondition(crxIdEntries.length === 1 && Buffer.isBuffer(crxIdEntries[0]), 'SignedData missing crx_id');
  const crxIdRaw = crxIdEntries[0];
  requireCondition(crxIdRaw.length === 16, `Invalid crx_id byte length: ${crxIdRaw.length}`);

  const proofs = headerFields.get(2) || [];
  requireCondition(proofs.length >= 1, 'CRX3 header missing sha256_with_rsa proofs');

  const signedPayload = buildSignaturePayload(signedHeaderData, zipBytes);
  let verifiedMatchingProof = false;

  for (const proofBytes of proofs) {
    requireCondition(Buffer.isBuffer(proofBytes), 'AsymmetricKeyProof must be length-delimited bytes');
    const proofFields = decodeProtobufFields(proofBytes);
    const pubEntries = proofFields.get(1) || [];
    const sigEntries = proofFields.get(2) || [];
    requireCondition(pubEntries.length === 1 && sigEntries.length === 1, 'Malformed AsymmetricKeyProof');

    const publicKeyDer = pubEntries[0];
    const signature = sigEntries[0];
    requireCondition(
      Buffer.isBuffer(publicKeyDer) && Buffer.isBuffer(signature),
      'Proof public_key and signature must be bytes'
    );

    if (Buffer.compare(computeCrxIdRaw(publicKeyDer), crxIdRaw) !== 0) {
      continue;
    }

    const publicKey = crypto.createPublicKey({ key: publicKeyDer, format: 'der', type: 'spki' });
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(signedPayload);
    const valid = verifier.verify(publicKey, signature);
    requireCondition(valid, 'CRX3 RSA-SHA256 signature verification failed');
    verifiedMatchingProof = true;
  }

  requireCondition(verifiedMatchingProof, 'No CRX3 proof matches signed_header_data.crx_id');

  return {
    version: CRX_VERSION,
    headerLength,
    extensionId: deriveExtensionId(crxIdRaw),
    zipSize: zipBytes.length,
  };
}

/**
 * Load an existing RSA-2048+ private key PEM or generate and persist one (unless ephemeral).
 */
export function loadOrCreateRsaKey(keyPath, options = {}) {
  if (options.ephemeral) {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    return { privateKey, generated: true, keyPath: null };
  }

  const resolvedKeyPath = path.resolve(keyPath);
  const existingStat = assertNotSymlink(resolvedKeyPath, 'signing key');
  if (existingStat) {
    requireCondition(existingStat.isFile(), `Signing key path is not a regular file: ${path.basename(resolvedKeyPath)}`);
    const pem = fs.readFileSync(resolvedKeyPath, 'utf8');
    const privateKey = crypto.createPrivateKey(pem);
    requireCondition(privateKey.asymmetricKeyType === 'rsa', `Expected RSA private key, got ${privateKey.asymmetricKeyType}`);
    const modulusLength = privateKey.asymmetricKeyDetails?.modulusLength ?? 0;
    requireCondition(modulusLength >= 2048, `RSA signing key must be >= 2048 bits, got ${modulusLength}`);
    return { privateKey, generated: false, keyPath: resolvedKeyPath };
  }

  const parentDir = path.dirname(resolvedKeyPath);
  assertNotSymlink(parentDir, 'signing key directory');
  fs.mkdirSync(parentDir, { recursive: true });
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  fs.writeFileSync(resolvedKeyPath, pem, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return { privateKey, generated: true, keyPath: resolvedKeyPath };
}

/**
 * Wrap built Chrome and Firefox ZIP archives into .crx (CRX3) and unsigned .xpi installers.
 */
export function packInstallers({
  root = ROOT,
  distDir = path.join(root, 'dist'),
  keyPath = path.resolve(root, process.env.PRISM_CRX_KEY || DEFAULT_KEY_REL),
  ephemeral = false,
} = {}) {
  const pkgPath = path.join(root, 'package.json');
  assertNotSymlink(pkgPath, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const version = pkg.version;
  requireCondition(typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version), `Invalid package version: ${version}`);

  const distStat = assertNotSymlink(distDir, 'dist directory');
  requireCondition(distStat && distStat.isDirectory(), 'Missing dist/ directory; run build.py first');

  const chromeZipName = `obsidian-prism-web-${version}-chrome.zip`;
  const firefoxZipName = `obsidian-prism-web-${version}-firefox.zip`;
  const chromeZipPath = path.join(distDir, chromeZipName);
  const firefoxZipPath = path.join(distDir, firefoxZipName);

  const chromeZipStat = assertNotSymlink(chromeZipPath, chromeZipName);
  requireCondition(chromeZipStat && chromeZipStat.isFile(), `Missing ${chromeZipName}; run build.py first`);
  const firefoxZipStat = assertNotSymlink(firefoxZipPath, firefoxZipName);
  requireCondition(firefoxZipStat && firefoxZipStat.isFile(), `Missing ${firefoxZipName}; run build.py first`);

  const chromeZip = fs.readFileSync(chromeZipPath);
  const firefoxZip = fs.readFileSync(firefoxZipPath);
  assertValidZipBuffer(chromeZip, chromeZipName);
  assertValidZipBuffer(firefoxZip, firefoxZipName);

  const { privateKey, generated, keyPath: resolvedKeyPath } = loadOrCreateRsaKey(keyPath, { ephemeral });
  const { crxBuffer, extensionId } = packCrx3(chromeZip, privateKey);

  const crxName = `obsidian-prism-web-${version}-chrome.crx`;
  const xpiName = `obsidian-prism-web-${version}-firefox.xpi`;
  const crxPath = path.join(distDir, crxName);
  const xpiPath = path.join(distDir, xpiName);
  const checksumPath = path.join(distDir, 'SHA256SUMS.installers');

  assertNotSymlink(crxPath, crxName);
  assertNotSymlink(xpiPath, xpiName);
  assertNotSymlink(checksumPath, 'SHA256SUMS.installers');

  fs.writeFileSync(crxPath, crxBuffer);
  fs.writeFileSync(xpiPath, firefoxZip);

  const diskCrx = fs.readFileSync(crxPath);
  const verifiedCrx = verifyCrx3(diskCrx, chromeZip);
  requireCondition(verifiedCrx.extensionId === extensionId, 'Disk CRX3 verification extension ID mismatch');

  const diskXpi = fs.readFileSync(xpiPath);
  assertValidZipBuffer(diskXpi, xpiName);
  requireCondition(Buffer.compare(diskXpi, firefoxZip) === 0, 'Disk XPI archive differs from Firefox ZIP');

  const crxSha = crypto.createHash('sha256').update(diskCrx).digest('hex');
  const xpiSha = crypto.createHash('sha256').update(diskXpi).digest('hex');
  const checksumContent = `${crxSha}  ${crxName}\n${xpiSha}  ${xpiName}\n`;
  fs.writeFileSync(checksumPath, checksumContent, { encoding: 'utf8' });

  return {
    version,
    extensionId,
    crxPath,
    xpiPath,
    checksumPath,
    keyGenerated: generated,
    keyPath: resolvedKeyPath,
    crxSize: diskCrx.length,
    xpiSize: diskXpi.length,
  };
}

function parseCliArgs(argv) {
  const args = {
    key: process.env.PRISM_CRX_KEY || DEFAULT_KEY_REL,
    ephemeral: false,
    clean: false,
    verifyReproducible: false,
    python: process.platform === 'win32' ? 'python' : 'python3',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--ephemeral') {
      args.ephemeral = true;
    } else if (token === '--clean') {
      args.clean = true;
    } else if (token === '--verify-reproducible') {
      args.verifyReproducible = true;
    } else if (token === '--key') {
      i += 1;
      requireCondition(i < argv.length && argv[i], '--key requires a file path');
      args.key = argv[i];
    } else if (token === '--python') {
      i += 1;
      requireCondition(i < argv.length && argv[i], '--python requires an executable name');
      args.python = argv[i];
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  return args;
}

function runPythonBuild(pythonCmd) {
  const result = spawnSync(pythonCmd, ['scripts/build.py'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  requireCondition(result.status === 0, `${pythonCmd} scripts/build.py exited with status ${result.status}`);
}

function printSummary(result) {
  const keyLabel = result.keyPath ? formatDisplayPath(result.keyPath) : 'ephemeral (in-memory)';
  const keyStatus = result.keyPath ? (result.keyGenerated ? 'generated' : 'reused') : 'ephemeral';
  console.log(
    `Built ${formatDisplayPath(result.crxPath)} (${result.crxSize.toLocaleString('en-US')} bytes; CRX3 ID: ${result.extensionId}; key: ${keyLabel} [${keyStatus}])`
  );
  console.log(
    `Built ${formatDisplayPath(result.xpiPath)} (${result.xpiSize.toLocaleString('en-US')} bytes; unsigned XPI: use Firefox Developer Edition/Nightly/ESR with xpinstall.signatures.required=false or temporary load via about:debugging; Mozilla AMO signing is required for standard Release Firefox)`
  );
  console.log(`Wrote ${formatDisplayPath(result.checksumPath)}`);
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const distDir = path.join(ROOT, 'dist');

  if (args.clean) {
    assertNotSymlink(distDir, 'dist directory');
    fs.rmSync(distDir, { recursive: true, force: true });
    console.log('Cleaned dist/ (signing keys preserved)');
    return;
  }

  const resolvedKeyPath = path.isAbsolute(args.key) ? args.key : path.resolve(ROOT, args.key);

  if (args.verifyReproducible) {
    runPythonBuild(args.python);
    const first = packInstallers({ root: ROOT, distDir, keyPath: resolvedKeyPath, ephemeral: args.ephemeral });
    const firstZipSums = fs.readFileSync(path.join(distDir, 'SHA256SUMS'), 'utf8');
    const firstInstallerSums = fs.readFileSync(path.join(distDir, 'SHA256SUMS.installers'), 'utf8');

    runPythonBuild(args.python);
    const second = packInstallers({ root: ROOT, distDir, keyPath: resolvedKeyPath, ephemeral: args.ephemeral });
    const secondZipSums = fs.readFileSync(path.join(distDir, 'SHA256SUMS'), 'utf8');
    const secondInstallerSums = fs.readFileSync(path.join(distDir, 'SHA256SUMS.installers'), 'utf8');

    requireCondition(firstZipSums === secondZipSums, 'Reproducibility check failed: dist/SHA256SUMS changed across builds');
    requireCondition(
      firstInstallerSums === secondInstallerSums,
      'Reproducibility check failed: dist/SHA256SUMS.installers changed across builds'
    );
    printSummary(second);
    console.log('Verified reproducible ZIP and installer (.crx/.xpi) builds across two consecutive runs.');
    void first;
    return;
  }

  const result = packInstallers({ root: ROOT, distDir, keyPath: resolvedKeyPath, ephemeral: args.ephemeral });
  printSummary(result);
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  main();
}
