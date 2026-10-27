import type { BrowserPhotoFile } from './platform';

export const isDng = (name: string) => /\.dng$/i.test(name);

type DngWorker = {
  load(data: ArrayBuffer, filename: string): Promise<unknown>;
  process(options?: Record<string, unknown>): Promise<{width: number; height: number; data: Uint8Array | ArrayBuffer}>;
  reset(): Promise<void>;
  dispose(): void;
};

/**
 * True DNG development through LibRaw WASM. The browser and Tauri share this
 * decoder. Each file is unpacked, demosaiced and converted to sRGB JPEG for the
 * existing canvas-based HDR renderer; the original DNG remains untouched.
 * RAW-to-scene-linear HDR and DNG output are separate future improvements.
 */
export async function developDngFrames(
  entries: BrowserPhotoFile[],
  onProgress?: (current: number, total: number) => void,
): Promise<BrowserPhotoFile[]> {
  if (!entries.length) return [];
  const { RawConvertWorker } = await import('rawconvert-wasm/dist/worker-client.js');
  // Vite uses '/' for Tauri and '/HDR-Bracket-Studio-/' for GitHub Pages.
  // Copying these assets as static files avoids Vite rewriting Emscripten URLs.
  const base = new URL('rawconvert/', document.baseURI).href;
  let decoder: DngWorker;
  try {
    decoder = await RawConvertWorker.init({
      workerUrl: base + 'worker.js',
      coreUrl: base + 'rawconvert-core.js',
      wasmUrl: base + 'rawconvert-core.wasm',
    });
  } catch (e) {
    throw new Error('Unable to start the DNG decoder. Check that the LibRaw WebAssembly assets were deployed. ' + String(e));
  }
  const output: BrowserPhotoFile[] = [];
  try {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      onProgress?.(i + 1, entries.length);
      try {
        await decoder.load(await entry.file.arrayBuffer(), entry.file.name);
        // Half-size demosaicing avoids multihundred-MB canvas allocations
        // on common 40-60MP DNGs; still decodes sensor samples, not thumbnails.
        const processed = await decoder.process({
          colorSpace: 'srgb',
          outputBps: 8,
          halfSize: true,
          cameraWhiteBalance: true,
          highlightMode: 2,
        });
        const width = processed.width, height = processed.height;
        const rgb = processed.data instanceof Uint8Array ? processed.data : new Uint8Array(processed.data);
        if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
            width < 1 || height < 1 || width * height > 24000000) {
          throw new Error('Invalid decoded DNG dimensions');
        }
        const pixels = width * height;
        const channels = rgb.length / pixels;
        if (channels !== 3 && channels !== 4) {
          throw new Error('Unexpected decoded pixel format: ' + rgb.length + ' bytes');
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Cannot initialize image canvas');
        const image = ctx.createImageData(width, height);
        if (channels === 4) {
          image.data.set(rgb);
        } else {
          for (let p = 0, s = 0; p < pixels; p++, s += 3) {
            const dest = p * 4;
            image.data[dest] = rgb[s];
            image.data[dest + 1] = rgb[s + 1];
            image.data[dest + 2] = rgb[s + 2];
            image.data[dest + 3] = 255;
          }
        }
        ctx.putImageData(image, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(value => value ? resolve(value) : reject(new Error('Cannot encode the developed DNG')), 'image/jpeg', .95);
        });
        const name = entry.file.name.replace(/\.dng$/i, '.jpg');
        output.push({path: entry.path, file: new File([blob], name, {type:'image/jpeg'})});
      } catch (e) {
        throw new Error('Cannot develop ' + entry.file.name + ': ' + String(e));
      } finally {
        await decoder.reset();
      }
    }
  } finally {
    decoder.dispose();
  }
  return output;
}
