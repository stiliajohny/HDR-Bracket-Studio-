import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';

export type ImageAdjustments = {
  brightness: number;
  contrast: number;
  highlights: number;
  shadows: number;
  saturation: number;
  temperature: number;
};

export const defaultImageAdjustments: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  temperature: 0,
};

const controls: { key: keyof ImageAdjustments; label: string; hint: string }[] = [
  { key: 'brightness', label: 'Brightness', hint: 'Overall image lightness' },
  { key: 'contrast', label: 'Contrast', hint: 'Difference between dark and light areas' },
  { key: 'highlights', label: 'Highlights', hint: 'Adjust brighter regions' },
  { key: 'shadows', label: 'Shadows', hint: 'Adjust darker regions' },
  { key: 'saturation', label: 'Saturation', hint: 'Colour intensity' },
  { key: 'temperature', label: 'Temperature', hint: 'Cooler or warmer colours' },
];

export function hasImageAdjustments(settings: ImageAdjustments): boolean {
  return controls.some(control => settings[control.key] !== 0);
}

export function ImageAdjustmentControls({ value, onChange, hasPreview }: {
  value: ImageAdjustments;
  onChange: (value: ImageAdjustments) => void;
  hasPreview: boolean;
}) {
  return <div className="adjustment-controls">
    <div className="adjustment-header">
      <span>Basic colour &amp; tone</span>
      <button type="button" className="adjustment-reset" disabled={!hasImageAdjustments(value)}
        onClick={() => onChange({ ...defaultImageAdjustments })} title="Reset all image adjustments">
        <RotateCcw size={13}/> Reset
      </button>
    </div>
    {controls.map(control => <label key={control.key} className="adjustment-slider" title={control.hint}>
      <span>{control.label}<output>{value[control.key] > 0 ? '+' : ''}{value[control.key]}</output></span>
      <input type="range" min="-100" max="100" step="1" value={value[control.key]}
        onChange={event => onChange({ ...value, [control.key]: Number(event.target.value) })}/>
    </label>)}
    <p className="adjustment-hint">
      {hasPreview ? 'Updates the HDR preview instantly; included in JPEG export.' : 'Merge an HDR stack to see changes live.'}
      {' '}The radiance .HDR export remains untouched.
    </p>
  </div>;
}

const clamp = (value: number) => Math.max(0, Math.min(255, value));
const smoothstep = (lo: number, hi: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

/**
 * Shared SDR pixel adjustment pipeline for the live canvas and exported JPEG.
 * This modifies tone-mapped sRGB pixels; it does not reprocess HDR radiance.
 */
function adjustPixels(
  source: Uint8ClampedArray,
  destination: Uint8ClampedArray,
  options: ImageAdjustments,
  startPixel: number,
  endPixel: number,
) {
  const brightness = options.brightness * 0.0025;
  const contrast = 1 + options.contrast * 0.0085;
  const shadowStrength = options.shadows * 0.004;
  const highlightStrength = options.highlights * 0.004;
  const saturation = 1 + options.saturation * 0.01;
  const warmth = options.temperature * 0.002;
  for (let p = startPixel * 4; p < endPixel * 4; p += 4) {
    let r = source[p] / 255;
    let g = source[p + 1] / 255;
    let b = source[p + 2] / 255;
    const initialLuma = .2126 * r + .7152 * g + .0722 * b;
    const shadowMask = 1 - smoothstep(.06, .64, initialLuma);
    const highlightMask = smoothstep(.36, .96, initialLuma);
    const tone = brightness + shadowStrength * shadowMask + highlightStrength * highlightMask;
    r = (r + tone - .5) * contrast + .5;
    g = (g + tone - .5) * contrast + .5;
    b = (b + tone - .5) * contrast + .5;
    // A slight chromatic red/blue balance creates a simple warm/cool control.
    r += warmth * (.45 + .55 * r);
    b -= warmth * (.45 + .55 * b);
    const luma = .2126 * r + .7152 * g + .0722 * b;
    destination[p] = clamp((luma + (r - luma) * saturation) * 255);
    destination[p + 1] = clamp((luma + (g - luma) * saturation) * 255);
    destination[p + 2] = clamp((luma + (b - luma) * saturation) * 255);
    destination[p + 3] = source[p + 3];
  }
}

/** Uses a 1600px preview buffer to keep the sliders responsive on large images. */
export function AdjustedHdrPreview({ src, settings }: { src: string; settings: ImageAdjustments }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sourceData, setSourceData] = useState<ImageData | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSourceData(null);
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const scale = Math.min(1, 1600 / image.naturalWidth);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const working = document.createElement('canvas');
      working.width = width;
      working.height = height;
      const ctx = working.getContext('2d', {willReadFrequently: true});
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, width, height);
      setSourceData(ctx.getImageData(0, 0, width, height));
    };
    image.src = src;
    return () => { cancelled = true; image.onload = null; image.src = ''; };
  }, [src]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceData) return;
    const frame = requestAnimationFrame(() => {
      const output = canvasRef.current;
      if (!output) return;
      if (output.width !== sourceData.width) output.width = sourceData.width;
      if (output.height !== sourceData.height) output.height = sourceData.height;
      const ctx = output.getContext('2d');
      if (!ctx) return;
      if (!hasImageAdjustments(settings)) {
        ctx.putImageData(sourceData, 0, 0);
        return;
      }
      const changed = new ImageData(
        new Uint8ClampedArray(sourceData.data.length), sourceData.width, sourceData.height
      );
      adjustPixels(sourceData.data, changed.data, settings, 0, sourceData.width * sourceData.height);
      ctx.putImageData(changed, 0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [sourceData, settings]);

  return <canvas ref={canvasRef} className="stage-image adjusted-hdr-preview"
    role="img" aria-label="HDR preview with live image adjustments"
    width={sourceData?.width || 800} height={sourceData?.height || 533}/>;
}

const yieldFrame = () => new Promise<void>(resolve => window.setTimeout(resolve, 0));

/** Applies exactly the same pixel adjustments at export resolution. */
export async function applyImageAdjustmentsToJpeg(jpeg: Blob, settings: ImageAdjustments): Promise<Blob> {
  if (!hasImageAdjustments(settings)) return jpeg;
  const bitmap = await createImageBitmap(jpeg);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    if (!ctx) throw new Error('Canvas is unavailable for image adjustments');
    ctx.drawImage(bitmap, 0, 0);
    const source = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const output = ctx.createImageData(bitmap.width, bitmap.height);
    const n = bitmap.width * bitmap.height;
    for (let start = 0; start < n; start += 100000) {
      adjustPixels(source.data, output.data, settings, start, Math.min(n, start + 100000));
      await yieldFrame();
    }
    ctx.putImageData(output, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob =>
      blob ? resolve(blob) : reject(new Error('Cannot encode adjusted JPEG')), 'image/jpeg', .94));
  } finally {
    bitmap.close();
  }
}
