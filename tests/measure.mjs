/**
 * Shared measurement helpers for browser tests. They measure what a user sees (rendered boxes, pixels,
 * computed styles, relative control positions), never extension marker attributes.
 * All functions take a Playwright Page; geometry is in CSS pixels.
 */
import zlib from 'node:zlib';

/** Offline URLs for the probe-derived fixtures (served by interceptFixtures in browser-smoke.mjs). */
export const LIVE_FIXTURE_URLS = {
  chatgpt: 'https://chatgpt.com/prism-live-fixture',
  gemini: 'https://gemini.google.com/prism-live-fixture'
};
/** The main conversation area whose width setMainWidth controls (everything right of the sidebar). */
export const MAIN_SELECTORS = { chatgpt: 'main', gemini: 'chat-window' };

/** Decodes an 8-bit, non-interlaced RGB/RGBA PNG (Playwright screenshots) into RGBA pixels. */
export function decodePNG(buffer) {
  const bytes = Buffer.from(buffer);
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Not a PNG');
  let offset = 8, width = 0, height = 0, colorType = 0;
  const idat = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4); colorType = body[9];
      if (body[8] !== 8 || ![2, 6].includes(colorType) || body[12] !== 0) throw new Error(`Unsupported PNG format: depth ${body[8]}, color ${colorType}, interlace ${body[12]}`);
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? pixels[y * stride + i - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + i] : 0;
      const corner = y > 0 && i >= channels ? pixels[(y - 1) * stride + i - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - corner);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      } else if (filter !== 0) throw new Error(`Unknown PNG filter ${filter}`);
      pixels[y * stride + i] = (line[i] + predictor) & 255;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    for (let c = 0; c < 3; c++) data[p * 4 + c] = pixels[p * channels + c];
    data[p * 4 + 3] = channels === 4 ? pixels[p * channels + 3] : 255;
  }
  const at = (x, y) => {
    const index = (Math.round(y) * width + Math.round(x)) * 4;
    return { r: data[index], g: data[index + 1], b: data[index + 2], a: data[index + 3] };
  };
  return { width, height, data, at };
}

/** Screenshots a viewport region (CSS px) and returns the decoded pixels. */
export async function capturePixels(page, clip) {
  const rounded = { x: Math.max(0, Math.floor(clip.x)), y: Math.max(0, Math.floor(clip.y)), width: Math.max(1, Math.round(clip.width)), height: Math.max(1, Math.round(clip.height)) };
  return decodePNG(await page.screenshot({ clip: rounded, scale: 'css', type: 'png', animations: 'disabled', caret: 'hide' }));
}

/** Mean color and mean per-channel variance of a region; blurred or flat paint has low variance. */
export async function regionStats(page, clip) {
  const image = await capturePixels(page, clip);
  const count = image.width * image.height;
  const mean = [0, 0, 0];
  for (let p = 0; p < count; p++) for (let c = 0; c < 3; c++) mean[c] += image.data[p * 4 + c] / count;
  let variance = 0;
  for (let p = 0; p < count; p++) for (let c = 0; c < 3; c++) variance += (image.data[p * 4 + c] - mean[c]) ** 2 / (count * 3);
  return { mean: { r: mean[0], g: mean[1], b: mean[2] }, variance, width: image.width, height: image.height };
}

/**
 * Samples the painted pixel below an element (the Composer Surface by default use): `offsetY` CSS px under its
 * bottom edge, `offsetX` px from its left edge (default: horizontal center). Returns the pixel and the point.
 */
export async function sampleBelow(page, selector, { offsetX, offsetY = 8 } = {}) {
  const box = await page.locator(selector).first().evaluate(node => {
    const r = node.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, bottom: r.bottom };
  });
  const point = { x: box.left + (offsetX ?? box.width / 2), y: box.bottom + offsetY };
  const image = await capturePixels(page, { x: point.x, y: point.y, width: 1, height: 1 });
  return { point, pixel: image.at(0, 0), surface: box };
}

/**
 * Rendered width of a text block: `box` is its border-box width (what max-width constrains), `text` the widest
 * rendered line measured with a Range (what the reader actually sees for wrapped text).
 */
export async function paragraphWidth(page, selector) {
  return page.locator(selector).first().evaluate(node => {
    const box = node.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(node);
    const lines = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
    const text = lines.length ? Math.max(...lines.map(rect => rect.right)) - Math.min(...lines.map(rect => rect.left)) : 0;
    return { box: box.width, text, left: box.left, right: box.right };
  });
}

/**
 * Computed typography of the first h1–h4 and the first paragraph inside `scope`.
 * Returns { h1: { fontFamily, fontSize, fontWeight, color } | null, …, body: {…} | null } with numeric size/weight.
 */
export async function headingStyles(page, scope) {
  return page.locator(scope).first().evaluate(root => {
    const read = node => {
      if (!node) return null;
      const style = getComputedStyle(node);
      return { fontFamily: style.fontFamily, fontSize: parseFloat(style.fontSize), fontWeight: Number(style.fontWeight), color: style.color };
    };
    const out = {};
    for (const tag of ['h1', 'h2', 'h3', 'h4']) out[tag] = read(root.querySelector(tag));
    out.body = read(root.querySelector('p'));
    return out;
  });
}

/**
 * Positions of named controls relative to a container (e.g. the Composer Surface card), for one-row vs.
 * two-row layout checks. `controls` maps names to selectors resolved inside the container.
 */
export async function controlGeometry(page, container, controls) {
  return page.locator(container).first().evaluate((root, entries) => {
    const base = root.getBoundingClientRect();
    const style = getComputedStyle(root);
    const inner = { left: base.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft), right: base.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight) };
    const out = { container: { width: base.width, height: base.height, innerWidth: inner.right - inner.left }, controls: {} };
    for (const [name, selector] of entries) {
      const node = root.querySelector(selector);
      if (!node) { out.controls[name] = null; continue; }
      const r = node.getBoundingClientRect();
      out.controls[name] = {
        left: r.left - base.left, top: r.top - base.top, right: r.right - base.left, bottom: r.bottom - base.top,
        width: r.width, height: r.height, centerX: r.left + r.width / 2 - base.left, centerY: r.top + r.height / 2 - base.top
      };
    }
    return out;
  }, Object.entries(controls));
}

/** Resizes the viewport so that `mainSelector` renders exactly `width` CSS px wide (sidebar width is kept). */
export async function setMainWidth(page, mainSelector, width) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await page.locator(mainSelector).first().evaluate(node => node.getBoundingClientRect().width);
    if (Math.abs(current - width) < 0.5) return current;
    const viewport = page.viewportSize();
    await page.setViewportSize({ width: Math.round(viewport.width + width - current), height: viewport.height });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  const final = await page.locator(mainSelector).first().evaluate(node => node.getBoundingClientRect().width);
  if (Math.abs(final - width) >= 0.5) throw new Error(`Could not set main width to ${width}px (got ${final}px)`);
  return final;
}
