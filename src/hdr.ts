import type { BrowserPhotoFile } from './platform';
import type { Photo } from './types';

export type DeghostLevel = 'off' | 'low' | 'medium' | 'high';
export type MergeOptions = {
  maxWidth: number;
  autoAlign: boolean;
  deghost: DeghostLevel;
  exposureEV: number;
  highlightCompression: number;
  autoTone: boolean;
};
export type MergeResult = { jpeg: Blob; radiance: Blob; offsets: { name: string; x: number; y: number }[]; width: number; height: number };

// Camera JPEGs are display-encoded. Decode the sRGB transfer function before
// dividing by exposure, rather than averaging non-linear 8-bit values.
const linearLut = Float32Array.from({ length: 256 }, (_, i) => {
  const x = i / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
});
function encodeSrgb(linear: number): number {
  const x = Math.max(0, Math.min(1, linear));
  return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
}
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const yieldToBrowser = () => new Promise<void>(resolve => setTimeout(resolve, 0));

async function decodeImage(file: File): Promise<ImageBitmap> {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('Cannot decode ' + file.name + '. Use a JPEG, PNG or WebP source image for browser processing.'); }
}
function drawPixels(image: ImageBitmap, width: number, height: number, dx = 0, dy = 0): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  ctx.drawImage(image, -dx, -dy, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}
type Mask = { width: number; height: number; bits: Uint8Array; valid: Uint8Array };
function thresholdMask(bitmap: ImageBitmap, width: number, height: number): Mask {
  const rgb = drawPixels(bitmap, width, height);
  const gray = new Uint8Array(width * height);
  const hist = new Uint32Array(256);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const y = Math.round(0.2126 * rgb[i] + 0.7152 * rgb[i + 1] + 0.0722 * rgb[i + 2]);
    gray[p] = y; hist[y]++;
  }
  let cumulative = 0, median = 127;
  for (let i = 0; i < 256; i++) {
    cumulative += hist[i];
    if (cumulative >= gray.length / 2) { median = i; break; }
  }
  const bits = new Uint8Array(gray.length);
  const valid = new Uint8Array(gray.length);
  for (let p = 0; p < gray.length; p++) {
    bits[p] = gray[p] > median ? 1 : 0;
    valid[p] = Math.abs(gray[p] - median) > 10 ? 1 : 0;
  }
  return { width, height, bits, valid };
}
// Ward-style median-threshold bitmap registration is relatively insensitive
// to differences in brightness between bracketed exposures.
// Only translation is estimated: rotation, zoom and perspective are not handled.
function alignmentScore(a: Mask, b: Mask, dx: number, dy: number): number {
  const { width: w, height: h } = a;
  let wrong = 0, tested = 0;
  const pad = 14;
  for (let y = pad; y < h - pad; y += 3) {
    const sy = y + dy; if (sy < 0 || sy >= h) continue;
    for (let x = pad; x < w - pad; x += 3) {
      const sx = x + dx; if (sx < 0 || sx >= w) continue;
      const p = y * w + x, q = sy * w + sx;
      if (!a.valid[p] || !b.valid[q]) continue;
      tested++;
      if (a.bits[p] !== b.bits[q]) wrong++;
    }
  }
  if (tested < w * h * 0.008) return 1;
  return wrong / tested + (Math.abs(dx) + Math.abs(dy)) * 0.0005;
}
function estimateShift(ref: ImageBitmap, moving: ImageBitmap, fullWidth: number, fullHeight: number) {
  let bestX = 0, bestY = 0, previousWidth = 0;
  for (const targetWidth of [128, 512]) {
    const w = Math.min(fullWidth, targetWidth);
    const h = Math.max(1, Math.round(fullHeight * w / fullWidth));
    const a = thresholdMask(ref, w, h), b = thresholdMask(moving, w, h);
    const ratio = previousWidth ? w / previousWidth : 1;
    const centreX = Math.round(bestX * ratio), centreY = Math.round(bestY * ratio);
    const radius = previousWidth ? 4 : 12;
    let bestScore = Infinity, xResult = centreX, yResult = centreY;
    for (let dy = centreY - radius; dy <= centreY + radius; dy++) {
      for (let dx = centreX - radius; dx <= centreX + radius; dx++) {
        const score = alignmentScore(a, b, dx, dy);
        if (score < bestScore) { bestScore = score; xResult = dx; yResult = dy; }
      }
    }
    bestX = xResult; bestY = yResult; previousWidth = w;
  }
  return { x: Math.round(bestX * fullWidth / previousWidth), y: Math.round(bestY * fullWidth / previousWidth) };
}
function exposureFactor(photo: Photo, reference: Photo): number {
  if (photo.ev100 != null && reference.ev100 != null) {
    return 2 ** clamp(reference.ev100 - photo.ev100, -12, 12);
  }
  if (photo.exposureTime && reference.exposureTime) {
    return clamp(photo.exposureTime / reference.exposureTime, 1 / 4096, 4096);
  }
  throw new Error('ExposureTime and aperture/ISO metadata are required for a true HDR radiance merge. Convert RAW to JPEG while retaining EXIF.');
}
function luminance(r: number, g: number, b: number) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function imageWeight(r: number, g: number, b: number) {
  const y = luminance(r, g, b) / 255;
  const max = Math.max(r, g, b) / 255;
  // Exclude clipped highlights/shadows. Other frames can then supply details.
  return clamp(Math.min((y - 0.005) / 0.12, (0.995 - y) / 0.16, (1 - max) / 0.02), 0, 1) ** 2;
}
function percentile(values: Float32Array, q: number) {
  const samples: number[] = [];
  const step = Math.max(1, Math.floor(values.length / 120000));
  for (let i = 0; i < values.length; i += step) {
    if (Number.isFinite(values[i]) && values[i] > 0) samples.push(values[i]);
  }
  if (!samples.length) return 0.18;
  samples.sort((a, b) => a - b);
  return samples[Math.floor((samples.length - 1) * q)];
}
function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('JPEG encoding failed')), 'image/jpeg', 0.94));
}
// Radiance .hdr RGBE scanline format: a genuine HDR radiance export, not an 8-bit JPEG.
// RGBE uses a common exponent and 8-bit mantissas, unlike Lightroom's raw DNG.
function encodeRadiance(rgb: Float32Array, width: number, height: number): Blob {
  const encoder = new TextEncoder();
  const header = encoder.encode('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ' + height + ' +X ' + width + '\n');
  const parts: BlobPart[] = [header];
  const channels = Array.from({ length: 4 }, () => new Uint8Array(width));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = 3 * (y * width + x);
      const r = Math.max(0, rgb[p]), g = Math.max(0, rgb[p + 1]), b = Math.max(0, rgb[p + 2]);
      const max = Math.max(r, g, b);
      if (max < 1e-30) { for (const c of channels) c[x] = 0; continue; }
      const exp = Math.ceil(Math.log2(max));
      const scale = 256 / 2 ** exp;
      channels[0][x] = clamp(Math.floor(r * scale), 0, 255);
      channels[1][x] = clamp(Math.floor(g * scale), 0, 255);
      channels[2][x] = clamp(Math.floor(b * scale), 0, 255);
      channels[3][x] = clamp(exp + 128, 0, 255);
    }
    const line: number[] = [];
    if (width < 8 || width > 32767) {
      for (let x = 0; x < width; x++) for (let c = 0; c < 4; c++) line.push(channels[c][x]);
    } else {
      line.push(2, 2, (width >> 8) & 255, width & 255);
      for (const channel of channels) {
        let x = 0;
        while (x < width) {
          let run = 1;
          while (x + run < width && channel[x + run] === channel[x] && run < 127) run++;
          if (run >= 4) { line.push(128 + run, channel[x]); x += run; continue; }
          const from = x; x++;
          while (x < width && x - from < 128) {
            run = 1;
            while (x + run < width && channel[x + run] === channel[x] && run < 4) run++;
            if (run >= 4) break;
            x++;
          }
          line.push(x - from);
          for (let i = from; i < x; i++) line.push(channel[i]);
        }
      }
    }
    parts.push(new Uint8Array(line));
  }
  return new Blob(parts, { type: 'application/octet-stream' });
}
export async function mergeHdr(
  entries: BrowserPhotoFile[], photos: Photo[], opts: MergeOptions
): Promise<MergeResult> {
  if (photos.length < 2 || entries.length !== photos.length) throw new Error('Select every source photo for this HDR bracket.');
  const paired = photos.map(photo => ({
    photo,
    entry: entries.find(f => f.path === photo.path || f.file.name === photo.name),
  }));
  if (paired.some(x => !x.entry)) throw new Error('Some bracket source files could not be matched.');
  const ordered = paired.sort((a, b) => (a.photo.ev100 ?? 0) - (b.photo.ev100 ?? 0));
  const refIndex = Math.floor(ordered.length / 2);
  const reference = ordered[refIndex].photo;
  const bitmaps = await Promise.all(ordered.map(x => decodeImage(x.entry!.file)));
  try {
    const refBitmap = bitmaps[refIndex];
    const scale = Math.min(1, opts.maxWidth / refBitmap.width);
    const width = Math.max(1, Math.round(refBitmap.width * scale));
    const height = Math.max(1, Math.round(refBitmap.height * scale));
    if (width * height > 15000000) throw new Error('Preview is too large; choose a smaller maximum width.');
    if (bitmaps.some(b => Math.abs(b.width / b.height - refBitmap.width / refBitmap.height) > 0.015)) {
      throw new Error('Exposure frames have different aspect ratios; align/crop them to matching dimensions first.');
    }
    const factors = ordered.map(x => exposureFactor(x.photo, reference));
    const offsets = bitmaps.map((b, i) => {
      const shift = opts.autoAlign && i !== refIndex ? estimateShift(refBitmap, b, width, height) : { x: 0, y: 0 };
      return { name: ordered[i].photo.name, ...shift };
    });
    const frames = bitmaps.map((b, i) => drawPixels(b, width, height, offsets[i].x, offsets[i].y));
    await yieldToBrowser();
    const n = width * height;
    const rgb = new Float32Array(n * 3), yValues = new Float32Array(n);
    const deghostThreshold: Record<DeghostLevel, number> = { off: Infinity, low: 0.85, medium: 0.5, high: 0.28 };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x, p = pixel * 4;
        const ref = frames[refIndex];
        const refY = luminance(linearLut[ref[p]], linearLut[ref[p + 1]], linearLut[ref[p + 2]]) / factors[refIndex];
        const refValid = imageWeight(ref[p], ref[p + 1], ref[p + 2]) > 0.05;
        let sr = 0, sg = 0, sb = 0, weights = 0;
        let fallback = 0, fallbackWeight = -1;
        for (let j = 0; j < frames.length; j++) {
          const f = frames[j], factor = factors[j];
          const r = linearLut[f[p]] / factor, g = linearLut[f[p + 1]] / factor, b = linearLut[f[p + 2]] / factor;
          let weight = imageWeight(f[p], f[p + 1], f[p + 2]);
          if (weight > fallbackWeight) { fallbackWeight = weight; fallback = j; }
          if (opts.deghost !== 'off' && j !== refIndex && refValid && weight > 0) {
            const delta = Math.abs(Math.log2((luminance(r, g, b) + 0.01) / (refY + 0.01)));
            const tolerance = deghostThreshold[opts.deghost];
            if (delta > tolerance) weight *= clamp(1 - (delta - tolerance) / 0.25, 0, 1);
          }
          sr += weight * r; sg += weight * g; sb += weight * b; weights += weight;
        }
        if (weights < 0.0001) {
          const f = frames[fallback], factor = factors[fallback];
          sr = linearLut[f[p]] / factor; sg = linearLut[f[p + 1]] / factor; sb = linearLut[f[p + 2]] / factor;
          weights = 1;
        }
        const k = pixel * 3;
        rgb[k] = sr / weights; rgb[k + 1] = sg / weights; rgb[k + 2] = sb / weights;
        yValues[pixel] = luminance(rgb[k], rgb[k + 1], rgb[k + 2]);
      }
      if (y % 80 === 0) await yieldToBrowser();
    }
    const radiance = encodeRadiance(rgb, width, height);
    const mid = percentile(yValues, 0.5);
    const top = percentile(yValues, 0.995);
    const autoGain = opts.autoTone ? clamp(0.18 / Math.max(mid, 0.01), 0.45, 3.5) : 1;
    const gain = autoGain * 2 ** opts.exposureEV;
    const white = Math.max(1.5, top * gain * (1.2 + 2.6 * (opts.highlightCompression / 100)));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    const image = ctx.createImageData(width, height);
    for (let i = 0; i < n; i++) {
      const p = i * 3, dest = i * 4;
      const rawY = Math.max(yValues[i], 1e-10);
      const lum = rawY * gain;
      // Extended photographic Reinhard tone curve. Scale RGB by luminance
      // to keep hues stable while gently compressing highlight range.
      const mapped = lum * (1 + lum / (white * white)) / (1 + lum);
      const ratio = mapped / rawY;
      image.data[dest] = encodeSrgb(rgb[p] * ratio);
      image.data[dest + 1] = encodeSrgb(rgb[p + 1] * ratio);
      image.data[dest + 2] = encodeSrgb(rgb[p + 2] * ratio);
      image.data[dest + 3] = 255;
      if (i % (width * 100) === 0) await yieldToBrowser();
    }
    ctx.putImageData(image, 0, 0);
    return { jpeg: await toJpeg(canvas), radiance, offsets, width, height };
  } finally { bitmaps.forEach(b => b.close()); }
}
