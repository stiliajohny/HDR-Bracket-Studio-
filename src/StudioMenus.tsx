import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Download, FolderOpen, Layers3, PanelBottom, PanelBottomClose, Type } from 'lucide-react';

type MetadataLayout = 'compact' | 'detailed';
type MenuName = 'file' | 'view' | 'photo';
type Props = {
  onImport: () => void;
  onDetect: () => void;
  onMerge: () => void;
  onExportJpeg: () => void;
  onExportHdr: () => void;
  onConfigureExifOverlay: () => void;
  exifOverlayEnabled: boolean;
  canDetect: boolean;
  canMerge: boolean;
  canExport: boolean;
  canExportHdr: boolean;
  metadataVisible: boolean;
  onMetadataVisible: (visible: boolean) => void;
  metadataLayout: MetadataLayout;
  onMetadataLayout: (layout: MetadataLayout) => void;
};

/** One accessible in-app menu bar on both GitHub Pages and Tauri. */
export function StudioMenus(props: Props) {
  const [open, setOpen] = useState<MenuName | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'i' || event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      props.onMetadataVisible(!props.metadataVisible);
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, [props.metadataVisible, props.onMetadataVisible]);

  const action = (handler: () => void) => () => { setOpen(null); handler(); };

  const trigger = (key: MenuName, title: string) => (
    <button type="button" className={'menu-trigger' + (open === key ? ' is-open' : '')}
      aria-haspopup="menu" aria-expanded={open === key}
      onClick={() => setOpen(open === key ? null : key)}>
      {title}<ChevronDown size={12}/>
    </button>
  );

  return <nav className="studio-menu-bar" aria-label="Application menus" ref={root}>
    <div className="menu-entry">
      {trigger('file', 'File')}
      {open === 'file' && <div className="studio-dropdown" role="menu" aria-label="File">
        <button role="menuitem" onClick={action(props.onImport)}><FolderOpen size={15}/> Import folder…</button>
        <button role="menuitem" disabled={!props.canDetect} onClick={action(props.onDetect)}><Layers3 size={15}/> Find HDR stacks</button>
      </div>}
    </div>
    <div className="menu-entry">
      {trigger('view', 'View')}
      {open === 'view' && <div className="studio-dropdown" role="menu" aria-label="View">
        <button role="menuitemcheckbox" aria-checked={props.metadataVisible}
          onClick={action(() => props.onMetadataVisible(!props.metadataVisible))}>
          {props.metadataVisible ? <PanelBottom size={15}/> : <PanelBottomClose size={15}/>}
          Show metadata panel <span className="menu-shortcut">I</span>
          {props.metadataVisible && <Check size={13} className="menu-check"/>}
        </button>
        <div className="menu-separator" role="separator"/>
        <div className="menu-group-label">Metadata display</div>
        <button role="menuitemradio" aria-checked={props.metadataLayout === 'compact'}
          onClick={action(() => { props.onMetadataVisible(true); props.onMetadataLayout('compact'); })}>
          <span className="menu-check-slot">{props.metadataLayout === 'compact' && <Check size={13}/>}</span> Compact
        </button>
        <button role="menuitemradio" aria-checked={props.metadataLayout === 'detailed'}
          onClick={action(() => { props.onMetadataVisible(true); props.onMetadataLayout('detailed'); })}>
          <span className="menu-check-slot">{props.metadataLayout === 'detailed' && <Check size={13}/>}</span> Detailed
        </button>
      </div>}
    </div>
    <div className="menu-entry">
      {trigger('photo', 'Photo')}
      {open === 'photo' && <div className="studio-dropdown" role="menu" aria-label="Photo">
        <button role="menuitem" disabled={!props.canMerge} onClick={action(props.onMerge)}><Layers3 size={15}/> Merge selected stack</button>
        <button role="menuitem" onClick={action(props.onConfigureExifOverlay)}><Type size={15}/> EXIF text on photo…{props.exifOverlayEnabled && <Check size={13} className="menu-check"/>}</button>
        <div className="menu-separator" role="separator"/>
        <button role="menuitem" disabled={!props.canExport} onClick={action(props.onExportJpeg)}><Download size={15}/> Export JPEG…</button>
        <button role="menuitem" disabled={!props.canExportHdr} onClick={action(props.onExportHdr)}><Download size={15}/> Export Radiance HDR…</button>
      </div>}
    </div>
  </nav>;
}
