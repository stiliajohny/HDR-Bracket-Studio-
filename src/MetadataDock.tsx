import { Camera, ChevronDown, Info, SlidersHorizontal, X } from 'lucide-react';
import type { Photo } from './types';

export type MetadataLayout = 'compact' | 'detailed';

type Props = {
  photo?: Photo;
  position: number;
  total: number;
  layout: MetadataLayout;
  onLayoutChange: (layout: MetadataLayout) => void;
  onClose: () => void;
};
function safe(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}
function decimal(value: number | null | undefined, digits = 1) {
  return value == null ? '—' : Number(value.toFixed(digits)).toString();
}
function formatShutter(t: number | null | undefined) {
  if (!t || t <= 0) return '—';
  return t < 1 ? `1/${Math.round(1 / t)} sec` : `${decimal(t, 2)} sec`;
}
function formatDate(date?: string) {
  return date ? date.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3') : '—';
}
function formatBias(value?: number | null) {
  if (value == null) return '—';
  return (value > 0 ? '+' : '') + decimal(value) + ' EV';
}
function Detail({label, value, title}: {label: string; value: string; title?: string}) {
  return <div className="metadata-field" title={title ?? value}>
    <dt>{label}</dt><dd>{value}</dd>
  </div>;
}
export function MetadataDock({photo, position, total, layout, onLayoutChange, onClose}: Props) {
  const exposure = photo ? `f/${decimal(photo.aperture)} · ${formatShutter(photo.exposureTime)} · ISO ${safe(photo.iso)}` : '—';
  const focal = photo?.focalLength != null ? `${decimal(photo.focalLength)} mm` : '—';
  const resolution = photo?.width && photo.height ? `${photo.width.toLocaleString()} × ${photo.height.toLocaleString()}` : '—';
  return <section className={'metadata-dock metadata-' + layout} aria-label="EXIF metadata">
    <div className="metadata-toolbar">
      <div className="metadata-heading"><Info size={15}/><strong>Metadata</strong><span>EXIF</span>
        {photo && <small>Photo {position + 1} of {total}</small>}
      </div>
      <div className="metadata-toolbar-actions">
        <label className="metadata-layout-select"><SlidersHorizontal size={13}/>
          <select value={layout} aria-label="Metadata detail level" onChange={e => onLayoutChange(e.target.value as MetadataLayout)}>
            <option value="compact">Compact</option>
            <option value="detailed">Detailed</option>
          </select><ChevronDown size={12}/>
        </label>
        <button type="button" aria-label="Hide metadata panel" className="metadata-close" onClick={onClose} title="Hide metadata (I)"><X size={15}/></button>
      </div>
    </div>
    {!photo ? <div className="metadata-placeholder"><Camera size={15}/> Select a photo in the filmstrip to view its EXIF metadata</div> :
    <dl className="metadata-grid">
      <Detail label="File name" value={photo.name} title={photo.path}/>
      <Detail label="Capture date" value={formatDate(photo.takenAt)}/>
      <Detail label="Camera" value={safe(photo.camera)}/>
      <Detail label="Lens" value={safe(photo.lensModel)}/>
      <Detail label="Exposure" value={exposure}/>
      <Detail label="Focal length" value={focal}/>
      {layout === 'detailed' && <>
        <Detail label="Aperture" value={photo.aperture ? 'f/' + decimal(photo.aperture) : '—'}/>
        <Detail label="Shutter speed" value={formatShutter(photo.exposureTime)}/>
        <Detail label="ISO" value={safe(photo.iso)}/>
        <Detail label="Exposure compensation" value={formatBias(photo.exposureBias)}/>
        <Detail label="Resolution" value={resolution}/>
        <Detail label="EV100" value={photo.ev100 == null ? '—' : decimal(photo.ev100, 2) + ' EV'}/>
      </>}
    </dl>}
  </section>;
}
