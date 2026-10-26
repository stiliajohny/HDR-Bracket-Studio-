# HDR Bracket Studio

A common React application for Tauri 2 desktop and static GitHub Pages, with runtime-specific import adapters.

## Run
```bash
npm install
npm run dev
npm run build:web
npm run tauri dev
```

## New in v0.2
- Local JPEG/PNG/WebP thumbnails for imported web photos
- Select an identified bracket and generate a downloadable JPEG exposure-fusion result
- Configure fusion strength and output resolution
- Desktop users select image files separately for processing because native folder selection does not supply File objects to the webview
- All processing happens locally, with no photo uploads

## Limitations
This is basic per-pixel exposure fusion (an **HDR-style SDR JPEG**), not a Lightroom-equivalent true HDR merge. Source images must be **geometrically aligned**; movement will create ghosting. The browser does not decode proprietary RAW formats. No deghosting, tone-mapped 32-bit merge, camera RAW processing, TIFF export, or automatic geometric alignment.

### GitHub Pages
Website: https://stiliajohny.github.io/HDR-Bracket-Studio-/

Pages Source must be **GitHub Actions**; deployment workflow is in `.github/workflows/pages.yml`.

### Desktop
Requires Rust/Tauri system dependencies and ExifTool installed on PATH for folder metadata grouping.
