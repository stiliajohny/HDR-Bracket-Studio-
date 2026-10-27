import { useEffect, useMemo, useState } from 'react';
import type { Photo } from './types';

export type ExifOverlayPosition = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
export type ExifOverlayStyle = 'dark' | 'light' | 'white' | 'black' | 'ribbon';
export type ExifOverlaySize = 'small' | 'medium' | 'large' | 'custom';
export const exifTextPercent = (settings: ExifOverlaySettings) => settings.size === 'custom' ? settings.customPercent : settings.size === 'small' ? 1.2 : settings.size === 'large' ? 2.6 : 1.8;
export type ExifField = 'filename' | 'date' | 'camera' | 'lens' | 'shutter' | 'aperture' | 'iso' | 'focal' | 'compensation' | 'resolution' | 'ev';

export type ExifOverlaySettings = {
  enabled: boolean;
  position: ExifOverlayPosition;
  style: ExifOverlayStyle;
  size: ExifOverlaySize;
  customPercent: number;
  showLabels: boolean;
  fields: Record<ExifField, boolean>;
};

const fieldLabels: Record<ExifField, string> = {
  filename: 'File name',
  date: 'Capture date',
  camera: 'Camera',
  lens: 'Lens',
  shutter: 'Shutter speed',
  aperture: 'Aperture',
  iso: 'ISO',
  focal: 'Focal length',
  compensation: 'Exposure compensation',
  resolution: 'Resolution',
  ev: 'EV100',
};
const fieldKeys = Object.keys(fieldLabels) as ExifField[];
const positions: {id: ExifOverlayPosition; label: string}[] = [
  {id: 'top-left', label: 'Top left'},
  {id: 'top-center', label: 'Top centre'},
  {id: 'top-right', label: 'Top right'},
  {id: 'middle-left', label: 'Middle left'},
  {id: 'center', label: 'Centre'},
  {id: 'middle-right', label: 'Middle right'},
  {id: 'bottom-left', label: 'Bottom left'},
  {id: 'bottom-center', label: 'Bottom centre'},
  {id: 'bottom-right', label: 'Bottom right'},
];
const styles: {id: ExifOverlayStyle; label: string; sample: string}[] = [
  {id: 'dark', label: 'Black / White', sample: 'Aa'},
  {id: 'light', label: 'White / Black', sample: 'Aa'},
  {id: 'white', label: 'White text', sample: 'Aa'},
  {id: 'black', label: 'Black text', sample: 'Aa'},
  {id: 'ribbon', label: 'Bottom ribbon', sample: 'EXIF · ISO 100'},
];

export const defaultExifOverlay: ExifOverlaySettings = {
  enabled: false,
  position: 'bottom-left',
  style: 'dark',
  size: 'medium',
  customPercent: 1.8,
  showLabels: true,
  fields: {
    filename: false, date: true, camera: true, lens: true, shutter: true,
    aperture: true, iso: true, focal: true, compensation: false,
    resolution: false, ev: false,
  },
};
const readableNumber = (n: number, digits = 1) => Number(n.toFixed(digits)).toString();
const safeValue = (v: string | null | undefined) => v?.trim() || '';
function shutterSpeed(value: number | null): string {
  if (!value || value <= 0) return '';
  return value < 1 ? '1/' + Math.round(1 / value) + ' s' : readableNumber(value, 2) + ' s';
}
function cameraDate(value: string) {
  return value.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
}

/** Returns only selected EXIF fields that have actual values. Same strings for preview and export. */
export function exifOverlayLines(photo: Photo | null | undefined, settings: ExifOverlaySettings): string[] {
  if (!photo || !settings.enabled) return [];
  const raw: Record<ExifField, string> = {
    filename: safeValue(photo.name),
    date: cameraDate(photo.takenAt),
    camera: safeValue(photo.camera),
    lens: safeValue(photo.lensModel),
    shutter: shutterSpeed(photo.exposureTime),
    aperture: photo.aperture != null ? 'f/' + readableNumber(photo.aperture) : '',
    iso: photo.iso != null ? String(photo.iso) : '',
    focal: photo.focalLength != null ? readableNumber(photo.focalLength) + ' mm' : '',
    compensation: photo.exposureBias != null ? (photo.exposureBias > 0 ? '+' : '') + readableNumber(photo.exposureBias) + ' EV' : '',
    resolution: photo.width && photo.height ? photo.width + ' × ' + photo.height : '',
    ev: photo.ev100 != null ? readableNumber(photo.ev100, 2) + ' EV' : '',
  };
  return fieldKeys.filter(key => settings.fields[key] && raw[key])
    .map(key => settings.showLabels ? fieldLabels[key] + ': ' + raw[key] : raw[key]);
}

