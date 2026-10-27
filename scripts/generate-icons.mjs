import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

// Generate real, cross-platform Tauri icons with Node built-ins only.
// No separate image tooling or binary assets are required in the repository.
const destination = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'icons');
mkdirSync(destination, { recursive: true });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function paint(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const corners = 0.22;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1;
    const ax = Math.max(Math.abs(u) - (1 - corners), 0);
    const ay = Math.max(Math.abs(v) - (1 - corners), 0);
    const inside = Math.max(Math.abs(u), Math.abs(v)) <= 1 && ax * ax + ay * ay <= corners * corners;
    const i = (y * size + x) * 4;
    if (!inside) continue;
    const dist = Math.hypot(u, v);
    const angle = Math.atan2(v, u);
    const t = clamp((v + 1) * .45 + (u + 1) * .14, 0, 1);
    let rgb = [Math.round(20 + t * 27), Math.round(35 + t * 37), Math.round(57 + t * 54)];
    if (dist > .43 && dist < .62) rgb = [153, 202, 249];
    if (dist >= .19 && dist < .43) {
      const sector = (angle + Math.PI * 2.25) % (Math.PI / 3);
      const phase = sector / (Math.PI / 3);
      rgb = dist > .25 + phase * .12 ? [190, 223, 254] : [65, 109, 154];
    }
    if (dist < .18) rgb = [22, 40, 68];
    rgba[i] = rgb[0]; rgba[i + 1] = rgb[1]; rgba[i + 2] = rgb[2]; rgba[i + 3] = 255;
  }
  return rgba;
}
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([len, name, data, checksum]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const dest = y * (size * 4 + 1);
    raw[dest] = 0;
    rgba.copy(raw, dest + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function bitmapIcoImage(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12); header.writeUInt16LE(32, 14);
  const xor = Buffer.alloc(size * size * 4);
  const maskStride = Math.ceil(size / 32) * 4;
  const andMask = Buffer.alloc(maskStride * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const src = ((size - y - 1) * size + x) * 4;
    const dest = (y * size + x) * 4;
    xor[dest] = rgba[src + 2]; xor[dest + 1] = rgba[src + 1]; xor[dest + 2] = rgba[src + 2 - 2]; xor[dest + 3] = rgba[src + 3];
    if (rgba[src + 3] === 0) andMask[y * maskStride + (x >> 3)] |= 1 << (7 - (x & 7));
  }
  return Buffer.concat([header, xor, andMask]);
}
function ico(variants) {
  const count = variants.length;
  const head = Buffer.alloc(6 + count * 16);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(count, 4);
  let offset = head.length;
  for (let i = 0; i < count; i++) {
    const { size, data } = variants[i];
    const p = 6 + 16 * i;
    head[p] = size === 256 ? 0 : size; head[p + 1] = size === 256 ? 0 : size;
    head.writeUInt16LE(1, p + 4); head.writeUInt16LE(32, p + 6);
    head.writeUInt32LE(data.length, p + 8); head.writeUInt32LE(offset, p + 12);
    offset += data.length;
  }
  return Buffer.concat([head, ...variants.map(v => v.data)]);
}
function icns(images) {
  const types = new Map([[16, 'icp4'], [32, 'icp5'], [64, 'icp6'], [128, 'ic07'], [256, 'ic08'], [512, 'ic09']]);
  const chunks = images.map(({ size, data }) => {
    const head = Buffer.alloc(8);
    head.write(types.get(size), 0, 'ascii'); head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii'); header.writeUInt32BE(8 + chunks.reduce((total, a) => total + a.length, 0), 4);
  return Buffer.concat([header, ...chunks]);
}
const images = [16, 32, 64, 128, 256, 512].map(size => ({ size, rgba: paint(size) }))
  .map(({ size, rgba }) => ({ size, rgba, data: png(size, rgba) }));
for (const [name, size] of [['32x32.png', 32], ['128x128.png', 128], ['128x128@2x.png', 256], ['icon.png', 512]]) {
  writeFileSync(join(destination, name), images.find(v => v.size === size).data);
}
writeFileSync(join(destination, 'icon.ico'), ico([16, 32, 48, 256].map(size => {
  const rgba = paint(size);
  return { size, data: size === 256 ? images.find(v => v.size === 256).data : bitmapIcoImage(size, rgba) };
})));
writeFileSync(join(destination, 'icon.icns'), icns(images.map(({ size, data }) => ({ size, data }))));
console.log('Generated Tauri PNG, Windows ICO and macOS ICNS icons.');
