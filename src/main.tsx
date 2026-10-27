import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Aperture, Check, ChevronDown, Download, FolderOpen, Image as ImageIcon,
  Images, LoaderCircle, SlidersHorizontal, AlertCircle, Layers3, ArrowLeftRight
} from 'lucide-react';
import { isDesktop, scanPhotos, chooseDesktopFolder, loadDesktopRasterFiles, type BrowserPhotoFile } from './platform';
import { mergeHdr, type DeghostLevel } from './hdr';
import { developDngFrames, isDng } from './dng';
import type { Photo, Result, Group } from './types';
import { StudioMenus } from './StudioMenus';
import { MetadataDock, type MetadataLayout } from './MetadataDock';
import { ExifOverlayControls, renderExifOnJpeg, defaultExifOverlay, type ExifOverlaySettings } from './ExifOverlay';
import { ImageAdjustmentControls, applyImageAdjustmentsToJpeg, defaultImageAdjustments, type ImageAdjustments } from './ImageAdjustments';
import { PhotoViewport } from './PhotoViewport';
import './style.css';

const readable = /\.(jpe?g|png|webp)$/i;
type ViewMode = 'source' | 'merged';

const shutter = (p: Photo) =>
  p.exposureTime && p.exposureTime < 1
    ? `1/${Math.round(1 / p.exposureTime)}s`
    : p.exposureTime ? `${p.exposureTime}s` : '—';