type SettingsProps = {
  settings: ExifOverlaySettings;
  onChange: (value: ExifOverlaySettings) => void;
};
export function ExifOverlayControls({settings, onChange}: SettingsProps) {
  const count = fieldKeys.filter(k => settings.fields[k]).length;
  const update = (partial: Partial<ExifOverlaySettings>) => onChange({...settings, ...partial});
  return <div className="exif-stamp-controls">
    <label className="exif-stamp-toggle">
      <span><strong>Include EXIF on photo</strong><small>Preview and exported JPEG</small></span>
      <input type="checkbox" checked={settings.enabled}
        onChange={e => update({enabled: e.target.checked})}/>
    </label>
    {settings.enabled && <>
      {settings.style !== 'ribbon' ? <div className="exif-stamp-section">
        <span className="exif-stamp-label">Position · 9 anchors</span>
        <div className="exif-position-map" role="group" aria-label="EXIF position on image">
          <div className="exif-position-image" aria-hidden="true"/>
          {positions.map(item => <button type="button" key={item.id}
            aria-label={item.label} title={item.label} aria-pressed={settings.position === item.id}
            className={'exif-position-point ' + item.id + (settings.position === item.id ? ' selected' : '')}
            onClick={() => update({position: item.id})}>
            <span/>
          </button>)}
        </div>
        <small className="exif-stamp-hint">{positions.find(p => p.id === settings.position)?.label}</small>
      </div> : <div className="exif-stamp-notice">Ribbon layout spans the bottom edge of the photograph.</div>}
      <div className="exif-stamp-section">
        <span className="exif-stamp-label">Text size</span>
        <div className="exif-size-choices" role="group" aria-label="EXIF text size">
          {(['small', 'medium', 'large'] as const).map(option => (
            <button type="button" key={option} aria-pressed={settings.size === option}
              className={settings.size === option ? 'selected' : ''}
              onClick={() => update({size: option})}>
              {option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
        <label className="exif-manual-resize">
          <span>Manual size</span><output>{exifTextPercent(settings).toFixed(1)}% of image width</output>
          <input type="range" min="0.5" max="5" step="0.1" value={exifTextPercent(settings)}
            onChange={e => update({size:'custom',customPercent:Number(e.target.value)})}/>
        </label>
      </div>
      <div className="exif-stamp-section">
        <span className="exif-stamp-label">Appearance</span>
        <div className="exif-style-choices" role="group" aria-label="Metadata overlay appearance">
          {styles.map(option => <button type="button" key={option.id}
            title={option.label} aria-label={option.label} aria-pressed={settings.style === option.id}
            className={'exif-style-card ' + option.id + (settings.style === option.id ? ' selected' : '')}
            onClick={() => update({style: option.id})}>
            <span className="exif-style-example">{option.sample}</span>
            <span className="exif-style-label">{option.label}</span>
          </button>)}
        </div>
      </div>
      <div className="exif-stamp-section">
        <label className="exif-stamp-toggle exif-field-label-toggle">
          <span><strong>Show field labels</strong><small>Camera: Sony vs Sony</small></span>
          <input type="checkbox" checked={settings.showLabels}
            onChange={e => update({showLabels: e.target.checked})}/>
        </label>
        <div className="exif-stamp-field-heading"><span className="exif-stamp-label">Include fields</span><small>{count} selected</small></div>
        <div className="exif-stamp-fields">
          {fieldKeys.map(field => <label key={field} className="exif-stamp-field">
            <input type="checkbox" checked={settings.fields[field]}
              onChange={e => update({fields: {...settings.fields, [field]: e.target.checked}})}/>
            <span>{fieldLabels[field]}</span>
          </label>)}
        </div>
      </div>
      <div className="exif-stamp-notice">For merged HDR, metadata comes from the middle exposure. Missing EXIF fields are omitted.</div>
    </>}
  </div>;
}


/** The same percentage-of-image-width typography is used for preview and JPEG export. */
export function ExifOverlayPreview({photo, settings, imageUrl}: {photo?: Photo | null; settings: ExifOverlaySettings; imageUrl?: string}) {
  const lines = useMemo(() => exifOverlayLines(photo, settings), [photo, settings]);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const image = document.querySelector<HTMLImageElement>('.image-presentation .stage-image');
    if (!image) return;
    const measure = () => setWidth(image.getBoundingClientRect().width || 800);
    const observer = new ResizeObserver(measure);
    observer.observe(image);
    measure();
    return () => observer.disconnect();
  }, [photo, settings.enabled, imageUrl]);
  if (!lines.length) return null;
  const percent = exifTextPercent(settings);
  const fontSize = Math.max(7, Math.min(72, width * percent / 100));
  const padding = Math.max(5, fontSize * 0.6);
  const title = settings.style === 'ribbon' ? 'Bottom EXIF ribbon' : 'EXIF text overlay';
  return <div className={'exif-photo-overlay ' + settings.position + ' style-' + settings.style}
    style={{fontSize: fontSize + 'px', padding: padding + 'px'}} aria-label={title}>
    {lines.map((line, i) => <span className="exif-photo-overlay-line" key={i}>{line}</span>)}
  </div>;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const middle = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, middle) + '…').width <= max) lo = middle;
    else hi = middle - 1;
  }
  return text.slice(0, lo) + '…';
}

