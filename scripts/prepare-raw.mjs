import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve('node_modules/rawconvert-wasm/dist');
const target = resolve('public/rawconvert');
const names = ['worker.js', 'rawconvert-core.js', 'rawconvert-core.wasm'];
mkdirSync(target, { recursive: true });
for (const name of names) {
  const from = resolve(source, name);
  if (!existsSync(from)) {
    throw new Error('Missing rawconvert-wasm runtime asset ' + from + '. Run npm install.');
  }
  cpSync(from, resolve(target, name));
}
console.log('Prepared LibRaw DNG decoder assets for both web and Tauri.');