function App() {
  const [folder, setFolder] = useState('');
  const [webFiles, setWebFiles] = useState<BrowserPhotoFile[]>([]);
  const [manualFiles, setManualFiles] = useState<BrowserPhotoFile[]>([]);
  const [desktopFiles, setDesktopFiles] = useState<BrowserPhotoFile[]>([]);
  const [dngFiles, setDngFiles] = useState<BrowserPhotoFile[]>([]);
  const [dngLoading, setDngLoading] = useState(false);
  const [dngProgress, setDngProgress] = useState('');
  const [desktopLoading, setDesktopLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [activeFrame, setActiveFrame] = useState(0);
  const [view, setView] = useState<ViewMode>('source');
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [maxGap, setMaxGap] = useState(5);
  const [frames, setFrames] = useState(3);
  const [minSpan, setMinSpan] = useState(2);
  const [autoAlign, setAutoAlign] = useState(true);
  const [autoTone, setAutoTone] = useState(true);
  const [deghost, setDeghost] = useState<DeghostLevel>('low');
  const [exposureEV, setExposureEV] = useState(0);
  const [highlightCompression, setHighlightCompression] = useState(50);
  const [maxWidth, setMaxWidth] = useState(2400);
  const [dirty, setDirty] = useState(false);
  const [metadataVisible, setMetadataVisible] = useState(true);
  const [metadataLayout, setMetadataLayout] = useState<MetadataLayout>('compact');
  const [exifOverlay, setExifOverlay] = useState<ExifOverlaySettings>(defaultExifOverlay);
  const [exifOverlayOpen, setExifOverlayOpen] = useState(false);
  const [imageAdjustments, setImageAdjustments] = useState<ImageAdjustments>({ ...defaultImageAdjustments });
  const [exportingJpeg, setExportingJpeg] = useState(false);
  const [jpegBlob, setJpegBlob] = useState<Blob | null>(null);
  const [jpegUrl, setJpegUrl] = useState<string | null>(null);
  const [radianceUrl, setRadianceUrl] = useState<string | null>(null);
  const [offsets, setOffsets] = useState<{name: string; x: number; y: number}[]>([]);
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<string, string>>(new Map());

  const files = useMemo(() => [...dngFiles, ...manualFiles, ...desktopFiles, ...webFiles], [dngFiles, manualFiles, desktopFiles, webFiles]);
  useEffect(() => {
    const urls = new Map<string, string>();
    for (const entry of files) {
      if (readable.test(entry.file.name)) {
        const url = URL.createObjectURL(entry.file);
        urls.set(entry.path, url);
        if (!urls.has(entry.file.name)) urls.set(entry.file.name, url);
      }
    }
    setThumbnailUrls(urls);
    return () => {
      for (const url of new Set(urls.values())) URL.revokeObjectURL(url);
    };
  }, [files]);
  useEffect(() => () => { if (jpegUrl) URL.revokeObjectURL(jpegUrl); }, [jpegUrl]);
  useEffect(() => () => { if (radianceUrl) URL.revokeObjectURL(radianceUrl); }, [radianceUrl]);

  const groups = result?.groups ?? [];
  const selected = groups.find(g => g.id === activeId) ?? null;
  const referencePhoto = useMemo(() => selected ? [...selected.photos].sort((a,b) => (a.ev100 ?? 0) - (b.ev100 ?? 0))[Math.floor(selected.photos.length / 2)] : undefined, [selected]);
  useEffect(() => {
    if (!isDesktop() || !selected) {
      setDesktopFiles([]);
      setDesktopLoading(false);
      return;
    }
    let cancelled = false;
    setDesktopFiles([]);
    setDesktopLoading(true);
    loadDesktopRasterFiles(selected.photos)
      .then(loaded => { if (!cancelled) setDesktopFiles(loaded); })
      .catch(e => { if (!cancelled) setError('Unable to load desktop photos: ' + String(e)); })
      .finally(() => { if (!cancelled) setDesktopLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  // Develop camera DNGs only for the selected bracket, off the UI thread.
  // Both browser Files and Tauri-loaded DNG bytes follow this exact path.
  useEffect(() => {
    if (!selected) {
      setDngFiles([]);
      setDngLoading(false);
      setDngProgress('');
      return;
    }
    const raws = selected.photos.filter(photo => isDng(photo.path));
    if (!raws.length) {
      setDngFiles([]);
      setDngLoading(false);
      setDngProgress('');
      return;
    }
    if (isDesktop() && (desktopLoading || !desktopFiles.length)) {
      setDngFiles([]);
      return;
    }
    const available = [...manualFiles, ...desktopFiles, ...webFiles];
    const sources = raws.map(photo => available.find(entry => entry.path === photo.path) ??
      available.find(entry => entry.file.name === photo.name));
    if (sources.some(entry => !entry)) {
      setDngFiles([]);
      setDngLoading(false);
      setError('The DNG originals could not be loaded. Select the corresponding DNG files to develop this stack.');
      return;
    }
    let cancelled = false;
    setDngFiles([]);
    setDngLoading(true);
    setDngProgress('Starting DNG development…');
    developDngFrames(raws.map((photo, index) => ({file: sources[index]!.file, path: photo.path})), (current, total) => {
      if (!cancelled) setDngProgress('Developing DNG ' + current + ' of ' + total + '…');
    }).then(developed => {
      if (!cancelled) {
        setDngFiles(developed);
        setDngProgress('');
      }
    }).catch(e => {
      if (!cancelled) {
        setError(String(e));
        setDngProgress('');
      }
    }).finally(() => {
      if (!cancelled) setDngLoading(false);
    });
    return () => { cancelled = true; };
  }, [selected, manualFiles, desktopFiles, webFiles, desktopLoading]);

  const selectedPhotos = useMemo(
    () => selected ? [...selected.photos].sort((a, b) => (b.ev100 ?? 0) - (a.ev100 ?? 0)) : [],
    [selected]
  );
  const currentPhoto = selectedPhotos[Math.min(activeFrame, Math.max(0, selectedPhotos.length - 1))];
  const currentUrl = currentPhoto ? (thumbnailUrls.get(currentPhoto.path) ?? thumbnailUrls.get(currentPhoto.name)) : undefined;
  const displayedUrl = view === 'merged' && jpegUrl ? jpegUrl : currentUrl;
  const photoForOverlay = view === 'merged' && jpegUrl ? referencePhoto : currentPhoto;
  const canViewMerged = Boolean(jpegUrl);

  function resetPreview() {
    setJpegUrl(null); setJpegBlob(null); setRadianceUrl(null); setOffsets([]); setDirty(false); setView('source');
  }
  async function pickFolder() {
    setError('');
    if (isDesktop()) {
      const path = await chooseDesktopFolder();
      if (path) {
        setFolder(path); setWebFiles([]); setManualFiles([]); setDesktopFiles([]); setDngFiles([]); setResult(null);
        setActiveId(null); resetPreview();
      }
    } else {
      document.getElementById('browser-folder-input')?.click();
    }
  }
  function receiveBrowserFiles(items: FileList | null) {
    if (!items?.length) return;
    const entries = Array.from(items).map(file => ({ file, path: file.webkitRelativePath || file.name }));
    setFolder(entries[0].path.split('/')[0] || 'Imported images');
    setWebFiles(entries); setManualFiles([]); setDesktopFiles([]); setDngFiles([]); setResult(null); setActiveId(null);
    setError(''); resetPreview();
  }
  async function scan() {
    if (!folder) return;
    setScanning(true); setError(''); setDngFiles([]); resetPreview();
    try {
      const data = await scanPhotos(folder, webFiles, {
        maxGapSeconds: maxGap, bracketSize: frames, minSpanEv: minSpan
      });
      setResult(data); setActiveId(data.groups[0]?.id ?? null); setActiveFrame(0);
    } catch (e) { setError(String(e)); }
    finally { setScanning(false); }
  }
  function selectGroup(group: Group) {
    setActiveId(group.id); setActiveFrame(0); resetPreview(); setError('');
  }
  function selectFrame(index: number) {
    setActiveFrame(index); setView('source');
  }
  function setMergeOption(fn: () => void) { fn(); if (jpegUrl) setDirty(true); }
  function matchingFiles(photos: Photo[]) {
    return photos.map(photo =>
      files.find(f => f.path === photo.path) ?? files.find(f => f.file.name === photo.name)
    ).filter((f): f is BrowserPhotoFile => Boolean(f));
  }
  async function merge() {
    if (!selected) return;
    setProcessing(true); setError('');
    try {
      const sources = matchingFiles(selected.photos);
      if (dngLoading) throw new Error('DNG development is still running. Merge after the frames are ready.');
      if (sources.length !== selected.photos.length) {
        throw new Error('Some source images are unavailable. Use “Choose source frames” and select the photos in this stack.');
      }
      if (sources.some(s => !readable.test(s.file.name))) {
        throw new Error('HDR merging requires raster frames. Wait for DNG development or choose compatible JPEG/PNG/WebP sources.');
      }
      const merged = await mergeHdr(sources, selected.photos, {
        maxWidth, autoAlign, autoTone, deghost, exposureEV, highlightCompression
      });
      setJpegBlob(merged.jpeg);
      setJpegUrl(URL.createObjectURL(merged.jpeg));
      setRadianceUrl(URL.createObjectURL(merged.radiance));
      setOffsets(merged.offsets); setDirty(false); setView('merged');
    } catch (e) { setError(String(e)); }
    finally { setProcessing(false); }
  }

  function downloadFile(url: string | null, filename: string) {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function exportJpeg() {
    if (!jpegBlob || exportingJpeg) return;
    setExportingJpeg(true);
    setError('');
    try {
      // Burn the EXIF caption into an exported copy, never into the merged
      // radiance data or its original JPEG preview.
      const adjustedJpeg = await applyImageAdjustmentsToJpeg(jpegBlob, imageAdjustments);
      const output = await renderExifOnJpeg(adjustedJpeg, referencePhoto, exifOverlay);
      const url = URL.createObjectURL(output);
      downloadFile(url, 'HDR_stack_' + (selected?.id ?? 1) + '.jpg');
      // Allow the browser/webview to start the download before releasing it.
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      setError('JPEG export failed: ' + String(err));
    } finally {
      setExportingJpeg(false);
    }
  }

  function configureExifOverlay() {
    setExifOverlayOpen(true);
    setExifOverlay(old => ({...old, enabled: true}));
    window.setTimeout(() => document.querySelector('.exif-stamp-disclosure')?.scrollIntoView({block: 'nearest', behavior: 'smooth'}), 0);
  }

  return (
    <div className="studio">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Aperture size={18}/></span><span>HDR <strong>Studio</strong></span></div>
        <StudioMenus
          onImport={pickFolder}
          onDetect={scan}
          onMerge={merge}
          onExportJpeg={exportJpeg}
          onConfigureExifOverlay={configureExifOverlay}
          exifOverlayEnabled={exifOverlay.enabled}
          onExportHdr={() => downloadFile(radianceUrl, `HDR_stack_${selected?.id ?? 1}.hdr`)}
          canDetect={Boolean(folder) && !scanning}
          canMerge={Boolean(selected) && !processing && !scanning && !dngLoading && !(isDesktop() && desktopLoading)}
          canExport={Boolean(jpegBlob) && !exportingJpeg}
          canExportHdr={Boolean(radianceUrl)}
          metadataVisible={metadataVisible}
          onMetadataVisible={setMetadataVisible}
          metadataLayout={metadataLayout}
          onMetadataLayout={setMetadataLayout}
        />
        <div className="topbar-center"><span className="workspace-name">Library</span><span className="topbar-separator">/</span><span>HDR Merge</span></div>
        <div className="top-actions">
          <span className="mode-label">{isDesktop() ? 'Desktop' : 'Web'} · Local processing</span>
          <input id="browser-folder-input" type="file" multiple {...({webkitdirectory: '', directory: ''} as React.InputHTMLAttributes<HTMLInputElement>)} hidden onChange={e => receiveBrowserFiles(e.target.files)}/>
          <button type="button" className="btn btn-outline" onClick={pickFolder}><FolderOpen size={15}/> Import folder</button>
        </div>
      </header>

      <div className="workspace">
        <aside className="library-panel">
          <div className="panel-heading"><div><div className="eyebrow">LIBRARY</div><h2>Exposure stacks</h2></div><span className="count">{groups.length}</span></div>
          <div className="library-actions">
            <div className="folder-name" title={folder}><FolderOpen size={15}/><span>{folder ? folder.split(/[\\/]/).pop() || folder : 'No folder selected'}</span></div>
            <button type="button" className="btn btn-scan" onClick={scan} disabled={!folder || scanning}>
              {scanning ? <LoaderCircle size={15} className="spin"/> : <Layers3 size={15}/>}
              {scanning ? 'Detecting…' : 'Find HDR stacks'}
            </button>
            <details className="disclosure detection">
              <summary><SlidersHorizontal size={14}/> Detection settings <ChevronDown size={14}/></summary>
              <div className="disclosure-inner">
                <label>Capture window <b>{maxGap}s</b><input type="range" min="1" max="15" value={maxGap} onChange={e => setMaxGap(Number(e.target.value))}/></label>
                <label>Frames per stack <select value={frames} onChange={e => setFrames(Number(e.target.value))}><option value={3}>3</option><option value={5}>5</option><option value={7}>7</option></select></label>
                <label>Minimum EV span <b>{minSpan}</b><input type="range" min="1" max="8" step=".5" value={minSpan} onChange={e => setMinSpan(Number(e.target.value))}/></label>
              </div>
            </details>
          </div>
          <div className="stack-list" aria-label="Detected HDR stacks">
            {!result && <div className="library-empty"><Images size={26}/><p>Import a photo folder, then detect exposure brackets.</p></div>}
            {result && groups.length === 0 && <div className="library-empty"><AlertCircle size={22}/><p>No stacks found. Try adjusting the detection settings.</p></div>}
            {groups.map(group => (
              <button type="button" className={'stack-item' + (activeId === group.id ? ' selected' : '')} key={group.id} onClick={() => selectGroup(group)}>
                <div className="stack-miniature">
                  {(() => {
                    const p = group.photos[0];
                    const url = thumbnailUrls.get(p.path) ?? thumbnailUrls.get(p.name);
                    return url ? <img src={url} alt=""/> : <Images size={20}/>;
                  })()}
                </div>
                <div className="stack-item-info">
                  <strong>Stack {String(group.id).padStart(2, '0')}</strong>
                  <span>{group.photos.length} exposures · {group.exposureSpan.toFixed(1)} EV</span>
                  <span>{group.photos[0]?.name || 'Photographs'}</span>
                </div>
                {activeId === group.id && <span className="selected-indicator"><Check size={13}/></span>}
              </button>
            ))}
          </div>
          <div className="library-footer">
            {result ? <><span>{result.photoCount} imported</span><span>{result.unmatched.length} unmatched</span></> : <span>Original files remain untouched</span>}
            {result && result.unmatched.length > 0 && <details className="disclosure unmatched">
              <summary>View unmatched files <ChevronDown size={14}/></summary>
              <div className="unmatched-list">{result.unmatched.map(p => <div key={p.path} title={p.path}>{p.name}</div>)}</div>
            </details>}
          </div>
        </aside>

        <section className="preview-workspace">
          <div className="preview-toolbar">
            <div className="preview-heading">
              <strong>{selected ? `Stack ${String(selected.id).padStart(2, '0')}` : 'No stack selected'}</strong>
              {selected && <span>{selectedPhotos.length} frames · {selected.exposureSpan.toFixed(1)} EV</span>}
            </div>
            <div className="view-switch" role="group" aria-label="Preview mode">
              <button type="button" className={view === 'source' ? 'on' : ''} disabled={!selected} onClick={() => setView('source')}>Original</button>
              <button type="button" className={view === 'merged' ? 'on' : ''} disabled={!canViewMerged} onClick={() => setView('merged')}>HDR preview</button>
            </div>
          </div>

          <div className="image-stage">
            {!selected ? (
              <div className="stage-empty"><div className="stage-icon"><ImageIcon size={34}/></div><h2>Your next HDR starts here</h2><p>Import a folder of bracketed photos to find matching exposures.</p><button type="button" className="btn btn-primary" onClick={pickFolder}><FolderOpen size={16}/> Import photos</button></div>
            ) : displayedUrl ? (
              <PhotoViewport key={selected.id} src={displayedUrl}
                photo={photoForOverlay} exif={exifOverlay}
                adjusted={view === 'merged' && Boolean(jpegBlob)}
                adjustments={imageAdjustments}
                alt={view === 'merged' ? 'Tone-mapped HDR result' : currentPhoto?.name || 'Selected exposure'}/>
            ) : (
              <div className="stage-empty"><ImageIcon size={34}/><h2>{dngLoading ? 'Developing camera RAW…' : desktopLoading ? 'Loading photos…' : 'Preview unavailable'}</h2>
                <p>{dngLoading ? dngProgress : desktopLoading ? 'Reading source frames from the imported folder.' :
                  'No viewable preview. Some specialised DNG compression variants may not be supported.'}</p></div>
            )}
            {selected && <span className="image-caption">{view === 'merged' && jpegUrl ? 'HDR · Tone-mapped JPEG preview' : currentPhoto?.name}{dirty && view === 'merged' ? ' · Settings changed — re-merge to apply' : ''}</span>}
            {processing && <div className="processing-overlay" role="status"><LoaderCircle size={26} className="spin"/><strong>Merging exposures…</strong><span>Aligning and combining frames locally</span></div>}
          </div>

          <div className="filmstrip">
            <div className="filmstrip-header"><span>FILMSTRIP</span><span>{selectedPhotos.length ? `${selectedPhotos.length} exposures` : 'No photos'}</span></div>
            <div className="filmstrip-items">
              {selectedPhotos.map((photo, i) => {
                const url = thumbnailUrls.get(photo.path) ?? thumbnailUrls.get(photo.name);
                const evDifference = selectedPhotos.length && selectedPhotos[Math.floor(selectedPhotos.length / 2)]?.ev100 != null && photo.ev100 != null
                  ? selectedPhotos[Math.floor(selectedPhotos.length / 2)].ev100! - photo.ev100
                  : null;
                return (
                  <button key={photo.path} type="button" className={'film-frame' + (activeFrame === i && view === 'source' ? ' active' : '')} onClick={() => selectFrame(i)} title={photo.name}>
                    <div className="film-image">{url ? <img src={url} alt=""/> : <ImageIcon size={18}/>}</div>
                    <strong>{evDifference === null ? shutter(photo) : `${evDifference > 0 ? '+' : ''}${evDifference.toFixed(1)} EV`}</strong>
                    <span>{photo.name}</span>
                  </button>
                );
              })}
              {!selected && <p className="filmstrip-placeholder">Select an HDR stack to view its source exposures.</p>}
            </div>
          </div>
          {metadataVisible && <MetadataDock
            photo={currentPhoto}
            position={activeFrame}
            total={selectedPhotos.length}
            layout={metadataLayout}
            onLayoutChange={setMetadataLayout}
            onClose={() => setMetadataVisible(false)}
          />}
        </section>

        <aside className="merge-panel">
          <div className="merge-heading"><div className="eyebrow">EDIT</div><h2>HDR Merge</h2><p>Combine bracketed exposures into one image.</p></div>
          <div className="merge-settings">
            <label className="toggle-line"><span><strong>Auto Align</strong><small>Correct slight camera movement</small></span><input type="checkbox" checked={autoAlign} onChange={e => setMergeOption(() => setAutoAlign(e.target.checked))}/></label>
            <label className="toggle-line"><span><strong>Auto Tone</strong><small>Balance light and contrast</small></span><input type="checkbox" checked={autoTone} onChange={e => setMergeOption(() => setAutoTone(e.target.checked))}/></label>
            <div className="setting-group">
              <div className="setting-title">Deghost amount</div>
              <div className="deghost-options" role="group" aria-label="Deghost amount">
                {(['off','low','medium','high'] as const).map(level => (
                  <button type="button" key={level} className={deghost === level ? 'on' : ''} onClick={() => setMergeOption(() => setDeghost(level))}>{level === 'off' ? 'None' : level[0].toUpperCase() + level.slice(1)}</button>
                ))}
              </div>
              <p className="hint">Start with Low for moving leaves or people.</p>
            </div>
            <details className="disclosure advanced">
              <summary><SlidersHorizontal size={15}/> Advanced adjustments <ChevronDown size={14}/></summary>
              <div className="disclosure-inner">
                <label>Exposure <b>{exposureEV > 0 ? '+' : ''}{exposureEV.toFixed(1)} EV</b><input type="range" min="-2" max="2" step=".1" value={exposureEV} onChange={e => setMergeOption(() => setExposureEV(Number(e.target.value)))}/></label>
                <label>Highlight compression <b>{highlightCompression}%</b><input type="range" min="0" max="100" value={highlightCompression} onChange={e => setMergeOption(() => setHighlightCompression(Number(e.target.value)))}/></label>
                <label>Output width <select value={maxWidth} onChange={e => setMergeOption(() => setMaxWidth(Number(e.target.value)))}><option value={1200}>1200 px</option><option value={2400}>2400 px</option><option value={4000}>4000 px</option></select></label>
              </div>
            </details>
            <details className="disclosure image-adjustments-disclosure" open>
              <summary><SlidersHorizontal size={15}/> Image adjustments <ChevronDown size={14}/></summary>
              <div className="disclosure-inner">
                <ImageAdjustmentControls value={imageAdjustments}
                  onChange={setImageAdjustments} hasPreview={Boolean(jpegBlob)}/>
              </div>
            </details>
            <details className="disclosure exif-stamp-disclosure" open={exifOverlayOpen}
              onToggle={e => setExifOverlayOpen(e.currentTarget.open)}>
              <summary><SlidersHorizontal size={15}/> EXIF on Photo <ChevronDown size={14}/></summary>
              <div className="disclosure-inner">
                <ExifOverlayControls settings={exifOverlay} onChange={setExifOverlay}/>
              </div>
            </details>
          </div>

          <div className="merge-bottom">
            {selected && <div className="source-help"><label className="btn btn-outline file-picker"><Images size={15}/> Choose source frames<input type="file" multiple accept=".dng,image/x-adobe-dng,image/jpeg,image/png,image/webp" onChange={e => {setManualFiles(Array.from(e.target.files ?? []).map(file => ({file, path: file.name}))); resetPreview();}}/></label><small>Use this for DNG/RAW imports or if previews are missing. Select all exposures, including DNG originals, in the stack.</small></div>}
            {dngLoading && <p className="dng-progress" role="status">{dngProgress}</p>}
            {error && <div className="error-message" role="alert"><AlertCircle size={16}/><span>{error}</span></div>}
            {jpegUrl && <div className="export-actions">
              <button type="button" disabled={exportingJpeg} onClick={exportJpeg} className="btn btn-outline"><Download size={15}/> {exportingJpeg ? 'Exporting…' : 'Export JPEG'}</button>
              {radianceUrl && <a href={radianceUrl} download={`HDR_stack_${selected?.id ?? 1}.hdr`} className="btn btn-outline"><Download size={15}/> Export .HDR</a>}
              {dirty && <small>These files use the previous merge settings.</small>}
            </div>}
            <button type="button" className="btn btn-primary merge-button" disabled={!selected || processing || scanning || dngLoading || (isDesktop() && desktopLoading && manualFiles.length === 0)} onClick={merge}>
              {processing ? <LoaderCircle size={16} className="spin"/> : <Layers3 size={16}/>}
              {processing ? 'Merging…' : dngLoading ? 'Developing DNG…' : jpegUrl ? 'Re-merge HDR' : 'Merge HDR'}
            </button>
            <p className="format-note">Image adjustments and EXIF captions are included in JPEG export only. HDR radiance stays unchanged. DNG files are developed locally with LibRaw WASM; 16-bit scene-linear RAW HDR is not yet supported.</p>
            {offsets.length > 0 && <details className="disclosure technical"><summary><ArrowLeftRight size={13}/> Alignment details <ChevronDown size={13}/></summary><div className="unmatched-list">{offsets.map(x => <div key={x.name}>{x.name}: {x.x}, {x.y}px</div>)}</div></details>}
          </div>
        </aside>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
