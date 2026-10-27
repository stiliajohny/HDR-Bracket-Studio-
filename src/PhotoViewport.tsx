import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Maximize2, Minus, Plus, ScanSearch } from 'lucide-react';
import type { Photo } from './types';
import type { ExifOverlaySettings } from './ExifOverlay';
import { ExifOverlayPreview } from './ExifOverlay';
import type { ImageAdjustments } from './ImageAdjustments';
import { AdjustedHdrPreview } from './ImageAdjustments';

type Dimensions = {width: number; height: number};
type View = {zoom: number; x: number; y: number};
type Props = {
  src: string;
  photo?: Photo | null;
  exif: ExifOverlaySettings;
  adjusted: boolean;
  adjustments: ImageAdjustments;
  alt: string;
};
const MAX_ZOOM = 32;
const MAP_WIDTH = 176;
const MAP_HEIGHT = 116;
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));

/** Pan bounds keep the photo inside the viewport along each zoomed axis. */
function limitPan(view: View, image: Dimensions, viewport: Dimensions): View {
  const maxX = Math.max(0, (image.width * view.zoom - viewport.width) / 2);
  const maxY = Math.max(0, (image.height * view.zoom - viewport.height) / 2);
  return {zoom: view.zoom, x: clamp(view.x, -maxX, maxX), y: clamp(view.y, -maxY, maxY)};
}
function fitDimensions(intrinsic: Dimensions, viewport: Dimensions): Dimensions {
  const scale = Math.min(
    1,
    Math.max(0.001, viewport.width - 30) / intrinsic.width,
    Math.max(0.001, viewport.height - 35) / intrinsic.height
  );
  return {width: intrinsic.width * scale, height: intrinsic.height * scale};
}