/** Paints metadata on a separate JPEG copy. Never alters source files or Radiance .hdr bytes. */
export async function renderExifOnJpeg(jpeg: Blob, photo: Photo | null | undefined, settings: ExifOverlaySettings): Promise<Blob> {
  const lines = exifOverlayLines(photo, settings);
  if (!lines.length) return jpeg;
  const bitmap = await createImageBitmap(jpeg);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable for EXIF overlay');
    ctx.drawImage(bitmap, 0, 0);
    const w = canvas.width, h = canvas.height;
    const gap = Math.max(10, Math.round(Math.min(w, h) * 0.028));
    const pad = Math.max(7, Math.round(Math.min(w, h) * 0.014));
    const ratio = exifTextPercent(settings) / 100;
    const size = Math.max(7, Math.min(72, Math.round(w * ratio), Math.floor((h - 2 * gap - 2 * pad) / (lines.length * 1.35))));
    const lineHeight = Math.ceil(size * 1.35);
    ctx.font = '600 ' + size + 'px system-ui, -apple-system, Arial, sans-serif';
    if (settings.style === 'ribbon') {
      // Full-width bottom banner; wrap captions to multiple rows without truncating.
      const available = Math.max(1, w - 2 * gap);
      const segments = lines.map(text => ellipsize(ctx, text, available));
      const rows: string[] = [];
      for (const segment of segments) {
        const candidate = rows.length ? rows[rows.length - 1] + '   ·   ' + segment : segment;
        if (!rows.length || ctx.measureText(candidate).width > available) rows.push(segment);
        else rows[rows.length - 1] = candidate;
      }
      // Shrink only if the caption band would otherwise consume the whole photo.
      const rowHeight = Math.ceil(size * 1.35);
      const ribbonHeight = Math.min(h, rows.length * rowHeight + 2 * pad);
      ctx.fillStyle = 'rgba(0,0,0,0.86)';
      ctx.fillRect(0, h - ribbonHeight, w, ribbonHeight);
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      rows.forEach((row, i) => {
        const ty = h - ribbonHeight + pad + rowHeight * (i + 0.5);
        if (ty <= h) ctx.fillText(row, gap, ty);
      });
    } else {
      const maxTextWidth = Math.max(1, Math.min(w - 2 * gap - 2 * pad, Math.round(w * 0.76)));
      const printable = lines.map(line => ellipsize(ctx, line, maxTextWidth));
      const boxWidth = Math.max(2 * pad + 1, ...printable.map(line => Math.ceil(ctx.measureText(line).width) + 2 * pad));
      const boxHeight = printable.length * lineHeight + 2 * pad;
      const horizontal = settings.position.endsWith('right') ? w - gap - boxWidth :
        (settings.position.endsWith('center') || settings.position === 'center') ? (w - boxWidth) / 2 : gap;
      const vertical = settings.position.startsWith('bottom') ? h - gap - boxHeight :
        (settings.position.startsWith('middle') || settings.position === 'center') ? (h - boxHeight) / 2 : gap;
      if (settings.style === 'dark' || settings.style === 'light') {
        ctx.fillStyle = settings.style === 'dark' ? 'rgba(0,0,0,0.78)' : 'rgba(255,255,255,0.9)';
        ctx.fillRect(horizontal, vertical, boxWidth, boxHeight);
      }
      ctx.fillStyle = settings.style === 'dark' || settings.style === 'white' ? '#fff' : '#000';
      ctx.textBaseline = 'middle';
      printable.forEach((line, i) => {
        const ty = vertical + pad + lineHeight * (i + 0.5);
        ctx.fillText(line, horizontal + pad, ty);
      });
    }
    const result = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('JPEG export failed')), 'image/jpeg', 0.94);
    });
    return result;
  } finally {
    bitmap.close();
  }
}