export function PhotoViewport({src, photo, exif, adjusted, adjustments, alt}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Dimensions>({width: 0, height: 0});
  const [intrinsic, setIntrinsic] = useState<Dimensions | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<View>({zoom: 1, x: 0, y: 0});
  const drag = useRef<{id: number; x: number; y: number} | null>(null);
  const minimapDrag = useRef<number | null>(null);
  const isDragging = drag.current !== null;

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      setViewport({width: bounds.width, height: bounds.height});
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  // Source changes reset the camera to Fit; image aspect ratio comes from
  // decoded dimensions, not EXIF orientation or hard-coded 3:2 assumptions.
  useEffect(() => {
    let cancelled = false;
    setIntrinsic(null);
    setLoadError(false);
    setView({zoom: 1, x: 0, y: 0});
    const image = new Image();
    image.onload = () => {
      if (!cancelled && image.naturalWidth > 0 && image.naturalHeight > 0) {
        setIntrinsic({width: image.naturalWidth, height: image.naturalHeight});
      }
    };
    image.onerror = () => { if (!cancelled) setLoadError(true); };
    image.src = src;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
      image.src = '';
    };
  }, [src]);

  const fitted = useMemo(() => intrinsic && viewport.width && viewport.height
    ? fitDimensions(intrinsic, viewport) : null, [intrinsic, viewport.width, viewport.height]);
  const mapSize = useMemo(() => intrinsic ? (() => {
    const scale = Math.min(MAP_WIDTH / intrinsic.width, MAP_HEIGHT / intrinsic.height);
    return {width: intrinsic.width * scale, height: intrinsic.height * scale};
  })() : null, [intrinsic]);
  const fitScale = intrinsic && fitted ? fitted.width / intrinsic.width : 1;
  const actualPercent = Math.round(fitScale * view.zoom * 100);
  const panning = Boolean(fitted && (fitted.width * view.zoom > viewport.width + 1 ||
    fitted.height * view.zoom > viewport.height + 1));

  useEffect(() => {
    if (!fitted) return;
    setView(old => {
      const next = limitPan(old, fitted, viewport);
      return next.x === old.x && next.y === old.y ? old : next;
    });
  }, [fitted, viewport.width, viewport.height]);

  const zoomTo = useCallback((nextZoom: number, anchorX = viewport.width / 2, anchorY = viewport.height / 2) => {
    if (!fitted) return;
    setView(old => {
      const zoom = clamp(nextZoom, 1, MAX_ZOOM);
      const dx = anchorX - viewport.width / 2;
      const dy = anchorY - viewport.height / 2;
      const ratio = zoom / old.zoom;
      return limitPan({
        zoom,
        x: dx - (dx - old.x) * ratio,
        y: dy - (dy - old.y) * ratio,
      }, fitted, viewport);
    });
  }, [fitted, viewport]);

  const resetFit = useCallback(() => setView({zoom: 1, x: 0, y: 0}), []);
  const zoom100 = () => zoomTo(Math.min(MAX_ZOOM, Math.max(1, 1 / fitScale)));

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || !fitted) return;
    const handler = (event: WheelEvent) => {
      if ((event.target as Element)?.closest('.photo-zoom-toolbar, .photo-minimap')) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? .045 : .003));
      zoomTo(view.zoom * factor, event.clientX - rect.left, event.clientY - rect.top);
    };
    element.addEventListener('wheel', handler, {passive: false});
    return () => element.removeEventListener('wheel', handler);
  }, [fitted, view.zoom, zoomTo]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !panning ||
        (event.target as Element).closest('.photo-zoom-toolbar, .photo-minimap')) return;
    drag.current = {id: event.pointerId, x: event.clientX, y: event.clientY};
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== event.pointerId || !fitted) return;
    const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
    drag.current.x = event.clientX;
    drag.current.y = event.clientY;
    setView(old => limitPan({...old, x: old.x + dx, y: old.y + dy}, fitted, viewport));
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === event.pointerId) {
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const mapRect = useMemo(() => {
    if (!fitted || !mapSize || !viewport.width || !viewport.height) return null;
    const rectWidth = Math.min(mapSize.width, mapSize.width * viewport.width / (fitted.width * view.zoom));
    const rectHeight = Math.min(mapSize.height, mapSize.height * viewport.height / (fitted.height * view.zoom));
    const centreX = mapSize.width * (.5 - view.x / (fitted.width * view.zoom));
    const centreY = mapSize.height * (.5 - view.y / (fitted.height * view.zoom));
    return {
      left: clamp(centreX - rectWidth / 2, 0, Math.max(0, mapSize.width - rectWidth)),
      top: clamp(centreY - rectHeight / 2, 0, Math.max(0, mapSize.height - rectHeight)),
      width: rectWidth,
      height: rectHeight,
    };
  }, [fitted, mapSize, viewport, view]);

  const navigateMinimap = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!fitted || !mapSize || view.zoom <= 1) return;
    const rect = minimapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clamp(event.clientX - rect.left, 0, mapSize.width) / mapSize.width;
    const y = clamp(event.clientY - rect.top, 0, mapSize.height) / mapSize.height;
    setView(old => limitPan({
      ...old,
      x: (.5 - x) * fitted.width * old.zoom,
      y: (.5 - y) * fitted.height * old.zoom,
    }, fitted, viewport));
  };
  const onMapPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || view.zoom <= 1) return;
    minimapDrag.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    navigateMinimap(event);
    event.preventDefault();
    event.stopPropagation();
  };
  const onMapPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (minimapDrag.current === event.pointerId) navigateMinimap(event);
    event.stopPropagation();
  };
  const onMapPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (minimapDrag.current === event.pointerId) {
      minimapDrag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.stopPropagation();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('button')) return;
    if (event.key === 'f' || event.key === 'F' || event.key === '0') resetFit();
    else if (event.key === '+' || event.key === '=') zoomTo(view.zoom * 1.4);
    else if (event.key === '-') zoomTo(view.zoom / 1.4);
    else if (fitted && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      const step = 55;
      setView(old => limitPan({
        ...old,
        x: old.x + (event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0),
        y: old.y + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0),
      }, fitted, viewport));
    } else return;
    event.preventDefault();
  };

  return <div ref={viewportRef} className={'photo-viewport' + (panning ? ' can-pan' : '') + (isDragging ? ' dragging' : '')}
    role="region" tabIndex={0} aria-label="Image zoom and pan"
    onPointerDown={onPointerDown} onPointerMove={onPointerMove}
    onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKeyDown}
    onDoubleClick={event => {
      if ((event.target as Element).closest('.photo-zoom-toolbar,.photo-minimap')) return;
      view.zoom > 1 ? resetFit() : zoomTo(2);
    }}>
    {fitted ? <div className="photo-pan-layer" style={{
      width: fitted.width, height: fitted.height,
      transform: 'translate(-50%, -50%) translate(' + view.x + 'px, ' + view.y + 'px) scale(' + view.zoom + ')',
    }}>
      <div className="image-presentation">
        {adjusted
          ? <AdjustedHdrPreview src={src} settings={adjustments}/>
          : <img className="stage-image" src={src} alt={alt} draggable={false}/>}
        <ExifOverlayPreview photo={photo} settings={exif} imageUrl={src} displayWidth={fitted.width}/>
      </div>
    </div> : <div className="photo-loading">{loadError ? 'Unable to display this image' : 'Loading image…'}</div>}
    {fitted && <>
      <div className="photo-zoom-toolbar" role="group" aria-label="Image zoom controls">
        <button type="button" onClick={resetFit} title="Fit photo to window (F)"><Maximize2 size={14}/> Fit</button>
        <button type="button" onClick={() => zoomTo(view.zoom / 1.4)} disabled={view.zoom <= 1.001}
          aria-label="Zoom out" title="Zoom out (-)"><Minus size={15}/></button>
        <span className="photo-zoom-value" aria-live="off">{actualPercent}%</span>
        <button type="button" onClick={() => zoomTo(view.zoom * 1.4)} disabled={view.zoom >= MAX_ZOOM}
          aria-label="Zoom in" title="Zoom in (+)"><Plus size={15}/></button>
        <button type="button" onClick={zoom100} title="Actual image pixel size (up to zoom limit)"><ScanSearch size={14}/> 100%</button>
      </div>
      {mapSize && mapRect && <div className="photo-minimap" aria-label="Image overview">
        <div className="photo-minimap-title">NAVIGATOR <span>{view.zoom === 1 ? 'Fit' : view.zoom.toFixed(1) + '×'}</span></div>
        <div ref={minimapRef} className="photo-minimap-image" style={mapSize}
          role="slider" tabIndex={0} aria-label="Visible area of image; click or drag to pan"
          aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(50 - view.x / (fitted.width * view.zoom) * 100)}
          onPointerDown={onMapPointerDown} onPointerMove={onMapPointerMove}
          onPointerUp={onMapPointerUp} onPointerCancel={onMapPointerUp}
          onKeyDown={event => {
            if (!fitted) return;
            const speed = 35;
            const deltaX = event.key === 'ArrowLeft' ? speed : event.key === 'ArrowRight' ? -speed : 0;
            const deltaY = event.key === 'ArrowUp' ? speed : event.key === 'ArrowDown' ? -speed : 0;
            if (!deltaX && !deltaY) return;
            setView(old => limitPan({...old, x: old.x + deltaX, y: old.y + deltaY}, fitted, viewport));
            event.preventDefault();
          }}>
          <img src={src} alt="" draggable={false}/>
          <div className="photo-minimap-window" style={mapRect} aria-hidden="true"/>
        </div>
      </div>}
    </>}
  </div>;
}
